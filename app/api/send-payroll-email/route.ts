// app/api/send-payroll-email/route.ts
// Resend API를 사용한 급여명세서 PDF 이메일 발송
//
// 필요한 환경변수:
//   RESEND_API_KEY=re_xxxxxxxxxxxxxxxx
//   RESEND_FROM_EMAIL=급여담당 <hr@your-domain.com>
//
// 패키지 설치:
//   npm install resend
//   또는 fetch 기반으로 직접 호출 (아래 구현)

import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { to, employeeName, payMonth, pdfBase64, filename } = body

    // 필수값 검증
    if (!to || !employeeName || !payMonth || !pdfBase64) {
      return NextResponse.json({ ok: false, error: '필수 파라미터 누락' }, { status: 400 })
    }

    const apiKey = process.env.RESEND_API_KEY
    const fromEmail = process.env.RESEND_FROM_EMAIL || 'BONUSMATE HR <noreply@bonusmate.co.kr>'

    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: 'RESEND_API_KEY 환경변수가 설정되지 않았습니다.' },
        { status: 500 }
      )
    }

    const [year, month] = payMonth.split('-')
    const subject = `[BONUSMATE] ${year}년 ${month}월 급여명세서 - ${employeeName}`

    const htmlBody = `
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f5f7fa;font-family:'Malgun Gothic','맑은 고딕',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7fa;padding:32px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
        <!-- 헤더 -->
        <tr>
          <td style="background:#1a3a6b;padding:24px 32px;">
            <div style="color:#fff;font-size:20px;font-weight:bold;">📄 급여명세서</div>
            <div style="color:#8fb3e8;font-size:13px;margin-top:4px;">${year}년 ${month}월 · BONUSMATE ERP</div>
          </td>
        </tr>
        <!-- 본문 -->
        <tr>
          <td style="padding:28px 32px;">
            <p style="margin:0 0 16px;font-size:15px;color:#1a1a1a;">
              <strong>${employeeName}</strong> 님, 안녕하세요.
            </p>
            <p style="margin:0 0 20px;font-size:14px;color:#444;line-height:1.6;">
              ${year}년 ${month}월 급여명세서를 첨부 파일로 보내드립니다.<br>
              내용을 확인하시고 문의사항이 있으시면 인사담당자에게 연락해 주세요.
            </p>
            <div style="background:#f0f5ff;border-left:4px solid #1a3a6b;border-radius:6px;padding:14px 18px;margin-bottom:20px;">
              <div style="font-size:12px;color:#555;margin-bottom:4px;">첨부 파일</div>
              <div style="font-size:13px;font-weight:bold;color:#1a3a6b;">📎 ${filename}</div>
            </div>
            <p style="margin:0;font-size:12px;color:#888;line-height:1.5;">
              ※ 본 메일은 자동 발송됩니다. 회신하지 마세요.<br>
              ※ 급여 관련 문의: 인사담당자에게 직접 연락 바랍니다.
            </p>
          </td>
        </tr>
        <!-- 푸터 -->
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

    // Resend API 직접 호출 (fetch 방식 - resend 패키지 불필요)
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [to],
        subject,
        html: htmlBody,
        attachments: [
          {
            filename,
            content: pdfBase64,   // base64 encoded PDF
          },
        ],
      }),
    })

    const resendData = await resendRes.json()

    if (!resendRes.ok) {
      console.error('[send-payroll-email] Resend 오류:', resendData)
      return NextResponse.json(
        { ok: false, error: resendData.message || 'Resend 발송 실패' },
        { status: 500 }
      )
    }

    console.log(`[send-payroll-email] 발송 완료 → ${to} (id: ${resendData.id})`)
    return NextResponse.json({ ok: true, id: resendData.id })

  } catch (err: unknown) {
    console.error('[send-payroll-email] 서버 오류:', err)
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : '서버 오류' },
      { status: 500 }
    )
  }
}
