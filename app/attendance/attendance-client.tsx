"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { PinModal } from "@/app/contexts/PinSessionContext";
import { getDistanceMeters, getCurrentPosition, nowKSTIso, todayKST } from "@/utils/location";

type Employee = { id: string; name: string; pin: string | null; webauthn_credential: any };
type AttendanceRecord = { type: string; happened_at: string };

export default function AttendanceClient() {
  const supabase = useMemo(() => createClient(), []);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [pinEmployee, setPinEmployee] = useState<Employee | null>(null); // PIN 인증 대상
  const [verifiedEmployee, setVerifiedEmployee] = useState<{ id: string; name: string } | null>(null);
  const [todayRecords, setTodayRecords] = useState<AttendanceRecord[]>([]);
  const [officeLocation, setOfficeLocation] = useState<{ latitude: number; longitude: number; radius_m: number } | null>(null);
  const [status, setStatus] = useState<{ type: "idle" | "ok" | "err" | "warn"; msg: string }>({ type: "idle", msg: "" });
  const [loading, setLoading] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pendingType, setPendingType] = useState<"IN" | "OUT" | null>(null);

  // 직원 목록 + 회사 위치 로드
  useEffect(() => {
    async function init() {
      const [{ data: emps }, { data: office }] = await Promise.all([
        supabase.from("employees").select("id,name,pin,webauthn_credential").order("name"),
        supabase.from("office_location").select("latitude,longitude,radius_m").single(),
      ]);
      setEmployees((emps ?? []) as Employee[]);
      if (office) setOfficeLocation(office);
    }
    init();
  }, [supabase]);

  // 오늘 출퇴근 기록 조회
  async function loadTodayRecords(employeeId: string) {
    const today = todayKST();
    const { data } = await supabase
      .from("attendance")
      .select("type,happened_at")
      .eq("employee_id", employeeId)
      .gte("happened_at", `${today}T00:00:00+09:00`)
      .lte("happened_at", `${today}T23:59:59+09:00`)
      .order("happened_at", { ascending: true });
    setTodayRecords((data ?? []) as AttendanceRecord[]);
  }

  // 출근/퇴근 버튼 클릭 → PIN 모달 먼저
  function handleAttendanceClick(type: "IN" | "OUT") {
    if (!officeLocation) {
      setStatus({ type: "err", msg: "회사 위치가 등록되지 않았습니다. 관리자에게 문의하세요." });
      return;
    }
    setPendingType(type);
    setShowPinModal(true);
  }

  // PIN 인증 성공 후 WebAuthn + GPS 진행
  async function handlePinSuccess(employeeId: string, employeeName: string) {
    setShowPinModal(false);
    const emp = employees.find(e => e.id === employeeId);
    if (!emp) return;

    setVerifiedEmployee({ id: employeeId, name: employeeName });
    await loadTodayRecords(employeeId);

    // WebAuthn 등록 여부 확인
    if (!emp.webauthn_credential) {
      // 미등록 → WebAuthn 등록 먼저
      await registerWebAuthn(emp);
    } else {
      // 등록됨 → 바로 출퇴근 기록
      await recordAttendance(employeeId, employeeName, emp);
    }
  }

  // WebAuthn 등록
  async function registerWebAuthn(emp: Employee) {
    setStatus({ type: "warn", msg: "기기 등록 중 — 지문 또는 Face ID를 인식해주세요..." });
    try {
      const challenge = new Uint8Array(32);
      crypto.getRandomValues(challenge);

      const cred = await navigator.credentials.create({
        publicKey: {
          challenge,
          rp: { name: "BONUSMATE ERP", id: window.location.hostname },
          user: {
            id: new TextEncoder().encode(emp.id),
            name: emp.name,
            displayName: emp.name,
          },
          pubKeyCredParams: [
            { type: "public-key", alg: -7 },
            { type: "public-key", alg: -257 },
          ],
          authenticatorSelection: { userVerification: "required" },
          timeout: 30000,
        },
      }) as PublicKeyCredential;

      // 공개키 Supabase 저장
      const credData = {
        credentialId: btoa(String.fromCharCode(...new Uint8Array((cred as any).rawId))),
        registered_at: nowKSTIso(),
      };

      const { error } = await supabase
        .from("employees")
        .update({ webauthn_credential: credData })
        .eq("id", emp.id);

      if (error) throw new Error("기기 등록 저장 실패: " + error.message);

      // employees 로컬 업데이트
      setEmployees(prev => prev.map(e => e.id === emp.id ? { ...e, webauthn_credential: credData } : e));
      setStatus({ type: "ok", msg: `${emp.name} 기기 등록 완료! 이제 출퇴근 버튼을 다시 눌러주세요.` });
    } catch (e: any) {
      setStatus({ type: "err", msg: "기기 등록 실패: " + (e?.message ?? "취소됨") });
    }
  }

  // WebAuthn 인증 + GPS 확인 + 출퇴근 저장
  async function recordAttendance(employeeId: string, employeeName: string, emp: Employee) {
    if (!pendingType || !officeLocation) return;
    setLoading(true);

    try {
      // ① WebAuthn 인증
      setStatus({ type: "warn", msg: "지문 또는 Face ID를 인식해주세요..." });
      const challenge = new Uint8Array(32);
      crypto.getRandomValues(challenge);

      const credIdBytes = Uint8Array.from(
        atob(emp.webauthn_credential.credentialId), c => c.charCodeAt(0)
      );

      await navigator.credentials.get({
        publicKey: {
          challenge,
          allowCredentials: [{ type: "public-key", id: credIdBytes }],
          userVerification: "required",
          timeout: 30000,
        },
      });

      // ② GPS 확인
      setStatus({ type: "warn", msg: "위치 확인 중..." });
      const pos = await getCurrentPosition();
      const { latitude, longitude } = pos.coords;
      const distance = getDistanceMeters(
        latitude, longitude,
        officeLocation.latitude, officeLocation.longitude
      );

      if (distance > officeLocation.radius_m) {
        setStatus({ type: "err", msg: `회사에서 ${distance}m 떨어진 위치입니다. 회사 내에서만 기록 가능합니다. (허용: ${officeLocation.radius_m}m)` });
        return;
      }

      // ③ 저장
      const { error } = await supabase.from("attendance").insert({
        employee_id: employeeId,
        happened_at: nowKSTIso(),
        type: pendingType,
        latitude,
        longitude,
        distance_m: distance,
      });

      if (error) throw new Error("저장 실패: " + error.message);

      const label = pendingType === "IN" ? "출근" : "퇴근";
      const time = new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Seoul" });
      setStatus({ type: "ok", msg: `${employeeName} ${label} 기록 완료 — ${time}` });
      await loadTodayRecords(employeeId);

    } catch (e: any) {
      setStatus({ type: "err", msg: "인증 실패: " + (e?.message ?? "취소됨") });
    } finally {
      setLoading(false);
      setPendingType(null);
    }
  }

  // 오늘 출근/퇴근 시각 찾기
  const todayIn = todayRecords.find(r => r.type === "IN");
  const todayOut = todayRecords.find(r => r.type === "OUT");

  function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString("ko-KR", {
      hour: "2-digit", minute: "2-digit", timeZone: "Asia/Seoul"
    });
  }

  const statusStyle = {
    idle: "bg-slate-50 border-slate-200 text-slate-500",
    ok:   "bg-green-50 border-green-200 text-green-700",
    err:  "bg-red-50 border-red-200 text-red-700",
    warn: "bg-amber-50 border-amber-200 text-amber-700",
  }[status.type];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-base font-bold text-slate-800">출퇴근 기록</div>
          <div className="text-xs text-slate-400 mt-0.5">
            {new Date().toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric", weekday: "short" })}
          </div>
        </div>
        {verifiedEmployee && (
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-700">{verifiedEmployee.name}</span>
            <button
              className="text-xs text-slate-400 hover:text-slate-600"
              onClick={() => { setVerifiedEmployee(null); setTodayRecords([]); setStatus({ type: "idle", msg: "" }); }}
            >
              변경
            </button>
          </div>
        )}
      </div>

      {/* 오늘 기록 현황 */}
      {verifiedEmployee && (
        <div className="flex gap-3 mb-4">
          <div className="flex-1 rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
            <div className="text-xs text-slate-400 mb-1">출근</div>
            <div className={`text-sm font-bold ${todayIn ? "text-green-600" : "text-slate-300"}`}>
              {todayIn ? formatTime(todayIn.happened_at) : "--:--"}
            </div>
          </div>
          <div className="flex-1 rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
            <div className="text-xs text-slate-400 mb-1">퇴근</div>
            <div className={`text-sm font-bold ${todayOut ? "text-blue-600" : "text-slate-300"}`}>
              {todayOut ? formatTime(todayOut.happened_at) : "--:--"}
            </div>
          </div>
        </div>
      )}

      {/* 출근/퇴근 버튼 */}
      <div className="flex gap-3 mb-4">
        <button
          className="flex-1 rounded-xl bg-green-600 py-3 text-sm font-bold text-white hover:bg-green-700 active:scale-95 disabled:opacity-50 transition-all"
          onClick={() => handleAttendanceClick("IN")}
          disabled={loading || !!todayIn}
        >
          {todayIn ? `출근완료 ${formatTime(todayIn.happened_at)}` : "출근 기록"}
        </button>
        <button
          className="flex-1 rounded-xl bg-blue-600 py-3 text-sm font-bold text-white hover:bg-blue-700 active:scale-95 disabled:opacity-50 transition-all"
          onClick={() => handleAttendanceClick("OUT")}
          disabled={loading || !todayIn}
        >
          {todayOut ? `퇴근완료 ${formatTime(todayOut.happened_at)}` : "퇴근 기록"}
        </button>
      </div>

      {/* 상태 메시지 */}
      {status.msg && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${statusStyle}`}>
          {status.msg}
        </div>
      )}

      {/* PIN 모달 */}
      {showPinModal && (
        <PinModal
          employees={employees}
          onSuccess={handlePinSuccess}
          onCancel={() => { setShowPinModal(false); setPendingType(null); }}
          title="본인 확인"
        />
      )}
    </div>
  );
}