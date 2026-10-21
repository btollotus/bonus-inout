import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireLogin } from "@/lib/auth/require-login";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

export async function POST() {
  // ✅ 로그인한 사용자만 허용
  const auth = await requireLogin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  await supabase
    .from("cafe24_orders")
    .update({ confirmed: true })
    .eq("confirmed", false);

  return NextResponse.json({ ok: true });
}