'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/browser'

type Employee = {
  id: string
  auth_user_id: string | null
  employee_code: string
  name: string
  email: string | null
  mobile: string | null
  address: string | null
  hire_date: string | null
  resign_date: string | null
  position: string | null
  car_type: string | null
  fuel_type: string | null
  commute_distance: number | null
  emergency_contact: string | null
  encrypted_rrn: string | null
  created_at: string
}

const POSITIONS = ['대표', '부장', '과장', '대리', '주임', '사원', '수습']
const FUEL_TYPES = ['휘발유', '경유', 'LPG', '전기', '하이브리드', '없음']

const EMPTY_FORM = {
  employee_code: '', name: '', email: '', mobile: '',
  address: '', hire_date: '', resign_date: '',
  position: '', car_type: '', fuel_type: '', commute_distance: '',
  emergency_contact: '', rrn: '',
}

// 주민번호 자동 하이픈
function formatRRN(v: string) {
  const c = v.replace(/[^0-9]/g, '').slice(0, 13)
  return c.length > 6 ? c.slice(0, 6) + '-' + c.slice(6) : c
}
// 전화번호 자동 하이픈
function formatPhone(v: string) {
  const c = v.replace(/[^0-9]/g, '').slice(0, 11)
  if (c.length <= 3) return c
  if (c.length <= 7) return c.slice(0, 3) + '-' + c.slice(3)
  return c.slice(0, 3) + '-' + c.slice(3, 7) + '-' + c.slice(7)
}

// 변경사항 감지
function detectChanges(original: Employee, newForm: typeof EMPTY_FORM) {
  const fieldMap: Record<string, string> = {
    employee_code: '사번', name: '이름', email: '이메일', mobile: '휴대폰',
    address: '주소', hire_date: '입사일', resign_date: '퇴사일',
    position: '직책', car_type: '차종', fuel_type: '유종',
    commute_distance: '출퇴근거리', emergency_contact: '비상연락처',
  }
  const changes: Record<string, { before: unknown; after: unknown }> = {}
  for (const [key, label] of Object.entries(fieldMap)) {
    const before = (original as Record<string, unknown>)[key] ?? ''
    const after = (newForm as Record<string, unknown>)[key] ?? ''
    if (String(before) !== String(after)) {
      changes[label] = { before, after }
    }
  }
  return changes
}

export default function EmployeesPage() {
  const supabase = createClient()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [form, setForm] = useState(EMPTY_FORM)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null)
  const [editingAuthId, setEditingAuthId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [fetchLoading, setFetchLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [showRRN, setShowRRN] = useState<Record<string, boolean>>({})
  const [decryptedRRN, setDecryptedRRN] = useState<Record<string, string>>({})
  const [resendingId, setResendingId] = useState<string | null>(null)
  const [historyEmpId, setHistoryEmpId] = useState<string | null>(null)
  const [history, setHistory] = useState<Record<string, unknown>[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  useEffect(() => { fetchEmployees() }, [])

  async function fetchEmployees() {
    setFetchLoading(true)
    const { data, error } = await supabase.from('employees').select('*').order('created_at', { ascending: false })
    if (error) setError(error.message)
    else setEmployees(data || [])
    setFetchLoading(false)
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value } = e.target
    if (name === 'rrn') { setForm({ ...form, rrn: formatRRN(value) }); return }
    if (name === 'mobile') { setForm({ ...form, mobile: formatPhone(value) }); return }
    setForm({ ...form, [name]: value })
  }

  function handleEdit(emp: Employee) {
    setEditingId(emp.id)
    setEditingEmployee(emp)
    setEditingAuthId(emp.auth_user_id)
    setForm({
      employee_code: emp.employee_code,
      name: emp.name,
      email: emp.email || '',
      mobile: emp.mobile || '',
      address: emp.address || '',
      hire_date: emp.hire_date || '',
      resign_date: emp.resign_date || '',
      position: emp.position || '',
      car_type: emp.car_type || '',
      fuel_type: emp.fuel_type || '',
      commute_distance: emp.commute_distance?.toString() || '',
      emergency_contact: emp.emergency_contact || '',
      rrn: '',
    })
    setShowForm(true); setError(''); setSuccess('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function handleNew() {
    setEditingId(null); setEditingEmployee(null); setEditingAuthId(null)
    setForm(EMPTY_FORM); setShowForm(true); setError(''); setSuccess('')
  }

  function handleCancel() {
    setEditingId(null); setEditingEmployee(null); setEditingAuthId(null)
    setForm(EMPTY_FORM); setShowForm(false); setError('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return setError('이름은 필수입니다.')
    if (!form.employee_code.trim()) return setError('사번은 필수입니다.')
    if (!editingId && !form.email.trim()) return setError('신규 등록 시 이메일은 필수입니다.')
    setLoading(true); setError(''); setSuccess('')

    try {
      let authUserId = editingAuthId

      // 신규 등록 → 초대 메일
      if (!editingId && form.email.trim()) {
        const res = await fetch('/api/admin/invite-employee', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: form.email.trim(), name: form.name.trim() }),
        })
        const json = await res.json()
        if (!res.ok) { setError(json.error || '계정 생성 실패'); setLoading(false); return }
        authUserId = json.userId
      }

      // 주민번호 암호화
      let encryptedRrn: string | null = null
      if (form.rrn.trim()) {
        const rrnRes = await fetch('/api/admin/encrypt-rrn', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rrn: form.rrn.replace(/-/g, '') }),
        })
        const rrnJson = await rrnRes.json()
        if (!rrnRes.ok) { setError(rrnJson.error || '주민번호 암호화 실패'); setLoading(false); return }
        encryptedRrn = rrnJson.encrypted
      }

      const payload: Record<string, unknown> = {
        auth_user_id: authUserId || null,
        employee_code: form.employee_code,
        name: form.name,
        email: form.email || null,
        mobile: form.mobile || null,
        address: form.address || null,
        hire_date: form.hire_date || null,
        resign_date: form.resign_date || null,
        position: form.position || null,
        car_type: form.car_type || null,
        fuel_type: form.fuel_type || null,
        commute_distance: form.commute_distance ? Number(form.commute_distance) : null,
        emergency_contact: form.emergency_contact || null,
      }
      if (encryptedRrn) payload.encrypted_rrn = encryptedRrn

      if (editingId) {
        const { error } = await supabase.from('employees').update(payload).eq('id', editingId)
        if (error) throw new Error(error.message)

        // 수정 이력 저장
        if (editingEmployee) {
          const changes = detectChanges(editingEmployee, form)
          if (Object.keys(changes).length > 0) {
            const { data: { user } } = await supabase.auth.getUser()
            await supabase.from('employee_history').insert([{
              employee_id: editingId,
              employee_name: form.name,
              changed_by: user?.id ?? null,
              changed_by_email: user?.email ?? null,
              changes,
            }])
          }
        }
        setSuccess('직원 정보가 수정되었습니다.')
      } else {
        const { error } = await supabase.from('employees').insert([payload])
        if (error) throw new Error(error.message)
        setSuccess(`등록 완료. ${form.email}으로 초대 메일이 발송되었습니다.`)
      }

      handleCancel(); fetchEmployees()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '오류가 발생했습니다.')
    }
    setLoading(false)
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`"${name}" 직원을 삭제하시겠습니까?`)) return
    const { error } = await supabase.from('employees').delete().eq('id', id)
    if (error) setError(error.message)
    else { setSuccess('삭제되었습니다.'); fetchEmployees() }
  }

  async function handleRevealRRN(empId: string) {
    if (showRRN[empId]) { setShowRRN((p) => ({ ...p, [empId]: false })); return }
    const res = await fetch('/api/admin/decrypt-rrn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ empId }),
    })
    const json = await res.json()
    if (res.ok) {
      setDecryptedRRN((p) => ({ ...p, [empId]: json.rrn }))
      setShowRRN((p) => ({ ...p, [empId]: true }))
      setTimeout(() => setShowRRN((p) => ({ ...p, [empId]: false })), 10000)
    } else {
      setError(json.error || '복호화 실패')
    }
  }

  async function handleResendInvite(email: string, name: string, empId: string) {
    if (!email) return setError('이메일이 없어 초대 메일을 보낼 수 없습니다.')
    if (!confirm(`${name} (${email})에게 초대 메일을 다시 발송할까요?`)) return
    setResendingId(empId)
    const res = await fetch('/api/admin/invite-employee', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name }),
    })
    const json = await res.json()
    setResendingId(null)
    if (!res.ok) setError(json.error || '발송 실패')
    else setSuccess(`${email}로 초대 메일을 재발송했습니다.`)
  }

  async function handleShowHistory(empId: string, empName: string) {
    if (historyEmpId === empId) { setHistoryEmpId(null); return }
    setHistoryEmpId(empId); setHistoryLoading(true)
    const { data } = await supabase
      .from('employee_history')
      .select('*')
      .eq('employee_id', empId)
      .order('changed_at', { ascending: false })
      .limit(20)
    setHistory(data || [])
    setHistoryLoading(false)
  }

  const filtered = employees.filter(
    (e) => e.name.includes(searchQuery) ||
      e.employee_code.includes(searchQuery) ||
      (e.mobile || '').includes(searchQuery) ||
      (e.email || '').includes(searchQuery) ||
      (e.position || '').includes(searchQuery)
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">직원 관리 (관리자)</h1>
            <p className="text-xs text-gray-500 mt-0.5">이메일 입력 시 로그인 계정 자동 생성 + 초대 메일 발송 · 주민번호 AES-256 암호화 저장</p>
          </div>
          <button onClick={handleNew} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-md transition-colors">
            + 새로 등록
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm flex justify-between">
            <span>{error}</span>
            <button onClick={() => setError('')} className="ml-4 text-red-400 hover:text-red-600">✕</button>
          </div>
        )}
        {success && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-md text-sm flex justify-between">
            <span>{success}</span>
            <button onClick={() => setSuccess('')} className="ml-4 text-green-400 hover:text-green-600">✕</button>
          </div>
        )}

        {showForm && (
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-800">{editingId ? '직원 정보 수정' : '새 직원 등록'}</h2>
            </div>
            <form onSubmit={handleSubmit} className="p-6">
              {/* 기본 정보 */}
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">기본 정보</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">이름 <span className="text-red-500">*</span></label>
                  <input name="name" value={form.name} onChange={handleChange} placeholder="홍길동"
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">사번 <span className="text-red-500">*</span></label>
                  <input name="employee_code" value={form.employee_code} onChange={handleChange} placeholder="20240301-0001"
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">직책</label>
                  <select name="position" value={form.position} onChange={handleChange}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">선택</option>
                    {POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    이메일 {!editingId && <span className="text-red-500">*</span>}
                    {!editingId && <span className="text-xs text-blue-600 ml-1">→ 초대 메일 자동 발송</span>}
                  </label>
                  <input type="email" name="email" value={form.email} onChange={handleChange} placeholder="hong@company.com"
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">휴대폰</label>
                  <input name="mobile" value={form.mobile} onChange={handleChange} placeholder="010-0000-0000"
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    주민번호
                    <span className="text-xs text-gray-400 ml-1">{editingId ? '재입력시만 변경' : ''} · AES-256 암호화</span>
                  </label>
                  <input name="rrn" value={form.rrn} onChange={handleChange} placeholder="730228-1168160" maxLength={14}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono tracking-wider" />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">주소</label>
                  <input name="address" value={form.address} onChange={handleChange} placeholder="주소"
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">비상연락처</label>
                  <input name="emergency_contact" value={form.emergency_contact} onChange={handleChange}
                    placeholder="홍아버지 010-0000-0000 (부)"
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">입사일</label>
                  <input type="date" name="hire_date" value={form.hire_date} onChange={handleChange}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">퇴사일</label>
                  <input type="date" name="resign_date" value={form.resign_date} onChange={handleChange}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>

              {/* 차량/통근 정보 */}
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">차량 / 통근 정보</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">차종</label>
                  <input name="car_type" value={form.car_type} onChange={handleChange} placeholder="예: 현대 아반떼"
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">유종</label>
                  <select name="fuel_type" value={form.fuel_type} onChange={handleChange}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">선택</option>
                    {FUEL_TYPES.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">출퇴근 거리 (km)</label>
                  <input type="number" name="commute_distance" value={form.commute_distance} onChange={handleChange}
                    placeholder="편도 km" min="0" step="0.1"
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>

              <div className="flex gap-3 mt-6 flex-wrap">
                <button type="submit" disabled={loading}
                  className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-5 py-2 rounded-md transition-colors">
                  {loading ? '처리 중...' : editingId ? '수정 완료' : '등록 + 초대 메일 발송'}
                </button>
                {editingId && form.email && (
                  <button type="button"
                    onClick={() => handleResendInvite(form.email, form.name, editingId)}
                    disabled={resendingId === editingId}
                    className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-medium px-5 py-2 rounded-md transition-colors">
                    {resendingId === editingId ? '발송 중...' : '📧 초대 메일 재발송'}
                  </button>
                )}
                <button type="button" onClick={handleCancel}
                  className="border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium px-5 py-2 rounded-md transition-colors">
                  취소
                </button>
              </div>
            </form>
          </div>
        )}

        {/* 직원 목록 */}
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-800">
              직원 목록 <span className="text-gray-400 font-normal text-sm">({filtered.length}명)</span>
            </h2>
            <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="이름, 사번, 이메일, 직책..."
              className="border border-gray-300 rounded-md px-3 py-1.5 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          {fetchLoading ? (
            <div className="py-12 text-center text-gray-400 text-sm">불러오는 중...</div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-gray-400 text-sm">직원 데이터가 없습니다.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">이름</th>
                    <th className="px-4 py-3 text-left font-medium">직책</th>
                    <th className="px-4 py-3 text-left font-medium">사번</th>
                    <th className="px-4 py-3 text-left font-medium">이메일</th>
                    <th className="px-4 py-3 text-left font-medium">휴대폰</th>
                    <th className="px-4 py-3 text-left font-medium">주민번호</th>
                    <th className="px-4 py-3 text-left font-medium">차량</th>
                    <th className="px-4 py-3 text-left font-medium">통근</th>
                    <th className="px-4 py-3 text-center font-medium">상태</th>
                    <th className="px-4 py-3 text-center font-medium">계정</th>
                    <th className="px-4 py-3 text-left font-medium">작업</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map((emp) => (
                    <>
                      <tr key={emp.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 font-medium text-gray-900">{emp.name}</td>
                        <td className="px-4 py-3">
                          {emp.position
                            ? <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">{emp.position}</span>
                            : <span className="text-gray-300 text-xs">-</span>}
                        </td>
                        <td className="px-4 py-3 text-gray-600 text-xs">{emp.employee_code}</td>
                        <td className="px-4 py-3 text-gray-600 text-xs">{emp.email || '-'}</td>
                        <td className="px-4 py-3 text-gray-600 text-xs">{emp.mobile || '-'}</td>
                        <td className="px-4 py-3">
                          {emp.encrypted_rrn ? (
                            <div className="flex items-center gap-1">
                              <span className="font-mono text-xs text-gray-700">
                                {showRRN[emp.id] && decryptedRRN[emp.id]
                                  ? decryptedRRN[emp.id].slice(0, 8) + '******'
                                  : '●●●●●●-●'}
                              </span>
                              <button onClick={() => handleRevealRRN(emp.id)}
                                className="text-xs text-blue-500 hover:text-blue-700 underline ml-1">
                                {showRRN[emp.id] ? '숨김' : '확인'}
                              </button>
                            </div>
                          ) : <span className="text-xs text-gray-300">미입력</span>}
                        </td>
                        <td className="px-4 py-3 text-gray-600 text-xs">
                          {emp.car_type ? `${emp.car_type}${emp.fuel_type ? ` (${emp.fuel_type})` : ''}` : '-'}
                        </td>
                        <td className="px-4 py-3 text-gray-600 text-xs">
                          {emp.commute_distance ? `${emp.commute_distance}km` : '-'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {emp.resign_date
                            ? <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">퇴사</span>
                            : <span className="text-xs bg-green-100 text-green-600 px-2 py-0.5 rounded-full">재직</span>}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {emp.auth_user_id
                            ? <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full">✓ 연동</span>
                            : <span className="text-xs bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full">미연동</span>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2 flex-wrap">
                            <button onClick={() => handleEdit(emp)} className="text-blue-600 hover:text-blue-800 text-xs font-medium">수정</button>
                            {emp.email && (
                              <button onClick={() => handleResendInvite(emp.email!, emp.name, emp.id)}
                                disabled={resendingId === emp.id}
                                className="text-orange-500 hover:text-orange-700 text-xs font-medium">
                                {resendingId === emp.id ? '발송중' : '재초대'}
                              </button>
                            )}
                            <button onClick={() => handleShowHistory(emp.id, emp.name)} className="text-gray-500 hover:text-gray-700 text-xs font-medium">이력</button>
                            <button onClick={() => handleDelete(emp.id, emp.name)} className="text-red-500 hover:text-red-700 text-xs font-medium">삭제</button>
                          </div>
                        </td>
                      </tr>

                      {/* 수정 이력 인라인 표시 */}
                      {historyEmpId === emp.id && (
                        <tr key={emp.id + '-history'}>
                          <td colSpan={11} className="px-4 py-3 bg-gray-50 border-t border-gray-100">
                            <div className="text-xs font-semibold text-gray-500 mb-2">📋 {emp.name} 수정 이력</div>
                            {historyLoading ? (
                              <div className="text-xs text-gray-400">불러오는 중...</div>
                            ) : history.length === 0 ? (
                              <div className="text-xs text-gray-400">수정 이력이 없습니다.</div>
                            ) : (
                              <div className="space-y-2">
                                {history.map((h: Record<string, unknown>, i) => (
                                  <div key={i} className="bg-white border border-gray-200 rounded p-2.5">
                                    <div className="flex items-center gap-2 mb-1.5">
                                      <span className="text-xs text-gray-500">{new Date(h.changed_at as string).toLocaleString('ko-KR')}</span>
                                      <span className="text-xs text-blue-600">{h.changed_by_email as string || '관리자'}</span>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                      {Object.entries(h.changes as Record<string, { before: unknown; after: unknown }>).map(([field, val]) => (
                                        <div key={field} className="text-xs bg-yellow-50 border border-yellow-200 rounded px-2 py-1">
                                          <span className="font-medium text-gray-700">{field}</span>
                                          <span className="text-gray-400 mx-1">:</span>
                                          <span className="text-red-500 line-through">{String(val.before || '-')}</span>
                                          <span className="mx-1 text-gray-400">→</span>
                                          <span className="text-green-600">{String(val.after || '-')}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="px-6 py-3 border-t border-gray-100 text-xs text-gray-400">
            ※ 주민번호 AES-256 암호화 · 확인 후 10초 자동 숨김 · RLS 관리자 전용
          </div>
        </div>
      </div>
    </div>
  )
}
