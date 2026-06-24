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

type PinModalState = {
  open: boolean;
  selectedEmp: { id: string; name: string; pin: string | null } | null;
  pinInput: string;
  pinError: string;
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

  // employees (PIN 검증용)
  const [employees, setEmployees] = useState<{ id: string; name: string; pin: string | null }[]>([]);

  // PIN 모달
  const [pinModal, setPinModal] = useState<PinModalState>({
    open: false, selectedEmp: null, pinInput: "", pinError: "",
  });

  // 복원 대상
  const [restoreTarget, setRestoreTarget] = useState<DiscardRow | null>(null);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data?.user) return;
      const { data: rd } = await supabase
        .from("user_roles").select("role").eq("user_id", data.user.id).maybeSingle();
      setRole(rd?.role ?? "USER");
    });
    // employees 로드
    supabase.from("employees").select("id,name,pin")
      .is("resign_date", null).order("name")
      .then(({ data }) => {
        const sorted = (data ?? [])
          .filter((e: any) => !["강미라"].includes(e.name))
          .sort((a: any, b: any) => (a.name ?? "").localeCompare(b.name ?? "", "ko"));
        setEmployees(sorted as any);
      });
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setMsg(null);

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
      const lot     = m.lot;
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

  const totalQty = filteredRows.reduce((s, r) => s + r.qty, 0);

  const isAdmin    = role === "ADMIN";
  const isSubAdmin = role === "SUBADMIN";
  const canRestore = isAdmin || isSubAdmin;

  // ── PIN 모달 열기 ──
  function openPinForRestore(row: DiscardRow) {
    setRestoreTarget(row);
    setPinModal({ open: true, selectedEmp: null, pinInput: "", pinError: "" });
  }

  function handlePinDigit(digit: string) {
    if (pinModal.pinInput.length >= 4) return;
    const next = pinModal.pinInput + digit;
    setPinModal((prev) => ({ ...prev, pinInput: next, pinError: "" }));
    if (next.length === 4) setTimeout(() => verifyPin(next), 100);
  }

  function verifyPin(pin: string) {
    const emp = pinModal.selectedEmp;
    if (!emp) return;
    if (!emp.pin) {
      setPinModal((prev) => ({ ...prev, pinError: "PIN이 설정되지 않았습니다.", pinInput: "" }));
      return;
    }
    if (emp.pin !== pin) {
      setPinModal((prev) => ({ ...prev, pinError: "PIN이 올바르지 않습니다.", pinInput: "" }));
      return;
    }
    // 인증 성공
    setPinModal({ open: false, selectedEmp: null, pinInput: "", pinError: "" });
    if (restoreTarget) doRestore(restoreTarget);
  }

  async function doRestore(row: DiscardRow) {
    setRestoring(true);
    const { error } = await supabase.from("movements").delete().eq("id", row.id);
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

  return (
    <div className="min-h-screen bg-white text-black p-6">

      {/* ── PIN 모달 ── */}
      {pinModal.open && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl p-6">
            {!pinModal.selectedEmp ? (
              <>
                <div className="mb-4 font-bold text-base text-slate-700 text-center">
                  📦 복원 — 작업자 선택
                </div>
                {restoreTarget && (
                  <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                    <div className="font-semibold">{restoreTarget.product_name}</div>
                    <div className="mt-0.5">폐기일 {restoreTarget.happened_kst} · {fmt(restoreTarget.qty)} EA</div>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2 mb-4">
                  {employees.map((emp) => (
                    <button key={emp.id}
                      className="rounded-xl border-2 border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-700 hover:border-blue-300 hover:bg-blue-50 active:scale-95 transition-all text-center"
                      onClick={() => setPinModal((prev) => ({ ...prev, selectedEmp: emp, pinInput: "", pinError: "" }))}>
                      {emp.name}
                      <div className="text-[10px] font-normal text-slate-400 mt-0.5">
                        {emp.pin ? "PIN 설정됨" : "PIN 미설정"}
                      </div>
                    </button>
                  ))}
                </div>
                <button
                  className="w-full text-xs text-slate-400 hover:text-slate-600"
                  onClick={() => { setPinModal({ open: false, selectedEmp: null, pinInput: "", pinError: "" }); setRestoreTarget(null); }}>
                  취소
                </button>
              </>
            ) : (
              <>
                <button
                  className="mb-4 text-xs text-slate-400 hover:text-slate-600"
                  onClick={() => setPinModal((prev) => ({ ...prev, selectedEmp: null, pinInput: "", pinError: "" }))}>
                  ← 작업자 선택으로
                </button>
                <div className="mb-1 font-semibold text-base text-slate-700 text-center">{pinModal.selectedEmp.name}</div>
                <div className="mb-4 text-sm text-slate-500 text-center">PIN 4자리를 입력하세요</div>
                <div className="flex justify-center gap-3 mb-4">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className={`w-10 h-10 rounded-xl border-2 flex items-center justify-center text-lg font-bold transition-all
                      ${pinModal.pinInput.length > i ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 bg-slate-50 text-slate-300"}`}>
                      {pinModal.pinInput.length > i ? "●" : "○"}
                    </div>
                  ))}
                </div>
                {pinModal.pinError && (
                  <div className="mb-3 text-center text-xs text-red-500">{pinModal.pinError}</div>
                )}
                <div className="grid grid-cols-3 gap-2">
                  {["1","2","3","4","5","6","7","8","9","","0","⌫"].map((d, i) => (
                    <button key={i}
                      className={`rounded-xl border py-3 text-lg font-semibold transition-all
                        ${d === "" ? "invisible" : "border-slate-200 bg-white hover:bg-slate-50 active:bg-slate-100 active:scale-95"}`}
                      onClick={() => {
                        if (d === "⌫") setPinModal((prev) => ({ ...prev, pinInput: prev.pinInput.slice(0, -1), pinError: "" }));
                        else if (d !== "") handlePinDigit(d);
                      }}>
                      {d}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── 헤더 ── */}
      <h1 className="text-2xl font-semibold mb-6">폐기 목록</h1>

      {/* ── 필터 ── */}
      <div className="flex flex-wrap items-end gap-3 mb-6">
        <div>
          <label className="text-sm text-black/70">시작일</label>
          <input type="date"
            className="mt-1 block w-44 rounded-xl border border-black/15 bg-white px-3 py-2 text-sm outline-none font-mono"
            value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </div>
        <div>
          <label className="text-sm text-black/70">종료일</label>
          <input type="date"
            className="mt-1 block w-44 rounded-xl border border-black/15 bg-white px-3 py-2 text-sm outline-none font-mono"
            value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </div>
        <button
          className="rounded-xl bg-blue-600 text-white px-4 py-2 font-medium disabled:opacity-60 hover:bg-blue-700"
          disabled={loading} onClick={loadData}>
          {loading ? "조회 중..." : "조회"}
        </button>
        <div className="relative w-44">
          <input
            className="w-full rounded-xl border border-black/15 bg-white px-3 py-2 pr-7 text-sm outline-none focus:border-blue-400"
            placeholder="제품명 또는 바코드"
            value={searchKeyword} onChange={(e) => setSearchKeyword(e.target.value)} />
          {searchKeyword && (
            <button
              className="absolute right-2 top-1/2 -translate-y-1/2 text-black/30 hover:text-black/60"
              onClick={() => setSearchKeyword("")}>✕</button>
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
              {canRestore && <th className="p-3 text-center">복원</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="p-3 text-black/40" colSpan={canRestore ? 7 : 6}>조회 중...</td></tr>
            ) : filteredRows.length === 0 ? (
              <tr><td className="p-3 text-black/40" colSpan={canRestore ? 7 : 6}>데이터가 없습니다.</td></tr>
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
                  {canRestore && (
                    <td className="p-3 text-center">
                      <button
                        className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100"
                        onClick={() => openPinForRestore(r)}>
                        복원
                      </button>
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
                <td className="p-3 text-right tabular-nums font-bold text-red-600">{fmt(totalQty)} EA</td>
                <td colSpan={canRestore ? 2 : 1} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <div className="mt-2 text-xs text-black/40">
        ※ 복원 시 해당 DISCARD 기록이 삭제되어 재고가 회복됩니다. USER PIN 인증이 필요합니다.
      </div>

      {/* 복원 중 오버레이 */}
      {restoring && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/30">
          <div className="rounded-2xl bg-white px-8 py-6 text-sm font-semibold text-slate-700 shadow-xl">
            복원 처리 중...
          </div>
        </div>
      )}
    </div>
  );
}
