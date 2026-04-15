import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

export async function POST() {
  await supabase
    .from("naver_orders")
    .update({ confirmed: true })
    .eq("confirmed", false);

  return NextResponse.json({ ok: true });
}