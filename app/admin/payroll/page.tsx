'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/browser'

// ── 타입 ────────────────────────────────────────────────
type Employee = {
  id: string
  name: string
  position: string | null
  employee_code: string | null
  hire_date: string | null
  resign_date: string | null   // 퇴사일 (실제 마지막 근무일 다음날)
  email: string | null
  bank_name: string | null
  bank_account: string | null
  car_type: string | null
  fuel_type: string | null
  commute_distance: number | null
  fuel_efficiency: number | null   // 인사관리에서 입력한 연비 (km/L)
  auth_user_id: string | null
}

type OtherAllowance = { label: string; amount: number }

type PayrollRow = {
  id?: string
  employee_id: string
  employee_name: string
  pay_month: string
  year: number
  month: number
  base_pay: number
  meal_pay: number
  fuel_pay: number
  bonus_pay: number
  other_allowances: OtherAllowance[]
  meal_allowance: number
  fuel_allowance: number
  national_pension: number
  health_insurance: number
  employment_insurance: number
  long_term_care: number
  income_tax: number
  local_income_tax: number
  income_tax_settle: number
  local_tax_settle: number
  special_tax_settle: number
  work_days: number
  memo: string
  note: string
  status: 'draft' | 'final'
}

type LeaveUsage = {
  leave_type: string
  count: number
  dates: string[]
}

// ── 수정: SendStatus에 에러 메시지 포함 ──
type SendStatus = 'idle' | 'pending' | 'done' | { error: string }

// ── 유틸 ────────────────────────────────────────────────
function formatKRW(n: number) {
  if (n === 0) return '0'
  return n.toLocaleString('ko-KR')
}
function parseNum(v: string) { return parseInt(v.replace(/,/g, ''), 10) || 0 }

function fmtDate(d: string): string {
  const [, m, day] = d.split('-')
  return `${parseInt(m)}/${parseInt(day)}`
}

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)
const LEAVE_TYPE_LABEL: Record<string, string> = {
  annual: '연차', half_am: '반차(오전)', half_pm: '반차(오후)', sick: '병가', special: '경조사',
  ANNUAL: '연차', HALF_AM: '반차(오전)', HALF_PM: '반차(오후)', SICK: '병가', SPECIAL: '경조사',
  FRIDAY_OFF: '금요일휴무', REMOTE: '재택근무',
}
function leaveLabel(type: string) { return LEAVE_TYPE_LABEL[type] || LEAVE_TYPE_LABEL[type.toLowerCase()] || type }

function emptyRow(emp: Employee, year: number, month: number): PayrollRow {
  const pay_month = `${year}-${String(month).padStart(2, '0')}`
  return {
    employee_id: emp.id, employee_name: emp.name,
    pay_month, year, month,
    base_pay: 0, meal_pay: 0, fuel_pay: 0, bonus_pay: 0,
    other_allowances: [],
    meal_allowance: 0, fuel_allowance: 0,
    national_pension: 0, health_insurance: 0, employment_insurance: 0,
    long_term_care: 0, income_tax: 0, local_income_tax: 0,
    income_tax_settle: 0, local_tax_settle: 0, special_tax_settle: 0,
    work_days: 0, memo: '', note: '', status: 'draft',
  }
}

// OPIINET_PRICE는 DB에서 로드 — 폴백용 기본값만 유지
const DEFAULT_FUEL_PRICE: Record<string, number> = {
  '휘발유': 1650, '경유': 1480, 'LPG': 910, '전기': 0, '하이브리드': 1650, '없음': 0,
}
const DEFAULT_FUEL_EFFICIENCY: Record<string, number> = {
  '휘발유': 12, '경유': 14, 'LPG': 10, '전기': 0, '하이브리드': 18, '없음': 0,
}
const FUEL_TYPES_PRICED = ['휘발유', '경유', 'LPG', '하이브리드']

// ── 한국 공휴일 (2024~2027) ─────────────────────────────
const KR_HOLIDAYS: Set<string> = new Set([
  // 2024
  '2024-01-01','2024-02-09','2024-02-10','2024-02-11','2024-02-12',
  '2024-03-01','2024-04-10','2024-05-05','2024-05-06','2024-05-15',
  '2024-06-06','2024-08-15','2024-09-16','2024-09-17','2024-09-18',
  '2024-10-03','2024-10-09','2024-12-25',
  // 2025
  '2025-01-01','2025-01-28','2025-01-29','2025-01-30',
  '2025-03-01','2025-03-03','2025-05-05','2025-05-06',
  '2025-06-06','2025-08-15','2025-10-03','2025-10-05','2025-10-06','2025-10-07','2025-10-08','2025-10-09',
  '2025-12-25',
  // 2026
  '2026-01-01','2026-02-16','2026-02-17','2026-02-18','2026-02-19',
  '2026-03-01','2026-03-02','2026-05-05','2026-05-06','2026-05-25','2026-05-26',
  '2026-06-06','2026-08-17','2026-09-24','2026-09-25',
  '2026-10-09','2026-12-25',
  // 2027
  '2027-01-01','2027-02-08','2027-02-09','2027-02-10','2027-02-11',
  '2027-03-01','2027-05-05','2027-05-13',
  '2027-06-06','2027-06-07','2027-08-16',
  '2027-09-15','2027-09-16','2027-09-17',
  '2027-10-04','2027-10-09','2027-10-11','2027-12-25','2027-12-27',
])

// 해당 월의 실제 출근 가능일수 계산 (월~금, 공휴일 제외)
function calcWorkingDays(year: number, month: number): number {
  const daysInMonth = new Date(year, month, 0).getDate()
  let count = 0
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month - 1, d)
    const dow = date.getDay() // 0=일, 6=토
    if (dow === 0 || dow === 6) continue
    const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`
    if (KR_HOLIDAYS.has(dateStr)) continue
    count++
  }
  return count
}

// 10원 단위 올림
function ceil10(n: number): number {
  return Math.ceil(n / 10) * 10
}

// 유류지원비 상세 계산
type FuelCalcDetail = {
  dailyFuel: number        // 1일 유류비 (10원 올림 전)
  dailyFuelCeiled: number  // 1일 유류비 (10원 올림)
  workDays: number         // 실제출근일수 (연차 차감 후)
  annualDaysOff: number    // 연차 차감일수
  rawTotal: number         // 차감 전 총액
  capped: number           // 10만원 캡 적용
  final: number            // 최종 (수습 50% 반영)
  isTrial: boolean         // 수습 여부
  distKm: number
  efficiency: number
  pricePerL: number
  fuelType: string
}

function calcFuelPayDetail(
  emp: Employee,
  workDays: number,
  efficiency: number,
  priceMap: Record<string, number>,
  annualDaysOff: number,   // 연차 사용일수 (반차 제외)
  isTrial: boolean,
): FuelCalcDetail {
  const dist = emp.commute_distance || 0
  const fuelType = emp.fuel_type || '없음'
  const price = priceMap[fuelType] ?? DEFAULT_FUEL_PRICE[fuelType] ?? 0
  const effectiveWorkDays = Math.max(0, workDays - annualDaysOff)

  const dailyFuel = dist > 0 && price > 0 && efficiency > 0
    ? (dist * 2) / efficiency * price
    : 0
  const dailyFuelCeiled = ceil10(dailyFuel)
  const rawTotal = dailyFuelCeiled * effectiveWorkDays
  const capped = Math.min(rawTotal, 100000)
  const final = isTrial ? Math.floor(capped / 2 / 10) * 10 : capped

  return { dailyFuel, dailyFuelCeiled, workDays, annualDaysOff, rawTotal, capped, final, isTrial, distKm: dist, efficiency, pricePerL: price, fuelType }
}

function calcFuelPay(emp: Employee, workDays: number, efficiency: number, priceMap: Record<string, number>, annualDaysOff = 0, isTrial = false): number {
  return calcFuelPayDetail(emp, workDays, efficiency, priceMap, annualDaysOff, isTrial).final
}

function calcNet(row: PayrollRow) {
  const income = (row.base_pay||0) + (row.meal_pay||0) + (row.fuel_pay||0) + (row.bonus_pay||0)
    + (row.other_allowances||[]).reduce((s, a) => s + a.amount, 0)
  const deduction = (row.national_pension||0) + (row.health_insurance||0) + (row.employment_insurance||0)
    + (row.long_term_care||0) + (row.income_tax||0) + (row.local_income_tax||0)
    + (row.income_tax_settle||0) + (row.local_tax_settle||0) + (row.special_tax_settle||0)
  return income - deduction
}

// ── PDF 생성 (html2canvas + jsPDF) ──────────────────────
async function buildPDFBlob(html: string): Promise<Blob> {
  const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
    import('jspdf'),
    import('html2canvas'),
  ])
  const wrap = document.createElement('div')
  wrap.style.cssText = 'position:fixed;left:-9999px;top:0;width:794px;background:#fff;padding:32px;font-family:Malgun Gothic,맑은 고딕,sans-serif;font-size:11px;color:#000;line-height:1.5;'
  wrap.innerHTML = html
  document.body.appendChild(wrap)
  try {
    const canvas = await html2canvas(wrap, { scale: 1.5, useCORS: true, allowTaint: true, backgroundColor: '#fff' })
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const pw = pdf.internal.pageSize.getWidth()
    const ph = (canvas.height * pw) / canvas.width
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.85), 'JPEG', 0, 0, pw, ph)
    return pdf.output('blob')
  } finally {
    document.body.removeChild(wrap)
  }
}

// ── 명세서 HTML 생성 (PDF용) ─────────────────────────────
function buildSlipHTML(
  row: PayrollRow,
  emp: Employee | undefined,
  leaveUsages: LeaveUsage[],
  fuelDetail: FuelCalcDetail | null,
  fuelPriceMap: Record<string, number>,
): string {
  const net = calcNet(row)
  const totalIncome = (row.base_pay||0)+(row.meal_pay||0)+(row.fuel_pay||0)+(row.bonus_pay||0)+(row.other_allowances||[]).reduce((s,a)=>s+a.amount,0)
  const totalDeduction = (row.national_pension||0)+(row.health_insurance||0)+(row.employment_insurance||0)+(row.long_term_care||0)+(row.income_tax||0)+(row.local_income_tax||0)+(row.income_tax_settle||0)+(row.local_tax_settle||0)+(row.special_tax_settle||0)
  const hasSettle = row.income_tax_settle!==0||row.local_tax_settle!==0||row.special_tax_settle!==0
  const [py,pm] = (row.pay_month||'').split('-').map(Number)
  const periodEnd = `${py}.${String(pm).padStart(2,'0')}.${new Date(py,pm,0).getDate()}`
  const td = 'border:1px solid #999;padding:4px 6px;'
  const th = `${td}background:#f0f0f0;text-align:center;font-weight:bold;`
  const lbl = `${td}background:#f5f5f5;font-weight:600;width:120px;`
  const amt = `${td}text-align:right;`
  const sh = 'background:#222;color:#fff;padding:4px 8px;font-weight:bold;margin:10px 0 4px;font-size:11px;'
  function getPayDate(y:number,m:number){const nm=m===12?1:m+1,ny=m===12?y+1:y;let d=new Date(ny,nm-1,10);while(d.getDay()===0||d.getDay()===6)d.setDate(d.getDate()-1);return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
  const leaveRows = leaveUsages.length>0 ? leaveUsages.map(u=>{
    const sorted=[...u.dates].sort()
    const dateStr=sorted.map(fmtDate).join(' · ')
    return `<tr><td style="${lbl}">${leaveLabel(u.leave_type)}</td><td style="${amt}"><strong>${u.count}회</strong><span style="color:#666;font-size:10px;margin-left:8px;">(${dateStr})</span></td></tr>`
  }).join('') : `<tr><td colspan="2" style="${td}text-align:center;color:#888;">해당 월 연차·휴가 사용 내역 없음</td></tr>`

  // ── 유류지원비 계산내역 HTML ──
  const fuelSection = (()=>{
    if (!fuelDetail || fuelDetail.distKm === 0 || row.fuel_pay === 0) return ''
    const d = fuelDetail
    const cellStyle = `border:1px solid #e0c97a;padding:4px 8px;font-size:10px;`
    const labelStyle = `${cellStyle}background:#fffbeb;font-weight:600;width:140px;color:#78350f;`
    const valStyle = `${cellStyle}background:#fff;`
    const effectiveWorkDays = d.workDays - d.annualDaysOff
    let rows = `
<tr><td style="${labelStyle}">차량 / 유종</td><td style="${valStyle}">${emp?.car_type||'-'} / ${d.fuelType}</td></tr>
<tr><td style="${labelStyle}">편도 출퇴근 거리</td><td style="${valStyle}">${d.distKm} km (왕복 ${d.distKm*2} km)</td></tr>
<tr><td style="${labelStyle}">연비</td><td style="${valStyle}">${d.efficiency} km/L</td></tr>
<tr><td style="${labelStyle}">유종별 ℓ당 단가</td><td style="${valStyle}">${formatKRW(d.pricePerL)}원/L</td></tr>
<tr><td style="${labelStyle}">① 1일 유류비</td><td style="${valStyle}">왕복 ${d.distKm*2}km ÷ ${d.efficiency}km/L × ${formatKRW(d.pricePerL)}원 = ${formatKRW(Math.round(d.dailyFuel))}원 → <strong>10원 올림 = ${formatKRW(d.dailyFuelCeiled)}원</strong></td></tr>
<tr><td style="${labelStyle}">② 기준 출근일수</td><td style="${valStyle}">${d.workDays}일${d.annualDaysOff>0?` − 연차 ${d.annualDaysOff}일 = <strong>${effectiveWorkDays}일</strong>`:''}</td></tr>
<tr><td style="${labelStyle}">③ 월 유류비 합계</td><td style="${valStyle}">${formatKRW(d.dailyFuelCeiled)}원 × ${effectiveWorkDays}일 = <strong>${formatKRW(d.rawTotal)}원</strong></td></tr>`
    if (d.rawTotal > 100000) {
      rows += `<tr><td style="${labelStyle}">④ 한도 적용</td><td style="${valStyle}">월 최대 <strong>100,000원</strong> 한도 적용</td></tr>`
    }
    if (d.isTrial) {
      rows += `<tr><td style="${labelStyle}">⑤ 수습 50% 적용</td><td style="${valStyle}">${formatKRW(d.capped)}원 × 50% = <strong>${formatKRW(d.final)}원</strong></td></tr>`
    }
    rows += `<tr style="background:#fef9c3;font-weight:bold;"><td style="${labelStyle}font-size:11px;">최종 유류지원비</td><td style="${valStyle}font-size:12px;color:#b45309;font-weight:bold;">${formatKRW(row.fuel_pay)}원</td></tr>`
    return `<div style="margin-top:10px;">
<div style="${sh}">▶ 유류지원비 계산 내역</div>
<table style="width:100%;border-collapse:collapse;font-size:10px;"><tbody>${rows}</tbody></table>
</div>`
  })()

  const isResignedSlip = !!(emp?.resign_date)
  const lastWorkDaySlip = isResignedSlip && emp?.resign_date
    ? (()=>{ const d=new Date(emp!.resign_date!); d.setDate(d.getDate()-1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` })()
    : null

  return `<div style="text-align:center;font-size:18px;font-weight:bold;margin-bottom:14px;">${row.pay_month} (주)보누스메이트 급여명세서</div>
${isResignedSlip?`<div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:4px;padding:5px 10px;margin-bottom:6px;font-size:11px;color:#b91c1c;font-weight:bold;">⚠ 퇴사자 급여명세서 · 마지막 근무일: ${lastWorkDaySlip}</div>`:''}
<table style="width:100%;border-collapse:collapse;margin-bottom:8px;font-size:11px;"><tbody>
<tr><th style="${lbl}">근무기간</th><td colspan="3" style="${td}">${py}.${String(pm).padStart(2,'0')}.01 ~ ${periodEnd}</td></tr>
<tr><th style="${lbl}">성명</th><td style="${td}">${row.employee_name}</td><th style="${lbl}">사번</th><td style="${td}">${emp?.employee_code||''}</td></tr>
<tr><th style="${lbl}">직위</th><td style="${td}">${emp?.position||''}</td><th style="${lbl}">입사일</th><td style="${td}">${emp?.hire_date||''}</td></tr>
<tr><th style="${lbl}">급여지급일</th><td style="${td}">${getPayDate(py,pm)}</td><th style="${lbl}">${isResignedSlip?'퇴사일(마지막근무일)':'급여계좌'}</th><td style="${td}">${isResignedSlip?`<span style="color:#b91c1c;font-weight:bold;">${lastWorkDaySlip}</span>`:emp?.bank_name?`[${emp.bank_name}] ${emp.bank_account||''}`:'-'}</td></tr>
${isResignedSlip?`<tr><th style="${lbl}">급여계좌</th><td colspan="3" style="${td}">${emp?.bank_name?`[${emp.bank_name}] ${emp.bank_account||''}`:'-'}</td></tr>`:''}
</tbody></table>
<table style="width:100%;border-collapse:collapse;margin-bottom:8px;font-size:11px;"><tbody>
<tr><th style="${lbl}">소득합계</th><td style="${amt}width:18%">${formatKRW(totalIncome)}</td><th style="${lbl}">공제합계</th><td style="${amt}width:18%">${totalDeduction<0?'+':'-'}${formatKRW(Math.abs(totalDeduction))}</td><th style="background:#1a3a6b;color:#fff;width:90px;padding:4px 6px;border:1px solid #999;">실수령액</th><td style="${amt}width:18%;background:#e8f0fe;font-weight:bold;font-size:13px;">${formatKRW(net)}</td></tr>
</tbody></table>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
<div><div style="${sh}">▶ 소득 세부내역</div><table style="width:100%;border-collapse:collapse;font-size:11px;"><thead><tr><th style="${th}">항목</th><th style="${th}">금액</th></tr></thead><tbody>
<tr><td style="${lbl}">기본급</td><td style="${amt}">${formatKRW(row.base_pay||0)}</td></tr>
<tr><td style="${lbl}">식대</td><td style="${amt}">${formatKRW(row.meal_pay||0)}</td></tr>
<tr><td style="${lbl}">유류지원비</td><td style="${amt}">${formatKRW(row.fuel_pay||0)}</td></tr>
<tr><td style="${lbl}">상여금</td><td style="${amt}">${formatKRW(row.bonus_pay||0)}</td></tr>
${(row.other_allowances||[]).map(a=>`<tr><td style="${lbl}">${a.label||'기타'}</td><td style="${amt}">${formatKRW(a.amount)}</td></tr>`).join('')}
<tr style="background:#e8f0fe;font-weight:bold;"><td style="${lbl}">소득합계</td><td style="${amt}">${formatKRW(totalIncome)}</td></tr>
</tbody></table></div>
<div><div style="${sh}">▶ 공제 세부내역</div><table style="width:100%;border-collapse:collapse;font-size:11px;"><thead><tr><th style="${th}">항목</th><th style="${th}">금액</th></tr></thead><tbody>
<tr><td style="${lbl}">국민연금</td><td style="${amt}">${formatKRW(row.national_pension||0)}</td></tr>
<tr><td style="${lbl}">건강보험</td><td style="${amt}">${formatKRW(row.health_insurance||0)}</td></tr>
<tr><td style="${lbl}">고용보험</td><td style="${amt}">${formatKRW(row.employment_insurance||0)}</td></tr>
<tr><td style="${lbl}">장기요양보험료</td><td style="${amt}">${formatKRW(row.long_term_care||0)}</td></tr>
<tr><td style="${lbl}">소득세</td><td style="${amt}">${formatKRW(row.income_tax||0)}</td></tr>
<tr><td style="${lbl}">지방소득세</td><td style="${amt}">${formatKRW(row.local_income_tax||0)}</td></tr>
${hasSettle?`<tr style="background:#fffbeb;"><td style="${td}font-weight:bold;color:#92400e;" colspan="2">◆ 연말정산</td></tr>${row.income_tax_settle!==0?`<tr><td style="${lbl}">연말정산소득세</td><td style="${amt}">${formatKRW(row.income_tax_settle)}</td></tr>`:''} ${row.local_tax_settle!==0?`<tr><td style="${lbl}">연말정산지방소득세</td><td style="${amt}">${formatKRW(row.local_tax_settle)}</td></tr>`:''} ${row.special_tax_settle!==0?`<tr><td style="${lbl}">연말정산농특세</td><td style="${amt}">${formatKRW(row.special_tax_settle)}</td></tr>`:''}`:''} 
<tr style="background:#fee2e2;font-weight:bold;"><td style="${lbl}">공제합계</td><td style="${amt}">${totalDeduction<0?'+':'-'}${formatKRW(Math.abs(totalDeduction))}</td></tr>
</tbody></table></div></div>
${fuelSection}
<div style="margin-top:10px;"><div style="${sh}">▶ ${row.pay_month} 연차·휴가 사용 내역</div>
<table style="width:100%;border-collapse:collapse;font-size:11px;"><thead><tr><th style="${th}width:160px">구분</th><th style="${th}">사용 횟수 및 날짜</th></tr></thead><tbody>${leaveRows}</tbody></table></div>
${row.memo?`<div style="margin-top:8px;"><div style="${sh}">▶ 메모</div><div style="border:1px solid #999;padding:6px 8px;min-height:28px;white-space:pre-wrap;">${row.memo}</div></div>`:''}
<div style="margin-top:8px;"><div style="${sh}">▶ 항목별 산출식 (참고)</div><div style="border:1px solid #ccc;padding:6px 8px;font-size:9px;line-height:1.6;background:#fafafa;">
*시급 계산 = 기본급 ÷ 209시간<br>*일급 계산(8시간 기준) = 시급 × 8시간<br>*연장근로수당(1일 8시간 초과 근로) = 연장근로시간 × 시급 × 1.5<br>*야간근로수당(밤 10시~새벽 6시 근로) = 야간근로시간 × 시급 × 0.5배 가산<br>*연장근로와 야간근로가 겹칠 경우 = 겹치는 근로시간 × 시급 × 2.0<br>*휴일근로수당 = 휴일근로시간 × 시급 × 1.5<br>*주휴수당(정상) = 출근예정일만 받을 수 있기 때문에 다음주에도 계속 출근예정이어야만 지급 가능<br>*유류비 = 출근일수 × 1일 유류비(최대 10만원)${row.note?`<br>*비고: ${row.note}`:''}
</div></div>
<div style="margin-top:14px;text-align:center;font-size:12px;font-weight:bold;">${row.employee_name} 님의 노고에 감사 드립니다.</div>`
}

// ── 메인 컴포넌트 ────────────────────────────────────────
export default function PayrollPage() {
  const supabase = createClient()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [rows, setRows] = useState<PayrollRow[]>([])
  const [savedRows, setSavedRows] = useState<PayrollRow[]>([])
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1)
  const [loading, setLoading] = useState(false)
  const [fetchLoading, setFetchLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [tab, setTab] = useState<'input' | 'history'>('input')
  const [historyYear, setHistoryYear] = useState(new Date().getFullYear())
  const [expandedRow, setExpandedRow] = useState<string | null>(null)
  const [printTarget, setPrintTarget] = useState<PayrollRow | null>(null)
  const [leaveUsage, setLeaveUsage] = useState<Record<string, LeaveUsage[]>>({})
  const [empMap, setEmpMap] = useState<Record<string, Employee>>({})
  const [settleModal, setSettleModal] = useState<{ empId: string; idx: number } | null>(null)
  const [fuelEfficiency, setFuelEfficiency] = useState<Record<string, number>>({})
  const [fuelPriceMap, setFuelPriceMap] = useState<Record<string, number>>({...DEFAULT_FUEL_PRICE})
  const [fuelPriceSaving, setFuelPriceSaving] = useState(false)
  const [fuelPriceEdit, setFuelPriceEdit] = useState<Record<string, number>>({})
  const [showFuelPanel, setShowFuelPanel] = useState(false)
  // 월별 기준 출근일수 (전체 공통)
  const [monthWorkDays, setMonthWorkDays] = useState<number>(0)       // 현재 적용 중인 값
  const [monthWorkDaysEdit, setMonthWorkDaysEdit] = useState<number>(0) // 편집 중인 값
  const [showWorkDaysPanel, setShowWorkDaysPanel] = useState(false)
  const [workDaysSaving, setWorkDaysSaving] = useState(false)
  const [settleDraft, setSettleDraft] = useState({ income_tax_settle: 0, local_tax_settle: 0, special_tax_settle: 0 })
  const printRef = useRef<HTMLDivElement>(null)
  const years = [new Date().getFullYear(), new Date().getFullYear() - 1, new Date().getFullYear() - 2]

  const [emailModal, setEmailModal] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [sendStatus, setSendStatus] = useState<Record<string, SendStatus>>({})
  const [isSending, setIsSending] = useState(false)
  const [sendProgress, setSendProgress] = useState({ done: 0, total: 0 })

  useEffect(() => { fetchEmployees(); fetchFuelPrices() }, [selectedYear, selectedMonth])
  useEffect(() => { if (employees.length > 0) { fetchPayrollForMonth(); fetchLeaveUsage() } fetchFuelPrices(selectedYear); fetchWorkDays(selectedYear, selectedMonth) }, [selectedYear, selectedMonth, employees])
  useEffect(() => { if (tab === 'history') fetchHistory() }, [tab, historyYear])

  async function fetchEmployees() {
    // 해당 월 1일 기준: resign_date가 없거나, resign_date > 해당월 1일 (= 해당 월에 하루라도 근무)
    // resign_date는 "마지막 근무일 다음날"이므로, 2월1일까지 근무 → resign_date = 2026-02-02
    // → 2월에 포함 조건: resign_date > "2026-02-01" (즉 2월2일 이후 퇴사일)
    const monthStart = `${selectedYear}-${String(selectedMonth).padStart(2,'0')}-01`
    const { data } = await supabase
      .from('employees')
      .select('id, name, position, employee_code, hire_date, resign_date, email, bank_name, bank_account, car_type, fuel_type, commute_distance, fuel_efficiency, auth_user_id')
      .or(`resign_date.is.null,resign_date.gt.${monthStart}`)
      .order('name')
    const emps = data || []
    setEmployees(emps)
    const map: Record<string, Employee> = {}
    const effMap: Record<string, number> = {}
    emps.forEach((e: Employee) => {
      map[e.id] = e
      effMap[e.id] = e.fuel_efficiency ?? DEFAULT_FUEL_EFFICIENCY[e.fuel_type || '없음'] ?? 12
    })
    setEmpMap(map)
    setFuelEfficiency(effMap)
  }

  async function fetchFuelPrices(year?: number) {
    const y = year || selectedYear
    const { data } = await supabase.from('fuel_price_settings').select('fuel_type, price_per_liter').eq('year', y)
    if (data && data.length > 0) {
      const map: Record<string, number> = { ...DEFAULT_FUEL_PRICE }
      data.forEach((r: { fuel_type: string; price_per_liter: number }) => { map[r.fuel_type] = r.price_per_liter })
      setFuelPriceMap(map)
      setFuelPriceEdit(map)
    } else {
      setFuelPriceMap({ ...DEFAULT_FUEL_PRICE })
      setFuelPriceEdit({ ...DEFAULT_FUEL_PRICE })
    }
  }

  async function saveFuelPrices() {
    setFuelPriceSaving(true)
    const upserts = FUEL_TYPES_PRICED.map(ft => ({
      year: selectedYear,
      fuel_type: ft,
      price_per_liter: fuelPriceEdit[ft] || 0,
    }))
    const { error } = await supabase.from('fuel_price_settings').upsert(upserts, { onConflict: 'year,fuel_type' })
    if (!error) {
      const map = { ...fuelPriceMap, ...Object.fromEntries(FUEL_TYPES_PRICED.map(ft => [ft, fuelPriceEdit[ft] || 0])) }
      setFuelPriceMap(map)
      setSuccess('유가 설정이 저장되었습니다.')
      setShowFuelPanel(false)
    } else {
      setError('유가 저장 실패: ' + error.message)
    }
    setFuelPriceSaving(false)
  }

  async function saveWorkDays() {
    setWorkDaysSaving(true)
    const pay_month = `${selectedYear}-${String(selectedMonth).padStart(2,'0')}`
    // work_days_settings 테이블에 upsert (없으면 fuel_price_settings 처럼 별도 테이블 or payroll_settings)
    const { error } = await supabase.from('payroll_month_settings').upsert(
      { pay_month, work_days: monthWorkDaysEdit },
      { onConflict: 'pay_month' }
    )
    if (!error) {
      setMonthWorkDays(monthWorkDaysEdit)
      // 모든 rows의 work_days를 공통값으로 일괄 업데이트
      setRows(prev => prev.map(r => ({ ...r, work_days: monthWorkDaysEdit })))
      setSuccess(`${selectedYear}년 ${selectedMonth}월 기준 출근일수 ${monthWorkDaysEdit}일이 저장되었습니다.`)
      setShowWorkDaysPanel(false)
    } else {
      setError('출근일수 저장 실패: ' + error.message)
    }
    setWorkDaysSaving(false)
  }

  async function fetchWorkDays(year: number, month: number) {
    const pay_month = `${year}-${String(month).padStart(2,'0')}`
    const { data } = await supabase.from('payroll_month_settings').select('work_days').eq('pay_month', pay_month).maybeSingle()
    const days = data?.work_days ?? 0
    setMonthWorkDays(days)
    setMonthWorkDaysEdit(days)
    // rows가 이미 로드된 경우 work_days 동기화
    if (days > 0) {
      setRows(prev => prev.map(r => r.work_days === 0 ? { ...r, work_days: days } : r))
    }
  }


  async function fetchLeaveUsage() {
    const firstDay = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`
    const lastDay = new Date(selectedYear, selectedMonth, 0).toISOString().slice(0, 10)
    const { data } = await supabase
      .from('leave_requests')
      .select('user_id, leave_type, leave_date')
      .gte('leave_date', firstDay)
      .lte('leave_date', lastDay)

    const authToEmpId: Record<string, string> = {}
    for (const emp of employees) {
      if (emp.auth_user_id) authToEmpId[emp.auth_user_id] = emp.id
    }

    const usage: Record<string, LeaveUsage[]> = {}
    for (const r of (data || [])) {
      const empId = authToEmpId[r.user_id]
      if (!empId) continue
      if (!usage[empId]) usage[empId] = []
      const existing = usage[empId].find(u => u.leave_type === r.leave_type)
      if (existing) {
        existing.count++
        existing.dates.push(r.leave_date)
      } else {
        usage[empId].push({ leave_type: r.leave_type, count: 1, dates: [r.leave_date] })
      }
    }
    setLeaveUsage(usage)
  }

  async function fetchPayrollForMonth() {
    setFetchLoading(true)
    const pay_month = `${selectedYear}-${String(selectedMonth).padStart(2,'0')}`
    // 급여 데이터 + 월 공통 출근일수 병렬 로드
    const [{ data: existing }, { data: mwdData }] = await Promise.all([
      supabase.from('payroll_draft').select('*').eq('pay_month', pay_month),
      supabase.from('payroll_month_settings').select('work_days').eq('pay_month', pay_month).maybeSingle(),
    ])
    const savedWorkDays = mwdData?.work_days ?? 0
    setMonthWorkDays(savedWorkDays)
    setMonthWorkDaysEdit(savedWorkDays)

    const existingMap = new Map((existing || []).map((r: PayrollRow) => [r.employee_id, r]))
    const newRows: PayrollRow[] = employees.map((emp) => {
      const ex = existingMap.get(emp.id)
      if (ex) {
        const [y, m] = (ex.pay_month || '').split('-').map(Number)
        // 저장된 work_days가 0이면 월 공통값으로 채움
        const wd = ex.work_days > 0 ? ex.work_days : savedWorkDays
        return { ...emptyRow(emp, selectedYear, selectedMonth), ...ex, work_days: wd, year: y||selectedYear, month: m||selectedMonth, other_allowances: ex.other_allowances || [] }
      }
      // 신규 row: 월 공통 출근일수 적용
      return { ...emptyRow(emp, selectedYear, selectedMonth), work_days: savedWorkDays }
    })
    setRows(newRows)
    setFetchLoading(false)
  }

  async function fetchHistory() {
    setFetchLoading(true)
    const { data } = await supabase.from('payroll_draft').select('*').like('pay_month', `${historyYear}-%`).order('pay_month').order('employee_name')
    setSavedRows((data || []).map((r: PayrollRow) => ({ ...r, other_allowances: r.other_allowances || [] })))
    setFetchLoading(false)
  }

  async function copyFromLastMonth() {
    const lastMonth = selectedMonth === 1 ? 12 : selectedMonth - 1
    const lastYear = selectedMonth === 1 ? selectedYear - 1 : selectedYear
    const pay_month = `${lastYear}-${String(lastMonth).padStart(2, '0')}`
  
    if (!confirm(`${lastYear}년 ${lastMonth}월 데이터를 ${selectedYear}년 ${selectedMonth}월로 복사할까요?\n(현재 입력된 내용은 덮어씌워집니다)`)) return
  
    setFetchLoading(true)
    const { data, error } = await supabase
      .from('payroll_draft')
      .select('*')
      .eq('pay_month', pay_month)
  
    if (error || !data || data.length === 0) {
      setError(`${lastYear}년 ${lastMonth}월 데이터가 없습니다.`)
      setFetchLoading(false)
      return
    }
  
    const lastMap = new Map(data.map((r: PayrollRow) => [r.employee_id, r]))
    const newRows: PayrollRow[] = employees.map((emp) => {
      const last = lastMap.get(emp.id)
      if (last) {
        return {
          ...last,
          id: undefined,            // 새 row로 insert되도록 id 제거
          pay_month: `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`,
          year: selectedYear,
          month: selectedMonth,
          status: 'draft' as const,
          fuel_pay: 0,              // 유류지원비 — 출근일수·연차에 따라 매달 달라짐
          work_days: monthWorkDays, // 이번달 공통 출근일수로 초기화
          bonus_pay: 0,             // 상여금 — 매달 달라짐
          income_tax_settle: 0,     // 연말정산
          local_tax_settle: 0,
          special_tax_settle: 0,
          memo: '',
        }
      }
      // 지난달에 없는 신규 직원은 빈 row
      return { ...emptyRow(emp, selectedYear, selectedMonth), work_days: monthWorkDays }
    })
  
    setRows(newRows)
    setSuccess(`${lastYear}년 ${lastMonth}월 데이터를 불러왔습니다. 유류지원비·상여금을 확인 후 저장하세요.`)
    setFetchLoading(false)
  }

  function updateRow(idx: number, fields: Partial<PayrollRow>) {
    setRows(prev => { const next = [...prev]; next[idx] = { ...next[idx], ...fields }; return next })
  }

  function handleFieldChange(idx: number, field: keyof PayrollRow, value: string) {
    const numFields = ['base_pay','meal_pay','fuel_pay','bonus_pay','meal_allowance','fuel_allowance','national_pension','health_insurance','employment_insurance','long_term_care','income_tax','local_income_tax','income_tax_settle','local_tax_settle','special_tax_settle']
    if (numFields.includes(field)) updateRow(idx, { [field]: parseNum(value) } as Partial<PayrollRow>)
    else updateRow(idx, { [field]: value } as Partial<PayrollRow>)
  }

  function addOtherAllowance(idx: number) { updateRow(idx, { other_allowances: [...rows[idx].other_allowances, { label: '', amount: 0 }] }) }
  function updateOtherAllowance(idx: number, aIdx: number, field: 'label' | 'amount', value: string) {
    updateRow(idx, { other_allowances: rows[idx].other_allowances.map((a, i) => i === aIdx ? { ...a, [field]: field==='amount'?parseNum(value):value } : a) })
  }
  function removeOtherAllowance(idx: number, aIdx: number) { updateRow(idx, { other_allowances: rows[idx].other_allowances.filter((_, i) => i !== aIdx) }) }

  function buildPayload(row: PayrollRow) {
    return { employee_id: row.employee_id, employee_name: row.employee_name, pay_month: row.pay_month, base_pay: row.base_pay, meal_pay: row.meal_pay, fuel_pay: row.fuel_pay, bonus_pay: row.bonus_pay, other_allowances: row.other_allowances, meal_allowance: row.meal_allowance, fuel_allowance: row.fuel_allowance, national_pension: row.national_pension, health_insurance: row.health_insurance, employment_insurance: row.employment_insurance, long_term_care: row.long_term_care, income_tax: row.income_tax, local_income_tax: row.local_income_tax, income_tax_settle: row.income_tax_settle, local_tax_settle: row.local_tax_settle, special_tax_settle: row.special_tax_settle, work_days: row.work_days||0, memo: row.memo||null, status: row.status }
  }

  async function handleSaveDraft() {
    setLoading(true); setError(''); setSuccess('')
    try {
      const updatedRows = [...rows]
      for (let i = 0; i < updatedRows.length; i++) {
        const row = updatedRows[i]
        const payload = { ...buildPayload(row), status: row.status }
        const { data, error } = await supabase
        .from('payroll_draft')
        .upsert([payload], { onConflict: 'employee_id,pay_month' })
        .select()
        .single()
      
      if (error) throw new Error(`${row.employee_name} 저장 실패: ${error.message}`)
      if (data) updatedRows[i] = { ...row, id: data.id }
      }
      setRows(updatedRows)
      if (updatedRows.some(r => r.status === 'final')) {
        const finalPayloads = updatedRows.filter(r => r.status === 'final').map(r => ({ ...buildPayload(r), status: 'final' }))
        await supabase.from('payroll_final').upsert(finalPayloads, { onConflict: 'employee_id,pay_month' })
      }
      setSuccess('저장 완료되었습니다.')
      fetchPayrollForMonth()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '저장 중 오류가 발생했습니다.')
    }
    setLoading(false)
  }

  async function handleUnfinalize() {
    if (!confirm(`${selectedYear}년 ${selectedMonth}월 최종 확정을 해제하고 수정 모드로 전환하시겠습니까?`)) return
    setLoading(true)
    await supabase.from('payroll_draft').update({ status: 'draft' }).eq('pay_month', `${selectedYear}-${String(selectedMonth).padStart(2,'0')}`)
    setSuccess('수정 모드로 전환되었습니다. 수정 후 다시 최종 확정하세요.')
    fetchPayrollForMonth(); setLoading(false)
  }

  async function handleFinalize() {
    if (!confirm(`${selectedYear}년 ${selectedMonth}월 급여를 최종 확정하시겠습니까?`)) return
    setLoading(true); setError('')
    await handleSaveDraft()
    const finalPayloads = rows.map(row => ({ ...buildPayload(row), status: 'final' }))
    const { error: finalError } = await supabase.from('payroll_final').upsert(finalPayloads, { onConflict: 'employee_id,pay_month' })
    if (finalError) { setError('최종 확정 실패: ' + finalError.message) }
    else {
      await supabase.from('payroll_draft').update({ status: 'final' }).eq('pay_month', `${selectedYear}-${String(selectedMonth).padStart(2,'0')}`)
      setSuccess(`${selectedYear}년 ${selectedMonth}월 급여가 최종 확정되었습니다!`)
      fetchPayrollForMonth()
    }
    setLoading(false)
  }

  const [printFuelDetail, setPrintFuelDetail] = useState<FuelCalcDetail | null>(null)

  function handlePrint(row: PayrollRow, mode: 'print' | 'pdf' = 'print') {
    // 인쇄 시 해당 직원의 유류비 상세 계산
    const emp = empMap[row.employee_id]
    const annualDaysOff = (leaveUsage[row.employee_id]||[]).filter(u=>u.leave_type==='annual'||u.leave_type==='ANNUAL').reduce((s,u)=>s+u.count,0)
    const isTrial = emp?.position==='수습'
    const eff = fuelEfficiency[row.employee_id] || DEFAULT_FUEL_EFFICIENCY[emp?.fuel_type||'없음'] || 12
    const fd = emp ? calcFuelPayDetail(emp, row.work_days||0, eff, fuelPriceMap, annualDaysOff, isTrial) : null
    setPrintFuelDetail(fd)
    setPrintTarget(row)
    setTimeout(() => {
      if (mode === 'pdf') { const orig = document.title; document.title = `${row.pay_month}_${row.employee_name}_급여명세서`; window.print(); setTimeout(() => { document.title = orig }, 1000) }
      else window.print()
    }, 300)
  }

  function applySettle() {
    if (!settleModal) return
    updateRow(settleModal.idx, { income_tax_settle: settleDraft.income_tax_settle, local_tax_settle: settleDraft.local_tax_settle, special_tax_settle: settleDraft.special_tax_settle })
    setSettleModal(null)
  }

  function openEmailModal() {
    setSelectedIds(new Set(employees.filter(e => e.email).map(e => e.id)))
    setSendStatus({}); setSendProgress({ done: 0, total: 0 }); setEmailModal(true)
  }

  function toggleSelectAll() {
    const withEmail = employees.filter(e => e.email).map(e => e.id)
    setSelectedIds(selectedIds.size === withEmail.length ? new Set() : new Set(withEmail))
  }

  async function handleSendEmails() {
    const targets = employees.filter(e => selectedIds.has(e.id) && e.email)
    if (!targets.length) return
    setIsSending(true); setSendProgress({ done: 0, total: targets.length })
    const initStatus: Record<string, SendStatus> = {}
    targets.forEach(e => { initStatus[e.id] = 'pending' })
    setSendStatus(initStatus)

    for (let i = 0; i < targets.length; i++) {
      const emp = targets[i]
      const row = rows.find(r => r.employee_id === emp.id)
      if (!row) {
        setSendStatus(p => ({ ...p, [emp.id]: { error: '급여 데이터 없음' } }))
        setSendProgress(p => ({ ...p, done: i+1 }))
        continue
      }

      try {
        const empFull = empMap[emp.id]
        const annualDaysOff = (leaveUsage[emp.id]||[]).filter(u=>u.leave_type==='annual'||u.leave_type==='ANNUAL').reduce((s,u)=>s+u.count,0)
        const isTrial = empFull?.position==='수습'
        const eff = fuelEfficiency[emp.id] || DEFAULT_FUEL_EFFICIENCY[empFull?.fuel_type||'없음'] || 12
        const fd = empFull ? calcFuelPayDetail(empFull, row.work_days||0, eff, fuelPriceMap, annualDaysOff, isTrial) : null
        const html = buildSlipHTML(row, emp, leaveUsage[emp.id] || [], fd, fuelPriceMap)
        const blob = await buildPDFBlob(html)
        const buf = await blob.arrayBuffer()
        const bytes = new Uint8Array(buf)
        let bin = ''; bytes.forEach(b => { bin += String.fromCharCode(b) })
        const b64 = btoa(bin)

        const res = await fetch('/api/send-payroll-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: emp.email,
            employeeName: emp.name,
            payMonth: row.pay_month,
            pdfBase64: b64,
            filename: `급여명세서_${row.pay_month}_${emp.name}.pdf`,
          }),
        })
        const json = await res.json()
        // ── 수정: 에러 메시지 저장 ──
        setSendStatus(p => ({ ...p, [emp.id]: json.ok ? 'done' : { error: json.error || '발송 실패' } }))
      } catch (err) {
        // ── 수정: 네트워크 에러 메시지 저장 ──
        setSendStatus(p => ({ ...p, [emp.id]: { error: err instanceof Error ? err.message : '네트워크 오류' } }))
      }
      setSendProgress(p => ({ ...p, done: i + 1 }))
    }
    setIsSending(false)
  }

  const totalBase = rows.reduce((s, r) => s + (r.base_pay||0), 0)
  const totalNet = rows.reduce((s, r) => s + calcNet(r), 0)
  const isFinalized = rows.length > 0 && rows.every(r => r.status === 'final')

  // ── 수정: 에러 카운트 헬퍼 ──
  const errorCount = Object.values(sendStatus).filter(s => typeof s === 'object').length
  const doneCount = Object.values(sendStatus).filter(s => s === 'done').length

  return (
    <div className="min-h-screen bg-gray-50 print:bg-white">
      {printTarget && <PrintSlip row={printTarget} emp={empMap[printTarget.employee_id]} leaveUsage={leaveUsage[printTarget.employee_id] || []} fuelDetail={printFuelDetail} ref={printRef} />}

      {/* 연말정산 모달 */}
      {settleModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-100">
              <h3 className="text-base font-bold text-gray-900">🧾 연말정산 입력</h3>
              <p className="text-xs text-gray-500 mt-0.5">해당 연도 정산 시에만 입력하세요. 환급이면 음수(-) 입력.</p>
            </div>
            <div className="px-6 py-5 space-y-4">
              {([['income_tax_settle','연말정산 소득세'],['local_tax_settle','연말정산 지방소득세'],['special_tax_settle','연말정산 농특세']] as const).map(([field,label]) => (
                <div key={field} className="flex items-center gap-3">
                  <label className="w-36 text-sm text-gray-700 shrink-0 font-medium">{label}</label>
                  <input type="number" value={settleDraft[field]||''} onChange={e=>setSettleDraft(p=>({...p,[field]:parseInt(e.target.value)||0}))} placeholder="0 (환급은 음수 입력)"
                    className="flex-1 text-right border border-amber-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-amber-50" />
                  <span className="text-xs text-gray-400">원</span>
                </div>
              ))}
              <p className="text-xs text-gray-400 bg-gray-50 rounded-lg p-3">💡 환급 받는 경우 음수(-) 값으로 입력하면 실지급액이 증가합니다.</p>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex gap-3 justify-end">
              <button onClick={()=>setSettleModal(null)} className="border border-gray-300 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-50">취소</button>
              <button onClick={applySettle} className="bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium px-5 py-2 rounded-lg">적용</button>
            </div>
          </div>
        </div>
      )}

      {/* 이메일 발송 모달 */}
      {emailModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-gray-900">📧 급여명세서 이메일 발송</h3>
                <p className="text-xs text-gray-500 mt-0.5">{selectedYear}년 {selectedMonth}월 · PDF 첨부 발송</p>
              </div>
              {!isSending && <button onClick={()=>setEmailModal(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>}
            </div>
            <div className="px-6 py-4">
              <div className="flex items-center justify-between mb-3">
                <button onClick={toggleSelectAll} className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                  {selectedIds.size===employees.filter(e=>e.email).length?'전체 해제':'전체 선택'}
                </button>
                <span className="text-xs text-gray-400">{selectedIds.size}명 선택 / 이메일 등록 {employees.filter(e=>e.email).length}명</span>
              </div>
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {employees.map(emp => {
                  const status = sendStatus[emp.id]
                  const hasEmail = !!emp.email
                  const isChecked = selectedIds.has(emp.id)
                  const row = rows.find(r => r.employee_id === emp.id)
                  const net = row ? calcNet(row) : 0
                  const isError = status && typeof status === 'object'
                  return (
                    <div key={emp.id} className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${isChecked&&hasEmail?'border-blue-200 bg-blue-50':'border-gray-200 bg-gray-50'} ${!hasEmail?'opacity-50':''}`}>
                      <input type="checkbox" checked={isChecked} disabled={!hasEmail||isSending}
                        onChange={e=>{const n=new Set(selectedIds);e.target.checked?n.add(emp.id):n.delete(emp.id);setSelectedIds(n)}}
                        className="w-4 h-4 accent-blue-600 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-gray-900">{emp.name}</span>
                          {!hasEmail&&<span className="text-[10px] text-red-500 bg-red-100 px-1.5 py-0.5 rounded">이메일 없음</span>}
                        </div>
                        <div className="text-xs text-gray-400 truncate">{emp.email||'이메일 미등록'}</div>
                        {row&&<div className="text-xs text-blue-600 font-medium">실지급 {formatKRW(net)}원</div>}
                        {/* ── 수정: 에러 메시지 표시 ── */}
                        {isError && (
                          <div className="text-xs text-red-500 mt-0.5">⚠️ {(status as { error: string }).error}</div>
                        )}
                      </div>
                      <div className="shrink-0 w-16 text-right">
                        {status==='pending'&&<span className="text-xs text-blue-500 animate-pulse">발송중...</span>}
                        {status==='done'&&<span className="text-xs text-emerald-600 font-bold">✓ 완료</span>}
                        {isError&&<span className="text-xs text-red-500 font-bold">✕ 실패</span>}
                      </div>
                    </div>
                  )
                })}
              </div>

              {isSending&&(
                <div className="mt-4">
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>PDF 생성 및 발송 중...</span>
                    <span>{sendProgress.done} / {sendProgress.total}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-blue-500 h-2 rounded-full transition-all duration-300" style={{width:`${sendProgress.total>0?(sendProgress.done/sendProgress.total)*100:0}%`}} />
                  </div>
                </div>
              )}

              {/* ── 수정: 성공/실패 카운트 (안내문구 제거) ── */}
              {!isSending&&Object.keys(sendStatus).length>0&&(
                <div className="mt-3 flex gap-4 text-sm justify-center">
                  <span className="text-emerald-600 font-medium">✓ 성공 {doneCount}건</span>
                  {errorCount > 0 && (
                    <span className="text-red-500 font-medium">✕ 실패 {errorCount}건</span>
                  )}
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex gap-3 justify-end">
              {!isSending&&<button onClick={()=>setEmailModal(false)} className="border border-gray-300 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-50">닫기</button>}
              <button onClick={handleSendEmails} disabled={isSending||selectedIds.size===0}
                className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2 rounded-lg flex items-center gap-2">
                {isSending?<><span className="inline-block animate-spin">⏳</span>발송 중...</>:<>📧 {selectedIds.size}명에게 PDF 발송</>}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="print:hidden">
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="max-w-7xl mx-auto">
            <h1 className="text-xl font-bold text-gray-900">급여명세서 입력</h1>
            <p className="text-xs text-gray-500 mt-0.5">관리자 전용 · payroll_draft → payroll_final 확정</p>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-6 py-6 space-y-5">
          {error&&<div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex justify-between">{error}<button onClick={()=>setError('')}>✕</button></div>}
          {success&&<div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm flex justify-between">{success}<button onClick={()=>setSuccess('')}>✕</button></div>}

          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div className="flex border-b border-gray-200">
              {(['input','history'] as const).map(t=>(
                <button key={t} onClick={()=>setTab(t)} className={`flex-1 py-3 text-sm font-medium transition-colors ${tab===t?'bg-blue-50 text-blue-600 border-b-2 border-blue-600':'text-gray-500 hover:bg-gray-50'}`}>
                  {t==='input'?'✏️ 급여 입력':'📊 급여 이력'}
                </button>
              ))}
            </div>

            {tab==='input'?(
              <div>
                <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-4 flex-wrap">
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-gray-700">연도</label>
                    <select value={selectedYear} onChange={e=>setSelectedYear(Number(e.target.value))} className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                      {years.map(y=><option key={y} value={y}>{y}년</option>)}
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-gray-700">월</label>
                    <select value={selectedMonth} onChange={e=>setSelectedMonth(Number(e.target.value))} className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                      {MONTHS.map(m=><option key={m} value={m}>{m}월</option>)}
                    </select>
                  </div>
                  {isFinalized && <span className="bg-green-100 text-green-700 text-xs font-medium px-2.5 py-1 rounded-full">✓ 최종 확정됨</span>}
{!isFinalized && (
  <button
    onClick={copyFromLastMonth}
    disabled={fetchLoading || loading}
    className="flex items-center gap-1.5 bg-violet-500 hover:bg-violet-600 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors shadow-sm"
  >
    📋 지난달 복사
  </button>
)}
<div className="ml-auto flex items-center gap-2">

                    <button onClick={()=>{ setShowWorkDaysPanel(v=>!v); setShowFuelPanel(false) }}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors shadow-sm ${monthWorkDays>0?'bg-blue-600 hover:bg-blue-700 text-white':'bg-blue-100 hover:bg-blue-200 text-blue-800 border border-blue-300'}`}>
                      📅 {selectedYear}년 {selectedMonth}월 출근일수 {monthWorkDays>0?`${monthWorkDays}일 ✓`:'설정'}
                    </button>
                    <button onClick={()=>{ setShowFuelPanel(v=>!v); setShowWorkDaysPanel(false) }}
                      className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors shadow-sm">
                      ⛽ {selectedYear}년 유가 설정
                    </button>
                    <button onClick={openEmailModal}
                      className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors shadow-sm">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
                      </svg>
                      PDF 이메일 발송
                    </button>
                  </div>
                </div>

                {/* 출근일수 설정 패널 */}
                {showWorkDaysPanel&&(
                  <div className="px-6 py-4 border-b border-blue-100 bg-blue-50">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <span className="text-sm font-bold text-blue-800">📅 {selectedYear}년 {selectedMonth}월 기준 출근일수 설정</span>
                        <span className="text-xs text-blue-600 ml-2">(전 직원 공통 적용 · 연차/반차는 개인별 자동 차감)</span>
                      </div>
                      <button onClick={()=>setShowWorkDaysPanel(false)} className="text-blue-400 hover:text-blue-600 text-lg">✕</button>
                    </div>
                    <div className="flex items-center gap-4 flex-wrap">
                      <div className="flex items-center gap-2 bg-white border border-blue-200 rounded-lg px-4 py-2">
                        <span className="text-sm text-blue-700 font-medium">이번 달 출근일수</span>
                        <input type="number" value={monthWorkDaysEdit||''} min={0} max={31}
                          placeholder={String(calcWorkingDays(selectedYear, selectedMonth))}
                          onChange={e=>setMonthWorkDaysEdit(Number(e.target.value))}
                          className="w-16 text-center border-2 border-blue-300 rounded-lg px-2 py-1.5 text-lg font-bold focus:outline-none focus:ring-2 focus:ring-blue-400 text-blue-800"/>
                        <span className="text-sm text-blue-600">일</span>
                      </div>
                      <div className="text-xs text-blue-500 bg-white border border-blue-200 rounded-lg px-3 py-2">
                        달력 기준: <strong>{calcWorkingDays(selectedYear, selectedMonth)}일</strong>
                        <span className="text-blue-400 ml-1">(공휴일 제외 평일 수 · 참고용)</span>
                      </div>
                      <button onClick={saveWorkDays} disabled={workDaysSaving||!monthWorkDaysEdit}
                        className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-bold px-5 py-2 rounded-lg h-fit">
                        {workDaysSaving ? '저장 중...' : '💾 전 직원 적용 · 저장'}
                      </button>
                    </div>
                    {monthWorkDays>0&&(
                      <p className="text-xs text-blue-600 mt-2">
                        ✓ 현재 설정: <strong>{monthWorkDays}일</strong> · 각 직원의 연차·반차 사용일수가 자동 차감되어 유류지원비 계산에 반영됩니다.
                      </p>
                    )}
                  </div>
                )}

                {showFuelPanel&&(
                  <div className="px-6 py-4 border-b border-amber-100 bg-amber-50">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <span className="text-sm font-bold text-amber-800">⛽ {selectedYear}년 유종별 ℓ당 유가 설정</span>
                        <span className="text-xs text-amber-600 ml-2">(전년도 평균 유가 기준으로 1월에 1회 입력)</span>
                      </div>
                      <button onClick={()=>setShowFuelPanel(false)} className="text-amber-400 hover:text-amber-600 text-lg">✕</button>
                    </div>
                    <div className="flex flex-wrap gap-4 items-end">
                      {FUEL_TYPES_PRICED.map(ft=>(
                        <div key={ft} className="flex flex-col gap-1">
                          <label className="text-xs font-semibold text-amber-700">{ft}</label>
                          <div className="flex items-center gap-1">
                            <input type="number" value={fuelPriceEdit[ft]||''} min={0} step={10}
                              onChange={e=>setFuelPriceEdit(p=>({...p,[ft]:parseInt(e.target.value)||0}))}
                              className="w-24 text-right border border-amber-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                              placeholder="0" />
                            <span className="text-xs text-amber-600">원/L</span>
                          </div>
                        </div>
                      ))}
                      <button onClick={saveFuelPrices} disabled={fuelPriceSaving}
                        className="bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-bold px-5 py-2 rounded-lg h-fit">
                        {fuelPriceSaving ? '저장 중...' : '💾 저장'}
                      </button>
                    </div>
                    <p className="text-xs text-amber-600 mt-2">※ 현재 적용 중: {FUEL_TYPES_PRICED.map(ft => ft + ' ' + (fuelPriceMap[ft]||0).toLocaleString() + '원').join(' · ')}</p>
                  </div>
                )}

                {rows.length>0&&(()=>{
                  const monthEnd2 = new Date(selectedYear, selectedMonth, 0).toISOString().slice(0,10)
                  const resignedCount = employees.filter(e=>e.resign_date && e.resign_date<=monthEnd2).length
                  return (
                    <div className="px-6 py-3 bg-blue-50 border-b border-blue-100 flex gap-6 text-sm flex-wrap">
                      <span className="text-blue-700">대상 직원: <strong>{rows.length}명</strong>
                        {resignedCount>0&&<span className="text-red-500 text-xs ml-1">(퇴사자 {resignedCount}명 포함)</span>}
                      </span>
                      <span className="text-blue-700">기본급 합계: <strong>{formatKRW(totalBase)}원</strong></span>
                      <span className="text-blue-700">실지급 합계: <strong>{formatKRW(totalNet)}원</strong></span>
                    </div>
                  )
                })()}

                {fetchLoading?<div className="py-16 text-center text-gray-400">불러오는 중...</div>
                :rows.length===0?<div className="py-16 text-center text-gray-400">등록된 직원이 없습니다.</div>
                :(
                  <div className="divide-y divide-gray-100">
                    {rows.map((row,idx)=>{
                      const net=calcNet(row)
                      const isOpen=expandedRow===row.employee_id
                      const empLeave=leaveUsage[row.employee_id]||[]
                      const isF=row.status==='final'
                      const totalIncome=(row.base_pay||0)+(row.meal_pay||0)+(row.fuel_pay||0)+(row.bonus_pay||0)+row.other_allowances.reduce((s,a)=>s+a.amount,0)
                      const totalDeduction=(row.national_pension||0)+(row.health_insurance||0)+(row.employment_insurance||0)+(row.long_term_care||0)+(row.income_tax||0)+(row.local_income_tax||0)+(row.income_tax_settle||0)+(row.local_tax_settle||0)+(row.special_tax_settle||0)
                      const totalDeductionAbs=Math.abs(totalDeduction)

                      const empInfo = empMap[row.employee_id]
                      // 퇴사자 판별: resign_date가 있고, 해당 월의 말일 이전인 경우
                      const monthEnd = new Date(selectedYear, selectedMonth, 0).toISOString().slice(0,10)
                      const isResigned = !!(empInfo?.resign_date && empInfo.resign_date <= monthEnd)
                      // 퇴사일 전날이 실제 마지막 근무일
                      const lastWorkDay = isResigned && empInfo?.resign_date
                        ? (()=>{ const d=new Date(empInfo.resign_date); d.setDate(d.getDate()-1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` })()
                        : null

                      return (
                        <div key={row.employee_id} className={isResigned?'bg-gray-50/80':''}>
                          <div className={`px-6 py-4 hover:bg-gray-50 cursor-pointer transition-colors ${isResigned?'opacity-80':''}`} onClick={()=>setExpandedRow(isOpen?null:row.employee_id)}>
                            <div className="flex items-center justify-between gap-4">
                              <div className="flex items-center gap-3 min-w-0">
                                <span className={`text-sm font-bold w-20 shrink-0 ${isResigned?'text-gray-400':'text-gray-900'}`}>{row.employee_name}</span>
                                {isResigned&&<span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-red-100 text-red-600 border border-red-200 shrink-0" title={`퇴사일: ${empInfo?.resign_date} / 마지막 근무일: ${lastWorkDay}`}>퇴사 {lastWorkDay?.slice(5).replace('-','/')}</span>}
                                {isF&&<span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-100 text-green-700 shrink-0">확정</span>}
                                {empLeave.length>0&&(
                                  <div className="flex flex-wrap gap-1">
                                    {empLeave.map(u=>{
                                      const sorted=[...u.dates].sort()
                                      const dateStr=sorted.map(fmtDate).join(' · ')
                                      return (
                                        <span key={u.leave_type} title={`날짜: ${sorted.join(', ')}`}
                                          className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full cursor-help whitespace-nowrap">
                                          {leaveLabel(u.leave_type)} {u.count}회
                                          <span className="opacity-70 ml-0.5">({dateStr})</span>
                                        </span>
                                      )
                                    })}
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center gap-6 text-xs text-gray-500 shrink-0">
                                <span>지급 <strong className="text-gray-800">{formatKRW(totalIncome)}</strong></span>
                                <span>공제 <strong className="text-red-500">{formatKRW(totalDeduction)}</strong></span>
                                <span className="text-base font-bold text-blue-700">{formatKRW(net)}원</span>
                                <span className="text-gray-300">{isOpen?'▲':'▼'}</span>
                              </div>
                            </div>
                          </div>

                          {isOpen&&(
                            <div className="px-6 pb-6 bg-gray-50 border-t border-gray-100">
                              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-5">
                                {/* 지급 항목 */}
                                <div className="bg-white rounded-xl border border-gray-200 p-4">
                                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">▶ 지급 항목</p>
                                  <div className="space-y-2.5">
                                    {([['base_pay','기본급'],['meal_pay','식대'],['bonus_pay','상여금']] as const).map(([field,label])=>(
                                      <div key={field} className="flex items-center gap-3">
                                        <label className="w-24 text-sm text-gray-600 shrink-0">{label}</label>
                                        <input type="text" value={row[field]===0?'':formatKRW(row[field] as number)} onChange={e=>handleFieldChange(idx,field,e.target.value)} disabled={isF} placeholder="0"
                                          className="flex-1 text-right border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50 disabled:text-gray-400"/>
                                        <span className="text-xs text-gray-400 w-4">원</span>
                                      </div>
                                    ))}
                                    {(()=>{
                                      const emp=empMap[row.employee_id]
                                      const fuelType=emp?.fuel_type||'없음'
                                      const dist=emp?.commute_distance||0
                                      const eff=fuelEfficiency[row.employee_id]||12
                                      const price=fuelPriceMap[fuelType]??DEFAULT_FUEL_PRICE[fuelType]??0
                                      // 연차 사용일수 (반차 제외 — annual만 차감)
                                      const annualDaysOff=(leaveUsage[row.employee_id]||[])
                                        .filter(u=>u.leave_type==='annual'||u.leave_type==='ANNUAL')
                                        .reduce((s,u)=>s+u.count,0)
                                      const isTrial=emp?.position==='수습'
                                      const detail=calcFuelPayDetail(emp||{} as Employee,row.work_days||0,eff,fuelPriceMap,annualDaysOff,isTrial)
                                      const canCalc=price>0&&dist>0&&eff>0&&(row.work_days||0)>0
                                      // 인사관리 연비 여부
                                      const hasDbEfficiency=!!emp?.fuel_efficiency
                                      // 이 달 기준 출근일수 (달력 참고용)
                                      const refDays=calcWorkingDays(selectedYear,selectedMonth)
                                      return (
                                        <div className="space-y-1.5">
                                          {/* 차량 정보 배지 */}
                                          <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 rounded-lg border border-amber-200 flex-wrap">
                                            <span className="text-xs text-amber-700 font-medium">🚗</span>
                                            <span className="text-xs text-amber-800">{emp?.car_type||'차량미등록'} / {fuelType}{dist?` / 편도 ${dist}km`:''}{price?` / ℓ당 ${formatKRW(price)}원`:''}</span>
                                            {isTrial&&<span className="text-[10px] bg-orange-100 text-orange-700 border border-orange-200 px-1.5 py-0.5 rounded-full font-bold">수습 50%</span>}
                                            {annualDaysOff>0&&<span className="text-[10px] bg-purple-100 text-purple-700 border border-purple-200 px-1.5 py-0.5 rounded-full">연차 -{annualDaysOff}일</span>}
                                          </div>
                                          {/* 유류지원비 입력 */}
                                          <div className="flex items-center gap-2">
                                            <label className="w-24 text-sm text-gray-600 shrink-0">유류지원비</label>
                                            <input type="text" value={row.fuel_pay===0?'':formatKRW(row.fuel_pay)} onChange={e=>handleFieldChange(idx,'fuel_pay',e.target.value)} disabled={isF} placeholder="0"
                                              className="flex-1 text-right border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50 disabled:text-gray-400"/>
                                            <span className="text-xs text-gray-400 w-4">원</span>
                                          </div>
                                          {/* 연비 / 출근일수 표시 / 자동계산 */}
                                          <div className="flex items-center gap-2 pl-24 flex-wrap">
                                            <span className="text-xs text-gray-500">연비</span>
                                            <div className="relative flex items-center gap-1">
                                              <input type="number" value={eff} min={1} max={50} step={0.5} onChange={e=>setFuelEfficiency(prev=>({...prev,[row.employee_id]:Number(e.target.value)}))} disabled={isF}
                                                className={`w-16 text-center border rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:bg-gray-50 ${hasDbEfficiency?'border-emerald-400 bg-emerald-50':'border-gray-200'}`}/>
                                              <span className="text-xs text-gray-400">km/L</span>
                                              {hasDbEfficiency&&(
                                                <span className="text-[10px] text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full whitespace-nowrap">인사관리 연동</span>
                                              )}
                                            </div>
                                            {/* 출근일수: 공통값 표시 + 개인 조정 가능 */}
                                            <span className="text-xs text-gray-500 ml-2">출근일수</span>
                                            <input type="number" value={row.work_days||''} min={0} max={31}
                                              placeholder={monthWorkDays>0?String(monthWorkDays):String(refDays)}
                                              onChange={e=>updateRow(idx,{work_days:Number(e.target.value)})} disabled={isF}
                                              className="w-14 text-center border border-blue-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50 bg-blue-50"/>
                                            <span className="text-xs text-gray-400">일</span>
                                            {monthWorkDays>0
                                              ? <span className="text-[10px] text-blue-500">(공통 {monthWorkDays}일 적용됨)</span>
                                              : <span className="text-[10px] text-orange-500">← 상단 📅 출근일수 먼저 설정하세요</span>
                                            }
                                            {!isF&&canCalc&&(
                                              <button onClick={()=>handleFieldChange(idx,'fuel_pay',String(detail.final))}
                                                className="ml-1 text-xs bg-amber-500 hover:bg-amber-600 text-white px-2.5 py-1 rounded-lg font-bold">
                                                자동계산 → {formatKRW(detail.final)}원
                                              </button>
                                            )}
                                            {!isF&&!canCalc&&(row.work_days||0)===0&&dist>0&&monthWorkDays===0&&(
                                              <span className="text-[10px] text-blue-500 ml-1">← 출근일수를 입력하세요</span>
                                            )}
                                          </div>
                                          {/* 계산 상세 박스 */}
                                          {canCalc&&(
                                            <div className="ml-24 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-[11px] text-gray-600 space-y-0.5">
                                              <div>① 1일 유류비 = 왕복 {dist*2}km ÷ {eff}km/L × {formatKRW(price)}원 = <strong>{formatKRW(Math.round(detail.dailyFuel))}원</strong> → 10원 올림 = <strong className="text-amber-700">{formatKRW(detail.dailyFuelCeiled)}원</strong></div>
                                              <div>② 입력 출근일수 {detail.workDays}일{detail.annualDaysOff>0?` - 연차 ${detail.annualDaysOff}일 = ${detail.workDays - detail.annualDaysOff}일`:''} × {formatKRW(detail.dailyFuelCeiled)}원 = <strong>{formatKRW(detail.rawTotal)}원</strong></div>
                                              {detail.rawTotal>100000&&<div className="text-red-500">③ 월 최대 100,000원 한도 적용 → <strong>100,000원</strong></div>}
                                              {detail.isTrial&&<div className="text-orange-600">④ 수습 50% 적용 → <strong>{formatKRW(detail.final)}원</strong></div>}
                                              <div className="pt-0.5 border-t border-gray-200 font-bold text-gray-800">최종 지급액: <span className="text-amber-700">{formatKRW(detail.final)}원</span></div>
                                            </div>
                                          )}
                                        </div>
                                      )
                                    })()}
                                    {row.other_allowances.map((a,aIdx)=>(
                                      <div key={aIdx} className="flex items-center gap-2">
                                        <input type="text" value={a.label} onChange={e=>updateOtherAllowance(idx,aIdx,'label',e.target.value)} placeholder="항목명" disabled={isF}
                                          className="w-24 border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50"/>
                                        <input type="text" value={a.amount===0?'':formatKRW(a.amount)} onChange={e=>updateOtherAllowance(idx,aIdx,'amount',e.target.value)} placeholder="0" disabled={isF}
                                          className="flex-1 text-right border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50"/>
                                        <span className="text-xs text-gray-400">원</span>
                                        {!isF&&<button onClick={()=>removeOtherAllowance(idx,aIdx)} className="text-red-400 hover:text-red-600 text-sm">✕</button>}
                                      </div>
                                    ))}
                                    {!isF&&<button onClick={()=>addOtherAllowance(idx)} className="w-full text-xs text-blue-500 hover:text-blue-700 border border-dashed border-blue-300 hover:border-blue-500 rounded-lg py-1.5">+ 기타 항목 추가</button>}
                                    <div className="border-t border-gray-100 pt-2 flex justify-between text-sm font-bold">
                                      <span className="text-gray-600">지급 합계</span>
                                      <span className="text-gray-900">{formatKRW(totalIncome)}원</span>
                                    </div>
                                  </div>
                                </div>

                                {/* 공제 항목 */}
                                <div className="bg-white rounded-xl border border-gray-200 p-4">
                                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">▶ 공제 항목</p>
                                  <div className="space-y-2.5">
                                    {([['national_pension','국민연금'],['health_insurance','건강보험'],['employment_insurance','고용보험'],['long_term_care','장기요양보험료'],['income_tax','소득세'],['local_income_tax','지방소득세']] as const).map(([field,label])=>(
                                      <div key={field} className="flex items-center gap-3">
                                        <label className="w-28 text-sm text-gray-600 shrink-0">{label}</label>
                                        <input type="text" value={row[field]===0?'':formatKRW(row[field] as number)} onChange={e=>handleFieldChange(idx,field,e.target.value)} disabled={isF} placeholder="0"
                                          className="flex-1 text-right border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 disabled:bg-gray-50 disabled:text-gray-400"/>
                                        <span className="text-xs text-gray-400 w-4">원</span>
                                      </div>
                                    ))}
                                    <div className="border-t border-dashed border-amber-200 pt-2 flex items-center justify-between">
                                      <div className="text-xs text-amber-700">◆ 연말정산
                                        {(row.income_tax_settle!==0||row.local_tax_settle!==0||row.special_tax_settle!==0)&&(
                                          <span className="ml-2 font-bold text-amber-900">({formatKRW(row.income_tax_settle+row.local_tax_settle+row.special_tax_settle)}원 입력됨)</span>
                                        )}
                                      </div>
                                      {!isF&&<button onClick={()=>{setSettleDraft({income_tax_settle:row.income_tax_settle,local_tax_settle:row.local_tax_settle,special_tax_settle:row.special_tax_settle});setSettleModal({empId:row.employee_id,idx})}} className="text-xs bg-amber-500 hover:bg-amber-600 text-white px-3 py-1 rounded-lg font-medium">연말정산 입력</button>}
                                    </div>
                                    <div className="border-t border-gray-100 pt-2 flex justify-between text-sm font-bold">
                                      <span className="text-gray-600">공제 합계</span>
                                      <span className="text-red-600">{totalDeduction<0?'+':'-'}{formatKRW(totalDeductionAbs)}원</span>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {empLeave.length>0&&(
                                <div className="mt-4 bg-purple-50 rounded-xl border border-purple-100 p-4">
                                  <p className="text-xs font-bold text-purple-700 mb-3">📅 {selectedMonth}월 연차·휴가 사용 내역</p>
                                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                    {empLeave.map(u=>{
                                      const sorted=[...u.dates].sort()
                                      return (
                                        <div key={u.leave_type} className="bg-white border border-purple-200 rounded-lg px-3 py-2.5">
                                          <div className="flex items-center justify-between mb-2">
                                            <span className="text-xs font-semibold text-purple-800">{leaveLabel(u.leave_type)}</span>
                                            <span className="text-xs font-bold text-white bg-purple-500 px-1.5 py-0.5 rounded-full">{u.count}회</span>
                                          </div>
                                          <div className="flex flex-wrap gap-1">
                                            {sorted.map(d=>(
                                              <span key={d} className="text-[10px] text-purple-700 bg-purple-100 border border-purple-200 px-1.5 py-0.5 rounded font-medium">
                                                {fmtDate(d)}
                                              </span>
                                            ))}
                                          </div>
                                        </div>
                                      )
                                    })}
                                  </div>
                                </div>
                              )}

                              <div className="mt-4 bg-white rounded-xl border border-gray-200 p-4">
                                <p className="text-xs font-bold text-gray-500 mb-2">📝 메모</p>
                                <textarea value={row.memo} onChange={e=>updateRow(idx,{memo:e.target.value})} disabled={isF} placeholder="급여 관련 메모를 입력하세요..." rows={2}
                                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50 resize-none"/>
                              </div>

                              <div className="mt-4 flex items-center justify-between flex-wrap gap-3">
                                <div className="flex items-center gap-3">
                                  <span className="text-sm text-gray-500">실지급액</span>
                                  <span className="text-2xl font-black text-blue-700">{formatKRW(net)}원</span>
                                  {isF&&<span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">확정됨 — 하단 수정하기 버튼으로 편집</span>}
                                </div>
                                <div className="flex gap-2">
                                  {!isF&&<button onClick={()=>handleSaveDraft()} className="border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg">💾 저장</button>}
                                  <button onClick={()=>handlePrint(row,'print')} className="bg-gray-700 hover:bg-gray-800 text-white text-sm font-medium px-4 py-2 rounded-lg">🖨️ 인쇄</button>
                                  <button onClick={()=>handlePrint(row,'pdf')} className="bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-4 py-2 rounded-lg">📄 PDF</button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                    <div className="px-6 py-4 border-t border-gray-100 flex gap-3 justify-end bg-white">
                      {isFinalized?(
                        <>
                          <span className="flex items-center text-sm text-green-700 font-medium gap-1.5"><span className="bg-green-100 text-green-700 text-xs px-2.5 py-1 rounded-full">✓ 최종 확정됨</span></span>
                          <button onClick={handleUnfinalize} disabled={loading} className="border border-orange-300 hover:bg-orange-50 text-orange-600 text-sm font-medium px-5 py-2 rounded-lg disabled:opacity-50">✏️ 수정하기</button>
                        </>
                      ):(
                        <>
                          <button onClick={handleSaveDraft} disabled={loading} className="border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium px-5 py-2 rounded-lg disabled:opacity-50">{loading?'저장 중...':'💾 임시 저장'}</button>
                          <button onClick={handleFinalize} disabled={loading} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-5 py-2 rounded-lg disabled:opacity-50">✓ 최종 확정</button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ):(
              <div>
                <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
                  <label className="text-sm font-medium text-gray-700">연도</label>
                  <select value={historyYear} onChange={e=>setHistoryYear(Number(e.target.value))} className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {years.map(y=><option key={y} value={y}>{y}년</option>)}
                  </select>
                  <span className="text-xs text-gray-400 ml-2">* 가로 스크롤로 전체 항목 확인 가능</span>
                </div>
                {fetchLoading?<div className="py-16 text-center text-gray-400">불러오는 중...</div>
                :savedRows.length===0?<div className="py-16 text-center text-gray-400">급여 데이터가 없습니다.</div>
                :(
                  <div className="overflow-x-auto">
                    <table className="text-xs border-collapse" style={{minWidth:'1400px'}}>
                      <thead>
                        <tr>
                          <th className="px-2 py-2 text-left bg-gray-100 border border-gray-300 sticky left-0 z-10" rowSpan={2}>월</th>
                          <th className="px-2 py-2 text-left bg-gray-100 border border-gray-300 sticky left-12 z-10" rowSpan={2}>직원</th>
                          <th className="px-2 py-2 text-center bg-blue-50 text-blue-700 border border-blue-200 font-semibold" colSpan={6}>지급 항목</th>
                          <th className="px-2 py-2 text-center bg-red-50 text-red-700 border border-red-200 font-semibold" colSpan={6}>공제 항목</th>
                          <th className="px-2 py-2 text-center bg-purple-50 text-purple-700 border border-purple-200 font-semibold" colSpan={3}>연말정산</th>
                          <th className="px-2 py-2 text-center bg-green-50 text-green-800 border border-green-200 font-semibold" rowSpan={2}>실지급</th>
                          <th className="px-2 py-2 text-center bg-gray-100 border border-gray-300" rowSpan={2}>상태</th>
                          <th className="px-2 py-2 text-center bg-gray-100 border border-gray-300" rowSpan={2}>출력</th>
                        </tr>
                        <tr>
                          {['기본급','식대','유류','상여','기타수당','지급계'].map(h=><th key={h} className="px-2 py-1.5 text-right bg-blue-50 text-blue-600 border border-blue-200 whitespace-nowrap">{h}</th>)}
                          {['국민연금','건강보험','고용보험','장기요양','소득세','지방세'].map(h=><th key={h} className="px-2 py-1.5 text-right bg-red-50 text-red-600 border border-red-200 whitespace-nowrap">{h}</th>)}
                          {['소득세정산','지방세정산','농특세'].map(h=><th key={h} className="px-2 py-1.5 text-right bg-purple-50 text-purple-600 border border-purple-200 whitespace-nowrap">{h}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {savedRows.map((row,idx)=>{
                          const otherSum=(row.other_allowances||[]).reduce((s:number,a:any)=>s+a.amount,0)
                          const totalInc=(row.base_pay||0)+(row.meal_pay||0)+(row.fuel_pay||0)+(row.bonus_pay||0)+otherSum
                          const fmtS=(v:number)=>{if(!v)return<span className="text-gray-300">-</span>;return<span className={v<0?'text-blue-600 font-medium':'text-red-500'}>{v<0?'환급 '+formatKRW(Math.abs(v)):formatKRW(v)}</span>}
                          const tb="px-2 py-2 border border-gray-200 whitespace-nowrap"
                          return(
                            <tr key={idx} className={idx%2===0?'bg-white hover:bg-blue-50/30':'bg-gray-50/60 hover:bg-blue-50/30'}>
                              <td className={`${tb} font-medium text-gray-700 sticky left-0 bg-inherit`}>{row.pay_month}</td>
                              <td className={`${tb} font-semibold text-gray-900 sticky left-12 bg-inherit`}>{row.employee_name}</td>
                              <td className={`${tb} text-right text-gray-800`}>{formatKRW(row.base_pay||0)}</td>
                              <td className={`${tb} text-right text-gray-600`}>{row.meal_pay?formatKRW(row.meal_pay):<span className="text-gray-300">-</span>}</td>
                              <td className={`${tb} text-right text-gray-600`}>{row.fuel_pay?formatKRW(row.fuel_pay):<span className="text-gray-300">-</span>}</td>
                              <td className={`${tb} text-right text-gray-600`}>{row.bonus_pay?formatKRW(row.bonus_pay):<span className="text-gray-300">-</span>}</td>
                              <td className={`${tb} text-right text-gray-600`}>{otherSum?formatKRW(otherSum):<span className="text-gray-300">-</span>}</td>
                              <td className={`${tb} text-right font-bold text-blue-700 bg-blue-50/40`}>{formatKRW(totalInc)}</td>
                              {['national_pension','health_insurance','employment_insurance','long_term_care','income_tax','local_income_tax'].map(f=>(
                                <td key={f} className={`${tb} text-right text-red-500`}>{(row as any)[f]?formatKRW((row as any)[f]):<span className="text-gray-300">-</span>}</td>
                              ))}
                              <td className={`${tb} text-right`}>{fmtS(row.income_tax_settle||0)}</td>
                              <td className={`${tb} text-right`}>{fmtS(row.local_tax_settle||0)}</td>
                              <td className={`${tb} text-right`}>{fmtS(row.special_tax_settle||0)}</td>
                              <td className={`${tb} text-right font-bold text-green-700 text-sm bg-green-50/40`}>{formatKRW(calcNet(row))}원</td>
                              <td className={`${tb} text-center`}>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${row.status==='final'?'bg-green-100 text-green-700':'bg-yellow-100 text-yellow-700'}`}>
                                  {row.status==='final'?'확정':'초안'}
                                </span>
                              </td>
                              <td className={`${tb} text-center`}>
                                <div className="flex gap-1 justify-center">
                                  <button onClick={()=>handlePrint(row,'print')} className="text-[10px] text-gray-600 hover:text-gray-900 border border-gray-300 px-1.5 py-0.5 rounded whitespace-nowrap">🖨️ 인쇄</button>
                                  <button onClick={()=>handlePrint(row,'pdf')} className="text-[10px] text-red-600 hover:text-red-800 border border-red-300 px-1.5 py-0.5 rounded whitespace-nowrap">📄 PDF</button>
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── 인쇄용 명세서 컴포넌트 ──────────────────────────────
import { forwardRef } from 'react'

const PRINT_STYLES = [
  '@media print {',
  '  @page { size: A4; margin: 15mm; }',
  '  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }',
  '  .print-block { display: block !important; }',
  '  nav, header, [class*="nav"], [class*="header"], [class*="sidebar"],',
  '  [role="navigation"], [role="banner"], .print\\:hidden { display: none !important; }',
  '}',
  '.slip-table { width: 100%; border-collapse: collapse; }',
  '.slip-table th, .slip-table td { border: 1px solid #999; padding: 4px 6px; }',
  '.slip-table th { background: #f0f0f0; text-align: center; font-weight: bold; }',
  '.section-header { background: #222; color: white; padding: 4px 8px; font-weight: bold; margin: 10px 0 4px; font-size: 11px; }',
  '.amount { text-align: right; }',
  '.label-col { background: #f5f5f5; font-weight: 600; width: 120px; }',
].join('\n')

const PrintSlip = forwardRef<HTMLDivElement, { row: PayrollRow; emp: Employee | undefined; leaveUsage: LeaveUsage[]; fuelDetail: FuelCalcDetail | null }>(
  ({ row, emp, leaveUsage, fuelDetail }, ref) => {
    const net = calcNet(row)
    const totalIncome = (row.base_pay||0)+(row.meal_pay||0)+(row.fuel_pay||0)+(row.bonus_pay||0)+(row.other_allowances||[]).reduce((s,a)=>s+a.amount,0)
    const totalDeduction = (row.national_pension||0)+(row.health_insurance||0)+(row.employment_insurance||0)+(row.long_term_care||0)+(row.income_tax||0)+(row.local_income_tax||0)+(row.income_tax_settle||0)+(row.local_tax_settle||0)+(row.special_tax_settle||0)
    const hasSettle = row.income_tax_settle!==0||row.local_tax_settle!==0||row.special_tax_settle!==0
    const [pyear,pmonth] = (row.pay_month||'').split('-').map(Number)
    const periodStart = `${pyear}.${String(pmonth).padStart(2,'0')}.01`
    const periodEnd = `${pyear}.${String(pmonth).padStart(2,'0')}.${new Date(pyear,pmonth,0).getDate()}`
    function getPayDate(y:number,m:number){const nm=m===12?1:m+1,ny=m===12?y+1:y;let d=new Date(ny,nm-1,10);while(d.getDay()===0||d.getDay()===6)d.setDate(d.getDate()-1);return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
    const fd = fuelDetail

    const isResignedPrint = !!(emp?.resign_date)
    const lastWorkDayPrint = isResignedPrint && emp?.resign_date
      ? (()=>{ const d=new Date(emp!.resign_date!); d.setDate(d.getDate()-1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` })()
      : null

    return (
      <div ref={ref} className="hidden print:block p-8 text-xs font-sans text-gray-900" style={{fontFamily:'Malgun Gothic,맑은 고딕,sans-serif'}}>
        <style dangerouslySetInnerHTML={{__html:PRINT_STYLES}}/>
        <div className="text-center mb-4" style={{fontSize:'18px',fontWeight:'bold'}}>{row.pay_month} (주)보누스메이트 급여명세서</div>
        {isResignedPrint&&(
          <div style={{background:'#fef2f2',border:'1px solid #fca5a5',borderRadius:'4px',padding:'5px 10px',marginBottom:'6px',fontSize:'11px',color:'#b91c1c',fontWeight:'bold'}}>
            ⚠ 퇴사자 급여명세서 · 마지막 근무일: {lastWorkDayPrint}
          </div>
        )}
        <table className="slip-table mb-3"><tbody>
          <tr><th className="label-col">근무기간</th><td colSpan={3}>{periodStart} ~ {periodEnd}</td></tr>
          <tr><th className="label-col">성명</th><td>{row.employee_name}</td><th className="label-col">사번</th><td>{emp?.employee_code||''}</td></tr>
          <tr><th className="label-col">직위</th><td>{emp?.position||''}</td><th className="label-col">입사일</th><td>{emp?.hire_date||''}</td></tr>
          <tr><th className="label-col">급여지급일</th><td>{getPayDate(pyear,pmonth)}</td>
            <th className="label-col">{isResignedPrint?'마지막 근무일':'급여계좌'}</th>
            <td>{isResignedPrint?<span style={{color:'#b91c1c',fontWeight:'bold'}}>{lastWorkDayPrint}</span>:emp?.bank_name?`[${emp.bank_name}] ${emp.bank_account||''}`:'-'}</td>
          </tr>
          {isResignedPrint&&<tr><th className="label-col">급여계좌</th><td colSpan={3}>{emp?.bank_name?`[${emp.bank_name}] ${emp.bank_account||''}`:'-'}</td></tr>}
        </tbody></table>
        <table className="slip-table mb-3"><tbody>
          <tr>
            <th className="label-col">소득합계</th><td className="amount" style={{width:'18%'}}>{formatKRW(totalIncome)}</td>
            <th className="label-col">공제합계</th><td className="amount" style={{width:'18%'}}>{totalDeduction<0?'+':'-'}{formatKRW(Math.abs(totalDeduction))}</td>
            <th style={{background:'#1a3a6b',color:'white',width:'90px'}}>실수령액</th>
            <td className="amount font-bold" style={{width:'18%',background:'#e8f0fe'}}>{formatKRW(net)}</td>
          </tr>
        </tbody></table>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px'}}>
          <div>
            <div className="section-header">▶ 소득 세부내역</div>
            <table className="slip-table"><thead><tr><th>항목</th><th>금액</th></tr></thead><tbody>
              <tr><td className="label-col">기본급</td><td className="amount">{formatKRW(row.base_pay||0)}</td></tr>
              <tr><td className="label-col">식대</td><td className="amount">{formatKRW(row.meal_pay||0)}</td></tr>
              <tr><td className="label-col">유류지원비</td><td className="amount">{formatKRW(row.fuel_pay||0)}</td></tr>
              <tr><td className="label-col">상여금</td><td className="amount">{formatKRW(row.bonus_pay||0)}</td></tr>
              {(row.other_allowances||[]).map((a,i)=><tr key={i}><td className="label-col">{a.label||'기타'}</td><td className="amount">{formatKRW(a.amount)}</td></tr>)}
              <tr style={{background:'#e8f0fe',fontWeight:'bold'}}><td className="label-col">소득합계</td><td className="amount">{formatKRW(totalIncome)}</td></tr>
            </tbody></table>
          </div>
          <div>
            <div className="section-header">▶ 공제 세부내역</div>
            <table className="slip-table"><thead><tr><th>항목</th><th>금액</th></tr></thead><tbody>
              <tr><td className="label-col">국민연금</td><td className="amount">{formatKRW(row.national_pension||0)}</td></tr>
              <tr><td className="label-col">건강보험</td><td className="amount">{formatKRW(row.health_insurance||0)}</td></tr>
              <tr><td className="label-col">고용보험</td><td className="amount">{formatKRW(row.employment_insurance||0)}</td></tr>
              <tr><td className="label-col">장기요양보험료</td><td className="amount">{formatKRW(row.long_term_care||0)}</td></tr>
              <tr><td className="label-col">소득세</td><td className="amount">{formatKRW(row.income_tax||0)}</td></tr>
              <tr><td className="label-col">지방소득세</td><td className="amount">{formatKRW(row.local_income_tax||0)}</td></tr>
              {hasSettle&&<>
                <tr style={{background:'#fffbeb'}}><td className="label-col" colSpan={2} style={{fontWeight:'bold',color:'#92400e'}}>◆ 연말정산</td></tr>
                {row.income_tax_settle!==0&&<tr><td className="label-col">연말정산소득세</td><td className="amount">{formatKRW(row.income_tax_settle)}</td></tr>}
                {row.local_tax_settle!==0&&<tr><td className="label-col">연말정산지방소득세</td><td className="amount">{formatKRW(row.local_tax_settle)}</td></tr>}
                {row.special_tax_settle!==0&&<tr><td className="label-col">연말정산농특세</td><td className="amount">{formatKRW(row.special_tax_settle)}</td></tr>}
              </>}
              <tr style={{background:'#fee2e2',fontWeight:'bold'}}><td className="label-col">공제합계</td><td className="amount">{totalDeduction<0?'+':'-'}{formatKRW(Math.abs(totalDeduction))}</td></tr>
            </tbody></table>
          </div>
        </div>

        {/* 유류지원비 계산내역 */}
        {fd && fd.distKm > 0 && row.fuel_pay > 0 && (()=>{
          const effectiveWorkDays = fd.workDays - fd.annualDaysOff
          return (
            <div className="mt-3">
              <div className="section-header">▶ 유류지원비 계산 내역</div>
              <table className="slip-table" style={{fontSize:'10px'}}>
                <tbody>
                  <tr><td className="label-col" style={{fontSize:'10px',color:'#78350f'}}>차량 / 유종</td><td>{emp?.car_type||'-'} / {fd.fuelType}</td></tr>
                  <tr><td className="label-col" style={{fontSize:'10px',color:'#78350f'}}>편도 출퇴근 거리</td><td>{fd.distKm} km (왕복 {fd.distKm*2} km)</td></tr>
                  <tr><td className="label-col" style={{fontSize:'10px',color:'#78350f'}}>연비</td><td>{fd.efficiency} km/L</td></tr>
                  <tr><td className="label-col" style={{fontSize:'10px',color:'#78350f'}}>유종별 ℓ당 단가</td><td>{formatKRW(fd.pricePerL)}원/L</td></tr>
                  <tr><td className="label-col" style={{fontSize:'10px',color:'#78350f'}}>① 1일 유류비</td>
                    <td>왕복 {fd.distKm*2}km ÷ {fd.efficiency}km/L × {formatKRW(fd.pricePerL)}원 = {formatKRW(Math.round(fd.dailyFuel))}원 → <strong>10원 올림 = {formatKRW(fd.dailyFuelCeiled)}원</strong></td></tr>
                  <tr><td className="label-col" style={{fontSize:'10px',color:'#78350f'}}>② 기준 출근일수</td>
                    <td>{fd.workDays}일{fd.annualDaysOff>0&&<> − 연차 {fd.annualDaysOff}일 = <strong>{effectiveWorkDays}일</strong></>}</td></tr>
                  <tr><td className="label-col" style={{fontSize:'10px',color:'#78350f'}}>③ 월 유류비 합계</td>
                    <td>{formatKRW(fd.dailyFuelCeiled)}원 × {effectiveWorkDays}일 = <strong>{formatKRW(fd.rawTotal)}원</strong></td></tr>
                  {fd.rawTotal>100000&&<tr><td className="label-col" style={{fontSize:'10px',color:'#78350f'}}>④ 한도 적용</td><td>월 최대 <strong>100,000원</strong> 한도 적용</td></tr>}
                  {fd.isTrial&&<tr><td className="label-col" style={{fontSize:'10px',color:'#78350f'}}>⑤ 수습 50%</td><td>{formatKRW(fd.capped)}원 × 50% = <strong>{formatKRW(fd.final)}원</strong></td></tr>}
                  <tr style={{background:'#fef9c3',fontWeight:'bold'}}>
                    <td className="label-col" style={{fontSize:'11px',color:'#78350f'}}>최종 유류지원비</td>
                    <td style={{textAlign:'right',fontSize:'12px',color:'#b45309',fontWeight:'bold'}}>{formatKRW(row.fuel_pay)}원</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )
        })()}

        <div className="mt-3">
          <div className="section-header">▶ {row.pay_month} 연차·휴가 사용 내역</div>
          <table className="slip-table">
            <thead><tr><th style={{width:'160px'}}>구분</th><th>사용 횟수 및 날짜</th></tr></thead>
            <tbody>
              {leaveUsage.length>0
                ?leaveUsage.map(u=>{
                    const sorted=[...u.dates].sort()
                    const dateStr = sorted.map(fmtDate).join(' · ')
                    return(
                      <tr key={u.leave_type}>
                        <td className="label-col">{leaveLabel(u.leave_type)}</td>
                        <td style={{padding:'4px 6px', border:'1px solid #999'}}>
                          <span style={{fontWeight:'bold'}}>{u.count}회</span>
                          <span style={{color:'#555', fontSize:'10px', marginLeft:'8px'}}>({dateStr})</span>
                        </td>
                      </tr>
                    )
                  })
                :<tr><td colSpan={2} style={{textAlign:'center',color:'#888',padding:'6px'}}>해당 월 연차·휴가 사용 내역 없음</td></tr>
              }
            </tbody>
          </table>
        </div>

        {row.memo&&<div className="mt-3"><div className="section-header">▶ 메모</div><div style={{border:'1px solid #999',padding:'6px 8px',minHeight:'32px',whiteSpace:'pre-wrap'}}>{row.memo}</div></div>}
        <div className="mt-3">
          <div className="section-header">▶ 항목별 산출식 (참고)</div>
          <div style={{border:'1px solid #ccc',padding:'6px 8px',fontSize:'9px',lineHeight:'1.6',background:'#fafafa'}}>
            <div>*시급 계산 = 기본급 ÷ 209시간</div>
            <div>*일급 계산(8시간 기준) = 시급 × 8시간</div>
            <div>*연장근로수당(1일 8시간 초과 근로) = 연장근로시간 × 시급 × 1.5</div>
            <div>*야간근로수당(밤 10시~새벽 6시 근로) = 야간근로시간 × 시급 × 0.5배 가산</div>
            <div>*연장근로와 야간근로가 겹칠 경우 = 겹치는 근로시간 × 시급 × 2.0</div>
            <div>*휴일근로수당 = 휴일근로시간 × 시급 × 1.5</div>
            <div>*휴일연장근로수당(휴일에 8시간 초과 근로) = 휴일연장근로시간 × 시급 × 2.0</div>
            <div>*휴일야간근로수당(휴일 밤 10시~새벽 6시 근로) = 0.5배 가산</div>
            <div>*주휴수당(정상) = 출근예정일만 받을 수 있기 때문에 다음주에도 계속 출근예정이어야만 지급 가능</div>
            <div>*주휴수당(휴무) = 주중 출근일이 없을 경우 70% 지급함</div>
            <div>*유류비 = 출근일수 × 1일 유류비(최대 10만원)</div>
            {row.note&&<div style={{borderTop:'1px dashed #ccc',marginTop:'4px',paddingTop:'4px'}}>*비고: {row.note}</div>}
          </div>
        </div>
        <div className="mt-4 text-center" style={{fontSize:'11px',fontWeight:'bold'}}>{row.employee_name} 님의 노고에 감사 드립니다.</div>
      </div>
    )
  }
)
PrintSlip.displayName = 'PrintSlip'
