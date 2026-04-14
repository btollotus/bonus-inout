import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";

let cachedToken: string | null = null;
let tokenExpiry: number = 0;

export async function GET() {
  try {
    if (cachedToken && Date.now() < tokenExpiry - 60_000) {
      return NextResponse.json({ access_token: cachedToken });
    }

    const clientId = process.env.NAVER_CLIENT_ID!;
    const clientSecret = process.env.NAVER_CLIENT_SECRET!;
    const timestamp = Date.now().toString();

    // ✅ bcrypt 해싱 후 base64 인코딩
    const password = `${clientId}_${timestamp}`;
    const hashed = await bcrypt.hash(password, clientSecret);
    const clientSecretSign = Buffer.from(hashed).toString("base64");

    const res = await fetch("https://api.commerce.naver.com/external/v1/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        timestamp,
        client_secret_sign: clientSecretSign,
        grant_type: "client_credentials",
        type: "SELF",
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("[naver/token] 발급 실패:", text);
      return NextResponse.json({ error: "token_failed", detail: text }, { status: 500 });
    }

    const data = await res.json();
    cachedToken = data.access_token;
    tokenExpiry = Date.now() + data.expires_in * 1000;

    return NextResponse.json({ access_token: cachedToken });
  } catch (e) {
    console.error("[naver/token] 예외:", e);
    return NextResponse.json({ error: "exception" }, { status: 500 });
  }
}