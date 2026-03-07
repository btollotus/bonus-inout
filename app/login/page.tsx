'use client'

import type { Metadata } from "next";
export const metadata: Metadata = { title: "로그인 | BONUSMATE ERP" };

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/browser'

export default function LoginPage() {
  const supabase = createClient()
  const router = useRouter()

  const [mode, setMode] = useState<'login' | 'set-password' | 'checking'>('checking')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    const hash = window.location.hash.slice(1)
    const params = new URLSearchParams(hash)
    const errorCode = params.get('error_code')
    const type = params.get('type')
    const accessToken = params.get('access_token')
    const refreshToken = params.get('refresh_token')

    if (errorCode) {
      setError('링크가 만료되었습니다. 관리자에게 재발송을 요청하세요.')
      setMode('login')
      return
    }

    if (accessToken && refreshToken && (type === 'invite' || type === 'recovery')) {
      // 토큰을 직접 세션으로 설정
      supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      }).then(({ data, error }) => {
        if (error || !data.session) {
          setError('링크가 만료되었습니다. 관리자에게 재발송을 요청하세요.')
          setMode('login')
        } else {
          setEmail(data.session.user.email || '')
          setMode('set-password')
          // 해시 제거 (보안)
          window.history.replaceState(null, '', window.location.pathname)
        }
      })
    } else {
      setMode('login')
    }
  }, [])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError('이메일 또는 비밀번호가 올바르지 않습니다.'); setLoading(false) }
    else router.replace('/')
  }

  async function handleSetPassword(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 6) return setError('비밀번호는 6자 이상이어야 합니다.')
    if (password !== confirm) return setError('비밀번호가 일치하지 않습니다.')
    setLoading(true); setError('')
    const { error } = await supabase.auth.updateUser({ password })
    if (error) { setError(error.message); setLoading(false) }
    else {
      setSuccess('비밀번호가 설정되었습니다! 잠시 후 이동합니다...')
      setTimeout(() => router.replace('/'), 1500)
    }
  }

  // 토큰 확인 중
  if (mode === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="text-white text-sm">확인 중...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="bg-white rounded-xl shadow-lg p-8 w-full max-w-md">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-600 rounded-full mb-3">
            <span className="text-white text-2xl font-bold">B</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900">BONUSMATE ERP</h1>
          <p className="text-sm text-gray-500 mt-1">
            {mode === 'set-password' ? '비밀번호 설정' : '로그인'}
          </p>
        </div>

        {mode === 'set-password' && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mb-5">
            <p className="text-sm text-blue-800 font-medium">✅ 계정 확인 완료</p>
            {email && <p className="text-xs text-blue-600 mt-0.5">{email}</p>}
            <p className="text-xs text-blue-700 mt-1">사용하실 비밀번호를 설정하면 등록이 완료됩니다.</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2.5 rounded-md mb-4">
            {error}
          </div>
        )}
        {success && (
          <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-2.5 rounded-md mb-4">
            {success}
          </div>
        )}

        {mode === 'login' && (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">이메일</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="이메일 입력" required
                className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">비밀번호</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="비밀번호 입력" required
                className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <button type="submit" disabled={loading}
              className="w-full bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white font-semibold py-2.5 rounded-md transition-colors">
              {loading ? '로그인 중...' : '로그인'}
            </button>
          </form>
        )}

        {mode === 'set-password' && (
          <form onSubmit={handleSetPassword} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">새 비밀번호</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="6자 이상 입력" required
                className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">비밀번호 확인</label>
              <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
                placeholder="동일한 비밀번호 재입력" required
                className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <button type="submit" disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-md transition-colors">
              {loading ? '설정 중...' : '등록 완료 및 로그인'}
            </button>
          </form>
        )}

        <p className="text-xs text-center text-gray-400 mt-5">(주)보누스메이트 ERP</p>
      </div>
    </div>
  )
}
