import type { Metadata } from "next";
export const metadata: Metadata = { title: "거래명세서 | BONUSMATE ERP" };

import SpecClient from "./spec-client";

// ✅ Vercel 빌드 프리렌더(SSG) 단계에서 /tax/spec가 터지는 것 방지
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function Page() {
  return <SpecClient />;
}