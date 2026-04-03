"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

const supabase = createClient();

// ─────────────────────── Styles ───────────────────────
const card = "rounded-2xl border border-slate-200 bg-white shadow-sm";
const inp = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:outline-none";
const inpR = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-right tabular-nums focus:border-blue-400 focus:outline-none";
const btn = "rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50 active:bg-slate-100";
const btnOn = "rounded-xl border border-blue-500 bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700";
const btnSm = "rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium hover:bg-slate-50";

type UserRole = "ADMIN" | "SUBADMIN" | "USER" | null;

type Tab = "production" | "material" | "work";

// ─────────────────────── 생산일지 Types ───────────────────────
type ProductionLog = {
  id: string;
  log_date: string;
  work_type: string;
  work_name: string | null;
  quantity: number | null;
  defect_qty: number | null;
  work_start: string | null;
  work_end: string | null;
  note: string | null;
  created_by: string | null;
  confirmed_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  formula?: { name: string } | null;
  creator?: { name: string } | null;
  confirmer?: { name: string } | null;
  approver?: { name: string } | null;
};

type Formula = { id: string; name: string; work_type: string };
type Employee = { id: string; name: string | null };

const WORK_TYPE_LABELS: Record<string, string> = {
  product:       "① 준초콜릿/당류가공품",
  jeonsa:        "② 전사지 생산",
  pigment:       "③ 색소 배합",
  pet_coating:   "④ PET 코팅",
  pet_spray:     "⑤ PET 분사",
  guar:          "⑥ 구아검 배합",
  raize_pigment: "레이즈 색소 배합",
};

// ─────────────────────── 원료수불부 Types ───────────────────────
type MaterialStock = {
  material_id: string;
  material_name: string;
  category: string;
  unit: string;
  total_received: number;
  total_used: number;
  total_disposed: number;
  current_stock: number;
  is_below_safety_stock: boolean;
};

type MaterialReceipt = {
  id: string;
  received_date: string;
  material_id: string;
  quantity: number;
  unit: string;
  expiry_date: string | null;
  supplier: string | null;
  note: string | null;
  material?: { name: string } | null;
};

// ─────────────────────── 근무일지 Types ───────────────────────
type WorkLog = {
  id: string;
  log_date: string;
  worker_id: string | null;
  worker_name: string;
  clock_in: string | null;
  clock_out: string | null;
  production_summary: string | null;
  instruction: string | null;
  extra_work: string | null;
  note: string | null;
  created_by: string | null;
  confirmed_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  creator?: { name: string } | null;
  confirmer?: { name: string } | null;
  approver?: { name: string } | null;
};

// ─────────────────────── Main Component ───────────────────────
export default function ProductionLogPage() {
  const [role, setRole] = useState<UserRole>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("production");
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const isAdmin = role === "ADMIN";
  const isAdminOrSubadmin = role === "ADMIN" || role === "SUBADMIN";

  function showToast(msg: string, type: "success" | "error" = "success") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2500);
  }

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      const { data } = await supabase
        .from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
      setRole((data?.role as UserRole) ?? "USER");
    })();
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="mx-auto max-w-[1400px] space-y-4">

        {/* 헤더 */}
        <div>
          <h1 className="text-xl font-bold text-slate-800">📋 생산관리</h1>
          <div className="mt-0.5 text-xs text-slate-500">생산일지 · 원료수불부 · 근무일지</div>
        </div>

        {/* 탭 */}
        <div className="flex gap-2">
          {([
            { key: "production", label: "📝 생산일지" },
            { key: "material",   label: "🧪 원료수불부" },
            { key: "work",       label: "👷 근무일지" },
          ] as { key: Tab; label: string }[]).map((t) => (
            <button key={t.key}
              className={activeTab === t.key ? btnOn : btn}
              onClick={() => setActiveTab(t.key)}
            >{t.label}</button>
          ))}
        </div>

        {/* 탭 컨텐츠 */}
        {activeTab === "production" && (
          <ProductionLogTab role={role} userId={userId} showToast={showToast} />
        )}
        {activeTab === "material" && (
          <MaterialLedgerTab role={role} userId={userId} showToast={showToast} />
        )}
        {activeTab === "work" && (
          <WorkLogTab role={role} userId={userId} showToast={showToast} />
        )}

        {/* 토스트 */}
        {toast && (
          <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] rounded-2xl border px-5 py-3 text-sm font-semibold shadow-xl
            ${toast.type === "success" ? "border-green-300 bg-green-600 text-white" : "border-red-300 bg-red-600 text-white"}`}>
            {toast.msg}
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 탭 1: 생산일지
// ═══════════════════════════════════════════════════════════
function ProductionLogTab({ role, userId, showToast }: {
  role: UserRole; userId: string | null;
  showToast: (msg: string, type?: "success" | "error") => void;
}) {
  const isAdminOrSubadmin = role === "ADMIN" || role === "SUBADMIN";
  const isAdmin = role === "ADMIN";

  const [logs, setLogs] = useState<ProductionLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterDate, setFilterDate] = useState(new Date().toISOString().slice(0, 10));
  const [filterWorkType, setFilterWorkType] = useState("전체");
  const [formulas, setFormulas] = useState<Formula[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);
  const [showForm, setShowForm] = useState(false);

  // 폼 state
  const [fDate, setFDate] = useState(new Date().toISOString().slice(0, 10));
  const [fWorkType, setFWorkType] = useState("product");
  const [fFormulaId, setFFormulaId] = useState("");
  const [fWorkName, setFWorkName] = useState("");
  const [fQty, setFQty] = useState("");
  const [fDefectQty, setFDefectQty] = useState("");
  const [fStart, setFStart] = useState("");
  const [fEnd, setFEnd] = useState("");
  const [fNote, setFNote] = useState("");
  const [saving, setSaving] = useState(false);

  const filteredFormulas = useMemo(() =>
    formulas.filter((f) => fWorkType === "전체" || f.work_type === fWorkType),
    [formulas, fWorkType]
  );

  const loadLogs = useCallback(async () => {
    setLoading(true);
    let q = supabase.from("production_logs")
      .select(`id, log_date, work_type, work_name, quantity, defect_qty,
        work_start, work_end, note, created_by, confirmed_by, approved_by, approved_at, created_at,
        formula:product_formulas(name),
        creator:users!created_by(name),
        confirmer:users!confirmed_by(name),
        approver:users!approved_by(name)`)
      .eq("log_date", filterDate)
      .order("created_at", { ascending: false });
    if (filterWorkType !== "전체") q = q.eq("work_type", filterWorkType);
    const { data } = await q;
    setLogs((data ?? []) as unknown as ProductionLog[]);
    setLoading(false);
  }, [filterDate, filterWorkType]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  useEffect(() => {
    supabase.from("product_formulas").select("id,name,work_type").order("name")
      .then(({ data }) => setFormulas(data ?? []));
    supabase.from("employees").select("id,name").is("resign_date", null).order("name")
      .then(({ data }) => setEmployees(data ?? []));
    supabase.from("users").select("id,name").order("name")
      .then(({ data }) => setUsers(data ?? []));
  }, []);

  async function saveLog() {
    if (!fDate) return showToast("날짜를 선택하세요.", "error");
    setSaving(true);
    const { error } = await supabase.from("production_logs").insert({
      log_date: fDate,
      work_type: fWorkType,
      formula_id: fFormulaId || null,
      work_name: fWorkName.trim() || null,
      quantity: fQty ? Number(fQty) : null,
      defect_qty: fDefectQty ? Number(fDefectQty) : null,
      work_start: fStart || null,
      work_end: fEnd || null,
      note: fNote.trim() || null,
      created_by: userId,
    });
    setSaving(false);
    if (error) return showToast("저장 실패: " + error.message, "error");
    showToast("✅ 생산일지 등록 완료!");
    setShowForm(false);
    setFQty(""); setFDefectQty(""); setFStart(""); setFEnd(""); setFNote(""); setFFormulaId(""); setFWorkName("");
    loadLogs();
  }

  async function approveLog(logId: string, step: "confirm" | "approve") {
    const field = step === "confirm" ? { confirmed_by: userId } : { approved_by: userId, approved_at: new Date().toISOString() };
    const { error } = await supabase.from("production_logs").update(field).eq("id", logId);
    if (error) return showToast("처리 실패: " + error.message, "error");
    showToast(step === "confirm" ? "✅ 확인 완료!" : "✅ 승인 완료!");
    loadLogs();
  }

  return (
    <div className="space-y-4">
      {/* 필터 + 등록 버튼 */}
      <div className={`${card} p-4`}>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <div className="mb-1 text-xs text-slate-500">날짜</div>
            <input type="date" className={inp} style={{ width: 160 }} value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)} />
          </div>
          <div>
            <div className="mb-1 text-xs text-slate-500">작업유형</div>
            <select className={inp} style={{ width: 200 }} value={filterWorkType}
              onChange={(e) => setFilterWorkType(e.target.value)}>
              <option value="전체">전체</option>
              {Object.entries(WORK_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <button className={btn} onClick={loadLogs}>🔄 조회</button>
          {isAdminOrSubadmin && (
            <button
              className={showForm ? btnOn : "rounded-xl border border-blue-300 bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-700 hover:bg-blue-100"}
              onClick={() => setShowForm((v) => !v)}
            >
              {showForm ? "✕ 닫기" : "✚ 생산일지 등록"}
            </button>
          )}
          <button className={btnSm} onClick={() => window.print()}>🖨️ 인쇄</button>
        </div>
      </div>

      {/* 등록 폼 */}
      {showForm && isAdminOrSubadmin && (
        <div className={`${card} p-4`}>
          <div className="mb-3 font-semibold text-sm text-blue-700">✚ 생산일지 신규 등록</div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div>
              <div className="mb-1 text-xs text-slate-500">날짜 *</div>
              <input type="date" className={inp} value={fDate} onChange={(e) => setFDate(e.target.value)} />
            </div>
            <div>
              <div className="mb-1 text-xs text-slate-500">작업유형 *</div>
              <select className={inp} value={fWorkType} onChange={(e) => { setFWorkType(e.target.value); setFFormulaId(""); }}>
                {Object.entries(WORK_TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <div className="mb-1 text-xs text-slate-500">배합설명서</div>
              <select className={inp} value={fFormulaId} onChange={(e) => setFFormulaId(e.target.value)}>
                <option value="">— 선택 —</option>
                {filteredFormulas.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>
            <div>
              <div className="mb-1 text-xs text-slate-500">작업명 (배합설명서 미선택 시)</div>
              <input className={inp} value={fWorkName} onChange={(e) => setFWorkName(e.target.value)}
                placeholder="예: 다크컴파운드 생산" />
            </div>
            <div>
              <div className="mb-1 text-xs text-slate-500">생산수량</div>
              <input className={inpR} inputMode="numeric" value={fQty}
                onChange={(e) => setFQty(e.target.value.replace(/[^\d]/g, ""))} placeholder="g 또는 개" />
            </div>
            <div>
              <div className="mb-1 text-xs text-slate-500">불량수량</div>
              <input className={inpR} inputMode="numeric" value={fDefectQty}
                onChange={(e) => setFDefectQty(e.target.value.replace(/[^\d]/g, ""))} placeholder="전사지·PET만" />
            </div>
            <div>
              <div className="mb-1 text-xs text-slate-500">작업시작</div>
              <input type="time" className={inp} value={fStart} onChange={(e) => setFStart(e.target.value)} />
            </div>
            <div>
              <div className="mb-1 text-xs text-slate-500">작업종료</div>
              <input type="time" className={inp} value={fEnd} onChange={(e) => setFEnd(e.target.value)} />
            </div>
            <div>
              <div className="mb-1 text-xs text-slate-500">비고</div>
              <input className={inp} value={fNote} onChange={(e) => setFNote(e.target.value)} />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60"
              disabled={saving} onClick={saveLog}
            >
              {saving ? "저장 중..." : "💾 등록"}
            </button>
            <button className={btn} onClick={() => setShowForm(false)}>취소</button>
          </div>
        </div>
      )}

      {/* 목록 */}
      <div className={`${card} p-4`}>
        <div className="mb-3 flex items-center justify-between">
          <div className="font-semibold text-sm">생산일지 목록 — {filterDate}</div>
          <div className="text-xs text-slate-400">{logs.length}건</div>
        </div>
        {loading ? (
          <div className="py-8 text-center text-sm text-slate-400">불러오는 중...</div>
        ) : logs.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-400">해당 날짜 생산일지가 없습니다.</div>
        ) : (
          <div className="space-y-2">
            {logs.map((log) => (
              <div key={log.id} className="rounded-2xl border border-slate-200 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-sm">
                        {WORK_TYPE_LABELS[log.work_type] ?? log.work_type}
                      </span>
                      {(log.formula as any)?.name && (
                        <span className="rounded-full bg-blue-50 border border-blue-200 px-2 py-0.5 text-[11px] text-blue-700">
                          {(log.formula as any).name}
                        </span>
                      )}
                      {log.work_name && (
                        <span className="text-xs text-slate-500">{log.work_name}</span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-500">
                      {log.quantity != null && <span>생산: <b>{log.quantity.toLocaleString()}</b></span>}
                      {log.defect_qty != null && log.defect_qty > 0 && <span>불량: <b className="text-red-600">{log.defect_qty}</b></span>}
                      {log.work_start && <span>시작: {log.work_start}</span>}
                      {log.work_end && <span>종료: {log.work_end}</span>}
                      {log.note && <span>비고: {log.note}</span>}
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-2 text-[11px]">
                      <span className="text-slate-400">작성: {(log.creator as any)?.name ?? "—"}</span>
                      <span className="text-slate-400">확인: {(log.confirmer as any)?.name ?? <span className="text-amber-500">미확인</span>}</span>
                      <span className="text-slate-400">승인: {(log.approver as any)?.name ?? <span className="text-amber-500">미승인</span>}</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 items-end shrink-0">
                    {/* 확인 버튼 (김영각 — USER 역할) */}
                    {!log.confirmed_by && !isAdminOrSubadmin && (
                      <button className="rounded-lg border border-violet-300 bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700 hover:bg-violet-100"
                        onClick={() => approveLog(log.id, "confirm")}>✅ 확인</button>
                    )}
                    {/* 승인 버튼 (ADMIN) */}
                    {log.confirmed_by && !log.approved_by && isAdmin && (
                      <button className="rounded-lg border border-green-300 bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-700 hover:bg-green-100"
                        onClick={() => approveLog(log.id, "approve")}>✅ 최종승인</button>
                    )}
                    {log.approved_by && (
                      <span className="rounded-full border border-green-200 bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">승인완료</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 탭 2: 원료수불부
// ═══════════════════════════════════════════════════════════
function MaterialLedgerTab({ role, userId, showToast }: {
  role: UserRole; userId: string | null;
  showToast: (msg: string, type?: "success" | "error") => void;
}) {
  const isAdminOrSubadmin = role === "ADMIN" || role === "SUBADMIN";

  const [stocks, setStocks] = useState<MaterialStock[]>([]);
  const [receipts, setReceipts] = useState<MaterialReceipt[]>([]);
  const [filterDate, setFilterDate] = useState(new Date().toISOString().slice(0, 10));
  const [filterCategory, setFilterCategory] = useState("전체");
  const [loading, setLoading] = useState(false);
  const [showReceiptForm, setShowReceiptForm] = useState(false);
  const [materials, setMaterials] = useState<{ id: string; name: string; category: string }[]>([]);

  // 입고 폼
  const [rMaterialId, setRMaterialId] = useState("");
  const [rDate, setRDate] = useState(new Date().toISOString().slice(0, 10));
  const [rQty, setRQty] = useState("");
  const [rExpiry, setRExpiry] = useState("");
  const [rSupplier, setRSupplier] = useState("");
  const [rNote, setRNote] = useState("");
  const [saving, setSaving] = useState(false);

  const categories = useMemo(() => {
    const cats = [...new Set(stocks.map((s) => s.category))].sort();
    return ["전체", ...cats];
  }, [stocks]);

  const filteredStocks = useMemo(() =>
    filterCategory === "전체" ? stocks : stocks.filter((s) => s.category === filterCategory),
    [stocks, filterCategory]
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    const [stockRes, receiptRes] = await Promise.all([
      supabase.from("v_material_stock").select("*").order("category").order("material_name"),
      supabase.from("material_receipts")
        .select("id,received_date,material_id,quantity,unit,expiry_date,supplier,note,material:materials(name)")
        .eq("received_date", filterDate)
        .order("created_at", { ascending: false }),
    ]);
    setStocks((stockRes.data ?? []) as MaterialStock[]);
    setReceipts((receiptRes.data ?? []) as unknown as MaterialReceipt[]);
    setLoading(false);
  }, [filterDate]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => {
    supabase.from("materials").select("id,name,category").order("name")
      .then(({ data }) => setMaterials(data ?? []));
  }, []);

  async function saveReceipt() {
    if (!rMaterialId || !rQty) return showToast("원료와 수량을 입력하세요.", "error");
    setSaving(true);
    const { error } = await supabase.from("material_receipts").insert({
      material_id: rMaterialId,
      received_date: rDate,
      quantity: Number(rQty),
      unit: "g",
      expiry_date: rExpiry || null,
      supplier: rSupplier.trim() || null,
      note: rNote.trim() || null,
      created_by: userId,
    });
    setSaving(false);
    if (error) return showToast("저장 실패: " + error.message, "error");
    showToast("✅ 입고 등록 완료!");
    setShowReceiptForm(false);
    setRMaterialId(""); setRQty(""); setRExpiry(""); setRSupplier(""); setRNote("");
    loadData();
  }

  return (
    <div className="space-y-4">
      {/* 필터 */}
      <div className={`${card} p-4`}>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <div className="mb-1 text-xs text-slate-500">입고일 조회</div>
            <input type="date" className={inp} style={{ width: 160 }} value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)} />
          </div>
          <div>
            <div className="mb-1 text-xs text-slate-500">분류</div>
            <select className={inp} style={{ width: 160 }} value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <button className={btn} onClick={loadData}>🔄 조회</button>
          {isAdminOrSubadmin && (
            <button
              className={showReceiptForm ? btnOn : "rounded-xl border border-blue-300 bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-700 hover:bg-blue-100"}
              onClick={() => setShowReceiptForm((v) => !v)}
            >
              {showReceiptForm ? "✕ 닫기" : "✚ 입고 등록"}
            </button>
          )}
          <button className={btnSm} onClick={() => window.print()}>🖨️ 인쇄</button>
        </div>
      </div>

      {/* 입고 등록 폼 */}
      {showReceiptForm && isAdminOrSubadmin && (
        <div className={`${card} p-4`}>
          <div className="mb-3 font-semibold text-sm text-blue-700">✚ 원료 입고 등록</div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div>
              <div className="mb-1 text-xs text-slate-500">원료 *</div>
              <select className={inp} value={rMaterialId} onChange={(e) => setRMaterialId(e.target.value)}>
                <option value="">— 원료 선택 —</option>
                {materials.map((m) => (
                  <option key={m.id} value={m.id}>[{m.category}] {m.name}</option>
                ))}
              </select>
            </div>
            <div>
              <div className="mb-1 text-xs text-slate-500">입고일 *</div>
              <input type="date" className={inp} value={rDate} onChange={(e) => setRDate(e.target.value)} />
            </div>
            <div>
              <div className="mb-1 text-xs text-slate-500">수량 (g) *</div>
              <input className={inpR} inputMode="numeric" value={rQty}
                onChange={(e) => setRQty(e.target.value.replace(/[^\d]/g, ""))} placeholder="g" />
            </div>
            <div>
              <div className="mb-1 text-xs text-slate-500">소비기한</div>
              <input type="date" className={inp} value={rExpiry} onChange={(e) => setRExpiry(e.target.value)} />
            </div>
            <div>
              <div className="mb-1 text-xs text-slate-500">공급업체</div>
              <input className={inp} value={rSupplier} onChange={(e) => setRSupplier(e.target.value)} />
            </div>
            <div>
              <div className="mb-1 text-xs text-slate-500">비고</div>
              <input className={inp} value={rNote} onChange={(e) => setRNote(e.target.value)} />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60"
              disabled={saving} onClick={saveReceipt}
            >
              {saving ? "저장 중..." : "💾 입고 등록"}
            </button>
            <button className={btn} onClick={() => setShowReceiptForm(false)}>취소</button>
          </div>
        </div>
      )}

      {/* 현재고 현황 */}
      <div className={`${card} p-4`}>
        <div className="mb-3 font-semibold text-sm">🧪 원료별 현재고</div>
        {loading ? (
          <div className="py-4 text-center text-sm text-slate-400">불러오는 중...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-2 px-3 text-xs text-slate-500 font-semibold">분류</th>
                  <th className="text-left py-2 px-3 text-xs text-slate-500 font-semibold">원료명</th>
                  <th className="text-right py-2 px-3 text-xs text-slate-500 font-semibold">입고</th>
                  <th className="text-right py-2 px-3 text-xs text-slate-500 font-semibold">사용</th>
                  <th className="text-right py-2 px-3 text-xs text-slate-500 font-semibold">폐기</th>
                  <th className="text-right py-2 px-3 text-xs text-slate-500 font-semibold">현재고</th>
                  <th className="text-center py-2 px-3 text-xs text-slate-500 font-semibold">상태</th>
                </tr>
              </thead>
              <tbody>
                {filteredStocks.map((s) => (
                  <tr key={s.material_id} className={`border-b border-slate-100 hover:bg-slate-50 ${s.is_below_safety_stock ? "bg-red-50" : ""}`}>
                    <td className="py-2 px-3 text-xs text-slate-500">{s.category}</td>
                    <td className="py-2 px-3 font-medium">{s.material_name}</td>
                    <td className="py-2 px-3 text-right tabular-nums text-green-700">{s.total_received.toLocaleString()}{s.unit}</td>
                    <td className="py-2 px-3 text-right tabular-nums text-blue-700">{s.total_used.toLocaleString()}{s.unit}</td>
                    <td className="py-2 px-3 text-right tabular-nums text-slate-500">{s.total_disposed.toLocaleString()}{s.unit}</td>
                    <td className={`py-2 px-3 text-right tabular-nums font-bold ${s.current_stock < 0 ? "text-red-600" : s.is_below_safety_stock ? "text-amber-600" : "text-slate-800"}`}>
                      {s.current_stock.toLocaleString()}{s.unit}
                    </td>
                    <td className="py-2 px-3 text-center">
                      {s.is_below_safety_stock ? (
                        <span className="rounded-full border border-amber-200 bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">⚠ 미달</span>
                      ) : (
                        <span className="rounded-full border border-green-200 bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-700">정상</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 당일 입고 내역 */}
      <div className={`${card} p-4`}>
        <div className="mb-3 font-semibold text-sm">📦 입고 내역 — {filterDate}</div>
        {receipts.length === 0 ? (
          <div className="py-4 text-center text-sm text-slate-400">해당 날짜 입고 내역이 없습니다.</div>
        ) : (
          <div className="space-y-2">
            {receipts.map((r) => (
              <div key={r.id} className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{(r.material as any)?.name ?? "—"}</div>
                  <div className="text-xs text-slate-500">
                    수량: <b>{r.quantity.toLocaleString()}{r.unit}</b>
                    {r.expiry_date && ` · 소비기한: ${r.expiry_date}`}
                    {r.supplier && ` · 공급: ${r.supplier}`}
                    {r.note && ` · ${r.note}`}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 탭 3: 근무일지
// ═══════════════════════════════════════════════════════════
function WorkLogTab({ role, userId, showToast }: {
  role: UserRole; userId: string | null;
  showToast: (msg: string, type?: "success" | "error") => void;
}) {
  const isAdminOrSubadmin = role === "ADMIN" || role === "SUBADMIN";
  const isAdmin = role === "ADMIN";

  const [logs, setLogs] = useState<WorkLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterDate, setFilterDate] = useState(new Date().toISOString().slice(0, 10));
  const [showForm, setShowForm] = useState(false);
  const [employees, setEmployees] = useState<{ id: string; name: string | null }[]>([]);

  // 폼 state
  const [fDate, setFDate] = useState(new Date().toISOString().slice(0, 10));
  const [fWorkerName, setFWorkerName] = useState("");
  const [fClockIn, setFClockIn] = useState("");
  const [fClockOut, setFClockOut] = useState("");
  const [fInstruction, setFInstruction] = useState("");
  const [fExtraWork, setFExtraWork] = useState("");
  const [fNote, setFNote] = useState("");
  const [saving, setSaving] = useState(false);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("work_logs")
      .select(`id, log_date, worker_id, worker_name, clock_in, clock_out,
        production_summary, instruction, extra_work, note,
        created_by, confirmed_by, approved_by, approved_at,
        creator:users!created_by(name),
        confirmer:users!confirmed_by(name),
        approver:users!approved_by(name)`)
      .eq("log_date", filterDate)
      .order("created_at", { ascending: false });
    setLogs((data ?? []) as unknown as WorkLog[]);
    setLoading(false);
  }, [filterDate]);

  useEffect(() => { loadLogs(); }, [loadLogs]);
  useEffect(() => {
    supabase.from("employees").select("id,name").is("resign_date", null).order("name")
      .then(({ data }) => setEmployees(data ?? []));
  }, []);

  // 당일 생산요약 자동 생성
  async function buildProductionSummary(date: string): Promise<string> {
    const { data } = await supabase.from("production_logs")
      .select("work_type, work_name, quantity, formula:product_formulas(name)")
      .eq("log_date", date);
    if (!data || data.length === 0) return "";
    return (data as any[]).map((d) => {
      const name = (d.formula as any)?.name ?? d.work_name ?? WORK_TYPE_LABELS[d.work_type] ?? d.work_type;
      const qty = d.quantity ? ` ${d.quantity.toLocaleString()}` : "";
      return `${name}${qty}`;
    }).join(", ");
  }

  async function saveLog() {
    if (!fDate || !fWorkerName) return showToast("날짜와 담당자를 입력하세요.", "error");
    setSaving(true);
    const summary = await buildProductionSummary(fDate);
    const { error } = await supabase.from("work_logs").insert({
      log_date: fDate,
      worker_name: fWorkerName,
      clock_in: fClockIn || null,
      clock_out: fClockOut || null,
      production_summary: summary || null,
      instruction: fInstruction.trim() || null,
      extra_work: fExtraWork.trim() || null,
      note: fNote.trim() || null,
      created_by: userId,
    });
    setSaving(false);
    if (error) return showToast("저장 실패: " + error.message, "error");
    showToast("✅ 근무일지 등록 완료!");
    setShowForm(false);
    setFWorkerName(""); setFClockIn(""); setFClockOut(""); setFInstruction(""); setFExtraWork(""); setFNote("");
    loadLogs();
  }

  async function approveLog(logId: string, step: "confirm" | "approve") {
    const field = step === "confirm"
      ? { confirmed_by: userId }
      : { approved_by: userId, approved_at: new Date().toISOString() };
    const { error } = await supabase.from("work_logs").update(field).eq("id", logId);
    if (error) return showToast("처리 실패: " + error.message, "error");
    showToast(step === "confirm" ? "✅ 확인 완료!" : "✅ 승인 완료!");
    loadLogs();
  }

  return (
    <div className="space-y-4">
      {/* 필터 */}
      <div className={`${card} p-4`}>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <div className="mb-1 text-xs text-slate-500">날짜</div>
            <input type="date" className={inp} style={{ width: 160 }} value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)} />
          </div>
          <button className={btn} onClick={loadLogs}>🔄 조회</button>
          {isAdminOrSubadmin && (
            <button
              className={showForm ? btnOn : "rounded-xl border border-blue-300 bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-700 hover:bg-blue-100"}
              onClick={() => setShowForm((v) => !v)}
            >
              {showForm ? "✕ 닫기" : "✚ 근무일지 등록"}
            </button>
          )}
          <button className={btnSm} onClick={() => window.print()}>🖨️ 인쇄</button>
        </div>
      </div>

      {/* 등록 폼 */}
      {showForm && isAdminOrSubadmin && (
        <div className={`${card} p-4`}>
          <div className="mb-3 font-semibold text-sm text-blue-700">✚ 근무일지 신규 등록</div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div>
              <div className="mb-1 text-xs text-slate-500">날짜 *</div>
              <input type="date" className={inp} value={fDate} onChange={(e) => setFDate(e.target.value)} />
            </div>
            <div>
              <div className="mb-1 text-xs text-slate-500">담당자 *</div>
              <select className={inp} value={fWorkerName} onChange={(e) => setFWorkerName(e.target.value)}>
                <option value="">— 담당자 선택 —</option>
                {employees.map((e) => e.name ? (
                  <option key={e.id} value={e.name}>{e.name}</option>
                ) : null)}
              </select>
            </div>
            <div>
              <div className="mb-1 text-xs text-slate-500">출근</div>
              <input type="time" className={inp} value={fClockIn} onChange={(e) => setFClockIn(e.target.value)} />
            </div>
            <div>
              <div className="mb-1 text-xs text-slate-500">퇴근</div>
              <input type="time" className={inp} value={fClockOut} onChange={(e) => setFClockOut(e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <div className="mb-1 text-xs text-slate-500">지시사항</div>
              <input className={inp} value={fInstruction} onChange={(e) => setFInstruction(e.target.value)}
                placeholder="당일 지시사항" />
            </div>
            <div className="md:col-span-2">
              <div className="mb-1 text-xs text-slate-500">기타작업기록</div>
              <input className={inp} value={fExtraWork} onChange={(e) => setFExtraWork(e.target.value)}
                placeholder="청소, 재고정리 등" />
            </div>
            <div>
              <div className="mb-1 text-xs text-slate-500">비고</div>
              <input className={inp} value={fNote} onChange={(e) => setFNote(e.target.value)} />
            </div>
          </div>
          <div className="mt-2 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-600">
            💡 생산목록은 해당 날짜의 생산일지에서 자동으로 불러옵니다.
          </div>
          <div className="mt-4 flex gap-2">
            <button
              className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60"
              disabled={saving} onClick={saveLog}
            >
              {saving ? "저장 중..." : "💾 등록"}
            </button>
            <button className={btn} onClick={() => setShowForm(false)}>취소</button>
          </div>
        </div>
      )}

      {/* 목록 */}
      <div className={`${card} p-4`}>
        <div className="mb-3 flex items-center justify-between">
          <div className="font-semibold text-sm">근무일지 목록 — {filterDate}</div>
          <div className="text-xs text-slate-400">{logs.length}건</div>
        </div>
        {loading ? (
          <div className="py-8 text-center text-sm text-slate-400">불러오는 중...</div>
        ) : logs.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-400">해당 날짜 근무일지가 없습니다.</div>
        ) : (
          <div className="space-y-3">
            {logs.map((log) => (
              <div key={log.id} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
                  <div>
                    <div className="font-bold text-base">👤 {log.worker_name}</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {log.clock_in && `출근: ${log.clock_in}`}
                      {log.clock_in && log.clock_out && " · "}
                      {log.clock_out && `퇴근: ${log.clock_out}`}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 items-end">
                    {!log.confirmed_by && !isAdminOrSubadmin && (
                      <button className="rounded-lg border border-violet-300 bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700 hover:bg-violet-100"
                        onClick={() => approveLog(log.id, "confirm")}>✅ 확인</button>
                    )}
                    {log.confirmed_by && !log.approved_by && isAdmin && (
                      <button className="rounded-lg border border-green-300 bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-700 hover:bg-green-100"
                        onClick={() => approveLog(log.id, "approve")}>✅ 최종승인</button>
                    )}
                    {log.approved_by && (
                      <span className="rounded-full border border-green-200 bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">승인완료</span>
                    )}
                  </div>
                </div>
                <div className="space-y-1.5 text-sm">
                  {log.production_summary && (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                      <span className="font-semibold text-slate-600">생산목록: </span>{log.production_summary}
                    </div>
                  )}
                  {log.instruction && (
                    <div className="text-xs text-slate-600"><span className="font-semibold">지시사항:</span> {log.instruction}</div>
                  )}
                  {log.extra_work && (
                    <div className="text-xs text-slate-600"><span className="font-semibold">기타작업:</span> {log.extra_work}</div>
                  )}
                  {log.note && (
                    <div className="text-xs text-slate-500">비고: {log.note}</div>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-400">
                  <span>작성: {(log.creator as any)?.name ?? "—"}</span>
                  <span>확인: {(log.confirmer as any)?.name ?? "미확인"}</span>
                  <span>승인: {(log.approver as any)?.name ?? "미승인"}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
