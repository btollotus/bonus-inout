import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// bdp2026(bonusmate-bdp2026) 프로젝트의 public_inquiries 테이블을
// bonus-inout 로그인 사용자에게만 서버사이드에서 조회해주는 라우트.
// 두 프로젝트는 완전히 별개 Supabase 프로젝트이므로 service_role 키로
// 우회 조회한다 (bdp2026 쪽 RLS는 authenticated만 SELECT 허용).
export async function GET() {
  // 1) bonus-inout 로그인 여부 확인
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  // 2) bdp2026 프로젝트 접속 정보 확인
  const bdpUrl = process.env.BDP_SUPABASE_URL;
  const bdpServiceKey = process.env.BDP_SUPABASE_SERVICE_ROLE_KEY;

  if (!bdpUrl || !bdpServiceKey) {
    return NextResponse.json(
      { error: "BDP_SUPABASE_URL / BDP_SUPABASE_SERVICE_ROLE_KEY 환경변수가 설정되지 않았습니다." },
      { status: 500 }
    );
  }

  const bdpAdmin = createSupabaseClient(bdpUrl, bdpServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 3) 문의 목록 조회
  const { data, error: bdpError } = await bdpAdmin
    .from("public_inquiries")
    .select(
      "id,form_type,company_name,contact_name,phone,shape,color_type,size_text,sheet_count,sheet_color,quantity,memo,attachment_paths,created_at"
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (bdpError) {
    return NextResponse.json({ error: bdpError.message }, { status: 500 });
  }

  return NextResponse.json({ data: data ?? [] });
}