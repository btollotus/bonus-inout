import type { Metadata } from "next";
export const metadata: Metadata = { title: "급여 | BONUSMATE ERP" };
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
