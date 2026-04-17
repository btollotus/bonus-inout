"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { useRouter, useSearchParams } from "next/navigation";

// Supabase 영문 에러 → 한글 변환
function translateError(msg: string): string {
  if (msg.includes("New password should be different from the old password"))
    return "새 비밀번호는 기존 비밀번호와 달라야 합니다.";
  if (msg.includes("Password should be at least"))
    return "비밀번호는 6자 이상이어야 합니다.";
  if (msg.includes("Auth session missing"))
    return "세션이 만료됐습니다. 다시 로그인해주세요.";
  if (msg.includes("Invalid login credentials"))
    return "이메일 또는 비밀번호가 올바르지 않습니다.";
  return msg;
}

export default function SettingsPage() {
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isResetMode = searchParams.get("mode") === "reset-password";

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
      setPwMessage({ type: "error", text: translateError(error.message) });
    } else {
      setPwMessage({ type: "success", text: "비밀번호가 성공적으로 변경됐습니다." });
      setNewPassword(""); setConfirmPassword("");
      if (isResetMode) setTimeout(() => router.replace("/"), 1500);
    }
    setPwSubmitting(false);
  };

  const handleSendResetEmail = async () => {
    setEmailSending(true);
    const { error } = await supabase.auth.resetPasswordForEmail(userEmail, {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/confirm?type=recovery`,
    });
    if (error) {
      setEmailMessage({ type: "error", text: translateError(error.message) });
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

  // ── 재설정 링크로 들어온 경우 ──
  if (isResetMode) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-md border border-gray-200 p-8 w-full max-w-md">
          <div className="flex justify-center mb-5">
            <img src="/bonusmate-logo.png" alt="BONUSMATE" width={90} style={{ height: 'auto' }} />
          </div>
          <h2 className="text-center text-lg font-bold text-gray-800 mb-1">새 비밀번호 설정</h2>
          <p className="text-center text-xs text-gray-500 mb-5">{userEmail}</p>

          {pwMessage && (
            <div className={`mb-4 p-2.5 rounded-md text-sm ${
              pwMessage.type === "success"
                ? "bg-green-50 text-green-700 border border-green-200"
                : "bg-red-50 text-red-700 border border-red-200"
            }`}>{pwMessage.text}</div>
          )}

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">새 비밀번호</label>
              <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                placeholder="6자 이상" autoComplete="new-password"
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">비밀번호 확인</label>
              <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="비밀번호 재입력" autoComplete="new-password"
                onKeyDown={(e) => e.key === "Enter" && handlePasswordChange()}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          <button onClick={handlePasswordChange} disabled={pwSubmitting}
            className="mt-5 w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2.5 rounded-lg text-sm font-semibold transition-colors">
            {pwSubmitting ? "변경 중..." : "비밀번호 변경 완료"}
          </button>
          <p className="text-xs text-center text-gray-400 mt-4">(주)보누스메이트 ERP</p>
        </div>
      </div>
    );
  }

  // ── 일반 설정 페이지 ──
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-lg mx-auto">
          <h1 className="text-xl font-bold text-gray-900">내 계정</h1>
          <p className="text-xs text-gray-500 mt-0.5">{userEmail}</p>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-6 py-6 space-y-4">
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
          <h2 className="text-base font-semibold text-gray-800 mb-1">비밀번호 변경</h2>
          <p className="text-xs text-gray-500 mb-4">현재 로그인된 상태에서 바로 변경할 수 있습니다.</p>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">새 비밀번호</label>
              <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="6자 이상" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">새 비밀번호 확인</label>
              <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="비밀번호 재입력"
                onKeyDown={(e) => e.key === "Enter" && handlePasswordChange()} />
            </div>
          </div>
          {pwMessage && (
            <div className={`mt-3 p-2.5 rounded-md text-sm ${
              pwMessage.type === "success"
                ? "bg-green-50 text-green-700 border border-green-200"
                : "bg-red-50 text-red-700 border border-red-200"
            }`}>{pwMessage.text}</div>
          )}
          <button onClick={handlePasswordChange} disabled={pwSubmitting}
            className="mt-4 w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-md text-sm font-medium disabled:opacity-50 transition-colors">
            {pwSubmitting ? "변경 중..." : "비밀번호 변경"}
          </button>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
          <h2 className="text-base font-semibold text-gray-800 mb-1">이메일로 재설정 링크 받기</h2>
          <p className="text-xs text-gray-500 mb-4">비밀번호를 잊어버린 경우 이메일로 재설정 링크를 받을 수 있습니다.</p>
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
            }`}>{emailMessage.text}</div>
          )}
          <button onClick={handleSendResetEmail} disabled={emailSending}
            className="w-full border border-gray-300 hover:bg-gray-50 text-gray-700 py-2 rounded-md text-sm font-medium disabled:opacity-50 transition-colors">
            {emailSending ? "발송 중..." : "재설정 링크 이메일 발송"}
          </button>
        </div>
        <PinSettingSection userEmail={userEmail} supabase={supabase} />

      </div>
    </div>
  );
}

// ── PIN 설정 섹션 ──
function PinSettingSection({
  userEmail,
  supabase,
}: {
  userEmail: string;
  supabase: ReturnType<typeof createClient>;
}) {
  const [currentPin, setCurrentPin] = useState<string | null>(null);
  const [pin1, setPin1] = useState("");
  const [pin2, setPin2] = useState("");
  const [pinMsg, setPinMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [pinSaving, setPinSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("employees")
        .select("pin")
        .eq("email", userEmail)
        .maybeSingle();
      setCurrentPin(data?.pin ?? null);
      setLoading(false);
    })();
  }, [userEmail]);

  async function savePin() {
    setPinMsg(null);
    if (!pin1 || pin1.length !== 4 || !/^\d{4}$/.test(pin1))
      return setPinMsg({ type: "error", text: "PIN은 숫자 4자리여야 합니다." });
    if (pin1 !== pin2)
      return setPinMsg({ type: "error", text: "PIN이 일치하지 않습니다." });
    setPinSaving(true);
    const { error } = await supabase
      .from("employees")
      .update({ pin: pin1 })
      .eq("email", userEmail);
    setPinSaving(false);
    if (error) return setPinMsg({ type: "error", text: "저장 실패: " + error.message });
    setCurrentPin(pin1);
    setPin1(""); setPin2("");
    setPinMsg({ type: "success", text: "✅ PIN이 설정되었습니다." });
  }

  if (loading) return null;

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
      <h2 className="text-base font-semibold text-gray-800 mb-1">생산일지 PIN 설정</h2>
      <p className="text-xs text-gray-500 mb-4">
        생산일지 작성 시 본인 확인에 사용되는 4자리 숫자 PIN입니다.
      </p>

      {/* 현재 상태 */}
      <div className="mb-4 flex items-center gap-2">
        <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
          currentPin
            ? "border-green-200 bg-green-50 text-green-700"
            : "border-amber-200 bg-amber-50 text-amber-700"
        }`}>
          {currentPin ? "✅ PIN 설정됨" : "⚠ PIN 미설정"}
        </span>
        {currentPin && (
          <span className="text-xs text-gray-400">변경하려면 새 PIN을 입력하세요</span>
        )}
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {currentPin ? "새 PIN (4자리 숫자)" : "PIN 설정 (4자리 숫자)"}
          </label>
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={pin1}
            onChange={(e) => setPin1(e.target.value.replace(/[^\d]/g, "").slice(0, 4))}
            placeholder="● ● ● ●"
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 tracking-widest text-center text-lg"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">PIN 확인</label>
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={pin2}
            onChange={(e) => setPin2(e.target.value.replace(/[^\d]/g, "").slice(0, 4))}
            placeholder="● ● ● ●"
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 tracking-widest text-center text-lg"
            onKeyDown={(e) => e.key === "Enter" && savePin()}
          />
        </div>
      </div>

      {pinMsg && (
        <div className={`mt-3 p-2.5 rounded-md text-sm ${
          pinMsg.type === "success"
            ? "bg-green-50 text-green-700 border border-green-200"
            : "bg-red-50 text-red-700 border border-red-200"
        }`}>{pinMsg.text}</div>
      )}

      <button
        onClick={savePin}
        disabled={pinSaving || pin1.length !== 4 || pin2.length !== 4}
        className="mt-4 w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-md text-sm font-medium disabled:opacity-50 transition-colors">
        {pinSaving ? "저장 중..." : currentPin ? "PIN 변경" : "PIN 설정"}
      </button>
    </div>
  );
}