"use client";

import type { Metadata } from "next";
export const metadata: Metadata = { title: "스캔 | BONUSMATE ERP" };

import { createClient } from "@/lib/supabase/browser";

import type { RealtimeChannel } from "@supabase/supabase-js";

type NewWoNotification = {
  id: string; client_name: string; product_name: string;
  work_order_no: string; order_date: string; created_at: string;
};

function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const notes = [
      { freq: 523.25, start: 0.0, dur: 0.15 },
      { freq: 659.25, start: 0.18, dur: 0.15 },
      { freq: 783.99, start: 0.36, dur: 0.25 },
    ];
    notes.forEach(({ freq, start, dur }) => {
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination); osc.type = "sine";
      osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
      gain.gain.setValueAtTime(0, ctx.currentTime + start);
      gain.gain.linearRampToValueAtTime(0.4, ctx.currentTime + start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
      osc.start(ctx.currentTime + start); osc.stop(ctx.currentTime + start + dur + 0.05);
    });
  } catch (e) { console.warn("알림음 재생 실패:", e); }
}

import { useEffect, useMemo, useRef, useState } from "react";

type MovementType = "IN" | "OUT" | "DISCARD" | "GIFT" | "CONVERT";

type LotRow = {
  lot_id: string;
  product_id: string;
  product_name: string;
  product_category: string | null;
  variant_id: string;
  variant_name: string;
  barcode: string;
  expiry_date: string;
  pack_unit: number;
  stock_qty: number;
};

type VariantInfo = {
  variant_id: string;
  product_name: string;
  product_category: string | null;
  food_type: string | null;
  variant_name: string;
  barcode: string;
  pack_unit: number;
};

type CartRow = {
  id: string;
  type: MovementType;
  barcode: string;
  expiry: string;
  qty_ea: number;
  note: string;
  variantInfo: VariantInfo;
  // ▼ 추가: LOT 직접 지정 시 사용 (없으면 FEFO 자동)
  selectedLotId?: string;
};

type ProductSuggestItem = {
  variant_id: string;
  product_name: string;
  product_category: string | null;
  variant_name: string;
  food_type: string | null;
  barcode: string;
};

function getDisplayName(variant_name: string, product_name: string, category?: string | null): string {
  if (category === "기성" || category === "전사지") return product_name;
  const unitTypes = ["EA", "BOX", "ea", "box", ""];
  if (unitTypes.includes((variant_name ?? "").trim())) return product_name;
  return variant_name;
}

function normalizeBarcode(raw: string) {
  return (raw ?? "")
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[^0-9A-Z_-]/g, "");
}

function intMin(n: any, min: number) {
  const v = Number(n);
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.floor(v));
}

function fmtInt(n: number) {
  return new Intl.NumberFormat("ko-KR").format(intMin(n, 0));
}

function isValidDateYYYYMMDD(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function getTodayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isEditableInput(
  el: Element | null
): el is HTMLInputElement | HTMLTextAreaElement {
  if (!el) return false;
  const tag = el.tagName?.toLowerCase();
  if (tag === "textarea") return true;
  if (tag !== "input") return false;
  const input = el as HTMLInputElement;
  const t = (input.type || "text").toLowerCase();
  return [
    "text",
    "search",
    "tel",
    "url",
    "email",
    "number",
    "password",
    "date",
  ].includes(t);
}

function barcodeCandidates(code: string) {
  const c = normalizeBarcode(code);
  const list: string[] = [];
  if (c) list.push(c);

  if (/^\d{12}$/.test(c) && !c.startsWith("BO")) {
    list.push(`BO${c}`);
  }

  return Array.from(new Set(list));
}

// LOT 직접 지정이 가능한 유형
const LOT_SELECTABLE_TYPES: MovementType[] = ["OUT", "GIFT", "DISCARD"];

export default function ScanClient() {
  const supabase = useMemo(() => createClient(), []);

  // ✅ 작업일자 (기본값: 오늘)
  const today = getTodayStr();
  const [workDate, setWorkDate] = useState<string>(today);

  const [barcode, setBarcode] = useState("");
  const [type, setType] = useState<MovementType>("IN");
  const [qtyEa, setQtyEa] = useState<number | "">("");
  const [expiry, setExpiry] = useState("");
  const [note, setNote] = useState("");

  const [lots, setLots] = useState<LotRow[]>([]);
  const [variantInfo, setVariantInfo] = useState<VariantInfo | null>(null);

  const [cart, setCart] = useState<CartRow[]>([]);

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [newWoNotifications, setNewWoNotifications] = useState<NewWoNotification[]>([]);
  const [showNewWoModal, setShowNewWoModal] = useState(false);
  const insertChannelRef = useRef<RealtimeChannel | null>(null);
  const pageLoadTimeRef = useRef<string>(new Date().toISOString());

  const [productSearch, setProductSearch] = useState("");
  const [productSuggestions, setProductSuggestions] = useState<ProductSuggestItem[]>([]);
  const [productSuggestOpen, setProductSuggestOpen] = useState(false);
  const [productSuggestActive, setProductSuggestActive] = useState(-1);
  const productSearchRef = useRef<HTMLInputElement>(null);
  const productSuggestWrapRef = useRef<HTMLDivElement>(null);

  // ▼ 추가: LOT 직접 선택 state ("AUTO" = FEFO 자동, lot_id = 직접 지정)
  const [selectedLotId, setSelectedLotId] = useState<string>("AUTO");

  useEffect(() => {
    const channel = supabase
      .channel("wo_scan_insert_notify")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "work_orders" }, (payload) => {
        const d = payload.new as Record<string, unknown>;
        const createdAt = String(d.created_at ?? "");
        if (createdAt && createdAt < pageLoadTimeRef.current) return;
        setNewWoNotifications((prev) => [{ id: String(d.id ?? ""), client_name: String(d.client_name ?? ""), product_name: String(d.product_name ?? ""), work_order_no: String(d.work_order_no ?? ""), order_date: String(d.order_date ?? ""), created_at: createdAt }, ...prev]);
        setShowNewWoModal(true);
        playNotificationSound();
      })
      .subscribe((status, err) => { console.log("🔔 [scan INSERT채널]", status, err ?? ""); });
    insertChannelRef.current = channel;
    return () => { supabase.removeChannel(channel); insertChannelRef.current = null; };
  }, []); // eslint-disable-line

  const barcodeRef = useRef<HTMLInputElement | null>(null);
  const qtyRef = useRef<HTMLInputElement | null>(null);
  const lotsSectionRef = useRef<HTMLDivElement | null>(null);

  const focusBarcode = () =>
    requestAnimationFrame(() => barcodeRef.current?.focus());

  const focusQty = () =>
    requestAnimationFrame(() => {
      qtyRef.current?.focus();
      try {
        qtyRef.current?.select();
      } catch {
        // ignore
      }
    });

  useEffect(() => {
    focusBarcode();
  }, []);

  useEffect(() => {
    if (type === "OUT" || type === "GIFT") setExpiry("");
  }, [type]);

  // ▼ 추가: 유형 또는 바코드가 바뀌면 LOT 선택 초기화
  useEffect(() => {
    setSelectedLotId("AUTO");
  }, [type, barcode]);

  const expiryDisabled = type === "OUT" || type === "GIFT";

  // ▼ 추가: LOT 직접 선택이 활성화된 상태인지
  const isLotSelectable = LOT_SELECTABLE_TYPES.includes(type) && lots.length > 0;

  // ▼ 추가: 현재 선택된 LOT의 재고 수량 (수량 입력 max 제한용)
  const selectedLot = selectedLotId !== "AUTO"
    ? lots.find((l) => l.lot_id === selectedLotId) ?? null
    : null;
  const selectedLotMaxQty = selectedLot ? intMin(selectedLot.stock_qty, 0) : undefined;

  const scrollToLots = () => {
    requestAnimationFrame(() => {
      lotsSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  };

  const loadProductSuggestions = async (keyword: string) => {
    const k = keyword.trim();
    if (!k) {
      setProductSuggestions([]);
      return;
    }
    try {
      const { data, error } = await supabase
        .from("product_variants")
        .select("id, variant_name, barcode, products(name, category, food_type)")
        .limit(500);
      if (error) throw error;

      const kLower = k.toLowerCase();
      const unique: ProductSuggestItem[] = [];
      const seen = new Set<string>();

      for (const r of data ?? []) {
        if (seen.has(r.id)) continue;
        const p = (r as any).products;
        const bc = ((r as any).barcode ?? "") as string;
        if (!bc || bc.startsWith("AUTO-")) continue;

        const pName = (p?.name ?? "") as string;
        const vName = ((r as any).variant_name ?? "") as string;
        const displayName = getDisplayName(vName, pName, p?.category ?? null);

        const matched =
          displayName.toLowerCase().includes(kLower) ||
          vName.toLowerCase().includes(kLower) ||
          bc.toLowerCase().includes(kLower) ||
          ((p?.food_type ?? "") as string).toLowerCase().includes(kLower);

        if (!matched) continue;

        seen.add(r.id);
        unique.push({
          variant_id: r.id,
          product_name: pName,
          product_category: (p?.category ?? null) as string | null,
          variant_name: vName,
          food_type: (p?.food_type ?? null) as string | null,
          barcode: bc,
        });
      }

      unique.sort((a, b) => {
        const an = getDisplayName(a.variant_name, a.product_name, a.product_category).toLowerCase();
        const bn = getDisplayName(b.variant_name, b.product_name, b.product_category).toLowerCase();
        if (an < bn) return -1;
        if (an > bn) return 1;
        return 0;
      });

      setProductSuggestions(unique);
    } catch (e) {
      setProductSuggestions([]);
    }
  };

  const selectProductSuggestion = (item: ProductSuggestItem) => {
    setBarcode(item.barcode);
    setProductSearch("");
    setProductSuggestions([]);
    setProductSuggestOpen(false);
    setProductSuggestActive(-1);
    requestAnimationFrame(() => barcodeRef.current?.focus());
  };

  const fetchVariantInfo = async (code: string): Promise<VariantInfo | null> => {
    const { data, error } = await supabase
      .from("product_variants")
      .select("id, variant_name, barcode, pack_unit, products(name, category, food_type)")
      .eq("barcode", code)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return null;

    const p = (data as any).products;
    return {
      variant_id: data.id as string,
      product_name: (p?.name ?? "") as string,
      product_category: (p?.category ?? null) as string | null,
      food_type: (p?.food_type ?? null) as string | null,
      variant_name: (data as any).variant_name ?? "",
      barcode: (data as any).barcode ?? code,
      pack_unit: intMin((data as any).pack_unit ?? 1, 1),
    };
  };

  const resolveVariantInfo = async (
    raw: string
  ): Promise<{ code: string; vInfo: VariantInfo } | null> => {
    const cands = barcodeCandidates(raw);
    for (const c of cands) {
      const vInfo = await fetchVariantInfo(c);
      if (vInfo) return { code: c, vInfo };
    }
    return null;
  };

  const searchLotsByCode = async (raw: string) => {
    setMsg(null);

    const cands = barcodeCandidates(raw);
    if (cands.length === 0) {
      setLots([]);
      setVariantInfo(null);
      return;
    }

    let resolved: { code: string; vInfo: VariantInfo } | null = null;

    try {
      resolved = await resolveVariantInfo(raw);
      if (!resolved) {
        setLots([]);
        setVariantInfo(null);
        setMsg(`바코드 ${cands[0]} 는 등록되지 않았습니다.`);
        return;
      }

      setVariantInfo(resolved.vInfo);
      if (normalizeBarcode(barcode) !== resolved.code) {
        setBarcode(resolved.code);
      }
    } catch (e: any) {
      setLots([]);
      setVariantInfo(null);
      setMsg(`조회 오류: ${e?.message ?? "오류"}`);
      return;
    }

    const { data, error } = await supabase
      .from("v_stock_by_lot")
      .select("*")
      .eq("barcode", resolved.code)
      .gt("stock_qty", 0)
      .order("expiry_date", { ascending: true });

    if (error) {
      setLots([]);
      setMsg(`조회 오류: ${error.message}`);
      return;
    }

    const rows = (data ?? []) as LotRow[];
    setLots(rows);

    if (rows.length === 0) {
      setMsg(`등록됨 ✅ (입고/소비기한 LOT 없음) : ${resolved.code}`);
    } else {
      setMsg(`조회 완료 ✅ ${rows.length}건 (${resolved.code})`);
    }

    scrollToLots();
  };

  useEffect(() => {
    const code = normalizeBarcode(barcode);
    if (!code) {
      setLots([]);
      setVariantInfo(null);
      setMsg(null);
      return;
    }
    const t = setTimeout(() => searchLotsByCode(barcode), 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barcode]);

  const pickFefoLots = async (code: string) => {
    const { data, error } = await supabase
      .from("v_stock_by_lot")
      .select("*")
      .eq("barcode", code)
      .gt("stock_qty", 0)
      .order("expiry_date", { ascending: true });

    if (error) throw new Error(error.message);
    return (data ?? []) as LotRow[];
  };

  const addToCart = async (overrideRawBarcode?: string) => {
    setMsg(null);

    const raw = overrideRawBarcode ?? barcode;
    const cands = barcodeCandidates(raw);
    const inputCode = cands[0] ?? "";
    try {
      if (!inputCode) throw new Error("바코드를 입력하세요.");

      if (qtyEa === "" || qtyEa < 1) throw new Error("수량을 입력하세요. (1EA 이상)");
      const qty = intMin(qtyEa, 1);

      const resolved = await resolveVariantInfo(raw);
      if (!resolved)
        throw new Error("등록되지 않은 바코드입니다. (품목관리에서 먼저 등록)");

      const code = resolved.code;
      const vInfo = resolved.vInfo;

      const needExpiry = type === "IN" || type === "DISCARD";
      const exp = needExpiry ? expiry : "";

      if (needExpiry) {
        if (!exp) throw new Error("소비기한을 입력하세요. (입고/폐기)");
        if (!isValidDateYYYYMMDD(exp))
          throw new Error("소비기한 형식은 YYYY-MM-DD 입니다.");
      }

      // ▼ 추가: LOT 직접 지정 시 재고 수량 초과 검증
      const lotIdToUse = LOT_SELECTABLE_TYPES.includes(type) && selectedLotId !== "AUTO"
        ? selectedLotId
        : undefined;

      if (lotIdToUse) {
        const lot = lots.find((l) => l.lot_id === lotIdToUse);
        if (lot && qty > intMin(lot.stock_qty, 0)) {
          throw new Error(
            `재고 초과: 선택한 LOT(${lot.expiry_date}) 재고는 ${fmtInt(lot.stock_qty)}EA 입니다.`
          );
        }
      }

      setCart((prev) => {
        const keyMatch = (r: CartRow) => {
          if (r.type !== type) return false;
          if (r.barcode !== code) return false;
          // ▼ 수정: LOT 직접 지정 시 같은 lot_id끼리만 합산
          if (lotIdToUse) return r.selectedLotId === lotIdToUse;
          if (needExpiry) return r.expiry === exp;
          return !r.selectedLotId; // FEFO 자동끼리만 합산
        };

        const idx = prev.findIndex(keyMatch);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = {
            ...next[idx],
            qty_ea: intMin(next[idx].qty_ea, 1) + qty,
            note: note || next[idx].note,
          };
          return next;
        }

        return [
          ...prev,
          {
            id: uid(),
            type,
            barcode: code,
            expiry: exp,
            qty_ea: qty,
            note: note || "",
            variantInfo: vInfo,
            selectedLotId: lotIdToUse, // ▼ 추가
          },
        ];
      });

      setVariantInfo(vInfo);

      setBarcode("");
      setQtyEa("");
      setNote("");
      setSelectedLotId("AUTO"); // ▼ 추가: 목록 추가 후 초기화

      const lotLabel = lotIdToUse
        ? ` (LOT: ${lots.find((l) => l.lot_id === lotIdToUse)?.expiry_date ?? lotIdToUse})`
        : "";
      setMsg(`목록에 추가 ✅ (${type}) ${code} / 수량 ${fmtInt(qty)}EA${lotLabel}`);
      focusBarcode();
    } catch (e: any) {
      setMsg(e?.message ?? "목록 추가 중 오류");
      focusBarcode();
    }
  };

  // ▼ 추가: 전량 버튼 클릭 핸들러
  const handleFullQty = async (lot: LotRow) => {
    setMsg(null);
    const qty = intMin(lot.stock_qty, 0);
    if (qty <= 0) {
      setMsg("재고가 없습니다.");
      return;
    }

    const raw = lot.barcode;
    try {
      const resolved = await resolveVariantInfo(raw);
      if (!resolved) throw new Error("등록되지 않은 바코드입니다.");

      const code = resolved.code;
      const vInfo = resolved.vInfo;

      setCart((prev) => {
        const keyMatch = (r: CartRow) =>
          r.type === type && r.barcode === code && r.selectedLotId === lot.lot_id;
        const idx = prev.findIndex(keyMatch);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = { ...next[idx], qty_ea: qty };
          return next;
        }
        return [
          ...prev,
          {
            id: uid(),
            type,
            barcode: code,
            expiry: "",
            qty_ea: qty,
            note: note || "",
            variantInfo: vInfo,
            selectedLotId: lot.lot_id,
          },
        ];
      });

      setBarcode("");
      setQtyEa("");
      setNote("");
      setSelectedLotId("AUTO");

      setMsg(
        `전량 추가 ✅ (${type}) ${code} / ${fmtInt(qty)}EA (LOT: ${lot.expiry_date})`
      );
      focusBarcode();
    } catch (e: any) {
      setMsg(e?.message ?? "전량 추가 중 오류");
    }
  };

  // ✅ workDate를 TIMESTAMPTZ 문자열로 변환 (해당 날짜 자정 KST 기준)
  const workDateTimestamp = () => `${workDate}T00:00:00+09:00`;

  // ✅ OUT/GIFT 저장 — selectedLotId 직접 지정 분기 추가
  const issueOutGift = async (row: CartRow) => {
    const requestEA = intMin(row.qty_ea, 1);

    // ▼ 추가: LOT 직접 지정인 경우 해당 lot_id로 직접 insert
    if (row.selectedLotId) {
      // 최신 재고 재확인
      const { data: lotData, error: lotErr } = await supabase
        .from("v_stock_by_lot")
        .select("stock_qty")
        .eq("lot_id", row.selectedLotId)
        .maybeSingle();

      if (lotErr) throw new Error(lotErr.message);

      const currentStock = intMin((lotData as any)?.stock_qty ?? 0, 0);
      if (requestEA > currentStock) {
        throw new Error(
          `재고 부족(LOT: ${row.selectedLotId}): 현재 ${fmtInt(currentStock)}EA / 요청 ${fmtInt(requestEA)}EA`
        );
      }

      const { error: mErr } = await supabase.from("movements").insert({
        lot_id: row.selectedLotId,
        type: row.type,
        qty: requestEA,
        note: row.note || null,
        happened_at: workDateTimestamp(),
      });
      if (mErr) throw new Error(mErr.message);

      return { requestEA };
    }

    // 기존 FEFO 자동 로직 (변경 없음)
    const { error: rpcErr } = await supabase.rpc("fefo_issue_by_barcode", {
      p_barcode: row.barcode,
      p_type: row.type,
      p_qty_ea: requestEA,
      p_note: row.note || null,
      p_created_at: workDateTimestamp(),
    });

    if (!rpcErr) return { requestEA };

    // 폴백: FEFO 분할 insert
    const fefoLots = await pickFefoLots(row.barcode);
    if (fefoLots.length === 0)
      throw new Error(
        `출고/증정 가능한 재고가 없습니다. (재고 0) : ${row.barcode}`
      );

    const totalEA = fefoLots.reduce(
      (sum, r) => sum + intMin(r.stock_qty ?? 0, 0),
      0
    );
    if (requestEA > totalEA) {
      throw new Error(
        `재고 부족(${row.barcode}): 총 ${fmtInt(totalEA)}EA / 요청 ${fmtInt(
          requestEA
        )}EA`
      );
    }

    let remain = requestEA;
    const inserts: {
      lot_id: string;
      type: MovementType;
      qty: number;
      note?: string | null;
      created_at: string;
    }[] = [];

    for (const lot of fefoLots) {
      if (remain <= 0) break;
      const can = intMin(lot.stock_qty ?? 0, 0);
      if (can <= 0) continue;

      const use = Math.min(can, remain);
      inserts.push({
        lot_id: lot.lot_id,
        type: row.type,
        qty: use,
        note: row.note || null,
        created_at: workDateTimestamp(),
      });
      remain -= use;
    }

    if (remain !== 0) throw new Error(`FEFO 분할 차감 계산 오류(${row.barcode})`);

    const { error: mErr } = await supabase.from("movements").insert(inserts);
    if (mErr) throw new Error(mErr.message);

    return { requestEA };
  };

  // ✅ IN/DISCARD 저장 — 변경 없음
  const saveInDiscard = async (row: CartRow) => {
    if (!row.expiry) throw new Error(`소비기한 누락: ${row.barcode}`);
    if (!isValidDateYYYYMMDD(row.expiry))
      throw new Error(`소비기한 형식 오류: ${row.barcode} (${row.expiry})`);

    const eachQty = intMin(row.qty_ea, 1);

    const { data: lot, error: lErr } = await supabase
      .from("lots")
      .upsert(
        { variant_id: row.variantInfo.variant_id, expiry_date: row.expiry },
        { onConflict: "variant_id,expiry_date" }
      )
      .select("id")
      .single();

    if (lErr) throw new Error(lErr.message);

// saveInDiscard 함수 내 movements insert
const { error: mErr } = await supabase.from("movements").insert({
  lot_id: (lot as any).id,
  type: row.type,
  qty: eachQty,
  note: row.note || null,
  happened_at: workDateTimestamp(),  // ✅ created_at → happened_at 으로 변경
});

    if (mErr) throw new Error(mErr.message);

    return { eachQty };
  };

  const commitCart = async () => {
    setMsg(null);
    if (cart.length === 0) {
      setMsg("저장할 목록이 없습니다.");
      focusBarcode();
      return;
    }

    for (const r of cart) {
      if (r.type === "IN" || (r.type === "DISCARD" && !r.selectedLotId)) {
        if (!r.expiry) {
          setMsg(`소비기한이 비어있는 항목이 있습니다: ${r.barcode}`);
          return;
        }
        if (!isValidDateYYYYMMDD(r.expiry)) {
          setMsg(`소비기한 형식 오류: ${r.barcode} (${r.expiry})`);
          return;
        }
      }
      if (intMin(r.qty_ea, 1) <= 0) {
        setMsg(`수량이 1EA 이상이어야 합니다: ${r.barcode}`);
        return;
      }
    }

    setLoading(true);
    try {
      let okCount = 0;

      for (const row of cart) {
        if (row.type === "OUT" || row.type === "GIFT") {
          await issueOutGift(row);
        } else if (row.type === "DISCARD" && row.selectedLotId) {
          await issueOutGift(row);
        } else if (row.type === "CONVERT") {
          await issueOutGift(row); // 도눔(반제품) CONVERT OUT
        
          // 도눔(은박) 자동 IN
          const CONVERT_TARGET_BARCODE = "BO202604220021";
          const targetResolved = await resolveVariantInfo(CONVERT_TARGET_BARCODE);
          if (!targetResolved) throw new Error("재고전환 대상 제품(도눔(은박))을 찾을 수 없습니다. 품목관리에서 확인해주세요.");
        
          await saveInDiscard({
            id: uid(),
            type: "IN",
            barcode: targetResolved.code,
            expiry: row.expiry,
            qty_ea: row.qty_ea,
            note: row.note || "재고전환 자동입고",
            variantInfo: targetResolved.vInfo,
          });
        }
        } else {
          await saveInDiscard(row);
        }
        okCount += 1;
      }

      setMsg(`일괄 저장 완료 ✅ ${okCount}건 (작업일자: ${workDate})`);
      setCart([]);
      focusBarcode();
    } catch (e: any) {
      setMsg(e?.message ?? "일괄 저장 중 오류");
      focusBarcode();
    } finally {
      setLoading(false);
    }
  };

  const scanStateRef = useRef<{
    buf: string;
    startedAt: number;
    lastAt: number;
    activeEl: HTMLInputElement | HTMLTextAreaElement | null;
    snapshotValue: string | null;
    snapshotSelStart: number | null;
    snapshotSelEnd: number | null;
  }>({
    buf: "",
    startedAt: 0,
    lastAt: 0,
    activeEl: null,
    snapshotValue: null,
    snapshotSelStart: null,
    snapshotSelEnd: null,
  });

  useEffect(() => {
    const RESET_GAP_MS = 120;
    const MAX_TOTAL_MS = 900;
    const MIN_LEN = 6;

    const reset = () => {
      scanStateRef.current.buf = "";
      scanStateRef.current.startedAt = 0;
      scanStateRef.current.lastAt = 0;
      scanStateRef.current.activeEl = null;
      scanStateRef.current.snapshotValue = null;
      scanStateRef.current.snapshotSelStart = null;
      scanStateRef.current.snapshotSelEnd = null;
    };

    const restoreDomIfNeeded = () => {
      const st = scanStateRef.current;
      const el = st.activeEl;
      if (!el) return;
      if (st.snapshotValue == null) return;

      try {
        el.value = st.snapshotValue;
        if (
          typeof st.snapshotSelStart === "number" &&
          typeof st.snapshotSelEnd === "number"
        ) {
          el.setSelectionRange(st.snapshotSelStart, st.snapshotSelEnd);
        }
      } catch {
        // ignore
      }
    };

    const restoreStateIfNeeded = () => {
      const st = scanStateRef.current;
      const el = st.activeEl as any;
      if (!el) return;
      if (st.snapshotValue == null) return;

      const cartId = el?.dataset?.cartId;
      const cartField = el?.dataset?.cartField;

      if (cartId && cartField) {
        setCart((prev) =>
          prev.map((x) => {
            if (x.id !== cartId) return x;
            if (cartField === "note")
              return { ...x, note: st.snapshotValue ?? "" };
            if (cartField === "expiry")
              return { ...x, expiry: st.snapshotValue ?? "" };
            if (cartField === "qty_ea") {
              const n = parseInt(st.snapshotValue || "1", 10);
              return { ...x, qty_ea: intMin(n, 1) };
            }
            return x;
          })
        );
      }

      const topField = el?.dataset?.topField;
      if (topField) {
        if (topField === "note") setNote(st.snapshotValue ?? "");
        if (topField === "expiry") setExpiry(st.snapshotValue ?? "");
        if (topField === "qtyEa") {
          const n = parseInt(st.snapshotValue || "", 10);
          setQtyEa(Number.isFinite(n) && n >= 1 ? n : "");
        }
      }
    };

    const looksLikeScanner = (st: typeof scanStateRef.current, now: number) => {
      const total = now - st.startedAt;
      if (st.buf.length < MIN_LEN) return false;
      if (total > MAX_TOTAL_MS) return false;

      const gap = now - st.lastAt;
      if (gap > RESET_GAP_MS) return false;

      return true;
    };

    const handler = (e: KeyboardEvent) => {
      if (e.isComposing) return;

      const key = e.key;
      if (key === "Shift" || key === "Alt" || key === "Control" || key === "Meta")
        return;

      const now = Date.now();
      const st = scanStateRef.current;

      const active = document.activeElement;
      const isBarcodeFocused = active === barcodeRef.current;

      const isProductSearchFocused = active === productSearchRef.current;
      if (isProductSearchFocused) return;

      if (st.buf && now - st.lastAt > RESET_GAP_MS) reset();

      if (key.length === 1) {
        if (!st.buf) {
          st.startedAt = now;
          st.activeEl =
            !isBarcodeFocused && isEditableInput(active) ? (active as any) : null;

          if (st.activeEl) {
            st.snapshotValue = st.activeEl.value;
            st.snapshotSelStart = st.activeEl.selectionStart;
            st.snapshotSelEnd = st.activeEl.selectionEnd;
          }
        }

        st.buf += key;
        st.lastAt = now;
        return;
      }

      if (key === "Enter") {
        if (isBarcodeFocused) {
          reset();
          return;
        }

        const rawCode = st.buf;
        const code = normalizeBarcode(rawCode);
        const isScan = code && looksLikeScanner(st, now);

        if (isScan) {
          e.preventDefault();
          e.stopPropagation();

          restoreDomIfNeeded();
          restoreStateIfNeeded();

          const cands = barcodeCandidates(code);
          const first = cands[0] ?? code;

          if (type === "IN" || type === "DISCARD") {
            setBarcode(first);
            focusQty();
            reset();
            return;
          }

          setBarcode(first);
          void addToCart(first);

          focusBarcode();
          reset();
          return;
        }

        reset();
        return;
      }

      if (key === "Escape") reset();
    };

    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, qtyEa, expiry, note, barcode]);

  const cartTotalLines = cart.length;

  const pageBg = "min-h-screen bg-slate-50 text-slate-900";
  const card = "rounded-2xl border border-slate-200 bg-white shadow-sm";
  const input =
    "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300";
  const select =
    "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300";
  const btn =
    "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50 active:bg-slate-100 disabled:opacity-60";
  const btnOn =
    "rounded-xl border border-blue-600/20 bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 active:bg-blue-800 disabled:opacity-60";
  const btnLg =
    "rounded-xl border border-slate-200 bg-white px-4 py-2 hover:bg-slate-50 active:bg-slate-100 disabled:opacity-60";
  const btnOnLg =
    "rounded-xl border border-blue-600/20 bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 active:bg-blue-800 disabled:opacity-60";
  const tableWrap =
    "mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white";
  const thead = "bg-slate-50 text-xs font-semibold text-slate-600";
  const tr = "border-t border-slate-200";
  const msgBox =
    "rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700";

  const isWorkDateToday = workDate === today;

  return (
    <div className={`${pageBg} p-6`}>
      {showNewWoModal && newWoNotifications.length > 0 && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-[480px] rounded-2xl border border-orange-200 bg-white shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between gap-3 bg-orange-500 px-5 py-4">
              <div className="flex items-center gap-2">
                <span className="text-2xl animate-bounce">🔔</span>
                <div><div className="text-base font-bold text-white">새 작업지시서 도착!</div><div className="text-xs text-orange-100">새 주문이 등록됐습니다</div></div>
              </div>
              <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-sm font-bold text-white">{newWoNotifications.length}건</span>
            </div>
            <div className="max-h-[320px] overflow-y-auto divide-y divide-slate-100">
              {newWoNotifications.map((n, idx) => (
                <div key={n.id} className="px-5 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-slate-800 truncate">{n.client_name}</div>
                      <div className="text-sm text-slate-600 truncate mt-0.5">{n.product_name}</div>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        <span className="text-[11px] text-slate-400 font-mono">{n.work_order_no}</span>
                        <span className="text-[11px] text-slate-400">· 주문일 {n.order_date}</span>
                      </div>
                    </div>
                    {idx === 0 && <span className="shrink-0 rounded-full bg-orange-100 border border-orange-200 px-2 py-0.5 text-[11px] font-semibold text-orange-700">NEW</span>}
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t border-slate-100 px-5 py-3 flex gap-2">
              <button className="flex-1 rounded-xl bg-orange-500 py-2.5 text-sm font-bold text-white hover:bg-orange-600" onClick={() => { setShowNewWoModal(false); setNewWoNotifications([]); }}>확인 ({newWoNotifications.length}건)</button>
              <button className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50" onClick={() => setShowNewWoModal(false)}>나중에</button>
            </div>
          </div>
        </div>
      )}

      <h1 className="text-2xl font-semibold">스캔 입력</h1>
      <p className="mt-2 text-slate-600">
        - 모든 유형(입고/출고/증정/폐기): 수량은 "EA(낱개)" 기준으로 입력
        <br />
        - 입고/폐기: 소비기한 입력 필요 / 출고/증정: 선입선출 소비기한 자동 선택
        <br />- ✅ 스캐너 입력은 어떤 칸에 커서가 있어도 바코드로 처리됩니다.
        (비고 포함)
      </p>

      <div className="mt-6 grid max-w-3xl gap-3">

        {/* ✅ 작업일자 선택 */}
        <div className={`${card} p-4`}>
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm font-medium text-slate-700 whitespace-nowrap">📅 작업일자</label>
            <input
              type="date"
              className={[
                "rounded-xl border px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20",
                !isWorkDateToday
                  ? "border-orange-400 bg-orange-50 focus:border-orange-400 focus:ring-orange-500/20"
                  : "border-slate-200 bg-white focus:border-blue-300",
              ].join(" ")}
              value={workDate}
              max={today}
              onChange={(e) => setWorkDate(e.target.value || today)}
            />
            {!isWorkDateToday && (
              <>
                <span className="text-xs font-semibold text-orange-600">
                  ⚠ 오늘({today})이 아닌 날짜로 저장됩니다
                </span>
                <button
                  type="button"
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50 active:bg-slate-100"
                  onClick={() => setWorkDate(today)}
                >
                  오늘로 초기화
                </button>
              </>
            )}
            {isWorkDateToday && (
              <span className="text-xs text-slate-400">기본값: 오늘</span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="md:col-span-2">
            <label className="text-sm text-slate-600">바코드</label>
            <input
              ref={barcodeRef}
              className={input}
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addToCart();
                }
              }}
              placeholder="스캐너로 찍거나 직접 입력 (Enter=목록추가)"
            />

            <div ref={productSuggestWrapRef} className="relative mt-2">
              <input
                ref={productSearchRef}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300"
                value={productSearch}
                placeholder="제품명으로 검색해서 바코드 선택"
                onChange={async (e) => {
                  const v = e.target.value;
                  setProductSearch(v);
                  setProductSuggestActive(-1);
                  setProductSuggestOpen(true);
                  await loadProductSuggestions(v);
                }}
                onFocus={async () => {
                  setProductSuggestOpen(true);
                  if (productSearch.trim()) {
                    await loadProductSuggestions(productSearch);
                  }
                }}
                onBlur={() => setTimeout(() => setProductSuggestOpen(false), 150)}
                onKeyDown={(e) => {
                  if (!productSuggestOpen || productSuggestions.length === 0) return;
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setProductSuggestActive((i) => Math.min(i + 1, productSuggestions.length - 1));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setProductSuggestActive((i) => Math.max(i - 1, 0));
                  } else if (e.key === "Enter") {
                    if (productSuggestActive >= 0) {
                      e.preventDefault();
                      selectProductSuggestion(productSuggestions[productSuggestActive]);
                    }
                  } else if (e.key === "Escape") {
                    setProductSuggestOpen(false);
                  }
                }}
              />
              {productSuggestOpen && productSuggestions.length > 0 && (
                <div className="absolute z-50 mt-1 w-full rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden">
                  <div className="max-h-64 overflow-y-auto">
                    {productSuggestions.map((item, idx) => {
                      const displayName = getDisplayName(item.variant_name, item.product_name, item.product_category);
                      return (
                        <button
                          key={`${item.variant_id}-${idx}`}
                          type="button"
                          className={[
                            "w-full text-left px-3 py-2.5 text-sm border-b border-slate-100 last:border-0",
                            idx === productSuggestActive
                              ? "bg-blue-600 text-white"
                              : "hover:bg-slate-50 text-slate-800",
                          ].join(" ")}
                          onMouseEnter={() => setProductSuggestActive(idx)}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => selectProductSuggestion(item)}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <span className="font-medium truncate">{displayName}</span>
                              {item.food_type && (
                                <span className={[
                                  "ml-1.5 text-xs",
                                  idx === productSuggestActive ? "text-blue-100" : "text-slate-400",
                                ].join(" ")}>
                                  {item.food_type}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {item.product_category && (
                                <span className={[
                                  "text-[11px] rounded px-1.5 py-0.5",
                                  idx === productSuggestActive
                                    ? "bg-blue-500 text-white"
                                    : "bg-slate-100 text-slate-500",
                                ].join(" ")}>
                                  {item.product_category}
                                </span>
                              )}
                              <span className={[
                                "font-mono text-xs",
                                idx === productSuggestActive ? "text-blue-100" : "text-slate-400",
                              ].join(" ")}>
                                {item.barcode}
                              </span>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {normalizeBarcode(barcode) && (
              <div className={`${card} mt-2 p-3 text-sm`}>
                {variantInfo ? (
                  <div className="flex flex-col gap-1">
                    <div className="text-slate-800">
                      <span className="text-slate-500">제품명:</span>{" "}
                      <span className="font-semibold">
                        {variantInfo.product_name || "-"}
                      </span>
                    </div>
                    <div className="text-slate-700">
                      <span className="text-slate-500">옵션:</span>{" "}
                      {variantInfo.variant_name || "-"}
                    </div>
                    <div className="text-slate-700">
                      <span className="text-slate-500">바코드:</span>{" "}
                      {variantInfo.barcode}
                    </div>
                    <div className="text-slate-700">
                      <span className="text-slate-500">참고(포장단위):</span>{" "}
                      {variantInfo.pack_unit} EA/BOX
                    </div>
                    {lots.length === 0 && (
                      <div className="mt-1 text-slate-500">
                        ※ 등록은 되어있지만, 아직 입고(소비기한 LOT)가 없습니다.
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-slate-600">
                    바코드{" "}
                    <span className="text-slate-900">
                      {normalizeBarcode(barcode)}
                    </span>{" "}
                    조회 중… 또는 등록되지 않았습니다.
                  </div>
                )}
              </div>
            )}
          </div>

          <div className={`${card} p-4`}>
            <div className="text-sm text-slate-600">스캔 목록</div>
            <div className="mt-1 text-2xl font-semibold">{cartTotalLines}건</div>

            <div className="mt-3 flex gap-2">
              <button
                className={btnOn}
                disabled={loading || cart.length === 0}
                onClick={commitCart}
              >
                {loading ? "저장 중..." : "일괄 저장"}
              </button>
              <button
                className={btn}
                disabled={loading || cart.length === 0}
                onClick={() => {
                  setCart([]);
                  setMsg("스캔 목록을 비웠습니다.");
                  focusBarcode();
                }}
              >
                목록 비우기
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div>
            <label className="text-sm text-slate-600">유형</label>
            <select
              className={select}
              value={type}
              onChange={(e) => setType(e.target.value as MovementType)}
            >
              <option value="IN">입고(IN)</option>
              <option value="OUT">출고(OUT)</option>
              <option value="DISCARD">폐기(DISCARD)</option>
              <option value="GIFT">증정(GIFT)</option>
              <option value="CONVERT">재고전환(CONVERT)</option>
            </select>
          </div>

          <div>
            <label className="text-sm text-slate-600">수량(EA)</label>
            <input
              ref={qtyRef}
              data-top-field="qtyEa"
              className={[
                "mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20",
                qtyEa === ""
                  ? "border-red-300 focus:border-red-400 focus:ring-red-500/20"
                  : "border-slate-200 focus:border-blue-300",
              ].join(" ")}
              type="number"
              min={1}
              // ▼ 추가: LOT 직접 지정 시 해당 LOT 재고를 max로 제한
              max={selectedLotMaxQty}
              value={qtyEa}
              placeholder="수량 입력"
              onChange={(e) => {
                const v = e.target.value;
                if (v === "") { setQtyEa(""); return; }
                const n = parseInt(v, 10);
                setQtyEa(Number.isFinite(n) && n >= 1 ? n : "");
              }}
            />
            {qtyEa === "" && (
              <div className="mt-1 text-xs text-red-500">⚠ 수량을 입력하세요. (1 이상)</div>
            )}
            {/* ▼ 추가: LOT 직접 지정 시 최대 수량 안내 */}
            {qtyEa !== "" && selectedLotMaxQty !== undefined && (
              <div className="mt-1 text-xs text-amber-600">
                ⚠ 선택 LOT 최대 {fmtInt(selectedLotMaxQty)}EA
              </div>
            )}
            {qtyEa !== "" && selectedLotMaxQty === undefined && (
              <div className="mt-1 text-xs text-slate-500">
                저장/재고 계산 기준: <span className="text-slate-900">EA(낱개)</span>
              </div>
            )}
          </div>

          <div className="md:col-span-2">
            <div className="mb-1 flex items-center justify-between">
              <label className="text-sm text-slate-600">
                소비기한 (YYYY-MM-DD)
                {expiryDisabled && (
                  <span className="ml-2 text-xs text-slate-500">
                    (출고/증정은 자동 선택)
                  </span>
                )}
              </label>
              {!expiryDisabled && (
                <button
                  type="button"
                  className="rounded-lg border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-200 active:bg-slate-300"
                  onClick={() => {
                    const d = new Date();
                    d.setFullYear(d.getFullYear() + 1);
                    d.setDate(d.getDate() - 1);
                    const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                    setExpiry(ymd);
                  }}
                >
                  +1년-1일
                </button>
              )}
            </div>
            <input
              data-top-field="expiry"
              className={[
                "w-full rounded-xl border bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20",
                expiryDisabled
                  ? "border-slate-200 text-slate-400"
                  : "border-slate-200 focus:border-blue-300",
              ].join(" ")}
              type="date"
              disabled={expiryDisabled}
              value={expiry}
              onChange={(e) => setExpiry(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className="text-sm text-slate-600">비고(선택)</label>
          <input
            data-top-field="note"
            className={input}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="예: 샘플 입고/출고"
          />
        </div>

        {msg && <div className={msgBox}>{msg}</div>}

        <div className="flex flex-wrap gap-2">
          <button className={btnOnLg} disabled={loading} onClick={() => addToCart()}>
            목록에 추가
          </button>

          <button
            className={btnLg}
            onClick={() => searchLotsByCode(barcode)}
            disabled={loading}
          >
            바코드로 재고 조회
          </button>

          <a className={btnLg} href="/">
            홈
          </a>
        </div>
      </div>

      {/* 스캔 목록 */}
      <div className="mt-10">
        <h2 className="text-lg font-semibold">스캔 목록 (최종 확인 후 일괄 저장)</h2>

        <div className={tableWrap}>
          <table className="w-full text-sm">
            <thead className={thead}>
              <tr>
                <th className="p-3 text-left">유형</th>
                <th className="p-3 text-left">구분</th>
                <th className="p-3 text-left">제품명</th>
                <th className="p-3 text-left">식품유형</th>
                <th className="p-3 text-right">수량(EA)</th>
                <th className="p-3 text-left">소비기한</th>
                <th className="p-3 text-left">바코드</th>
                <th className="p-3 text-left">비고</th>
                <th className="p-3 text-right">삭제</th>
              </tr>
            </thead>
            <tbody>
              {cart.length === 0 ? (
                <tr>
                  <td className="p-3 text-slate-500" colSpan={9}>
                    스캔한 항목이 없습니다. (Enter 또는 "목록에 추가"로 누적됩니다)
                  </td>
                </tr>
              ) : (
                cart.map((r) => {
                  const needExpiry = r.type === "IN" || (r.type === "DISCARD" && !r.selectedLotId);
                  const expiryOk = !needExpiry || isValidDateYYYYMMDD(r.expiry);

                  return (
                    <tr key={r.id} className={`${tr} align-top`}>
                      <td className="p-3">{r.type}</td>
                      <td className="p-3">{r.variantInfo.product_category ?? "-"}</td>
                      <td className="p-3">{r.variantInfo.product_name}</td>
                      <td className="p-3">{r.variantInfo.food_type ?? "-"}</td>

                      <td className="p-3 text-right">
                        <input
                          data-cart-id={r.id}
                          data-cart-field="qty_ea"
                          className="w-28 rounded-lg border border-slate-200 bg-white px-2 py-1 text-right text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300"
                          type="number"
                          min={1}
                          value={r.qty_ea}
                          onChange={(e) => {
                            const v = parseInt(e.target.value || "1", 10);
                            setCart((prev) =>
                              prev.map((x) =>
                                x.id === r.id ? { ...x, qty_ea: intMin(v, 1) } : x
                              )
                            );
                          }}
                        />
                        <div className="mt-1 text-xs text-slate-500">
                          {fmtInt(r.qty_ea)} EA
                        </div>
                      </td>

                      <td className="p-3">
                        {needExpiry ? (
                          <input
                            data-cart-id={r.id}
                            data-cart-field="expiry"
                            className={[
                              "w-40 rounded-lg border bg-white px-2 py-1 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20",
                              expiryOk
                                ? "border-slate-200 focus:border-blue-300"
                                : "border-red-300 focus:border-red-400",
                            ].join(" ")}
                            type="date"
                            value={r.expiry}
                            onChange={(e) => {
                              const v = e.target.value;
                              setCart((prev) =>
                                prev.map((x) =>
                                  x.id === r.id ? { ...x, expiry: v } : x
                                )
                              );
                            }}
                          />
                        ) : r.selectedLotId ? (
                          // ▼ 추가: LOT 직접 지정인 경우 소비기한 표시
                          <span className="text-slate-700 font-mono text-xs">
                            {lots.find((l) => l.lot_id === r.selectedLotId)?.expiry_date ?? "LOT 지정"}
                          </span>
                        ) : (
                          <span className="text-slate-400">자동(FEFO)</span>
                        )}
                      </td>

                      <td className="p-3">{r.barcode}</td>

                      <td className="p-3">
                        <input
                          data-cart-id={r.id}
                          data-cart-field="note"
                          className="w-56 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300"
                          value={r.note}
                          onChange={(e) => {
                            const v = e.target.value;
                            setCart((prev) =>
                              prev.map((x) => (x.id === r.id ? { ...x, note: v } : x))
                            );
                          }}
                          placeholder="비고"
                        />
                      </td>

                      <td className="p-3 text-right">
                        <button
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs hover:bg-slate-50 active:bg-slate-100"
                          onClick={() => setCart((prev) => prev.filter((x) => x.id !== r.id))}
                        >
                          삭제
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex gap-2">
          <button className={btnOnLg} disabled={loading || cart.length === 0} onClick={commitCart}>
            {loading ? "저장 중..." : "일괄 저장"}
          </button>

          <button
            className={btnLg}
            disabled={loading || cart.length === 0}
            onClick={() => {
              setCart([]);
              setMsg("스캔 목록을 비웠습니다.");
              focusBarcode();
            }}
          >
            목록 비우기
          </button>
        </div>

        <div className="mt-2 text-xs text-slate-500">
          ※ 수량/재고/저장 계산은 모두 <span className="text-slate-900">EA(낱개)</span> 기준입니다. OUT/GIFT는 FEFO로 자동 차감됩니다.
        </div>
      </div>

      {/* 재고 테이블 — LOT 선택 UI 추가 */}
      <div className="mt-10" ref={lotsSectionRef}>
        <h2 className="text-lg font-semibold">해당 바코드 LOT 재고</h2>

        <div className={tableWrap}>
          <table className="w-full text-sm">
            <thead className={thead}>
              <tr>
                {/* ▼ 추가: LOT 선택 가능한 유형일 때 선택 컬럼 표시 */}
                {isLotSelectable && (
                  <th className="p-3 text-left w-10">선택</th>
                )}
                <th className="p-3 text-left">제품명</th>
                <th className="p-3 text-left">구분</th>
                <th className="p-3 text-left">소비기한</th>
                <th className="p-3 text-right">재고(EA)</th>
                {/* ▼ 추가: 전량 버튼 컬럼 */}
                {isLotSelectable && (
                  <th className="p-3 text-center">전량 출고</th>
                )}
              </tr>
            </thead>
            <tbody>
              {lots.length === 0 ? (
                <tr>
                  <td className="p-3 text-slate-500" colSpan={isLotSelectable ? 6 : 4}>
                    바코드를 스캔하면 자동으로 조회됩니다. (재고 0 LOT은 표시되지 않습니다)
                  </td>
                </tr>
              ) : (
                <>
                  {/* ▼ 추가: 자동(FEFO) 선택 행 */}
                  {isLotSelectable && (
                    <tr className={tr}>
                      <td className="p-3">
                        <input
                          type="radio"
                          name="lot-select"
                          checked={selectedLotId === "AUTO"}
                          onChange={() => {
                            setSelectedLotId("AUTO");
                            setQtyEa("");
                          }}
                          className="accent-blue-600"
                        />
                      </td>
                      <td className="p-3 text-slate-500 italic" colSpan={3}>
                        자동(FEFO) — 소비기한 빠른 순으로 자동 차감
                      </td>
                      <td className="p-3 text-right text-slate-400">
                        {fmtInt(lots.reduce((s, l) => s + intMin(l.stock_qty, 0), 0))} EA 합계
                      </td>
                      <td className="p-3" />
                    </tr>
                  )}
                  {lots.map((r) => {
                    const isSelected = selectedLotId === r.lot_id;
                    return (
                      <tr
                        key={r.lot_id}
                        className={[
                          tr,
                          isLotSelectable && isSelected
                            ? "bg-blue-50"
                            : "",
                        ].join(" ")}
                      >
                        {/* ▼ 추가: 라디오 선택 */}
                        {isLotSelectable && (
                          <td className="p-3">
                            <input
                              type="radio"
                              name="lot-select"
                              checked={isSelected}
                              onChange={() => {
                                setSelectedLotId(r.lot_id);
                                setQtyEa("");
                              }}
                              className="accent-blue-600"
                            />
                          </td>
                        )}
                        <td className="p-3">{r.product_name}</td>
                        <td className="p-3">{r.product_category ?? "-"}</td>
                        <td className={[
                          "p-3 font-mono",
                          isLotSelectable && isSelected ? "font-semibold text-blue-700" : "",
                        ].join(" ")}>
                          {r.expiry_date}
                        </td>
                        <td className="p-3 text-right">
                          {fmtInt(intMin(r.stock_qty ?? 0, 0))}
                          {isLotSelectable && isSelected && (
                            <span className="ml-1 text-xs text-blue-600">← 선택됨</span>
                          )}
                        </td>
                        {/* ▼ 추가: 전량 버튼 */}
                        {isLotSelectable && (
                          <td className="p-3 text-center">
                            <button
                              type="button"
                              className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100 active:bg-amber-200 disabled:opacity-40"
                              disabled={loading || intMin(r.stock_qty, 0) <= 0}
                              onClick={() => handleFullQty(r)}
                            >
                              전량 ({fmtInt(intMin(r.stock_qty, 0))}EA)
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </>
              )}
            </tbody>
          </table>
        </div>

        {variantInfo && (
          <div className="mt-2 text-xs text-slate-500">
            ※ 참고사항(품목 등록값): ea/box={variantInfo.pack_unit} (현재 화면/저장은 EA만 사용)
          </div>
        )}
        {/* ▼ 추가: LOT 선택 안내 */}
        {isLotSelectable && (
          <div className="mt-1 text-xs text-slate-500">
            ※ 출고/증정/폐기 시 특정 소비기한 LOT을 직접 선택할 수 있습니다. 선택한 LOT의 재고 수량 범위 내에서만 출고 가능합니다.
          </div>
        )}
      </div>
    </div>
  );
}
