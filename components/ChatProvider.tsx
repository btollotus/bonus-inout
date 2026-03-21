"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

export type ChatMessage = {
  id: string;
  sender_id: string;
  sender_name: string;
  sender_role: string;
  content: string | null;
  image_url: string | null;
  created_at: string;
};

type ChatContextType = {
  messages: ChatMessage[];
  unreadCount: number;
  chatOpen: boolean;
  setChatOpen: (v: boolean) => void;
  chatInput: string;
  setChatInput: (v: string) => void;
  sendMessage: () => Promise<void>;
  sendImage: (file: File) => Promise<void>;
  chatSending: boolean;
  imageUploading: boolean;
  myUserId: string | null;
  canChat: boolean;
};

const ChatContext = createContext<ChatContextType | null>(null);

export function useChatContext() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChatContext must be used within ChatProvider");
  return ctx;
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
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.25);
  } catch {}
}

// 이미지 압축 (최대 1200px, JPEG 0.72)
async function compressImage(file: File): Promise<Blob> {
  return new Promise((resolve) => {
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
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
      canvas.toBlob((b) => resolve(b!), "image/jpeg", 0.72);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

export function ChatProvider({
  role,
  email,
  children,
}: {
  role?: string;
  email?: string;
  children: React.ReactNode;
}) {
  const supabase = useRef(createClient()).current;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [chatOpen, setChatOpenState] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [canChat, setCanChat] = useState(false);

  // 항상 최신값 ref
  const myUserIdRef = useRef<string | null>(null);
  const myNameRef = useRef<string>("");
  const myRoleRef = useRef<string>(role ?? "");
  const chatOpenRef = useRef(false);

  const setChatOpen = useCallback((v: boolean) => {
    setChatOpenState(v);
    chatOpenRef.current = v;
    if (v) setUnreadCount(0);
  }, []);

  // 유저 정보 로드
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      myUserIdRef.current = user.id;
      setMyUserId(user.id);

      const { data: roleData } = await supabase
        .from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
      const r = roleData?.role ?? role ?? "";
      myRoleRef.current = r;
      setCanChat(r === "ADMIN" || r === "SUBADMIN");

      const { data: empData } = await supabase
        .from("employees").select("name").eq("auth_user_id", user.id).maybeSingle();
      const name = empData?.name ?? email?.split("@")[0] ?? "";
      myNameRef.current = name;
    })();
  }, []);

  // 메시지 초기 로드
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("chat_messages")
        .select("*")
        .order("created_at", { ascending: true })
        .limit(200);
      if (data) setMessages(data as ChatMessage[]);
    })();
  }, []);

  // Realtime 구독 - 앱 생명주기 동안 유지
  useEffect(() => {
    const channel = supabase
      .channel("chat_global")
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages" },
        (payload) => {
          const msg = payload.new as ChatMessage;

          setMessages((prev) => {
            // 중복 방지 (이미 실제 id로 있으면 무시)
            if (prev.some((m) => m.id === msg.id)) return prev;

            // temp 메시지 교체: sender_id + content 일치하는 가장 오래된 것
            const tempIdx = prev.findIndex(
              (m) => m.id.startsWith("temp-") &&
              m.sender_id === msg.sender_id &&
              m.content === msg.content &&
              m.image_url === msg.image_url
            );
            if (tempIdx >= 0) {
              const next = [...prev];
              next[tempIdx] = msg;
              return next;
            }

            return [...prev, msg];
          });

          // 다른 사람 메시지만 알림
          if (msg.sender_id !== myUserIdRef.current) {
            playChatSound();
            if (!chatOpenRef.current) {
              setUnreadCount((c) => c + 1);
            }
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // 메시지 전송
  const sendMessage = useCallback(async () => {
    const text = chatInput.trim();
    if (!text || chatSending) return;

    setChatInput("");
    setChatSending(true);

    // 낙관적 업데이트
    const tempMsg: ChatMessage = {
        id: `temp-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
        sender_id: myUserIdRef.current ?? "",
        sender_name: myNameRef.current,
        sender_role: myRoleRef.current,
        content: text,
        image_url: null,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, tempMsg]);

    await supabase.from("chat_messages").insert({
      sender_id: myUserIdRef.current,
      sender_name: myNameRef.current,
      sender_role: myRoleRef.current,
      content: text,
      image_url: null,
    });

    setChatSending(false);
  }, [chatInput, chatSending]);

  // 이미지 전송
  const sendImage = useCallback(async (file: File) => {
    if (!file) return;
    setImageUploading(true);
    try {
      const compressed = await compressImage(file);
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
  }, []);

  return (
    <ChatContext.Provider value={{
      messages, unreadCount, chatOpen, setChatOpen,
      chatInput, setChatInput, sendMessage, sendImage,
      chatSending, imageUploading, myUserId, canChat,
    }}>
      {children}
    </ChatContext.Provider>
  );
}
