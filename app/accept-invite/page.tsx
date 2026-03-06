'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/browser'

export default function AcceptInvitePage() {
  const supabase = createClient()
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)
  const [email, setEmail] = useState('')

  useEffect(() => {
    // URL 해시에서 access_token 확인 (Supabase 초대 링크 방식)
    const hash = window.location.hash
    if (hash.includes('access_token') || hash.includes('type=invite')) {
      setReady(true)
      // 현재 세션에서 이메일 가져오기
      supabase.auth.getSession().then(({ data }) => {
        if (data.session?.user?.email) setEmail(data.session.user.email)
      })
    } else {
      // 해시가 없으면 일반 로그인 페이지로
      router.replace('/login')
    }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 6) return setError('비밀번호는 6자 이상이어야 합니다.')
    if (password !== confirm) return setError('비밀번호가 일치하지 않습니다.')

    setLoading(true); setError('')
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.replace('/')
    }
  }

  if (!ready) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <p className="text-white">확인 중...</p>
    </div>
  )

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="bg-white rounded-xl shadow-lg p-8 w-full max-w-md">
        {/* 로고/헤더 */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-600 rounded-full mb-3">
            <span className="text-white text-2xl font-bold">B</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900">(주)보누스메이트</h1>
          <p className="text-sm text-gray-500 mt-1">직원 계정 등록</p>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mb-5">
          <p className="text-sm text-blue-800 font-medium">✅ 초대가 확인되었습니다</p>
          {email && <p className="text-xs text-blue-600 mt-0.5">{email}</p>}
          <p className="text-xs text-blue-700 mt-1">사용하실 비밀번호를 설정하시면 등록이 완료됩니다.</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded-md mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">비밀번호 설정</label>
            <input
              type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="6자 이상 입력"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">비밀번호 확인</label>
            <input
              type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
              placeholder="동일한 비밀번호 재입력"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            type="submit" disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-md transition-colors"
          >
            {loading ? '등록 중...' : '등록 완료 및 로그인'}
          </button>
        </form>

        <p className="text-xs text-center text-gray-400 mt-4">
          (주)보누스메이트 ERP · 문의: 관리자에게 연락하세요
        </p>
      </div>
    </div>
  )
}
