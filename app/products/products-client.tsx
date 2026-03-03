"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

function codeToAscii(code: string, shift: boolean, caps: boolean) {
  // capslock/shift에 따른 대문자 처리
  const upper = shift !== caps;

  if (code.startsWith("Numpad")) {
    const n = code.replace("Numpad", "");
    if (/^\d$/.test(n)) return n;
  }
  
  if (code.startsWith("Key")) {
    const ch = code.slice(3); // "A" ~ "Z"
    return upper ? ch : ch.toLowerCase();
  }

  if (code.startsWith("Digit")) {
    return code.slice(5); // "0"~"9"
  }

  // 바코드에서 자주 쓰는 - / _
  if (code === "Minus") {
    return shift ? "_" : "-";
  }

  return null;
}


type VariantRow = {
  variant_id: string;
  product_id: string;
  product_name: string;
  product_category: string | null;
  variant_name: string;
  barcode: string;
  pack_unit: number;
};

const CATEGORIES = ["기성", "업체", "전사지"] as const;

// ✅ 두벌식(한글 IME)로 들어온 문자/자모를 QWERTY 영문으로 복원
function hangulToQwerty(input: string) {
  const CONS: Record<string, string> = {
    ㄱ: "r",
    ㄲ: "R",
    ㄴ: "s",
    ㄷ: "e",
    ㄸ: "E",
    ㄹ: "f",
    ㅁ: "a",
    ㅂ: "q",
    ㅃ: "Q",
    ㅅ: "t",
    ㅆ: "T",
    ㅇ: "d",
    ㅈ: "w",
    ㅉ: "W",
    ㅊ: "c",
    ㅋ: "z",
    ㅌ: "x",
    ㅍ: "v",
    ㅎ: "g",
  };

  const VOW: Record<string, string> = {
    ㅏ: "k",
    ㅐ: "o",
    ㅑ: "i",
    ㅒ: "O",
    ㅓ: "j",
    ㅔ: "p",
    ㅕ: "u",
    ㅖ: "P",
    ㅗ: "h",
    ㅘ: "hk",
    ㅙ: "ho",
    ㅚ: "hl",
    ㅛ: "y",
    ㅜ: "n",
    ㅝ: "nj",
    ㅞ: "np",
    ㅟ: "nl",
    ㅠ: "b",
    ㅡ: "m",
    ㅢ: "ml",
    ㅣ: "l",
  };

  const JONG: Record<string, string> = {
    "": "",
    ㄱ: "r",
    ㄲ: "R",
    ㄳ: "rt",
    ㄴ: "s",
    ㄵ: "sw",
    ㄶ: "sg",
    ㄷ: "e",
    ㄹ: "f",
    ㄺ: "fr",
    ㄻ: "fa",
    ㄼ: "fq",
    ㄽ: "ft",
    ㄾ: "fx",
    ㄿ: "fv",
    ㅀ: "fg",
    ㅁ: "a",
    ㅂ: "q",
    ㅄ: "qt",
    ㅅ: "t",
    ㅆ: "T",
    ㅇ: "d",
    ㅈ: "w",
    ㅊ: "c",
    ㅋ: "z",
    ㅌ: "x",
    ㅍ: "v",
    ㅎ: "g",
  };

  const CHO = [
    "ㄱ",
    "ㄲ",
    "ㄴ",
    "ㄷ",
    "ㄸ",
    "ㄹ",
    "ㅁ",
    "ㅂ",
    "ㅃ",
    "ㅅ",
    "ㅆ",
    "ㅇ",
    "ㅈ",
    "ㅉ",
    "ㅊ",
    "ㅋ",
    "ㅌ",
    "ㅍ",
    "ㅎ",
  ];
  const JUNG = [
    "ㅏ",
    "ㅐ",
    "ㅑ",
    "ㅒ",
    "ㅓ",
    "ㅔ",
    "ㅕ",
    "ㅖ",
    "ㅗ",
    "ㅘ",
    "ㅙ",
    "ㅚ",
    "ㅛ",
    "ㅜ",
    "ㅝ",
    "ㅞ",
    "ㅟ",
    "ㅠ",
    "ㅡ",
    "ㅢ",
    "ㅣ",
  ];
  const JONG_LIST = [
    "",
    "ㄱ",
    "ㄲ",
    "ㄳ",
    "ㄴ",
    "ㄵ",
    "ㄶ",
    "ㄷ",
    "ㄹ",
    "ㄺ",
    "ㄻ",
    "ㄼ",
    "ㄽ",
    "ㄾ",
    "ㄿ",
    "ㅀ",
    "ㅁ",
    "ㅂ",
    "ㅄ",
    "ㅅ",
    "ㅆ",
    "ㅇ",
    "ㅈ",
    "ㅊ",
    "ㅋ",
    "ㅌ",
    "ㅍ",
    "ㅎ",
  ];

  const out: string[] = [];

  for (const ch of input) {
    if (CONS[ch]) {
      out.push(CONS[ch]);
      continue;
    }
    if (VOW[ch]) {
      out.push(VOW[ch]);
      continue;
    }

    const code = ch.charCodeAt(0);
    if (code >= 0xac00 && code <= 0xd7a3) {
      const sIndex = code - 0xac00;
      const cho = Math.floor(sIndex / (21 * 28));
      const jung = Math.floor((sIndex % (21 * 28)) / 28);
      const jong = sIndex % 28;

      out.push(CONS[CHO[cho]] ?? "");
      out.push(VOW[JUNG[jung]] ?? "");
      out.push(JONG[JONG_LIST[jong]] ?? "");
      continue;
    }

    out.push(ch);
  }

  return out.join("");
}

export default function ProductsClient() {
  const supabase = useMemo(() => createClient(), []);

  // ✅ 바코드 칸 포커스/스캔모드용
  const barcodeRef = useRef<HTMLInputElement>(null);
  const [isScanMode, setIsScanMode] = useState(false);

  const SCAN_GAP_MS = 200; // ✅ 이 시간 이상 끊기면 "새 스캔"으로 판단

// ✅ 스캔 끊김 감지용 (Hook은 무조건 여기!)
const lastKeyAtRef = useRef<number>(0);

// ✅ 식품유형 자동완성
const [vnOpen, setVnOpen] = useState(false);
const [vnItems, setVnItems] = useState<string[]>([]);
const [vnActive, setVnActive] = useState<number>(-1);
const vnWrapRef = useRef<HTMLDivElement>(null);

const loadVariantSuggest = async (keyword: string) => {
  const k = keyword.trim();
  if (k.length < 1) {
    // ✅ 최근 사용(이미 rows에 있음)에서 상위 10개
    const recent = Array.from(
      new Set(rows.map((r) => r.variant_name).filter(Boolean))
    ).slice(0, 10);
    setVnItems(recent);
    return;
  }

  // ✅ 2글자 이상이면 DB에서 유사 검색(추천)
  if (k.length >= 2) {
    const { data, error } = await supabase
      .from("product_variants")
      .select("variant_name")
      .ilike("variant_name", `%${k}%`)
      .order("created_at", { ascending: false })
      .limit(12);

    if (!error) {
      const list = Array.from(
        new Set((data ?? []).map((d: any) => d.variant_name).filter(Boolean))
      );
      setVnItems(list);
      return;
    }
  }

  // ✅ 1글자일 땐 rows 기반 필터
  const local = Array.from(
    new Set(
      rows
        .map((r) => r.variant_name)
        .filter(Boolean)
        .filter((x) => x.toLowerCase().includes(k.toLowerCase()))
    )
  ).slice(0, 12);
  setVnItems(local);
};



  const [msg, setMsg] = useState<string | null>(null);
  const [productName, setProductName] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number] | "">("기성");
  const [variantName, setVariantName] = useState("");
  const [barcode, setBarcode] = useState("");
  const [packUnit, setPackUnit] = useState<number>(100);

  const [rows, setRows] = useState<VariantRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");

  const load = async () => {
    setMsg(null);

    const { data, error } = await supabase
      .from("product_variants")
      .select("id, variant_name, barcode, pack_unit, product_id, products(name, category)")
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      setMsg(error.message);
      setRows([]);
      return;
    }

    const mapped: VariantRow[] = (data ?? []).map((r: any) => ({
      variant_id: r.id,
      product_id: r.product_id,
      product_name: r.products?.name ?? "",
      product_category: r.products?.category ?? null,
      variant_name: r.variant_name,
      barcode: r.barcode,
      pack_unit: typeof r.pack_unit === "number" ? r.pack_unit : 1,
    }));

    setRows(mapped);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const removeVariant = async (variant_id: string, bc: string) => {
    const ok = confirm(`이 바코드를 삭제할까요?\n\n${bc}`);
    if (!ok) return;

    setLoading(true);
    try {
      setMsg(null);

      const { data: lots, error: lotErr } = await supabase
        .from("lots")
        .select("id")
        .eq("variant_id", variant_id)
        .limit(50);

      if (lotErr) throw lotErr;

      const lotIds = (lots ?? []).map((l: any) => l.id);

      if (lotIds.length > 0) {
        const { data: mv, error: mvErr } = await supabase
          .from("movements")
          .select("id")
          .in("lot_id", lotIds)
          .limit(1);

        if (mvErr) throw mvErr;

        if ((mv ?? []).length > 0) {
          setMsg("❌ 이 바코드는 입출고/폐기/증정 이력이 있어 삭제할 수 없습니다. (이력 보존 필요)");
          return;
        }
      }

      const { error } = await supabase.from("product_variants").delete().eq("id", variant_id);
      if (error) throw error;

      setMsg("삭제 완료 ✅");
      await load();
    } catch (e: any) {
      setMsg(e?.message ?? "삭제 중 오류");
    } finally {
      setLoading(false);
    }
  };

  const upsertProductAndVariant = async () => {
    setMsg(null);
  
    const pn = productName.trim();
    const ct = String(category || "").trim();
    const vn = variantName.trim();
    const bc = barcode.trim();
    const pu = Number.isFinite(packUnit) ? Math.floor(packUnit) : 0;
  
    if (!pn) return setMsg("제품명을 입력하세요.");
    if (!ct) return setMsg("구분을 선택하세요.");
    if (!vn) return setMsg("식품유형을 입력하세요.");
    if (!bc) return setMsg("바코드를 입력하세요.");
    if (!pu || pu < 1) return setMsg("수량은 1 이상 숫자여야 합니다.");
  
    setLoading(true);
  
    try {
      /* -------------------------------------------------
         1️⃣ 바코드 중복 여부 먼저 확인
      ------------------------------------------------- */
      const { data: existVariant, error: existErr } = await supabase
        .from("product_variants")
        .select("id, product_id")
        .eq("barcode", bc)
        .maybeSingle();
  
      if (existErr) throw existErr;
  
      if (existVariant) {
        const ok = confirm(
          "⚠️ 이미 등록된 바코드입니다.\n\n" +
          "기존 정보를 새로 입력한 내용으로 수정하시겠습니까?\n\n" +
          "※ 취소를 누르면 아무 변경도 하지 않습니다."
        );
        if (!ok) return;
      }
  
      /* -------------------------------------------------
         2️⃣ 제품(products) 조회 or 생성
      ------------------------------------------------- */
      const { data: existingProduct, error: pSelErr } = await supabase
        .from("products")
        .select("id")
        .eq("name", pn)
        .eq("category", ct)
        .maybeSingle();
  
      if (pSelErr) throw pSelErr;
  
      let productId = existingProduct?.id as string | undefined;
  
      if (!productId) {
        const { data: pIns, error: pInsErr } = await supabase
          .from("products")
          .insert({ name: pn, category: ct })
          .select("id")
          .single();
  
        if (pInsErr) throw pInsErr;
        productId = pIns.id;
      }
  
      /* -------------------------------------------------
         3️⃣ 신규 vs 수정 분기 처리
      ------------------------------------------------- */
      if (existVariant) {
        // ✅ 기존 바코드 → UPDATE
        const { error: updErr } = await supabase
          .from("product_variants")
          .update({
            product_id: productId,
            variant_name: vn,
            pack_unit: pu,
          })
          .eq("id", existVariant.id);
  
        if (updErr) throw updErr;
  
        setMsg("기존 바코드 정보가 수정되었습니다 ✏️");
      } else {
        // ✅ 신규 바코드 → INSERT
        const { error: insErr } = await supabase
          .from("product_variants")
          .insert({
            product_id: productId,
            variant_name: vn,
            barcode: bc,
            pack_unit: pu,
          });
  
        if (insErr) throw insErr;
  
        setMsg("신규 바코드가 등록되었습니다 ✅");
      }
  
      setVariantName("");
      setBarcode("");
  
      // 다음 스캔 대비 포커스 유지
      requestAnimationFrame(() => {
        barcodeRef.current?.focus();
        barcodeRef.current?.select();
      });
  
      await load();
    } catch (e: any) {
      setMsg(e?.message ?? "등록 중 오류");
    } finally {
      setLoading(false);
    }
  };
  
  const filtered = q.trim()
    ? rows.filter((r) => {
        const t = q.trim().toLowerCase();
        return (
          r.product_name.toLowerCase().includes(t) ||
          (r.product_category ?? "").toLowerCase().includes(t) ||
          r.variant_name.toLowerCase().includes(t) ||
          r.barcode.toLowerCase().includes(t) ||
          String(r.pack_unit).includes(t)
        );
      })
    : rows;

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">제품명/바코드 등록</h1>
        <div className="flex gap-2">
          <a className="rounded-xl border border-white/15 px-4 py-2" href="/scan">
            스캔
          </a>
          <a className="rounded-xl border border-white/15 px-4 py-2" href="/">
            홈
          </a>
        </div>
      </div>

      <p className="text-white/60 mt-2">
        제품명 + 식품유형 + 바코드 + 수량을 등록합니다. (바코드는 중복 불가)
      </p>

      <div className="mt-6 max-w-2xl grid gap-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm text-white/70">제품명</label>
            <input
              className="mt-1 w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 outline-none"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              placeholder="예: 생일축하"
            />
          </div>

          <div>
            <label className="text-sm text-white/70 block mb-2">구분</label>
            <div className="flex gap-2">
  {CATEGORIES.map((c) => {
    const checked = category === c;
    return (
      <label
        key={c}
        className={[
          "flex items-center gap-2 cursor-pointer select-none rounded-xl px-3 py-2 border",
          checked
            ? "bg-white text-black border-white shadow"
            : "bg-black/30 text-white border-white/15 hover:bg-white/10",
        ].join(" ")}
      >
        <input
          type="radio"
          name="category"
          value={c}
          checked={checked}
          onChange={(e) => setCategory(e.target.value as any)}
          className="accent-black"
        />
        <span className="text-sm font-medium">{c}</span>

        {/* ✅ 체크 표시(선택되면 보이게) */}
        <span
          className={[
            "ml-1 text-xs rounded-md px-2 py-0.5",
            checked ? "bg-black/10" : "hidden",
          ].join(" ")}
        >
          선택됨
        </span>
      </label>
    );
  })}
</div>

          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
        <div ref={vnWrapRef} className="relative">
  <label className="text-sm text-white/70">식품유형</label>
  <input
    className="mt-1 w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 outline-none"
    value={variantName}
    onChange={async (e) => {
      setVariantName(e.target.value);
      setVnActive(-1);
      setVnOpen(true);
      await loadVariantSuggest(e.target.value);
    }}
    onFocus={async () => {
      setVnOpen(true);
      await loadVariantSuggest(variantName);
    }}
    onBlur={() => {
      // ✅ 클릭 선택을 위해 살짝 지연
      setTimeout(() => setVnOpen(false), 120);
    }}
    onKeyDown={(e) => {
      if (!vnOpen || vnItems.length === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setVnActive((i) => Math.min(i + 1, vnItems.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setVnActive((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        if (vnActive >= 0) {
          e.preventDefault();
          setVariantName(vnItems[vnActive]);
          setVnOpen(false);
        }
      } else if (e.key === "Escape") {
        setVnOpen(false);
      }
    }}
    placeholder="예: 다크화이트 / 네오화이트다크"
  />

  {vnOpen && vnItems.length > 0 ? (
    <div className="absolute z-50 mt-2 w-full rounded-xl border border-white/15 bg-black/90 overflow-hidden">
      <div className="max-h-60 overflow-auto">
        {vnItems.map((item, idx) => {
          const active = idx === vnActive;
          return (
            <button
              key={`${item}-${idx}`}
              type="button"
              className={[
                "w-full text-left px-3 py-2 text-sm",
                active ? "bg-white text-black" : "hover:bg-white/10",
              ].join(" ")}
              onMouseEnter={() => setVnActive(idx)}
              onMouseDown={(e) => e.preventDefault()} // ✅ blur 방지
              onClick={() => {
                setVariantName(item);
                setVnOpen(false);
              }}
            >
              {item}
            </button>
          );
        })}
      </div>
    </div>
  ) : null}
</div>


          <div>
            <label className="text-sm text-white/70">수량(ea)</label>
            <input
              className="mt-1 w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 outline-none"
              type="number"
              min={1}
              value={packUnit}
              onChange={(e) => {
                const n = parseInt(e.target.value || "1", 10);
                setPackUnit(Number.isFinite(n) ? Math.max(1, n) : 1);
              }}
              placeholder="예: 100"
            />
          </div>

          <div>
            <label className="text-sm text-white/70 flex items-center justify-between">
              <span>바코드</span>
              <button
  type="button"
  className={[
    "text-xs rounded-lg border px-2 py-1 transition",
    isScanMode
      ? "bg-white text-black border-white shadow"
      : "border-white/15 hover:bg-white/10",
  ].join(" ")}
  onClick={() => {
    setIsScanMode((v) => !v);

    requestAnimationFrame(() => {
      barcodeRef.current?.focus();
      barcodeRef.current?.select();
    });
  }}
>
  {isScanMode ? "스캔 모드 ON" : "스캔 모드"}
</button>
            </label>
            <input
            readOnly
  ref={barcodeRef}
  className={[
    "mt-1 w-full rounded-xl bg-black/40 border px-3 py-2 outline-none font-mono",
    isScanMode ? "border-white shadow-[0_0_0_2px_rgba(255,255,255,0.25)]" : "border-white/10",
  ].join(" ")}
  value={barcode}
  placeholder="스캐너로 찍어도 입력됨"
  onFocus={(e) => e.currentTarget.select()}
  onKeyDown={(e) => {
    if (e.repeat) return;
  
    // Enter면 자동 등록
    if (e.key === "Enter") {
      e.preventDefault();
      upsertProductAndVariant();
      return;
    }
  
    // Backspace
    if (e.key === "Backspace") {
      e.preventDefault();
      setBarcode((prev) => prev.slice(0, -1));
      return;
    }
  
    // 방향키/Tab 등은 통과
    if (
      e.key === "Tab" ||
      e.key === "ArrowLeft" ||
      e.key === "ArrowRight" ||
      e.key === "ArrowUp" ||
      e.key === "ArrowDown" ||
      e.key === "Home" ||
      e.key === "End"
    ) {
      return;
    }
  
    const now = Date.now();
    const gap = now - lastKeyAtRef.current;
    lastKeyAtRef.current = now;
  
    const ch = codeToAscii(e.code, e.shiftKey, e.getModifierState("CapsLock"));
    if (!ch) return;
  
    e.preventDefault();
  
    setBarcode((prev) => {
      // ✅ 이전 입력 이후 시간이 벌어졌다면 "새 스캔 시작" → 기존 값 삭제 후 새로 시작
      const base = prev && gap > SCAN_GAP_MS ? "" : prev;
  
      const next = (base + ch)
        .toUpperCase()
        .replace(/[^0-9A-Z_-]/g, "");
  
      return next;
    });
  }}
  
  onPaste={(e) => {
    // 붙여넣기 대응 (붙여넣기는 value 기반이므로 여기서 정제)
    e.preventDefault();
    const text = e.clipboardData.getData("text") || "";
    let raw = text;

    // 한글/자모가 섞여 들어오면 복원(붙여넣기용 fallback)
    // ⚠️ hangulToQwerty는 붙여넣기/예외 대응용 fallback
// 실제 스캐너 입력은 onKeyDown + event.code 기반으로 처리한다

    if (/[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(raw)) raw = hangulToQwerty(raw);

    const cleaned = raw
      .trim()
      .replace(/[\u2010\u2011\u2012\u2013\u2014\u2212]/g, "-")
      .toUpperCase()
      .replace(/\s+/g, "")
      .replace(/[^0-9A-Z_-]/g, "");

    setBarcode(cleaned);
  }}
/>

          </div>
        </div>

        {msg ? (
          <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm">{msg}</div>
        ) : null}

        <div className="flex gap-2">
          <button
            className="rounded-xl bg-white text-black px-4 py-2 font-medium disabled:opacity-60"
            disabled={loading}
            onClick={upsertProductAndVariant}
          >
            {loading ? "저장 중..." : "등록"}
          </button>

          <button className="rounded-xl border border-white/15 px-4 py-2" onClick={load}>
            새로고침
          </button>
        </div>
      </div>

      <div className="mt-10">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">등록 목록</h2>
          <input
            className="w-full max-w-sm rounded-xl bg-black/40 border border-white/10 px-3 py-2 outline-none"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="검색(제품명/구분/식품유형/바코드/수량)"
            onFocus={() => setIsScanMode(false)}
          />
        </div>

        <div className="mt-3 rounded-2xl border border-white/10 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-white/5">
              <tr>
                <th className="text-left p-3">제품명</th>
                <th className="text-left p-3">구분</th>
                <th className="text-left p-3">식품유형</th>
                <th className="text-left p-3">바코드</th>
                <th className="text-right p-3">수량</th>
                <th className="text-right p-3">관리</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td className="p-3 text-white/60" colSpan={6}>
                    등록된 데이터가 없습니다.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r.variant_id} className="border-t border-white/10">
                    <td className="p-3">{r.product_name}</td>
                    <td className="p-3">{r.product_category ?? "-"}</td>
                    <td className="p-3">{r.variant_name}</td>
                    <td className="p-3 font-mono">{r.barcode}</td>
                    <td className="p-3 text-right">{r.pack_unit}</td>
                    <td className="p-3 text-right">
                      <button
                        className="rounded-lg border border-white/15 px-3 py-1 text-xs hover:bg-white/10 disabled:opacity-60"
                        disabled={loading}
                        onClick={() => removeVariant(r.variant_id, r.barcode)}
                      >
                        삭제
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-white/50 mt-3">
          ※ 바코드는 유니크입니다. 같은 바코드를 다시 등록하면 해당 바코드의 식품유형/수량이 갱신됩니다.
        </p>
      </div>
    </div>
  );
}
