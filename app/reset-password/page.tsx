"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { useRouter } from "next/navigation";

function translateError(msg: string): string {
  if (msg.includes("New password should be different from the old password"))
    return "새 비밀번호는 기존 비밀번호와 달라야 합니다.";
  if (msg.includes("Password should be at least"))
    return "비밀번호는 6자 이상이어야 합니다.";
  if (msg.includes("Auth session missing"))
    return "세션이 만료됐습니다. 링크를 다시 요청해주세요.";
  return msg;
}

export default function ResetPasswordPage() {
  const supabase = createClient();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.replace("/login?error=link_expired");
        return;
      }
      setEmail(session.user.email ?? "");
      setLoading(false);
    });
  }, []);

  const handleSubmit = async () => {
    if (!newPassword || !confirmPassword) {
      setMessage({ type: "error", text: "새 비밀번호를 입력해주세요." }); return;
    }
    if (newPassword.length < 6) {
      setMessage({ type: "error", text: "비밀번호는 6자 이상이어야 합니다." }); return;
    }
    if (newPassword !== confirmPassword) {
      setMessage({ type: "error", text: "비밀번호가 일치하지 않습니다." }); return;
    }
    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      setMessage({ type: "error", text: translateError(error.message) });
      setSubmitting(false);
    } else {
      setMessage({ type: "success", text: "비밀번호가 변경됐습니다! 로그인 페이지로 이동합니다..." });
      // 세션 종료 후 로그인 페이지로
      await supabase.auth.signOut();
      setTimeout(() => router.replace("/login"), 1500);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500 text-sm">확인 중...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-md border border-gray-200 p-8 w-full max-w-md">
        <div className="flex justify-center mb-5">
          <img src="/bonusmate-logo.png" alt="BONUSMATE" width={100} style={{ height: "auto" }} />
        </div>
        <h2 className="text-center text-lg font-bold text-gray-800 mb-1">새 비밀번호 설정</h2>
        <p className="text-center text-xs text-gray-500 mb-6">{email}</p>

        {message && (
          <div className={`mb-4 p-2.5 rounded-md text-sm ${
            message.type === "success"
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}>{message.text}</div>
        )}

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">새 비밀번호</label>
            <input type="password" value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="6자 이상" autoComplete="new-password"
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">비밀번호 확인</label>
            <input type="password" value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="비밀번호 재입력" autoComplete="new-password"
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>

        <button onClick={handleSubmit} disabled={submitting}
          className="mt-5 w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2.5 rounded-lg text-sm font-semibold transition-colors">
          {submitting ? "변경 중..." : "비밀번호 변경 완료"}
        </button>
        <p className="text-xs text-center text-gray-400 mt-5">(주)보누스메이트 ERP</p>
      </div>
    </div>
  );
}
