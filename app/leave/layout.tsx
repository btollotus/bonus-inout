import type { Metadata } from "next";
export const metadata: Metadata = { title: "연차신청 | BONUSMATE ERP" };
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
