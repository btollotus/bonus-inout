import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// /api/bdp-inquiries 목록 응답에서 분리된 signed URL 생성 전용 엔드포인트.
// 목록 화면을 먼저 렌더링한 뒤, 클라이언트가 백그라운드로 이 엔드포인트를 호출해
// 첨부파일 썸네일/다운로드 링크만 나중에 채워 넣는다.
// (인증 확인 + signed URL 생성 로직은 기존 /api/bdp-inquiries/route.ts에 있던 것을
//  그대로 이동한 것으로, 생성 로직 자체는 변경하지 않았다.)
export async function POST(req: Request) {
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

  // 3) 요청 바디 파싱 - { items: [{ id, paths }] }
  const body = await req.json().catch(() => null);
  const items: { id: string; paths: string[] }[] = Array.isArray(body?.items) ? body.items : [];

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

  return NextResponse.json({ data: results });
}