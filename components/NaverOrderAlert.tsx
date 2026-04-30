"use client";

import { useEffect, useRef, useState } from "react";

type Order = {
  id: string;
  product_name: string;
  quantity: number;
  price: number;
  buyer_name: string;
  ordered_at: string;
  channel?: "naver" | "coupang" | "cafe24";
};

export default function NaverOrderAlert() {
  const [naverCount, setNaverCount] = useState(0);
  const [coupangCount, setCoupangCount] = useState(0);
  const [cafe24Count, setCafe24Count] = useState(0);
  const [orders, setOrders] = useState<Order[]>([]);
  const [open, setOpen] = useState<"naver" | "coupang" | "cafe24" | null>(null);
  const prevNaverRef = useRef(0);
  const prevCoupangRef = useRef(0);
  const prevCafe24Ref = useRef(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const initializedRef = useRef(false);

  const playBeep = async () => {
    try {
      if (!audioCtxRef.current) return;
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") await ctx.resume();
      
      // 저주파 + 고주파 동시에 울려서 더 크게 들림
      const frequencies = [880, 1760];
      [0, 0.2, 0.4].forEach(delay => {
        frequencies.forEach(freq => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.type = "sine"; // sine보다 훨씬 크고 날카로움
          osc.frequency.value = freq;
          gain.gain.setValueAtTime(1.0, ctx.currentTime + delay);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.15);
          osc.start(ctx.currentTime + delay);
          osc.stop(ctx.currentTime + delay + 0.2);
        });
      });
    } catch {}
  };

  const unlock = () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
    }
    audioCtxRef.current.resume();
  };

  const addOrders = (newOnes: Order[]) => {
    setOrders(prev => {
      const ids = new Set(prev.map(o => o.id));
      const incoming = newOnes.filter(o => !ids.has(o.id));
      return [...incoming, ...prev].slice(0, 30);
    });
  };


  const pollNaver = async () => {
    try {
      const res = await fetch("/api/naver/poll");
      if (!res.ok) return;
      const data = await res.json();
      const count = data.newCount ?? 0;
      if (count > prevNaverRef.current && initializedRef.current) playBeep();
      prevNaverRef.current = count;
      setNaverCount(count);
      if (data.orders?.length) addOrders(data.orders.map((o: Order) => ({ ...o, channel: "naver" as const })));
    } catch {}
  };
  
  const pollCafe24 = async () => {
    try {
      const res = await fetch("/api/cafe24/poll");
      if (!res.ok) return;
      const data = await res.json();
      const count = data.newCount ?? 0;
      if (count > prevCafe24Ref.current && initializedRef.current) playBeep();
      prevCafe24Ref.current = count;
      setCafe24Count(count);
      if (data.orders?.length) addOrders(data.orders.map((o: Order) => ({ ...o, channel: "cafe24" as const })));
    } catch {}
  };

  const pollCoupang = async () => {
    try {
      const res = await fetch("/api/coupang/poll");
      if (!res.ok) return;
      const data = await res.json();
      const count = data.newCount ?? 0;
      if (count > prevCoupangRef.current && initializedRef.current) playBeep();
      prevCoupangRef.current = count;
      setCoupangCount(count);
      if (data.orders?.length) addOrders(data.orders.map((o: Order) => ({ ...o, channel: "coupang" as const })));
    } catch {}
  };

  useEffect(() => {
    document.addEventListener("click", unlock, { once: true });

    const init = async () => {
      await pollNaver();
      await pollCoupang();
      await pollCafe24();
      initializedRef.current = true;
    };
    init();

    const timer = setInterval(() => { pollNaver(); pollCoupang(); pollCafe24(); }, 300_000);
    return () => clearInterval(timer);
  }, []);

  const btnStyle = (count: number, color: string) => ({
    position: "relative" as const,
    padding: "5px 8px",
    borderRadius: 8,
    border: `1px solid ${count > 0 ? color : "rgba(255,255,255,0.16)"}`,
    backgroundColor: count > 0 ? `${color}22` : "rgba(255,255,255,0.04)",
    color: "white",
    fontWeight: 700,
    fontSize: 12,
    cursor: "pointer",
    whiteSpace: "nowrap" as const,
  });

  const Badge = ({ count }: { count: number }) =>
    count > 0 ? (
      <span style={{
        position: "absolute", top: -6, right: -6,
        backgroundColor: "#ef4444", color: "white",
        borderRadius: "50%", width: 18, height: 18,
        fontSize: 10, fontWeight: 900,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {count > 99 ? "99+" : count}
      </span>
    ) : null;

  const Dropdown = ({ channel }: { channel: "naver" | "coupang" }) => {
    const filtered = orders.filter(o => o.channel === channel);
    const color = channel === "naver" ? "#03c75a" : channel === "coupang" ? "#ff6600" : "#6463ff";
    const label = channel === "naver" ? "네이버" : channel === "coupang" ? "쿠팡" : "카페24";
    const count = channel === "naver" ? naverCount : channel === "coupang" ? coupangCount : cafe24Count;

    return (
      <div style={{
        position: "fixed", top: 48, right: 16,
        width: 300, backgroundColor: "#1a1a1a",
        border: "1px solid rgba(255,255,255,0.15)",
        borderRadius: 10, zIndex: 9999,
        boxShadow: "0 8px 32px rgba(0,0,0,0.5)", overflow: "hidden",
      }}>
        <div style={{
          padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,0.1)",
          color: "white", fontWeight: 700, fontSize: 13,
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <span style={{ color }}>{label} 신규 주문 {count > 0 ? `(${count})` : ""}</span>
          <button
onClick={async () => {
  if (channel === "naver") {
    await fetch("/api/naver/confirm", { method: "POST" });
    setNaverCount(0); prevNaverRef.current = 0;
  } else if (channel === "coupang") {
    await fetch("/api/coupang/confirm", { method: "POST" });
    setCoupangCount(0); prevCoupangRef.current = 0;
  } else {
    await fetch("/api/cafe24/confirm", { method: "POST" });
    setCafe24Count(0); prevCafe24Ref.current = 0;
  }
  setOpen(null);
}}

            style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer", fontSize: 11 }}
          >
            모두 확인
          </button>
        </div>
        {filtered.length === 0 ? (
          <div style={{ padding: "20px 14px", color: "rgba(255,255,255,0.4)", fontSize: 12, textAlign: "center" }}>
            신규 주문 없음
          </div>
        ) : (
          <div style={{ maxHeight: 360, overflowY: "auto" }}>
            {filtered.map(o => (
              <div key={o.id} style={{ padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,0.06)", color: "white" }}>
                <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 3 }}>{o.product_name}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", display: "flex", gap: 8 }}>
                  <span>{o.buyer_name}</span>
                  <span>수량 {o.quantity}</span>
                  <span>{o.price?.toLocaleString()}원</span>
                </div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>
                  {o.ordered_at ? new Date(o.ordered_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : ""}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ display: "flex", gap: 6 }}>
      <div style={{ position: "relative" }}>
        <button style={btnStyle(naverCount, "rgba(3,199,90,0.7)")} onClick={() => { unlock(); setOpen(open === "naver" ? null : "naver"); if (open !== "naver") { setNaverCount(0); prevNaverRef.current = 0; } }}>
          N 주문
          <Badge count={naverCount} />
        </button>
        {open === "naver" && <Dropdown channel="naver" />}
      </div>

      <div style={{ position: "relative" }}>
        <button style={btnStyle(coupangCount, "rgba(255,102,0,0.7)")} onClick={() => { unlock(); setOpen(open === "coupang" ? null : "coupang"); if (open !== "coupang") { setCoupangCount(0); prevCoupangRef.current = 0; } }}>
          C 주문
          <Badge count={coupangCount} />
        </button>
        {open === "coupang" && <Dropdown channel="coupang" />}
      </div>

      <div style={{ position: "relative" }}>
        <button style={btnStyle(cafe24Count, "rgba(100,99,255,0.7)")} onClick={() => { unlock(); setOpen(open === "cafe24" ? null : "cafe24"); if (open !== "cafe24") { setCafe24Count(0); prevCafe24Ref.current = 0; } }}>
          카페24
          <Badge count={cafe24Count} />
        </button>
        {open === "cafe24" && <Dropdown channel="cafe24" />}
      </div>
    </div>
  );
}