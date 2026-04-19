"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/browser";

const supabase = createClient();

// ── 타입 ──
type PinSession = {
  employeeId: string;
  employeeName: string;
  expiresAt: number; // timestamp (ms)
} | null;

type PinSessionContextType = {
  session: PinSession;
  isValid: () => boolean;
  login: (employeeId: string, employeeName: string) => void;
  logout: () => void;
};

// ── Context ──
const PinSessionContext = createContext<PinSessionContextType | null>(null);

export function PinSessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<PinSession>(null);

  const isValid = useCallback(() => {
    if (!session) return false;
    return Date.now() < session.expiresAt;
  }, [session]);

  const login = useCallback((employeeId: string, employeeName: string) => {
    setSession({
      employeeId,
      employeeName,
      expiresAt: Date.now() + 30 * 60 * 1000, // 30분
    });
  }, []);

  const logout = useCallback(() => {
    setSession(null);
  }, []);

  return (
    <PinSessionContext.Provider value={{ session, isValid, login, logout }}>
      {children}
    </PinSessionContext.Provider>
  );
}

export function usePinSession() {
  const ctx = useContext(PinSessionContext);
  if (!ctx) throw new Error("usePinSession must be used within PinSessionProvider");
  return ctx;
}

// ── PIN 입력 모달 컴포넌트 ──
type PinModalProps = {
  employees: { id: string; name: string; pin: string | null }[];
  onSuccess: (employeeId: string, employeeName: string) => void;
  onCancel: () => void;
  title?: string;
};

export function PinModal({ employees, onSuccess, onCancel, title = "본인 확인" }: PinModalProps) {
  const [selectedEmployee, setSelectedEmployee] = useState<{ id: string; name: string; pin: string | null } | null>(null);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState("");
  const [step, setStep] = useState<"select" | "pin">("select");

  function handleSelect(emp: { id: string; name: string; pin: string | null }) {
    setSelectedEmployee(emp);
    setPinInput("");
    setPinError("");
    setStep("pin");
  }

  function handleDigit(d: string) {
    if (pinInput.length >= 4) return;
    const next = pinInput + d;
    setPinInput(next);
    if (next.length === 4) {
      setTimeout(() => verifyPin(next), 100);
    }
  }

  function verifyPin(pin: string) {
    if (!selectedEmployee) return;
    if (!selectedEmployee.pin) {
      setPinError("PIN이 설정되지 않았습니다.");
      setPinInput("");
      return;
    }
    if (selectedEmployee.pin !== pin) {
      setPinError("PIN이 올바르지 않습니다.");
      setPinInput("");
      return;
    }
    onSuccess(selectedEmployee.id, selectedEmployee.name);
  }

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white shadow-2xl p-6">

        {step === "select" ? (
          <>
            <div className="mb-4 font-bold text-base text-slate-700 text-center">{title}</div>
            <div className="grid grid-cols-2 gap-3">
              {employees.map((emp) => (
                <button key={emp.id}
                  className="rounded-2xl border-2 border-slate-200 bg-white px-4 py-4 text-center font-bold text-slate-700 hover:border-blue-400 hover:bg-blue-50 active:scale-95 transition-all"
                  onClick={() => handleSelect(emp)}>
                  {emp.name}
                  <div className="mt-1 text-[10px] font-normal text-slate-400">
                    {emp.pin ? "PIN 설정됨" : "PIN 미설정"}
                  </div>
                </button>
              ))}
            </div>
            <button className="mt-4 w-full text-sm text-slate-400 hover:text-slate-600"
              onClick={onCancel}>취소</button>
          </>
        ) : (
          <>
            <button className="mb-4 text-xs text-slate-400 hover:text-slate-600"
              onClick={() => { setStep("select"); setPinInput(""); setPinError(""); }}>
              ← 다시 선택
            </button>
            <div className="mb-1 font-bold text-base text-slate-700 text-center">
              {selectedEmployee?.name}
            </div>
            <div className="mb-4 text-sm text-slate-500 text-center">PIN 4자리를 입력하세요</div>
            <div className="flex justify-center gap-3 mb-4">
              {[0,1,2,3].map((i) => (
                <div key={i} className={`w-10 h-10 rounded-xl border-2 flex items-center justify-center text-lg font-bold transition-all
                  ${pinInput.length > i ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 bg-slate-50 text-slate-300"}`}>
                  {pinInput.length > i ? "●" : "○"}
                </div>
              ))}
            </div>
            {pinError && <div className="mb-3 text-center text-xs text-red-500">{pinError}</div>}
            <div className="grid grid-cols-3 gap-2">
              {["1","2","3","4","5","6","7","8","9","","0","⌫"].map((d, i) => (
                <button key={i}
                  className={`rounded-xl border py-3 text-lg font-semibold transition-all
                    ${d === "" ? "invisible" : "border-slate-200 bg-white hover:bg-slate-50 active:bg-slate-100 active:scale-95"}`}
                  onClick={() => {
                    if (d === "⌫") { setPinInput((p) => p.slice(0, -1)); setPinError(""); }
                    else if (d !== "") handleDigit(d);
                  }}>
                  {d}
                </button>
              ))}
            </div>
            <button className="mt-4 w-full text-sm text-slate-400 hover:text-slate-600"
              onClick={onCancel}>취소</button>
          </>
        )}
      </div>
    </div>
  );
}