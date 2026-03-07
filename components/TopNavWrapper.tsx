"use client";

import { usePathname } from "next/navigation";
import TopNav from "@/components/TopNav";

const HIDE_NAV_PATHS = ["/login", "/accept-invite"];

export default function TopNavWrapper({ role, email }: { role?: string; email?: string }) {
  const pathname = usePathname();
  const hide = HIDE_NAV_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
  if (hide) return null;
  return <TopNav role={role} email={email} />;
}
