'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/browser'
import Image from 'next/image'

type Mode = 'checking' | 'login' | 'set-password' | 'forgot-password' | 'forgot-sent'

export default function LoginPage() {
  const supabase = createClient()
  const router = useRouter()

  const [mode, setMode] = useState<Mode>('checking')
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

  // 비밀번호 재설정 이메일 발송
  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return setError('이메일을 입력해주세요.')
    setLoading(true); setError('')
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/login`,
    })
    setLoading(false)
    if (error) {
      setError(error.message)
    } else {
      setMode('forgot-sent')
    }
  }

  if (mode === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="text-white text-sm">확인 중...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">

        {/* 로고 */}
        <div className="flex flex-col items-center mb-6">
          <Image
            src="/bonusmate-logo.png"
            alt="BONUSMATE"
            width={120}
            height={120}
            className="object-contain mb-3"
            priority
          />
          <p className="text-sm text-gray-500 mt-1">
            {mode === 'set-password' ? '비밀번호 설정'
              : mode === 'forgot-password' ? '비밀번호 재설정'
              : mode === 'forgot-sent' ? '이메일 발송 완료'
              : '로그인'}
          </p>
        </div>

        {/* set-password 안내 배너 */}
        {mode === 'set-password' && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mb-5">
            <p className="text-sm text-blue-800 font-medium">✅ 계정 확인 완료</p>
            {email && <p className="text-xs text-blue-600 mt-0.5">{email}</p>}
            <p className="text-xs text-blue-700 mt-1">사용하실 비밀번호를 설정하면 등록이 완료됩니다.</p>
          </div>
        )}

        {/* 에러 / 성공 메시지 */}
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

        {/* ── 로그인 폼 ── */}
        {mode === 'login' && (
          <>
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

            {/* 비밀번호 찾기 링크 */}
            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={() => { setMode('forgot-password'); setError(''); setSuccess('') }}
                className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
              >
                비밀번호를 잊으셨나요?
              </button>
            </div>
          </>
        )}

        {/* ── 비밀번호 재설정 폼 ── */}
        {mode === 'forgot-password' && (
          <>
            <p className="text-sm text-gray-600 mb-4">
              가입하신 이메일 주소를 입력하시면 비밀번호 재설정 링크를 보내드립니다.
            </p>
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">이메일</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="가입한 이메일 입력" required
                  className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <button type="submit" disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-md transition-colors">
                {loading ? '발송 중...' : '재설정 링크 보내기'}
              </button>
            </form>
            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={() => { setMode('login'); setError('') }}
                className="text-sm text-gray-500 hover:text-gray-700 hover:underline"
              >
                ← 로그인으로 돌아가기
              </button>
            </div>
          </>
        )}

        {/* ── 이메일 발송 완료 화면 ── */}
        {mode === 'forgot-sent' && (
          <div className="text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-800 mb-1">재설정 링크를 발송했습니다</p>
            <p className="text-xs text-gray-500 mb-1">{email}</p>
            <p className="text-xs text-gray-400 mb-6">메일함을 확인해주세요. 스팸함도 확인해보세요.</p>
            <button
              type="button"
              onClick={() => { setMode('login'); setEmail(''); setError('') }}
              className="text-sm text-blue-600 hover:underline"
            >
              ← 로그인으로 돌아가기
            </button>
          </div>
        )}

        {/* ── 비밀번호 설정 폼 (초대/재설정 링크) ── */}
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

        <p className="text-xs text-center text-gray-400 mt-6">(주)보누스메이트 ERP</p>
      </div>
    </div>
  )
}
