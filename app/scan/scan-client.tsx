"use client";

import { createClient } from "@/lib/supabase/browser";
import { useEffect, useMemo, useRef, useState } from "react";

type MovementType = "IN" | "OUT" | "DISCARD" | "GIFT";

type LotRow = {
  lot_id: string;
  product_id: string;
  product_name: string;
  product_category: string | null; // 화면에 "구분"으로 표시
  variant_id: string;
  variant_name: string;
  barcode: string;
  expiry_date: string;
  pack_unit: number; // (참고 정보로만 유지)
  stock_qty: number; // EA(낱개) 기준 재고
};

type VariantInfo = {
  variant_id: string;
  product_name: string;
  product_category: string | null;
  variant_name: string;
  barcode: string;
  pack_unit: number; // (참고 정보로만 유지)
};

type CartRow = {
  id: string; // client-side id
  type: MovementType;
  barcode: string;
  expiry: string; // IN/DISCARD만 의미있음
  qty_ea: number; // ✅ EA 수량(박스 개념 제거)
  note: string;

  // 표시용(조회된 정보)
  variantInfo: VariantInfo;
};

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

function isEditableInput(
  el: Element | null
): el is HTMLInputElement | HTMLTextAreaElement {
  if (!el) return false;
  const tag = el.tagName?.toLowerCase();
  if (tag === "textarea") return true;
  if (tag !== "input") return false;
  const input = el as HTMLInputElement;
  const t = (input.type || "text").toLowerCase();
  return ["text", "search", "tel", "url", "email", "number", "password"].includes(t);
}

export default function ScanClient() {
  const supabase = useMemo(() => createClient(), []);

  const [barcode, setBarcode] = useState("");
  const [type, setType] = useState<MovementType>("IN");

  // ✅ 박스 개념 제거: EA 수량만 입력
  const [qtyEa, setQtyEa] = useState(1);

  // IN/DISCARD는 소비기한 필수
  const [expiry, setExpiry] = useState(""); // YYYY-MM-DD
  const [note, setNote] = useState("");

  const [lots, setLots] = useState<LotRow[]>([]);
  const [variantInfo, setVariantInfo] = useState<VariantInfo | null>(null);

  const [cart, setCart] = useState<CartRow[]>([]);

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const barcodeRef = useRef<HTMLInputElement | null>(null);
  const lotsSectionRef = useRef<HTMLDivElement | null>(null);

  const focusBarcode = () => requestAnimationFrame(() => barcodeRef.current?.focus());

  useEffect(() => {
    focusBarcode();
  }, []);

  useEffect(() => {
    // OUT/GIFT는 소비기한 입력 없음
    if (type === "OUT" || type === "GIFT") setExpiry("");
  }, [type]);

  const expiryDisabled = type === "OUT" || type === "GIFT";

  const scrollToLots = () => {
    requestAnimationFrame(() => {
      lotsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  // variants에서 "등록 여부 + 제품정보" 확인 (LOT가 없어도 확인 가능)
  const fetchVariantInfo = async (code: string): Promise<VariantInfo | null> => {
    const { data, error } = await supabase
      .from("product_variants")
      .select("id, variant_name, barcode, pack_unit, products(name, category)")
      .eq("barcode", code)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return null;

    const p = (data as any).products;
    return {
      variant_id: data.id as string,
      product_name: (p?.name ?? "") as string,
      product_category: (p?.category ?? null) as string | null,
      variant_name: (data as any).variant_name ?? "",
      barcode: (data as any).barcode ?? code,
      pack_unit: intMin((data as any).pack_unit ?? 1, 1),
    };
  };

  // 재고 조회(LOT 표시) + LOT 없으면 variants로 fallback
  const searchLotsByCode = async (raw: string) => {
    setMsg(null);

    const code = normalizeBarcode(raw);
    if (!code) {
      setLots([]);
      setVariantInfo(null);
      return;
    }

    try {
      const vInfo = await fetchVariantInfo(code);
      setVariantInfo(vInfo);

      if (!vInfo) {
        setLots([]);
        setMsg(`바코드 ${code} 는 등록되지 않았습니다.`);
        return;
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
      .eq("barcode", code)
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
      setMsg(`등록됨 ✅ (입고/소비기한 LOT 없음) : ${code}`);
    } else {
      setMsg(`조회 완료 ✅ ${rows.length}건 (${code})`);
    }

    scrollToLots();
  };

  // 스캔(입력)하면 자동 조회 (디바운스)
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

  // FEFO LOT 목록(폴백용)
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

  // ✅ 장바구니에 추가
  const addToCart = async (overrideRawBarcode?: string) => {
    setMsg(null);

    const code = normalizeBarcode(overrideRawBarcode ?? barcode);
    try {
      if (!code) throw new Error("바코드를 입력하세요.");

      const qty = intMin(qtyEa, 1);
      const vInfo = await fetchVariantInfo(code);
      if (!vInfo) throw new Error("등록되지 않은 바코드입니다. (품목관리에서 먼저 등록)");

      const needExpiry = type === "IN" || type === "DISCARD";
      const exp = needExpiry ? expiry : "";

      if (needExpiry) {
        if (!exp) throw new Error("소비기한을 입력하세요. (입고/폐기)");
        if (!isValidDateYYYYMMDD(exp)) throw new Error("소비기한 형식은 YYYY-MM-DD 입니다.");
      }

      setCart((prev) => {
        const keyMatch = (r: CartRow) => {
          if (r.type !== type) return false;
          if (r.barcode !== code) return false;
          if (needExpiry) return r.expiry === exp;
          return true;
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
          },
        ];
      });

      setVariantInfo(vInfo);

      setBarcode("");
      setQtyEa(1);
      setNote("");

      setMsg(`목록에 추가 ✅ (${type}) ${code} / 수량 ${fmtInt(qty)}EA`);
      focusBarcode();
    } catch (e: any) {
      setMsg(e?.message ?? "목록 추가 중 오류");
      focusBarcode();
    }
  };

  // ✅ OUT/GIFT 저장 (EA 기준)
  const issueOutGift = async (row: CartRow) => {
    const requestEA = intMin(row.qty_ea, 1);

    const { error: rpcErr } = await supabase.rpc("fefo_issue_by_barcode", {
      p_barcode: row.barcode,
      p_type: row.type,
      p_qty_ea: requestEA,
      p_note: row.note || null,
    });

    if (!rpcErr) return { requestEA };

    // 폴백: FEFO 분할 insert
    const fefoLots = await pickFefoLots(row.barcode);
    if (fefoLots.length === 0) throw new Error(`출고/증정 가능한 재고가 없습니다. (재고 0) : ${row.barcode}`);

    const totalEA = fefoLots.reduce((sum, r) => sum + intMin(r.stock_qty ?? 0, 0), 0);
    if (requestEA > totalEA) {
      throw new Error(`재고 부족(${row.barcode}): 총 ${fmtInt(totalEA)}EA / 요청 ${fmtInt(requestEA)}EA`);
    }

    let remain = requestEA;
    const inserts: { lot_id: string; type: MovementType; qty: number; note?: string | null }[] = [];

    for (const lot of fefoLots) {
      if (remain <= 0) break;
      const can = intMin(lot.stock_qty ?? 0, 0);
      if (can <= 0) continue;

      const use = Math.min(can, remain);
      inserts.push({ lot_id: lot.lot_id, type: row.type, qty: use, note: row.note || null });
      remain -= use;
    }

    if (remain !== 0) throw new Error(`FEFO 분할 차감 계산 오류(${row.barcode})`);

    const { error: mErr } = await supabase.from("movements").insert(inserts);
    if (mErr) throw new Error(mErr.message);

    return { requestEA };
  };

  // ✅ IN/DISCARD 저장 (EA 기준)
  const saveInDiscard = async (row: CartRow) => {
    if (!row.expiry) throw new Error(`소비기한 누락: ${row.barcode}`);
    if (!isValidDateYYYYMMDD(row.expiry)) throw new Error(`소비기한 형식 오류: ${row.barcode} (${row.expiry})`);

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

    const { error: mErr } = await supabase.from("movements").insert({
      lot_id: (lot as any).id,
      type: row.type,
      qty: eachQty,
      note: row.note || null,
    });

    if (mErr) throw new Error(mErr.message);

    return { eachQty };
  };

  // ✅ 일괄 저장
  const commitCart = async () => {
    setMsg(null);
    if (cart.length === 0) {
      setMsg("저장할 목록이 없습니다.");
      focusBarcode();
      return;
    }

    for (const r of cart) {
      if (r.type === "IN" || r.type === "DISCARD") {
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
        } else {
          await saveInDiscard(row);
        }
        okCount += 1;
      }

      setMsg(`일괄 저장 완료 ✅ ${okCount}건`);
      setCart([]);
      focusBarcode();
    } catch (e: any) {
      setMsg(e?.message ?? "일괄 저장 중 오류");
      focusBarcode();
    } finally {
      setLoading(false);
    }
  };

  /**
   * ✅ 스캐너 오입력 방지(중요)
   */
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
        if (typeof st.snapshotSelStart === "number" && typeof st.snapshotSelEnd === "number") {
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
            if (cartField === "note") return { ...x, note: st.snapshotValue ?? "" };
            if (cartField === "expiry") return { ...x, expiry: st.snapshotValue ?? "" };
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
          const n = parseInt(st.snapshotValue || "1", 10);
          setQtyEa(intMin(n, 1));
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
      if (key === "Shift" || key === "Alt" || key === "Control" || key === "Meta") return;

      const now = Date.now();
      const st = scanStateRef.current;

      const active = document.activeElement;
      const isBarcodeFocused = active === barcodeRef.current;

      if (st.buf && now - st.lastAt > RESET_GAP_MS) reset();

      if (key.length === 1) {
        if (!st.buf) {
          st.startedAt = now;
          st.activeEl = !isBarcodeFocused && isEditableInput(active) ? (active as any) : null;

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

        const code = normalizeBarcode(st.buf);
        const isScan = code && looksLikeScanner(st, now);

        if (isScan) {
          e.preventDefault();
          e.stopPropagation();

          restoreDomIfNeeded();
          restoreStateIfNeeded();

          setBarcode(code);
          void addToCart(code);

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

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <h1 className="text-2xl font-semibold">스캔 입력</h1>
      <p className="text-white/60 mt-2">
        - 모든 유형(IN/OUT/GIFT/DISCARD): 수량은 “EA(낱개)” 기준으로 입력<br />
        - 입고/폐기: 소비기한 입력 필요 / 출고/증정: FEFO로 소비기한 자동 선택<br />
        - ✅ 스캐너 입력은 어떤 칸에 커서가 있어도 바코드로 처리됩니다. (비고 포함)
      </p>

      <div className="mt-6 grid gap-3 max-w-3xl">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-2">
            <label className="text-sm text-white/70">바코드</label>
            <input
              ref={barcodeRef}
              className="mt-1 w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 outline-none"
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

            {normalizeBarcode(barcode) && (
              <div className="mt-2 rounded-xl border border-white/10 bg-white/5 p-3 text-sm">
                {variantInfo ? (
                  <div className="flex flex-col gap-1">
                    <div className="text-white/80">
                      <span className="text-white/50">제품명:</span>{" "}
                      <span className="font-semibold">{variantInfo.product_name || "-"}</span>
                    </div>
                    <div className="text-white/70">
                      <span className="text-white/50">옵션:</span> {variantInfo.variant_name || "-"}
                    </div>
                    <div className="text-white/70">
                      <span className="text-white/50">바코드:</span> {variantInfo.barcode}
                    </div>
                    {/* pack_unit은 참고 정보로만 */}
                    <div className="text-white/70">
                      <span className="text-white/50">참고(포장단위):</span> {variantInfo.pack_unit} EA/BOX
                    </div>
                    {lots.length === 0 && (
                      <div className="text-white/60 mt-1">※ 등록은 되어있지만, 아직 입고(소비기한 LOT)가 없습니다.</div>
                    )}
                  </div>
                ) : (
                  <div className="text-white/70">
                    바코드 <span className="text-white/90">{normalizeBarcode(barcode)}</span> 조회 중… 또는 등록되지 않았습니다.
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="text-sm text-white/70">스캔 목록</div>
            <div className="mt-1 text-2xl font-semibold">{cartTotalLines}건</div>

            {/* ✅ "총 포장수량" 제거 */}

            <div className="mt-3 flex gap-2">
              <button
                className="rounded-xl bg-white text-black px-3 py-2 text-sm font-medium disabled:opacity-60"
                disabled={loading || cart.length === 0}
                onClick={commitCart}
              >
                {loading ? "저장 중..." : "일괄 저장"}
              </button>
              <button
                className="rounded-xl border border-white/15 px-3 py-2 text-sm disabled:opacity-60"
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

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="text-sm text-white/70">유형</label>
            <select
              className="mt-1 w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 outline-none"
              value={type}
              onChange={(e) => setType(e.target.value as MovementType)}
            >
              <option value="IN">입고(IN)</option>
              <option value="OUT">출고(OUT)</option>
              <option value="DISCARD">폐기(DISCARD)</option>
              <option value="GIFT">증정(GIFT)</option>
            </select>
          </div>

          <div>
            <label className="text-sm text-white/70">수량(EA)</label>
            <input
              data-top-field="qtyEa"
              className="mt-1 w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 outline-none"
              type="number"
              min={1}
              value={qtyEa}
              onChange={(e) => setQtyEa(parseInt(e.target.value || "1", 10))}
            />
            <div className="mt-1 text-xs text-white/40">
              저장/재고 계산 기준: <span className="text-white/70">EA(낱개)</span>
            </div>
          </div>

          <div className="md:col-span-2">
            <label className="text-sm text-white/70">
              소비기한 (YYYY-MM-DD)
              {expiryDisabled && <span className="ml-2 text-white/50 text-xs">(출고/증정은 자동 선택)</span>}
            </label>

            <input
              data-top-field="expiry"
              className={[
                "mt-1 w-full rounded-xl bg-black/40 border px-3 py-2 outline-none",
                expiryDisabled ? "border-white/5 text-white/40" : "border-white/10",
              ].join(" ")}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder={expiryDisabled ? "자동 선택됨" : "YYYY-MM-DD"}
              maxLength={10}
              disabled={expiryDisabled}
              value={expiry}
              onChange={(e) => {
                let v = e.target.value.replace(/[^0-9]/g, "");
                if (v.length > 4) v = v.slice(0, 4) + "-" + v.slice(4);
                if (v.length > 7) v = v.slice(0, 7) + "-" + v.slice(7, 9);
                setExpiry(v);
              }}
            />
          </div>
        </div>

        <div>
          <label className="text-sm text-white/70">비고(선택)</label>
          <input
            data-top-field="note"
            className="mt-1 w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 outline-none"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="예: 샘플 입고/출고"
          />
        </div>

        {msg && <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm">{msg}</div>}

        <div className="flex flex-wrap gap-2">
          <button
            className="rounded-xl bg-white text-black px-4 py-2 font-medium disabled:opacity-60"
            disabled={loading}
            onClick={() => addToCart()}
          >
            목록에 추가
          </button>

          <button
            className="rounded-xl border border-white/15 px-4 py-2 disabled:opacity-60"
            onClick={() => searchLotsByCode(barcode)}
            disabled={loading}
          >
            바코드로 재고 조회
          </button>

          <a className="rounded-xl border border-white/15 px-4 py-2" href="/">
            홈
          </a>
        </div>
      </div>

      {/* ✅ 스캔 목록 */}
      <div className="mt-10">
        <h2 className="text-lg font-semibold">스캔 목록 (최종 확인 후 일괄 저장)</h2>

        <div className="mt-3 rounded-2xl border border-white/10 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-white/5">
              <tr>
                <th className="text-left p-3">유형</th>
                <th className="text-left p-3">제품명</th>
                <th className="text-left p-3">구분</th>
                <th className="text-left p-3">옵션</th>
                <th className="text-left p-3">바코드</th>

                {/* ✅ 수량(EA) 1번만 (소비기한 앞) */}
                <th className="text-right p-3">수량(EA)</th>

                <th className="text-left p-3">소비기한</th>
                <th className="text-left p-3">비고</th>
                <th className="text-right p-3">삭제</th>
              </tr>
            </thead>
            <tbody>
              {cart.length === 0 ? (
                <tr>
                  <td className="p-3 text-white/60" colSpan={9}>
                    스캔한 항목이 없습니다. (Enter 또는 “목록에 추가”로 누적됩니다)
                  </td>
                </tr>
              ) : (
                cart.map((r) => {
                  const needExpiry = r.type === "IN" || r.type === "DISCARD";
                  const expiryOk = !needExpiry || isValidDateYYYYMMDD(r.expiry);

                  return (
                    <tr key={r.id} className="border-t border-white/10 align-top">
                      <td className="p-3">{r.type}</td>
                      <td className="p-3">{r.variantInfo.product_name}</td>
                      <td className="p-3">{r.variantInfo.product_category ?? "-"}</td>
                      <td className="p-3">{r.variantInfo.variant_name}</td>
                      <td className="p-3">{r.barcode}</td>

                      {/* ✅ EA 수량만 표시/수정 + 천단위 콤마 */}
                      <td className="p-3 text-right">
                        <input
                          data-cart-id={r.id}
                          data-cart-field="qty_ea"
                          className="w-28 text-right rounded-lg bg-black/40 border border-white/10 px-2 py-1 outline-none"
                          type="number"
                          min={1}
                          value={r.qty_ea}
                          onChange={(e) => {
                            const v = parseInt(e.target.value || "1", 10);
                            setCart((prev) =>
                              prev.map((x) => (x.id === r.id ? { ...x, qty_ea: intMin(v, 1) } : x))
                            );
                          }}
                        />
                        <div className="mt-1 text-xs text-white/50">{fmtInt(r.qty_ea)} EA</div>
                      </td>

                      <td className="p-3">
                        {needExpiry ? (
                          <input
                            data-cart-id={r.id}
                            data-cart-field="expiry"
                            className={[
                              "w-32 rounded-lg bg-black/40 border px-2 py-1 outline-none",
                              expiryOk ? "border-white/10" : "border-red-500/60",
                            ].join(" ")}
                            value={r.expiry}
                            placeholder="YYYY-MM-DD"
                            maxLength={10}
                            onChange={(e) => {
                              let v = e.target.value.replace(/[^0-9]/g, "");
                              if (v.length > 4) v = v.slice(0, 4) + "-" + v.slice(4);
                              if (v.length > 7) v = v.slice(0, 7) + "-" + v.slice(7, 9);
                              setCart((prev) => prev.map((x) => (x.id === r.id ? { ...x, expiry: v } : x)));
                            }}
                          />
                        ) : (
                          <span className="text-white/40">자동(FEFO)</span>
                        )}
                      </td>

                      <td className="p-3">
                        <input
                          data-cart-id={r.id}
                          data-cart-field="note"
                          className="w-56 rounded-lg bg-black/40 border border-white/10 px-2 py-1 outline-none"
                          value={r.note}
                          onChange={(e) => {
                            const v = e.target.value;
                            setCart((prev) => prev.map((x) => (x.id === r.id ? { ...x, note: v } : x)));
                          }}
                          placeholder="비고"
                        />
                      </td>

                      <td className="p-3 text-right">
                        <button
                          className="rounded-lg border border-white/15 px-2 py-1 text-xs"
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
          <button
            className="rounded-xl bg-white text-black px-4 py-2 font-medium disabled:opacity-60"
            disabled={loading || cart.length === 0}
            onClick={commitCart}
          >
            {loading ? "저장 중..." : "일괄 저장"}
          </button>

          <button
            className="rounded-xl border border-white/15 px-4 py-2 disabled:opacity-60"
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

        <div className="mt-2 text-xs text-white/40">
          ※ 수량/재고/저장 계산은 모두 <span className="text-white/70">EA(낱개)</span> 기준입니다. OUT/GIFT는 FEFO로 자동 차감됩니다.
        </div>
      </div>

      {/* ✅ 재고 테이블 */}
      <div className="mt-10" ref={lotsSectionRef}>
        <h2 className="text-lg font-semibold">해당 바코드 LOT 재고</h2>

        <div className="mt-3 rounded-2xl border border-white/10 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-white/5">
              <tr>
                <th className="text-left p-3">제품명</th>
                <th className="text-left p-3">구분</th>
                <th className="text-left p-3">소비기한</th>
                <th className="text-right p-3">재고(EA)</th>
              </tr>
            </thead>
            <tbody>
              {lots.length === 0 ? (
                <tr>
                  <td className="p-3 text-white/60" colSpan={4}>
                    바코드를 스캔하면 자동으로 조회됩니다. (재고 0 LOT은 표시되지 않습니다)
                  </td>
                </tr>
              ) : (
                lots.map((r) => (
                  <tr key={r.lot_id} className="border-t border-white/10">
                    <td className="p-3">{r.product_name}</td>
                    <td className="p-3">{r.product_category ?? "-"}</td>
                    <td className="p-3">{r.expiry_date}</td>
                    <td className="p-3 text-right">{fmtInt(intMin(r.stock_qty ?? 0, 0))}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {variantInfo && (
          <div className="mt-2 text-xs text-white/40">
            ※ 참고(품목 등록값): ea/box={variantInfo.pack_unit} (현재 화면/저장은 EA만 사용)
          </div>
        )}
      </div>
    </div>
  );
}