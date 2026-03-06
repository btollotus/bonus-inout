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
  created_at: string
  // 주민번호는 encrypted_rrn으로 저장, 표시용 마스킹
  encrypted_rrn?: string | null
}

const EMPTY_FORM = {
  employee_code: '', name: '', email: '', mobile: '',
  address: '', hire_date: '', resign_date: '', rrn: '',
}

// 주민번호 표시 마스킹: 730228-1168160 → 730228-1******
function maskRRN(raw: string) {
  if (!raw) return ''
  const clean = raw.replace(/-/g, '')
  if (clean.length < 7) return raw
  return clean.slice(0, 6) + '-' + clean[6] + '******'
}

// 주민번호 형식 자동 하이픈: 7302281168160 → 730228-1168160
function formatRRN(value: string) {
  const clean = value.replace(/[^0-9]/g, '').slice(0, 13)
  if (clean.length > 6) return clean.slice(0, 6) + '-' + clean.slice(6)
  return clean
}

export default function EmployeesPage() {
  const supabase = createClient()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [form, setForm] = useState(EMPTY_FORM)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingAuthId, setEditingAuthId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [fetchLoading, setFetchLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [showRRN, setShowRRN] = useState<Record<string, boolean>>({})

  useEffect(() => { fetchEmployees() }, [])

  async function fetchEmployees() {
    setFetchLoading(true)
    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) setError(error.message)
    else setEmployees(data || [])
    setFetchLoading(false)
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.name === 'rrn') {
      setForm({ ...form, rrn: formatRRN(e.target.value) })
    } else {
      setForm({ ...form, [e.target.name]: e.target.value })
    }
  }

  function handleEdit(emp: Employee) {
    setEditingId(emp.id)
    setEditingAuthId(emp.auth_user_id)
    setForm({
      employee_code: emp.employee_code,
      name: emp.name,
      email: emp.email || '',
      mobile: emp.mobile || '',
      address: emp.address || '',
      hire_date: emp.hire_date || '',
      resign_date: emp.resign_date || '',
      rrn: '', // 수정 시 주민번호는 비워둠 (재입력 시에만 변경)
    })
    setShowForm(true); setError(''); setSuccess('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function handleNew() {
    setEditingId(null); setEditingAuthId(null)
    setForm(EMPTY_FORM); setShowForm(true); setError(''); setSuccess('')
  }

  function handleCancel() {
    setEditingId(null); setEditingAuthId(null)
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

      // 신규 등록 → Supabase Auth 계정 생성 + 초대 메일
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

      // 주민번호 암호화는 서버에서 처리
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
      }
      // 주민번호 입력된 경우만 업데이트
      if (encryptedRrn) payload.encrypted_rrn = encryptedRrn

      if (editingId) {
        const { error } = await supabase.from('employees').update(payload).eq('id', editingId)
        if (error) throw new Error(error.message)
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
    if (!confirm(`"${name}" 직원을 삭제하시겠습니까?\n(Auth 계정은 별도 삭제 필요)`)) return
    const { error } = await supabase.from('employees').delete().eq('id', id)
    if (error) setError(error.message)
    else { setSuccess('삭제되었습니다.'); fetchEmployees() }
  }

  // 주민번호 복호화해서 표시
  async function handleRevealRRN(empId: string) {
    if (showRRN[empId]) { setShowRRN((p) => ({ ...p, [empId]: false })); return }
    const res = await fetch('/api/admin/decrypt-rrn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ empId }),
    })
    const json = await res.json()
    if (res.ok) {
      // 복호화된 값을 employees 상태에 임시 저장
      setEmployees((prev) => prev.map((e) => e.id === empId ? { ...e, _decryptedRrn: json.rrn } as Employee & { _decryptedRrn: string } : e))
      setShowRRN((p) => ({ ...p, [empId]: true }))
      // 10초 후 자동 숨김
      setTimeout(() => setShowRRN((p) => ({ ...p, [empId]: false })), 10000)
    } else {
      setError(json.error || '복호화 실패')
    }
  }

  const filtered = employees.filter(
    (e) => e.name.includes(searchQuery) ||
      e.employee_code.includes(searchQuery) ||
      (e.mobile || '').includes(searchQuery) ||
      (e.email || '').includes(searchQuery)
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">직원 관리 (관리자)</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              이메일 입력 시 로그인 계정이 자동 생성되고 초대 메일이 발송됩니다. 주민번호는 암호화 저장됩니다.
            </p>
          </div>
          <button onClick={handleNew} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-md transition-colors">
            + 새로 등록
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
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
              <h2 className="text-base font-semibold text-gray-800">
                {editingId ? '직원 정보 수정' : '새 직원 등록'}
              </h2>
            </div>
            <form onSubmit={handleSubmit} className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    이메일 {!editingId && <span className="text-red-500">*</span>}
                    {!editingId && <span className="text-xs text-blue-600 ml-1">→ 초대 메일 자동 발송</span>}
                  </label>
                  <input type="email" name="email" value={form.email} onChange={handleChange} placeholder="hong@company.com"
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    주민번호
                    <span className="text-xs text-gray-400 ml-2">
                      {editingId ? '(재입력 시에만 변경)' : ''} · AES-256 암호화 저장
                    </span>
                  </label>
                  <input
                    name="rrn" value={form.rrn} onChange={handleChange}
                    placeholder="730228-1168160" maxLength={14}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono tracking-wider"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">휴대폰</label>
                  <input name="mobile" value={form.mobile} onChange={handleChange} placeholder="010-0000-0000"
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">주소</label>
                  <input name="address" value={form.address} onChange={handleChange} placeholder="주소"
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
              <div className="flex gap-3 mt-6">
                <button type="submit" disabled={loading}
                  className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-5 py-2 rounded-md transition-colors">
                  {loading ? '처리 중...' : editingId ? '수정 완료' : '등록 + 초대 메일 발송'}
                </button>
                <button type="button" onClick={handleCancel}
                  className="border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium px-5 py-2 rounded-md transition-colors">
                  취소
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-800">
              직원 목록 <span className="text-gray-400 font-normal text-sm">({filtered.length}명)</span>
            </h2>
            <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="이름, 사번, 이메일, 전화번호..."
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
                    <th className="px-4 py-3 text-left font-medium">사번</th>
                    <th className="px-4 py-3 text-left font-medium">이메일</th>
                    <th className="px-4 py-3 text-left font-medium">휴대폰</th>
                    <th className="px-4 py-3 text-left font-medium">주민번호</th>
                    <th className="px-4 py-3 text-left font-medium">입사일</th>
                    <th className="px-4 py-3 text-center font-medium">상태</th>
                    <th className="px-4 py-3 text-center font-medium">계정</th>
                    <th className="px-4 py-3 text-left font-medium">작업</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map((emp) => {
                    const empAny = emp as Employee & { _decryptedRrn?: string }
                    return (
                      <tr key={emp.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 font-medium text-gray-900">{emp.name}</td>
                        <td className="px-4 py-3 text-gray-600">{emp.employee_code}</td>
                        <td className="px-4 py-3 text-gray-600 text-xs">{emp.email || '-'}</td>
                        <td className="px-4 py-3 text-gray-600">{emp.mobile || '-'}</td>
                        <td className="px-4 py-3">
                          {emp.encrypted_rrn ? (
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-xs text-gray-700">
                                {showRRN[emp.id] && empAny._decryptedRrn
                                  ? maskRRN(empAny._decryptedRrn)
                                  : '●●●●●●-●●●●●●●'}
                              </span>
                              <button onClick={() => handleRevealRRN(emp.id)}
                                className="text-xs text-blue-500 hover:text-blue-700 underline">
                                {showRRN[emp.id] ? '숨김' : '확인'}
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-300">미입력</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-600 text-xs">{emp.hire_date || '-'}</td>
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
                          <div className="flex gap-2">
                            <button onClick={() => handleEdit(emp)} className="text-blue-600 hover:text-blue-800 text-xs font-medium">수정</button>
                            <button onClick={() => handleDelete(emp.id, emp.name)} className="text-red-500 hover:text-red-700 text-xs font-medium">삭제</button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="px-6 py-3 border-t border-gray-100 text-xs text-gray-400">
            ※ 주민번호는 AES-256 암호화 저장 · 확인 버튼 클릭 후 10초 뒤 자동 숨김 · RLS로 관리자만 접근 가능
          </div>
        </div>
      </div>
    </div>
  )
}
