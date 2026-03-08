'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/browser'

type LeaveRequest = {
  id: string
  employee_id: string
  leave_type: 'ANNUAL' | 'HALF_AM' | 'HALF_PM' | 'SICK' | 'FRIDAY_OFF' | 'SPECIAL'
  leave_date: string
  note: string | null
  created_at: string
}

type AllLeaveRequest = LeaveRequest & {
  employee_name: string
  is_mine: boolean
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
  SPECIAL: '경조사 휴가 (유급)',
}

const LEAVE_TYPE_SHORT: Record<string, string> = {
  ANNUAL: '연차',
  HALF_AM: '오전반차',
  HALF_PM: '오후반차',
  SICK: '병가',
  FRIDAY_OFF: '금휴',
  SPECIAL: '경조사',
}

const LEAVE_TYPE_DAYS: Record<string, number> = {
  ANNUAL: 1, HALF_AM: 0.5, HALF_PM: 0.5, SICK: 1, FRIDAY_OFF: 1, SPECIAL: 0,
}

// 내 일정 - 진한 색 (흰 글자)
const MY_BG: Record<string, string> = {
  ANNUAL: 'bg-blue-500',
  HALF_AM: 'bg-indigo-500',
  HALF_PM: 'bg-violet-500',
  SICK: 'bg-rose-500',
  FRIDAY_OFF: 'bg-orange-500',
  SPECIAL: 'bg-yellow-500',
}

// 타인 일정 - 연한 색 (진한 글자)
const OTHER_STYLE: Record<string, string> = {
  ANNUAL: 'bg-blue-100 text-blue-800',
  HALF_AM: 'bg-indigo-100 text-indigo-800',
  HALF_PM: 'bg-violet-100 text-violet-800',
  SICK: 'bg-rose-100 text-rose-800',
  FRIDAY_OFF: 'bg-orange-100 text-orange-800',
  SPECIAL: 'bg-yellow-100 text-yellow-800',
}

function getKoreanErrorMessage(message: string): string {
  if (message.includes('uq_leave_requests_user_date_type') || message.includes('duplicate key'))
    return '해당 날짜에 이미 동일한 유형의 휴가 신청이 존재합니다.'
  if (message.includes('not found') || message.includes('No rows'))
    return '데이터를 찾을 수 없습니다.'
  if (message.includes('permission') || message.includes('policy'))
    return '접근 권한이 없습니다. 관리자에게 문의하세요.'
  if (message.includes('network') || message.includes('fetch'))
    return '네트워크 오류가 발생했습니다. 다시 시도해주세요.'
  return '오류가 발생했습니다. 다시 시도해주세요.'
}

type ModalMode = 'create' | 'edit'

export default function LeavePage() {
  const [role, setRole] = useState<string>('')
  const isAdmin = role === 'ADMIN'
  const supabase = createClient()
  const year = new Date().getFullYear()
  const today = new Date().toISOString().split('T')[0]

  const [balance, setBalance] = useState<LeaveBalance | null>(null)
  const [myRequests, setMyRequests] = useState<LeaveRequest[]>([])
  const [allRequests, setAllRequests] = useState<AllLeaveRequest[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [empId, setEmpId] = useState<string | null>(null)
  const [employees, setEmployees] = useState<{id: string, name: string}[]>([])
  // ADMIN용 직원 선택 입력 모달
  const [adminModalOpen, setAdminModalOpen] = useState(false)
  const [adminEmpId, setAdminEmpId] = useState('')
  const [adminDate, setAdminDate] = useState('')
  const [adminLeaveType, setAdminLeaveType] = useState('ANNUAL')
  const [adminNote, setAdminNote] = useState('')

  const [calMonth, setCalMonth] = useState(new Date().getMonth())
  const [calYear, setCalYear] = useState(new Date().getFullYear())

  const [modalOpen, setModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<ModalMode>('create')
  const [modalDate, setModalDate] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [leaveType, setLeaveType] = useState('ANNUAL')
  const [note, setNote] = useState('')

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // role 조회
    const { data: roleData } = await supabase
      .from('user_roles').select('role').eq('user_id', user.id).maybeSingle()
    const currentRole = roleData?.role ?? ''
    setRole(currentRole)
    const currentIsAdmin = currentRole === 'ADMIN'

    // 전체 직원 목록 (ADMIN용)
    const { data: empList } = await supabase.from('employees').select('id, name').eq('is_active', true).order('name')
    setEmployees(empList || [])

    const { data: emp } = await supabase
      .from('employees').select('id').eq('auth_user_id', user.id).single()

    if (!emp) {
      if (!currentIsAdmin) { setError('직원 정보가 없습니다. 관리자에게 직원등록을 요청하세요.'); return }
      // ADMIN은 직원 연동 없어도 전체 일정만 표시
    } else {
      setEmpId(emp.id)
      const { data: bal } = await supabase
        .from('leave_balance')
        .select('total_days, used_days, remaining_days')
        .eq('employee_id', emp.id).eq('year', year).single()
      setBalance(bal)
      const { data: reqs } = await supabase
        .from('leave_requests').select('*')
        .eq('employee_id', emp.id).order('leave_date', { ascending: false })
      setMyRequests(reqs || [])
    }

    const { data: allReqs } = await supabase
      .from('leave_requests')
      .select('*, employees!inner(name)')
      .order('leave_date', { ascending: false })

    if (allReqs) {
      setAllRequests(allReqs.map((r: any) => ({
        ...r,
        employee_name: r.employees?.name ?? '알 수 없음',
        is_mine: r.employee_id === emp?.id,
      })))
    }
  }

  const isFuture = (d: string) => isAdmin || d >= today

  function openCreateModal(dateStr: string) {
    if (!isFuture(dateStr)) return
    if (isAdmin) {
      // ADMIN: 직원 선택 모달 열기
      setAdminDate(dateStr); setAdminEmpId(employees[0]?.id || '')
      setAdminLeaveType('ANNUAL'); setAdminNote(''); setAdminModalOpen(true)
      return
    }
    const existing = myRequests.find((r) => r.leave_date === dateStr)
    if (existing) { openEditModal(existing); return }
    setModalMode('create'); setModalDate(dateStr)
    setLeaveType('ANNUAL'); setNote(''); setEditingId(null); setModalOpen(true)
  }

  function openEditModal(req: LeaveRequest) {
    setModalMode('edit'); setModalDate(req.leave_date)
    setLeaveType(req.leave_type); setNote(req.note || '')
    setEditingId(req.id); setModalOpen(true)
  }

  function closeModal() { setModalOpen(false); setEditingId(null) }

  async function handleSubmit() {
    if (!modalDate || !empId) return
    setLoading(true); setError(''); setSuccess('')

    if (modalMode === 'create') {
      const days = LEAVE_TYPE_DAYS[leaveType]
      if (balance && days > balance.remaining_days) {
        setError('잔여 연차가 부족합니다.'); setLoading(false); return
      }
      const { error: e } = await supabase.from('leave_requests').insert([{
        employee_id: empId, leave_type: leaveType, leave_date: modalDate, note: note || null,
      }])
      if (e) { setError(getKoreanErrorMessage(e.message)); setLoading(false); return }
      if (balance) setBalance({ ...balance, used_days: balance.used_days + days, remaining_days: balance.remaining_days - days })
      setSuccess(`${modalDate} 휴가 신청이 완료되었습니다.`)
    } else {
      const oldReq = myRequests.find((r) => r.id === editingId)
      const diff = LEAVE_TYPE_DAYS[leaveType] - (oldReq ? LEAVE_TYPE_DAYS[oldReq.leave_type] : 0)
      const { error: e } = await supabase.from('leave_requests')
        .update({ leave_type: leaveType, note: note || null }).eq('id', editingId)
      if (e) { setError(getKoreanErrorMessage(e.message)); setLoading(false); return }
      if (balance) setBalance({ ...balance, used_days: balance.used_days + diff, remaining_days: balance.remaining_days - diff })
      setSuccess(`${modalDate} 휴가 신청이 수정되었습니다.`)
    }
    closeModal(); setLoading(false); fetchData()
  }


  async function handleAdminSubmit() {
    if (!adminDate || !adminEmpId) return
    setLoading(true); setError(''); setSuccess('')
    const { error: e } = await supabase.from('leave_requests').insert([{
      employee_id: adminEmpId, leave_type: adminLeaveType,
      leave_date: adminDate, note: adminNote || null,
    }])
    if (e) { setError(getKoreanErrorMessage(e.message)); setLoading(false); return }
    setSuccess(`${adminDate} 휴가 입력이 완료되었습니다.`)
    setAdminModalOpen(false); setLoading(false); fetchData()
  }

  async function handleAdminDelete(id: string) {
    if (!confirm('이 휴가 기록을 삭제하시겠습니까?')) return
    await supabase.from('leave_requests').delete().eq('id', id)
    fetchData()
  }

  async function handleDelete(id: string, type: string) {
    if (!confirm('신청을 삭제하시겠습니까?')) return
    await supabase.from('leave_requests').delete().eq('id', id)
    const days = LEAVE_TYPE_DAYS[type]
    if (balance) setBalance({ ...balance, used_days: balance.used_days - days, remaining_days: balance.remaining_days + days })
    fetchData()
  }

  function renderCalendar() {
    const firstDay = new Date(calYear, calMonth, 1).getDay()
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate()
    const monthStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}`
    const monthLeaves = allRequests.filter((r) => r.leave_date.startsWith(monthStr))

    const cells: React.ReactNode[] = []

    for (let i = 0; i < firstDay; i++) {
      cells.push(
        <div key={`e${i}`} className="rounded-xl border border-gray-100 bg-gray-50/60 min-h-[110px]" />
      )
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${monthStr}-${String(d).padStart(2, '0')}`
      const dayLeaves = monthLeaves.filter((r) => r.leave_date === dateStr)
      const isToday = dateStr === today
      const dow = new Date(calYear, calMonth, d).getDay()
      const isSun = dow === 0
      const isSat = dow === 6
      const clickable = isFuture(dateStr)

      cells.push(
        <div
          key={d}
          onClick={() => clickable && openCreateModal(dateStr)}
          className={[
            'rounded-xl border min-h-[110px] p-2 flex flex-col gap-1 transition-all duration-150',
            isToday
              ? 'border-blue-400 bg-blue-50 shadow-sm ring-1 ring-blue-300'
              : 'border-gray-200 bg-white',
            clickable
              ? 'cursor-pointer hover:border-blue-300 hover:shadow-md hover:bg-blue-50/30'
              : 'opacity-45 cursor-default',
          ].join(' ')}
        >
          {/* 날짜 숫자 행 */}
          <div className="flex items-center justify-between">
            <span className={[
              'text-sm font-bold w-7 h-7 flex items-center justify-center rounded-full shrink-0',
              isToday
                ? 'bg-blue-500 text-white'
                : isSun ? 'text-red-500'
                : isSat ? 'text-blue-500'
                : 'text-gray-700',
            ].join(' ')}>
              {d}
            </span>
            {dayLeaves.length > 0 && (
              <span className="text-[10px] font-medium text-gray-400 bg-gray-100 rounded-full px-1.5 py-0.5">
                {dayLeaves.length}명
              </span>
            )}
          </div>

          {/* 일정 뱃지 목록 */}
          <div className="flex flex-col gap-0.5 mt-0.5">
            {dayLeaves.map((lv) =>
              lv.is_mine ? (
                /* 내 일정 - 진한 색 + ★ */
                <div
                  key={lv.id}
                  className={`flex items-center gap-1 px-1.5 py-[3px] rounded-md text-white text-[11px] font-semibold leading-tight ${MY_BG[lv.leave_type]}`}
                  title={`${lv.employee_name} · ${LEAVE_TYPE_LABEL[lv.leave_type]}${lv.note ? ` · ${lv.note}` : ''}`}
                >
                  <span className="shrink-0 text-[9px]">★</span>
                  <span className="truncate min-w-0">{lv.employee_name}</span>
                  <span className="shrink-0 text-white/60 text-[9px]">·</span>
                  <span className="shrink-0 text-white/90">{LEAVE_TYPE_SHORT[lv.leave_type]}</span>
                </div>
              ) : (
                /* 타인 일정 - 연한 색, ADMIN은 삭제 버튼 포함 */
                <div
                  key={lv.id}
                  className={`flex items-center gap-1 px-1.5 py-[3px] rounded-md text-[11px] font-medium leading-tight ${OTHER_STYLE[lv.leave_type]}`}
                  title={`${lv.employee_name} · ${LEAVE_TYPE_LABEL[lv.leave_type]}${lv.note ? ` · ${lv.note}` : ''}`}
                >
                  <span className="truncate min-w-0">{lv.employee_name}</span>
                  <span className="shrink-0 opacity-40 text-[9px]">·</span>
                  <span className="shrink-0">{LEAVE_TYPE_SHORT[lv.leave_type]}</span>
                  {isAdmin && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleAdminDelete(lv.id) }}
                      className="shrink-0 text-red-400 hover:text-red-600 text-[9px] ml-0.5 font-bold"
                      title="삭제"
                    >✕</button>
                  )}
                </div>
              )
            )}
          </div>
        </div>
      )
    }
    return cells
  }

  return (
    <div className="min-h-screen bg-gray-50">

      {/* 상단 헤더 */}
      <div className="max-w-screen-xl mx-auto px-6 pt-8 pb-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-5">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">연차 / 반차 / 병가 신청</h1>
            <p className="text-sm text-gray-400 mt-0.5">날짜를 클릭하여 신청하거나 수정할 수 있습니다</p>
          </div>

          {/* 연차 현황 */}
          <div className="flex gap-3 shrink-0">
            {[
              { label: '부여 연차', value: balance?.total_days ?? 0, color: 'text-blue-600', ring: 'ring-blue-200 bg-blue-50' },
              { label: '사용 연차', value: balance?.used_days ?? 0, color: 'text-orange-500', ring: 'ring-orange-200 bg-orange-50' },
              { label: '잔여 연차', value: balance?.remaining_days ?? 0, color: 'text-emerald-600', ring: 'ring-emerald-200 bg-emerald-50' },
            ].map((item) => (
              <div key={item.label} className={`rounded-2xl ring-1 px-5 py-3 text-center ${item.ring}`}>
                <p className="text-[11px] text-gray-400 mb-0.5">{item.label}</p>
                <p className={`text-2xl font-bold ${item.color}`}>
                  {item.value}<span className="text-xs font-normal text-gray-400 ml-0.5">일</span>
                </p>
              </div>
            ))}
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm mb-4 flex justify-between items-center">
            <span>{error}</span><button onClick={() => setError('')} className="text-red-400 hover:text-red-600 ml-4">✕</button>
          </div>
        )}
        {success && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl text-sm mb-4 flex justify-between items-center">
            <span>{success}</span><button onClick={() => setSuccess('')} className="text-green-400 hover:text-green-600 ml-4">✕</button>
          </div>
        )}
      </div>

      {/* 달력 - 풀 와이드 */}
      <div className="max-w-screen-xl mx-auto px-6 pb-8">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">

          {/* 달력 네비 + 범례 */}
          <div className="flex items-center justify-between mb-2">
            <button
              onClick={() => { if (calMonth === 0) { setCalMonth(11); setCalYear(calYear - 1) } else setCalMonth(calMonth - 1) }}
              className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-gray-100 text-gray-500 transition-colors"
            >◀</button>

            <div className="flex flex-col items-center gap-2">
              <h3 className="text-xl font-bold text-gray-800">{calYear}년 {calMonth + 1}월</h3>
              <div className="flex flex-wrap justify-center items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                <span className="flex items-center gap-1 font-medium text-gray-400">
                  <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-blue-500 text-white text-[8px]">★</span>
                  내 일정
                </span>
                <span className="flex items-center gap-1 font-medium text-gray-400">
                  <span className="w-3 h-3 rounded-sm bg-blue-100 border border-blue-300 inline-block" />
                  팀원 일정
                </span>
                <span className="w-px h-3 bg-gray-200" />
                {[
                  { color: 'bg-blue-500', label: '연차' },
                  { color: 'bg-indigo-500', label: '오전반차' },
                  { color: 'bg-violet-500', label: '오후반차' },
                  { color: 'bg-rose-500', label: '병가' },
                  { color: 'bg-orange-500', label: '금휴' },
                  { color: 'bg-yellow-500', label: '경조사' },
                ].map(({ color, label }) => (
                  <span key={label} className="flex items-center gap-1">
                    <span className={`w-2.5 h-2.5 rounded-full inline-block ${color}`} />
                    {label}
                  </span>
                ))}
              </div>
            </div>

            <button
              onClick={() => { if (calMonth === 11) { setCalMonth(0); setCalYear(calYear + 1) } else setCalMonth(calMonth + 1) }}
              className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-gray-100 text-gray-500 transition-colors"
            >▶</button>
          </div>

          <p className="text-xs text-blue-500 text-center mb-4">
            {isAdmin
              ? '📌 날짜를 클릭하여 직원 휴가를 입력할 수 있습니다 (관리자)'
              : '📌 오늘 이후 날짜를 클릭하면 신청 / 수정할 수 있습니다'}
          </p>

          {/* 요일 헤더 */}
          <div className="grid grid-cols-7 mb-2">
            {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
              <div key={d} className={`text-center text-xs font-semibold py-2 tracking-wide
                ${i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-gray-400'}`}>
                {d}
              </div>
            ))}
          </div>

          {/* 날짜 셀 그리드 */}
          <div className="grid grid-cols-7 gap-1.5">
            {renderCalendar()}
          </div>
        </div>

        {/* 내 신청 내역 */}
        <div className="mt-5 bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">내 신청 내역</h4>
          {myRequests.length === 0 ? (
            <p className="text-center text-gray-400 text-sm py-8">신청 내역이 없습니다.</p>
          ) : (
            <div className="space-y-2">
              {myRequests.map((req) => {
                const canEdit = isAdmin || isFuture(req.leave_date)
                return (
                  <div
                    key={req.id}
                    className={`flex items-center justify-between px-4 py-3 rounded-xl border
                      ${canEdit ? 'border-gray-200 bg-gray-50' : 'border-gray-100 bg-gray-50 opacity-50'}`}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${MY_BG[req.leave_type]}`} />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-gray-800">{req.leave_date}</span>
                          {!isAdmin && !isFuture(req.leave_date) && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-400">지난 날짜</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {LEAVE_TYPE_LABEL[req.leave_type]}
                          {req.note && <span className="text-gray-400"> · {req.note}</span>}
                        </p>
                      </div>
                    </div>
                    {canEdit && (
                      <div className="flex items-center gap-3 shrink-0">
                        <button onClick={() => openEditModal(req)} className="text-xs text-blue-500 hover:text-blue-700 font-medium">수정</button>
                        <span className="text-gray-200 text-sm">|</span>
                        <button onClick={() => handleDelete(req.id, req.leave_type)} className="text-xs text-red-400 hover:text-red-600 font-medium">삭제</button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>


      {/* ADMIN 직원 휴가 입력 모달 */}
      {adminModalOpen && isAdmin && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-gray-900">👑 관리자 - 휴가 입력</h3>
              <button onClick={() => setAdminModalOpen(false)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-xl px-3 py-2.5 mb-4">
              <p className="text-sm font-semibold text-blue-700">📅 {adminDate}</p>
            </div>

            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">직원 선택</label>
              <select value={adminEmpId} onChange={(e) => setAdminEmpId(e.target.value)}
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                ))}
              </select>
            </div>

            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-2">휴가 유형</label>
              <div className="space-y-1.5">
                {Object.entries(LEAVE_TYPE_LABEL).map(([key, label]) => (
                  <label key={key} className={`flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer transition-colors ${
                    adminLeaveType === key ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                  }`}>
                    <input type="radio" name="adminLeaveType" value={key} checked={adminLeaveType === key}
                      onChange={() => setAdminLeaveType(key)} className="text-blue-600" />
                    <span className="text-sm">{label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                사유 {adminLeaveType === 'SPECIAL' ? <span className="text-red-500">* (경조사는 필수)</span> : '(선택)'}
              </label>
              {adminLeaveType === 'SPECIAL' && (
                <p className="text-xs text-yellow-600 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 mb-2">⭐ 경조사 휴가는 연차 차감 없이 유급 처리됩니다.</p>
              )}
              <textarea value={adminNote} onChange={(e) => setAdminNote(e.target.value)} rows={2}
                placeholder={adminLeaveType === 'SPECIAL' ? "예: 본인결혼, 부모상, 자녀출산 등" : "관리자 입력"}
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
            </div>

            <div className="flex gap-2">
              <button onClick={() => setAdminModalOpen(false)}
                className="flex-1 border border-gray-300 text-gray-600 py-2.5 rounded-xl text-sm hover:bg-gray-50 transition-colors">
                취소
              </button>
              <button onClick={handleAdminSubmit} disabled={loading || !adminEmpId}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors">
                {loading ? '입력 중...' : '휴가 입력'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* 신청 / 수정 모달 */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-gray-900">
                {modalMode === 'create' ? '휴가 신청' : '휴가 수정'}
              </h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-xl px-3 py-2.5 mb-4">
              <p className="text-sm font-semibold text-blue-700">📅 {modalDate}</p>
            </div>

            {/* 같은 날 팀원 휴가 경고 */}
            {(() => {
              const others = allRequests.filter((r) => r.leave_date === modalDate && !r.is_mine)
              if (!others.length) return null
              return (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 mb-4">
                  <p className="text-xs font-semibold text-amber-700 mb-1">⚠️ 같은 날 팀원 휴가</p>
                  {others.map((r) => (
                    <p key={r.id} className="text-xs text-amber-600">{r.employee_name}: {LEAVE_TYPE_SHORT[r.leave_type]}</p>
                  ))}
                </div>
              )
            })()}

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">휴가 유형</label>
              <div className="space-y-1.5">
                {Object.entries(LEAVE_TYPE_LABEL).map(([key, label]) => (
                  <label key={key} className={`flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer transition-colors ${
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
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
            </div>

            <div className="flex gap-2">
              <button onClick={closeModal}
                className="flex-1 border border-gray-300 text-gray-600 py-2.5 rounded-xl text-sm hover:bg-gray-50 transition-colors">
                취소
              </button>
              <button onClick={handleSubmit} disabled={loading}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors">
                {loading
                  ? (modalMode === 'create' ? '신청 중...' : '수정 중...')
                  : modalMode === 'create' ? `${LEAVE_TYPE_DAYS[leaveType]}일 신청` : '수정 완료'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
