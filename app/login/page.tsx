"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

function normalizeNextPath(raw: string | null) {
  const v = (raw ?? "/").trim();

  // 외부 URL/이상값 방지: 반드시 "/"로 시작하는 내부 경로만 허용
  if (!v.startsWith("/")) return "/";

  // 로그인으로 다시 보내는 값이면 루프 방지
  if (v.startsWith("/login")) return "/";

  return v;
}

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = normalizeNextPath(searchParams.get("next"));

  const supabase = useMemo(() => createClient(), []);
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: pw,
      });

      if (error) {
        setMsg(error.message);
        return;
      }

      // ✅ 로그인 성공 → next로 이동 (middleware가 세션 쿠키를 안정적으로 처리)
      router.replace(nextPath);
    } catch (err: any) {
      setMsg(err?.message ?? "로그인 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-6 shadow">
        <div className="text-xs tracking-[0.2em] text-white/60">OFFICE</div>
        <h1 className="text-2xl font-semibold mt-2">로그인</h1>
        <p className="text-sm text-white/60 mt-2">
          이동 대상: <span className="font-mono">{nextPath}</span>
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-3">
          <div>
            <label className="text-sm text-white/70">이메일</label>
            <input
              className="mt-1 w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 outline-none"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>

          <div>
            <label className="text-sm text-white/70">비밀번호</label>
            <input
              className="mt-1 w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 outline-none"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              type="password"
              autoComplete="current-password"
              required
            />
          </div>

          {msg && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
              {msg}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-emerald-500 text-black py-2 font-medium disabled:opacity-60"
          >
            {loading ? "로그인 중..." : "로그인"}
          </button>

          {/* 회원가입 버튼이 실제로 필요하면 signup 페이지가 있어야 동작합니다.
              지금은 UI만 있는 상태라면 링크는 넣지 않는 게 안전합니다. */}
        </form>
      </div>
    </div>
  );
}