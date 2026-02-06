"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = useMemo(() => createClient(), []);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    let active = true;

    // ✅ 1) 로그인 페이지는 가드 제외 (루프 차단)
    if (pathname === "/login") {
      setOk(true);
      return () => {
        active = false;
      };
    }

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;

      if (!data.session) {
        router.replace(`/login?next=${encodeURIComponent(pathname || "/")}`);
        return;
      }

      setOk(true);
    });

    return () => {
      active = false;
    };
  }, [supabase, router, pathname]);

  if (!ok) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-white/70">CHECKING SESSION...</div>
      </div>
    );
  }

  return <>{children}</>;
}