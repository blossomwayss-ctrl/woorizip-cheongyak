// 우리집 청약 — 자격 판정 엔진 (GitHub Actions와 휴대폰 앱이 같이 씀)
// ⚠️ 이 판정은 "걸러보기"용 추정입니다. 최종 자격은 반드시 입주자모집공고문으로 확인하세요.

// ───────────────────────── 기준값 (공고문 기준으로 매년 바뀜) ─────────────────────────
// 출처: LH 분양가이드 (전년도 도시근로자 가구당 월평균소득, 2026년 적용)
export const RULES = {
  version: '2026-11',
  // 분양(특별공급)용: 가구원수 3인 이하 100% 금액 (원/월)
  income100_sale_3: 7533763,
  income100_sale_4: 8802202,
  // 임대(행복주택 등)용: 가구원수별 100% 금액 (원/월) — 공고문마다 확인 필요
  income100_rent: { 1: 3813363, 2: 5866270, 3: 7533763, 4: 8802202 },
  // 공공분양 자산기준 (원) — 2026년 적용
  publicAsset: { realEstate: 215500000, car: 45420000 },
  // 공공분양 신혼/생애최초/신생아 소득구간 (외벌이%, 맞벌이%)
  publicNewlywed: { priority: [100, 120], general: [130, 140], lottery: [130, 200] },
  publicFirstLife: { priority: [100, 120], general: [130, 140], lottery: [130, 200] },
  // 민영 신혼특공 소득구간 (외벌이%, 맞벌이%) — 초과 시 부동산가액 기준 추첨
  privateNewlywed: { priority: [100, 120], general: [140, 160] },
  privateFirstLife: { priority: [130, 130], general: [160, 160] },
  // 민영 예치금 (만원) — 신청자 "거주지" 기준. [85㎡이하, 102㎡이하, 135㎡이하, 모든면적]
  deposit: {
    서울: [300, 600, 1000, 1500], 부산: [300, 600, 1000, 1500],
    인천: [250, 400, 700, 1000], 대구: [250, 400, 700, 1000], 광주: [250, 400, 700, 1000],
    대전: [250, 400, 700, 1000], 울산: [250, 400, 700, 1000],
    기타: [200, 300, 400, 500],
  },
};

const METRO = ['서울', '경기', '인천'];

// ───────────────────────── 관심 지역 (기본값) ─────────────────────────
// key: 표시 이름 · sido/sigungu: 주소 매칭 · dong: 이 동만 (없으면 구/시 전체)
// lh: LH 공고처럼 시·도만 있는 경우 공고 '이름'에서 찾을 단어
// center: 주소를 좌표로 못 바꿀 때 쓰는 대략 위치
export const AREAS = [
  { key: '광명', sido: '경기', sigungu: '광명시', lh: ['광명'], center: [37.4786, 126.8646] },
  { key: '부천', sido: '경기', sigungu: '부천시', lh: ['부천'], center: [37.5034, 126.766] },
  { key: '독산', sido: '서울', sigungu: '금천구', dong: ['독산'], lh: ['독산'], center: [37.4695, 126.8975] },
  { key: '신림', sido: '서울', sigungu: '관악구', dong: ['신림'], lh: ['신림'], center: [37.4842, 126.9297] },
  { key: '구로', sido: '서울', sigungu: '구로구', lh: ['구로'], center: [37.4954, 126.8875] },
  { key: '동작', sido: '서울', sigungu: '동작구', lh: ['동작'], center: [37.5124, 126.9393] },
  { key: '영등포', sido: '서울', sigungu: '영등포구', lh: ['영등포'], center: [37.5264, 126.8962] },
  { key: '양천', sido: '서울', sigungu: '양천구', lh: ['양천'], center: [37.517, 126.8666] },
];
// 동 단위 대략 좌표 (주소 변환 실패 시)
export const DONG_CENTERS = {
  광명동: [37.479, 126.855], 철산동: [37.476, 126.868], 하안동: [37.463, 126.878], 소하동: [37.444, 126.885], 일직동: [37.4165, 126.8848], 학온동: [37.43, 126.862], 노온사동: [37.447, 126.855], 가학동: [37.42, 126.86], 옥길동: [37.462, 126.82],
  대장동: [37.535, 126.785], 원종동: [37.528, 126.803], 오정동: [37.525, 126.795], 역곡동: [37.486, 126.812], 송내동: [37.4876, 126.7535], 심곡동: [37.485, 126.783], 중동: [37.503, 126.764], 상동: [37.505, 126.753], 괴안동: [37.488, 126.825], 소사본동: [37.477, 126.795], 범박동: [37.468, 126.81], 고강동: [37.53, 126.815], 삼정동: [37.522, 126.775], 옥길동_부천: [37.464, 126.82],
  독산동: [37.4695, 126.8975], 신림동: [37.4842, 126.9297],
  개봉동: [37.494, 126.855], 고척동: [37.5, 126.86], 오류동: [37.4945, 126.842], 항동: [37.478, 126.822], 신도림동: [37.509, 126.891], 구로동: [37.492, 126.889], 가리봉동: [37.481, 126.888], 천왕동: [37.483, 126.838], 궁동: [37.501, 126.831], 온수동: [37.493, 126.825],
  노량진동: [37.513, 126.942], 상도동: [37.503, 126.947], 흑석동: [37.508, 126.962], 사당동: [37.48, 126.977], 대방동: [37.508, 126.926], 신대방동: [37.49, 126.917], 본동: [37.511, 126.952],
  문래동: [37.518, 126.895], 영등포동: [37.516, 126.907], 여의도동: [37.525, 126.925], 당산동: [37.534, 126.9], 신길동: [37.505, 126.914], 대림동: [37.493, 126.9], 도림동: [37.508, 126.901], 양평동: [37.53, 126.89], 양화동: [37.54, 126.89],
  목동: [37.53, 126.875], 신정동: [37.518, 126.856], 신월동: [37.53, 126.835],
};
// 지도 🏠 위치: 암호화된 프로필의 region.home(좌표) 또는 region.dong(동 이름)에서만 가져옴 (공개 코드에 집 위치 없음)
export function homeOf(p) {
  const r = p?.region || {};
  if (r.home?.lat) return { label: '우리 동네', ...r.home };
  const dong = (r.dong || '').replace(/\s/g, '');
  const key = Object.keys(DONG_CENTERS).find((k) => k.replace(/_.*/, '') === dong || k.replace(/_.*/, '') === `${dong}동`);
  return key ? { lat: DONG_CENTERS[key][0], lng: DONG_CENTERS[key][1], label: `우리 동네 (${key.replace(/_.*/, '')})` } : null;
}
// 부부 정보(PROFILE_JSON)가 아직 없을 때 쓰는 빈 프로필 — 아무것도 단정하지 않도록 숫자는 비워 둠
export const BLANK_PROFILE = {
  region: { sido: '경기', sigungu: '' }, marriage: { planned: true, registered: false }, household: { sameHousehold: true },
  homeless: true, children: [], assets: { realEstate: 0, car: 0 },
  members: [{ key: 'a', label: '남편', account: {} }, { key: 'b', label: '아내', account: {} }], prefs: {},
};

// ───────────────────────── 관심 동네 지정 ─────────────────────────
// 위 AREAS의 이름('광명')이나 자유 입력('서울 관악구 신림동', '경기 수원시 영통구', '관악구')을 받아서
// { key, sido, sigungu, dong?, lh, center? } 로 바꿈. center가 없으면 매일 실행 때 좌표를 찾아 채움.
const SEOUL_GU = ['종로구', '중구', '용산구', '성동구', '광진구', '동대문구', '중랑구', '성북구', '강북구', '도봉구', '노원구', '은평구', '서대문구', '마포구', '양천구', '강서구', '구로구', '금천구', '영등포구', '동작구', '관악구', '서초구', '강남구', '송파구', '강동구'];
const SIDO_WORDS = /^(서울|서울시|서울특별시|경기|경기도|인천|인천시|인천광역시|부산|부산시|부산광역시|대구|대구시|대구광역시|광주광역시|대전|대전시|대전광역시|울산|울산시|울산광역시|세종|세종시|세종특별자치시|강원|강원도|강원특별자치도|충북|충청북도|충남|충청남도|전북|전라북도|전북특별자치도|전남|전라남도|경북|경상북도|경남|경상남도|제주|제주도|제주특별자치도)$/;
export function parseAreaSpec(spec) {
  if (spec && typeof spec === 'object') return { lh: [], ...spec, dong: spec.dong ? [].concat(spec.dong) : undefined };
  const str = String(spec || '').trim();
  if (!str) return null;
  const builtin = AREAS.find((a) => a.key === str);
  if (builtin) return builtin;
  let parts = str.split(/\s+/);
  let sido = '';
  if (SIDO_WORDS.test(parts[0])) { sido = normSido(parts[0]); parts = parts.slice(1); }
  if (!parts.length) return null;
  let sigungu = parts[0];
  if (!/(시|군|구)$/.test(sigungu)) {
    if (SEOUL_GU.includes(`${sigungu}구`) && (!sido || sido === '서울')) sigungu += '구';
    else sigungu += sido === '서울' ? '구' : '시';
  }
  if (!sido) sido = SEOUL_GU.includes(sigungu) ? '서울' : '경기';
  const sub = parts.slice(1).join(' ');
  const word = (sub || sigungu).replace(/(특별자치시|시|군|구|동|읍|면)$/, '') || sub || sigungu;
  return { key: word, sido, sigungu, dong: sub ? [word] : undefined, lh: [word], spec: str };
}
export function resolveAreas(specs) {
  const list = (Array.isArray(specs) ? specs : String(specs || '').split(/[,\n]/)).map(parseAreaSpec).filter(Boolean);
  const seen = new Set();
  return list.filter((a) => (seen.has(a.key) ? false : seen.add(a.key)));
}

// 공고가 관심 지역에 속하는지: 맞으면 지역 key, 같은 시·도의 광역 매입·전세임대면 '광역', 아니면 null
export function matchArea(n, areas) {
  const list = areas?.length ? areas : AREAS;
  const addr = `${n.address || ''}`;
  if (n.sigungu) {
    for (const a of list) {
      if (n.sido !== a.sido || n.sigungu !== a.sigungu) continue;
      if (a.dong && !a.dong.some((dg) => addr.includes(dg) || (n.name || '').includes(dg))) continue;
      return a.key;
    }
    return null;
  }
  // 시·도만 있는 공고(LH 등): 공고 이름에서 지역 단어 찾기
  const text = `${n.name || ''} ${addr}`;
  for (const a of list) if ((a.lh || []).some((w) => text.includes(w))) return a.key;
  const sidos = [...new Set(list.map((a) => a.sido))];
  const other = OTHER_DISTRICTS.filter((w) => !list.some((a) => (a.lh || []).includes(w)));
  if (sidos.includes(n.sido) && ['매입임대', '전세임대'].includes(n.kind) && !other.some((w) => text.includes(w))) return '광역';
  return null;
}
const OTHER_DISTRICTS = ['종로', '중구', '용산', '성동', '광진', '동대문', '중랑', '성북', '강북', '도봉', '노원', '은평', '서대문', '마포', '양천', '강서', '구로', '금천', '영등포', '동작', '관악', '서초', '강남', '송파', '강동',
  '수원', '성남', '의정부', '안양', '부천', '광명', '평택', '동두천', '안산', '고양', '과천', '구리', '남양주', '오산', '시흥', '군포', '의왕', '하남', '용인', '파주', '이천', '안성', '김포', '화성', '광주', '양주', '포천', '여주', '연천', '가평', '양평', '경기북부', '인천'];

const SIDO_ALIASES = [
  ['서울', ['서울특별시', '서울시', '서울']], ['경기', ['경기도', '경기']], ['인천', ['인천광역시', '인천']],
  ['부산', ['부산광역시', '부산']], ['대구', ['대구광역시', '대구']], ['광주', ['광주광역시']],
  ['대전', ['대전광역시', '대전']], ['울산', ['울산광역시', '울산']], ['세종', ['세종특별자치시', '세종']],
  ['강원', ['강원특별자치도', '강원도', '강원']], ['충북', ['충청북도', '충북']], ['충남', ['충청남도', '충남']],
  ['전북', ['전북특별자치도', '전라북도', '전북']], ['전남', ['전라남도', '전남']], ['경북', ['경상북도', '경북']],
  ['경남', ['경상남도', '경남']], ['제주', ['제주특별자치도', '제주']],
];

export function normSido(s = '') {
  s = String(s).trim();
  for (const [k, names] of SIDO_ALIASES) if (names.some((n) => s.startsWith(n))) return k;
  if (s.startsWith('광주')) return s.includes('경기') ? '경기' : '광주';
  return s.slice(0, 2);
}

export function parseRegion(address = '', fallbackSido = '') {
  const a = String(address).replace(/\s+/g, ' ').trim();
  const parts = a.split(' ');
  const sido = normSido(parts[0] || fallbackSido) || normSido(fallbackSido);
  let sigungu = '';
  for (const p of parts.slice(1, 3)) {
    if (/(시|군|구)$/.test(p)) { sigungu = p; break; }
  }
  return { sido, sigungu };
}

// ───────────────────────── 날짜 도우미 ─────────────────────────
export function toDate(s) {
  if (!s) return null;
  const m = String(s).match(/(\d{4})[-./]?(\d{2})[-./]?(\d{2})/);
  if (!m) return null;
  return new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00+09:00`);
}
export function ymd(d) {
  if (!d) return '';
  const k = new Date(d.getTime() + 9 * 3600e3);
  return k.toISOString().slice(0, 10);
}
export function todayKST() {
  return toDate(ymd(new Date()));
}
function monthsBetween(a, b) {
  const d1 = toDate(a), d2 = b instanceof Date ? b : toDate(b);
  if (!d1 || !d2) return 0;
  let m = (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth());
  if (d2.getDate() < d1.getDate()) m -= 1;
  return Math.max(0, m);
}
function yearsBetween(a, b) { return monthsBetween(a, b) / 12; }
const won = (n) => (n >= 1e8 ? `${(n / 1e8).toFixed(2).replace(/\.?0+$/, '')}억` : `${Math.round(n / 1e4).toLocaleString()}만`) + '원';

// ───────────────────────── 프로필 해석 ─────────────────────────
export function deriveProfile(p, opts = {}) {
  const registered = opts.simulateRegistered ?? !!p.marriage?.registered;
  const regDate = registered ? (p.marriage?.registeredDate || opts.simulateDate || ymd(todayKST())) : null;
  const members = (p.members || []).map((m, i) => ({ key: m.key || ['a', 'b'][i] || `m${i}`, ...m }));
  const incomes = members.map((m) => Number(m.monthlyIncome || 0));
  const hhIncome = incomes.reduce((x, y) => x + y, 0);
  const dual = incomes.filter((x) => x > 0).length >= 2;
  const incomeKnown = incomes.some((x) => x > 0) || p.incomeConfirmedZero === true;
  return {
    incomeKnown,
    _derived: true, raw: p, registered, regDate, members, hhIncome, dual,
    sido: normSido(p.region?.sido || '경기'), sigungu: p.region?.sigungu || '',
    homeless: p.homeless !== false && !members.some((m) => m.ownsHome),
    everOwned: members.some((m) => m.everOwnedHome),
    hasChild: (p.children || []).length > 0,
    newborn: (p.children || []).some((c) => c.birth && monthsBetween(c.birth, todayKST()) < 24),
    sameHousehold: p.household?.sameHousehold !== false,
    planned: !!(p.marriage?.weddingDate || p.marriage?.planned),
    assets: p.assets || {},
  };
}

// ───────────────────────── 청약 가점 추정 (민영 일반공급 가점제) ─────────────────────────
export function estimatePoints(m, d, at = todayKST()) {
  // 무주택기간: 만 30세 또는 혼인신고일 중 빠른 날부터 (유주택이면 0)
  let homelessPts = 0;
  if (!m.ownsHome && m.birth) {
    const b = toDate(m.birth);
    const age30 = new Date(b); age30.setFullYear(b.getFullYear() + 30);
    let start = age30;
    if (d.registered && d.regDate) { const r = toDate(d.regDate); if (r < start) start = r; }
    if (start <= at) homelessPts = Math.min(32, 2 * (Math.floor(yearsBetween(ymd(start), at)) + 1));
  }
  // 부양가족: 배우자는 혼인신고해야 인정 (+자녀, +등본상 3년 이상 직계존속)
  const deps = (d.registered ? 1 : 0) + (d.raw.children || []).length + Number(m.parentsDependents || 0);
  const depPts = Math.min(35, 5 * (deps + 1));
  // 청약통장 가입기간
  let accPts = 0;
  if (m.account?.openedAt) {
    const mo = monthsBetween(m.account.openedAt, at);
    accPts = mo < 6 ? 1 : mo < 12 ? 2 : Math.min(17, Math.floor(mo / 12) + 2);
  }
  return { total: homelessPts + depPts + accPts, homelessPts, depPts, accPts, deps };
}

// ───────────────────────── 판정 ─────────────────────────
// status: ok(가능성 높음) / check(조건부·공고문 확인) / after(혼인신고하면 열림) / no(불가)
const RANK = { ok: 4, check: 3, after: 2, no: 1 };

function regionLevel(n, d) {
  if (n.sido === d.sido && n.sigungu && d.sigungu && n.sigungu === d.sigungu) return 'local';
  if (n.sido === d.sido) return 'sido';
  if (METRO.includes(n.sido) && METRO.includes(d.sido)) return 'metro';
  return 'out';
}
function isNear(n, d) {
  const near = d.raw.prefs?.nearby || [];
  return near.some((x) => x && `${n.address || ''} ${n.name || ''}`.includes(x));
}

function depositNeed(applicantSido, areaM2) {
  const t = RULES.deposit[applicantSido] || RULES.deposit.기타;
  if (areaM2 <= 85) return t[0];
  if (areaM2 <= 102) return t[1];
  if (areaM2 <= 135) return t[2];
  return t[3];
}

function incomeBand(d, table, base) {
  const pct = (d.hhIncome / base) * 100;
  const idx = d.dual ? 1 : 0;
  for (const [k, v] of Object.entries(table)) if (pct <= v[idx]) return { band: k, pct };
  return { band: null, pct };
}
const BAND_KO = { priority: '우선공급', general: '일반공급', lottery: '추첨공급' };

function generalRank1(n, d, m, regulated, isPublic, minArea) {
  const reasons = [];
  const at = toDate(n.dates.notice) || todayKST();
  const months = monthsBetween(m.account?.openedAt, at);
  const needMonths = regulated ? 24 : (METRO.includes(n.sido) ? 12 : 6);
  let ok = true;
  if (!m.account?.openedAt) { ok = false; reasons.push('청약통장 정보 없음'); }
  else if (months < needMonths) { ok = false; reasons.push(`통장 ${months}개월 (1순위는 ${needMonths}개월 필요)`); }
  if (regulated && !m.isHead) { ok = false; reasons.push('규제지역 1순위는 세대주만 가능'); }
  if (regulated && m.winWithin5y) { ok = false; reasons.push('5년 내 당첨 이력 (규제지역 1순위 제한)'); }
  if (isPublic) {
    const pay = Number(m.account?.payments || 0);
    const needPay = regulated ? 24 : 12;
    if (pay < needPay) { ok = false; reasons.push(`납입 ${pay}회 (${needPay}회 필요)`); }
  } else {
    const need = depositNeed(d.sido, minArea || 84);
    const bal = Math.floor(Number(m.account?.balance || 0) / 1e4);
    if (bal < need) { ok = false; reasons.push(`예치금 ${bal}만원 (${minArea ? Math.round(minArea) + '㎡ ' : ''}${need}만원 필요)`); }
  }
  return { ok, reasons };
}

export function evaluate(n, profile, opts = {}) {
  const d = profile._derived ? profile : deriveProfile(profile, opts);
  const routes = [];
  const lvl = regionLevel(n, d);
  const near = isNear(n, d);
  const regulated = !!(n.flags?.speculative || n.flags?.adjusted);
  const isPublicSale = ['국민', '공공분양', '신혼희망타운'].includes(n.kind);
  const models = n.models || [];
  const has = (k) => models.length === 0 ? null : models.some((x) => Number(x.units?.[k] || 0) > 0);
  const minArea = models.length ? Math.min(...models.map((x) => x.area || 999)) : null;
  const add = (key, label, status, reasons = [], who = '우리 부부') => routes.push({ key, label, status, reasons, who });

  const here = d.sigungu || '우리 시';
  const regionNote = {
    local: `해당지역(${here}) 우선 대상`,
    sido: `${d.sido} 거주자로 신청 (해당 시 거주자 우선)`,
    metro: '수도권 기타지역으로 신청 (해당지역 우선이라 경쟁 불리)',
    out: '거주지역 밖 — 1순위 불가 가능성 높음',
  }[lvl] + (near && lvl !== 'local' ? ' · 관심 동네' : '');

  if (!d.homeless) {
    add('homeless', '무주택 요건', 'no', ['세대 구성원 중 주택 소유자 있음 — 대부분의 특별공급·임대 불가']);
  }

  // ── 아파트 분양 (청약홈 APT / LH 공공분양) ──
  if (['민영', '국민', '공공분양', '신혼희망타운'].includes(n.kind)) {
    // 1) 신혼부부 특별공급
    if (n.kind === '신혼희망타운') {
      if (d.registered) add('nhw', '신혼희망타운', d.homeless ? 'ok' : 'no', ['혼인 7년 이내 신혼부부 자격', '총자산·소득기준은 공고문 표 확인']);
      else if (d.planned) add('nhw', '신혼희망타운 (예비신혼부부)', d.homeless ? 'ok' : 'no', ['혼인신고 전이라도 예비신혼부부로 신청 가능', '부부 중 1명만 "혼인으로 구성될 세대"로 1건 신청', '입주 전까지 혼인신고 필수']);
    } else if (has('newlywed') !== false) {
      if (isPublicSale) {
        const base = RULES.income100_sale_3;
        const { band, pct } = incomeBand(d, RULES.publicNewlywed, base);
        const assetOk = (d.assets.realEstate || 0) <= RULES.publicAsset.realEstate && (d.assets.car || 0) <= RULES.publicAsset.car;
        const r = [`부부 합산 월소득 약 ${won(d.hhIncome)} = 기준의 ${pct.toFixed(0)}%${d.dual ? ' (맞벌이 기준 적용)' : ''}`];
        if (band) r.push(`${BAND_KO[band]} 구간 해당`); else r.push('소득기준 초과');
        if (!assetOk) r.push(`자산기준 초과 (부동산 ${won(RULES.publicAsset.realEstate)}·자동차 ${won(RULES.publicAsset.car)} 이하)`);
        let st = band && assetOk && d.homeless ? 'ok' : 'no';
        if (!d.registered) {
          if (d.planned) { r.unshift('예비신혼부부로 신청 가능 (공공분양)'); r.push('부부 중 1명만 1건 신청 · 입주 전 혼인신고'); }
          else st = 'after';
        }
        add('newlywed', `신혼부부 특공 (공공${d.registered ? '' : '·예비'})`, st, r);
      } else {
        if (!d.registered) {
          add('newlywed', '신혼부부 특공 (민영)', 'after', ['민영 신혼특공은 공고일 현재 혼인신고가 되어 있어야 함', '혼인신고하면 신청 가능 + 부부 각각 청약 가능']);
        } else {
          const { band, pct } = incomeBand(d, RULES.privateNewlywed, RULES.income100_sale_3);
          const r = [`부부 합산 월소득 기준의 ${pct.toFixed(0)}%`, band ? `${BAND_KO[band]} 구간` : '소득 초과 → 추첨 물량 (부동산가액 기준 충족 시)'];
          add('newlywed', '신혼부부 특공 (민영)', d.homeless ? (band ? 'ok' : 'check') : 'no', r);
        }
      }
    }

    // 2) 생애최초 특별공급
    if (has('firstLife') !== false && n.kind !== '신혼희망타운') {
      const r = [];
      const taxOk = d.members.some((m) => Number(m.taxYears || 0) >= 5);
      if (!taxOk) r.push('근로·사업소득세 5년 이상 납부 필요');
      if (d.everOwned) r.push('과거 주택 소유 이력 있음 → 불가');
      let st;
      if (d.registered || d.hasChild) {
        const tbl = isPublicSale ? RULES.publicFirstLife : RULES.privateFirstLife;
        const { band, pct } = incomeBand(d, tbl, RULES.income100_sale_3);
        r.unshift(`세대 월소득 기준의 ${pct.toFixed(0)}% → ${band ? BAND_KO[band] : (isPublicSale ? '소득 초과' : '추첨(부동산 기준)')}`);
        st = taxOk && !d.everOwned && d.homeless ? (band ? 'ok' : (isPublicSale ? 'no' : 'check')) : 'no';
      } else if (!d.sameHousehold && n.kind !== '공공분양') {
        r.unshift('미혼 1인가구는 전용 60㎡ 이하만 가능 (추첨)');
        st = minArea && minArea <= 60 && taxOk && !d.everOwned ? 'check' : 'no';
      } else {
        r.unshift('공고일 현재 혼인 중이어야 함 (예비신혼부부 불가)');
        st = 'after';
      }
      add('firstLife', '생애최초 특공', st, r);
    }

    // 3) 신생아 특별공급
    if (has('newborn') !== false) {
      if (d.newborn) add('newborn', '신생아 특공', d.homeless ? 'check' : 'no', ['공고일 기준 2년 이내 출생 자녀', '소득·자산 기준은 공고문 확인']);
    }

    // 4) 일반공급 (부부 각자)
    if (n.kind !== '신혼희망타운') {
      for (const m of d.members) {
        const g = generalRank1(n, d, m, regulated, isPublicSale, minArea);
        const reasons = [...g.reasons];
        if (!isPublicSale) {
          const pts = estimatePoints(m, d);
          reasons.unshift(`추정 가점 ${pts.total}점 (무주택 ${pts.homelessPts}·부양 ${pts.depPts}·통장 ${pts.accPts})`);
        }
        if (g.ok) reasons.unshift(`1순위 · ${regionNote}`);
        if (regulated && !m.isHead) reasons.push('세대분리로 세대주가 되면 1순위 가능 (주민센터·전입 요건 확인)');
        if (lvl === 'local' && regulated && d.raw.region?.movedInAt && monthsBetween(d.raw.region.movedInAt, toDate(n.dates.notice) || todayKST()) < 24) reasons.push('해당지역 거주 2년 미만 → 해당지역 우선에서 빠질 수 있음 (공고문 거주기간 확인)');
        let st = g.ok ? 'ok' : 'check';
        if (lvl === 'out') st = g.ok ? 'check' : 'no';
        if (!g.ok && !reasons.some((x) => x.includes('2순위'))) reasons.push('1순위 미충족 시 2순위로 신청 가능');
        add(`general-${m.key}`, `일반공급 (${m.label || m.key})`, st, reasons, m.label || m.key);
      }
    }
  }

  // ── 무순위·잔여·임의공급 (줍줍) ──
  if (['무순위', '임의공급', '취소후재공급'].includes(n.kind)) {
    const r = ['청약통장·가점 무관, 추첨', '무주택자 + 공고별 거주지역 요건(시·도/광역권) 확인'];
    if (lvl === 'out') r.push('거주지역 밖 — 전국 공급인지 공고문 확인');
    add('remain', '무순위/잔여세대', d.homeless ? 'check' : 'no', r, '각자 1건');
  }

  // ── 공공지원 민간임대 ──
  if (n.kind === '공공지원민간임대') {
    add('pprent', '공공지원 민간임대', d.homeless ? 'check' : 'no', ['무주택 세대구성원', '특별공급(신혼·청년)은 소득기준 있음 — 공고문 확인', '청약통장 불필요(일반)']);
  }

  // ── LH 공공임대 ──
  if (['행복주택', '국민임대', '매입임대', '전세임대', '통합공공임대', '공공임대', '기타임대'].includes(n.kind)) {
    const base = RULES.income100_rent[2];
    const pct = (d.hhIncome / base) * 100;
    const limit = d.dual ? 120 : 100;
    const r = [`신혼부부·예비신혼부부 계층 (2인 기준 100% ≈ ${won(base)})`, `부부 합산 소득 ≈ ${pct.toFixed(0)}% (신혼 ${limit}%까지${d.dual ? ', 맞벌이' : ''})`];
    if (!d.registered) r.push('예비신혼부부: 입주 전 혼인신고');
    add('rent', `${n.kind} (신혼부부)`, d.homeless ? (pct <= limit ? 'check' : 'no') : 'no', r);
  }

  if (routes.length === 0) add('other', '자격 확인 필요', 'check', ['유형별 자격을 공고문에서 확인']);

  // 소득을 아직 입력하지 않았으면 소득기준이 걸린 경로는 '조건 확인'으로
  if (!d.incomeKnown) {
    for (const r of routes) {
      if (['newlywed', 'nhw', 'firstLife', 'newborn', 'rent'].includes(r.key) && r.status === 'ok') {
        r.status = 'check'; r.reasons.push('소득 미입력 — 우리정보 탭에서 입력하면 정확해져요');
      }
    }
  }
  // LH 공고는 세부 공급유형(특공 물량 등)을 API로 못 받아서 '조건 확인'까지만
  if (n.source === 'LH청약플러스' && !(n.models || []).length && n.kind !== '신혼희망타운') {
    for (const r of routes) if (r.status === 'ok') { r.status = 'check'; r.reasons.push('LH 공고 — 특별공급 종류·물량은 공고문에서 확인'); }
  }

  const best = routes.reduce((a, r) => (RANK[r.status] > RANK[a] ? r.status : a), 'no');
  const lvlScore = lvl === 'local' ? 40 : near ? 30 : { sido: 20, metro: 10, out: 0 }[lvl];
  const price = n.priceMin ? n.priceMin : null;
  const budget = Number(d.raw.prefs?.maxPriceManwon || 0);
  const overBudget = !!(budget && price && price > budget);
  const score = RANK[best] * 100 + lvlScore - (overBudget ? 60 : 0);
  return { routes, best, regionLevel: lvl, near, regionNote, regulated, overBudget, score };
}

// ───────────────────────── 서류 체크리스트 ─────────────────────────
// 청약 "신청" 자체는 청약홈/LH청약플러스 온라인 입력이라 서류 제출 없음.
// 아래는 당첨(또는 서류제출 대상자 선정) 후 내야 하는 서류 — 미리 떼 두면 기한(보통 1주) 압박이 없음.
export const DOCS = {
  id: { name: '신분증', where: '본인', note: '주민등록증·운전면허증' },
  cert: { name: '공동·금융인증서 (부부 각각)', where: '은행/금융인증서비스', note: '청약 신청 자체에 필요 — 미리 발급' },
  rankcert: { name: '청약통장 순위(가입)확인서', where: '청약홈', url: 'https://www.applyhome.co.kr', note: '청약홈 > 청약자격확인 > 청약통장 순위확인서' },
  resident: { name: '주민등록표등본 (상세)', where: '정부24', url: 'https://www.gov.kr', note: '세대구성 사유·일자, 세대원 관계 "포함"으로 발급' },
  abstract: { name: '주민등록표초본 (상세)', where: '정부24', url: 'https://www.gov.kr', note: '과거 주소 변동 "전체 포함" (거주기간 확인용)' },
  family: { name: '가족관계증명서 (상세)', where: '대법원 전자가족관계등록', url: 'https://efamily.scourt.go.kr', note: '주민번호 뒷자리 공개로 발급' },
  marriage: { name: '혼인관계증명서 (상세)', where: '대법원 전자가족관계등록', url: 'https://efamily.scourt.go.kr', note: '혼인신고 후 발급 가능' },
  futureHh: { name: '혼인으로 구성될 세대 등본 (예비신혼부부)', where: '정부24', url: 'https://www.gov.kr', note: '배우자 될 사람 등본 포함' },
  marriagePlan: { name: '입주 전 혼인관계증명서 제출 약속', where: '—', note: '예비신혼부부는 입주 전까지 혼인신고 증빙 필요' },
  health: { name: '건강보험 자격득실확인서 (부부 각각)', where: '국민건강보험공단', url: 'https://www.nhis.or.kr', note: '소득 산정 대상 기간 확인용' },
  incomeWork: { name: '근로소득 원천징수영수증 (전년도)', where: '회사 또는 홈택스', url: 'https://www.hometax.go.kr', note: '올해 입사·이직이면 재직증명서+급여명세서' },
  incomeCert: { name: '소득금액증명 (부부 각각)', where: '홈택스', url: 'https://www.hometax.go.kr', note: '사업·프리랜서 소득이 있으면 필수' },
  tax5y: { name: '소득세 납부 입증 서류 5개년', where: '홈택스', url: 'https://www.hometax.go.kr', note: '생애최초: 소득금액증명 또는 원천징수영수증 + 납부내역증명' },
  employment: { name: '재직증명서', where: '회사', note: '소득·근로 확인용 (공고에 따라)' },
  assetAgree: { name: '자산·금융정보 제공 동의서 (부부 각각)', where: 'LH청약플러스 양식', url: 'https://apply.lh.or.kr', note: '공공분양·임대는 부동산·자동차·금융자산 조회' },
  car: { name: '자동차등록증 (보유 시)', where: '정부24', url: 'https://www.gov.kr', note: '자동차 가액 확인' },
  noHouse: { name: '무주택 서약서', where: '견본주택/공고 양식', note: '사업주체 양식' },
  child: { name: '출생증명서 / 임신진단서', where: '병원', note: '자녀·태아 가점·신생아특공' },
};

export function docsFor(n, evalResult, d) {
  const keys = new Set(['cert', 'id', 'resident', 'abstract', 'family']);
  const routes = evalResult.routes.filter((r) => r.status !== 'no');
  const isPublic = ['국민', '공공분양', '신혼희망타운', '행복주택', '국민임대', '매입임대', '전세임대', '통합공공임대', '공공임대', '기타임대'].includes(n.kind);
  for (const r of routes) {
    if (r.key.startsWith('general')) keys.add('rankcert');
    if (['newlywed', 'nhw', 'rent', 'firstLife', 'newborn'].includes(r.key)) {
      keys.add('health'); keys.add('incomeWork'); keys.add('incomeCert');
      if (d.registered) keys.add('marriage'); else { keys.add('futureHh'); keys.add('marriagePlan'); }
    }
    if (r.key === 'firstLife') keys.add('tax5y');
    if (r.key === 'newborn') keys.add('child');
    if (r.key === 'remain') keys.add('noHouse');
  }
  if (isPublic) { keys.add('assetAgree'); if (d.assets?.car) keys.add('car'); }
  if (n.kind !== '무순위' && routes.some((r) => r.key !== 'remain')) keys.add('rankcert');
  return [...keys];
}
