import { NextResponse } from "next/server";

export async function GET() {
  const mallId = process.env.CAFE24_MALL_ID!;
  const clientId = process.env.CAFE24_CLIENT_ID!;
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "")}/api/cafe24/callback`;

  const authUrl = `https://${mallId}.cafe24api.com/api/v2/oauth/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=mall.read_order`;

  return NextResponse.redirect(authUrl);
}