import { evaluate, deriveProfile, docsFor, DOCS, estimatePoints, toDate, ymd, todayKST, RULES } from './engine.js';

const LS = { key: 'wz.key.v1', prof: 'wz.profileOverride', checks: 'wz.checks', sim: 'wz.simulate' };
const S = { box: null, bundle: null, tab: 'home', filter: 'all', showNo: false, sim: localStorage.getItem(LS.sim) === '1', evals: new Map(), d: null, installEvt: null };
const $ = (s, el = document) => el.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const STATUS = { ok: '가능성 높음', check: '조건 확인', after: '혼인신고 후', no: '불가' };
const ICON = { ok: '●', check: '◐', after: '💍', no: '✕' };
const WD = ['일', '월', '화', '수', '목', '금', '토'];

// ───────── 암호 해제 ─────────
const te = new TextEncoder();
const u8 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
async function deriveRaw(pw, box) {
  const base = await crypto.subtle.importKey('raw', te.encode(pw), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: u8(box.salt), iterations: box.iter }, base, 256);
}
async function decryptRaw(raw, box) {
  const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: u8(box.iv) }, key, u8(box.ct));
  return JSON.parse(new TextDecoder().decode(pt));
}
function cachedKey(box) {
  try { const c = JSON.parse(localStorage.getItem(LS.key) || 'null'); return c && c.salt === box.salt ? u8(c.raw) : null; } catch { return null; }
}
async function fetchBox() {
  const r = await fetch(`data.enc.json?t=${Date.now()}`, { cache: 'no-store' });
  if (!r.ok) throw new Error('데이터를 불러오지 못했어요');
  return r.json();
}

async function boot() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); S.installEvt = e; if (S.bundle) render(); });
  try { S.box = await fetchBox(); } catch (e) {
    try { const c = await caches.match('data.enc.json'); if (c) S.box = await c.json(); } catch {}
    if (!S.box) { $('#lockMsg').textContent = '인터넷 연결을 확인해 주세요.'; }
  }
  const raw = S.box && cachedKey(S.box);
  if (raw) {
    try { S.bundle = await decryptRaw(raw, S.box); return showApp(); } catch { localStorage.removeItem(LS.key); }
  }
  $('#lock').hidden = false;
}

$('#lockForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const pw = $('#pw').value;
  const btn = $('#unlockBtn');
  btn.disabled = true; btn.textContent = '여는 중…'; $('#lockMsg').textContent = '';
  try {
    if (!S.box) S.box = await fetchBox();
    const raw = await deriveRaw(pw, S.box);
    S.bundle = await decryptRaw(raw, S.box);
    if ($('#remember').checked) localStorage.setItem(LS.key, JSON.stringify({ salt: S.box.salt, raw: b64(raw) }));
    $('#pw').value = '';
    showApp();
  } catch {
    $('#lockMsg').textContent = '비밀번호가 맞지 않아요.';
  } finally { btn.disabled = false; btn.textContent = '열기'; }
});

function showApp() {
  $('#lock').hidden = true; $('#app').hidden = false;
  recompute(); render();
}

// ───────── 판정 ─────────
function profile() {
  try { const o = JSON.parse(localStorage.getItem(LS.prof) || 'null'); if (o) return o; } catch {}
  return S.bundle.profile;
}
function recompute() {
  const p = profile();
  S.d = deriveProfile(p, S.sim ? { simulateRegistered: true } : {});
  S.evals = new Map(S.bundle.notices.map((n) => [n.id, evaluate(n, S.d)]));
}
const E = (n) => S.evals.get(n.id);

// ───────── 날짜 ─────────
function fmtD(s, withWd = true) {
  const d = toDate(s); if (!d) return '';
  const k = new Date(d.getTime() + 9 * 3600e3);
  return `${k.getUTCMonth() + 1}/${k.getUTCDate()}${withWd ? `(${WD[k.getUTCDay()]})` : ''}`;
}
function range(a, b) { if (!a) return ''; const x = fmtD(a), y = fmtD(b); return !b || x === y ? x : `${x}~${y}`; }
function keyDates(n) {
  const x = n.dates || {};
  const L = [];
  if (x.specialStart) L.push({ label: '특별공급', date: x.specialStart, cls: 'sp' });
  const r1 = x.rank1Local || x.rank1Gg || x.rank1Other;
  if (r1) L.push({ label: '1순위', date: r1 });
  if (!x.specialStart && !r1 && x.applyStart) L.push({ label: '청약접수', date: x.applyStart });
  if (!x.applyStart && x.applyEnd && n.source === 'LH청약플러스') L.push({ label: '접수마감', date: x.applyEnd });
  if (x.winners) L.push({ label: '당첨발표', date: x.winners, cls: 'win' });
  if (x.contractStart) L.push({ label: '계약', date: x.contractStart });
  return L;
}
function nextDate(n) {
  const t = todayKST();
  const ds = keyDates(n).filter((k) => k.label !== '당첨발표' && k.label !== '계약').map((k) => toDate(k.date)).filter((d) => d && d >= t);
  const end = toDate(n.dates?.applyEnd);
  if (!ds.length && end && end >= t) ds.push(end);
  return ds.sort((a, b) => a - b)[0] || null;
}
function dday(n) {
  const d = nextDate(n); if (!d) return null;
  const diff = Math.round((d - todayKST()) / 86400e3);
  return diff === 0 ? 'D-DAY' : `D-${diff}`;
}
const won = (manwon) => (manwon >= 10000 ? `${(manwon / 10000).toFixed(1).replace(/\.0$/, '')}억` : `${manwon.toLocaleString()}만`);

// ───────── 렌더링 ─────────
function render() {
  const g = new Date(S.bundle.generatedAt);
  $('#updated').textContent = `${g.getMonth() + 1}/${g.getDate()} ${String(g.getHours()).padStart(2, '0')}:${String(g.getMinutes()).padStart(2, '0')} 업데이트 · 매일 자동 확인`;
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === S.tab));
  $('#banner').innerHTML = banners();
  const v = $('#view');
  v.innerHTML = { home: viewHome, all: viewAll, cal: viewCal, docs: viewDocs, me: viewMe }[S.tab]();
  window.scrollTo({ top: 0 });
  bindView();
}

function banners() {
  const out = [];
  const st = S.bundle.sourceStatus || {};
  if (st.setup) out.push(`<div class="banner warn"><b>설정이 하나 남았어요.</b> ${esc(st.setup.error)}<br/>우리정보 탭 맨 아래 "설정 안내"를 봐 주세요.</div>`);
  const fails = Object.entries(st).filter(([k, v]) => k !== 'setup' && !v.ok);
  if (fails.length) out.push(`<div class="banner warn">일부 공고 출처를 못 불러왔어요 (${fails.map(([k]) => esc(k)).join(', ')}). 내일 자동으로 다시 시도해요.</div>`);
  const pm = profile().members || [];
  const incomplete = pm.some((m) => !m.account?.openedAt || !m.monthlyIncome || !m.birth);
  if (!S.bundle.profileMissing && incomplete && S.tab !== 'me') out.push(`<div class="banner warn"><b>청약통장·소득·생년월일</b>이 비어 있는 항목이 있어요. <a href="#" data-goto-me>우리정보</a>에서 채우면 판정이 정확해져요.</div>`);
  if (S.bundle.profileMissing && !localStorage.getItem(LS.prof)) out.push(`<div class="banner warn"><b>우리 부부 정보가 아직 예시값이에요.</b> 우리정보 탭에서 청약통장·소득을 입력하면 판정이 정확해져요.</div>`);
  if (S.sim) out.push(`<div class="banner" style="background:var(--after-bg);color:var(--after);border-color:#f0cdbb">💍 <b>혼인신고 했다고 가정</b>하고 보는 중이에요. <a href="#" data-sim-off>원래대로</a></div>`);
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (!standalone && S.tab === 'home') {
    if (S.installEvt) out.push(`<div class="banner">📲 휴대폰에 앱으로 설치할 수 있어요.<div class="row"><button class="btn sm primary" data-install>앱 설치</button></div></div>`);
    else if (ios) out.push(`<div class="banner">📲 <b>앱으로 설치:</b> Safari 아래 <b>공유 버튼(□↑)</b> → <b>홈 화면에 추가</b></div>`);
  }
  return out.join('');
}

function card(n) {
  const e = E(n);
  const dd = dday(n);
  const routes = e.routes.filter((r) => r.status !== 'no').slice(0, 4);
  const price = n.priceMin ? `${won(n.priceMin)}${n.priceMax && n.priceMax !== n.priceMin ? `~${won(n.priceMax)}` : ''}` : '';
  const area = n.areaMin ? `${Math.round(n.areaMin)}${n.areaMax && Math.round(n.areaMax) !== Math.round(n.areaMin) ? `~${Math.round(n.areaMax)}` : ''}㎡` : '';
  const kd = keyDates(n).filter((k) => k.label !== '계약').slice(0, 3);
  return `<article class="card" data-open="${esc(n.id)}">
    <div class="card-top">
      <span class="badge-best ${e.best}">${STATUS[e.best]}</span>
      <span class="tag">${esc(n.kind)}</span>
      ${n.isNew ? '<span class="new-dot">NEW</span>' : ''}
      ${e.overBudget ? '<span class="tag">예산 초과</span>' : ''}
      ${dd ? `<span class="dday ${/D-[0-3]$|DAY/.test(dd) ? 'soon' : ''}">${dd}</span>` : ''}
    </div>
    <h3>${esc(n.name)}</h3>
    <div class="loc">${esc(n.address || n.sido)}${n.totalUnits ? ` · ${n.totalUnits.toLocaleString()}세대` : ''}</div>
    <div class="meta">
      ${kd.map((k) => `<span>${k.label} <b>${fmtD(k.date)}</b></span>`).join('')}
      ${!kd.length && n.dates?.applyEnd ? `<span>마감 <b>${fmtD(n.dates.applyEnd)}</b></span>` : ''}
      ${price ? `<span>분양가 <b>${price}</b></span>` : ''}${area ? `<span>전용 <b>${area}</b></span>` : ''}
    </div>
    ${routes.length ? `<div class="routes">${routes.map((r) => `<span class="chip ${r.status}">${ICON[r.status]} ${esc(r.label)}</span>`).join('')}</div>` : ''}
  </article>`;
}

function sorted(list) {
  return [...list].sort((a, b) => E(b).score - E(a).score || ((nextDate(a) || 9e15) - (nextDate(b) || 9e15)));
}
function section(title, list, empty) {
  return `<div class="section-h"><h2>${title}</h2><span class="count">${list.length}건</span></div>${list.length ? sorted(list).map(card).join('') : `<div class="empty">${empty}</div>`}`;
}

function viewHome() {
  const N = S.bundle.notices;
  const by = (s) => N.filter((n) => E(n).best === s);
  const ok = by('ok'), check = by('check'), after = by('after');
  return `<div class="summary">
      <div class="stat ok"><b>${ok.length}</b><span>바로 신청 가능</span></div>
      <div class="stat check"><b>${check.length}</b><span>조건 확인 필요</span></div>
      <div class="stat after"><b>${after.length}</b><span>혼인신고 후 가능</span></div>
    </div>
    ${section('지금 노려볼 공고', ok, '지금은 바로 신청할 수 있는 공고가 없어요. 매일 아침 다시 확인해 드릴게요.')}
    ${section('조건만 맞으면 가능', check, '확인할 공고가 없어요.')}
    ${after.length ? `<details class="fold"><summary>💍 혼인신고하면 열리는 공고 ${after.length}건 ›</summary>${sorted(after).map(card).join('')}</details>` : ''}
    <p class="note">판정은 입력한 정보로 계산한 <b>추정</b>이에요. 신청 전 반드시 공고문의 자격·소득·거주기간을 확인하세요.</p>`;
}

const GROUPS = {
  all: ['전체', () => true],
  apt: ['민영 아파트', (n) => n.kind === '민영'],
  public: ['공공분양·신희타', (n) => ['국민', '공공분양', '신혼희망타운'].includes(n.kind)],
  remain: ['무순위·줍줍', (n) => ['무순위', '임의공급', '취소후재공급'].includes(n.kind)],
  rent: ['임대', (n) => /임대|행복/.test(n.kind)],
};
function viewAll() {
  const [, fn] = GROUPS[S.filter];
  const list = S.bundle.notices.filter(fn).filter((n) => S.showNo || E(n).best !== 'no');
  const hidden = S.bundle.notices.filter(fn).filter((n) => E(n).best === 'no').length;
  return `<div class="filters">${Object.entries(GROUPS).map(([k, [lb]]) => `<button data-filter="${k}" class="${S.filter === k ? 'on' : ''}">${lb}</button>`).join('')}</div>
    ${section(`${GROUPS[S.filter][0]} 공고`, list, '해당하는 공고가 없어요.')}
    ${hidden ? `<p class="note"><a href="#" data-showno>${S.showNo ? '불가 공고 숨기기' : `자격 안 되는 공고 ${hidden}건도 보기`}</a></p>` : ''}
    <p class="note">수집 지역: ${esc((S.bundle.regions || []).join(', '))} · 출처: 청약홈, LH청약플러스</p>`;
}

function calEvents(onlyFuture = true) {
  const t = todayKST();
  const ev = [];
  for (const n of S.bundle.notices) {
    if (!['ok', 'check'].includes(E(n).best)) continue;
    for (const k of keyDates(n)) {
      const d = toDate(k.date);
      if (!d || (onlyFuture && d < t)) continue;
      ev.push({ ...k, d, n });
    }
  }
  return ev.sort((a, b) => a.d - b.d);
}
function viewCal() {
  const ev = calEvents();
  const days = new Map();
  for (const e of ev) { const k = ymd(e.d); if (!days.has(k)) days.set(k, []); days.get(k).push(e); }
  return `<div class="section-h"><h2>다가오는 일정</h2><span class="count">${ev.length}개</span></div>
    ${ev.length ? `<button class="btn wide" data-ics-all>🗓️ 휴대폰 캘린더에 전부 추가 (.ics)</button>` : ''}
    ${[...days.entries()].map(([k, list]) => `<div class="tl-day"><h3>${fmtD(k, false)} <span class="wd">${WD[new Date(k + 'T00:00:00+09:00').getDay()]}요일</span></h3>
      ${list.map((e) => `<div class="tl-item" data-open="${esc(e.n.id)}"><span class="lb ${e.cls || ''}">${e.label}</span><span class="nm">${esc(e.n.name)}</span></div>`).join('')}</div>`).join('') || '<div class="empty">가능·확인 공고의 일정이 여기 모여요.</div>'}
    <p class="note">캘린더 파일에는 하루 전 오전 9시 알림이 들어 있어요.</p>`;
}

function checks() { try { return JSON.parse(localStorage.getItem(LS.checks) || '{}'); } catch { return {}; } }
function checklist(keys) {
  const c = checks();
  return keys.map((k) => { const x = DOCS[k]; if (!x) return ''; return `<div class="check-item ${c[k] ? 'done' : ''}">
    <input type="checkbox" data-doc="${k}" ${c[k] ? 'checked' : ''} aria-label="${esc(x.name)}" />
    <div><div class="nm">${esc(x.name)}</div><div class="ds">${esc(x.where)} · ${esc(x.note)}</div></div>
    ${x.url ? `<a class="btn sm" href="${x.url}" target="_blank" rel="noopener">발급</a>` : '<span></span>'}</div>`; }).join('');
}
function viewDocs() {
  const rel = S.bundle.notices.filter((n) => ['ok', 'check'].includes(E(n).best));
  const keys = new Set(['cert', 'rankcert']);
  for (const n of rel) docsFor(n, E(n), S.d).forEach((k) => keys.add(k));
  const order = Object.keys(DOCS).filter((k) => keys.has(k));
  const done = order.filter((k) => checks()[k]).length;
  return `<div class="banner" style="margin:8px 0 0">청약 <b>신청</b>은 청약홈·LH청약플러스에 온라인으로 입력만 하면 돼요 (서류 제출 없음).<br/>아래 서류는 <b>당첨·서류제출 대상이 된 뒤</b> 보통 1주 안에 내야 해서, 미리 떼는 법을 알아두면 좋아요.</div>
    <div class="section-h"><h2>우리에게 필요한 서류</h2><span class="count">${done}/${order.length} 준비</span></div>
    <div class="box">${checklist(order)}</div>
    <p class="note">⚠️ 대부분 "모집공고일 이후 발급분"을 요구해요. 체크는 '발급 방법 확인함' 용도로 쓰고, 당첨되면 다시 발급하세요. 체크 표시는 이 휴대폰에만 저장돼요.</p>`;
}

function num(v) { const x = Number(String(v ?? '').replace(/[^\d.-]/g, '')); return Number.isFinite(x) ? x : 0; }
function memberForm(m, i) {
  const a = m.account || {};
  return `<fieldset><legend>${esc(m.label || (i ? '아내' : '남편'))}</legend>
    <div class="grid2">
      <label>호칭<input name="m${i}.label" value="${esc(m.label || '')}" /></label>
      <label>생년월일<input type="date" name="m${i}.birth" value="${esc(m.birth || '')}" /></label>
    </div>
    <label class="inline"><input type="checkbox" name="m${i}.isHead" ${m.isHead ? 'checked' : ''}/> 주민등록상 세대주</label>
    <div class="grid2">
      <label>청약통장 가입일<input type="date" name="m${i}.openedAt" value="${esc(a.openedAt || '')}" /></label>
      <label>납입 인정 회차<input inputmode="numeric" name="m${i}.payments" value="${esc(a.payments ?? '')}" /></label>
      <label>통장 잔액 (만원)<input inputmode="numeric" name="m${i}.balance" value="${a.balance ? Math.round(a.balance / 1e4) : ''}" /></label>
      <label>월 소득 세전 (만원)<input inputmode="numeric" name="m${i}.income" value="${m.monthlyIncome ? Math.round(m.monthlyIncome / 1e4) : ''}" /></label>
      <label>소득세 낸 햇수<input inputmode="numeric" name="m${i}.taxYears" value="${esc(m.taxYears ?? '')}" /></label>
      <label>부양 직계존속 수<input inputmode="numeric" name="m${i}.parents" value="${esc(m.parentsDependents ?? 0)}" /></label>
    </div>
    <label class="inline"><input type="checkbox" name="m${i}.ownsHome" ${m.ownsHome ? 'checked' : ''}/> 지금 주택(분양권 포함) 있음</label>
    <label class="inline"><input type="checkbox" name="m${i}.everOwned" ${m.everOwnedHome ? 'checked' : ''}/> 과거에 주택을 가진 적 있음</label>
    <label class="inline"><input type="checkbox" name="m${i}.win5" ${m.winWithin5y ? 'checked' : ''}/> 최근 5년 내 청약 당첨 이력</label>
  </fieldset>`;
}
function viewMe() {
  const p = profile();
  const d = S.d;
  const base = deriveProfile(p, {}); const reg = deriveProfile(p, { simulateRegistered: true });
  const mems = p.members || [];
  const pts = mems.map((m, i) => ({ m, now: estimatePoints({ ...m }, base), after: estimatePoints({ ...m }, reg) }));
  const repo = S.bundle.repo;
  const secretUrl = repo ? `https://github.com/${repo}/settings/secrets/actions/PROFILE_JSON` : 'https://github.com';
  const st = S.bundle.sourceStatus || {};
  return `<div class="section-h"><h2>혼인신고 시뮬레이션</h2></div>
    <div class="box"><div class="toggle-row"><div><b>혼인신고 했다고 가정하기</b><div class="ds muted" style="font-size:13px">민영 신혼특공·생애최초·부부 각각 청약 등 달라지는 기회를 바로 비교해요.</div></div>
      <label class="switch"><input type="checkbox" id="simToggle" ${S.sim ? 'checked' : ''}/><span></span></label></div></div>

    <div class="section-h"><h2>추정 청약 가점 (민영 일반공급)</h2></div>
    <div class="pts">${pts.map(({ m, now, after }) => `<div class="stat"><span>${esc(m.label)}</span><b>${now.total}점</b><span>혼인신고 후 ${after.total}점 (부양가족 +${after.depPts - now.depPts})</span></div>`).join('')}</div>
    <p class="note">무주택기간·부양가족·통장기간으로 계산한 추정치예요 (만점 84). 청약홈 '청약가점 계산기'로 한 번 더 확인하세요.</p>

    <div class="section-h"><h2>우리 부부 정보</h2></div>
    <form class="form" id="profForm">
      <fieldset><legend>사는 곳 · 결혼</legend>
        <div class="grid2">
          <label>시·도<select name="sido">${['경기', '서울', '인천'].map((x) => `<option ${p.region?.sido === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
          <label>시·군·구<input name="sigungu" value="${esc(p.region?.sigungu || '')}" placeholder="광명시" /></label>
          <label>이 주소 전입일<input type="date" name="movedInAt" value="${esc(p.region?.movedInAt || '')}" /></label>
          <label>결혼식(예정)일<input type="date" name="weddingDate" value="${esc(p.marriage?.weddingDate || '')}" /></label>
        </div>
        <label class="inline"><input type="checkbox" name="registered" ${p.marriage?.registered ? 'checked' : ''}/> 혼인신고 완료</label>
        <label>혼인신고일<input type="date" name="registeredDate" value="${esc(p.marriage?.registeredDate || '')}" /></label>
        <label class="inline"><input type="checkbox" name="sameHousehold" ${p.household?.sameHousehold !== false ? 'checked' : ''}/> 둘이 같은 주민등록 세대 (등본 한 장)</label>
        <label>자녀·태아 생년월일 (쉼표로 구분, 없으면 비움)<input name="children" value="${esc((p.children || []).map((c) => c.birth).join(', '))}" placeholder="2027-05-01" /></label>
      </fieldset>
      ${mems.map(memberForm).join('')}
      <fieldset><legend>자산 · 관심 조건</legend>
        <div class="grid2">
          <label>보유 부동산 (만원)<input inputmode="numeric" name="realEstate" value="${p.assets?.realEstate ? Math.round(p.assets.realEstate / 1e4) : 0}" /></label>
          <label>자동차 가액 (만원)<input inputmode="numeric" name="car" value="${p.assets?.car ? Math.round(p.assets.car / 1e4) : 0}" /></label>
          <label>최대 분양가 (만원, 0=제한없음)<input inputmode="numeric" name="maxPrice" value="${esc(p.prefs?.maxPriceManwon || 0)}" /></label>
          <label>관심 동네 (쉼표)<input name="nearby" value="${esc((p.prefs?.nearby || []).join(', '))}" /></label>
        </div>
        <div class="inline">${['서울', '경기', '인천'].map((x) => `<label class="inline"><input type="checkbox" name="rg-${x}" ${(p.prefs?.regions || ['서울', '경기', '인천']).includes(x) ? 'checked' : ''}/> ${x}</label>`).join('')}</div>
      </fieldset>
      <button class="btn primary wide" type="submit">이 휴대폰에 저장하고 바로 다시 판정</button>
      <button class="btn wide" type="button" data-copyjson>매일 알림에도 반영: JSON 복사 → GitHub에 붙여넣기</button>
      <a class="btn wide" href="${secretUrl}" target="_blank" rel="noopener">GitHub 'PROFILE_JSON' 열기 ↗</a>
      ${localStorage.getItem(LS.prof) ? '<button class="btn wide" type="button" data-resetprof>이 휴대폰 저장값 지우기 (서버값으로)</button>' : ''}
    </form>
    <p class="note">입력값은 이 휴대폰과, 붙여넣은 경우 GitHub 비밀 저장소(Secrets)에만 있어요. 저장소 코드·로그·웹에는 암호화 없이 남지 않아요.</p>

    <div class="section-h"><h2>앱 설정</h2></div>
    <div class="box">
      <h4>🔔 휴대폰 알림 받기</h4>
      <div style="font-size:13.5px">ntfy 앱(무료)을 설치하고, 함께 정한 <b>알림 주제 이름</b>을 구독하면 새 공고·접수 전날 알림이 와요. 자세한 방법은 저장소 안내(README) 3단계.</div>
      <div class="row" style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
        <a class="btn sm" href="https://apps.apple.com/app/ntfy/id1625396347" target="_blank" rel="noopener">아이폰 ntfy</a>
        <a class="btn sm" href="https://play.google.com/store/apps/details?id=io.heckel.ntfy" target="_blank" rel="noopener">안드로이드 ntfy</a>
      </div>
    </div>
    <div class="box"><h4>🔒 잠그기</h4><div style="font-size:13.5px">이 휴대폰에 저장된 열쇠를 지우고 잠금 화면으로 돌아가요.</div><button class="btn sm" style="margin-top:8px" data-logout>지금 잠그기</button></div>
    <details class="box"><summary><b>⚙️ 설정 안내 · 데이터 상태</b></summary>
      <p style="font-size:13.5px">기준값 버전 ${esc(RULES.version)} · 매일 06:17, 17:47 자동 확인</p>
      <pre>${esc(JSON.stringify(st, null, 1))}</pre>
      <p style="font-size:13px">공공데이터포털 키가 없다면: data.go.kr 로그인 → "청약홈 분양정보 조회 서비스", "LH 분양임대공고문 조회 서비스" 활용신청 → 마이페이지 인증키(Decoding) 복사 → GitHub Secrets <code>DATA_GO_KR_KEY</code>에 붙여넣기.</p>
      <details><summary style="font-size:13px">진단용 필드 목록</summary><pre>${esc(JSON.stringify(S.bundle.fieldSample || {}, null, 0))}</pre></details>
    </details>`;
}

function readForm(f) {
  const p = structuredClone(profile());
  const v = (n) => f.elements[n]?.value?.trim() ?? '';
  const c = (n) => !!f.elements[n]?.checked;
  p.region = { ...(p.region || {}), sido: v('sido'), sigungu: v('sigungu'), movedInAt: v('movedInAt') || null };
  p.marriage = { ...(p.marriage || {}), weddingDate: v('weddingDate') || null, registered: c('registered'), registeredDate: v('registeredDate') || null, planned: true };
  p.household = { ...(p.household || {}), sameHousehold: c('sameHousehold') };
  p.children = v('children').split(',').map((s) => s.trim()).filter(Boolean).map((birth) => ({ birth }));
  p.assets = { realEstate: num(v('realEstate')) * 1e4, car: num(v('car')) * 1e4 };
  p.members = (p.members || []).map((m, i) => ({
    ...m, label: v(`m${i}.label`) || m.label, birth: v(`m${i}.birth`) || null, isHead: c(`m${i}.isHead`),
    account: { ...(m.account || {}), openedAt: v(`m${i}.openedAt`) || null, payments: num(v(`m${i}.payments`)), balance: num(v(`m${i}.balance`)) * 1e4 },
    monthlyIncome: num(v(`m${i}.income`)) * 1e4, taxYears: num(v(`m${i}.taxYears`)), parentsDependents: num(v(`m${i}.parents`)),
    ownsHome: c(`m${i}.ownsHome`), everOwnedHome: c(`m${i}.everOwned`), winWithin5y: c(`m${i}.win5`),
  }));
  p.homeless = !p.members.some((m) => m.ownsHome);
  p.prefs = { ...(p.prefs || {}), maxPriceManwon: num(v('maxPrice')), nearby: v('nearby').split(',').map((s) => s.trim()).filter(Boolean), regions: ['서울', '경기', '인천'].filter((x) => c(`rg-${x}`)) };
  delete p._설명;
  return p;
}

// ───────── 상세 시트 ─────────
function openSheet(id) {
  const n = S.bundle.notices.find((x) => x.id === id); if (!n) return;
  const e = E(n);
  const x = n.dates || {};
  const fl = n.flags || {};
  const rows = [
    ['모집공고', fmtD(x.notice)], ['특별공급', range(x.specialStart, x.specialEnd)],
    ['1순위 해당지역', fmtD(x.rank1Local)], ['1순위 기타경기', fmtD(x.rank1Gg)], ['1순위 기타지역', fmtD(x.rank1Other)], ['2순위', fmtD(x.rank2Local)],
    ['청약 접수', range(x.applyStart, x.applyEnd)], ['당첨 발표', fmtD(x.winners)], ['계약', range(x.contractStart, x.contractEnd)],
    ['입주 예정', x.moveIn ? `${String(x.moveIn).slice(0, 4)}년 ${Number(String(x.moveIn).slice(4, 6))}월` : ''],
  ].filter(([, v]) => v);
  const flags = [fl.speculative && '투기과열지구', fl.adjusted && '조정대상지역', fl.priceCap && '분양가상한제', fl.bigLand && '대규모택지', fl.publicLand && '공공주택지구'].filter(Boolean);
  const docKeys = docsFor(n, e, S.d);
  $('#sheetBody').innerHTML = `
    <div class="card-top"><span class="badge-best ${e.best}">${STATUS[e.best]}</span><span class="tag">${esc(n.kind)}</span>${flags.map((f) => `<span class="tag">${f}</span>`).join('')}</div>
    <h2>${esc(n.name)}</h2>
    <div class="loc muted">${esc(n.address || '')}${n.kindDetail ? ` · ${esc(n.kindDetail)}` : ''}</div>
    <div class="actions">
      <a class="btn primary" href="${esc(n.applyUrl || n.url)}" target="_blank" rel="noopener">청약 신청하러 가기 ↗</a>
      <a class="btn" href="${esc(n.url)}" target="_blank" rel="noopener">공고문 보기</a>
      <button class="btn" data-ics="${esc(n.id)}">캘린더 추가</button>
    </div>
    <div class="box"><h4>우리 부부 판정 · ${esc(e.regionNote || '')}</h4>
      ${e.routes.map((r) => `<div class="route"><div class="rh"><b>${esc(r.label)}</b><span class="chip ${r.status}">${ICON[r.status]} ${STATUS[r.status]}</span></div><ul>${r.reasons.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>`).join('')}
    </div>
    ${rows.length ? `<div class="box"><h4>일정</h4><dl class="kv">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl></div>` : ''}
    ${(n.models || []).length ? `<div class="box"><h4>주택형</h4><table class="models"><thead><tr><th>타입</th><th>최고가</th><th>일반</th><th>신혼</th><th>생애</th><th>신생아</th></tr></thead><tbody>
      ${n.models.map((m) => `<tr><td>${esc(m.type)}</td><td>${m.topPrice ? won(m.topPrice) : '-'}</td><td>${m.units.general}</td><td>${m.units.newlywed ?? '-'}</td><td>${m.units.firstLife ?? '-'}</td><td>${m.units.newborn ?? '-'}</td></tr>`).join('')}
      </tbody></table></div>` : ''}
    ${n.tel || n.homepage ? `<div class="box"><h4>문의</h4><dl class="kv">${n.tel ? `<dt>전화</dt><dd><a href="tel:${esc(n.tel)}">${esc(n.tel)}</a></dd>` : ''}${n.homepage ? `<dt>홈페이지</dt><dd><a href="${esc(/^https?:/.test(n.homepage) ? n.homepage : 'http://' + n.homepage)}" target="_blank" rel="noopener">열기 ↗</a></dd>` : ''}</dl></div>` : ''}
    <div class="box"><h4>당첨되면 낼 서류</h4>${checklist(docKeys)}</div>
    <p class="note">이 판정은 추정이에요. 해당지역 거주기간·소득 산정 방식·자산 기준은 공고문마다 달라요. 신청은 청약홈/LH청약플러스에서 공동·금융인증서로 직접 하세요.</p>`;
  $('#sheet').hidden = false;
  document.body.style.overflow = 'hidden';
  bindChecks($('#sheetBody'));
  $('#sheetBody [data-ics]')?.addEventListener('click', () => downloadICS(keyDates(n).map((k) => ({ ...k, d: toDate(k.date), n })), `청약-${n.name.slice(0, 20)}.ics`));
}
function closeSheet() { $('#sheet').hidden = true; document.body.style.overflow = ''; }
document.querySelectorAll('[data-close]').forEach((el) => el.addEventListener('click', closeSheet));

// ───────── 캘린더(.ics) ─────────
function downloadICS(events, filename) {
  const p = (d) => ymd(d).replace(/-/g, '');
  const escI = (s) => String(s).replace(/[\\,;]/g, (c) => '\\' + c).replace(/\n/g, '\\n');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//woorizip//cheongyak//KO', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const e of events) {
    if (!e.d) continue;
    const end = new Date(e.d.getTime() + 86400e3);
    lines.push('BEGIN:VEVENT', `UID:${p(e.d)}-${e.label}-${e.n.id}@woorizip`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${p(e.d)}`, `DTEND;VALUE=DATE:${p(end)}`,
      `SUMMARY:${escI(`[청약] ${e.label} · ${e.n.name}`)}`, `DESCRIPTION:${escI(`${e.n.address || ''}\n${e.n.url || ''}`)}`, `URL:${escI(e.n.url || '')}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escI(`내일 ${e.label}: ${e.n.name}`)}`, 'TRIGGER:-PT15H', 'END:VALARM', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}

// ───────── 이벤트 ─────────
function toast(t) { const el = document.createElement('div'); el.className = 'toast'; el.textContent = t; document.body.appendChild(el); setTimeout(() => el.remove(), 2200); }
function bindChecks(root) {
  root.querySelectorAll('[data-doc]').forEach((cb) => cb.addEventListener('change', () => {
    const c = checks(); c[cb.dataset.doc] = cb.checked; localStorage.setItem(LS.checks, JSON.stringify(c));
    cb.closest('.check-item').classList.toggle('done', cb.checked);
  }));
}
function bindView() {
  const v = $('#view');
  document.querySelectorAll('[data-open]').forEach((el) => el.addEventListener('click', () => openSheet(el.dataset.open)));
  v.querySelectorAll('[data-filter]').forEach((b) => b.addEventListener('click', () => { S.filter = b.dataset.filter; render(); }));
  v.querySelector('[data-showno]')?.addEventListener('click', (e) => { e.preventDefault(); S.showNo = !S.showNo; render(); });
  v.querySelector('[data-ics-all]')?.addEventListener('click', () => downloadICS(calEvents(), '우리집-청약일정.ics'));
  document.querySelector('[data-goto-me]')?.addEventListener('click', (e) => { e.preventDefault(); S.tab = 'me'; render(); });
  document.querySelector('[data-sim-off]')?.addEventListener('click', (e) => { e.preventDefault(); setSim(false); });
  document.querySelector('[data-install]')?.addEventListener('click', async () => { S.installEvt?.prompt(); S.installEvt = null; });
  bindChecks(v);
  $('#simToggle')?.addEventListener('change', (e) => setSim(e.target.checked));
  const f = $('#profForm');
  if (f) {
    f.addEventListener('submit', (e) => { e.preventDefault(); localStorage.setItem(LS.prof, JSON.stringify(readForm(f))); recompute(); render(); toast('저장했어요 · 다시 판정 완료'); });
    f.querySelector('[data-copyjson]').addEventListener('click', async () => {
      const json = JSON.stringify(readForm(f));
      try { await navigator.clipboard.writeText(json); toast('복사됐어요. GitHub에서 Update secret → 붙여넣기'); }
      catch { prompt('아래 내용을 전체 복사하세요', json); }
    });
    f.querySelector('[data-resetprof]')?.addEventListener('click', () => { localStorage.removeItem(LS.prof); recompute(); render(); toast('서버 값으로 돌아갔어요'); });
  }
  v.querySelector('[data-logout]')?.addEventListener('click', () => { localStorage.removeItem(LS.key); location.reload(); });
}
function setSim(on) { S.sim = on; localStorage.setItem(LS.sim, on ? '1' : '0'); recompute(); render(); }

document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => { S.tab = b.dataset.tab; render(); }));
$('#refreshBtn').addEventListener('click', async () => {
  try {
    const box = await fetchBox(); const raw = cachedKey(box);
    if (!raw) { location.reload(); return; }
    S.box = box; S.bundle = await decryptRaw(raw, box); recompute(); render(); toast('최신 공고로 업데이트했어요');
  } catch { toast('업데이트 실패 — 인터넷 확인'); }
});

boot();
