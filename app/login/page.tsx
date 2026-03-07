'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/browser'

type Mode = 'checking' | 'login' | 'set-password' | 'forgot-password' | 'forgot-sent' | 'find-email'

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

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return setError('이메일을 입력해주세요.')
    setLoading(true); setError('')
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/login`,
    })
    setLoading(false)
    if (error) setError(error.message)
    else setMode('forgot-sent')
  }

  function goBack() { setMode('login'); setError(''); setSuccess('') }

  // ── 공통 카드 래퍼 ──────────────────────────
  const Card = ({ children }: { children: React.ReactNode }) => (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-md border border-gray-200 p-8 w-full max-w-md">
        {/* 로고 */}
        <div className="flex flex-col items-center mb-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/bonusmate-logo.png"
            alt="BONUSMATE"
            width={110}
            height={110}
            className="object-contain mb-2"
          />
        </div>
        {children}
        <p className="text-xs text-center text-gray-400 mt-6">(주)보누스메이트 ERP</p>
      </div>
    </div>
  )

  // ── 확인 중 ──
  if (mode === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-500 text-sm">확인 중...</div>
      </div>
    )
  }

  // ── 로그인 ──
  if (mode === 'login') return (
    <Card>
      <h2 className="text-center text-lg font-bold text-gray-800 mb-5">로그인</h2>
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2.5 rounded-md mb-4">{error}</div>}
      <form onSubmit={handleLogin} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">이메일</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="이메일 입력" required
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">비밀번호</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="비밀번호 입력" required
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <button type="submit" disabled={loading}
          className="w-full bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition-colors">
          {loading ? '로그인 중...' : '로그인'}
        </button>
      </form>

      {/* 계정 찾기 링크 */}
      <div className="mt-5 flex justify-center gap-4 text-sm">
        <button onClick={() => { setMode('forgot-password'); setError('') }}
          className="text-blue-600 hover:underline">
          비밀번호 찾기
        </button>
        <span className="text-gray-300">|</span>
        <button onClick={() => { setMode('find-email'); setError('') }}
          className="text-blue-600 hover:underline">
          이메일 찾기
        </button>
      </div>
    </Card>
  )

  // ── 비밀번호 찾기 ──
  if (mode === 'forgot-password') return (
    <Card>
      <h2 className="text-center text-lg font-bold text-gray-800 mb-1">비밀번호 재설정</h2>
      <p className="text-center text-sm text-gray-500 mb-5">가입한 이메일로 재설정 링크를 보내드립니다.</p>
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2.5 rounded-md mb-4">{error}</div>}
      <form onSubmit={handleForgotPassword} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">이메일</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="가입한 이메일 입력" required
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <button type="submit" disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition-colors">
          {loading ? '발송 중...' : '재설정 링크 보내기'}
        </button>
      </form>
      <button onClick={goBack} className="mt-4 w-full text-center text-sm text-gray-500 hover:text-gray-700">
        ← 로그인으로 돌아가기
      </button>
    </Card>
  )

  // ── 비밀번호 재설정 링크 발송 완료 ──
  if (mode === 'forgot-sent') return (
    <Card>
      <div className="text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <h2 className="text-base font-bold text-gray-800 mb-1">이메일을 확인해주세요</h2>
        <p className="text-sm text-blue-600 font-medium mb-1">{email}</p>
        <p className="text-xs text-gray-500 mb-1">비밀번호 재설정 링크를 발송했습니다.</p>
        <p className="text-xs text-gray-400 mb-6">스팸함도 확인해보세요.</p>
        <button onClick={goBack} className="text-sm text-blue-600 hover:underline">
          ← 로그인으로 돌아가기
        </button>
      </div>
    </Card>
  )

  // ── 이메일 찾기 ──
  if (mode === 'find-email') return (
    <Card>
      <h2 className="text-center text-lg font-bold text-gray-800 mb-1">이메일 찾기</h2>
      <p className="text-center text-sm text-gray-500 mb-5">가입 시 사용한 이메일을 잊으신 경우</p>

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-5">
        <p className="text-sm font-semibold text-amber-800 mb-2">📌 이메일 확인 방법</p>
        <ul className="text-sm text-amber-700 space-y-2">
          <li className="flex items-start gap-2">
            <span className="font-bold mt-0.5">1.</span>
            <span>관리자(<strong>bonusmate@naver.com</strong>)에게 문의하세요.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="font-bold mt-0.5">2.</span>
            <span>입사 시 받은 초대 메일 제목을 검색해보세요.<br/>
              <span className="text-xs text-amber-600">검색어: "BONUSMATE" 또는 "Supabase"</span>
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="font-bold mt-0.5">3.</span>
            <span>회사 업무용 이메일로 시도해보세요.</span>
          </li>
        </ul>
      </div>

      <a
        href="mailto:bonusmate@naver.com?subject=이메일 찾기 요청&body=이름: %0A연락처: "
        className="w-full block text-center bg-gray-800 hover:bg-gray-900 text-white font-semibold py-2.5 rounded-lg transition-colors text-sm"
      >
        📧 관리자에게 이메일 문의
      </a>

      <button onClick={goBack} className="mt-4 w-full text-center text-sm text-gray-500 hover:text-gray-700">
        ← 로그인으로 돌아가기
      </button>
    </Card>
  )

  // ── 비밀번호 설정 (초대/재설정 링크) ──
  if (mode === 'set-password') return (
    <Card>
      <h2 className="text-center text-lg font-bold text-gray-800 mb-1">비밀번호 설정</h2>
      {email && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mb-5">
          <p className="text-sm text-blue-800 font-medium">✅ 계정 확인 완료</p>
          <p className="text-xs text-blue-600 mt-0.5">{email}</p>
          <p className="text-xs text-blue-700 mt-1">사용하실 비밀번호를 설정하면 등록이 완료됩니다.</p>
        </div>
      )}
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2.5 rounded-md mb-4">{error}</div>}
      {success && <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-2.5 rounded-md mb-4">{success}</div>}
      <form onSubmit={handleSetPassword} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">새 비밀번호</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="6자 이상 입력" required
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">비밀번호 확인</label>
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
            placeholder="동일한 비밀번호 재입력" required
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <button type="submit" disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition-colors">
          {loading ? '설정 중...' : '등록 완료 및 로그인'}
        </button>
      </form>
    </Card>
  )

  return null
}
