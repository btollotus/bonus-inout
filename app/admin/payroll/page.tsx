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
  email: string | null
  bank_name: string | null
  bank_account: string | null
  car_type: string | null
  fuel_type: string | null
  commute_distance: number | null
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
    work_days: 22, memo: '', note: '', status: 'draft',
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

function calcFuelPay(emp: Employee, workDays: number, efficiency: number, priceMap: Record<string, number>): number {
  const dist = emp.commute_distance || 0
  const fuelType = emp.fuel_type || '없음'
  const price = priceMap[fuelType] ?? DEFAULT_FUEL_PRICE[fuelType] ?? 0
  if (!dist || !price || !workDays || !efficiency) return 0
  return Math.round(dist * 2 * workDays / efficiency * price)
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
function buildSlipHTML(row: PayrollRow, emp: Employee | undefined, leaveUsages: LeaveUsage[]): string {
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
  return `<div style="text-align:center;font-size:18px;font-weight:bold;margin-bottom:14px;">${row.pay_month} (주)보누스메이트 급여명세서</div>
<table style="width:100%;border-collapse:collapse;margin-bottom:8px;font-size:11px;"><tbody>
<tr><th style="${lbl}">근무기간</th><td colspan="3" style="${td}">${py}.${String(pm).padStart(2,'0')}.01 ~ ${periodEnd}</td></tr>
<tr><th style="${lbl}">성명</th><td style="${td}">${row.employee_name}</td><th style="${lbl}">사번</th><td style="${td}">${emp?.employee_code||''}</td></tr>
<tr><th style="${lbl}">직위</th><td style="${td}">${emp?.position||''}</td><th style="${lbl}">입사일</th><td style="${td}">${emp?.hire_date||''}</td></tr>
<tr><th style="${lbl}">급여지급일</th><td style="${td}">${getPayDate(py,pm)}</td><th style="${lbl}">급여계좌</th><td style="${td}">${emp?.bank_name?`[${emp.bank_name}] ${emp.bank_account||''}`:'-'}</td></tr>
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
  const [settleDraft, setSettleDraft] = useState({ income_tax_settle: 0, local_tax_settle: 0, special_tax_settle: 0 })
  const printRef = useRef<HTMLDivElement>(null)
  const years = [new Date().getFullYear(), new Date().getFullYear() - 1, new Date().getFullYear() - 2]

  const [emailModal, setEmailModal] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [sendStatus, setSendStatus] = useState<Record<string, SendStatus>>({})
  const [isSending, setIsSending] = useState(false)
  const [sendProgress, setSendProgress] = useState({ done: 0, total: 0 })

  useEffect(() => { fetchEmployees(); fetchFuelPrices() }, [])
  useEffect(() => { if (employees.length > 0) { fetchPayrollForMonth(); fetchLeaveUsage() } fetchFuelPrices(selectedYear) }, [selectedYear, selectedMonth, employees])
  useEffect(() => { if (tab === 'history') fetchHistory() }, [tab, historyYear])

  async function fetchEmployees() {
    const { data } = await supabase.from('employees').select('id, name, position, employee_code, hire_date, email, bank_name, bank_account, car_type, fuel_type, commute_distance, auth_user_id').is('resign_date', null).order('name')
    const emps = data || []
    setEmployees(emps)
    const map: Record<string, Employee> = {}
    const effMap: Record<string, number> = {}
    emps.forEach((e: Employee) => {
      map[e.id] = e
      effMap[e.id] = DEFAULT_FUEL_EFFICIENCY[e.fuel_type || '없음'] || 12
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
    const { data: existing } = await supabase.from('payroll_draft').select('*').eq('pay_month', pay_month)
    const existingMap = new Map((existing || []).map((r: PayrollRow) => [r.employee_id, r]))
    const newRows: PayrollRow[] = employees.map((emp) => {
      const ex = existingMap.get(emp.id)
      if (ex) {
        const [y, m] = (ex.pay_month || '').split('-').map(Number)
        return { ...emptyRow(emp, selectedYear, selectedMonth), ...ex, year: y||selectedYear, month: m||selectedMonth, other_allowances: ex.other_allowances || [] }
      }
      return emptyRow(emp, selectedYear, selectedMonth)
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
    return { employee_id: row.employee_id, employee_name: row.employee_name, pay_month: row.pay_month, base_pay: row.base_pay, meal_pay: row.meal_pay, fuel_pay: row.fuel_pay, bonus_pay: row.bonus_pay, other_allowances: row.other_allowances, meal_allowance: row.meal_allowance, fuel_allowance: row.fuel_allowance, national_pension: row.national_pension, health_insurance: row.health_insurance, employment_insurance: row.employment_insurance, long_term_care: row.long_term_care, income_tax: row.income_tax, local_income_tax: row.local_income_tax, income_tax_settle: row.income_tax_settle, local_tax_settle: row.local_tax_settle, special_tax_settle: row.special_tax_settle, memo: row.memo||null, status: row.status }
  }

  async function handleSaveDraft() {
    setLoading(true); setError(''); setSuccess('')
    try {
      const updatedRows = [...rows]
      for (let i = 0; i < updatedRows.length; i++) {
        const row = updatedRows[i]
        const payload = { ...buildPayload(row), status: row.status }
        if (row.id) {
          const { error } = await supabase.from('payroll_draft').update(payload).eq('id', row.id)
          if (error) throw new Error(`${row.employee_name} 저장 실패: ${error.message}`)
        } else {
          const { data, error } = await supabase.from('payroll_draft').insert([payload]).select().single()
          if (error) throw new Error(`${row.employee_name} 저장 실패: ${error.message}`)
          if (data) updatedRows[i] = { ...row, id: data.id }
        }
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

  function handlePrint(row: PayrollRow, mode: 'print' | 'pdf' = 'print') {
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
        const html = buildSlipHTML(row, emp, leaveUsage[emp.id] || [])
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
      {printTarget && <PrintSlip row={printTarget} emp={empMap[printTarget.employee_id]} leaveUsage={leaveUsage[printTarget.employee_id] || []} ref={printRef} />}

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
                  {isFinalized&&<span className="bg-green-100 text-green-700 text-xs font-medium px-2.5 py-1 rounded-full">✓ 최종 확정됨</span>}
                  <div className="ml-auto flex items-center gap-2">
                    <button onClick={()=>setShowFuelPanel(v=>!v)}
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

                {rows.length>0&&(
                  <div className="px-6 py-3 bg-blue-50 border-b border-blue-100 flex gap-6 text-sm flex-wrap">
                    <span className="text-blue-700">대상 직원: <strong>{rows.length}명</strong></span>
                    <span className="text-blue-700">기본급 합계: <strong>{formatKRW(totalBase)}원</strong></span>
                    <span className="text-blue-700">실지급 합계: <strong>{formatKRW(totalNet)}원</strong></span>
                  </div>
                )}

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

                      return (
                        <div key={row.employee_id}>
                          <div className="px-6 py-4 hover:bg-gray-50 cursor-pointer transition-colors" onClick={()=>setExpandedRow(isOpen?null:row.employee_id)}>
                            <div className="flex items-center justify-between gap-4">
                              <div className="flex items-center gap-3 min-w-0">
                                <span className="text-sm font-bold text-gray-900 w-20 shrink-0">{row.employee_name}</span>
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
                                      const autoCalc=calcFuelPay(emp||{} as Employee,row.work_days||22,eff,fuelPriceMap)
                                      return (
                                        <div className="space-y-1.5">
                                          <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 rounded-lg border border-amber-200">
                                            <span className="text-xs text-amber-700 font-medium">🚗</span>
                                            <span className="text-xs text-amber-800">{emp?.car_type||'차량미등록'} / {fuelType}{dist?` / 편도 ${dist}km`:''}{price?` / ℓ당 ${formatKRW(price)}원`:''}</span>
                                          </div>
                                          <div className="flex items-center gap-2">
                                            <label className="w-24 text-sm text-gray-600 shrink-0">유류지원비</label>
                                            <input type="text" value={row.fuel_pay===0?'':formatKRW(row.fuel_pay)} onChange={e=>handleFieldChange(idx,'fuel_pay',e.target.value)} disabled={isF} placeholder="0"
                                              className="flex-1 text-right border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50 disabled:text-gray-400"/>
                                            <span className="text-xs text-gray-400 w-4">원</span>
                                          </div>
                                          <div className="flex items-center gap-2 pl-24">
                                            <span className="text-xs text-gray-500">연비</span>
                                            <input type="number" value={eff} min={1} max={50} step={0.5} onChange={e=>setFuelEfficiency(prev=>({...prev,[row.employee_id]:Number(e.target.value)}))} disabled={isF}
                                              className="w-16 text-center border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:bg-gray-50"/>
                                            <span className="text-xs text-gray-400">km/L</span>
                                            <span className="text-xs text-gray-500 ml-2">출근일수</span>
                                            <input type="number" value={row.work_days||22} min={1} max={31} onChange={e=>updateRow(idx,{work_days:Number(e.target.value)})} disabled={isF}
                                              className="w-14 text-center border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:bg-gray-50"/>
                                            <span className="text-xs text-gray-400">일</span>
                                            {!isF&&price>0&&dist>0&&(
                                              <button onClick={()=>handleFieldChange(idx,'fuel_pay',String(autoCalc))} className="ml-2 text-xs bg-amber-500 hover:bg-amber-600 text-white px-2.5 py-1 rounded-lg font-medium">
                                                자동계산 ({formatKRW(autoCalc)}원)
                                              </button>
                                            )}
                                          </div>
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
                          <button onClick={handleSaveDraft} disabled={loading} className="border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium px-5 py-2 rounded-lg disabled:opacity-50">{loading?'저장 중...':'💾 전체 저장'}</button>
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

const PrintSlip = forwardRef<HTMLDivElement, { row: PayrollRow; emp: Employee | undefined; leaveUsage: LeaveUsage[] }>(
  ({ row, emp, leaveUsage }, ref) => {
    const net = calcNet(row)
    const totalIncome = (row.base_pay||0)+(row.meal_pay||0)+(row.fuel_pay||0)+(row.bonus_pay||0)+(row.other_allowances||[]).reduce((s,a)=>s+a.amount,0)
    const totalDeduction = (row.national_pension||0)+(row.health_insurance||0)+(row.employment_insurance||0)+(row.long_term_care||0)+(row.income_tax||0)+(row.local_income_tax||0)+(row.income_tax_settle||0)+(row.local_tax_settle||0)+(row.special_tax_settle||0)
    const hasSettle = row.income_tax_settle!==0||row.local_tax_settle!==0||row.special_tax_settle!==0
    const [pyear,pmonth] = (row.pay_month||'').split('-').map(Number)
    const periodStart = `${pyear}.${String(pmonth).padStart(2,'0')}.01`
    const periodEnd = `${pyear}.${String(pmonth).padStart(2,'0')}.${new Date(pyear,pmonth,0).getDate()}`
    function getPayDate(y:number,m:number){const nm=m===12?1:m+1,ny=m===12?y+1:y;let d=new Date(ny,nm-1,10);while(d.getDay()===0||d.getDay()===6)d.setDate(d.getDate()-1);return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}

    return (
      <div ref={ref} className="hidden print:block p-8 text-xs font-sans text-gray-900" style={{fontFamily:'Malgun Gothic,맑은 고딕,sans-serif'}}>
        <style dangerouslySetInnerHTML={{__html:PRINT_STYLES}}/>
        <div className="text-center mb-4" style={{fontSize:'18px',fontWeight:'bold'}}>{row.pay_month} (주)보누스메이트 급여명세서</div>
        <table className="slip-table mb-3"><tbody>
          <tr><th className="label-col">근무기간</th><td colSpan={3}>{periodStart} ~ {periodEnd}</td></tr>
          <tr><th className="label-col">성명</th><td>{row.employee_name}</td><th className="label-col">사번</th><td>{emp?.employee_code||''}</td></tr>
          <tr><th className="label-col">직위</th><td>{emp?.position||''}</td><th className="label-col">입사일</th><td>{emp?.hire_date||''}</td></tr>
          <tr><th className="label-col">급여지급일</th><td>{getPayDate(pyear,pmonth)}</td><th className="label-col">급여계좌</th><td>{emp?.bank_name?`[${emp.bank_name}] ${emp.bank_account||''}`:'-'}</td></tr>
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
