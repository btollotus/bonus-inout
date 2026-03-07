import type { Metadata } from "next";
export const metadata: Metadata = { title: "인사관리" };
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
