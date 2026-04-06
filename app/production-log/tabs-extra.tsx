"use client";

import React, { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

const supabase = createClient();

const card = "rounded-2xl border border-slate-200 bg-white shadow-sm";
const inp = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:outline-none";
const inpR = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-right tabular-nums focus:border-blue-400 focus:outline-none";
const btn = "rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50 active:bg-slate-100";
const btnOn = "rounded-xl border border-blue-500 bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700";
const btnSm = "rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium hover:bg-slate-50";

type UserRole = "ADMIN" | "SUBADMIN" | "USER" | null;
type WarmSlot = { id: string; slot_name: string; purpose: string };

type CcpSession = {
  id: string; session_date: string; slot_id: string; status: string; note: string | null;
  slot?: WarmSlot | null; events?: CcpEvent[]; orders?: CcpSessionOrder[];
};
type CcpEvent = {
  id: string; session_id: string; event_type: string; measured_at: string;
  temperature: number | null; is_ok: boolean | null; action_note: string | null; created_by: string | null;
};
type CcpSessionOrder = { id: string; work_order_ref: string | null; client_name: string | null; product_name: string | null };
type MetalLog = {
  id: string; log_date: string; product_name: string | null; quantity: number | null;
  start_time: string | null; end_time: string | null; fe_pass: boolean | null;
  sus_pass: boolean | null; product_pass: boolean | null; zone: string | null;
  action_note: string | null; note: string | null; created_by: string | null; approved_by: string | null;
};
type OtherHeatingLog = {
  id: string; log_date: string; work_type: string; measured_at: string;
  temperature: number | null; is_ok: boolean | null; action_note: string | null;
  note: string | null; created_by: string | null; approved_by: string | null;
};
type CompressorLog = {
  id: string; log_date: string; work_type: string; worked_at: string;
  work_hours: number | null; cumulative_hours: number | null; is_damaged: boolean;
  note: string | null; created_by: string | null; approved_by: string | null;
};
type PetStockLog = {
  id: string; log_date: string; log_type: string; quantity: number; defect_qty: number;
  note: string | null; created_by: string | null; approved_by: string | null;
};
type PetStock = { stock_raw: number; stock_coated: number; stock_sprayed_prod: number; stock_sprayed_sale: number };

const PET_LOG_TYPE_LABELS: Record<string, string> = {
  incoming: "입고", coating_done: "코팅완료", spray_done_prod: "분사완료(생산용)",
  spray_done_sale: "분사완료(판매용)", print_used: "인쇄사용", sale_cut: "재단판매",
};
const CCP_EVENT_LABELS: Record<string, string> = {
  start: "시작", mid_check: "중간점검", end: "종료",
  material_in: "원료투입", vat_refill: "밧트교체", move: "슬롯이동",
};
function eventBadgeCls(type: string) {
  if (type === "start") return "bg-blue-100 border-blue-200 text-blue-700";
  if (type === "end") return "bg-purple-100 border-purple-200 text-purple-700";
  if (type === "material_in") return "bg-green-100 border-green-200 text-green-700";
  if (type === "vat_refill") return "bg-amber-100 border-amber-200 text-amber-700";
  if (type === "move") return "bg-teal-100 border-teal-200 text-teal-700";
  return "bg-slate-100 border-slate-200 text-slate-600";
}

// ═══════════════════════════════════════════════════════════
// CCP-1B — 조회 + 수정 + 삭제
// ═══════════════════════════════════════════════════════════
export function Ccp1bTab({ role, userId, showToast }: {
  role: UserRole; userId: string | null;
  showToast: (msg: string, type?: "success" | "error") => void;
}) {
  const isAdmin = role === "ADMIN";
  const isAdminOrSubadmin = role === "ADMIN" || role === "SUBADMIN";

  const [sessions, setSessions] = useState<CcpSession[]>([]);
  const [filterDate, setFilterDate] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [selectedSession, setSelectedSession] = useState<CcpSession | null>(null);

  // 수정 state
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [editTemp, setEditTemp] = useState("");
  const [editTime, setEditTime] = useState("");
  const [editIsOk, setEditIsOk] = useState(true);
  const [editActionNote, setEditActionNote] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("ccp_heating_sessions")
      .select(`id, session_date, slot_id, status, note,
        slot:warmer_slots(id, slot_name, purpose),
        events:ccp_heating_events(id, session_id, event_type, measured_at, temperature, is_ok, action_note, created_by),
        orders:ccp_heating_session_orders(id, work_order_ref, client_name, product_name)`)
      .eq("session_date", filterDate)
      .order("created_at", { ascending: true });
    const list = (data ?? []) as unknown as CcpSession[];
    setSessions(list);
    if (selectedSession) {
      const refreshed = list.find((s) => s.id === selectedSession.id);
      if (refreshed) setSelectedSession(refreshed);
    }
    setLoading(false);
  }, [filterDate]); // eslint-disable-line

  useEffect(() => { loadSessions(); }, [loadSessions]);

  function startEdit(ev: CcpEvent) {
    setEditingEventId(ev.id);
    setEditTemp(ev.temperature != null ? String(ev.temperature) : "");
    setEditTime(ev.measured_at.slice(11, 16));
    setEditIsOk(ev.is_ok ?? true);
    setEditActionNote(ev.action_note ?? "");
  }

  async function saveEditEvent(ev: CcpEvent) {
    const needsTemp = !["vat_refill", "move", "material_in"].includes(ev.event_type);
    if (needsTemp && !editTemp) return showToast("온도를 입력하세요.", "error");
    const temp = needsTemp ? Number(editTemp) : null;
    if (needsTemp && temp !== null && (temp < 40 || temp > 50))
      return showToast("온도는 40~50°C 범위여야 합니다.", "error");
    setEditSaving(true);
    const { error } = await supabase.from("ccp_heating_events").update({
      measured_at: `${filterDate}T${editTime}:00`,
      temperature: temp,
      is_ok: needsTemp ? editIsOk : null,
      action_note: editActionNote.trim() || null,
    }).eq("id", ev.id);
    setEditSaving(false);
    if (error) return showToast("수정 실패: " + error.message, "error");
    showToast("✅ 수정 완료!");
    setEditingEventId(null);
    await loadSessions();
    setSelectedSession((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        events: (prev.events ?? []).map((e) =>
          e.id === ev.id
            ? { ...e, measured_at: `${filterDate}T${editTime}:00`, temperature: !["vat_refill","move","material_in"].includes(ev.event_type) ? Number(editTemp) : null, is_ok: !["vat_refill","move","material_in"].includes(ev.event_type) ? editIsOk : null, action_note: editActionNote.trim() || null }
            : e
        ),
      };
    });
  }

  async function deleteEvent(eventId: string) {
    if (!confirm("이 기록을 삭제하시겠습니까?")) return;
    const { error } = await supabase.from("ccp_heating_events").delete().eq("id", eventId);
    if (error) return showToast("삭제 실패: " + error.message, "error");
    showToast("🗑️ 삭제 완료!");
    await loadSessions();
    setSelectedSession((prev) =>
      prev ? { ...prev, events: (prev.events ?? []).filter((e) => e.id !== eventId) } : prev
    );
  }

  async function closeSession(sessionId: string) {
    if (!confirm("세션을 종료하시겠습니까?")) return;
    const { error } = await supabase.from("ccp_heating_sessions").update({ status: "done" }).eq("id", sessionId);
    if (error) return showToast("실패: " + error.message, "error");
    showToast("✅ 세션 종료!");
    await loadSessions();
  }

  async function reopenSession(sessionId: string) {
    if (!isAdmin) return;
    if (!confirm("세션을 다시 활성화하시겠습니까?")) return;
    const { error } = await supabase.from("ccp_heating_sessions").update({ status: "active" }).eq("id", sessionId);
    if (error) return showToast("실패: " + error.message, "error");
    showToast("✅ 재활성화!");
    await loadSessions();
  }

  return (
    <div className="space-y-4">
      <div className={`${card} p-4`}>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <div className="mb-1 text-xs text-slate-500">날짜</div>
            <input type="date" className={inp} style={{ width: 160 }} value={filterDate}
              onChange={(e) => { setFilterDate(e.target.value); setSelectedSession(null); setEditingEventId(null); }} />
          </div>
          <button className={btn} onClick={loadSessions}>🔄 조회</button>
          <button className={btnSm} onClick={() => window.print()}>🖨️ 인쇄</button>
        </div>
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          <span className="font-semibold">⚠ 한계기준:</span> 준초콜릿·당류가공품 45±5°C (40~50°C), 4시간 이상 유지 / 주기: 작업시작 전, 작업 중 2시간마다, 작업종료
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
        {/* 좌: 세션 목록 */}
        <div className={`${card} p-4`} style={{ maxHeight: "calc(100vh - 260px)", overflowY: "auto" }}>
          <div className="mb-3 font-semibold text-sm">🌡️ 세션 목록 — {filterDate}</div>
          {loading ? (
            <div className="py-6 text-center text-sm text-slate-400">불러오는 중...</div>
          ) : sessions.length === 0 ? (
            <div className="py-6 text-center text-sm text-slate-400">
              <div className="text-2xl mb-2">🌡️</div>
              <div>세션이 없습니다.</div>
              <div className="text-xs mt-1 text-slate-300">작업지시서에서 온도 기록 시 자동 생성됩니다.</div>
            </div>
          ) : (
            <div className="space-y-2">
              {sessions.map((s) => {
                const events = s.events ?? [];
                const tempEvents = events.filter((e) => e.temperature != null);
                const hasNG = events.some((e) => e.is_ok === false);
                const lastTemp = [...tempEvents].sort((a, b) => b.measured_at.localeCompare(a.measured_at))[0];
                return (
                  <button key={s.id}
                    className={`w-full rounded-xl border p-3 text-left transition-all ${selectedSession?.id === s.id ? "border-blue-400 bg-blue-50 shadow-sm" : "border-slate-200 bg-white hover:bg-slate-50"}`}
                    onClick={() => { setSelectedSession(s); setEditingEventId(null); }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold text-sm truncate">{(s.slot as any)?.slot_name}</div>
                      <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${s.status === "active" ? "bg-green-100 border-green-200 text-green-700" : "bg-slate-100 border-slate-200 text-slate-500"}`}>
                        {s.status === "active" ? "진행중" : "종료"}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate-500">{(s.slot as any)?.purpose}</div>
                    <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                      {lastTemp && <span className={`text-xs font-bold ${hasNG ? "text-red-600" : "text-blue-600"}`}>최근 {lastTemp.temperature}°C</span>}
                      <span className="text-[11px] text-slate-400">기록 {events.length}건</span>
                      {hasNG && <span className="rounded-full border border-red-200 bg-red-100 px-1.5 py-0.5 text-[9px] font-semibold text-red-700">⚠ 이탈</span>}
                    </div>
                    {(s.orders ?? []).length > 0 && (
                      <div className="mt-1 text-[10px] text-slate-400 truncate">
                        {(s.orders ?? []).map((o) => o.client_name).filter(Boolean).join(", ")}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* 우: 세션 상세 */}
        {selectedSession ? (
          <div className="space-y-3" style={{ maxHeight: "calc(100vh - 260px)", overflowY: "auto" }}>
            {/* 헤더 */}
            <div className={`${card} p-4`}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="font-bold text-base">
                    🌡️ {(selectedSession.slot as any)?.slot_name}
                    <span className="ml-2 text-sm font-normal text-slate-500">({(selectedSession.slot as any)?.purpose})</span>
                  </div>
                  <div className="mt-0.5 text-xs text-slate-400">{filterDate}</div>
                </div>
                <div className="flex gap-2 items-center">
                  <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${selectedSession.status === "active" ? "bg-green-100 border-green-200 text-green-700" : "bg-slate-100 border-slate-200 text-slate-500"}`}>
                    {selectedSession.status === "active" ? "진행중" : "종료"}
                  </span>
                  {selectedSession.status === "active" && isAdminOrSubadmin && (
                    <button className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-100"
                      onClick={() => closeSession(selectedSession.id)}>세션 종료</button>
                  )}
                  {selectedSession.status === "done" && isAdmin && (
                    <button className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-100"
                      onClick={() => reopenSession(selectedSession.id)}>재활성화</button>
                  )}
                </div>
              </div>
              {(selectedSession.orders ?? []).length > 0 && (
                <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="text-[11px] font-semibold text-slate-500 mb-1">📋 연결된 작업지시서</div>
                  <div className="flex flex-wrap gap-2">
                    {(selectedSession.orders ?? []).map((o) => (
                      <span key={o.id} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs">
                        <span className="font-medium">{o.client_name}</span>
                        {o.product_name && <span className="ml-1 text-slate-400 text-[10px]">{o.product_name}</span>}
                        {o.work_order_ref && <span className="ml-1 font-mono text-[10px] text-slate-400">{o.work_order_ref}</span>}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* 기록 테이블 */}
            <div className={`${card} p-4`}>
              <div className="mb-3 font-semibold text-sm">📋 모니터링 기록</div>
              {(selectedSession.events ?? []).length === 0 ? (
                <div className="py-6 text-center text-sm text-slate-400">
                  기록된 데이터가 없습니다.
                  <div className="text-xs mt-1 text-slate-300">작업지시서에서 온도를 기록하면 여기에 표시됩니다.</div>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="border-b-2 border-slate-200 bg-slate-50">
                          <th className="py-2 px-3 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">시각</th>
                          <th className="py-2 px-3 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">유형</th>
                          <th className="py-2 px-3 text-right text-xs font-semibold text-slate-500 whitespace-nowrap">온도</th>
                          <th className="py-2 px-3 text-center text-xs font-semibold text-slate-500 whitespace-nowrap">판정</th>
                          <th className="py-2 px-3 text-left text-xs font-semibold text-slate-500">조치사항</th>
                          {isAdminOrSubadmin && <th className="py-2 px-3 text-center text-xs font-semibold text-slate-500 whitespace-nowrap">관리</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {[...(selectedSession.events ?? [])]
                          .sort((a, b) => a.measured_at.localeCompare(b.measured_at))
                          .map((ev, idx) => {
                            const isNG = ev.is_ok === false;
                            const isEditing = editingEventId === ev.id;
                            const needsTemp = !["vat_refill", "move", "material_in"].includes(ev.event_type);
                            return (
                              <tr key={ev.id} className={`border-b border-slate-100 transition-colors ${isEditing ? "bg-blue-50" : isNG ? "bg-red-50" : idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}`}>
                                <td className="py-2 px-3 font-mono text-sm text-slate-700 whitespace-nowrap">
                                  {isEditing ? (
                                    <input type="time" className="w-24 rounded-lg border border-blue-300 px-2 py-1 text-xs focus:outline-none"
                                      value={editTime} onChange={(e) => setEditTime(e.target.value)} />
                                  ) : ev.measured_at.slice(11, 16)}
                                </td>
                                <td className="py-2 px-3 whitespace-nowrap">
                                  <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${eventBadgeCls(ev.event_type)}`}>
                                    {CCP_EVENT_LABELS[ev.event_type] ?? ev.event_type}
                                  </span>
                                </td>
                                <td className="py-2 px-3 text-right whitespace-nowrap">
                                  {isEditing && needsTemp ? (
                                    <input className="w-20 rounded-lg border border-blue-300 px-2 py-1 text-xs text-right tabular-nums focus:outline-none"
                                      inputMode="decimal" value={editTemp}
                                      onChange={(e) => { const v = e.target.value.replace(/[^\d.]/g, ""); setEditTemp(v); if (v) setEditIsOk(Number(v) >= 40 && Number(v) <= 50); }} />
                                  ) : ev.temperature != null ? (
                                    <span className={`text-sm font-bold tabular-nums ${isNG ? "text-red-600" : "text-blue-700"}`}>{ev.temperature}°C</span>
                                  ) : <span className="text-slate-300">—</span>}
                                </td>
                                <td className="py-2 px-3 text-center whitespace-nowrap">
                                  {isEditing && needsTemp ? (
                                    <select className={`rounded-lg border px-1.5 py-1 text-xs focus:outline-none ${editIsOk ? "border-green-300 bg-green-50" : "border-red-300 bg-red-50"}`}
                                      value={editIsOk ? "ok" : "ng"} onChange={(e) => setEditIsOk(e.target.value === "ok")}>
                                      <option value="ok">O 적합</option><option value="ng">X 부적합</option>
                                    </select>
                                  ) : ev.is_ok != null ? (
                                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${ev.is_ok ? "bg-green-100 border-green-200 text-green-700" : "bg-red-100 border-red-200 text-red-700"}`}>
                                      {ev.is_ok ? "O 적합" : "X 부적합"}
                                    </span>
                                  ) : <span className="text-slate-300 text-xs">—</span>}
                                </td>
                                <td className="py-2 px-3 text-xs text-red-600">
                                  {isEditing ? (
                                    <input className="w-full rounded-lg border border-blue-300 px-2 py-1 text-xs focus:outline-none"
                                      value={editActionNote} onChange={(e) => setEditActionNote(e.target.value)} placeholder="조치사항" />
                                  ) : ev.action_note ?? ""}
                                </td>
                                {isAdminOrSubadmin && (
                                  <td className="py-2 px-3 text-center whitespace-nowrap">
                                    {isEditing ? (
                                      <div className="flex gap-1 justify-center">
                                        <button className="rounded-lg border border-blue-400 bg-blue-600 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                                          disabled={editSaving} onClick={() => saveEditEvent(ev)}>
                                          {editSaving ? "..." : "저장"}
                                        </button>
                                        <button className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-500 hover:bg-slate-50"
                                          onClick={() => setEditingEventId(null)}>취소</button>
                                      </div>
                                    ) : (
                                      <div className="flex gap-1 justify-center">
                                        <button className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-500 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600"
                                          onClick={() => startEdit(ev)}>수정</button>
                                        <button className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-400 hover:bg-red-50 hover:border-red-300 hover:text-red-500"
                                          onClick={() => deleteEvent(ev.id)}>삭제</button>
                                      </div>
                                    )}
                                  </td>
                                )}
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                  {/* 요약 */}
                  <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
                    {(() => {
                      const events = selectedSession.events ?? [];
                      const temps = events.filter((e) => e.temperature != null).map((e) => e.temperature as number);
                      const ngCount = events.filter((e) => e.is_ok === false).length;
                      const okCount = events.filter((e) => e.is_ok === true).length;
                      const minT = temps.length ? Math.min(...temps) : null;
                      const maxT = temps.length ? Math.max(...temps) : null;
                      const materialIn = events.filter((e) => e.event_type === "material_in").length;
                      return (
                        <>
                          <span>온도 측정 <b>{temps.length}</b>회</span>
                          {okCount > 0 && <span className="text-green-600">적합 <b>{okCount}</b>회</span>}
                          {ngCount > 0 && <span className="text-red-600 font-semibold">⚠ 이탈 <b>{ngCount}</b>회</span>}
                          {minT != null && <span>최저 <b className={minT < 40 ? "text-red-600" : ""}>{minT}°C</b></span>}
                          {maxT != null && <span>최고 <b className={maxT > 50 ? "text-red-600" : ""}>{maxT}°C</b></span>}
                          {materialIn > 0 && <span>원료투입 <b>{materialIn}</b>회</span>}
                        </>
                      );
                    })()}
                  </div>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className={`${card} flex items-center justify-center p-12`}>
            <div className="text-center text-slate-400">
              <div className="text-3xl mb-2">🌡️</div>
              <div className="text-sm">왼쪽 목록에서 세션을 선택하세요</div>
              <div className="mt-1 text-xs text-slate-300">작업지시서에서 온도 기록 시 자동으로 세션이 생성됩니다</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// CCP-1P 금속검출
// ═══════════════════════════════════════════════════════════
export function Ccp1pTab({ role, userId, showToast }: {
  role: UserRole; userId: string | null;
  showToast: (msg: string, type?: "success" | "error") => void;
}) {
  const isAdminOrSubadmin = role === "ADMIN" || role === "SUBADMIN";
  const isAdmin = role === "ADMIN";
  const [logs, setLogs] = useState<MetalLog[]>([]);
  const [filterDate, setFilterDate] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [fProductName, setFProductName] = useState("");
  const [fQty, setFQty] = useState("");
  const [fStartTime, setFStartTime] = useState("");
  const [fEndTime, setFEndTime] = useState("");
  const [fFePass, setFFePass] = useState(true);
  const [fSusPass, setFSusPass] = useState(true);
  const [fProductPass, setFProductPass] = useState(true);
  const [fZone, setFZone] = useState("A");
  const [fActionNote, setFActionNote] = useState("");
  const [fNote, setFNote] = useState("");
  const [saving, setSaving] = useState(false);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("ccp_metal_logs").select("*").eq("log_date", filterDate).order("created_at", { ascending: false });
    setLogs((data ?? []) as MetalLog[]);
    setLoading(false);
  }, [filterDate]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  async function saveLog() {
    if (!fProductName) return showToast("제품명을 입력하세요.", "error");
    setSaving(true);
    const { error } = await supabase.from("ccp_metal_logs").insert({
      log_date: filterDate, product_name: fProductName.trim(), quantity: fQty ? Number(fQty) : null,
      start_time: fStartTime || null, end_time: fEndTime || null, fe_pass: fFePass, sus_pass: fSusPass,
      product_pass: fProductPass, zone: fZone, action_note: fActionNote.trim() || null, note: fNote.trim() || null, created_by: userId,
    });
    setSaving(false);
    if (error) return showToast("저장 실패: " + error.message, "error");
    showToast("✅ 금속검출 기록 완료!");
    setShowForm(false); setFProductName(""); setFQty(""); setFStartTime(""); setFEndTime("");
    setFFePass(true); setFSusPass(true); setFProductPass(true); setFActionNote(""); setFNote("");
    loadLogs();
  }

  async function approveLog(logId: string) {
    const { error } = await supabase.from("ccp_metal_logs").update({ approved_by: userId, approved_at: new Date().toISOString() }).eq("id", logId);
    if (error) return showToast("실패: " + error.message, "error");
    showToast("✅ 승인 완료!"); loadLogs();
  }

  return (
    <div className="space-y-4">
      <div className={`${card} p-4`}>
        <div className="flex flex-wrap gap-3 items-end">
          <div><div className="mb-1 text-xs text-slate-500">날짜</div>
            <input type="date" className={inp} style={{ width: 160 }} value={filterDate} onChange={(e) => setFilterDate(e.target.value)} /></div>
          <button className={btn} onClick={loadLogs}>🔄 조회</button>
          {isAdminOrSubadmin && (
            <button className={showForm ? btnOn : "rounded-xl border border-blue-300 bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-700 hover:bg-blue-100"}
              onClick={() => setShowForm((v) => !v)}>{showForm ? "✕ 닫기" : "✚ 금속검출 기록"}</button>
          )}
          <button className={btnSm} onClick={() => window.print()}>🖨️ 인쇄</button>
        </div>
      </div>
      {showForm && isAdminOrSubadmin && (
        <div className={`${card} p-4`}>
          <div className="mb-3 font-semibold text-sm text-blue-700">✚ CCP-1P 금속검출 기록</div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div><div className="mb-1 text-xs text-slate-500">제품명 *</div><input className={inp} value={fProductName} onChange={(e) => setFProductName(e.target.value)} /></div>
            <div><div className="mb-1 text-xs text-slate-500">수량</div><input className={inpR} inputMode="numeric" value={fQty} onChange={(e) => setFQty(e.target.value.replace(/[^\d]/g, ""))} /></div>
            <div><div className="mb-1 text-xs text-slate-500">구역</div>
              <select className={inp} value={fZone} onChange={(e) => setFZone(e.target.value)}>
                <option value="A">A구역 (제품 1개)</option><option value="B">B구역 (제품 2개 이상)</option>
              </select></div>
            <div><div className="mb-1 text-xs text-slate-500">시작시간</div><input type="time" className={inp} value={fStartTime} onChange={(e) => setFStartTime(e.target.value)} /></div>
            <div><div className="mb-1 text-xs text-slate-500">종료시간</div><input type="time" className={inp} value={fEndTime} onChange={(e) => setFEndTime(e.target.value)} /></div>
            <div className="md:col-span-3">
              <div className="mb-2 text-xs text-slate-500">검출 결과</div>
              <div className="flex flex-wrap gap-4">
                {[{ label: "Fe 통과", value: fFePass, set: setFFePass }, { label: "SUS 통과", value: fSusPass, set: setFSusPass }, { label: "제품 통과", value: fProductPass, set: setFProductPass }]
                  .map(({ label, value, set }) => (
                    <label key={label} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={value} onChange={(e) => set(e.target.checked)} className="w-4 h-4 rounded" />{label}
                    </label>
                  ))}
              </div>
            </div>
            {(!fFePass || !fSusPass || !fProductPass) && (
              <div className="md:col-span-3"><div className="mb-1 text-xs text-slate-500">조치사항</div>
                <input className={inp} value={fActionNote} onChange={(e) => setFActionNote(e.target.value)} placeholder="불통 시 조치 내용" /></div>
            )}
            <div><div className="mb-1 text-xs text-slate-500">비고</div><input className={inp} value={fNote} onChange={(e) => setFNote(e.target.value)} /></div>
          </div>
          <div className="mt-4 flex gap-2">
            <button className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60" disabled={saving} onClick={saveLog}>{saving ? "저장 중..." : "💾 기록"}</button>
            <button className={btn} onClick={() => setShowForm(false)}>취소</button>
          </div>
        </div>
      )}
      <div className={`${card} p-4`}>
        <div className="mb-3 font-semibold text-sm">🔍 금속검출 기록 — {filterDate}</div>
        {loading ? <div className="py-4 text-center text-sm text-slate-400">불러오는 중...</div>
          : logs.length === 0 ? <div className="py-4 text-center text-sm text-slate-400">기록이 없습니다.</div>
          : (
            <div className="space-y-2">
              {logs.map((log) => {
                const allPass = log.fe_pass && log.sus_pass && log.product_pass;
                return (
                  <div key={log.id} className={`rounded-2xl border p-3 ${allPass ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <div className="font-semibold text-sm">{log.product_name}</div>
                        <div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-500">
                          {log.quantity != null && <span>수량: {log.quantity.toLocaleString()}</span>}
                          {log.zone && <span>구역: {log.zone}</span>}
                          {log.start_time && <span>시작: {log.start_time}</span>}
                          {log.end_time && <span>종료: {log.end_time}</span>}
                        </div>
                        <div className="mt-1.5 flex gap-2">
                          {[{ label: "Fe", pass: log.fe_pass }, { label: "SUS", pass: log.sus_pass }, { label: "제품", pass: log.product_pass }]
                            .map(({ label, pass }) => (
                              <span key={label} className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${pass ? "bg-green-100 border-green-200 text-green-700" : "bg-red-100 border-red-200 text-red-700"}`}>{label} {pass ? "✅" : "❌"}</span>
                            ))}
                        </div>
                        {log.action_note && <div className="mt-1 text-xs text-red-600">조치: {log.action_note}</div>}
                      </div>
                      <div className="shrink-0">
                        {!log.approved_by && isAdmin && (
                          <button className="rounded-lg border border-green-300 bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-700 hover:bg-green-100" onClick={() => approveLog(log.id)}>✅ 승인</button>
                        )}
                        {log.approved_by && <span className="rounded-full border border-green-200 bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">승인완료</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 기타가공품 가열공정
// ═══════════════════════════════════════════════════════════
export function OtherHeatingTab({ role, userId, showToast }: {
  role: UserRole; userId: string | null;
  showToast: (msg: string, type?: "success" | "error") => void;
}) {
  const isAdminOrSubadmin = role === "ADMIN" || role === "SUBADMIN";
  const isAdmin = role === "ADMIN";
  const [logs, setLogs] = useState<OtherHeatingLog[]>([]);
  const [slots, setSlots] = useState<WarmSlot[]>([]);
  const [filterDate, setFilterDate] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [fWorkType, setFWorkType] = useState("jeonsa");
  const [fSlotId, setFSlotId] = useState("");
  const [fTime, setFTime] = useState(new Date().toTimeString().slice(0, 5));
  const [fTemp, setFTemp] = useState("");
  const [fIsOk, setFIsOk] = useState(true);
  const [fActionNote, setFActionNote] = useState("");
  const [fNote, setFNote] = useState("");
  const [saving, setSaving] = useState(false);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("ccp_other_heating_logs").select("*").eq("log_date", filterDate).order("measured_at", { ascending: false });
    setLogs((data ?? []) as OtherHeatingLog[]);
    setLoading(false);
  }, [filterDate]);

  useEffect(() => { loadLogs(); }, [loadLogs]);
  useEffect(() => {
    supabase.from("warmer_slots").select("id,slot_name,purpose").eq("is_active", true).order("slot_no").then(({ data }) => setSlots(data ?? []));
  }, []);

  async function saveLog() {
    if (!fTemp) return showToast("온도를 입력하세요.", "error");
    const temp = Number(fTemp);
    if (temp < 40 || temp > 50) return showToast("온도는 40~50도 범위여야 합니다.", "error");
    setSaving(true);
    const { error } = await supabase.from("ccp_other_heating_logs").insert({
      log_date: filterDate, work_type: fWorkType, slot_id: fSlotId || null,
      measured_at: `${filterDate}T${fTime}:00`, temperature: temp, is_ok: fIsOk,
      action_note: fActionNote.trim() || null, note: fNote.trim() || null, created_by: userId,
    });
    setSaving(false);
    if (error) return showToast("저장 실패: " + error.message, "error");
    showToast("✅ 가열공정 기록 완료!");
    setShowForm(false); setFTemp(""); setFActionNote(""); setFNote(""); setFIsOk(true);
    loadLogs();
  }

  async function approveLog(logId: string) {
    const { error } = await supabase.from("ccp_other_heating_logs").update({ approved_by: userId, approved_at: new Date().toISOString() }).eq("id", logId);
    if (error) return showToast("실패: " + error.message, "error");
    showToast("✅ 승인 완료!"); loadLogs();
  }

  return (
    <div className="space-y-4">
      <div className={`${card} p-4`}>
        <div className="flex flex-wrap gap-3 items-end">
          <div><div className="mb-1 text-xs text-slate-500">날짜</div><input type="date" className={inp} style={{ width: 160 }} value={filterDate} onChange={(e) => setFilterDate(e.target.value)} /></div>
          <button className={btn} onClick={loadLogs}>🔄 조회</button>
          {isAdminOrSubadmin && <button className={showForm ? btnOn : "rounded-xl border border-blue-300 bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-700 hover:bg-blue-100"} onClick={() => setShowForm((v) => !v)}>{showForm ? "✕ 닫기" : "✚ 가열공정 기록"}</button>}
          <button className={btnSm} onClick={() => window.print()}>🖨️ 인쇄</button>
        </div>
      </div>
      {showForm && isAdminOrSubadmin && (
        <div className={`${card} p-4`}>
          <div className="mb-3 font-semibold text-sm text-blue-700">✚ 기타가공품 가열공정 기록</div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div><div className="mb-1 text-xs text-slate-500">작업유형 *</div>
              <select className={inp} value={fWorkType} onChange={(e) => setFWorkType(e.target.value)}>
                <option value="jeonsa">② 전사지 생산</option><option value="pet_coating">④ PET 코팅</option>
              </select></div>
            <div><div className="mb-1 text-xs text-slate-500">온장고 슬롯</div>
              <select className={inp} value={fSlotId} onChange={(e) => setFSlotId(e.target.value)}>
                <option value="">— 선택 —</option>{slots.map((s) => <option key={s.id} value={s.id}>{s.slot_name} ({s.purpose})</option>)}
              </select></div>
            <div><div className="mb-1 text-xs text-slate-500">측정시각</div><input type="time" className={inp} value={fTime} onChange={(e) => setFTime(e.target.value)} /></div>
            <div><div className="mb-1 text-xs text-slate-500">온도 (40~50°C) *</div><input className={inpR} inputMode="decimal" value={fTemp} onChange={(e) => setFTemp(e.target.value.replace(/[^\d.]/g, ""))} placeholder="예: 45" /></div>
            <div><div className="mb-1 text-xs text-slate-500">적합 여부</div>
              <select className={inp} value={fIsOk ? "ok" : "ng"} onChange={(e) => setFIsOk(e.target.value === "ok")}>
                <option value="ok">✅ 적합</option><option value="ng">❌ 부적합</option>
              </select></div>
            {!fIsOk && <div><div className="mb-1 text-xs text-slate-500">조치사항</div><input className={inp} value={fActionNote} onChange={(e) => setFActionNote(e.target.value)} /></div>}
            <div><div className="mb-1 text-xs text-slate-500">비고</div><input className={inp} value={fNote} onChange={(e) => setFNote(e.target.value)} /></div>
          </div>
          <div className="mt-4 flex gap-2">
            <button className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60" disabled={saving} onClick={saveLog}>{saving ? "저장 중..." : "💾 기록"}</button>
            <button className={btn} onClick={() => setShowForm(false)}>취소</button>
          </div>
        </div>
      )}
      <div className={`${card} p-4`}>
        <div className="mb-3 font-semibold text-sm">🔥 가열공정 기록 — {filterDate}</div>
        {loading ? <div className="py-4 text-center text-sm text-slate-400">불러오는 중...</div>
          : logs.length === 0 ? <div className="py-4 text-center text-sm text-slate-400">기록이 없습니다.</div>
          : (
            <div className="space-y-2">
              {logs.map((log) => (
                <div key={log.id} className={`rounded-2xl border p-3 ${log.is_ok === false ? "border-red-200 bg-red-50" : "border-slate-200 bg-slate-50"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-sm">{log.work_type === "jeonsa" ? "② 전사지 생산" : "④ PET 코팅"}</span>
                        <span className="text-xs font-mono text-slate-500">{log.measured_at.slice(11, 16)}</span>
                        <span className={`text-sm font-bold ${log.is_ok === false ? "text-red-600" : "text-blue-600"}`}>{log.temperature}°C</span>
                        <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${log.is_ok ? "bg-green-100 border-green-200 text-green-700" : "bg-red-100 border-red-200 text-red-700"}`}>{log.is_ok ? "적합" : "부적합"}</span>
                      </div>
                      {log.action_note && <div className="mt-1 text-xs text-red-600">조치: {log.action_note}</div>}
                      {log.note && <div className="mt-0.5 text-xs text-slate-400">비고: {log.note}</div>}
                    </div>
                    <div className="shrink-0">
                      {!log.approved_by && isAdmin && <button className="rounded-lg border border-green-300 bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-700 hover:bg-green-100" onClick={() => approveLog(log.id)}>✅ 승인</button>}
                      {log.approved_by && <span className="rounded-full border border-green-200 bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">승인완료</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 압축공기
// ═══════════════════════════════════════════════════════════
export function CompressorTab({ role, userId, showToast }: {
  role: UserRole; userId: string | null;
  showToast: (msg: string, type?: "success" | "error") => void;
}) {
  const isAdminOrSubadmin = role === "ADMIN" || role === "SUBADMIN";
  const isAdmin = role === "ADMIN";
  const [logs, setLogs] = useState<CompressorLog[]>([]);
  const [filterDate, setFilterDate] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [fWorkType, setFWorkType] = useState("pet_coating");
  const [fTime, setFTime] = useState(new Date().toTimeString().slice(0, 5));
  const [fWorkHours, setFWorkHours] = useState("");
  const [fCumulativeHours, setFCumulativeHours] = useState("");
  const [fIsDamaged, setFIsDamaged] = useState(false);
  const [fNote, setFNote] = useState("");
  const [saving, setSaving] = useState(false);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("compressor_logs").select("*").eq("log_date", filterDate).order("worked_at", { ascending: false });
    setLogs((data ?? []) as CompressorLog[]);
    setLoading(false);
  }, [filterDate]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  async function saveLog() {
    setSaving(true);
    const { error } = await supabase.from("compressor_logs").insert({
      log_date: filterDate, work_type: fWorkType, worked_at: `${filterDate}T${fTime}:00`,
      work_hours: fWorkHours ? Number(fWorkHours) : null, cumulative_hours: fCumulativeHours ? Number(fCumulativeHours) : null,
      is_damaged: fIsDamaged, note: fNote.trim() || null, created_by: userId,
    });
    setSaving(false);
    if (error) return showToast("저장 실패: " + error.message, "error");
    showToast("✅ 압축공기 기록 완료!");
    setShowForm(false); setFWorkHours(""); setFCumulativeHours(""); setFIsDamaged(false); setFNote("");
    loadLogs();
  }

  async function approveLog(logId: string) {
    const { error } = await supabase.from("compressor_logs").update({ approved_by: userId, approved_at: new Date().toISOString() }).eq("id", logId);
    if (error) return showToast("실패: " + error.message, "error");
    showToast("✅ 승인 완료!"); loadLogs();
  }

  return (
    <div className="space-y-4">
      <div className={`${card} p-4`}>
        <div className="flex flex-wrap gap-3 items-end">
          <div><div className="mb-1 text-xs text-slate-500">날짜</div><input type="date" className={inp} style={{ width: 160 }} value={filterDate} onChange={(e) => setFilterDate(e.target.value)} /></div>
          <button className={btn} onClick={loadLogs}>🔄 조회</button>
          {isAdminOrSubadmin && <button className={showForm ? btnOn : "rounded-xl border border-blue-300 bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-700 hover:bg-blue-100"} onClick={() => setShowForm((v) => !v)}>{showForm ? "✕ 닫기" : "✚ 압축공기 기록"}</button>}
          <button className={btnSm} onClick={() => window.print()}>🖨️ 인쇄</button>
        </div>
      </div>
      {showForm && isAdminOrSubadmin && (
        <div className={`${card} p-4`}>
          <div className="mb-3 font-semibold text-sm text-blue-700">✚ 압축공기 작업기록</div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div><div className="mb-1 text-xs text-slate-500">작업유형 *</div>
              <select className={inp} value={fWorkType} onChange={(e) => setFWorkType(e.target.value)}>
                <option value="pet_coating">④ PET 코팅</option><option value="pet_spray">⑤ PET 분사</option>
              </select></div>
            <div><div className="mb-1 text-xs text-slate-500">작업시각</div><input type="time" className={inp} value={fTime} onChange={(e) => setFTime(e.target.value)} /></div>
            <div><div className="mb-1 text-xs text-slate-500">작업시간 (h)</div><input className={inpR} inputMode="decimal" value={fWorkHours} onChange={(e) => setFWorkHours(e.target.value.replace(/[^\d.]/g, ""))} placeholder="예: 2.5" /></div>
            <div><div className="mb-1 text-xs text-slate-500">누계시간 (h)</div><input className={inpR} inputMode="decimal" value={fCumulativeHours} onChange={(e) => setFCumulativeHours(e.target.value.replace(/[^\d.]/g, ""))} /></div>
            <div className="flex items-center gap-2 pt-5"><label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={fIsDamaged} onChange={(e) => setFIsDamaged(e.target.checked)} className="w-4 h-4 rounded" />손상 발생</label></div>
            <div><div className="mb-1 text-xs text-slate-500">비고</div><input className={inp} value={fNote} onChange={(e) => setFNote(e.target.value)} /></div>
          </div>
          <div className="mt-4 flex gap-2">
            <button className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60" disabled={saving} onClick={saveLog}>{saving ? "저장 중..." : "💾 기록"}</button>
            <button className={btn} onClick={() => setShowForm(false)}>취소</button>
          </div>
        </div>
      )}
      <div className={`${card} p-4`}>
        <div className="mb-3 font-semibold text-sm">💨 압축공기 작업기록 — {filterDate}</div>
        {loading ? <div className="py-4 text-center text-sm text-slate-400">불러오는 중...</div>
          : logs.length === 0 ? <div className="py-4 text-center text-sm text-slate-400">기록이 없습니다.</div>
          : (
            <div className="space-y-2">
              {logs.map((log) => (
                <div key={log.id} className={`rounded-2xl border p-3 ${log.is_damaged ? "border-red-200 bg-red-50" : "border-slate-200 bg-slate-50"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-sm">{log.work_type === "pet_coating" ? "④ PET 코팅" : "⑤ PET 분사"}</span>
                        <span className="text-xs font-mono text-slate-500">{log.worked_at.slice(11, 16)}</span>
                        {log.is_damaged && <span className="rounded-full border border-red-200 bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">⚠ 손상</span>}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-500">
                        {log.work_hours != null && <span>작업시간: {log.work_hours}h</span>}
                        {log.cumulative_hours != null && <span>누계: {log.cumulative_hours}h</span>}
                        {log.note && <span>비고: {log.note}</span>}
                      </div>
                    </div>
                    <div className="shrink-0">
                      {!log.approved_by && isAdmin && <button className="rounded-lg border border-green-300 bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-700 hover:bg-green-100" onClick={() => approveLog(log.id)}>✅ 승인</button>}
                      {log.approved_by && <span className="rounded-full border border-green-200 bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">승인완료</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// PET 수불부
// ═══════════════════════════════════════════════════════════
export function PetLedgerTab({ role, userId, showToast }: {
  role: UserRole; userId: string | null;
  showToast: (msg: string, type?: "success" | "error") => void;
}) {
  const isAdminOrSubadmin = role === "ADMIN" || role === "SUBADMIN";
  const isAdmin = role === "ADMIN";
  const [logs, setLogs] = useState<PetStockLog[]>([]);
  const [stock, setStock] = useState<PetStock | null>(null);
  const [filterDate, setFilterDate] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [fLogType, setFLogType] = useState("incoming");
  const [fQty, setFQty] = useState("");
  const [fDefectQty, setFDefectQty] = useState("");
  const [fNote, setFNote] = useState("");
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [logRes, stockRes] = await Promise.all([
      supabase.from("pet_stock_logs").select("*").eq("log_date", filterDate).order("created_at", { ascending: false }),
      supabase.from("v_pet_stock").select("*").single(),
    ]);
    setLogs((logRes.data ?? []) as PetStockLog[]);
    setStock(stockRes.data as PetStock ?? null);
    setLoading(false);
  }, [filterDate]);

  useEffect(() => { loadData(); }, [loadData]);

  async function saveLog() {
    if (!fQty) return showToast("수량을 입력하세요.", "error");
    setSaving(true);
    const { error } = await supabase.from("pet_stock_logs").insert({
      log_date: filterDate, log_type: fLogType, quantity: Number(fQty),
      defect_qty: fDefectQty ? Number(fDefectQty) : 0, note: fNote.trim() || null, created_by: userId,
    });
    setSaving(false);
    if (error) return showToast("저장 실패: " + error.message, "error");
    showToast("✅ PET 수불 기록 완료!");
    setShowForm(false); setFQty(""); setFDefectQty(""); setFNote("");
    loadData();
  }

  async function approveLog(logId: string) {
    const { error } = await supabase.from("pet_stock_logs").update({ approved_by: userId, approved_at: new Date().toISOString() }).eq("id", logId);
    if (error) return showToast("실패: " + error.message, "error");
    showToast("✅ 승인 완료!"); loadData();
  }

  return (
    <div className="space-y-4">
      <div className={`${card} p-4`}>
        <div className="flex flex-wrap gap-3 items-end">
          <div><div className="mb-1 text-xs text-slate-500">날짜</div><input type="date" className={inp} style={{ width: 160 }} value={filterDate} onChange={(e) => setFilterDate(e.target.value)} /></div>
          <button className={btn} onClick={loadData}>🔄 조회</button>
          {isAdminOrSubadmin && <button className={showForm ? btnOn : "rounded-xl border border-blue-300 bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-700 hover:bg-blue-100"} onClick={() => setShowForm((v) => !v)}>{showForm ? "✕ 닫기" : "✚ 수불 기록"}</button>}
          <button className={btnSm} onClick={() => window.print()}>🖨️ 인쇄</button>
        </div>
      </div>
      {stock && (
        <div className={`${card} p-4`}>
          <div className="mb-3 font-semibold text-sm">📦 PET 공정별 현재고</div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[{ label: "원상태", value: stock.stock_raw, color: "text-slate-800" }, { label: "코팅완료", value: stock.stock_coated, color: "text-blue-700" }, { label: "분사완료(생산용)", value: stock.stock_sprayed_prod, color: "text-green-700" }, { label: "분사완료(판매용)", value: stock.stock_sprayed_sale, color: "text-purple-700" }]
              .map(({ label, value, color }) => (
                <div key={label} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-center">
                  <div className="text-xs text-slate-500 mb-1">{label}</div>
                  <div className={`text-xl font-bold tabular-nums ${color}`}>{value.toLocaleString()}</div>
                  <div className="text-xs text-slate-400">ea</div>
                </div>
              ))}
          </div>
        </div>
      )}
      {showForm && isAdminOrSubadmin && (
        <div className={`${card} p-4`}>
          <div className="mb-3 font-semibold text-sm text-blue-700">✚ PET 수불 기록</div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div><div className="mb-1 text-xs text-slate-500">구분 *</div>
              <select className={inp} value={fLogType} onChange={(e) => setFLogType(e.target.value)}>
                {Object.entries(PET_LOG_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select></div>
            <div><div className="mb-1 text-xs text-slate-500">수량 (ea) *</div><input className={inpR} inputMode="numeric" value={fQty} onChange={(e) => setFQty(e.target.value.replace(/[^\d]/g, ""))} /></div>
            <div><div className="mb-1 text-xs text-slate-500">불량수량 (ea)</div><input className={inpR} inputMode="numeric" value={fDefectQty} onChange={(e) => setFDefectQty(e.target.value.replace(/[^\d]/g, ""))} /></div>
            <div><div className="mb-1 text-xs text-slate-500">비고</div><input className={inp} value={fNote} onChange={(e) => setFNote(e.target.value)} /></div>
          </div>
          <div className="mt-4 flex gap-2">
            <button className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60" disabled={saving} onClick={saveLog}>{saving ? "저장 중..." : "💾 기록"}</button>
            <button className={btn} onClick={() => setShowForm(false)}>취소</button>
          </div>
        </div>
      )}
      <div className={`${card} p-4`}>
        <div className="mb-3 font-semibold text-sm">📋 PET 수불 내역 — {filterDate}</div>
        {loading ? <div className="py-4 text-center text-sm text-slate-400">불러오는 중...</div>
          : logs.length === 0 ? <div className="py-4 text-center text-sm text-slate-400">기록이 없습니다.</div>
          : (
            <div className="space-y-2">
              {logs.map((log) => (
                <div key={log.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-sm">{PET_LOG_TYPE_LABELS[log.log_type] ?? log.log_type}</span>
                        <span className="text-sm font-bold tabular-nums text-blue-700">{log.quantity.toLocaleString()} ea</span>
                        {log.defect_qty > 0 && <span className="text-xs text-red-600">불량: {log.defect_qty}ea</span>}
                      </div>
                      {log.note && <div className="mt-0.5 text-xs text-slate-400">비고: {log.note}</div>}
                    </div>
                    <div className="shrink-0">
                      {!log.approved_by && isAdmin && <button className="rounded-lg border border-green-300 bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-700 hover:bg-green-100" onClick={() => approveLog(log.id)}>✅ 승인</button>}
                      {log.approved_by && <span className="rounded-full border border-green-200 bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">승인완료</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
      </div>
    </div>
  );
}
