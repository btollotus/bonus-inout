import StatementClient from "./statement-client";

// ✅ Vercel 빌드 프리렌더(SSG) 단계에서 /tax/statement가 터지는 것 방지
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function Page() {
  return <StatementClient />;
}