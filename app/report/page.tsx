import type { Metadata } from "next";
export const metadata: Metadata = { title: "재고대장 | BONUSMATE ERP" };

// app/report/page.tsx
import ReportClient from "./report-client";

export default function ReportPage() {
  return <ReportClient />;
}
