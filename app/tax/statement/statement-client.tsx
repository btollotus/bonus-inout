
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

type PartnerRow = {
  id: string;
  name: string;
  business_no: string | null;
  ceo_name: string | null;
  biz_type: string | null;
  biz_item: string | null;
  address1: string | null;
};

type OrderRow = {
  id: string;
  customer_id: string | null;
  customer_name: string | null;
  ship_date: string | null;
  ship_method: string | null;
  memo: string | null;
  supply_amount: number | null;
  vat_amount: number | null;
  total_amount: number | null;
  created_at: string;
};

type LineLoose = Record<string, any>;

type SpecLine = {
  itemName: string;
  qty: number;
  unitPrice: number;
  supply: number;
  vat: number;
  total: number;
};

function formatMoney(n: number | null | undefined) {
  const v = Number(n ?? 0);
  return v.toLocaleString("ko-KR");
}

function todayYMD() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function ymdSlash(ymd: string) {
  // YYYY-MM-DD -> YYYY/MM/DD
  if (!ymd) return "";
  return ymd.replaceAll("-", "/");
}

// ---- order_lines 컬럼명이 프로젝트마다 다를 수 있어 후보키를 안전하게 매핑 ----
function pickString(row: LineLoose, keys: string[], fallback = "") {
  for (const k of keys) {
    const v = row?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v);
  }
  return fallback;
}
function pickNumber(row: LineLoose, keys: string[], fallback = 0) {
  for (const k of keys) {
    const v = row?.[k];
    if (v !== undefined && v !== null && v !== "" && !Number.isNaN(Number(v))) return Number(v);
  }
  return fallback;
}

/**
 * 라인 단위 공급가/부가세/합계는:
 * 1) line에 supply_amount/vat_amount/total_amount가 있으면 그대로 사용
 * 2) 없으면 qty*unitPrice로 공급가 만들고, 부가세=0 (세율/면세 판단 불가)
 */
function mapLineToSpec(line: LineLoose): SpecLine {
  const itemName = pickString(line, ["item_name", "product_name", "variant_name", "name", "title", "product_title"], "");
  const qty = pickNumber(line, ["qty", "quantity", "ea", "count"], 0);
  const unitPrice = pickNumber(line, ["unit_price", "price", "unitPrice"], 0);

  const supplyRaw = pickNumber(line, ["supply_amount", "supply", "supplyValue", "amount_supply"], Number.NaN);
  const vatRaw = pickNumber(line, ["vat_amount", "vat", "vatValue", "amount_vat"], Number.NaN);
  const totalRaw = pickNumber(line, ["total_amount", "total", "line_total", "amount_total"], Number.NaN);

  let supply = Number.isFinite(supplyRaw) ? supplyRaw : qty * unitPrice;
  let vat = Number.isFinite(vatRaw) ? vatRaw : 0;
  let total = Number.isFinite(totalRaw) ? totalRaw : supply + vat;

  // 혹시 total만 있고 supply/vat가 없는 경우: supply=total, vat=0
  if (!Number.isFinite(supplyRaw) && Number.isFinite(totalRaw) && !Number.isFinite(vatRaw)) {
    supply = totalRaw;
    vat = 0;
    total = totalRaw;
  }

  return { itemName, qty, unitPrice, supply, vat, total };
}

export default function SpecClient() {
  const supabase = useMemo(() => createClient(), []);
  const sp = useSearchParams();
  const router = useRouter();

  const qpPartnerId = sp.get("partnerId") || sp.get("partner_id") || "";
  const qpDate = sp.get("date") || "";

  const [msg, setMsg] = useState<string | null>(null);

  const [partners, setPartners] = useState<PartnerRow[]>([]);
  const [partnerId, setPartnerId] = useState<string>(qpPartnerId);
  const [dateYMD, setDateYMD] = useState<string>(qpDate || "");

  const selectedPartner = useMemo(
    () => partners.find((p) => p.id === partnerId) ?? null,
    [partners, partnerId]
  );

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [lines, setLines] = useState<SpecLine[]>([]);
  const [loading, setLoading] = useState(false);

  // --- 거래처 검색(입력형) UI 상태 ---
  const [partnerQuery, setPartnerQuery] = useState<string>("");
  const [partnerOpen, setPartnerOpen] = useState(false);
  const partnerWrapRef = useRef<HTMLDivElement | null>(null);
  const blurTimerRef = useRef<number | null>(null);

  // ✅ 회사정보 (요청사항만 반영)
  const OUR = {
    name: "주식회사 보누스메이트",
    business_no: "343-88-03009",
    ceo: "조대성",
    address1: "경기도 파주시 광탄면 장지산로 250-90 1층",
    biz: "제조업 / 업태: 식품제조가공업",
  };

  const pageBg = "bg-slate-50 text-slate-900";
  const card = "rounded-2xl border border-slate-200 bg-white shadow-sm";
  const input =
    "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200";

  function pushUrl(nextPartnerId: string, date: string) {
    const qs = new URLSearchParams();
    if (nextPartnerId) qs.set("partnerId", nextPartnerId);
    if (date) qs.set("date", date);
    router.replace(`/tax/spec?${qs.toString()}`);
  }

  async function loadPartners() {
    const { data, error } = await supabase
      .from("partners")
      .select("id,name,business_no,ceo_name,biz_type,biz_item,address1")
      .order("name", { ascending: true })
      .limit(5000);

    if (error) {
      setMsg(error.message);
      return;
    }
    setPartners((data ?? []) as PartnerRow[]);
  }

  async function loadSpec(pId: string, date: string) {
    setMsg(null);
    setLoading(true);

    try {
      if (!pId || !date) {
        setOrders([]);
        setLines([]);
        setMsg("partnerId 또는 date가 없습니다. (상단에서 거래처/일자 선택 후 조회)");
        return;
      }

      // 1) orders
      const { data: oData, error: oErr } = await supabase
        .from("orders")
        .select("id,customer_id,customer_name,ship_date,ship_method,memo,supply_amount,vat_amount,total_amount,created_at")
        .eq("customer_id", pId)
        .eq("ship_date", date)
        .order("created_at", { ascending: true })
        .limit(5000);

      if (oErr) throw oErr;

      const oRows = (oData ?? []) as OrderRow[];
      setOrders(oRows);

      if (oRows.length === 0) {
        setLines([]);
        return;
      }

      const orderIds = oRows.map((o) => o.id);

      // 2) order_lines
      const { data: lData, error: lErr } = await supabase
        .from("order_lines")
        .select("*")
        .in("order_id", orderIds)
        .order("order_id", { ascending: true })
        .order("line_no", { ascending: true });

      if (lErr) throw lErr;

      const mapped = (lData ?? []).map(mapLineToSpec);

      // 3) 동일 품목+단가로 집계(한 날짜에 여러 주문이 있어도 거래명세서에 보기 좋게)
      const agg = new Map<string, SpecLine>();
      for (const r of mapped) {
        const key = `${r.itemName}||${r.unitPrice}`;
        const prev = agg.get(key);
        if (!prev) agg.set(key, { ...r });
        else {
          prev.qty += r.qty;
          prev.supply += r.supply;
          prev.vat += r.vat;
          prev.total += r.total;
        }
      }

      const out = Array.from(agg.values()).filter((x) => x.itemName.trim() !== "");
      setLines(out);
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
      setOrders([]);
      setLines([]);
    } finally {
      setLoading(false);
    }
  }

  // ✅ 초기 로딩
  useEffect(() => {
    loadPartners();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ URL 파라미터(직접 링크) 반영
  useEffect(() => {
    if (qpPartnerId) setPartnerId(qpPartnerId);
    if (qpDate) setDateYMD(qpDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ 파트너 선택 시, 검색 입력 텍스트를 “선택값”으로 동기화
  useEffect(() => {
    if (!selectedPartner) return;
    const label = `${selectedPartner.name}${selectedPartner.business_no ? ` (${selectedPartner.business_no})` : ""}`;
    setPartnerQuery(label);
    setPartnerOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPartner?.id]);

  // --- 검색 필터 ---
  const filteredPartners = useMemo(() => {
    const q = partnerQuery.trim().toLowerCase();
    if (!q) return partners.slice(0, 50);

    return partners
      .filter((p) => {
        const n = (p.name ?? "").toLowerCase();
        const b = (p.business_no ?? "").toLowerCase();
        return n.includes(q) || b.includes(q);
      })
      .slice(0, 50);
  }, [partners, partnerQuery]);

  // ✅ “검색 결과가 없습니다”는 조건: (드롭다운 열림 && 입력값 있음 && 결과 0)
  const showNoResult = partnerOpen && partnerQuery.trim().length > 0 && filteredPartners.length === 0;

  function onPartnerFocus() {
    if (blurTimerRef.current) {
      window.clearTimeout(blurTimerRef.current);
      blurTimerRef.current = null;
    }
    setPartnerOpen(true);
  }

  function onPartnerBlur() {
    // 클릭 선택 중 blur 발생해도 닫히지 않도록 지연
    blurTimerRef.current = window.setTimeout(() => {
      setPartnerOpen(false);
      blurTimerRef.current = null;
    }, 120) as unknown as number;
  }

  function selectPartner(p: PartnerRow) {
    setPartnerId(p.id);
    // ✅ 선택 즉시 드롭다운 닫기
    setPartnerOpen(false);
    setMsg(null);
  }

  // ✅ 바깥 클릭 시 닫기
  useEffect(() => {
    function onDocDown(e: MouseEvent) {
      const el = partnerWrapRef.current;
      if (!el) return;
      if (!el.contains(e.target as Node)) setPartnerOpen(false);
    }
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, []);

  // --- 합계 ---
  const sumSupply = useMemo(() => lines.reduce((a, r) => a + (r.supply ?? 0), 0), [lines]);
  const sumVat = useMemo(() => lines.reduce((a, r) => a + (r.vat ?? 0), 0), [lines]);
  const sumTotal = useMemo(() => lines.reduce((a, r) => a + (r.total ?? 0), 0), [lines]);

  return (
    <div className={`min-h-screen ${pageBg} p-6`}>
      {/* ✅ 인쇄: "거래명세서 본문"만 보이게(상단 홈/스캔/품목… 줄 포함 전부 제거) */}
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #spec-print-area,
          #spec-print-area * {
            visibility: visible !important;
          }
          #spec-print-area {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
          }

          /* 인쇄 시 여백/배경 */
          body {
            background: white !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          /* 페이지 쪼개짐 방지 보조 */
          .avoid-break {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
        }
      `}</style>

      {/* ✅ 화면(웹)에서는 그대로 보이되, 인쇄에서는 이 영역만 남김 */}
      <div id="spec-print-area" className="mx-auto max-w-6xl">
        {/* 상단 타이틀/버튼 */}
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="text-xl font-bold">거래명세서</div>
          <div className="flex gap-2 no-print">
            <button
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              onClick={() => router.push("/tax/statement")}
            >
              원장으로
            </button>
            <button
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              onClick={() => window.print()}
            >
              인쇄 / PDF 저장
            </button>
          </div>
        </div>

        {/* 조회 조건 */}
        <div className={`${card} mb-4 p-4 no-print`}>
          <div className="mb-2 text-sm font-semibold">조회 조건</div>

          {/* ✅ 3개(거래처/일자/조회) 크기 조절 */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_180px_96px] md:items-end">
            <div>
              <div className="mb-1 text-xs text-slate-500">거래처</div>

              <div ref={partnerWrapRef} className="relative">
                <input
                  className={input}
                  value={partnerQuery}
                  placeholder="회사이름/사업자번호 입력"
                  onChange={(e) => {
                    setPartnerQuery(e.target.value);
                    setPartnerOpen(true);
                  }}
                  onFocus={onPartnerFocus}
                  onBlur={onPartnerBlur}
                />

                {partnerOpen && (
                  <div className="absolute z-50 mt-2 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
                    {showNoResult ? (
                      <div className="p-3 text-sm text-slate-500">
                        검색 결과가 없습니다.
                        <div className="mt-2 text-xs text-slate-400">※ 목록에서 클릭해서 선택하세요.</div>
                      </div>
                    ) : (
                      <div className="max-h-72 overflow-auto">
                        {filteredPartners.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                            onMouseDown={(e) => e.preventDefault()} // blur 먼저 발생 방지
                            onClick={() => selectPartner(p)}
                          >
                            <div className="font-medium">{p.name}</div>
                            <div className="text-xs text-slate-500">{p.business_no ?? ""}</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div>
              <div className="mb-1 text-xs text-slate-500">일자</div>
              <input type="date" className={input} value={dateYMD} onChange={(e) => setDateYMD(e.target.value)} />
            </div>

            <div>
              <button
                className="w-full whitespace-nowrap rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
                onClick={() => {
                  const d = dateYMD || todayYMD();
                  pushUrl(partnerId, d);
                  loadSpec(partnerId, d);
                }}
              >
                조회
              </button>
            </div>
          </div>

          {msg && <div className="mt-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{msg}</div>}
        </div>

        {/* 본문(인쇄에도 동일하게 보여야 함) */}
        <div className={`${card} p-4`}>
          {/* 인쇄용 타이틀: 거래명세서 YYYY/MM/DD */}
          <div className="mb-4 text-base font-bold">{`거래명세서 ${ymdSlash(dateYMD)}`}</div>

          {/* 거래처 / 우리회사 */}
          <div className={`${card} mb-4 p-4`}>
            <div className="spec-party-grid grid grid-cols-1 gap-4 md:grid-cols-2">
              {/* 거래처 */}
              <div>
                {/* ✅ 인쇄화면 상단 “거래처” 글씨 제거 */}
                {selectedPartner ? (
                  <div className="space-y-1 text-sm">
                    <div className="font-semibold">{selectedPartner.name}</div>
                    <div className="text-slate-700">{selectedPartner.business_no ?? ""}</div>
                    <div>대표: {selectedPartner.ceo_name ?? ""}</div>
                    <div>주소: {selectedPartner.address1 ?? ""}</div>
                    <div>
                      업종: {selectedPartner.biz_type ?? ""} / 업태: {selectedPartner.biz_item ?? ""}
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-slate-500">거래처를 선택하세요.</div>
                )}
              </div>

              {/* 우리회사 + 도장 */}
              {/* ✅ 도장이 잘리지 않도록 "회사정보 블럭"을 조금 왼쪽으로 이동(pr-10) */}
              <div className="relative text-right pr-10">
                <div className="mb-2 text-sm font-semibold"> </div>

                <div className="space-y-1 text-sm">
                  <div className="font-semibold">{OUR.name}</div>
                  <div className="text-slate-700">{OUR.business_no}</div>
                  <div className="relative inline-block">
                    <span>대표: {OUR.ceo}</span>
                    <img
                      src="/stamp.png"
                      alt="stamp"
                      className="pointer-events-none absolute -right-10 -top-3 h-12 w-12 opacity-90"
                    />
                  </div>
                  <div>주소: {OUR.address1}</div>
                  <div>{OUR.biz}</div>
                </div>
              </div>
            </div>
          </div>

          {/* 세부 내역 */}
          <div className={`${card} p-4`}>
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-semibold">세부 내역</div>
              <div className="text-xs text-slate-500">
                주문(출고) {orders.length}건 · 품목 {lines.length}줄
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200">
              <table className="w-full table-fixed text-sm">
                <colgroup>
                  <col style={{ width: "40%" }} />
                  <col style={{ width: "12%" }} />
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "13%" }} />
                  <col style={{ width: "12%" }} />
                  <col style={{ width: "13%" }} />
                </colgroup>
                <thead className="bg-slate-50">
                  <tr className="text-xs text-slate-600">
                    <th className="px-3 py-2 text-left">품목</th>
                    <th className="px-3 py-2 text-right">수량</th>
                    <th className="px-3 py-2 text-right">단가</th>
                    <th className="px-3 py-2 text-right">공급가</th>
                    <th className="px-3 py-2 text-right">부가세</th>
                    <th className="px-3 py-2 text-right">합계</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td className="px-3 py-6 text-center text-slate-500" colSpan={6}>
                        불러오는 중...
                      </td>
                    </tr>
                  ) : lines.length === 0 ? (
                    <tr>
                      <td className="px-3 py-6 text-center text-slate-500" colSpan={6}>
                        표시할 내역이 없습니다. (거래처/일자/주문 데이터 확인)
                      </td>
                    </tr>
                  ) : (
                    lines.map((r, idx) => (
                      <tr key={idx} className="border-t border-slate-100">
                        <td className="px-3 py-2">
                          <div className="truncate">{r.itemName}</div>
                        </td>
                        <td className="px-3 py-2 text-right">{formatMoney(r.qty)}</td>
                        <td className="px-3 py-2 text-right">{formatMoney(r.unitPrice)}</td>
                        <td className="px-3 py-2 text-right font-semibold">{formatMoney(r.supply)}</td>
                        <td className="px-3 py-2 text-right">{formatMoney(r.vat)}</td>
                        <td className="px-3 py-2 text-right font-semibold">{formatMoney(r.total)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* ✅ 하단 안내문 삭제 + 불필요 여백 최소화 */}
            <div className="mt-2 flex justify-end avoid-break">
              <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-4 text-sm">
                <div className="flex items-center justify-between py-1">
                  <div className="text-slate-700">공급가</div>
                  <div className="font-semibold">{formatMoney(sumSupply)}</div>
                </div>
                <div className="flex items-center justify-between py-1">
                  <div className="text-slate-700">부가세</div>
                  <div className="font-semibold">{formatMoney(sumVat)}</div>
                </div>
                <div className="flex items-center justify-between py-1">
                  <div className="text-slate-900">합계</div>
                  <div className="text-base font-bold">{formatMoney(sumTotal)}</div>
                </div>
              </div>
            </div>
          </div>

          {!partnerId || !dateYMD ? (
            <div className="mt-4 text-sm text-slate-500">
              상단에서 거래처/일자를 선택하고 <span className="font-semibold">조회</span>를 눌러주세요.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
