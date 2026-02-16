"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

type PartyInfo = {
  name: string;
  business_no: string | null;
  ceo_name: string | null;
  address1: string | null;
  biz_type: string | null;
  biz_item: string | null;
};

type PartnerRow = {
  id: string;
  name: string;
  business_no: string | null;
};

type Row = {
  date: string; // YYYY-MM-DD
  kind: "IN" | "OUT";
  label: "입금" | "출고" | "출금";
  amount: number; // 항상 양수 저장, 표시만 OUT은 -로
  memo: string | null;
};

function formatMoney(n: number | null | undefined) {
  const v = Number(n ?? 0);
  return v.toLocaleString("ko-KR");
}

function safeJsonParse<T>(s: string | null): T | null {
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

// ✅ {"title":null,"orderer_name":null} 같은 “의미 없는 JSON”은 빈 문자열로 처리
function normalizeMemo(raw: string | null) {
  const s = String(raw ?? "").trim();
  if (!s) return "";

  const j = safeJsonParse<any>(s);
  if (j && typeof j === "object") {
    const values = Object.values(j);
    const allEmpty = values.every((v) => v === null || v === "" || typeof v === "undefined");
    if (allEmpty) return "";

    const title = j.title ?? "";
    const orderer = j.orderer_name ?? "";
    const parts: string[] = [];
    if (title) parts.push(`제목: ${title}`);
    if (orderer) parts.push(`주문자: ${orderer}`);
    return parts.join(" / ");
  }

  return s;
}

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

export default function StatementClient({
  partnerId,
  from,
  to,
}: {
  partnerId: string;
  from: string;
  to: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [msg, setMsg] = useState<string | null>(null);

  // ✅ 쿼리가 없을 때 선택 UI용 상태
  const [partners, setPartners] = useState<PartnerRow[]>([]);
  const [pickPartnerId, setPickPartnerId] = useState(partnerId || "");
  const [pickFrom, setPickFrom] = useState(from || addDays(todayYMD(), -30));
  const [pickTo, setPickTo] = useState(to || todayYMD());

  const [company, setCompany] = useState<PartyInfo>({
    name: "주식회사 보누스메이트",
    business_no: null,
    ceo_name: "조대성",
    address1: "경기도 파주시 광탄면 장지산로 250-90 1층",
    biz_type: "제조업",
    biz_item: "식품제조가공업",
  });

  const [counterparty, setCounterparty] = useState<PartyInfo>({
    name: "",
    business_no: null,
    ceo_name: null,
    address1: null,
    biz_type: null,
    biz_item: null,
  });

  const [rows, setRows] = useState<Row[]>([]);

  // ✅ theme (products-client.tsx 계열)
  const pageBg = "bg-slate-50 text-slate-900";
  const card = "rounded-2xl border border-slate-200 bg-white shadow-sm";
  const btn =
    "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50 active:bg-slate-100";
  const btnOn =
    "rounded-xl border border-blue-600/20 bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 active:bg-blue-800";
  const input =
    "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300";
  const pill =
    "inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700";

  // ✅ partner 목록 로드 (쿼리 없을 때도 선택 가능하게)
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("partners")
        .select("id,name,business_no")
        .order("name", { ascending: true })
        .limit(2000);
      if (!error) setPartners((data ?? []) as PartnerRow[]);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ 쿼리 파라미터가 바뀌면 pick 상태도 동기화
  useEffect(() => {
    if (partnerId) setPickPartnerId(partnerId);
    if (from) setPickFrom(from);
    if (to) setPickTo(to);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partnerId, from, to]);

  // ✅ 데이터 로드: partnerId/from/to 있을 때만 실행
  useEffect(() => {
    (async () => {
      setMsg(null);
      setRows([]);

      if (!partnerId || !from || !to) {
        // 쿼리 없으면 안내만 하고 로드 중단
        if (!partnerId) setMsg("partner_id가 없습니다. (상단에서 거래처/기간 선택 후 조회를 누르세요)");
        return;
      }

      // 1) 거래처 정보
      const { data: p, error: pErr } = await supabase
        .from("partners")
        .select("name,business_no,ceo_name,address1,biz_type,biz_item")
        .eq("id", partnerId)
        .single();

      if (pErr) {
        setMsg(pErr.message);
        return;
      }

      setCounterparty({
        name: p?.name ?? "",
        business_no: p?.business_no ?? null,
        ceo_name: p?.ceo_name ?? null,
        address1: p?.address1 ?? null,
        biz_type: p?.biz_type ?? null,
        biz_item: p?.biz_item ?? null,
      });

      // 2) 주문/출고(orders) => 출고(OUT)
      const { data: oData, error: oErr } = await supabase
        .from("orders")
        .select("id,ship_date,total_amount,memo,created_at")
        .eq("customer_id", partnerId)
        .gte("ship_date", from)
        .lte("ship_date", to)
        .order("ship_date", { ascending: true })
        .limit(5000);

      if (oErr) {
        setMsg(oErr.message);
        return;
      }

      const orderRows: Row[] = (oData ?? []).map((o: any) => ({
        date: String(o.ship_date ?? (o.created_at ? String(o.created_at).slice(0, 10) : "")),
        kind: "OUT",
        label: "출고",
        amount: Number(o.total_amount ?? 0),
        memo: normalizeMemo(o.memo ?? null) || null,
      }));

      // 3) 금전출납(ledger_entries) => IN/OUT
      const { data: lData, error: lErr } = await supabase
        .from("ledger_entries")
        .select("id,entry_date,direction,amount,memo")
        .eq("partner_id", partnerId)
        .gte("entry_date", from)
        .lte("entry_date", to)
        .order("entry_date", { ascending: true })
        .limit(10000);

      if (lErr) {
        setMsg(lErr.message);
        return;
      }

      const ledgerRows: Row[] = (lData ?? []).map((l: any) => {
        const dir = String(l.direction) === "OUT" ? "OUT" : "IN";
        return {
          date: String(l.entry_date ?? ""),
          kind: dir,
          label: dir === "IN" ? "입금" : "출금",
          amount: Number(l.amount ?? 0),
          memo: normalizeMemo(l.memo ?? null) || null,
        };
      });

      // 4) 합치기 + 정렬
      const merged = [...orderRows, ...ledgerRows].filter((r) => r.date);
      merged.sort((a, b) => String(a.date).localeCompare(String(b.date)));

      setRows(merged);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partnerId, from, to]);

  const totals = useMemo(() => {
    const inSum = rows.filter((r) => r.kind === "IN").reduce((a, r) => a + r.amount, 0);
    const outSum = rows.filter((r) => r.kind === "OUT").reduce((a, r) => a + r.amount, 0);
    const receivable = Math.max(0, outSum - inSum);
    return { inSum, outSum, receivable };
  }, [rows]);

  function onApply() {
    setMsg(null);

    if (!pickPartnerId) return setMsg("거래처를 선택하세요.");
    if (!pickFrom || !pickTo) return setMsg("기간(from/to)을 입력하세요.");

    const qs = new URLSearchParams();
    qs.set("partner_id", pickPartnerId);
    qs.set("from", pickFrom);
    qs.set("to", pickTo);

    router.push(`/tax/statement?${qs.toString()}`);
  }

  return (
    <div className={`${pageBg} min-h-screen`}>
      <div className="mx-auto w-full max-w-[1200px] px-4 py-6">
        {msg ? (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {msg}
          </div>
        ) : null}

        {/* 헤더 */}
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-semibold">거래원장</div>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className={pill}>
                기간: {(from || pickFrom) ?? "-"} ~ {(to || pickTo) ?? "-"}
              </span>
            </div>
          </div>

          <div className="flex gap-2">
            <button className={btn} onClick={() => window.print()}>
              인쇄 / PDF 저장
            </button>
          </div>
        </div>

        {/* ✅ 쿼리 없을 때도 진입 가능하도록: 거래처/기간 선택 */}
        {!partnerId || !from || !to ? (
          <div className={`${card} mb-4 p-4`}>
            <div className="mb-3 text-sm font-semibold">조회 조건</div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_220px_220px_auto] md:items-end">
              <div>
                <div className="mb-1 text-xs text-slate-600">거래처</div>
                <select className={input} value={pickPartnerId} onChange={(e) => setPickPartnerId(e.target.value)}>
                  <option value="">선택하세요</option>
                  {partners.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}{p.business_no ? ` (${p.business_no})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="mb-1 text-xs text-slate-600">From</div>
                <input type="date" className={input} value={pickFrom} onChange={(e) => setPickFrom(e.target.value)} />
              </div>

              <div>
                <div className="mb-1 text-xs text-slate-600">To</div>
                <input type="date" className={input} value={pickTo} onChange={(e) => setPickTo(e.target.value)} />
              </div>

              <div className="flex gap-2">
                <button
                  className={btn}
                  onClick={() => {
                    setPickFrom(addDays(todayYMD(), -30));
                    setPickTo(todayYMD());
                  }}
                >
                  최근 30일
                </button>
                <button className={btnOn} onClick={onApply}>
                  조회
                </button>
              </div>
            </div>

            <div className="mt-2 text-xs text-slate-500">
              ※ 상단 메뉴로 들어와도 여기서 거래처/기간을 선택하면 자동으로 URL에 반영되어 조회됩니다.
            </div>
          </div>
        ) : null}

        {/* 상단 정보: 거래처(왼쪽) / 회사정보(오른쪽), “우리회사” 문구 없음 */}
        <div className={`${card} p-4`}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* LEFT: 거래처 */}
            <div>
              <div className="mb-2 text-sm font-semibold">거래처</div>
              <div className="text-sm leading-6">
                <div className="font-semibold">
                  {counterparty.name}
                  {counterparty.business_no ? ` (${counterparty.business_no})` : ""}
                </div>
              </div>
            </div>

            {/* RIGHT: 회사정보 */}
            <div className="text-right">
              <div className="mb-2 text-sm font-semibold">&nbsp;</div>
              <div className="text-sm leading-6">
                <div className="font-semibold">{company.name}</div>
                {company.ceo_name ? <div>대표: {company.ceo_name}</div> : null}
                {company.address1 ? <div>주소: {company.address1}</div> : null}
                {(company.biz_type || company.biz_item) ? (
                  <div>
                    업종: {company.biz_type ?? ""}
                    {company.biz_item ? ` / 업태: ${company.biz_item}` : ""}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        {/* 표 */}
        <div className={`${card} mt-4 p-4`}>
          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full table-fixed text-sm">
              <colgroup>
                <col style={{ width: "120px" }} />
                <col style={{ width: "120px" }} />
                <col style={{ width: "160px" }} />
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
                  const isOut = r.kind === "OUT";
                  const memo = normalizeMemo(r.memo ?? null);

                  return (
                    <tr key={idx} className="border-t border-slate-200 bg-white">
                      <td className="px-3 py-2 font-semibold tabular-nums">{r.date}</td>
                      <td className="px-3 py-2 font-semibold">{r.label}</td>

                      {/* ✅ OUT(출고/출금)은 마이너스로 표시 */}
                      <td
                        className={`px-3 py-2 text-right tabular-nums font-semibold ${
                          isOut ? "text-red-600" : "text-blue-700"
                        }`}
                      >
                        {isOut ? `-${formatMoney(r.amount)}` : formatMoney(r.amount)}
                      </td>

                      <td className="px-3 py-2 text-slate-700">{memo}</td>
                    </tr>
                  );
                })}

                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-4 text-sm text-slate-500 bg-white">
                      표시할 내역이 없습니다. (partner_id / 기간 / 데이터 확인)
                    </td>
                  </tr>
                ) : null}

                {/* 합계 */}
                {rows.length ? (
                  <>
                    <tr className="border-t border-slate-200 bg-slate-50">
                      <td className="px-3 py-2" />
                      <td className="px-3 py-2 font-semibold text-right">출고 합계</td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums text-red-600">
                        -{formatMoney(totals.outSum)}
                      </td>
                      <td className="px-3 py-2" />
                    </tr>

                    <tr className="border-t border-slate-200 bg-slate-50">
                      <td className="px-3 py-2" />
                      <td className="px-3 py-2 font-semibold text-right">입금 합계(매출입금)</td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums text-blue-700">
                        {formatMoney(totals.inSum)}
                      </td>
                      <td className="px-3 py-2" />
                    </tr>

                    <tr className="border-t border-slate-200 bg-slate-50">
                      <td className="px-3 py-2" />
                      <td className="px-3 py-2 font-semibold text-right">미수(출고-입금)</td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums">
                        {formatMoney(totals.receivable)}
                      </td>
                      <td className="px-3 py-2" />
                    </tr>
                  </>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="mt-2 text-xs text-slate-500">
            ※ 출고/출금은 음수로 표시됩니다. / 비고의 의미 없는 JSON 메모는 자동으로 숨깁니다.
          </div>
        </div>
      </div>
    </div>
  );
}