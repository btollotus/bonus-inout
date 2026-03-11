"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

// ─────────────────────── Types ───────────────────────
type WoSubItem = { name: string; qty: number };

type WoItemRow = {
  id: string;
  work_order_id: string;
  delivery_date: string;
  sub_items: WoSubItem[];
  order_qty: number;
  actual_qty: number | null;
  unit_weight: number | null;
  total_weight: number | null;
  expiry_date: string | null;
  order_id: string | null;
};

type WorkOrderRow = {
  id: string;
  work_order_no: string;
  barcode_no: string;
  client_id: string | null;
  client_name: string;
  sub_name: string | null;
  order_date: string;
  food_type: string | null;
  product_name: string;
  logo_spec: string | null;
  thickness: string | null;
  delivery_method: string | null;
  packaging_type: string | null;
  tray_slot: string | null;
  package_unit: string | null;
  mold_per_sheet: number | null;
  note: string | null;
  reference_note: string | null;
  status: string;
  status_transfer: boolean;
  status_print_check: boolean;
  status_production: boolean;
  status_input: boolean;
  is_reorder: boolean;
  original_work_order_id: string | null;
  variant_id: string | null;
  images: string[];
  linked_order_id: string | null;
  created_at: string;
  work_order_items?: WoItemRow[];
};

type UserRole = "ADMIN" | "SUBADMIN" | "USER" | null;

// ─────────────────────── Helpers ───────────────────────
const supabase = createClient();

function fmt(n: number | null | undefined) {
  if (n == null || isNaN(Number(n))) return "0";
  return Number(n).toLocaleString("ko-KR");
}
function toNum(v: unknown): number {
  const n = parseFloat(String(v ?? "").replace(/,/g, ""));
  return isNaN(n) ? 0 : n;
}
function toInt(v: unknown): number {
  const n = parseInt(String(v ?? "").replace(/,/g, ""), 10);
  return isNaN(n) ? 0 : n;
}

// ─────────────────────── Styles ───────────────────────
const card = "rounded-2xl border border-slate-200 bg-white shadow-sm";
const inp = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:outline-none";
const inpR = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-right tabular-nums focus:border-blue-400 focus:outline-none";
const btn = "rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50 active:bg-slate-100";
const btnOn = "rounded-xl border border-blue-500 bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 active:bg-blue-800";
const btnSm = "rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium hover:bg-slate-50";
const pill = "rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-medium text-slate-600";
const statusColors: Record<string, string> = {
  "생산중": "bg-orange-100 text-orange-700 border-orange-200",
  "완료":   "bg-green-100 text-green-700 border-green-200",
};

// ─────────────────────── Component ───────────────────────
export default function ProductionClient() {
  // ── Role 조회 ──
  const [role, setRole] = useState<UserRole>(null);
  const isAdmin = role === "ADMIN";

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();
      setRole((data?.role as UserRole) ?? "USER");
    })();
  }, []);

  // ── State ──
  const [woList, setWoList] = useState<WorkOrderRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // 필터
  const [filterStatus, setFilterStatus] = useState<"전체" | "생산중" | "완료">("생산중");
  const [filterSearch, setFilterSearch] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  // 선택된 작업지시서
  const [selectedWo, setSelectedWo] = useState<WorkOrderRow | null>(null);
  const [editBasic, setEditBasic] = useState(false);

  // 기본정보 수정 form
  const [eSubName, setESubName] = useState("");
  const [eProductName, setEProductName] = useState("");
  const [eFoodType, setEFoodType] = useState("");
  const [eLogoSpec, setELogoSpec] = useState("");
  const [eThickness, setEThickness] = useState("2mm");
  const [eDeliveryMethod, setEDeliveryMethod] = useState("택배");
  const [ePackagingType, setEPackagingType] = useState("트레이");
  const [eTraySlot, setETraySlot] = useState("정사각20구");
  const [ePackageUnit, setEPackageUnit] = useState("100ea");
  const [eMoldPerSheet, setEMoldPerSheet] = useState("");
  const [eNote, setENote] = useState("");
  const [eReferenceNote, setEReferenceNote] = useState("");
  const [eSaving, setESaving] = useState(false);

  // 체크박스
  const [woChecks, setWoChecks] = useState<{
    status_transfer: boolean;
    status_print_check: boolean;
    status_production: boolean;
    status_input: boolean;
  } | null>(null);
  const [checkSaving, setCheckSaving] = useState(false);

  // 생산 입력 form
  const [prodInputs, setProdInputs] = useState<Record<string, {
    actual_qty: string;
    unit_weight: string;
    expiry_date: string;
  }>>({});
  const [prodSaving, setProdSaving] = useState(false);

  // ── Load ──
  const loadWoList = useCallback(async () => {
    setLoading(true);
    setMsg(null);
    try {
      let q = supabase
        .from("work_orders")
        .select(`
          id,work_order_no,barcode_no,client_id,client_name,sub_name,
          order_date,food_type,product_name,logo_spec,thickness,
          delivery_method,packaging_type,tray_slot,package_unit,mold_per_sheet,
          note,reference_note,status,status_transfer,status_print_check,
          status_production,status_input,is_reorder,original_work_order_id,
          variant_id,images,linked_order_id,created_at,
          work_order_items(id,work_order_id,delivery_date,sub_items,order_qty,actual_qty,unit_weight,total_weight,expiry_date,order_id)
        `)
        .order("created_at", { ascending: false })
        .limit(200);

      if (filterStatus !== "전체") q = q.eq("status", filterStatus);
      if (filterDateFrom) q = q.gte("order_date", filterDateFrom);
      if (filterDateTo) q = q.lte("order_date", filterDateTo);

      const { data, error } = await q;
      if (error) return setMsg(error.message);
      const list = (data ?? []) as WorkOrderRow[];
      setWoList(list);
      // 선택된 항목 갱신
      if (selectedWo) {
        const refreshed = list.find((w) => w.id === selectedWo.id);
        if (refreshed) applySelection(refreshed, false);
      }
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterDateFrom, filterDateTo]); // eslint-disable-line

  useEffect(() => { loadWoList(); }, [loadWoList]);

  // ── 필터링 ──
  const filteredList = useMemo(() => {
    const q = filterSearch.trim().toLowerCase();
    if (!q) return woList;
    return woList.filter((wo) =>
      [wo.client_name, wo.sub_name, wo.product_name, wo.barcode_no, wo.work_order_no, wo.food_type]
        .filter(Boolean).join(" ").toLowerCase().includes(q)
    );
  }, [woList, filterSearch]);

  // ── 작업지시서 선택 ──
  function applySelection(wo: WorkOrderRow, resetEdit = true) {
    setSelectedWo(wo);
    if (resetEdit) setEditBasic(false);
    setESubName(wo.sub_name ?? "");
    setEProductName(wo.product_name ?? "");
    setEFoodType(wo.food_type ?? "");
    setELogoSpec(wo.logo_spec ?? "");
    setEThickness(wo.thickness ?? "2mm");
    setEDeliveryMethod(wo.delivery_method ?? "택배");
    setEPackagingType(wo.packaging_type ?? "트레이");
    setETraySlot(wo.tray_slot ?? "정사각20구");
    setEPackageUnit(wo.package_unit ?? "100ea");
    setEMoldPerSheet(wo.mold_per_sheet ? String(wo.mold_per_sheet) : "");
    setENote(wo.note ?? "");
    setEReferenceNote(wo.reference_note ?? "");
    setWoChecks({
      status_transfer: wo.status_transfer,
      status_print_check: wo.status_print_check,
      status_production: wo.status_production,
      status_input: wo.status_input,
    });
    const inputs: Record<string, { actual_qty: string; unit_weight: string; expiry_date: string }> = {};
    for (const item of wo.work_order_items ?? []) {
      inputs[item.id] = {
        actual_qty: item.actual_qty != null ? String(item.actual_qty) : "",
        unit_weight: item.unit_weight != null ? String(item.unit_weight) : "",
        expiry_date: item.expiry_date ?? "",
      };
    }
    setProdInputs(inputs);
  }

  // ── 기본정보 저장 (ADMIN only) ──
  async function saveBasicInfo() {
    if (!selectedWo || !isAdmin) return;
    setESaving(true); setMsg(null);
    try {
      const { error } = await supabase.from("work_orders").update({
        sub_name: eSubName.trim() || null,
        product_name: eProductName.trim(),
        food_type: eFoodType.trim() || null,
        logo_spec: eLogoSpec.trim() || null,
        thickness: eThickness || null,
        delivery_method: eDeliveryMethod || null,
        packaging_type: ePackagingType || null,
        tray_slot: ePackagingType === "트레이" ? eTraySlot : null,
        package_unit: ePackageUnit || null,
        mold_per_sheet: eMoldPerSheet ? Number(eMoldPerSheet) : null,
        note: eNote.trim() || null,
        reference_note: eReferenceNote.trim() || null,
        updated_at: new Date().toISOString(),
      }).eq("id", selectedWo.id);
      if (error) return setMsg(error.message);
      setMsg("✅ 기본정보 저장 완료");
      setEditBasic(false);
      await loadWoList();
    } finally {
      setESaving(false);
    }
  }

  // ── 체크박스 저장 ──
  async function saveChecks() {
    if (!selectedWo || !woChecks) return;
    setCheckSaving(true); setMsg(null);
    try {
      const { error } = await supabase.from("work_orders").update({
        status_transfer: woChecks.status_transfer,
        status_print_check: woChecks.status_print_check,
        status_production: woChecks.status_production,
        status_input: woChecks.status_input,
        updated_at: new Date().toISOString(),
      }).eq("id", selectedWo.id);
      if (error) return setMsg(error.message);
      setMsg("✅ 진행상태 저장 완료");
      await loadWoList();
    } finally {
      setCheckSaving(false);
    }
  }

  // ── 생산 입력 저장 ──
  async function saveProdInputs() {
    if (!selectedWo) return;
    setProdSaving(true); setMsg(null);
    try {
      const items = selectedWo.work_order_items ?? [];
      for (const item of items) {
        const pi = prodInputs[item.id];
        if (!pi) continue;
        const actual_qty = pi.actual_qty ? toInt(pi.actual_qty) : null;
        const unit_weight = pi.unit_weight ? toNum(pi.unit_weight) : null;
        const expiry_date = pi.expiry_date || null;
        const { error } = await supabase.from("work_order_items").update({
          actual_qty, unit_weight, expiry_date,
          updated_at: new Date().toISOString(),
        }).eq("id", item.id);
        if (error) return setMsg("항목 저장 실패: " + error.message);
      }

      // variant_id 있으면 첫 번째 항목 unit_weight → product_variants.weight_g 업데이트
      const firstUw = toNum(prodInputs[items[0]?.id]?.unit_weight);
      if (selectedWo.variant_id && firstUw > 0) {
        await supabase.from("product_variants")
          .update({ weight_g: firstUw })
          .eq("id", selectedWo.variant_id);
      }

      // 모든 항목에 actual_qty, unit_weight, expiry_date 입력 시 status → 완료
      const allDone = items.length > 0 && items.every((item) => {
        const pi = prodInputs[item.id];
        return pi && pi.actual_qty && pi.unit_weight && pi.expiry_date;
      });
      if (allDone) {
        await supabase.from("work_orders").update({
          status: "완료",
          status_production: true,
          updated_at: new Date().toISOString(),
        }).eq("id", selectedWo.id);
        if (woChecks) setWoChecks({ ...woChecks, status_production: true });
      }

      setMsg(allDone ? "✅ 생산 완료! 상태가 '완료'로 변경됐습니다." : "✅ 생산 정보 저장 완료");
      await loadWoList();
    } finally {
      setProdSaving(false);
    }
  }

  // ── 렌더 ──
  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="mx-auto max-w-[1400px] space-y-4">

        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-800">📋 작업지시서 관리</h1>
            <div className="mt-0.5 text-xs text-slate-500">
              {role === "ADMIN"
                ? "ADMIN — 목록조회 · 기본정보수정 · 생산입력"
                : role === "SUBADMIN"
                ? "SUBADMIN — 목록조회 · 생산입력"
                : "로딩 중..."}
            </div>
          </div>
          <button className={btn} onClick={loadWoList}>🔄 새로고침</button>
        </div>

        {msg ? (
          <div className={`rounded-xl border px-4 py-3 text-sm font-medium ${msg.startsWith("✅") ? "border-green-200 bg-green-50 text-green-700" : "border-red-200 bg-red-50 text-red-700"}`}>
            {msg}
            <button className="ml-3 text-xs opacity-60 hover:opacity-100" onClick={() => setMsg(null)}>✕</button>
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[420px_minmax(0,1fr)]">

          {/* ── LEFT: 목록 ── */}
          <div className={`${card} flex flex-col p-4`} style={{ maxHeight: "calc(100vh - 140px)", overflowY: "auto" }}>
            <div className="mb-3 text-base font-semibold">작업지시서 목록</div>

            {/* 필터 */}
            <div className="mb-3 space-y-2">
              <input
                className={inp}
                placeholder="거래처명 / 품목명 / 바코드 검색"
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
              />
              <div className="flex gap-1">
                {(["전체", "생산중", "완료"] as const).map((s) => (
                  <button key={s} className={filterStatus === s ? btnOn : btn} onClick={() => setFilterStatus(s)}>
                    {s}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="mb-1 text-xs text-slate-500">주문일 From</div>
                  <input type="date" className={inp} value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} />
                </div>
                <div>
                  <div className="mb-1 text-xs text-slate-500">주문일 To</div>
                  <input type="date" className={inp} value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} />
                </div>
              </div>
            </div>

            {/* 목록 */}
            {loading ? (
              <div className="py-8 text-center text-sm text-slate-400">불러오는 중...</div>
            ) : filteredList.length === 0 ? (
              <div className="py-8 text-center text-sm text-slate-400">조건에 맞는 작업지시서가 없습니다.</div>
            ) : (
              <div className="space-y-2">
                {filteredList.map((wo) => {
                  const isSelected = selectedWo?.id === wo.id;
                  const statusCls = statusColors[wo.status] ?? "bg-slate-100 text-slate-600 border-slate-200";
                  const items = wo.work_order_items ?? [];
                  const totalOrder = items.reduce((s, i) => s + (i.order_qty ?? 0), 0);
                  const allItemsDone = items.length > 0 && items.every((i) => i.actual_qty && i.unit_weight && i.expiry_date);
                  return (
                    <button
                      key={wo.id}
                      className={`w-full rounded-2xl border p-3 text-left transition-all ${isSelected ? "border-blue-400 bg-blue-50 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"}`}
                      onClick={() => applySelection(wo)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-semibold text-sm truncate">{wo.client_name}</span>
                            {wo.sub_name ? <span className="text-xs text-slate-500">· {wo.sub_name}</span> : null}
                          </div>
                          <div className="mt-0.5 text-xs text-slate-600 font-medium truncate">{wo.product_name}</div>
                          <div className="mt-1 flex flex-wrap gap-1">
                            <span className="text-[10px] text-slate-400 tabular-nums font-mono">{wo.barcode_no}</span>
                            {wo.thickness ? <span className={`${pill} text-[10px]`}>{wo.thickness}</span> : null}
                            {wo.packaging_type ? <span className={`${pill} text-[10px]`}>{wo.packaging_type}</span> : null}
                          </div>
                          <div className="mt-1 text-[11px] text-slate-400">
                            주문일 {wo.order_date}
                            {totalOrder > 0 ? ` · ${fmt(totalOrder)}개` : ""}
                            {allItemsDone ? " · ✅생산완료" : ""}
                          </div>
                        </div>
                        <div className="shrink-0 flex flex-col items-end gap-1.5">
                          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusCls}`}>{wo.status}</span>
                          <div className="flex gap-0.5">
                            {([
                              { key: "status_transfer",    label: "전" },
                              { key: "status_print_check", label: "인" },
                              { key: "status_production",  label: "생" },
                              { key: "status_input",       label: "입" },
                            ] as const).map(({ key, label }) => (
                              <span key={key} className={`inline-flex items-center justify-center rounded text-[9px] font-bold w-4 h-4 ${(wo as any)[key] ? "bg-green-500 text-white" : "bg-slate-200 text-slate-400"}`}>
                                {label}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── RIGHT: 상세 ── */}
          {selectedWo ? (
            <div className="space-y-4 overflow-y-auto" style={{ maxHeight: "calc(100vh - 140px)" }}>

              {/* 헤더 카드 */}
              <div className={`${card} p-4`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-lg font-bold">{selectedWo.client_name}</span>
                      {selectedWo.sub_name ? <span className="text-slate-500">· {selectedWo.sub_name}</span> : null}
                      <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusColors[selectedWo.status] ?? "bg-slate-100 text-slate-600 border-slate-200"}`}>
                        {selectedWo.status}
                      </span>
                      {selectedWo.is_reorder ? <span className="rounded-full bg-amber-100 border border-amber-200 px-2.5 py-0.5 text-xs font-semibold text-amber-700">재주문</span> : null}
                    </div>
                    <div className="mt-1 font-semibold text-slate-700">{selectedWo.product_name}</div>
                    <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500">
                      <span className="tabular-nums font-mono">{selectedWo.barcode_no}</span>
                      <span>·</span>
                      <span>{selectedWo.work_order_no}</span>
                      <span>·</span>
                      <span>주문일 {selectedWo.order_date}</span>
                    </div>
                  </div>
                  <button className={btnSm} onClick={() => applySelection(selectedWo)}>↺ 초기화</button>
                </div>
              </div>

              {/* 기본정보 카드 */}
              <div className={`${card} p-4`}>
                <div className="mb-3 flex items-center justify-between">
                  <div className="font-semibold text-sm">📝 기본정보</div>
                  {isAdmin ? (
                    editBasic ? (
                      <div className="flex gap-2">
                        <button className={btnSm} onClick={() => { setEditBasic(false); applySelection(selectedWo); }}>취소</button>
                        <button
                          className="rounded-lg border border-blue-500 bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700"
                          onClick={saveBasicInfo}
                          disabled={eSaving}
                        >
                          {eSaving ? "저장 중..." : "💾 저장"}
                        </button>
                      </div>
                    ) : (
                      <button className={btnSm} onClick={() => setEditBasic(true)}>✏️ 수정</button>
                    )
                  ) : null}
                </div>

                {editBasic ? (
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <div>
                      <div className="mb-1 text-xs text-slate-500">품목명 *</div>
                      <input className={inp} value={eProductName} onChange={(e) => setEProductName(e.target.value)} />
                    </div>
                    <div>
                      <div className="mb-1 text-xs text-slate-500">서브네임</div>
                      <input className={inp} placeholder="예: COS, 크로버" value={eSubName} onChange={(e) => setESubName(e.target.value)} />
                    </div>
                    <div>
                      <div className="mb-1 text-xs text-slate-500">식품유형</div>
                      <input className={inp} placeholder="예: 화이트초콜릿" value={eFoodType} onChange={(e) => setEFoodType(e.target.value)} />
                    </div>
                    <div>
                      <div className="mb-1 text-xs text-slate-500">규격(로고스펙)</div>
                      <input className={inp} placeholder="예: 40x40mm" value={eLogoSpec} onChange={(e) => setELogoSpec(e.target.value)} />
                    </div>
                    <div>
                      <div className="mb-1 text-xs text-slate-500">두께</div>
                      <select className={inp} value={eThickness} onChange={(e) => setEThickness(e.target.value)}>
                        {["2mm", "3mm", "5mm", "기타"].map((v) => <option key={v} value={v}>{v}</option>)}
                      </select>
                    </div>
                    <div>
                      <div className="mb-1 text-xs text-slate-500">납품방법</div>
                      <select className={inp} value={eDeliveryMethod} onChange={(e) => setEDeliveryMethod(e.target.value)}>
                        {["택배", "퀵-신용", "퀵-착불", "방문", "기타"].map((v) => <option key={v} value={v}>{v}</option>)}
                      </select>
                    </div>
                    <div>
                      <div className="mb-1 text-xs text-slate-500">포장방법</div>
                      <select className={inp} value={ePackagingType} onChange={(e) => setEPackagingType(e.target.value)}>
                        {["트레이", "벌크"].map((v) => <option key={v} value={v}>{v}</option>)}
                      </select>
                    </div>
                    {ePackagingType === "트레이" ? (
                      <div>
                        <div className="mb-1 text-xs text-slate-500">트레이 구수</div>
                        <select className={inp} value={eTraySlot} onChange={(e) => setETraySlot(e.target.value)}>
                          {["정사각20구", "직사각20구", "기타"].map((v) => <option key={v} value={v}>{v}</option>)}
                        </select>
                      </div>
                    ) : null}
                    <div>
                      <div className="mb-1 text-xs text-slate-500">포장단위</div>
                      <select className={inp} value={ePackageUnit} onChange={(e) => setEPackageUnit(e.target.value)}>
                        {["100ea", "200ea", "300ea", "기타"].map((v) => <option key={v} value={v}>{v}</option>)}
                      </select>
                    </div>
                    <div>
                      <div className="mb-1 text-xs text-slate-500">성형틀 장당 생산수</div>
                      <input className={inpR} inputMode="numeric" placeholder="예: 52" value={eMoldPerSheet}
                        onChange={(e) => setEMoldPerSheet(e.target.value.replace(/[^\d]/g, ""))} />
                    </div>
                    <div>
                      <div className="mb-1 text-xs text-slate-500">비고</div>
                      <input className={inp} value={eNote} onChange={(e) => setENote(e.target.value)} />
                    </div>
                    <div>
                      <div className="mb-1 text-xs text-slate-500">참고사항</div>
                      <input className={inp} value={eReferenceNote} onChange={(e) => setEReferenceNote(e.target.value)} />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 text-sm sm:grid-cols-3 md:grid-cols-4">
                    {([
                      ["식품유형", selectedWo.food_type],
                      ["규격", selectedWo.logo_spec],
                      ["두께", selectedWo.thickness],
                      ["납품방법", selectedWo.delivery_method],
                      ["포장방법", selectedWo.packaging_type],
                      ...(selectedWo.packaging_type === "트레이" ? [["트레이 구수", selectedWo.tray_slot] as [string, string | null]] : []),
                      ["포장단위", selectedWo.package_unit],
                      ["성형틀/장", selectedWo.mold_per_sheet ? `${selectedWo.mold_per_sheet}개` : null],
                      ["비고", selectedWo.note],
                      ["참고사항", selectedWo.reference_note],
                    ] as [string, string | null][]).map(([label, value]) => value ? (
                      <div key={label}>
                        <div className="text-xs text-slate-400">{label}</div>
                        <div className="font-medium text-slate-800">{value}</div>
                      </div>
                    ) : null)}
                  </div>
                )}
              </div>

              {/* 진행상태 체크박스 카드 */}
              <div className={`${card} p-4`}>
                <div className="mb-3 flex items-center justify-between">
                  <div className="font-semibold text-sm">✅ 진행상태</div>
                  <button
                    className="rounded-lg border border-blue-500 bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700"
                    onClick={saveChecks}
                    disabled={checkSaving}
                  >
                    {checkSaving ? "저장 중..." : "💾 저장"}
                  </button>
                </div>
                {woChecks ? (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {([
                      { key: "status_transfer",    label: "전사인쇄 확인" },
                      { key: "status_print_check", label: "인쇄검수 확인" },
                      { key: "status_production",  label: "생산 확인" },
                      { key: "status_input",       label: "입력 확인" },
                    ] as const).map(({ key, label }) => (
                      <label key={key} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${woChecks[key] ? "border-green-300 bg-green-50 text-green-800" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}>
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-green-500"
                          checked={woChecks[key]}
                          onChange={(e) => setWoChecks((prev) => prev ? { ...prev, [key]: e.target.checked } : prev)}
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                ) : null}
              </div>

              {/* 납기일별 생산 입력 카드 */}
              <div className={`${card} p-4`}>
                <div className="mb-3 flex items-center justify-between">
                  <div className="font-semibold text-sm">🏭 납기일별 생산 입력</div>
                  <button
                    className="rounded-lg border border-blue-500 bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700"
                    onClick={saveProdInputs}
                    disabled={prodSaving}
                  >
                    {prodSaving ? "저장 중..." : "💾 저장"}
                  </button>
                </div>

                {(selectedWo.work_order_items ?? []).length === 0 ? (
                  <div className="py-4 text-center text-sm text-slate-400">납기일별 항목이 없습니다.</div>
                ) : (
                  <div className="space-y-3">
                    {(selectedWo.work_order_items ?? [])
                      .slice()
                      .sort((a, b) => a.delivery_date.localeCompare(b.delivery_date))
                      .map((item) => {
                        const pi = prodInputs[item.id] ?? { actual_qty: "", unit_weight: "", expiry_date: "" };
                        const actualQty = toInt(pi.actual_qty);
                        const unitWeight = toNum(pi.unit_weight);
                        const totalWeight = actualQty > 0 && unitWeight > 0 ? actualQty * unitWeight : null;
                        const isDone = !!(pi.actual_qty && pi.unit_weight && pi.expiry_date);

                        return (
                          <div key={item.id} className={`rounded-2xl border p-3 ${isDone ? "border-green-200 bg-green-50" : "border-slate-200 bg-slate-50"}`}>
                            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                              <div className="font-semibold text-sm">
                                📅 납기일: <span className="tabular-nums">{item.delivery_date}</span>
                              </div>
                              <div className="flex items-center gap-2 text-xs">
                                <span className={pill}>주문 {fmt(item.order_qty)}개</span>
                                {isDone ? <span className="rounded-full bg-green-100 border border-green-200 px-2 py-0.5 text-xs font-semibold text-green-700">완료</span> : null}
                              </div>
                            </div>

                            {/* sub_items 테이블 */}
                            {(item.sub_items ?? []).length > 0 ? (
                              <div className="mb-3 overflow-hidden rounded-xl border border-slate-200 bg-white">
                                <table className="w-full text-xs">
                                  <thead className="bg-slate-50">
                                    <tr>
                                      <th className="px-3 py-1.5 text-left text-slate-500 font-medium">품목명</th>
                                      <th className="px-3 py-1.5 text-right text-slate-500 font-medium">주문수량</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {item.sub_items.map((si, idx) => (
                                      <tr key={idx} className="border-t border-slate-100">
                                        <td className="px-3 py-1.5 font-medium">{si.name}</td>
                                        <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-blue-700">{fmt(si.qty)}개</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            ) : null}

                            {/* 생산 입력 */}
                            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                              <div>
                                <div className="mb-1 text-xs text-slate-500">출고수량 (실생산)</div>
                                <input
                                  className={inpR}
                                  inputMode="numeric"
                                  placeholder="예: 1500"
                                  value={pi.actual_qty}
                                  onChange={(e) => setProdInputs((prev) => ({
                                    ...prev,
                                    [item.id]: { ...pi, actual_qty: e.target.value.replace(/[^\d]/g, "") }
                                  }))}
                                />
                              </div>
                              <div>
                                <div className="mb-1 text-xs text-slate-500">개당 중량 (g)</div>
                                <input
                                  className={inpR}
                                  inputMode="decimal"
                                  placeholder="예: 12.5"
                                  value={pi.unit_weight}
                                  onChange={(e) => setProdInputs((prev) => ({
                                    ...prev,
                                    [item.id]: { ...pi, unit_weight: e.target.value.replace(/[^\d.]/g, "") }
                                  }))}
                                />
                              </div>
                              <div>
                                <div className="mb-1 text-xs text-slate-500">총 중량 (자동)</div>
                                <div className={`rounded-xl border px-3 py-2 text-sm text-right tabular-nums font-semibold ${totalWeight ? "border-blue-200 bg-blue-50 text-blue-700" : "border-slate-200 bg-slate-100 text-slate-400"}`}>
                                  {totalWeight ? fmt(Math.round(totalWeight)) + "g" : "—"}
                                </div>
                              </div>
                              <div>
                                <div className="mb-1 text-xs text-slate-500">소비기한</div>
                                <input
                                  type="date"
                                  className={inp}
                                  value={pi.expiry_date}
                                  onChange={(e) => setProdInputs((prev) => ({
                                    ...prev,
                                    [item.id]: { ...pi, expiry_date: e.target.value }
                                  }))}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}

                {/* 생산 요약 */}
                {(selectedWo.work_order_items ?? []).length > 0 ? (() => {
                  const items = selectedWo.work_order_items ?? [];
                  const totalOrder = items.reduce((s, i) => s + (i.order_qty ?? 0), 0);
                  const totalActual = items.reduce((s, i) => {
                    const pi = prodInputs[i.id];
                    return s + (pi?.actual_qty ? toInt(pi.actual_qty) : (i.actual_qty ?? 0));
                  }, 0);
                  const totalWeight = items.reduce((s, i) => {
                    const pi = prodInputs[i.id];
                    const aq = pi?.actual_qty ? toInt(pi.actual_qty) : (i.actual_qty ?? 0);
                    const uw = pi?.unit_weight ? toNum(pi.unit_weight) : (i.unit_weight ?? 0);
                    return s + (aq * uw);
                  }, 0);
                  return (
                    <div className="mt-4 flex flex-wrap items-center gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                      <div>주문합계 <span className="ml-1 font-bold tabular-nums">{fmt(totalOrder)}개</span></div>
                      <div>생산합계 <span className="ml-1 font-bold tabular-nums text-blue-700">{fmt(totalActual)}개</span></div>
                      {totalWeight > 0 ? (
                        <div>총중량 <span className="ml-1 font-bold tabular-nums text-purple-700">{fmt(Math.round(totalWeight))}g ({(totalWeight / 1000).toFixed(2)}kg)</span></div>
                      ) : null}
                    </div>
                  );
                })() : null}
              </div>

              {/* 이미지 카드 */}
              {(selectedWo.images ?? []).length > 0 ? (
                <div className={`${card} p-4`}>
                  <div className="mb-3 font-semibold text-sm">🖼 인쇄 디자인 이미지</div>
                  <div className="flex flex-wrap gap-3">
                    {selectedWo.images.map((url, i) => (
                      <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                        className="block rounded-xl border border-slate-200 bg-white p-1 hover:border-blue-300 transition-colors">
                        <img src={url} alt={`디자인 ${i + 1}`} className="h-32 w-32 rounded-lg object-cover" />
                      </a>
                    ))}
                  </div>
                </div>
              ) : null}

            </div>
          ) : (
            <div className={`${card} flex items-center justify-center p-12`}>
              <div className="text-center text-slate-400">
                <div className="text-4xl mb-3">📋</div>
                <div className="text-sm">왼쪽 목록에서 작업지시서를 선택하세요</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
