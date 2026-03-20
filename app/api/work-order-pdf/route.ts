import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: NextRequest) {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

  const token = req.headers.get("x-internal-token");
  if (token !== process.env.INTERNAL_API_TOKEN) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) {
    return new NextResponse("Missing id", { status: 400 });
  }

  const { data: order, error } = await supabase
    .from("work_orders")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !order) {
    return new NextResponse("Work order not found", { status: 404 });
  }

  const html = generateWorkOrderHTML(order);
  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function generateWorkOrderHTML(order: Record<string, unknown>): string {
  const today = new Date().toLocaleDateString("ko-KR");
  return `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><title>작업지시서</title></head>
<body>
  <h1>작 업 지 시 서</h1>
  <p>거래처: ${order.client_name ?? "-"}</p>
  <p>품목명: ${order.product_name ?? "-"}</p>
  <p>식품유형: ${order.food_type ?? "-"}</p>
  <p>규격: ${order.logo_spec ?? "-"}</p>
  <p>담당자(이전): ${order.assignee_transfer ?? "-"}</p>
  <p>담당자(인쇄): ${order.assignee_print_check ?? "-"}</p>
  <p>담당자(생산): ${order.assignee_production ?? "-"}</p>
  <p>담당자(투입): ${order.assignee_input ?? "-"}</p>
  <p>생성일: ${today}</p>
</body></html>`;
}