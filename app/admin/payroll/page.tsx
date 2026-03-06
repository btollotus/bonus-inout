'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Employee } from '@/types'

type PayrollRow = {
  id?: string
  employee_id: string
  employee_name: string
  year: number
  month: number
  base_salary: number
  bonus: number
  deduction: number
  net_salary: number
  note: string
  status: 'draft' | 'final'
}

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)

function formatKRW(n: number) {
  return n.toLocaleString('ko-KR') + '원'
}

export default function PayrollPage() {
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

  useEffect(() => {
    fetchEmployees()
  }, [])

  useEffect(() => {
    fetchPayrollForMonth()
  }, [selectedYear, selectedMonth, employees])

  async function fetchEmployees() {
    const { data } = await supabase
      .from('employees')
      .select('*')
      .is('resign_date', null)
      .order('name')
    setEmployees(data || [])
  }

  async function fetchPayrollForMonth() {
    if (employees.length === 0) { setFetchLoading(false); return }
    setFetchLoading(true)

    const { data: existing } = await supabase
      .from('payroll_draft')
      .select('*')
      .eq('year', selectedYear)
      .eq('month', selectedMonth)

    const existingMap = new Map((existing || []).map((r: PayrollRow) => [r.employee_id, r]))

    const newRows: PayrollRow[] = employees.map((emp) => {
      const ex = existingMap.get(emp.id)
      return ex
        ? { ...ex }
        : {
            employee_id: emp.id,
            employee_name: emp.name,
            year: selectedYear,
            month: selectedMonth,
            base_salary: 0,
            bonus: 0,
            deduction: 0,
            net_salary: 0,
            note: '',
            status: 'draft' as const,
          }
    })

    setRows(newRows)
    setFetchLoading(false)
  }

  async function fetchHistory() {
    setFetchLoading(true)
    const { data } = await supabase
      .from('payroll_draft')
      .select('*')
      .eq('year', historyYear)
      .order('month')
      .order('employee_name')
    setSavedRows(data || [])
    setFetchLoading(false)
  }

  useEffect(() => {
    if (tab === 'history') fetchHistory()
  }, [tab, historyYear])

  function handleRowChange(
    idx: number,
    field: 'base_salary' | 'bonus' | 'deduction' | 'note',
    value: string
  ) {
    setRows((prev) => {
      const next = [...prev]
      const row = { ...next[idx] }
      if (field === 'note') {
        row.note = value
      } else {
        const num = parseInt(value.replace(/,/g, ''), 10) || 0
        row[field] = num
      }
      row.net_salary = row.base_salary + row.bonus - row.deduction
      next[idx] = row
      return next
    })
  }

  async function handleSaveDraft() {
    setLoading(true)
    setError('')
    setSuccess('')

    for (const row of rows) {
      const payload = {
        employee_id: row.employee_id,
        employee_name: row.employee_name,
        year: row.year,
        month: row.month,
        base_salary: row.base_salary,
        bonus: row.bonus,
        deduction: row.deduction,
        net_salary: row.net_salary,
        note: row.note || null,
        status: 'draft',
      }

      if (row.id) {
        await supabase.from('payroll_draft').update(payload).eq('id', row.id)
      } else {
        const { data } = await supabase.from('payroll_draft').insert([payload]).select().single()
        if (data) row.id = data.id
      }
    }

    setSuccess('임시저장 완료되었습니다.')
    fetchPayrollForMonth()
    setLoading(false)
  }

  async function handleFinalize() {
    if (!confirm(`${selectedYear}년 ${selectedMonth}월 급여를 최종 확정하시겠습니까?\n확정 후에는 payroll_final로 이동됩니다.`)) return
    setLoading(true)
    setError('')

    // 먼저 draft 저장
    await handleSaveDraft()

    // payroll_final에 upsert
    const finalPayloads = rows.map((row) => ({
      employee_id: row.employee_id,
      employee_name: row.employee_name,
      year: row.year,
      month: row.month,
      base_salary: row.base_salary,
      bonus: row.bonus,
      deduction: row.deduction,
      net_salary: row.net_salary,
      note: row.note || null,
      status: 'final',
    }))

    const { error: finalError } = await supabase
      .from('payroll_final')
      .upsert(finalPayloads, { onConflict: 'employee_id,year,month' })

    if (finalError) {
      setError('최종 확정 실패: ' + finalError.message)
    } else {
      // draft status를 final로 업데이트
      await supabase
        .from('payroll_draft')
        .update({ status: 'final' })
        .eq('year', selectedYear)
        .eq('month', selectedMonth)

      setSuccess(`${selectedYear}년 ${selectedMonth}월 급여가 최종 확정되었습니다!`)
      fetchPayrollForMonth()
    }
    setLoading(false)
  }

  const totalNet = rows.reduce((sum, r) => sum + r.net_salary, 0)
  const totalBase = rows.reduce((sum, r) => sum + r.base_salary, 0)
  const isFinalized = rows.length > 0 && rows.every((r) => r.status === 'final')

  const years = [new Date().getFullYear(), new Date().getFullYear() - 1]

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">급여명세서 입력</h1>
            <p className="text-xs text-gray-500 mt-0.5">관리자 전용 · payroll_draft → payroll_final 확정</p>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-5">
        {/* Alerts */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm flex justify-between">
            {error}<button onClick={() => setError('')}>✕</button>
          </div>
        )}
        {success && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-md text-sm flex justify-between">
            {success}<button onClick={() => setSuccess('')}>✕</button>
          </div>
        )}

        {/* Tabs */}
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
          <div className="flex border-b border-gray-200">
            {(['input', 'history'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${
                  tab === t ? 'bg-blue-50 text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:bg-gray-50'
                }`}
              >
                {t === 'input' ? '✏️ 급여 입력' : '📊 급여 이력'}
              </button>
            ))}
          </div>

          {tab === 'input' ? (
            <div>
              {/* Month selector */}
              <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-gray-700">연도</label>
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(Number(e.target.value))}
                    className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {years.map((y) => <option key={y} value={y}>{y}년</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-gray-700">월</label>
                  <select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(Number(e.target.value))}
                    className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {MONTHS.map((m) => <option key={m} value={m}>{m}월</option>)}
                  </select>
                </div>
                {isFinalized && (
                  <span className="bg-green-100 text-green-700 text-xs font-medium px-2.5 py-1 rounded-full">
                    ✓ 최종 확정됨
                  </span>
                )}
              </div>

              {/* Summary bar */}
              {rows.length > 0 && (
                <div className="px-6 py-3 bg-blue-50 border-b border-blue-100 flex gap-6 text-sm">
                  <span className="text-blue-700">
                    대상 직원: <strong>{rows.length}명</strong>
                  </span>
                  <span className="text-blue-700">
                    기본급 합계: <strong>{formatKRW(totalBase)}</strong>
                  </span>
                  <span className="text-blue-700">
                    실지급 합계: <strong>{formatKRW(totalNet)}</strong>
                  </span>
                </div>
              )}

              {fetchLoading ? (
                <div className="py-12 text-center text-gray-400 text-sm">불러오는 중...</div>
              ) : rows.length === 0 ? (
                <div className="py-12 text-center text-gray-400 text-sm">등록된 직원이 없습니다.</div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-gray-500 text-xs">
                        <tr>
                          <th className="px-4 py-3 text-left font-medium w-28">직원명</th>
                          <th className="px-4 py-3 text-right font-medium">기본급</th>
                          <th className="px-4 py-3 text-right font-medium">상여/수당</th>
                          <th className="px-4 py-3 text-right font-medium">공제액</th>
                          <th className="px-4 py-3 text-right font-medium text-blue-700">실지급액</th>
                          <th className="px-4 py-3 text-left font-medium">비고</th>
                          <th className="px-4 py-3 text-center font-medium">상태</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {rows.map((row, idx) => (
                          <tr key={row.employee_id} className="hover:bg-gray-50">
                            <td className="px-4 py-2 font-medium text-gray-900">{row.employee_name}</td>
                            {(['base_salary', 'bonus', 'deduction'] as const).map((field) => (
                              <td key={field} className="px-4 py-2">
                                <input
                                  type="text"
                                  value={row[field] === 0 ? '' : row[field].toLocaleString('ko-KR')}
                                  onChange={(e) => handleRowChange(idx, field, e.target.value)}
                                  disabled={row.status === 'final'}
                                  placeholder="0"
                                  className="w-full text-right border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:bg-gray-50 disabled:text-gray-400"
                                />
                              </td>
                            ))}
                            <td className="px-4 py-2 font-semibold text-blue-700 text-right whitespace-nowrap">
                              {formatKRW(row.net_salary)}
                            </td>
                            <td className="px-4 py-2">
                              <input
                                type="text"
                                value={row.note}
                                onChange={(e) => handleRowChange(idx, 'note', e.target.value)}
                                disabled={row.status === 'final'}
                                placeholder="비고"
                                className="w-full border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:bg-gray-50 disabled:text-gray-400"
                              />
                            </td>
                            <td className="px-4 py-2 text-center">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                row.status === 'final'
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-yellow-100 text-yellow-700'
                              }`}>
                                {row.status === 'final' ? '확정' : '초안'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {!isFinalized && (
                    <div className="px-6 py-4 border-t border-gray-100 flex gap-3 justify-end">
                      <button
                        onClick={handleSaveDraft}
                        disabled={loading}
                        className="border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium px-5 py-2 rounded-md transition-colors disabled:opacity-50"
                      >
                        {loading ? '저장 중...' : '💾 임시저장'}
                      </button>
                      <button
                        onClick={handleFinalize}
                        disabled={loading}
                        className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-5 py-2 rounded-md transition-colors disabled:opacity-50"
                      >
                        ✓ 최종 확정
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            /* History Tab */
            <div>
              <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
                <label className="text-sm font-medium text-gray-700">연도</label>
                <select
                  value={historyYear}
                  onChange={(e) => setHistoryYear(Number(e.target.value))}
                  className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {years.map((y) => <option key={y} value={y}>{y}년</option>)}
                </select>
              </div>

              {fetchLoading ? (
                <div className="py-10 text-center text-gray-400 text-sm">불러오는 중...</div>
              ) : savedRows.length === 0 ? (
                <div className="py-10 text-center text-gray-400 text-sm">급여 데이터가 없습니다.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-500 text-xs">
                      <tr>
                        <th className="px-4 py-3 text-left font-medium">월</th>
                        <th className="px-4 py-3 text-left font-medium">직원</th>
                        <th className="px-4 py-3 text-right font-medium">기본급</th>
                        <th className="px-4 py-3 text-right font-medium">상여</th>
                        <th className="px-4 py-3 text-right font-medium">공제</th>
                        <th className="px-4 py-3 text-right font-medium">실지급</th>
                        <th className="px-4 py-3 text-center font-medium">상태</th>
                        <th className="px-4 py-3 text-left font-medium">비고</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {savedRows.map((row, idx) => (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-gray-700">{row.month}월</td>
                          <td className="px-4 py-3 text-gray-900 font-medium">{row.employee_name}</td>
                          <td className="px-4 py-3 text-right text-gray-600">{formatKRW(row.base_salary)}</td>
                          <td className="px-4 py-3 text-right text-gray-600">{formatKRW(row.bonus)}</td>
                          <td className="px-4 py-3 text-right text-red-500">{formatKRW(row.deduction)}</td>
                          <td className="px-4 py-3 text-right font-bold text-blue-700">{formatKRW(row.net_salary)}</td>
                          <td className="px-4 py-3 text-center">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              row.status === 'final'
                                ? 'bg-green-100 text-green-700'
                                : 'bg-yellow-100 text-yellow-700'
                            }`}>
                              {row.status === 'final' ? '확정' : '초안'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-500 text-xs">{row.note || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
