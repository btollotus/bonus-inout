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
  attended: boolean
  year: number
}

const LEAVE_TYPE_LABELS: Record<string, string> = {
  annual: '연차', half_am: '반차(오전)', half_pm: '반차(오후)', sick: '병가', special: '특별',
}

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  pending: { label: '검토중', className: 'bg-yellow-100 text-yellow-700' },
  approved: { label: '승인', className: 'bg-green-100 text-green-700' },
  rejected: { label: '반려', className: 'bg-red-100 text-red-700' },
}

type EmployeeSummary = {
  employee_name: string
  employee_id: string | null
  granted: number
  used: number
  remaining: number
  requests: LeaveRequest[]
}

export default function LeaveStatusPage() {
  const supabase = createClient()
  const [summaries, setSummaries] = useState<EmployeeSummary[]>([])
  const [allRequests, setAllRequests] = useState<LeaveRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [tab, setTab] = useState<'summary' | 'requests'>('summary')
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all')
  const [error, setError] = useState('')
  const years = [new Date().getFullYear(), new Date().getFullYear() - 1]

  useEffect(() => { fetchLeaveData() }, [selectedYear])

  async function fetchLeaveData() {
    setLoading(true); setError('')
    const { data: requests, error } = await supabase.from('leave_requests').select('*').eq('year', selectedYear).order('leave_date', { ascending: false })
    if (error) { setError(error.message); setLoading(false); return }

    const allReqs = requests || []
    setAllRequests(allReqs)

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

  const filteredRequests = filterStatus === 'all' ? allRequests : allRequests.filter((r) => r.status === filterStatus)
  const pendingCount = allRequests.filter((r) => r.status === 'pending').length

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">연차 현황 조회</h1>
            <p className="text-xs text-gray-500 mt-0.5">관리자 전용 · 전직원 연차 부여/사용/잔여 현황</p>
          </div>
          <div className="flex items-center gap-3">
            {pendingCount > 0 && <span className="bg-red-100 text-red-700 text-xs font-bold px-2.5 py-1 rounded-full animate-pulse">승인 대기 {pendingCount}건</span>}
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
          <div className="flex border-b border-gray-200">
            {(['summary', 'requests'] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${tab === t ? 'bg-blue-50 text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:bg-gray-50'}`}>
                {t === 'summary' ? '👥 직원별 연차 현황' : `📋 전체 신청 내역${pendingCount > 0 ? ` (대기 ${pendingCount})` : ''}`}
              </button>
            ))}
          </div>
          {tab === 'summary' ? (
            loading ? <div className="py-12 text-center text-gray-400 text-sm">불러오는 중...</div>
            : summaries.length === 0 ? <div className="py-12 text-center text-gray-400 text-sm">{selectedYear}년 데이터가 없습니다.</div>
            : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">직원명</th>
                      <th className="px-4 py-3 text-center font-medium">부여 연차</th>
                      <th className="px-4 py-3 text-center font-medium">사용</th>
                      <th className="px-4 py-3 text-center font-medium">잔여</th>
                      <th className="px-4 py-3 text-center font-medium">사용률</th>
                      <th className="px-4 py-3 text-left font-medium">최근 신청</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {summaries.map((s) => {
                      const usageRate = s.granted > 0 ? Math.round((s.used / s.granted) * 100) : 0
                      const lastReq = s.requests[0]
                      return (
                        <tr key={s.employee_name} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-gray-900">{s.employee_name}</td>
                          <td className="px-4 py-3 text-center text-blue-600 font-semibold">{s.granted}일</td>
                          <td className="px-4 py-3 text-center text-orange-500 font-semibold">{s.used}일</td>
                          <td className={`px-4 py-3 text-center font-bold ${s.remaining <= 3 ? 'text-red-600' : 'text-green-600'}`}>{s.remaining}일</td>
                          <td className="px-4 py-3 text-center">
                            <div className="flex items-center gap-2 justify-center">
                              <div className="w-20 bg-gray-200 rounded-full h-1.5">
                                <div className={`h-1.5 rounded-full ${usageRate >= 80 ? 'bg-red-500' : usageRate >= 50 ? 'bg-orange-400' : 'bg-green-500'}`} style={{ width: `${Math.min(usageRate, 100)}%` }} />
                              </div>
                              <span className="text-xs text-gray-500 w-8">{usageRate}%</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500">
                            {lastReq ? <>{lastReq.leave_date} · <span className={`px-1.5 py-0.5 rounded text-xs ${STATUS_LABEL[lastReq.status]?.className ?? ''}`}>{STATUS_LABEL[lastReq.status]?.label ?? lastReq.status}</span></> : '-'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            <div>
              <div className="px-4 py-3 border-b border-gray-100 flex gap-2">
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
                            <td className="px-4 py-3 text-center"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusInfo.className}`}>{statusInfo.label}</span></td>
                            <td className="px-4 py-3 text-center">
                              {req.status === 'pending' ? (
                                <div className="flex gap-1 justify-center">
                                  <button onClick={() => handleApprove(req.id)} className="text-xs bg-green-600 hover:bg-green-700 text-white px-2.5 py-1 rounded transition-colors">승인</button>
                                  <button onClick={() => handleReject(req.id)} className="text-xs bg-red-500 hover:bg-red-600 text-white px-2.5 py-1 rounded transition-colors">반려</button>
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
