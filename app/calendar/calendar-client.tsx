// app/calendar/calendar-client.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

type OrderCalRow = {
  id: string;
  ship_date: string | null; // YYYY-MM-DD
  customer_name: string | null;
  ship_method: string | null;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toYMD(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function addMonths(d: Date, diff: number) {
  return new Date(d.getFullYear(), d.getMonth() + diff, 1);
}

function isMallCustomer(name: string | null) {
  if (!name) return false;
  const n = name.trim();
  // ✅ 요구사항(정확 이름)
  if (n === "네이버-판매" || n === "카카오플러스-판매" || n === "쿠팡-판매") return true;

  // ✅ 기존 철학(이름 기반 포함 여부)도 같이 방어
  if (n.includes("네이버") || n.includes("쿠팡") || n.includes("카카오")) return true;

  return false;
}

function makeMonthGrid(baseMonth: Date) {
  // 달력은 일요일 시작(0)
  const first = startOfMonth(baseMonth);
  const last = endOfMonth(baseMonth);

  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay()); // 해당 주 일요일로 이동

  const end = new Date(last);
  end.setDate(last.getDate() + (6 - last.getDay())); // 해당 주 토요일로 이동

  const days: Date[] = [];
  const cur = new Date(start);
  while (cur <= end) {
    days.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }

  // 7일씩 끊어서 주 단위
  const weeks: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }
  return weeks;
}

export default function CalendarClient() {
  const supabase = useMemo(() => createClient(), []);
  const [month, setMonth] = useState<Date>(() => startOfMonth(new Date()));
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [orders, setOrders] = useState<OrderCalRow[]>([]);

  const monthTitle = useMemo(() => {
    const y = month.getFullYear();
    const m = month.getMonth() + 1;
    return `${y}-${pad2(m)}`;
  }, [month]);

  const weeks = useMemo(() => makeMonthGrid(month), [month]);

  // ship_date -> orders[]
  const ordersByDate = useMemo(() => {
    const map: Record<string, OrderCalRow[]> = {};
    for (const o of orders) {
      if (!o.ship_date) continue;
      (map[o.ship_date] ||= []).push(o);
    }
    // 보기 좋게: 거래처명 기준 정렬
    for (const k of Object.keys(map)) {
      map[k].sort((a, b) => (a.customer_name || "").localeCompare(b.customer_name || ""));
    }
    return map;
  }, [orders]);

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setMsg(null);

      try {
        const first = startOfMonth(month);
        const last = endOfMonth(month);

        const from = toYMD(first);
        const to = toYMD(last);

        // ✅ orders.ship_date 기준으로 해당 월만 조회
        const { data, error } = await supabase
          .from("orders")
          .select("id, ship_date, customer_name, ship_method")
          .gte("ship_date", from)
          .lte("ship_date", to)
          .order("ship_date", { ascending: true });

        if (error) throw error;

        const filtered = (data as OrderCalRow[]).filter((r) => !isMallCustomer(r.customer_name));
        if (alive) setOrders(filtered);
      } catch (e: any) {
        if (alive) setMsg(e?.message ?? "캘린더 데이터를 불러오지 못했습니다.");
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, [month, supabase]);

  const dayNames = ["일", "월", "화", "수", "목", "금", "토"];

  return (
    <div style={{ padding: 16 }}>
      <h1 style={{ fontSize: 22, margin: "8px 0 12px 0" }}>출고 캘린더</h1>

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
        <button
          onClick={() => setMonth((m) => addMonths(m, -1))}
          style={{
            padding: "8px 12px",
            borderRadius: 10,
            border: "1px solid #333",
            background: "#111",
            color: "white",
            cursor: "pointer",
          }}
        >
          ◀ 이전달
        </button>

        <div style={{ fontSize: 18, fontWeight: 700, minWidth: 110, textAlign: "center" }}>
          {monthTitle}
        </div>

        <button
          onClick={() => setMonth((m) => addMonths(m, 1))}
          style={{
            padding: "8px 12px",
            borderRadius: 10,
            border: "1px solid #333",
            background: "#111",
            color: "white",
            cursor: "pointer",
          }}
        >
          다음달 ▶
        </button>

        <div style={{ marginLeft: "auto", opacity: 0.8, fontSize: 13 }}>
          {loading ? "불러오는 중..." : `출고건 ${orders.length}건`}
        </div>
      </div>

      {msg ? (
        <div style={{ padding: 12, border: "1px solid #552", borderRadius: 12, background: "#221" }}>
          {msg}
        </div>
      ) : null}

      {/* 요일 헤더 */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gap: 6,
          marginTop: 10,
          marginBottom: 6,
        }}
      >
        {dayNames.map((d, idx) => (
          <div
            key={d}
            style={{
              padding: "8px 10px",
              borderRadius: 10,
              background: "#0f0f0f",
              border: "1px solid #222",
              fontWeight: 700,
              color: idx === 0 ? "#ff6b6b" : idx === 6 ? "#6bbcff" : "white",
            }}
          >
            {d}
          </div>
        ))}
      </div>

      {/* 달력 본문 */}
      <div style={{ display: "grid", gap: 6 }}>
        {weeks.map((week, wi) => (
          <div
            key={wi}
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
              gap: 6,
            }}
          >
            {week.map((day, di) => {
              const ymd = toYMD(day);
              const inMonth = day.getMonth() === month.getMonth();
              const items = ordersByDate[ymd] || [];

              return (
                <div
                  key={ymd}
                  style={{
                    minHeight: 120,
                    borderRadius: 12,
                    border: "1px solid #222",
                    background: inMonth ? "#0b0b0b" : "#050505",
                    padding: 10,
                    opacity: inMonth ? 1 : 0.55,
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center" }}>
                    <div
                      style={{
                        fontWeight: 800,
                        color: di === 0 ? "#ff6b6b" : di === 6 ? "#6bbcff" : "white",
                      }}
                    >
                      {day.getDate()}
                    </div>

                    {items.length > 0 ? (
                      <div
                        style={{
                          marginLeft: 8,
                          fontSize: 12,
                          padding: "2px 8px",
                          borderRadius: 999,
                          border: "1px solid #333",
                          background: "#111",
                          opacity: 0.9,
                        }}
                      >
                        {items.length}건
                      </div>
                    ) : null}
                  </div>

                  <div style={{ flex: 1, overflowY: "auto", paddingRight: 2 }}>
                    {items.length === 0 ? (
                      <div style={{ fontSize: 12, opacity: 0.5 }}>출고 없음</div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {items.map((o) => (
                          <div
                            key={o.id}
                            title={`${o.customer_name ?? ""} - ${o.ship_method ?? ""}`}
                            style={{
                              fontSize: 12.5,
                              lineHeight: 1.25,
                              padding: "6px 8px",
                              borderRadius: 10,
                              border: "1px solid #2a2a2a",
                              background: "#111",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {(o.customer_name ?? "(업체명없음)") + " - " + (o.ship_method ?? "")}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div style={{ marginTop: 14, fontSize: 12, opacity: 0.65 }}>
        기준: orders.ship_date(출고일) / 표시: customer_name, ship_method / 제외: 네이버·쿠팡·카카오 판매 거래처
      </div>
    </div>
  );
}