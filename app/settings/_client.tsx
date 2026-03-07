"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { useRouter } from "next/navigation";

export default function SettingsPage() {
  const supabase = createClient();
  const router = useRouter();

  const [userEmail, setUserEmail] = useState("");
  const [loading, setLoading] = useState(true);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwSubmitting, setPwSubmitting] = useState(false);
  const [pwMessage, setPwMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [emailSending, setEmailSending] = useState(false);
  const [emailMessage, setEmailMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push("/login"); return; }
      setUserEmail(session.user.email ?? "");
      setLoading(false);
    });
  }, []);

  // 현재 로그인 상태에서 직접 비밀번호 변경
  const handlePasswordChange = async () => {
    if (!newPassword || !confirmPassword) {
      setPwMessage({ type: "error", text: "새 비밀번호를 입력해주세요." }); return;
    }
    if (newPassword.length < 6) {
      setPwMessage({ type: "error", text: "비밀번호는 6자 이상이어야 합니다." }); return;
    }
    if (newPassword !== confirmPassword) {
      setPwMessage({ type: "error", text: "비밀번호가 일치하지 않습니다." }); return;
    }
    setPwSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      setPwMessage({ type: "error", text: error.message });
    } else {
      setPwMessage({ type: "success", text: "비밀번호가 성공적으로 변경됐습니다." });
      setNewPassword(""); setConfirmPassword("");
    }
    setPwSubmitting(false);
  };

  // 비밀번호 재설정 링크 이메일 발송
  const handleSendResetEmail = async () => {
    setEmailSending(true);
    const { error } = await supabase.auth.resetPasswordForEmail(userEmail, {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/login?type=recovery`,
    });
    if (error) {
      setEmailMessage({ type: "error", text: error.message });
    } else {
      setEmailMessage({
        type: "success",
        text: `${userEmail}로 재설정 링크를 발송했습니다. 메일함을 확인해주세요.`,
      });
    }
    setEmailSending(false);
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-gray-500 text-sm">로딩 중...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-lg mx-auto">
          <h1 className="text-xl font-bold text-gray-900">내 계정</h1>
          <p className="text-xs text-gray-500 mt-0.5">{userEmail}</p>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-6 py-6 space-y-4">
        {/* 직접 비밀번호 변경 */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
          <h2 className="text-base font-semibold text-gray-800 mb-1">비밀번호 변경</h2>
          <p className="text-xs text-gray-500 mb-4">현재 로그인된 상태에서 바로 변경할 수 있습니다.</p>

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">새 비밀번호</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="6자 이상"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">새 비밀번호 확인</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="비밀번호 재입력"
                onKeyDown={(e) => e.key === "Enter" && handlePasswordChange()}
              />
            </div>
          </div>

          {pwMessage && (
            <div className={`mt-3 p-2.5 rounded-md text-sm ${
              pwMessage.type === "success"
                ? "bg-green-50 text-green-700 border border-green-200"
                : "bg-red-50 text-red-700 border border-red-200"
            }`}>
              {pwMessage.text}
            </div>
          )}

          <button
            onClick={handlePasswordChange}
            disabled={pwSubmitting}
            className="mt-4 w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-md text-sm font-medium disabled:opacity-50 transition-colors"
          >
            {pwSubmitting ? "변경 중..." : "비밀번호 변경"}
          </button>
        </div>

        {/* 이메일로 재설정 링크 */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
          <h2 className="text-base font-semibold text-gray-800 mb-1">이메일로 재설정 링크 받기</h2>
          <p className="text-xs text-gray-500 mb-4">
            비밀번호를 잊어버린 경우, 이메일로 재설정 링크를 받을 수 있습니다.
          </p>

          <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-md border border-gray-100 mb-4">
            <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <span className="text-sm text-gray-700">{userEmail}</span>
          </div>

          {emailMessage && (
            <div className={`mb-3 p-2.5 rounded-md text-sm ${
              emailMessage.type === "success"
                ? "bg-green-50 text-green-700 border border-green-200"
                : "bg-red-50 text-red-700 border border-red-200"
            }`}>
              {emailMessage.text}
            </div>
          )}

          <button
            onClick={handleSendResetEmail}
            disabled={emailSending}
            className="w-full border border-gray-300 hover:bg-gray-50 text-gray-700 py-2 rounded-md text-sm font-medium disabled:opacity-50 transition-colors"
          >
            {emailSending ? "발송 중..." : "재설정 링크 이메일 발송"}
          </button>
        </div>
      </div>
    </div>
  );
}
