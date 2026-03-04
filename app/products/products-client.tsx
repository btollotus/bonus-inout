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
  product_food_type: string | null;
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

  const [msg, setMsg] = useState<string | null>(null);
  const [productName, setProductName] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number] | "">("기성");
  const [variantName, setVariantName] = useState("");
  const [barcode, setBarcode] = useState("");
  const [packUnit, setPackUnit] = useState<number>(100);

  const [rows, setRows] = useState<VariantRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");

  // ✅ 목록에서 "바코드 없는 제품" 바코드 입력/저장용
  const [rowBarcodeDraft, setRowBarcodeDraft] = useState<Record<string, string>>({});

  // ✅ 정렬
  const [sortKey, setSortKey] = useState<"product_name" | "product_food_type" | "barcode">("product_name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const loadVariantSuggest = async (keyword: string) => {
    const k = keyword.trim();
    if (k.length < 1) {
      // ✅ 최근 사용(이미 rows에 있음)에서 상위 10개
      const recent = Array.from(new Set(rows.map((r) => r.product_food_type ?? "").filter(Boolean))).slice(0, 10);
      setVnItems(recent);
      return;
    }

    // ✅ 2글자 이상이면 DB에서 유사 검색(추천)
    if (k.length >= 2) {
      const { data, error } = await supabase
        .from("products")
        .select("food_type")
        .ilike("food_type", `%${k}%`)
        .order("created_at", { ascending: false })
        .limit(12);

      if (!error) {
        const list = Array.from(new Set((data ?? []).map((d: any) => d.food_type).filter(Boolean)));
        setVnItems(list);
        return;
      }
    }

    // ✅ 1글자일 땐 rows 기반 필터
    const local = Array.from(
      new Set(
        rows
          .map((r) => r.product_food_type ?? "")
          .filter(Boolean)
          .filter((x) => x.toLowerCase().includes(k.toLowerCase()))
      )
    ).slice(0, 12);
    setVnItems(local);
  };

  const normalizeBarcode = (raw: string) => {
    let t = raw || "";
    if (/[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(t)) t = hangulToQwerty(t);

    const cleaned = t
      .trim()
      .replace(/[\u2010\u2011\u2012\u2013\u2014\u2212]/g, "-")
      .toUpperCase()
      .replace(/\s+/g, "")
      .replace(/[^0-9A-Z_-]/g, "");

    return cleaned;
  };

  const toggleSort = (k: "product_name" | "product_food_type" | "barcode") => {
    setSortKey((prev) => {
      if (prev === k) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return prev;
      }
      setSortDir("asc");
      return k;
    });
  };

  const sortedRows = (list: VariantRow[]) => {
    const dir = sortDir === "asc" ? 1 : -1;

    const getVal = (r: VariantRow) => {
      if (sortKey === "product_name") return (r.product_name ?? "").toString();
      if (sortKey === "product_food_type") return (r.product_food_type ?? "").toString();
      return (r.barcode ?? "").toString();
    };

    const arr = [...list];
    arr.sort((a, b) => {
      const av = getVal(a);
      const bv = getVal(b);
      const cmp = av.localeCompare(bv, "ko", { sensitivity: "base" });
      if (cmp !== 0) return cmp * dir;
      return (a.variant_id ?? "").localeCompare(b.variant_id ?? "", "en") * dir;
    });
    return arr;
  };

  const getSortIndicator = (k: "product_name" | "product_food_type" | "barcode") => {
    if (sortKey !== k) return "";
    return sortDir === "asc" ? " ▲" : " ▼";
  };

  const downloadCsv = (dataRows: VariantRow[]) => {
    const header = ["제품명", "식품유형", "바코드"];
    const lines = [header.join(",")];

    for (const r of dataRows) {
      const pn = (r.product_name ?? "").toString().replace(/"/g, '""');
      const ft = (r.product_food_type ?? "").toString().replace(/"/g, '""');
      const bc = (r.barcode ?? "").toString().replace(/"/g, '""');
      lines.push([`"${pn}"`, `"${ft}"`, `"${bc}"`].join(","));
    }

    const csv = "\uFEFF" + lines.join("\n"); // ✅ BOM for Excel
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `products_barcodes_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);
  };

  const printList = (dataRows: VariantRow[]) => {
    const esc = (s: string) =>
      (s ?? "")
        .toString()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

    const htmlRows = dataRows
      .map(
        (r) => `
<tr>
  <td>${esc(r.product_name ?? "")}</td>
  <td>${esc(r.product_food_type ?? "")}</td>
  <td style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;">${esc(r.barcode ?? "")}</td>
</tr>`
      )
      .join("");

    const html = `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>제품명/바코드 등록 목록</title>
  <style>
    body { font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,'Apple SD Gothic Neo','Noto Sans KR',sans-serif; padding: 16px; }
    h1 { font-size: 18px; margin: 0 0 12px 0; }
    .meta { color: #666; font-size: 12px; margin-bottom: 12px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background: #f5f5f5; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <h1>제품명/바코드 등록 목록</h1>
  <div class="meta">총 ${dataRows.length}건 · 출력일: ${new Date().toLocaleString()}</div>
  <table>
    <thead>
      <tr>
        <th>제품명</th>
        <th>식품유형</th>
        <th>바코드</th>
      </tr>
    </thead>
    <tbody>
      ${htmlRows}
    </tbody>
  </table>
</body>
</html>
`;

    const w = window.open("", "_blank", "noopener,noreferrer");
    if (!w) {
      alert("팝업이 차단되어 인쇄 창을 열 수 없습니다. 팝업 차단을 해제해 주세요.");
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  };

  const findBarcodeOwnerName = async (variantId: string) => {
    const { data: v, error: vErr } = await supabase.from("product_variants").select("id, product_id").eq("id", variantId).maybeSingle();
    if (vErr || !v?.product_id) return null;

    const { data: p, error: pErr } = await supabase.from("products").select("name").eq("id", v.product_id).maybeSingle();
    if (pErr) return null;

    return p?.name ?? null;
  };

  const load = async () => {
    setMsg(null);

    // ✅ 1) variants 먼저 로드 (관계 인식 문제 회피)
    const { data: vData, error: vErr } = await supabase
      .from("product_variants")
      .select("id, variant_name, pack_unit, product_id, products(name, category, food_type)")
      .order("created_at", { ascending: false })
      .limit(200);

    if (vErr) {
      setMsg(vErr.message);
      setRows([]);
      return;
    }

    const variantIds = (vData ?? []).map((r: any) => r.id).filter(Boolean);

    // ✅ 2) barcodes를 따로 로드해서 매핑 (is_active가 NULL인 데이터도 포함되도록)
    let bcMap = new Map<string, string>();

    if (variantIds.length > 0) {
      const { data: bData, error: bErr } = await supabase
        .from("product_barcodes")
        .select("variant_id, barcode, is_primary, is_active, created_at")
        .in("variant_id", variantIds);

      if (bErr) {
        setMsg(bErr.message);
      } else {
        const byVariant = new Map<string, any[]>();
        for (const b of bData ?? []) {
          if (!b?.variant_id) continue;

          // ✅ is_active=false는 제외, NULL/true는 포함
          if (b.is_active === false) continue;

          const arr = byVariant.get(b.variant_id) ?? [];
          arr.push(b);
          byVariant.set(b.variant_id, arr);
        }

        for (const [vid, arr] of byVariant.entries()) {
          const sorted = [...arr].sort((a: any, b: any) => {
            const ap = a?.is_primary ? 1 : 0;
            const bp = b?.is_primary ? 1 : 0;
            if (ap !== bp) return bp - ap;
            const at = a?.created_at ? new Date(a.created_at).getTime() : 0;
            const bt = b?.created_at ? new Date(b.created_at).getTime() : 0;
            return bt - at;
          });

          const picked = sorted[0];
          if (picked?.barcode) bcMap.set(vid, String(picked.barcode));
        }
      }
    }

    const mapped: VariantRow[] = (vData ?? []).map((r: any) => ({
      variant_id: r.id,
      product_id: r.product_id,
      product_name: r.products?.name ?? "",
      product_category: r.products?.category ?? null,
      product_food_type: r.products?.food_type ?? null,
      variant_name: r.variant_name,
      barcode: bcMap.get(r.id) ?? "",
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

      const { data: lots, error: lotErr } = await supabase.from("lots").select("id").eq("variant_id", variant_id).limit(50);
      if (lotErr) throw lotErr;

      const lotIds = (lots ?? []).map((l: any) => l.id);

      if (lotIds.length > 0) {
        const { data: mv, error: mvErr } = await supabase.from("movements").select("id").in("lot_id", lotIds).limit(1);
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

  const saveRowBarcode = async (variant_id: string) => {
    setMsg(null);

    const draft = rowBarcodeDraft[variant_id] ?? "";
    const bc = normalizeBarcode(draft);

    if (!bc) {
      setMsg("바코드를 입력하세요.");
      return;
    }

    setLoading(true);
    try {
      // ✅ 1) 바코드 중복 체크
      const { data: exist, error: existErr } = await supabase
        .from("product_barcodes")
        .select("id, variant_id, is_primary, is_active")
        .eq("barcode", bc)
        .maybeSingle();

      if (existErr) throw existErr;

      if (exist && exist.variant_id !== variant_id) {
        const ownerName = await findBarcodeOwnerName(exist.variant_id as string);

        if (exist.is_active === false) {
          const ok = confirm(
            "⚠️ 이미 등록된 바코드입니다. (현재 비활성 상태)\n\n" +
              `바코드: ${bc}\n` +
              `기존 제품: ${ownerName ?? "(확인불가)"}\n\n` +
              "이 바코드를 현재 제품으로 재등록(재할당 + 활성화) 하시겠습니까?\n\n" +
              "※ 취소를 누르면 아무 변경도 하지 않습니다."
          );
          if (!ok) return;

          // ✅ 현재 variant의 기존 바코드들을 primary 해제
          const { error: unPrimaryErr } = await supabase.from("product_barcodes").update({ is_primary: false }).eq("variant_id", variant_id);
          if (unPrimaryErr) throw unPrimaryErr;

          // ✅ product_variants.barcode 갱신
          const { error: vUpdErr } = await supabase.from("product_variants").update({ barcode: bc }).eq("id", variant_id);
          if (vUpdErr) throw vUpdErr;

          // ✅ 기존(비활성) 바코드 row를 현재 variant로 재할당 + 활성화 + primary
          const { error: moveErr } = await supabase
            .from("product_barcodes")
            .update({ variant_id: variant_id, is_primary: true, is_active: true })
            .eq("id", exist.id);
          if (moveErr) throw moveErr;

          setRowBarcodeDraft((prev) => {
            const next = { ...prev };
            delete next[variant_id];
            return next;
          });

          setMsg("바코드가 재등록(활성화)되었습니다 ✅");
          await load();
          return;
        }

        alert(`⚠️ 이미 등록된 바코드입니다.\n\n바코드: ${bc}\n기존 제품: ${ownerName ?? "(확인불가)"}\n\n다른 바코드를 입력해 주세요.`);
        return;
      }

      // ✅ 2) 이 variant의 기존 바코드들을 primary 해제
      const { error: unPrimaryErr } = await supabase.from("product_barcodes").update({ is_primary: false }).eq("variant_id", variant_id);
      if (unPrimaryErr) throw unPrimaryErr;

      // ✅ 3) product_variants.barcode도 같이 갱신(일관성 유지)
      const { error: vUpdErr } = await supabase.from("product_variants").update({ barcode: bc }).eq("id", variant_id);
      if (vUpdErr) throw vUpdErr;

      if (exist?.id) {
        const { error: bcUpdErr } = await supabase.from("product_barcodes").update({ is_primary: true, is_active: true }).eq("id", exist.id);
        if (bcUpdErr) throw bcUpdErr;
      } else {
        const { error: bcInsErr } = await supabase.from("product_barcodes").insert({
          variant_id,
          barcode: bc,
          is_primary: true,
          is_active: true,
        });
        if (bcInsErr) throw bcInsErr;
      }

      setRowBarcodeDraft((prev) => {
        const next = { ...prev };
        delete next[variant_id];
        return next;
      });

      setMsg("바코드가 저장되었습니다 ✅");
      await load();
    } catch (e: any) {
      setMsg(e?.message ?? "저장 중 오류");
    } finally {
      setLoading(false);
    }
  };

  const upsertProductAndVariant = async () => {
    setMsg(null);

    const pn = productName.trim();
    const ct = String(category || "").trim();
    const vn = variantName.trim(); // ✅ products.food_type로 저장
    const bc = normalizeBarcode(barcode);
    const pu = Number.isFinite(packUnit) ? Math.floor(packUnit) : 0;

    if (!pn) return setMsg("제품명을 입력하세요.");
    if (!ct) return setMsg("구분을 선택하세요.");
    if (!vn) return setMsg("식품유형을 입력하세요.");
    if (!bc) return setMsg("바코드를 입력하세요.");
    if (!pu || pu < 1) return setMsg("수량은 1 이상 숫자여야 합니다.");

    setLoading(true);

    try {
      /* -------------------------------------------------
         1️⃣ 바코드 존재 확인 (비활성 포함 조회)
      ------------------------------------------------- */
      const { data: existBarcodeAny, error: existErr } = await supabase
        .from("product_barcodes")
        .select("id, variant_id, is_active")
        .eq("barcode", bc)
        .maybeSingle();

      if (existErr) throw existErr;

      /* -------------------------------------------------
         2️⃣ 제품(products) 조회 or 생성 (+ food_type 저장/갱신)
      ------------------------------------------------- */
      const { data: existingProduct, error: pSelErr } = await supabase.from("products").select("id, food_type").eq("name", pn).eq("category", ct).maybeSingle();
      if (pSelErr) throw pSelErr;

      let productId = existingProduct?.id as string | undefined;

      if (!productId) {
        const { data: pIns, error: pInsErr } = await supabase.from("products").insert({ name: pn, category: ct, food_type: vn }).select("id").single();
        if (pInsErr) throw pInsErr;
        productId = pIns.id;
      } else {
        if ((existingProduct?.food_type ?? "") !== vn) {
          const { error: pUpdErr } = await supabase.from("products").update({ food_type: vn }).eq("id", productId);
          if (pUpdErr) throw pUpdErr;
        }
      }

      /* -------------------------------------------------
         3️⃣ 바코드가 이미 존재하면 (활성/비활성 분기)
      ------------------------------------------------- */
      if (existBarcodeAny) {
        const ownerName = await findBarcodeOwnerName(existBarcodeAny.variant_id as string);

        // ✅ 비활성인 경우: 재할당 + 활성화 가능
        if (existBarcodeAny.is_active === false) {
          const ok = confirm(
            "⚠️ 이미 등록된 바코드입니다. (현재 비활성 상태)\n\n" +
              `바코드: ${bc}\n` +
              `기존 제품: ${ownerName ?? "(확인불가)"}\n\n` +
              "이 바코드를 새로 입력한 제품으로 재등록(재할당 + 활성화) 하시겠습니까?\n\n" +
              "※ 취소를 누르면 아무 변경도 하지 않습니다."
          );
          if (!ok) return;

          // ✅ 새 variant 생성
          const { data: vIns, error: vInsErr } = await supabase
            .from("product_variants")
            .insert({
              product_id: productId,
              variant_name: vn,
              pack_unit: pu,
              barcode: bc,
            })
            .select("id")
            .single();

          if (vInsErr) throw vInsErr;

          // ✅ 새 variant 바코드들 primary 해제(안전)
          const { error: unPrimaryErr } = await supabase.from("product_barcodes").update({ is_primary: false }).eq("variant_id", vIns.id);
          if (unPrimaryErr) throw unPrimaryErr;

          // ✅ 기존(비활성) 바코드 row를 새 variant로 재할당 + 활성화 + primary
          const { error: moveErr } = await supabase
            .from("product_barcodes")
            .update({ variant_id: vIns.id, is_primary: true, is_active: true })
            .eq("id", existBarcodeAny.id);

          if (moveErr) throw moveErr;

          setMsg("비활성 바코드를 재등록(활성화)했습니다 ✅");

          setVariantName("");
          setBarcode("");
          requestAnimationFrame(() => {
            barcodeRef.current?.focus();
            barcodeRef.current?.select();
          });

          await load();
          return;
        }

        // ✅ 활성(또는 NULL/true)인 경우: 기존 갱신(confirm) 방식 유지
        const ok = confirm(
          "⚠️ 이미 등록된 바코드입니다.\n\n" +
            `바코드: ${bc}\n` +
            `기존 제품: ${ownerName ?? "(확인불가)"}\n\n` +
            "기존 정보를 새로 입력한 내용으로 수정하시겠습니까?\n\n" +
            "※ 취소를 누르면 아무 변경도 하지 않습니다."
        );
        if (!ok) return;

        const variantId = existBarcodeAny.variant_id as string;

        const { error: updErr } = await supabase
          .from("product_variants")
          .update({
            product_id: productId,
            variant_name: vn,
            pack_unit: pu,
            barcode: bc,
          })
          .eq("id", variantId);

        if (updErr) throw updErr;

        const { error: unPrimaryErr } = await supabase.from("product_barcodes").update({ is_primary: false }).eq("variant_id", variantId);
        if (unPrimaryErr) throw unPrimaryErr;

        const { error: bcUpdErr } = await supabase.from("product_barcodes").update({ is_primary: true, is_active: true }).eq("id", existBarcodeAny.id);
        if (bcUpdErr) throw bcUpdErr;

        setMsg("기존 바코드 정보가 수정되었습니다 ✏️");

        setVariantName("");
        setBarcode("");
        requestAnimationFrame(() => {
          barcodeRef.current?.focus();
          barcodeRef.current?.select();
        });

        await load();
        return;
      }

      /* -------------------------------------------------
         4️⃣ 신규 등록
      ------------------------------------------------- */
      const { data: vIns, error: vInsErr } = await supabase
        .from("product_variants")
        .insert({
          product_id: productId,
          variant_name: vn,
          pack_unit: pu,
          barcode: bc,
        })
        .select("id")
        .single();

      if (vInsErr) throw vInsErr;

      const { error: bcInsErr } = await supabase.from("product_barcodes").insert({
        variant_id: vIns.id,
        barcode: bc,
        is_primary: true,
        is_active: true,
      });

      if (bcInsErr) throw bcInsErr;

      setMsg("신규 바코드가 등록되었습니다 ✅");

      setVariantName("");
      setBarcode("");
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
        return r.product_name.toLowerCase().includes(t) || (r.product_food_type ?? "").toLowerCase().includes(t) || r.barcode.toLowerCase().includes(t);
      })
    : rows;

  const displayRows = sortedRows(filtered);
  const exportRows = sortedRows(rows);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">제품명/바코드 등록</h1>
        <div className="flex gap-2">
          <a className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 active:bg-slate-200" href="/scan">
            스캔
          </a>
          <a className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 active:bg-slate-200" href="/">
            홈
          </a>
        </div>
      </div>

      <p className="text-slate-600 mt-2">제품명 + 식품유형 + 바코드 + 수량을 등록합니다. (바코드는 중복 불가)</p>

      <div className="mt-6 max-w-2xl grid gap-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm text-slate-600">제품명</label>
            <input
              className="mt-1 w-full rounded-xl bg-white border border-slate-200 px-3 py-2 outline-none text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              placeholder="예: 생일축하"
            />
          </div>

          <div>
            <label className="text-sm text-slate-600 block mb-2">구분</label>
            <div className="flex gap-2">
              {CATEGORIES.map((c) => {
                const checked = category === c;
                return (
                  <label
                    key={c}
                    className={[
                      "flex items-center gap-2 cursor-pointer select-none rounded-xl px-3 py-2 border",
                      checked ? "bg-blue-600 text-white border-blue-600 shadow" : "bg-white text-slate-700 border-slate-300 hover:bg-slate-100",
                    ].join(" ")}
                  >
                    <input
                      type="radio"
                      name="category"
                      value={c}
                      checked={checked}
                      onChange={(e) => setCategory(e.target.value as any)}
                      className="accent-blue-600"
                    />
                    <span className="text-sm font-medium">{c}</span>
                    <span className={["ml-1 text-xs rounded-md px-2 py-0.5", checked ? "bg-white/20" : "hidden"].join(" ")}>선택됨</span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div ref={vnWrapRef} className="relative">
            <label className="text-sm text-slate-600">식품유형</label>
            <input
              className="mt-1 w-full rounded-xl bg-white border border-slate-200 px-3 py-2 outline-none text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300"
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
              <div className="absolute z-50 mt-2 w-full rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
                <div className="max-h-60 overflow-auto">
                  {vnItems.map((item, idx) => {
                    const active = idx === vnActive;
                    return (
                      <button
                        key={`${item}-${idx}`}
                        type="button"
                        className={["w-full text-left px-3 py-2 text-sm", active ? "bg-blue-600 text-white" : "hover:bg-slate-100 text-slate-800"].join(" ")}
                        onMouseEnter={() => setVnActive(idx)}
                        onMouseDown={(e) => e.preventDefault()}
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
            <label className="text-sm text-slate-600">수량(ea)</label>
            <input
              className="mt-1 w-full rounded-xl bg-white border border-slate-200 px-3 py-2 outline-none text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300"
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
            <label className="text-sm text-slate-600 flex items-center justify-between">
              <span>바코드</span>
              <button
                type="button"
                className={[
                  "text-xs rounded-lg border px-2 py-1 transition",
                  isScanMode ? "bg-blue-600 text-white border-blue-600 shadow" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100",
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
              ref={barcodeRef}
              className={[
                "mt-1 w-full rounded-xl bg-white border px-3 py-2 outline-none font-mono text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20",
                isScanMode ? "border-blue-300" : "border-slate-200",
              ].join(" ")}
              value={barcode}
              placeholder="바코드를 입력하세요."
              onChange={(e) => {
                if (isScanMode) return;
                setBarcode(normalizeBarcode(e.target.value));
              }}
              onFocus={(e) => e.currentTarget.select()}
              onKeyDown={(e) => {
                if (!isScanMode) return;
                if (e.repeat) return;

                if (e.key === "Enter") {
                  e.preventDefault();
                  upsertProductAndVariant();
                  return;
                }

                if (e.key === "Backspace") {
                  e.preventDefault();
                  setBarcode((prev) => prev.slice(0, -1));
                  return;
                }

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
                  const base = prev && gap > SCAN_GAP_MS ? "" : prev;
                  const next = (base + ch).toUpperCase().replace(/[^0-9A-Z_-]/g, "");
                  return next;
                });
              }}
              onPaste={(e) => {
                e.preventDefault();
                const text = e.clipboardData.getData("text") || "";
                const cleaned = normalizeBarcode(text);
                setBarcode(cleaned);
              }}
            />
          </div>
        </div>

        {msg ? <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">{msg}</div> : null}

        <div className="flex gap-2">
          <button
            className="rounded-xl bg-blue-600 text-white px-4 py-2 font-medium hover:bg-blue-700 active:bg-blue-800 disabled:opacity-60"
            disabled={loading}
            onClick={upsertProductAndVariant}
          >
            {loading ? "저장 중..." : "등록"}
          </button>

          <button className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-slate-700 hover:bg-slate-100 active:bg-slate-200" onClick={load}>
            새로고침
          </button>
        </div>
      </div>

      <div className="mt-10">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">등록 목록</h2>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 active:bg-slate-200 disabled:opacity-60"
              disabled={loading}
              onClick={() => printList(exportRows)}
            >
              인쇄
            </button>

            <button
              type="button"
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 active:bg-slate-200 disabled:opacity-60"
              disabled={loading}
              onClick={() => downloadCsv(exportRows)}
            >
              엑셀다운로드
            </button>

            <input
              className="w-full max-w-sm rounded-xl bg-white border border-slate-200 px-3 py-2 outline-none text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="검색(제품명/식품유형/바코드)"
              onFocus={() => setIsScanMode(false)}
            />
          </div>
        </div>

        <div className="mt-3 rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-left p-3">
                  <button type="button" className="hover:underline" onClick={() => toggleSort("product_name")}>
                    제품명{getSortIndicator("product_name")}
                  </button>
                </th>
                <th className="text-left p-3">
                  <button type="button" className="hover:underline" onClick={() => toggleSort("product_food_type")}>
                    식품유형{getSortIndicator("product_food_type")}
                  </button>
                </th>
                <th className="text-left p-3">
                  <button type="button" className="hover:underline" onClick={() => toggleSort("barcode")}>
                    바코드{getSortIndicator("barcode")}
                  </button>
                </th>
                <th className="text-right p-3">관리</th>
              </tr>
            </thead>
            <tbody>
              {displayRows.length === 0 ? (
                <tr>
                  <td className="p-3 text-slate-500" colSpan={4}>
                    등록된 데이터가 없습니다.
                  </td>
                </tr>
              ) : (
                displayRows.map((r) => (
                  <tr key={r.variant_id} className="border-t border-slate-200">
                    <td className="p-3">{r.product_name}</td>
                    <td className="p-3">{r.product_food_type ?? "-"}</td>
                    <td className="p-3 font-mono">
                      {r.barcode ? (
                        r.barcode
                      ) : (
                        <div className="flex items-center gap-2">
                          <input
                            className="w-full max-w-xs rounded-lg bg-white border border-slate-200 px-2 py-1 outline-none font-mono text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300"
                            value={rowBarcodeDraft[r.variant_id] ?? ""}
                            onChange={(e) => {
                              const next = e.target.value;
                              setRowBarcodeDraft((prev) => ({ ...prev, [r.variant_id]: next }));
                            }}
                            placeholder="바코드 입력"
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                saveRowBarcode(r.variant_id);
                              }
                            }}
                            onPaste={(e) => {
                              const text = e.clipboardData.getData("text") || "";
                              const cleaned = normalizeBarcode(text);
                              e.preventDefault();
                              setRowBarcodeDraft((prev) => ({ ...prev, [r.variant_id]: cleaned }));
                            }}
                          />
                          <button
                            className="rounded-lg bg-blue-600 text-white px-3 py-1 text-xs font-medium hover:bg-blue-700 active:bg-blue-800 disabled:opacity-60"
                            disabled={loading}
                            onClick={() => saveRowBarcode(r.variant_id)}
                          >
                            저장
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      <button
                        className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs text-slate-700 hover:bg-slate-100 active:bg-slate-200 disabled:opacity-60"
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

        <p className="text-xs text-slate-500 mt-3">※ 바코드는 유니크입니다. 같은 바코드를 다시 등록하면 해당 바코드의 정보가 갱신됩니다.</p>
      </div>
    </div>
  );
}