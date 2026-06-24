"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

const supabase = createClient();

const nf = new Intl.NumberFormat("ko-KR");
const fmt = (n: number) => nf.format(Math.max(0, Math.floor(n)));

function utcToKSTDate(utcStr: string) {
  const d = new Date(new Date(utcStr).toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function todayKST() {
  const d = new Date(new Date().toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type DiscardRow = {
  id: string;
  lot_id: string;
  qty: number;
  happened_at: string;
  note: string | null;
  created_at: string;
  created_by: string | null;
  expiry_date: string;
  variant_id: string;
  product_name: string;
  barcode: string;
  food_type: string | null;
  happened_kst: string;
};

export default function DiscardClient() {
  const [role, setRole] = useState<string | null>(null);
  const [rows, setRows] = useState<DiscardRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // 필터
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date(new Date().toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }));
    d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [toDate, setToDate] = useState(todayKST);
  const [searchKeyword, setSearchKeyword] = useState("");

  // 복원 확인 모달
  const [restoreTarget, setRestoreTarget] = useState<DiscardRow | null>(null);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data?.user) return;
      const { data: rd } = await supabase
        .from("user_roles").select("role").eq("user_id", data.user.id).maybeSingle();
      setRole(rd?.role ?? "USER");
    });
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setMsg(null);

    // happened_at 기준 KST 날짜 필터
    const fromUTC = `${fromDate}T00:00:00+09:00`;
    const toUTC   = `${toDate}T23:59:59+09:00`;

    const { data, error } = await supabase
      .from("movements")
      .select(`
        id, lot_id, qty, happened_at, note, created_at, created_by,
        lot:lots(
          expiry_date,
          variant_id,
          variant:product_variants(
            barcode,
            variant_name,
            product:products(food_type)
          )
        )
      `)
      .eq("type", "DISCARD")
      .gte("happened_at", fromUTC)
      .lte("happened_at", toUTC)
      .order("happened_at", { ascending: false });

    if (error) {
      setMsg("조회 오류: " + error.message);
      setLoading(false);
      return;
    }

    const mapped: DiscardRow[] = (data ?? []).map((m: any) => {
      const lot = m.lot;
      const variant = lot?.variant;
      const product = variant?.product;
      return {
        id:           m.id,
        lot_id:       m.lot_id,
        qty:          m.qty,
        happened_at:  m.happened_at,
        note:         m.note ?? null,
        created_at:   m.created_at,
        created_by:   m.created_by ?? null,
        expiry_date:  lot?.expiry_date ?? "—",
        variant_id:   lot?.variant_id ?? "",
        product_name: variant?.variant_name ?? "—",
        barcode:      variant?.barcode ?? "—",
        food_type:    product?.food_type ?? null,
        happened_kst: utcToKSTDate(m.happened_at),
      };
    });

    setRows(mapped);
    setMsg(`조회 완료 ✅ ${mapped.length}건 (${fromDate} ~ ${toDate})`);
    setLoading(false);
  }, [fromDate, toDate]);

  useEffect(() => { loadData(); }, [loadData]);

  const filteredRows = useMemo(() => {
    if (!searchKeyword.trim()) return rows;
    const k = searchKeyword.trim().toLowerCase();
    return rows.filter((r) =>
      r.product_name.toLowerCase().includes(k) ||
      r.barcode.toLowerCase().includes(k)
    );
  }, [rows, searchKeyword]);

  // 총계
  const totalQty = filteredRows.reduce((s, r) => s + r.qty, 0);

  async function doRestore(row: DiscardRow) {
    setRestoring(true);
    const { error } = await supabase
      .from("movements")
      .delete()
      .eq("id", row.id);
    setRestoring(false);
    if (error) {
      setMsg("복원 실패: " + error.message);
      setRestoreTarget(null);
      return;
    }
    setMsg(`✅ 복원 완료 — ${row.product_name} ${fmt(row.qty)} EA`);
    setRestoreTarget(null);
    await loadData();
  }

  const isAdmin = role === "ADMIN";

  return (
    <div className="min-h-screen bg-white text-black p-6">

      {/* ── 복원 확인 모달 ── */}
      {restoreTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-black/10 bg-white shadow-xl">
            <div className="border-b border-black/10 px-5 py-4">
              <div className="font-semibold text-slate-800">📦 폐기 복원</div>
            </div>
            <div className="px-5 py-4 space-y-2">
              <div className="text-sm font-medium text-slate-700">{restoreTarget.product_name}</div>
              <div className="flex gap-4 text-xs text-slate-500">
                <span>폐기일: <b className="text-slate-700">{restoreTarget.happened_kst}</b></span>
                <span>수량: <b className="text-slate-700">{fmt(restoreTarget.qty)} EA</b></span>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                ⚠ DISCARD 기록이 삭제되어 해당 수량이 재고로 복구됩니다.
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-black/10 px-5 py-3">
              <button
                className="rounded-xl border border-black/15 px-4 py-2 text-sm hover:bg-black/5"
                onClick={() => setRestoreTarget(null)}
                disabled={restoring}
              >취소</button>
              <button
                className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-60"
                onClick={() => doRestore(restoreTarget)}
                disabled={restoring}
              >{restoring ? "처리 중..." : "복원 확인"}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 헤더 ── */}
      <h1 className="text-2xl font-semibold mb-6">폐기 목록</h1>

      {/* ── 필터 ── */}
      <div className="flex flex-wrap items-end gap-3 mb-6">
        <div>
          <label className="text-sm text-black/70">시작일</label>
          <input
            type="date"
            className="mt-1 block w-44 rounded-xl border border-black/15 bg-white px-3 py-2 text-sm outline-none font-mono"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
          />
        </div>
        <div>
          <label className="text-sm text-black/70">종료일</label>
          <input
            type="date"
            className="mt-1 block w-44 rounded-xl border border-black/15 bg-white px-3 py-2 text-sm outline-none font-mono"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
          />
        </div>
        <button
          className="rounded-xl bg-blue-600 text-white px-4 py-2 font-medium disabled:opacity-60 hover:bg-blue-700"
          disabled={loading}
          onClick={loadData}
        >
          {loading ? "조회 중..." : "조회"}
        </button>

        {/* 검색 */}
        <div className="relative w-44">
          <input
            className="w-full rounded-xl border border-black/15 bg-white px-3 py-2 pr-7 text-sm outline-none focus:border-blue-400"
            placeholder="제품명 또는 바코드"
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
          />
          {searchKeyword && (
            <button
              className="absolute right-2 top-1/2 -translate-y-1/2 text-black/30 hover:text-black/60"
              onClick={() => setSearchKeyword("")}
            >✕</button>
          )}
        </div>

        {msg && (
          <div className={`text-sm ${msg.startsWith("✅") ? "text-green-700" : "text-red-600"}`}>
            {msg}
          </div>
        )}
      </div>

      {/* ── 요약 ── */}
      {filteredRows.length > 0 && (
        <div className="mb-4 flex gap-4">
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5">
            <div className="text-xs text-red-500 mb-0.5">총 폐기 건수</div>
            <div className="text-lg font-bold text-red-700">{filteredRows.length}건</div>
          </div>
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5">
            <div className="text-xs text-red-500 mb-0.5">총 폐기 수량</div>
            <div className="text-lg font-bold text-red-700">{fmt(totalQty)} EA</div>
          </div>
        </div>
      )}

      {/* ── 테이블 ── */}
      <div className="rounded-2xl border border-black/10 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-black/5">
            <tr>
              <th className="p-3 text-left">폐기일</th>
              <th className="p-3 text-left">제품명</th>
              <th className="p-3 text-left">식품유형</th>
              <th className="p-3 text-left">소비기한</th>
              <th className="p-3 text-right">수량</th>
              <th className="p-3 text-left">비고</th>
              {isAdmin && <th className="p-3 text-center">복원</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="p-3 text-black/40" colSpan={isAdmin ? 7 : 6}>조회 중...</td>
              </tr>
            ) : filteredRows.length === 0 ? (
              <tr>
                <td className="p-3 text-black/40" colSpan={isAdmin ? 7 : 6}>
                  데이터가 없습니다.
                </td>
              </tr>
            ) : (
              filteredRows.map((r) => (
                <tr key={r.id} className="border-t border-black/10 hover:bg-black/[0.02]">
                  <td className="p-3 font-mono text-sm">{r.happened_kst}</td>
                  <td className="p-3 font-medium">{r.product_name}</td>
                  <td className="p-3 text-black/60 text-xs">{r.food_type ?? "—"}</td>
                  <td className="p-3 font-mono text-sm">{r.expiry_date}</td>
                  <td className="p-3 text-right tabular-nums font-semibold text-red-600">
                    {fmt(r.qty)} EA
                  </td>
                  <td className="p-3 text-xs text-black/50 max-w-[200px] truncate" title={r.note ?? ""}>
                    {r.note ?? "—"}
                  </td>
                  {isAdmin && (
                    <td className="p-3 text-center">
                      <button
                        className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100"
                        onClick={() => setRestoreTarget(r)}
                      >복원</button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
          {filteredRows.length > 0 && (
            <tfoot className="bg-black/5">
              <tr className="border-t border-black/10">
                <td className="p-3 font-semibold" colSpan={4}>합계</td>
                <td className="p-3 text-right tabular-nums font-bold text-red-600">
                  {fmt(totalQty)} EA
                </td>
                <td colSpan={isAdmin ? 2 : 1} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <div className="mt-2 text-xs text-black/40">
        ※ 복원은 ADMIN만 가능합니다. 복원 시 해당 DISCARD 기록이 삭제되어 재고가 회복됩니다.
      </div>
    </div>
  );
}
