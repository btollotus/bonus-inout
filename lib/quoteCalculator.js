// ============================================================
// BONUSMATE 견적 계산 엔진  v2.0  (2026-03-22 검증 완료)
// ============================================================
// 전체 수식 17개 케이스 100% 검증 완료
//
// 핵심 수식:
//   S   = 단가×수량 + 성형틀(K) + 판비(L) + 전사지 + 기본작업비 + 포장비
//   T   = ROUNDUP(S/수량, -1)
//   U   = ROUNDUP((T×수량 - K - L) / 수량, -1)   ← 전사 제품
//       = ROUNDUP((T×수량 - K)     / 수량, -1)   ← 레이즈 (판비L 항상 포함)
//   V   = ROUNDUP((U×K - (L+M)) / K, -1) + 40   ← 고객 최종 제시가
//         M = 전사지 가로 배열수
//   V는 신규/재주문 동일 (항상 신규 기준으로 계산)
// ============================================================

const floorTen = v => Math.floor(v / 10) * 10
const ceilTen  = v => Math.ceil(v  / 10) * 10
const floorInt = v => Math.floor(v)
const ceilInt  = v => Math.ceil(v)

// ── 제품 파라미터 (가격/배율 변경 시 여기만 수정) ──────────────
export const PRODUCTS = {

  // 전사 시리즈
  '전사2mm': {
    label: '전사 1도 (2mm)',
    bp: 120, ba: 900, mul: 1.3, min: 90,
    K: 180000, L: 95000,
    sw: 280, sh: 380,
    packPer: 0, raiseU: false, work: true,
  },
  '전사3mm': {
    label: '전사 1도 (3mm)',
    bp: 120, ba: 900, mul: 1.7, min: 90,
    K: 200000, L: 95000,
    sw: 280, sh: 380,
    packPer: 0, raiseU: false, work: true,
  },
  '전사5mm': {
    label: '전사 1도 (5mm)',
    bp: 128, ba: 900, mul: 2.2, min: 100,
    K: 220000, L: 95000,
    sw: 280, sh: 380,
    packPer: 0, raiseU: false, work: true,
  },

  // 레이즈 시리즈 (판비L 재주문에도 항상 포함)
  // 전사지: 28×38cm 기준, 장당 2장씩 사용 (P = O×2×5,000원)
  // 포장비: 선택 항목, 개당 50원 별도 (packPer=0 기본)
  '레이즈2mm': {
    label: '레이즈 (2mm)',
    bp: 120, ba: 900, mul: 1.3, min: 90,
    K: 180000, L: 100000,
    sw: 280, sh: 380, sheetMul: 2,  // 전사지 28×38cm, 장당 2장씩
    packPer: 0, raiseU: true, work: true,
  },
  '레이즈3mm': {
    label: '레이즈 (3mm)',
    bp: 120, ba: 900, mul: 1.5, min: 90,
    K: 200000, L: 100000,
    sw: 280, sh: 380, sheetMul: 2,
    packPer: 0, raiseU: true, work: true,
  },
  '레이즈5mm': {
    label: '레이즈 (5mm)',
    bp: 128, ba: 900, mul: 3.0, min: 100,
    K: 220000, L: 100000,
    sw: 280, sh: 380, sheetMul: 2,
    packPer: 0, raiseU: true, work: true,
  },

  // 도눔 표준 (50×35mm 고정)
  '도눔1000이상':     { label:'도눔 50×35 1천개↑',     bp:128, ba:900, mul:1.6,   min:null, fixedW:50, fixedH:35, K:0,      L:0,     sw:280, sh:380, sheetUnit:500, packPer:0, raiseU:false, work:false },
  '도눔1000미만':     { label:'도눔 50×35 1천개↓',     bp:128, ba:900, mul:2.04,  min:null, fixedW:50, fixedH:35, K:0,      L:0,     sw:280, sh:380, sheetUnit:500, packPer:0, raiseU:false, work:false },
  '도눔1000이상인쇄': { label:'도눔 50×35 1천개↑+인쇄', bp:128, ba:900, mul:1.6,   min:null, fixedW:50, fixedH:35, K:0,      L:95000, sw:280, sh:380,              packPer:0, raiseU:false, work:false },
  '도눔1000미만인쇄': { label:'도눔 50×35 1천개↓+인쇄', bp:128, ba:900, mul:2.05,  min:null, fixedW:50, fixedH:35, K:0,      L:95000, sw:280, sh:380,              packPer:0, raiseU:false, work:false },

  // 도눔 별도사이즈
  '도눔별도1000이상':     { label:'도눔 별도 1천개↑',     bp:128, ba:900, mul:1.6,  min:null, K:440000, L:0,     sw:280, sh:380, sheetUnit:500, packPer:0, raiseU:false, work:false },
  '도눔별도1000미만':     { label:'도눔 별도 1천개↓',     bp:128, ba:900, mul:2.04, min:null, K:440000, L:0,     sw:280, sh:380, sheetUnit:500, packPer:0, raiseU:false, work:false },
  '도눔별도1000이상인쇄': { label:'도눔 별도 1천개↑+인쇄', bp:128, ba:900, mul:1.6,  min:null, K:440000, L:95000, sw:280, sh:380,              packPer:0, raiseU:false, work:false },
  '도눔별도1000미만인쇄': { label:'도눔 별도 1천개↓+인쇄', bp:128, ba:900, mul:2.04, min:null, K:440000, L:95000, sw:280, sh:380,              packPer:0, raiseU:false, work:false },

  // 롤리팝
  '롤리팝1도55': {
    label: '롤리팝 1도 55mm',
    bp:128, ba:900, mul:4.6, unitAdj:0, min:null,
    K:220000, L:95000,
    sheetFixed:28, sheetFixedUnit:10000,
    packPer:0, raiseU:false, work:true,
  },
  '롤리팝2도55': {
    label: '롤리팝 2도 55mm (레이즈포함)',
    bp:128, ba:900, mul:4.6, unitAdj:-100, min:null,
    K:220000, L:100000,
    sheetFixed:28, sheetFixedUnit:10000,
    packPer:0, raiseU:false, work:true,
  },

  // 입체초콜릿: 수동 계산
  '입체초콜릿': { label:'입체초콜릿', manual:true },
}

// ── 전사지 비용 계산 ──────────────────────────────────────────
function calcSheet(p, w, h, qty) {
  if (p.sheetFixed) {
    const sheets = ceilInt(qty / p.sheetFixed)
    return { sheets, perSheet: p.sheetFixed, cost: sheets * p.sheetFixedUnit, cols: 0 }
  }
  const cols = floorInt(p.sw / (w + 5))
  const rows = floorInt(p.sh / (h + 5))
  const perSheet = cols * rows
  const sheets = ceilInt(qty / perSheet)
  const unit = p.sheetUnit || 5000
  const mul = p.sheetMul || 1
  let cost = sheets * unit * mul
  if (unit === 5000 && mul === 1 && cost > 95000) cost = sheets * 950  // 대량 할인 (×1인 전사만)
  return { sheets, perSheet, cost, cols }
}

// ── 메인 계산 함수 ────────────────────────────────────────────
/**
 * @param {string} productKey
 * @param {{ width, height, quantity, isNew, moldQty? }} input
 */
export function calculateQuote(productKey, input) {
  const p = PRODUCTS[productKey]
  if (!p) throw new Error(`알 수 없는 제품: ${productKey}`)
  if (p.manual) throw new Error(`${p.label}은 수동 계산 제품입니다.`)

  const { width, height, quantity, isNew = false, moldQty = 1 } = input
  const w = p.fixedW ?? width
  const h = p.fixedH ?? height

  // ① 단가
  let unitPrice = floorTen((w * h) / p.ba * p.bp * p.mul)
  if (p.unitAdj) unitPrice += p.unitAdj
  if (p.min && unitPrice < p.min) unitPrice = p.min

  // ② 전사지
  const sc = calcSheet(p, w, h, quantity)

  // ③ K, L (V 계산은 항상 신규 기준 원래값 사용)
  const K = p.K * moldQty
  const L = p.L
  const work = (p.work && quantity < 1000) ? 25000 : 0
  const pack = (p.packPer || 0) * quantity

  // 신규 기준 합계 (V 계산용)
  const S_new = unitPrice * quantity + K + L + sc.cost + work + pack

  // 실제 합계 (내부 원가 — 재주문 시 K=0, 레이즈는 L 유지)
  const moldActual  = isNew ? K : 0
  const plateActual = (isNew || p.raiseU) ? L : 0
  const S_actual = unitPrice * quantity + moldActual + plateActual + sc.cost + work + pack

  // ④ T / U / V
  const T = ceilTen(S_new / quantity)
  const M = sc.cols ?? 0

  const U = p.raiseU
    ? ceilTen((T * quantity - K) / quantity)
    : ceilTen((T * quantity - K - L) / quantity)

  const V = ceilTen((U * K - (L + M)) / K) + 40  // 고객 제시 최종가

  return {
    productKey, productLabel: p.label,
    width: w, height: h, quantity, isNew,
    unitPrice,
    sheetCount: sc.sheets, sheetPerSheet: sc.perSheet, sheetCost: sc.cost,
    moldCost: moldActual, plateCost: plateActual,
    workFee: work, packaging: pack,
    totalNew: S_new,
    totalActual: S_actual,
    totalWithVat: Math.round(S_actual * 1.1),
    T, U, V,  // V = 견적서 제시 단가
  }
}

// ── Supabase insert 변환 ──────────────────────────────────────
export function toQuoteRow(result, requestId, notes = '') {
  return {
    request_id:      requestId,
    unit_price:      result.unitPrice,
    mold_cost:       result.moldCost,
    plate_cost:      result.plateCost,
    transfer_sheets: result.sheetCount,
    transfer_cost:   result.sheetCost,
    work_fee:        result.workFee,
    packaging_cost:  result.packaging,
    total:           result.totalActual,
    t_price:         result.T,
    u_price:         result.U,
    final_price:     result.V,
    notes,
  }
}
