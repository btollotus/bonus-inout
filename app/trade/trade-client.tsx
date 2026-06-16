"use client";

import type { Metadata } from "next";
export const metadata: Metadata = { title: "거래내역(통합) | BONUSMATE ERP" };

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { WoPrintModal, isSpecialItem } from "@/app/components/wo-print";
import { usePinSession, PinModal } from "@/app/contexts/PinSessionContext";

// ─────────────────────── Types ───────────────────────
type PartnerRow = {
  id: string; name: string; business_no: string | null; ceo_name: string | null;
  biz_type: string | null; biz_item: string | null; phone: string | null;
  address1: string | null; is_pinned: boolean | null; pin_order: number | null;
  partner_type: string | null; group_name: string | null;
  ship_to_name: string | null; ship_to_address1: string | null;
  ship_to_mobile: string | null; ship_to_phone: string | null;
};
type PartnerShippingHistoryRow = {
  id: string; partner_id: string; ship_to_name: string | null;
  ship_to_address1: string | null; ship_to_mobile: string | null;
  ship_to_phone: string | null; created_at: string;
};
type OrderShipmentRow = {
  id: string; order_id: string; seq: number;
  ship_to_name: string; ship_to_address1: string; ship_to_address2: string | null;
  ship_to_mobile: string | null; ship_to_phone: string | null;
  ship_zipcode: string | null; delivery_message: string | null;
  created_at: string; updated_at: string;
};
type OrderLineRow = {
  id: string; order_id: string; line_no: number | null; food_type: string | null;
  name: string; weight_g: number | string | null; qty: number; unit: number;
  unit_type: "EA" | "BOX" | string; pack_ea: number; actual_ea: number;
  supply_amount: number | null; vat_amount: number | null; total_amount: number | null;
  is_sample?: boolean | null;
  created_at: string;
};
type OrderRow = {
  id: string; customer_id: string | null; customer_name: string | null;
  ship_date: string | null; ship_method: string | null; status: string | null;
  memo: string | null; supply_amount: number | null; vat_amount: number | null;
  total_amount: number | null; created_at: string; work_order_item_id?: string | null;
  tax_invoice_issued?: boolean | null;
  order_lines?: OrderLineRow[]; order_shipments?: OrderShipmentRow[];
};
type LedgerRow = {
  id: string; entry_date: string; entry_ts: string; direction: "IN" | "OUT" | string;
  amount: number; category: string | null; method: string | null;
  counterparty_name: string | null; business_no: string | null; memo: string | null;
  status: string | null; partner_id: string | null; created_at: string;
  supply_amount?: number | null; vat_amount?: number | null; total_amount?: number | null;
};
type WoSubItem = { name: string; qty: number };
type WoItem = {
  id: string; delivery_date: string; sub_items: WoSubItem[]; order_qty: number;
  barcode_no?: string | null; actual_qty?: number | null; unit_weight?: number | null;
  expiry_date?: string | null; note?: string | null;
};
type WorkOrderRow = {
  id: string; work_order_no: string; barcode_no: string;
  client_id: string | null; client_name: string; sub_name: string | null;
  order_date: string; food_type: string | null; product_name: string;
  logo_spec: string | null; thickness: string | null; delivery_method: string | null;
  packaging_type: string | null; tray_slot: string | null; package_unit: string | null;
  mold_per_sheet: number | null; note: string | null; reference_note: string | null;
  status: string; status_transfer: boolean; status_print_check: boolean;
  status_production: boolean; status_input: boolean; is_reorder: boolean;
  original_work_order_id: string | null; variant_id: string | null;
  images: string[]; created_at: string; work_order_items?: WoItem[];
};
type Mode = "ORDERS" | "LEDGER" | "UNIFIED";
type PartnerView = "PINNED" | "RECENT" | "ALL";
type FoodTypeRow = { id: string; name: string };
type PresetProductRow = { id: string; product_name: string; food_type: string | null; weight_g: number | string | null; barcode: string | null };
type MasterProductRow = { product_name: string; food_type: string | null; report_no: string | null; weight_g: number | null; unit_type: "EA" | "BOX" | string | null; pack_ea: number | null; barcode: string | null; variant_id?: string | null; category?: string | null };
type Line = { food_type: string; name: string; weight_g: number | string; qty: number; unit: number | string; total_incl_vat: number | string; is_sample?: boolean; stock_out_lots?: { lot_id: string; qty: string }[] };
type ShipmentSnap = { seq: number; ship_to_name: string; ship_to_address1: string; ship_to_address2?: string | null; ship_to_mobile?: string | null; ship_to_phone?: string | null; ship_zipcode?: string | null; delivery_message?: string | null };
type UnifiedRow = {
  kind: "ORDER" | "LEDGER"; date: string; tsKey: string; partnerName: string;
  ordererName: string; category: string; method: string; inAmt: number;
  outAmt: number; balance: number; rawId: string; businessNo?: string;
  ledger_partner_id?: string | null; ship_method?: string; order_title?: string | null;
  orderer_name?: string | null;
  order_lines?: Array<{ food_type?: string; name: string; weight_g?: number; qty: number; unit: number; total_amount?: number; unit_type?: "EA" | "BOX" | string; pack_ea?: number; actual_ea?: number; is_sample?: boolean | null }>;
  order_shipments?: ShipmentSnap[];
  ledger_category?: string | null; ledger_method?: string | null;
  ledger_memo?: string | null; ledger_amount?: number;
  ledger_supply_amount?: number | null; ledger_vat_amount?: number | null; ledger_total_amount?: number | null;
  linked_work_order_id?: string | null;
  tax_invoice_issued?: boolean | null;
  tax_invoice_received?: boolean | null;
  payment_completed?: boolean | null;
};
type EmployeeRow = { id: string; name: string | null; pin: string | null };
type DeletedOrderRow = {
  deleted_at: string; original_id: string; customer_name: string;
  ship_date: string; ship_method: string | null; memo: string | null;
  total_amount: number | null;
};
type DeletedLedgerRow = {
  deleted_at: string; original_id: string; entry_date: string;
  direction: string; amount: number; category: string | null;
  method: string | null; counterparty_name: string | null; memo: string | null;
};

const CHOSUNG = ["ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"].map(ch => ch.normalize("NFC"));
const JAMO_TO_CHOSUNG: Record<string, string> = {
  "\u3130": "\u3131", "\u3131": "\u3131", "\u3132": "\u3132",
  "\u3133": "\u3131", "\u3134": "\u3134", "\u3135": "\u3134",
  "\u3136": "\u3134", "\u3137": "\u3137", "\u3138": "\u3138",
  "\u3139": "\u3139", "\u313a": "\u3139", "\u313b": "\u3139",
  "\u313c": "\u3139", "\u313d": "\u3139", "\u313e": "\u3139",
  "\u313f": "\u3139", "\u3140": "\u3139",
  "\u3141": "\u3141", "\u3142": "\u3142", "\u3143": "\u3142",
  "\u3144": "\u3142", "\u3145": "\u3145", "\u3146": "\u3146",
  "\u3147": "\u3147", "\u3148": "\u3148", "\u3149": "\u3149",
  "\u314a": "\u314a", "\u314b": "\u314b", "\u314c": "\u314c",
  "\u314d": "\u314d", "\u314e": "\u314e",
};
function getChosung(str: string): string {
  return [...str].map(ch => {
    const code = ch.charCodeAt(0) - 0xAC00;
    if (code >= 0 && code <= 11171) return CHOSUNG[Math.floor(code / 588)];
    return "";
  }).join("");
}
function extractKeywordChosung(keyword: string): string {
  return [...keyword].map(ch => {
    const code = ch.charCodeAt(0) - 0xAC00;
    if (code >= 0 && code <= 11171) return CHOSUNG[Math.floor(code / 588)];
    return JAMO_TO_CHOSUNG[ch] ?? ch;
  }).join("");
}
function matchesSearch(target: string, keyword: string): boolean {
  const t = target.toLowerCase();
  const k = keyword.normalize("NFC");
  if (t.includes(k.toLowerCase())) return true;
  const kChosung = extractKeywordChosung(k);
  const isAllChosung = kChosung.length > 0 && [...kChosung].every(ch => CHOSUNG.includes(ch));
  if (isAllChosung) return getChosung(target).includes(kChosung);
  return false;
}

// ─────────────────────── Constants ───────────────────────
const CATEGORIES = ["매출입금", "매출환불", "급여", "세금", "기타"] as const;
type Category = (typeof CATEGORIES)[number];
const PARTNER_TYPES = ["CUSTOMER", "VENDOR", "BOTH"] as const;
type PartnerType = (typeof PARTNER_TYPES)[number];
const LS_RECENT_PARTNERS = "bonus_trade_recent_partners_v1";
const TRADE_TABLE_MIN_WIDTH = 1330;
const SUBADMIN_PINNED_TOP_NAMES = ["네이버-판매", "카카오플러스-판매", "쿠팡-판매"];
// 식품유형 → 분류 판별 함수
const DARK_FOOD_TYPES = ["다크화이트","다크옐로우","데코초콜릿","롤리팝다크화이트","다크핑크","다크연두","롤리팝다크핑크"];

function getFoodCategory(foodType: string | null | undefined): "다크" | "화이트" | "전사지" | null {
  const ft = (foodType ?? "").trim();
  if (!ft) return null;
  if (ft.includes("초콜릿중간재")) return "전사지";
  if (DARK_FOOD_TYPES.some((d) => ft.includes(d))) return "다크";
  return "화이트";
}

// ─────────────────────── Helpers ───────────────────────
const fmt = (n: number | null | undefined) => Number(n ?? 0).toLocaleString("ko-KR");

async function resolveSignedImageUrls(rawImages: string[], supabaseClient: ReturnType<typeof createClient>): Promise<string[]> {
  if (!rawImages || rawImages.length === 0) return [];
  const results: string[] = [];
  for (const raw of rawImages) {
    let storagePath = raw;
    if (raw.startsWith("http")) {
      const m = raw.match(/work-order-images\/(.+?)(\?|$)/);
      storagePath = m ? decodeURIComponent(m[1]) : raw;
    }
    try {
      const { data, error } = await supabaseClient.storage.from("work-order-images").createSignedUrl(storagePath, 60 * 60);
      if (!error && data?.signedUrl) results.push(data.signedUrl);
      else console.warn("[이미지 signed URL 실패]", storagePath, error?.message);
    } catch (e) { console.warn("[이미지 signed URL 오류]", storagePath, e); }
  }
  return results;
}

function formatWeight(n: number | null | undefined) {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v) || v === 0) return "";
  if (Math.abs(v - Math.round(v)) < 1e-9) return Math.round(v).toLocaleString("ko-KR");
  return v.toLocaleString("ko-KR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })
    .replace(/(\.\d*?[1-9])0+$/g, "$1").replace(/\.0+$/g, "");
}

const toInt = (n: any) => { const v = Number(String(n ?? "").replaceAll(",", "")); return Number.isFinite(v) ? Math.trunc(v) : 0; };
const toIntSigned = (n: any) => { const s = String(n ?? "").replaceAll(",", "").trim(); if (!s || s === "-") return 0; const v = Number(s); return Number.isFinite(v) ? Math.trunc(v) : 0; };
const toNum = (n: any) => { const s = String(n ?? "").replaceAll(",", "").trim(); if (!s) return 0; const v = Number(s); return Number.isFinite(v) ? v : 0; };

function sanitizeSignedIntInput(raw: string) {
  let v = raw.replace(/[^\d,-]/g, "");
  v = v.replace(/(?!^)-/g, "");
  return v;
}
function sanitizeDecimalInput(raw: string) {
  let v = raw.replace(/[^\d.,]/g, "");
  const firstDot = v.indexOf(".");
  if (firstDot >= 0) v = v.slice(0, firstDot + 1) + v.slice(firstDot + 1).replaceAll(".", "");
  return v;
}
const safeJsonParse = <T,>(s: string | null): T | null => { if (!s) return null; try { return JSON.parse(s) as T; } catch { return null; } };
const todayYMD = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
function addDays(ymd: string, delta: number) {
  const d = new Date(ymd + "T00:00:00"); d.setDate(d.getDate() + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const categoryToDirection = (c: Category): "IN" | "OUT" => c === "매출입금" ? "IN" : "OUT";

async function applyStockOutLots(
  supabaseClient: ReturnType<typeof createClient>,
  cleanLines: Array<{ name: string; stock_out_lots?: { lot_id: string; qty: string }[] }>,
  refId: string,
  workOrderNo: string | null,
  shipDateYMD: string,
  userId: string | null
): Promise<string[]> {
  const errors: string[] = [];
  for (const line of cleanLines) {
    const lots = line.stock_out_lots ?? [];
    for (const t of lots) {
      const qty = toInt(t.qty);
      if (!t.lot_id || qty <= 0) continue;
      const { data: movData } = await supabaseClient.from("movements").select("type, qty").eq("lot_id", t.lot_id);
      const remaining = (movData ?? []).reduce((sum: number, m: any) => m.type === "IN" ? sum + m.qty : sum - m.qty, 0);
      if (qty > remaining) {
        errors.push(`"${line.name}" 재고 차감 실패: 차감(${qty}) > 잔량(${remaining})`);
        continue;
      }
      const noteRef = workOrderNo ? workOrderNo : refId;
      const { error: movErr } = await supabaseClient.from("movements").insert({
        lot_id: t.lot_id, type: "OUT", qty,
        happened_at: `${shipDateYMD}T00:00:00+09:00`,
        note: `거래내역 OUT - ${noteRef} - ${line.name}`,
        created_by: userId,
      });
      if (movErr) errors.push(`"${line.name}" 재고 차감 실패: ${movErr.message}`);
    }
  }
  return errors;
}

// ── Step4: 재고부족(마켓플레이스) 시 임시 lot + 임시 작업지시서 생성 (멱등성 처리 포함) ──
async function createTempLotForShortage(
  supabaseClient: ReturnType<typeof createClient>,
  variantId: string,
  qty: number,
  lineName: string,
  shipDateYMD: string,
  partnerName: string,
  userId: string | null,
  orderId: string
): Promise<{ workOrderNo: string | null; error: string | null }> {
  const noteKey = `재고부족 임시출고 - ${orderId} - ${lineName}`;

  // 0. 기존 임시 lot/작업지시서 존재 여부 확인 (멱등성 — 같은 주문/같은 라인이면 신규생성 대신 수량만 갱신)
  const { data: existingMov } = await supabaseClient.from("movements")
    .select("id, lot_id, qty").eq("note", noteKey).limit(1).maybeSingle();

  if (existingMov) {
    const { error: movUpdErr } = await supabaseClient.from("movements").update({
      qty, happened_at: `${shipDateYMD}T00:00:00+09:00`,
    }).eq("id", existingMov.id);
    if (movUpdErr) return { workOrderNo: null, error: `"${lineName}" 임시 lot 수량 수정 실패: ${movUpdErr.message}` };

    const { data: lotRow } = await supabaseClient.from("lots").select("work_order_id").eq("id", existingMov.lot_id).maybeSingle();
    const existingWoId = (lotRow as any)?.work_order_id ?? null;
    let existingWoNo: string | null = null;
    if (existingWoId) {
      const { data: woRow } = await supabaseClient.from("work_orders").select("work_order_no").eq("id", existingWoId).maybeSingle();
      existingWoNo = (woRow as any)?.work_order_no ?? null;
      const { error: itemUpdErr } = await supabaseClient.from("work_order_items").update({
        sub_items: [{ name: lineName, qty }], order_qty: qty,
      }).eq("work_order_id", existingWoId);
      if (itemUpdErr) return { workOrderNo: existingWoNo, error: `"${lineName}" 임시 작업지시서 수량 수정 실패: ${itemUpdErr.message}` };
    }
    return { workOrderNo: existingWoNo, error: null };
  }

  // 1. 임시 lot 생성 (is_temp=true, expiry_date=null)
  const { data: newLot, error: lotErr } = await supabaseClient.from("lots").insert({
    variant_id: variantId, expiry_date: null, is_temp: true,
  }).select("id").single();
  if (lotErr || !newLot) return { workOrderNo: null, error: `"${lineName}" 임시 lot 생성 실패: ${lotErr?.message ?? ""}` };

  // 2. movements OUT (음수재고 기록)
  const { error: movErr } = await supabaseClient.from("movements").insert({
    lot_id: newLot.id, type: "OUT", qty,
    happened_at: `${shipDateYMD}T00:00:00+09:00`,
    note: noteKey,
    created_by: userId,
  });
  if (movErr) return { workOrderNo: null, error: `"${lineName}" 임시 lot 재고차감 실패: ${movErr.message}` };

  // 3. 동일 variant_id 최근 작업지시서 설정 조회 (이전 설정 자동복사)
  const { data: prevWo } = await supabaseClient.from("work_orders")
    .select("sub_name, food_type, logo_spec, thickness, packaging_type, delivery_method, package_unit, mold_cols, mold_rows, mold_count, note, product_name")
    .eq("variant_id", variantId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // 3-1. 이전 WO의 food_type이 비어있으면 products.food_type을 fallback으로 사용
  let fallbackFoodType: string | null = null;
  if (!prevWo?.food_type) {
    const { data: variantRow } = await supabaseClient.from("product_variants")
      .select("products(food_type)")
      .eq("id", variantId)
      .maybeSingle();
    fallbackFoodType = (variantRow as any)?.products?.food_type ?? null;
  }

  // 4. 작업지시서 번호/바코드 생성
  const { data: barcodeData, error: barcodeErr } = await supabaseClient.rpc("generate_work_order_barcode");
  if (barcodeErr) return { workOrderNo: null, error: `"${lineName}" 바코드 생성 실패: ${barcodeErr.message}` };
  const todayStr = (() => { const d = new Date(); return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`; })();
  const { data: newWoNo, error: woNoErr } = await supabaseClient.rpc("generate_work_order_no", { date_str: todayStr });
  if (woNoErr || !newWoNo) return { workOrderNo: null, error: `"${lineName}" 작업지시서 번호 생성 실패: ${woNoErr?.message ?? ""}` };

  // 5. 임시 작업지시서 생성 (이전 설정 복사, 없으면 빈 값)
  const moldCols = prevWo?.mold_cols ?? null;
  const moldRows = prevWo?.mold_rows ?? null;
  const { data: createdWo, error: woErr } = await supabaseClient.from("work_orders").insert({
    work_order_no: newWoNo, barcode_no: barcodeData,
    client_id: null, client_name: partnerName,
    sub_name: prevWo?.sub_name ?? null,
    order_date: todayYMD(),
    food_type: prevWo?.food_type ?? fallbackFoodType,
    product_name: prevWo?.product_name ?? lineName,
    logo_spec: prevWo?.logo_spec ?? null,
    thickness: prevWo?.thickness ?? null,
    delivery_method: prevWo?.delivery_method ?? null,
    packaging_type: prevWo?.packaging_type ?? null,
    package_unit: prevWo?.package_unit ?? null,
    mold_cols: moldCols, mold_rows: moldRows,
    mold_per_sheet: (moldCols && moldRows) ? moldCols * moldRows : null,
    mold_count: prevWo?.mold_count ?? null,
    note: prevWo?.note ?? null,
    status: "생산중", variant_id: variantId, images: [],
  }).select("id").single();
  if (woErr || !createdWo) return { workOrderNo: null, error: `"${lineName}" 임시 작업지시서 생성 실패: ${woErr?.message ?? ""}` };

  // 6. 부족분 수량으로 작업지시서 항목 생성
  const { error: itemErr } = await supabaseClient.from("work_order_items").insert({
    work_order_id: createdWo.id, delivery_date: shipDateYMD,
    sub_items: [{ name: lineName, qty }], order_qty: qty,
    barcode_no: barcodeData,
  });
  if (itemErr) return { workOrderNo: newWoNo, error: `"${lineName}" 작업지시서 항목 생성 실패: ${itemErr.message}` };

  // 7. 임시 lot ↔ 작업지시서 연결
  const { error: lotUpdErr } = await supabaseClient.from("lots").update({ work_order_id: createdWo.id }).eq("id", newLot.id);
  if (lotUpdErr) return { workOrderNo: newWoNo, error: `"${lineName}" 임시 lot 연결 실패: ${lotUpdErr.message}` };

  return { workOrderNo: newWoNo, error: null };
}

const methodLabel = (m: any) => ({ BANK: "입금", CASH: "현금", CARD: "카드", ETC: "기타" }[String(m ?? "").trim()] ?? String(m ?? "").trim());
const normText = (s: any) => { const v = String(s ?? "").trim(); return v === "" ? null : v; };
const fmtKST = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };

function calcLineAmounts(qtyRaw: any, unitRaw: any, totalInclVatRaw: any) {
  const qty = toInt(qtyRaw), unit = toIntSigned(unitRaw), totalInclVat = toIntSigned(totalInclVatRaw);
  if (unit !== 0) {
    if (qty <= 0) return { supply: 0, vat: 0, total: 0 };
    const supply = qty * unit, vat = Math.round(supply * 0.1);
    return { supply, vat, total: supply + vat };
  }
  if (totalInclVat !== 0) {
    const supply = Math.round(totalInclVat / 1.1), vat = totalInclVat - supply;
    return { supply, vat, total: totalInclVat };
  }
  return { supply: 0, vat: 0, total: 0 };
}

function splitVatFromTotalFlexible(totalInclVatRaw: any, vatFree: boolean) {
  const total = toIntSigned(totalInclVatRaw);
  if (!Number.isFinite(total) || total === 0) return { supply: 0, vat: 0, total: 0 };
  if (vatFree) return { supply: total, vat: 0, total };
  const supply = Math.round(total / 1.1);
  const vat = total - supply;
  return { supply, vat, total };
}

function inferPackEaFromName(name: string) {
  if (String(name ?? "").trim() === "컬러프린트용트랜스퍼시트(초콜릿중간재)") return 2;
  const m = String(name ?? "").match(/(\d+)\s*(?:개|ea)/i);
  if (!m) return 1;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 1;
}

function buildMemoText(r: UnifiedRow) {
  if (r.kind === "ORDER") {
    const title = r.order_title ?? "", orderer = r.orderer_name ?? "";
    const shipList = (r.order_shipments ?? []).slice()
      .sort((a, b) => (a.seq ?? 1) - (b.seq ?? 1))
      .map((s) => {
        const msg = String(s.delivery_message ?? "").trim();
        const mobile = String(s.ship_to_mobile ?? "").trim(), phone = String(s.ship_to_phone ?? "").trim();
        return `- 배송지${s.seq}: ${s.ship_to_name}\n  주소: ${s.ship_to_address1}\n  연락처: ${mobile || "-"} / ${phone || "-"}${msg ? `\n  배송메세지: ${msg}` : ""}`;
      }).join("\n");
    const rows = (r.order_lines ?? []).map((l, idx) => {
      const qty = Number(l.qty ?? 0), unit = Number(l.unit ?? 0), totalAmount = Number(l.total_amount ?? 0);
      let supply = 0, vat = 0, total = 0;
      if (unit !== 0) { supply = qty * unit; vat = Math.round(supply * 0.1); total = supply + vat; }
      else if (totalAmount !== 0) { total = totalAmount; supply = Math.round(total / 1.1); vat = total - supply; }
      const ft = String(l.food_type ?? "").trim(), name = String(l.name ?? "").trim(), w = Number(l.weight_g ?? 0);
      const unitType = String(l.unit_type ?? "EA"), packEa = Number(l.pack_ea ?? 1), actualEa = Number(l.actual_ea ?? (unitType === "BOX" ? qty * packEa : qty));
      const qtyText = unitType === "BOX" ? `박스 ${fmt(qty)} (입수 ${fmt(packEa)} / 실제 ${fmt(actualEa)}ea)` : `수량 ${fmt(qty)}`;
      const unitText = unit !== 0 ? `단가 ${fmt(unit)}` : `총액입력 ${fmt(total)}`;
      return `${idx + 1}. ${ft ? `[${ft}] ` : ""}${name} / ${w ? `${formatWeight(w)}g, ` : ""}${qtyText} / ${unitText} / 공급가 ${fmt(supply)} / 부가세 ${fmt(vat)} / 총액 ${fmt(total)}`;
    }).join("\n");
    return `주문/출고 메모\n- 출고방법: ${r.ship_method ?? ""}\n- 주문자: ${orderer || "(없음)"}\n- 제목: ${title || "(없음)"}\n\n배송정보:\n${shipList || "(배송정보 없음)"}\n\n품목:\n${rows || "(제품 없음)"}`;
  }
  const memo = (r.ledger_memo ?? "").trim(), cat = r.ledger_category ?? r.category ?? "";
  const method = methodLabel(r.ledger_method ?? r.method ?? ""), amt = Number(r.ledger_amount ?? 0);
  return `금전출납 메모\n- 카테고리: ${cat}\n- 결제수단: ${method}\n- 금액: ${fmt(amt)}\n\n메모:\n${memo || "(없음)"}`;
}

function loadRecentFromLS(): string[] {
  try {
    const raw = localStorage.getItem(LS_RECENT_PARTNERS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch { return []; }
}
function saveRecentToLS(ids: string[]) { try { localStorage.setItem(LS_RECENT_PARTNERS, JSON.stringify(ids)); } catch { } }

function buildOrderSummaryText(r: UnifiedRow) {
  if (r.kind !== "ORDER") return (r.ledger_memo ?? "").trim();
  const lines = (r.order_lines ?? []) as Array<{ name: string }>;
  if (!lines.length) return (r.order_title ?? "").trim();
  const first = String(lines[0]?.name ?? "").trim();
  const rest = Math.max(0, lines.length - 1);
  if (first && rest > 0) return `${first} 외 ${rest}건`;
  if (first) return first;
  return rest > 0 ? `외 ${rest}건` : "";
}

// ─────────────────────── Sub-components ───────────────────────
type ShipFormState = { name: string; addr: string; mobile: string; phone: string; msg: string };
const emptyShip = (): ShipFormState => ({ name: "", addr: "", mobile: "", phone: "", msg: "" });
function ImeSafeInput({ value, onValueChange, className, placeholder, name, autoComplete, inputMode, disabled, lang }: {
  value: string; onValueChange: (v: string) => void; className: string;
  placeholder?: string; name?: string; autoComplete?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"]; disabled?: boolean; lang?: string;
}) {
  const [local, setLocal] = useState<string>(value ?? "");
  const composingRef = useRef(false);
  useEffect(() => { if (!composingRef.current) setLocal(value ?? ""); }, [value]);
  return (
    <input className={className} placeholder={placeholder} name={name} autoComplete={autoComplete}
      inputMode={inputMode} disabled={disabled} value={local} lang={lang}

      onCompositionStart={() => { composingRef.current = true; }}
      onCompositionEnd={(e) => { composingRef.current = false; const v = (e.currentTarget as HTMLInputElement).value; setLocal(v); onValueChange(v); }}
      onChange={(e) => { const v = e.target.value; setLocal(v); if (!composingRef.current) onValueChange(v); }}
    />
  );
}

function ShipmentForm({ label, value, onChange, cls, namePrefix }: {
  label: string; value: ShipFormState; onChange: (p: Partial<ShipFormState>) => void; cls: string; namePrefix: string;
}) {
  return (
    <div className="space-y-2">
      <div className="mb-2 text-sm font-semibold">{label}</div>
      <ImeSafeInput className={cls} placeholder="수화주명" lang="ko" value={value.name} name={`${namePrefix}_name`} autoComplete="off" onValueChange={(v) => onChange({ name: v })} />
<ImeSafeInput className={cls} placeholder="주소1" lang="ko" value={value.addr} name={`${namePrefix}_addr`} autoComplete="off" onValueChange={(v) => onChange({ addr: v })} />
<ImeSafeInput className={cls} placeholder="배송메세지" lang="ko" value={value.msg} name={`${namePrefix}_msg`} autoComplete="off" onValueChange={(v) => onChange({ msg: v })} />
      <div className="grid grid-cols-2 gap-2">
        <ImeSafeInput className={cls} placeholder="휴대폰" value={value.mobile} name={`${namePrefix}_mobile`} autoComplete="off" onValueChange={(v) => onChange({ mobile: v })} />
        <ImeSafeInput className={cls} placeholder="전화" value={value.phone} name={`${namePrefix}_phone`} autoComplete="off" onValueChange={(v) => onChange({ phone: v })} />
      </div>
    </div>
  );
}

type StockLotInfo = { lot_id: string; expiry_date: string; pack_unit: number | null; stock_qty: number };
type LineRowProps = {
  l: Line; i: number; onUpdate: (i: number, p: Partial<Line>) => void; onRemove: (i: number) => void;
  presetByName: Map<string, PresetProductRow>; masterByName: Map<string, MasterProductRow>;
  inputCls: string; inputRightCls: string; btnCls: string; gridCols: string; qtyBadgeCls: string;
  supabaseClient?: ReturnType<typeof createClient>;
};
function LineRow({ l, i, onUpdate, onRemove, presetByName, masterByName, inputCls, inputRightCls, btnCls, gridCols, qtyBadgeCls, supabaseClient }: LineRowProps) {
  const r = calcLineAmounts(l.qty, l.unit, l.total_incl_vat);
  const pack = inferPackEaFromName(l.name);
  const [stockLots, setStockLots] = useState<StockLotInfo[]>([]);
  const [stockLoading, setStockLoading] = useState(false);
  const variantId = masterByName.get(l.name)?.variant_id ?? null;
  useEffect(() => {
    if (!variantId || !supabaseClient) { setStockLots([]); return; }
    let cancelled = false;
    setStockLoading(true);
    supabaseClient.from("v_stock_by_lot").select("lot_id,expiry_date,pack_unit,stock_qty").eq("variant_id", variantId).order("expiry_date", { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        setStockLoading(false);
        if (!error && data) setStockLots(data as StockLotInfo[]);
        else setStockLots([]);
      });
    return () => { cancelled = true; };
  }, [variantId, supabaseClient]);
  return (
    <div className={`grid ${gridCols} gap-2`}>
<input className={inputCls} lang="ko" list="food-types-list" value={l.food_type} onChange={(e) => onUpdate(i, { food_type: e.target.value })} />
<input className={inputCls} lang="ko" list="preset-products-list" value={l.name}    
        onChange={(e) => {
          const v = e.target.value; onUpdate(i, { name: v });
          const hitPreset = presetByName.get(v);
          if (hitPreset) onUpdate(i, { food_type: hitPreset.food_type ?? "", weight_g: toNum(hitPreset.weight_g) });
          else { const hitMaster = masterByName.get(v); if (hitMaster) onUpdate(i, { food_type: hitMaster.food_type ?? "", weight_g: Number(hitMaster.weight_g ?? 0) }); }
        }}
      />
      <input className={inputRightCls} inputMode="decimal"
        value={typeof l.weight_g === "string" ? l.weight_g : formatWeight(l.weight_g)}
        onChange={(e) => onUpdate(i, { weight_g: sanitizeDecimalInput(e.target.value) })}
        onBlur={() => onUpdate(i, { weight_g: toNum(l.weight_g) })}
      />
      <div className="flex items-center gap-1">
      <input className={inputRightCls} inputMode="numeric"
  value={l.qty ? fmt(l.qty) : ""}
  onChange={(e) => { const raw = e.target.value.replace(/[^\d,]/g, ""); onUpdate(i, { qty: raw === "" ? 0 : toInt(raw) }); }}
  placeholder="수량"
/>
<span className={pack > 1
  ? "shrink-0 inline-flex items-center justify-center rounded-lg border border-blue-400 bg-blue-600 px-2 py-1 text-[11px] font-extrabold text-white"
  : "shrink-0 inline-flex items-center justify-center rounded-lg border border-red-400 bg-red-500 px-2 py-1 text-[11px] font-extrabold text-white"
}>{pack > 1 ? "BOX" : "EA"}</span>
      </div>
      <input className={inputRightCls} inputMode="text"
        value={typeof l.unit === "string" ? l.unit : l.unit !== 0 ? fmt(l.unit) : ""}
        onChange={(e) => { const raw = sanitizeSignedIntInput(e.target.value); onUpdate(i, { unit: raw, ...(toIntSigned(raw) !== 0 ? { total_incl_vat: "" } : {}) }); }}
      />
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-right tabular-nums">{fmt(r.supply)}</div>
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-right tabular-nums">{fmt(r.vat)}</div>
      <input className={inputRightCls} inputMode="text" placeholder="총액"
        disabled={toIntSigned(l.unit) !== 0}
        value={toIntSigned(l.unit) !== 0 ? fmt(r.total) : typeof l.total_incl_vat === "string" ? l.total_incl_vat : l.total_incl_vat !== 0 ? fmt(l.total_incl_vat) : ""}
        onChange={(e) => onUpdate(i, { total_incl_vat: sanitizeSignedIntInput(e.target.value) })}
      />
     <div className="flex items-center gap-1">
        <label className="flex items-center gap-1 shrink-0 cursor-pointer select-none">
          <input type="checkbox" checked={!!l.is_sample}
            onChange={(e) => onUpdate(i, { is_sample: e.target.checked, ...(e.target.checked ? { unit: 0, total_incl_vat: 0 } : {}) })} />
          <span className="text-[11px] text-slate-500">샘플</span>
        </label>
        <button className={btnCls} onClick={() => onRemove(i)} title="삭제">✕</button>
      </div>
      {variantId ? (
        <div className="col-span-full">
          {stockLoading ? (
            <div className="mt-1 text-[11px] text-slate-400">재고 조회 중...</div>
          ) : stockLots.length > 0 ? (
            <div className="mt-1 space-y-1">
             <div className="flex flex-wrap gap-1.5">
                {stockLots.map((sl) => {
                  const selected = (l.stock_out_lots ?? []).find((t) => t.lot_id === sl.lot_id);
                  if (selected) return null;
                  if (sl.stock_qty <= 0) return null;
                  return (
                    <button key={sl.lot_id} type="button"
                      className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 hover:bg-emerald-100"
                      onClick={() => onUpdate(i, { stock_out_lots: [...(l.stock_out_lots ?? []), { lot_id: sl.lot_id, qty: "" }] })}
                      title="클릭하면 이 LOT에서 재고 차감">
                      + {sl.expiry_date} · {sl.stock_qty.toLocaleString()}EA
                    </button>
                  );
                })}
              </div>
              {(l.stock_out_lots ?? []).length > 0 && (
                <div className="space-y-1">
                  {(l.stock_out_lots ?? []).map((t, tIdx) => {
                    const sl = stockLots.find((s) => s.lot_id === t.lot_id);
                    const usedByOthers = (l.stock_out_lots ?? []).filter((_, idx2) => idx2 !== tIdx).reduce((s, o) => o.lot_id === t.lot_id ? s + toInt(o.qty) : s, 0);
                    const effectiveRemaining = (sl?.stock_qty ?? 0) - usedByOthers;
                    const afterDeduct = effectiveRemaining - toInt(t.qty);
                    return (
                      <div key={tIdx} className="flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-2 py-1">
                        <span className="text-[11px] font-semibold text-violet-700 shrink-0">{sl?.expiry_date ?? t.lot_id}</span>
                        <span className="text-[11px] text-slate-500 shrink-0">잔량 {effectiveRemaining.toLocaleString()}EA</span>
                        <input className="flex-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-right tabular-nums focus:border-violet-400 focus:outline-none"
                          inputMode="numeric" placeholder="차감 수량" value={t.qty}
                          onChange={(e) => {
                            const next = [...(l.stock_out_lots ?? [])];
                            next[tIdx] = { ...next[tIdx], qty: e.target.value.replace(/[^\d]/g, "") };
                            onUpdate(i, { stock_out_lots: next });
                          }} />
                        {t.qty && (
                          <span className={`text-[11px] shrink-0 ${afterDeduct < 0 ? "text-red-600 font-semibold" : "text-slate-500"}`}>차감후 {afterDeduct.toLocaleString()}</span>
                        )}
                        <button type="button" className="text-[11px] text-slate-400 hover:text-red-500 shrink-0"
                          onClick={() => onUpdate(i, { stock_out_lots: (l.stock_out_lots ?? []).filter((_, idx2) => idx2 !== tIdx) })}>✕</button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="mt-1 text-[11px] text-slate-400">재고 없음</div>
          )}
        </div>
      ) : null}
    </div>
  );
}

const LineHeader = ({ gridCols }: { gridCols: string }) => (
  <div className={`mt-3 grid ${gridCols} gap-2 text-xs text-slate-600`}>
    {["식품유형", "제품명", "무게(g)", "수량", "단가", "공급가", "부가세", "총액(입력)", ""].map((h, i) => (
      <div key={i} className={i < 8 ? "pl-3" : ""}>{h}</div>
    ))}
  </div>
);

function ShipBlock({ s1, setS1, s2, setS2, two, setTwo, prefix, inpClass }: {
  s1: ShipFormState; setS1: (v: ShipFormState) => void;
  s2: ShipFormState; setS2: (v: ShipFormState) => void;
  two: boolean; setTwo: (v: boolean) => void; prefix: string; inpClass: string;
}) {
  return (
    <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
      <div className="mb-2 text-sm font-semibold">배송정보(주문 스냅샷)</div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-3">
          <ShipmentForm label="배송지 1" value={s1} onChange={(p) => setS1({ ...s1, ...p })} cls={inpClass} namePrefix={`${prefix}_ship1`} />
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-semibold">배송지 2 (선택)</div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={two} onChange={(e) => setTwo(e.target.checked)} />2곳 배송</label>
          </div>
          {two ? <ShipmentForm label="" value={s2} onChange={(p) => setS2({ ...s2, ...p })} cls={inpClass} namePrefix={`${prefix}_ship2`} /> : <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-500">2곳 배송이 아니면 비워둡니다.</div>}
        </div>
      </div>
      <div className="mt-2 text-xs text-slate-500">※ 배송정보는 주문마다 저장됩니다(스냅샷). 거래처(업체)명과 수화주명은 다를 수 있습니다.</div>
    </div>
  );
}

// ─────────────────────── Main Component ───────────────────────
export default function TradeClient({ role = "ADMIN" }: { role?: string }) {
  const isSubAdmin = role === "SUBADMIN";
  const supabase = useMemo(() => createClient(), []);
  const { session: pinSession, isValid: isPinValid, login: pinLogin } = usePinSession();
  const [showDeletePinModal, setShowDeletePinModal] = useState(false);
  const [deletePinTargetRow, setDeletePinTargetRow] = useState<UnifiedRow | null>(null);

 
  const [msg, setMsg] = useState<string | null>(null);
  const [showTopBtn, setShowTopBtn] = useState(false);
  const [mode, setMode] = useState<Mode>(isSubAdmin ? "ORDERS" : "UNIFIED");
  const [memoOpen, setMemoOpen] = useState(false);
  const [memoTitle, setMemoTitle] = useState("");
  const [memoBody, setMemoBody] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [editRow, setEditRow] = useState<UnifiedRow | null>(null);
  const [partnerEditOpen, setPartnerEditOpen] = useState(false);
  const [showPartnerForm, setShowPartnerForm] = useState(false);
  const [shipHistOpen, setShipHistOpen] = useState(false);
  const [shipHistLoading, setShipHistLoading] = useState(false);
  const [shipHist, setShipHist] = useState<PartnerShippingHistoryRow[]>([]);
  const [includeOpening, setIncludeOpening] = useState(true);
  const [openingBalance, setOpeningBalance] = useState(0);
  const [tradeSearch, setTradeSearch] = useState("");
  const [tradeSearchDebounced, setTradeSearchDebounced] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<UnifiedRow[] | null>(null);
  const [searchRefreshTick, setSearchRefreshTick] = useState(0);
  const toTouched_search = useRef(false);
  const [toTouched, setToTouched] = useState(false);
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertText, setAlertText] = useState("");

  useEffect(() => { if (!msg) return; setAlertText(msg); setAlertOpen(true); setMsg(null); }, [msg]);

  const [partnerView, setPartnerView] = useState<PartnerView>(isSubAdmin ? "PINNED" : "ALL");
  const [partnerFilter, setPartnerFilter] = useState("");
  const [partners, setPartners] = useState<PartnerRow[]>([]);
  const [selectedPartner, setSelectedPartner] = useState<PartnerRow | null>(null);
  const [recentPartnerIds, setRecentPartnerIds] = useState<string[]>([]);

  const [p_name, setP_name] = useState(""); const [p_businessNo, setP_businessNo] = useState("");
  const [p_ceo, setP_ceo] = useState(""); const [p_phone, setP_phone] = useState("");
  const [p_address1, setP_address1] = useState(""); const [p_bizType, setP_bizType] = useState("");
  const [p_bizItem, setP_bizItem] = useState(""); const [p_partnerType, setP_partnerType] = useState<PartnerType>("CUSTOMER");

  const [ep_name, setEP_name] = useState(""); const [ep_businessNo, setEP_businessNo] = useState("");
  const [ep_ceo, setEP_ceo] = useState(""); const [ep_phone, setEP_phone] = useState("");
  const [ep_address1, setEP_address1] = useState(""); const [ep_bizType, setEP_bizType] = useState("");
  const [ep_bizItem, setEP_bizItem] = useState(""); const [ep_partnerType, setEP_partnerType] = useState<PartnerType>("CUSTOMER");
  const [shipEdit, setShipEdit] = useState<ShipFormState>(emptyShip());

  const [foodTypes, setFoodTypes] = useState<FoodTypeRow[]>([]);
  const [presetProducts, setPresetProducts] = useState<PresetProductRow[]>([]);
  const [masterProducts, setMasterProducts] = useState<MasterProductRow[]>([]);
  const presetByName = useMemo(() => { const m = new Map<string, PresetProductRow>(); for (const p of presetProducts) m.set(p.product_name, p); return m; }, [presetProducts]);
  const masterByName = useMemo(() => { const m = new Map<string, MasterProductRow>(); for (const p of masterProducts) m.set(p.product_name, p); return m; }, [masterProducts]);

  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [salaryEmployeeId, setSalaryEmployeeId] = useState<string>("");

  const [shipDate, setShipDate] = useState(todayYMD());
  const [ordererName, setOrdererName] = useState("");
  const [shipMethod, setShipMethod] = useState("택배");
  const [orderTitle, setOrderTitle] = useState("");
  const [lines, setLines] = useState<Line[]>([{ food_type: "", name: "", weight_g: 0, qty: 0, unit: "", total_incl_vat: "" }]);
  const [ship1, setShip1] = useState<ShipFormState>(emptyShip());
  const [ship2, setShip2] = useState<ShipFormState>(emptyShip());
  const [twoShip, setTwoShip] = useState(false);
  const [orderWoSubName, setOrderWoSubName] = useState("");
  const [orderWoLogoSpec, setOrderWoLogoSpec] = useState("");
  const [orderWoThickness, setOrderWoThickness] = useState("2mm");
  const [orderWoMoldPerSheet, setOrderWoMoldPerSheet] = useState("");
  const [orderWoMoldCols, setOrderWoMoldCols] = useState("");
  const [orderWoMoldRows, setOrderWoMoldRows] = useState(""); 
  const [orderWoMoldCount, setOrderWoMoldCount] = useState("");
  const [orderWoPackagingType, setOrderWoPackagingType] = useState("");
  const [orderWoNote, setOrderWoNote] = useState("");

  useEffect(() => {
    const cols = parseInt(orderWoMoldCols || "0", 10);
    const rows = parseInt(orderWoMoldRows || "0", 10);
    const qty = lines.reduce((s, l) => s + toInt(l.qty), 0);
    if (!qty || !cols || !rows) return;
    const mold = cols * rows;
    const fullSheets = Math.floor(qty / mold);
    const remainder = qty % mold;
    let extraRows = remainder > 0 ? Math.ceil(remainder / cols) : 0;
    let totalSheets = fullSheets + Math.floor(extraRows / rows);
    extraRows = extraRows % rows;
    let total = totalSheets * mold + extraRows * cols;
    while (total - qty < 16) {
      extraRows += 1;
      if (extraRows >= rows) { extraRows = 0; totalSheets += 1; }
      total = totalSheets * mold + extraRows * cols;
    }
    const auto = extraRows > 0
      ? `전사지: ${totalSheets}장 ${extraRows}줄 참고: ${total.toLocaleString("ko-KR")}개 #${cols}개=가로1줄`
      : `전사지: ${totalSheets}장 참고: ${total.toLocaleString("ko-KR")}개 #${cols}개=가로1줄`;
    setOrderWoNote(auto);
  }, [orderWoMoldCols, orderWoMoldRows, lines]); // eslint-disable-line
  const [orderWoEnabled, setOrderWoEnabled] = useState(!isSubAdmin);
  const [orderIsReorder, setOrderIsReorder] = useState(false);
  const [orderSkipProductionCheck, setOrderSkipProductionCheck] = useState(false);
  const orderWoFileInputRef = useRef<HTMLInputElement | null>(null);

  const [entryDate, setEntryDate] = useState(todayYMD());
  const [payMethod, setPayMethod] = useState<"BANK" | "CASH" | "CARD" | "ETC">("BANK");
  const [category, setCategory] = useState<Category>("매출입금");
  const [amountStr, setAmountStr] = useState("");
  const [ledgerMemo, setLedgerMemo] = useState("");
  const [manualCounterpartyName, setManualCounterpartyName] = useState("");
  const [manualBusinessNo, setManualBusinessNo] = useState("");
  const [vatFree, setVatFree] = useState(false);

  const [wo_subName, setWo_subName] = useState("");
  const [wo_orderDate, setWo_orderDate] = useState(todayYMD());
  const [wo_foodType, setWo_foodType] = useState("");
  const [wo_productName, setWo_productName] = useState("");
  const [wo_logoSpec, setWo_logoSpec] = useState("");
  const [wo_thickness, setWo_thickness] = useState("2mm");
  const [wo_deliveryMethod, setWo_deliveryMethod] = useState("택배");
  const [wo_packagingType, setWo_packagingType] = useState("트레이");
  const [wo_traySlot, setWo_traySlot] = useState("정사각20구");
  const [wo_packageUnit, setWo_packageUnit] = useState("100ea");
  const [wo_packageUnitCustom, setWo_packageUnitCustom] = useState("");
  const [wo_moldPerSheet, setWo_moldPerSheet] = useState("");
  const [wo_moldCols, setWo_moldCols] = useState("");
  const [wo_moldRows, setWo_moldRows] = useState("");
  const [wo_note, setWo_note] = useState("");
  const [wo_referenceNote, setWo_referenceNote] = useState("");
  const [wo_isReorder, setWo_isReorder] = useState(false);
  const [wo_originalId, setWo_originalId] = useState("");
  const [wo_items, setWo_items] = useState<WoItem[]>([
    { id: crypto.randomUUID(), delivery_date: todayYMD(), sub_items: [{ name: "", qty: 0 }], order_qty: 0 },
  ]);
  // 품목별 이미지 (key = line index)
  const [wo_itemImageFiles, setWo_itemImageFiles] = useState<Record<number, File[]>>({});
  const [wo_itemImagePreviewUrls, setWo_itemImagePreviewUrls] = useState<Record<number, string[]>>({});
  // 복사 시 기존 이미지 (key = line index, value = signed URL 배열)
  const [wo_itemExistingImageUrls, setWo_itemExistingImageUrls] = useState<Record<number, string[]>>({});
  const [wo_itemExistingImagePaths, setWo_itemExistingImagePaths] = useState<Record<number, string[]>>({});
  const [wo_itemExistingBarcodes, setWo_itemExistingBarcodes] = useState<Record<string, string>>({});
  const [wo_saving, setWo_saving] = useState(false);
  const [wo_list, setWo_list] = useState<WorkOrderRow[]>([]);
  const [wo_listLoading, setWo_listLoading] = useState(false);
  const [wo_linkedOrderId, setWo_linkedOrderId] = useState<string | null>(null);
  const [wo_linkedOrderSummary, setWo_linkedOrderSummary] = useState<string>("");
  const [wo_modalOpen, setWo_modalOpen] = useState(false);
  const [wo_printTarget, setWo_printTarget] = useState<WorkOrderRow | null>(null);
  const [trashOpen, setTrashOpen] = useState(false);
  const [trashLoading, setTrashLoading] = useState(false);
  const [deletedOrders, setDeletedOrders] = useState<DeletedOrderRow[]>([]);
  const [deletedLedgers, setDeletedLedgers] = useState<DeletedLedgerRow[]>([]);
  const [restoring, setRestoring] = useState<string | null>(null);

  const [eShipDate, setEShipDate] = useState(todayYMD());
  const [eOrdererName, setEOrdererName] = useState("");
  const [eShipMethod, setEShipMethod] = useState("택배");
  const [eOrderTitle, setEOrderTitle] = useState("");
  const [eLines, setELines] = useState<Line[]>([{ food_type: "", name: "", weight_g: 0, qty: 0, unit: "", total_incl_vat: "" }]);
  const [eShip1, setEShip1] = useState<ShipFormState>(emptyShip());
  const [eShip2, setEShip2] = useState<ShipFormState>(emptyShip());
  const [eTwoShip, setETwoShip] = useState(false);
  const [eWoId, setEWoId] = useState<string | null>(null);
  const [eWoSubName, setEWoSubName] = useState("");
  const [eWoProductName, setEWoProductName] = useState("");
  const [eWoFoodType, setEWoFoodType] = useState("");
  const [eWoLogoSpec, setEWoLogoSpec] = useState("");
  const [eWoThickness, setEWoThickness] = useState("2mm");
  const [eWoDeliveryMethod, setEWoDeliveryMethod] = useState("택배");
  const [eWoPackagingType, setEWoPackagingType] = useState("");
  const [eWoMoldPerSheet, setEWoMoldPerSheet] = useState("");
  const [eWoMoldCols, setEWoMoldCols] = useState("");
  const [eWoMoldRows, setEWoMoldRows] = useState(""); 
  const [eWoMoldCount, setEWoMoldCount] = useState("");
  const [eWoPackageUnit, setEWoPackageUnit] = useState("");
  const [eWoPackageUnitCustom, setEWoPackageUnitCustom] = useState("");
  const [eWoNote, setEWoNote] = useState("");

  useEffect(() => {
    const cols = parseInt(eWoMoldCols || "0", 10);
    const rows = parseInt(eWoMoldRows || "0", 10);
    const qty = eLines.reduce((s, l) => s + toInt(l.qty), 0);
    if (!qty || !cols || !rows) return;
    const mold = cols * rows;
    const fullSheets = Math.floor(qty / mold);
    const remainder = qty % mold;
    let extraRows = remainder > 0 ? Math.ceil(remainder / cols) : 0;
    let totalSheets = fullSheets + Math.floor(extraRows / rows);
    extraRows = extraRows % rows;
    let total = totalSheets * mold + extraRows * cols;
    while (total - qty < 16) {
      extraRows += 1;
      if (extraRows >= rows) { extraRows = 0; totalSheets += 1; }
      total = totalSheets * mold + extraRows * cols;
    }
    const auto = extraRows > 0
      ? `전사지: ${totalSheets}장 ${extraRows}줄 참고: ${total.toLocaleString("ko-KR")}개 #${cols}개=가로1줄`
      : `전사지: ${totalSheets}장 참고: ${total.toLocaleString("ko-KR")}개 #${cols}개=가로1줄`;
    setEWoNote(auto);
  }, [eWoMoldCols, eWoMoldRows, eLines]); // eslint-disable-line
  const [eWoImageFiles, setEWoImageFiles] = useState<File[]>([]);
  const [eWoImagePreviewUrls, setEWoImagePreviewUrls] = useState<string[]>([]);
  const [eWoExistingImages, setEWoExistingImages] = useState<string[]>([]);
  const [eWoExistingSignedLoading, setEWoExistingSignedLoading] = useState(false);
  const [eWoExistingSignedUrls, setEWoExistingSignedUrls] = useState<string[]>([]);
  // 품목별 이미지 (수정 모달)
  const [eItemImageFiles, setEItemImageFiles] = useState<Record<number, File[]>>({});
  const [eItemImagePreviewUrls, setEItemImagePreviewUrls] = useState<Record<number, string[]>>({});
  const [eItemExistingImageUrls, setEItemExistingImageUrls] = useState<Record<number, string[]>>({});
  const [eWoItemIds, setEWoItemIds] = useState<string[]>([]); // work_order_items.id 순서 보존

  const [eEntryDate, setEEntryDate] = useState(todayYMD());
  const [ePayMethod, setEPayMethod] = useState<"BANK" | "CASH" | "CARD" | "ETC">("BANK");
  const [eCategory, setECategory] = useState<Category>("매출입금");
  const [eAmountStr, setEAmountStr] = useState("");
  const [eLedgerMemo, setELedgerMemo] = useState("");
  const [eCounterpartyName, setECounterpartyName] = useState("");
  const [eBusinessNo, setEBusinessNo] = useState("");
  const [eVatFree, setEVatFree] = useState(false);
  const [eSalaryEmployeeId, setESalaryEmployeeId] = useState<string>("");

  const [fromYMD, setFromYMD] = useState(addDays(todayYMD(), -15));
const [toYMD, setToYMD] = useState(addDays(todayYMD(), 15));
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [ledgers, setLedgers] = useState<LedgerRow[]>([]);

  const tradeTopScrollRef = useRef<HTMLDivElement | null>(null);
  const tradeBottomScrollRef = useRef<HTMLDivElement | null>(null);
  const tradeSyncingRef = useRef<"TOP" | "BOTTOM" | null>(null);
  const syncDateRef = useRef<"SHIP" | "ENTRY" | null>(null);

  useEffect(() => {
    if (syncDateRef.current === "ENTRY") { syncDateRef.current = null; return; }
    syncDateRef.current = "SHIP"; setEntryDate(shipDate);
    if (shipDate && fromYMD && shipDate < fromYMD) setFromYMD(shipDate);
  }, [shipDate]); // eslint-disable-line

  useEffect(() => {
    if (syncDateRef.current === "SHIP") { syncDateRef.current = null; return; }
    syncDateRef.current = "ENTRY"; setShipDate(entryDate);
    if (entryDate && fromYMD && entryDate < fromYMD) setFromYMD(entryDate);
  }, [entryDate]); // eslint-disable-line

  useEffect(() => {
    const onScroll = () => setShowTopBtn((window.scrollY || 0) > 300);
    onScroll(); window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setManualCounterpartyName(selectedPartner?.name ?? "");
    setManualBusinessNo(selectedPartner?.business_no ?? "");
    setShip1({ name: selectedPartner?.ship_to_name ?? "", addr: selectedPartner?.ship_to_address1 ?? "", mobile: selectedPartner?.ship_to_mobile ?? "", phone: selectedPartner?.ship_to_phone ?? "", msg: "" });
    setShip2(emptyShip()); setTwoShip(false); setToTouched(false);
  }, [selectedPartner?.id]); // eslint-disable-line

  const orderTotals = useMemo(() => lines.reduce((acc, l) => { const r = calcLineAmounts(l.qty, l.unit, l.total_incl_vat); return { supply: acc.supply + r.supply, vat: acc.vat + r.vat, total: acc.total + r.total }; }, { supply: 0, vat: 0, total: 0 }), [lines]);
  const editOrderTotals = useMemo(() => eLines.reduce((acc, l) => { const r = calcLineAmounts(l.qty, l.unit, l.total_incl_vat); return { supply: acc.supply + r.supply, vat: acc.vat + r.vat, total: acc.total + r.total }; }, { supply: 0, vat: 0, total: 0 }), [eLines]);
  const ledgerSplit = useMemo(() => splitVatFromTotalFlexible(amountStr, vatFree), [amountStr, vatFree]);
  const editLedgerSplit = useMemo(() => splitVatFromTotalFlexible(eAmountStr, eVatFree), [eAmountStr, eVatFree]);

  const partnersToShow = useMemo(() => {
    if (partnerView === "PINNED") {
      if (isSubAdmin) {
        // 즐겨찾기 여부 무관하게 지정 3개만 항상 표시
        return SUBADMIN_PINNED_TOP_NAMES
          .map((name) => partners.find((p) => p.name === name))
          .filter(Boolean) as PartnerRow[];
      }
      return partners.filter((p) => !!p.is_pinned);
    }
    if (partnerView === "RECENT") { const map = new Map(partners.map((p) => [p.id, p])); return recentPartnerIds.map((id) => map.get(id)).filter(Boolean) as PartnerRow[]; }
    const f = partnerFilter.trim();
    if (!f) return partners;
    return partners.filter((p) =>
      matchesSearch(p.name ?? "", f) ||
      (p.business_no ?? "").includes(f)
    );
  }, [partners, partnerView, recentPartnerIds, isSubAdmin, partnerFilter]);

  const unifiedRows = useMemo<UnifiedRow[]>(() => {
    const normalizeIso = (s: string | null | undefined) => {
      let v = String(s ?? "").trim();
      if (!v) return "";
      if (v.includes(" ") && !v.includes("T")) v = v.replace(" ", "T");
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(v)) v = `${v}Z`;
      return v;
    };
    const safeParseMs = (isoLike: string) => { const ms = Date.parse(isoLike); return Number.isFinite(ms) ? ms : 0; };
    const ymdToMs = (ymd: string) => { const v = String(ymd ?? "").trim(); if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return 0; const ms = Date.parse(`${v}T00:00:00.000Z`); return Number.isFinite(ms) ? ms : 0; };

    const items: Array<Omit<UnifiedRow, "balance"> & { signed: number; tsMs: number; dateMs: number }> = [];

    for (const o of orders) {
      const memo = safeJsonParse<{ title: string | null; orderer_name?: string | null }>(o.memo);
      const date = o.ship_date ?? (o.created_at ? o.created_at.slice(0, 10) : "");
      const total = Number(o.total_amount ?? 0);
      const orderer = (memo?.orderer_name ?? null) as string | null;
      const oIso = normalizeIso(o.created_at);
      const tsKey = oIso || (date ? `${date}T12:00:00.000Z` : "");
      const tsMs = oIso ? safeParseMs(oIso) : (date ? safeParseMs(`${date}T12:00:00.000Z`) : 0);
      const dateMs = ymdToMs(date) || (tsMs ? ymdToMs(new Date(tsMs).toISOString().slice(0, 10)) : 0);
      items.push({
        kind: "ORDER", date, tsKey, tsMs, dateMs, partnerName: o.customer_name ?? "", businessNo: "",
        ordererName: orderer ?? "", category: "주문/출고", method: o.ship_method ?? "",
        inAmt: 0, outAmt: total, signed: -total, rawId: o.id, ship_method: o.ship_method ?? "택배",
        order_title: memo?.title ?? null, orderer_name: orderer,
        tax_invoice_issued: o.tax_invoice_issued ?? false,
        order_lines: (o.order_lines ?? []).map((l) => ({ food_type: l.food_type ?? "", name: l.name ?? "", weight_g: Number(l.weight_g ?? 0), qty: Number(l.qty ?? 0), unit: Number(l.unit ?? 0), total_amount: Number(l.total_amount ?? 0), unit_type: (l.unit_type ?? "EA") as any, pack_ea: Number(l.pack_ea ?? 1), actual_ea: Number(l.actual_ea ?? 0), is_sample: !!(l.is_sample) })),
        order_shipments: (o.order_shipments ?? []).map((s) => ({ seq: Number(s.seq ?? 1), ship_to_name: String(s.ship_to_name ?? ""), ship_to_address1: String(s.ship_to_address1 ?? ""), ship_to_address2: s.ship_to_address2 ?? null, ship_to_mobile: s.ship_to_mobile ?? null, ship_to_phone: s.ship_to_phone ?? null, ship_zipcode: s.ship_zipcode ?? null, delivery_message: s.delivery_message ?? null, tax_invoice_issued: o.tax_invoice_issued ?? false, })),
      });
    }

    for (const l of ledgers) {
      const sign = String(l.direction) === "OUT" ? -1 : 1;
      const amt = Number(l.amount ?? 0);
      const lIso = normalizeIso(l.entry_ts) || normalizeIso(l.created_at);
      const tsKey = lIso || (l.entry_date ? `${l.entry_date}T12:00:00.000Z` : "");
      const tsMs = lIso ? safeParseMs(lIso) : (l.entry_date ? safeParseMs(`${l.entry_date}T12:00:00.000Z`) : 0);
      const dateMs = ymdToMs(l.entry_date) || (tsMs ? ymdToMs(new Date(tsMs).toISOString().slice(0, 10)) : 0);
      items.push({
        kind: "LEDGER", date: l.entry_date, tsKey, tsMs, dateMs, partnerName: l.counterparty_name ?? "", businessNo: l.business_no ?? "",
        ledger_partner_id: l.partner_id ?? null, ordererName: "", category: l.category ?? "금전출납",
        method: l.method ?? "", inAmt: sign > 0 ? amt : 0, outAmt: sign < 0 ? amt : 0, signed: sign * amt, rawId: l.id,
        ledger_category: l.category ?? null, ledger_method: l.method ?? null, ledger_memo: l.memo ?? null, ledger_amount: amt,
        ledger_supply_amount: (l.supply_amount ?? null) as any, ledger_vat_amount: (l.vat_amount ?? null) as any, ledger_total_amount: (l.total_amount ?? null) as any,
        tax_invoice_received: (l as any).tax_invoice_received ?? false,
        payment_completed: (l as any).payment_completed ?? false,     
      });
    }

    items.sort((a, b) => (a.dateMs - b.dateMs) || (a.tsMs - b.tsMs) || String(a.rawId).localeCompare(String(b.rawId)));
    let running = includeOpening ? openingBalance : 0;
    const withBal: UnifiedRow[] = items.map((x) => { running += x.signed; const { signed, tsMs, dateMs, ...rest } = x; return { ...rest, balance: running }; });
    withBal.sort((a, b) => {
      const aDateMs = /^\d{4}-\d{2}-\d{2}$/.test(String(a.date ?? "")) ? Date.parse(`${a.date}T00:00:00.000Z`) : 0;
      const bDateMs = /^\d{4}-\d{2}-\d{2}$/.test(String(b.date ?? "")) ? Date.parse(`${b.date}T00:00:00.000Z`) : 0;
      const ad = Number.isFinite(aDateMs) ? aDateMs : 0, bd = Number.isFinite(bDateMs) ? bDateMs : 0;
      if (ad !== bd) return bd - ad;
      const am = Date.parse(a.tsKey), bm = Date.parse(b.tsKey);
      const aMs = Number.isFinite(am) ? am : 0, bMs = Number.isFinite(bm) ? bm : 0;
      if (aMs !== bMs) return bMs - aMs;
      return String(b.rawId).localeCompare(String(a.rawId));
    });
    return withBal;
  }, [orders, ledgers, includeOpening, openingBalance]);

  const unifiedTotals = useMemo(() => {
    const plus = unifiedRows.reduce((a, x) => a + x.inAmt, 0);
    const minus = unifiedRows.reduce((a, x) => a + x.outAmt, 0);
    return { plus, minus, net: plus - minus, endBalance: unifiedRows.length ? unifiedRows[0].balance : includeOpening ? openingBalance : 0 };
  }, [unifiedRows, includeOpening, openingBalance]);

  useEffect(() => {
    const top = tradeTopScrollRef.current, bottom = tradeBottomScrollRef.current;
    if (top && bottom) top.scrollLeft = bottom.scrollLeft;
  }, [unifiedRows.length, mode]); // eslint-disable-line

  function pushRecentPartner(id: string) {
    setRecentPartnerIds((prev) => { const next = [id, ...prev.filter((x) => x !== id)].slice(0, 20); saveRecentToLS(next); return next; });
  }

  async function loadPartners() {
   setMsg(null);
    try {
      const { data, error } = await supabase.from("partners")
        .select("id,name,business_no,ceo_name,biz_type,biz_item,phone,address1,is_pinned,pin_order,partner_type,group_name,ship_to_name,ship_to_address1,ship_to_mobile,ship_to_phone")
        .order("is_pinned", { ascending: false }).order("pin_order", { ascending: true }).order("name", { ascending: true }).limit(500);
      if (error) {
        // AbortError는 정상적인 언마운트로 인한 취소 — 무시
        if (error.message?.includes("aborted") || error.message?.includes("AbortError")) return;
        setMsg("거래처 로드 에러: " + error.message); return;
  
  
      //  if (error.message?.includes("aborted") || error.message?.includes("AbortError")) return;
      //  return setMsg(error.message);
      }
      setPartners((data ?? []) as PartnerRow[]);
    } catch (e: any) {
      // fetch abort는 무시
      if (e?.name === "AbortError" || e?.message?.includes("aborted")) return;
      setMsg("거래처 로드 예외: " + (e?.message ?? String(e)));


   //   if (e?.name === "AbortError" || e?.message?.includes("aborted")) return;
   //   setMsg(e?.message ?? String(e));
    }
  }

  async function loadFoodTypes() {
    const { data } = await supabase.from("food_types").select("id,name").eq("is_active", true).order("sort_order", { ascending: true }).order("name", { ascending: true }).limit(200);
    if (data) setFoodTypes(data as FoodTypeRow[]);
  }
  async function loadPresetProducts() {
    const { data } = await supabase.from("preset_products").select("id,product_name,food_type,weight_g,barcode").eq("is_active", true).order("product_name", { ascending: true }).limit(5000);
    if (data) setPresetProducts(data as PresetProductRow[]);
  }
  async function loadMasterProducts() {
    const { data, error } = await supabase.from("v_tradeclient_products").select("product_name,food_type,category,weight_g,barcode,variant_id").order("product_name", { ascending: true }).limit(10000);
    if (!error && data) setMasterProducts(data as MasterProductRow[]);
  }
  async function loadEmployees() {
    const { data, error } = await supabase.from("employees").select("id,name,pin").is("resign_date", null).order("name", { ascending: true }).limit(500);
    if (!error) setEmployees((data ?? []) as EmployeeRow[]);
  }

  async function loadLatestShippingForPartner(partnerId: string) {
    const { data, error } = await supabase.from("partner_shipping_history").select("id,partner_id,ship_to_name,ship_to_address1,ship_to_mobile,ship_to_phone,created_at").eq("partner_id", partnerId).order("created_at", { ascending: false }).limit(1);
    if (error) return null;
    return (data?.[0] ?? null) as PartnerShippingHistoryRow | null;
  }
  async function loadShippingHistory5(partnerId: string) {
    setShipHistLoading(true);
    try {
      const { data, error } = await supabase.from("partner_shipping_history").select("id,partner_id,ship_to_name,ship_to_address1,ship_to_mobile,ship_to_phone,created_at").eq("partner_id", partnerId).order("created_at", { ascending: false }).limit(5);
      if (error) { setMsg(error.message); setShipHist([]); return; }
      setShipHist((data ?? []) as PartnerShippingHistoryRow[]);
    } finally { setShipHistLoading(false); }
  }

  async function loadTrades() {
    setMsg(null);
    const f = fromYMD || addDays(todayYMD(), -30);
    const selectedBusinessNo = selectedPartner?.business_no ?? null;
    const selectedPartnerId = selectedPartner?.id ?? null;
    const subAdminPartnerNames = isSubAdmin && !selectedPartnerId
    ? SUBADMIN_PINNED_TOP_NAMES
    : null;
    let t = toYMD || todayYMD();

    if (!toTouched) {

      let latestOrderDate = "", latestLedgerDate = "";
      let oqLatest = supabase.from("orders").select("ship_date,customer_id,customer_name").not("ship_date", "is", null).order("ship_date", { ascending: false }).limit(1);
      if (selectedPartnerId) {
        oqLatest = oqLatest.or(`customer_id.eq.${selectedPartnerId},customer_name.eq.${(selectedPartner?.name ?? "").replaceAll(",", "")}`);
      } else if (subAdminPartnerNames) {
        oqLatest = oqLatest.in("customer_name", subAdminPartnerNames);
      } 
      const { data: oLatest, error: oLatestErr } = await oqLatest;
      if (!oLatestErr && oLatest && oLatest[0]?.ship_date) latestOrderDate = String(oLatest[0].ship_date);

      let lqLatest = supabase.from("ledger_entries").select("entry_date,partner_id,business_no,counterparty_name").not("entry_date", "is", null).order("entry_date", { ascending: false }).limit(1);
      if (selectedPartnerId || selectedBusinessNo) {
        const ors: string[] = [];
        if (selectedPartnerId) ors.push(`partner_id.eq.${selectedPartnerId}`);
        if (selectedBusinessNo) ors.push(`business_no.eq.${selectedBusinessNo}`);
        if (selectedPartner?.name) ors.push(`counterparty_name.eq.${selectedPartner.name.replaceAll(",", "")}`);
        lqLatest = lqLatest.or(ors.join(","));
      } else if (subAdminPartnerNames) {
        lqLatest = lqLatest.in("counterparty_name", subAdminPartnerNames);
      }
      const { data: lLatest, error: lLatestErr } = await lqLatest;
      if (!lLatestErr && lLatest && lLatest[0]?.entry_date) latestLedgerDate = String(lLatest[0].entry_date);
      const latest = [latestOrderDate, latestLedgerDate].filter(Boolean).sort().pop() || todayYMD();
      if (latest) { if (latest !== t) setToYMD(latest); t = latest; }
    }

    {
      const pageSize = 500; let from = 0; const all: any[] = [];
      while (true) {
        let oq = supabase.from("orders").select("id,customer_id,customer_name,ship_date,ship_method,status,memo,supply_amount,vat_amount,total_amount,created_at,tax_invoice_issued,order_lines(id,order_id,line_no,food_type,name,weight_g,qty,unit,unit_type,pack_ea,actual_ea,supply_amount,vat_amount,total_amount,is_sample,created_at),order_shipments(id,order_id,seq,ship_to_name,ship_to_address1,ship_to_address2,ship_to_mobile,ship_to_phone,ship_zipcode,delivery_message,created_at,updated_at)").gte("ship_date", f).lte("ship_date", t).order("ship_date", { ascending: false }).range(from, from + pageSize - 1);
        if (selectedPartnerId) {
          oq = oq.or(`customer_id.eq.${selectedPartnerId},customer_name.eq.${(selectedPartner?.name ?? "").replaceAll(",", "")}`);
        } else if (subAdminPartnerNames) {
          oq = oq.in("customer_name", subAdminPartnerNames);
        }
        const { data, error } = await oq;
        if (error) { if (error.message?.includes("aborted")) return; return setMsg(error.message); }


        if (data && data.length) all.push(...data);
        if (!data || data.length < pageSize) break;
        from += pageSize;
      }
      setOrders((all ?? []) as OrderRow[]);
    }

    {
      const pageSize = 1000; let from = 0; const all: any[] = [];
      while (true) {
        let lq = supabase.from("ledger_entries").select("id,entry_date,entry_ts,direction,amount,category,method,counterparty_name,business_no,memo,status,partner_id,created_at,supply_amount,vat_amount,total_amount,tax_invoice_received,payment_completed").gte("entry_date", f).lte("entry_date", t).order("entry_date", { ascending: false }).range(from, from + pageSize - 1);
        if (selectedPartnerId || selectedBusinessNo) {
          const ors: string[] = [];
          if (selectedPartnerId) ors.push(`partner_id.eq.${selectedPartnerId}`);
          if (selectedBusinessNo) ors.push(`business_no.eq.${selectedBusinessNo}`);
          if (selectedPartner?.name) ors.push(`counterparty_name.eq.${selectedPartner.name.replaceAll(",", "")}`);
          lq = lq.or(ors.join(","));
        } else if (subAdminPartnerNames) {
          lq = lq.in("counterparty_name", subAdminPartnerNames);
        }
        const { data, error } = await lq;
        if (error) return setMsg(error.message);
        if (data && data.length) all.push(...data);
        if (!data || data.length < pageSize) break;
        from += pageSize;
      }
      setLedgers(((all ?? []).map((r: any) => ({ ...r, amount: Number(r.amount ?? 0) }))) as LedgerRow[]);
    }

    let opening = 0;
    {
      const pageSize = 1000; let from = 0;
      while (true) {
        let oq2 = supabase.from("orders").select("id,ship_date,total_amount,customer_id,customer_name").lt("ship_date", f).order("ship_date", { ascending: false }).range(from, from + pageSize - 1);
        if (selectedPartnerId) {
          oq2 = oq2.or(`customer_id.eq.${selectedPartnerId},customer_name.eq.${(selectedPartner?.name ?? "").replaceAll(",", "")}`);
        } else if (subAdminPartnerNames) {
          oq2 = oq2.in("customer_name", subAdminPartnerNames);
        }
        const { data: oPrev, error: oPrevErr } = await oq2;
        if (oPrevErr) break;
        if (oPrev && oPrev.length) opening += -(oPrev.reduce((acc: number, r: any) => acc + Number(r.total_amount ?? 0), 0));
        if (!oPrev || oPrev.length < pageSize) break;
        from += pageSize;
      }
    }
    {
      const pageSize = 1000; let from = 0;
      while (true) {
        let lq2 = supabase.from("ledger_entries").select("id,entry_date,direction,amount,partner_id,business_no,counterparty_name").lt("entry_date", f).order("entry_date", { ascending: false }).range(from, from + pageSize - 1);
        if (selectedPartnerId || selectedBusinessNo) {
          const ors: string[] = [];
          if (selectedPartnerId) ors.push(`partner_id.eq.${selectedPartnerId}`);
          if (selectedBusinessNo) ors.push(`business_no.eq.${selectedBusinessNo}`);
          if (selectedPartner?.name) ors.push(`counterparty_name.eq.${selectedPartner.name.replaceAll(",", "")}`);
          lq2 = lq2.or(ors.join(","));
        } else if (subAdminPartnerNames) {
          lq2 = lq2.in("counterparty_name", subAdminPartnerNames);
        }
        const { data: lPrev, error: lPrevErr } = await lq2;
        if (lPrevErr) break;
        if (lPrev && lPrev.length) opening += lPrev.reduce((acc: number, r: any) => acc + (String(r.direction) === "OUT" ? -1 : 1) * Number(r.amount ?? 0), 0);
        if (!lPrev || lPrev.length < pageSize) break;
        from += pageSize;
      }
    }
    setOpeningBalance(opening);
  }

  // ── 검색어 디바운스 300ms ──
  useEffect(() => {
    const timer = setTimeout(() => {
      setTradeSearchDebounced(tradeSearch);
    }, 300);
    return () => clearTimeout(timer);
  }, [tradeSearch]);

  // ── 서버 사이드 검색 ──
  useEffect(() => {
    const q = tradeSearchDebounced.trim();
    if (!q) { setSearchResults(null); setSearchLoading(false); return; }
    let cancelled = false;
    (async () => {
      setSearchLoading(true);
      try {
        const selectedPartnerId = selectedPartner?.id ?? null;
        const selectedBusinessNo = selectedPartner?.business_no ?? null;
        const likeQ = `%${q}%`;

        // orders 검색
        let oq = supabase.from("orders")
          .select("id,customer_id,customer_name,ship_date,ship_method,status,memo,supply_amount,vat_amount,total_amount,created_at,tax_invoice_issued,order_lines(id,order_id,line_no,food_type,name,weight_g,qty,unit,unit_type,pack_ea,actual_ea,supply_amount,vat_amount,total_amount,is_sample,created_at),order_shipments(id,order_id,seq,ship_to_name,ship_to_address1,ship_to_address2,ship_to_mobile,ship_to_phone,ship_zipcode,delivery_message,created_at,updated_at)")
          .or(`customer_name.ilike.${likeQ},memo.ilike.${likeQ},ship_method.ilike.${likeQ}`)
          .order("ship_date", { ascending: false })
          .limit(200);
        if (selectedPartnerId) {
          oq = oq.or(`customer_id.eq.${selectedPartnerId},customer_name.eq.${(selectedPartner?.name ?? "").replaceAll(",", "")}`);
        }
        const { data: oData } = await oq;

        // ledger 검색
        let lq = supabase.from("ledger_entries")
          .select("id,entry_date,entry_ts,direction,amount,category,method,counterparty_name,business_no,memo,status,partner_id,created_at,supply_amount,vat_amount,total_amount,tax_invoice_received,payment_completed")
          .or(`counterparty_name.ilike.${likeQ},memo.ilike.${likeQ},category.ilike.${likeQ},method.ilike.${likeQ},business_no.ilike.${likeQ}`)
          .order("entry_date", { ascending: false })
          .limit(200);
        if (selectedPartnerId || selectedBusinessNo) {
          const ors: string[] = [];
          if (selectedPartnerId) ors.push(`partner_id.eq.${selectedPartnerId}`);
          if (selectedBusinessNo) ors.push(`business_no.eq.${selectedBusinessNo}`);
          if (selectedPartner?.name) ors.push(`counterparty_name.eq.${selectedPartner.name.replaceAll(",", "")}`);
          lq = lq.or(ors.join(","));
        }
        const { data: lData } = await lq;

        if (cancelled) return;

        // unifiedRows 형태로 변환
        const items: Array<Omit<UnifiedRow, "balance"> & { signed: number; tsMs: number; dateMs: number }> = [];
        const normalizeIso = (s: string | null | undefined) => {
          let v = String(s ?? "").trim();
          if (!v) return "";
          if (v.includes(" ") && !v.includes("T")) v = v.replace(" ", "T");
          if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(v)) v = `${v}Z`;
          return v;
        };
        const safeParseMs = (iso: string) => { const ms = Date.parse(iso); return Number.isFinite(ms) ? ms : 0; };
        const ymdToMs = (ymd: string) => { const v = String(ymd ?? "").trim(); if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return 0; const ms = Date.parse(`${v}T00:00:00.000Z`); return Number.isFinite(ms) ? ms : 0; };

        for (const o of (oData ?? []) as OrderRow[]) {
          const memo = safeJsonParse<{ title: string | null; orderer_name?: string | null }>(o.memo);
          const date = o.ship_date ?? (o.created_at ? o.created_at.slice(0, 10) : "");
          const total = Number(o.total_amount ?? 0);
          const orderer = (memo?.orderer_name ?? null) as string | null;
          const oIso = normalizeIso(o.created_at);
          const tsKey = oIso || (date ? `${date}T12:00:00.000Z` : "");
          const tsMs = oIso ? safeParseMs(oIso) : (date ? safeParseMs(`${date}T12:00:00.000Z`) : 0);
          const dateMs = ymdToMs(date) || (tsMs ? ymdToMs(new Date(tsMs).toISOString().slice(0, 10)) : 0);
          items.push({
            kind: "ORDER", date, tsKey, tsMs, dateMs, partnerName: o.customer_name ?? "", businessNo: "",
            ordererName: orderer ?? "", category: "주문/출고", method: o.ship_method ?? "",
            inAmt: 0, outAmt: total, signed: -total, rawId: o.id, ship_method: o.ship_method ?? "택배",
            order_title: memo?.title ?? null, orderer_name: orderer,
            tax_invoice_issued: o.tax_invoice_issued ?? false,
            order_lines: (o.order_lines ?? []).map((l) => ({ food_type: l.food_type ?? "", name: l.name ?? "", weight_g: Number(l.weight_g ?? 0), qty: Number(l.qty ?? 0), unit: Number(l.unit ?? 0), total_amount: Number(l.total_amount ?? 0), unit_type: (l.unit_type ?? "EA") as any, pack_ea: Number(l.pack_ea ?? 1), actual_ea: Number(l.actual_ea ?? 0), is_sample: !!(l.is_sample) })),
            order_shipments: (o.order_shipments ?? []).map((s) => ({ seq: Number(s.seq ?? 1), ship_to_name: String(s.ship_to_name ?? ""), ship_to_address1: String(s.ship_to_address1 ?? ""), ship_to_address2: s.ship_to_address2 ?? null, ship_to_mobile: s.ship_to_mobile ?? null, ship_to_phone: s.ship_to_phone ?? null, ship_zipcode: s.ship_zipcode ?? null, delivery_message: s.delivery_message ?? null, tax_invoice_issued: o.tax_invoice_issued ?? false })),
          });
        }
        for (const l of (lData ?? []) as LedgerRow[]) {
          const sign = String(l.direction) === "OUT" ? -1 : 1;
          const amt = Number(l.amount ?? 0);
          const lIso = normalizeIso(l.entry_ts) || normalizeIso(l.created_at);
          const tsKey = lIso || (l.entry_date ? `${l.entry_date}T12:00:00.000Z` : "");
          const tsMs = lIso ? safeParseMs(lIso) : (l.entry_date ? safeParseMs(`${l.entry_date}T12:00:00.000Z`) : 0);
          const dateMs = ymdToMs(l.entry_date) || (tsMs ? ymdToMs(new Date(tsMs).toISOString().slice(0, 10)) : 0);
          items.push({
            kind: "LEDGER", date: l.entry_date, tsKey, tsMs, dateMs, partnerName: l.counterparty_name ?? "", businessNo: l.business_no ?? "",
            ledger_partner_id: l.partner_id ?? null, ordererName: "", category: l.category ?? "금전출납",
            method: l.method ?? "", inAmt: sign > 0 ? amt : 0, outAmt: sign < 0 ? amt : 0, signed: sign * amt, rawId: l.id,
            ledger_category: l.category ?? null, ledger_method: l.method ?? null, ledger_memo: l.memo ?? null, ledger_amount: amt,
            ledger_supply_amount: (l.supply_amount ?? null) as any, ledger_vat_amount: (l.vat_amount ?? null) as any, ledger_total_amount: (l.total_amount ?? null) as any,
            tax_invoice_received: (l as any).tax_invoice_received ?? false,
            payment_completed: (l as any).payment_completed ?? false,
          });
        }

        items.sort((a, b) => (b.dateMs - a.dateMs) || (b.tsMs - a.tsMs));
        let running = 0;
        const withBal: UnifiedRow[] = items.map((x) => { running += x.signed; const { signed, tsMs, dateMs, ...rest } = x; return { ...rest, balance: running }; });
        // 클라이언트 초성 검색으로 추가 필터링
        const filtered = withBal.filter((x) => {
          const orderLineText = x.kind === "ORDER" ? (x.order_lines ?? []).map((l) => `${l.name ?? ""} ${l.food_type ?? ""}`).join(" ") : "";
          const summaryText = buildOrderSummaryText(x);
          return matchesSearch([x.partnerName, x.businessNo ?? "", x.ordererName, summaryText, x.category, x.method, x.order_title ?? "", x.ledger_memo ?? "", orderLineText].filter(Boolean).join(" "), q);
        });
        setSearchResults(filtered);
      } finally {
        if (!cancelled) setSearchLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [tradeSearchDebounced, selectedPartner?.id, searchRefreshTick]); // eslint-disable-line

  useEffect(() => { setRecentPartnerIds(loadRecentFromLS()); loadPartners(); loadFoodTypes(); loadPresetProducts(); loadMasterProducts(); loadEmployees(); /* eslint-disable-next-line */ }, []);
  
  useEffect(() => { loadTrades(); /* eslint-disable-next-line */ }, [selectedPartner?.id, fromYMD, toYMD, toTouched]);

  function resetPartnerForm() { setP_name(""); setP_businessNo(""); setP_ceo(""); setP_phone(""); setP_address1(""); setP_bizType(""); setP_bizItem(""); setP_partnerType("CUSTOMER"); }

  async function createPartner() {
    setMsg(null);
    const name = p_name.trim();
    if (!name) return setMsg("업체명(필수)을 입력하세요.");
    const { data, error } = await supabase.from("partners").insert({ name, business_no: p_businessNo.trim() || null, ceo_name: p_ceo.trim() || null, phone: p_phone.trim() || null, address1: p_address1.trim() || null, biz_type: p_bizType.trim() || null, biz_item: p_bizItem.trim() || null, partner_type: p_partnerType, is_pinned: false, pin_order: 9999 }).select("*").single();
    if (error) return setMsg(error.message);
    setShowPartnerForm(false); resetPartnerForm();
    await loadPartners(); setSelectedPartner(data as PartnerRow); pushRecentPartner((data as PartnerRow).id);
  }

  function selectPartner(p: PartnerRow) { setSelectedPartner(p); setMsg(null); pushRecentPartner(p.id); }

  async function togglePinned(p: PartnerRow) {
    const { error } = await supabase.from("partners").update({ is_pinned: !(p.is_pinned ?? false) }).eq("id", p.id);
    if (error) return setMsg(error.message);
    setPartners((prev) => prev.map((x) => (x.id === p.id ? { ...x, is_pinned: !(p.is_pinned ?? false) } : x)));
  }

  async function openPartnerEdit() {
    if (!selectedPartner) return setMsg("왼쪽에서 거래처를 먼저 선택하세요.");
    setEP_name(selectedPartner.name ?? ""); setEP_businessNo(selectedPartner.business_no ?? "");
    setEP_ceo(selectedPartner.ceo_name ?? ""); setEP_phone(selectedPartner.phone ?? "");
    setEP_address1(selectedPartner.address1 ?? ""); setEP_bizType(selectedPartner.biz_type ?? "");
    setEP_bizItem(selectedPartner.biz_item ?? "");
    const pt = String(selectedPartner.partner_type ?? "CUSTOMER") as any;
    setEP_partnerType(["CUSTOMER", "VENDOR", "BOTH"].includes(pt) ? pt : "CUSTOMER");
    const latest = await loadLatestShippingForPartner(selectedPartner.id);
    const cur = selectedPartner;
    setShipEdit({ name: (latest?.ship_to_name ?? cur.ship_to_name ?? "") || "", addr: (latest?.ship_to_address1 ?? cur.ship_to_address1 ?? "") || "", mobile: (latest?.ship_to_mobile ?? cur.ship_to_mobile ?? "") || "", phone: (latest?.ship_to_phone ?? cur.ship_to_phone ?? "") || "", msg: "" });
    setShipHistOpen(false); setShipHist([]); setShipHistLoading(false);
    setPartnerEditOpen(true);
  }

  async function savePartnerEdit() {
    if (!selectedPartner) return setMsg("왼쪽에서 거래처를 먼저 선택하세요.");
    const name = ep_name.trim();
    if (!name) return setMsg("업체명(필수)을 입력하세요.");
    const nextShip = { ship_to_name: normText(shipEdit.name), ship_to_address1: normText(shipEdit.addr), ship_to_mobile: normText(shipEdit.mobile), ship_to_phone: normText(shipEdit.phone) };
    const prevShip = { ship_to_name: normText(selectedPartner.ship_to_name), ship_to_address1: normText(selectedPartner.ship_to_address1), ship_to_mobile: normText(selectedPartner.ship_to_mobile), ship_to_phone: normText(selectedPartner.ship_to_phone) };
    const shippingChanged = JSON.stringify(prevShip) !== JSON.stringify(nextShip);
    const { data: updated, error: uErr } = await supabase.from("partners").update({ name, business_no: normText(ep_businessNo), ceo_name: normText(ep_ceo), phone: normText(ep_phone), address1: normText(ep_address1), biz_type: normText(ep_bizType), biz_item: normText(ep_bizItem), partner_type: ep_partnerType, ...nextShip }).eq("id", selectedPartner.id).select("id,name,business_no,ceo_name,biz_type,biz_item,phone,address1,is_pinned,pin_order,partner_type,group_name,ship_to_name,ship_to_address1,ship_to_mobile,ship_to_phone").single();
    if (uErr) return setMsg(uErr.message);
    if (shippingChanged) {
      const { error: hErr } = await supabase.from("partner_shipping_history").insert({ partner_id: selectedPartner.id, ...nextShip });
      if (hErr) return setMsg(hErr.message);
    }
    const updatedPartner = updated as PartnerRow;
    setPartners((prev) => prev.map((p) => (p.id === updatedPartner.id ? updatedPartner : p)));
    setSelectedPartner(updatedPartner);
    if (shipHistOpen) await loadShippingHistory5(updatedPartner.id);
    setPartnerEditOpen(false);
  }

  const updateLine = (i: number, patch: Partial<Line>) => setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const addLine = () => setLines((prev) => [...prev, { food_type: "", name: "", weight_g: 0, qty: 0, unit: "", total_incl_vat: "", is_sample: false }]);
  const removeLine = (i: number) => {
    setLines((prev) => prev.filter((_, idx) => idx !== i));
    const rebuildMap = <T,>(prev: Record<number, T>): Record<number, T> => {
      const next: Record<number, T> = {};
      Object.entries(prev).forEach(([k, v]) => {
        const idx = Number(k);
        if (idx < i) next[idx] = v;
        else if (idx > i) next[idx - 1] = v;
      });
      return next;
    };
    setWo_itemImageFiles(rebuildMap);
    setWo_itemImagePreviewUrls(rebuildMap);
    setWo_itemExistingImageUrls(rebuildMap);
    setWo_itemExistingImagePaths(rebuildMap);
  };
  const updateEditLine = (i: number, patch: Partial<Line>) => setELines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const addEditLine = () => setELines((prev) => [...prev, { food_type: "", name: "", weight_g: 0, qty: 0, unit: "", total_incl_vat: "" }]);
  const removeEditLine = (i: number) => {
    setELines((prev) => prev.filter((_, idx) => idx !== i));
    const rebuildMap = <T,>(prev: Record<number, T>): Record<number, T> => {
      const next: Record<number, T> = {};
      Object.entries(prev).forEach(([k, v]) => {
        const idx = Number(k);
        if (idx < i) next[idx] = v;
        else if (idx > i) next[idx - 1] = v;
      });
      return next;
    };
    setEItemImageFiles(rebuildMap);
    setEItemImagePreviewUrls(rebuildMap);
    setEItemExistingImageUrls(rebuildMap);
  };
  function insertShippingFee(totalInclVat: number) { setLines((prev) => [...prev, { food_type: "", name: "택배비", weight_g: 0, qty: 1, unit: "", total_incl_vat: String(totalInclVat) }]); }
  function insertEditShippingFee(totalInclVat: number) { setELines((prev) => [...prev, { food_type: "", name: "택배비", weight_g: 0, qty: 1, unit: "", total_incl_vat: String(totalInclVat) }]); }

  function applyShipmentsToForm(shipments: ShipmentSnap[], setS1: (v: ShipFormState) => void, setS2: (v: ShipFormState) => void, setTwo: (v: boolean) => void) {
    const sorted = [...shipments].sort((a, b) => (a.seq ?? 1) - (b.seq ?? 1));
    const s1 = sorted.find((x) => (x.seq ?? 1) === 1), s2 = sorted.find((x) => (x.seq ?? 1) === 2);
    setS1(s1 ? { name: String(s1.ship_to_name ?? ""), addr: String(s1.ship_to_address1 ?? ""), mobile: String(s1.ship_to_mobile ?? ""), phone: String(s1.ship_to_phone ?? ""), msg: String(s1.delivery_message ?? "") } : emptyShip());
    if (s2) { setTwo(true); setS2({ name: String(s2.ship_to_name ?? ""), addr: String(s2.ship_to_address1 ?? ""), mobile: String(s2.ship_to_mobile ?? ""), phone: String(s2.ship_to_phone ?? ""), msg: String(s2.delivery_message ?? "") }); }
    else { setTwo(false); setS2(emptyShip()); }
  }

  function buildShipPayloads(orderId: string, s1: ShipFormState, s2: ShipFormState, two: boolean) {
    const payloads: any[] = [{ order_id: orderId, seq: 1, ship_to_name: s1.name.trim(), ship_to_address1: s1.addr.trim(), ship_to_mobile: normText(s1.mobile), ship_to_phone: normText(s1.phone), delivery_message: normText(s1.msg), created_by: null }];
    if (two) payloads.push({ order_id: orderId, seq: 2, ship_to_name: s2.name.trim(), ship_to_address1: s2.addr.trim(), ship_to_mobile: normText(s2.mobile), ship_to_phone: normText(s2.phone), delivery_message: normText(s2.msg), created_by: null });
    return payloads;
  }

  // ── createOrder ──
  async function createOrder() {
    setMsg(null);
    let stockWarningMsg: string | null = null;
    if (!selectedPartner) return setMsg("왼쪽에서 거래처를 먼저 선택하세요.");
    if (lines.length === 0) return setMsg("품목을 1개 이상 입력하세요.");
    const cleanLines = lines.map((l) => {
      const name = l.name.trim(), qty = toInt(l.qty), unit = toIntSigned(l.unit), weight_g = toNum(l.weight_g), food_type = (l.food_type || "").trim();
      const pack_ea = inferPackEaFromName(name), unit_type = pack_ea > 1 ? "BOX" : "EA", actual_ea = unit_type === "BOX" ? qty * pack_ea : qty;
      const r = calcLineAmounts(qty, unit, l.total_incl_vat);
      return { food_type, name, weight_g, qty, unit, unit_type, pack_ea, actual_ea, supply_amount: r.supply, vat_amount: r.vat, total_amount: r.total, is_sample: !!l.is_sample, stock_out_lots: l.stock_out_lots };
    }).filter((l) => l.name && l.qty > 0 && (l.is_sample || (l.total_amount ?? 0) !== 0));
    const zeroQtyLine = lines.find((l) => l.name.trim() && toInt(l.qty) <= 0); 
    if (zeroQtyLine) return setMsg(`"${zeroQtyLine.name.trim()}" 품목의 수량을 입력하세요. (0 또는 빈칸 불가)`);
    
    const noAmountLine = lines.find((l) => !l.is_sample && l.name.trim() && toInt(l.qty) > 0 && calcLineAmounts(toInt(l.qty), toIntSigned(l.unit), l.total_incl_vat).total === 0);
    if (noAmountLine) return setMsg(`"${noAmountLine.name.trim()}" 품목의 단가 또는 총액을 입력하세요.`); 
    
    if (cleanLines.length === 0) return setMsg("제품명/수량과 (단가 또는 총액)을 올바르게 입력하세요.");

    const { data: createdOrder, error: oErr } = await supabase.from("orders").insert({
      customer_id: selectedPartner.id, customer_name: selectedPartner.name, title: null,
      ship_date: shipDate, ship_method: shipMethod, status: "DRAFT",
      memo: JSON.stringify({ title: orderTitle.trim() || null, orderer_name: ordererName.trim() || null }),
      supply_amount: orderTotals.supply, vat_amount: orderTotals.vat, total_amount: orderTotals.total, created_by: null,
    }).select("id").single();
    if (oErr) return setMsg(oErr.message);
    const orderId = (createdOrder as any)?.id as string;
    if (!orderId) return setMsg("주문 생성 후 ID를 가져오지 못했습니다.");

    const { error: lErr } = await supabase.from("order_lines").insert(
      cleanLines.map((l, idx) => ({ order_id: orderId, line_no: idx + 1, food_type: l.food_type || null, name: l.name, weight_g: l.weight_g || null, qty: l.qty, unit: l.unit, unit_type: l.unit_type, pack_ea: l.pack_ea, actual_ea: l.actual_ea, supply_amount: l.supply_amount, vat_amount: l.vat_amount, total_amount: l.total_amount, is_sample: l.is_sample || null }))
    );
    if (lErr) return setMsg(lErr.message);

    const { error: sErr } = await supabase.from("order_shipments").insert(buildShipPayloads(orderId, ship1, ship2, twoShip));
    if (sErr) return setMsg(sErr.message);

    if (orderWoEnabled) {
      try {
        const { data: barcodeData, error: barcodeErr } = await supabase.rpc("generate_work_order_barcode");
        if (barcodeErr) throw new Error("바코드 생성 실패: " + barcodeErr.message);
        const barcodeNo = barcodeData as string;
        const todayStr = (() => { const d = new Date(); return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}`; })();
        const { data: newWoNo, error: woNoErr } = await supabase.rpc("generate_work_order_no", { date_str: todayStr });
        if (woNoErr || !newWoNo) throw new Error("작업지시서 번호 생성 실패: " + (woNoErr?.message ?? ""));
        const workOrderNo = newWoNo;

        const firstItemName = cleanLines[0]?.name ?? "";
        const productName = firstItemName
  ? `${selectedPartner.name}${orderWoSubName.trim() ? "-" + orderWoSubName.trim() : ""}-${firstItemName}`
  : selectedPartner.name;
        const foodType = cleanLines[0]?.food_type || null;

        const { data: createdWo, error: woErr } = await supabase.from("work_orders").insert({
          work_order_no: workOrderNo, barcode_no: barcodeNo,
          client_id: selectedPartner.id, client_name: selectedPartner.name,
          sub_name: orderWoSubName.trim() || null, order_date: todayYMD(),
          food_type: foodType, product_name: productName,
          logo_spec: orderWoLogoSpec.trim() || null, thickness: orderWoThickness || null,
          delivery_method: shipMethod, packaging_type: orderWoPackagingType || null,
          package_unit: wo_packageUnit === "기타" ? (wo_packageUnitCustom.trim() ? wo_packageUnitCustom.trim() + "ea" : null) : wo_packageUnit || null,
          mold_per_sheet: (toInt(orderWoMoldCols) * toInt(orderWoMoldRows)) > 0 ? toInt(orderWoMoldCols) * toInt(orderWoMoldRows) : null,
          mold_cols: toInt(orderWoMoldCols) > 0 ? toInt(orderWoMoldCols) : null,
          mold_rows: toInt(orderWoMoldRows) > 0 ? toInt(orderWoMoldRows) : null,
          mold_count: toInt(orderWoMoldCount) > 0 ? toInt(orderWoMoldCount) : null,
          note: (() => {
            const realMemo = "화이트초콜릿(이산화티타늄첨가)\n이산화티타늄 혼합. 흰색으로 만들것.\n배합비 10kg + 1kg";
            const hasReal = (foodType ?? "").includes("리얼");
            const base = orderWoNote.trim();
            if (hasReal && base) return `${realMemo}\n\n${base}`;
            if (hasReal) return realMemo;
            return base || null;
          })(),
          reference_note: orderTitle.trim() || null, 
          status: "생산중", is_reorder: orderIsReorder, images: [], linked_order_id: orderId,
          skip_production_check: orderSkipProductionCheck,
        }).select("id,barcode_no").single();
        if (woErr) throw new Error("작업지시서 생성 실패: " + woErr.message);
        const woId = (createdWo as any).id as string;
        const finalBarcode = (createdWo as any).barcode_no as string;

        // 품목별 바코드 생성 (재주문이면 기존 바코드 재사용)
        const woItemsPayload: any[] = [];
        for (let li = 0; li < cleanLines.length; li++) {
          const l = cleanLines[li];
          let itemBarcodeNo: string;
          
         
if (orderIsReorder && wo_itemExistingBarcodes[l.name]) {
  itemBarcodeNo = wo_itemExistingBarcodes[l.name]; // 기존 바코드 재사용 (품목명 기준)

          } else {
            const { data: itemBarcode, error: ibErr } = await supabase.rpc("generate_work_order_barcode");
            if (ibErr) throw new Error("제품 바코드 생성 실패: " + ibErr.message);
            itemBarcodeNo = itemBarcode as string;
          }
          woItemsPayload.push({ work_order_id: woId, delivery_date: shipDate, sub_items: [{ name: l.name, qty: l.qty }], order_qty: l.qty, barcode_no: itemBarcodeNo, unit_weight: l.weight_g && Number(l.weight_g) > 0 ? Number(l.weight_g) : null });
        }
        const { data: createdWoItems, error: wiErr } = await supabase.from("work_order_items").insert(woItemsPayload).select("id,barcode_no,sub_items");
        if (wiErr) throw new Error("작업지시서 항목 생성 실패: " + wiErr.message);
        const woItemId = (createdWoItems as any[])?.[0]?.id as string;
        await supabase.from("orders").update({ work_order_item_id: woItemId }).eq("id", orderId);

        await supabase.from("plates").insert({ work_order_id: woId, description: `${selectedPartner.name} / ${productName}`, status: "active" });

       // ── 품목별 product/variant 생성 (바코드 중복 방지, 라인별 product_id 분리) ──
       let firstVariantId: string | null = null;
       for (const createdItem of (createdWoItems as any[]) ?? []) {
         const itemBarcodeNo = createdItem.barcode_no as string;
         const itemName = (createdItem.sub_items as WoSubItem[])?.[0]?.name ?? firstItemName;
         const itemVariantName = `${selectedPartner.name}${orderWoSubName.trim() ? "-" + orderWoSubName.trim() : ""}-${itemName}`;
         // 해당 품목의 무게: cleanLines에서 이름 매칭으로 찾기
         const matchedLine = cleanLines.find((l) => l.name === itemName);
         const itemWeightG = matchedLine?.weight_g && Number(matchedLine.weight_g) > 0 ? Number(matchedLine.weight_g) : null;
         const itemFoodType = matchedLine?.food_type || foodType || null;

         // ── 바코드 재사용 시: 이미 이 바코드를 가진 variant가 있으면 그대로 사용 ──
         // (거래처명 변경 등으로 itemVariantName이 과거와 달라져도 barcode_uq 충돌 방지)
         const { data: existByBarcode } = await supabase.from("product_variants").select("id").eq("barcode", itemBarcodeNo).limit(1).maybeSingle();
         if (existByBarcode?.id) {
           const reusedVariantId = existByBarcode.id;
           if (itemWeightG != null) {
             await supabase.from("product_variants").update({ weight_g: itemWeightG }).eq("id", reusedVariantId);
           }
           if (!firstVariantId) firstVariantId = reusedVariantId;
           continue;
         }

         // 품목별 products 조회/생성 (라인마다 product_id가 다를 수 있으므로 라인별로 처리)
         const { data: existItemProduct } = await supabase.from("products").select("id").eq("name", itemVariantName).limit(1).maybeSingle();
         let itemProductId: string;
         if (existItemProduct?.id) {
           itemProductId = existItemProduct.id;
         } else {
           const { data: newItemProduct, error: ipErr } = await supabase.from("products").insert({ name: itemVariantName, category: "업체", food_type: itemFoodType || "기타", default_weight_g: 0 }).select("id").single();
           if (ipErr) throw new Error("제품 등록 실패: " + ipErr.message);
           itemProductId = (newItemProduct as any).id;
         }

         const { data: existItemVariant } = await supabase
           .from("product_variants").select("id, barcode").eq("product_id", itemProductId).eq("variant_name", itemVariantName).limit(1).maybeSingle();
         let itemVariantId: string;
         if (existItemVariant?.id) {
           // ── 기존 variant 재사용: 새 바코드 폐기, 기존 바코드 유지 ──
           itemVariantId = existItemVariant.id;
           // weight_g 업데이트
           if (itemWeightG != null) {
             await supabase.from("product_variants").update({ weight_g: itemWeightG }).eq("id", itemVariantId);
           }
           const existingBarcode = existItemVariant.barcode as string | null;
           if (existingBarcode) {
             const { data: existPb } = await supabase.from("product_barcodes").select("id").eq("barcode", existingBarcode).maybeSingle();
             if (!existPb) {
               await supabase.from("product_barcodes").insert({ variant_id: itemVariantId, barcode: existingBarcode, is_primary: true, is_active: true });
             }
           }
         } else {
           // ── 신규 variant 생성: 새 바코드 사용 ──
           const { data: newItemVariant, error: vivErr } = await supabase.from("product_variants").insert({ product_id: itemProductId, variant_name: itemVariantName, barcode: itemBarcodeNo, pack_unit: 1, unit_type: "EA", weight_g: itemWeightG }).select("id").single();
           if (vivErr) throw new Error("제품 규격 등록 실패: " + vivErr.message);
           itemVariantId = (newItemVariant as any).id;
           const { data: existItemBarcode } = await supabase.from("product_barcodes").select("id").eq("barcode", itemBarcodeNo).maybeSingle();
           if (!existItemBarcode) {
             await supabase.from("product_barcodes").insert({ variant_id: itemVariantId, barcode: itemBarcodeNo, is_primary: true, is_active: true });
           }
         }
         if (!firstVariantId) firstVariantId = itemVariantId;
       }

        // work_orders.variant_id = 첫 번째 제품 variant
        if (firstVariantId) {
          await supabase.from("work_orders").update({ variant_id: firstVariantId }).eq("id", woId);
        }

       // 품목별 이미지 업로드 → work_order_items.images
        // (기존 이미지 경로 + 새 파일 업로드 합쳐서 저장)
        for (let lineIdx = 0; lineIdx < cleanLines.length; lineIdx++) {
          const createdItem = (createdWoItems as any[])?.[lineIdx];
          if (!createdItem?.id) continue;

         // raw 경로 직접 사용 (signed URL 역변환 불필요)
         const existingPaths: string[] = wo_itemExistingImagePaths[lineIdx] ?? [];

          // 새로 선택한 파일 업로드
          const newFiles = wo_itemImageFiles[lineIdx] ?? [];
          const uploadedPaths: string[] = [];
          for (const file of newFiles) {
            const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase();
            const path = `orders/${finalBarcode}/item_${lineIdx}_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
            const { error: upErr } = await supabase.storage.from("work-order-images").upload(path, file, { upsert: true });
            if (!upErr) uploadedPaths.push(path);
          }

          // 기존 + 신규 합쳐서 저장
          const finalPaths = [...existingPaths, ...uploadedPaths];
          if (finalPaths.length > 0) {
            await supabase.from("work_order_items").update({ images: finalPaths }).eq("id", createdItem.id);
          }
        }
      } catch (woCreateErr: any) {
        const woFailUserId = (await supabase.auth.getUser()).data.user?.id ?? null;
        const stockErrorsOnWoFail = await applyStockOutLots(supabase, cleanLines, orderId, null, shipDate, woFailUserId);

        // ── Step4: 재고부족(마켓플레이스 거래처) 라인 → 임시 lot + 임시 작업지시서 자동생성 ──
        if (SUBADMIN_PINNED_TOP_NAMES.includes(selectedPartner.name)) {
          for (const cl of cleanLines) {
            if (isSpecialItem(cl.name)) continue;
            if ((cl.stock_out_lots ?? []).length > 0) continue;
            const variantId = masterByName.get(cl.name)?.variant_id;
            if (!variantId) continue;
            const shortageResult = await createTempLotForShortage(supabase, variantId, cl.qty, cl.name, shipDate, selectedPartner.name, woFailUserId, orderId);
            if (shortageResult.error) stockErrorsOnWoFail.push(shortageResult.error);
          }
        }

        const stockMsgPart = stockErrorsOnWoFail.length > 0 ? ` / 재고 차감 오류: ${stockErrorsOnWoFail.join(" / ")}` : "";
        stockWarningMsg = `⚠️ 주문은 저장됐으나 작업지시서 자동생성 실패: ${woCreateErr?.message ?? woCreateErr}${stockMsgPart}`;
        setOrderIsReorder(false); setOrderTitle(""); setOrdererName("");
        setLines([{ food_type: "", name: "", weight_g: 0, qty: 0, unit: "", total_incl_vat: "" }]);
        setShip1(emptyShip()); setShip2(emptyShip()); setTwoShip(false); setToTouched(false);
        setOrderWoSubName(""); setOrderWoLogoSpec(""); setOrderWoThickness("2mm");
        setOrderWoPackagingType(""); setOrderWoMoldPerSheet(""); setOrderWoMoldCols(""); setOrderWoMoldRows(""); setOrderWoMoldCount(""); setOrderWoNote("");
        setOrderSkipProductionCheck(false); setWo_packageUnit(""); setWo_packageUnitCustom("");
        setWo_itemImageFiles({}); setWo_itemImagePreviewUrls({}); setWo_itemExistingImageUrls({}); setWo_itemExistingImagePaths({}); setWo_itemExistingBarcodes({});
        await loadTrades();
        if (stockWarningMsg) setMsg(stockWarningMsg);
        return;
      }
    }
    {
      const { data: { user } } = await supabase.auth.getUser();
      const stockUserId = user?.id ?? null;
      let stockWorkOrderNo: string | null = null;
      if (orderWoEnabled) {
        const { data: linkedWo } = await supabase.from("work_orders").select("work_order_no").eq("linked_order_id", orderId).limit(1).maybeSingle();
        stockWorkOrderNo = (linkedWo as any)?.work_order_no ?? null;
      }
      const stockErrors = await applyStockOutLots(supabase, cleanLines, orderId, stockWorkOrderNo, shipDate, stockUserId);

      // ── Step4: 재고부족(마켓플레이스 거래처) 라인 → 임시 lot + 임시 작업지시서 자동생성 ──
      if (SUBADMIN_PINNED_TOP_NAMES.includes(selectedPartner.name)) {
        for (const cl of cleanLines) {
          if (isSpecialItem(cl.name)) continue;
          if ((cl.stock_out_lots ?? []).length > 0) continue;
          const variantId = masterByName.get(cl.name)?.variant_id;
          if (!variantId) continue;
          const shortageResult = await createTempLotForShortage(supabase, variantId, cl.qty, cl.name, shipDate, selectedPartner.name, stockUserId, orderId);
          if (shortageResult.error) stockErrors.push(shortageResult.error);
        }
      }

      if (stockErrors.length > 0) stockWarningMsg = "⚠️ 주문은 저장됐으나 재고 차감 오류: " + stockErrors.join(" / ");
    }

    setOrderIsReorder(false); setOrderTitle(""); setOrdererName("");
    setLines([{ food_type: "", name: "", weight_g: 0, qty: 0, unit: "", total_incl_vat: "" }]);
    setShip1(emptyShip()); setShip2(emptyShip()); setTwoShip(false); setToTouched(false);
    setOrderWoSubName(""); setOrderWoLogoSpec(""); setOrderWoThickness("2mm");
    setOrderWoPackagingType(""); setOrderWoMoldPerSheet(""); setOrderWoMoldCols(""); setOrderWoMoldRows(""); setOrderWoMoldCount(""); setOrderWoNote("");
    setOrderSkipProductionCheck(false); setWo_packageUnit(""); setWo_packageUnitCustom("");
    setWo_itemImageFiles({}); setWo_itemImagePreviewUrls({}); setWo_itemExistingImageUrls({}); setWo_itemExistingImagePaths({}); setWo_itemExistingBarcodes({});
    await loadTrades();
    if (stockWarningMsg) setMsg(stockWarningMsg);
  }

  async function createLedger() {
    setMsg(null);
    const amount = Number((amountStr || "0").replaceAll(",", ""));
    if (!Number.isFinite(amount) || amount <= 0) return setMsg("금액(원)을 올바르게 입력하세요.");
    if (category === "급여" && !salaryEmployeeId) return setMsg("급여는 직원 선택이 필요합니다.");
    const counterparty_name = manualCounterpartyName.trim() || selectedPartner?.name || null;
    const business_no = manualBusinessNo.trim() || selectedPartner?.business_no || null;
    if (!counterparty_name) return setMsg("업체명(매입처/상대방)을 입력하거나 왼쪽에서 거래처를 선택하세요.");
    const { data: inserted, error } = await supabase.from("ledger_entries").insert({
      entry_date: entryDate, entry_ts: new Date().toISOString(), direction: categoryToDirection(category),
      amount, supply_amount: ledgerSplit.supply, vat_amount: ledgerSplit.vat, total_amount: ledgerSplit.total,
      category, method: payMethod, counterparty_name, business_no, memo: ledgerMemo.trim() || null, status: "POSTED", partner_id: selectedPartner?.id ?? null
    }).select("id").single();
    if (error) return setMsg(error.message);
    const ledgerEntryId = (inserted as any)?.id as string | undefined;
    if (category === "급여" && ledgerEntryId && salaryEmployeeId) {
      const payMonth = String(entryDate ?? "").slice(0, 7);
      const { error: hpErr } = await supabase.from("hr_payments").insert({ ledger_entry_id: ledgerEntryId, employee_id: salaryEmployeeId, pay_month: payMonth, kind: "SALARY", amount, note: null });
      if (hpErr) return setMsg(hpErr.message);
    }
    setAmountStr(""); setLedgerMemo(""); setVatFree(category === "급여");
    if (!selectedPartner) { setManualCounterpartyName(""); setManualBusinessNo(""); }
    setSalaryEmployeeId(""); setToTouched(false);
    await loadTrades();
  }

  // ── 작업지시서 ──
  function resetWoForm() {
    setWo_subName(""); setWo_orderDate(todayYMD()); setWo_foodType("");
    setWo_productName(""); setWo_logoSpec(""); setWo_thickness("2mm");
    setWo_deliveryMethod("택배"); setWo_packagingType("트레이");
    setWo_traySlot("정사각20구"); setWo_packageUnit("100ea");
    setWo_moldPerSheet(""); setWo_moldCols(""); setWo_moldRows(""); setWo_note(""); setWo_referenceNote(""); 
    setWo_isReorder(false); setWo_originalId("");
    setWo_items([{ id: crypto.randomUUID(), delivery_date: todayYMD(), sub_items: [{ name: "", qty: 0 }], order_qty: 0 }]);
    setWo_itemImageFiles({}); setWo_itemImagePreviewUrls({}); setWo_itemExistingImageUrls({}); setWo_itemExistingImagePaths({}); setWo_itemExistingBarcodes({});
    setWo_linkedOrderId(null); setWo_linkedOrderSummary("");
  }

  function openWoModalFromOrder(x: UnifiedRow) {
    if (x.kind !== "ORDER") return;
    resetWoForm();
    const lines = x.order_lines ?? [];
    const firstLineName = lines[0]?.name ?? "";
    const firstName = firstLineName || (x.order_title ?? "");
    const firstFoodType = lines[0]?.food_type ?? "";
    const newWoItems: WoItem[] = [{
      id: crypto.randomUUID(), delivery_date: x.date || todayYMD(),
      sub_items: lines.length > 0 ? lines.map((l) => ({ name: String(l.name ?? ""), qty: Number(l.qty ?? 0) })) : [{ name: "", qty: 0 }],
      order_qty: lines.reduce((s, l) => s + Number(l.qty ?? 0), 0),
    }];
    setWo_productName(firstName); setWo_foodType(firstFoodType);
    setWo_orderDate(x.date || todayYMD()); setWo_deliveryMethod(x.ship_method ?? "택배");
    setWo_items(newWoItems); setWo_linkedOrderId(x.rawId);
    setWo_linkedOrderSummary(`${x.date} / ${x.partnerName} / ${buildOrderSummaryText(x)} / ${fmt(x.outAmt)}원`);
    setWo_modalOpen(true);
  }

  async function loadWoList() {
    if (!selectedPartner) return;
    setWo_listLoading(true);
    try {
      const { data, error } = await supabase
        .from("work_orders")
        .select("id,work_order_no,barcode_no,client_id,client_name,sub_name,order_date,food_type,product_name,logo_spec,thickness,delivery_method,packaging_type,tray_slot,package_unit,mold_per_sheet,note,reference_note,status,status_transfer,status_print_check,status_production,status_input,is_reorder,original_work_order_id,variant_id,images,created_at,work_order_items(id,delivery_date,sub_items,order_qty,barcode_no,actual_qty,unit_weight,expiry_date,note)")
        .eq("client_id", selectedPartner.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) return setMsg(error.message);
      setWo_list((data ?? []) as WorkOrderRow[]);
    } finally { setWo_listLoading(false); }
  }

  async function createWorkOrder() {
    setMsg(null);
    if (!selectedPartner) return setMsg("왼쪽에서 거래처를 먼저 선택하세요.");
    if (!wo_productName.trim()) return setMsg("품목명을 입력하세요.");
    const cleanItems = wo_items
      .map((item) => ({ ...item, order_qty: item.sub_items.reduce((s, si) => s + (Number(si.qty) || 0), 0) }))
      .filter((item) => item.delivery_date && item.sub_items.some((si) => si.name.trim() && si.qty > 0));
    if (cleanItems.length === 0) return setMsg("납기일과 수량을 1건 이상 입력하세요.");

    setWo_saving(true);
    try {
      const { data: barcodeData, error: barcodeErr } = await supabase.rpc("generate_work_order_barcode");
      if (barcodeErr) return setMsg("바코드 생성 실패: " + barcodeErr.message);
      const barcodeNo = barcodeData as string;
      const todayStr2 = (() => { const d = new Date(); return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}`; })();
      const { data: newWoNo2, error: woNoErr2 } = await supabase.rpc("generate_work_order_no", { date_str: todayStr2 });
      if (woNoErr2 || !newWoNo2) return setMsg("작업지시서 번호 생성 실패: " + (woNoErr2?.message ?? ""));
      const workOrderNo = newWoNo2;

      const { data: createdWo, error: woErr } = await supabase.from("work_orders").insert({
        work_order_no: workOrderNo, barcode_no: barcodeNo,
        client_id: selectedPartner.id, client_name: selectedPartner.name,
        sub_name: wo_subName.trim() || null, order_date: wo_orderDate,
        food_type: wo_foodType.trim() || null, product_name: wo_productName.trim(),
        logo_spec: wo_logoSpec.trim() || null, thickness: wo_thickness || null,
        delivery_method: wo_deliveryMethod || null, packaging_type: wo_packagingType === "트레이" ? `트레이-${wo_traySlot}` : wo_packagingType || null,
        tray_slot: null,
        package_unit: wo_packageUnit || null,
        mold_per_sheet: (toInt(wo_moldCols) * toInt(wo_moldRows)) > 0 ? toInt(wo_moldCols) * toInt(wo_moldRows) : null,
        mold_cols: toInt(wo_moldCols) > 0 ? toInt(wo_moldCols) : null,
        mold_rows: toInt(wo_moldRows) > 0 ? toInt(wo_moldRows) : null,
        note: wo_note.trim() || null, reference_note: wo_referenceNote.trim() || null,
        status: "생산중", is_reorder: wo_isReorder,
        original_work_order_id: wo_isReorder && wo_originalId ? wo_originalId : null,
        images: [], ...(wo_linkedOrderId ? { linked_order_id: wo_linkedOrderId } : {}),
      }).select("id,barcode_no,work_order_no").single();
      if (woErr) return setMsg("작업지시서 생성 실패: " + woErr.message);
      const woId = (createdWo as any).id as string;
      const finalBarcode = (createdWo as any).barcode_no as string;

      // 품목별 고유 바코드 생성
      const woItemsPayload: any[] = [];
      for (const item of cleanItems) {
        for (const si of item.sub_items.filter((si) => si.name.trim() && si.qty > 0)) {
          const { data: itemBarcode, error: ibErr } = await supabase.rpc("generate_work_order_barcode");
          if (ibErr) return setMsg("제품 바코드 생성 실패: " + ibErr.message);
          woItemsPayload.push({ work_order_id: woId, delivery_date: item.delivery_date, sub_items: [{ name: si.name, qty: si.qty }], order_qty: si.qty, barcode_no: itemBarcode as string });
        }
      }
      const { data: createdItems, error: itemErr } = await supabase.from("work_order_items").insert(woItemsPayload).select("id,delivery_date,sub_items,order_qty,work_order_id,barcode_no");
      if (itemErr) return setMsg("납기일 항목 생성 실패: " + itemErr.message);

      await supabase.from("plates").insert({ work_order_id: woId, description: `${selectedPartner.name} / ${wo_productName.trim()}`, status: "active" });

      if (!wo_isReorder) {
        const woProductsName = `${selectedPartner.name}${wo_subName.trim() ? "-" + wo_subName.trim() : ""}-${wo_productName.trim()}`;
        const { data: existProduct } = await supabase.from("products").select("id").eq("name", woProductsName).limit(1).maybeSingle();
        let productId: string;
        if (existProduct?.id) {
          productId = existProduct.id;
        } else {
          const { data: newProduct, error: pErr } = await supabase.from("products").insert({ name: woProductsName, category: "업체", food_type: wo_foodType.trim() || "기타", default_weight_g: 0 }).select("id").single();
          if (pErr) return setMsg("제품 등록 실패: " + pErr.message);
          productId = (newProduct as any).id;
        }

        // ── 품목별 variant 생성 (바코드 중복 방지) ──
        let firstVariantId: string | null = null;
        for (const createdItem of (createdItems as any[]) ?? []) {
          const itemBarcodeNo = createdItem.barcode_no as string;
          const itemName = (createdItem.sub_items as WoSubItem[])?.[0]?.name ?? wo_productName.trim();
          const itemVariantName = `${selectedPartner.name}${wo_subName.trim() ? "-" + wo_subName.trim() : ""}-${itemName}`;
          // wo_items에서 해당 sub_item의 무게는 없으므로 wo_productName 기준 (추후 확장 가능)
          const itemWeightG: number | null = null;
          const { data: existItemVariant } = await supabase
            .from("product_variants").select("id, barcode").eq("product_id", productId).eq("variant_name", itemVariantName).limit(1).maybeSingle();
          let itemVariantId: string;
          if (existItemVariant?.id) {
            // ── 기존 variant 재사용: 새 바코드 폐기, 기존 바코드 유지 ──
            itemVariantId = existItemVariant.id;
            const existingBarcode = existItemVariant.barcode as string | null;
            if (existingBarcode) {
              const { data: existPb } = await supabase.from("product_barcodes").select("id").eq("barcode", existingBarcode).maybeSingle();
              if (!existPb) {
                await supabase.from("product_barcodes").insert({ variant_id: itemVariantId, barcode: existingBarcode, is_primary: true, is_active: true });
              }
            }
          } else {
            // ── 신규 variant 생성: 새 바코드 사용 ──
            const { data: newItemVariant, error: vivErr } = await supabase.from("product_variants").insert({ product_id: productId, variant_name: itemVariantName, barcode: itemBarcodeNo, pack_unit: 1, unit_type: "EA", weight_g: itemWeightG }).select("id").single();
            if (vivErr) return setMsg("제품 규격 등록 실패: " + vivErr.message);
            itemVariantId = (newItemVariant as any).id;
            const { data: existItemBarcode } = await supabase.from("product_barcodes").select("id").eq("barcode", itemBarcodeNo).maybeSingle();
            if (!existItemBarcode) {
              await supabase.from("product_barcodes").insert({ variant_id: itemVariantId, barcode: itemBarcodeNo, is_primary: true, is_active: true });
            }
          }
          if (!firstVariantId) firstVariantId = itemVariantId;
        }

        // work_orders.variant_id = 첫 번째 제품 variant
        if (firstVariantId) {
          await supabase.from("work_orders").update({ variant_id: firstVariantId }).eq("id", woId);
        }
      }

      // 작업지시서 모달: 첫 번째 제품(0번) 이미지를 첫 번째 work_order_item에 저장
      const woModalFiles = wo_itemImageFiles[0] ?? [];
      if (woModalFiles.length > 0 && createdItems?.[0]?.id) {
        const uploadedPaths: string[] = [];
        for (const file of woModalFiles) {
          const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase();
          const path = `orders/${finalBarcode}/item_0_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
          const { error: upErr } = await supabase.storage.from("work-order-images").upload(path, file);
          if (!upErr) uploadedPaths.push(path);
        }
        if (uploadedPaths.length > 0) {
          await supabase.from("work_order_items").update({ images: uploadedPaths }).eq("id", createdItems[0].id);
        }
      }

      setMsg(`✅ 작업지시서 생성 완료! 바코드: ${finalBarcode}`);
      resetWoForm(); setWo_modalOpen(false); await loadWoList();
    } finally { setWo_saving(false); }
  }

  async function onCopyClick(r: UnifiedRow) {
    setMsg(null);

      // ── 해당 거래처 자동 선택 ──
  const copyPartnerId = r.kind === "ORDER"
  ? (orders.find(o => o.id === r.rawId)?.customer_id ?? null)
  : (ledgers.find(l => l.id === r.rawId)?.partner_id ?? null);
if (copyPartnerId) {
  const found = partners.find(p => p.id === copyPartnerId);
  if (found && found.id !== selectedPartner?.id) {
    setSelectedPartner(found);
    pushRecentPartner(found.id);
  }
}

    if (r.kind === "ORDER") {
      setOrderIsReorder(false); setMode("ORDERS"); setShipDate(todayYMD());
      setOrdererName(r.orderer_name ?? r.ordererName ?? ""); setShipMethod(r.ship_method ?? "택배");
      setOrderTitle(r.order_title ?? "");
      setLines(r.order_lines?.length ? r.order_lines.map((l) => ({ food_type: String(l.food_type ?? ""), name: String(l.name ?? ""), weight_g: Number(l.weight_g ?? 0), qty: toInt(l.qty ?? 0), unit: Number(l.unit ?? 0), total_incl_vat: Number(l.total_amount ?? 0), is_sample: !!l.is_sample })) : [{ food_type: "", name: "", weight_g: 0, qty: 0, unit: "", total_incl_vat: "" }]);
      applyShipmentsToForm(r.order_shipments ?? [], setShip1, setShip2, setTwoShip);
      // ── 기존 작업지시서 + work_order_items 이미지 복사 ──
      try {
        const { data: wo } = await supabase
          .from("work_orders")
          .select("id,sub_name,logo_spec,thickness,packaging_type,package_unit,mold_per_sheet,mold_cols,mold_rows,mold_count,note,reference_note,work_order_items(id,delivery_date,sub_items,images,barcode_no,unit_weight)")
          .eq("linked_order_id", r.rawId)
          .limit(1)
          .maybeSingle();
        if (wo) {
          // 작업지시서 기본 설정 복사
          setOrderWoSubName((wo as any).sub_name ?? "");
          setOrderWoLogoSpec((wo as any).logo_spec ?? "");
          setOrderWoThickness((wo as any).thickness ?? "2mm");
          setOrderWoPackagingType((wo as any).packaging_type ?? "");
          setOrderWoMoldPerSheet((wo as any).mold_per_sheet ? String((wo as any).mold_per_sheet) : "");
          setOrderWoMoldCols((wo as any).mold_cols ? String((wo as any).mold_cols) : "");
          setOrderWoMoldRows((wo as any).mold_rows ? String((wo as any).mold_rows) : "");
          setOrderWoMoldCount((wo as any).mold_count ? String((wo as any).mold_count) : "");
          setOrderTitle((wo as any).reference_note ?? "");
          setOrderWoNote((wo as any).note ?? "");
          const _pu = (wo as any).package_unit ?? "";
          if (_pu === "" || _pu === "100ea" || _pu === "200ea") {
            setWo_packageUnit(_pu); setWo_packageUnitCustom("");
          } else {
            setWo_packageUnit("기타");
            setWo_packageUnitCustom(_pu.replace(/ea$/i, ""));
          }

          // 품목별 기존 바코드 저장 (재주문 시 재사용) - 품목명을 key로 사용
          const woItemsAll: any[] = (wo as any).work_order_items ?? [];
          const barcodeMap: Record<string, string> = {};
          const weightByIndex: Record<number, number> = {};
          const visibleWoItemsForBarcode = woItemsAll.filter((wi: any) => {
            const n = (wi.sub_items?.[0]?.name ?? "").trim();
            return !n.startsWith("성형틀") && !n.startsWith("인쇄제판");
          });
          visibleWoItemsForBarcode.forEach((wi: any, idx: number) => {
            if (wi.unit_weight) weightByIndex[idx] = Number(wi.unit_weight);
            const itemName = wi.sub_items?.[0]?.name ?? "";
            if (wi.barcode_no && itemName) barcodeMap[itemName] = wi.barcode_no;
          });


          setWo_itemExistingBarcodes(barcodeMap);

          if (Object.keys(weightByIndex).length > 0) {
            setLines((prev) => prev.map((l, i) => ({
              ...l,
              weight_g: weightByIndex[i] ?? l.weight_g,
            })));
          }

          // 품목별 이미지 복사 (lines 이름 기준 매핑)
          const woItems: any[] = (wo as any).work_order_items ?? [];
        // 수정
const copiedLines = r.order_lines?.length
? r.order_lines.map((l: any) => String(l.name ?? ""))
: [];
const newExistingMap: Record<number, string[]> = {};
const visibleWoItems = woItems.filter((wi: any) => {
  return !isSpecialItem(wi.sub_items?.[0]?.name ?? "");
});
for (let lineIdx = 0; lineIdx < copiedLines.length; lineIdx++) {
const matchedItem = visibleWoItems[lineIdx];
            const rawImages: string[] = matchedItem?.images ?? [];
            if (rawImages.length === 0) continue;
            const paths = rawImages.map((v: string) => {
              if (v.startsWith("http")) {
                const m = v.match(/work-order-images\/(.+?)(\?|$)/);
                return m ? m[1] : null;
              }
              return v;
            }).filter(Boolean) as string[];
            if (paths.length === 0) continue;
            const { data: signedData } = await supabase.storage.from("work-order-images").createSignedUrls(paths, 60 * 60);
            if (signedData) {
              newExistingMap[lineIdx] = signedData.map((d: any) => d.signedUrl);
            }
          }
          if (Object.keys(newExistingMap).length > 0) {
            setWo_itemExistingImageUrls(newExistingMap);
            // raw 경로 별도 저장 (저장 시 URL 역변환 없이 직접 사용)
            const newPathsMap: Record<number, string[]> = {};
            for (let lineIdx = 0; lineIdx < copiedLines.length; lineIdx++) {
              const matchedItem = visibleWoItems[lineIdx];
              const rawImages: string[] = matchedItem?.images ?? [];
              if (rawImages.length > 0) newPathsMap[lineIdx] = rawImages;
            }
            setWo_itemExistingImagePaths(newPathsMap);
          }
        }
      } catch (e) {
        // 이미지 복사 실패해도 주문 복사는 계속
      }
    } else {
      setMode("LEDGER"); setEntryDate(todayYMD());
      const c = (r.ledger_category as Category) ?? "기타"; setCategory(CATEGORIES.includes(c) ? c : "기타");
      setPayMethod((r.ledger_method as any) ?? "BANK"); setLedgerMemo(r.ledger_memo ?? "");
      const amt = Number(r.ledger_amount ?? 0); setAmountStr(amt > 0 ? amt.toLocaleString("ko-KR") : "");
      setManualCounterpartyName(r.partnerName ?? ""); setManualBusinessNo(r.businessNo ?? "");
      setVatFree(false); setSalaryEmployeeId("");
    }
  }

  function onMemoClick(r: UnifiedRow) {
    setMemoTitle(r.kind === "ORDER" ? `주문/출고 메모 - ${r.partnerName}` : `금전출납 메모 - ${r.partnerName}`);
    setMemoBody(buildMemoText(r)); setMemoOpen(true);
  }

  async function openEdit(r: UnifiedRow) {
    setMsg(null); setEditRow(r);

      // ── 해당 거래처 자동 선택 ──
  const editPartnerId = r.kind === "ORDER"
  ? (orders.find(o => o.id === r.rawId)?.customer_id ?? null)
  : (ledgers.find(l => l.id === r.rawId)?.partner_id ?? null);
if (editPartnerId) {
  const found = partners.find(p => p.id === editPartnerId);
  if (found && found.id !== selectedPartner?.id) {
    setSelectedPartner(found);
    pushRecentPartner(found.id);
  }
}

    if (r.kind === "ORDER") {
      setEShipDate(r.date || todayYMD()); setEOrdererName(r.orderer_name ?? r.ordererName ?? "");
      setEShipMethod(r.ship_method ?? r.method ?? "택배"); setEOrderTitle(r.order_title ?? "");
      setELines(r.order_lines?.length ? r.order_lines.map((l) => ({ food_type: String(l.food_type ?? ""), name: String(l.name ?? ""), weight_g: Number(l.weight_g ?? 0), qty: toInt(l.qty ?? 0), unit: Number(l.unit ?? 0), total_incl_vat: Number(l.total_amount ?? 0), is_sample: !!l.is_sample })) : [{ food_type: "", name: "", weight_g: 0, qty: 0, unit: "", total_incl_vat: "" }]);
      applyShipmentsToForm(r.order_shipments ?? [], setEShip1, setEShip2, setETwoShip);
      setEWoId(null); setEWoSubName(""); setEWoProductName(""); setEWoFoodType(""); setEWoLogoSpec("");
      setEWoThickness("2mm"); setEWoDeliveryMethod("택배"); setEWoPackagingType("");
      setEWoMoldPerSheet(""); setEWoNote(""); setEWoImageFiles([]); setEWoImagePreviewUrls([]);
      setEWoExistingImages([]); setEWoExistingSignedLoading(false); setEWoExistingSignedUrls([]);
      const { data: wo } = await supabase.from("work_orders").select("id,sub_name,product_name,food_type,logo_spec,thickness,delivery_method,packaging_type,package_unit,mold_per_sheet,mold_cols,mold_rows,mold_count,note,reference_note,images,work_order_items(id,sub_items,images,delivery_date,order_qty,barcode_no)").eq("linked_order_id", r.rawId).limit(1).maybeSingle();
      // 품목별 이미지 초기화
      setEItemImageFiles({}); setEItemImagePreviewUrls({}); setEItemExistingImageUrls({}); setEWoItemIds([]);
      if (wo) {
        setEWoId((wo as any).id); setEWoSubName((wo as any).sub_name ?? "");
// 서브네임 있으면 서브네임만, 없으면 품목명 자동 생성
const woSubNameVal = (wo as any).sub_name ?? "";
if (woSubNameVal) {
  setEWoProductName(woSubNameVal);
} else {
  const woItemsAll: any[] = (wo as any).work_order_items ?? [];
  const visibleWoItems = woItemsAll.filter((i: any) => {
    return !isSpecialItem(i.sub_items?.[0]?.name ?? "");
  });
  const firstName = visibleWoItems[0]?.sub_items?.[0]?.name ?? (wo as any).product_name ?? "";
  const count = visibleWoItems.length;
  setEWoProductName(count > 1 ? `${firstName} 외 ${count - 1}건` : firstName);
}

       
        
        
        setEWoFoodType((wo as any).food_type ?? "");
        setEWoLogoSpec((wo as any).logo_spec ?? ""); setEWoThickness((wo as any).thickness ?? "2mm");
        setEWoDeliveryMethod((wo as any).delivery_method ?? "택배"); setEWoPackagingType((wo as any).packaging_type ?? "");
        setEWoMoldPerSheet((wo as any).mold_per_sheet ? String((wo as any).mold_per_sheet) : "");
        setEWoMoldCols((wo as any).mold_cols ? String((wo as any).mold_cols) : "");
        setEWoMoldRows((wo as any).mold_rows ? String((wo as any).mold_rows) : "");
        setEWoMoldCount((wo as any).mold_count ? String((wo as any).mold_count) : "");
        const _epu = (wo as any).package_unit ?? "";
        if (_epu === "" || _epu === "100ea" || _epu === "200ea") {
          setEWoPackageUnit(_epu); setEWoPackageUnitCustom("");
        } else {
          setEWoPackageUnit("기타");
          setEWoPackageUnitCustom(_epu.replace(/ea$/i, ""));
        }
        setEOrderTitle((wo as any).reference_note ?? "");
        setEWoNote((wo as any).note ?? "");
        const rawImages: string[] = (wo as any).images ?? [];
        setEWoExistingImages(rawImages);
        if (rawImages.length > 0) {
          setEWoExistingSignedLoading(true);
          const signedUrls = await resolveSignedImageUrls(rawImages, supabase);
          setEWoExistingSignedUrls(signedUrls); setEWoExistingSignedLoading(false);
        }
        // 품목별 이미지 로드 (eLines 이름 기준 매핑)
        const woItems: any[] = (wo as any).work_order_items ?? [];
        const visibleWoItems = woItems.filter((wi: any) => {
          return !isSpecialItem(wi.sub_items?.[0]?.name ?? "");
        });
        // woItem id를 eLines 이름 순서로 매핑
        const eLineNames = r.order_lines?.length
          ? r.order_lines.map((l: any) => String(l.name ?? ""))
          : [];
        const orderedItemIds: string[] = eLineNames.map((lineName: string) => {
          const matched = visibleWoItems.find((wi: any) =>
            (wi.sub_items?.[0]?.name ?? "") === lineName
          );
          return matched?.id ?? "";
        });
        setEWoItemIds(orderedItemIds);
        const newExistingMap: Record<number, string[]> = {};
        for (let idx = 0; idx < eLineNames.length; idx++) {
          const lineName = eLineNames[idx];
          const matchedItem = visibleWoItems.find((wi: any) =>
            (wi.sub_items?.[0]?.name ?? "") === lineName
          ) ?? visibleWoItems[idx];

          const rawItemImages: string[] = matchedItem?.images ?? [];
          if (rawItemImages.length === 0) continue;
          const paths = rawItemImages.map((v: string) => {
            if (v.startsWith("http")) { const m = v.match(/work-order-images\/(.+?)(\?|$)/); return m ? m[1] : null; }
            return v;
          }).filter(Boolean) as string[];
          if (paths.length === 0) continue;
          const { data: sd } = await supabase.storage.from("work-order-images").createSignedUrls(paths, 60 * 60);
          if (sd) newExistingMap[idx] = sd.map((d: any) => d.signedUrl);
        }
        setEItemExistingImageUrls(newExistingMap);
      }
    } else {
      setEEntryDate(r.date || todayYMD());
      const m = (r.ledger_method ?? r.method ?? "BANK") as any;
      setEPayMethod(["BANK", "CASH", "CARD", "ETC"].includes(m) ? m : "BANK");
      const c = (r.ledger_category as Category) ?? (r.category as Category) ?? "기타";
      setECategory(CATEGORIES.includes(c) ? c : "기타");
      const amt = Number(r.ledger_amount ?? (r.inAmt || r.outAmt || 0));
      setEAmountStr(amt > 0 ? amt.toLocaleString("ko-KR") : "");
      setELedgerMemo(r.ledger_memo ?? ""); setECounterpartyName(r.partnerName ?? ""); setEBusinessNo(r.businessNo ?? "");
      const vatAmt = Number(r.ledger_vat_amount ?? 0), supplyAmt = Number(r.ledger_supply_amount ?? 0), totalAmt = Number(r.ledger_total_amount ?? 0);
      const resolvedCat = CATEGORIES.includes(c) ? c : "기타";
      setEVatFree(resolvedCat === "급여" ? true : (amt > 0 && vatAmt === 0 && supplyAmt === amt && totalAmt === amt));
      setESalaryEmployeeId("");
      if (CATEGORIES.includes(c) && c === "급여") {
        const { data: hp, error: hpErr } = await supabase.from("hr_payments").select("employee_id").eq("ledger_entry_id", r.rawId).limit(1);
        if (!hpErr && hp && hp[0]?.employee_id) setESalaryEmployeeId(String(hp[0].employee_id));
      }
    }
    setEditOpen(true);
  }

  async function saveEdit() {
    if (!editRow) return; setMsg(null);
    let stockWarningMsg: string | null = null;
    if (editRow.kind === "ORDER") {
      const cleanLines = eLines.map((l) => {
        const name = (l.name || "").trim(), qty = toInt(l.qty), unit = toIntSigned(l.unit), weight_g = toNum(l.weight_g), food_type = (l.food_type || "").trim();
        const pack_ea = inferPackEaFromName(name), unit_type = pack_ea > 1 ? "BOX" : "EA", actual_ea = unit_type === "BOX" ? qty * pack_ea : qty;
        const r = calcLineAmounts(qty, unit, l.total_incl_vat);
        return { food_type, name, weight_g, qty, unit, unit_type, pack_ea, actual_ea, supply_amount: r.supply, vat_amount: r.vat, total_amount: r.total, is_sample: !!l.is_sample, stock_out_lots: l.stock_out_lots };
      }).filter((l) => l.name && l.qty > 0 && (l.is_sample || (l.total_amount ?? 0) !== 0));
      if (cleanLines.length === 0) return setMsg("제품명/수량과 (단가 또는 총액)을 올바르게 입력하세요.");
      const { error } = await supabase.from("orders").update({ ship_date: eShipDate, ship_method: eShipMethod, memo: JSON.stringify({ title: eOrderTitle.trim() || null, orderer_name: eOrdererName.trim() || null }), supply_amount: editOrderTotals.supply, vat_amount: editOrderTotals.vat, total_amount: editOrderTotals.total }).eq("id", editRow.rawId);
      if (error) return setMsg(error.message);
      await supabase.from("order_lines").delete().eq("order_id", editRow.rawId);
      const { error: iErr } = await supabase.from("order_lines").insert(cleanLines.map((l, idx) => ({ order_id: editRow.rawId, line_no: idx + 1, food_type: l.food_type || null, name: l.name, weight_g: l.weight_g || null, qty: l.qty, unit: l.unit, unit_type: l.unit_type, pack_ea: l.pack_ea, actual_ea: l.actual_ea, supply_amount: l.supply_amount, vat_amount: l.vat_amount, total_amount: l.total_amount, is_sample: l.is_sample || null })));
      if (iErr) return setMsg(iErr.message);
      await supabase.from("order_shipments").delete().eq("order_id", editRow.rawId);
      const { error: siErr } = await supabase.from("order_shipments").insert(buildShipPayloads(editRow.rawId, eShip1, eShip2, eTwoShip));
      if (siErr) return setMsg(siErr.message);
      if (eWoId) {
        let uploadedUrls: string[] = [...eWoExistingImages];
        if (eWoImageFiles.length > 0) {
          for (const file of eWoImageFiles) {
            const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase();
            const path = `${eWoId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
            const { error: upErr } = await supabase.storage.from("work-order-images").upload(path, file, { upsert: true });
            if (!upErr) uploadedUrls.push(path);
          }
        }
        await supabase.from("work_orders").update({ sub_name: eWoSubName.trim() || null, product_name: eWoProductName.trim() || null, food_type: eWoFoodType.trim() || null, logo_spec: eWoLogoSpec.trim() || null, thickness: eWoThickness || null, delivery_method: eWoDeliveryMethod || null, packaging_type: eWoPackagingType || null, package_unit: eWoPackageUnit === "기타" ? (eWoPackageUnitCustom.trim() ? eWoPackageUnitCustom.trim() + "ea" : null) : eWoPackageUnit || null, mold_per_sheet: (toInt(eWoMoldCols) * toInt(eWoMoldRows)) > 0 ? toInt(eWoMoldCols) * toInt(eWoMoldRows) : null, mold_cols: toInt(eWoMoldCols) > 0 ? toInt(eWoMoldCols) : null, mold_rows: toInt(eWoMoldRows) > 0 ? toInt(eWoMoldRows) : null, mold_count: toInt(eWoMoldCount) > 0 ? toInt(eWoMoldCount) : null, note: eWoNote.trim() || null, reference_note: eOrderTitle.trim() || null, images: uploadedUrls, updated_at: new Date().toISOString()}).eq("id", eWoId);
        await supabase.from("work_order_items").update({ delivery_date: eShipDate }).eq("work_order_id", eWoId);

      
        // 품목별 이미지 저장
        for (let idx = 0; idx < eWoItemIds.length; idx++) {
          const itemId = eWoItemIds[idx];
          if (!itemId) continue;
          const existingPaths: string[] = (eItemExistingImageUrls[idx] ?? []).map((url: string) => {
            if (url.startsWith("http")) { const m = url.match(/work-order-images\/(.+?)(\?|$)/); return m ? m[1] : null; }
            return url;
          }).filter(Boolean) as string[];
          const newFiles = eItemImageFiles[idx] ?? [];
          const newPaths: string[] = [];
          for (const file of newFiles) {
            const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase();
            const path = `orders/${eWoId}/item_${idx}_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
            const { error: upErr } = await supabase.storage.from("work-order-images").upload(path, file, { upsert: true });
            if (!upErr) newPaths.push(path);
          }
          const finalPaths = [...existingPaths, ...newPaths];
          await supabase.from("work_order_items").update({ images: finalPaths }).eq("id", itemId);
        }
      }
      {
        const { data: { user } } = await supabase.auth.getUser();
        const stockUserId = user?.id ?? null;
        let stockWorkOrderNo: string | null = null;
        if (eWoId) {
          const { data: woRow } = await supabase.from("work_orders").select("work_order_no").eq("id", eWoId).maybeSingle();
          stockWorkOrderNo = (woRow as any)?.work_order_no ?? null;
        }
        const stockErrors = await applyStockOutLots(supabase, cleanLines, editRow.rawId, stockWorkOrderNo, eShipDate, stockUserId);

        // 출고일이 변경된 경우, 이 작업지시서의 CCP-1P 생산완료/거래내역 OUT 기록(happened_at)을 새 출고일로 동기화
        if (stockWorkOrderNo && eShipDate !== editRow.date) {
          const { error: outSyncErr } = await supabase.from("movements")
            .update({ happened_at: `${eShipDate}T00:00:00+09:00` })
            .ilike("note", `거래내역 OUT - ${stockWorkOrderNo} - %`);
          if (outSyncErr) stockErrors.push("출고일 동기화 실패: " + outSyncErr.message);
        }

        // ── Step4: 재고부족(마켓플레이스 거래처) 라인 → 임시 lot + 임시 작업지시서 자동생성 ──
        if (selectedPartner && SUBADMIN_PINNED_TOP_NAMES.includes(selectedPartner.name)) {
          for (const cl of cleanLines) {
            if (isSpecialItem(cl.name)) continue;
            if ((cl.stock_out_lots ?? []).length > 0) continue;
            const variantId = masterByName.get(cl.name)?.variant_id;
            if (!variantId) continue;
            const shortageResult = await createTempLotForShortage(supabase, variantId, cl.qty, cl.name, eShipDate, selectedPartner.name, stockUserId, editRow.rawId);
            if (shortageResult.error) stockErrors.push(shortageResult.error);
          }
        }

        if (stockErrors.length > 0) stockWarningMsg = "⚠️ 수정은 저장됐으나 재고 차감 오류: " + stockErrors.join(" / ");
      }
    } else {
      const amount = Number((eAmountStr || "0").replaceAll(",", ""));
      if (!Number.isFinite(amount) || amount <= 0) return setMsg("금액(원)을 올바르게 입력하세요.");
      if (eCategory === "급여" && !eSalaryEmployeeId) return setMsg("급여는 직원 선택이 필요합니다.");
      const counterparty_name = eCounterpartyName.trim() || null;
      if (!counterparty_name) return setMsg("업체명(매입처/상대방)은 비울 수 없습니다.");
      const { error } = await supabase.from("ledger_entries").update({ entry_date: eEntryDate, direction: categoryToDirection(eCategory), amount, supply_amount: editLedgerSplit.supply, vat_amount: editLedgerSplit.vat, total_amount: editLedgerSplit.total, category: eCategory, method: ePayMethod, memo: eLedgerMemo.trim() || null, counterparty_name, business_no: eBusinessNo.trim() || null, partner_id: editRow.ledger_partner_id ?? null }).eq("id", editRow.rawId);
      if (error) return setMsg(error.message);
      if (eCategory === "급여") {
        const payMonth = String(eEntryDate ?? "").slice(0, 7);
        const { error: hpUpErr } = await supabase.from("hr_payments").upsert({ ledger_entry_id: editRow.rawId, employee_id: eSalaryEmployeeId, pay_month: payMonth, kind: "SALARY", amount, note: null }, { onConflict: "ledger_entry_id" });
        if (hpUpErr) return setMsg(hpUpErr.message);
      } else {
        await supabase.from("hr_payments").delete().eq("ledger_entry_id", editRow.rawId);
      }
    }
    setEditOpen(false); setEditRow(null); await loadTrades();
    if (stockWarningMsg) setMsg(stockWarningMsg);
  }

  function handleDeleteClick(r: UnifiedRow) {
    if (!window.confirm("정말 삭제하시겠습니까?\n삭제하면 복구할 수 없습니다.")) return;
    setDeletePinTargetRow(r);
    if (isPinValid() && pinSession) {
      deleteTradeRow(r, pinSession.employeeName);
    } else {
      setShowDeletePinModal(true);
    }
  }

  async function deleteTradeRow(r: UnifiedRow, _pinName: string) {
    if (r.kind === "ORDER") {
      const { data: linkedWos } = await supabase.from("work_orders").select("id").eq("linked_order_id", r.rawId);
      await supabase.from("orders").update({ work_order_item_id: null }).eq("id", r.rawId);
      if (linkedWos && linkedWos.length > 0) {
        const woIds = linkedWos.map((w) => w.id);
        for (const wo of linkedWos) await supabase.from("work_order_items").delete().eq("work_order_id", wo.id);
        // ── 임시 lot(재고부족 자동생성) + movements 정리 ──
        const { data: tempLots } = await supabase.from("lots").select("id").in("work_order_id", woIds).eq("is_temp", true);
        if (tempLots && tempLots.length > 0) {
          const tempLotIds = tempLots.map((l) => l.id);
          await supabase.from("movements").delete().in("lot_id", tempLotIds);
          await supabase.from("lots").delete().in("id", tempLotIds);
        }
        await supabase.from("work_orders").delete().in("id", woIds);
      }
      await supabase.from("movements").delete().ilike("note", `재고부족 임시출고 - ${r.rawId} - %`);
      await supabase.from("order_shipments").delete().eq("order_id", r.rawId);
      await supabase.from("order_lines").delete().eq("order_id", r.rawId);
      const { error } = await supabase.from("orders").delete().eq("id", r.rawId);
      if (error) return setMsg(error.message);
    } else {
      const { error } = await supabase.from("ledger_entries").delete().eq("id", r.rawId);
      if (error) return setMsg(error.message);
    }
    await loadTrades();
  }
  async function loadTrash() {
    setTrashLoading(true);
    try {
      const { data: od } = await supabase
        .from("deleted_orders")
        .select("deleted_at,original_id,customer_name,ship_date,ship_method,memo,total_amount")
        .order("deleted_at", { ascending: false }).limit(100);
      setDeletedOrders((od ?? []) as DeletedOrderRow[]);
      const { data: ld } = await supabase
        .from("deleted_ledger_entries")
        .select("deleted_at,original_id,entry_date,direction,amount,category,method,counterparty_name,memo")
        .order("deleted_at", { ascending: false }).limit(100);
      setDeletedLedgers((ld ?? []) as DeletedLedgerRow[]);
    } finally { setTrashLoading(false); }
  }

  async function restoreOrder(originalId: string) {
    if (!window.confirm("이 주문/출고를 복원하시겠습니까?")) return;
    setRestoring(originalId);
    try {
      const { data: dOrder } = await supabase.from("deleted_orders").select("*").eq("original_id", originalId).single();
      if (!dOrder) return setMsg("복원할 데이터를 찾을 수 없습니다.");
      const { data: dLines } = await supabase.from("deleted_order_lines").select("*").eq("order_id", originalId);
      const { data: dShipments } = await supabase.from("deleted_order_shipments").select("*").eq("order_id", originalId);
      const { error: oErr } = await supabase.from("orders").insert({
        id: dOrder.original_id, customer_id: dOrder.customer_id, customer_name: dOrder.customer_name,
        ship_date: dOrder.ship_date, ship_method: dOrder.ship_method, status: dOrder.status,
        memo: dOrder.memo, supply_amount: dOrder.supply_amount, vat_amount: dOrder.vat_amount,
        total_amount: dOrder.total_amount, tax_invoice_issued: dOrder.tax_invoice_issued,
      });
      if (oErr) return setMsg("복원 실패: " + oErr.message);
      if (dLines && dLines.length > 0) {
        await supabase.from("order_lines").insert(
          dLines.map((l: any) => ({
            id: l.original_id, order_id: l.order_id, line_no: l.line_no,
            food_type: l.food_type, name: l.name, weight_g: l.weight_g,
            qty: l.qty, unit: l.unit, unit_type: l.unit_type, pack_ea: l.pack_ea,
            actual_ea: l.actual_ea, supply_amount: l.supply_amount,
            vat_amount: l.vat_amount, total_amount: l.total_amount, is_sample: l.is_sample,
          }))
        );
      }
      if (dShipments && dShipments.length > 0) {
        await supabase.from("order_shipments").insert(
          dShipments.map((s: any) => ({
            id: s.original_id, order_id: s.order_id, seq: s.seq,
            ship_to_name: s.ship_to_name, ship_to_address1: s.ship_to_address1,
            ship_to_address2: s.ship_to_address2, ship_to_mobile: s.ship_to_mobile,
            ship_to_phone: s.ship_to_phone, ship_zipcode: s.ship_zipcode,
            delivery_message: s.delivery_message,
          }))
        );
      }
      await supabase.from("deleted_order_lines").delete().eq("order_id", originalId);
      await supabase.from("deleted_order_shipments").delete().eq("order_id", originalId);
      await supabase.from("deleted_orders").delete().eq("original_id", originalId);
      setMsg("✅ 주문/출고 복원 완료!");
      await loadTrash(); await loadTrades();
    } finally { setRestoring(null); }
  }

  async function restoreLedger(originalId: string) {
    if (!window.confirm("이 금전출납을 복원하시겠습니까?")) return;
    setRestoring(originalId);
    try {
      const { data: dLedger } = await supabase.from("deleted_ledger_entries").select("*").eq("original_id", originalId).single();
      if (!dLedger) return setMsg("복원할 데이터를 찾을 수 없습니다.");
      const { error: lErr } = await supabase.from("ledger_entries").insert({
        id: dLedger.original_id, entry_date: dLedger.entry_date, entry_ts: dLedger.entry_ts,
        direction: dLedger.direction, amount: dLedger.amount,
        supply_amount: dLedger.supply_amount, vat_amount: dLedger.vat_amount, total_amount: dLedger.total_amount,
        category: dLedger.category, method: dLedger.method, counterparty_name: dLedger.counterparty_name,
        business_no: dLedger.business_no, memo: dLedger.memo, status: dLedger.status,
        partner_id: dLedger.partner_id, tax_invoice_received: dLedger.tax_invoice_received,
        payment_completed: dLedger.payment_completed,
      });
      if (lErr) return setMsg("복원 실패: " + lErr.message);
      await supabase.from("deleted_ledger_entries").delete().eq("original_id", originalId);
      setMsg("✅ 금전출납 복원 완료!");
      await loadTrash(); await loadTrades();
    } finally { setRestoring(null); }
  }

  async function toggleTaxInvoiceReceived(r: UnifiedRow) {
    if (r.kind !== "LEDGER") return;
    const next = !(r.tax_invoice_received ?? false);
    const { error } = await supabase.from("ledger_entries").update({ tax_invoice_received: next }).eq("id", r.rawId);
    if (error) return setMsg(error.message);
    await loadTrades();
    if (tradeSearchDebounced.trim()) setSearchRefreshTick((v) => v + 1);
  }

  async function togglePaymentCompleted(r: UnifiedRow) {
    if (r.kind !== "LEDGER") return;
    const next = !(r.payment_completed ?? false);
    const { error } = await supabase.from("ledger_entries").update({ payment_completed: next }).eq("id", r.rawId);
    if (error) return setMsg(error.message);
    await loadTrades();
    if (tradeSearchDebounced.trim()) setSearchRefreshTick((v) => v + 1);
  }

  async function toggleTaxInvoice(r: UnifiedRow) {
    if (r.kind !== "ORDER") return;
    const next = !(r.tax_invoice_issued ?? false);
    const { error } = await supabase
      .from("orders")
      .update({ tax_invoice_issued: next })
      .eq("id", r.rawId);
    if (error) return setMsg(error.message);
    await loadTrades();
    if (tradeSearchDebounced.trim()) setSearchRefreshTick((v) => v + 1);
  }
  // Styles
  const card = "rounded-2xl border border-slate-200 bg-white shadow-sm";
  const inp = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300";
  const inpR = `${inp} text-right tabular-nums`;
  const btn = "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50 active:bg-slate-100";
  const btnOn = "rounded-xl border border-blue-600/20 bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 active:bg-blue-800";
  const pill = "inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700";
  const qtyBadge = "shrink-0 inline-flex items-center justify-center rounded-lg border border-slate-300 bg-slate-900 px-2 py-1 text-[11px] font-extrabold text-white";
  const miniBtn = "rounded-lg border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] hover:bg-slate-50 active:bg-slate-100";
  const lineGridCols = "grid-cols-[180px_minmax(180px,1fr)_80px_110px_80px_120px_120px_130px_90px]";
  const targetLabel = selectedPartner ? selectedPartner.name : "전체";

  const Datalists = () => (
    <>
      <datalist id="food-types-list">
        {(() => {
          const base = (foodTypes ?? []).map((ft) => String(ft.name ?? "").trim()).filter(Boolean);
          const baseSet = new Set(base);
          const extra = [...(presetProducts ?? []).map((p) => String(p.food_type ?? "").trim()).filter(Boolean), ...(masterProducts ?? []).map((p) => String(p.food_type ?? "").trim()).filter(Boolean)].filter((x) => !baseSet.has(x));
          const merged = [...base, ...Array.from(new Set(extra)).sort((a, b) => a.localeCompare(b, "ko"))];
          return merged.map((name) => <option key={`ft_${name}`} value={name} />);
        })()}
      </datalist>
      <datalist id="preset-products-list">
        {presetProducts.map((p) => <option key={`p_${p.id}`} value={p.product_name} />)}
        {masterProducts.map((p) => <option key={`m_${p.product_name}`} value={p.product_name} />)}
      </datalist>
      <datalist id="master-product-list">{masterProducts.map((p) => <option key={p.product_name} value={p.product_name} />)}</datalist>
    </>
  );

  const PartnerTypeSelect = ({ value, onChange }: { value: PartnerType; onChange: (v: PartnerType) => void }) => (
    <select className={inp} value={value} onChange={(e) => onChange(e.target.value as any)}>
      <option value="CUSTOMER">매출처(CUSTOMER)</option>
      <option value="VENDOR">매입처(VENDOR)</option>
      <option value="BOTH">둘다(BOTH)</option>
    </select>
  );

  return (
    <div className="bg-slate-50 text-slate-900 min-h-screen">
      <div className="mx-auto w-full max-w-[1600px] overflow-x-hidden px-4 py-6">

        {alertOpen ? (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4" onClick={() => setAlertOpen(false)}>
            <div className="w-full max-w-[520px] rounded-2xl border border-slate-200 bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
                <div><div className="text-base font-semibold">알림</div><div className="mt-1 text-xs text-slate-500">확인 버튼을 누르면 닫힙니다.</div></div>
                <button className={btn} onClick={() => setAlertOpen(false)}>닫기</button>
              </div>
              <div className="px-5 py-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 whitespace-pre-wrap break-words">{alertText}</div>
                <div className="mt-4 flex justify-end"><button className={btnOn} onClick={() => setAlertOpen(false)}>확인</button></div>
              </div>
            </div>
          </div>
        ) : null}

        {/* 휴지통 모달 — ADMIN 전용 */}
        {trashOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
            <div className="w-full max-w-[1100px] max-h-[88vh] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl flex flex-col" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
                <div>
                  <div className="text-base font-semibold">🗑️ 삭제된 거래내역 복원 (최근 100건)</div>
                  <div className="mt-1 text-xs text-slate-500">복원 버튼을 누르면 원래 ID 그대로 되살아납니다.</div>
                </div>
                <div className="flex gap-2">
                  <button className={btn} onClick={loadTrash}>새로고침</button>
                  <button className={btn} onClick={() => setTrashOpen(false)}>닫기</button>
                </div>
              </div>
              <div className="overflow-y-auto px-5 py-4 space-y-5">
                {trashLoading ? (
                  <div className="py-8 text-center text-sm text-slate-500">불러오는 중...</div>
                ) : (
                  <>
                    <div>
                      <div className="mb-2 text-sm font-semibold text-slate-700">주문/출고 ({deletedOrders.length}건)</div>
                      {deletedOrders.length === 0 ? (
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">없음</div>
                      ) : (
                        <div className="overflow-x-auto rounded-xl border border-slate-200">
                          <table className="w-full table-fixed text-sm">
                            <colgroup>
                              <col style={{ width: "160px" }} /><col style={{ width: "160px" }} />
                              <col style={{ width: "100px" }} /><col style={{ width: "120px" }} />
                              <col style={{ width: "auto" }} /><col style={{ width: "80px" }} />
                            </colgroup>
                            <thead className="bg-slate-50 text-xs font-semibold text-slate-600">
                              <tr>
                                <th className="px-3 py-2 text-left">삭제일시(KST)</th>
                                <th className="px-3 py-2 text-left">거래처</th>
                                <th className="px-3 py-2 text-left">출고일</th>
                                <th className="px-3 py-2 text-right">금액</th>
                                <th className="px-3 py-2 text-left">적요</th>
                                <th className="px-3 py-2 text-center">복원</th>
                              </tr>
                            </thead>
                            <tbody>
                              {deletedOrders.map((d) => {
                                const memoTitle = (() => { try { const p = JSON.parse(d.memo ?? ""); return p?.title ?? ""; } catch { return d.memo ?? ""; } })();
                                return (
                                  <tr key={d.original_id} className="border-t border-slate-200">
                                    <td className="px-3 py-2 tabular-nums text-xs text-slate-500">{fmtKST(d.deleted_at)}</td>
                                    <td className="px-3 py-2 font-semibold">{d.customer_name}</td>
                                    <td className="px-3 py-2 tabular-nums">{d.ship_date}</td>
                                    <td className="px-3 py-2 tabular-nums text-right text-red-600 font-semibold">{fmt(d.total_amount ?? 0)}</td>
                                    <td className="px-3 py-2 text-slate-600 truncate">{memoTitle}</td>
                                    <td className="px-3 py-2 text-center">
                                      <button
                                        className="rounded-lg border border-blue-300 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-40"
                                        disabled={restoring === d.original_id}
                                        onClick={() => restoreOrder(d.original_id)}
                                      >{restoring === d.original_id ? "복원중..." : "복원"}</button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="mb-2 text-sm font-semibold text-slate-700">금전출납 ({deletedLedgers.length}건)</div>
                      {deletedLedgers.length === 0 ? (
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">없음</div>
                      ) : (
                        <div className="overflow-x-auto rounded-xl border border-slate-200">
                          <table className="w-full table-fixed text-sm">
                            <colgroup>
                              <col style={{ width: "160px" }} /><col style={{ width: "160px" }} />
                              <col style={{ width: "100px" }} /><col style={{ width: "70px" }} />
                              <col style={{ width: "120px" }} /><col style={{ width: "auto" }} />
                              <col style={{ width: "80px" }} />
                            </colgroup>
                            <thead className="bg-slate-50 text-xs font-semibold text-slate-600">
                              <tr>
                                <th className="px-3 py-2 text-left">삭제일시(KST)</th>
                                <th className="px-3 py-2 text-left">거래처</th>
                                <th className="px-3 py-2 text-left">일자</th>
                                <th className="px-3 py-2 text-left">구분</th>
                                <th className="px-3 py-2 text-right">금액</th>
                                <th className="px-3 py-2 text-left">메모</th>
                                <th className="px-3 py-2 text-center">복원</th>
                              </tr>
                            </thead>
                            <tbody>
                              {deletedLedgers.map((d) => (
                                <tr key={d.original_id} className="border-t border-slate-200">
                                  <td className="px-3 py-2 tabular-nums text-xs text-slate-500">{fmtKST(d.deleted_at)}</td>
                                  <td className="px-3 py-2 font-semibold">{d.counterparty_name}</td>
                                  <td className="px-3 py-2 tabular-nums">{d.entry_date}</td>
                                  <td className="px-3 py-2">
                                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${d.direction === "IN" ? "bg-blue-50 text-blue-700" : "bg-red-50 text-red-700"}`}>
                                      {d.direction === "IN" ? "입금" : "출금"}
                                    </span>
                                  </td>
                                  <td className={`px-3 py-2 tabular-nums text-right font-semibold ${d.direction === "IN" ? "text-blue-700" : "text-red-600"}`}>{fmt(d.amount)}</td>
                                  <td className="px-3 py-2 text-slate-600 truncate">{d.memo ?? ""}</td>
                                  <td className="px-3 py-2 text-center">
                                    <button
                                      className="rounded-lg border border-blue-300 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-40"
                                      disabled={restoring === d.original_id}
                                      onClick={() => restoreLedger(d.original_id)}
                                    >{restoring === d.original_id ? "복원중..." : "복원"}</button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        ) : null}

        {/* Partner edit modal */}
        {partnerEditOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
            <div className="w-full max-w-[860px] rounded-2xl border border-slate-200 bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
                <div><div className="text-base font-semibold">거래처 수정 · {selectedPartner?.name ?? ""}</div><div className="mt-1 text-xs text-slate-500">저장하면 즉시 DB에 반영됩니다.</div></div>
                <div className="flex gap-2">
                  <button className={btn} onClick={() => { setPartnerEditOpen(false); setShipHistOpen(false); }}>취소</button>
                  <button className={btnOn} onClick={savePartnerEdit}>저장</button>
                </div>
              </div>
              <div className="px-5 py-4">
                <div className="mb-2 text-sm font-semibold">업체 기본정보</div>
                <div className="space-y-2">
                  <input className={inp} placeholder="업체명(필수)" value={ep_name} onChange={(e) => setEP_name(e.target.value)} />
                  <input className={inp} placeholder="사업자등록번호" value={ep_businessNo} onChange={(e) => setEP_businessNo(e.target.value)} />
                  <PartnerTypeSelect value={ep_partnerType} onChange={setEP_partnerType} />
                  <input className={inp} placeholder="대표자" value={ep_ceo} onChange={(e) => setEP_ceo(e.target.value)} />
                  <input className={inp} placeholder="연락처" value={ep_phone} onChange={(e) => setEP_phone(e.target.value)} />
                  <input className={inp} placeholder="주소" value={ep_address1} onChange={(e) => setEP_address1(e.target.value)} />
                  <div className="grid grid-cols-2 gap-2">
                    <input className={inp} placeholder="업태" value={ep_bizType} onChange={(e) => setEP_bizType(e.target.value)} />
                    <input className={inp} placeholder="종목" value={ep_bizItem} onChange={(e) => setEP_bizItem(e.target.value)} />
                  </div>
                </div>
                <div className="mt-5 mb-2 flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold">배송정보</div>
                  <button className={btn} onClick={async () => { const next = !shipHistOpen; setShipHistOpen(next); if (next && selectedPartner) await loadShippingHistory5(selectedPartner.id); }}>배송정보 이력(최근 5건)</button>
                </div>
                <div className="space-y-2">
                  <ImeSafeInput className={inp} placeholder="수화주명" value={shipEdit.name} onValueChange={(v) => setShipEdit({ ...shipEdit, name: v })} />
                  <ImeSafeInput className={inp} placeholder="주소1" value={shipEdit.addr} onValueChange={(v) => setShipEdit({ ...shipEdit, addr: v })} />
                  <div className="grid grid-cols-2 gap-2">
                    <ImeSafeInput className={inp} placeholder="휴대폰" value={shipEdit.mobile} onValueChange={(v) => setShipEdit({ ...shipEdit, mobile: v })} />
                    <ImeSafeInput className={inp} placeholder="전화" value={shipEdit.phone} onValueChange={(v) => setShipEdit({ ...shipEdit, phone: v })} />
                  </div>
                </div>
                {shipHistOpen ? (
                  <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="text-sm font-semibold">배송정보 이력(최근 5건)</div>
                      <button className={btn} onClick={() => selectedPartner && loadShippingHistory5(selectedPartner.id)}>새로고침</button>
                    </div>
                    {shipHistLoading ? <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-600">불러오는 중...</div>
                      : shipHist.length === 0 ? <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-500">이력이 없습니다.</div>
                      : (
                        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                          <table className="w-full table-fixed text-sm">
                            <colgroup><col style={{ width: "160px" }} /><col style={{ width: "140px" }} /><col style={{ width: "auto" }} /><col style={{ width: "140px" }} /><col style={{ width: "140px" }} /></colgroup>
                            <thead className="sticky top-0 z-30 bg-slate-50 text-xs font-semibold text-slate-600">
                              <tr>{["변경시각", "수화주명", "주소1", "휴대폰", "전화"].map((h) => <th key={h} className="px-3 py-2 text-left">{h}</th>)}</tr>
                            </thead>
                            <tbody>
                              {shipHist.map((h) => (
                                <tr key={h.id} className="border-t border-slate-200">
                                  <td className="px-3 py-2 tabular-nums">{fmtKST(h.created_at)}</td>
                                  <td className="px-3 py-2">{h.ship_to_name ?? ""}</td>
                                  <td className="px-3 py-2">{h.ship_to_address1 ?? ""}</td>
                                  <td className="px-3 py-2">{h.ship_to_mobile ?? ""}</td>
                                  <td className="px-3 py-2">{h.ship_to_phone ?? ""}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {/* Memo modal */}
        {memoOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setMemoOpen(false)}>
            <div className="w-full max-w-[860px] rounded-2xl border border-slate-200 bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
                <div><div className="text-base font-semibold">{memoTitle}</div><div className="mt-1 text-xs text-slate-500">바깥 클릭으로 닫기</div></div>
                <button className={btn} onClick={() => setMemoOpen(false)}>닫기</button>
              </div>
              <div className="px-5 py-4"><pre className="whitespace-pre-wrap break-words rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-800">{memoBody}</pre></div>
            </div>
          </div>
        ) : null}

        {/* Edit modal */}
        {editOpen && editRow ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
            <div className="w-full max-w-[1400px] max-h-[92vh] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl flex flex-col" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
                <div>
                  <div className="text-base font-semibold">거래내역 수정 · {editRow.kind === "ORDER" ? "주문/출고" : "금전출납"} · {editRow.partnerName}</div>
                  <div className="mt-1 text-xs text-slate-500">저장하면 즉시 DB에 반영됩니다.</div>
                </div>
                <div className="flex gap-2"><button className={btn} onClick={() => setEditOpen(false)}>취소</button><button className={btnOn} onClick={saveEdit}>저장</button></div>
              </div>
              <div className="px-5 py-4 overflow-y-auto">
                {editRow.kind === "ORDER" ? (
                  <>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                      <div><div className="mb-1 text-xs text-slate-600">출고일(주문일)</div><input type="date" className={inp} value={eShipDate} onChange={(e) => setEShipDate(e.target.value)} /></div>
                      <div><div className="mb-1 text-xs text-slate-600">주문자</div><input className={inp} value={eOrdererName} onChange={(e) => setEOrdererName(e.target.value)} /></div>
                      <div><div className="mb-1 text-xs text-slate-600">출고방법</div>
                        <select className={inp} value={eShipMethod} onChange={(e) => setEShipMethod(e.target.value)}>
                          {["택배", "퀵-신용", "퀵-착불", "방문", "기타"].map((v) => <option key={v} value={v}>{v}</option>)}
                        </select>
                      </div>
                      <div><div className="mb-1 text-xs text-slate-600">참고사항</div><input className={inp} value={eOrderTitle} onChange={(e) => setEOrderTitle(e.target.value)} /></div>
                    </div>
                    <ShipBlock s1={eShip1} setS1={setEShip1} s2={eShip2} setS2={setEShip2} two={eTwoShip} setTwo={setETwoShip} prefix={`edit_${editRow.rawId}`} inpClass={inp} />
                    <div className="mt-4 flex items-center justify-between">
                      <div className="text-sm font-semibold">제품</div>
                      <div className="flex items-center gap-2">
                        <button className={btn} onClick={() => insertEditShippingFee(3300)}>+ 택배비 3,300</button>
                        <button className={btn} onClick={() => insertEditShippingFee(4000)}>+ 택배비 4,000</button>
                        <button className={btn} onClick={addEditLine}>+ 제품 추가</button>
                      </div>
                    </div>
                    <LineHeader gridCols={lineGridCols} />
                    <div className="mt-2 space-y-1">
                    {eLines.map((l, i) => (
                        <div key={i}>
                          <LineRow l={l} i={i} onUpdate={updateEditLine} onRemove={removeEditLine} presetByName={presetByName} masterByName={masterByName} inputCls={inp} inputRightCls={inpR} btnCls={btn} gridCols={lineGridCols} qtyBadgeCls={qtyBadge} supabaseClient={supabase} />
                          {eWoId && l.name && !["택배비"].includes(l.name) ? (
                            <div className="ml-1 mb-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                              <div className="mb-1 text-xs text-slate-500">🖼 {l.name} 인쇄 디자인 이미지</div>
                              <div className="flex flex-wrap items-center gap-2">
                                {/* 기존 이미지 */}
                                {(eItemExistingImageUrls[i] ?? []).map((url, j) => (
                                  <div key={`exist-${j}`} className="group relative">
                                    <img src={url} alt={`기존${j+1}`} className="h-14 w-14 rounded-lg border border-slate-200 object-cover opacity-80" />
                                    <button className="absolute -right-1 -top-1 hidden h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] text-white group-hover:flex"
                                      onClick={() => setEItemExistingImageUrls((prev) => ({ ...prev, [i]: (prev[i] ?? []).filter((_, k) => k !== j) }))}>✕</button>
                                  </div>
                                ))}
                                {/* 새로 선택한 이미지 */}
                                {(eItemImagePreviewUrls[i] ?? []).map((url, j) => (
                                  <div key={`new-${j}`} className="group relative">
                                    <img src={url} alt={`새이미지${j+1}`} className="h-14 w-14 rounded-lg border border-blue-200 object-cover" />
                                    <button className="absolute -right-1 -top-1 hidden h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] text-white group-hover:flex"
                                      onClick={() => {
                                        setEItemImageFiles((prev) => ({ ...prev, [i]: (prev[i] ?? []).filter((_, k) => k !== j) }));
                                        setEItemImagePreviewUrls((prev) => ({ ...prev, [i]: (prev[i] ?? []).filter((_, k) => k !== j) }));
                                      }}>✕</button>
                                  </div>
                                ))}
                                <label className="flex h-14 w-14 cursor-pointer items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white text-slate-400 hover:border-blue-400 hover:text-blue-500">
                                  <span className="text-xl">+</span>
                                  <input type="file" accept="image/*" multiple className="hidden"
                                    onChange={(e) => {
                                      const files = Array.from(e.target.files ?? []);
                                      setEItemImageFiles((prev) => ({ ...prev, [i]: [...(prev[i] ?? []), ...files] }));
                                      setEItemImagePreviewUrls((prev) => ({ ...prev, [i]: [...(prev[i] ?? []), ...files.map((f) => URL.createObjectURL(f))] }));
                                      e.target.value = "";
                                    }} />
                                </label>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 flex items-center justify-end gap-4 text-sm">
                      <div>공급가 {fmt(editOrderTotals.supply)}</div><div>부가세 {fmt(editOrderTotals.vat)}</div><div className="font-semibold">총액 {fmt(editOrderTotals.total)}</div>
                    </div>
                    {eWoId ? (
                      <div className="mt-4 rounded-2xl border border-orange-100 bg-orange-50 p-3">
                        <div className="mb-3 flex items-center gap-2">
                          <div className="text-sm font-semibold text-orange-800">📋 작업지시서 수정</div>
                          <span className="text-xs text-orange-600">주문과 연결된 작업지시서도 함께 저장됩니다</span>
                        </div>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                          <div><div className="mb-1 text-xs text-slate-600">제품명</div><input className={inp} value={eWoProductName} onChange={(e) => setEWoProductName(e.target.value)} /></div>
                          <div><div className="mb-1 text-xs text-slate-600">서브네임</div><input className={inp} lang="ko" placeholder="예: COS, 크로버, 삼광초" value={eWoSubName} onChange={(e) => setEWoSubName(e.target.value)} /></div>
                          <div><div className="mb-1 text-xs text-slate-600">식품유형</div><input className={inp} list="food-types-list" placeholder="예: 다크화이트" value={eWoFoodType} onChange={(e) => setEWoFoodType(e.target.value)} /></div>
                          <div><div className="mb-1 text-xs text-slate-600">규격</div><input className={inp} placeholder="예: 40x40mm" value={eWoLogoSpec} onChange={(e) => setEWoLogoSpec(e.target.value)} /></div>
                          <div><div className="mb-1 text-xs text-slate-600">두께</div>
                            <select className={inp} value={eWoThickness} onChange={(e) => setEWoThickness(e.target.value)}>
                              {["2mm", "3mm", "5mm", "기타"].map((v) => <option key={v} value={v}>{v}</option>)}
                            </select>
                          </div>
                          <div><div className="mb-1 text-xs text-slate-600">포장방법</div>
                            <select className={inp} value={eWoPackagingType} onChange={(e) => {
                              setEWoPackagingType(e.target.value);
                              if (e.target.value === "벌크") setEWoPackageUnit("기타");
                            }}>
                              {["", "트레이-정사각20구", "트레이-직사각20구", "트레이-35구", "벌크"].map((v) => <option key={v} value={v}>{v === "" ? "선택안함" : v}</option>)}
                            </select>
                          </div>
                          <div>
                            <div className="mb-1 text-xs text-slate-600">포장단위</div>
                            <select className={inp} value={eWoPackageUnit} onChange={(e) => setEWoPackageUnit(e.target.value)}>
                              {["", "100ea", "200ea", "기타"].map((v) => <option key={v} value={v}>{v === "" ? "선택안함" : v}</option>)}
                            </select>
                            {eWoPackageUnit === "기타" && (
                              <div className="flex items-center gap-1 mt-1">
                                <input className={inpR} inputMode="numeric" placeholder="수량 입력" value={eWoPackageUnitCustom} onChange={(e) => setEWoPackageUnitCustom(e.target.value.replace(/[^\d]/g, ""))} />
                                <span className="shrink-0 text-sm text-slate-500">ea</span>
                              </div>
                            )}
                          </div>
                          <div><div className="mb-1 text-xs text-slate-600">납품방법</div>
                            <select className={inp} value={eWoDeliveryMethod} onChange={(e) => setEWoDeliveryMethod(e.target.value)}>
                              {["택배", "퀵-신용", "퀵-착불", "방문", "기타"].map((v) => <option key={v} value={v}>{v}</option>)}
                            </select>
                          </div>
                          <div>
                            <div className="mb-1 text-xs text-slate-600">
                              성형틀 열수 (가로 × 세로)
                              {eWoMoldCols && eWoMoldRows && toInt(eWoMoldCols) > 0 && toInt(eWoMoldRows) > 0 && (
                                <span className="ml-2 font-semibold text-blue-600">= {toInt(eWoMoldCols) * toInt(eWoMoldRows)}개/장</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <input className={inpR} inputMode="numeric" placeholder="가로" value={eWoMoldCols} onChange={(e) => setEWoMoldCols(e.target.value.replace(/[^\d]/g, ""))} />
                              <span className="shrink-0 font-bold text-slate-400">×</span>
                              <input className={inpR} inputMode="numeric" placeholder="세로" value={eWoMoldRows} onChange={(e) => setEWoMoldRows(e.target.value.replace(/[^\d]/g, ""))} />
                            </div>
                          </div>
                          <div>
                            <div className="mb-1 text-xs text-slate-600">성형틀 장수 (ea)</div>
                            <input className={inpR} inputMode="numeric" placeholder="예: 10"
                              value={eWoMoldCount}
                              onChange={(e) => setEWoMoldCount(e.target.value.replace(/[^\d]/g, ""))} />
                          </div>
                          <div><div className="mb-1 text-xs text-slate-600">비고</div><input className={inp} value={eWoNote} onChange={(e) => setEWoNote(e.target.value)} /></div>
                          <div className="md:col-span-3">
                            <div className="mb-1 text-xs text-slate-600">인쇄 디자인 이미지 추가</div>
                            <input type="file" accept="image/*" multiple className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-1 file:text-xs file:font-semibold file:text-blue-700"
                              onChange={(e) => { const files = Array.from(e.target.files ?? []); setEWoImageFiles(files); setEWoImagePreviewUrls(files.map((f) => URL.createObjectURL(f))); }} />
                            {eWoExistingImages.length > 0 ? (
                              <div className="mt-2">
                                <div className="mb-1 text-xs text-slate-500">기존 이미지 ({eWoExistingImages.length}장)</div>
                                <div className="flex flex-wrap gap-2">
                                  {eWoExistingSignedLoading ? <div className="text-xs text-slate-400 py-2">이미지 로딩 중...</div>
                                    : eWoExistingImages.map((_, i) => (
                                      <div key={i} className="group relative">
                                        <img src={eWoExistingSignedUrls[i] ?? ""} alt="" className="h-16 w-16 rounded-lg border border-slate-200 object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                                        <button className="absolute -right-1 -top-1 hidden h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] text-white group-hover:flex"
                                          onClick={() => { setEWoExistingImages((prev) => prev.filter((_, j) => j !== i)); setEWoExistingSignedUrls((prev) => prev.filter((_, j) => j !== i)); }}>✕</button>
                                      </div>
                                    ))}
                                </div>
                              </div>
                            ) : null}
                            {eWoImageFiles.length > 0 ? (
                              <div className="mt-2 flex flex-wrap gap-2">
                                {eWoImageFiles.map((f, i) => (
                                  <div key={i} className="group relative">
                                    <img src={eWoImagePreviewUrls[i] ?? ""} alt={f.name} className="h-16 w-16 rounded-lg border border-blue-200 object-cover" />
                                    <button className="absolute -right-1 -top-1 hidden h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] text-white group-hover:flex"
                                      onClick={() => { setEWoImageFiles((prev) => prev.filter((_, j) => j !== i)); setEWoImagePreviewUrls((prev) => prev.filter((_, j) => j !== i)); }}>✕</button>
                                  </div>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                      <div><div className="mb-1 text-xs text-slate-600">일자</div><input type="date" className={inp} value={eEntryDate} onChange={(e) => setEEntryDate(e.target.value)} /></div>
                      <div><div className="mb-1 text-slate-600 text-xs">결제수단</div>
                        <select className={inp} value={ePayMethod} onChange={(e) => setEPayMethod(e.target.value as any)}>
                          {[["BANK", "입금"], ["CASH", "현금"], ["CARD", "카드"], ["ETC", "기타"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                      </div>
                      <div><div className="mb-1 text-xs text-slate-600">카테고리</div>
                        <div className="flex flex-wrap gap-2">
                          {CATEGORIES.map((c) => (
                            <button key={c} type="button" className={eCategory === c ? btnOn : btn}
                              onClick={() => { setECategory(c); if (c === "급여") setEVatFree(true); else setEVatFree(false); }}>{c}</button>
                          ))}
                        </div>
                      </div>
                      {eCategory === "급여" ? (
                        <div className="md:col-span-3">
                          <div className="mb-1 text-xs text-slate-600">직원 선택(급여)</div>
                          <select className={inp} value={eSalaryEmployeeId} onChange={(e) => { const empId = e.target.value; setESalaryEmployeeId(empId); const found = employees.find(x => x.id === empId); if (found?.name) setECounterpartyName(found.name); }}>
                            <option value="">직원을 선택하세요</option>
                            {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name ?? "(이름없음)"}</option>)}
                          </select>
                        </div>
                      ) : null}
                      <div>
                        <div className="mb-1 text-xs text-slate-600">금액(원)</div>
                        <input className={inpR} inputMode="numeric" value={eAmountStr}
                          onChange={(e) => setEAmountStr(e.target.value.replace(/[^\d,]/g, ""))}
                          onBlur={() => { const n = Number((eAmountStr || "0").replaceAll(",", "")); if (Number.isFinite(n) && n > 0) setEAmountStr(n.toLocaleString("ko-KR")); }} />
                        <div className="mt-2 flex items-center gap-2">
                          <label className={`flex items-center gap-2 text-sm ${eCategory === "급여" ? "text-slate-400 cursor-not-allowed" : "text-slate-700"}`}>
                            <input type="checkbox" checked={eVatFree} disabled={eCategory === "급여"} onChange={(e) => eCategory !== "급여" && setEVatFree(e.target.checked)} />
                            부가세 없음{eCategory === "급여" && <span className="text-xs text-amber-600 ml-1">← 급여는 자동 적용</span>}
                          </label>
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <div><div className="mb-1 text-xs text-slate-600">공급가</div><div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-right tabular-nums">{editLedgerSplit.total ? fmt(editLedgerSplit.supply) : ""}</div></div>
                          <div><div className="mb-1 text-xs text-slate-600">부가세</div>
                            <div className={`rounded-xl border px-3 py-2 text-sm text-right tabular-nums ${eCategory === "급여" ? "border-amber-200 bg-amber-50 text-amber-700 font-semibold" : "border-slate-200 bg-slate-50"}`}>
                              {eCategory === "급여" ? "0 (비과세)" : editLedgerSplit.total ? fmt(editLedgerSplit.vat) : ""}
                            </div>
                          </div>
                        </div>
                      </div>
                      <div><div className="mb-1 text-xs text-slate-600">업체명(매입처/상대방)</div>
  <input className={inp} lang="ko" value={eCounterpartyName} onChange={(e) => setECounterpartyName(e.target.value)} />
</div>

<div><div className="mb-1 text-xs text-slate-600">사업자등록번호</div><input className={inp} value={eBusinessNo} onChange={(e) => setEBusinessNo(e.target.value)} /></div>
<div className="md:col-span-3"><div className="mb-1 text-xs text-slate-600">메모</div><input className={inp} lang="ko" value={eLedgerMemo} onChange={(e) => setELedgerMemo(e.target.value)} /></div>
                    </div>
                  </>

                )}
              </div>
              <Datalists />
            </div>
          </div>
        ) : null}

        {/* Main layout */}
        <div className="grid w-full grid-cols-1 gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
          {/* LEFT: Partners */}
          <div className={`${card} p-4`}>
            <div className="mb-3 flex items-center justify-between">
              <div className="text-lg font-semibold">거래처</div>
              <div className="flex gap-2">
                <button className={btn} onClick={() => { setShowPartnerForm((v) => !v); setMsg(null); }}>+ 등록</button>
                <button className={btn} onClick={openPartnerEdit}>수정</button>
                <button className={btn} onClick={loadPartners}>새로고침</button>
              </div>
            </div>
            <div className="mb-3 flex gap-2">
            {(["PINNED", "RECENT", "ALL"] as PartnerView[])
  .filter((v) => !isSubAdmin || v === "PINNED")
  .map((v) => {
                const labels: Record<PartnerView, string> = { PINNED: "즐겨찾기", RECENT: "최근", ALL: "전체" };
                return <button key={v} className={partnerView === v ? btnOn : btn} onClick={() => setPartnerView(v)}>{labels[v]}</button>;
              })}
            </div>
            {showPartnerForm ? (
              <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <div className="mb-2 text-sm font-semibold">거래처 등록</div>
                <div className="space-y-2">
                  <input className={inp} placeholder="업체명(필수)" value={p_name} onChange={(e) => setP_name(e.target.value)} />
                  <input className={inp} placeholder="사업자등록번호" value={p_businessNo} onChange={(e) => setP_businessNo(e.target.value)} />
                  <PartnerTypeSelect value={p_partnerType} onChange={setP_partnerType} />
                  <input className={inp} placeholder="대표자" value={p_ceo} onChange={(e) => setP_ceo(e.target.value)} />
                  <input className={inp} placeholder="연락처" value={p_phone} onChange={(e) => setP_phone(e.target.value)} />
                  <input className={inp} placeholder="주소" value={p_address1} onChange={(e) => setP_address1(e.target.value)} />
                  <div className="grid grid-cols-2 gap-2">
                    <input className={inp} placeholder="업태" value={p_bizType} onChange={(e) => setP_bizType(e.target.value)} />
                    <input className={inp} placeholder="종목" value={p_bizItem} onChange={(e) => setP_bizItem(e.target.value)} />
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button className={`${btn} flex-1`} onClick={() => { setShowPartnerForm(false); resetPartnerForm(); }}>취소</button>
                    <button className={`${btnOn} flex-1`} onClick={createPartner}>저장</button>
                  </div>
                </div>
              </div>
            ) : null}
<div className="relative mb-3">
  <input className={inp} lang="ko" placeholder="목록 필터(이름/사업자번호)" value={partnerFilter}
              onChange={(e) => {
                const decomposed = [...e.target.value].map(ch =>
                  ch === '\u3140' ? '\u3139\u314e' : ch
                ).join('');
                setTradeSearch(""); setPartnerFilter(decomposed);
              }} />
  {partnerFilter && (
    <button
      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold leading-none"
      onClick={() => setPartnerFilter("")}
    >✕</button>
  )}
</div>
            <div className="mb-2 text-xs text-slate-600">선택된 거래처: {selectedPartner ? `${selectedPartner.name}${selectedPartner.business_no ? ` · ${selectedPartner.business_no}` : ""}` : "없음"}</div>
            <div className="max-h-[520px] space-y-2 overflow-auto pr-1">
              {partnersToShow.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">표시할 거래처가 없습니다.</div>
              ) : partnersToShow.map((p) => {
                const active = selectedPartner?.id === p.id;
                return (
                  <div key={p.id} className={`flex items-stretch gap-2 rounded-2xl border ${active ? "border-blue-200 bg-blue-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}>
                    
                    <button className="flex-1 rounded-2xl px-3 py-3 text-left" onClick={() => {
  selectPartner(p);
  setShipDate(todayYMD()); setOrdererName(""); setShipMethod("택배"); setOrderTitle("");
  setLines([{ food_type: "", name: "", weight_g: 0, qty: 0, unit: "", total_incl_vat: "" }]);
  setShip1(emptyShip()); setShip2(emptyShip()); setTwoShip(false); setToTouched(false);
  setOrderWoSubName(""); setOrderWoLogoSpec(""); setOrderWoThickness("2mm");
  setOrderWoPackagingType(""); setOrderWoMoldPerSheet(""); setOrderWoMoldCols(""); setOrderWoMoldRows(""); setOrderWoMoldCount(""); setOrderWoNote("");
  setOrderIsReorder(false); setOrderWoEnabled(!isSubAdmin); setWo_packageUnit(""); setWo_packageUnitCustom("");
  setWo_itemImageFiles({}); setWo_itemImagePreviewUrls({});
  setWo_itemExistingImageUrls({}); setWo_itemExistingImagePaths({}); setWo_itemExistingBarcodes({});
}}>
  
                      <div className="font-semibold">{p.name}</div>
                      <div className="text-xs text-slate-500">{p.business_no ?? ""}</div>
                    </button>
                    <button type="button" className="mr-2 my-2 w-10 rounded-xl border border-slate-200 bg-white text-lg hover:bg-slate-50" onClick={(e) => { e.stopPropagation(); togglePinned(p); }}>
                      {p.is_pinned ? "★" : "☆"}
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex gap-2">
            <button className={`${btn} flex-1`} onClick={() => {
  setSelectedPartner(null);
  setPartnerFilter("");
  setTradeSearch("");
  // ── 폼 초기화 ──
  setShipDate(todayYMD()); setOrdererName(""); setShipMethod("택배"); setOrderTitle("");
  setLines([{ food_type: "", name: "", weight_g: 0, qty: 0, unit: "", total_incl_vat: "" }]);
  setShip1(emptyShip()); setShip2(emptyShip()); setTwoShip(false); setToTouched(false);
  setOrderWoSubName(""); setOrderWoLogoSpec(""); setOrderWoThickness("2mm");
  setOrderWoPackagingType(""); setOrderWoMoldPerSheet(""); setOrderWoMoldCols(""); setOrderWoMoldRows(""); setOrderWoMoldCount(""); setOrderWoNote("");
  setOrderIsReorder(false); setOrderWoEnabled(!isSubAdmin); setWo_packageUnit(""); setWo_packageUnitCustom("");
  setWo_itemImageFiles({}); setWo_itemImagePreviewUrls({});
  setWo_itemExistingImageUrls({}); setWo_itemExistingImagePaths({}); setWo_itemExistingBarcodes({});
  setManualCounterpartyName(""); setManualBusinessNo("");
  setAmountStr(""); setLedgerMemo(""); setVatFree(false); setSalaryEmployeeId("");
}}>선택 해제</button>
              <button className={`${btn} flex-1`} onClick={loadTrades}>조회 갱신</button>
            </div>
          </div>

          {/* RIGHT */}
          <div className="min-w-0 space-y-6">
            <div className="flex flex-wrap gap-2">
            {(["ORDERS", "LEDGER", "UNIFIED"] as Mode[])
              .filter((m) => !isSubAdmin || m === "ORDERS")
              .map((m) => {
                const labels: Record<string, string> = { ORDERS: "주문/출고", LEDGER: "금전출납", UNIFIED: "통합" };
                return <button key={m} className={mode === m ? btnOn : btn} onClick={() => setMode(m)}>{labels[m]}</button>;
              })}
            </div>

            {/* Order input */}
            {mode !== "LEDGER" ? (
              <div className={`${card} p-4`}>
                <div className="mb-3 flex items-center gap-3">
                  <div className="text-lg font-semibold">주문/출고 입력</div>
                  <span className={pill}>조회대상: {targetLabel}</span>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                  <div><div className="mb-1 text-xs text-slate-600">출고일(주문일)</div><input type="date" className={inp} value={shipDate} onChange={(e) => setShipDate(e.target.value)} /></div>
                  <div><div className="mb-1 text-xs text-slate-600">주문자</div><input className={inp} lang="ko" value={ordererName} onChange={(e) => setOrdererName(e.target.value)} /></div>   
                     <div><div className="mb-1 text-xs text-slate-600">출고방법</div>
                    <select className={inp} value={shipMethod} onChange={(e) => setShipMethod(e.target.value)}>
                      {["택배", "퀵-신용", "퀵-착불", "방문", "기타"].map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>
                  <div><div className="mb-1 text-xs text-slate-600">참고사항</div><input className={inp} lang="ko" value={orderTitle} onChange={(e) => setOrderTitle(e.target.value)} /></div>
                </div>
                <ShipBlock s1={ship1} setS1={setShip1} s2={ship2} setS2={setShip2} two={twoShip} setTwo={setTwoShip} prefix="create" inpClass={inp} />
                <div className="mt-4 flex items-center justify-between">
                  <div className="text-sm font-semibold">제품명(식품유형 자동완성 포함)</div>
                  <div className="flex items-center gap-2">
                    <button className={btn} onClick={() => insertShippingFee(3300)}>+ 택배비 3,300</button>
                    <button className={btn} onClick={() => insertShippingFee(4000)}>+ 택배비 4,000</button>
                    <button className={btn} onClick={addLine}>+ 제품 추가</button>
                  </div>
                </div>
                <LineHeader gridCols={lineGridCols} />
                <div className="mt-2 space-y-1">
                {lines.map((l, i) => (
                    <div key={i}>
                      <LineRow l={l} i={i} onUpdate={updateLine} onRemove={removeLine} presetByName={presetByName} masterByName={masterByName} inputCls={inp} inputRightCls={inpR} btnCls={btn} gridCols={lineGridCols} qtyBadgeCls={qtyBadge} supabaseClient={supabase} />
                      {orderWoEnabled && l.name && !["택배비"].includes(l.name) ? (
                        <div className="ml-1 mb-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                          <div className="mb-1 text-xs text-slate-500">🖼 {l.name} 인쇄 디자인 이미지</div>
                          <div className="flex flex-wrap items-center gap-2">
                            {/* 기존 이미지 (복사 시) */}
                            {(wo_itemExistingImageUrls[i] ?? []).map((url, j) => (
                              <div key={`exist-${j}`} className="group relative">
                                <img src={url} alt={`기존이미지${j+1}`} className="h-14 w-14 rounded-lg border border-slate-200 object-cover opacity-80" />
                                <button className="absolute -right-1 -top-1 hidden h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] text-white group-hover:flex"
                                  onClick={() => {
                                    setWo_itemExistingImageUrls((prev) => ({ ...prev, [i]: (prev[i] ?? []).filter((_, k) => k !== j) }));
                                    setWo_itemExistingImagePaths((prev) => ({ ...prev, [i]: (prev[i] ?? []).filter((_, k) => k !== j) }));
                                  }}>✕</button>
                              </div>
                            ))}
                            {/* 새로 선택한 이미지 */}
                            {(wo_itemImagePreviewUrls[i] ?? []).map((url, j) => (
                              <div key={`new-${j}`} className="group relative">
                                <img src={url} alt={`이미지${j+1}`} className="h-14 w-14 rounded-lg border border-blue-200 object-cover" />
                                <button className="absolute -right-1 -top-1 hidden h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] text-white group-hover:flex"
                                  onClick={() => {
                                    setWo_itemImageFiles((prev) => ({ ...prev, [i]: (prev[i] ?? []).filter((_, k) => k !== j) }));
                                    setWo_itemImagePreviewUrls((prev) => ({ ...prev, [i]: (prev[i] ?? []).filter((_, k) => k !== j) }));
                                  }}>✕</button>
                              </div>
                            ))}
                            <label className="flex h-14 w-14 cursor-pointer items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white text-slate-400 hover:border-blue-400 hover:text-blue-500">
                              <span className="text-xl">+</span>
                              <input type="file" accept="image/*" multiple className="hidden"
                                onChange={(e) => {
                                  const files = Array.from(e.target.files ?? []);
                                  setWo_itemImageFiles((prev) => ({ ...prev, [i]: [...(prev[i] ?? []), ...files] }));
                                  setWo_itemImagePreviewUrls((prev) => ({ ...prev, [i]: [...(prev[i] ?? []), ...files.map((f) => URL.createObjectURL(f))] }));
                                  e.target.value = "";
                                }} />
                            </label>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
                <Datalists />

                {/* 작업지시서 자동생성 */}
                <div className="mt-4 rounded-2xl border border-orange-100 bg-orange-50 p-3">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-semibold text-orange-800">📋 작업지시서 자동생성</div>
                      <span className="text-xs text-orange-600">주문 저장 시 함께 생성됩니다</span>
                    </div>
                    {isSubAdmin ? (
                      <label className="flex items-center gap-2 text-sm cursor-not-allowed opacity-50">
                        <input type="checkbox" checked={false} disabled />
                        <span className="text-slate-500">생성 OFF (권한 없음)</span>
                      </label>
                    ) : (
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input type="checkbox" checked={orderWoEnabled} onChange={(e) => setOrderWoEnabled(e.target.checked)} />
                        <span className={orderWoEnabled ? "font-semibold text-orange-700" : "text-slate-500"}>{orderWoEnabled ? "생성 ON" : "생성 OFF"}</span>
                      </label>
                    )}
                  </div>
                  {!isSubAdmin && orderWoEnabled ? (
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                      <div><div className="mb-1 text-xs text-slate-600">서브네임</div><input className={inp} placeholder="예: COS, 크로버, 삼광초" value={orderWoSubName} onChange={(e) => setOrderWoSubName(e.target.value)} /></div>
                      <div><div className="mb-1 text-xs text-slate-600">규격(로고스펙)</div><input className={inp} placeholder="예: 40x40mm" value={orderWoLogoSpec} onChange={(e) => setOrderWoLogoSpec(e.target.value)} /></div>
                      <div><div className="mb-1 text-xs text-slate-600">두께</div>
                        <select className={inp} value={orderWoThickness} onChange={(e) => setOrderWoThickness(e.target.value)}>
                          {["2mm", "3mm", "5mm", "기타"].map((v) => <option key={v} value={v}>{v}</option>)}
                        </select>
                      </div>
                      <div><div className="mb-1 text-xs text-slate-600">포장방법</div>
                        <select className={inp} value={orderWoPackagingType} onChange={(e) => {
                          setOrderWoPackagingType(e.target.value);
                          if (e.target.value === "벌크") setWo_packageUnit("기타");
                        }}>
                          {["", "트레이-정사각20구", "트레이-직사각20구", "트레이-35구", "벌크"].map((v) => <option key={v} value={v}>{v === "" ? "선택안함" : v}</option>)}
                        </select>
                      </div>
                      <div>
                        <div className="mb-1 text-xs text-slate-600">포장단위</div>
                        <select className={inp} value={wo_packageUnit} onChange={(e) => setWo_packageUnit(e.target.value)}>
                          {["", "100ea", "200ea", "기타"].map((v) => <option key={v} value={v}>{v === "" ? "선택안함" : v}</option>)}
                        </select>
                        {wo_packageUnit === "기타" && (
                          <div className="flex items-center gap-1 mt-1">
                            <input className={inpR} inputMode="numeric" placeholder="수량 입력" value={wo_packageUnitCustom} onChange={(e) => setWo_packageUnitCustom(e.target.value.replace(/[^\d]/g, ""))} />
                            <span className="shrink-0 text-sm text-slate-500">ea</span>
                          </div>
                        )}
                      </div>
                      <div>
                            <div className="mb-1 text-xs text-slate-600">
                              성형틀 열수 (가로 × 세로)
                              {orderWoMoldCols && orderWoMoldRows && toInt(orderWoMoldCols) > 0 && toInt(orderWoMoldRows) > 0 && (
                                <span className="ml-2 font-semibold text-blue-600">= {toInt(orderWoMoldCols) * toInt(orderWoMoldRows)}개/장</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <input className={inpR} inputMode="numeric" placeholder="가로" value={orderWoMoldCols} onChange={(e) => setOrderWoMoldCols(e.target.value.replace(/[^\d]/g, ""))} />
                              <span className="shrink-0 font-bold text-slate-400">×</span>
                              <input className={inpR} inputMode="numeric" placeholder="세로" value={orderWoMoldRows} onChange={(e) => setOrderWoMoldRows(e.target.value.replace(/[^\d]/g, ""))} />
                            </div>
                          </div>
                          <div>
                        <div className="mb-1 text-xs text-slate-600">성형틀 장수 (ea)</div>
                        <input className={inpR} inputMode="numeric" placeholder="예: 10"
                          value={orderWoMoldCount}
                          onChange={(e) => setOrderWoMoldCount(e.target.value.replace(/[^\d]/g, ""))} />
                      </div>
                      <div className="md:col-span-3 flex items-center gap-3">
                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                          <input type="checkbox" checked={orderSkipProductionCheck}
                            onChange={(e) => setOrderSkipProductionCheck(e.target.checked)} />
                       <span className={orderSkipProductionCheck ? "font-semibold text-amber-700" : "text-slate-500"}>
                            CCP/담당자 생략 (재고 포장 출고용 · 도눔기성만 해당)
                          </span>   
                        </label>
                      </div>
                      <div className="md:col-span-3">
                      <div className="mb-1 text-xs text-slate-600">비고</div>
                      <textarea className={`${inp} resize-none`} lang="ko" rows={2} placeholder="전달할 메모나 특이사항" value={orderWoNote} onChange={(e) => setOrderWoNote(e.target.value)} />
                        {(() => {
                          const firstFoodType = lines[0]?.food_type ?? "";
                          if (!firstFoodType.includes("리얼")) return null;
                          return <div className="mt-1 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-700">⚠️ 식품유형에 "리얼" 포함 → 이산화티타늄 메모 자동 삽입</div>;
                        })()}
                      </div>
                      <div className="md:col-span-3 text-xs text-slate-500">
                        💡 인쇄 디자인 이미지는 아래 각 품목별로 업로드하세요.
                      </div>
                    </div>
                   ) : (
                    <div className="text-xs text-slate-500">
                      {isSubAdmin ? "주문/출고만 저장됩니다. (작업지시서 자동생성 권한 없음)" : "작업지시서 없이 주문/출고만 저장됩니다."}
                    </div>
                  )}         
                </div>

                <div className="mt-4 flex items-center justify-end gap-4 text-sm">
                  <div>공급가 {fmt(orderTotals.supply)}</div><div>부가세 {fmt(orderTotals.vat)}</div>
                  <div className="font-semibold">총액 {fmt(orderTotals.total)}</div>
                  <div className="flex items-center gap-3">
                  <button type="button" onClick={() => setOrderIsReorder((v) => !v)} style={{ padding: "3px 12px", borderRadius: "12px", fontSize: "12px", fontWeight: "bold", cursor: "pointer", border: "none", background: orderIsReorder ? "#fef3c7" : "#dbeafe", color: orderIsReorder ? "#b45309" : "#1d4ed8", outline: `1px solid ${orderIsReorder ? "#fcd34d" : "#93c5fd"}` }}>
                      {orderIsReorder ? "재주문" : "신규"}
                    </button>
                    <button className={btnOn} onClick={createOrder}>주문/출고 생성{!isSubAdmin && orderWoEnabled ? " + 작업지시서" : ""}</button>
                  </div>
                </div>
              </div>
            ) : null}

           {/* Ledger input: SUBADMIN에게는 숨김 */}
           {mode !== "ORDERS" && !isSubAdmin ? (
              <div className={`${card} p-4`}>
                <div className="mb-3 flex items-center gap-3"><div className="text-lg font-semibold">금전출납 입력</div><span className={pill}>조회대상: {targetLabel}</span></div>
                <div className="mb-2 flex items-center justify-end">
                  <div className="text-sm text-slate-600">방향: <span className="font-semibold">{categoryToDirection(category) === "IN" ? "입금(+)" : "출금(-)"}</span></div>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div><div className="mb-1 text-xs text-slate-600">일자</div><input type="date" className={inp} value={entryDate} onChange={(e) => setEntryDate(e.target.value)} /></div>
                  <div><div className="mb-1 text-xs text-slate-600">결제수단</div>
                    <select className={inp} value={payMethod} onChange={(e) => setPayMethod(e.target.value as any)}>
                      {[["BANK", "입금"], ["CASH", "현금"], ["CARD", "카드"], ["ETC", "기타"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                  <div><div className="mb-1 text-xs text-slate-600">카테고리</div>
                    <div className="flex flex-wrap gap-2">
                      {CATEGORIES.map((c) => (
                        <button key={c} type="button" className={category === c ? btnOn : btn}
                          onClick={() => { setCategory(c); if (c !== "급여") { setSalaryEmployeeId(""); setVatFree(false); } else { setVatFree(true); } }}>{c}</button>
                      ))}
                    </div>
                  </div>
                  {category === "급여" ? (
                    <div className="md:col-span-3">
                      <div className="mb-1 text-xs text-slate-600">직원 선택(급여)</div>
                      <select className={inp} value={salaryEmployeeId} onChange={(e) => { const empId = e.target.value; setSalaryEmployeeId(empId); const found = employees.find(x => x.id === empId); if (found?.name) setManualCounterpartyName(found.name); }}>
                        <option value="">직원을 선택하세요</option>
                        {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name ?? "(이름없음)"}</option>)}
                      </select>
                    </div>
                  ) : null}
                  <div>
                    <div className="mb-1 text-xs text-slate-600">금액(원)</div>
                    <input className={inpR} inputMode="numeric" value={amountStr}
                      onChange={(e) => setAmountStr(e.target.value.replace(/[^\d,]/g, ""))}
                      onBlur={() => { const n = Number((amountStr || "0").replaceAll(",", "")); if (Number.isFinite(n) && n > 0) setAmountStr(n.toLocaleString("ko-KR")); }} />
                    <div className="mt-2 flex items-center gap-2">
                      <label className={`flex items-center gap-2 text-sm ${category === "급여" ? "text-slate-400 cursor-not-allowed" : "text-slate-700"}`}>
                        <input type="checkbox" checked={vatFree} disabled={category === "급여"} onChange={(e) => category !== "급여" && setVatFree(e.target.checked)} />
                        부가세 없음{category === "급여" && <span className="text-xs text-amber-600 ml-1">← 급여는 자동 적용</span>}
                      </label>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <div><div className="mb-1 text-xs text-slate-600">공급가</div><div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-right tabular-nums">{ledgerSplit.total ? fmt(ledgerSplit.supply) : ""}</div></div>
                      <div><div className="mb-1 text-xs text-slate-600">부가세</div>
                        <div className={`rounded-xl border px-3 py-2 text-sm text-right tabular-nums ${category === "급여" ? "border-amber-200 bg-amber-50 text-amber-700 font-semibold" : "border-slate-200 bg-slate-50"}`}>
                          {category === "급여" ? "0 (비과세)" : ledgerSplit.total ? fmt(ledgerSplit.vat) : ""}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div><div className="mb-1 text-xs text-slate-600">업체명(매입처/상대방)</div>
  <input className={inp} lang="ko" value={manualCounterpartyName} onChange={(e) => setManualCounterpartyName(e.target.value)} placeholder="예: 쿠팡 / 이마트" />
</div>
<div><div className="mb-1 text-xs text-slate-600">사업자등록번호</div><input className={inp} value={manualBusinessNo} onChange={(e) => setManualBusinessNo(e.target.value)} /></div>
<div className="md:col-span-3"><div className="mb-1 text-xs text-slate-600">메모</div><input className={inp} lang="ko" value={ledgerMemo} onChange={(e) => setLedgerMemo(e.target.value)} /></div>
                </div>
                <div className="mt-4 flex justify-end"><button className={btnOn} onClick={createLedger}>금전출납 기록</button></div>
              </div>
            ) : null}

            {/* 거래내역 */}
            <div className={`${card} p-4`}>
              <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="text-lg font-semibold">거래내역</div>
                  <div className="mt-2"><span className={pill}>조회대상: {targetLabel}</span></div>
                  <div className="mt-2 text-xs text-slate-600">표시: {mode === "ORDERS" ? "주문/출고" : mode === "LEDGER" ? "금전출납" : "통합"}{includeOpening ? " · 기초잔액 포함" : ""}</div>
                </div>
                {(() => {
                  // 최초 기록부터 누적 계산 (기초잔액 포함 = 전체 누적)
                  const totalOut = unifiedTotals.minus + Math.abs(Math.min(openingBalance, 0));
                  const totalIn = unifiedTotals.plus + Math.max(openingBalance, 0);
                  const net = totalIn - totalOut; // 양수 = 초과입금, 음수 = 미수금
                  const isMisu = net < 0;
                  return (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-right text-sm space-y-2">
                      <div>
                        <div className={`text-xs font-semibold ${isMisu ? "text-red-600" : "text-blue-600"}`}>
                          {isMisu ? "미수금" : "초과입금"}
                        </div>
                        <div className={`text-base font-bold tabular-nums ${isMisu ? "text-red-600" : "text-blue-600"}`}>
                          {fmt(Math.abs(net))}
                        </div>
                      </div>
                    </div>
                  );
                })()}


              </div>
              <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-[1fr_1fr_auto] md:items-end">
                <div><div className="mb-1 text-xs text-slate-600">From</div><input type="date" className={inp} value={fromYMD} onChange={(e) => { setToTouched(false); setFromYMD(e.target.value); }} /></div>
                <div><div className="mb-1 text-xs text-slate-600">To</div><input type="date" className={inp} value={toYMD} onChange={(e) => { setToTouched(true); setToYMD(e.target.value); }} /></div>
                <div className="flex flex-wrap gap-2">
                  <button className={btn} onClick={() => { setFromYMD("2025-12-01"); setToYMD(todayYMD()); setToTouched(false); }}>기간 초기화</button>
                  <button className={btnOn} onClick={loadTrades}>조회</button>
                 {/* ── 새로고침 버튼 추가 ── */}
                 <button className={btn} onClick={loadTrades}>🔄 새로고침</button>
                  {!isSubAdmin ? (
                    <button className={btn} onClick={() => { setTrashOpen(true); loadTrash(); }}>🗑️ 삭제복원</button>
                  ) : null}
                </div>
              </div>
              <div className="relative mb-3">
                <input className={inp} lang="ko" value={tradeSearch} onChange={(e) => {
                  const decomposed = [...e.target.value].map(ch =>
                    ch === '\u3140' ? '\u3139\u314e' : ch
                  ).join('');
                  setTradeSearch(decomposed);
                }} placeholder="검색: 매입처/사업자번호/메모/제품명/카테고리/방법 (기간 무관 전체 검색)" />
                {tradeSearch && (
                  <button
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold leading-none"
                    onClick={() => { setTradeSearch(""); setTradeSearchDebounced(""); setSearchResults(null); }}
                  >✕</button>
                )}
                {searchLoading && (
                  <div className="absolute right-8 top-1/2 -translate-y-1/2 text-xs text-blue-500">검색중...</div>
                )}
              </div>

              <div className="rounded-2xl border border-slate-200">
                <div ref={tradeTopScrollRef} className="overflow-x-auto"
                  onScroll={(e) => { const top = e.currentTarget, bottom = tradeBottomScrollRef.current; if (!bottom || tradeSyncingRef.current === "BOTTOM") return; tradeSyncingRef.current = "TOP"; bottom.scrollLeft = top.scrollLeft; tradeSyncingRef.current = null; }}>
                  <div style={{ width: TRADE_TABLE_MIN_WIDTH, height: 1 }} />
                </div>
                <div ref={tradeBottomScrollRef} className="max-h-[680px] overflow-x-auto overflow-y-auto"
                  onScroll={(e) => { const bottom = e.currentTarget, top = tradeTopScrollRef.current; if (!top || tradeSyncingRef.current === "TOP") return; tradeSyncingRef.current = "BOTTOM"; top.scrollLeft = bottom.scrollLeft; tradeSyncingRef.current = null; }}>
                  <table className="w-full table-fixed text-sm">
                    <colgroup>
                      <col style={{ width: "110px" }} /><col style={{ width: "180px" }} /><col style={{ width: "140px" }} />
                      <col style={{ width: "220px" }} /><col style={{ width: "120px" }} /><col style={{ width: "90px" }} />
                      <col style={{ width: "110px" }} /><col style={{ width: "110px" }} /><col style={{ width: "130px" }} /><col style={{ width: "220px" }} />
                    </colgroup>
                    <thead className="bg-slate-50 text-xs font-semibold text-slate-600">
  <tr>
    <th className="sticky top-0 z-20 bg-slate-50 px-3 py-2 text-left">날짜</th>
    <th className="sticky top-0 z-20 bg-slate-50 px-3 py-2 text-left">거래처</th>
    <th className="sticky top-0 z-20 bg-slate-50 px-3 py-2 text-left">주문자</th>
    <th className="sticky top-0 z-20 bg-slate-50 px-3 py-2 text-left">적요</th>
    <th className="sticky top-0 z-20 bg-slate-50 px-3 py-2 text-left">카테고리</th>
    <th className="sticky top-0 z-20 bg-slate-50 px-3 py-2 text-left">방법</th>
    <th className="sticky top-0 right-[460px] z-20 bg-slate-50 px-3 py-2 text-right">입금</th>
    <th className="sticky top-0 right-[350px] z-20 bg-slate-50 px-3 py-2 text-right">출금(출고)</th>
    <th className="sticky top-0 right-[220px] z-20 bg-slate-50 px-3 py-2 text-right">잔액</th>
    <th className="sticky top-0 right-0 z-30 bg-slate-50 px-3 py-2 text-center">작업</th>
  </tr>
                    </thead>
                    <tbody>
                    {(searchResults ?? unifiedRows).filter((x) => {
                        if (isSubAdmin && x.kind === "LEDGER") return false; // SUBADMIN: LEDGER 행 숨김
                        if (mode === "ORDERS") return x.kind === "ORDER";
                        if (mode === "LEDGER") return x.kind === "LEDGER";
                        return true;
                      }).map((x) => (
                        <tr key={`${x.kind}-${x.rawId}`} className="border-t border-slate-200 bg-white">
                          <td className="px-3 py-1 font-semibold tabular-nums leading-tight">{x.date}</td>
                          <td className="px-3 py-1 font-semibold leading-tight">{x.partnerName}</td>
                          <td className="px-3 py-1 font-semibold leading-tight">{x.ordererName}</td>
                          <td className="px-3 py-1 font-semibold leading-tight">{buildOrderSummaryText(x)}</td>
                          <td className="px-3 py-1 font-semibold leading-tight">{x.category}</td>
                          <td className="px-3 py-1 font-semibold leading-tight">{x.kind === "LEDGER" ? methodLabel(x.method) : x.method}</td>
                          <td className="sticky right-[460px] z-10 bg-white px-3 py-1 text-right tabular-nums font-semibold text-blue-700 leading-tight">{x.inAmt ? fmt(x.inAmt) : ""}</td>
                          <td className="sticky right-[350px] z-10 bg-white px-3 py-1 text-right tabular-nums font-semibold text-red-600 leading-tight">{x.outAmt ? fmt(x.outAmt) : ""}</td>
                          <td className="sticky right-[220px] z-10 bg-white px-3 py-1 text-right tabular-nums font-semibold leading-tight">{fmt(x.balance)}</td>
                          <td className="sticky right-0 z-20 bg-white px-2 py-1">
                            <div className="grid grid-cols-2 gap-1">
                              <button className={miniBtn} onClick={() => onCopyClick(x)}>복사</button>
                              <button className={miniBtn} onClick={() => onMemoClick(x)}>메모</button>
                              <button className={miniBtn} onClick={() => openEdit(x)}>수정</button>
                              <button className={miniBtn} onClick={() => deleteTradeRow(x)}>삭제</button>
                              {x.kind === "ORDER" ? (
  <>
    <button
      className={`col-span-2 rounded-lg border px-1.5 py-0.5 text-[11px] font-semibold ${x.tax_invoice_issued ? "border-green-300 bg-green-50 text-green-700 hover:bg-green-100" : "border-orange-300 bg-orange-50 text-orange-700 hover:bg-orange-100"}`}
      onClick={() => toggleTaxInvoice(x)}
    >
      {x.tax_invoice_issued ? "✅ 세금계산서 발행완료" : "☐ 세금계산서 미발행"}
    </button>
    <button className={`${miniBtn} col-span-2`} onClick={async () => {
      const { data } = await supabase.from("work_orders").select("*,work_order_items(id,work_order_id,delivery_date,sub_items,order_qty,actual_qty,unit_weight,total_weight,expiry_date,order_id,barcode_no,note,images)").eq("linked_order_id", x.rawId).limit(1).maybeSingle();
      if (data) setWo_printTarget(data as WorkOrderRow);
      else setMsg("연결된 작업지시서가 없습니다.");
    }}>🖨️ 작업지시서</button>
  </>
) : null}
{x.kind === "LEDGER" && x.outAmt > 0 ? (
  <>
    <button
      className={`col-span-2 rounded-lg border px-1.5 py-0.5 text-[11px] font-semibold ${x.tax_invoice_received ? "border-green-300 bg-green-50 text-green-700 hover:bg-green-100" : "border-orange-300 bg-orange-50 text-orange-700 hover:bg-orange-100"}`}
      onClick={() => toggleTaxInvoiceReceived(x)}
    >
      {x.tax_invoice_received ? "✅ 계산서수령완료" : "☐ 계산서미수령"}
    </button>
    <button
      className={`col-span-2 rounded-lg border px-1.5 py-0.5 text-[11px] font-semibold ${x.payment_completed ? "border-green-300 bg-green-50 text-green-700 hover:bg-green-100" : "border-orange-300 bg-orange-50 text-orange-700 hover:bg-orange-100"}`}
      onClick={() => togglePaymentCompleted(x)}
    >
      {x.payment_completed ? "✅ 결제완료" : "☐ 결제미완료"}
    </button>
  </>
) : null}


                            </div>
                          </td>
                        </tr>
                      ))}
                      {unifiedRows.length === 0 ? (
                        <tr><td colSpan={10} className="bg-white px-4 py-4 text-sm text-slate-500">거래내역이 없습니다.</td></tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="mt-2 text-xs text-slate-500">※ 주문/출고는 출금(출고)으로 표시됩니다.</div>
            </div>
          </div>
        </div>

        {showTopBtn ? (
          <button type="button" className="fixed bottom-6 right-6 z-50 rounded-full border border-slate-200 bg-white px-4 py-3 text-sm font-semibold shadow-lg hover:bg-slate-50" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>TOP</button>
        ) : null}
      </div>

      {wo_printTarget ? (
       <WoPrintModal wo={wo_printTarget} onClose={() => setWo_printTarget(null)} />
      ) : null}
    </div>
  );
}

