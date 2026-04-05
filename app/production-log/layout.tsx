import type { Metadata } from "next";
export const metadata: Metadata = { title: "생산관리" };
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}