import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { month, content } = await req.json();

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      messages: [{
        role: "user",
        content: `식품 제조 공장의 ${month}월 사내 위생 및 안전교육 결과 문장을 한 문장으로 작성하세요.\n교육내용: ${content || "위생 및 안전교육"}\n조건: 30자 이상, 교육 효과·참석자 반응·향후 기대효과 중 하나를 담아 긍정적으로, 매번 다른 표현 사용, 텍스트만 출력(따옴표 없이)`,
      }],
    }),
  });

  const data = await res.json();
  const text = (data.content?.[0]?.text ?? "").trim();
  return NextResponse.json({ text });
}