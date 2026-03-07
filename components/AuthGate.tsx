"use client";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

// 인증 없이 접근 가능한 경로
const PUBLIC_PATHS = ["/login", "/api/"];

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = useMemo(() => createClient(), []);
  const [ok, setOk] = useState(false);

  // public 경로는 인증 체크 없이 통과
  const isPublic = PUBLIC_PATHS.some((p) => pathname?.startsWith(p));
  if (isPublic) {
    return <>{children}</>;
  }

  useEffect(() => {
    let active = true;
    const goLogin = () => {
      const next = pathname || "/";
      router.replace(`/login?next=${encodeURIComponent(next)}`);
    };

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (!data.session) return goLogin();
      setOk(true);
    });

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
