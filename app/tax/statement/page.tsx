// app/tax/statement/page.tsx
import { Suspense } from "react";
import StatementClient from "./statement-client";

// ✅ 프리렌더(정적생성) 막고, 요청 때마다 렌더링
export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Suspense fallback={<div />}>
      <StatementClient />
    </Suspense>
  );
}