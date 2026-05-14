"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { PinModal } from "@/app/contexts/PinSessionContext";

const supabase = createClient();

const card = "rounded-2xl border border-slate-200 bg-white shadow-sm";
const inp = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:outline-none";
const btn = "rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50 active:bg-slate-100";
const btnOn = "rounded-xl border border-blue-500 bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 active:bg-blue-800";

// KST 변환 유틸
const utcToKST = (utcStr: string) => {
  if (!utcStr) return "—";
  const d = new Date(new Date(utcStr).toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }));
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
};

type DeletedWo = {
  id: string;
  original_id: string;
  work_order_no: string;
  snapshot: Record<string, any>;
  items_snapshot: Record<string, any>[];
  deleted_by: string | null;
  deleted_by_name: string | null;
  deleted_at: string;
  restored_at: string | null;
  restored_by: string | null;
  restored_by_name: string | null;
};

type Props = { role: string };

export default function DeletedClient({ role }: Props) {
  const [list, setList] = useState<DeletedWo[]>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [filterSearch, setFilterSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"전체" | "삭제됨" | "복원됨">("삭제됨");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [employees, setEmployees] = useState<{ id: string; name: string; pin: string | null }[]>([]);
  const [showRestorePinModal, setShowRestorePinModal] = useState(false);
  const [restoreTargetId, setRestoreTargetId] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);
  const currentUserIdRef = useRef<string | null>(null);

  function showToast(msg: string, type: "success" | "error" = "success") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      currentUserIdRef.current = user?.id ?? null;
    });
    supabase.from("employees").select("id,name,pin,resign_date").is("resign_date", null).order("name").limit(500).then(({ data }) => {
        if (data) setEmployees(data.filter((e): e is { id: string; name: string; pin: string | null; resign_date: null } => e.name !== null));
    });
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      let q = supabase
        .from("deleted_work_orders")
        .select("*")
        .order("deleted_at", { ascending: false })
        .limit(200);

      if (filterStatus === "삭제됨") q = q.is("restored_at", null);
      if (filterStatus === "복원됨") q = q.not("restored_at", "is", null);
      if (filterDateFrom) q = q.gte("deleted_at", `${filterDateFrom}T00:00:00+09:00`);
      if (filterDateTo)   q = q.lte("deleted_at", `${filterDateTo}T23:59:59+09:00`);

      const { data, error } = await q;
      if (error) { showToast("❌ 목록 조회 실패: " + error.message, "error"); return; }
      setList((data ?? []) as DeletedWo[]);
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterDateFrom, filterDateTo]);

  useEffect(() => { loadList(); }, [loadList]);

  const filteredList = useMemo(() => {
    const q = filterSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter((d) =>
      d.work_order_no?.toLowerCase().includes(q) ||
      d.snapshot?.client_name?.toLowerCase().includes(q) ||
      d.snapshot?.product_name?.toLowerCase().includes(q) ||
      d.deleted_by_name?.toLowerCase().includes(q)
    );
  }, [list, filterSearch]);

  function handleRestoreClick(id: string) {
    setRestoreTargetId(id);
    setShowRestorePinModal(true);
  }

  async function restoreWo(deletedId: string, pinName: string) {
    setRestoring(deletedId);
    try {
      // 1. 백업 데이터 조회
      const { data: backup, error: fetchErr } = await supabase
        .from("deleted_work_orders")
        .select("*")
        .eq("id", deletedId)
        .single();
      if (fetchErr || !backup) {
        showToast("❌ 백업 데이터 조회 실패", "error");
        return;
      }

      // 2. 이미 복원됐는지 확인
      if (backup.restored_at) {
        showToast("❌ 이미 복원된 작업지시서입니다.", "error");
        return;
      }

      // 3. work_orders 복원 (original_id로 재insert)
      const snapshot = { ...backup.snapshot };
      // DB 자동 관리 컬럼 제거
      delete snapshot.created_at;
      delete snapshot.updated_at;
      // original_id 복원
      snapshot.id = backup.original_id;

      const { error: woErr } = await supabase
        .from("work_orders")
        .insert(snapshot);
      if (woErr) {
        showToast("❌ 작업지시서 복원 실패: " + woErr.message, "error");
        return;
      }

      // 4. work_order_items 복원
      const items = (backup.items_snapshot ?? []).map((item: any) => {
        const i = { ...item };
        delete i.created_at;
        delete i.updated_at;
        return i;
      });
      if (items.length > 0) {
        const { error: itemErr } = await supabase
          .from("work_order_items")
          .insert(items);
        if (itemErr) {
          showToast("⚠️ 작업지시서는 복원됐으나 items 복원 실패: " + itemErr.message, "error");
        }
      }

      // 5. deleted_work_order_nos에서 번호 제거
      if (backup.work_order_no) {
        await supabase
          .from("deleted_work_order_nos")
          .delete()
          .eq("work_order_no", backup.work_order_no);
      }

      // 6. 복원 이력 기록
      const { error: updateErr } = await supabase
        .from("deleted_work_orders")
        .update({
          restored_at:       new Date().toISOString(),
          restored_by:       currentUserIdRef.current,
          restored_by_name:  pinName,
        })
        .eq("id", deletedId);
      if (updateErr) {
        showToast("⚠️ 복원은 됐으나 이력 기록 실패: " + updateErr.message, "error");
      }

      showToast("✅ 복원 완료! 작업지시서 목록에서 확인하세요.");
      await loadList();
    } catch (e: any) {
      showToast("❌ 복원 오류: " + (e?.message ?? e), "error");
    } finally {
      setRestoring(null);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="mx-auto max-w-[900px] space-y-4">

        {toast && (
          <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] rounded-2xl border px-5 py-3 text-sm font-semibold shadow-xl ${toast.type === "success" ? "border-green-300 bg-green-600 text-white" : "border-red-300 bg-red-600 text-white"}`}>
            {toast.msg}
          </div>
        )}

        {showRestorePinModal && (
          <PinModal
            employees={employees}
            title="작업지시서 복원 — 본인 확인"
            onSuccess={(empId, empName) => {
              setShowRestorePinModal(false);
              if (restoreTargetId) {
                restoreWo(restoreTargetId, empName);
                setRestoreTargetId(null);
              }
            }}
            onCancel={() => {
              setShowRestorePinModal(false);
              setRestoreTargetId(null);
            }}
          />
        )}

        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-800">🗑️ 삭제된 작업지시서</h1>
            <div className="mt-0.5 text-xs text-slate-500">삭제 이력 조회 · 복원 — {role}</div>
          </div>
          <div className="flex items-center gap-2">
            <a href="/production" className={btn}>← 작업지시서로</a>
            <button className={btn} onClick={loadList}>🔄 새로고침</button>
          </div>
        </div>

        {/* 필터 */}
        <div className={`${card} p-4 space-y-3`}>
          <input
            className={inp}
            placeholder="작업지시서번호 / 거래처명 / 제품명 / 삭제자 검색"
            value={filterSearch}
            onChange={(e) => setFilterSearch(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            {(["전체", "삭제됨", "복원됨"] as const).map((s) => (
              <button key={s} className={filterStatus === s ? btnOn : btn} onClick={() => setFilterStatus(s)}>
                {s}
                <span className={`ml-1 text-xs tabular-nums ${filterStatus === s ? "opacity-80" : "text-slate-400"}`}>
                  {s === "전체" ? list.length : s === "삭제됨" ? list.filter((d) => !d.restored_at).length : list.filter((d) => d.restored_at).length}
                </span>
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="mb-1 text-xs text-slate-500">삭제일 From</div>
              <input type="date" className={inp} value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} />
            </div>
            <div>
              <div className="mb-1 text-xs text-slate-500">삭제일 To</div>
              <input type="date" className={inp} value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} />
            </div>
          </div>
        </div>

        {/* 목록 */}
        {loading ? (
          <div className="py-12 text-center text-sm text-slate-400">불러오는 중...</div>
        ) : filteredList.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400">조건에 맞는 삭제 내역이 없습니다.</div>
        ) : (
          <div className="space-y-3">
            {filteredList.map((d) => {
              const snap = d.snapshot ?? {};
              const isRestored = !!d.restored_at;
              const isRestoringThis = restoring === d.id;
              const totalOrder = (d.items_snapshot ?? []).reduce((s: number, i: any) => s + (i.order_qty ?? 0), 0);

              return (
                <div key={d.id} className={`${card} p-4`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">

                      {/* 상태 뱃지 + 번호 */}
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${isRestored ? "bg-green-100 border-green-200 text-green-700" : "bg-red-100 border-red-200 text-red-600"}`}>
                          {isRestored ? "🟢 복원됨" : "🔴 삭제됨"}
                        </span>
                        <span className="text-xs font-mono text-slate-400">{d.work_order_no}</span>
                        {snap.order_type === "재고" && (
                          <span className="rounded-full bg-emerald-100 border border-emerald-200 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">재고</span>
                        )}
                      </div>

                      {/* 거래처 · 제품명 */}
                      <div className="font-semibold text-slate-800">{snap.client_name ?? "—"}</div>
                      <div className="text-sm text-slate-600 mt-0.5">{snap.product_name ?? "—"}</div>

                      {/* 메타 정보 */}
                      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-400">
                        {snap.order_date && <span>주문일 {snap.order_date}</span>}
                        {totalOrder > 0 && <span>수량 {totalOrder.toLocaleString()}개</span>}
                        {snap.food_type && <span>{snap.food_type}</span>}
                        {snap.status && (
                          <span className={`font-semibold ${snap.status === "완료" ? "text-green-600" : "text-orange-500"}`}>
                            {snap.status}
                          </span>
                        )}
                      </div>

                      {/* 삭제 이력 */}
                      <div className="mt-2.5 space-y-1">
                        <div className="flex items-center gap-1.5 text-xs text-red-500">
                          <span>🗑️</span>
                          <span className="font-semibold">{d.deleted_by_name ?? "알 수 없음"}</span>
                          <span className="text-slate-400">·</span>
                          <span className="text-slate-400">{utcToKST(d.deleted_at)} 삭제</span>
                        </div>
                        {isRestored && (
                          <div className="flex items-center gap-1.5 text-xs text-green-600">
                            <span>♻️</span>
                            <span className="font-semibold">{d.restored_by_name ?? "알 수 없음"}</span>
                            <span className="text-slate-400">·</span>
                            <span className="text-slate-400">{utcToKST(d.restored_at!)} 복원</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 복원 버튼 */}
                    {!isRestored && (
                      <button
                        className="shrink-0 rounded-xl border border-blue-400 bg-blue-50 px-4 py-2 text-sm font-bold text-blue-700 hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={isRestoringThis}
                        onClick={() => handleRestoreClick(d.id)}
                      >
                        {isRestoringThis ? "⏳ 복원 중..." : "♻️ 복원하기 🔑"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}