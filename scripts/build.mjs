// 매일 실행: 공고 수집 → 우리 부부 조건으로 판정 → 암호화 → 앱(dist/) 생성 → 알림
// 공개 저장소여도 안전하도록 로그에는 개인정보를 절대 출력하지 않습니다.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluate, deriveProfile, toDate, ymd, todayKST, matchArea, AREAS, DONG_CENTERS } from '../site/engine.js';
import { geocodeAll } from './geocode.mjs';
import { fetchApplyhome, fetchLH } from './sources.mjs';
import { encryptJSON, decryptJSON } from './crypto.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const STATE = path.join(ROOT, 'state', 'state.enc.json');
const env = process.env;
const MOCK = env.MOCK === '1';
const log = (...a) => console.log(...a);

const password = env.APP_PASSWORD || (MOCK ? 'demo-1234' : '');
if (!password) { console.error('APP_PASSWORD 시크릿이 없습니다. README의 설정 2단계를 확인하세요.'); process.exit(1); }

async function readJSON(p, fallback) { try { return JSON.parse(await fs.readFile(p, 'utf8')); } catch { return fallback; } }

let profile;
try { profile = env.PROFILE_JSON ? JSON.parse(env.PROFILE_JSON) : null; } catch { console.error('PROFILE_JSON 형식 오류 (JSON 문법 확인)'); process.exit(1); }
const profileMissing = !profile;
if (!profile) profile = await readJSON(path.join(ROOT, 'profile.example.json'), {});

const appUrl = env.APP_URL || '';
const today = todayKST();

// ── 1. 수집 ──
log('▶ 공고 수집');
let notices = [];
const sourceStatus = {};
const fieldSample = {};
let modelFetcher = null;
if (MOCK) {
  const fx = await readJSON(path.join(ROOT, 'fixtures', 'notices.json'), []);
  notices = fx; sourceStatus.mock = { ok: true, count: fx.length };
} else if (!env.DATA_GO_KR_KEY) {
  sourceStatus.setup = { ok: false, error: '공공데이터포털 API 키(DATA_GO_KR_KEY)가 아직 설정되지 않았습니다.' };
  log('  API 키 없음 — 안내 화면만 배포');
} else {
  const a = await fetchApplyhome(env.DATA_GO_KR_KEY, log);
  Object.assign(sourceStatus, a.status); Object.assign(fieldSample, a.sample);
  modelFetcher = a.fetchModels;
  const l = await fetchLH(env.DATA_GO_KR_KEY, log);
  Object.assign(sourceStatus, l.status); fieldSample.LH = l.sample;
  notices = [...a.notices, ...l.notices];
}

// ── 2. 지역·기간 필터 ──
const areaKeys = profile.prefs?.areas?.length ? profile.prefs.areas : AREAS.map((a) => a.key);
const lastDate = (n) => {
  const ds = Object.entries(n.dates || {}).filter(([k]) => k !== 'moveIn').map(([, v]) => toDate(v)).filter(Boolean);
  return ds.length ? new Date(Math.max(...ds)) : null;
};
const before = notices.length;
notices = notices.filter((n) => {
  n.area = matchArea(n, areaKeys);
  if (!n.area) return false;
  const last = lastDate(n);
  if (!last) return true;
  const keep = new Date(today); keep.setDate(keep.getDate() - 2);
  return last >= keep;
});
// 중복 제거
const seenIds = new Set();
notices = notices.filter((n) => (seenIds.has(n.id) ? false : seenIds.add(n.id)));
log(`  관심지역(${areaKeys.join('·')})·기간 필터: ${before} → ${notices.length}건`);

// ── 3. 주택형(평형·분양가·특공 물량) 상세 ──
if (modelFetcher) {
  let ok = 0;
  for (const n of notices) {
    if (!['민영', '국민', '신혼희망타운'].includes(n.kind) || !n.houseManageNo) continue;
    try { n.models = await modelFetcher(n); ok++; } catch { /* 상세 실패해도 진행 */ }
  }
  log(`  주택형 상세: ${ok}건`);
}
for (const n of notices) {
  const prices = (n.models || []).map((m) => m.topPrice).filter((x) => x > 0);
  const areas = (n.models || []).map((m) => m.area).filter((x) => x > 0);
  if (prices.length) { n.priceMin = Math.min(...prices); n.priceMax = Math.max(...prices); }
  if (areas.length) { n.areaMin = Math.min(...areas); n.areaMax = Math.max(...areas); }
}

const state = (await (async () => {
  const box = await readJSON(STATE, null);
  if (!box) return null;
  try { return await decryptJSON(box, password); } catch { log('  이전 상태 복호화 실패(비밀번호 변경?) — 새로 시작'); return null; }
})()) || { seen: {}, reminded: {}, firstRun: true };
state.geo = state.geo || {};

// ── 3b. 지도 좌표 ──
if (!MOCK) await geocodeAll(notices, state.geo, log);
else for (const n of notices) { const a = AREAS.find((x) => x.key === n.area); const dong = Object.entries(DONG_CENTERS).find(([k]) => (n.address || '').includes(k)); if (dong) n.geo = { lat: dong[1][0], lng: dong[1][1], approx: 'dong' }; else if (a && n.area !== '광역') n.geo = { lat: a.center[0], lng: a.center[1], approx: 'area' }; }

// ── 4. 판정 ──
const d = deriveProfile(profile);
const evals = new Map(notices.map((n) => [n.id, evaluate(n, d)]));
const counts = { ok: 0, check: 0, after: 0, no: 0 };
for (const e of evals.values()) counts[e.best]++;
log(`  판정: 가능 ${counts.ok} · 확인필요 ${counts.check} · 혼인신고후 ${counts.after} · 불가 ${counts.no}`);

// ── 5. 알림 (새 공고 / 내일 접수) ──


const tomorrow = ymd(new Date(today.getTime() + 86400e3));
const todayStr = ymd(today);
const relevant = (e) => ['ok', 'check'].includes(e.best);
const fresh = notices.filter((n) => !state.seen[n.id] && ['ok', 'check', 'after'].includes(evals.get(n.id).best));
const keyDates = (n) => {
  const x = n.dates || {};
  return [['특별공급 접수', x.specialStart], ['1순위 접수', x.rank1Local || x.rank1Gg || x.rank1Other], ['청약 접수', x.applyStart], ['당첨자 발표', x.winners]]
    .filter(([, v]) => v).map(([label, v]) => [label, ymd(toDate(v))]);
};
const reminders = [];
for (const n of notices) {
  if (!relevant(evals.get(n.id))) continue;
  for (const [label, date] of keyDates(n)) {
    for (const when of [todayStr, tomorrow]) {
      const k = `${n.id}|${label}|${date}|${when}`;
      if (date === when && !state.reminded[k]) { reminders.push({ n, label, when: when === todayStr ? '오늘' : '내일' }); state.reminded[k] = todayStr; }
    }
  }
}
for (const n of notices) state.seen[n.id] = state.seen[n.id] || todayStr;
// 오래된 상태 정리
const cutoff = ymd(new Date(today.getTime() - 150 * 86400e3));
for (const [k, v] of Object.entries(state.seen)) if (v < cutoff) delete state.seen[k];
for (const [k, v] of Object.entries(state.reminded)) if (v < cutoff) delete state.reminded[k];
for (const [k, v] of Object.entries(state.geo)) if ((v.at || '') < cutoff) delete state.geo[k];

const label = { ok: '✅가능', check: '🟡확인', after: '💍혼인신고후' };
const short = (n) => `${label[evals.get(n.id).best] || ''} ${n.name}${n.sigungu ? ` (${n.sigungu})` : ''}`;
let message = '';
if (state.firstRun) {
  message = `우리집 청약 알림이 연결됐어요.\n지금 진행 중인 공고 ${notices.length}건 (가능 ${counts.ok} · 확인 ${counts.check}). 앱에서 확인하세요.`;
} else {
  const lines = [];
  if (reminders.length) { lines.push('⏰ 일정'); for (const r of reminders.slice(0, 8)) lines.push(`· ${r.when} ${r.label}: ${r.n.name}`); }
  if (fresh.length) { lines.push(`🆕 새 공고 ${fresh.length}건`); for (const n of fresh.slice(0, 8)) lines.push(`· ${short(n)}`); if (fresh.length > 8) lines.push(`  외 ${fresh.length - 8}건`); }
  message = lines.join('\n');
}
state.firstRun = false;

async function notify(text) {
  if (!text) { log('  알림: 보낼 내용 없음'); return; }
  if (MOCK) { log('  [MOCK 알림]\n' + text); return; }
  if (env.NTFY_TOPIC) {
    try {
      const r = await fetch('https://ntfy.sh/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ topic: env.NTFY_TOPIC, title: '우리집 청약', message: text, click: appUrl || undefined, tags: ['house'] }) });
      log(`  ntfy 알림: ${r.status}`);
    } catch (e) { log(`  ntfy 실패: ${e.message}`); }
  }
  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
    try {
      const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: `🏠 우리집 청약\n${text}${appUrl ? `\n${appUrl}` : ''}`, disable_web_page_preview: true }) });
      log(`  텔레그램 알림: ${r.status}`);
    } catch (e) { log(`  텔레그램 실패: ${e.message}`); }
  }
}
await notify(message);

// ── 6. 앱 데이터 암호화 + dist 생성 ──
const bundle = {
  generatedAt: new Date().toISOString(),
  profile, profileMissing, areas: areaKeys,
  notices: notices.map((n) => ({ ...n, firstSeen: state.seen[n.id], isNew: !!fresh.find((f) => f.id === n.id) })),
  sourceStatus, fieldSample,
  repo: env.GITHUB_REPOSITORY || '',
};
await fs.rm(DIST, { recursive: true, force: true });
await fs.cp(path.join(ROOT, 'site'), DIST, { recursive: true });
const box = await encryptJSON(bundle, password, env.APP_SALT || '');
await fs.writeFile(path.join(DIST, 'data.enc.json'), JSON.stringify({ t: bundle.generatedAt, ...box }));
await fs.writeFile(path.join(DIST, '.nojekyll'), '');
await fs.mkdir(path.dirname(STATE), { recursive: true });
await fs.writeFile(STATE, JSON.stringify(await encryptJSON(state, password, env.APP_SALT || '')));
log(`✔ 완료: dist/ (공고 ${notices.length}건, 암호화됨)`);
