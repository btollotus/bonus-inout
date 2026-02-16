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
  memo: string | null;
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

      // 출고(orders) : customer_id 기준
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

      // 입금(ledger_entries): 매출입금 1개 카테고리만 + IN
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
        memo: (o.memo ?? "").toString(),
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

    // 날짜 오름차순, 같은날은 출고 먼저(원하시면 반대로)
    r.sort((a, b) => {
      if (a.date === b.date) return a.kind === b.kind ? 0 : a.kind === "출고" ? -1 : 1;
      return a.date < b.date ? -1 : 1;
    });

    return r;
  }, [orders, deposits]);

  const sumShip = useMemo(() => rows.filter(x => x.kind === "출고").reduce((s, x) => s + x.amount, 0), [rows]);
  const sumIn = useMemo(() => rows.filter(x => x.kind === "입금").reduce((s, x) => s + x.amount, 0), [rows]);
  const balance = useMemo(() => sumShip - sumIn, [sumShip, sumIn]); // 출고-입금 = 미수(+) 개념

  return (
    <div className="bm-wrap">
      {/* 인쇄 전용 초압축 CSS (statement 페이지에만 적용) */}
      <style jsx global>{`
        @media print {
          @page { size: A4; margin: 6mm; }
          html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          /* 상단 메뉴/네비가 딸려오면 숨김(프로젝트마다 다를 수 있어 안전하게 처리) */
          nav, header, .topnav, .no-print { display: none !important; }

          /* 행간/여백 최대 압축 */
          .bm-wrap { font-size: 11px !important; line-height: 1.05 !important; }
          .bm-box { padding: 6px !important; margin: 0 0 6px 0 !important; }
          .bm-title { font-size: 14px !important; margin: 0 0 4px 0 !important; }
          .bm-sub { margin: 0 !important; }
          table { border-collapse: collapse !important; }
          th, td { padding: 2px 4px !important; line-height: 1.05 !important; }
          .bm-tfoot td { padding-top: 4px !important; }
        }
      `}</style>

      <div className="bm-box">
        <div className="bm-title">거래원장</div>

        <div className="bm-sub">
          <div>업체명: 주식회사 보누스메이트</div>
          <div>대표: 조대성</div>
          <div>주소: 경기도 파주시 광탄면 장지산로 250-90 1층</div>
          <div>업종: 제조업 / 업태: 식품제조가공업</div>
        </div>

        <hr style={{ margin: "6px 0" }} />

        <div className="bm-sub">
          <div>거래처: {partner?.name ?? "(불러오는 중)"}{partner?.business_no ? ` (${partner.business_no})` : ""}</div>
          <div>기간: {from} ~ {to}</div>
        </div>

        <div className="no-print" style={{ marginTop: 8, display: "flex", gap: 8 }}>
          <button
            onClick={() => window.print()}
            style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #ddd" }}
          >
            인쇄 / PDF 저장
          </button>
          <div style={{ color: "#666", fontSize: 12, alignSelf: "center" }}>
            ※ 인쇄 시 행간/여백은 자동으로 최대 축소됩니다.
          </div>
        </div>
      </div>

      <div className="bm-box">
        {msg && <div style={{ color: "crimson", marginBottom: 8 }}>{msg}</div>}
        {loading ? (
          <div>불러오는 중...</div>
        ) : (
          <table style={{ width: "100%", border: "1px solid #ddd" }}>
            <thead>
              <tr style={{ background: "#f6f7f9" }}>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>일자</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>구분</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd" }}>금액</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>비고</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => (
                <tr key={`${r.date}-${r.kind}-${idx}`}>
                  <td style={{ borderBottom: "1px solid #eee", whiteSpace: "nowrap" }}>{r.date}</td>
                  <td style={{ borderBottom: "1px solid #eee", whiteSpace: "nowrap" }}>{r.kind}</td>
                  <td style={{ borderBottom: "1px solid #eee", textAlign: "right", whiteSpace: "nowrap" }}>
                    {nf(r.amount)}
                  </td>
                  <td style={{ borderBottom: "1px solid #eee" }}>{r.memo}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ padding: 12, textAlign: "center", color: "#666" }}>
                    기간 내 거래내역이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot className="bm-tfoot">
              <tr>
                <td colSpan={2} style={{ textAlign: "right", fontWeight: 700, paddingTop: 8 }}>출고 합계</td>
                <td style={{ textAlign: "right", fontWeight: 700, paddingTop: 8 }}>{nf(sumShip)}</td>
                <td />
              </tr>
              <tr>
                <td colSpan={2} style={{ textAlign: "right", fontWeight: 700 }}>입금 합계(매출입금)</td>
                <td style={{ textAlign: "right", fontWeight: 700 }}>{nf(sumIn)}</td>
                <td />
              </tr>
              <tr>
                <td colSpan={2} style={{ textAlign: "right", fontWeight: 800 }}>미수(출고-입금)</td>
                <td style={{ textAlign: "right", fontWeight: 800 }}>{nf(balance)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  );
}