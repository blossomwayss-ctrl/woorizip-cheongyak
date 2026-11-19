// 주소 → 지도 좌표. 무료 OpenStreetMap Nominatim(초당 1회 제한 준수) → 실패 시 동/구 중심 좌표.
// 결과는 암호화된 state에 캐시해서 같은 주소를 다시 묻지 않음.
import { DONG_CENTERS } from '../site/engine.js';

const UA = 'woorizip-cheongyak/1.0 (personal housing alert; https://github.com/blossomwayss-ctrl/woorizip-cheongyak)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let last = 0;

function clean(addr) {
  return String(addr || '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/일원|일대|번지|외\s*\d+\s*필지|공공주택지구|택지개발지구|지구\s*내|내\s+[A-Z]?-?\d+\s*블록|[A-Z]\d*-?\d*\s*블록|\d+\s*블록|,.*$/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

async function nominatim(q) {
  const wait = 1100 - (Date.now() - last);
  if (wait > 0) await sleep(wait);
  last = Date.now();
  const url = `https://nominatim.openstreetmap.org/search?${new URLSearchParams({ format: 'json', q, countrycodes: 'kr', limit: '1', 'accept-language': 'ko' })}`;
  const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`nominatim ${r.status}`);
  const j = await r.json();
  return j[0] ? [Number(j[0].lat), Number(j[0].lon)] : null;
}

// 두 좌표 사이 거리(km)
function km(a, b) {
  const R = 6371, rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b[0] - a[0]), dLng = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
// 엉뚱한 곳(동명이인 지명)으로 찾아진 좌표는 버림
function plausible(c, center) {
  if (center) return km(c, center) < 25;
  return c[0] > 33 && c[0] < 38.7 && c[1] > 124.5 && c[1] < 131;
}

async function lookup(q, cache, center) {
  const key = `q:${q}`;
  if (cache[key]) return cache[key];
  const c = await nominatim(q);
  if (c && plausible(c, center)) {
    cache[key] = { lat: c[0], lng: c[1], at: new Date().toISOString().slice(0, 10) };
    return cache[key];
  }
  return null;
}

// 관심 동네 중심 좌표 채우기 (자유 입력 동네용)
export async function geocodeAreas(areas, cache, log) {
  for (const a of areas) {
    if (a.center) continue;
    const dongKey = a.dong && Object.keys(DONG_CENTERS).find((k) => k.replace(/_.*/, '').startsWith(a.dong[0]));
    if (dongKey) { a.center = DONG_CENTERS[dongKey]; continue; }
    const tokens = (a.spec || '').split(/\s+/);
    const tail = a.dong ? tokens[tokens.length - 1] : '';
    try {
      const g = await lookup([a.sido, a.sigungu, tail].filter(Boolean).join(' '), cache, null);
      if (g) a.center = [g.lat, g.lng];
    } catch (e) { log(`  동네 좌표 오류: ${e.message}`); }
  }
}

// 우리 동네 🏠 좌표 (프로필의 사는 동) — 결과는 암호화된 앱 데이터에만 들어감
export async function geocodeHome(region, cache) {
  if (!region?.dong || region.home?.lat) return region?.home || null;
  const dong = region.dong.replace(/\s/g, '');
  const k = Object.keys(DONG_CENTERS).find((x) => x.replace(/_.*/, '') === dong || x.replace(/_.*/, '') === `${dong}동`);
  if (k) return { lat: DONG_CENTERS[k][0], lng: DONG_CENTERS[k][1], label: `우리 동네 (${k.replace(/_.*/, '')})` };
  try {
    const g = await lookup([region.sido, region.sigungu, dong].filter(Boolean).join(' '), cache, null);
    return g ? { lat: g.lat, lng: g.lng, label: `우리 동네 (${dong})` } : null;
  } catch { return null; }
}

function fallback(n, area) {
  const addr = `${n.address || ''} ${n.name || ''}`;
  for (const [dong, c] of Object.entries(DONG_CENTERS)) {
    const nm = dong.replace(/_.*/, '');
    if (addr.includes(nm) && (!area?.center || km(c, area.center) < 25)) return { lat: c[0], lng: c[1], approx: 'dong' };
  }
  return area?.center ? { lat: area.center[0], lng: area.center[1], approx: 'area' } : null;
}

export async function geocodeAll(notices, areas, cache, log) {
  let hit = 0, asked = 0, fb = 0;
  for (const n of notices) {
    if (n.area === '광역') continue;
    const area = areas.find((a) => a.key === n.area);
    const key = clean(n.address) || n.name;
    if (cache[key]) { n.geo = cache[key]; hit++; continue; }
    let geo = null;
    if (n.sigungu) {
      const parts = clean(n.address).split(' ');
      const tries = [clean(n.address), parts.slice(0, 4).join(' '), parts.slice(0, 3).join(' ')].filter((x, i, arr) => x && arr.indexOf(x) === i);
      for (const q of tries) {
        try {
          asked++;
          const c = await nominatim(q);
          if (c && plausible(c, area?.center)) { geo = { lat: c[0], lng: c[1], approx: q === tries[0] ? '' : 'near' }; break; }
        } catch (e) { log(`  좌표 변환 오류: ${e.message}`); break; }
      }
    }
    if (!geo) { geo = fallback(n, area); fb++; }
    if (geo) { n.geo = geo; cache[key] = { ...geo, at: new Date().toISOString().slice(0, 10) }; }
  }
  log(`  지도 좌표: 캐시 ${hit} · 새로 조회 ${asked}회 · 대략위치 ${fb}`);
}
