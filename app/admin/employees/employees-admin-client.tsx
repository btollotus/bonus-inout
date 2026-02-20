"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

type EmployeeRow = {
  id: string;
  name: string;
  auth_user_id: string | null;

  rrn: string | null;
  mobile: string | null;
  address: string | null;
  hire_date: string | null;
  resign_date: string | null;

  created_at?: string;
  updated_at?: string;
};

function safeStr(v: any) {
  return String(v ?? "").trim();
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

  // form
  const [name, setName] = useState("");
  const [authUserId, setAuthUserId] = useState("");
  const [rrn, setRrn] = useState("");
  const [mobile, setMobile] = useState("");
  const [address, setAddress] = useState("");
  const [hireDate, setHireDate] = useState("");
  const [resignDate, setResignDate] = useState("");

  // edit
  const [editingId, setEditingId] = useState<string | null>(null);

  async function load() {
    setMsg(null);
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("employees")
        .select("id,name,auth_user_id,rrn,mobile,address,hire_date,resign_date,created_at,updated_at")
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
    setAuthUserId("");
    setRrn("");
    setMobile("");
    setAddress("");
    setHireDate("");
    setResignDate("");
    setEditingId(null);
  }

  function fillForm(r: EmployeeRow) {
    setEditingId(r.id);
    setName(safeStr(r.name));
    setAuthUserId(safeStr(r.auth_user_id));
    setRrn(safeStr(r.rrn));
    setMobile(safeStr(r.mobile));
    setAddress(safeStr(r.address));
    setHireDate(safeStr(r.hire_date));
    setResignDate(safeStr(r.resign_date));
  }

  async function save() {
    setMsg(null);

    const payload: any = {
      name: safeStr(name),
      auth_user_id: safeStr(authUserId) || null,
      rrn: safeStr(rrn) || null,
      mobile: safeStr(mobile) || null,
      address: safeStr(address) || null,
      hire_date: safeStr(hireDate) || null,
      resign_date: safeStr(resignDate) || null,
    };

    if (!payload.name) {
      setMsg("이름(name)은 필수입니다.");
      return;
    }

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
                employees.auth_user_id에 직원의 로그인 UID(auth.users.id)를 매핑해야 /leave 입력이 정상 저장됩니다.
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
                <div className="mb-1 text-xs font-semibold text-slate-700">auth_user_id (직원 UID)</div>
                <input
                  className={input}
                  value={authUserId}
                  onChange={(e) => setAuthUserId(e.target.value)}
                  placeholder="예: 2c1d... (Supabase Auth Users의 id)"
                />
              </div>

              <div>
                <div className="mb-1 text-xs font-semibold text-slate-700">주민번호(rrn)</div>
                <input className={input} value={rrn} onChange={(e) => setRrn(e.target.value)} placeholder="민감정보: 운영에선 마스킹/암호화 권장" />
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
            <table className="min-w-[980px] w-full text-sm">
              <thead className="bg-slate-50">
                <tr className="text-left">
                  <th className="px-3 py-2">이름</th>
                  <th className="px-3 py-2">auth_user_id</th>
                  <th className="px-3 py-2">휴대폰</th>
                  <th className="px-3 py-2">입사일</th>
                  <th className="px-3 py-2">퇴사일</th>
                  <th className="px-3 py-2">작업</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td className="px-3 py-3 text-slate-500" colSpan={6}>
                      {loading ? "불러오는 중..." : "직원 데이터가 없습니다."}
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.id} className="border-t border-slate-200 bg-white">
                      <td className="px-3 py-2 font-semibold">{r.name}</td>
                      <td className="px-3 py-2 font-mono text-xs">{r.auth_user_id ?? ""}</td>
                      <td className="px-3 py-2">{r.mobile ?? ""}</td>
                      <td className="px-3 py-2">{r.hire_date ?? ""}</td>
                      <td className="px-3 py-2">{r.resign_date ?? ""}</td>
                      <td className="px-3 py-2">
                        <div className="flex gap-2">
                          <button className={btn} onClick={() => fillForm(r)} disabled={loading}>
                            수정
                          </button>
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