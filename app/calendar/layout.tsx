import type { Metadata } from "next";
export const metadata: Metadata = { title: "출고 캘린더" };
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
