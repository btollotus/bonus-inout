"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

type StockError = {
  id: string;
  work_order_no: string;
  error_type: "OUT" | "IN";
  error_message: string;
  occurred_at: string;
};

export default function StockErrorAlert({ role }: { role?: string }) {
  const supabase = createClient();
  const [count, setCount] = useState(0);
  const [errors, setErrors] = useState<StockError[]>([]);
  const [open, setOpen] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const canResolve = role === "ADMIN";

  const load = async () => {
    const { data, count: c } = await supabase
      .from("work_order_stock_errors")
      .select("id, work_order_no, error_type, error_message, occurred_at", { count: "exact" })
      .eq("resolved", false)
      .order("occurred_at", { ascending: false })
      .limit(30);
    setErrors(data ?? []);
    setCount(c ?? (data?.length ?? 0));
  };

  useEffect(() => {
    load();
    const timer = setInterval(load, 120_000);
    return () => clearInterval(timer);
  }, []);

  const resolve = async (id: string) => {
    if (!canResolve) return;
    setResolvingId(id);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("work_order_stock_errors")
      .update({ resolved: true, resolved_by: user?.id ?? null, resolved_at: new Date().toISOString() })
      .eq("id", id);
    setResolvingId(null);
    if (!error) {
      setErrors((prev) => prev.filter((e) => e.id !== id));
      setCount((prev) => Math.max(0, prev - 1));
    }
  };

  const btnStyle = {
    position: "relative" as const,
    padding: "5px 8px",
    borderRadius: 8,
    border: `1px solid ${count > 0 ? "rgba(239,68,68,0.7)" : "rgba(255,255,255,0.16)"}`,
    backgroundColor: count > 0 ? "rgba(239,68,68,0.15)" : "rgba(255,255,255,0.04)",
    color: "white",
    fontWeight: 700,
    fontSize: 12,
    cursor: "pointer",
    whiteSpace: "nowrap" as const,
  };

  return (
    <div style={{ position: "relative" }}>
      <button style={btnStyle} onClick={() => setOpen((o) => !o)}>
        재고오류
        {count > 0 && (
          <span style={{
            position: "absolute", top: -6, right: -6,
            backgroundColor: "#ef4444", color: "white",
            borderRadius: "50%", width: 18, height: 18,
            fontSize: 10, fontWeight: 900,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>
      {open && (
        <div style={{
          position: "fixed", top: 48, right: 16,
          width: 340, backgroundColor: "#1a1a1a",
          border: "1px solid rgba(255,255,255,0.15)",
          borderRadius: 10, zIndex: 9999,
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)", overflow: "hidden",
        }}>
          <div style={{
            padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,0.1)",
            color: "white", fontWeight: 700, fontSize: 13,
          }}>
            <span style={{ color: "#ef4444" }}>미해결 재고 오류 {count > 0 ? `(${count})` : ""}</span>
          </div>
          {errors.length === 0 ? (
            <div style={{ padding: "20px 14px", color: "rgba(255,255,255,0.4)", fontSize: 12, textAlign: "center" }}>
              미해결 오류 없음
            </div>
          ) : (
            <div style={{ maxHeight: 400, overflowY: "auto" }}>
              {errors.map((e) => (
                <div key={e.id} style={{ padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,0.06)", color: "white" }}>
                  <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 3 }}>
                    {e.work_order_no}{" "}
                    <span style={{ color: e.error_type === "OUT" ? "#fbbf24" : "#f87171" }}>[{e.error_type}]</span>
                  </div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", marginBottom: 4 }}>{e.error_message}</div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>
                      {new Date(e.occurred_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}
                    </span>
                    {canResolve && (
                      <button
                        disabled={resolvingId === e.id}
                        onClick={() => resolve(e.id)}
                        style={{
                          padding: "3px 8px", borderRadius: 6,
                          border: "1px solid rgba(34,197,94,0.5)",
                          backgroundColor: "rgba(34,197,94,0.15)",
                          color: "#4ade80", fontSize: 10, fontWeight: 700,
                          cursor: resolvingId === e.id ? "default" : "pointer",
                        }}
                      >
                        {resolvingId === e.id ? "처리중..." : "해결완료"}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}