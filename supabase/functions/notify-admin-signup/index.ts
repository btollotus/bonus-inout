// Supabase Edge Function: notify-admin-signup
// 목적: profiles INSERT webhook이 오면 관리자 이메일로 알림 발송(Resend)

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

type WebhookPayload = {
  type?: string;           // "INSERT" 등
  table?: string;          // "profiles"
  schema?: string;         // "public"
  record?: Record<string, unknown>;     // 신규 row
  old_record?: Record<string, unknown>; // UPDATE/DELETE 시
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  try {
    // 1) Webhook 보안 검증
    const hookSecret = Deno.env.get("HOOK_SECRET") ?? "";
    const incoming = req.headers.get("x-hook-secret") ?? "";

    if (!hookSecret) {
      console.error("Missing HOOK_SECRET in Edge Function Secrets");
      return json(500, { error: "Server misconfigured: missing HOOK_SECRET" });
    }

    if (incoming !== hookSecret) {
      return json(401, { error: "Unauthorized" });
    }

    // 2) Resend 환경변수
    const resendKey = Deno.env.get("RESEND_API_KEY") ?? "";
    const adminEmail = Deno.env.get("ADMIN_EMAIL") ?? "";

    if (!resendKey || !adminEmail) {
      console.error("Missing RESEND_API_KEY or ADMIN_EMAIL");
      return json(500, { error: "Server misconfigured: missing email secrets" });
    }

    // 3) Payload 파싱
    const payload = (await req.json()) as WebhookPayload;

    // Supabase Database Webhook은 보통 payload.record에 새 row가 들어옵니다.
    // 혹시 구조가 다를 가능성 대비해 fallback도 둡니다.
    const r = (payload.record ?? payload) as Record<string, unknown>;

    const userEmail = (r.email as string) ?? "";
    const userId = (r.id as string) ?? "";
    const status = (r.status as string) ?? "";
    const createdAt = (r.created_at as string) ?? "";

    console.log("Webhook received:", {
      type: payload.type,
      table: payload.table,
      userEmail,
      userId,
      status,
      createdAt,
    });

    // 최소 필드 체크
    if (!userEmail || !userId) {
      console.error("Invalid payload: missing email or id", payload);
      return json(400, { error: "Invalid payload (missing email or id)" });
    }

    // 4) 관리자 메일 발송(Resend API 직접 호출)
    const subject = `[BONUSMATE] 신규 회원가입 승인요청: ${userEmail}`;

    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <h2>신규 회원가입 승인 요청</h2>
        <p>새로운 사용자가 가입했습니다.</p>
        <ul>
          <li><b>Email</b>: ${userEmail}</li>
          <li><b>User ID</b>: ${userId}</li>
          <li><b>Status</b>: ${status || "pending"}</li>
          <li><b>Created</b>: ${createdAt || "-"}</li>
        </ul>
        <p>Supabase Dashboard에서 <b>profiles.status</b>를 <b>approved</b>로 변경하면 사용 가능합니다.</p>
      </div>
    `;

    const resendResp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        // 테스트 단계에서는 Resend 기본 발신 주소 사용 가능
        // 도메인 인증 후에는 from을 "BONUSMATE <no-reply@bonusmate.co.kr>" 같은 형태로 바꾸면 좋습니다.
        from: "BONUSMATE <onboarding@resend.dev>",
        to: [adminEmail],
        subject,
        html,
      }),
    });

    const resendText = await resendResp.text();

    if (!resendResp.ok) {
      console.error("Resend error:", resendResp.status, resendText);
      return json(502, { error: "Email send failed", detail: resendText });
    }

    console.log("Email sent:", resendText);
    return json(200, { ok: true });
  } catch (err) {
    console.error("Function error:", err);
    return json(500, { error: "Internal error" });
  }
});