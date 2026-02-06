"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = useMemo(() => createClient(), []);
  const [ok, setOk] = useState(false);

  // ✅ 1) /login은 절대 막지 않는다 (무한루프 차단)
  if (pathname?.startsWith("/login")) {
    return <>{children}</>;
  }

  useEffect(() => {
    let active = true;

    const goLogin = () => {
      const next = pathname || "/";
      router.replace(`/login?next=${encodeURIComponent(next)}`);
    };

    // ✅ 2) 최초 세션 확인
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (!data.session) return goLogin();
      setOk(true);
    });

    // ✅ 3) 로그인/로그아웃 이벤트에 반응 (Vercel에서 특히 안정적)
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      if (!session) return goLogin();
      setOk(true);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
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