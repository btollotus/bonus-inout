"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

type OrderRow = {
  id: string;
  ship_date: string | null;
  customer_id: string | null;
  customer_name: string | null;
  total_amount: number | null;
  memo: string | null; // orders.memo (JSON 문자열 가능)
};

type LedgerRow = {
  id: string;
  entry_date: string; // YYYY-MM-DD
  direction: "IN" | "OUT";
  category: string;
  amount: number;
  memo: string | null;
  partner_id: string | null;
};

type PartnerRow = {
  id: string;
  name: string;
  business_no: string | null;
};

type Row = {
  date: string;
  kind: "출고" | "입금";
  amount: number;
  memo: string;
};

function ymd(s: string | null | undefined) {
  return (s ?? "").slice(0, 10);
}

function nf(n: number) {
  return n.toLocaleString("ko-KR");
}

// ✅ orders.memo JSON 처리: {"title":null,"orderer_name":null} 같은 값은 숨김
function formatOrderMemo(memo: string | null | undefined) {
  const raw = (memo ?? "").toString().trim();
  if (!raw) return "";

  if (raw.startsWith("{") && raw.endsWith("}")) {
    try {
      const obj = JSON.parse(raw);
      const title = obj?.title ?? null;
      const orderer = obj?.orderer_name ?? null;

      const t = String(title ?? "").trim();
      const o = String(orderer ?? "").trim();
      if (!t && !o) return "";

      if (t && o) return `${t} / ${o}`;
      if (t) return t;
      return o;
    } catch {
      return raw;
    }
  }

  return raw;
}

export default function StatementClient() {
  const sp = useSearchParams();
  const partnerId = sp.get("partnerId") || "";
  const from = sp.get("from") || "";
  const to = sp.get("to") || "";

  const [partner, setPartner] = useState<PartnerRow | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [deposits, setDeposits] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!partnerId || !from || !to) {
      setMsg("partnerId/from/to 파라미터가 필요합니다.");
      return;
    }

    const supabase = createClient();

    (async () => {
      setLoading(true);
      setMsg(null);

      // 거래처
      const { data: p, error: pe } = await supabase
        .from("partners")
        .select("id, name, business_no")
        .eq("id", partnerId)
        .maybeSingle();

      if (pe) {
        setMsg(pe.message);
        setLoading(false);
        return;
      }
      setPartner(p ?? null);

      // 출고(orders)
      const { data: o, error: oe } = await supabase
        .from("orders")
        .select("id, ship_date, customer_id, customer_name, total_amount, memo")
        .eq("customer_id", partnerId)
        .gte("ship_date", from)
        .lte("ship_date", to)
        .order("ship_date", { ascending: true });

      if (oe) {
        setMsg(oe.message);
        setLoading(false);
        return;
      }
      setOrders((o ?? []) as any);

      // 입금(ledger_entries): 매출입금 + IN
      const { data: l, error: le } = await supabase
        .from("ledger_entries")
        .select("id, entry_date, direction, category, amount, memo, partner_id")
        .eq("partner_id", partnerId)
        .eq("direction", "IN")
        .eq("category", "매출입금")
        .gte("entry_date", from)
        .lte("entry_date", to)
        .order("entry_date", { ascending: true });

      if (le) {
        setMsg(le.message);
        setLoading(false);
        return;
      }
      setDeposits((l ?? []) as any);

      setLoading(false);
    })();
  }, [partnerId, from, to]);

  const rows: Row[] = useMemo(() => {
    const r: Row[] = [];

    for (const o of orders) {
      r.push({
        date: ymd(o.ship_date),
        kind: "출고",
        amount: o.total_amount ?? 0,
        memo: formatOrderMemo(o.memo),
      });
    }

    for (const d of deposits) {
      r.push({
        date: d.entry_date,
        kind: "입금",
        amount: d.amount ?? 0,
        memo: (d.memo ?? "").toString(),
      });
    }

    // 날짜 오름차순, 같은날은 입금 먼저
    r.sort((a, b) => {
      if (a.date === b.date) return a.kind === b.kind ? 0 : a.kind === "입금" ? -1 : 1;
      return a.date < b.date ? -1 : 1;
    });

    return r;
  }, [orders, deposits]);

  const sumShip = useMemo(
    () => rows.filter((x) => x.kind === "출고").reduce((s, x) => s + x.amount, 0),
    [rows]
  );
  const sumIn = useMemo(
    () => rows.filter((x) => x.kind === "입금").reduce((s, x) => s + x.amount, 0),
    [rows]
  );
  const balance = useMemo(() => sumShip - sumIn, [sumShip, sumIn]); // 미수(출고-입금)

  // ✅ TradeClient.tsx 테마와 동일
  const pageBg = "bg-slate-50 text-slate-900";
  const card = "rounded-2xl border border-slate-200 bg-white shadow-sm";
  const btn = "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50 active:bg-slate-100";
  const hint = "text-xs text-slate-500";

  return (
    <div className={`${pageBg} min-h-screen`}>
      {/* ✅ 인쇄 전용 초압축 CSS + 상단 메뉴(TopNav) 숨김 강화 */}
      <style jsx global>{`
        @media print {
          @page { size: A4; margin: 6mm; }
          html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background: #fff !important; color: #000 !important; }

          /* ✅ TopNav가 어떤 태그로 렌더되어도 1차로 숨김 */
          body > :first-child { display: none !important; }
          nav, header, .topnav, .no-print { display: none !important; }

          /* 행간/여백 최대 압축 */
          .bm-wrap { font-size: 11px !important; line-height: 1.05 !important; }
          .bm-box { padding: 6px !important; margin: 0 0 6px 0 !important; border: 1px solid #ddd !important; box-shadow: none !important; }
          .bm-title { font-size: 14px !important; margin: 0 0 4px 0 !important; }
          .bm-sub { margin: 0 !important; }
          table { border-collapse: collapse !important; }
          th, td { padding: 2px 4px !important; line-height: 1.05 !important; border-color: #ddd !important; color: #000 !important; }
          thead tr { background: #f3f4f6 !important; }
        }
      `}</style>

      <div className="bm-wrap mx-auto w-full max-w-[1100px] px-4 py-6">
        {/* ✅ 헤더: 거래처(왼쪽) / 우리회사정보(오른쪽) */}
        <div className={`${card} bm-box p-4`}>
          <div className="bm-title text-lg font-semibold">거래원장</div>

          <div className="mt-2 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            {/* 왼쪽: 거래처 */}
            <div className="bm-sub text-sm">
              <div className="font-semibold">거래처</div>
              <div className="mt-1">
                {partner?.name ?? "(불러오는 중)"}{partner?.business_no ? ` (${partner.business_no})` : ""}
              </div>
              <div className="mt-1">기간: {from} ~ {to}</div>
            </div>

            {/* 오른쪽: 우리 회사 */}
            <div className="bm-sub text-sm md:text-right">
              <div className="font-semibold">우리 회사</div>
              <div className="mt-1">업체명: 주식회사 보누스메이트</div>
              <div>대표: 조대성</div>
              <div>주소: 경기도 파주시 광탄면 장지산로 250-90 1층</div>
              <div>업종: 제조업 / 업태: 식품제조가공업</div>
            </div>
          </div>

          <div className="no-print mt-4 flex items-center gap-2">
            <button onClick={() => window.print()} className={btn}>
              인쇄 / PDF 저장
            </button>
            <div className={hint}>※ 인쇄 시 행간/여백은 자동으로 최대 축소됩니다.</div>
          </div>
        </div>

        <div className={`${card} bm-box mt-4 p-4`}>
          {msg && (
            <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {msg}
            </div>
          )}

          {loading ? (
            <div className="text-sm text-slate-600">불러오는 중...</div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className="w-full text-sm table-fixed">
                <colgroup>
                  <col style={{ width: "120px" }} />
                  <col style={{ width: "90px" }} />
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
                  {rows.map((r, idx) => {
                    // ✅ 출고는 마이너스 표시(표시만)
                    const displayAmount = r.kind === "출고" ? `-${nf(r.amount)}` : nf(r.amount);
                    return (
                      <tr key={`${r.date}-${r.kind}-${idx}`} className="border-t border-slate-200 bg-white">
                        <td className="px-3 py-2 whitespace-nowrap tabular-nums font-semibold">{r.date}</td>
                        <td className="px-3 py-2 whitespace-nowrap font-semibold">{r.kind}</td>
                        <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums font-semibold">
                          {displayAmount}
                        </td>
                        <td className="px-3 py-2">{r.memo}</td>
                      </tr>
                    );
                  })}

                  {rows.length === 0 && (
                    <tr className="bg-white">
                      <td colSpan={4} className="px-3 py-6 text-center text-sm text-slate-500">
                        기간 내 거래내역이 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>

                <tfoot className="bg-white">
                  <tr className="border-t border-slate-200">
                    <td colSpan={2} className="px-3 py-2 text-right font-semibold">출고 합계</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{`-${nf(sumShip)}`}</td>
                    <td />
                  </tr>
                  <tr className="border-t border-slate-200">
                    <td colSpan={2} className="px-3 py-2 text-right font-semibold">입금 합계(매출입금)</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{nf(sumIn)}</td>
                    <td />
                  </tr>
                  <tr className="border-t border-slate-200">
                    <td colSpan={2} className="px-3 py-2 text-right font-extrabold">미수(출고-입금)</td>
                    <td className="px-3 py-2 text-right font-extrabold tabular-nums">{nf(balance)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}