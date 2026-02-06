// app/login/page.tsx
"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

function LoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/channels";

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace(next);
    });
  }, [router, next]);

  const submit = async () => {
    setLoading(true);
    setMsg(null);
    try {
      const supabase = createClient();

      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password: pw,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password: pw,
        });
        if (error) throw error;
      }

      router.replace(next);
    } catch (e: any) {
      setMsg(e?.message ?? "로그인에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center">
      <div className="w-[360px] rounded-xl border border-white/10 bg-white/5 p-6">
        <div className="text-xl font-semibold mb-1">
          {mode === "login" ? "로그인" : "회원가입"}
        </div>
        <div className="text-sm text-white/60 mb-5">계속하려면 인증이 필요합니다.</div>

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
          autoComplete={mode === "login" ? "current-password" : "new-password"}
        />

        {msg && <div className="mb-3 text-sm text-red-300">{msg}</div>}

        <button
          onClick={submit}
          disabled={loading}
          className="w-full rounded-md bg-emerald-500 text-black font-semibold py-2 disabled:opacity-60"
        >
          {loading ? "처리 중..." : mode === "login" ? "로그인" : "회원가입"}
        </button>

        <button
          onClick={() => setMode(mode === "login" ? "signup" : "login")}
          className="mt-3 w-full rounded-md bg-white/10 py-2 text-sm"
        >
          {mode === "login" ? "계정 만들기" : "로그인으로"}
        </button>
      </div>
    </div>
  );
}

export default function LoginPage() {
  // ✅ 핵심: useSearchParams를 쓰는 컴포넌트를 Suspense로 감싼다
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