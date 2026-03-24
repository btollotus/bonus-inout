// app/api/trigger-quote-pdf/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { quoteRequestId, fileName } = body;

    if (!quoteRequestId || !fileName) {
      return NextResponse.json({ error: "quoteRequestId, fileName 필수" }, { status: 400 });
    }

    const owner = process.env.GITHUB_REPO_OWNER;
    const repo  = process.env.GITHUB_REPO_NAME;
    const pat   = process.env.GITHUB_PAT;

    if (!owner || !repo || !pat) {
      return NextResponse.json({ error: "GitHub 환경변수 누락" }, { status: 500 });
    }

    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/actions/workflows/quote-pdf-to-drive.yml/dispatches`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${pat}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ref: "main",
          inputs: {
            quote_request_id: String(quoteRequestId),
            file_name: fileName,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json({ error: "GitHub Actions 트리거 실패", detail: errorText }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: "견적서 PDF 생성이 시작되었습니다. (약 1~2분 소요)",
    });
  } catch (err) {
    console.error("trigger-quote-pdf error:", err);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
