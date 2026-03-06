'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/browser'

type Employee = {
  id: string
  auth_user_id: string | null
  employee_code: string
  name: string
  mobile: string | null
  address: string | null
  hire_date: string | null
  resign_date: string | null
  created_at: string
}

const EMPTY_FORM = {
  auth_user_id: '', employee_code: '', name: '', mobile: '', address: '', hire_date: '', resign_date: '',
}

export default function EmployeesPage() {
  const supabase = createClient()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [form, setForm] = useState(EMPTY_FORM)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [fetchLoading, setFetchLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => { fetchEmployees() }, [])

  async function fetchEmployees() {
    setFetchLoading(true)
    const { data, error } = await supabase.from('employees').select('*').order('created_at', { ascending: false })
    if (error) setError(error.message)
    else setEmployees(data || [])
    setFetchLoading(false)
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  function handleEdit(emp: Employee) {
    setEditingId(emp.id)
    setForm({ auth_user_id: emp.auth_user_id || '', employee_code: emp.employee_code, name: emp.name, mobile: emp.mobile || '', address: emp.address || '', hire_date: emp.hire_date || '', resign_date: emp.resign_date || '' })
    setShowForm(true); setError(''); setSuccess('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function handleNew() { setEditingId(null); setForm(EMPTY_FORM); setShowForm(true); setError(''); setSuccess('') }
  function handleCancel() { setEditingId(null); setForm(EMPTY_FORM); setShowForm(false); setError('') }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return setError('이름은 필수입니다.')
    if (!form.employee_code.trim()) return setError('사번은 필수입니다.')
    setLoading(true); setError(''); setSuccess('')
    const payload = { auth_user_id: form.auth_user_id || null, employee_code: form.employee_code, name: form.name, mobile: form.mobile || null, address: form.address || null, hire_date: form.hire_date || null, resign_date: form.resign_date || null }
    if (editingId) {
      const { error } = await supabase.from('employees').update(payload).eq('id', editingId)
      if (error) setError(error.message)
      else { setSuccess('직원 정보가 수정되었습니다.'); handleCancel(); fetchEmployees() }
    } else {
      const { error } = await supabase.from('employees').insert([payload])
      if (error) setError(error.message)
      else { setSuccess('직원이 등록되었습니다.'); handleCancel(); fetchEmployees() }
    }
    setLoading(false)
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`"${name}" 직원을 삭제하시겠습니까?`)) return
    const { error } = await supabase.from('employees').delete().eq('id', id)
    if (error) setError(error.message)
    else { setSuccess('삭제되었습니다.'); fetchEmployees() }
  }

  const filtered = employees.filter((e) => e.name.includes(searchQuery) || e.employee_code.includes(searchQuery) || (e.mobile || '').includes(searchQuery))

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">직원 관리 (관리자)</h1>
            <p className="text-xs text-gray-500 mt-0.5">employees.auth_user_id에는 직원의 로그인 UID(auth.users.id, uuid)만 매핑하세요. 사번/코드는 employee_code에 입력합니다.</p>
          </div>
          <button onClick={handleNew} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-md transition-colors">+ 새로 등록</button>
        </div>
      </div>
      <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
        {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm flex justify-between">{error}<button onClick={() => setError('')}>✕</button></div>}
        {success && <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-md text-sm flex justify-between">{success}<button onClick={() => setSuccess('')}>✕</button></div>}
        {showForm && (
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-800">{editingId ? '직원 정보 수정' : '새 직원 등록'}</h2>
            </div>
            <form onSubmit={handleSubmit} className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">이름(name) <span className="text-red-500">*</span></label>
                  <input name="name" value={form.name} onChange={handleChange} placeholder="예: 홍길동" className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">사번(employee_code) <span className="text-red-500">*</span></label>
                  <input name="employee_code" value={form.employee_code} onChange={handleChange} placeholder="예: 20240301_0001" className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">auth_user_id (직원 UID, uuid)</label>
                  <input name="auth_user_id" value={form.auth_user_id} onChange={handleChange} placeholder="예: 2c1d... (Supabase Auth Users의 id)" className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <p className="text-xs text-gray-400 mt-1">여기에 사번(20240301_0001)을 입력하면 안 됩니다. uuid만 입력하세요.</p>
                </div>
              <div className="flex gap-3 mt-6">
                <button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-5 py-2 rounded-md transition-colors">{loading ? '저장 중...' : editingId ? '수정 완료' : '등록'}</button>
                <button type="button" onClick={handleCancel} className="border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium px-5 py-2 rounded-md transition-colors">취소</button>
              </div>
            </form>
          </div>
        )}
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-800">직원 목록 <span className="text-gray-400 font-normal text-sm">({filtered.length}명)</span></h2>
            <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="이름, 사번, 전화번호 검색..." className="border border-gray-300 rounded-md px-3 py-1.5 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-blue-500" />
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
                    <th className="px-4 py-3 text-left font-medium">auth_user_id</th>
                    <th className="px-4 py-3 text-left font-medium">휴대폰</th>
                    <th className="px-4 py-3 text-left font-medium">입사일</th>
                    <th className="px-4 py-3 text-left font-medium">퇴사일</th>
                    <th className="px-4 py-3 text-left font-medium">작업</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map((emp) => (
                    <tr key={emp.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-900">{emp.name}</td>
                      <td className="px-4 py-3 text-gray-600">{emp.employee_code}</td>
                      <td className="px-4 py-3 text-gray-400 font-mono text-xs">{emp.auth_user_id ? emp.auth_user_id.substring(0, 12) + '...' : '-'}</td>
                      <td className="px-4 py-3 text-gray-600">{emp.mobile || '-'}</td>
                      <td className="px-4 py-3 text-gray-600">{emp.hire_date || '-'}</td>
                      <td className="px-4 py-3 text-gray-600">{emp.resign_date ? <span className="text-red-500">{emp.resign_date}</span> : <span className="text-green-600">재직중</span>}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button onClick={() => handleEdit(emp)} className="text-blue-600 hover:text-blue-800 text-xs font-medium">수정</button>
                          <button onClick={() => handleDelete(emp.id, emp.name)} className="text-red-500 hover:text-red-700 text-xs font-medium">삭제</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="px-6 py-3 border-t border-gray-100 text-xs text-gray-400">※ employees는 RLS로 관리자만 접근하게 되어 있어, 직원이 자기 인사정보를 볼 수 없습니다(요구사항 충족).</div>
        </div>
      </div>
    </div>
  )
}
