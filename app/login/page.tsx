// app/login/page.tsx
"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

function safeNext(input: string | null) {
  // 외부로 튀는 next 방지
  if (!input) return "/";
  if (!input.startsWith("/")) return "/";
  if (input.startsWith("//")) return "/";
  return input;
}

function LoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);

  // ✅ 기본값을 /channels가 아닌 / 로 (원하면 "/scan"으로 바꿔도 됨)
  const next = safeNext(searchParams.get("next"));

  // ✅ 회원가입 모드 제거(로그인만)
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      if (data.session) router.replace(next);
    });

    return () => {
      alive = false;
    };
  }, [supabase, router, next]);

  const submit = async () => {
    setLoading(true);
    setMsg(null);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password: pw,
      });
      if (error) throw error;

      router.replace(next);
    } catch (e: any) {
      setMsg(e?.message ?? "로그인에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  // ✅ Enter 키로 로그인 가능하도록 form submit 처리
  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    await submit();
  };

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center">
      <div className="w-[360px] rounded-xl border border-white/10 bg-white/5 p-6">
        <div className="text-xl font-semibold mb-1">로그인</div>
        <div className="text-sm text-white/60 mb-5">
          계속하려면 인증이 필요합니다.
        </div>

        <form onSubmit={onSubmit}>
          <label className="text-sm text-white/70">이메일</label>
          <input
            className="mt-1 mb-3 w-full rounded-md bg-black/30 border border-white/10 px-3 py-2 outline-none"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />

          <label className="text-sm text-white/70">비밀번호</label>
          <input
            className="mt-1 mb-4 w-full rounded-md bg-black/30 border border-white/10 px-3 py-2 outline-none"
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            autoComplete="current-password"
          />

          {msg && <div className="mb-3 text-sm text-red-300">{msg}</div>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-emerald-500 text-black font-semibold py-2 disabled:opacity-60"
          >
            {loading ? "로그인 중..." : "로그인"}
          </button>

          {/* ✅ 계정 만들기(회원가입) 메뉴 삭제 */}
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-black text-white flex items-center justify-center">
          <div className="text-white/70">LOADING...</div>
        </div>
      }
    >
      <LoginInner />
    </Suspense>
  );
}