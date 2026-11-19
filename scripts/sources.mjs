// 공고 수집: 청약홈(한국부동산원) + LH청약플러스 공공데이터 API
// 필요한 활용신청 (data.go.kr, 개발계정 자동승인):
//   1) 한국부동산원_청약홈 분양정보 조회 서비스
//   2) 한국토지주택공사_분양임대공고문 조회 서비스
import { parseRegion, normSido, ymd, todayKST } from '../site/engine.js';

const ODCLOUD = 'https://api.odcloud.kr/api/ApplyhomeInfoDetailSvc/v1';
const LH = 'https://apis.data.go.kr/B552555/lhLeaseNoticeInfo1/lhLeaseNoticeInfo1';

function normKey(k) {
  if (!k) return '';
  try { return k.includes('%') ? decodeURIComponent(k) : k; } catch { return k; }
}
const pick = (o, ...names) => { for (const n of names) if (o?.[n] != null && o[n] !== '') return o[n]; return ''; };
const yn = (v) => String(v || '').toUpperCase() === 'Y';
const daysAgo = (n) => { const d = todayKST(); d.setDate(d.getDate() - n); return d; };

async function getJSON(url, tries = 2) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
      const text = await r.text();
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${text.slice(0, 160)}`);
      try { return JSON.parse(text); } catch { throw new Error(`JSON 아님: ${text.slice(0, 160)}`); }
    } catch (e) { last = e; await new Promise((s) => setTimeout(s, 1500)); }
  }
  throw last;
}

async function odcloud(op, key, cond = {}, perPage = 500) {
  const out = [];
  for (let page = 1; page <= 10; page++) {
    const q = new URLSearchParams({ page: String(page), perPage: String(perPage), serviceKey: key });
    for (const [k, v] of Object.entries(cond)) q.set(`cond[${k}]`, v);
    const j = await getJSON(`${ODCLOUD}/${op}?${q}`);
    if (j.code && j.code < 0) throw new Error(`${op}: ${j.msg || j.code}`);
    const rows = j.data || [];
    out.push(...rows);
    if (rows.length < perPage || out.length >= (j.matchCount ?? j.totalCount ?? 0)) break;
  }
  return out;
}

// ── 청약홈 아파트 (민영/국민/신혼희망타운/민간사전청약) ──
function normApt(x) {
  const secd = String(pick(x, 'HOUSE_SECD'));
  const secdNm = pick(x, 'HOUSE_SECD_NM');
  const dtlNm = pick(x, 'HOUSE_DTL_SECD_NM');
  let kind = '민영';
  if (secd === '10' || /신혼희망/.test(secdNm)) kind = '신혼희망타운';
  else if (/국민/.test(dtlNm) || String(pick(x, 'HOUSE_DTL_SECD')) === '03') kind = '국민';
  const addr = pick(x, 'HSSPLY_ADRES');
  const { sido, sigungu } = parseRegion(addr, pick(x, 'SUBSCRPT_AREA_CODE_NM'));
  const hm = pick(x, 'HOUSE_MANAGE_NO'), pb = pick(x, 'PBLANC_NO');
  return {
    id: `apt-${hm}-${pb}`, source: '청약홈', houseManageNo: hm, pblancNo: pb,
    kind, kindDetail: [secdNm, dtlNm, pick(x, 'RENT_SECD_NM')].filter(Boolean).join(' · '),
    name: pick(x, 'HOUSE_NM'), address: addr, sido, sigungu,
    totalUnits: Number(pick(x, 'TOT_SUPLY_HSHLDCO') || 0),
    builder: pick(x, 'CNSTRCT_ENTRPS_NM'), owner: pick(x, 'BSNS_MBY_NM'), tel: pick(x, 'MDHS_TELNO'),
    dates: {
      notice: pick(x, 'RCRIT_PBLANC_DE'),
      specialStart: pick(x, 'SPSPLY_RCEPT_BGNDE'), specialEnd: pick(x, 'SPSPLY_RCEPT_ENDDE'),
      rank1Local: pick(x, 'GNRL_RNK1_CRSPAREA_RCPTDE', 'GNRL_RNK1_CRSPAREA_RCEPT_DE'),
      rank1Gg: pick(x, 'GNRL_RNK1_ETC_GG_RCPTDE', 'GNRL_RNK1_ETC_GG_RCEPT_DE'),
      rank1Other: pick(x, 'GNRL_RNK1_ETC_AREA_RCPTDE', 'GNRL_RNK1_ETC_AREA_RCEPT_DE'),
      rank2Local: pick(x, 'GNRL_RNK2_CRSPAREA_RCPTDE', 'GNRL_RNK2_CRSPAREA_RCEPT_DE'),
      applyStart: pick(x, 'RCEPT_BGNDE'), applyEnd: pick(x, 'RCEPT_ENDDE'),
      winners: pick(x, 'PRZWNER_PRESNATN_DE'),
      contractStart: pick(x, 'CNTRCT_CNCLS_BGNDE'), contractEnd: pick(x, 'CNTRCT_CNCLS_ENDDE'),
      moveIn: pick(x, 'MVN_PREARNGE_YM'),
    },
    flags: {
      speculative: yn(x.SPECLT_RDN_EARTH_AT), adjusted: yn(x.MDAT_TRGET_AREA_SECD), priceCap: yn(x.PARCPRC_ULS_AT),
      bigLand: yn(x.LRSCL_BLDLND_AT), publicLand: yn(x.PUBLIC_HOUSE_EARTH_AT), redevelop: yn(x.IMPRMN_BSNS_AT),
    },
    url: pick(x, 'PBLANC_URL') || `https://www.applyhome.co.kr/ai/aia/selectAPTLttotPblancDetail.do?houseManageNo=${hm}&pblancNo=${pb}`,
    homepage: pick(x, 'HMPG_ADRES'),
    applyUrl: 'https://www.applyhome.co.kr/co/coa/selectMainView.do',
    models: [],
  };
}

function normModel(m) {
  const ty = String(pick(m, 'HOUSE_TY'));
  const area = parseFloat(ty.replace(/[^\d.]/g, '')) || 0;
  return {
    type: ty, area, supplyArea: Number(pick(m, 'SUPLY_AR') || 0),
    units: {
      general: Number(pick(m, 'SUPLY_HSHLDCO') || 0), special: Number(pick(m, 'SPSPLY_HSHLDCO') || 0),
      newlywed: Number(pick(m, 'NWWDS_HSHLDCO') || 0), firstLife: Number(pick(m, 'LFE_FRST_HSHLDCO') || 0),
      newborn: Number(pick(m, 'NWBB_HSHLDCO') || 0), multiChild: Number(pick(m, 'MNYCH_HSHLDCO') || 0),
      elderly: Number(pick(m, 'OLD_PARNTS_SUPORT_HSHLDCO') || 0), youth: Number(pick(m, 'YGMN_HSHLDCO') || 0),
    },
    topPrice: Number(pick(m, 'LTTOT_TOP_AMOUNT') || 0), // 만원
  };
}

function normRemain(x, kind) {
  const addr = pick(x, 'HSSPLY_ADRES');
  const { sido, sigungu } = parseRegion(addr, pick(x, 'SUBSCRPT_AREA_CODE_NM'));
  const hm = pick(x, 'HOUSE_MANAGE_NO'), pb = pick(x, 'PBLANC_NO');
  const secdNm = pick(x, 'HOUSE_SECD_NM');
  if (kind === '무순위' && /취소/.test(secdNm)) kind = '취소후재공급';
  return {
    id: `${kind}-${hm}-${pb}`, source: '청약홈', houseManageNo: hm, pblancNo: pb, kind, kindDetail: secdNm,
    name: pick(x, 'HOUSE_NM'), address: addr, sido, sigungu, totalUnits: Number(pick(x, 'TOT_SUPLY_HSHLDCO') || 0),
    dates: {
      notice: pick(x, 'RCRIT_PBLANC_DE'),
      specialStart: pick(x, 'SPSPLY_RCEPT_BGNDE'), specialEnd: pick(x, 'SPSPLY_RCEPT_ENDDE'),
      applyStart: pick(x, 'SUBSCRPT_RCEPT_BGNDE', 'GNRL_RCEPT_BGNDE', 'RCEPT_BGNDE'),
      applyEnd: pick(x, 'SUBSCRPT_RCEPT_ENDDE', 'GNRL_RCEPT_ENDDE', 'RCEPT_ENDDE'),
      winners: pick(x, 'PRZWNER_PRESNATN_DE'),
      contractStart: pick(x, 'CNTRCT_CNCLS_BGNDE'), contractEnd: pick(x, 'CNTRCT_CNCLS_ENDDE'),
      moveIn: pick(x, 'MVN_PREARNGE_YM'),
    },
    flags: { speculative: yn(x.SPECLT_RDN_EARTH_AT), adjusted: yn(x.MDAT_TRGET_AREA_SECD) },
    url: pick(x, 'PBLANC_URL') || 'https://www.applyhome.co.kr',
    homepage: pick(x, 'HMPG_ADRES'), applyUrl: 'https://www.applyhome.co.kr/co/coa/selectMainView.do', models: [],
  };
}

export async function fetchApplyhome(rawKey, log) {
  const key = normKey(rawKey);
  const since = ymd(daysAgo(60));
  const status = {};
  const notices = [];
  const sample = {};

  const ops = [
    ['getAPTLttotPblancDetail', 'apt'],
    ['getRemndrLttotPblancDetail', '무순위'],
    ['getOPTLttotPblancDetail', '임의공급'],
    ['getPblPvtRentLttotPblancDetail', '공공지원민간임대'],
  ];
  for (const [op, kind] of ops) {
    try {
      let rows;
      try { rows = await odcloud(op, key, { 'RCRIT_PBLANC_DE::GTE': since }); }
      catch (e) { log(`  ${op} 날짜조건 실패 → 조건 없이 재시도 (${e.message.slice(0, 80)})`); rows = (await odcloud(op, key, {}, 500)); }
      sample[op] = rows[0] ? Object.keys(rows[0]) : [];
      const list = rows.map((x) => (kind === 'apt' ? normApt(x) : normRemain(x, kind)));
      notices.push(...list);
      status[op] = { ok: true, count: rows.length };
      log(`  청약홈 ${op}: ${rows.length}건`);
    } catch (e) {
      status[op] = { ok: false, error: e.message.slice(0, 200) };
      log(`  청약홈 ${op} 실패: ${e.message.slice(0, 120)}`);
    }
  }
  return { notices, status, sample, fetchModels: (n) => fetchModels(key, n, n.kind === '민영' || n.kind === '국민' || n.kind === '신혼희망타운' ? 'getAPTLttotPblancMdl' : null) };
}

async function fetchModels(key, n, op) {
  if (!op) return [];
  const rows = await odcloud(op, key, { 'HOUSE_MANAGE_NO::EQ': n.houseManageNo }, 100);
  return rows.filter((m) => !n.pblancNo || String(m.PBLANC_NO) === String(n.pblancNo)).map(normModel);
}

// ── LH청약플러스 ──
function lhKind(x) {
  const t = `${pick(x, 'AIS_TP_CD_NM')} ${pick(x, 'UPP_AIS_TP_NM')} ${pick(x, 'PAN_NM')}`;
  if (/영구임대/.test(t)) return null; // 수급자 대상
  if (/신혼희망/.test(t)) return '신혼희망타운';
  if (/행복주택/.test(t)) return '행복주택';
  if (/국민임대/.test(t)) return '국민임대';
  if (/통합공공/.test(t)) return '통합공공임대';
  if (/매입/.test(t)) return '매입임대';
  if (/전세임대/.test(t)) return '전세임대';
  if (/공공분양|분양주택|뉴:?홈/.test(t)) return '공공분양';
  if (/공공임대|분양전환/.test(t)) return '공공임대';
  return '기타임대';
}

function findList(j) {
  if (Array.isArray(j)) { for (const e of j) { const r = findList(e); if (r) return r; } return null; }
  if (j && typeof j === 'object') {
    if (Array.isArray(j.dsList)) return j.dsList;
    for (const v of Object.values(j)) { const r = findList(v); if (r) return r; }
  }
  return null;
}

export async function fetchLH(rawKey, log) {
  const key = normKey(rawKey);
  const fmt = (d) => ymd(d).replace(/-/g, '.');
  const until = todayKST(); until.setDate(until.getDate() + 200);
  const out = [];
  const status = {};
  let sample = [];
  for (const upp of ['05', '06', '13']) {
    try {
      const base = { serviceKey: key, PG_SZ: '300', PAGE: '1', UPP_AIS_TP_CD: upp };
      let j;
      try { j = await getJSON(`${LH}?${new URLSearchParams({ ...base, PAN_NT_ST_DT: fmt(daysAgo(60)), CLSG_DT: fmt(until) })}`); if (!findList(j)) throw new Error('목록 없음'); }
      catch (e) { log(`  LH ${upp} 날짜조건 실패 → 재시도 (${e.message.slice(0, 80)})`); j = await getJSON(`${LH}?${new URLSearchParams(base)}`); }
      const list = findList(j) || [];
      if (list[0]) sample = Object.keys(list[0]);
      for (const x of list) {
        const kind = lhKind(x);
        if (!kind) continue;
        const sidoNm = pick(x, 'CNP_CD_NM');
        const st = pick(x, 'PAN_SS');
        out.push({
          id: `lh-${pick(x, 'PAN_ID')}`, source: 'LH청약플러스', kind, kindDetail: [pick(x, 'UPP_AIS_TP_NM'), pick(x, 'AIS_TP_CD_NM')].filter(Boolean).join(' · '),
          name: pick(x, 'PAN_NM'), address: sidoNm, sido: normSido(sidoNm), sigungu: '', status: st,
          dates: { notice: pick(x, 'PAN_NT_ST_DT', 'PAN_DT'), applyEnd: pick(x, 'CLSG_DT') },
          flags: {}, url: pick(x, 'DTL_URL') || 'https://apply.lh.or.kr', applyUrl: 'https://apply.lh.or.kr', models: [],
        });
      }
      status[`LH-${upp}`] = { ok: true, count: list.length };
      log(`  LH ${upp}: ${list.length}건`);
    } catch (e) {
      status[`LH-${upp}`] = { ok: false, error: e.message.slice(0, 200) };
      log(`  LH ${upp} 실패: ${e.message.slice(0, 120)}`);
    }
  }
  return { notices: out, status, sample };
}
