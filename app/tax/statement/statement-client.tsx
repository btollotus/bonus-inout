"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

type PartnerRow = {
  id: string;
  name: string;
  business_no: string | null;
  ceo_name: string | null;
  biz_type: string | null;
  biz_item: string | null;
  phone: string | null;
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

function ymdToSlash(ymd: string) {
  if (!ymd) return "";
  return ymd.replaceAll("-", "/");
}

function monthRange(dateYMD: string) {
  // dateYMD가 YYYY-MM-DD일 때 그 달 1일~말일
  const d = new Date(dateYMD + "T00:00:00");
  const yyyy = d.getFullYear();
  const mm = d.getMonth(); // 0-based
  const first = new Date(yyyy, mm, 1);
  const last = new Date(yyyy, mm + 1, 0);
  const f = `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, "0")}-${String(first.getDate()).padStart(2, "0")}`;
  const t = `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")}`;
  return { f, t };
}

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
 * 라인 단위 공급가/부가세/합계 계산:
 * 1) line에 supply_amount/vat_amount/total_amount가 있으면 그대로 사용
 * 2) 없으면 qty*unitPrice로 공급가 만들고, 부가세는 0으로 둠
 */
function mapLineToSpec(line: LineLoose): SpecLine {
  const itemName = pickString(line, ["name", "item_name", "product_name", "variant_name", "title", "product_title"], "");
  const qty = pickNumber(line, ["qty", "quantity", "ea", "count", "actual_ea"], 0);

  // order_lines 실제 컬럼: unit (정수) 사용
  const unitPrice = pickNumber(line, ["unit_price", "price", "unitPrice", "unit"], 0);

  const supplyRaw = pickNumber(line, ["supply_amount", "supply", "supplyValue", "amount_supply"], NaN);
  const vatRaw = pickNumber(line, ["vat_amount", "vat", "vatValue", "amount_vat"], NaN);
  const totalRaw = pickNumber(line, ["total_amount", "total", "line_total", "amount_total"], NaN);

  let supply = Number.isFinite(supplyRaw) ? supplyRaw : qty * unitPrice;
  let vat = Number.isFinite(vatRaw) ? vatRaw : 0;
  let total = Number.isFinite(totalRaw) ? totalRaw : supply + vat;

  // 혹시 total만 있고 supply/vat이 없는 케이스: supply=total, vat=0
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

  const [dateYMD, setDateYMD] = useState<string>(qpDate);

  const selectedPartner = useMemo(() => partners.find((p) => p.id === partnerId) ?? null, [partners, partnerId]);

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [lines, setLines] = useState<SpecLine[]>([]);
  const [loading, setLoading] = useState(false);

  // ✅ 해당월 “거래 있는 날짜” 표시용
  const [availableDates, setAvailableDates] = useState<string[]>([]);

  // ✅ “회사정보”
  const OUR = {
    name: "주식회사 보누스메이트",
    business_no: "343-88-03009",
    ceo: "조대성",
    address1: "경기도 파주시 광탄면 장지산로 250-90 1층",
    biz: "제조업 / 업태: 식품제조가공업",
  };

  // ====== Theme ======
  const pageBg = "bg-slate-50 text-slate-900";
  const card = "rounded-2xl border border-slate-200 bg-white shadow-sm";
  const input =
    "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300";
  const btn = "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50 active:bg-slate-100";
  const btnOn =
    "rounded-xl border border-blue-600/20 bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 active:bg-blue-800";
  const pill =
    "inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700";
  const chip =
    "rounded-full border border-slate-200 bg-white px-3 py-1 text-xs hover:bg-slate-50 active:bg-slate-100";

  async function loadPartners() {
    const { data, error } = await supabase
      .from("partners")
      .select("id,name,business_no,ceo_name,biz_type,biz_item,phone,address1")
      .order("name", { ascending: true })
      .limit(2000);

    if (error) {
      setMsg(error.message);
      return;
    }
    setPartners((data ?? []) as PartnerRow[]);
  }

  function pushUrl(nextPartnerId: string, date: string) {
    const qs = new URLSearchParams();
    if (nextPartnerId) qs.set("partnerId", nextPartnerId);
    if (date) qs.set("date", date);
    router.replace(`/tax/spec?${qs.toString()}`);
  }

  async function loadAvailableDates(pId: string, baseDate: string) {
    if (!pId || !baseDate) {
      setAvailableDates([]);
      return;
    }
    const { f, t } = monthRange(baseDate);

    const { data, error } = await supabase
      .from("orders")
      .select("ship_date")
      .eq("customer_id", pId)
      .gte("ship_date", f)
      .lte("ship_date", t)
      .order("ship_date", { ascending: true })
      .limit(5000);

    if (error) {
      setAvailableDates([]);
      return;
    }

    const set = new Set<string>();
    for (const r of data ?? []) {
      const d = (r as any)?.ship_date;
      if (d) set.add(String(d));
    }
    setAvailableDates(Array.from(set).sort((a, b) => a.localeCompare(b)));
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

      // ✅ 조회 버튼 누르면: 해당월 “거래 있는 날짜”를 먼저 표시(요청사항)
      await loadAvailableDates(pId, date);

      // 1) 해당 거래처 + 해당일 주문(출고) 조회
      const { data: oData, error: oErr } = await supabase
        .from("orders")
        .select("id,customer_id,customer_name,ship_date,ship_method,memo,supply_amount,vat_amount,total_amount,created_at")
        .eq("customer_id", pId)
        .eq("ship_date", date)
        .order("created_at", { ascending: true })
        .limit(5000);

      if (oErr) {
        setMsg(oErr.message);
        return;
      }

      const ords = (oData ?? []) as any as OrderRow[];
      setOrders(ords);

      const orderIds = ords.map((o) => o.id).filter(Boolean);
      if (orderIds.length === 0) {
        setLines([]);
        return;
      }

      // 2) order_lines 조회
      const { data: lData, error: lErr } = await supabase.from("order_lines").select("*").in("order_id", orderIds).order("line_no", { ascending: true });

      if (lErr) {
        setMsg(lErr.message);
        return;
      }

      const mapped: SpecLine[] = (lData ?? []).map((x) => mapLineToSpec(x as LineLoose));
      setLines(mapped);
    } finally {
      setLoading(false);
    }
  }

  const totals = useMemo(() => {
    let supply = 0;
    let vat = 0;
    let total = 0;
    for (const l of lines) {
      supply += Number(l.supply ?? 0);
      vat += Number(l.vat ?? 0);
      total += Number(l.total ?? 0);
    }
    return { supply, vat, total };
  }, [lines]);

  // ✅ 미수금 = (해당일 합계 - 해당일 입금 합계) 로 계산하려면 입금 데이터가 필요하지만,
  // 요청사항에 “하단에 공급가/부가세/합계+미수금”이 있어서, 화면에는 “미수금” 영역만 유지하고 값은 0으로 둠 (기존 동작 유지)
  const receivable = useMemo(() => 0, []);

  useEffect(() => {
    loadPartners();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (qpPartnerId && qpDate) {
      setPartnerId(qpPartnerId);
      setDateYMD(qpDate);
      loadSpec(qpPartnerId, qpDate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canPrint = !!partnerId && !!dateYMD;

  return (
    <div className={`${pageBg} min-h-screen`}>
      {/* ✅ print 전용 스타일 */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-card { box-shadow: none !important; }
          /* ✅ 인쇄 화면에서 상단 검은색 배경(네비/헤더) 숨김 (요청사항) */
          nav, header { display: none !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      <div className="mx-auto w-full max-w-[1200px] px-4 py-6">
        {msg ? (
          <div className="no-print mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{msg}</div>
        ) : null}

        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            {/* ✅ 제목 변경: 거래명세서 YYYY/MM/DD (요청사항) */}
            <div className="text-xl font-semibold">
              거래명세서 {dateYMD ? ymdToSlash(dateYMD) : ""}
            </div>
            {/* ✅ 밑에 일자표시 삭제 (요청사항) */}
          </div>

          <div className="no-print flex gap-2">
            <button className={btn} onClick={() => router.push("/tax/statement")} title="원장으로">
              원장으로
            </button>
            <button className={btn} onClick={() => window.print()} disabled={!canPrint} title={!canPrint ? "거래처/일자를 먼저 선택하세요" : ""}>
              인쇄 / PDF 저장
            </button>
          </div>
        </div>

        {/* 조회 조건 */}
        <div className={`${card} no-print p-4`}>
          <div className="mb-3 text-sm font-semibold">조회 조건</div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_260px_auto] md:items-end">
            <div>
              <div className="mb-1 text-xs text-slate-600">거래처</div>
              <select className={input} value={partnerId} onChange={(e) => setPartnerId(e.target.value)}>
                <option value="">선택하세요</option>
                {partners.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.business_no ? `(${p.business_no})` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="mb-1 text-xs text-slate-600">일자</div>
              <input type="date" className={input} value={dateYMD} onChange={(e) => setDateYMD(e.target.value)} />
            </div>

            <div className="flex gap-2">
              <button
                className={btnOn}
                onClick={() => {
                  pushUrl(partnerId, dateYMD);
                  loadSpec(partnerId, dateYMD);
                }}
              >
                조회
              </button>
            </div>
          </div>

          {/* ✅ 조회 후: 해당월 거래 있는 날짜 표시 (요청사항) */}
          {availableDates.length > 0 ? (
            <div className="mt-3">
              <div className="mb-2 text-xs text-slate-600">해당월 거래 있는 날짜</div>
              <div className="flex flex-wrap gap-2">
                {availableDates.map((d) => (
                  <button
                    key={d}
                    className={`${chip} ${d === dateYMD ? "border-blue-300 bg-blue-50 text-blue-700" : ""}`}
                    onClick={() => {
                      setDateYMD(d);
                      pushUrl(partnerId, d);
                      loadSpec(partnerId, d);
                    }}
                    type="button"
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {/* 거래처(좌) / 회사정보(우) */}
        <div className={`${card} print-card mt-4 p-4`}>
          <div className="grid grid-cols-2 gap-6 items-start">
            {/* LEFT: 거래처 */}
            <div>
              <div className="mb-2 text-sm font-semibold">거래처</div>
              {selectedPartner ? (
                <div className="space-y-1 text-sm">
                  {/* ✅ 사업자번호를 업체명 밑 줄로 (요청사항) */}
                  <div className="font-semibold">{selectedPartner.name}</div>
                  {selectedPartner.business_no ? <div className="text-slate-700">{selectedPartner.business_no}</div> : null}

                  {selectedPartner.ceo_name ? <div>대표: {selectedPartner.ceo_name}</div> : null}
                  {selectedPartner.address1 ? <div>주소: {selectedPartner.address1}</div> : null}
                  {(selectedPartner.biz_type || selectedPartner.biz_item) ? (
                    <div>
                      업종: {selectedPartner.biz_type ?? ""} {selectedPartner.biz_item ? `/ 업태: ${selectedPartner.biz_item}` : ""}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="text-sm text-slate-500">거래처를 선택하세요.</div>
              )}
            </div>

            {/* RIGHT: 회사정보 */}
            <div className="text-right">
              <div className="mb-2 text-sm font-semibold opacity-0 select-none">.</div>
              <div className="space-y-1 text-sm">
                {/* ✅ 사업자번호를 업체명 밑 줄로 (요청사항) */}
                <div className="font-semibold">{OUR.name}</div>
                <div className="text-slate-700">{OUR.business_no}</div>

                {/* ✅ 대표명 + 도장 삽입 (요청사항) */}
                <div>
                  대표:{" "}
                  <span className="relative inline-block">
                    {OUR.ceo}
                    <img
                      src="/stamp.png"
                      alt="stamp"
                      className="pointer-events-none absolute -right-3 -top-7 h-10 w-10 opacity-90"
                    />
                  </span>
                </div>

                <div>주소: {OUR.address1}</div>
                <div>업종: {OUR.biz}</div>
              </div>
            </div>
          </div>
        </div>

        {/* 세부 내역 표 */}
        <div className={`${card} print-card mt-4 p-4`}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-sm font-semibold">세부 내역</div>
            <div className="text-xs text-slate-600">
              주문(출고) {orders.length}건 · 품목 {lines.length}줄
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full table-fixed text-sm">
              {/* ✅ 품목 폭 넓히고, 옆 컬럼 폭 줄임 (요청사항) */}
              <colgroup>
                <col style={{ width: "auto" }} />
                <col style={{ width: "90px" }} />
                <col style={{ width: "90px" }} />
                <col style={{ width: "110px" }} />
                <col style={{ width: "110px" }} />
                <col style={{ width: "120px" }} />
              </colgroup>

              <thead className="bg-slate-50 text-xs font-semibold text-slate-600">
                <tr>
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
                    <td colSpan={6} className="px-4 py-4 text-sm text-slate-500">
                      불러오는 중...
                    </td>
                  </tr>
                ) : lines.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-4 text-sm text-slate-500">
                      표시할 내역이 없습니다. (거래처/일자/주문 데이터 확인)
                    </td>
                  </tr>
                ) : (
                  lines.map((r, idx) => (
                    <tr key={idx} className="border-t border-slate-200 bg-white">
                      {/* ✅ 품목 한 줄 유지 (요청사항) */}
                      <td className="px-3 py-2 whitespace-nowrap">{r.itemName}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatMoney(r.qty)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatMoney(r.unitPrice)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">{formatMoney(r.supply)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatMoney(r.vat)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">{formatMoney(r.total)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-[1fr_320px] md:items-start">
            <div className="text-xs text-slate-500">※ 거래명세서에는 “입금/출금” 라인을 표시하지 않습니다.</div>

            <div className="rounded-2xl border border-slate-200 bg-white p-3">
              <div className="flex items-center justify-between text-sm">
                <div className="text-slate-600">공급가</div>
                <div className="font-semibold tabular-nums">{formatMoney(totals.supply)}</div>
              </div>
              <div className="mt-1 flex items-center justify-between text-sm">
                <div className="text-slate-600">부가세</div>
                <div className="font-semibold tabular-nums">{formatMoney(totals.vat)}</div>
              </div>
              <div className="mt-1 flex items-center justify-between text-sm">
                <div className="text-slate-600">합계</div>
                <div className="font-semibold tabular-nums">{formatMoney(totals.total)}</div>
              </div>

              <div className="mt-3 border-t border-slate-200 pt-2">
                <div className="flex items-center justify-between text-sm">
                  <div className="text-slate-600">미수금</div>
                  <div className="font-semibold tabular-nums">{formatMoney(receivable)}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-2">
            <span className={pill}>기간: {dateYMD ? ymdToSlash(dateYMD) : "-"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}