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
  total_amount: number | null;
  created_at: string;
};

type LedgerRow = {
  id: string;
  entry_date: string;
  entry_ts: string | null;
  direction: "IN" | "OUT" | string;
  amount: number;
  category: string | null;
  method: string | null;
  memo: string | null;
  partner_id: string | null;
  counterparty_name: string | null;
  business_no: string | null;
  created_at: string;
};

type StatementRow = {
  date: string;
  kind: "입금" | "출고" | "출금";
  amountSigned: number;
  remark: string;
};

function todayYMD() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function addDays(ymd: string, delta: number) {
  const d = new Date(ymd + "T00:00:00");
  d.setDate(d.getDate() + delta);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatMoney(n: number | null | undefined) {
  const v = Number(n ?? 0);
  return v.toLocaleString("ko-KR");
}

function safeJsonParse<T>(s: string | null) {
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

function normalizeRemark(raw: string | null) {
  const s = String(raw ?? "").trim();
  if (!s) return "";

  const obj = safeJsonParse<{ title?: string | null; orderer_name?: string | null }>(s);
  if (obj && typeof obj === "object") {
    const title = String(obj.title ?? "").trim();
    const orderer = String(obj.orderer_name ?? "").trim();
    if (!title && !orderer) return "";
    const parts: string[] = [];
    if (title) parts.push(title);
    if (orderer) parts.push(`주문자:${orderer}`);
    return parts.join(" / ");
  }

  return s;
}

export default function StatementClient() {
  const supabase = useMemo(() => createClient(), []);
  const sp = useSearchParams();
  const router = useRouter();

  const qpPartnerId = sp.get("partner_id") || sp.get("partnerId") || "";
  const qpFrom = sp.get("from") || "";
  const qpTo = sp.get("to") || "";

  const [msg, setMsg] = useState<string | null>(null);

  const [partners, setPartners] = useState<PartnerRow[]>([]);
  const [partnerId, setPartnerId] = useState<string>(qpPartnerId);
  const [fromYMD, setFromYMD] = useState<string>(qpFrom || addDays(todayYMD(), -30));
  const [toYMD, setToYMD] = useState<string>(qpTo || todayYMD());

  // ✅ 거래처 “입력 검색”용
  const [partnerQuery, setPartnerQuery] = useState<string>("");

  const selectedPartner = useMemo(() => partners.find((p) => p.id === partnerId) ?? null, [partners, partnerId]);

  const [rows, setRows] = useState<StatementRow[]>([]);
  const [loading, setLoading] = useState(false);

  const OUR = {
    name: "주식회사 보누스메이트",
    ceo: "조대성",
    address1: "경기도 파주시 광탄면 장지산로 250-90 1층",
    biz: "제조업 / 업태: 식품제조가공업",
  };

  const pageBg = "bg-slate-50 text-slate-900";
  const card = "rounded-2xl border border-slate-200 bg-white shadow-sm";
  const input =
    "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300";
  const btn = "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50 active:bg-slate-100";
  const btnOn =
    "rounded-xl border border-blue-600/20 bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 active:bg-blue-800";
  const pill =
    "inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700";

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
    const list = (data ?? []) as PartnerRow[];
    setPartners(list);

    // ✅ URL로 partnerId가 들어왔으면 입력창에도 표시(형식 통일)
    if (qpPartnerId) {
      const p = list.find((x) => x.id === qpPartnerId);
      if (p) setPartnerQuery(p.business_no ? `${p.name} (${p.business_no})` : p.name);
    }
  }

  function pushUrl(nextPartnerId: string, f: string, t: string) {
    const qs = new URLSearchParams();
    if (nextPartnerId) qs.set("partnerId", nextPartnerId);
    if (f) qs.set("from", f);
    if (t) qs.set("to", t);
    router.replace(`/tax/statement?${qs.toString()}`);
  }

  async function loadStatement(pId: string, f: string, t: string) {
    setMsg(null);
    setLoading(true);
    try {
      if (!pId) {
        setRows([]);
        setMsg("partner_id가 없습니다. (상단에서 거래처/기간 선택 후 조회를 누르세요)");
        return;
      }

      const { data: oData, error: oErr } = await supabase
        .from("orders")
        .select("id,customer_id,customer_name,ship_date,ship_method,memo,total_amount,created_at")
        .eq("customer_id", pId)
        .gte("ship_date", f)
        .lte("ship_date", t)
        .order("ship_date", { ascending: true })
        .limit(5000);

      if (oErr) {
        setMsg(oErr.message);
        return;
      }

      const { data: lData, error: lErr } = await supabase
        .from("ledger_entries")
        .select("id,entry_date,entry_ts,direction,amount,category,method,memo,partner_id,counterparty_name,business_no,created_at")
        .eq("partner_id", pId)
        .gte("entry_date", f)
        .lte("entry_date", t)
        .order("entry_date", { ascending: true })
        .limit(10000);

      if (lErr) {
        setMsg(lErr.message);
        return;
      }

      const list: StatementRow[] = [];

      for (const o of (oData ?? []) as any as OrderRow[]) {
        const date = o.ship_date ?? (o.created_at ? o.created_at.slice(0, 10) : "");
        const amt = Number(o.total_amount ?? 0);
        list.push({
          date,
          kind: "출고",
          amountSigned: -amt,
          remark: normalizeRemark(o.memo),
        });
      }

      for (const l of (lData ?? []) as any as LedgerRow[]) {
        const date = l.entry_date;
        const amt = Number(l.amount ?? 0);
        const sign = String(l.direction) === "OUT" ? -1 : 1;
        list.push({
          date,
          kind: sign > 0 ? "입금" : "출금",
          amountSigned: sign * amt,
          remark: normalizeRemark(l.memo),
        });
      }

      list.sort((a, b) => String(a.date).localeCompare(String(b.date)));
      setRows(list);
    } finally {
      setLoading(false);
    }
  }

  const totals = useMemo(() => {
    let inSum = 0;
    let outSum = 0;
    for (const r of rows) {
      if (r.amountSigned >= 0) inSum += r.amountSigned;
      else outSum += Math.abs(r.amountSigned);
    }
    const net = inSum - outSum;
    return { inSum, outSum, net };
  }, [rows]);

  // ✅ 입력 검색 필터
  const filteredPartners = useMemo(() => {
    const q = partnerQuery.trim().toLowerCase();
    if (!q) return partners.slice(0, 50);

    const scored = partners
      .map((p) => {
        const name = (p.name ?? "").toLowerCase();
        const biz = (p.business_no ?? "").toLowerCase();
        const key = `${name} ${biz}`;
        const hit = key.includes(q);
        const score =
          !q ? 9999 : name.startsWith(q) ? 0 : name.includes(q) ? 1 : biz.includes(q) ? 2 : hit ? 3 : 99;
        return { p, score, hit };
      })
      .filter((x) => x.hit)
      .sort((a, b) => a.score - b.score || a.p.name.localeCompare(b.p.name));

    return scored.slice(0, 50).map((x) => x.p);
  }, [partners, partnerQuery]);

  useEffect(() => {
    loadPartners();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (qpPartnerId && qpFrom && qpTo) {
      setPartnerId(qpPartnerId);
      setFromYMD(qpFrom);
      setToYMD(qpTo);
      loadStatement(qpPartnerId, qpFrom, qpTo);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canPrint = !!partnerId;

  return (
    <div className={`${pageBg} min-h-screen`}>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-card { box-shadow: none !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      <div className="mx-auto w-full max-w-[1200px] px-4 py-6">
        {msg ? (
          <div className="no-print mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{msg}</div>
        ) : null}

        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <div className="text-xl font-semibold">거래원장</div>
            <div className="mt-2">
              <span className={pill}>
                기간: {fromYMD} ~ {toYMD}
              </span>
            </div>
          </div>

          <div className="no-print flex gap-2">
            <button className={btn} onClick={() => window.print()} disabled={!canPrint} title={!canPrint ? "거래처를 먼저 선택하세요" : ""}>
              인쇄 / PDF 저장
            </button>
          </div>
        </div>

        {/* 조회 조건 */}
        <div className={`${card} no-print p-4`}>
          <div className="mb-3 text-sm font-semibold">조회 조건</div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_180px_180px_auto] md:items-end">
            {/* ✅ 거래처: 풀다운 대신 입력 검색 */}
            <div>
              <div className="mb-1 text-xs text-slate-600">거래처</div>
              <div className="relative">
                <input
                  className={input}
                  value={partnerQuery}
                  onChange={(e) => {
                    setPartnerQuery(e.target.value);
                  }}
                  placeholder="회사명을 입력하세요"
                />

                {/* ✅ 입력 중 추천 리스트 */}
                {partnerQuery.trim() ? (
                  <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
                    <div className="max-h-72 overflow-y-auto">
                      {filteredPartners.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-slate-500">검색 결과가 없습니다.</div>
                      ) : (
                        filteredPartners.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50"
                            onClick={() => {
                              setPartnerId(p.id);
                              setPartnerQuery(p.business_no ? `${p.name} (${p.business_no})` : p.name);
                            }}
                          >
                            <span className="truncate">
                              {p.name} {p.business_no ? `(${p.business_no})` : ""}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                    <div className="border-t border-slate-200 px-3 py-2 text-xs text-slate-500">※ 목록에서 클릭해서 선택하세요.</div>
                  </div>
                ) : null}
              </div>

              <div className="mt-2 text-xs text-slate-500">※ 거래처/기간 선택 후 조회를 누르면 URL에 반영됩니다.</div>
            </div>

            <div>
              <div className="mb-1 text-xs text-slate-600">From</div>
              <input type="date" className={input} value={fromYMD} onChange={(e) => setFromYMD(e.target.value)} />
            </div>

            <div>
              <div className="mb-1 text-xs text-slate-600">To</div>
              <input type="date" className={input} value={toYMD} onChange={(e) => setToYMD(e.target.value)} />
            </div>

            <div className="flex gap-2">
              <button
                className={btn}
                onClick={() => {
                  const f = addDays(todayYMD(), -30);
                  const t = todayYMD();
                  setFromYMD(f);
                  setToYMD(t);
                }}
              >
                최근 30일
              </button>
              <button
                className={btnOn}
                onClick={() => {
                  pushUrl(partnerId, fromYMD, toYMD);
                  loadStatement(partnerId, fromYMD, toYMD);
                }}
                disabled={!partnerId}
                title={!partnerId ? "거래처를 먼저 선택하세요" : ""}
              >
                조회
              </button>
            </div>
          </div>
        </div>

        {/* 거래처(좌) / 회사정보(우) */}
        <div className={`${card} print-card mt-4 p-4`}>
          <div className="grid grid-cols-2 gap-6 items-start">
            {/* LEFT */}
            <div>
              <div className="mb-2 text-sm font-semibold">거래처</div>
              {selectedPartner ? (
                <div className="space-y-1 text-sm">
                  <div className="font-semibold">{selectedPartner.name}</div>
                  {selectedPartner.business_no ? <div>{selectedPartner.business_no}</div> : null}
                  {selectedPartner.ceo_name ? <div>대표: {selectedPartner.ceo_name}</div> : null}
                  {selectedPartner.address1 ? <div>주소: {selectedPartner.address1}</div> : null}
                  {selectedPartner.biz_type || selectedPartner.biz_item ? (
                    <div>
                      업종: {selectedPartner.biz_type ?? ""} {selectedPartner.biz_item ? `/ 업태: ${selectedPartner.biz_item}` : ""}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="text-sm text-slate-500">거래처를 선택하세요.</div>
              )}
            </div>

            {/* RIGHT */}
            <div className="text-right">
              <div className="mb-2 text-sm font-semibold opacity-0 select-none">.</div>
              <div className="space-y-1 text-sm">
                <div className="font-semibold">{OUR.name}</div>
                <div>대표: {OUR.ceo}</div>
                <div>주소: {OUR.address1}</div>
                <div>업종: {OUR.biz}</div>
              </div>
            </div>
          </div>
        </div>

        {/* 표 */}
        <div className={`${card} print-card mt-4 p-4`}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-sm font-semibold">내역</div>
            <div className="text-sm text-slate-600">
              입금 합계(매출입금) <span className="font-semibold tabular-nums">{formatMoney(totals.inSum)}</span> · 출고/출금 합계{" "}
              <span className="font-semibold tabular-nums">{formatMoney(totals.outSum)}</span> · 미수(출고-입금){" "}
              <span className="font-semibold tabular-nums">{formatMoney(Math.max(0, totals.outSum - totals.inSum))}</span>
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full table-fixed text-sm">
              <colgroup>
                <col style={{ width: "120px" }} />
                <col style={{ width: "120px" }} />
                <col style={{ width: "140px" }} />
                <col style={{ width: "auto" }} />
              </colgroup>

              <thead className="bg-slate-50 text-xs font-semibold text-slate-600">
                <tr>
                  <th className="px-3 py-2 text-left">일자</th>
                  <th className="px-3 py-2 text-left">구분</th>
                  <th className="px-3 py-2 text-right">금액</th>
                  <th className="px-3 py-2 text-left">비고</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-4 text-sm text-slate-500">
                      불러오는 중...
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-4 text-sm text-slate-500">
                      표시할 내역이 없습니다. (거래처/기간/데이터 확인)
                    </td>
                  </tr>
                ) : (
                  rows.map((r, idx) => {
                    const isMinus = r.amountSigned < 0;
                    const moneyText = isMinus ? `-${formatMoney(Math.abs(r.amountSigned))}` : formatMoney(r.amountSigned);
                    return (
                      <tr key={`${r.date}-${idx}`} className="border-t border-slate-200 bg-white">
                        <td className="px-3 py-2 font-semibold tabular-nums">{r.date}</td>
                        <td className="px-3 py-2 font-semibold">{r.kind}</td>
                        <td className={`px-3 py-2 text-right tabular-nums font-semibold ${isMinus ? "text-red-600" : "text-blue-700"}`}>
                          {moneyText}
                        </td>
                        <td className="px-3 py-2">{r.remark ? r.remark : ""}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-2 text-xs text-slate-500">※ 출고/출금은 음수로 표시됩니다. / 비고의 의미 없는 JSON 메모는 자동으로 숨깁니다.</div>
        </div>
      </div>
    </div>
  );
}