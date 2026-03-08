'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/browser'

type LeaveRequest = {
  id: string
  leave_type: 'ANNUAL' | 'HALF_AM' | 'HALF_PM' | 'SICK' | 'FRIDAY_OFF'
  leave_date: string
  note: string | null
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

const LEAVE_TYPE_SHORT: Record<string, string> = {
  ANNUAL: '연차',
  HALF_AM: '오전반차',
  HALF_PM: '오후반차',
  SICK: '병가',
  FRIDAY_OFF: '금휴',
}

const LEAVE_TYPE_DAYS: Record<string, number> = {
  ANNUAL: 1, HALF_AM: 0.5, HALF_PM: 0.5, SICK: 1, FRIDAY_OFF: 1,
}

const LEAVE_TYPE_BG: Record<string, string> = {
  ANNUAL: 'bg-blue-500',
  HALF_AM: 'bg-indigo-400',
  HALF_PM: 'bg-purple-400',
  SICK: 'bg-red-400',
  FRIDAY_OFF: 'bg-orange-400',
}

function getKoreanErrorMessage(message: string): string {
  if (message.includes('uq_leave_requests_user_date_type') || message.includes('duplicate key')) {
    return '해당 날짜에 이미 동일한 유형의 휴가 신청이 존재합니다.'
  }
  if (message.includes('not found') || message.includes('No rows')) {
    return '데이터를 찾을 수 없습니다.'
  }
  if (message.includes('permission') || message.includes('policy')) {
    return '접근 권한이 없습니다. 관리자에게 문의하세요.'
  }
  if (message.includes('network') || message.includes('fetch')) {
    return '네트워크 오류가 발생했습니다. 다시 시도해주세요.'
  }
  return '오류가 발생했습니다. 다시 시도해주세요.'
}

type ModalMode = 'create' | 'edit'

export default function LeavePage() {
  const supabase = createClient()
  const year = new Date().getFullYear()
  const today = new Date().toISOString().split('T')[0]

  const [balance, setBalance] = useState<LeaveBalance | null>(null)
  const [requests, setRequests] = useState<LeaveRequest[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [empId, setEmpId] = useState<string | null>(null)

  // 달력 상태
  const [calMonth, setCalMonth] = useState(new Date().getMonth())
  const [calYear, setCalYear] = useState(new Date().getFullYear())

  // 모달 상태
  const [modalOpen, setModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<ModalMode>('create')
  const [modalDate, setModalDate] = useState<string>('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [leaveType, setLeaveType] = useState('ANNUAL')
  const [note, setNote] = useState('')

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: emp } = await supabase
      .from('employees')
      .select('id')
      .eq('auth_user_id', user.id)
      .single()

    if (!emp) {
      setError('직원 정보가 없습니다. 관리자에게 직원등록을 요청하세요.')
      return
    }
    setEmpId(emp.id)

    const { data: bal } = await supabase
      .from('leave_balance')
      .select('total_days, used_days, remaining_days')
      .eq('employee_id', emp.id)
      .eq('year', year)
      .single()
    setBalance(bal)

    const { data: reqs } = await supabase
      .from('leave_requests')
      .select('*')
      .eq('employee_id', emp.id)
      .order('leave_date', { ascending: false })
    setRequests(reqs || [])
  }

  const isFuture = (dateStr: string) => dateStr >= today

  // 달력 날짜 클릭 → 신청 or 수정 모달
  function openCreateModal(dateStr: string) {
    if (!isFuture(dateStr)) return
    const existing = requests.find((r) => r.leave_date === dateStr)
    if (existing) {
      openEditModal(existing)
    } else {
      setModalMode('create')
      setModalDate(dateStr)
      setLeaveType('ANNUAL')
      setNote('')
      setEditingId(null)
      setModalOpen(true)
    }
  }

  // 신청 내역에서 수정 버튼 클릭
  function openEditModal(req: LeaveRequest) {
    setModalMode('edit')
    setModalDate(req.leave_date)
    setLeaveType(req.leave_type)
    setNote(req.note || '')
    setEditingId(req.id)
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setEditingId(null)
  }

  async function handleSubmit() {
    if (!modalDate || !empId) return
    setLoading(true); setError(''); setSuccess('')

    if (modalMode === 'create') {
      const days = LEAVE_TYPE_DAYS[leaveType]
      if (balance && days > balance.remaining_days) {
        setError('잔여 연차가 부족합니다.'); setLoading(false); return
      }
      const { error } = await supabase.from('leave_requests').insert([{
        employee_id: empId,
        leave_type: leaveType,
        leave_date: modalDate,
        note: note || null,
      }])
      if (error) { setError(getKoreanErrorMessage(error.message)); setLoading(false); return }
      setSuccess(`${modalDate} 휴가 신청이 완료되었습니다.`)

    } else {
      const { error } = await supabase
        .from('leave_requests')
        .update({ leave_type: leaveType, note: note || null })
        .eq('id', editingId)
      if (error) { setError(getKoreanErrorMessage(error.message)); setLoading(false); return }
      setSuccess(`${modalDate} 휴가 신청이 수정되었습니다.`)
    }

    closeModal()
    setLoading(false)
    fetchData()
  }

  async function handleDelete(id: string) {
    if (!confirm('신청을 삭제하시겠습니까?')) return
    await supabase.from('leave_requests').delete().eq('id', id)
    fetchData()
  }

  function renderCalendar() {
    const firstDay = new Date(calYear, calMonth, 1).getDay()
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate()
    const monthStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}`
    const monthLeaves = requests.filter((r) => r.leave_date.startsWith(monthStr))

    const cells: React.ReactNode[] = []
    for (let i = 0; i < firstDay; i++) {
      cells.push(<div key={`empty-${i}`} />)
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      const dayLeaves = monthLeaves.filter((r) => r.leave_date === dateStr)
      const isToday = dateStr === today
      const dow = new Date(calYear, calMonth, d).getDay()
      const isSun = dow === 0
      const isSat = dow === 6
      const isPast = !isFuture(dateStr)
      const clickable = isFuture(dateStr)

      cells.push(
        <div
          key={d}
          onClick={() => clickable && openCreateModal(dateStr)}
          className={`min-h-[64px] p-1 border rounded-lg transition-colors
            ${isToday ? 'bg-blue-50 border-blue-300' : 'bg-white border-gray-100'}
            ${clickable ? 'cursor-pointer hover:bg-gray-50' : 'opacity-40 cursor-default'}
          `}
        >
          <span className={`text-xs font-semibold ${isToday ? 'text-blue-600' : isSun ? 'text-red-500' : isSat ? 'text-blue-500' : 'text-gray-700'}`}>
            {d}
          </span>
          <div className="mt-0.5 space-y-0.5">
            {dayLeaves.map((lv) => (
              <div
                key={lv.id}
                className={`text-white text-[9px] px-1 py-0.5 rounded truncate ${LEAVE_TYPE_BG[lv.leave_type]} ${isPast ? 'opacity-70' : ''}`}
                title={LEAVE_TYPE_LABEL[lv.leave_type]}
              >
                {LEAVE_TYPE_SHORT[lv.leave_type]}
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
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900">연차 / 반차 / 병가 신청</h1>
          <p className="text-sm text-gray-500 mt-1">날짜를 클릭하여 신청하거나 수정할 수 있습니다</p>
        </div>

        {/* 연차 현황 */}
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

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-4 flex justify-between">
            <span>{error}</span>
            <button onClick={() => setError('')}>✕</button>
          </div>
        )}
        {success && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm mb-4 flex justify-between">
            <span>{success}</span>
            <button onClick={() => setSuccess('')}>✕</button>
          </div>
        )}

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">

          {/* 달력 */}
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <button
                onClick={() => {
                  if (calMonth === 0) { setCalMonth(11); setCalYear(calYear - 1) }
                  else setCalMonth(calMonth - 1)
                }}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600"
              >◀</button>
              <h3 className="text-base font-bold text-gray-800">{calYear}년 {calMonth + 1}월</h3>
              <button
                onClick={() => {
                  if (calMonth === 11) { setCalMonth(0); setCalYear(calYear + 1) }
                  else setCalMonth(calMonth + 1)
                }}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600"
              >▶</button>
            </div>

            <p className="text-xs text-blue-600 text-center mb-2">📌 오늘 이후 날짜를 클릭하면 신청 / 수정할 수 있습니다</p>

            <div className="grid grid-cols-7 mb-1">
              {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
                <div key={d} className={`text-center text-xs font-semibold py-1 ${i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-gray-500'}`}>
                  {d}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-0.5">
              {renderCalendar()}
            </div>

            <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-500">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-500 inline-block" />연차</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-indigo-400 inline-block" />오전반차</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-purple-400 inline-block" />오후반차</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-400 inline-block" />병가</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-orange-400 inline-block" />금휴</span>
            </div>
          </div>

          {/* 신청 내역 */}
          <div className="px-4 pb-4 border-t border-gray-100">
            <h4 className="text-sm font-semibold text-gray-700 mt-3 mb-2">신청 내역</h4>
            {requests.length === 0 ? (
              <div className="text-center text-gray-400 text-sm py-6">신청 내역이 없습니다.</div>
            ) : (
              <div className="space-y-2">
                {requests.map((req) => {
                  const canEdit = isFuture(req.leave_date)
                  return (
                    <div
                      key={req.id}
                      className={`flex items-start justify-between p-3 rounded-lg border border-gray-100 ${canEdit ? 'bg-gray-50' : 'bg-gray-50 opacity-50'}`}
                    >
                      <div>
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-sm font-medium text-gray-800">{req.leave_date}</span>
                          {!canEdit && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-400">지난 날짜</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500">{LEAVE_TYPE_LABEL[req.leave_type]}</p>
                        {req.note && <p className="text-xs text-gray-400 mt-0.5">{req.note}</p>}
                      </div>
                      {canEdit && (
                        <div className="flex gap-3 ml-4 flex-shrink-0 items-center">
                          <button
                            onClick={() => openEditModal(req)}
                            className="text-xs text-blue-500 hover:text-blue-700 font-medium"
                          >
                            수정
                          </button>
                          <span className="text-gray-200 text-sm">|</span>
                          <button
                            onClick={() => handleDelete(req.id)}
                            className="text-xs text-red-400 hover:text-red-600 font-medium"
                          >
                            삭제
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 신청 / 수정 모달 */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-gray-900">
                {modalMode === 'create' ? '휴가 신청' : '휴가 수정'}
              </h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 mb-4">
              <p className="text-sm font-semibold text-blue-700">📅 {modalDate}</p>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">휴가 유형</label>
              <div className="space-y-1.5">
                {Object.entries(LEAVE_TYPE_LABEL).map(([key, label]) => (
                  <label key={key} className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                    leaveType === key ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                  }`}>
                    <input type="radio" name="leaveType" value={key} checked={leaveType === key}
                      onChange={() => setLeaveType(key)} className="text-blue-600" />
                    <span className="text-sm">{label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-700 mb-1">사유 (선택)</label>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
                placeholder="개인사정"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
            </div>

            <div className="flex gap-2">
              <button onClick={closeModal}
                className="flex-1 border border-gray-300 text-gray-600 py-2.5 rounded-lg text-sm hover:bg-gray-50">
                취소
              </button>
              <button onClick={handleSubmit} disabled={loading}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm">
                {loading
                  ? (modalMode === 'create' ? '신청 중...' : '수정 중...')
                  : modalMode === 'create'
                    ? `${LEAVE_TYPE_DAYS[leaveType]}일 신청`
                    : '수정 완료'
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
