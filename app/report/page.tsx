// app/report/page.tsx
// /report → /inventory?tab=report 로 redirect (재고대장 탭 바로 열기)

import { redirect } from "next/navigation";

export default function ReportPage() {
  redirect("/inventory?tab=report");
}
