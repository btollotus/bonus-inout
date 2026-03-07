'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/browser'

type LeaveType = 'annual' | 'half_am' | 'half_pm' | 'sick' | 'special'

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
  created_at: string
}

const LEAVE_TYPE_LABELS: Record<string, string> = {
  ANNUAL: '연차 (1일)',
  HALF_AM: '반차 - 오전 (0.5일)',
  HALF_PM: '반차 - 오후 (0.5일)',
  SICK: '병가 (1일)',
  FRIDAY_OFF: '금요일 휴무 (1일)',
}

const LEAVE_TYPE_DAYS: Record<string, number> = {
  ANNUAL: 1, HALF_AM: 0.5, HALF_PM: 0.5, SICK: 1, FRIDAY_OFF: 1,
}

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  pending: { label: '검토중', className: 'bg-yellow-100 text-yellow-700' },
  approved: { label: '승인됨', className: 'bg-green-100 text-green-700' },
  rejected: { label: '반려됨', className: 'bg-red-100 text-red-700' },
}

export default function LeavePage() {
  const supabase = createClient()
  const [myRequests, setMyRequests] = useState<LeaveRequest[]>([])
  const [balance, setBalance] = useState<{ granted: number; used: number; remaining: number } | null>(null)
  const [form, setForm] = useState({ leave_date: '', leave_type: 'ANNUAL', note: '' })
  const [loading, setLoading] = useState(false)
  const [fetchLoading, setFetchLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [tab, setTab] = useState<'apply' | 'history'>('apply')
  const currentYear = new Date().getFullYear()

  useEffect(() => { fetchMyData() }, [])

  async function fetchMyData() {
    setFetchLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setFetchLoading(false); return }

    const { data: requests } = await supabase
      .from('leave_requests')
      .select('*')
      .eq('user_id', user.id)
      .order('leave_date', { ascending: false })

    setMyRequests(requests || [])

    const yearRequests = (requests || []).filter((r) => r.year === currentYear && r.status !== 'rejected')
    const used = yearRequests.reduce((sum: number, r: LeaveRequest) => sum + Number(r.days_used), 0)

    const { data: balanceData } = await supabase
      .from('leave_balance')
      .select('*')
      .eq('user_id', user.id)
      .eq('year', currentYear)
      .maybeSingle()

    const granted = balanceData?.total_granted ?? 15
    setBalance({ granted, used, remaining: granted - used })
    setFetchLoading(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.leave_date) return setError('날짜를 선택해주세요.')
    setLoading(true); setError(''); setSuccess('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('로그인이 필요합니다.'); setLoading(false); return }

    const { data: emp } = await supabase.from('employees').select('id, name').eq('auth_user_id', user.id).maybeSingle()

    const payload = {
      user_id: user.id,
      employee_id: emp?.id ?? null,
      employee_name: emp?.name ?? user.email ?? '미등록',
      leave_date: form.leave_date,
      leave_type: form.leave_type,
      note: form.note || null,
      status: 'pending',
      days_used: LEAVE_TYPE_DAYS[form.leave_type] ?? 1,
      attended: false,
      year: new Date(form.leave_date).getFullYear(),
    }

    const { error } = await supabase.from('leave_requests').insert([payload])
    if (error) setError(error.message)
    else {
      setSuccess('신청이 완료되었습니다. 관리자 승인 후 확정됩니다.')
      setForm({ leave_date: '', leave_type: 'ANNUAL', note: '' })
      fetchMyData()
      setTab('history')
    }
    setLoading(false)
  }

  async function handleCancel(id: string) {
    if (!confirm('이 신청을 취소하시겠습니까?')) return
    const { error } = await supabase.from('leave_requests').delete().eq('id', id).eq('status', 'pending')
    if (error) setError('취소 실패: 이미 처리된 신청은 취소할 수 없습니다.')
    else { setSuccess('신청이 취소되었습니다.'); fetchMyData() }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-xl font-bold text-gray-900">연차 / 반차 / 병가 신청</h1>
          <p className="text-xs text-gray-500 mt-0.5">전 직원 접근 가능 · 신청 후 관리자 승인 절차</p>
        </div>
      </div>
      <div className="max-w-3xl mx-auto px-6 py-6 space-y-5">
        {!fetchLoading && balance && (
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: '부여 연차', value: balance.granted, color: 'text-blue-600' },
              { label: '사용 연차', value: balance.used, color: 'text-orange-500' },
              { label: '잔여 연차', value: balance.remaining, color: balance.remaining <= 3 ? 'text-red-600' : 'text-green-600' },
            ].map((item) => (
              <div key={item.label} className="bg-white border border-gray-200 rounded-lg p-4 text-center shadow-sm">
                <p className="text-xs text-gray-500 mb-1">{currentYear}년 {item.label}</p>
                <p className={`text-3xl font-bold ${item.color}`}>{item.value}<span className="text-base font-normal text-gray-400 ml-1">일</span></p>
              </div>
            ))}
          </div>
        )}
        {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm flex justify-between">{error}<button onClick={() => setError('')}>✕</button></div>}
        {success && <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-md text-sm flex justify-between">{success}<button onClick={() => setSuccess('')}>✕</button></div>}

        <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
          <div className="flex border-b border-gray-200">
            {(['apply', 'history'] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${tab === t ? 'bg-blue-50 text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:bg-gray-50'}`}>
                {t === 'apply' ? '📋 신청하기' : '📅 신청 내역'}
              </button>
            ))}
          </div>
          {tab === 'apply' ? (
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">휴가 유형 <span className="text-red-500">*</span></label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {Object.keys(LEAVE_TYPE_LABELS).map((type) => (
                    <label key={type} className={`flex items-center gap-3 p-3 rounded-md border cursor-pointer transition-colors ${form.leave_type === type ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                      <input type="radio" name="leave_type" value={type} checked={form.leave_type === type} onChange={() => setForm({ ...form, leave_type: type })} className="accent-blue-600" />
                      <span className="text-sm text-gray-700">{LEAVE_TYPE_LABELS[type]}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">날짜 <span className="text-red-500">*</span></label>
                <input type="date" value={form.leave_date} onChange={(e) => setForm({ ...form, leave_date: e.target.value })}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">사유 (선택)</label>
                <textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })}
                  placeholder="병원 방문, 가족 행사 등 사유를 입력하세요." rows={3}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              </div>
              <div className="flex items-center justify-between pt-2">
                <p className="text-xs text-gray-400">신청 시 <strong>{LEAVE_TYPE_DAYS[form.leave_type]}일</strong>이 차감됩니다.</p>
                <button type="submit" disabled={loading}
                  className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-6 py-2 rounded-md transition-colors">
                  {loading ? '신청 중...' : '신청하기'}
                </button>
              </div>
            </form>
          ) : (
            <div>
              {fetchLoading ? (
                <div className="py-10 text-center text-gray-400 text-sm">불러오는 중...</div>
              ) : myRequests.length === 0 ? (
                <div className="py-10 text-center text-gray-400 text-sm">신청 내역이 없습니다.</div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {myRequests.map((req) => {
                    const statusInfo = STATUS_LABEL[req.status] ?? { label: req.status, className: 'bg-gray-100 text-gray-600' }
                    return (
                      <div key={req.id} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-900">{req.leave_date}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusInfo.className}`}>{statusInfo.label}</span>
                          </div>
                          <p className="text-xs text-gray-500">{LEAVE_TYPE_LABELS[req.leave_type] ?? req.leave_type} · {req.days_used}일 차감</p>
                          {req.note && <p className="text-xs text-gray-400">{req.note}</p>}
                        </div>
                        {req.status === 'pending' && (
                          <button onClick={() => handleCancel(req.id)} className="text-xs text-red-500 hover:text-red-700 font-medium">취소</button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
