"use client";

import { usePathname } from "next/navigation";
import TopNav from "@/components/TopNav";

// 이 경로들에서는 TopNav 숨김
const HIDE_NAV_PATHS = ["/login", "/accept-invite", "/reset-password"];
export default function TopNavWrapper({ role, email }: { role?: string; email?: string }) {
  const pathname = usePathname();

  // startsWith로 체크 → /login?next=%2F 같은 쿼리스트링도 처리됨
  const hide = HIDE_NAV_PATHS.some((p) => pathname.startsWith(p));

  if (hide) return null;
  return <TopNav role={role} email={email} />;
}
