"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

function codeToAscii(code: string, shift: boolean, caps: boolean) {
  const upper = shift !== caps;
  if (code.startsWith("Numpad")) {
    const n = code.replace("Numpad", "");
    if (/^\d$/.test(n)) return n;
  }
  if (code.startsWith("Key")) {
    const ch = code.slice(3);
    return upper ? ch : ch.toLowerCase();
  }
  if (code.startsWith("Digit")) return code.slice(5);
  if (code === "Minus") return shift ? "_" : "-";
  return null;
}

type VariantRow = {
  variant_id: string;
  product_id: string;
  product_name: string;       // products.name (내부용)
  product_category: string | null;
  product_food_type: string | null;
  variant_name: string;       // 화면 표시용 제품명
  barcode: string;
  pack_unit: number;
  pack_ea: number | null;
  weight_g: number | null;
  unit_type: string | null;
};

const CATEGORIES = ["기성", "업체", "전사지", "기타"] as const;

function hangulToQwerty(input: string) {
  const CONS: Record<string, string> = { ㄱ:"r",ㄲ:"R",ㄴ:"s",ㄷ:"e",ㄸ:"E",ㄹ:"f",ㅁ:"a",ㅂ:"q",ㅃ:"Q",ㅅ:"t",ㅆ:"T",ㅇ:"d",ㅈ:"w",ㅉ:"W",ㅊ:"c",ㅋ:"z",ㅌ:"x",ㅍ:"v",ㅎ:"g" };
  const VOW: Record<string, string> = { ㅏ:"k",ㅐ:"o",ㅑ:"i",ㅒ:"O",ㅓ:"j",ㅔ:"p",ㅕ:"u",ㅖ:"P",ㅗ:"h",ㅘ:"hk",ㅙ:"ho",ㅚ:"hl",ㅛ:"y",ㅜ:"n",ㅝ:"nj",ㅞ:"np",ㅟ:"nl",ㅠ:"b",ㅡ:"m",ㅢ:"ml",ㅣ:"l" };
  const JONG: Record<string, string> = { "":"",ㄱ:"r",ㄲ:"R",ㄳ:"rt",ㄴ:"s",ㄵ:"sw",ㄶ:"sg",ㄷ:"e",ㄹ:"f",ㄺ:"fr",ㄻ:"fa",ㄼ:"fq",ㄽ:"ft",ㄾ:"fx",ㄿ:"fv",ㅀ:"fg",ㅁ:"a",ㅂ:"q",ㅄ:"qt",ㅅ:"t",ㅆ:"T",ㅇ:"d",ㅈ:"w",ㅊ:"c",ㅋ:"z",ㅌ:"x",ㅍ:"v",ㅎ:"g" };
  const CHO = ["ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];
  const JUNG = ["ㅏ","ㅐ","ㅑ","ㅒ","ㅓ","ㅔ","ㅕ","ㅖ","ㅗ","ㅘ","ㅙ","ㅚ","ㅛ","ㅜ","ㅝ","ㅞ","ㅟ","ㅠ","ㅡ","ㅢ","ㅣ"];
  const JONG_LIST = ["","ㄱ","ㄲ","ㄳ","ㄴ","ㄵ","ㄶ","ㄷ","ㄹ","ㄺ","ㄻ","ㄼ","ㄽ","ㄾ","ㄿ","ㅀ","ㅁ","ㅂ","ㅄ","ㅅ","ㅆ","ㅇ","ㅈ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];
  const out: string[] = [];
  for (const ch of input) {
    if (CONS[ch]) { out.push(CONS[ch]); continue; }
    if (VOW[ch]) { out.push(VOW[ch]); continue; }
    const code = ch.charCodeAt(0);
    if (code >= 0xac00 && code <= 0xd7a3) {
      const sIndex = code - 0xac00;
      const cho = Math.floor(sIndex / (21 * 28));
      const jung = Math.floor((sIndex % (21 * 28)) / 28);
      const jong = sIndex % 28;
      out.push(CONS[CHO[cho]] ?? ""); out.push(VOW[JUNG[jung]] ?? ""); out.push(JONG[JONG_LIST[jong]] ?? "");
      continue;
    }
    out.push(ch);
  }
  return out.join("");
}

// ✅ variant_name이 unit_type 값이면 product_name으로 대체
function getDisplayName(variant_name: string, product_name: string): string {
  const unitTypes = ["EA", "BOX", "ea", "box", ""];
  if (unitTypes.includes((variant_name ?? "").trim())) return product_name;
  return variant_name;
}

export default function ProductsClient() {
  const supabase = useMemo(() => createClient(), []);
  const barcodeRef = useRef<HTMLInputElement>(null);
  const [isScanMode, setIsScanMode] = useState(false);
  const SCAN_GAP_MS = 200;
  const lastKeyAtRef = useRef<number>(0);
  const [vnOpen, setVnOpen] = useState(false);
  const [vnItems, setVnItems] = useState<string[]>([]);
  const [vnActive, setVnActive] = useState<number>(-1);
  const vnWrapRef = useRef<HTMLDivElement>(null);

  const [msg, setMsg] = useState<string | null>(null);
  const [productName, setProductName] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number] | "">("기성");
  const [variantName, setVariantName] = useState("");
  const [barcode, setBarcode] = useState("");
  const [packUnit, setPackUnit] = useState<number>(100);
  const [weightG, setWeightG] = useState<number>(3);

  const [rows, setRows] = useState<VariantRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");

  const [rowBarcodeDraft, setRowBarcodeDraft] = useState<Record<string, string>>({});
  const [rowBarcodeEditOpen, setRowBarcodeEditOpen] = useState<Record<string, boolean>>({});

  const [rowMetaEditOpen, setRowMetaEditOpen] = useState<Record<string, boolean>>({});
  const [rowMetaDraft, setRowMetaDraft] = useState<Record<string, {
    variant_name: string;   // ✅ 화면 표시/수정용 (variant_name 기준)
    category: (typeof CATEGORIES)[number] | "";
    food_type: string;
    weight_g: string;
    pack_ea: string;
  }>>({});

  const [listCategory, setListCategory] = useState<"" | (typeof CATEGORIES)[number]>("");
  const [showTop, setShowTop] = useState(false);

  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 400);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll as any);
  }, []);

  const loadVariantSuggest = async (keyword: string) => {
    const k = keyword.trim();
    if (k.length < 1) {
      const recent = Array.from(new Set(rows.map((r) => r.product_food_type ?? "").filter(Boolean))).slice(0, 10);
      setVnItems(recent); return;
    }
    if (k.length >= 2) {
      const { data, error } = await supabase.from("products").select("food_type").ilike("food_type", `%${k}%`).order("created_at", { ascending: false }).limit(12);
      if (!error) { setVnItems(Array.from(new Set((data ?? []).map((d: any) => d.food_type).filter(Boolean)))); return; }
    }
    setVnItems(Array.from(new Set(rows.map((r) => r.product_food_type ?? "").filter(Boolean).filter((x) => x.toLowerCase().includes(k.toLowerCase())))).slice(0, 12));
  };

  const normalizeBarcode = (raw: string) => {
    let t = raw || "";
    if (/[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(t)) t = hangulToQwerty(t);
    return t.trim().replace(/[\u2010\u2011\u2012\u2013\u2014\u2212]/g, "-").toUpperCase().replace(/\s+/g, "").replace(/[^0-9A-Z_-]/g, "");
  };

  const findAnyBarcodeUsage = async (bc: string) => {
    const { data: bData, error: bErr } = await supabase.from("product_barcodes").select("id, variant_id, is_active, is_primary, created_at, product_variants!inner(id)").eq("barcode", bc);
    if (bErr) throw bErr;
    const activePrimary = (bData ?? []).filter((b: any) => b?.is_primary === true && b?.is_active === true);
    if (activePrimary.length > 0) {
      const picked = [...activePrimary].sort((a: any, b: any) => {
        const at = a?.created_at ? new Date(a.created_at).getTime() : 0;
        const bt = b?.created_at ? new Date(b.created_at).getTime() : 0;
        return bt - at;
      })[0];
      return { source: "product_barcodes" as const, variant_id: picked.variant_id as string };
    }
    const { data: vData, error: vErr } = await supabase.from("product_variants").select("id, barcode").eq("barcode", bc).maybeSingle();
    if (vErr) throw vErr;
    if (vData?.id && vData?.barcode && !String(vData.barcode).startsWith("AUTO-")) {
      return { source: "product_variants" as const, variant_id: vData.id as string };
    }
    return null;
  };

  const alertDuplicateBarcode = async (bc: string, existVariantId: string) => {
    let existProductName = "";
    try {
      const { data: v, error: vErr } = await supabase.from("product_variants").select("id, variant_name").eq("id", existVariantId).maybeSingle();
      if (!vErr) existProductName = (v as any)?.variant_name ?? "";
    } catch {}
    alert("⚠️ 이미 등록된 바코드입니다.\n\n" + `바코드: ${bc}\n` + (existProductName ? `기존 제품: ${existProductName}\n` : "") + "\n다른 바코드를 입력해 주세요.");
  };

  const saveVariantBarcode = async (variant_id: string, draftRaw: string) => {
    setMsg(null);
    const bc = normalizeBarcode(draftRaw || "");
    if (!bc) { setMsg("바코드를 입력하세요."); return; }
    setLoading(true);
    try {
      const existAny = await findAnyBarcodeUsage(bc);
      if (existAny && existAny.variant_id !== variant_id) { await alertDuplicateBarcode(bc, existAny.variant_id); return; }
      const { error: unPrimaryErr } = await supabase.from("product_barcodes").update({ is_primary: false }).eq("variant_id", variant_id);
      if (unPrimaryErr) throw unPrimaryErr;
      const { error: vUpdErr } = await supabase.from("product_variants").update({ barcode: bc }).eq("id", variant_id);
      if (vUpdErr) throw vUpdErr;
      const { data: existSame, error: existSameErr } = await supabase.from("product_barcodes").select("id, variant_id, is_active, is_primary, created_at").eq("barcode", bc).eq("variant_id", variant_id).maybeSingle();
      if (existSameErr) throw existSameErr;
      if (existSame?.id) {
        const { error: bcUpdErr } = await supabase.from("product_barcodes").update({ is_primary: true, is_active: true }).eq("id", existSame.id);
        if (bcUpdErr) throw bcUpdErr;
      } else {
        const { error: bcInsErr } = await supabase.from("product_barcodes").insert({ variant_id, barcode: bc, is_primary: true, is_active: true });
        if (bcInsErr) throw bcInsErr;
      }
      setRowBarcodeDraft((prev) => { const next = { ...prev }; delete next[variant_id]; return next; });
      setRowBarcodeEditOpen((prev) => { const next = { ...prev }; delete next[variant_id]; return next; });
      setMsg("바코드가 저장되었습니다 ✅");
      await load();
    } catch (e: any) { setMsg(e?.message ?? "저장 중 오류"); }
    finally { setLoading(false); }
  };

  const load = async () => {
    setMsg(null);
    const { data: vData, error: vErr } = await supabase.from("product_variants").select("id, variant_name, barcode, pack_unit, pack_ea, weight_g, unit_type, product_id, products(name, category, food_type)").order("created_at", { ascending: false });
    if (vErr) { setMsg(vErr.message); setRows([]); return; }
    const variantIds = (vData ?? []).map((r: any) => r.id).filter(Boolean);
    let bcMap = new Map<string, string>();
    if (variantIds.length > 0) {
      const { data: bData, error: bErr } = await supabase.from("product_barcodes").select("variant_id, barcode, is_primary, is_active, created_at").in("variant_id", variantIds);
      if (bErr) { setMsg(bErr.message); }
      else {
        const byVariant = new Map<string, any[]>();
        for (const b of bData ?? []) {
          if (!b?.variant_id || b.is_active === false) continue;
          const arr = byVariant.get(b.variant_id) ?? []; arr.push(b); byVariant.set(b.variant_id, arr);
        }
        for (const [vid, arr] of byVariant.entries()) {
          const sorted = [...arr].sort((a: any, b: any) => {
            const ap = a?.is_primary ? 1 : 0, bp = b?.is_primary ? 1 : 0;
            if (ap !== bp) return bp - ap;
            return (b?.created_at ? new Date(b.created_at).getTime() : 0) - (a?.created_at ? new Date(a.created_at).getTime() : 0);
          });
          if (sorted[0]?.barcode) bcMap.set(vid, String(sorted[0].barcode));
        }
      }
    }
    const mapped: VariantRow[] = (vData ?? []).map((r: any) => ({
      variant_id: r.id,
      product_id: r.product_id,
      product_name: r.products?.name ?? "",
      product_category: r.products?.category ?? null,
      product_food_type: r.products?.food_type ?? null,
      variant_name: r.variant_name,              // ✅ 화면 표시용
      barcode: bcMap.get(r.id) ?? (r?.barcode ? String(r.barcode) : ""),
      pack_unit: typeof r.pack_unit === "number" ? r.pack_unit : 1,
      pack_ea: typeof r.pack_ea === "number" ? r.pack_ea : r.pack_ea ?? null,
      weight_g: typeof r.weight_g === "number" ? r.weight_g : r.weight_g ?? null,
      unit_type: r.unit_type ?? null,
    }));
    setRows(mapped);
  };

  useEffect(() => { load(); }, []); // eslint-disable-line

  const removeVariant = async (variant_id: string, bc: string) => {
    const ok = confirm(`이 바코드를 삭제할까요?\n\n${bc || "(바코드 없음)"}`);
    if (!ok) return;
    setLoading(true);
    try {
      setMsg(null);
      const { data: lots, error: lotErr } = await supabase.from("lots").select("id").eq("variant_id", variant_id).limit(50);
      if (lotErr) throw lotErr;
      const lotIds = (lots ?? []).map((l: any) => l.id);
      if (lotIds.length > 0) {
        const { data: mv, error: mvErr } = await supabase.from("movements").select("id").in("lot_id", lotIds).limit(1);
        if (mvErr) throw mvErr;
        if ((mv ?? []).length > 0) { setMsg("❌ 이 바코드는 입출고/폐기/증정 이력이 있어 삭제할 수 없습니다."); return; }
      }
      const { error } = await supabase.from("product_variants").delete().eq("id", variant_id);
      if (error) throw error;
      setMsg("삭제 완료 ✅"); await load();
    } catch (e: any) { setMsg(e?.message ?? "삭제 중 오류"); }
    finally { setLoading(false); }
  };

  // ✅ 수정 저장: variant_name은 product_variants에, food_type/category는 products에
  const saveVariantMeta = async (r: VariantRow) => {
    setMsg(null);
    const draft = rowMetaDraft[r.variant_id];
    const vn = (draft?.variant_name ?? r.variant_name ?? "").trim();  // ✅ variant_name 수정
    const ct = (draft?.category ?? (r.product_category as any) ?? "").trim();
    const ft = (draft?.food_type ?? r.product_food_type ?? "").trim();
    const wgRaw = (draft?.weight_g ?? (r.weight_g ?? "").toString()).trim();
    const peRaw = (draft?.pack_ea ?? (r.pack_ea ?? "").toString()).trim();
    const wg = wgRaw === "" ? null : Number(wgRaw);
    const pe = peRaw === "" ? null : parseInt(peRaw, 10);

    if (!vn) return setMsg("제품명을 입력하세요.");
    if (!ct) return setMsg("구분을 선택하세요.");
    if (!ft) return setMsg("식품유형을 입력하세요.");
    if (wg !== null && (!Number.isFinite(wg) || wg < 0)) return setMsg("무게는 0 이상 숫자여야 합니다.");
    if (pe !== null && (!Number.isFinite(pe) || pe < 1)) return setMsg("수량(ea)은 1 이상 숫자여야 합니다.");

    setLoading(true);
    try {
      // 1) product_variants.variant_name 업데이트 ✅
      const { error: vnUpdErr } = await supabase.from("product_variants").update({ variant_name: vn, weight_g: wg, pack_ea: pe }).eq("id", r.variant_id);
      if (vnUpdErr) throw vnUpdErr;

      // 2) products.category, food_type 업데이트
      const { error: pUpdErr } = await supabase.from("products").update({ category: ct, food_type: ft }).eq("id", r.product_id);
      if (pUpdErr) throw pUpdErr;

      setRowMetaEditOpen((prev) => ({ ...prev, [r.variant_id]: false }));
      setRowMetaDraft((prev) => { const next = { ...prev }; delete next[r.variant_id]; return next; });
      setMsg("저장되었습니다 ✅"); await load();
    } catch (e: any) { setMsg(e?.message ?? "저장 중 오류"); }
    finally { setLoading(false); }
  };

  const upsertProductAndVariant = async () => {
    setMsg(null);
    const pn = productName.trim();
    const ct = String(category || "").trim();
    const vn = variantName.trim();
    const bc = normalizeBarcode(barcode.trim());
    const pu = Number.isFinite(packUnit) ? Math.floor(packUnit) : 0;
    const wg = Number.isFinite(weightG) ? Number(weightG) : NaN;

    if (!pn) return setMsg("제품명을 입력하세요.");
    if (!ct) return setMsg("구분을 선택하세요.");
    if (!vn) return setMsg("식품유형을 입력하세요.");
    if (!bc) return setMsg("바코드를 입력하세요.");
    if (!pu || pu < 1) return setMsg("수량(ea)은 1 이상 숫자여야 합니다.");
    if (!Number.isFinite(wg) || wg < 0) return setMsg("무게(g)는 0 이상 숫자여야 합니다.");

    setLoading(true);
    try {
      const existAny = await findAnyBarcodeUsage(bc);
      if (existAny) { await alertDuplicateBarcode(bc, existAny.variant_id); return; }

      const { data: existingProduct, error: pSelErr } = await supabase.from("products").select("id, food_type").eq("name", pn).eq("category", ct).maybeSingle();
      if (pSelErr) throw pSelErr;
      let productId = existingProduct?.id as string | undefined;
      if (!productId) {
        const { data: pIns, error: pInsErr } = await supabase.from("products").insert({ name: pn, category: ct, food_type: vn, default_weight_g: wg }).select("id").single();
        if (pInsErr) throw pInsErr;
        productId = pIns.id;
      } else {
        const upd: any = {};
        if ((existingProduct?.food_type ?? "") !== vn) upd.food_type = vn;
        upd.default_weight_g = wg;
        const { error: pUpdErr } = await supabase.from("products").update(upd).eq("id", productId);
        if (pUpdErr) throw pUpdErr;
      }

      const { data: vIns, error: vInsErr } = await supabase.from("product_variants").insert({ product_id: productId, variant_name: vn, pack_unit: 1, pack_ea: pu, unit_type: "EA", weight_g: wg, barcode: bc }).select("id").single();
      if (vInsErr) throw vInsErr;

      const { error: bcInsErr } = await supabase.from("product_barcodes").insert({ variant_id: vIns.id, barcode: bc, is_primary: true, is_active: true });
      if (bcInsErr) throw bcInsErr;

      setMsg("신규 바코드가 등록되었습니다 ✅");
      setVariantName(""); setBarcode("");
      requestAnimationFrame(() => { barcodeRef.current?.focus(); barcodeRef.current?.select(); });
      await load();
    } catch (e: any) { setMsg(e?.message ?? "등록 중 오류"); }
    finally { setLoading(false); }
  };

  const categoryOrderIndex = (ct: string | null | undefined) => {
    const idx = CATEGORIES.indexOf(ct as any);
    return idx >= 0 ? idx : 999;
  };

  const filtered = (() => {
    const t = q.trim().toLowerCase();
    let base = rows;
    if (listCategory) base = base.filter((r) => (r.product_category ?? "") === listCategory);
    if (t) {
      base = base.filter((r) =>
        // ✅ variant_name으로 검색
        getDisplayName(r.variant_name, r.product_name).toLowerCase().includes(t) ||
        (r.product_food_type ?? "").toLowerCase().includes(t) ||
        r.barcode.toLowerCase().includes(t)
      );
    }
    return [...base].sort((a, b) => {
      const ai = categoryOrderIndex(a.product_category), bi = categoryOrderIndex(b.product_category);
      if (ai !== bi) return ai - bi;
      const an = getDisplayName(a.variant_name, a.product_name).toLowerCase(), bn = getDisplayName(b.variant_name, b.product_name).toLowerCase();
      if (an < bn) return -1; if (an > bn) return 1; return 0;
    });
  })();

  const exportToExcelCsv = () => {
    const header = ["제품명", "구분", "식품유형", "무게(g)", "수량(ea)", "바코드"];
    const esc = (v: any) => { const s = v === null || v === undefined ? "" : String(v); const needQuote = /[",\n\r]/.test(s); return needQuote ? `"${s.replace(/"/g, '""')}"` : s; };
    const lines = [header.map(esc).join(",")];
    for (const r of filtered) {
      lines.push([
        esc(getDisplayName(r.variant_name, r.product_name) ?? ""),       // ✅ variant_name 또는 product_name
        esc(r.product_category ?? ""),
        esc(r.product_food_type ?? ""),
        esc(r.weight_g ?? ""),
        esc(r.pack_ea ?? ""),
        esc(r.barcode ?? ""),
      ].join(","));
    }
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const now = new Date();
    const filename = `products_list_${now.getFullYear()}${String(now.getMonth()+1).padStart(2,"0")}${String(now.getDate()).padStart(2,"0")}.csv`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">제품명/바코드 등록</h1>
        <div className="flex gap-2">
          <a className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-100" href="/scan">스캔</a>
          <a className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-100" href="/">홈</a>
        </div>
      </div>
      <p className="text-slate-600 mt-2">제품명 + 식품유형 + 바코드 + 수량 + 무게를 등록합니다. (바코드는 중복 불가)</p>

      <div className="mt-6 max-w-2xl grid gap-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm text-slate-600">제품명</label>
            <input className="mt-1 w-full rounded-xl bg-white border border-slate-200 px-3 py-2 outline-none text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300"
              value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="예: 생일축하" />
          </div>
          <div>
            <label className="text-sm text-slate-600 block mb-2">구분</label>
            <div className="flex flex-wrap items-center gap-2">
              {CATEGORIES.map((c) => {
                const checked = category === c;
                return (
                  <label key={c} className={["flex items-center justify-center gap-2 cursor-pointer select-none rounded-xl border whitespace-nowrap px-3 py-1.5 min-w-[72px]", checked ? "bg-blue-600 text-white border-blue-600 shadow" : "bg-white text-slate-700 border-slate-300 hover:bg-slate-100"].join(" ")}>
                    <input type="radio" name="category" value={c} checked={checked} onChange={(e) => setCategory(e.target.value as any)} className="accent-blue-600" />
                    <span className="text-sm font-medium whitespace-nowrap">{c}</span>
                    <span className={["ml-1 text-xs rounded-md px-2 py-0.5 whitespace-nowrap", checked ? "bg-white/20" : "hidden"].join(" ")}>선택됨</span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-3">
          <div ref={vnWrapRef} className="relative">
            <label className="text-sm text-slate-600">식품유형</label>
            <input className="mt-1 w-full rounded-xl bg-white border border-slate-200 px-3 py-2 outline-none text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300"
              value={variantName}
              onChange={async (e) => { setVariantName(e.target.value); setVnActive(-1); setVnOpen(true); await loadVariantSuggest(e.target.value); }}
              onFocus={async () => { setVnOpen(true); await loadVariantSuggest(variantName); }}
              onBlur={() => setTimeout(() => setVnOpen(false), 120)}
              onKeyDown={(e) => {
                if (!vnOpen || vnItems.length === 0) return;
                if (e.key === "ArrowDown") { e.preventDefault(); setVnActive((i) => Math.min(i + 1, vnItems.length - 1)); }
                else if (e.key === "ArrowUp") { e.preventDefault(); setVnActive((i) => Math.max(i - 1, 0)); }
                else if (e.key === "Enter") { if (vnActive >= 0) { e.preventDefault(); setVariantName(vnItems[vnActive]); setVnOpen(false); } }
                else if (e.key === "Escape") setVnOpen(false);
              }}
              placeholder="예: 다크화이트 / 네오화이트다크" />
            {vnOpen && vnItems.length > 0 ? (
              <div className="absolute z-50 mt-2 w-full rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
                <div className="max-h-60 overflow-auto">
                  {vnItems.map((item, idx) => (
                    <button key={`${item}-${idx}`} type="button"
                      className={["w-full text-left px-3 py-2 text-sm", idx === vnActive ? "bg-blue-600 text-white" : "hover:bg-slate-100 text-slate-800"].join(" ")}
                      onMouseEnter={() => setVnActive(idx)} onMouseDown={(e) => e.preventDefault()}
                      onClick={() => { setVariantName(item); setVnOpen(false); }}>{item}</button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div>
            <label className="text-sm text-slate-600">무게(g)</label>
            <input className="mt-1 w-full rounded-xl bg-white border border-slate-200 px-3 py-2 outline-none text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300"
              type="number" min={0} value={weightG}
              onChange={(e) => { const n = parseFloat(e.target.value || "0"); setWeightG(Number.isFinite(n) ? Math.max(0, n) : 0); }}
              placeholder="예: 3" />
          </div>

          <div>
            <label className="text-sm text-slate-600">수량(ea)</label>
            <input className="mt-1 w-full rounded-xl bg-white border border-slate-200 px-3 py-2 outline-none text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300"
              type="number" min={1} value={packUnit}
              onChange={(e) => { const n = parseInt(e.target.value || "1", 10); setPackUnit(Number.isFinite(n) ? Math.max(1, n) : 1); }}
              placeholder="예: 100" />
          </div>

          <div>
            <label className="text-sm text-slate-600 flex items-center justify-between">
              <span>바코드</span>
              <button type="button"
                className={["text-xs rounded-lg border px-2 py-1 transition", isScanMode ? "bg-blue-600 text-white border-blue-600 shadow" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"].join(" ")}
                onClick={() => { setIsScanMode((v) => !v); requestAnimationFrame(() => { barcodeRef.current?.focus(); barcodeRef.current?.select(); }); }}>
                {isScanMode ? "스캔 모드 ON" : "스캔 모드"}
              </button>
            </label>
            <input readOnly={isScanMode} ref={barcodeRef}
              className={["mt-1 w-full rounded-xl bg-white border px-3 py-2 outline-none font-mono text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20", isScanMode ? "border-blue-300" : "border-slate-200"].join(" ")}
              value={barcode} placeholder="스캐너로 찍어도 입력됨"
              onChange={(e) => { if (isScanMode) return; setBarcode(normalizeBarcode(e.target.value || "")); }}
              onFocus={(e) => e.currentTarget.select()}
              onKeyDown={(e) => {
                if (!isScanMode) return;
                if (e.repeat) return;
                if (e.key === "Enter") { e.preventDefault(); upsertProductAndVariant(); return; }
                if (e.key === "Backspace") { e.preventDefault(); setBarcode((prev) => prev.slice(0, -1)); return; }
                if (["Tab","ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Home","End"].includes(e.key)) return;
                const now = Date.now(); const gap = now - lastKeyAtRef.current; lastKeyAtRef.current = now;
                const ch = codeToAscii(e.code, e.shiftKey, e.getModifierState("CapsLock"));
                if (!ch) return;
                e.preventDefault();
                setBarcode((prev) => { const base = prev && gap > SCAN_GAP_MS ? "" : prev; return (base + ch).toUpperCase().replace(/[^0-9A-Z_-]/g, ""); });
              }}
              onPaste={(e) => { e.preventDefault(); setBarcode(normalizeBarcode(e.clipboardData.getData("text") || "")); }} />
          </div>
        </div>

        {msg ? <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">{msg}</div> : null}

        <div className="flex gap-2">
          <button className="rounded-xl bg-blue-600 text-white px-4 py-2 font-medium hover:bg-blue-700 disabled:opacity-60" disabled={loading} onClick={upsertProductAndVariant}>
            {loading ? "저장 중..." : "등록"}
          </button>
          <button className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-slate-700 hover:bg-slate-100" onClick={load}>새로고침</button>
        </div>
      </div>

      <div className="mt-10">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">등록 목록</h2>
          <div className="flex items-center gap-2">
            <button type="button" className={["rounded-xl border px-3 py-2 text-sm", listCategory === "" ? "bg-blue-600 text-white border-blue-600 shadow" : "bg-white text-slate-700 border-slate-300 hover:bg-slate-100"].join(" ")} onClick={() => setListCategory("")}>전체</button>
            {CATEGORIES.map((c) => (
              <button key={c} type="button" className={["rounded-xl border px-3 py-2 text-sm", listCategory === c ? "bg-blue-600 text-white border-blue-600 shadow" : "bg-white text-slate-700 border-slate-300 hover:bg-slate-100"].join(" ")} onClick={() => setListCategory(c)}>{c}</button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-60"
              disabled={filtered.length === 0} onClick={exportToExcelCsv} title="현재 필터/검색된 목록을 CSV(엑셀)로 저장">엑셀 저장</button>
            <input className="w-full max-w-sm rounded-xl bg-white border border-slate-200 px-3 py-2 outline-none text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300"
              value={q} onChange={(e) => setQ(e.target.value)} placeholder="검색(제품명/식품유형/바코드)" onFocus={() => setIsScanMode(false)} />
          </div>
        </div>

        <div className="mt-3 rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-left p-3">제품명</th>
                <th className="text-left p-3">구분</th>
                <th className="text-left p-3">식품유형</th>
                <th className="text-right p-3">무게(g)</th>
                <th className="text-right p-3">수량(ea)</th>
                <th className="text-left p-3">바코드</th>
                <th className="text-right p-3">관리</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td className="p-3 text-slate-500" colSpan={7}>등록된 데이터가 없습니다.</td></tr>
              ) : filtered.map((r) => {
                const isEditing = rowBarcodeEditOpen[r.variant_id] === true;
                const draft = rowBarcodeDraft[r.variant_id];
                const metaEditing = rowMetaEditOpen[r.variant_id] === true;
                const metaDraft = rowMetaDraft[r.variant_id];

                return (
                  <tr key={r.variant_id} className="border-t border-slate-200">
                    {/* ✅ 제품명 컬럼: variant_name 표시/수정 */}
                    <td className="p-3">
                      {metaEditing ? (
                        <input className="w-full max-w-xs rounded-lg bg-white border border-slate-200 px-2 py-1 outline-none text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300"
                          value={metaDraft?.variant_name ?? r.variant_name ?? ""}
                          onChange={(e) => {
                            const v = e.target.value;
                            setRowMetaDraft((prev) => ({ ...prev, [r.variant_id]: {
                              variant_name: v,
                              category: (prev[r.variant_id]?.category ?? (r.product_category as any) ?? "") as any,
                              food_type: prev[r.variant_id]?.food_type ?? (r.product_food_type ?? ""),
                              weight_g: prev[r.variant_id]?.weight_g ?? (r.weight_g ?? "").toString(),
                              pack_ea: prev[r.variant_id]?.pack_ea ?? (r.pack_ea ?? "").toString(),
                            }}));
                          }} />
                      ) : (
                        getDisplayName(r.variant_name, r.product_name)  // ✅ variant_name 또는 product_name
                      )}
                    </td>

                    <td className="p-3">
                      {metaEditing ? (
                        <select className="rounded-lg bg-white border border-slate-200 px-2 py-1 outline-none text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300"
                          value={metaDraft?.category ?? ((r.product_category as any) ?? "")}
                          onChange={(e) => {
                            const v = e.target.value as any;
                            setRowMetaDraft((prev) => ({ ...prev, [r.variant_id]: {
                              variant_name: prev[r.variant_id]?.variant_name ?? r.variant_name,
                              category: v,
                              food_type: prev[r.variant_id]?.food_type ?? (r.product_food_type ?? ""),
                              weight_g: prev[r.variant_id]?.weight_g ?? (r.weight_g ?? "").toString(),
                              pack_ea: prev[r.variant_id]?.pack_ea ?? (r.pack_ea ?? "").toString(),
                            }}));
                          }}>
                          <option value="">선택</option>
                          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      ) : (r.product_category ?? "-")}
                    </td>

                    <td className="p-3">
                      {metaEditing ? (
                        <input className="w-full max-w-xs rounded-lg bg-white border border-slate-200 px-2 py-1 outline-none text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300"
                          value={metaDraft?.food_type ?? r.product_food_type ?? ""}
                          onChange={(e) => {
                            const v = e.target.value;
                            setRowMetaDraft((prev) => ({ ...prev, [r.variant_id]: {
                              variant_name: prev[r.variant_id]?.variant_name ?? r.variant_name,
                              category: (prev[r.variant_id]?.category ?? (r.product_category as any) ?? "") as any,
                              food_type: v,
                              weight_g: prev[r.variant_id]?.weight_g ?? (r.weight_g ?? "").toString(),
                              pack_ea: prev[r.variant_id]?.pack_ea ?? (r.pack_ea ?? "").toString(),
                            }}));
                          }} />
                      ) : (r.product_food_type ?? "-")}
                    </td>

                    <td className="p-3 text-right">
                      {metaEditing ? (
                        <input className="w-24 rounded-lg bg-white border border-slate-200 px-2 py-1 outline-none text-right text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300"
                          value={metaDraft?.weight_g ?? (r.weight_g ?? "").toString()}
                          onChange={(e) => {
                            const v = e.target.value;
                            setRowMetaDraft((prev) => ({ ...prev, [r.variant_id]: {
                              variant_name: prev[r.variant_id]?.variant_name ?? r.variant_name,
                              category: (prev[r.variant_id]?.category ?? (r.product_category as any) ?? "") as any,
                              food_type: prev[r.variant_id]?.food_type ?? (r.product_food_type ?? ""),
                              weight_g: v,
                              pack_ea: prev[r.variant_id]?.pack_ea ?? (r.pack_ea ?? "").toString(),
                            }}));
                          }} placeholder="0" />
                      ) : (r.weight_g ?? "-").toString()}
                    </td>

                    <td className="p-3 text-right">
                      {metaEditing ? (
                        <input className="w-24 rounded-lg bg-white border border-slate-200 px-2 py-1 outline-none text-right text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300"
                          value={metaDraft?.pack_ea ?? (r.pack_ea ?? "").toString()}
                          onChange={(e) => {
                            const v = e.target.value;
                            setRowMetaDraft((prev) => ({ ...prev, [r.variant_id]: {
                              variant_name: prev[r.variant_id]?.variant_name ?? r.variant_name,
                              category: (prev[r.variant_id]?.category ?? (r.product_category as any) ?? "") as any,
                              food_type: prev[r.variant_id]?.food_type ?? (r.product_food_type ?? ""),
                              weight_g: prev[r.variant_id]?.weight_g ?? (r.weight_g ?? "").toString(),
                              pack_ea: v,
                            }}));
                          }} placeholder="1" />
                      ) : (r.pack_ea ?? "-").toString()}
                    </td>

                    <td className="p-3 font-mono">
                      {!r.barcode && !isEditing ? (
                        <div className="flex items-center gap-2">
                          <input className="w-full max-w-xs rounded-lg bg-white border border-slate-200 px-2 py-1 outline-none font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300"
                            value={draft ?? ""} onChange={(e) => setRowBarcodeDraft((prev) => ({ ...prev, [r.variant_id]: e.target.value }))}
                            placeholder="바코드 입력"
                            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); saveVariantBarcode(r.variant_id, rowBarcodeDraft[r.variant_id] ?? ""); } }}
                            onPaste={(e) => { e.preventDefault(); setRowBarcodeDraft((prev) => ({ ...prev, [r.variant_id]: normalizeBarcode(e.clipboardData.getData("text") || "") })); }} />
                          <button className="rounded-lg bg-blue-600 text-white px-3 py-1 text-xs font-medium hover:bg-blue-700 disabled:opacity-60" disabled={loading}
                            onClick={() => saveVariantBarcode(r.variant_id, rowBarcodeDraft[r.variant_id] ?? "")}>저장</button>
                        </div>
                      ) : isEditing ? (
                        <div className="flex items-center gap-2">
                          <input className="w-full max-w-xs rounded-lg bg-white border border-slate-200 px-2 py-1 outline-none font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300"
                            value={draft ?? r.barcode ?? ""} onChange={(e) => setRowBarcodeDraft((prev) => ({ ...prev, [r.variant_id]: e.target.value }))}
                            placeholder="바코드 수정" autoFocus onFocus={(e) => e.currentTarget.select()}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") { e.preventDefault(); saveVariantBarcode(r.variant_id, rowBarcodeDraft[r.variant_id] ?? r.barcode ?? ""); }
                              else if (e.key === "Escape") { e.preventDefault(); setRowBarcodeEditOpen((prev) => ({ ...prev, [r.variant_id]: false })); setRowBarcodeDraft((prev) => { const next = { ...prev }; delete next[r.variant_id]; return next; }); }
                            }}
                            onPaste={(e) => { e.preventDefault(); setRowBarcodeDraft((prev) => ({ ...prev, [r.variant_id]: normalizeBarcode(e.clipboardData.getData("text") || "") })); }} />
                          <button className="rounded-lg bg-blue-600 text-white px-3 py-1 text-xs font-medium hover:bg-blue-700 disabled:opacity-60" disabled={loading}
                            onClick={() => saveVariantBarcode(r.variant_id, rowBarcodeDraft[r.variant_id] ?? r.barcode ?? "")}>저장</button>
                          <button className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-60" disabled={loading}
                            onClick={() => { setRowBarcodeEditOpen((prev) => ({ ...prev, [r.variant_id]: false })); setRowBarcodeDraft((prev) => { const next = { ...prev }; delete next[r.variant_id]; return next; }); }}>취소</button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3">
                          <span>{r.barcode}</span>
                          <button className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-60" disabled={loading}
                            onClick={() => { setRowBarcodeEditOpen((prev) => ({ ...prev, [r.variant_id]: true })); setRowBarcodeDraft((prev) => ({ ...prev, [r.variant_id]: r.barcode ?? "" })); }}>수정</button>
                        </div>
                      )}
                    </td>

                    <td className="p-3 text-right">
                      {metaEditing ? (
                        <div className="flex justify-end gap-2">
                          <button className="rounded-lg bg-blue-600 text-white px-3 py-1 text-xs font-medium hover:bg-blue-700 disabled:opacity-60" disabled={loading} onClick={() => saveVariantMeta(r)}>저장</button>
                          <button className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-60" disabled={loading}
                            onClick={() => { setRowMetaEditOpen((prev) => ({ ...prev, [r.variant_id]: false })); setRowMetaDraft((prev) => { const next = { ...prev }; delete next[r.variant_id]; return next; }); }}>취소</button>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-2">
                          <button className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-60" disabled={loading}
                            onClick={() => {
                              setRowMetaEditOpen((prev) => ({ ...prev, [r.variant_id]: true }));
                              setRowMetaDraft((prev) => ({ ...prev, [r.variant_id]: {
                                variant_name: getDisplayName(r.variant_name, r.product_name) ?? "",   // ✅ variant_name
                                category: ((r.product_category as any) ?? "") as any,
                                food_type: r.product_food_type ?? "",
                                weight_g: (r.weight_g ?? "").toString(),
                                pack_ea: (r.pack_ea ?? "").toString(),
                              }}));
                            }}>수정</button>
                          <button className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-60" disabled={loading}
                            onClick={() => removeVariant(r.variant_id, r.barcode)}>삭제</button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-500 mt-3">※ 바코드는 유니크입니다. 목록에서 바코드가 있어도 "수정"으로 변경할 수 있습니다.</p>
      </div>

      {showTop ? (
        <button type="button" className="fixed right-6 bottom-6 z-50 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 shadow hover:bg-slate-100"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>TOP</button>
      ) : null}
    </div>
  );
}
