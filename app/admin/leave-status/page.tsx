'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/browser'

type LeaveRequest = {
  id: string
  user_id: string
  employee_id: string | null
  employee_name: string
  leave_date: string
  leave_type: string
  note: string | null
  status: string
  days_used: number
  year: number
}

const LEAVE_TYPE_LABELS: Record<string, string> = {
  ANNUAL: '연차', HALF_AM: '반차(오전)', HALF_PM: '반차(오후)', SICK: '병가', FRIDAY_OFF: '금요일휴무',
}

const LEAVE_TYPE_SHORT: Record<string, string> = {
  ANNUAL: '연', half_am: '반↑', half_pm: '반↓', sick: '병', special: '특',
}

const LEAVE_COLORS: Record<string, string> = {
  ANNUAL:   'bg-blue-100 text-blue-800 border-blue-200',
  HALF_AM:  'bg-sky-100 text-sky-800 border-sky-200',
  HALF_PM:  'bg-cyan-100 text-cyan-800 border-cyan-200',
  SICK:     'bg-red-100 text-red-700 border-red-200',
  FRIDAY_OFF: 'bg-purple-100 text-purple-800 border-purple-200',
}

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  pending:  { label: '검토중', className: 'bg-yellow-100 text-yellow-700' },
  approved: { label: '승인',   className: 'bg-green-100 text-green-700' },
  rejected: { label: '반려',   className: 'bg-red-100 text-red-700' },
}

type EmployeeSummary = {
  employee_name: string
  employee_id: string | null
  granted: number
  used: number
  remaining: number
  requests: LeaveRequest[]
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

export default function LeaveStatusPage({ role }: { role?: string }) {
  const supabase = createClient()
  const isAdmin = role === 'ADMIN'

  const [allRequests, setAllRequests] = useState<LeaveRequest[]>([])
  const [summaries, setSummaries] = useState<EmployeeSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth()) // 0-indexed
  const [tab, setTab] = useState<'calendar' | 'summary' | 'requests'>('calendar')
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all')
  const [error, setError] = useState('')
  const years = [new Date().getFullYear(), new Date().getFullYear() - 1]

  useEffect(() => { fetchLeaveData() }, [selectedYear])

  async function fetchLeaveData() {
    setLoading(true); setError('')
    const { data: requests, error } = await supabase
      .from('leave_requests')
      .select('*')
      .eq('year', selectedYear)
      .order('leave_date', { ascending: true })

    if (error) { setError(error.message); setLoading(false); return }
    const allReqs = requests || []
    setAllRequests(allReqs)

    // 직원별 집계
    const byEmployee: Record<string, EmployeeSummary> = {}
    for (const req of allReqs) {
      if (!byEmployee[req.employee_name]) {
        byEmployee[req.employee_name] = { employee_name: req.employee_name, employee_id: req.employee_id, granted: 15, used: 0, remaining: 15, requests: [] }
      }
      byEmployee[req.employee_name].requests.push(req)
      if (req.status !== 'rejected') byEmployee[req.employee_name].used += Number(req.days_used)
    }

    const { data: balances } = await supabase.from('leave_balance').select('*').eq('year', selectedYear)
    if (balances) {
      for (const b of balances) {
        const match = Object.values(byEmployee).find((s) => s.employee_id === b.employee_id)
        if (match) match.granted = b.total_granted
      }
    }
    for (const s of Object.values(byEmployee)) s.remaining = s.granted - s.used
    setSummaries(Object.values(byEmployee).sort((a, b) => a.employee_name.localeCompare(b.employee_name)))
    setLoading(false)
  }

  async function handleApprove(id: string) {
    const { error } = await supabase.from('leave_requests').update({ status: 'approved' }).eq('id', id)
    if (error) setError(error.message)
    else fetchLeaveData()
  }

  async function handleReject(id: string) {
    const reason = prompt('반려 사유를 입력하세요 (선택):')
    if (reason === null) return
    const { error } = await supabase.from('leave_requests').update({ status: 'rejected', ...(reason ? { note: reason } : {}) }).eq('id', id)
    if (error) setError(error.message)
    else fetchLeaveData()
  }

  // ── 캘린더 계산 ──────────────────────────────────────────────
  const calendarYear = calendarMonth < 0
    ? selectedYear - 1
    : calendarMonth > 11
    ? selectedYear + 1
    : selectedYear

  const normalizedMonth = ((calendarMonth % 12) + 12) % 12

  const firstDay = new Date(calendarYear, normalizedMonth, 1).getDay()
  const daysInMonth = new Date(calendarYear, normalizedMonth + 1, 0).getDate()

  // 해당 월의 승인된 연차 목록
  const monthKey = `${calendarYear}-${String(normalizedMonth + 1).padStart(2, '0')}`
  const monthRequests = allRequests.filter(
    (r) => r.leave_date.startsWith(monthKey) && r.status === 'approved'
  )

  // 날짜별 신청 map
  const dayMap: Record<number, LeaveRequest[]> = {}
  for (const req of monthRequests) {
    const day = parseInt(req.leave_date.split('-')[2])
    if (!dayMap[day]) dayMap[day] = []
    dayMap[day].push(req)
  }

  const pendingCount = allRequests.filter((r) => r.status === 'pending').length
  const filteredRequests = filterStatus === 'all' ? allRequests : allRequests.filter((r) => r.status === filterStatus)

  function prevMonth() { setCalendarMonth((m) => m - 1) }
  function nextMonth() { setCalendarMonth((m) => m + 1) }

  const calendarCells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (calendarCells.length % 7 !== 0) calendarCells.push(null)

  const today = new Date()
  const isToday = (day: number) =>
    today.getFullYear() === calendarYear && today.getMonth() === normalizedMonth && today.getDate() === day

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">연차 현황</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              {isAdmin ? '관리자 · 승인/반려 처리 가능' : '전직원 조회 가능 · 일정 참고 후 연차 신청하세요'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {isAdmin && pendingCount > 0 && (
              <span className="bg-red-100 text-red-700 text-xs font-bold px-2.5 py-1 rounded-full animate-pulse">
                승인 대기 {pendingCount}건
              </span>
            )}
            <select value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              {years.map((y) => <option key={y} value={y}>{y}년</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6 space-y-5">
        {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">{error}</div>}

        <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-gray-200">
            {([
              { key: 'calendar', label: '📅 캘린더' },
              { key: 'summary',  label: '👥 직원별 현황' },
              ...(isAdmin ? [{ key: 'requests', label: `📋 신청 내역${pendingCount > 0 ? ` (대기 ${pendingCount})` : ''}` }] : []),
            ] as { key: string; label: string }[]).map((t) => (
              <button key={t.key} onClick={() => setTab(t.key as typeof tab)}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${tab === t.key ? 'bg-blue-50 text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:bg-gray-50'}`}>
                {t.label}
              </button>
            ))}
          </div>

          {/* ── 캘린더 탭 ── */}
          {tab === 'calendar' && (
            <div className="p-5">
              {/* 월 이동 */}
              <div className="flex items-center justify-between mb-4">
                <button onClick={prevMonth} className="p-2 rounded-md hover:bg-gray-100 text-gray-600 transition-colors">◀</button>
                <h2 className="text-base font-bold text-gray-800">
                  {calendarYear}년 {normalizedMonth + 1}월
                </h2>
                <button onClick={nextMonth} className="p-2 rounded-md hover:bg-gray-100 text-gray-600 transition-colors">▶</button>
              </div>

              {/* 요일 헤더 */}
              <div className="grid grid-cols-7 mb-1">
                {WEEKDAYS.map((d, i) => (
                  <div key={d} className={`text-center text-xs font-semibold py-2 ${i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-gray-500'}`}>{d}</div>
                ))}
              </div>

              {/* 날짜 그리드 */}
              <div className="grid grid-cols-7 gap-1">
                {calendarCells.map((day, idx) => {
                  const col = idx % 7
                  const isSun = col === 0
                  const isSat = col === 6
                  const reqs = day ? (dayMap[day] || []) : []
                  return (
                    <div key={idx}
                      className={`min-h-[80px] rounded-lg border p-1.5 ${
                        day
                          ? isToday(day)
                            ? 'border-blue-400 bg-blue-50'
                            : 'border-gray-100 bg-white hover:bg-gray-50'
                          : 'border-transparent bg-gray-50/50'
                      }`}>
                      {day && (
                        <>
                          <div className={`text-xs font-semibold mb-1 ${isToday(day) ? 'text-blue-600' : isSun ? 'text-red-500' : isSat ? 'text-blue-500' : 'text-gray-700'}`}>
                            {day}
                          </div>
                          <div className="space-y-0.5">
                            {reqs.slice(0, 3).map((req, i) => (
                              <div key={i} title={`${req.employee_name} · ${LEAVE_TYPE_LABELS[req.leave_type] ?? req.leave_type}`}
                                className={`text-xs px-1 py-0.5 rounded border truncate ${LEAVE_COLORS[req.leave_type] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                                {req.employee_name} <span className="opacity-70">{LEAVE_TYPE_SHORT[req.leave_type] ?? ''}</span>
                              </div>
                            ))}
                            {reqs.length > 3 && (
                              <div className="text-xs text-gray-400 pl-1">+{reqs.length - 3}명</div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* 범례 */}
              <div className="flex flex-wrap gap-3 mt-4 pt-4 border-t border-gray-100">
                {Object.entries(LEAVE_TYPE_LABELS).map(([key, label]) => (
                  <div key={key} className="flex items-center gap-1.5">
                    <div className={`w-3 h-3 rounded border ${LEAVE_COLORS[key]}`} />
                    <span className="text-xs text-gray-500">{label}</span>
                  </div>
                ))}
                <span className="text-xs text-gray-400 ml-2">* 승인된 연차만 표시</span>
              </div>
            </div>
          )}

          {/* ── 직원별 현황 탭 ── */}
          {tab === 'summary' && (
            loading ? <div className="py-12 text-center text-gray-400 text-sm">불러오는 중...</div>
            : summaries.length === 0 ? <div className="py-12 text-center text-gray-400 text-sm">{selectedYear}년 데이터가 없습니다.</div>
            : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">직원명</th>
                      <th className="px-4 py-3 text-center font-medium">부여</th>
                      <th className="px-4 py-3 text-center font-medium">사용</th>
                      <th className="px-4 py-3 text-center font-medium">잔여</th>
                      <th className="px-4 py-3 text-center font-medium">사용률</th>
                      <th className="px-4 py-3 text-left font-medium">예정 휴가</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {summaries.map((s) => {
                      const usageRate = s.granted > 0 ? Math.round((s.used / s.granted) * 100) : 0
                      const upcoming = s.requests
                        .filter((r) => r.status === 'approved' && new Date(r.leave_date) >= new Date())
                        .slice(0, 2)
                      return (
                        <tr key={s.employee_name} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-gray-900">{s.employee_name}</td>
                          <td className="px-4 py-3 text-center text-blue-600 font-semibold">{s.granted}일</td>
                          <td className="px-4 py-3 text-center text-orange-500 font-semibold">{s.used}일</td>
                          <td className={`px-4 py-3 text-center font-bold ${s.remaining <= 3 ? 'text-red-600' : 'text-green-600'}`}>{s.remaining}일</td>
                          <td className="px-4 py-3 text-center">
                            <div className="flex items-center gap-2 justify-center">
                              <div className="w-20 bg-gray-200 rounded-full h-1.5">
                                <div className={`h-1.5 rounded-full ${usageRate >= 80 ? 'bg-red-500' : usageRate >= 50 ? 'bg-orange-400' : 'bg-green-500'}`}
                                  style={{ width: `${Math.min(usageRate, 100)}%` }} />
                              </div>
                              <span className="text-xs text-gray-500 w-8">{usageRate}%</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              {upcoming.length === 0
                                ? <span className="text-xs text-gray-300">-</span>
                                : upcoming.map((r, i) => (
                                  <span key={i} className={`text-xs px-1.5 py-0.5 rounded border ${LEAVE_COLORS[r.leave_type] ?? 'bg-gray-100 border-gray-200 text-gray-600'}`}>
                                    {r.leave_date.slice(5)} {LEAVE_TYPE_SHORT[r.leave_type] ?? ''}
                                  </span>
                                ))
                              }
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )
          )}

          {/* ── 신청 내역 탭 (관리자만) ── */}
          {tab === 'requests' && isAdmin && (
            <div>
              <div className="px-4 py-3 border-b border-gray-100 flex gap-2 flex-wrap">
                {(['all', 'pending', 'approved', 'rejected'] as const).map((s) => (
                  <button key={s} onClick={() => setFilterStatus(s)}
                    className={`text-xs px-3 py-1 rounded-full transition-colors ${filterStatus === s ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                    {s === 'all' ? '전체' : STATUS_LABEL[s].label}{s === 'pending' && pendingCount > 0 ? ` (${pendingCount})` : ''}
                  </button>
                ))}
              </div>
              {loading ? <div className="py-10 text-center text-gray-400 text-sm">불러오는 중...</div>
              : filteredRequests.length === 0 ? <div className="py-10 text-center text-gray-400 text-sm">해당하는 신청이 없습니다.</div>
              : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                      <tr>
                        <th className="px-4 py-3 text-left font-medium">직원</th>
                        <th className="px-4 py-3 text-left font-medium">날짜</th>
                        <th className="px-4 py-3 text-left font-medium">유형</th>
                        <th className="px-4 py-3 text-center font-medium">차감</th>
                        <th className="px-4 py-3 text-left font-medium">사유</th>
                        <th className="px-4 py-3 text-center font-medium">상태</th>
                        <th className="px-4 py-3 text-center font-medium">처리</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredRequests.map((req) => {
                        const statusInfo = STATUS_LABEL[req.status] ?? { label: req.status, className: 'bg-gray-100 text-gray-600' }
                        return (
                          <tr key={req.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 font-medium text-gray-900">{req.employee_name}</td>
                            <td className="px-4 py-3 text-gray-600">{req.leave_date}</td>
                            <td className="px-4 py-3 text-gray-600">{LEAVE_TYPE_LABELS[req.leave_type] ?? req.leave_type}</td>
                            <td className="px-4 py-3 text-center text-orange-500 font-medium">{req.days_used}일</td>
                            <td className="px-4 py-3 text-gray-500 max-w-xs truncate">{req.note || '-'}</td>
                            <td className="px-4 py-3 text-center">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusInfo.className}`}>{statusInfo.label}</span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              {req.status === 'pending' ? (
                                <div className="flex gap-1 justify-center">
                                  <button onClick={() => handleApprove(req.id)} className="text-xs bg-green-600 hover:bg-green-700 text-white px-2.5 py-1 rounded">승인</button>
                                  <button onClick={() => handleReject(req.id)} className="text-xs bg-red-500 hover:bg-red-600 text-white px-2.5 py-1 rounded">반려</button>
                                </div>
                              ) : <span className="text-xs text-gray-300">처리완료</span>}
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
  )
}
