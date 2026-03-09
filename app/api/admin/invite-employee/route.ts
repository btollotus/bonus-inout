// app/api/admin/invite-employee/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// ── Resend로 초대 메일 직접 발송 ──────────────────────────
async function sendInviteEmail(email: string, name: string, inviteLink: string) {
  const apiKey = process.env.RESEND_API_KEY
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'BONUSMATE HR <noreply@bonusmate.co.kr>'

  if (!apiKey) throw new Error('RESEND_API_KEY 환경변수가 설정되지 않았습니다.')

  const html = `
<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f7fa;font-family:'Malgun Gothic','맑은 고딕',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7fa;padding:32px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:#1a3a6b;padding:24px 32px;">
            <div style="color:#fff;font-size:20px;font-weight:bold;">🏢 (주)보누스메이트 ERP</div>
            <div style="color:#8fb3e8;font-size:13px;margin-top:4px;">시스템 초대 안내</div>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 32px;">
            <p style="margin:0 0 16px;font-size:15px;color:#1a1a1a;">
              <strong>${name}</strong> 님, 안녕하세요.
            </p>
            <p style="margin:0 0 20px;font-size:14px;color:#444;line-height:1.6;">
              (주)보누스메이트 ERP 시스템에 초대되었습니다.<br>
              아래 버튼을 클릭하여 비밀번호를 설정하고 로그인하세요.
            </p>
            <div style="text-align:center;margin:28px 0;">
              <a href="${inviteLink}"
                style="display:inline-block;background:#1a3a6b;color:#fff;font-size:15px;font-weight:bold;padding:14px 36px;border-radius:8px;text-decoration:none;">
                🔑 비밀번호 설정 및 로그인
              </a>
            </div>
            <div style="background:#f0f5ff;border-left:4px solid #1a3a6b;border-radius:6px;padding:14px 18px;margin-bottom:20px;">
              <div style="font-size:12px;color:#555;margin-bottom:4px;">⚠️ 보안 안내</div>
              <div style="font-size:12px;color:#333;line-height:1.6;">
                • 이 링크는 <strong>24시간 후 만료</strong>됩니다.<br>
                • 본인이 요청하지 않은 경우 이 메일을 무시하세요.<br>
                • 링크는 1회만 사용 가능합니다.
              </div>
            </div>
            <p style="margin:0;font-size:12px;color:#888;line-height:1.5;">
              ※ 본 메일은 자동 발송됩니다. 회신하지 마세요.<br>
              ※ 문의: 시스템 관리자에게 직접 연락 바랍니다.
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#f8f9fa;border-top:1px solid #eee;padding:16px 32px;text-align:center;">
            <div style="font-size:11px;color:#999;">(주)보누스메이트 · 본 메일은 보안 발송됩니다</div>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [email],
      subject: `[BONUSMATE] ${name}님, ERP 시스템 초대 안내`,
      html,
    }),
  })

  const data = await res.json()
  if (!res.ok) throw new Error(data.message || 'Resend 발송 실패')
  return data
}

// ── 메인 핸들러 ────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const { email, name } = await req.json()
    if (!email) return NextResponse.json({ error: '이메일이 필요합니다.' }, { status: 400 })

    // 1. 기존 사용자 여부 먼저 확인
    const { data: list } = await supabaseAdmin.auth.admin.listUsers()
    const existingUser = list?.users.find((u) => u.email === email)

    if (existingUser) {
      // ── 이미 가입된 계정 → 초대 링크 재생성 후 Resend로 직접 발송 ──
      const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
        type: 'invite',
        email,
        options: {
          data: { name },
          redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/accept-invite`,
        },
      })

      if (linkError) {
        console.error('[invite-employee] generateLink 오류:', linkError)
        return NextResponse.json({ error: linkError.message }, { status: 400 })
      }

      const inviteLink = linkData?.properties?.action_link
      if (!inviteLink) {
        return NextResponse.json({ error: '초대 링크 생성 실패' }, { status: 500 })
      }

      // Resend로 직접 발송 (로그 남음)
      await sendInviteEmail(email, name, inviteLink)

      console.log(`[invite-employee] 재초대 발송 완료 → ${email}`)
      return NextResponse.json({ userId: existingUser.id, alreadyExists: true, reinvited: true })

    } else {
      // ── 신규 계정 → 기존 방식 (Supabase inviteUserByEmail) ──
      const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        data: { name },
        redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/accept-invite`,
      })

      if (error) {
        console.error('[invite-employee] inviteUserByEmail 오류:', error)
        return NextResponse.json({ error: error.message }, { status: 400 })
      }

      console.log(`[invite-employee] 신규 초대 발송 완료 → ${email}`)
      return NextResponse.json({ userId: data.user?.id })
    }

  } catch (err: unknown) {
    console.error('[invite-employee] 서버 오류:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '서버 오류' },
      { status: 500 }
    )
  }
}
