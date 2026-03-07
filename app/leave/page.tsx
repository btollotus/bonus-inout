'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/browser'

type LeaveRequest = {
  id: string
  leave_type: 'ANNUAL' | 'HALF_AM' | 'HALF_PM' | 'SICK' | 'FRIDAY_OFF'
  leave_date: string
  reason: string | null
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  created_at: string
}

type LeaveBalance = {
  total_days: number
  used_days: number
  remaining_days: number
}

const LEAVE_TYPE_LABEL: Record<string, string> = {
  ANNUAL: '연차 (1일)',
  HALF_AM: '반차 - 오전 (0.5일)',
  HALF_PM: '반차 - 오후 (0.5일)',
  SICK: '병가 (1일)',
  FRIDAY_OFF: '금요일 휴무 (1일)',
}

const LEAVE_TYPE_DAYS: Record<string, number> = {
  ANNUAL: 1, HALF_AM: 0.5, HALF_PM: 0.5, SICK: 1, FRIDAY_OFF: 1,
}

const STATUS_LABEL: Record<string, string> = {
  PENDING: '검토중', APPROVED: '승인', REJECTED: '반려',
}
const STATUS_COLOR: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-700',
  APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-600',
}

// 달력에 표시할 색상
const LEAVE_TYPE_BG: Record<string, string> = {
  ANNUAL: 'bg-blue-500',
  HALF_AM: 'bg-indigo-400',
  HALF_PM: 'bg-purple-400',
  SICK: 'bg-red-400',
  FRIDAY_OFF: 'bg-orange-400',
}

export default function LeavePage() {
  const supabase = createClient()
  const year = new Date().getFullYear()

  const [balance, setBalance] = useState<LeaveBalance | null>(null)
  const [requests, setRequests] = useState<LeaveRequest[]>([])
  const [leaveType, setLeaveType] = useState<string>('ANNUAL')
  const [leaveDate, setLeaveDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 1)
    return d.toISOString().split('T')[0]
  })
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [activeTab, setActiveTab] = useState<'apply' | 'history' | 'calendar'>('apply')

  // 달력 상태
  const [calMonth, setCalMonth] = useState(new Date().getMonth()) // 0-based
  const [calYear, setCalYear] = useState(new Date().getFullYear())

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // employees에서 auth_user_id로 employee id 조회
    const { data: emp } = await supabase
      .from('employees')
      .select('id')
      .eq('auth_user_id', user.id)
      .single()

    if (!emp) {
      setError('employees에 auth_user_id 매핑이 없습니다. 관리자에게 직원등록/uid매핑을 요청하세요.')
      return
    }

    // 연차 잔여
    const { data: bal } = await supabase
      .from('leave_balance')
      .select('total_days, used_days, remaining_days')
      .eq('employee_id', emp.id)
      .eq('year', year)
      .single()
    setBalance(bal)

    // 신청 내역
    const { data: reqs } = await supabase
      .from('leave_requests')
      .select('*')
      .eq('employee_id', emp.id)
      .order('leave_date', { ascending: false })
    setRequests(reqs || [])
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError(''); setSuccess('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('로그인이 필요합니다.'); setLoading(false); return }

    const { data: emp } = await supabase
      .from('employees')
      .select('id')
      .eq('auth_user_id', user.id)
      .single()

    if (!emp) { setError('직원 정보를 찾을 수 없습니다.'); setLoading(false); return }

    const days = LEAVE_TYPE_DAYS[leaveType]
    if (balance && days > balance.remaining_days) {
      setError('잔여 연차가 부족합니다.'); setLoading(false); return
    }

    const { error } = await supabase.from('leave_requests').insert([{
      employee_id: emp.id,
      leave_type: leaveType,
      leave_date: leaveDate,
      reason: reason || null,
      status: 'PENDING',
    }])

    if (error) { setError(error.message); setLoading(false); return }

    setSuccess('신청이 완료되었습니다. 관리자 승인 후 확정됩니다.')
    setReason('')
    setLoading(false)
    fetchData()
  }

  async function handleCancel(id: string) {
    if (!confirm('신청을 취소하시겠습니까?')) return
    await supabase.from('leave_requests').delete().eq('id', id)
    fetchData()
  }

  // ── 달력 렌더링 ──────────────────────────────
  function renderCalendar() {
    const firstDay = new Date(calYear, calMonth, 1).getDay() // 0=일
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate()
    const today = new Date().toISOString().split('T')[0]

    // 이번 달 승인된 휴가만 필터
    const monthStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}`
    const monthLeaves = requests.filter(
      (r) => r.leave_date.startsWith(monthStr) && r.status !== 'REJECTED'
    )

    const cells: React.ReactNode[] = []

    // 앞 빈칸
    for (let i = 0; i < firstDay; i++) {
      cells.push(<div key={`empty-${i}`} />)
    }

    // 날짜 셀
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      const dayLeaves = monthLeaves.filter((r) => r.leave_date === dateStr)
      const isToday = dateStr === today
      const dow = new Date(calYear, calMonth, d).getDay()
      const isSun = dow === 0
      const isSat = dow === 6

      cells.push(
        <div
          key={d}
          className={`min-h-[60px] p-1 border border-gray-100 rounded-lg ${isToday ? 'bg-blue-50 border-blue-300' : 'bg-white'}`}
        >
          <span className={`text-xs font-semibold ${isToday ? 'text-blue-600' : isSun ? 'text-red-500' : isSat ? 'text-blue-500' : 'text-gray-700'}`}>
            {d}
          </span>
          <div className="mt-0.5 space-y-0.5">
            {dayLeaves.map((lv) => (
              <div
                key={lv.id}
                className={`text-white text-[10px] px-1 py-0.5 rounded truncate ${LEAVE_TYPE_BG[lv.leave_type]} ${lv.status === 'PENDING' ? 'opacity-60' : ''}`}
                title={`${LEAVE_TYPE_LABEL[lv.leave_type]} (${STATUS_LABEL[lv.status]})`}
              >
                {lv.leave_type === 'ANNUAL' ? '연차'
                  : lv.leave_type === 'HALF_AM' ? '오전반차'
                  : lv.leave_type === 'HALF_PM' ? '오후반차'
                  : lv.leave_type === 'SICK' ? '병가'
                  : '금휴'}
                {lv.status === 'PENDING' && ' (검토중)'}
              </div>
            ))}
          </div>
        </div>
      )
    }

    return cells
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900">연차 / 반차 / 병가 신청</h1>
          <p className="text-sm text-gray-500 mt-1">전 직원 접근 가능 · 신청 후 관리자 승인 절차</p>
        </div>

        {/* 연차 현황 카드 */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: `${year}년 부여 연차`, value: balance?.total_days ?? 0, color: 'text-blue-600' },
            { label: `${year}년 사용 연차`, value: balance?.used_days ?? 0, color: 'text-orange-500' },
            { label: `${year}년 잔여 연차`, value: balance?.remaining_days ?? 0, color: 'text-green-600' },
          ].map((item) => (
            <div key={item.label} className="bg-white rounded-xl border border-gray-200 p-4 text-center shadow-sm">
              <p className="text-xs text-gray-500 mb-1">{item.label}</p>
              <p className={`text-2xl font-bold ${item.color}`}>{item.value}<span className="text-sm font-normal text-gray-400 ml-0.5">일</span></p>
            </div>
          ))}
        </div>

        {/* 에러 / 성공 */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-4 flex justify-between">
            <span>{error}</span>
            <button onClick={() => setError('')} className="text-red-400 hover:text-red-600">✕</button>
          </div>
        )}
        {success && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm mb-4 flex justify-between">
            <span>{success}</span>
            <button onClick={() => setSuccess('')} className="text-green-400 hover:text-green-600">✕</button>
          </div>
        )}

        {/* 탭 */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="flex border-b border-gray-200">
            {[
              { key: 'apply', label: '📋 신청하기' },
              { key: 'history', label: '📅 신청 내역' },
              { key: 'calendar', label: '🗓️ 달력 보기' },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as typeof activeTab)}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${
                  activeTab === tab.key
                    ? 'border-b-2 border-blue-500 text-blue-600 bg-blue-50'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* ── 신청하기 탭 ── */}
          {activeTab === 'apply' && (
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">휴가 유형 *</label>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(LEAVE_TYPE_LABEL).map(([key, label]) => (
                    <label key={key} className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-colors ${
                      leaveType === key ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                    }`}>
                      <input type="radio" name="leaveType" value={key} checked={leaveType === key}
                        onChange={() => setLeaveType(key)} className="text-blue-600" />
                      <span className="text-sm">{label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">날짜 *</label>
                <input type="date" value={leaveDate} onChange={(e) => setLeaveDate(e.target.value)} required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">사유 (선택)</label>
                <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3}
                  placeholder="개인사정"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              </div>

              <div className="flex items-center justify-between pt-1">
                <p className="text-xs text-gray-500">신청 시 <strong>{LEAVE_TYPE_DAYS[leaveType]}일</strong>이 차감됩니다.</p>
                <button type="submit" disabled={loading}
                  className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium px-6 py-2 rounded-lg text-sm transition-colors">
                  {loading ? '신청 중...' : '신청하기'}
                </button>
              </div>
            </form>
          )}

          {/* ── 신청 내역 탭 ── */}
          {activeTab === 'history' && (
            <div className="p-5">
              {requests.length === 0 ? (
                <div className="text-center text-gray-400 text-sm py-8">신청 내역이 없습니다.</div>
              ) : (
                <div className="space-y-3">
                  {requests.map((req) => (
                    <div key={req.id} className="flex items-start justify-between p-3 rounded-lg border border-gray-100 bg-gray-50">
                      <div>
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-sm font-medium text-gray-800">{req.leave_date}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[req.status]}`}>
                            {STATUS_LABEL[req.status]}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500">{LEAVE_TYPE_LABEL[req.leave_type]}</p>
                        {req.reason && <p className="text-xs text-gray-400 mt-0.5">{req.reason}</p>}
                      </div>
                      {req.status === 'PENDING' && (
                        <button onClick={() => handleCancel(req.id)}
                          className="text-xs text-red-500 hover:text-red-700 font-medium ml-4 flex-shrink-0">
                          취소
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── 달력 보기 탭 ── */}
          {activeTab === 'calendar' && (
            <div className="p-5">
              {/* 월 네비게이션 */}
              <div className="flex items-center justify-between mb-4">
                <button
                  onClick={() => {
                    if (calMonth === 0) { setCalMonth(11); setCalYear(calYear - 1) }
                    else setCalMonth(calMonth - 1)
                  }}
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600"
                >
                  ◀
                </button>
                <h3 className="text-base font-bold text-gray-800">
                  {calYear}년 {calMonth + 1}월
                </h3>
                <button
                  onClick={() => {
                    if (calMonth === 11) { setCalMonth(0); setCalYear(calYear + 1) }
                    else setCalMonth(calMonth + 1)
                  }}
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600"
                >
                  ▶
                </button>
              </div>

              {/* 요일 헤더 */}
              <div className="grid grid-cols-7 mb-1">
                {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
                  <div key={d} className={`text-center text-xs font-semibold py-1 ${i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-gray-500'}`}>
                    {d}
                  </div>
                ))}
              </div>

              {/* 날짜 그리드 */}
              <div className="grid grid-cols-7 gap-0.5">
                {renderCalendar()}
              </div>

              {/* 범례 */}
              <div className="mt-4 flex flex-wrap gap-2 text-xs text-gray-500">
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-500 inline-block" />연차</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-indigo-400 inline-block" />오전반차</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-purple-400 inline-block" />오후반차</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-400 inline-block" />병가</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-orange-400 inline-block" />금휴</span>
                <span className="text-gray-400 ml-2">※ 반투명 = 검토중</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
