import { NextResponse } from "next/server";

export async function GET() {
  try {
    const res = await fetch("http://175.106.96.167:3000/token");
    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: "token_failed", detail: text }, { status: 500 });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}