"use client";
import { usePathname } from "next/navigation";
import TopNav from "@/components/TopNav";
import { useEffect, useRef, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/browser";
import type { RealtimeChannel } from "@supabase/supabase-js";

const HIDE_NAV_PATHS = ["/login", "/accept-invite", "/reset-password"];


type NewWoNotification = {
  id: string;
  client_name: string;
  product_name: string;
  work_order_no: string;
  order_date: string;
  created_at: string;
};

type ChatMessage = {
  id: string;
  sender_id: string;
  sender_name: string;
  sender_role: string;
  content: string | null;
  image_url: string | null;
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

function playChatSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.2);
  } catch (e) {}
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}

export default function TopNavWrapper({ role, email }: { role?: string; email?: string }) {
  const pathname = usePathname();
  const hide = HIDE_NAV_PATHS.some((p) => pathname.startsWith(p));

  // ── 작업지시서 알람 ──
  const [notifications, setNotifications] = useState<NewWoNotification[]>([]);
  const [showModal, setShowModal] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const pageLoadTimeRef = useRef<string>(new Date().toISOString());

  // ── 채팅 ──
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [myName, setMyName] = useState<string>("");
  const [myRole, setMyRole] = useState<string>(role ?? "");
  // ✅ 항상 최신값 참조용 ref
  const myUserIdRef = useRef<string | null>(null);
  const myNameRef = useRef<string>("");
  const myRoleRef = useRef<string>(role ?? "");


  const [imageUploading, setImageUploading] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);
   const fileInputRef = useRef<HTMLInputElement | null>(null);
const cameraInputRef = useRef<HTMLInputElement | null>(null);  // ← 여기로 이동

  const supabaseRef = useRef(createClient());

  // 유저 정보 로드
  useEffect(() => {
    if (hide) return;
    (async () => {
      const supabase = supabaseRef.current;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setMyUserId(user.id);
      myUserIdRef.current = user.id;
  

      const { data: roleData } = await supabase
        .from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
      const r = roleData?.role ?? role ?? "";
      setMyRole(r);
      myRoleRef.current = r;

      const { data: empData } = await supabase
        .from("employees").select("name").eq("auth_user_id", user.id).maybeSingle();
        if (empData?.name) {
          setMyName(empData.name);
          myNameRef.current = empData.name;
        } else {
          const fallback = email?.split("@")[0] ?? "";
          setMyName(fallback);
          myNameRef.current = fallback;
        }
    })();
  }, [hide]);

  // 채팅 메시지 초기 로드
  useEffect(() => {
    if (hide) return;
    (async () => {
      const supabase = supabaseRef.current;
      const { data } = await supabase
        .from("chat_messages")
        .select("*")
        .order("created_at", { ascending: true })
        .limit(100);
      if (data) setMessages(data as ChatMessage[]);
    })();
  }, [hide]);

  // 채팅 Realtime 구독
  useEffect(() => {
    if (hide) return;
    const supabase = supabaseRef.current;
    const channel = supabase
      .channel("chat_messages_realtime")
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages" },
        (payload) => {
          const msg = payload.new as ChatMessage;
          // ✅ 낙관적 메시지(temp-)와 중복 방지
          setMessages((prev) => {
            const filtered = prev.filter((m) => !m.id.startsWith("temp-") || m.content !== msg.content);
            return [...filtered, msg];
          });
          // 내가 보낸 메시지가 아닐 때만 알림
          setMyUserId((currentId) => {
            if (msg.sender_id !== currentId) {
              playChatSound();
              setChatOpen((open) => {
                if (!open) setUnreadCount((c) => c + 1);
                return open;
              });
            }
            return currentId;
          });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [hide]);

  // 채팅창 열면 unread 초기화 + 스크롤 하단
  useEffect(() => {
    if (chatOpen) {
      setUnreadCount(0);
      setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    }
  }, [chatOpen]);

  // 새 메시지 오면 채팅창 열려있으면 스크롤
  useEffect(() => {
    if (chatOpen) {
      setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  }, [messages]);

  // 작업지시서 알람 구독
  useEffect(() => {
    if (hide) return;
    const supabase = supabaseRef.current;
    const channel = supabase
      .channel("wo_global_insert_notify")
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "work_orders" },
        (payload) => {
          const d = payload.new as Record<string, unknown>;
          const createdAt = String(d.created_at ?? "");
          if (createdAt && createdAt < pageLoadTimeRef.current) return;
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
    return () => { supabase.removeChannel(channel); channelRef.current = null; };
  }, [hide]);

  // 메시지 전송
  const sendMessage = useCallback(async () => {
    if (!chatInput.trim() || chatSending) return;
    const text = chatInput.trim();
    setChatInput("");
    setChatSending(true);
    // ✅ 낙관적 업데이트: 즉시 화면에 표시
    const tempMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      sender_id: myUserId ?? "",
      sender_name: myName,
      sender_role: myRole,
      content: text,
      image_url: null,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempMsg]);
    const supabase = supabaseRef.current;
    await supabase.from("chat_messages").insert({
      sender_id: myUserIdRef.current,
      sender_name: myNameRef.current,
      sender_role: myRoleRef.current,
      content: text,
      image_url: null,
    });
    setChatSending(false);
  }, [chatInput, chatSending, myUserId, myName, myRole]);

  // 이미지 전송
  const sendImage = useCallback(async (file: File) => {
    if (!file) return;
    setImageUploading(true);
    const supabase = supabaseRef.current;
    try {
      // ✅ 이미지 압축 (최대 1200px, 품질 0.7)
      const compressed = await new Promise<Blob>((resolve) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
          const MAX = 1200;
          let { width, height } = img;
          if (width > MAX || height > MAX) {
            if (width > height) { height = Math.round(height * MAX / width); width = MAX; }
            else { width = Math.round(width * MAX / height); height = MAX; }
          }
          const canvas = document.createElement("canvas");
          canvas.width = width; canvas.height = height;
          canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
          canvas.toBlob((b) => resolve(b!), "image/jpeg", 0.7);
          URL.revokeObjectURL(url);
        };
        img.src = url;
      });
      const path = `${myUserIdRef.current}/${Date.now()}.jpg`;
      const { error: upErr } = await supabase.storage
        .from("chat-images")
        .upload(path, compressed, { contentType: "image/jpeg" });




      if (upErr) throw upErr;

      const { data: urlData } = supabase.storage
        .from("chat-images")
        .getPublicUrl(path);

        await supabase.from("chat_messages").insert({
          sender_id: myUserIdRef.current,
          sender_name: myNameRef.current,
          sender_role: myRoleRef.current,
          content: null,
          image_url: urlData.publicUrl,
        });
    } catch (e: any) {
      console.error("이미지 전송 오류:", e?.message);
    } finally {
      setImageUploading(false);
    }
  }, [myUserId, myName, myRole]);

  if (hide) return null;

  const canChat = myRole === "ADMIN" || myRole === "SUBADMIN";

  return (
    <>
      <TopNav role={role} email={email} />

      {/* ── 작업지시서 알람 모달 ── */}
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
                className="flex-1 rounded-xl bg-orange-500 py-2.5 text-sm font-bold text-white hover:bg-orange-600 transition-colors"
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

      {/* ── 채팅 (ADMIN/SUBADMIN만) ── */}
      {canChat && (
        <>
{/* 플로팅 버튼 */}
{!chatOpen && (
            <button
              onClick={() => setChatOpen(true)}
              className={`fixed bottom-6 right-6 z-[190] flex h-14 w-14 items-center justify-center rounded-full shadow-lg active:scale-95 transition-all ${
                unreadCount > 0
                  ? "bg-red-500 hover:bg-red-600 animate-bounce shadow-red-300 shadow-xl"
                  : "bg-blue-600 hover:bg-blue-700"
              }`}
              title="내부 채팅"
            >
              {unreadCount > 0 ? (
                <div className="flex flex-col items-center leading-none">
                  <span className="text-lg">💬</span>
                  <span className="text-[11px] font-bold text-white tabular-nums">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                </div>
              ) : (
                <span className="text-2xl">💬</span>
              )}
              {/* 링 애니메이션 */}
              {unreadCount > 0 && (
                <span className="absolute inset-0 rounded-full bg-red-400 animate-ping opacity-40" />
              )}
            </button>
          )}

          {/* 채팅창 */}
          {chatOpen && (
            <div className="fixed bottom-4 right-4 z-[190] flex flex-col w-[360px] max-w-[calc(100vw-2rem)] h-[520px] max-h-[calc(100vh-5rem)] rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden">

              {/* 헤더 */}
              <div className="flex items-center justify-between gap-2 bg-blue-600 px-4 py-3 shrink-0">
                <div className="flex items-center gap-2">
                  <span className="text-lg">💬</span>
                  <div>
                    <div className="text-sm font-bold text-white">내부 채팅</div>
                    <div className="text-[11px] text-blue-200">ADMIN · SUBADMIN 전용</div>
                  </div>
                </div>
                <button
                  onClick={() => setChatOpen(false)}
                  className="rounded-lg p-1.5 text-white/70 hover:bg-white/20 hover:text-white transition-colors"
                >
                  ✕
                </button>
              </div>

              {/* 메시지 목록 */}
              <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-slate-50">
                {messages.length === 0 && (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center text-slate-400 text-sm">
                      <div className="text-3xl mb-2">💬</div>
                      <div>아직 메시지가 없어요</div>
                      <div className="text-xs mt-1">첫 메시지를 보내보세요!</div>
                    </div>
                  </div>
                )}
                {messages.map((msg) => {
                  const isMine = msg.sender_id === myUserId;
                  return (
                    <div key={msg.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[78%] flex flex-col gap-0.5 ${isMine ? "items-end" : "items-start"}`}>
                        {!isMine && (
                          <div className="flex items-center gap-1.5 px-1">
                            <span className="text-[11px] font-semibold text-slate-600">{msg.sender_name}</span>
                            <span className={`text-[9px] rounded-full px-1.5 py-0.5 font-bold ${
                              msg.sender_role === "ADMIN"
                                ? "bg-red-100 text-red-600"
                                : "bg-blue-100 text-blue-600"
                            }`}>
                              {msg.sender_role}
                            </span>
                          </div>
                        )}
                        <div className={`rounded-2xl px-3 py-2 ${
                          isMine
                            ? "rounded-tr-sm bg-blue-600 text-white"
                            : "rounded-tl-sm bg-white border border-slate-200 text-slate-800"
                        }`}>
                          {msg.image_url ? (
                            <a href={msg.image_url} target="_blank" rel="noopener noreferrer">
                              <img
                                src={msg.image_url}
                                alt="전송된 이미지"
                                className="max-w-full rounded-xl max-h-48 object-contain cursor-pointer hover:opacity-90 transition-opacity"
                              />
                            </a>
                          ) : (
                            <div className="text-sm whitespace-pre-wrap break-words">{msg.content}</div>
                          )}
                        </div>
                        <div className={`text-[10px] text-slate-400 px-1 ${isMine ? "text-right" : "text-left"}`}>
                          {formatTime(msg.created_at)}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={chatBottomRef} />
              </div>

              {/* 입력창 */}
              <div className="shrink-0 border-t border-slate-200 bg-white p-2">
                {imageUploading && (
                  <div className="mb-2 rounded-lg bg-blue-50 px-3 py-1.5 text-xs text-center text-blue-600 animate-pulse">
                    📤 이미지 업로드 중...
                  </div>
                )}
                <div className="flex items-end gap-2">
                  {/* 사진 버튼 */}


{/* 카메라 버튼 */}
<button
                    onClick={() => cameraInputRef.current?.click()}
                    disabled={imageUploading || chatSending}
                    className="shrink-0 flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-lg hover:bg-slate-100 active:scale-95 transition-all disabled:opacity-50"
                    title="카메라로 촬영"
                  >
                    📷
                  </button>
                  {/* 갤러리 버튼 */}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={imageUploading || chatSending}
                    className="shrink-0 flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-lg hover:bg-slate-100 active:scale-95 transition-all disabled:opacity-50"
                    title="갤러리에서 선택"
                  >
                    🖼️
                  </button>
                  {/* 카메라 전용 input */}
                  <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) sendImage(file);
                      e.target.value = "";
                    }}
                  />
                  {/* 갤러리 전용 input */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) sendImage(file);
                      e.target.value = "";
                    }}
                  />

                  {/* 텍스트 입력 */}
                  <textarea
                    className="flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 max-h-24"
                    rows={1}
                    placeholder="메시지 입력... (Enter 전송)"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage();
                      }
                    }}
                  />

                  {/* 전송 버튼 */}
                  <button
                    onClick={sendMessage}
                    disabled={!chatInput.trim() || chatSending || imageUploading}
                    className="shrink-0 flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-40"
                    title="전송"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-4 h-4">
                      <path d="M22 2L11 13" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M22 2L15 22l-4-9-9-4 20-7z" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                </div>
                <div className="mt-1.5 text-[10px] text-slate-400 text-center">
                  Enter 전송 · Shift+Enter 줄바꿈 · 📷 카메라/사진 첨부
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
