'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/browser'

type Mode = 'checking' | 'login' | 'set-password' | 'forgot-password' | 'forgot-sent' | 'find-email' | 'find-email-result'

function formatPhone(v: string) {
  const c = v.replace(/[^0-9]/g, '').slice(0, 11)
  if (c.length <= 3) return c
  if (c.length <= 7) return c.slice(0, 3) + '-' + c.slice(3)
  return c.slice(0, 3) + '-' + c.slice(3, 7) + '-' + c.slice(7)
}

// 입력창 공통 스타일 - 한글 IME 충돌 방지를 위해 controlled 방식 통일
const inputClass = "w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"

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

  // 이메일 찾기 폼
  const [findName, setFindName] = useState('')
  const [findBirthdate, setFindBirthdate] = useState('')
  const [findMobile, setFindMobile] = useState('')
  const [foundEmail, setFoundEmail] = useState('')

  useEffect(() => {
    const hash = window.location.hash.slice(1)
    const params = new URLSearchParams(hash)
    const errorCode = params.get('error_code')
    const type = params.get('type')
    const accessToken = params.get('access_token')
    const refreshToken = params.get('refresh_token')

    if (errorCode) {
      setError('링크가 만료되었습니다. 관리자에게 재발송을 요청하세요.')
      setMode('login'); return
    }

    if (accessToken && refreshToken && (type === 'invite' || type === 'recovery')) {
      supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
        .then(({ data, error }) => {
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

  async function handleFindEmail(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/auth/find-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: findName.trim(),
          birthdate: findBirthdate.replace(/[^0-9]/g, ''),
          mobile: findMobile,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || '조회 실패'); setLoading(false); return }
      setFoundEmail(data.maskedEmail)
      setMode('find-email-result')
    } catch {
      setError('서버 오류가 발생했습니다.')
    }
    setLoading(false)
  }

  function goBack() { setMode('login'); setError(''); setSuccess('') }

  // ── 로고 컴포넌트 ──
  const Logo = () => (
    <div className="flex flex-col items-center mb-5">
      <img
        src="/bonusmate-logo.png"
        alt="BONUSMATE"
        width={110}
        style={{ height: 'auto', objectFit: 'contain', marginBottom: 8 }}
      />
    </div>
  )

  // ── 에러/성공 메시지 ──
  const ErrorMsg = () => error ? (
    <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2.5 rounded-md mb-4">{error}</div>
  ) : null
  const SuccessMsg = () => success ? (
    <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-2.5 rounded-md mb-4">{success}</div>
  ) : null

  // ── 공통 카드 ──
  const cardStyle = "bg-white rounded-2xl shadow-md border border-gray-200 p-8 w-full max-w-md"
  const wrapStyle = "flex items-center justify-center px-4 py-12"

  if (mode === 'checking') return (
    <div className={wrapStyle}>
      <div className="text-gray-500 text-sm">확인 중...</div>
    </div>
  )

  // ── 로그인 ──
  if (mode === 'login') return (
    <div className={wrapStyle}>
      <div className={cardStyle}>
        <Logo />
        <p className="text-center text-sm text-gray-500 mb-5">로그인</p>
        <ErrorMsg />
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">이메일</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="이메일 입력"
              required
              autoComplete="email"
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">비밀번호</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="비밀번호 입력"
              required
              autoComplete="current-password"
              className={inputClass}
            />
          </div>
          <button type="submit" disabled={loading}
            className="w-full bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition-colors">
            {loading ? '로그인 중...' : '로그인'}
          </button>
        </form>
        <div className="mt-5 flex justify-center gap-4 text-sm">
          <button onClick={() => { setMode('forgot-password'); setError('') }}
            className="text-blue-600 hover:underline">비밀번호 찾기</button>
          <span className="text-gray-300">|</span>
          <button onClick={() => { setMode('find-email'); setError('') }}
            className="text-blue-600 hover:underline">이메일 찾기</button>
        </div>
        <p className="text-xs text-center text-gray-400 mt-6">(주)보누스메이트 ERP</p>
      </div>
    </div>
  )

  // ── 비밀번호 찾기 ──
  if (mode === 'forgot-password') return (
    <div className={wrapStyle}>
      <div className={cardStyle}>
        <Logo />
        <p className="text-center text-base font-bold text-gray-800 mb-1">비밀번호 재설정</p>
        <p className="text-center text-sm text-gray-500 mb-5">가입한 이메일로 재설정 링크를 보내드립니다.</p>
        <ErrorMsg />
        <form onSubmit={handleForgotPassword} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">이메일</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="가입한 이메일 입력"
              required
              autoComplete="email"
              className={inputClass}
            />
          </div>
          <button type="submit" disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition-colors">
            {loading ? '발송 중...' : '재설정 링크 보내기'}
          </button>
        </form>
        <button onClick={goBack} className="mt-4 w-full text-center text-sm text-gray-500 hover:text-gray-700">
          ← 로그인으로 돌아가기
        </button>
        <p className="text-xs text-center text-gray-400 mt-6">(주)보누스메이트 ERP</p>
      </div>
    </div>
  )

  // ── 재설정 메일 발송 완료 ──
  if (mode === 'forgot-sent') return (
    <div className={wrapStyle}>
      <div className={cardStyle}>
        <Logo />
        <div className="text-center">
          <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <p className="text-base font-bold text-gray-800 mb-1">이메일을 확인해주세요</p>
          <p className="text-sm text-blue-600 font-medium mb-1">{email}</p>
          <p className="text-xs text-gray-500 mb-1">비밀번호 재설정 링크를 발송했습니다.</p>
          <p className="text-xs text-gray-400 mb-5">스팸함도 확인해보세요.</p>
          <button onClick={goBack} className="text-sm text-blue-600 hover:underline">← 로그인으로 돌아가기</button>
        </div>
        <p className="text-xs text-center text-gray-400 mt-6">(주)보누스메이트 ERP</p>
      </div>
    </div>
  )

  // ── 이메일 찾기 ──
  if (mode === 'find-email') return (
    <div className={wrapStyle}>
      <div className={cardStyle}>
        <Logo />
        <p className="text-center text-base font-bold text-gray-800 mb-1">이메일 찾기</p>
        <p className="text-center text-sm text-gray-500 mb-5">등록된 정보로 가입 이메일을 확인합니다.</p>
        <ErrorMsg />
        <form onSubmit={handleFindEmail} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">이름 *</label>
            <input
              type="text"
              value={findName}
              onChange={(e) => setFindName(e.target.value)}
              placeholder="홍길동"
              required
              autoComplete="name"
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              생년월일 (주민번호 앞 6자리) *
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={findBirthdate}
              onChange={(e) => setFindBirthdate(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
              placeholder="901225"
              maxLength={6}
              required
              className={inputClass + " font-mono tracking-widest"}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">휴대폰 번호 *</label>
            <input
              type="tel"
              value={findMobile}
              onChange={(e) => setFindMobile(formatPhone(e.target.value))}
              placeholder="010-0000-0000"
              required
              autoComplete="tel"
              className={inputClass}
            />
          </div>
          <button type="submit" disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition-colors">
            {loading ? '조회 중...' : '이메일 찾기'}
          </button>
        </form>
        <button onClick={goBack} className="mt-4 w-full text-center text-sm text-gray-500 hover:text-gray-700">
          ← 로그인으로 돌아가기
        </button>
        <p className="text-xs text-center text-gray-400 mt-6">(주)보누스메이트 ERP</p>
      </div>
    </div>
  )

  // ── 이메일 찾기 결과 ──
  if (mode === 'find-email-result') return (
    <div className={wrapStyle}>
      <div className={cardStyle}>
        <Logo />
        <div className="text-center">
          <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-base font-bold text-gray-800 mb-3">이메일을 찾았습니다</p>
          <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 mb-2">
            <p className="text-lg font-mono font-semibold text-blue-700">{foundEmail}</p>
          </div>
          <p className="text-xs text-gray-400 mb-6">보안을 위해 일부가 가려져 있습니다.</p>
          <button
            onClick={() => { setMode('login'); setEmail(''); setError('') }}
            className="w-full bg-green-500 hover:bg-green-600 text-white font-semibold py-2.5 rounded-lg transition-colors text-sm mb-3">
            로그인하러 가기
          </button>
          <button
            onClick={() => { setMode('forgot-password'); setError('') }}
            className="w-full border border-gray-300 text-gray-600 py-2.5 rounded-lg text-sm hover:bg-gray-50 transition-colors">
            비밀번호도 재설정하기
          </button>
        </div>
        <p className="text-xs text-center text-gray-400 mt-6">(주)보누스메이트 ERP</p>
      </div>
    </div>
  )

  // ── 비밀번호 설정 (초대/재설정 링크) ──
  if (mode === 'set-password') return (
    <div className={wrapStyle}>
      <div className={cardStyle}>
        <Logo />
        <p className="text-center text-base font-bold text-gray-800 mb-1">비밀번호 설정</p>
        {email && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mb-5">
            <p className="text-sm text-blue-800 font-medium">✅ 계정 확인 완료</p>
            <p className="text-xs text-blue-600 mt-0.5">{email}</p>
            <p className="text-xs text-blue-700 mt-1">사용하실 비밀번호를 설정하면 등록이 완료됩니다.</p>
          </div>
        )}
        <ErrorMsg />
        <SuccessMsg />
        <form onSubmit={handleSetPassword} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">새 비밀번호</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="6자 이상 입력"
              required
              autoComplete="new-password"
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">비밀번호 확인</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="동일한 비밀번호 재입력"
              required
              autoComplete="new-password"
              className={inputClass}
            />
          </div>
          <button type="submit" disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition-colors">
            {loading ? '설정 중...' : '등록 완료 및 로그인'}
          </button>
        </form>
        <p className="text-xs text-center text-gray-400 mt-6">(주)보누스메이트 ERP</p>
      </div>
    </div>
  )

  return null
}
