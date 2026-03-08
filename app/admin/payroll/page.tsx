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
}

type OtherAllowance = { label: string; amount: number }

type PayrollRow = {
  id?: string
  employee_id: string
  employee_name: string
  year: number
  month: number
  // 지급 항목
  base_salary: number
  meal_allowance: number
  fuel_allowance: number
  bonus: number
  other_allowances: OtherAllowance[]  // 변동 기타임금
  // 공제 항목
  national_pension: number
  health_insurance: number
  employment_insurance: number
  long_term_care: number
  income_tax: number
  local_income_tax: number
  // 연말정산 (해당 월만 입력)
  income_tax_settle: number
  local_tax_settle: number
  special_tax_settle: number
  // 메모
  memo: string
  note: string
  status: 'draft' | 'final'
}

type LeaveUsage = {
  leave_type: string
  count: number
}

// ── 유틸 ────────────────────────────────────────────────
function formatKRW(n: number) {
  if (n === 0) return '0'
  return n.toLocaleString('ko-KR')
}
function parseNum(v: string) { return parseInt(v.replace(/,/g, ''), 10) || 0 }

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)
const LEAVE_TYPE_LABEL: Record<string, string> = {
  annual: '연차', half_am: '반차(오전)', half_pm: '반차(오후)', sick: '병가', special: '경조사',
  ANNUAL: '연차', HALF_AM: '반차(오전)', HALF_PM: '반차(오후)', SICK: '병가', SPECIAL: '경조사'
}
function leaveLabel(type: string) { return LEAVE_TYPE_LABEL[type] || LEAVE_TYPE_LABEL[type.toLowerCase()] || type }

// ── 빈 행 생성 ──────────────────────────────────────────
function emptyRow(emp: Employee, year: number, month: number): PayrollRow {
  return {
    employee_id: emp.id,
    employee_name: emp.name,
    year, month,
    base_salary: 0, meal_allowance: 0, fuel_allowance: 0, bonus: 0,
    other_allowances: [],
    national_pension: 0, health_insurance: 0, employment_insurance: 0,
    long_term_care: 0, income_tax: 0, local_income_tax: 0,
    income_tax_settle: 0, local_tax_settle: 0, special_tax_settle: 0,
    memo: '', note: '', status: 'draft',
  }
}

function calcNet(row: PayrollRow) {
  const income = row.base_salary + row.meal_allowance + row.fuel_allowance + row.bonus
    + row.other_allowances.reduce((s, a) => s + a.amount, 0)
  const deduction = row.national_pension + row.health_insurance + row.employment_insurance
    + row.long_term_care + row.income_tax + row.local_income_tax
    + row.income_tax_settle + row.local_tax_settle + row.special_tax_settle
  return income - deduction
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
  // 연말정산 모달
  const [settleModal, setSettleModal] = useState<{ empId: string; idx: number } | null>(null)
  const [settleDraft, setSettleDraft] = useState({ income_tax_settle: 0, local_tax_settle: 0, special_tax_settle: 0 })
  const printRef = useRef<HTMLDivElement>(null)
  const years = [new Date().getFullYear(), new Date().getFullYear() - 1, new Date().getFullYear() - 2]

  useEffect(() => { fetchEmployees() }, [])
  useEffect(() => { if (employees.length > 0) { fetchPayrollForMonth(); fetchLeaveUsage() } }, [selectedYear, selectedMonth, employees])
  useEffect(() => { if (tab === 'history') fetchHistory() }, [tab, historyYear])

  async function fetchEmployees() {
    const { data } = await supabase.from('employees').select('id, name, position, employee_code, hire_date, email, bank_name, bank_account').is('resign_date', null).order('name')
    const emps = data || []
    setEmployees(emps)
    const map: Record<string, Employee> = {}
    emps.forEach((e: Employee) => { map[e.id] = e })
    setEmpMap(map)
  }

  async function fetchLeaveUsage() {
    const firstDay = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`
    const lastDay = new Date(selectedYear, selectedMonth, 0).toISOString().slice(0, 10)
    const { data } = await supabase.from('leave_requests').select('employee_id, leave_type').gte('leave_date', firstDay).lte('leave_date', lastDay)
    const usage: Record<string, LeaveUsage[]> = {}
    for (const r of (data || [])) {
      if (!usage[r.employee_id]) usage[r.employee_id] = []
      const existing = usage[r.employee_id].find(u => u.leave_type === r.leave_type)
      if (existing) existing.count++
      else usage[r.employee_id].push({ leave_type: r.leave_type, count: 1 })
    }
    setLeaveUsage(usage)
  }

  async function fetchPayrollForMonth() {
    setFetchLoading(true)
    const { data: existing } = await supabase.from('payroll_draft').select('*').eq('year', selectedYear).eq('month', selectedMonth)
    const existingMap = new Map((existing || []).map((r: PayrollRow) => [r.employee_id, r]))
    const newRows: PayrollRow[] = employees.map((emp) => {
      const ex = existingMap.get(emp.id)
      if (ex) return { ...emptyRow(emp, selectedYear, selectedMonth), ...ex, other_allowances: ex.other_allowances || [] }
      return emptyRow(emp, selectedYear, selectedMonth)
    })
    setRows(newRows)
    setFetchLoading(false)
  }

  async function fetchHistory() {
    setFetchLoading(true)
    const { data } = await supabase.from('payroll_draft').select('*').eq('year', historyYear).order('month').order('employee_name')
    setSavedRows((data || []).map((r: PayrollRow) => ({ ...r, other_allowances: r.other_allowances || [] })))
    setFetchLoading(false)
  }

  function updateRow(idx: number, fields: Partial<PayrollRow>) {
    setRows(prev => {
      const next = [...prev]
      next[idx] = { ...next[idx], ...fields }
      return next
    })
  }

  function handleFieldChange(idx: number, field: keyof PayrollRow, value: string) {
    const numFields = ['base_salary','meal_allowance','fuel_allowance','bonus','national_pension','health_insurance','employment_insurance','long_term_care','income_tax','local_income_tax','income_tax_settle','local_tax_settle','special_tax_settle']
    if (numFields.includes(field)) updateRow(idx, { [field]: parseNum(value) } as Partial<PayrollRow>)
    else updateRow(idx, { [field]: value } as Partial<PayrollRow>)
  }

  function addOtherAllowance(idx: number) {
    const row = rows[idx]
    updateRow(idx, { other_allowances: [...row.other_allowances, { label: '', amount: 0 }] })
  }
  function updateOtherAllowance(idx: number, aIdx: number, field: 'label' | 'amount', value: string) {
    const row = rows[idx]
    const updated = row.other_allowances.map((a, i) => i === aIdx
      ? { ...a, [field]: field === 'amount' ? parseNum(value) : value }
      : a
    )
    updateRow(idx, { other_allowances: updated })
  }
  function removeOtherAllowance(idx: number, aIdx: number) {
    const row = rows[idx]
    updateRow(idx, { other_allowances: row.other_allowances.filter((_, i) => i !== aIdx) })
  }

  function buildPayload(row: PayrollRow) {
    return {
      employee_id: row.employee_id, employee_name: row.employee_name,
      year: row.year, month: row.month,
      base_salary: row.base_salary, meal_allowance: row.meal_allowance,
      fuel_allowance: row.fuel_allowance, bonus: row.bonus,
      other_allowances: row.other_allowances,
      national_pension: row.national_pension, health_insurance: row.health_insurance,
      employment_insurance: row.employment_insurance, long_term_care: row.long_term_care,
      income_tax: row.income_tax, local_income_tax: row.local_income_tax,
      income_tax_settle: row.income_tax_settle, local_tax_settle: row.local_tax_settle,
      special_tax_settle: row.special_tax_settle,
      net_salary: calcNet(row), memo: row.memo || null, note: row.note || null,
      status: row.status,
    }
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
      // 확정 상태라면 payroll_final도 동기화
      if (updatedRows.some(r => r.status === 'final')) {
        const finalPayloads = updatedRows.filter(r => r.status === 'final').map(r => ({ ...buildPayload(r), status: 'final' }))
        await supabase.from('payroll_final').upsert(finalPayloads, { onConflict: 'employee_id,year,month' })
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
    await supabase.from('payroll_draft').update({ status: 'draft' }).eq('year', selectedYear).eq('month', selectedMonth)
    setSuccess('수정 모드로 전환되었습니다. 수정 후 다시 최종 확정하세요.')
    fetchPayrollForMonth()
    setLoading(false)
  }

  async function handleFinalize() {
    if (!confirm(`${selectedYear}년 ${selectedMonth}월 급여를 최종 확정하시겠습니까?`)) return
    setLoading(true); setError('')
    await handleSaveDraft()
    const finalPayloads = rows.map(row => ({ ...buildPayload(row), status: 'final' }))
    const { error: finalError } = await supabase.from('payroll_final').upsert(finalPayloads, { onConflict: 'employee_id,year,month' })
    if (finalError) { setError('최종 확정 실패: ' + finalError.message) }
    else {
      await supabase.from('payroll_draft').update({ status: 'final' }).eq('year', selectedYear).eq('month', selectedMonth)
      setSuccess(`${selectedYear}년 ${selectedMonth}월 급여가 최종 확정되었습니다!`)
      fetchPayrollForMonth()
    }
    setLoading(false)
  }

  function handlePrint(row: PayrollRow, mode: 'print' | 'pdf' = 'print') {
    setPrintTarget(row)
    setTimeout(() => {
      if (mode === 'pdf') {
        const orig = document.title
        document.title = `${row.year}년${row.month}월_${row.employee_name}_급여명세서`
        window.print()
        setTimeout(() => { document.title = orig }, 1000)
      } else {
        window.print()
      }
    }, 300)
  }

  function applySettle() {
    if (!settleModal) return
    const { idx } = settleModal
    updateRow(idx, {
      income_tax_settle: settleDraft.income_tax_settle,
      local_tax_settle: settleDraft.local_tax_settle,
      special_tax_settle: settleDraft.special_tax_settle,
    })
    setSettleModal(null)
  }

  const totalBase = rows.reduce((s, r) => s + r.base_salary, 0)
  const totalNet = rows.reduce((s, r) => s + calcNet(r), 0)
  const isFinalized = rows.length > 0 && rows.every(r => r.status === 'final')

  return (
    <div className="min-h-screen bg-gray-50 print:bg-white">
      {/* 인쇄 영역 */}
      {printTarget && <PrintSlip row={printTarget} emp={empMap[printTarget.employee_id]} leaveUsage={leaveUsage[printTarget.employee_id] || []} ref={printRef} />}

      {/* 연말정산 입력 모달 */}
      {settleModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-100">
              <h3 className="text-base font-bold text-gray-900">🧾 연말정산 입력</h3>
              <p className="text-xs text-gray-500 mt-0.5">해당 연도 정산 시에만 입력하세요. 환급이면 음수(-) 입력.</p>
            </div>
            <div className="px-6 py-5 space-y-4">
              {([
                ['income_tax_settle', '연말정산 소득세'],
                ['local_tax_settle', '연말정산 지방소득세'],
                ['special_tax_settle', '연말정산 농특세'],
              ] as const).map(([field, label]) => (
                <div key={field} className="flex items-center gap-3">
                  <label className="w-36 text-sm text-gray-700 shrink-0 font-medium">{label}</label>
                  <input
                    type="number"
                    value={settleDraft[field] || ''}
                    onChange={e => setSettleDraft(p => ({ ...p, [field]: parseInt(e.target.value) || 0 }))}
                    placeholder="0 (환급은 음수 입력)"
                    className="flex-1 text-right border border-amber-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-amber-50"
                  />
                  <span className="text-xs text-gray-400">원</span>
                </div>
              ))}
              <p className="text-xs text-gray-400 bg-gray-50 rounded-lg p-3">
                💡 환급 받는 경우 음수(-) 값으로 입력하면 실지급액이 증가합니다.<br/>
                연말정산이 없는 월은 모두 0으로 두세요.
              </p>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex gap-3 justify-end">
              <button onClick={() => setSettleModal(null)}
                className="border border-gray-300 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-50">
                취소
              </button>
              <button onClick={applySettle}
                className="bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium px-5 py-2 rounded-lg">
                적용
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
          {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex justify-between">{error}<button onClick={() => setError('')}>✕</button></div>}
          {success && <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm flex justify-between">{success}<button onClick={() => setSuccess('')}>✕</button></div>}

          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            {/* 탭 */}
            <div className="flex border-b border-gray-200">
              {(['input', 'history'] as const).map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={`flex-1 py-3 text-sm font-medium transition-colors ${tab === t ? 'bg-blue-50 text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:bg-gray-50'}`}>
                  {t === 'input' ? '✏️ 급여 입력' : '📊 급여 이력'}
                </button>
              ))}
            </div>

            {tab === 'input' ? (
              <div>
                {/* 헤더 필터 */}
                <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-4 flex-wrap">
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-gray-700">연도</label>
                    <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))}
                      className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                      {years.map(y => <option key={y} value={y}>{y}년</option>)}
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-gray-700">월</label>
                    <select value={selectedMonth} onChange={e => setSelectedMonth(Number(e.target.value))}
                      className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                      {MONTHS.map(m => <option key={m} value={m}>{m}월</option>)}
                    </select>
                  </div>
                  {isFinalized && <span className="bg-green-100 text-green-700 text-xs font-medium px-2.5 py-1 rounded-full">✓ 최종 확정됨</span>}
                </div>

                {/* 합계 요약 */}
                {rows.length > 0 && (
                  <div className="px-6 py-3 bg-blue-50 border-b border-blue-100 flex gap-6 text-sm flex-wrap">
                    <span className="text-blue-700">대상 직원: <strong>{rows.length}명</strong></span>
                    <span className="text-blue-700">기본급 합계: <strong>{formatKRW(totalBase)}원</strong></span>
                    <span className="text-blue-700">실지급 합계: <strong>{formatKRW(totalNet)}원</strong></span>
                  </div>
                )}

                {fetchLoading ? <div className="py-16 text-center text-gray-400">불러오는 중...</div>
                : rows.length === 0 ? <div className="py-16 text-center text-gray-400">등록된 직원이 없습니다.</div>
                : (
                  <div className="divide-y divide-gray-100">
                    {rows.map((row, idx) => {
                      const net = calcNet(row)
                      const isOpen = expandedRow === row.employee_id
                      const empLeave = leaveUsage[row.employee_id] || []
                      const isF = row.status === 'final'

                      const totalIncome = row.base_salary + row.meal_allowance + row.fuel_allowance + row.bonus
                        + row.other_allowances.reduce((s, a) => s + a.amount, 0)
                      const totalDeduction = row.national_pension + row.health_insurance + row.employment_insurance
                        + row.long_term_care + row.income_tax + row.local_income_tax
                        + row.income_tax_settle + row.local_tax_settle + row.special_tax_settle

                      return (
                        <div key={row.employee_id}>
                          {/* 직원 요약 행 */}
                          <div
                            className="px-6 py-4 hover:bg-gray-50 cursor-pointer transition-colors"
                            onClick={() => setExpandedRow(isOpen ? null : row.employee_id)}
                          >
                            <div className="flex items-center justify-between gap-4">
                              <div className="flex items-center gap-3">
                                <span className="text-sm font-bold text-gray-900 w-20">{row.employee_name}</span>
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isF ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                  {isF ? '확정' : '초안'}
                                </span>
                                {empLeave.length > 0 && (
                                  <div className="flex gap-1">
                                    {empLeave.map(u => (
                                      <span key={u.leave_type} className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full">
                                        {leaveLabel(u.leave_type)} {u.count}회
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center gap-6 text-xs text-gray-500">
                                <span>지급 <strong className="text-gray-800">{formatKRW(totalIncome)}</strong></span>
                                <span>공제 <strong className="text-red-500">{formatKRW(totalDeduction)}</strong></span>
                                <span className="text-base font-bold text-blue-700">{formatKRW(net)}원</span>
                                <span className="text-gray-300">{isOpen ? '▲' : '▼'}</span>
                              </div>
                            </div>
                          </div>

                          {/* 펼침: 상세 입력 */}
                          {isOpen && (
                            <div className="px-6 pb-6 bg-gray-50 border-t border-gray-100">
                              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-5">

                                {/* ── 지급 항목 ── */}
                                <div className="bg-white rounded-xl border border-gray-200 p-4">
                                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">▶ 지급 항목</p>
                                  <div className="space-y-2.5">
                                    {([
                                      ['base_salary', '기본급'],
                                      ['meal_allowance', '식대'],
                                      ['fuel_allowance', '유류지원비'],
                                      ['bonus', '상여금'],
                                    ] as const).map(([field, label]) => (
                                      <div key={field} className="flex items-center gap-3">
                                        <label className="w-24 text-sm text-gray-600 shrink-0">{label}</label>
                                        <input
                                          type="text"
                                          value={row[field] === 0 ? '' : formatKRW(row[field] as number)}
                                          onChange={e => handleFieldChange(idx, field, e.target.value)}
                                          disabled={isF} placeholder="0"
                                          className="flex-1 text-right border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50 disabled:text-gray-400"
                                        />
                                        <span className="text-xs text-gray-400 w-4">원</span>
                                      </div>
                                    ))}

                                    {/* 기타 변동 수당 */}
                                    {row.other_allowances.map((a, aIdx) => (
                                      <div key={aIdx} className="flex items-center gap-2">
                                        <input
                                          type="text" value={a.label}
                                          onChange={e => updateOtherAllowance(idx, aIdx, 'label', e.target.value)}
                                          placeholder="항목명" disabled={isF}
                                          className="w-24 border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50"
                                        />
                                        <input
                                          type="text"
                                          value={a.amount === 0 ? '' : formatKRW(a.amount)}
                                          onChange={e => updateOtherAllowance(idx, aIdx, 'amount', e.target.value)}
                                          placeholder="0" disabled={isF}
                                          className="flex-1 text-right border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50"
                                        />
                                        <span className="text-xs text-gray-400">원</span>
                                        {!isF && <button onClick={() => removeOtherAllowance(idx, aIdx)} className="text-red-400 hover:text-red-600 text-sm">✕</button>}
                                      </div>
                                    ))}
                                    {!isF && (
                                      <button onClick={() => addOtherAllowance(idx)}
                                        className="w-full text-xs text-blue-500 hover:text-blue-700 border border-dashed border-blue-300 hover:border-blue-500 rounded-lg py-1.5 transition-colors">
                                        + 기타 항목 추가
                                      </button>
                                    )}
                                    <div className="border-t border-gray-100 pt-2 flex justify-between text-sm font-bold">
                                      <span className="text-gray-600">지급 합계</span>
                                      <span className="text-gray-900">{formatKRW(totalIncome)}원</span>
                                    </div>
                                  </div>
                                </div>

                                {/* ── 공제 항목 ── */}
                                <div className="bg-white rounded-xl border border-gray-200 p-4">
                                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">▶ 공제 항목</p>
                                  <div className="space-y-2.5">
                                    {([
                                      ['national_pension', '국민연금'],
                                      ['health_insurance', '건강보험'],
                                      ['employment_insurance', '고용보험'],
                                      ['long_term_care', '장기요양보험료'],
                                      ['income_tax', '소득세'],
                                      ['local_income_tax', '지방소득세'],
                                    ] as const).map(([field, label]) => (
                                      <div key={field} className="flex items-center gap-3">
                                        <label className="w-28 text-sm text-gray-600 shrink-0">{label}</label>
                                        <input
                                          type="text"
                                          value={row[field] === 0 ? '' : formatKRW(row[field] as number)}
                                          onChange={e => handleFieldChange(idx, field, e.target.value)}
                                          disabled={isF} placeholder="0"
                                          className="flex-1 text-right border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 disabled:bg-gray-50 disabled:text-gray-400"
                                        />
                                        <span className="text-xs text-gray-400 w-4">원</span>
                                      </div>
                                    ))}

                                    {/* 연말정산 버튼 */}
                                    <div className="border-t border-dashed border-amber-200 pt-2">
                                      <div className="flex items-center justify-between">
                                        <div className="text-xs text-amber-700">
                                          ◆ 연말정산
                                          {(row.income_tax_settle !== 0 || row.local_tax_settle !== 0 || row.special_tax_settle !== 0) && (
                                            <span className="ml-2 font-bold text-amber-900">
                                              ({formatKRW(row.income_tax_settle + row.local_tax_settle + row.special_tax_settle)}원 입력됨)
                                            </span>
                                          )}
                                        </div>
                                        {!isF && (
                                          <button
                                            onClick={() => {
                                              setSettleDraft({
                                                income_tax_settle: row.income_tax_settle,
                                                local_tax_settle: row.local_tax_settle,
                                                special_tax_settle: row.special_tax_settle,
                                              })
                                              setSettleModal({ empId: row.employee_id, idx })
                                            }}
                                            className="text-xs bg-amber-500 hover:bg-amber-600 text-white px-3 py-1 rounded-lg font-medium"
                                          >
                                            연말정산 입력
                                          </button>
                                        )}
                                      </div>
                                    </div>

                                    <div className="border-t border-gray-100 pt-2 flex justify-between text-sm font-bold">
                                      <span className="text-gray-600">공제 합계</span>
                                      <span className="text-red-600">-{formatKRW(totalDeduction)}원</span>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* 연차 사용 내역 */}
                              {empLeave.length > 0 && (
                                <div className="mt-4 bg-purple-50 rounded-xl border border-purple-100 p-4">
                                  <p className="text-xs font-bold text-purple-700 mb-2">📅 {selectedMonth}월 연차 사용 내역</p>
                                  <div className="flex gap-3 flex-wrap">
                                    {empLeave.map(u => (
                                      <span key={u.leave_type} className="text-sm text-purple-800 bg-white border border-purple-200 px-3 py-1 rounded-lg">
                                        {leaveLabel(u.leave_type)}: <strong>{u.count}회</strong>
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* 메모 */}
                              <div className="mt-4 bg-white rounded-xl border border-gray-200 p-4">
                                <p className="text-xs font-bold text-gray-500 mb-2">📝 메모</p>
                                <textarea
                                  value={row.memo}
                                  onChange={e => updateRow(idx, { memo: e.target.value })}
                                  disabled={isF}
                                  placeholder="급여 관련 메모를 입력하세요..."
                                  rows={2}
                                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50 resize-none"
                                />
                              </div>

                              {/* 실지급액 + 버튼 */}
                              <div className="mt-4 flex items-center justify-between flex-wrap gap-3">
                                <div className="flex items-center gap-3">
                                  <span className="text-sm text-gray-500">실지급액</span>
                                  <span className="text-2xl font-black text-blue-700">{formatKRW(net)}원</span>
                                  {isF && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">확정됨 — 하단 수정하기 버튼으로 편집</span>}
                                </div>
                                <div className="flex gap-2">
                                  {!isF && (
                                    <button onClick={() => handleSaveDraft()}
                                      className="border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg">
                                      💾 저장
                                    </button>
                                  )}
                                  <button onClick={() => handlePrint(row, 'print')}
                                    className="bg-gray-700 hover:bg-gray-800 text-white text-sm font-medium px-4 py-2 rounded-lg flex items-center gap-1.5">
                                    🖨️ 인쇄
                                  </button>
                                  <button onClick={() => handlePrint(row, 'pdf')}
                                    className="bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-4 py-2 rounded-lg flex items-center gap-1.5">
                                    📄 PDF
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}

                    {/* 하단 버튼 */}
                    <div className="px-6 py-4 border-t border-gray-100 flex gap-3 justify-end bg-white">
                      {isFinalized ? (
                        <>
                          <span className="flex items-center text-sm text-green-700 font-medium gap-1.5">
                            <span className="bg-green-100 text-green-700 text-xs px-2.5 py-1 rounded-full">✓ 최종 확정됨</span>
                          </span>
                          <button onClick={handleUnfinalize} disabled={loading}
                            className="border border-orange-300 hover:bg-orange-50 text-orange-600 text-sm font-medium px-5 py-2 rounded-lg disabled:opacity-50">
                            ✏️ 수정하기
                          </button>
                        </>
                      ) : (
                        <>
                          <button onClick={handleSaveDraft} disabled={loading}
                            className="border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium px-5 py-2 rounded-lg disabled:opacity-50">
                            {loading ? '저장 중...' : '💾 전체 저장'}
                          </button>
                          <button onClick={handleFinalize} disabled={loading}
                            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-5 py-2 rounded-lg disabled:opacity-50">
                            ✓ 최종 확정
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* ── 급여 이력 탭 ── */
              <div>
                <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
                  <label className="text-sm font-medium text-gray-700">연도</label>
                  <select value={historyYear} onChange={e => setHistoryYear(Number(e.target.value))}
                    className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {years.map(y => <option key={y} value={y}>{y}년</option>)}
                  </select>
                </div>
                {fetchLoading ? <div className="py-16 text-center text-gray-400">불러오는 중...</div>
                : savedRows.length === 0 ? <div className="py-16 text-center text-gray-400">급여 데이터가 없습니다.</div>
                : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-gray-500 text-xs">
                        <tr>
                          <th className="px-4 py-3 text-left font-medium">월</th>
                          <th className="px-4 py-3 text-left font-medium">직원</th>
                          <th className="px-4 py-3 text-right font-medium">기본급</th>
                          <th className="px-4 py-3 text-right font-medium">식대</th>
                          <th className="px-4 py-3 text-right font-medium">유류</th>
                          <th className="px-4 py-3 text-right font-medium">상여</th>
                          <th className="px-4 py-3 text-right font-medium">공제</th>
                          <th className="px-4 py-3 text-right font-medium text-blue-700">실지급</th>
                          <th className="px-4 py-3 text-center font-medium">상태</th>
                          <th className="px-4 py-3 text-center font-medium">출력</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {savedRows.map((row, idx) => {
                          const totalDed = row.national_pension + row.health_insurance + row.employment_insurance
                            + row.long_term_care + row.income_tax + row.local_income_tax
                            + row.income_tax_settle + row.local_tax_settle + row.special_tax_settle
                          return (
                            <tr key={idx} className="hover:bg-gray-50">
                              <td className="px-4 py-3 font-medium text-gray-700">{row.month}월</td>
                              <td className="px-4 py-3 text-gray-900 font-medium">{row.employee_name}</td>
                              <td className="px-4 py-3 text-right text-gray-600">{formatKRW(row.base_salary)}</td>
                              <td className="px-4 py-3 text-right text-gray-600">{formatKRW(row.meal_allowance)}</td>
                              <td className="px-4 py-3 text-right text-gray-600">{formatKRW(row.fuel_allowance)}</td>
                              <td className="px-4 py-3 text-right text-gray-600">{formatKRW(row.bonus)}</td>
                              <td className="px-4 py-3 text-right text-red-500">-{formatKRW(totalDed)}</td>
                              <td className="px-4 py-3 text-right font-bold text-blue-700">{formatKRW(calcNet(row))}원</td>
                              <td className="px-4 py-3 text-center">
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${row.status === 'final' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                  {row.status === 'final' ? '확정' : '초안'}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-center">
                                <div className="flex gap-1 justify-center">
                                  <button onClick={() => handlePrint(row, 'print')}
                                    className="text-xs text-gray-600 hover:text-gray-900 border border-gray-300 hover:border-gray-400 px-2 py-1 rounded-lg transition-colors">
                                    🖨️ 인쇄
                                  </button>
                                  <button onClick={() => handlePrint(row, 'pdf')}
                                    className="text-xs text-red-600 hover:text-red-800 border border-red-300 hover:border-red-400 px-2 py-1 rounded-lg transition-colors">
                                    📄 PDF
                                  </button>
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

// ── 급여명세서 출력 컴포넌트 ─────────────────────────────
import { forwardRef } from 'react'

const PrintSlip = forwardRef<HTMLDivElement, {
  row: PayrollRow
  emp: Employee | undefined
  leaveUsage: LeaveUsage[]
}>(({ row, emp, leaveUsage }, ref) => {
  const net = calcNet(row)
  const totalIncome = row.base_salary + row.meal_allowance + row.fuel_allowance + row.bonus
    + row.other_allowances.reduce((s, a) => s + a.amount, 0)
  const totalDeduction = row.national_pension + row.health_insurance + row.employment_insurance
    + row.long_term_care + row.income_tax + row.local_income_tax
    + row.income_tax_settle + row.local_tax_settle + row.special_tax_settle
  const hasSettle = row.income_tax_settle !== 0 || row.local_tax_settle !== 0 || row.special_tax_settle !== 0
  const payDate = `${row.year}-${String(row.month).padStart(2,'0')}-10`
  const periodStart = `${row.year}.${String(row.month).padStart(2,'0')}.01`
  const periodEnd = `${row.year}.${String(row.month).padStart(2,'0')}.${new Date(row.year, row.month, 0).getDate()}`

  return (
    <div ref={ref} className="hidden print:block p-8 text-xs font-sans text-gray-900" style={{ fontFamily: 'Malgun Gothic, 맑은 고딕, sans-serif' }}>
      <style>{`
        @media print {
          @page { size: A4; margin: 15mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .print\\:block { display: block !important; }
          .print\\:hidden { display: none !important; }
        }
        .slip-table { width: 100%; border-collapse: collapse; }
        .slip-table th, .slip-table td { border: 1px solid #999; padding: 4px 6px; }
        .slip-table th { background: #f0f0f0; text-align: center; font-weight: bold; }
        .section-header { background: #222; color: white; padding: 4px 8px; font-weight: bold; margin: 10px 0 4px; font-size: 11px; }
        .amount { text-align: right; }
        .label-col { background: #f5f5f5; font-weight: 600; width: 120px; }
      `}</style>

      {/* 제목 */}
      <div className="text-center mb-4">
        <div style={{ fontSize: '18px', fontWeight: 'bold' }}>{row.month.toString().padStart(2,'0')}월 (주)보누스메이트 급여명세서</div>
      </div>

      {/* 기본 정보 */}
      <table className="slip-table mb-3">
        <tbody>
          <tr>
            <th className="label-col">근무기간</th>
            <td colSpan={3}>{periodStart} ~ {periodEnd}</td>
          </tr>
          <tr>
            <th className="label-col">소속코드</th><td></td>
            <th className="label-col">개인코드</th><td>{emp?.employee_code || ''}</td>
          </tr>
          <tr>
            <th className="label-col">성명</th><td>{row.employee_name}</td>
            <th className="label-col">직위</th><td>{emp?.position || ''}</td>
          </tr>
          <tr>
            <th className="label-col">급여지급일</th><td>{payDate}</td>
            <th className="label-col">급여지급일</th><td></td>
          </tr>
          <tr>
            <th className="label-col">직무</th><td></td>
            <th className="label-col">직책</th><td>{emp?.position || ''}</td>
          </tr>
          <tr>
            <th className="label-col">급여계좌</th>
            <td colSpan={3}>{emp?.bank_name ? `[${emp.bank_name}] ${emp.bank_account || ''}` : ''}</td>
          </tr>
          <tr>
            <th className="label-col">입사일</th><td>{emp?.hire_date || ''}</td>
            <th className="label-col"></th><td></td>
          </tr>
        </tbody>
      </table>

      {/* 요약 */}
      <table className="slip-table mb-3">
        <tbody>
          <tr>
            <th className="label-col">소득합계</th>
            <td className="amount" style={{ width: '18%' }}>{formatKRW(totalIncome)}</td>
            <th className="label-col">공제합계</th>
            <td className="amount" style={{ width: '18%' }}>-{formatKRW(totalDeduction)}</td>
            <th style={{ background: '#1a3a6b', color: 'white', width: '90px' }}>실수령액</th>
            <td className="amount font-bold" style={{ width: '18%', background: '#e8f0fe' }}>{formatKRW(net)}</td>
            <th className="label-col">지급일</th>
            <td>{payDate}</td>
          </tr>
        </tbody>
      </table>

      {/* 소득/공제 상세 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        {/* 소득 세부 */}
        <div>
          <div className="section-header">▶ 소득 세부내역</div>
          <table className="slip-table">
            <thead><tr><th>항목</th><th>금액</th></tr></thead>
            <tbody>
              <tr><td className="label-col">기본급</td><td className="amount">{formatKRW(row.base_salary)}</td></tr>
              <tr><td className="label-col">식대</td><td className="amount">{formatKRW(row.meal_allowance)}</td></tr>
              <tr><td className="label-col">유류지원비</td><td className="amount">{formatKRW(row.fuel_allowance)}</td></tr>
              <tr><td className="label-col">상여금</td><td className="amount">{formatKRW(row.bonus)}</td></tr>
              {row.other_allowances.map((a, i) => (
                <tr key={i}><td className="label-col">{a.label || '기타'}</td><td className="amount">{formatKRW(a.amount)}</td></tr>
              ))}
              <tr style={{ background: '#e8f0fe', fontWeight: 'bold' }}>
                <td className="label-col">소득합계</td>
                <td className="amount">{formatKRW(totalIncome)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* 공제 세부 */}
        <div>
          <div className="section-header">▶ 공제 세부내역</div>
          <table className="slip-table">
            <thead><tr><th>항목</th><th>금액</th></tr></thead>
            <tbody>
              <tr><td className="label-col">국민연금</td><td className="amount">{formatKRW(row.national_pension)}</td></tr>
              <tr><td className="label-col">건강보험</td><td className="amount">{formatKRW(row.health_insurance)}</td></tr>
              <tr><td className="label-col">고용보험</td><td className="amount">{formatKRW(row.employment_insurance)}</td></tr>
              <tr><td className="label-col">장기요양보험료</td><td className="amount">{formatKRW(row.long_term_care)}</td></tr>
              <tr><td className="label-col">소득세</td><td className="amount">{formatKRW(row.income_tax)}</td></tr>
              <tr><td className="label-col">지방소득세</td><td className="amount">{formatKRW(row.local_income_tax)}</td></tr>
              {hasSettle && <>
                <tr style={{ background: '#fffbeb' }}><td className="label-col" colSpan={2} style={{ fontWeight: 'bold', color: '#92400e' }}>◆ 연말정산</td></tr>
                {row.income_tax_settle !== 0 && <tr><td className="label-col">연말정산소득세</td><td className="amount">{formatKRW(row.income_tax_settle)}</td></tr>}
                {row.local_tax_settle !== 0 && <tr><td className="label-col">연말정산지방소득세</td><td className="amount">{formatKRW(row.local_tax_settle)}</td></tr>}
                {row.special_tax_settle !== 0 && <tr><td className="label-col">연말정산농특세</td><td className="amount">{formatKRW(row.special_tax_settle)}</td></tr>}
              </>}
              <tr style={{ background: '#fee2e2', fontWeight: 'bold' }}>
                <td className="label-col">공제합계</td>
                <td className="amount">-{formatKRW(totalDeduction)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 연차 사용 내역 */}
      {leaveUsage.length > 0 && (
        <div className="mt-3">
          <div className="section-header">▶ {row.month}월 연차 사용 내역</div>
          <table className="slip-table">
            <thead><tr><th>구분</th><th>사용 횟수</th></tr></thead>
            <tbody>
              {leaveUsage.map(u => (
                <tr key={u.leave_type}>
                  <td className="label-col">{leaveLabel(u.leave_type)}</td>
                  <td className="amount">{u.count}회</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 메모 */}
      {row.memo && (
        <div className="mt-3">
          <div className="section-header">▶ 메모</div>
          <div style={{ border: '1px solid #999', padding: '6px 8px', minHeight: '32px', whiteSpace: 'pre-wrap' }}>{row.memo}</div>
        </div>
      )}

      {/* 비고/계산식 */}
      <div className="mt-3">
        <div className="section-header">▶ 항목별 산출식 (참고)</div>
        <div style={{ border: '1px solid #ccc', padding: '6px 8px', fontSize: '9px', lineHeight: '1.6', background: '#fafafa' }}>
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
          {row.note && <div className="mt-1" style={{ borderTop: '1px dashed #ccc', paddingTop: '4px' }}>*비고: {row.note}</div>}
        </div>
      </div>

      {/* 감사 문구 */}
      <div className="mt-4 text-center" style={{ fontSize: '11px', fontWeight: 'bold' }}>
        {row.employee_name} 님의 노고에 감사 드립니다.
      </div>
    </div>
  )
})
PrintSlip.displayName = 'PrintSlip'
