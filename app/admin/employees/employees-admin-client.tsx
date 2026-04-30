"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

type EmployeeRow = {
  id: string;
  name: string;
  employee_code: string | null;
  auth_user_id: string | null;
  rrn: string | null;
  mobile: string | null;
  address: string | null;
  hire_date: string | null;
  resign_date: string | null;
  pin: string | null;
  webauthn_credential: { credentialId: string; registered_at: string } | null;
  created_at?: string;
  updated_at?: string;
};

function safeStr(v: any) {
  return String(v ?? "").trim();
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function maskRrn(rrn: string | null) {
  if (!rrn) return "";
  const clean = rrn.replace("-", "");
  if (clean.length <= 6) return rrn;
  return clean.slice(0, 6) + "-" + "*".repeat(clean.length - 6);
}

export default function EmployeesAdminClient() {
  const supabase = useMemo(() => createClient(), []);

  const pageBg = "bg-slate-50 text-slate-900";
  const card = "rounded-2xl border border-slate-200 bg-white shadow-sm";
  const input =
    "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300";
  const btn =
    "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50 active:bg-slate-100";
  const btnOn =
    "rounded-xl border border-blue-600/20 bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 active:bg-blue-800";

  const [msg, setMsg] = useState<string | null>(null);
  const [rows, setRows] = useState<EmployeeRow[]>([]);
  const [loading, setLoading] = useState(false);

  const [name, setName] = useState("");
  const [employeeCode, setEmployeeCode] = useState("");
  const [authUserId, setAuthUserId] = useState("");
  const [rrn, setRrn] = useState("");
  const [mobile, setMobile] = useState("");
  const [address, setAddress] = useState("");
  const [hireDate, setHireDate] = useState("");
  const [resignDate, setResignDate] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);

  const [showFormRrn, setShowFormRrn] = useState(false);
  const [visibleRrnIds, setVisibleRrnIds] = useState<Set<string>>(new Set());

  function toggleRowRrn(id: string) {
    setVisibleRrnIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function load() {
    setMsg(null);
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("employees")
        .select("id,name,employee_code,auth_user_id,rrn,mobile,address,hire_date,resign_date,pin,webauthn_credential,created_at,updated_at")
        .order("created_at", { ascending: false })
        .limit(500);

      if (error) throw error;
      setRows((data ?? []) as EmployeeRow[]);
    } catch (e: any) {
      setMsg(e?.message ?? "직원 목록 조회 오류");
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setName("");
    setEmployeeCode("");
    setAuthUserId("");
    setRrn("");
    setMobile("");
    setAddress("");
    setHireDate("");
    setResignDate("");
    setEditingId(null);
    setShowFormRrn(false);
  }

  function fillForm(r: EmployeeRow) {
    setEditingId(r.id);
    setName(safeStr(r.name));
    setEmployeeCode(safeStr(r.employee_code));
    setAuthUserId(safeStr(r.auth_user_id));
    setRrn(safeStr(r.rrn));
    setMobile(safeStr(r.mobile));
    setAddress(safeStr(r.address));
    setHireDate(safeStr(r.hire_date));
    setResignDate(safeStr(r.resign_date));
    setShowFormRrn(false);
  }

  async function save() {
    setMsg(null);

    const nm = safeStr(name);
    if (!nm) {
      setMsg("이름(name)은 필수입니다.");
      return;
    }

    const code = safeStr(employeeCode) || null;

    const au = safeStr(authUserId);
    if (au && !isUuid(au)) {
      setMsg('auth_user_id는 Supabase Auth Users의 "id(uuid)"만 입력 가능합니다. (예: 2c1d...-....) 20240301_0001 같은 사번은 employee_code에 입력하세요.');
      return;
    }

    const payload: any = {
      name: nm,
      employee_code: code,
      auth_user_id: au || null,
      rrn: safeStr(rrn) || null,
      mobile: safeStr(mobile) || null,
      address: safeStr(address) || null,
      hire_date: safeStr(hireDate) || null,
      resign_date: safeStr(resignDate) || null,
    };

    setLoading(true);
    try {
      if (editingId) {
        const { error } = await supabase.from("employees").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("employees").insert(payload);
        if (error) throw error;
      }
      resetForm();
      await load();
    } catch (e: any) {
      setMsg(e?.message ?? "저장 오류");
    } finally {
      setLoading(false);
    }
  }

  async function remove(id: string) {
    const ok = window.confirm("직원 정보를 삭제할까요?");
    if (!ok) return;

    setMsg(null);
    setLoading(true);
    try {
      const { error } = await supabase.from("employees").delete().eq("id", id);
      if (error) throw error;
      await load();
    } catch (e: any) {
      setMsg(e?.message ?? "삭제 오류");
    } finally {
      setLoading(false);
    }
  }

  async function resetWebAuthn(r: EmployeeRow) {
    if (!confirm(`${r.name}의 WebAuthn 기기를 초기화하시겠습니까?\n직원이 다음 출퇴근 시 기기를 재등록해야 합니다.`)) return;

    const { error } = await supabase
      .from("employees")
      .update({ webauthn_credential: null })
      .eq("id", r.id);

    if (error) {
      setMsg("WebAuthn 초기화 실패: " + error.message);
      return;
    }
    setMsg(null);
    await load();
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={`${pageBg} min-h-screen`}>
      <div className="mx-auto w-full max-w-[1200px] px-4 py-6">
        {msg ? (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {msg}
          </div>
        ) : null}

        <div className={`${card} p-4`}>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-lg font-semibold">직원 관리 (관리자)</div>
              <div className="mt-1 text-xs text-slate-500">
                employees.auth_user_id에는 직원의 로그인 UID(auth.users.id, uuid)만 매핑하세요. 사번/코드는 employee_code에 입력합니다.
              </div>
            </div>
            <div className="flex gap-2">
              <button className={btn} onClick={resetForm} disabled={loading}>
                새로입력
              </button>
              <button className={btnOn} onClick={load} disabled={loading}>
                {loading ? "불러오는 중..." : "새로고침"}
              </button>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <div className="mb-1 text-xs font-semibold text-slate-700">이름(name) *</div>
                <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 홍길동" />
              </div>

              <div>
                <div className="mb-1 text-xs font-semibold text-slate-700">사번(employee_code)</div>
                <input className={input} value={employeeCode} onChange={(e) => setEmployeeCode(e.target.value)} placeholder="예: 20240301_0001" />
              </div>

              <div>
                <div className="mb-1 text-xs font-semibold text-slate-700">auth_user_id (직원 UID, uuid)</div>
                <input
                  className={input}
                  value={authUserId}
                  onChange={(e) => setAuthUserId(e.target.value)}
                  placeholder="예: 2c1d... (Supabase Auth Users의 id)"
                />
                <div className="mt-1 text-[11px] text-slate-500">
                  ※ 여기에 사번(20240301_0001)을 넣으면 uuid 에러가 납니다.
                </div>
              </div>

              <div>
                <div className="mb-1 text-xs font-semibold text-slate-700">주민번호(rrn)</div>
                <div className="relative">
                  <input
                    className={input}
                    type={showFormRrn ? "text" : "password"}
                    value={rrn}
                    onChange={(e) => setRrn(e.target.value)}
                    placeholder="민감정보: 운영에선 마스킹/암호화 권장"
                    style={{ paddingRight: "2.5rem" }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowFormRrn((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-base select-none"
                    title={showFormRrn ? "숨기기" : "보기"}
                  >
                    {showFormRrn ? "🙈" : "👁"}
                  </button>
                </div>
              </div>

              <div>
                <div className="mb-1 text-xs font-semibold text-slate-700">휴대폰(mobile)</div>
                <input className={input} value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="010-0000-0000" />
              </div>

              <div className="md:col-span-2">
                <div className="mb-1 text-xs font-semibold text-slate-700">주소(address)</div>
                <input className={input} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="주소" />
              </div>

              <div>
                <div className="mb-1 text-xs font-semibold text-slate-700">입사일(hire_date)</div>
                <input className={input} type="date" value={hireDate} onChange={(e) => setHireDate(e.target.value)} />
              </div>

              <div>
                <div className="mb-1 text-xs font-semibold text-slate-700">퇴사일(resign_date)</div>
                <input className={input} type="date" value={resignDate} onChange={(e) => setResignDate(e.target.value)} />
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <button className={btnOn} onClick={save} disabled={loading}>
                {editingId ? "수정 저장" : "등록"}
              </button>
              {editingId ? (
                <button className={btn} onClick={resetForm} disabled={loading}>
                  취소
                </button>
              ) : null}
            </div>
          </div>

          <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
            <table className="min-w-[1080px] w-full text-sm">
              <thead className="bg-slate-50">
                <tr className="text-left">
                  <th className="px-3 py-2">이름</th>
                  <th className="px-3 py-2">사번</th>
                  <th className="px-3 py-2">auth_user_id</th>
                  <th className="px-3 py-2">휴대폰</th>
                  <th className="px-3 py-2">입사일</th>
                  <th className="px-3 py-2">주민번호</th>
                  <th className="px-3 py-2">퇴사일</th>
                  <th className="px-3 py-2">PIN</th>
                  <th className="px-3 py-2">WebAuthn</th>
                  <th className="px-3 py-2">작업</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td className="px-3 py-3 text-slate-500" colSpan={10}>
                      {loading ? "불러오는 중..." : "직원 데이터가 없습니다."}
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.id} className="border-t border-slate-200 bg-white">
                      <td className="px-3 py-2 font-semibold">{r.name}</td>
                      <td className="px-3 py-2">{r.employee_code ?? ""}</td>
                      <td className="px-3 py-2 font-mono text-xs">{r.auth_user_id ?? ""}</td>
                      <td className="px-3 py-2">{r.mobile ?? ""}</td>
                      <td className="px-3 py-2">{r.hire_date ?? ""}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          <span className="font-mono text-xs">
                            {visibleRrnIds.has(r.id) ? (r.rrn ?? "") : maskRrn(r.rrn)}
                          </span>
                          {r.rrn && (
                            <button
                              type="button"
                              onClick={() => toggleRowRrn(r.id)}
                              className="text-slate-400 hover:text-slate-700 text-base select-none"
                              title={visibleRrnIds.has(r.id) ? "숨기기" : "보기"}
                            >
                              {visibleRrnIds.has(r.id) ? "🙈" : "👁"}
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2">{r.resign_date ?? ""}</td>

                      {/* PIN */}
                      <td className="px-3 py-2">
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                          r.pin
                            ? "border-green-200 bg-green-50 text-green-700"
                            : "border-slate-200 bg-slate-50 text-slate-400"
                        }`}>
                          {r.pin ? "설정됨" : "미설정"}
                        </span>
                      </td>

                      {/* WebAuthn */}
                      <td className="px-3 py-2">
                        {r.webauthn_credential ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700 w-fit">
                              등록됨
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {new Date(r.webauthn_credential.registered_at).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })}
                            </span>
                          </div>
                        ) : (
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-400">
                            미등록
                          </span>
                        )}
                      </td>

                      {/* 작업 버튼 */}
                      <td className="px-3 py-2">
                        <div className="flex gap-2 flex-wrap">
                          <button className={btn} onClick={() => fillForm(r)} disabled={loading}>
                            수정
                          </button>
                          {r.pin && (
                            <button
                              className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700 hover:bg-amber-100"
                              disabled={loading}
                              onClick={async () => {
                                if (!confirm(`${r.name}의 PIN을 초기화하시겠습니까?`)) return;
                                const { error } = await supabase
                                  .from("employees")
                                  .update({ pin: null })
                                  .eq("id", r.id);
                                if (error) return setMsg("PIN 초기화 실패: " + error.message);
                                setMsg(null);
                                await load();
                              }}
                            >
                              PIN초기화
                            </button>
                          )}
                          {r.webauthn_credential && (
                            <button
                              className="rounded-xl border border-purple-200 bg-purple-50 px-3 py-2 text-sm text-purple-700 hover:bg-purple-100 active:scale-95 transition-all"
                              disabled={loading}
                              onClick={() => resetWebAuthn(r)}
                            >
                              기기초기화
                            </button>
                          )}
                          <button className={btn} onClick={() => remove(r.id)} disabled={loading}>
                            삭제
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-3 text-xs text-slate-500">
            ※ employees는 RLS로 관리자만 접근하게 되어 있어, 직원이 자기 인사정보를 볼 수 없습니다(요구사항 충족).
          </div>
        </div>
      </div>
    </div>
  );
}
