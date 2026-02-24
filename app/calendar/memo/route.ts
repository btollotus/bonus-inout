// app/api/calendar/memo/route.ts
import { NextResponse } from "next/server";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

type Visibility = "PUBLIC" | "ADMIN";

function toYmd(d: any) {
  return String(d ?? "").slice(0, 10);
}

function safeStr(v: any) {
  return String(v ?? "").trim();
}

export async function POST(req: Request) {
  try {
    // 1) 요청자(로그인) 확인은 "일반 서버 클라이언트"로 (쿠키 기반)
    const sb = await createClient();
    const { data: userData, error: userErr } = await sb.auth.getUser();
    if (userErr || !userData?.user) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const email = (userData.user.email ?? "").toLowerCase();
    const isAdmin = email === "bonusmate@naver.com";

    const body = await req.json();
    const memo_date = toYmd(body?.memo_date);
    const visibility = String(body?.visibility ?? "").toUpperCase() as Visibility;
    const content = safeStr(body?.content);

    if (!memo_date) return NextResponse.json({ error: "memo_date가 필요합니다." }, { status: 400 });
    if (visibility !== "PUBLIC" && visibility !== "ADMIN") {
      return NextResponse.json({ error: "visibility는 PUBLIC/ADMIN만 허용됩니다." }, { status: 400 });
    }

    // ADMIN 저장은 관리자만
    if (visibility === "ADMIN" && !isAdmin) {
      return NextResponse.json({ error: "관리자만 ADMIN 메모를 저장할 수 있습니다." }, { status: 403 });
    }

    // 2) DB 쓰기는 "서비스롤"로 (RLS 우회)
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) {
      return NextResponse.json(
        { error: "서버 환경변수(SUPABASE_SERVICE_ROLE_KEY)가 설정되지 않았습니다." },
        { status: 500 }
      );
    }

    const adminSb = createSbClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 빈 값이면 삭제
    if (!content) {
      const { error: delErr } = await adminSb
        .from("calendar_memos")
        .delete()
        .eq("memo_date", memo_date)
        .eq("visibility", visibility);

      if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });
      return NextResponse.json({ ok: true, deleted: true });
    }

    // 있으면 update / 없으면 insert (memo_date+visibility 기준)
    const { data: exist, error: existErr } = await adminSb
      .from("calendar_memos")
      .select("id")
      .eq("memo_date", memo_date)
      .eq("visibility", visibility)
      .maybeSingle();

    if (existErr) return NextResponse.json({ error: existErr.message }, { status: 500 });

    if (exist?.id) {
      const { error: upErr } = await adminSb
        .from("calendar_memos")
        .update({ content })
        .eq("id", exist.id);

      if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
      return NextResponse.json({ ok: true, updated: true });
    } else {
      // created_by 컬럼이 있든 없든 동작하게 payload는 최소만
      const payload: any = { memo_date, visibility, content };

      const { error: insErr } = await adminSb.from("calendar_memos").insert(payload);
      if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
      return NextResponse.json({ ok: true, inserted: true });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "서버 오류" }, { status: 500 });
  }
}