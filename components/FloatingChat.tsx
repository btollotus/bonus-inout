"use client";
import { useEffect, useRef } from "react";
import { useChatContext } from "./ChatProvider";

function formatTime(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}

export default function FloatingChat() {
  const {
    messages, unreadCount, chatOpen, setChatOpen,
    chatInput, setChatInput, sendMessage, sendImage,
    chatSending, imageUploading, myUserId, canChat,
  } = useChatContext();

  const chatBottomRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  // 새 메시지 오면 스크롤
  useEffect(() => {
    if (chatOpen) {
      setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  }, [messages, chatOpen]);

  // 채팅창 열릴 때 스크롤
  useEffect(() => {
    if (chatOpen) {
      setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: "auto" }), 100);
    }
  }, [chatOpen]);

  if (!canChat) return null;

  return (
    <>
      {/* 플로팅 버튼 */}
      {!chatOpen && (
        <button
          onClick={() => setChatOpen(true)}
          className={`fixed bottom-6 right-6 z-[190] flex h-14 w-14 items-center justify-center rounded-full shadow-lg active:scale-95 transition-all ${
            unreadCount > 0
              ? "bg-red-500 hover:bg-red-600 animate-bounce"
              : "bg-blue-600 hover:bg-blue-700"
          }`}
          title="내부 채팅"
        >
          {unreadCount > 0 ? (
            <div className="flex flex-col items-center leading-none gap-0.5">
              <span className="text-lg">💬</span>
              <span className="text-[11px] font-bold text-white tabular-nums">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            </div>
          ) : (
            <span className="text-2xl">💬</span>
          )}
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
              const isTemp = msg.id.startsWith("temp-");
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
                        ? `rounded-tr-sm bg-blue-600 text-white ${isTemp ? "opacity-60" : ""}`
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
                      {isTemp ? "전송 중..." : formatTime(msg.created_at)}
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
            <div className="flex items-end gap-1.5">
              {/* 카메라 버튼 */}
              <button
                onClick={() => cameraInputRef.current?.click()}
                disabled={imageUploading || chatSending}
                className="shrink-0 flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-lg hover:bg-slate-100 active:scale-95 transition-all disabled:opacity-50"
                title="카메라 촬영"
              >📷</button>
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) sendImage(f); e.target.value = ""; }}
              />

              {/* 갤러리 버튼 */}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={imageUploading || chatSending}
                className="shrink-0 flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-lg hover:bg-slate-100 active:scale-95 transition-all disabled:opacity-50"
                title="갤러리 선택"
              >🖼️</button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) sendImage(f); e.target.value = ""; }}
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
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-4 h-4">
                  <path d="M22 2L11 13" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M22 2L15 22l-4-9-9-4 20-7z" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
            <div className="mt-1.5 text-[10px] text-slate-400 text-center">
              Enter 전송 · Shift+Enter 줄바꿈 · 📷 카메라 · 🖼️ 갤러리
            </div>
          </div>
        </div>
      )}
    </>
  );
}
