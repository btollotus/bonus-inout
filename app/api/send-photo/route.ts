import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("photo") as File | null;

    if (!file) {
      return NextResponse.json({ error: "사진이 없습니다." }, { status: 400 });
    }

    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!token || !chatId) {
      return NextResponse.json({ error: "텔레그램 설정이 없습니다." }, { status: 500 });
    }

    // 파일 크기 체크 (10MB 제한)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "사진이 너무 큽니다. (최대 10MB)" }, { status: 400 });
    }

    // 텔레그램 sendPhoto API 호출
    const tgFormData = new FormData();
    tgFormData.append("chat_id", chatId);
    tgFormData.append("photo", file, "photo.jpg");

    const res = await fetch(
      `https://api.telegram.org/bot${token}/sendPhoto`,
      { method: "POST", body: tgFormData }
    );

    const data = await res.json();

    if (!data.ok) {
      console.error("텔레그램 오류:", data);
      return NextResponse.json(
        { error: "텔레그램 전송 실패: " + (data.description ?? "") },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("send-photo 오류:", e);
    return NextResponse.json({ error: e?.message ?? "서버 오류" }, { status: 500 });
  }
}
