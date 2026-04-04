"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

const supabase = createClient();

// ─────────────────────── Styles ───────────────────────
const card = "rounded-2xl border border-slate-200 bg-white shadow-sm";
const inp = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:outline-none";
const inpR = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-right tabular-nums focus:border-blue-400 focus:outline-none";
const btn = "rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50 active:bg-slate-100";
const btnOn = "rounded-xl border border-blue-500 bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700";
const btnSm = "rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium hover:bg-slate-50";

type UserRole = "ADMIN" | "SUBADMIN" | "USER" | null;

// ─────────────────────── Types ───────────────────────
type WarmSlot = { id: string; slot_name: string; purpose: string };

type CcpSession = {
  id: string;
  session_date: string;
  slot_id: string;
  status: string;
  note: string | null;
  slot?: WarmSlot | null;
  events?: CcpEvent[];
  orders?: CcpSessionOrder[];
};

type CcpEvent = {
  id: string;
  session_id: string;
  event_type: string;
  measured_at: string;
  temperature: number | null;
  is_ok: boolean | null;
  action_note: string | null;
  created_by: string | null;
};

type CcpSessionOrder = {
  id: string;
  work_order_ref: string | null;
  client_name: string | null;
  product_name: string | null;
};

type MetalLog = {
  id: string;
  log_date: string;
  product_name: string | null;
  quantity: number | null;
  start_time: string | null;
  end_time: string | null;
  fe_pass: boolean | null;
  sus_pass: boolean | null;
  product_pass: boolean | null;
  zone: string | null;
  action_note: string | null;
  note: string | null;
  created_by: string | null;
  approved_by: string | null;
};

type OtherHeatingLog = {
  id: string;
  log_date: string;
  work_type: string;
  measured_at: string;
  temperature: number | null;
  is_ok: boolean | null;
  action_note: string | null;
  note: string | null;
  created_by: string | null;
  approved_by: string | null;
};

type CompressorLog = {
  id: string;
  log_date: string;
  work_type: string;
  worked_at: string;
  work_hours: number | null;
  cumulative_hours: number | null;
  is_damaged: boolean;
  note: string | null;
  created_by: string | null;
  approved_by: string | null;
};

type PetStockLog = {
  id: string;
  log_date: string;
  log_type: string;
  quantity: number;
  defect_qty: number;
  note: string | null;
  created_by: string | null;
  approved_by: string | null;
};

type PetStock = {
  total_incoming: number;
  total_coating_done: number;
  total_spray_prod: number;
  total_spray_sale: number;
  total_print_used: number;
  total_sale_cut: number;
  stock_raw: number;
  stock_coated: number;
  stock_sprayed_prod: number;
  stock_sprayed_sale: number;
};

const PET_LOG_TYPE_LABELS: Record<string, string> = {
  incoming: "입고",
  coating_done: "코팅완료",
  spray_done_prod: "분사완료(생산용)",
  spray_done_sale: "분사완료(판매용)",
  print_used: "인쇄사용",
  sale_cut: "재단판매",
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  start: "시작",
  mid_check: "중간점검",
  end: "종료",
  vat_refill: "밧트교체",
  move: "슬롯이동",
};

// ═══════════════════════════════════════════════════════════
// CCP-1B 모니터링일지
// ═══════════════════════════════════════════════════════════
export function Ccp1bTab({ role, userId, showToast }: {
  role: UserRole; userId: string | null;
  showToast: (msg: string, type?: "success" | "error") => void;
}) {
  const isAdminOrSubadmin = role === "ADMIN" || role === "SUBADMIN";
  const isAdmin = role === "ADMIN";

  const [sessions, setSessions] = useState<CcpSession[]>([]);
  const [slots, setSlots] = useState<WarmSlot[]>([]);
  const [filterDate, setFilterDate] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [selectedSession, setSelectedSession] = useState<CcpSession | null>(null);
  const [showSessionForm, setShowSessionForm] = useState(false);

  // 세션 폼
  const [fSlotId, setFSlotId] = useState("");
  const [fNote, setFNote] = useState("");
  const [saving, setSaving] = useState(false);

  // 이벤트 폼
  const [showEventForm, setShowEventForm] = useState(false);
  const [fEventType, setFEventType] = useState("start");
  const [fMeasuredAt, setFMeasuredAt] = useState(
    new Date().toTimeString().slice(0, 5)
  );
  const [fTemperature, setFTemperature] = useState("");
  const [fIsOk, setFIsOk] = useState(true);
  const [fActionNote, setFActionNote] = useState("");
  const [savingEvent, setSavingEvent] = useState(false);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("ccp_heating_sessions")
      .select(`id, session_date, slot_id, status, note,
        slot:warmer_slots(id, slot_name, purpose),
        events:ccp_heating_events(id, session_id, event_type, measured_at, temperature, is_ok, action_note),
        orders:ccp_heating_session_orders(id, work_order_ref, client_name, product_name)`)
      .eq("session_date", filterDate)
      .order("created_at", { ascending: false });
    setSessions((data ?? []) as unknown as CcpSession[]);
    setLoading(false);
  }, [filterDate]);

  useEffect(() => { loadSessions(); }, [loadSessions]);
  useEffect(() => {
    supabase.from("warmer_slots").select("id,slot_name,purpose")
      .in("purpose", ["다크컴파운드", "화이트컴파운드", "유동"])
      .eq("is_active", true).order("slot_no")
      .then(({ data }) => setSlots(data ?? []));
  }, []);

  async function saveSession() {
    if (!fSlotId) return showToast("슬롯을 선택하세요.", "error");
    setSaving(true);
    const { error } = await supabase.from("ccp_heating_sessions").insert({
      session_date: filterDate,
      slot_id: fSlotId,
      status: "active",
      note: fNote.trim() || null,
      created_by: userId,
    });
    setSaving(false);
    if (error) return showToast("저장 실패: " + error.message, "error");
    showToast("✅ CCP-1B 세션 등록 완료!");
    setShowSessionForm(false);
    setFSlotId(""); setFNote("");
    loadSessions();
  }

  async function saveEvent() {
    if (!selectedSession) return;
    const today = filterDate;
    const measuredAt = `${today}T${fMeasuredAt}:00`;
    const hasTemp = fEventType !== "vat_refill" && fEventType !== "move";
    if (hasTemp && !fTemperature) return showToast("온도를 입력하세요.", "error");
    const temp = hasTemp ? Number(fTemperature) : null;
    if (hasTemp && temp && (temp < 40 || temp > 50)) {
      return showToast("온도는 40~50도 범위여야 합니다.", "error");
    }
    setSavingEvent(true);
    const { error } = await supabase.from("ccp_heating_events").insert({
      session_id: selectedSession.id,
      event_type: fEventType,
      measured_at: measuredAt,
      temperature: temp,
      is_ok: hasTemp ? fIsOk : null,
      action_note: fActionNote.trim() || null,
      created_by: userId,
    });
    setSavingEvent(false);
    if (error) return showToast("저장 실패: " + error.message, "error");
    showToast("✅ 이벤트 기록 완료!");
    setShowEventForm(false);
    setFTemperature(""); setFActionNote(""); setFIsOk(true);
    loadSessions();
  }

  async function closeSession(sessionId: string) {
    if (!confirm("세션을 종료하시겠습니까?")) return;
    const { error } = await supabase.from("ccp_heating_sessions")
      .update({ status: "done" }).eq("id", sessionId);
    if (error) return showToast("실패: " + error.message, "error");
    showToast("✅ 세션 종료!");
    loadSessions();
    if (selectedSession?.id === sessionId) setSelectedSession(null);
  }

  return (
    <div className="space-y-4">
      {/* 필터 */}
      <div className={`${card} p-4`}>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <div className="mb-1 text-xs text-slate-500">날짜</div>
            <input type="date" className={inp} style={{ width: 160 }} value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)} />
          </div>
          <button className={btn} onClick={loadSessions}>🔄 조회</button>
          {isAdminOrSubadmin && (
            <button
              className={showSessionForm ? btnOn : "rounded-xl border border-blue-300 bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-700 hover:bg-blue-100"}
              onClick={() => setShowSessionForm((v) => !v)}
            >
              {showSessionForm ? "✕ 닫기" : "✚ 세션 등록"}
            </button>
          )}
          <button className={btnSm} onClick={() => window.print()}>🖨️ 인쇄</button>
        </div>
      </div>

      {/* 세션 등록 폼 */}
      {showSessionForm && isAdminOrSubadmin && (
        <div className={`${card} p-4`}>
          <div className="mb-3 font-semibold text-sm text-blue-700">✚ CCP-1B 세션 등록</div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div>
              <div className="mb-1 text-xs text-slate-500">온장고 슬롯 *</div>
              <select className={inp} value={fSlotId} onChange={(e) => setFSlotId(e.target.value)}>
                <option value="">— 슬롯 선택 —</option>
                {slots.map((s) => (
                  <option key={s.id} value={s.id}>{s.slot_name} ({s.purpose})</option>
                ))}
              </select>
            </div>
            <div>
              <div className="mb-1 text-xs text-slate-500">비고</div>
              <input className={inp} value={fNote} onChange={(e) => setFNote(e.target.value)} />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60"
              disabled={saving} onClick={saveSession}>
              {saving ? "저장 중..." : "💾 등록"}
            </button>
            <button className={btn} onClick={() => setShowSessionForm(false)}>취소</button>
          </div>
        </div>
      )}

      {/* 세션 목록 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
        <div className={`${card} p-4`}>
          <div className="mb-3 font-semibold text-sm">🌡️ 세션 목록 — {filterDate}</div>
          {loading ? (
            <div className="py-4 text-center text-sm text-slate-400">불러오는 중...</div>
          ) : sessions.length === 0 ? (
            <div className="py-4 text-center text-sm text-slate-400">세션이 없습니다.</div>
          ) : (
            <div className="space-y-2">
              {sessions.map((s) => (
                <button key={s.id}
                  className={`w-full rounded-xl border p-3 text-left transition-all ${selectedSession?.id === s.id ? "border-blue-400 bg-blue-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}
                  onClick={() => setSelectedSession(s)}
                >
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-sm">{(s.slot as any)?.slot_name} ({(s.slot as any)?.purpose})</div>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${s.status === "active" ? "bg-green-100 border-green-200 text-green-700" : "bg-slate-100 border-slate-200 text-slate-500"}`}>
                      {s.status === "active" ? "진행중" : "종료"}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    이벤트 {(s.events ?? []).length}건 · 작업지시서 {(s.orders ?? []).length}건
                  </div>
                  {s.note && <div className="mt-0.5 text-xs text-slate-400">{s.note}</div>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 세션 상세 */}
        {selectedSession ? (
          <div className="space-y-4">
            <div className={`${card} p-4`}>
              <div className="flex items-center justify-between mb-3">
                <div className="font-semibold text-sm">
                  🌡️ {(selectedSession.slot as any)?.slot_name} 세션 상세
                </div>
                <div className="flex gap-2">
                  {isAdminOrSubadmin && selectedSession.status === "active" && (
                    <>
                      <button
                        className="rounded-lg border border-blue-300 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                        onClick={() => setShowEventForm((v) => !v)}
                      >
                        {showEventForm ? "✕" : "✚ 이벤트 기록"}
                      </button>
                      <button
                        className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-100"
                        onClick={() => closeSession(selectedSession.id)}
                      >세션 종료</button>
                    </>
                  )}
                </div>
              </div>

              {/* 이벤트 등록 폼 */}
              {showEventForm && (
                <div className="mb-4 rounded-xl border border-blue-100 bg-blue-50 p-3">
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    <div>
                      <div className="mb-1 text-xs text-slate-500">이벤트 유형</div>
                      <select className={inp} value={fEventType} onChange={(e) => setFEventType(e.target.value)}>
                        {Object.entries(EVENT_TYPE_LABELS).map(([k, v]) => (
                          <option key={k} value={k}>{v}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <div className="mb-1 text-xs text-slate-500">측정시각</div>
                      <input type="time" className={inp} value={fMeasuredAt}
                        onChange={(e) => setFMeasuredAt(e.target.value)} />
                    </div>
                    {fEventType !== "vat_refill" && fEventType !== "move" && (
                      <>
                        <div>
                          <div className="mb-1 text-xs text-slate-500">온도 (40~50°C)</div>
                          <input className={inpR} inputMode="decimal" placeholder="예: 45"
                            value={fTemperature} onChange={(e) => setFTemperature(e.target.value.replace(/[^\d.]/g, ""))} />
                        </div>
                        <div>
                          <div className="mb-1 text-xs text-slate-500">적합 여부</div>
                          <select className={inp} value={fIsOk ? "ok" : "ng"}
                            onChange={(e) => setFIsOk(e.target.value === "ok")}>
                            <option value="ok">✅ 적합</option>
                            <option value="ng">❌ 부적합</option>
                          </select>
                        </div>
                      </>
                    )}
                    {!fIsOk && (
                      <div className="md:col-span-4">
                        <div className="mb-1 text-xs text-slate-500">조치사항 *</div>
                        <input className={inp} value={fActionNote}
                          onChange={(e) => setFActionNote(e.target.value)}
                          placeholder="이탈 시 조치 내용" />
                      </div>
                    )}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button className="flex-1 rounded-xl bg-blue-600 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-60"
                      disabled={savingEvent} onClick={saveEvent}>
                      {savingEvent ? "저장 중..." : "💾 기록"}
                    </button>
                    <button className={btnSm} onClick={() => setShowEventForm(false)}>취소</button>
                  </div>
                </div>
              )}

              {/* 이벤트 목록 */}
              <div className="space-y-1.5">
                {(selectedSession.events ?? []).length === 0 ? (
                  <div className="py-4 text-center text-sm text-slate-400">기록된 이벤트가 없습니다.</div>
                ) : (
                  [...(selectedSession.events ?? [])].sort((a, b) => a.measured_at.localeCompare(b.measured_at))
                    .map((ev) => (
                      <div key={ev.id} className={`rounded-xl border px-3 py-2 ${ev.is_ok === false ? "border-red-200 bg-red-50" : "border-slate-200 bg-slate-50"}`}>
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-mono text-slate-500">{ev.measured_at.slice(11, 16)}</span>
                          <span className="text-xs font-semibold text-slate-700">{EVENT_TYPE_LABELS[ev.event_type] ?? ev.event_type}</span>
                          {ev.temperature != null && (
                            <span className={`text-xs font-bold ${ev.is_ok === false ? "text-red-600" : "text-blue-600"}`}>
                              {ev.temperature}°C
                            </span>
                          )}
                          {ev.is_ok != null && (
                            <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${ev.is_ok ? "bg-green-100 border-green-200 text-green-700" : "bg-red-100 border-red-200 text-red-700"}`}>
                              {ev.is_ok ? "적합" : "부적합"}
                            </span>
                          )}
                        </div>
                        {ev.action_note && (
                          <div className="mt-1 text-xs text-red-600">조치: {ev.action_note}</div>
                        )}
                      </div>
                    ))
                )}
              </div>
            </div>

            {/* 연결된 작업지시서 */}
            {(selectedSession.orders ?? []).length > 0 && (
              <div className={`${card} p-4`}>
                <div className="mb-2 font-semibold text-sm">📋 연결된 작업지시서</div>
                <div className="space-y-1.5">
                  {(selectedSession.orders ?? []).map((o) => (
                    <div key={o.id} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                      <span className="font-medium">{o.client_name}</span>
                      {o.product_name && <span className="ml-2 text-slate-500 text-xs">{o.product_name}</span>}
                      {o.work_order_ref && <span className="ml-2 text-xs font-mono text-slate-400">{o.work_order_ref}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className={`${card} flex items-center justify-center p-12`}>
            <div className="text-center text-slate-400">
              <div className="text-3xl mb-2">🌡️</div>
              <div className="text-sm">왼쪽에서 세션을 선택하세요</div>
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
    const { data } = await supabase.from("ccp_metal_logs")
      .select("*").eq("log_date", filterDate)
      .order("created_at", { ascending: false });
    setLogs((data ?? []) as MetalLog[]);
    setLoading(false);
  }, [filterDate]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  async function saveLog() {
    if (!fProductName) return showToast("제품명을 입력하세요.", "error");
    setSaving(true);
    const { error } = await supabase.from("ccp_metal_logs").insert({
      log_date: filterDate,
      product_name: fProductName.trim(),
      quantity: fQty ? Number(fQty) : null,
      start_time: fStartTime || null,
      end_time: fEndTime || null,
      fe_pass: fFePass,
      sus_pass: fSusPass,
      product_pass: fProductPass,
      zone: fZone,
      action_note: fActionNote.trim() || null,
      note: fNote.trim() || null,
      created_by: userId,
    });
    setSaving(false);
    if (error) return showToast("저장 실패: " + error.message, "error");
    showToast("✅ 금속검출 기록 완료!");
    setShowForm(false);
    setFProductName(""); setFQty(""); setFStartTime(""); setFEndTime("");
    setFFePass(true); setFSusPass(true); setFProductPass(true);
    setFActionNote(""); setFNote("");
    loadLogs();
  }

  async function approveLog(logId: string) {
    const { error } = await supabase.from("ccp_metal_logs")
      .update({ approved_by: userId, approved_at: new Date().toISOString() }).eq("id", logId);
    if (error) return showToast("실패: " + error.message, "error");
    showToast("✅ 승인 완료!");
    loadLogs();
  }

  return (
    <div className="space-y-4">
      <div className={`${card} p-4`}>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <div className="mb-1 text-xs text-slate-500">날짜</div>
            <input type="date" className={inp} style={{ width: 160 }} value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)} />
          </div>
          <button className={btn} onClick={loadLogs}>🔄 조회</button>
          {isAdminOrSubadmin && (
            <button
              className={showForm ? btnOn : "rounded-xl border border-blue-300 bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-700 hover:bg-blue-100"}
              onClick={() => setShowForm((v) => !v)}
            >
              {showForm ? "✕ 닫기" : "✚ 금속검출 기록"}
            </button>
          )}
          <button className={btnSm} onClick={() => window.print()}>🖨️ 인쇄</button>
        </div>
      </div>

      {showForm && isAdminOrSubadmin && (
        <div className={`${card} p-4`}>
          <div className="mb-3 font-semibold text-sm text-blue-700">✚ CCP-1P 금속검출 기록</div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div>
              <div className="mb-1 text-xs text-slate-500">제품명 *</div>
              <input className={inp} value={fProductName} onChange={(e) => setFProductName(e.target.value)} />
            </div>
            <div>
              <div className="mb-1 text-xs text-slate-500">수량</div>
              <input className={inpR} inputMode="numeric" value={fQty}
                onChange={(e) => setFQty(e.target.value.replace(/[^\d]/g, ""))} />
            </div>
            <div>
              <div className="mb-1 text-xs text-slate-500">구역</div>
              <select className={inp} value={fZone} onChange={(e) => setFZone(e.target.value)}>
                <option value="A">A구역 (제품 1개)</option>
                <option value="B">B구역 (제품 2개 이상)</option>
              </select>
            </div>
            <div>
              <div className="mb-1 text-xs text-slate-500">시작시간</div>
              <input type="time" className={inp} value={fStartTime} onChange={(e) => setFStartTime(e.target.value)} />
            </div>
            <div>
              <div className="mb-1 text-xs text-slate-500">종료시간</div>
              <input type="time" className={inp} value={fEndTime} onChange={(e) => setFEndTime(e.target.value)} />
            </div>
            <div className="md:col-span-3">
              <div className="mb-2 text-xs text-slate-500">검출 결과</div>
              <div className="flex flex-wrap gap-4">
                {[
                  { label: "Fe 통과", value: fFePass, set: setFFePass },
                  { label: "SUS 통과", value: fSusPass, set: setFSusPass },
                  { label: "제품 통과", value: fProductPass, set: setFProductPass },
                ].map(({ label, value, set }) => (
                  <label key={label} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={value}
                      onChange={(e) => set(e.target.checked)}
                      className="w-4 h-4 rounded" />
                    {label}
                  </label>
                ))}
              </div>
            </div>
            {(!fFePass || !fSusPass || !fProductPass) && (
              <div className="md:col-span-3">
                <div className="mb-1 text-xs text-slate-500">조치사항</div>
                <input className={inp} value={fActionNote} onChange={(e) => setFActionNote(e.target.value)}
                  placeholder="불통 시 조치 내용" />
              </div>
            )}
            <div>
              <div className="mb-1 text-xs text-slate-500">비고</div>
              <input className={inp} value={fNote} onChange={(e) => setFNote(e.target.value)} />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60"
              disabled={saving} onClick={saveLog}>
              {saving ? "저장 중..." : "💾 기록"}
            </button>
            <button className={btn} onClick={() => setShowForm(false)}>취소</button>
          </div>
        </div>
      )}

      <div className={`${card} p-4`}>
        <div className="mb-3 font-semibold text-sm">🔍 금속검출 기록 — {filterDate}</div>
        {loading ? (
          <div className="py-4 text-center text-sm text-slate-400">불러오는 중...</div>
        ) : logs.length === 0 ? (
          <div className="py-4 text-center text-sm text-slate-400">기록이 없습니다.</div>
        ) : (
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
                        {[
                          { label: "Fe", pass: log.fe_pass },
                          { label: "SUS", pass: log.sus_pass },
                          { label: "제품", pass: log.product_pass },
                        ].map(({ label, pass }) => (
                          <span key={label} className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold
                            ${pass ? "bg-green-100 border-green-200 text-green-700" : "bg-red-100 border-red-200 text-red-700"}`}>
                            {label} {pass ? "✅" : "❌"}
                          </span>
                        ))}
                      </div>
                      {log.action_note && (
                        <div className="mt-1 text-xs text-red-600">조치: {log.action_note}</div>
                      )}
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-1">
                      {!log.approved_by && isAdmin && (
                        <button className="rounded-lg border border-green-300 bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-700 hover:bg-green-100"
                          onClick={() => approveLog(log.id)}>✅ 승인</button>
                      )}
                      {log.approved_by && (
                        <span className="rounded-full border border-green-200 bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">승인완료</span>
                      )}
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
// 기타가공품 가열공정 모니터링
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
    const { data } = await supabase.from("ccp_other_heating_logs")
      .select("*").eq("log_date", filterDate)
      .order("measured_at", { ascending: false });
    setLogs((data ?? []) as OtherHeatingLog[]);
    setLoading(false);
  }, [filterDate]);

  useEffect(() => { loadLogs(); }, [loadLogs]);
  useEffect(() => {
    supabase.from("warmer_slots").select("id,slot_name,purpose")
      .eq("is_active", true).order("slot_no")
      .then(({ data }) => setSlots(data ?? []));
  }, []);

  async function saveLog() {
    if (!fTemp) return showToast("온도를 입력하세요.", "error");
    const temp = Number(fTemp);
    if (temp < 40 || temp > 50) return showToast("온도는 40~50도 범위여야 합니다.", "error");
    setSaving(true);
    const measuredAt = `${filterDate}T${fTime}:00`;
    const { error } = await supabase.from("ccp_other_heating_logs").insert({
      log_date: filterDate,
      work_type: fWorkType,
      slot_id: fSlotId || null,
      measured_at: measuredAt,
      temperature: temp,
      is_ok: fIsOk,
      action_note: fActionNote.trim() || null,
      note: fNote.trim() || null,
      created_by: userId,
    });
    setSaving(false);
    if (error) return showToast("저장 실패: " + error.message, "error");
    showToast("✅ 가열공정 기록 완료!");
    setShowForm(false);
    setFTemp(""); setFActionNote(""); setFNote(""); setFIsOk(true);
    loadLogs();
  }

  async function approveLog(logId: string) {
    const { error } = await supabase.from("ccp_other_heating_logs")
      .update({ approved_by: userId, approved_at: new Date().toISOString() }).eq("id", logId);
    if (error) return showToast("실패: " + error.message, "error");
    showToast("✅ 승인 완료!");
    loadLogs();
  }

  return (
    <div className="space-y-4">
      <div className={`${card} p-4`}>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <div className="mb-1 text-xs text-slate-500">날짜</div>
            <input type="date" className={inp} style={{ width: 160 }} value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)} />
          </div>
          <button className={btn} onClick={loadLogs}>🔄 조회</button>
          {isAdminOrSubadmin && (
            <button
              className={showForm ? btnOn : "rounded-xl border border-blue-300 bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-700 hover:bg-blue-100"}
              onClick={() => setShowForm((v) => !v)}
            >
              {showForm ? "✕ 닫기" : "✚ 가열공정 기록"}
            </button>
          )}
          <button className={btnSm} onClick={() => window.print()}>🖨️ 인쇄</button>
        </div>
      </div>

      {showForm && isAdminOrSubadmin && (
        <div className={`${card} p-4`}>
          <div className="mb-3 font-semibold text-sm text-blue-700">✚ 기타가공품 가열공정 기록</div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div>
              <div className="mb-1 text-xs text-slate-500">작업유형 *</div>
              <select className={inp} value={fWorkType} onChange={(e) => setFWorkType(e.target.value)}>
                <option value="jeonsa">② 전사지 생산</option>
                <option value="pet_coating">④ PET 코팅</option>
              </select>
            </div>
            <div>
              <div className="mb-1 text-xs text-slate-500">온장고 슬롯</div>
              <select className={inp} value={fSlotId} onChange={(e) => setFSlotId(e.target.value)}>
                <option value="">— 선택 —</option>
                {slots.map((s) => <option key={s.id} value={s.id}>{s.slot_name} ({s.purpose})</option>)}
              </select>
            </div>
            <div>
              <div className="mb-1 text-xs text-slate-500">측정시각</div>
              <input type="time" className={inp} value={fTime} onChange={(e) => setFTime(e.target.value)} />
            </div>
            <div>
              <div className="mb-1 text-xs text-slate-500">온도 (40~50°C) *</div>
              <input className={inpR} inputMode="decimal" value={fTemp}
                onChange={(e) => setFTemp(e.target.value.replace(/[^\d.]/g, ""))} placeholder="예: 45" />
            </div>
            <div>
              <div className="mb-1 text-xs text-slate-500">적합 여부</div>
              <select className={inp} value={fIsOk ? "ok" : "ng"}
                onChange={(e) => setFIsOk(e.target.value === "ok")}>
                <option value="ok">✅ 적합</option>
                <option value="ng">❌ 부적합</option>
              </select>
            </div>
            {!fIsOk && (
              <div>
                <div className="mb-1 text-xs text-slate-500">조치사항</div>
                <input className={inp} value={fActionNote} onChange={(e) => setFActionNote(e.target.value)} />
              </div>
            )}
            <div>
              <div className="mb-1 text-xs text-slate-500">비고</div>
              <input className={inp} value={fNote} onChange={(e) => setFNote(e.target.value)} />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60"
              disabled={saving} onClick={saveLog}>
              {saving ? "저장 중..." : "💾 기록"}
            </button>
            <button className={btn} onClick={() => setShowForm(false)}>취소</button>
          </div>
        </div>
      )}

      <div className={`${card} p-4`}>
        <div className="mb-3 font-semibold text-sm">🔥 가열공정 기록 — {filterDate}</div>
        {loading ? (
          <div className="py-4 text-center text-sm text-slate-400">불러오는 중...</div>
        ) : logs.length === 0 ? (
          <div className="py-4 text-center text-sm text-slate-400">기록이 없습니다.</div>
        ) : (
          <div className="space-y-2">
            {logs.map((log) => (
              <div key={log.id} className={`rounded-2xl border p-3 ${log.is_ok === false ? "border-red-200 bg-red-50" : "border-slate-200 bg-slate-50"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-sm">
                        {log.work_type === "jeonsa" ? "② 전사지 생산" : "④ PET 코팅"}
                      </span>
                      <span className="text-xs font-mono text-slate-500">{log.measured_at.slice(11, 16)}</span>
                      <span className={`text-sm font-bold ${log.is_ok === false ? "text-red-600" : "text-blue-600"}`}>
                        {log.temperature}°C
                      </span>
                      <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold
                        ${log.is_ok ? "bg-green-100 border-green-200 text-green-700" : "bg-red-100 border-red-200 text-red-700"}`}>
                        {log.is_ok ? "적합" : "부적합"}
                      </span>
                    </div>
                    {log.action_note && <div className="mt-1 text-xs text-red-600">조치: {log.action_note}</div>}
                    {log.note && <div className="mt-0.5 text-xs text-slate-400">비고: {log.note}</div>}
                  </div>
                  <div className="shrink-0">
                    {!log.approved_by && isAdmin && (
                      <button className="rounded-lg border border-green-300 bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-700 hover:bg-green-100"
                        onClick={() => approveLog(log.id)}>✅ 승인</button>
                    )}
                    {log.approved_by && (
                      <span className="rounded-full border border-green-200 bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">승인완료</span>
                    )}
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
// 압축공기 작업기록
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
    const { data } = await supabase.from("compressor_logs")
      .select("*").eq("log_date", filterDate)
      .order("worked_at", { ascending: false });
    setLogs((data ?? []) as CompressorLog[]);
    setLoading(false);
  }, [filterDate]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  async function saveLog() {
    setSaving(true);
    const workedAt = `${filterDate}T${fTime}:00`;
    const { error } = await supabase.from("compressor_logs").insert({
      log_date: filterDate,
      work_type: fWorkType,
      worked_at: workedAt,
      work_hours: fWorkHours ? Number(fWorkHours) : null,
      cumulative_hours: fCumulativeHours ? Number(fCumulativeHours) : null,
      is_damaged: fIsDamaged,
      note: fNote.trim() || null,
      created_by: userId,
    });
    setSaving(false);
    if (error) return showToast("저장 실패: " + error.message, "error");
    showToast("✅ 압축공기 기록 완료!");
    setShowForm(false);
    setFWorkHours(""); setFCumulativeHours(""); setFIsDamaged(false); setFNote("");
    loadLogs();
  }

  async function approveLog(logId: string) {
    const { error } = await supabase.from("compressor_logs")
      .update({ approved_by: userId, approved_at: new Date().toISOString() }).eq("id", logId);
    if (error) return showToast("실패: " + error.message, "error");
    showToast("✅ 승인 완료!");
    loadLogs();
  }

  return (
    <div className="space-y-4">
      <div className={`${card} p-4`}>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <div className="mb-1 text-xs text-slate-500">날짜</div>
            <input type="date" className={inp} style={{ width: 160 }} value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)} />
          </div>
          <button className={btn} onClick={loadLogs}>🔄 조회</button>
          {isAdminOrSubadmin && (
            <button
              className={showForm ? btnOn : "rounded-xl border border-blue-300 bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-700 hover:bg-blue-100"}
              onClick={() => setShowForm((v) => !v)}
            >
              {showForm ? "✕ 닫기" : "✚ 압축공기 기록"}
            </button>
          )}
          <button className={btnSm} onClick={() => window.print()}>🖨️ 인쇄</button>
        </div>
      </div>

      {showForm && isAdminOrSubadmin && (
        <div className={`${card} p-4`}>
          <div className="mb-3 font-semibold text-sm text-blue-700">✚ 압축공기 작업기록</div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div>
              <div className="mb-1 text-xs text-slate-500">작업유형 *</div>
              <select className={inp} value={fWorkType} onChange={(e) => setFWorkType(e.target.value)}>
                <option value="pet_coating">④ PET 코팅</option>
                <option value="pet_spray">⑤ PET 분사</option>
              </select>
            </div>
            <div>
              <div className="mb-1 text-xs text-slate-500">작업시각</div>
              <input type="time" className={inp} value={fTime} onChange={(e) => setFTime(e.target.value)} />
            </div>
            <div>
              <div className="mb-1 text-xs text-slate-500">작업시간 (h)</div>
              <input className={inpR} inputMode="decimal" value={fWorkHours}
                onChange={(e) => setFWorkHours(e.target.value.replace(/[^\d.]/g, ""))} placeholder="예: 2.5" />
            </div>
            <div>
              <div className="mb-1 text-xs text-slate-500">누계시간 (h)</div>
              <input className={inpR} inputMode="decimal" value={fCumulativeHours}
                onChange={(e) => setFCumulativeHours(e.target.value.replace(/[^\d.]/g, ""))} />
            </div>
            <div className="flex items-center gap-2 pt-5">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={fIsDamaged}
                  onChange={(e) => setFIsDamaged(e.target.checked)}
                  className="w-4 h-4 rounded" />
                손상 발생
              </label>
            </div>
            <div>
              <div className="mb-1 text-xs text-slate-500">비고</div>
              <input className={inp} value={fNote} onChange={(e) => setFNote(e.target.value)} />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60"
              disabled={saving} onClick={saveLog}>
              {saving ? "저장 중..." : "💾 기록"}
            </button>
            <button className={btn} onClick={() => setShowForm(false)}>취소</button>
          </div>
        </div>
      )}

      <div className={`${card} p-4`}>
        <div className="mb-3 font-semibold text-sm">💨 압축공기 작업기록 — {filterDate}</div>
        {loading ? (
          <div className="py-4 text-center text-sm text-slate-400">불러오는 중...</div>
        ) : logs.length === 0 ? (
          <div className="py-4 text-center text-sm text-slate-400">기록이 없습니다.</div>
        ) : (
          <div className="space-y-2">
            {logs.map((log) => (
              <div key={log.id} className={`rounded-2xl border p-3 ${log.is_damaged ? "border-red-200 bg-red-50" : "border-slate-200 bg-slate-50"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-sm">
                        {log.work_type === "pet_coating" ? "④ PET 코팅" : "⑤ PET 분사"}
                      </span>
                      <span className="text-xs font-mono text-slate-500">{log.worked_at.slice(11, 16)}</span>
                      {log.is_damaged && (
                        <span className="rounded-full border border-red-200 bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">⚠ 손상</span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-500">
                      {log.work_hours != null && <span>작업시간: {log.work_hours}h</span>}
                      {log.cumulative_hours != null && <span>누계: {log.cumulative_hours}h</span>}
                      {log.note && <span>비고: {log.note}</span>}
                    </div>
                  </div>
                  <div className="shrink-0">
                    {!log.approved_by && isAdmin && (
                      <button className="rounded-lg border border-green-300 bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-700 hover:bg-green-100"
                        onClick={() => approveLog(log.id)}>✅ 승인</button>
                    )}
                    {log.approved_by && (
                      <span className="rounded-full border border-green-200 bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">승인완료</span>
                    )}
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
      supabase.from("pet_stock_logs").select("*").eq("log_date", filterDate)
        .order("created_at", { ascending: false }),
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
      log_date: filterDate,
      log_type: fLogType,
      quantity: Number(fQty),
      defect_qty: fDefectQty ? Number(fDefectQty) : 0,
      note: fNote.trim() || null,
      created_by: userId,
    });
    setSaving(false);
    if (error) return showToast("저장 실패: " + error.message, "error");
    showToast("✅ PET 수불 기록 완료!");
    setShowForm(false);
    setFQty(""); setFDefectQty(""); setFNote("");
    loadData();
  }

  async function approveLog(logId: string) {
    const { error } = await supabase.from("pet_stock_logs")
      .update({ approved_by: userId, approved_at: new Date().toISOString() }).eq("id", logId);
    if (error) return showToast("실패: " + error.message, "error");
    showToast("✅ 승인 완료!");
    loadData();
  }

  return (
    <div className="space-y-4">
      <div className={`${card} p-4`}>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <div className="mb-1 text-xs text-slate-500">날짜</div>
            <input type="date" className={inp} style={{ width: 160 }} value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)} />
          </div>
          <button className={btn} onClick={loadData}>🔄 조회</button>
          {isAdminOrSubadmin && (
            <button
              className={showForm ? btnOn : "rounded-xl border border-blue-300 bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-700 hover:bg-blue-100"}
              onClick={() => setShowForm((v) => !v)}
            >
              {showForm ? "✕ 닫기" : "✚ 수불 기록"}
            </button>
          )}
          <button className={btnSm} onClick={() => window.print()}>🖨️ 인쇄</button>
        </div>
      </div>

      {/* PET 현재고 현황 */}
      {stock && (
        <div className={`${card} p-4`}>
          <div className="mb-3 font-semibold text-sm">📦 PET 공정별 현재고</div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "원상태", value: stock.stock_raw, color: "text-slate-800" },
              { label: "코팅완료", value: stock.stock_coated, color: "text-blue-700" },
              { label: "분사완료(생산용)", value: stock.stock_sprayed_prod, color: "text-green-700" },
              { label: "분사완료(판매용)", value: stock.stock_sprayed_sale, color: "text-purple-700" },
            ].map(({ label, value, color }) => (
              <div key={label} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-center">
                <div className="text-xs text-slate-500 mb-1">{label}</div>
                <div className={`text-xl font-bold tabular-nums ${color}`}>
                  {value.toLocaleString()}
                </div>
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
            <div>
              <div className="mb-1 text-xs text-slate-500">구분 *</div>
              <select className={inp} value={fLogType} onChange={(e) => setFLogType(e.target.value)}>
                {Object.entries(PET_LOG_TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <div className="mb-1 text-xs text-slate-500">수량 (ea) *</div>
              <input className={inpR} inputMode="numeric" value={fQty}
                onChange={(e) => setFQty(e.target.value.replace(/[^\d]/g, ""))} />
            </div>
            <div>
              <div className="mb-1 text-xs text-slate-500">불량수량 (ea)</div>
              <input className={inpR} inputMode="numeric" value={fDefectQty}
                onChange={(e) => setFDefectQty(e.target.value.replace(/[^\d]/g, ""))} />
            </div>
            <div>
              <div className="mb-1 text-xs text-slate-500">비고</div>
              <input className={inp} value={fNote} onChange={(e) => setFNote(e.target.value)} />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60"
              disabled={saving} onClick={saveLog}>
              {saving ? "저장 중..." : "💾 기록"}
            </button>
            <button className={btn} onClick={() => setShowForm(false)}>취소</button>
          </div>
        </div>
      )}

      <div className={`${card} p-4`}>
        <div className="mb-3 font-semibold text-sm">📋 PET 수불 내역 — {filterDate}</div>
        {loading ? (
          <div className="py-4 text-center text-sm text-slate-400">불러오는 중...</div>
        ) : logs.length === 0 ? (
          <div className="py-4 text-center text-sm text-slate-400">기록이 없습니다.</div>
        ) : (
          <div className="space-y-2">
            {logs.map((log) => (
              <div key={log.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-sm">{PET_LOG_TYPE_LABELS[log.log_type] ?? log.log_type}</span>
                      <span className="text-sm font-bold tabular-nums text-blue-700">{log.quantity.toLocaleString()} ea</span>
                      {log.defect_qty > 0 && (
                        <span className="text-xs text-red-600">불량: {log.defect_qty}ea</span>
                      )}
                    </div>
                    {log.note && <div className="mt-0.5 text-xs text-slate-400">비고: {log.note}</div>}
                  </div>
                  <div className="shrink-0">
                    {!log.approved_by && isAdmin && (
                      <button className="rounded-lg border border-green-300 bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-700 hover:bg-green-100"
                        onClick={() => approveLog(log.id)}>✅ 승인</button>
                    )}
                    {log.approved_by && (
                      <span className="rounded-full border border-green-200 bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">승인완료</span>
                    )}
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
