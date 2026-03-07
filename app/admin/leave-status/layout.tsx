import type { Metadata } from "next";
export const metadata: Metadata = { title: "연차현황" };
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
