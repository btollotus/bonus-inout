import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// [성능] 함수 실행 리전은 vercel.json의 functions."app/api/bdp-inquiries/**".regions
// 설정으로 서울(icn1)을 지정한다. (Node.js 런타임에서는 route segment의
// preferredRegion export가 적용되지 않아 vercel.json 방식으로 대체함)

// bdp2026(bonusmate-bdp2026) 프로젝트의 public_inquiries 테이블을
// bonus-inout 로그인 사용자에게만 서버사이드에서 조회해주는 라우트.
// 두 프로젝트는 완전히 별개 Supabase 프로젝트이므로 service_role 키로
// 우회 조회한다 (bdp2026 쪽 RLS는 authenticated만 SELECT 허용).
export async function GET() {
  // [진단용] 구간별 소요시간 측정 시작 - 응답 데이터/로직에는 영향 없음
  const t0 = Date.now();

  // 1) bonus-inout 로그인 여부 확인
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  // [진단용] 인증 확인 소요시간
  const authMs = Date.now() - t0;

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
  // (첨부파일 signed URL 생성은 /api/bdp-inquiries/attachment-urls 로 분리 —
  //  목록 화면이 signed URL 생성을 기다리지 않고 먼저 표시되도록 하기 위함.
  //  attachment_paths는 그대로 내려주므로 클라이언트가 이후 별도 요청으로
  //  signed URL을 채워 넣을 수 있다.)
    // [진단용] DB 쿼리 구간 소요시간 측정 시작
    const t1 = Date.now();

    const { data, error: bdpError } = await bdpAdmin
      .from("public_inquiries")
      .select(
        "id,form_type,company_name,contact_name,phone,shape,color_type,size_text,sheet_count,sheet_color,quantity,memo,attachment_paths,created_at"
      )
      .order("created_at", { ascending: false })
      .limit(200);
  
    // [진단용] 쿼리 소요시간 + 콘솔 로그(Vercel 함수 로그에서 확인 가능) + Server-Timing 헤더(Network 탭 Timing에서 확인 가능)
    const queryMs = Date.now() - t1;
    console.log(`[bdp-inquiries] auth=${authMs}ms query=${queryMs}ms total=${authMs + queryMs}ms`);
    const serverTiming = `auth;dur=${authMs};desc="getUser", query;dur=${queryMs};desc="public_inquiries select"`;
  
    if (bdpError) {
      return NextResponse.json({ error: bdpError.message }, { status: 500, headers: { "Server-Timing": serverTiming } });
    }
  
    return NextResponse.json({ data: data ?? [] }, { headers: { "Server-Timing": serverTiming } });
  }