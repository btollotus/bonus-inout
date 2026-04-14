"use client";

import { useEffect, useRef, useState } from "react";

type Order = {
  id: string;
  product_name: string;
  quantity: number;
  price: number;
  buyer_name: string;
  ordered_at: string;
};

export default function NaverOrderAlert() {
  const [count, setCount] = useState(0);
  const [orders, setOrders] = useState<Order[]>([]);
  const [open, setOpen] = useState(false);
  const audioRef = useRef<AudioContext | null>(null);
  const prevCountRef = useRef(0);

  const playBeep = () => {
    try {
      const ctx = new AudioContext();
      [0, 0.15, 0.3].forEach(delay => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 1200;
        gain.gain.setValueAtTime(0.3, ctx.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.1);
        osc.start(ctx.currentTime + delay);
        osc.stop(ctx.currentTime + delay + 0.1);
      });
    } catch {}
  };

  const poll = async () => {
    try {
      const res = await fetch("/api/naver/poll");
      if (!res.ok) return;
      const data = await res.json();

      if (data.newCount > prevCountRef.current) {
        playBeep();
      }
      prevCountRef.current = data.newCount ?? 0;
      setCount(data.newCount ?? 0);
      if (data.orders?.length) {
        setOrders((prev) => {
          const ids = new Set(prev.map((o) => o.id));
          const incoming = (data.orders as Order[]).filter((o) => !ids.has(o.id));
          return [...incoming, ...prev].slice(0, 20);
        });
      }
    } catch {}
  };

  const pollCoupang = async () => {
    try {
      const res = await fetch("/api/coupang/poll");
      if (!res.ok) return;
      const data = await res.json();
      if (data.newCount > 0) {
        playBeep();
        setCount((prev) => prev + (data.newCount ?? 0));
        if (data.orders?.length) {
          setOrders((prev) => {
            const ids = new Set(prev.map((o) => o.id));
            const incoming = (data.orders as Order[]).filter((o) => !ids.has(o.id));
            return [...incoming, ...prev].slice(0, 20);
          });
        }
      }
    } catch {}
  };
  
  useEffect(() => {
    poll();
    pollCoupang();
    const timer = setInterval(() => { poll(); pollCoupang(); }, 30_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          position: "relative",
          padding: "5px 8px",
          borderRadius: 8,
          border: `1px solid ${count > 0 ? "rgba(251,191,36,0.7)" : "rgba(255,255,255,0.16)"}`,
          backgroundColor: count > 0 ? "rgba(251,191,36,0.15)" : "rgba(255,255,255,0.04)",
          color: "white",
          fontWeight: 700,
          fontSize: 12,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        🔔 주문
        {count > 0 && (
          <span
            style={{
              position: "absolute",
              top: -6,
              right: -6,
              backgroundColor: "#ef4444",
              color: "white",
              borderRadius: "50%",
              width: 18,
              height: 18,
              fontSize: 10,
              fontWeight: 900,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            left: 0,
            width: 320,
            backgroundColor: "#1a1a1a",
            border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: 10,
            zIndex: 9999,
            boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "10px 14px",
              borderBottom: "1px solid rgba(255,255,255,0.1)",
              color: "white",
              fontWeight: 700,
              fontSize: 13,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span>신규 주문 {count > 0 ? `(${count})` : ""}</span>
            <button
              onClick={() => { setCount(0); setOpen(false); prevCountRef.current = 0; }}
              style={{
                background: "none",
                border: "none",
                color: "rgba(255,255,255,0.5)",
                cursor: "pointer",
                fontSize: 11,
              }}
            >
              모두 확인
            </button>
          </div>

          {orders.length === 0 ? (
            <div style={{ padding: "20px 14px", color: "rgba(255,255,255,0.4)", fontSize: 12, textAlign: "center" }}>
              신규 주문 없음
            </div>
          ) : (
            <div style={{ maxHeight: 360, overflowY: "auto" }}>
              {orders.map((o) => (
                <div
                  key={o.id}
                  style={{
                    padding: "10px 14px",
                    borderBottom: "1px solid rgba(255,255,255,0.06)",
                    color: "white",
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 3 }}>
                    {o.product_name}
                  </div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", display: "flex", gap: 8 }}>
                    <span>{o.buyer_name}</span>
                    <span>수량 {o.quantity}</span>
                    <span>{o.price?.toLocaleString()}원</span>
                  </div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>
                    {o.ordered_at
                      ? new Date(o.ordered_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })
                      : ""}
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