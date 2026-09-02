import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// [성능] 이 라우트가 호출하는 bdp2026 프로젝트 storage API가 서울(ap-northeast-2)
// 리전이라 함수 실행 리전도 서울(icn1)로 지정해 네트워크 왕복 지연을 줄인다.
export const preferredRegion = "icn1";

// /api/bdp-inquiries 목록 응답에서 분리된 signed URL 생성 전용 엔드포인트.
// 목록 화면을 먼저 렌더링한 뒤, 클라이언트가 백그라운드로 이 엔드포인트를 호출해
// 첨부파일 썸네일/다운로드 링크만 나중에 채워 넣는다.
// (인증 확인 + signed URL 생성 로직은 기존 /api/bdp-inquiries/route.ts에 있던 것을
//  그대로 이동한 것으로, 생성 로직 자체는 변경하지 않았다.)
export async function POST(req: Request) {
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

  // 3) 요청 바디 파싱 - { items: [{ id, paths }] }
  const body = await req.json().catch(() => null);
  const items: { id: string; paths: string[] }[] = Array.isArray(body?.items) ? body.items : [];

    // [진단용] signed URL 생성 구간 소요시간 측정 시작
    const t1 = Date.now();

    // 4) 항목별 첨부파일 signed URL 생성 (public-inquiry-attachments는 비공개 버킷)
    //    - 기존 route.ts에 있던 로직과 동일 (createSignedUrl, 1시간 유효, 실패 항목은 제외)
    const results = await Promise.all(
      items.map(async (item) => {
        const paths: string[] = item.paths ?? [];
        if (!paths.length) {
          return { id: item.id, attachment_urls: [] };
        }
        const signed = await Promise.all(
          paths.map(async (p: string) => {
            const { data: signedData, error: signError } = await bdpAdmin.storage
              .from("public-inquiry-attachments")
              .createSignedUrl(p, 3600); // 1시간 유효
            if (signError || !signedData) return null;
            return { path: p, url: signedData.signedUrl, name: p.split("/").pop() ?? p };
          })
        );
        return { id: item.id, attachment_urls: signed.filter(Boolean) };
      })
    );
  
    // [진단용] signed URL 생성 소요시간 + 콘솔 로그 + Server-Timing 헤더
    const signMs = Date.now() - t1;
    console.log(`[bdp-inquiries/attachment-urls] auth=${authMs}ms items=${items.length} sign=${signMs}ms total=${authMs + signMs}ms`);
    const serverTiming = `auth;dur=${authMs};desc="getUser", sign;dur=${signMs};desc="createSignedUrl x${items.length}"`;
  
    return NextResponse.json({ data: results }, { headers: { "Server-Timing": serverTiming } });
  }