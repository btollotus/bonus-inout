"use client";
import { usePathname } from "next/navigation";
import TopNav from "@/components/TopNav";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import type { RealtimeChannel } from "@supabase/supabase-js";

// 이 경로들에서는 TopNav 숨김
const HIDE_NAV_PATHS = ["/login", "/accept-invite", "/reset-password"];

type NewWoNotification = {
  id: string;
  client_name: string;
  product_name: string;
  work_order_no: string;
  order_date: string;
  created_at: string;
};

function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const notes = [
      { freq: 523.25, start: 0.0,  dur: 0.15 },
      { freq: 659.25, start: 0.18, dur: 0.15 },
      { freq: 783.99, start: 0.36, dur: 0.25 },
    ];
    notes.forEach(({ freq, start, dur }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
      gain.gain.setValueAtTime(0, ctx.currentTime + start);
      gain.gain.linearRampToValueAtTime(0.4, ctx.currentTime + start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + dur + 0.05);
    });
  } catch (e) {
    console.warn("알림음 재생 실패:", e);
  }
}

export default function TopNavWrapper({ role, email }: { role?: string; email?: string }) {
  const pathname = usePathname();
  const hide = HIDE_NAV_PATHS.some((p) => pathname.startsWith(p));

  const [notifications, setNotifications] = useState<NewWoNotification[]>([]);
  const [showModal, setShowModal] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const pageLoadTimeRef = useRef<string>(new Date().toISOString());

  useEffect(() => {
    if (hide) return;

    console.log("🔔 [TopNavWrapper] 구독 시작...");
    const supabase = createClient();
    const channel = supabase
      .channel("wo_global_insert_notify")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "work_orders" },
        (payload) => {
          console.log("🔔 [TopNavWrapper] INSERT 수신!", payload.new);
          const d = payload.new as Record<string, unknown>;
          const createdAt = String(d.created_at ?? "");
          if (createdAt && createdAt < pageLoadTimeRef.current) {
            console.log("🔔 [TopNavWrapper] 과거 데이터라 무시:", createdAt, "<", pageLoadTimeRef.current);
            return;
          }

          const notification: NewWoNotification = {
            id: String(d.id ?? ""),
            client_name: String(d.client_name ?? ""),
            product_name: String(d.product_name ?? ""),
            work_order_no: String(d.work_order_no ?? ""),
            order_date: String(d.order_date ?? ""),
            created_at: createdAt,
          };

          setNotifications((prev) => [notification, ...prev]);
          setShowModal(true);
          playNotificationSound();
        }
      )
      .subscribe((status, err) => {
        console.log("🔔 [TopNavWrapper] 채널 상태:", status, err ?? "");
      });

    channelRef.current = channel;
    return () => {
      console.log("🔔 [TopNavWrapper] 구독 해제");
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [hide]);

  if (hide) return null;

  return (
    <>
      <TopNav role={role} email={email} />

      {showModal && notifications.length > 0 && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-[480px] rounded-2xl border border-orange-200 bg-white shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between gap-3 bg-orange-500 px-5 py-4">
              <div className="flex items-center gap-2">
                <span className="text-2xl animate-bounce">🔔</span>
                <div>
                  <div className="text-base font-bold text-white">새 작업지시서 도착!</div>
                  <div className="text-xs text-orange-100">새 주문이 등록됐습니다</div>
                </div>
              </div>
              <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-sm font-bold text-white">
                {notifications.length}건
              </span>
            </div>
            <div className="max-h-[320px] overflow-y-auto divide-y divide-slate-100">
              {notifications.map((n, idx) => (
                <div key={n.id} className="px-5 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-slate-800 truncate">{n.client_name}</div>
                      <div className="text-sm text-slate-600 truncate mt-0.5">{n.product_name}</div>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        <span className="text-[11px] text-slate-400 font-mono">{n.work_order_no}</span>
                        <span className="text-[11px] text-slate-400">· 주문일 {n.order_date}</span>
                      </div>
                    </div>
                    {idx === 0 && (
                      <span className="shrink-0 rounded-full bg-orange-100 border border-orange-200 px-2 py-0.5 text-[11px] font-semibold text-orange-700">NEW</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t border-slate-100 px-5 py-3 flex gap-2">
              <button
                className="flex-1 rounded-xl bg-orange-500 py-2.5 text-sm font-bold text-white hover:bg-orange-600 active:bg-orange-700 transition-colors"
                onClick={() => { setShowModal(false); setNotifications([]); }}
              >
                확인 ({notifications.length}건)
              </button>
              <button
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                onClick={() => setShowModal(false)}
              >
                나중에
              </button>
            </div>
          </div>
        </div>
      )}

      {!showModal && notifications.length > 0 && (
        <div className="fixed top-4 right-4 z-[199]">
          <button
            className="relative rounded-xl border border-orange-300 bg-orange-50 px-3 py-1.5 text-sm font-medium text-orange-700 hover:bg-orange-100 shadow-md"
            onClick={() => setShowModal(true)}
          >
            🔔 새 작업지시서
            <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
              {notifications.length}
            </span>
          </button>
        </div>
      )}
    </>
  );
}
