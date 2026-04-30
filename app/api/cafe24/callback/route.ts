import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) return NextResponse.json({ error: "no code" }, { status: 400 });

  const mallId = process.env.CAFE24_MALL_ID!;
  const clientId = process.env.CAFE24_CLIENT_ID!;
  const clientSecret = process.env.CAFE24_CLIENT_SECRET!;

  const res = await fetch(`https://${mallId}.cafe24api.com/api/v2/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "")}/api/cafe24/callback`,
    }),
  });

  const data = await res.json();
  console.log("[cafe24/callback] token response:", JSON.stringify(data));
  if (!res.ok) return NextResponse.json({ error: data }, { status: 500 });

  const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();

  await supabase.from("cafe24_tokens").upsert({
    id: 1,
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  });

  return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/?cafe24=connected`);
}