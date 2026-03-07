import type { Metadata } from "next";
export const metadata: Metadata = { title: "출고 캘린더 | BONUSMATE ERP" };
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
