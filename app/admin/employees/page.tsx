'use client'

import React, { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/browser'

// ── 타입 ────────────────────────────────────────────────
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
  fuel_efficiency: number | null
  emergency_contact: string | null
  bank_name: string | null
  bank_account: string | null
  encrypted_rrn: string | null
  birthday: string | null
  birthday_type: 'solar' | 'lunar' | null
  created_at: string
}

type HealthCertRecord = {
  id: string
  employee_id: string
  exam_date: string
  note: string | null
  created_at: string
}

type AuthUser = {
  id: string
  email: string
  display_name: string | null
}

// ── 상수 ────────────────────────────────────────────────
const POSITIONS = ['대표', '부장', '과장', '대리', '주임', '사원', '수습']
const FUEL_TYPES = ['휘발유', '경유', 'LPG', '전기', '하이브리드', '없음']

const EMPTY_FORM = {
  employee_code: '', name: '', email: '', mobile: '',
  address: '', hire_date: '', resign_date: '',
  position: '', car_type: '', fuel_type: '', commute_distance: '',
  fuel_efficiency: '',
  emergency_contact: '', bank_name: '', bank_account: '', rrn: '',
  birthday: '', birthday_type: 'solar' as 'solar' | 'lunar',
}

// ── 에러 한글화 ──────────────────────────────────────────
function translateError(msg: string): string {
  if (msg.includes("column") && msg.includes("schema cache"))
    return `DB 컬럼이 아직 없습니다. Supabase SQL Editor에서 마이그레이션을 먼저 실행해 주세요.\n(${msg.match(/'([^']+)'/)?.[1] ?? ''} 컬럼 누락)`
  if (msg.includes("duplicate key") || msg.includes("already exists"))
    return '이미 존재하는 데이터입니다. (중복 오류)'
  if (msg.includes("violates foreign key"))
    return '연결된 데이터가 없어 저장할 수 없습니다. (외래키 오류)'
  if (msg.includes("violates not-null"))
    return '필수 항목이 비어 있습니다.'
  if (msg.includes("permission denied") || msg.includes("policy"))
    return `접근 권한 오류: ${msg}`
  if (msg.includes("JWT") || msg.includes("session"))
    return '로그인 세션이 만료되었습니다. 다시 로그인해 주세요.'
  if (msg.includes("network") || msg.includes("fetch"))
    return '네트워크 오류가 발생했습니다. 인터넷 연결을 확인해 주세요.'
  return `저장 중 오류가 발생했습니다: ${msg}`
}

// ── 유틸 ────────────────────────────────────────────────
function formatRRN(v: string) {
  const c = v.replace(/[^0-9]/g, '').slice(0, 13)
  return c.length > 6 ? c.slice(0, 6) + '-' + c.slice(6) : c
}
function formatPhone(v: string) {
  const c = v.replace(/[^0-9]/g, '').slice(0, 11)
  if (c.length <= 3) return c
  if (c.length <= 7) return c.slice(0, 3) + '-' + c.slice(3)
  return c.slice(0, 3) + '-' + c.slice(3, 7) + '-' + c.slice(7)
}

function healthExpiry(examDate: string) {
  const d = new Date(examDate)
  d.setFullYear(d.getFullYear() + 1)
  return d.toISOString().split('T')[0]
}
function daysUntilExpiry(examDate: string) {
  const expiry = new Date(healthExpiry(examDate))
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.ceil((expiry.getTime() - today.getTime()) / 86400000)
}
function expiryBadge(examDate: string) {
  const days = daysUntilExpiry(examDate)
  if (days < 0) return { label: '만료됨', cls: 'bg-red-100 text-red-700 border-red-200' }
  if (days <= 7) return { label: `D-${days} (1주일 이내)`, cls: 'bg-red-100 text-red-700 border-red-200' }
  if (days <= 14) return { label: `D-${days} (2주 이내)`, cls: 'bg-orange-100 text-orange-700 border-orange-200' }
  if (days <= 30) return { label: `D-${days} (1개월 이내)`, cls: 'bg-yellow-100 text-yellow-700 border-yellow-200' }
  return { label: `D-${days}`, cls: 'bg-green-100 text-green-700 border-green-200' }
}

function detectChanges(original: Employee, newForm: typeof EMPTY_FORM) {
  const fieldMap: Record<string, string> = {
    employee_code: '사번', name: '이름', email: '이메일', mobile: '휴대폰',
    address: '주소', hire_date: '입사일', resign_date: '퇴사일',
    position: '직책', car_type: '차종', fuel_type: '유종',
    commute_distance: '출퇴근거리', fuel_efficiency: '연비',
    emergency_contact: '비상연락처', bank_name: '은행명', bank_account: '계좌번호',
    birthday: '생일', birthday_type: '생일구분',
  }
  const changes: Record<string, { before: unknown; after: unknown }> = {}
  for (const [key, label] of Object.entries(fieldMap)) {
    const before = (original as Record<string, unknown>)[key] ?? ''
    const after = (newForm as Record<string, unknown>)[key] ?? ''
    if (String(before) !== String(after)) changes[label] = { before, after }
  }
  return changes
}

// ── 컴포넌트 ────────────────────────────────────────────
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

  const [showMappingModal, setShowMappingModal] = useState(false)
  const [mappingTarget, setMappingTarget] = useState<Employee | null>(null)
  const [authUsers, setAuthUsers] = useState<AuthUser[]>([])
  const [mappingUid, setMappingUid] = useState('')
  const [mappingLoading, setMappingLoading] = useState(false)

  const [healthRecords, setHealthRecords] = useState<Record<string, HealthCertRecord[]>>({})

  const [leaveBalances, setLeaveBalances] = useState<Record<string, {total_days:number; used_days:number; remaining_days:number; manual_override:boolean; override_reason:string}>>({})
  const [leaveYear, setLeaveYear] = useState(new Date().getFullYear())
  const [showLeaveEmpId, setShowLeaveEmpId] = useState<string | null>(null)
  const [leaveEditDraft, setLeaveEditDraft] = useState<{total_days:number; override_reason:string}>({total_days:0, override_reason:''})
  const [leaveSaving, setLeaveSaving] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [showHealthEmpId, setShowHealthEmpId] = useState<string | null>(null)
  const [healthFormEmpId, setHealthFormEmpId] = useState<string | null>(null)
  const [healthDate, setHealthDate] = useState('')
  const [healthNote, setHealthNote] = useState('')
  const [healthLoading, setHealthLoading] = useState(false)

  useEffect(() => { fetchEmployees() }, [])
  useEffect(() => { if (employees.length > 0) fetchLeaveBalances() }, [leaveYear, employees])

  function calcLegalLeaveDays(hireDateStr: string | null | undefined, targetYear: number): number {
    if (!hireDateStr) return 0
    const hire = new Date(hireDateStr)
    const yearStart = new Date(targetYear, 0, 1)
    const yearEnd = new Date(targetYear, 11, 31)
    if (hire > yearEnd) return 0
    const diffDays = (yearStart.getTime() - hire.getTime()) / (1000*60*60*24)
    const monthsWorked = Math.floor(diffDays / 30.44)
    const yearsWorked = Math.floor(monthsWorked / 12)
    if (yearsWorked < 1) {
      const hireYear = hire.getFullYear()
      const hireMonth = hire.getMonth()
      return hireYear < targetYear ? 11 : Math.min(11 - hireMonth, 11)
    } else if (yearsWorked < 3) {
      return 15
    } else {
      return Math.min(15 + Math.floor((yearsWorked - 1) / 2), 25)
    }
  }

  async function fetchLeaveBalances() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: roleData } = await supabase.from('user_roles').select('role').eq('user_id', user.id).maybeSingle()
    const admin = roleData?.role === 'ADMIN'
    setIsAdmin(admin)

    const yearStart = `${leaveYear}-01-01`
    const yearEnd = `${leaveYear}-12-31`
    const { data: balList } = await supabase.from('leave_balance')
      .select('employee_id, total_days, used_days, remaining_days, manual_override, override_reason')
      .eq('year', leaveYear)
    const balMap: Record<string, any> = {}
    for (const b of (balList || [])) balMap[b.employee_id] = b

    const { data: reqList } = await supabase.from('leave_requests')
      .select('employee_id, leave_type').gte('leave_date', yearStart).lte('leave_date', yearEnd)
    const usedMap: Record<string, number> = {}
    for (const r of (reqList || [])) {
      const t = r.leave_type?.toUpperCase()
      const days = (t==='ANNUAL'||t==='FRIDAY_OFF') ? 1 : (t==='HALF_AM'||t==='HALF_PM') ? 0.5 : 0
      usedMap[r.employee_id] = (usedMap[r.employee_id] || 0) + days
    }

    if (admin) {
      for (const e of employees) {
        if (!e.hire_date) continue
        const legalDays = calcLegalLeaveDays(e.hire_date, leaveYear)
        const bal = balMap[e.id]
        const usedNow = bal?.used_days ?? usedMap[e.id] ?? 0
        if (!bal) {
          const { data: ins } = await supabase.from('leave_balance').insert({
            employee_id: e.id, user_id: e.auth_user_id, year: leaveYear,
            total_days: legalDays, used_days: usedNow,
            remaining_days: Math.max(0, legalDays - usedNow), manual_override: false,
          }).select().maybeSingle()
          if (ins) balMap[e.id] = ins
        } else if (!bal.manual_override && bal.total_days !== legalDays) {
          await supabase.from('leave_balance').update({
            total_days: legalDays, remaining_days: Math.max(0, legalDays - usedNow)
          }).eq('employee_id', e.id).eq('year', leaveYear)
          balMap[e.id] = { ...bal, total_days: legalDays, remaining_days: Math.max(0, legalDays - usedNow) }
        }
      }
    }

    const map: Record<string, any> = {}
    for (const e of employees) {
      const bal = balMap[e.id]
      const legalDays = calcLegalLeaveDays(e.hire_date, leaveYear)
      const total = bal?.total_days ?? legalDays
      const used = bal?.used_days ?? (usedMap[e.id] || 0)
      map[e.id] = {
        total_days: total, used_days: used,
        remaining_days: bal?.remaining_days ?? Math.max(0, total - used),
        manual_override: bal?.manual_override ?? false,
        override_reason: bal?.override_reason ?? '',
      }
    }
    setLeaveBalances(map)
  }

  async function saveLeaveOverride(empId: string, authUserId: string | null) {
    setLeaveSaving(true)
    const used = leaveBalances[empId]?.used_days ?? 0
    const total = leaveEditDraft.total_days
    const { data: ex } = await supabase.from('leave_balance')
      .select('id').eq('employee_id', empId).eq('year', leaveYear).maybeSingle()
    if (ex) {
      await supabase.from('leave_balance').update({
        total_days: total, remaining_days: Math.max(0, total-used),
        manual_override: true, override_reason: leaveEditDraft.override_reason
      }).eq('id', ex.id)
    } else {
      await supabase.from('leave_balance').insert({
        employee_id: empId, user_id: authUserId, year: leaveYear,
        total_days: total, used_days: used, remaining_days: Math.max(0, total-used),
        manual_override: true, override_reason: leaveEditDraft.override_reason
      })
    }
    setLeaveSaving(false)
    setShowLeaveEmpId(null)
    await fetchLeaveBalances()
  }

  async function fetchEmployees() {
    setFetchLoading(true)
    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) setError(translateError(error.message))
    else setEmployees(data || [])
    setFetchLoading(false)
  }

  async function fetchHealthRecords(empId: string) {
    const { data } = await supabase
      .from('employee_health_certs')
      .select('*')
      .eq('employee_id', empId)
      .order('exam_date', { ascending: false })
    setHealthRecords((prev) => ({ ...prev, [empId]: data || [] }))
  }

  async function handleAddHealthRecord(empId: string) {
    if (!healthDate) return
    setHealthLoading(true)
    const { error } = await supabase.from('employee_health_certs').insert([{
      employee_id: empId,
      exam_date: healthDate,
      note: healthNote || null,
    }])
    if (error) { console.error('health_cert insert error:', error); setError(translateError(error.message)) }
    else {
      setSuccess('보건증 검사일이 등록되었습니다.')
      setHealthDate('')
      setHealthNote('')
      setHealthFormEmpId(null)
      await fetchHealthRecords(empId)
    }
    setHealthLoading(false)
  }

  async function handleDeleteHealthRecord(recordId: string, empId: string) {
    if (!confirm('이 보건증 기록을 삭제하시겠습니까?')) return
    const { error } = await supabase.from('employee_health_certs').delete().eq('id', recordId)
    if (error) setError(translateError(error.message))
    else await fetchHealthRecords(empId)
  }

  function toggleHealthPanel(empId: string) {
    if (showHealthEmpId === empId) {
      setShowHealthEmpId(null)
    } else {
      setShowHealthEmpId(empId)
      fetchHealthRecords(empId)
    }
    setHealthFormEmpId(null)
  }

  async function handleRevealRRN(empId: string) {
    if (showRRN[empId]) {
      setShowRRN((p) => ({ ...p, [empId]: false }))
      return
    }
    const res = await fetch('/api/admin/decrypt-rrn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ empId }),
    })
    const json = await res.json()
    if (res.ok) {
      setDecryptedRRN((p) => ({ ...p, [empId]: json.rrn }))
      setShowRRN((p) => ({ ...p, [empId]: true }))
      setTimeout(() => setShowRRN((p) => ({ ...p, [empId]: false })), 30000)
    } else {
      setError(json.error || '복호화 실패')
    }
  }

  async function fetchAuthUsers() {
    try {
      const res = await fetch('/api/admin/list-auth-users')
      if (res.ok) {
        const data = await res.json()
        setAuthUsers(data.users || [])
      }
    } catch { console.error('Auth users 로드 실패') }
  }

  function openMappingModal(emp: Employee) {
    setMappingTarget(emp)
    setMappingUid(emp.auth_user_id || '')
    setShowMappingModal(true)
    fetchAuthUsers()
  }

  async function handleSaveMapping() {
    if (!mappingTarget) return
    setMappingLoading(true)
    const { error } = await supabase
      .from('employees')
      .update({ auth_user_id: mappingUid || null })
      .eq('id', mappingTarget.id)
    setMappingLoading(false)
    if (error) setError(translateError(error.message))
    else {
      setSuccess(`${mappingTarget.name}님의 UID 매핑이 완료됐습니다.`)
      setShowMappingModal(false)
      setMappingTarget(null)
      setMappingUid('')
      fetchEmployees()
    }
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
      fuel_efficiency: emp.fuel_efficiency?.toString() || '',
      emergency_contact: emp.emergency_contact || '',
      bank_name: emp.bank_name || '',
      bank_account: emp.bank_account || '',
      rrn: '',
      birthday: emp.birthday || '',
      birthday_type: emp.birthday_type || 'solar',
    })
    setShowForm(true)
    setError('')
    setSuccess('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function handleNew() {
    setEditingId(null)
    setEditingEmployee(null)
    setEditingAuthId(null)
    setForm(EMPTY_FORM)
    setShowForm(true)
    setError('')
    setSuccess('')
  }

  function handleCancel() {
    setEditingId(null)
    setEditingEmployee(null)
    setEditingAuthId(null)
    setForm(EMPTY_FORM)
    setShowForm(false)
    setError('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return setError('이름은 필수입니다.')
    if (!form.employee_code.trim()) return setError('사번은 필수입니다.')
    if (!editingId && !form.email.trim()) return setError('신규 등록 시 이메일은 필수입니다.')
    setLoading(true)
    setError('')
    setSuccess('')

    try {
      let authUserId = editingAuthId

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

      const basePayload: Record<string, unknown> = {
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
        fuel_efficiency: form.fuel_efficiency ? Number(form.fuel_efficiency) : null,
        emergency_contact: form.emergency_contact || null,
        bank_name: form.bank_name || null,
        bank_account: form.bank_account || null,
      }
      if (encryptedRrn) basePayload.encrypted_rrn = encryptedRrn

      const fullPayload: Record<string, unknown> = {
        ...basePayload,
        birthday: form.birthday || null,
        birthday_type: form.birthday ? form.birthday_type : null,
      }

      if (editingId) {
        let { error } = await supabase.from('employees').update(fullPayload).eq('id', editingId)
        if (error?.message?.includes('schema cache')) {
          const retry = await supabase.from('employees').update(basePayload).eq('id', editingId)
          error = retry.error
          if (!error) setError('⚠️ 일부 항목은 DB 마이그레이션 후 저장됩니다. (나머지는 저장됨)')
        }
        if (error) throw new Error(translateError(error.message))

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
        let { error } = await supabase.from('employees').insert([fullPayload])
        if (error?.message?.includes('schema cache')) {
          const retry = await supabase.from('employees').insert([basePayload])
          error = retry.error
          if (!error) setError('⚠️ 일부 항목은 DB 마이그레이션 후 저장됩니다. (나머지는 저장됨)')
        }
        if (error) throw new Error(translateError(error.message))
        setSuccess(`등록 완료. ${form.email}으로 초대 메일이 발송되었습니다.`)
      }

      handleCancel()
      fetchEmployees()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '저장 중 오류가 발생했습니다.')
    }
    setLoading(false)
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`"${name}" 직원을 삭제하시겠습니까?`)) return
    const { error } = await supabase.from('employees').delete().eq('id', id)
    if (error) setError(translateError(error.message))
    else { setSuccess('삭제되었습니다.'); fetchEmployees() }
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

  async function handleShowHistory(empId: string) {
    if (historyEmpId === empId) { setHistoryEmpId(null); return }
    setHistoryEmpId(empId)
    setHistoryLoading(true)
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
    (e) =>
      e.name.includes(searchQuery) ||
      e.employee_code.includes(searchQuery) ||
      (e.mobile || '').includes(searchQuery) ||
      (e.email || '').includes(searchQuery) ||
      (e.position || '').includes(searchQuery)
  )

  const unmappedEmployees = employees.filter((e) => !e.auth_user_id && e.email)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">직원 관리 (관리자)</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              이메일 입력 시 로그인 계정 자동 생성 + 초대 메일 발송 · 주민번호 AES-256 암호화 저장
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {isAdmin && (
              <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-1.5">
                <span className="text-xs font-semibold text-indigo-700">🗓️ 연차 기준 연도</span>
                <select value={leaveYear} onChange={e => setLeaveYear(Number(e.target.value))}
                  className="border border-indigo-200 rounded px-2 py-0.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400">
                  {[new Date().getFullYear()+1, new Date().getFullYear(), new Date().getFullYear()-1].map(y =>
                    <option key={y} value={y}>{y}년</option>
                  )}
                </select>
                <span className="text-[10px] text-indigo-400">입사일 기준 자동계산</span>
              </div>
            )}
            <button onClick={handleNew}
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-md transition-colors">
              + 새로 등록
            </button>
          </div>
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

        {unmappedEmployees.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
            <p className="text-sm font-semibold text-amber-800 mb-1">
              ⚠️ Auth UID 매핑 필요 ({unmappedEmployees.length}명)
            </p>
            <p className="text-xs text-amber-700 mb-2">
              아래 직원들은 Supabase Auth 계정과 연결이 안 되어 있습니다.
            </p>
            <div className="flex flex-wrap gap-2">
              {unmappedEmployees.map((emp) => (
                <button
                  key={emp.id}
                  onClick={() => openMappingModal(emp)}
                  className="bg-amber-100 hover:bg-amber-200 text-amber-900 text-xs px-3 py-1.5 rounded-full font-medium"
                >
                  {emp.name} ({emp.email}) → UID 연결
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 등록/수정 폼 */}
        {showForm && (
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-800">
                {editingId ? '직원 정보 수정' : '새 직원 등록'}
              </h2>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-6">

              {/* 기본 정보 */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">기본 정보</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                    <input name="rrn" value={form.rrn} onChange={handleChange} placeholder="XXXXXX-XXXXXXX" maxLength={14}
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
                    <label className="block text-sm font-medium text-gray-700 mb-1">💳 급여 은행</label>
                    <input name="bank_name" value={form.bank_name} onChange={handleChange}
                      placeholder="예: 국민, 신한, 하나"
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">💳 급여 계좌번호</label>
                    <input name="bank_account" value={form.bank_account} onChange={handleChange}
                      placeholder="계좌번호 입력"
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

                  {/* 생일 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">생일</label>
                    <div className="flex gap-2">
                      <div className="flex rounded-md border border-gray-300 overflow-hidden shrink-0">
                        <button
                          type="button"
                          onClick={() => setForm({ ...form, birthday_type: 'solar' })}
                          className={`px-2.5 py-2 text-xs font-medium transition-colors ${
                            form.birthday_type === 'solar'
                              ? 'bg-blue-600 text-white'
                              : 'bg-white text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          양력
                        </button>
                        <button
                          type="button"
                          onClick={() => setForm({ ...form, birthday_type: 'lunar' })}
                          className={`px-2.5 py-2 text-xs font-medium transition-colors border-l border-gray-300 ${
                            form.birthday_type === 'lunar'
                              ? 'bg-orange-500 text-white'
                              : 'bg-white text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          음력
                        </button>
                      </div>
                      <input
                        type="date"
                        name="birthday"
                        value={form.birthday}
                        onChange={handleChange}
                        className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      {form.birthday_type === 'lunar' ? '🌙 음력 날짜를 입력하세요' : '☀️ 양력 날짜를 입력하세요'}
                    </p>
                  </div>
                </div>
              </div>

              {/* 차량/통근 정보 */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">차량 / 통근 정보</p>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">연비 (km/L)</label>
                    <input type="number" name="fuel_efficiency" value={form.fuel_efficiency} onChange={handleChange}
                      placeholder="예: 12.5" min="1" max="50" step="0.1"
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <p className="text-xs text-gray-400 mt-1">급여 유류비 자동계산에 사용</p>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 flex-wrap">
                <button type="submit" disabled={loading}
                  className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-5 py-2 rounded-md">
                  {loading ? '처리 중...' : editingId ? '수정 완료' : '등록 + 초대 메일 발송'}
                </button>
                {editingId && form.email && (
                  <button type="button"
                    onClick={() => handleResendInvite(form.email, form.name, editingId)}
                    disabled={resendingId === editingId}
                    className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-medium px-5 py-2 rounded-md">
                    {resendingId === editingId ? '발송 중...' : '📧 초대 메일 재발송'}
                  </button>
                )}
                <button type="button" onClick={handleCancel}
                  className="border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium px-5 py-2 rounded-md">
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
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="이름, 사번, 이메일, 직책..."
              className="border border-gray-300 rounded-md px-3 py-1.5 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {fetchLoading ? (
            <div className="py-12 text-center text-gray-400 text-sm">불러오는 중...</div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-gray-400 text-sm">직원 데이터가 없습니다.</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filtered.map((emp) => {
                const latestHealth = healthRecords[emp.id]?.[0]
                const healthBadge = latestHealth ? expiryBadge(latestHealth.exam_date) : null
                return (
                  <React.Fragment key={emp.id}>
                    <div className="px-6 py-4 hover:bg-gray-50 transition-colors">
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-base font-bold text-gray-900">{emp.name}</span>
                          {emp.position && (
                            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">{emp.position}</span>
                          )}
                          {emp.resign_date
                            ? <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">퇴사</span>
                            : <span className="text-xs bg-green-100 text-green-600 px-2 py-0.5 rounded-full">재직</span>}
                          {emp.auth_user_id
                            ? <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full">✓ 계정연동</span>
                            : <button onClick={() => openMappingModal(emp)}
                                className="text-xs bg-amber-100 hover:bg-amber-200 text-amber-700 px-2 py-0.5 rounded-full">
                                미연동 →연결
                              </button>}
                          {healthBadge && (
                            <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${healthBadge.cls}`}>
                              🏥 {healthBadge.label}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 shrink-0 flex-wrap">
                          <button onClick={() => handleEdit(emp)}
                            className="text-xs text-blue-600 hover:text-blue-800 font-semibold">수정</button>
                          {emp.email && (
                            <button onClick={() => handleResendInvite(emp.email!, emp.name, emp.id)}
                              disabled={resendingId === emp.id}
                              className="text-xs text-orange-500 hover:text-orange-700 font-medium">
                              {resendingId === emp.id ? '발송중...' : '재초대'}
                            </button>
                          )}
                          <button onClick={() => toggleHealthPanel(emp.id)}
                            className={`text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
                              showHealthEmpId === emp.id
                                ? 'bg-teal-600 text-white border-teal-600'
                                : 'text-teal-600 border-teal-300 hover:bg-teal-50'
                            }`}>
                            🏥 보건증
                          </button>
                          <button onClick={() => handleShowHistory(emp.id)}
                            className={`text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
                              historyEmpId === emp.id
                                ? 'bg-gray-600 text-white border-gray-600'
                                : 'text-gray-500 border-gray-300 hover:bg-gray-50'
                            }`}>
                            📋 이력
                          </button>
                          <button onClick={() => handleDelete(emp.id, emp.name)}
                            className="text-xs text-red-400 hover:text-red-600 font-medium">삭제</button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-1.5 text-xs">
                        <div className="flex gap-1.5">
                          <span className="text-gray-400 shrink-0">사번</span>
                          <span className="text-gray-700 font-medium">{emp.employee_code}</span>
                        </div>
                        <div className="flex gap-1.5">
                          <span className="text-gray-400 shrink-0">이메일</span>
                          <span className="text-gray-700 truncate">{emp.email || '-'}</span>
                        </div>
                        <div className="flex gap-1.5">
                          <span className="text-gray-400 shrink-0">휴대폰</span>
                          <span className="text-gray-700">{emp.mobile || '-'}</span>
                        </div>
                        <div className="flex gap-1.5">
                          <span className="text-gray-400 shrink-0">입사일</span>
                          <span className="text-gray-700">{emp.hire_date || '-'}</span>
                        </div>
                        <div className="flex gap-1.5">
                          <span className="text-gray-400 shrink-0">급여계좌</span>
                          <span className="text-gray-700">
                            {emp.bank_name && emp.bank_account
                              ? `[${emp.bank_name}] ${emp.bank_account}`
                              : emp.bank_name || emp.bank_account || '-'}
                          </span>
                        </div>
                        <div className="flex gap-1.5">
                          <span className="text-gray-400 shrink-0">생일</span>
                          {emp.birthday ? (
                            <span className="flex items-center gap-1">
                              <span className={`text-[10px] px-1 py-0.5 rounded font-medium ${
                                emp.birthday_type === 'lunar' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'
                              }`}>{emp.birthday_type === 'lunar' ? '음' : '양'}</span>
                              <span className="text-gray-700">{emp.birthday}</span>
                            </span>
                          ) : <span className="text-gray-300">-</span>}
                        </div>
                        <div className="flex gap-1.5">
                          <span className="text-gray-400 shrink-0">차량</span>
                          <span className="text-gray-700">
                            {emp.car_type ? `${emp.car_type}${emp.fuel_type ? ` (${emp.fuel_type})` : ''}` : '-'}
                          </span>
                        </div>
                        <div className="flex gap-1.5">
                          <span className="text-gray-400 shrink-0">통근</span>
                          <span className="text-gray-700">
                            {emp.commute_distance ? `편도 ${emp.commute_distance}km` : '-'}
                            {emp.fuel_efficiency ? ` / 연비 ${emp.fuel_efficiency}km/L` : ''}
                          </span>
                        </div>
                        <div className="flex gap-1.5 items-center">
                          <span className="text-gray-400 shrink-0">주민번호</span>
                          {emp.encrypted_rrn ? (
                            <span className="flex items-center gap-1">
                              <span className="font-mono text-gray-700">
                                {showRRN[emp.id] && decryptedRRN[emp.id] ? decryptedRRN[emp.id] : '●●●●●●-●●●●●●●'}
                              </span>
                              <button onClick={() => handleRevealRRN(emp.id)}
                                className="text-blue-500 hover:text-blue-700 underline ml-0.5">
                                {showRRN[emp.id] ? '숨김' : '확인'}
                              </button>
                            </span>
                          ) : <span className="text-gray-300">미입력</span>}
                        </div>
                      </div>
                    </div>

                    {/* 연차 현황 패널 */}
                    {showLeaveEmpId === emp.id && (
                      <div className="px-6 py-5 bg-indigo-50 border-t border-indigo-100">
                        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                          <p className="text-sm font-semibold text-indigo-800">🗓️ {emp.name} · 연차 현황 ({leaveYear}년)</p>
                          {isAdmin && (
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs text-indigo-500">법정 연차: <strong>{calcLegalLeaveDays(emp.hire_date, leaveYear)}일</strong></span>
                              <button
                                onClick={() => setLeaveEditDraft({ total_days: leaveBalances[emp.id]?.total_days ?? calcLegalLeaveDays(emp.hire_date, leaveYear), override_reason: leaveBalances[emp.id]?.override_reason ?? '' })}
                                className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg font-medium"
                              >✏️ 수동 조정</button>
                            </div>
                          )}
                        </div>
                        <div className="grid grid-cols-3 gap-3 mb-4">
                          {[
                            { label: '부여 연차', value: leaveBalances[emp.id]?.total_days ?? 0, color: 'blue', icon: '📅' },
                            { label: '사용 연차', value: leaveBalances[emp.id]?.used_days ?? 0, color: 'orange', icon: '✈️' },
                            { label: '잔여 연차', value: leaveBalances[emp.id]?.remaining_days ?? 0, color: 'emerald', icon: '✅' },
                          ].map(({ label, value, color, icon }) => (
                            <div key={label} className={`bg-white rounded-xl border border-${color}-100 p-3 text-center`}>
                              <div className="text-lg mb-0.5">{icon}</div>
                              <div className={`text-xl font-black text-${color}-600`}>{value}<span className="text-xs font-normal text-gray-400 ml-0.5">일</span></div>
                              <div className="text-[10px] text-gray-500">{label}</div>
                            </div>
                          ))}
                        </div>
                        {(leaveBalances[emp.id]?.total_days ?? 0) > 0 && (() => {
                          const total = leaveBalances[emp.id].total_days
                          const used = leaveBalances[emp.id].used_days
                          const pct = Math.round(used / total * 100)
                          const barColor = pct >= 90 ? 'bg-red-400' : pct >= 70 ? 'bg-orange-400' : 'bg-emerald-400'
                          return (
                            <div className="flex items-center gap-3 mb-4">
                              <div className="flex-1 bg-white rounded-full h-2.5 border border-indigo-100">
                                <div className={`${barColor} h-2.5 rounded-full transition-all`} style={{width:`${Math.min(pct,100)}%`}} />
                              </div>
                              <span className={`text-xs font-bold ${pct>=90?'text-red-500':pct>=70?'text-orange-500':'text-emerald-600'}`}>{pct}%</span>
                            </div>
                          )
                        })()}
                        {leaveBalances[emp.id]?.manual_override && (
                          <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
                            🔒 <strong>수동 조정됨</strong>{leaveBalances[emp.id].override_reason ? ` · ${leaveBalances[emp.id].override_reason}` : ''}
                          </div>
                        )}
                        {isAdmin && leaveEditDraft.total_days !== undefined && showLeaveEmpId === emp.id && (
                          <div className="bg-white border-2 border-indigo-200 rounded-xl p-4 flex flex-col gap-3">
                            <p className="text-xs font-semibold text-indigo-700">✏️ 부여 연차 수동 조정</p>
                            <div className="flex items-center gap-3 flex-wrap">
                              <div className="flex items-center gap-2">
                                <label className="text-xs text-gray-600 shrink-0">부여일수</label>
                                <input type="number" value={leaveEditDraft.total_days} min={0} max={365}
                                  onChange={e => setLeaveEditDraft(d => ({...d, total_days: Number(e.target.value)}))}
                                  className="w-20 text-center border-2 border-indigo-300 rounded-lg px-2 py-1.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-400"
                                />
                                <span className="text-xs text-gray-400">일</span>
                              </div>
                              <div className="flex-1 min-w-[160px] flex items-center gap-2">
                                <label className="text-xs text-gray-600 shrink-0">조정 사유</label>
                                <input type="text" value={leaveEditDraft.override_reason} placeholder="예: 연봉계약 특약"
                                  onChange={e => setLeaveEditDraft(d => ({...d, override_reason: e.target.value}))}
                                  className="flex-1 text-xs border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                                />
                              </div>
                              <div className="flex gap-2">
                                <button onClick={() => saveLeaveOverride(emp.id, emp.auth_user_id)}
                                  disabled={leaveSaving}
                                  className="text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-4 py-1.5 rounded-lg font-medium">
                                  {leaveSaving ? '저장중...' : '저장'}
                                </button>
                                <button onClick={() => setLeaveEditDraft({total_days:0, override_reason:''})}
                                  className="text-sm text-gray-500 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50">
                                  취소
                                </button>
                              </div>
                            </div>
                            <p className="text-[10px] text-indigo-400">※ 저장 후 자동부여 실행 시 수동조정 값이 보호됩니다.</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* 보건증 패널 */}
                    {showHealthEmpId === emp.id && (
                      <div className="px-6 py-4 bg-teal-50 border-t border-teal-100">
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-sm font-semibold text-teal-800">🏥 {emp.name} · 보건증 검사 이력</p>
                          <button
                            onClick={() => setHealthFormEmpId(healthFormEmpId === emp.id ? null : emp.id)}
                            className="text-xs bg-teal-600 hover:bg-teal-700 text-white px-3 py-1.5 rounded-lg font-medium"
                          >
                            + 검사일 추가
                          </button>
                        </div>
                        {healthFormEmpId === emp.id && (
                          <div className="flex gap-3 items-end mb-4 flex-wrap bg-white border border-teal-200 rounded-xl p-4">
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">검사일</label>
                              <input type="date" value={healthDate}
                                onChange={(e) => setHealthDate(e.target.value)}
                                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
                            </div>
                            <div className="flex-1 min-w-[180px]">
                              <label className="block text-xs font-medium text-gray-600 mb-1">메모 (선택)</label>
                              <input type="text" value={healthNote}
                                onChange={(e) => setHealthNote(e.target.value)}
                                placeholder="예: 정기검사, 신규입사"
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
                            </div>
                            <div className="flex gap-2">
                              <button onClick={() => handleAddHealthRecord(emp.id)}
                                disabled={healthLoading || !healthDate}
                                className="bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg">
                                {healthLoading ? '저장 중...' : '저장'}
                              </button>
                              <button onClick={() => { setHealthFormEmpId(null); setHealthDate(''); setHealthNote('') }}
                                className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2 border border-gray-300 rounded-lg">
                                취소
                              </button>
                            </div>
                          </div>
                        )}
                        {!healthRecords[emp.id] ? (
                          <p className="text-xs text-gray-400">불러오는 중...</p>
                        ) : healthRecords[emp.id].length === 0 ? (
                          <div className="text-center py-6 text-sm text-gray-400 bg-white rounded-xl border border-teal-100">
                            보건증 검사 기록이 없습니다. 위 버튼으로 추가하세요.
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {healthRecords[emp.id].map((rec, idx) => {
                              const badge = expiryBadge(rec.exam_date)
                              const isLatest = idx === 0
                              return (
                                <div key={rec.id}
                                  className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm ${
                                    isLatest ? 'bg-white border-2 border-teal-300 shadow-sm' : 'bg-white border border-gray-200'
                                  }`}>
                                  {isLatest && (
                                    <span className="text-[10px] bg-teal-600 text-white px-2 py-0.5 rounded-full font-bold shrink-0">최신</span>
                                  )}
                                  <span className="font-medium text-gray-800 shrink-0">📅 검사일: <strong>{rec.exam_date}</strong></span>
                                  <span className="text-gray-400 text-xs shrink-0">만료: {healthExpiry(rec.exam_date)}</span>
                                  <span className={`px-2.5 py-0.5 rounded-full border text-xs font-semibold shrink-0 ${badge.cls}`}>
                                    {badge.label}
                                  </span>
                                  {rec.note && <span className="text-gray-500 text-xs">{rec.note}</span>}
                                  <button onClick={() => handleDeleteHealthRecord(rec.id, emp.id)}
                                    className="ml-auto text-red-400 hover:text-red-600 text-xs font-medium shrink-0">
                                    삭제
                                  </button>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    {/* 수정 이력 패널 */}
                    {historyEmpId === emp.id && (
                      <div className="px-6 py-4 bg-gray-50 border-t border-gray-100">
                        <p className="text-sm font-semibold text-gray-600 mb-3">📋 {emp.name} · 수정 이력</p>
                        {historyLoading ? (
                          <p className="text-xs text-gray-400">불러오는 중...</p>
                        ) : history.length === 0 ? (
                          <p className="text-xs text-gray-400">수정 이력이 없습니다.</p>
                        ) : (
                          <div className="space-y-2">
                            {history.map((h, i) => (
                              <div key={i} className="bg-white border border-gray-200 rounded-xl p-3">
                                <div className="flex items-center gap-2 mb-2">
                                  <span className="text-xs text-gray-500">{new Date(h.changed_at as string).toLocaleString('ko-KR')}</span>
                                  <span className="text-xs text-blue-600 font-medium">{(h.changed_by_email as string) || '관리자'}</span>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  {Object.entries(h.changes as Record<string, { before: unknown; after: unknown }>).map(([field, val]) => (
                                    <div key={field} className="text-xs bg-yellow-50 border border-yellow-200 rounded-lg px-2.5 py-1.5">
                                      <span className="font-semibold text-gray-700">{field}</span>
                                      <span className="text-gray-400 mx-1">:</span>
                                      <span className="text-red-500 line-through">{String(val.before || '-')}</span>
                                      <span className="mx-1 text-gray-400">→</span>
                                      <span className="text-green-600 font-medium">{String(val.after || '-')}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </React.Fragment>
                )
              })}
            </div>
          )}
          <div className="px-6 py-3 border-t border-gray-100 text-xs text-gray-400">
            ※ 주민번호 AES-256 암호화 · 확인 후 30초 자동 숨김 · RLS 관리자 전용
          </div>
        </div>
      </div>

      {/* UID 매핑 모달 */}
      {showMappingModal && mappingTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
            <h2 className="text-lg font-bold text-gray-900 mb-1">Auth UID 연결</h2>
            <p className="text-sm text-gray-500 mb-4">
              <strong>{mappingTarget.name}</strong> ({mappingTarget.email})
            </p>
            <div className="mb-4 p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-700">
              Supabase Auth에 등록된 계정과 직원을 연결합니다.
            </div>
            {authUsers.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-medium text-gray-600 mb-2">Auth 계정 선택:</p>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {authUsers.map((u) => {
                    const alreadyMapped = employees.some((e) => e.auth_user_id === u.id && e.id !== mappingTarget.id)
                    return (
                      <button
                        key={u.id}
                        onClick={() => !alreadyMapped && setMappingUid(u.id)}
                        disabled={alreadyMapped}
                        className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition-colors ${
                          alreadyMapped
                            ? 'border-gray-100 bg-gray-50 opacity-40 cursor-not-allowed'
                            : mappingUid === u.id
                            ? 'border-blue-500 bg-blue-50 text-blue-800'
                            : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{u.email}</span>
                          {u.email === mappingTarget.email && (
                            <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-medium">이메일 일치 ✓</span>
                          )}
                          {alreadyMapped && <span className="text-xs text-gray-400">이미 연결됨</span>}
                        </div>
                        <p className="text-xs text-gray-400 font-mono mt-0.5">{u.id}</p>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
            <div className="mb-5">
              <label className="block text-xs font-medium text-gray-600 mb-1">또는 UID 직접 입력</label>
              <input
                type="text"
                value={mappingUid}
                onChange={(e) => setMappingUid(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { setShowMappingModal(false); setMappingTarget(null); setMappingUid('') }}
                className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm hover:bg-gray-50"
              >
                취소
              </button>
              <button
                onClick={handleSaveMapping}
                disabled={mappingLoading || !mappingUid}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50"
              >
                {mappingLoading ? '저장 중...' : 'UID 연결 저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
