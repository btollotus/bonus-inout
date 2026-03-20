// app/api/trigger-work-order-pdf/route.ts
// 생산완료 시 GitHub Actions workflow_dispatch 트리거

import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { workOrderId, fileName } = body;

    if (!workOrderId || !fileName) {
      return NextResponse.json(
        { error: "workOrderId, fileName 필수" },
        { status: 400 }
      );
    }

    const owner = process.env.GITHUB_REPO_OWNER;
    const repo = process.env.GITHUB_REPO_NAME;
    const pat = process.env.GITHUB_PAT;

    if (!owner || !repo || !pat) {
      return NextResponse.json(
        { error: "GitHub 환경변수 누락" },
        { status: 500 }
      );
    }

    // GitHub Actions workflow_dispatch 트리거
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/actions/workflows/work-order-pdf-to-drive.yml/dispatches`,
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
            work_order_id: String(workOrderId),
            file_name: fileName,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("GitHub API error:", errorText);
      return NextResponse.json(
        { error: "GitHub Actions 트리거 실패", detail: errorText },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "PDF 생성 및 드라이브 업로드가 시작되었습니다. (약 1~2분 소요)",
    });
  } catch (err) {
    console.error("trigger-work-order-pdf error:", err);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
