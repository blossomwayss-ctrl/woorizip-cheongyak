// 주소 → 지도 좌표. 무료 OpenStreetMap Nominatim(초당 1회 제한 준수) → 실패 시 동/구 중심 좌표.
// 결과는 암호화된 state에 캐시해서 같은 주소를 다시 묻지 않음.
import { AREAS, DONG_CENTERS } from '../site/engine.js';

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

function fallback(n, areaKey) {
  const addr = `${n.address || ''} ${n.name || ''}`;
  for (const [dong, c] of Object.entries(DONG_CENTERS)) {
    const nm = dong.replace(/_.*/, '');
    if (addr.includes(nm)) return { lat: c[0], lng: c[1], approx: 'dong' };
  }
  const a = AREAS.find((x) => x.key === areaKey);
  return a ? { lat: a.center[0], lng: a.center[1], approx: 'area' } : null;
}

// 좌표가 관심 지역에서 너무 멀면(엉뚱한 동명 매칭) 버림
function plausible(lat, lng) { return lat > 37.35 && lat < 37.65 && lng > 126.65 && lng < 127.1; }

export async function geocodeAll(notices, cache, log) {
  let hit = 0, asked = 0, fb = 0;
  for (const n of notices) {
    if (n.area === '광역') continue;
    const key = clean(n.address) || n.name;
    if (cache[key]) { n.geo = cache[key]; hit++; continue; }
    let geo = null;
    if (n.sigungu) {
      const parts = clean(n.address).split(' ');
      const tries = [clean(n.address), parts.slice(0, 4).join(' '), parts.slice(0, 3).join(' ')].filter((x, i, arr) => x && arr.indexOf(x) === i);
      for (const q of tries) {
        try { asked++; const c = await nominatim(q); if (c && plausible(c[0], c[1])) { geo = { lat: c[0], lng: c[1], approx: q === tries[0] ? '' : 'near' }; break; } }
        catch (e) { log(`  좌표 변환 오류: ${e.message}`); break; }
      }
    }
    if (!geo) { geo = fallback(n, n.area); fb++; }
    if (geo) { n.geo = geo; cache[key] = { ...geo, at: new Date().toISOString().slice(0, 10) }; }
  }
  log(`  지도 좌표: 캐시 ${hit} · 새로 조회 ${asked}회 · 대략위치 ${fb}`);
}
