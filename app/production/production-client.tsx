"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/browser";


// ─────────────────────── Types ───────────────────────
type WoSubItem = { name: string; qty: number };

type WoItemRow = {
  id: string;
  work_order_id: string;
  delivery_date: string;
  sub_items: WoSubItem[];
  order_qty: number;
  barcode_no: string | null;
  actual_qty: number | null;
  unit_weight: number | null;
  total_weight: number | null;
  expiry_date: string | null;
  order_id: string | null;
  note: string | null;
  images: string[] | null;
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
  assignee_transfer?: string | null;
  assignee_print_check?: string | null;
  assignee_production?: string | null;
  assignee_input?: string | null;
  linked_order?: { memo: string | null } | { memo: string | null }[] | null;
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
  const isAdminOrSubadmin = role === "ADMIN" || role === "SUBADMIN";

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

  // 진행상태 담당자 state
  const [woChecks, setWoChecks] = useState<{
    status_transfer: boolean;
    status_print_check: boolean;
    status_production: boolean;
    status_input: boolean;
    assignee_transfer: string;
    assignee_print_check: string;
    assignee_production: string;
    assignee_input: string;
  } | null>(null);

  // 이미지 signed URL
  const [signedImageUrls, setSignedImageUrls] = useState<string[]>([]);

  // 생산 입력 form
  const [prodInputs, setProdInputs] = useState<Record<string, {
    actual_qty: string;
    unit_weight: string;
    expiry_date: string;
  }>>({});
  const [printOpen, setPrintOpen] = useState(false);
  const [employees, setEmployees] = useState<{ id: string; name: string | null }[]>([]);

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
          assignee_transfer,assignee_print_check,assignee_production,assignee_input,
          work_order_items(id,work_order_id,delivery_date,sub_items,order_qty,barcode_no,actual_qty,unit_weight,total_weight,expiry_date,order_id,note,images),
          linked_order:orders!linked_order_id(memo)
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
      if (selectedWo) {
        const refreshed = list.find((w) => w.id === selectedWo.id);
        if (refreshed) applySelection(refreshed, false);
      }
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterDateFrom, filterDateTo]); // eslint-disable-line

  useEffect(() => { loadWoList(); }, [loadWoList]);
  useEffect(() => {
    supabase.from("employees").select("id,name,resign_date")
      .is("resign_date", null)
      .order("name").limit(500)
      .then(({ data }) => { if (data) setEmployees(data); });
  }, []);

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
      assignee_transfer: (wo as any).assignee_transfer ?? "",
      assignee_print_check: (wo as any).assignee_print_check ?? "",
      assignee_production: (wo as any).assignee_production ?? "",
      assignee_input: (wo as any).assignee_input ?? "",
    });
    setSignedImageUrls([]);
    (async () => {
      const rawPaths = wo.images ?? [];
      if (rawPaths.length === 0) return;
      const paths = rawPaths.map((v) => {
        if (v.startsWith("http")) {
          const m = v.match(/work-order-images\/(.+?)(\?|$)/);
          return m ? m[1] : null;
        }
        return v;
      }).filter(Boolean) as string[];
      if (paths.length === 0) { setSignedImageUrls(rawPaths); return; }
      const { data, error } = await supabase.storage.from("work-order-images").createSignedUrls(paths, 60 * 60);
      if (!error && data) setSignedImageUrls(data.map((d) => d.signedUrl));
      else setSignedImageUrls(rawPaths);
    })();
    const inputs: Record<string, { actual_qty: string; unit_weight: string; expiry_date: string }> = {};
    for (const item of wo.work_order_items ?? []) {
      inputs[item.id] = {
        actual_qty: item.actual_qty != null ? String(item.actual_qty) : "",
        unit_weight: item.unit_weight != null ? String(item.unit_weight) : "",
        expiry_date: item.expiry_date ?? "",
      };
    }
    setProdInputs(inputs);
    // ── 개당 중량 자동입력: unit_weight 없는 항목에 variant weight_g 조회 ──
    (async () => {
      const items = wo.work_order_items ?? [];
      const missingWeight = items.filter((item) => item.unit_weight == null && item.barcode_no);
      if (missingWeight.length === 0 && wo.variant_id == null) return;
      // barcode_no → variant_id → weight_g 조회
      const barcodes = missingWeight.map((i) => i.barcode_no).filter(Boolean) as string[];
      let weightMap: Record<string, string> = {};
      if (barcodes.length > 0) {
        const { data: pbData } = await supabase
          .from("product_barcodes")
          .select("barcode, variant_id, product_variants(weight_g)")
          .in("barcode", barcodes);
        for (const pb of pbData ?? []) {
          const wg = (pb as any).product_variants?.weight_g;
          if (wg != null && wg > 0) weightMap[(pb as any).barcode] = String(wg);
        }
      }
      // variant_id fallback: work_orders.variant_id
      let fallbackWeight = "";
      if (wo.variant_id) {
        const { data: vData } = await supabase
          .from("product_variants")
          .select("weight_g")
          .eq("id", wo.variant_id)
          .maybeSingle();
        if ((vData as any)?.weight_g != null && (vData as any).weight_g > 0) {
          fallbackWeight = String((vData as any).weight_g);
        }
      }
      setProdInputs((prev) => {
        const next = { ...prev };
        for (const item of items) {
          if (item.unit_weight != null) continue; // 이미 값 있으면 skip
          const wByBarcode = item.barcode_no ? weightMap[item.barcode_no] : undefined;
          const autoWeight = wByBarcode ?? fallbackWeight;
          if (autoWeight) {
            next[item.id] = { ...next[item.id], unit_weight: autoWeight };
          }
        }
        return next;
      });
    })();
  }

  // ── 작업지시서 삭제 (ADMIN only) ──
  async function deleteWo(woId: string) {
    if (!isAdmin) return;
    if (!confirm("작업지시서를 삭제하시겠습니까?\n(연결된 주문의 work_order_item_id도 초기화됩니다)")) return;
    try {
      await supabase.from("work_order_items").update({ order_id: null }).eq("work_order_id", woId);
      const wo = woList.find((w) => w.id === woId);
      if (wo?.linked_order_id) {
        await supabase.from("orders").update({ work_order_item_id: null }).eq("id", wo.linked_order_id);
      }
      await supabase.from("work_order_items").delete().eq("work_order_id", woId);
      const { error } = await supabase.from("work_orders").delete().eq("id", woId);
      if (error) return setMsg("삭제 실패: " + error.message);
      if (selectedWo?.id === woId) setSelectedWo(null);
      setMsg("🗑️ 작업지시서가 삭제되었습니다.");
      await loadWoList();
    } catch (e: any) {
      setMsg("삭제 오류: " + (e?.message ?? e));
    }
  }

  // ── 생산완료 버튼 핸들러 (기본정보 + 담당자 + 생산입력 + 재고대장 연동 모두 처리) ──
  async function markProductionComplete() {
    if (!selectedWo) return;

        // SUBADMIN은 담당자 4개 모두 필수
        if (!isAdmin && woChecks) {
          const missing = [
            !woChecks.assignee_transfer && "전사인쇄",
            !woChecks.assignee_print_check && "인쇄검수",
            !woChecks.assignee_production && "생산완료",
            !woChecks.assignee_input && "입력완료",
          ].filter(Boolean) as string[];
          if (missing.length > 0) {
            setMsg(`담당자를 모두 선택해주세요: ${missing.join(", ")}`);
            return;
          }
        }

    const items = (selectedWo.work_order_items ?? []).filter((item) => {
      const name = (item.sub_items ?? [])[0]?.name ?? "";
      return !name.startsWith("성형틀") && !name.startsWith("인쇄제판");
    });

    // 생산정보 입력 여부 체크
    const missingItems = items.filter((item) => {
      const pi = prodInputs[item.id];
      return !pi || !pi.actual_qty || !pi.unit_weight || !pi.expiry_date;
    });
    if (missingItems.length > 0) {
      const ok = confirm(
        "⚠️ 일부 항목에 생산정보(출고수량/개당중량/소비기한)가 입력되지 않았습니다.\n재고대장 연동이 불완전할 수 있습니다.\n\n그래도 완료 처리하시겠습니까?"
      );
      if (!ok) return;
    } else {
      if (!confirm("생산완료 처리하시겠습니까?\n기본정보·담당자·생산입력이 모두 저장되고 재고대장에 입고가 반영됩니다.")) return;
    }

    setMsg(`⏳ 시작 - role:${role}, isAdminOrSubadmin:${isAdminOrSubadmin}`);
    try {
      // ── 1. 기본정보 저장 ──
      if (isAdminOrSubadmin) {
        const { error: basicErr } = await supabase.from("work_orders").update({
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
        if (basicErr) return setMsg("기본정보 저장 실패: " + basicErr.message);
      }

      // ── 2. 담당자 저장 ──
      if (woChecks) {
        const { error: checksErr } = await supabase.from("work_orders").update({
          assignee_transfer: woChecks.assignee_transfer || null,
          assignee_print_check: woChecks.assignee_print_check || null,
          assignee_production: woChecks.assignee_production || null,
          assignee_input: woChecks.assignee_input || null,
          updated_at: new Date().toISOString(),
        }).eq("id", selectedWo.id);
        if (checksErr) return setMsg("담당자 저장 실패: " + checksErr.message);
      }

      // ── 3. 생산 입력값 저장 ──
      for (const item of items) {
        const pi = prodInputs[item.id];
        if (!pi || (!pi.actual_qty && !pi.unit_weight && !pi.expiry_date)) continue;
        const actual_qty = pi.actual_qty ? toInt(pi.actual_qty) : null;
        const unit_weight = pi.unit_weight ? toNum(pi.unit_weight) : null;
        const expiry_date = pi.expiry_date || null;
        const { error: itemErr } = await supabase.from("work_order_items").update({
          actual_qty, unit_weight, expiry_date,
        }).eq("id", item.id);
        if (itemErr) { setMsg("생산입력 저장 실패: " + itemErr.message); return; }
      }

      // variant weight_g 업데이트
      const allItems = selectedWo.work_order_items ?? [];
      const firstUw = toNum(prodInputs[allItems[0]?.id]?.unit_weight);
      if (selectedWo.variant_id && firstUw > 0) {
        await supabase.from("product_variants")
          .update({ weight_g: firstUw })
          .eq("id", selectedWo.variant_id);
      }

      // ── 4. 재고대장 연동 ──
      setMsg("⏳ 4단계: 재고대장 연동 중...");
      const now = new Date().toISOString();
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id ?? null;
      const stockErrors: string[] = [];

      for (const item of items) {
        const pi = prodInputs[item.id];
        if (!pi || !pi.actual_qty || !pi.expiry_date) continue;
        const actual_qty = toInt(pi.actual_qty);
        if (actual_qty <= 0) continue;
        const expiry_date = pi.expiry_date;

        let variantId: string | null = null;
        if (item.barcode_no) {
          const { data: pbData } = await supabase
            .from("product_barcodes")
            .select("variant_id")
            .eq("barcode", item.barcode_no)
            .maybeSingle();
          variantId = pbData?.variant_id ?? null;
        }
        if (!variantId) variantId = selectedWo.variant_id;
        if (!variantId) {
          stockErrors.push(`variant 없음 (${(item.sub_items ?? [])[0]?.name ?? item.id})`);
          continue;
        }

        let lotId: string | null = null;
        const { data: existingLot } = await supabase
          .from("lots")
          .select("id")
          .eq("variant_id", variantId)
          .eq("expiry_date", expiry_date)
          .maybeSingle();

        if (existingLot) {
          lotId = existingLot.id;
        } else {
          const { data: newLot, error: lotErr } = await supabase
            .from("lots")
            .insert({ variant_id: variantId, expiry_date })
            .select("id")
            .single();
          if (lotErr) { stockErrors.push("LOT 생성 실패 (" + expiry_date + "): " + lotErr.message); continue; }
          lotId = newLot.id;
        }

        const { error: movErr } = await supabase.from("movements").insert({
          lot_id: lotId,
          type: "IN",
          qty: actual_qty,
          happened_at: now,
          note: "작업지시서 생산완료 - " + selectedWo.work_order_no,
          created_by: userId,
        });
        if (movErr) stockErrors.push("입고 기록 실패 (" + expiry_date + "): " + movErr.message);
      }

      // ── 5. 상태 완료로 변경 ──
      const { error: statusErr } = await supabase.from("work_orders").update({
        status: "완료",
        status_production: true,
        updated_at: new Date().toISOString(),
      }).eq("id", selectedWo.id);
      if (statusErr) return setMsg("상태 변경 실패: " + statusErr.message);

     if (stockErrors.length > 0) {
        setMsg("⚠️ 저장 완료됐으나 재고 연동 오류: " + stockErrors.join(" / "));
      } else {
        setMsg("✅ 생산완료 처리 완료! 기본정보·담당자·생산입력 저장 및 재고대장 입고 반영됐습니다.");
      }

      // ===== PDF → 구글드라이브 업로드 트리거 =====
// ===== PDF → 구글드라이브 업로드 트리거 =====
try {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");

  // 특수문자 처리: *×x → x 변환 후 파일명 안전 문자만 허용
  const sanitize = (str: string) =>
    str
      .replace(/[*×]/g, "x")           // 곱하기 기호 → x
      .replace(/[\\/:?"<>|]/g, "")     // 파일명 불가 문자 제거
      .replace(/\s+/g, "_");           // 공백 → 언더스코어

  // client_name이 eProductName 앞에 포함된 경우 제거
  const clientName = selectedWo.client_name ?? "업체미상";
  const rawProductName = eProductName ?? "품목미상";
  const cleanProductName = rawProductName.startsWith(clientName)
    ? rawProductName.slice(clientName.length).replace(/^[-_\s]+/, "")
    : rawProductName;

  const fileName = [
    today,
    sanitize(clientName),
    sanitize(cleanProductName || "품목미상"),
    sanitize(eFoodType ?? ""),
    sanitize(eLogoSpec ?? ""),
    "작업지시서",
  ].filter(Boolean).join("-");

        const triggerRes = await fetch("/api/trigger-work-order-pdf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workOrderId: selectedWo.id, fileName }),
        });
        if (triggerRes.ok) {
          console.log("✅ PDF 드라이브 업로드 트리거 성공:", fileName);
        } else {
          console.error("❌ PDF 드라이브 업로드 트리거 실패");
        }
      } catch (pdfErr) {
        console.error("PDF 업로드 트리거 오류 (무시):", pdfErr);
      }
      // ===== PDF 업로드 트리거 끝 =====

      await loadWoList();
    } catch (e: any) {
      setMsg("오류: " + (e?.message ?? e));
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
                ? "SUBADMIN — 목록조회 · 기본정보수정 · 생산입력"
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
                    <div key={wo.id} className="relative group">
                      <button
                        className={`w-full rounded-2xl border p-3 text-left transition-all ${isSelected ? "border-blue-400 bg-blue-50 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"}`}
                        onClick={() => applySelection(wo)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="font-semibold text-sm truncate">
                                {(() => {
                                  const name = wo.client_name ?? "";
                                  const isMarketplace = ["네이버-판매", "카카오플러스-판매", "쿠팡-판매"].includes(name);
                                  if (!isMarketplace) return name;
                                  let ordererName = "";
                                  try {
                                    const lo = wo.linked_order;
                                    const memoRaw = Array.isArray(lo) ? lo[0]?.memo : (lo as any)?.memo;
                                    if (memoRaw) {
                                      const parsed = typeof memoRaw === "string" ? JSON.parse(memoRaw) : memoRaw;
                                      ordererName = parsed?.orderer_name ?? "";
                                    }
                                  } catch {}
                                  return ordererName ? `${name} · ${ordererName}` : name;
                                })()}
                              </span>
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
                          </div>
                        </div>
                      </button>
                      {isAdmin ? (
                        <button
                          className="absolute top-2 right-2 hidden group-hover:flex items-center justify-center w-6 h-6 rounded-full bg-red-100 text-red-500 hover:bg-red-500 hover:text-white text-xs font-bold transition-colors z-10"
                          onClick={(e) => { e.stopPropagation(); deleteWo(wo.id); }}
                          title="작업지시서 삭제"
                        >✕</button>
                      ) : null}
                    </div>
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
                  <div className="flex gap-2">
                    <button className={`${btnSm} border-slate-300`} onClick={() => setPrintOpen(true)}>🖨️ 인쇄</button>
                    <button className={btnSm} onClick={() => applySelection(selectedWo)}>↺ 초기화</button>
                  </div>
                </div>
              </div>

              {/* 기본정보 카드 - 저장 버튼 제거 */}
              <div className={`${card} p-4`}>
                <div className="mb-3 flex items-center justify-between">
                  <div className="font-semibold text-sm">📝 기본정보</div>
                  <div className="text-xs text-slate-400">생산완료 처리 시 자동 저장</div>
                </div>

                {isAdminOrSubadmin ? (
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
                        {["트레이-정사각20구", "트레이-직사각20구", "벌크"].map((v) => <option key={v} value={v}>{v}</option>)}
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
                      <input className={inpR} inputMode="numeric" placeholder="" value={eMoldPerSheet}
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

              {/* 진행상태 카드 - 저장 버튼 제거 */}
              <div className={`${card} p-4`}>
                <div className="mb-3 flex items-center justify-between">
                  <div className="font-semibold text-sm">✅ 진행상태</div>
                  <div className="text-xs text-slate-400">생산완료 처리 시 자동 저장</div>
                </div>
                {woChecks ? (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {([
                      { key: "status_transfer",    assigneeKey: "assignee_transfer",    label: "전사인쇄" },
                      { key: "status_print_check", assigneeKey: "assignee_print_check", label: "인쇄검수" },
                      { key: "status_production",  assigneeKey: "assignee_production",  label: "생산완료" },
                      { key: "status_input",       assigneeKey: "assignee_input",       label: "입력완료" },
                    ] as const).map(({ key, assigneeKey, label }) => (
                      <div key={key} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                        <div className="text-xs font-medium text-slate-600 mb-2">{label}</div>
                        <select
                          className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs focus:outline-none focus:border-blue-400"
                          value={woChecks[assigneeKey] ?? ""}
                          onChange={(e) => setWoChecks((prev) => prev ? { ...prev, [assigneeKey]: e.target.value } : prev)}
                        >
                          <option value="">— 담당자 —</option>
                          {employees.map((e) => e.name ? <option key={e.id} value={e.name}>{e.name}</option> : null)}
                        </select>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>

              {/* 납기일별 생산 입력 카드 - 저장 버튼 제거 */}
              <div className={`${card} p-4`}>
                <div className="mb-3 flex items-center justify-between">
                  <div className="font-semibold text-sm">🏭 납기일별 생산 입력</div>
                  <div className="text-xs text-slate-400">생산완료 처리 시 자동 저장</div>
                </div>

                {(selectedWo.work_order_items ?? []).length === 0 ? (
                  <div className="py-4 text-center text-sm text-slate-400">납기일별 항목이 없습니다.</div>
                ) : (
                  <div className="space-y-3">
                    {(selectedWo.work_order_items ?? [])
                      .slice()
                      .sort((a, b) => a.delivery_date.localeCompare(b.delivery_date))
                      .filter((item) => {
                        const name = (item.sub_items ?? [])[0]?.name ?? "";
                        return !name.startsWith("성형틀") && !name.startsWith("인쇄제판");
                      })
                      .map((item) => {
                        const pi = prodInputs[item.id] ?? { actual_qty: "", unit_weight: "", expiry_date: "" };
                        const actualQty = toInt(pi.actual_qty);
                        const unitWeight = toNum(pi.unit_weight);
                        const totalWeight = actualQty > 0 && unitWeight > 0 ? actualQty * unitWeight : null;
                        const isDone = !!(pi.actual_qty && pi.unit_weight && pi.expiry_date);

                        return (
                          <div key={item.id} className={`rounded-2xl border p-3 ${isDone ? "border-green-200 bg-green-50" : "border-slate-200 bg-slate-50"}`}>
                            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <div className="font-semibold text-sm">
                                  📅 납기일: <span className="tabular-nums">{item.delivery_date}</span>
                                </div>
                                {(item.sub_items ?? [])[0]?.name ? (
                                  <div className="mt-0.5 text-sm font-medium text-slate-700">
                                    {(item.sub_items[0]).name}
                                  </div>
                                ) : null}
                              </div>
                              <div className="flex items-center gap-2 text-xs">
                                <span className={pill}>주문 {fmt(item.order_qty)}개</span>
                                {isDone ? <span className="rounded-full bg-green-100 border border-green-200 px-2 py-0.5 text-xs font-semibold text-green-700">완료</span> : null}
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                              <div>
                                <div className="mb-1 text-xs text-slate-500">출고수량 (실생산)</div>
                                <input
                                  className={inpR}
                                  inputMode="numeric"
                                  placeholder=""
                                  value={pi.actual_qty}
                                  onChange={(e) => setProdInputs((prev) => ({
                                    ...prev,
                                    [item.id]: { ...pi, actual_qty: e.target.value.replace(/[^\d]/g, "") }
                                  }))}
                                />
                                <div className="mt-1 text-xs text-slate-400">주문수량: <span className="font-semibold text-slate-600">{fmt(item.order_qty)}개</span></div>
                              </div>
                              <div>
                                <div className="mb-1 text-xs text-slate-500">개당 중량 (g)</div>
                                <input
                                  className={inpR}
                                  inputMode="decimal"
                                  placeholder=""
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
                                <div className="mb-1 flex items-center justify-between">
                                  <span className="text-xs text-slate-500">소비기한</span>
                                  <button
                                    type="button"
                                    className="rounded-lg border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-200 active:bg-slate-300"
                                    onClick={() => {
                                      const d = new Date();
                                      d.setFullYear(d.getFullYear() + 1);
                                      d.setDate(d.getDate() - 1);
                                      const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                                      setProdInputs((prev) => ({
                                        ...prev,
                                        [item.id]: { ...pi, expiry_date: ymd }
                                      }));
                                    }}
                                  >+1년-1일</button>
                                </div>
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
                            {/* 품목별 이미지 표시 */}
                            {(item.images ?? []).length > 0 ? (
                              <ItemImages
                                images={item.images ?? []}
                                logoSpec={selectedWo.logo_spec}
                              />
                            ) : null}
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>

              {/* 생산완료 버튼 - 모든 저장 포함 */}
              <div className={`${card} p-4`}>
                <button
                  className="w-full rounded-xl border border-green-500 bg-green-600 py-3 text-sm font-bold text-white hover:bg-green-700 active:bg-green-800"
                  onClick={markProductionComplete}
                >
                  ✅ 생산완료 처리 (기본정보 · 담당자 · 생산입력 저장 포함)
                </button>
              </div>

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

      {/* 인쇄 모달 */}
      {printOpen && selectedWo ? (
        <PrintModal wo={selectedWo} prodInputs={prodInputs} onClose={() => setPrintOpen(false)} employees={employees} />
      ) : null}
    </div>
  );
}

// ─────────────────────── ItemImages ───────────────────────
function ItemImages({ images, logoSpec }: { images: string[]; logoSpec: string | null }) {
  const [signedUrls, setSignedUrls] = useState<string[]>([]);

  useEffect(() => {
    if (images.length === 0) return;
    (async () => {
      const paths = images.map((v) => {
        if (v.startsWith("http")) {
          const m = v.match(/work-order-images\/(.+?)(\?|$)/);
          return m ? m[1] : null;
        }
        return v;
      }).filter(Boolean) as string[];
      if (paths.length === 0) { setSignedUrls(images); return; }
      const { data, error } = await supabase.storage.from("work-order-images").createSignedUrls(paths, 60 * 60);
      if (!error && data) setSignedUrls(data.map((d) => d.signedUrl));
      else setSignedUrls(images);
    })();
  }, [images.join(",")]);

  // 규격(로고스펙)에서 크기 파싱 (예: "30*30mm", "40x40mm")
  const parseSize = (spec: string | null) => {
    if (!spec) return null;
    const m = spec.match(/(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)\s*(mm|cm)?/i);
    if (!m) return null;
    const unit = (m[3] ?? "mm").toLowerCase();
    const w = parseFloat(m[1]) * (unit === "cm" ? 37.8 : 3.78);
    const h = parseFloat(m[2]) * (unit === "cm" ? 37.8 : 3.78);
    return { w: Math.round(w), h: Math.round(h) };
  };
  const size = parseSize(logoSpec);

  if (signedUrls.length === 0) return <div className="mt-2 text-xs text-slate-400">이미지 로딩 중...</div>;

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {signedUrls.map((url, i) => (
        <a key={i} href={url} target="_blank" rel="noopener noreferrer"
          className="block rounded-xl border border-slate-200 bg-white p-1 hover:border-blue-300 transition-colors">
          <img
            src={url}
            alt={`디자인 ${i + 1}`}
            style={size ? { width: size.w, height: size.h, objectFit: "contain" } : { width: 80, height: 80, objectFit: "cover" }}
            className="rounded-lg"
          />
          {logoSpec ? <div className="mt-1 text-center text-[10px] text-slate-400">{logoSpec}</div> : null}
        </a>
      ))}
    </div>
  );
}

// ─────────────────────── PrintModal ───────────────────────
function PrintModal({
  wo, prodInputs, onClose, employees,
}: {
  wo: WorkOrderRow;
  prodInputs: Record<string, { actual_qty: string; unit_weight: string; expiry_date: string }>;
  onClose: () => void;
  employees: { id: string; name: string | null }[];
}) {
  const items = (wo.work_order_items ?? [])
    .slice()
    .sort((a, b) => a.delivery_date.localeCompare(b.delivery_date))
    .filter((item) => {
      const name = (item.sub_items ?? [])[0]?.name ?? "";
      return !name.startsWith("성형틀") && !name.startsWith("인쇄제판");
    });
  const totalOrder = items.reduce((s, i) => s + (i.order_qty ?? 0), 0);

  const [itemNotes, setItemNotes] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const item of items) init[item.id] = item.note ?? "";
    return init;
  });
  const [saving, setSaving] = useState(false);

  const [signedImages, setSignedImages] = useState<string[]>([]);
  useEffect(() => {
    async function resolveImages() {
      const rawUrls = wo.images ?? [];
      if (rawUrls.length === 0) { setSignedImages([]); return; }
      const paths = rawUrls.map((url) => {
        if (url.startsWith("http")) {
          const m = url.match(/work-order-images\/(.+?)(\?|$)/);
          return m ? m[1] : null;
        }
        return url;
      }).filter(Boolean) as string[];
      if (paths.length === 0) { setSignedImages(rawUrls); return; }
      const { data, error } = await supabase.storage.from("work-order-images").createSignedUrls(paths, 60 * 60);
      if (error || !data) { setSignedImages(rawUrls); return; }
      setSignedImages(data.map((d) => d.signedUrl));
    }
    resolveImages();
  }, [wo.images]);

  const woWithSigned = { ...wo, images: signedImages };

  async function saveAndPrint() {
    setSaving(true);
    for (const item of items) {
      const newNote = itemNotes[item.id] ?? "";
      if (newNote !== (item.note ?? "")) {
        await supabase.from("work_order_items").update({ note: newNote || null }).eq("id", item.id);
      }
    }
    setSaving(false);
    doPrint();
  }

  function doPrint() {
    const content = document.getElementById("prod-print-preview-inner");
    if (!content) return;
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;width:0;height:0;border:none;";
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) return;
    doc.open();
    doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
      <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
      <style>
        @page { size: A4 portrait; margin: 12mm 14mm; }
        body { margin: 0; font-family: 'Malgun Gothic','맑은 고딕',sans-serif; font-size: 10pt; color: #111; }
        * { box-sizing: border-box; }
        img { max-width: 100%; }
        textarea { border: 1px solid #cbd5e1 !important; background: #fff !important; }
      </style>
    </head><body>${content.innerHTML}
    <script>
      window.onload = function() {
        if (typeof JsBarcode !== "undefined") {
          document.querySelectorAll("svg[data-barcode]").forEach(function(el) {
            JsBarcode(el, el.getAttribute("data-barcode"), { format:"CODE128", displayValue:false, width:2, height:52, margin:0 });
          });
        }
        window.print();
      };
    <\/script>
    </body></html>`);
    doc.close();
    onClose();
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", flexDirection: "column", background: "#f1f5f9" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", background: "#1e3a5f", color: "#fff", flexShrink: 0 }}>
        <div style={{ fontWeight: "bold", fontSize: "14pt" }}>작업지시서 인쇄 미리보기</div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={saveAndPrint}
            disabled={saving}
            style={{ padding: "8px 20px", background: saving ? "#94a3b8" : "#2563eb", color: "#fff", border: "none", borderRadius: "6px", fontSize: "11pt", fontWeight: "bold", cursor: saving ? "not-allowed" : "pointer" }}
          >
            {saving ? "저장 중..." : "🖨️ 저장 후 인쇄"}
          </button>
          <button
            onClick={onClose}
            style={{ padding: "8px 16px", background: "#64748b", color: "#fff", border: "none", borderRadius: "6px", fontSize: "11pt", cursor: "pointer" }}
          >
            닫기
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "20px", display: "flex", justifyContent: "center" }}>
        <div style={{ background: "#fff", width: "210mm", minHeight: "297mm", padding: "12mm 14mm", boxShadow: "0 4px 24px rgba(0,0,0,0.15)" }}>
          <div id="prod-print-preview-inner">
            <WoPrintContent
              wo={woWithSigned}
              items={items}
              totalOrder={totalOrder}
              prodInputs={prodInputs}
              itemNotes={itemNotes}
              onItemNoteChange={(id, val) => setItemNotes((prev) => ({ ...prev, [id]: val }))}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function WoPrintContent({
  wo, items, totalOrder, prodInputs, itemNotes, onItemNoteChange,
}: {
  wo: WorkOrderRow;
  items: WoItemRow[];
  totalOrder: number;
  prodInputs: Record<string, { actual_qty: string; unit_weight: string; expiry_date: string }>;
  itemNotes: Record<string, string>;
  onItemNoteChange: (itemId: string, value: string) => void;
}) {
  const thS: React.CSSProperties = { background: "#f8fafc", border: "1px solid #cbd5e1", padding: "3px 6px", fontWeight: "bold", fontSize: "11pt", color: "#374151", whiteSpace: "nowrap", width: "80px" };
const tdS: React.CSSProperties = { border: "1px solid #cbd5e1", padding: "3px 8px", fontSize: "11pt" };
  const cellBase: React.CSSProperties = { border: "1px solid #cbd5e1", fontSize: "8.5pt", verticalAlign: "middle", padding: "4px 6px" };
  const cellHead: React.CSSProperties = { ...cellBase, background: "#f1f5f9", fontWeight: "bold", fontSize: "8pt", textAlign: "center", whiteSpace: "nowrap" };

  const deliveryDate = items[0]?.delivery_date ?? "";
  const isMultiItem = items.length > 1;
  const productNameDisplay = (() => {
    const names = items.map((i) => (i.sub_items ?? [])[0]?.name).filter(Boolean) as string[];
    if (names.length === 0) return wo.product_name;
    if (names.length === 1) return names[0];
    return `${names[0]} 외 ${names.length - 1}건`;
  })();

  return (
    <div style={{ fontFamily: "'Malgun Gothic','맑은 고딕',sans-serif", fontSize: "10pt", color: "#111", background: "#fff" }}>
      <div style={{ textAlign: "center", fontSize: "8.5pt", color: "#555", marginBottom: "4px", letterSpacing: "2px" }}>성실! 신뢰! 화합!</div>
      <div style={{ textAlign: "center", fontSize: "17pt", fontWeight: "bold", letterSpacing: "6px", marginBottom: "8px", borderBottom: "2px solid #111", paddingBottom: "6px" }}>
        작 업 지 시 서
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "10px" }}>
        <tbody>
          <tr>
            <td style={thS}>거래처명</td>
            <td style={tdS}>{wo.client_name}{wo.sub_name ? ` (${wo.sub_name})` : ""}</td>
            <td style={thS}>납기일</td>
            <td style={{ ...tdS, fontWeight: "bold" }}>{deliveryDate}{deliveryDate ? ` (${["일","월","화","수","목","금","토"][new Date(deliveryDate).getDay()]})` : ""}</td>
          </tr>
          <tr>
            <td style={thS}>품목명</td>
            <td style={tdS} colSpan={3}>{productNameDisplay}</td>
          </tr>
          <tr>
            <td style={thS}>식품유형</td>
            <td style={tdS}>{wo.food_type ?? "—"}</td>
            <td style={thS}>두께</td>
            <td style={tdS}>{wo.thickness ?? "—"}</td>
          </tr>
          <tr>
            <td style={thS}>규격(로고)</td>
            <td style={tdS}>{wo.logo_spec ?? "—"}</td>
            <td style={thS}>포장방법</td>
            <td style={tdS}>{wo.packaging_type ?? "—"}{wo.packaging_type === "트레이" && wo.tray_slot ? ` / ${wo.tray_slot}` : ""}</td>
          </tr>
          <tr>
            <td style={thS}>포장단위</td>
            <td style={tdS}>{wo.package_unit ?? "—"}</td>
            <td style={thS}>성형틀/장</td>
            <td style={tdS}>{wo.mold_per_sheet ? `${wo.mold_per_sheet}개` : "—"}</td>
          </tr>
          <tr>
            <td style={thS}>납품방법</td>
            <td style={tdS}>{wo.delivery_method ?? "—"}</td>
            <td style={thS}>주문일</td>
            <td style={tdS}>{(() => { const d = wo.created_at ? wo.created_at.slice(0, 10) : wo.order_date; return d ? `${d} (${["일","월","화","수","목","금","토"][new Date(d).getDay()]})` : ""; })()}</td>
          </tr>
          <tr>
            <td style={thS}>지시번호</td>
            <td style={{ ...tdS }} colSpan={3}>{wo.work_order_no}</td>
          </tr>
          {wo.note ? <tr><td style={thS}>비고</td><td style={tdS} colSpan={3}>{wo.note}</td></tr> : null}
          {wo.reference_note ? <tr><td style={thS}>참고사항</td><td style={tdS} colSpan={3}>{wo.reference_note}</td></tr> : null}
        </tbody>
      </table>

      <div style={{ fontWeight: "bold", fontSize: "9pt", marginBottom: "6px", borderLeft: "3px solid #2563eb", paddingLeft: "5px" }}>
        {isMultiItem ? `품목별 생산 현황 (총 ${items.length}건)` : "생산 현황"}
      </div>

      {items.map((item, idx) => {
        const pi = prodInputs[item.id] ?? { actual_qty: "", unit_weight: "", expiry_date: "" };
        const actualQty = item.actual_qty ?? (pi.actual_qty ? parseInt(pi.actual_qty) : null);
        const unitWeight = item.unit_weight ?? (pi.unit_weight ? parseFloat(pi.unit_weight) : null);
        const totalWeight = actualQty && unitWeight ? actualQty * unitWeight : null;
        const expiryDate = item.expiry_date ?? pi.expiry_date ?? "";
        const itemName = (item.sub_items ?? [])[0]?.name || "—";
        const itemBarcode = item.barcode_no ?? null;
        const noteVal = itemNotes[item.id] ?? (item.note ?? "");

        return (
          <div key={item.id} style={{ marginBottom: idx < items.length - 1 ? "10px" : "6px" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                <tr>
                  <td style={{ border: "1px solid #94a3b8", borderBottom: "none", padding: "5px 10px", width: "22%", background: "#1e3a5f", color: "#fff", fontWeight: "bold", fontSize: "9pt", verticalAlign: "middle" }}>
                    {itemName}
                  </td>
                  <td style={{ border: "1px solid #94a3b8", borderBottom: "none", borderLeft: "none", padding: "5px 10px", background: "#f8fafc", verticalAlign: "middle" }}>
                    {itemBarcode ? (
                      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <span style={{ fontFamily: "monospace", fontSize: "8pt", color: "#444", whiteSpace: "nowrap" }}>{itemBarcode}</span>
                        <svg data-barcode={itemBarcode} style={{ height: "52px", flex: 1, display: "block", minWidth: 0 }} />
                      </div>
                    ) : (
                      <span style={{ color: "#aaa", fontSize: "8pt" }}>바코드 없음</span>
                    )}
                  </td>
                </tr>
                <tr>
                  <td style={cellHead}>주문수량</td>
                  <td style={{ border: "1px solid #cbd5e1", borderLeft: "none", padding: 0 }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <tbody>
                        <tr>
                          <td style={{ ...cellHead, border: "none", borderRight: "1px solid #cbd5e1", width: "14%" }}>출고수량</td>
                          <td style={{ ...cellHead, border: "none", borderRight: "1px solid #cbd5e1", width: "14%" }}>개당중량(g)</td>
                          <td style={{ ...cellHead, border: "none", borderRight: "1px solid #cbd5e1", width: "14%" }}>총중량(g)</td>
                          <td style={{ ...cellHead, border: "none", borderRight: "1px solid #cbd5e1", width: "18%" }}>소비기한</td>
                          <td style={{ ...cellHead, border: "none", width: "40%" }}>비고</td>
                        </tr>
                      </tbody>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style={{ ...cellBase, textAlign: "right", fontWeight: "bold", fontSize: "11pt", borderTop: "none" }}>
                    {item.order_qty?.toLocaleString("ko-KR")}
                  </td>
                  <td style={{ border: "1px solid #cbd5e1", borderLeft: "none", borderTop: "none", padding: 0 }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <tbody>
                        <tr>
                          <td style={{ ...cellBase, border: "none", borderRight: "1px solid #cbd5e1", textAlign: "right", fontWeight: "bold", color: actualQty ? "#1d4ed8" : "#111", width: "14%" }}>
                            {actualQty != null ? actualQty.toLocaleString("ko-KR") : ""}
                          </td>
                          <td style={{ ...cellBase, border: "none", borderRight: "1px solid #cbd5e1", textAlign: "right", width: "14%" }}>
                            {unitWeight != null ? unitWeight : ""}
                          </td>
                          <td style={{ ...cellBase, border: "none", borderRight: "1px solid #cbd5e1", textAlign: "right", color: totalWeight ? "#1d4ed8" : "#999", width: "14%" }}>
                            {totalWeight ? Math.round(totalWeight).toLocaleString("ko-KR") : ""}
                          </td>
                          <td style={{ ...cellBase, border: "none", borderRight: "1px solid #cbd5e1", textAlign: "center", fontSize: "8pt", width: "18%" }}>
                            {expiryDate || ""}
                          </td>
                          <td style={{ ...cellBase, border: "none", padding: "2px", width: "40%" }}>
                            <textarea
                              value={noteVal}
                              onChange={(e) => onItemNoteChange(item.id, e.target.value)}
                              placeholder=""
                              style={{ width: "100%", height: "52px", resize: "none", border: "none", outline: "none", fontSize: "8.5pt", fontFamily: "inherit", padding: "3px 4px", background: "transparent", lineHeight: "1.4" }}
                            />
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </td>
                </tr>
              </tbody>
            </table>
              {/* 품목 이미지 - 규격 크기로 표시 */}
            {(item.images ?? []).length > 0 ? (() => {
              const parseSize = (spec: string | null) => {
                if (!spec) return null;
                const m = spec.match(/(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)\s*(mm|cm)?/i);
                if (!m) return null;
                const unit = (m[3] ?? "mm").toLowerCase();
                const w = parseFloat(m[1]) * (unit === "cm" ? 37.8 : 3.78);
                const h = parseFloat(m[2]) * (unit === "cm" ? 37.8 : 3.78);
                return { w: Math.round(w), h: Math.round(h) };
              };
              const sz = parseSize(wo.logo_spec);
              return (
                <div style={{ marginTop: "6px", display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "flex-end" }}>
                  {(item.images ?? []).map((url, imgIdx) => (
                    <div key={imgIdx} style={{ textAlign: "center" }}>
                      <img src={url} alt={`이미지${imgIdx+1}`}
                        style={{ width: sz ? sz.w : 80, height: sz ? sz.h : 80, objectFit: "contain", border: "1px solid #e2e8f0", borderRadius: "4px", display: "block" }} />
                      {wo.logo_spec ? <div style={{ fontSize: "7pt", color: "#94a3b8", marginTop: "2px" }}>{wo.logo_spec}</div> : null}
                    </div>
                  ))}
                </div>
              );
            })() : null}
          </div>
        );
      })}
    </div>
  );
}
