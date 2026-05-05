"use client";

import React, { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import FridgeMonitoringClient from "./fridge-monitoring-client";
import { PinModal, usePinSession } from "@/app/contexts/PinSessionContext";

const supabase = createClient();

const card = "rounded-2xl border border-slate-200 bg-white shadow-sm";
const inp = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:outline-none";
const inpR = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-right tabular-nums focus:border-blue-400 focus:outline-none";
const btn = "rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50 active:bg-slate-100";
const btnOn = "rounded-xl border border-blue-500 bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700";
const btnSm = "rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium hover:bg-slate-50";

type UserRole = "ADMIN" | "SUBADMIN" | "USER" | null;

// ═══════════════════════════════════════════════════════════
// 1. 소비기한 관리일지
// ═══════════════════════════════════════════════════════════
export function ExpiryMgmtTab({ role, userId, showToast }: {
  role: UserRole; userId: string | null;
  showToast: (msg: string, type?: "success" | "error") => void;
}) {
  const isAdmin = role === "ADMIN";
  const isAdminOrSubadmin = role === "ADMIN" || role === "SUBADMIN";
  const [logs, setLogs] = useState<any[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);
  const [filterDate, setFilterDate] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [fMaterialId, setFMaterialId] = useState("");
  const [fItemName, setFItemName] = useState("");
  const [fExpiryDate, setFExpiryDate] = useState("");
  const [fCurrentStock, setFCurrentStock] = useState("");
  const [fStatus, setFStatus] = useState("정상");
  const [fAction, setFAction] = useState("");
  const [saving, setSaving] = useState(false);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("expiry_mgmt_logs")
      .select("*").eq("log_date", filterDate).order("expiry_date");
    setLogs(data ?? []);
    setLoading(false);
  }, [filterDate]);

  useEffect(() => { loadLogs(); }, [loadLogs]);
  useEffect(() => {
    supabase.from("materials").select("id,name").order("name")
      .then(({ data }) => setMaterials(data ?? []));
  }, []);

  async function saveLog() {
    if (!fItemName || !fExpiryDate) return showToast("품목명과 소비기한을 입력하세요.", "error");
    setSaving(true);
    const { error } = await supabase.from("expiry_mgmt_logs").insert({
      log_date: filterDate, material_id: fMaterialId || null,
      item_name: fItemName.trim(), expiry_date: fExpiryDate,
      current_stock: fCurrentStock ? Number(fCurrentStock) : null,
      status: fStatus, action: fAction.trim() || null, created_by: userId,
    });
    setSaving(false);
    if (error) return showToast("저장 실패: " + error.message, "error");
    showToast("✅ 소비기한 기록 완료!");
    setShowForm(false);
    setFMaterialId(""); setFItemName(""); setFExpiryDate(""); setFCurrentStock(""); setFAction(""); setFStatus("정상");
    loadLogs();
  }

  async function approveLog(id: string) {
    await supabase.from("expiry_mgmt_logs").update({ approved_by: userId, approved_at: new Date().toISOString() }).eq("id", id);
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
              onClick={() => setShowForm((v) => !v)}>{showForm ? "✕ 닫기" : "✚ 기록 등록"}</button>
          )}
          <button className={btnSm} onClick={() => window.print()}>🖨️ 인쇄</button>
        </div>
      </div>
      {showForm && isAdminOrSubadmin && (
        <div className={`${card} p-4`}>
          <div className="mb-3 font-semibold text-sm text-blue-700">✚ 소비기한 관리 등록</div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div><div className="mb-1 text-xs text-slate-500">원료 (선택)</div>
              <select className={inp} value={fMaterialId} onChange={(e) => { setFMaterialId(e.target.value); const m = materials.find((m) => m.id === e.target.value); if (m) setFItemName(m.name); }}>
                <option value="">— 직접 입력 —</option>
                {materials.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select></div>
            <div><div className="mb-1 text-xs text-slate-500">품목명 *</div>
              <input className={inp} value={fItemName} onChange={(e) => setFItemName(e.target.value)} /></div>
            <div><div className="mb-1 text-xs text-slate-500">소비기한 *</div>
              <input type="date" className={inp} value={fExpiryDate} onChange={(e) => setFExpiryDate(e.target.value)} /></div>
            <div><div className="mb-1 text-xs text-slate-500">현재고</div>
              <input className={inpR} inputMode="numeric" value={fCurrentStock} onChange={(e) => setFCurrentStock(e.target.value.replace(/[^\d]/g, ""))} /></div>
            <div><div className="mb-1 text-xs text-slate-500">상태</div>
              <select className={inp} value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
                <option value="정상">정상</option><option value="D-30 경보">D-30 경보</option><option value="만료">만료</option>
              </select></div>
            <div><div className="mb-1 text-xs text-slate-500">조치사항</div>
              <input className={inp} value={fAction} onChange={(e) => setFAction(e.target.value)} /></div>
          </div>
          <div className="mt-4 flex gap-2">
            <button className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60"
              disabled={saving} onClick={saveLog}>{saving ? "저장 중..." : "💾 등록"}</button>
            <button className={btn} onClick={() => setShowForm(false)}>취소</button>
          </div>
        </div>
      )}
      <div className={`${card} p-4`}>
        <div className="mb-3 font-semibold text-sm">📅 소비기한 관리일지 — {filterDate}</div>
        {loading ? <div className="py-4 text-center text-sm text-slate-400">불러오는 중...</div>
          : logs.length === 0 ? <div className="py-4 text-center text-sm text-slate-400">기록이 없습니다.</div>
          : <div className="overflow-x-auto"><table className="w-full text-sm border-collapse">
              <thead><tr className="border-b border-slate-200">
                {["품목명","소비기한","현재고","상태","조치사항","승인"].map((h) => (
                  <th key={h} className="text-left py-2 px-3 text-xs text-slate-500 font-semibold">{h}</th>
                ))}</tr></thead>
              <tbody>{logs.map((log) => (
                <tr key={log.id} className={`border-b border-slate-100 hover:bg-slate-50 ${log.status === "만료" ? "bg-red-50" : log.status === "D-30 경보" ? "bg-orange-50" : ""}`}>
                  <td className="py-2 px-3 font-medium">{log.item_name}</td>
                  <td className="py-2 px-3 tabular-nums">{log.expiry_date}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{log.current_stock ?? "—"}</td>
                  <td className="py-2 px-3"><span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${log.status === "만료" ? "bg-red-100 border-red-200 text-red-700" : log.status === "D-30 경보" ? "bg-orange-100 border-orange-200 text-orange-700" : "bg-green-100 border-green-200 text-green-700"}`}>{log.status}</span></td>
                  <td className="py-2 px-3 text-xs text-slate-500">{log.action ?? "—"}</td>
                  <td className="py-2 px-3">{!log.approved_by && isAdmin ? <button className="rounded-lg border border-green-300 bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-700" onClick={() => approveLog(log.id)}>✅ 승인</button> : log.approved_by ? <span className="text-[10px] text-green-600 font-semibold">승인완료</span> : "—"}</td>
                </tr>
              ))}</tbody>
            </table></div>}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 2. 온장고 세척소독 관리일지
// ═══════════════════════════════════════════════════════════
export function WarmerCleaningTab({ role, userId, showToast }: {
  role: UserRole; userId: string | null;
  showToast: (msg: string, type?: "success" | "error") => void;
}) {
  const isAdmin = role === "ADMIN";
  const isAdminOrSubadmin = role === "ADMIN" || role === "SUBADMIN";
  const [logs, setLogs] = useState<any[]>([]);
  const [slots, setSlots] = useState<any[]>([]);
  const [filterDate, setFilterDate] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [fSlotId, setFSlotId] = useState("");
  const [fWarmerNo, setFWarmerNo] = useState("");
  const [checks, setChecks] = useState({ disassemble_ok: true, wash_ok: true, disinfect_ok: true, dry_ok: true, reassemble_ok: true });
  const [fNote, setFNote] = useState("");
  const [saving, setSaving] = useState(false);

  const CHECK_LABELS = [
    { key: "disassemble_ok", label: "분해" }, { key: "wash_ok", label: "세척" },
    { key: "disinfect_ok", label: "소독" }, { key: "dry_ok", label: "건조" },
    { key: "reassemble_ok", label: "재조립" },
  ];

  const loadLogs = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("warmer_cleaning_logs")
      .select("*, slot:warmer_slots(slot_name,purpose)").eq("log_date", filterDate).order("created_at", { ascending: false });
    setLogs(data ?? []);
    setLoading(false);
  }, [filterDate]);

  useEffect(() => { loadLogs(); }, [loadLogs]);
  useEffect(() => {
    supabase.from("warmer_slots").select("id,slot_name,warmer_no,purpose").eq("is_active", true).order("slot_no")
      .then(({ data }) => setSlots(data ?? []));
  }, []);

  async function saveLog() {
    setSaving(true);
    const { error } = await supabase.from("warmer_cleaning_logs").insert({
      log_date: filterDate, slot_id: fSlotId || null,
      warmer_no: fWarmerNo.trim() || null, ...checks,
      note: fNote.trim() || null, created_by: userId,
    });
    setSaving(false);
    if (error) return showToast("저장 실패: " + error.message, "error");
    showToast("✅ 세척소독 기록 완료!");
    setShowForm(false); setFSlotId(""); setFWarmerNo(""); setFNote("");
    setChecks({ disassemble_ok: true, wash_ok: true, disinfect_ok: true, dry_ok: true, reassemble_ok: true });
    loadLogs();
  }

  async function approveLog(id: string) {
    await supabase.from("warmer_cleaning_logs").update({ approved_by: userId, approved_at: new Date().toISOString() }).eq("id", id);
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
              onClick={() => setShowForm((v) => !v)}>{showForm ? "✕ 닫기" : "✚ 기록 등록"}</button>
          )}
          <button className={btnSm} onClick={() => window.print()}>🖨️ 인쇄</button>
        </div>
      </div>
      {showForm && isAdminOrSubadmin && (
        <div className={`${card} p-4`}>
          <div className="mb-3 font-semibold text-sm text-blue-700">✚ 온장고 세척소독 기록</div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div><div className="mb-1 text-xs text-slate-500">슬롯 선택</div>
              <select className={inp} value={fSlotId} onChange={(e) => { setFSlotId(e.target.value); const s = slots.find((s) => s.id === e.target.value); if (s) setFWarmerNo(String(s.warmer_no ?? "")); }}>
                <option value="">— 선택 —</option>
                {slots.map((s) => <option key={s.id} value={s.id}>{s.slot_name} ({s.purpose})</option>)}
              </select></div>
            <div><div className="mb-1 text-xs text-slate-500">온장고 번호</div>
              <input className={inp} value={fWarmerNo} onChange={(e) => setFWarmerNo(e.target.value)} placeholder="예: 3" /></div>
            <div><div className="mb-1 text-xs text-slate-500">비고</div>
              <input className={inp} value={fNote} onChange={(e) => setFNote(e.target.value)} /></div>
            <div className="md:col-span-3">
              <div className="mb-2 text-xs text-slate-500">점검항목</div>
              <div className="flex flex-wrap gap-4">
                {CHECK_LABELS.map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={(checks as any)[key]}
                      onChange={(e) => setChecks((p) => ({ ...p, [key]: e.target.checked }))} className="w-4 h-4 rounded" />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60"
              disabled={saving} onClick={saveLog}>{saving ? "저장 중..." : "💾 등록"}</button>
            <button className={btn} onClick={() => setShowForm(false)}>취소</button>
          </div>
        </div>
      )}
      <div className={`${card} p-4`}>
        <div className="mb-3 font-semibold text-sm">🧹 온장고 세척소독 기록 — {filterDate}</div>
        {loading ? <div className="py-4 text-center text-sm text-slate-400">불러오는 중...</div>
          : logs.length === 0 ? <div className="py-4 text-center text-sm text-slate-400">기록이 없습니다.</div>
          : <div className="space-y-2">{logs.map((log) => (
              <div key={log.id} className="rounded-2xl border border-slate-200 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="font-semibold text-sm">{(log.slot as any)?.slot_name ?? log.warmer_no ?? "—"}
                      {(log.slot as any)?.purpose && <span className="ml-2 text-xs text-slate-500">({(log.slot as any).purpose})</span>}
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-2">
                      {CHECK_LABELS.map(({ key, label }) => (
                        <span key={key} className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${(log as any)[key] ? "bg-green-100 border-green-200 text-green-700" : "bg-red-100 border-red-200 text-red-700"}`}>
                          {label} {(log as any)[key] ? "✅" : "❌"}
                        </span>
                      ))}
                    </div>
                    {log.note && <div className="mt-1 text-xs text-slate-400">비고: {log.note}</div>}
                  </div>
                  <div className="shrink-0">{!log.approved_by && isAdmin ? <button className="rounded-lg border border-green-300 bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-700" onClick={() => approveLog(log.id)}>✅ 승인</button> : log.approved_by ? <span className="text-[10px] text-green-600 font-semibold">승인완료</span> : null}</div>
                </div>
              </div>
            ))}</div>}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 3. 방충·방서 (보행+비래 통합)
// ═══════════════════════════════════════════════════════════
export function PestTab({ role, userId, showToast }: {
  role: UserRole; userId: string | null;
  showToast: (msg: string, type?: "success" | "error") => void;
}) {
  const isAdmin = role === "ADMIN";
  const isAdminOrSubadmin = role === "ADMIN" || role === "SUBADMIN";
  const [walkLogs, setWalkLogs] = useState<any[]>([]);
  const [flyLogs, setFlyLogs] = useState<any[]>([]);
  const [filterDate, setFilterDate] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [showWalkForm, setShowWalkForm] = useState(false);
  const [showFlyForm, setShowFlyForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const LOCS = ["01","02","03","04","05","06","07","08"];
  const BUGS = ["grimy","spider","centipede","mosquito","earwig","other"];
  const BUG_LABELS: Record<string,string> = { grimy:"그리마", spider:"거미", centipede:"노래기", mosquito:"모기", earwig:"집게벌레", other:"기타" };
  const FLY_TYPES = ["fly","midge","chironomid","fruitfly","moth","gnat","other"];
  const FLY_LABELS: Record<string,string> = { fly:"파리", midge:"각다귀", chironomid:"깔따구", fruitfly:"초파리", moth:"나방", gnat:"날파리", other:"기타" };

  const initWalk = () => { const o: Record<string,number> = {}; LOCS.forEach((l) => BUGS.forEach((b) => { o[`loc${l}_${b}`] = 0; })); return o; };
  const initFly = () => { const o: Record<string,boolean> = {}; FLY_TYPES.forEach((t) => { o[`${t}_found`] = false; }); return { ...o, bait_left_bait_ok: true, bait_left_damaged: false, bait_left_rat_sign: false, bait_right_bait_ok: true, bait_right_damaged: false, bait_right_rat_sign: false }; };
  const [walkForm, setWalkForm] = useState(initWalk());
  const [walkNote, setWalkNote] = useState("");
  const [flyForm, setFlyForm] = useState(initFly());
  const [flyNote, setFlyNote] = useState("");

  const loadLogs = useCallback(async () => {
    setLoading(true);
    const [w, f] = await Promise.all([
      supabase.from("pest_walk_logs").select("*").eq("log_date", filterDate).order("created_at", { ascending: false }),
      supabase.from("pest_fly_logs").select("*").eq("log_date", filterDate).order("created_at", { ascending: false }),
    ]);
    setWalkLogs(w.data ?? []); setFlyLogs(f.data ?? []);
    setLoading(false);
  }, [filterDate]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  async function saveWalk() {
    setSaving(true);
    const { error } = await supabase.from("pest_walk_logs").insert({ log_date: filterDate, ...walkForm, action_note: walkNote.trim() || null, created_by: userId });
    setSaving(false);
    if (error) return showToast("저장 실패: " + error.message, "error");
    showToast("✅ 보행해충 기록 완료!"); setShowWalkForm(false); setWalkForm(initWalk()); setWalkNote(""); loadLogs();
  }

  async function saveFly() {
    setSaving(true);
    const { error } = await supabase.from("pest_fly_logs").insert({ log_date: filterDate, ...flyForm, action_note: flyNote.trim() || null, created_by: userId });
    setSaving(false);
    if (error) return showToast("저장 실패: " + error.message, "error");
    showToast("✅ 비래해충 기록 완료!"); setShowFlyForm(false); setFlyForm(initFly()); setFlyNote(""); loadLogs();
  }

  async function approveLog(table: string, id: string) {
    await supabase.from(table).update({ approved_by: userId, approved_at: new Date().toISOString() }).eq("id", id);
    showToast("✅ 승인 완료!"); loadLogs();
  }

  return (
    <div className="space-y-4">
      <div className={`${card} p-4`}>
        <div className="flex flex-wrap gap-3 items-end">
          <div><div className="mb-1 text-xs text-slate-500">날짜</div>
            <input type="date" className={inp} style={{ width: 160 }} value={filterDate} onChange={(e) => setFilterDate(e.target.value)} /></div>
          <button className={btn} onClick={loadLogs}>🔄 조회</button>
          {isAdminOrSubadmin && (<>
            <button className={showWalkForm ? btnOn : "rounded-xl border border-blue-300 bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-700 hover:bg-blue-100"}
              onClick={() => { setShowWalkForm((v) => !v); setShowFlyForm(false); }}>{showWalkForm ? "✕ 닫기" : "✚ 보행해충"}</button>
            <button className={showFlyForm ? btnOn : "rounded-xl border border-purple-300 bg-purple-50 px-3 py-1.5 text-sm font-semibold text-purple-700 hover:bg-purple-100"}
              onClick={() => { setShowFlyForm((v) => !v); setShowWalkForm(false); }}>{showFlyForm ? "✕ 닫기" : "✚ 비래해충"}</button>
          </>)}
          <button className={btnSm} onClick={() => window.print()}>🖨️ 인쇄</button>
        </div>
      </div>

      {showWalkForm && isAdminOrSubadmin && (
        <div className={`${card} p-4`}>
          <div className="mb-3 font-semibold text-sm text-blue-700">✚ 보행해충 점검 기록</div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead><tr className="border-b border-slate-200">
                <th className="py-1.5 px-2 text-left text-slate-500">위치</th>
                {BUGS.map((b) => <th key={b} className="py-1.5 px-2 text-slate-500">{BUG_LABELS[b]}</th>)}
              </tr></thead>
              <tbody>{LOCS.map((loc) => (
                <tr key={loc} className="border-b border-slate-100">
                  <td className="py-1.5 px-2 font-medium text-slate-600">{loc}번</td>
                  {BUGS.map((bug) => (
                    <td key={bug} className="py-1 px-1">
                      <input type="number" min="0" className="w-14 rounded-lg border border-slate-200 px-2 py-1 text-xs text-right"
                        value={(walkForm as any)[`loc${loc}_${bug}`]}
                        onChange={(e) => setWalkForm((p) => ({ ...p, [`loc${loc}_${bug}`]: Number(e.target.value) }))} />
                    </td>
                  ))}
                </tr>
              ))}</tbody>
            </table>
          </div>
          <div className="mt-3"><div className="mb-1 text-xs text-slate-500">조치사항</div>
            <input className={inp} value={walkNote} onChange={(e) => setWalkNote(e.target.value)} /></div>
          <div className="mt-3 flex gap-2">
            <button className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60"
              disabled={saving} onClick={saveWalk}>{saving ? "저장 중..." : "💾 등록"}</button>
            <button className={btn} onClick={() => setShowWalkForm(false)}>취소</button>
          </div>
        </div>
      )}

      {showFlyForm && isAdminOrSubadmin && (
        <div className={`${card} p-4`}>
          <div className="mb-3 font-semibold text-sm text-purple-700">✚ 비래해충 점검 기록</div>
          <div className="mb-3">
            <div className="mb-2 text-xs text-slate-500">발견된 해충</div>
            <div className="flex flex-wrap gap-4">
              {FLY_TYPES.map((t) => (
                <label key={t} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={(flyForm as any)[`${t}_found`]}
                    onChange={(e) => setFlyForm((p) => ({ ...p, [`${t}_found`]: e.target.checked }))} className="w-4 h-4 rounded" />
                  {FLY_LABELS[t]}
                </label>
              ))}
            </div>
          </div>
          <div className="mb-3">
            <div className="mb-2 text-xs text-slate-500">쥐먹이상자</div>
            <div className="grid grid-cols-2 gap-4">
              {[["left","좌측"],["right","우측"]].map(([side, label]) => (
                <div key={side}><div className="text-xs font-semibold text-slate-600 mb-1.5">{label}</div>
                  {[[`bait_${side}_bait_ok`,"먹이 정상"],[`bait_${side}_damaged`,"파손"],[`bait_${side}_rat_sign`,"쥐 흔적"]].map(([key, lbl]) => (
                    <label key={key} className="flex items-center gap-2 text-xs cursor-pointer mb-1">
                      <input type="checkbox" checked={(flyForm as any)[key]}
                        onChange={(e) => setFlyForm((p) => ({ ...p, [key]: e.target.checked }))} className="w-3.5 h-3.5 rounded" />
                      {lbl}
                    </label>
                  ))}
                </div>
              ))}
            </div>
          </div>
          <div className="mb-3"><div className="mb-1 text-xs text-slate-500">조치사항</div>
            <input className={inp} value={flyNote} onChange={(e) => setFlyNote(e.target.value)} /></div>
          <div className="flex gap-2">
            <button className="flex-1 rounded-xl bg-purple-600 py-2.5 text-sm font-bold text-white hover:bg-purple-700 disabled:opacity-60"
              disabled={saving} onClick={saveFly}>{saving ? "저장 중..." : "💾 등록"}</button>
            <button className={btn} onClick={() => setShowFlyForm(false)}>취소</button>
          </div>
        </div>
      )}

      <div className={`${card} p-4`}>
        <div className="mb-3 font-semibold text-sm">🪲 보행해충 기록 — {filterDate}</div>
        {loading ? <div className="py-4 text-center text-sm text-slate-400">불러오는 중...</div>
          : walkLogs.length === 0 ? <div className="py-4 text-center text-sm text-slate-400">기록이 없습니다.</div>
          : walkLogs.map((log) => {
              const total = LOCS.reduce((s, l) => s + BUGS.reduce((ss, b) => ss + (log[`loc${l}_${b}`] ?? 0), 0), 0);
              return (
                <div key={log.id} className={`rounded-2xl border p-3 mb-2 ${total > 0 ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50"}`}>
                  <div className="flex items-center justify-between">
                    <div><span className="font-semibold text-sm">총 {total}마리 발견</span>
                      {log.action_note && <div className="text-xs text-slate-500 mt-0.5">조치: {log.action_note}</div>}</div>
                    <div className="flex items-center gap-2">
                      {!log.approved_by && isAdmin && <button className="rounded-lg border border-green-300 bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-700" onClick={() => approveLog("pest_walk_logs", log.id)}>✅ 승인</button>}
                      {log.approved_by && <span className="text-[10px] text-green-600 font-semibold">승인완료</span>}
                    </div>
                  </div>
                </div>
              );
            })}
      </div>

      <div className={`${card} p-4`}>
        <div className="mb-3 font-semibold text-sm">🦟 비래해충 기록 — {filterDate}</div>
        {loading ? <div className="py-4 text-center text-sm text-slate-400">불러오는 중...</div>
          : flyLogs.length === 0 ? <div className="py-4 text-center text-sm text-slate-400">기록이 없습니다.</div>
          : flyLogs.map((log) => {
              const found = FLY_TYPES.filter((t) => log[`${t}_found`]);
              return (
                <div key={log.id} className={`rounded-2xl border p-3 mb-2 ${found.length > 0 ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50"}`}>
                  <div className="flex items-center justify-between">
                    <div><div className="text-sm font-semibold">{found.length > 0 ? found.map((t) => FLY_LABELS[t]).join(", ") + " 발견" : "발견 없음"}</div>
                      {log.action_note && <div className="text-xs text-slate-500 mt-0.5">조치: {log.action_note}</div>}</div>
                    <div className="flex items-center gap-2">
                      {!log.approved_by && isAdmin && <button className="rounded-lg border border-green-300 bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-700" onClick={() => approveLog("pest_fly_logs", log.id)}>✅ 승인</button>}
                      {log.approved_by && <span className="text-[10px] text-green-600 font-semibold">승인완료</span>}
                    </div>
                  </div>
                </div>
              );
            })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 4. 이물관리 점검표
// ═══════════════════════════════════════════════════════════
export function ForeignMatterTab({ role, userId, showToast }: {
  role: UserRole; userId: string | null;
  showToast: (msg: string, type?: "success" | "error") => void;
}) {
  const isAdmin = role === "ADMIN";
  const isAdminOrSubadmin = role === "ADMIN" || role === "SUBADMIN";
  const [logs, setLogs] = useState<any[]>([]);
  const [filterDate, setFilterDate] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [fTarget, setFTarget] = useState("");
  const [fCheckItem, setFCheckItem] = useState("");
  const [fResult, setFResult] = useState("");
  const [fDeviation, setFDeviation] = useState("");
  const [fImprovement, setFImprovement] = useState("");
  const [fNote, setFNote] = useState("");
  const [saving, setSaving] = useState(false);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("foreign_matter_logs").select("*").eq("log_date", filterDate).order("created_at", { ascending: false });
    setLogs(data ?? []); setLoading(false);
  }, [filterDate]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  async function saveLog() {
    if (!fTarget || !fCheckItem) return showToast("점검 대상과 점검사항을 입력하세요.", "error");
    setSaving(true);
    const { error } = await supabase.from("foreign_matter_logs").insert({
      log_date: filterDate, target: fTarget.trim(), check_item: fCheckItem.trim(),
      result: fResult.trim() || null, deviation: fDeviation.trim() || null,
      improvement: fImprovement.trim() || null, note: fNote.trim() || null, created_by: userId,
    });
    setSaving(false);
    if (error) return showToast("저장 실패: " + error.message, "error");
    showToast("✅ 이물관리 기록 완료!"); setShowForm(false);
    setFTarget(""); setFCheckItem(""); setFResult(""); setFDeviation(""); setFImprovement(""); setFNote("");
    loadLogs();
  }

  async function approveLog(id: string) {
    await supabase.from("foreign_matter_logs").update({ approved_by: userId, approved_at: new Date().toISOString() }).eq("id", id);
    showToast("✅ 승인 완료!"); loadLogs();
  }

  return (
    <div className="space-y-4">
      <div className={`${card} p-4`}>
        <div className="flex flex-wrap gap-3 items-end">
          <div><div className="mb-1 text-xs text-slate-500">날짜</div>
            <input type="date" className={inp} style={{ width: 160 }} value={filterDate} onChange={(e) => setFilterDate(e.target.value)} /></div>
          <button className={btn} onClick={loadLogs}>🔄 조회</button>
          {isAdminOrSubadmin && <button className={showForm ? btnOn : "rounded-xl border border-blue-300 bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-700 hover:bg-blue-100"} onClick={() => setShowForm((v) => !v)}>{showForm ? "✕ 닫기" : "✚ 기록 등록"}</button>}
          <button className={btnSm} onClick={() => window.print()}>🖨️ 인쇄</button>
        </div>
      </div>
      {showForm && isAdminOrSubadmin && (
        <div className={`${card} p-4`}>
          <div className="mb-3 font-semibold text-sm text-blue-700">✚ 이물관리 점검 기록</div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {[["점검 대상 *", fTarget, setFTarget],["점검사항 *", fCheckItem, setFCheckItem],["점검결과", fResult, setFResult],["이탈사항", fDeviation, setFDeviation],["개선조치사항", fImprovement, setFImprovement],["비고", fNote, setFNote]].map(([label, value, set]) => (
              <div key={label as string}><div className="mb-1 text-xs text-slate-500">{label as string}</div>
                <input className={inp} value={value as string} onChange={(e) => (set as any)(e.target.value)} /></div>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <button className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60" disabled={saving} onClick={saveLog}>{saving ? "저장 중..." : "💾 등록"}</button>
            <button className={btn} onClick={() => setShowForm(false)}>취소</button>
          </div>
        </div>
      )}
      <div className={`${card} p-4`}>
        <div className="mb-3 font-semibold text-sm">🔍 이물관리 점검표 — {filterDate}</div>
        {loading ? <div className="py-4 text-center text-sm text-slate-400">불러오는 중...</div>
          : logs.length === 0 ? <div className="py-4 text-center text-sm text-slate-400">기록이 없습니다.</div>
          : <div className="overflow-x-auto"><table className="w-full text-sm border-collapse">
              <thead><tr className="border-b border-slate-200">{["점검 대상","점검사항","점검결과","이탈사항","개선조치","승인"].map((h) => <th key={h} className="text-left py-2 px-3 text-xs text-slate-500 font-semibold">{h}</th>)}</tr></thead>
              <tbody>{logs.map((log) => (
                <tr key={log.id} className={`border-b border-slate-100 hover:bg-slate-50 ${log.deviation ? "bg-amber-50" : ""}`}>
                  <td className="py-2 px-3 font-medium">{log.target}</td>
                  <td className="py-2 px-3 text-xs">{log.check_item}</td>
                  <td className="py-2 px-3 text-xs">{log.result ?? "—"}</td>
                  <td className="py-2 px-3 text-xs text-amber-700">{log.deviation ?? "—"}</td>
                  <td className="py-2 px-3 text-xs">{log.improvement ?? "—"}</td>
                  <td className="py-2 px-3">{!log.approved_by && isAdmin ? <button className="rounded-lg border border-green-300 bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-700" onClick={() => approveLog(log.id)}>✅ 승인</button> : log.approved_by ? <span className="text-[10px] text-green-600 font-semibold">승인완료</span> : "—"}</td>
                </tr>
              ))}</tbody>
            </table></div>}
      </div>
    </div>
  );
}

// ================================================================
// 일반위생관리 및 공정점검표
// tabs-hygiene.tsx 에서 기존 HygieneCheckTab 함수 전체를 이 코드로 교체
// (import, const supabase, const card/inp/btn 등 파일 상단 선언은 건드리지 말 것)
// ================================================================

// ── 이 파일 고유 유틸 (파일 상단 todayKST와 별도로 내부에서만 사용) ──
function hygieneYearMonthOf(dateStr: string) { return dateStr.slice(0, 7); }

function hygieneDaysInMonth(ym: string): number {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}
function hygieneBuildDates(ym: string): string[] {
  const count = hygieneDaysInMonth(ym);
  return Array.from({ length: count }, (_, i) =>
    `${ym}-${String(i + 1).padStart(2, "0")}`
  );
}

// ── Types ──
type HygieneCheckItem = { id: string; category: string; item_text: string; order_no: number };
type HygieneCheckLog  = { log_date: string; item_id: string; result: boolean };
type HygieneCheckNote = {
  id: string; year_month: string; note_type: string;
  content: string; action_by: string | null; confirmed_by: string | null; order_no: number;
};
type HygieneSignature = {
  year_month: string;
  inspector_id: string | null; inspector_name: string;
  approved_by_id: string | null; approved_by_name: string;
};

const HYGIENE_SIGN_MAP: Record<string, string> = {
  "조은미": "/sign-choem.png",
  "강미라": "/sign-kangml.png",
  "나현우": "/sign-nahw.png",
  "나미영": "/sign-namiy.png",
  "조대성": "/sign-chods.png",
  "김영각": "/sign-kimyg.png",
  "고한결": "/sign-gohg.png",
};

// ── 인쇄용 style 객체 ──
const hTdP: React.CSSProperties = { border:"1px solid #000", padding:"1px 2px", verticalAlign:"middle" };
const hThP: React.CSSProperties = { border:"1px solid #000", padding:"1px 2px", background:"#f0f0f0", fontWeight:"bold", verticalAlign:"middle" };

// ================================================================
export function HygieneCheckTab({ role, userId, showToast }: {
  role: UserRole; userId: string | null;
  showToast: (msg: string, type?: "success" | "error") => void;
}) {
  const isAdminOrSubadmin = role === "ADMIN" || role === "SUBADMIN";
  const today = todayKST();
  const currentYM = hygieneYearMonthOf(today);

  const [yearMonth, setYearMonth] = React.useState(currentYM);
  const [items, setItems]   = React.useState<HygieneCheckItem[]>([]);
  const [logs, setLogs]     = React.useState<HygieneCheckLog[]>([]);
  const [notes, setNotes]   = React.useState<HygieneCheckNote[]>([]);
  const [sig, setSig]       = React.useState<HygieneSignature | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving]   = React.useState(false);

  // PIN 인증
  const [employees, setEmployees] = React.useState<{ id: string; name: string; pin: string | null }[]>([]);
  const [inspector, setInspector] = React.useState<{ id: string; name: string } | null>(null);
  const [showPin, setShowPin]     = React.useState(false);
  const [pinTarget, setPinTarget] = React.useState<{ id: string; name: string; pin: string | null } | null>(null);
  const [pinInput, setPinInput]   = React.useState("");
  const [pinError, setPinError]   = React.useState("");

  // 특이사항/개선조치 폼
  const [showNoteForm, setShowNoteForm] = React.useState(false);
  const [noteType, setNoteType]         = React.useState<"special" | "action">("special");
  const [noteContent, setNoteContent]   = React.useState("");
  const [noteActionBy, setNoteActionBy]         = React.useState("");
  const [noteConfirmedBy, setNoteConfirmedBy]   = React.useState("");
  const [noteSaving, setNoteSaving] = React.useState(false);

  // 미저장 버퍼  key: `${log_date}__${item_id}`
  const [pending, setPending] = React.useState<Record<string, boolean>>({});

  const dates = hygieneBuildDates(yearMonth);
  const isCurrentMonth = yearMonth === currentYM;

  // ── 데이터 로드 ──
  React.useEffect(() => {
    supabase.from("employees").select("id,name,pin").is("resign_date", null).order("name")
      .then(({ data }) => setEmployees((data ?? []) as any));
  }, []);

  const loadData = React.useCallback(async () => {
    setLoading(true);
    setPending({});
    const dayCount = hygieneDaysInMonth(yearMonth);
    const [itemRes, logRes, noteRes, sigRes] = await Promise.all([
      supabase.from("hygiene_check_items").select("id,category,item_text,order_no")
        .eq("is_active", true).order("order_no"),
      supabase.from("hygiene_check_logs").select("log_date,item_id,result")
        .gte("log_date", `${yearMonth}-01`)
        .lte("log_date", `${yearMonth}-${String(dayCount).padStart(2, "0")}`),
      supabase.from("hygiene_check_notes").select("*")
        .eq("year_month", yearMonth).order("order_no"),
      supabase.from("hygiene_check_signatures").select("*")
        .eq("year_month", yearMonth).maybeSingle(),
    ]);
    setItems((itemRes.data ?? []) as HygieneCheckItem[]);
    setLogs((logRes.data ?? []) as HygieneCheckLog[]);
    setNotes((noteRes.data ?? []) as HygieneCheckNote[]);
    setSig(sigRes.data as HygieneSignature ?? null);
    setLoading(false);
  }, [yearMonth]);

  React.useEffect(() => { loadData(); }, [loadData]);

  // ── 결과 조회 ──
  function getResult(date: string, itemId: string): boolean | null {
    const key = `${date}__${itemId}`;
    if (key in pending) return pending[key];
    const log = logs.find((l) => l.log_date === date && l.item_id === itemId);
    return log ? log.result : null;
  }

  // ── 셀 토글 ──
  function toggleCell(date: string, itemId: string) {
    const canEdit = isAdminOrSubadmin || (isCurrentMonth && date === today && inspector !== null);
    if (!canEdit) return;
    const key = `${date}__${itemId}`;
    const cur = getResult(date, itemId);
    setPending((prev) => ({ ...prev, [key]: cur === null ? true : !cur }));
  }

  // ── 저장 ──
  async function saveAll() {
    if (Object.keys(pending).length === 0) return showToast("변경 사항이 없습니다.", "error");
    setSaving(true);
    const upserts = Object.entries(pending).map(([key, result]) => {
      const [log_date, item_id] = key.split("__");
      return { log_date, item_id, result };
    });
    const { error } = await supabase.from("hygiene_check_logs")
      .upsert(upserts, { onConflict: "log_date,item_id" });
    if (error) { setSaving(false); return showToast("저장 실패: " + error.message, "error"); }

    // 서명 저장
    if (isCurrentMonth && inspector) {
      await supabase.from("hygiene_check_signatures").upsert({
        year_month: yearMonth,
        inspector_id: inspector.id,
        inspector_name: inspector.name,
        approved_by_id: userId,
        approved_by_name: "조대성",
      }, { onConflict: "year_month" });
    }
    setSaving(false);
    showToast("✅ 저장 완료!");
    await loadData();
  }

  // ── PIN 인증 ──
  function openPin(emp: { id: string; name: string; pin: string | null }) {
    if (isAdminOrSubadmin) { setInspector({ id: emp.id, name: emp.name }); return; }
    setPinTarget(emp);
    setPinInput(""); setPinError(""); setShowPin(true);
  }
  function handlePinDigit(d: string) {
    if (pinInput.length >= 4) return;
    const next = pinInput + d;
    setPinInput(next);
    if (next.length === 4) setTimeout(() => verifyPin(next), 100);
  }
  function verifyPin(pin: string) {
    if (!pinTarget) return;
    if (!pinTarget.pin) { setPinError("PIN이 설정되지 않았습니다."); setPinInput(""); return; }
    if (pinTarget.pin !== pin) { setPinError("PIN이 올바르지 않습니다."); setPinInput(""); return; }
    setInspector({ id: pinTarget.id, name: pinTarget.name });
    setShowPin(false); setPinError("");
  }

  // ── 특이사항 저장 ──
  async function saveNote() {
    if (!noteContent.trim()) return showToast("내용을 입력하세요.", "error");
    setNoteSaving(true);
    const maxOrder = Math.max(0, ...notes.filter((n) => n.note_type === noteType).map((n) => n.order_no));
    const { error } = await supabase.from("hygiene_check_notes").insert({
      year_month: yearMonth, note_type: noteType, content: noteContent.trim(),
      action_by: noteActionBy.trim() || null,
      confirmed_by: noteConfirmedBy.trim() || null,
      order_no: maxOrder + 10,
    });
    setNoteSaving(false);
    if (error) return showToast("저장 실패: " + error.message, "error");
    showToast("✅ 저장 완료!");
    setNoteContent(""); setNoteActionBy(""); setNoteConfirmedBy(""); setShowNoteForm(false);
    await loadData();
  }
  async function deleteNote(id: string) {
    if (!confirm("삭제하시겠습니까?")) return;
    const { error } = await supabase.from("hygiene_check_notes").delete().eq("id", id);
    if (error) return showToast("삭제 실패: " + error.message, "error");
    showToast("🗑️ 삭제 완료!"); await loadData();
  }

  // ── 통계 ──
  const allResults = [
    ...logs,
    ...Object.entries(pending).map(([key, result]) => {
      const [log_date, item_id] = key.split("__");
      return { log_date, item_id, result };
    }),
  ];
  const filledCells = allResults.length;
  const xCount = allResults.filter((l) => l.result === false).length;
  const pendingCount = Object.keys(pending).length;

  // ── 카테고리 그룹 ──
  const hygieneCategories = [...new Set(items.map((i) => i.category))];
  function itemsOf(cat: string) { return items.filter((i) => i.category === cat); }
  function dayOfDate(d: string) { return parseInt(d.slice(8)); }
  function dowOfDate(d: string) {
    const dow = new Date(d + "T00:00:00+09:00").getDay();
    return ["일","월","화","수","목","금","토"][dow];
  }

  // ── 인쇄 ──
  function handlePrint() {
    const el = document.getElementById("hygiene-check-print-inner");
    if (!el) return;
    const [y, m] = yearMonth.split("-").map(Number);
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head>
      <meta charset="utf-8"><title>일반위생관리및공정점검표_${y}년${m}월</title>
      <style>
        @page { size: A4 landscape; margin: 6mm 8mm; }
        body { margin:0; font-family:'Malgun Gothic','맑은 고딕',sans-serif; font-size:7pt; color:#000; }
        * { box-sizing:border-box; -webkit-print-color-adjust:exact!important; print-color-adjust:exact!important; }
        table { border-collapse:collapse; }
        img { max-width:none; }
      </style>
    </head><body>${el.innerHTML}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 500);
  }

  const specialNotes = notes.filter((n) => n.note_type === "special");
  const actionNotes  = notes.filter((n) => n.note_type === "action");
  const sigInspectorSrc = sig?.inspector_name ? HYGIENE_SIGN_MAP[sig.inspector_name] ?? null : null;
  const sigApprovedSrc  = sig?.approved_by_name ? HYGIENE_SIGN_MAP[sig.approved_by_name] ?? null : null;
  const printDates = hygieneBuildDates(yearMonth);

  return (
    <div className="space-y-4">

      {/* ── 상단 컨트롤 ── */}
      <div className={`${card} p-4`}>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <div className="mb-1 text-xs text-slate-500">점검 월</div>
            <input type="month" className={inp} style={{ width: 160 }} value={yearMonth}
              onChange={(e) => { setYearMonth(e.target.value); setInspector(null); }} />
          </div>
          <button className={btn} onClick={loadData}>🔄 새로고침</button>
          <button className={btnSm} onClick={handlePrint}>🖨️ 인쇄</button>
          {pendingCount > 0 && (
            <button className={btnOn} disabled={saving} onClick={saveAll}>
              {saving ? "저장 중..." : `💾 저장 (${pendingCount}건 변경)`}
            </button>
          )}
          <div className="ml-auto flex gap-3 text-xs text-slate-500">
            <span>입력 <b>{filledCells}</b>칸</span>
            {xCount > 0 && <span className="text-red-600 font-semibold">⚠ X 발생 <b>{xCount}</b>건</span>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[200px_1fr]">

        {/* 좌: PIN 패널 */}
        <div className="space-y-3">
          <div className={`${card} p-4`}>
            <div className="mb-3 font-semibold text-sm">점검자 인증</div>
            {inspector ? (
              <div>
                <div className="rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm font-semibold text-green-700 mb-2">
                  ✅ {inspector.name}
                </div>
                <button className="w-full rounded-xl border border-slate-200 bg-white py-1.5 text-xs text-slate-500 hover:bg-slate-50"
                  onClick={() => setInspector(null)}>변경</button>
              </div>
            ) : (
              <div className="space-y-1.5">
                {employees.map((emp) => (
                  <button key={emp.id}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-sm font-medium hover:bg-blue-50 hover:border-blue-300 transition-all"
                    onClick={() => openPin(emp)}>
                    👤 {emp.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* PIN 입력 */}
          {showPin && pinTarget && (
            <div className={`${card} p-4`}>
              <div className="text-sm font-semibold text-center mb-1">{pinTarget.name}</div>
              <div className="text-xs text-slate-500 text-center mb-3">PIN 4자리 입력</div>
              <div className="flex justify-center gap-2 mb-3">
                {[0,1,2,3].map((i) => (
                  <div key={i} className={`w-9 h-9 rounded-xl border-2 flex items-center justify-center font-bold transition-all
                    ${pinInput.length > i ? "border-blue-400 bg-blue-50 text-blue-700" : "border-slate-200 bg-slate-50 text-slate-300"}`}>
                    {pinInput.length > i ? "●" : "○"}
                  </div>
                ))}
              </div>
              {pinError && <div className="text-center text-xs text-red-500 mb-2">{pinError}</div>}
              <div className="grid grid-cols-3 gap-1.5">
                {["1","2","3","4","5","6","7","8","9","","0","⌫"].map((d, i) => (
                  <button key={i}
                    className={`rounded-xl border py-2.5 text-base font-semibold transition-all
                      ${d === "" ? "invisible" : "border-slate-200 bg-white hover:bg-slate-50 active:scale-95"}`}
                    onClick={() => {
                      if (d === "⌫") { setPinInput((p) => p.slice(0,-1)); setPinError(""); }
                      else if (d) handlePinDigit(d);
                    }}>{d}</button>
                ))}
              </div>
              <button className="mt-2 w-full text-xs text-slate-400 hover:text-slate-600"
                onClick={() => { setShowPin(false); setPinInput(""); setPinError(""); }}>취소</button>
            </div>
          )}

          {/* 현황 */}
          <div className={`${card} p-4`}>
            <div className="mb-3 font-semibold text-sm">이달 현황</div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-center">
                <div className="text-xs text-slate-500 mb-1">O 적합</div>
                <div className="text-xl font-bold text-green-700">{filledCells - xCount}</div>
              </div>
              <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-center">
                <div className="text-xs text-red-600 mb-1">X 부적합</div>
                <div className="text-xl font-bold text-red-700">{xCount}</div>
              </div>
            </div>
            {pendingCount > 0 && (
              <div className="mt-2 text-xs text-amber-600 font-semibold text-center">미저장 {pendingCount}건</div>
            )}
          </div>
        </div>

        {/* 우: 점검 그리드 */}
        <div className={`${card} p-0 overflow-hidden`}>
          {loading ? (
            <div className="py-12 text-center text-sm text-slate-400">불러오는 중...</div>
          ) : (
            <div className="overflow-x-auto" style={{ maxHeight: "calc(100vh - 220px)" }}>
              <table className="text-xs border-collapse" style={{ minWidth: 900 }}>
                <thead style={{ position: "sticky", top: 0, zIndex: 10 }}>
                  <tr>
                    <th style={{ width:32, background:"#f8fafc", border:"0.5px solid #e2e8f0", padding:"4px 2px", textAlign:"center", fontSize:10 }}>분류</th>
                    <th style={{ minWidth:200, background:"#f8fafc", border:"0.5px solid #e2e8f0", padding:"4px 6px", textAlign:"left", fontSize:10 }}>점검 사항</th>
                    {dates.map((d) => {
                      const isToday = d === today;
                      const dow = dowOfDate(d);
                      const isSun = dow === "일"; const isSat = dow === "토";
                      return (
                        <th key={d} style={{
                          width:26, minWidth:26,
                          background: isToday ? "#dbeafe" : isSun ? "#fef2f2" : isSat ? "#eff6ff" : "#f8fafc",
                          border:"0.5px solid #e2e8f0", padding:"2px 1px", textAlign:"center",
                          fontSize:9, fontWeight: isToday ? 700 : 400,
                          color: isToday ? "#1e40af" : isSun ? "#b91c1c" : isSat ? "#1d4ed8" : "#64748b",
                        }}>
                          <div>{dayOfDate(d)}</div>
                          <div style={{ fontSize:8 }}>{dow}</div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {hygieneCategories.map((cat) => {
                    const catItems = itemsOf(cat);
                    return catItems.map((item, idx) => (
                      <tr key={item.id} className="hover:bg-slate-50/50">
                        {idx === 0 && (
                          <td rowSpan={catItems.length} style={{
                            border:"0.5px solid #e2e8f0", textAlign:"center",
                            fontSize:10, fontWeight:500, color:"#475569",
                            writingMode:"vertical-rl" as any, background:"#f8fafc", padding:"4px 2px",
                          }}>{cat}</td>
                        )}
                        <td style={{
                          border:"0.5px solid #e2e8f0", padding:"3px 6px",
                          fontSize:10, lineHeight:1.3, color:"#334155",
                          maxWidth:220, whiteSpace:"normal",
                        }}>{item.item_text}</td>
                        {dates.map((d) => {
                          const result = getResult(d, item.id);
                          const isToday = d === today;
                          const key = `${d}__${item.id}`;
                          const isPending = key in pending;
                          const canEdit = isAdminOrSubadmin || (isCurrentMonth && d === today && inspector !== null);
                          return (
                            <td key={d} onClick={() => toggleCell(d, item.id)} style={{
                              border:"0.5px solid #e2e8f0", textAlign:"center",
                              cursor: canEdit ? "pointer" : "default",
                              background: result === false ? "#fef2f2" : isToday ? "#eff6ff" : isPending ? "#fefce8" : "white",
                              fontSize:11, fontWeight:500,
                            }}>
                              {result === null
                                ? <span style={{ color:"#cbd5e1" }}>·</span>
                                : result
                                  ? <span style={{ color:"#16a34a" }}>O</span>
                                  : <span style={{ color:"#dc2626" }}>X</span>}
                            </td>
                          );
                        })}
                      </tr>
                    ));
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── 특이사항 / 개선조치 ── */}
      <div className={`${card} p-4`}>
        <div className="flex items-center justify-between mb-3">
          <div className="font-semibold text-sm">특이사항 · 개선조치</div>
          {isAdminOrSubadmin && (
            <button
              className={showNoteForm
                ? "rounded-xl border border-red-300 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-100"
                : "rounded-xl border border-blue-300 bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-700 hover:bg-blue-100"}
              onClick={() => setShowNoteForm((v) => !v)}>
              {showNoteForm ? "✕ 닫기" : "✚ 추가"}
            </button>
          )}
        </div>
        {showNoteForm && isAdminOrSubadmin && (
          <div className="mb-4 rounded-xl border border-blue-100 bg-blue-50 p-4 space-y-3">
            <div className="flex gap-2">
              {([["special","특이사항"], ["action","개선조치"]] as const).map(([v, label]) => (
                <button key={v}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all ${noteType === v
                    ? "border-blue-400 bg-blue-600 text-white"
                    : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"}`}
                  onClick={() => setNoteType(v)}>{label}</button>
              ))}
            </div>
            <div>
              <div className="mb-1 text-xs text-slate-500">내용 *</div>
              <textarea className={`${inp} resize-none`} rows={2}
                value={noteContent} onChange={(e) => setNoteContent(e.target.value)}
                placeholder={noteType === "special" ? "특이사항 내용" : "개선조치 내용"} />
            </div>
            {noteType === "action" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="mb-1 text-xs text-slate-500">조치자</div>
                  <input className={inp} value={noteActionBy} onChange={(e) => setNoteActionBy(e.target.value)} />
                </div>
                <div>
                  <div className="mb-1 text-xs text-slate-500">확인</div>
                  <input className={inp} value={noteConfirmedBy} onChange={(e) => setNoteConfirmedBy(e.target.value)} />
                </div>
              </div>
            )}
            <div className="flex gap-2">
              <button className="flex-1 rounded-xl bg-blue-600 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60"
                disabled={noteSaving} onClick={saveNote}>{noteSaving ? "저장 중..." : "💾 저장"}</button>
              <button className={btn} onClick={() => setShowNoteForm(false)}>취소</button>
            </div>
          </div>
        )}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <div className="mb-2 text-xs font-semibold text-slate-500">특이사항</div>
            {specialNotes.length === 0
              ? <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-3 text-xs text-slate-400">없음</div>
              : specialNotes.map((n) => (
                <div key={n.id} className="mb-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div>{n.content}</div>
                    {isAdminOrSubadmin && (
                      <button className="shrink-0 text-[10px] text-slate-300 hover:text-red-500" onClick={() => deleteNote(n.id)}>✕</button>
                    )}
                  </div>
                </div>
              ))}
          </div>
          <div>
            <div className="mb-2 text-xs font-semibold text-slate-500">개선조치 및 결과</div>
            {actionNotes.length === 0
              ? <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-3 text-xs text-slate-400">없음</div>
              : actionNotes.map((n) => (
                <div key={n.id} className="mb-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div>{n.content}</div>
                      <div className="mt-1 flex gap-3 text-[11px] text-slate-400">
                        {n.action_by && <span>조치자: {n.action_by}</span>}
                        {n.confirmed_by && <span>확인: {n.confirmed_by}</span>}
                      </div>
                    </div>
                    {isAdminOrSubadmin && (
                      <button className="shrink-0 text-[10px] text-slate-300 hover:text-red-500" onClick={() => deleteNote(n.id)}>✕</button>
                    )}
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* ── 인쇄 전용 숨김 영역 ── */}
      <style>{`#hygiene-check-print-inner { display: none; }`}</style>
      <div id="hygiene-check-print-inner">
        {(() => {
          const [y, m] = yearMonth.split("-").map(Number);
          const dayCount = hygieneDaysInMonth(yearMonth);
          return (
            <div style={{ fontFamily:"'Malgun Gothic','맑은 고딕',sans-serif", fontSize:"7pt", color:"#000" }}>
              {/* 제목 + 결재란 */}
              <table style={{ width:"100%", borderCollapse:"collapse", marginBottom:4 }}>
                <tbody>
                  <tr>
                    <td rowSpan={2} style={{ ...hTdP, width:120, fontWeight:"bold", fontSize:"10pt", textAlign:"center", padding:"6px 8px" }}>
                      일반위생관리 및<br/>공정점검표
                    </td>
                    <td style={{ ...hTdP, width:60, textAlign:"center", fontSize:"7pt" }}>점검 기간</td>
                    <td style={{ ...hTdP, fontSize:"7pt" }}>{y}년 {m}월 1일 ～ {m}월 {dayCount}일</td>
                    <td style={{ ...hTdP, width:32, fontWeight:"bold", textAlign:"center", fontSize:"7pt" }} rowSpan={2}>결재란</td>
                    <td style={{ ...hTdP, width:72, textAlign:"center", fontWeight:"bold", fontSize:"7pt" }}>점검자</td>
                    <td style={{ ...hTdP, width:72, textAlign:"center", fontWeight:"bold", fontSize:"7pt" }}>승인</td>
                  </tr>
                  <tr>
                    <td style={{ ...hTdP, textAlign:"center", fontSize:"7pt" }}>범례</td>
                    <td style={{ ...hTdP, fontSize:"7pt" }}>예: O,  아니오: X</td>
                    <td style={{ ...hTdP, textAlign:"center", padding:"3px" }}>
                      {sigInspectorSrc
                        ? <><img src={sigInspectorSrc} style={{ height:24, display:"block", margin:"0 auto" }} alt="" /><div style={{ fontSize:"6pt", marginTop:1 }}>{sig?.inspector_name}</div></>
                        : <div style={{ fontSize:"6pt", color:"#aaa" }}>{sig?.inspector_name ?? ""}</div>}
                    </td>
                    <td style={{ ...hTdP, textAlign:"center", padding:"3px" }}>
                      {sigApprovedSrc
                        ? <><img src={sigApprovedSrc} style={{ height:24, display:"block", margin:"0 auto" }} alt="" /><div style={{ fontSize:"6pt", marginTop:1 }}>{sig?.approved_by_name}</div></>
                        : <div style={{ fontSize:"6pt", color:"#aaa" }}>{sig?.approved_by_name ?? ""}</div>}
                    </td>
                  </tr>
                </tbody>
              </table>
              {/* 점검 그리드 */}
              <table style={{ width:"100%", borderCollapse:"collapse", tableLayout:"fixed", marginBottom:4 }}>
                <colgroup>
                  <col style={{ width:"20px" }} />
                  <col style={{ width:"140px" }} />
                  {printDates.map((d) => <col key={d} />)}
                </colgroup>
                <thead>
                  <tr>
                    <th style={{ ...hThP, textAlign:"center", fontSize:"6pt" }}>분류</th>
                    <th style={{ ...hThP, textAlign:"left", fontSize:"6pt" }}>점검 사항</th>
                    {printDates.map((d) => {
                      const dow = new Date(d + "T00:00:00+09:00").getDay();
                      const isSun = dow === 0; const isSat = dow === 6;
                      return (
                        <th key={d} style={{ ...hThP, textAlign:"center", fontSize:"5.5pt", padding:"1px",
                          color: isSun ? "#b91c1c" : isSat ? "#1d4ed8" : "#000" }}>
                          {dayOfDate(d)}<br/>{["일","월","화","수","목","금","토"][dow]}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {hygieneCategories.map((cat) =>
                    itemsOf(cat).map((item, idx) => (
                      <tr key={item.id}>
                        {idx === 0 && (
                          <td rowSpan={itemsOf(cat).length} style={{
                            ...hTdP, textAlign:"center", fontWeight:"bold", fontSize:"6.5pt",
                            writingMode:"vertical-rl" as any, background:"#f8f8f8",
                          }}>{cat}</td>
                        )}
                        <td style={{ ...hTdP, fontSize:"6pt", lineHeight:1.2, padding:"1px 3px" }}>{item.item_text}</td>
                        {printDates.map((d) => {
                          const r = getResult(d, item.id);
                          return (
                            <td key={d} style={{ ...hTdP, textAlign:"center", fontSize:"7pt", fontWeight:"bold",
                              color: r === false ? "red" : r === true ? "#000" : "#ddd",
                              background: r === false ? "#fff0f0" : "white", padding:"1px" }}>
                              {r === null ? "·" : r ? "O" : "X"}
                            </td>
                          );
                        })}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              {/* 특이사항 */}
              <table style={{ width:"100%", borderCollapse:"collapse", marginBottom:2 }}>
                <tbody>
                  <tr>
                    <td style={{ ...hTdP, width:60, fontWeight:"bold", fontSize:"6.5pt", whiteSpace:"nowrap" }}>특이사항</td>
                    <td style={{ ...hTdP, fontSize:"6.5pt", padding:"3px 6px", lineHeight:1.6 }}>
                      {specialNotes.map((n, i) => <span key={n.id}>{i > 0 ? " / " : ""}{n.content}</span>)}
                    </td>
                  </tr>
                </tbody>
              </table>
              {/* 개선조치 */}
              <table style={{ width:"100%", borderCollapse:"collapse" }}>
                <thead>
                  <tr>
                    <th style={{ ...hThP, width:140, fontSize:"6.5pt" }}>개선조치 및 결과</th>
                    <th style={{ ...hThP, fontSize:"6.5pt" }}>내용</th>
                    <th style={{ ...hThP, width:60, fontSize:"6.5pt" }}>조치자</th>
                    <th style={{ ...hThP, width:60, fontSize:"6.5pt" }}>확인</th>
                  </tr>
                </thead>
                <tbody>
                  {actionNotes.length === 0
                    ? <tr><td colSpan={4} style={{ ...hTdP, height:24 }}></td></tr>
                    : actionNotes.map((n) => (
                      <tr key={n.id}>
                        <td style={{ ...hTdP, fontSize:"6.5pt" }}></td>
                        <td style={{ ...hTdP, fontSize:"6.5pt", padding:"2px 6px" }}>{n.content}</td>
                        <td style={{ ...hTdP, fontSize:"6.5pt", textAlign:"center" }}>{n.action_by ?? ""}</td>
                        <td style={{ ...hTdP, fontSize:"6.5pt", textAlign:"center" }}>{n.confirmed_by ?? ""}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          );
        })()}
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════
// 6. 중요지점 온·습도 관리일지
// ═══════════════════════════════════════════════════════════

// ─── 타입 ────────────────────────────────────────────────────
type HumidPeriod = "AM" | "PM";
type HumidRoom = "외포장실" | "원부재료실" | "생산실";

type HumidLogEntry = {
  id?: string;
  log_date: string;
  period: HumidPeriod;
  check_time: string | null;
  room: HumidRoom;
  temperature: number | null;
  humidity: number | null;
  note: string;
  inspector_id: string | null;
  inspector_name: string | null;
};

const HUMID_ROOMS: HumidRoom[] = ["외포장실", "원부재료실", "생산실"];

function todayKST(): string {
  const d = new Date(new Date().toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getHumidDates(from: string, to: string): string[] {
  const dates: string[] = [];
  const cur = new Date(from + "T00:00:00+09:00");
  const end = new Date(to + "T00:00:00+09:00");
  while (cur <= end) {
    const kst = new Date(cur.getTime() + 9 * 60 * 60 * 1000);
    dates.push(kst.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

const HUMID_DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
function getHumidDayLabel(d: string) {
  return HUMID_DAY_LABELS[new Date(d + "T00:00:00+09:00").getDay()];
}

function HumidCheckTimeInput({ value, onChange, placeholder, disabled }: {
  value: string; onChange: (v: string) => void; placeholder: string; disabled: boolean;
}) {
  return (
    <div className="relative w-24">
      <input
        type="text" inputMode="numeric" maxLength={4} placeholder={placeholder}
        value={value} disabled={disabled}
        onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, "").slice(0, 4))}
        className="w-24 rounded-xl border px-2 py-1.5 text-sm text-center tabular-nums focus:outline-none focus:border-blue-400"
        style={{ opacity: value.length === 4 ? 0 : 1, position: "relative", zIndex: 1 }}
      />
      {value.length === 4 && (
        <div
          className="absolute inset-0 flex items-center justify-center text-sm font-semibold tabular-nums text-blue-700 rounded-xl cursor-text"
          style={{ border: "1px solid #93c5fd", background: "#eff6ff", zIndex: 2 }}
          onClick={() => onChange(value.slice(0, 3))}
        >
          {value.slice(0, 2)}:{value.slice(2, 4)}
        </div>
      )}
    </div>
  );
}

function TempInput({ value, onChange, disabled }: {
  value: number | null;
  onChange: (v: number | null) => void;
  disabled: boolean;
}) {
  const [raw, setRaw] = useState("");

  function handleInput(input: string) {
    const digits = input.replace(/[^\d]/g, "").slice(0, 3);
    setRaw(digits);
    if (digits.length === 3) {
      const parsed = parseFloat(digits.slice(0, 2) + "." + digits.slice(2));
      onChange(parsed);
      setRaw("");
    } else if (digits === "") {
      onChange(null);
    }
  }

  return (
    <div className="relative w-28">
      <input
        type="text"
        inputMode="numeric"
        maxLength={3}
        placeholder="—"
        value={raw}
        disabled={disabled}
        onChange={(e) => handleInput(e.target.value)}
        className="w-28 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-center tabular-nums focus:border-blue-400 focus:outline-none disabled:bg-slate-50 disabled:text-slate-400"
        style={{ opacity: value !== null && raw === "" ? 0 : 1, position: "relative", zIndex: 1 }}
      />
      {value !== null && raw === "" && (
        <div
          className="absolute inset-0 flex items-center justify-center text-sm font-semibold tabular-nums text-blue-700 rounded-xl cursor-text"
          style={{ border: "1px solid #93c5fd", background: "#eff6ff", zIndex: 2 }}
          onClick={() => !disabled && setRaw(String(Math.round(value * 10)))}
        >
          {value.toFixed(1)}°C
        </div>
      )}
    </div>
  );
}

export function TempHumidityTab({ role, userId, showToast }: {
  role: UserRole; userId: string | null;
  showToast: (msg: string, type?: "success" | "error") => void;
}) {
  const [logDate, setLogDate] = useState(todayKST());
  const [period, setPeriod] = useState<HumidPeriod>("AM");
  const [entries, setEntries] = useState<Record<HumidRoom, HumidLogEntry>>({} as Record<HumidRoom, HumidLogEntry>);
  const [employees, setEmployees] = useState<{ id: string; name: string; pin: string | null }[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState<"input" | "query">("input");

  const { login: pinLogin } = usePinSession();
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinTarget, setPinTarget] = useState<HumidPeriod>("AM");
  const [amInspector, setAmInspector] = useState<{ id: string; name: string } | null>(null);
  const [pmInspector, setPmInspector] = useState<{ id: string; name: string } | null>(null);
  const [amCheckTime, setAmCheckTime] = useState("");
  const [pmCheckTime, setPmCheckTime] = useState("");

  const currentInspector = period === "AM" ? amInspector : pmInspector;

  useEffect(() => {
    supabase.from("employees").select("id,name,pin").is("resign_date", null).order("name")
      .then(({ data }) => { if (data) setEmployees(data as any[]); });
  }, []);

  const initEntries = useCallback((): Record<HumidRoom, HumidLogEntry> => {
    const map = {} as Record<HumidRoom, HumidLogEntry>;
    for (const room of HUMID_ROOMS) {
      map[room] = { log_date: logDate, period, check_time: null, room, temperature: null, humidity: null, note: "", inspector_id: null, inspector_name: null };
    }
    return map;
  }, [logDate, period]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: logs } = await supabase.from("humidity_temp_logs").select("*").eq("log_date", logDate).eq("period", period);
      const { data: sigs } = await supabase.from("fridge_monitoring_signatures").select("*").eq("log_date", logDate).in("period", ["AM", "PM"]).eq("role", "humidity_inspector");
      const base = initEntries();
      if (logs && logs.length > 0) {
        for (const log of logs) {
          if (base[log.room as HumidRoom]) base[log.room as HumidRoom] = { ...base[log.room as HumidRoom], ...log };
        }
      }
      setEntries(base);
      for (const sig of sigs ?? []) {
        if (sig.period === "AM" && sig.inspector_id && sig.inspector_name) setAmInspector({ id: sig.inspector_id, name: sig.inspector_name });
        if (sig.period === "PM" && sig.inspector_id && sig.inspector_name) setPmInspector({ id: sig.inspector_id, name: sig.inspector_name });
      }
      if (logs && logs.length > 0) {
        const amLog = logs.find((l: any) => l.period === "AM" && l.check_time);
        const pmLog = logs.find((l: any) => l.period === "PM" && l.check_time);
        if (amLog?.check_time) setAmCheckTime(amLog.check_time.replace(":", ""));
        if (pmLog?.check_time) setPmCheckTime(pmLog.check_time.replace(":", ""));
      }
    } finally {
      setLoading(false);
    }
  }, [logDate, period, initEntries]);

  useEffect(() => { loadData(); }, [loadData]);

  function handleChange(room: HumidRoom, field: "temperature" | "humidity" | "note", value: string) {
    if (field === "temperature") {
      const digits = value.replace(/[^\d]/g, "").slice(0, 3);
      if (digits.length === 3) {
        const parsed = parseFloat(digits.slice(0, 2) + "." + digits.slice(2));
        setEntries((prev) => ({ ...prev, [room]: { ...prev[room], temperature: parsed } }));
      } else {
        setEntries((prev) => ({ ...prev, [room]: { ...prev[room], temperature: digits === "" ? null : parseFloat(digits) } }));
      }
      return;
    }
    setEntries((prev) => ({
      ...prev,
      [room]: {
        ...prev[room],
        [field]: field === "humidity" ? (value === "" ? null : parseInt(value, 10)) : value,
      },
    }));
  }

  async function handleSave() {
    if (!currentInspector) { setPinTarget(period); setShowPinModal(true); return; }
    const currentCheckTime = period === "AM" ? amCheckTime : pmCheckTime;
    if (currentCheckTime.length < 4) {
      showToast(`⚠ ${period === "AM" ? "오전" : "오후"} 점검시각을 입력해주세요. (예: 0900)`, "error");
      return;
    }
    if (HUMID_ROOMS.some((r) => entries[r].temperature === null || entries[r].humidity === null)) {
      showToast("⚠ 모든 구역의 온도·습도를 입력해주세요.", "error");
      return;
    }
    setSaving(true);
    try {
      const checkTimeStr = `${currentCheckTime.slice(0, 2)}:${currentCheckTime.slice(2, 4)}`;
      const toSave = HUMID_ROOMS.map((room) => ({
        ...entries[room], log_date: logDate, period, check_time: checkTimeStr,
        inspector_id: currentInspector.id, inspector_name: currentInspector.name,
        note: entries[room].note.trim() || null,
      }));
      const { error } = await supabase.from("humidity_temp_logs").upsert(toSave, { onConflict: "log_date,period,room" });
      if (error) throw error;
      const { error: sigError } = await supabase.from("fridge_monitoring_signatures").upsert(
        { log_date: logDate, period, role: "humidity_inspector", inspector_id: currentInspector.id, inspector_name: currentInspector.name, signature_data: null },
        { onConflict: "log_date,period,role" }
      );
      if (sigError) console.error("서명 저장 오류:", sigError.message);
      showToast("✅ 저장 완료!");
      await loadData();
    } catch (e: any) {
      showToast("저장 실패: " + e.message, "error");
    } finally {
      setSaving(false);
    }
  }

  const isReadOnly = logDate !== todayKST();

  return (
    <div className="space-y-4">
      {showPinModal && (
        <PinModal
          employees={employees.filter((e) => e.name !== null) as any}
          title={`${pinTarget === "AM" ? "오전" : "오후"} 점검자 확인`}
          onSuccess={(empId, empName) => {
            pinLogin(empId, empName);
            if (pinTarget === "AM") setAmInspector({ id: empId, name: empName });
            else setPmInspector({ id: empId, name: empName });
            setShowPinModal(false);
          }}
          onCancel={() => setShowPinModal(false)}
        />
      )}

      {/* 헤더 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-base font-bold text-slate-800">🌡️ 중요지점 온·습도 관리일지</div>
          <div className="text-xs text-slate-500 mt-0.5">외포장실 · 원부재료실 · 생산실 · 2회/일</div>
        </div>
        <div className="flex gap-2">
          <button className={viewMode === "input" ? btnOn : btn} onClick={() => setViewMode("input")}>📝 기록</button>
          <button className={viewMode === "query" ? btnOn : btn} onClick={() => setViewMode("query")}>🔍 조회</button>
          <HumidPrintButton logDate={logDate} />
        </div>
      </div>

      {viewMode === "query" ? (
        <HumidQueryView />
      ) : (
        <>
          {/* 날짜·오전오후 선택 */}
          <div className={`${card} p-4`}>
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <div className="mb-1 text-xs text-slate-500">점검일</div>
                <input type="date" className={`${inp} w-40`} value={logDate} max={todayKST()}
                  onChange={(e) => {
                    setLogDate(e.target.value);
                    setAmInspector(null); setPmInspector(null);
                    setAmCheckTime(""); setPmCheckTime("");
                  }} />
              </div>
              <div>
                <div className="mb-1 text-xs text-slate-500">점검시간 · 시각</div>
                <div className="flex items-center gap-2">
                  <button className={period === "AM" ? btnOn : btn} onClick={() => setPeriod("AM")}>오전</button>
                  <HumidCheckTimeInput value={amCheckTime} onChange={setAmCheckTime} placeholder="0900" disabled={isReadOnly} />
                  <div className="w-px h-5 bg-slate-200" />
                  <button className={period === "PM" ? btnOn : btn} onClick={() => setPeriod("PM")}>오후</button>
                  <HumidCheckTimeInput value={pmCheckTime} onChange={setPmCheckTime} placeholder="1500" disabled={isReadOnly} />
                </div>
              </div>
              <div className="ml-auto">
                {currentInspector ? (
                  <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-3 py-2">
                    <span className="text-green-600 text-sm font-semibold">👤 {currentInspector.name}</span>
                    <span className="text-xs text-green-500">{period === "AM" ? "오전" : "오후"} 점검자 확인됨</span>
                  </div>
                ) : (
                  <button className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-100"
                    onClick={() => { setPinTarget(period); setShowPinModal(true); }}>
                    🔑 {period === "AM" ? "오전" : "오후"} PIN 입력
                  </button>
                )}
              </div>
            </div>
          </div>

          {loading ? (
            <div className="py-12 text-center text-sm text-slate-400">불러오는 중...</div>
          ) : (
            <>
              {!currentInspector && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-center gap-3">
                  <span className="text-lg">🔑</span>
                  <div className="text-sm text-amber-700 font-semibold">PIN을 입력해야 온·습도 기록이 가능합니다.</div>
                </div>
              )}
              <div className={`${card} p-4`}>
                <div className="mb-3 text-sm font-semibold text-slate-700">{period === "AM" ? "오전" : "오후"} 점검 기록</div>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="bg-slate-50">
                        <th className="border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-500 text-left">구역</th>
                        <th className="border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-500">온도 (°C)</th>
                        <th className="border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-500">습도 (%)</th>
                        <th className="border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-500 text-left">비고</th>
                      </tr>
                    </thead>
                    <tbody>
                      {HUMID_ROOMS.map((room) => {
                        const e = entries[room];
                        return (
                          <tr key={room} className="border-b border-slate-100">
                            <td className="border border-slate-200 px-4 py-2.5 font-semibold text-slate-700 whitespace-nowrap">{room}</td>
                            <td className="border border-slate-200 px-3 py-2">
                              <TempInput
                                value={e?.temperature ?? null}
                                onChange={(v) => setEntries((prev) => ({ ...prev, [room]: { ...prev[room], temperature: v } }))}
                                disabled={isReadOnly || !currentInspector}
                              />
                            </td>
                            <td className="border border-slate-200 px-3 py-2">
                              <input type="number" step="1" min="0" max="100" placeholder="—" value={e?.humidity ?? ""}
                                disabled={isReadOnly || !currentInspector}
                                onChange={(v) => handleChange(room, "humidity", v.target.value)}
                                className="w-28 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-center tabular-nums focus:border-blue-400 focus:outline-none disabled:bg-slate-50 disabled:text-slate-400" />
                            </td>
                            <td className="border border-slate-200 px-3 py-2">
                              <input type="text" placeholder="특이사항" value={e?.note ?? ""}
                                disabled={isReadOnly}
                                onChange={(v) => handleChange(room, "note", v.target.value)}
                                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:outline-none disabled:bg-slate-50" />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
              {!isReadOnly && (
                <button className="w-full rounded-xl border border-green-500 bg-green-600 py-3 text-sm font-bold text-white hover:bg-green-700 disabled:opacity-60"
                  disabled={saving} onClick={handleSave}>
                  {saving ? "⏳ 저장 중..." : "💾 저장"}
                </button>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

function HumidQueryView() {
  const [queryDate, setQueryDate] = useState(todayKST());
  const [data, setData] = useState<{ AM: Record<HumidRoom, HumidLogEntry>; PM: Record<HumidRoom, HumidLogEntry> }>({
    AM: {} as Record<HumidRoom, HumidLogEntry>, PM: {} as Record<HumidRoom, HumidLogEntry>,
  });
  const [inspectors, setInspectors] = useState<{ AM: string | null; PM: string | null }>({ AM: null, PM: null });
  const [checkTimes, setCheckTimes] = useState<{ AM: string | null; PM: string | null }>({ AM: null, PM: null });
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    const [{ data: logs }, { data: sigs }] = await Promise.all([
      supabase.from("humidity_temp_logs").select("*").eq("log_date", queryDate),
      supabase.from("fridge_monitoring_signatures").select("period,inspector_name").eq("log_date", queryDate).eq("role", "humidity_inspector"),  
    ]);
    setLoading(false);
    const am = {} as Record<HumidRoom, HumidLogEntry>;
    const pm = {} as Record<HumidRoom, HumidLogEntry>;
    const times = { AM: null as string | null, PM: null as string | null };
    for (const row of logs ?? []) {
      if (row.period === "AM") am[row.room as HumidRoom] = row;
      else pm[row.room as HumidRoom] = row;
      if (row.check_time && !times[row.period as HumidPeriod]) times[row.period as HumidPeriod] = row.check_time;
    }
    setData({ AM: am, PM: pm });
    setCheckTimes(times);
    const ins = { AM: null as string | null, PM: null as string | null };
    for (const sig of sigs ?? []) ins[sig.period as HumidPeriod] = sig.inspector_name;
    setInspectors(ins);
  }

  useEffect(() => { load(); }, [queryDate]);

  return (
    <div className="space-y-4">
      <div className={`${card} p-4`}>
        <div className="flex items-center gap-3">
          <input type="date" className={inp} style={{ width: 160 }} value={queryDate} max={todayKST()} onChange={(e) => setQueryDate(e.target.value)} />
          <button className={btn} onClick={load}>🔄 조회</button>
        </div>
      </div>
      {loading ? <div className="text-center text-sm text-slate-400 py-8">불러오는 중...</div> : (
        <div className={`${card} p-4 overflow-x-auto`}>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50">
                <th className="border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-500 text-left">구역</th>
                <th className="border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-500" colSpan={2}>오전</th>
                <th className="border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-500" colSpan={2}>오후</th>
                <th className="border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-500">비고</th>
              </tr>
              <tr className="bg-slate-50">
                <th className="border border-slate-200 px-3 py-2" />
                <th className="border border-slate-200 px-3 py-2 text-xs text-slate-400">온도</th>
                <th className="border border-slate-200 px-3 py-2 text-xs text-slate-400">습도</th>
                <th className="border border-slate-200 px-3 py-2 text-xs text-slate-400">온도</th>
                <th className="border border-slate-200 px-3 py-2 text-xs text-slate-400">습도</th>
                <th className="border border-slate-200 px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {HUMID_ROOMS.map((room) => {
                const am = data.AM[room]; const pm = data.PM[room];
                return (
                  <tr key={room} className="border-b border-slate-100">
                    <td className="border border-slate-200 px-3 py-2 font-semibold text-slate-700">{room}</td>
                    <td className="border border-slate-200 px-3 py-2 text-center tabular-nums text-blue-700 font-semibold">{am?.temperature != null ? `${am.temperature}°C` : <span className="text-slate-300">—</span>}</td>
                    <td className="border border-slate-200 px-3 py-2 text-center tabular-nums text-blue-700 font-semibold">{am?.humidity != null ? `${am.humidity}%` : <span className="text-slate-300">—</span>}</td>
                    <td className="border border-slate-200 px-3 py-2 text-center tabular-nums text-blue-700 font-semibold">{pm?.temperature != null ? `${pm.temperature}°C` : <span className="text-slate-300">—</span>}</td>
                    <td className="border border-slate-200 px-3 py-2 text-center tabular-nums text-blue-700 font-semibold">{pm?.humidity != null ? `${pm.humidity}%` : <span className="text-slate-300">—</span>}</td>
                    <td className="border border-slate-200 px-3 py-2 text-xs text-slate-500">{am?.note || pm?.note || ""}</td>
                  </tr>
                );
              })}
              <tr className="bg-slate-50">
                <td className="border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-500">점검시각</td>
                <td className="border border-slate-200 px-3 py-2 text-center text-sm tabular-nums text-slate-600" colSpan={2}>{checkTimes.AM ?? <span className="text-slate-300">—</span>}</td>
                <td className="border border-slate-200 px-3 py-2 text-center text-sm tabular-nums text-slate-600" colSpan={2}>{checkTimes.PM ?? <span className="text-slate-300">—</span>}</td>
                <td className="border border-slate-200 px-3 py-2" />
              </tr>
              <tr className="bg-slate-50">
                <td className="border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-500">점검자</td>
                <td className="border border-slate-200 px-3 py-2 text-center font-semibold text-slate-700" colSpan={2}>{inspectors.AM ?? <span className="text-slate-300">—</span>}</td>
                <td className="border border-slate-200 px-3 py-2 text-center font-semibold text-slate-700" colSpan={2}>{inspectors.PM ?? <span className="text-slate-300">—</span>}</td>
                <td className="border border-slate-200 px-3 py-2" />
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function HumidPrintButton({ logDate }: { logDate: string }) {
  const [showModal, setShowModal] = useState(false);
  return (
    <>
      <button className={btnSm} onClick={() => setShowModal(true)}>🖨️ 인쇄</button>
      {showModal && <HumidPrintModal logDate={logDate} onClose={() => setShowModal(false)} />}
    </>
  );
}

function HumidPrintModal({ logDate, onClose }: { logDate: string; onClose: () => void }) {
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(logDate + "T00:00:00+09:00");
    const day = d.getDay();
    const mon = new Date(d);
    mon.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
    return new Date(mon.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => {
    const d = new Date(logDate + "T00:00:00+09:00");
    const day = d.getDay();
    const fri = new Date(d);
    fri.setDate(d.getDate() + (day === 0 ? 0 : 5 - day));
    return new Date(fri.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  });

  type PrintEntry = { AM: HumidLogEntry | null; PM: HumidLogEntry | null };
  const [printData, setPrintData] = useState<Record<string, PrintEntry>>({});
  const [printSigs, setPrintSigs] = useState<Record<string, { AM: string | null; PM: string | null }>>({});
  const [printTimes, setPrintTimes] = useState<Record<string, { AM: string | null; PM: string | null }>>({});
  const [loading, setLoading] = useState(false);

  async function loadPrint() {
    if (dateFrom > dateTo) return;
    setLoading(true);
    const dates = getHumidDates(dateFrom, dateTo);
    const [{ data: logs }, { data: sigs }] = await Promise.all([
      supabase.from("humidity_temp_logs").select("*").in("log_date", dates),
      supabase.from("fridge_monitoring_signatures").select("*").in("log_date", dates).eq("role", "inspector"),
    ]);
    setLoading(false);
    const dataMap: Record<string, PrintEntry> = {};
    const timesMap: Record<string, { AM: string | null; PM: string | null }> = {};
    for (const row of logs ?? []) {
      const key = `${row.log_date}-${row.room}`;
      if (!dataMap[key]) dataMap[key] = { AM: null, PM: null };
      dataMap[key][row.period as HumidPeriod] = row;
      if (!timesMap[row.log_date]) timesMap[row.log_date] = { AM: null, PM: null };
      if (row.check_time && !timesMap[row.log_date][row.period as HumidPeriod])
        timesMap[row.log_date][row.period as HumidPeriod] = row.check_time;
    }
    setPrintData(dataMap);
    setPrintTimes(timesMap);
    const sigMap: Record<string, { AM: string | null; PM: string | null }> = {};
    for (const sig of sigs ?? []) {
      if (!sigMap[sig.log_date]) sigMap[sig.log_date] = { AM: null, PM: null };
      sigMap[sig.log_date][sig.period as HumidPeriod] = sig.inspector_name;
    }
    setPrintSigs(sigMap);
  }

  useEffect(() => { loadPrint(); }, [dateFrom, dateTo]);

  function doPrint() {
    const content = document.getElementById("humidity-print-content");
    if (!content) return;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>온습도관리일지_${dateFrom}_${dateTo}</title>
      <style>
        @page{size:A4 landscape;margin:8mm 10mm;}
        body{margin:0;font-family:'Malgun Gothic','맑은 고딕',sans-serif;font-size:8pt;color:#111;}
        *{box-sizing:border-box;-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;}
        table{border-collapse:collapse;width:100%;page-break-inside:avoid;}
        th,td{border:0.5px solid #aaa;padding:2px 4px;text-align:center;font-size:7pt;}
        .th{background:#f0f4f8;font-weight:bold;}
        .print-page-break{page-break-after:always !important;}
      </style>
    </head><body>${content.innerHTML}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 500);
  }

  const dates = getHumidDates(dateFrom, dateTo);

  // 월요일 기준 주 단위 청크
  const chunks: string[][] = [];
  let chunk: string[] = [];
  for (const d of dates) {
    const dow = new Date(d + "T00:00:00+09:00").getDay();
    if (dow === 1 && chunk.length > 0) { chunks.push(chunk); chunk = []; }
    chunk.push(d);
    if (dow === 0) { chunks.push(chunk); chunk = []; }
  }
  if (chunk.length > 0) chunks.push(chunk);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-slate-100">
      <div className="flex items-center justify-between gap-3 bg-slate-800 px-5 py-3">
        <div className="text-white font-bold">🖨️ 온·습도 관리일지 인쇄 미리보기</div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-300">출력 기간</span>
          <input type="date" className={inp} value={dateFrom} max={dateTo} onChange={(e) => setDateFrom(e.target.value)} />
          <span className="text-slate-300 text-sm">~</span>
          <input type="date" className={inp} value={dateTo} min={dateFrom} max={todayKST()} onChange={(e) => setDateTo(e.target.value)} />
          <span className="text-xs text-slate-400">{dates.length}일</span>
          <button className="rounded-xl border border-blue-400 bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700" onClick={doPrint}>인쇄</button>
          <button className="rounded-xl border border-slate-500 bg-slate-600 px-4 py-2 text-sm text-white hover:bg-slate-700" onClick={onClose}>닫기</button>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-6 flex flex-col items-center gap-6">
        {loading ? <div className="text-center text-sm text-slate-400 py-12">불러오는 중...</div> : (
          <div id="humidity-print-content">
           {chunks.map((weekDates, pageIdx) => {
              // 이 주에 실제 데이터가 하나라도 있는지 확인
              const hasData = weekDates.some((d) =>
                HUMID_ROOMS.some((room) =>
                  printData[`${d}-${room}`]?.AM != null || printData[`${d}-${room}`]?.PM != null
                )
              );
              if (!hasData) return null;

              const weekNotes = weekDates.flatMap((d) =>
                HUMID_ROOMS.flatMap((room) => {
                  const an = printData[`${d}-${room}`]?.AM?.note;
                  const pn = printData[`${d}-${room}`]?.PM?.note;
                  return [an, pn].filter(Boolean);
                })
              ).join(" | ");

              return (
                <div key={pageIdx} className={pageIdx < chunks.length - 1 ? "print-page-break" : ""}
                  style={{ background: "#fff", width: "297mm", minHeight: "210mm", padding: "8mm 10mm", boxShadow: "0 4px 24px rgba(0,0,0,0.10)", marginBottom: "16px" }}>
                  <div style={{ textAlign: "center", fontSize: "14pt", fontWeight: "bold", letterSpacing: "4px", marginBottom: "4px", paddingBottom: "4px", borderBottom: "1.5px solid #111" }}>
                    중요지점 온·습도 관리일지
                  </div>
                  <div style={{ fontSize: "7.5pt", color: "#555", marginBottom: "6px", display: "flex", gap: "16px" }}>
                    <span>※ 이상 발생시 즉시 조치 후 보고</span>
                    <span>점검기간: {weekDates[0].slice(5).replace("-", "/")} ({getHumidDayLabel(weekDates[0])}) ~ {weekDates[weekDates.length - 1].slice(5).replace("-", "/")} ({getHumidDayLabel(weekDates[weekDates.length - 1])})</span>
                  </div>
                  <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "7pt" }}>
                    <thead>
                      <tr style={{ background: "#f0f4f8" }}>
                        <th className="th" rowSpan={2} style={{ width: "64px", textAlign: "left", paddingLeft: "6px" }}>구역</th>
                        {weekDates.map((d) => (
                          <th key={d} className="th" colSpan={4}>{d.slice(5).replace("-", "/")} ({getHumidDayLabel(d)})</th>
                        ))}
                        <th className="th" rowSpan={2} style={{ width: "60px" }}>비고</th>
                      </tr>
                      <tr style={{ background: "#f0f4f8" }}>
                        {weekDates.map((d) => (
                          <React.Fragment key={d}>
                            <th className="th" style={{ fontSize: "6.5pt", width: "26px" }}>오전온도</th>
                            <th className="th" style={{ fontSize: "6.5pt", width: "26px" }}>오전습도</th>
                            <th className="th" style={{ fontSize: "6.5pt", width: "26px" }}>오후온도</th>
                            <th className="th" style={{ fontSize: "6.5pt", width: "26px" }}>오후습도</th>
                          </React.Fragment>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {HUMID_ROOMS.map((room) => {
                        const roomNote = weekDates.flatMap((d) => {
                          const an = printData[`${d}-${room}`]?.AM?.note;
                          const pn = printData[`${d}-${room}`]?.PM?.note;
                          return [an, pn].filter(Boolean);
                        }).join(" / ");
                        return (
                          <tr key={room}>
                            <td style={{ border: "0.5px solid #aaa", textAlign: "left", paddingLeft: "6px", fontWeight: "bold" }}>{room}</td>
                            {weekDates.map((d) => {
                              const am = printData[`${d}-${room}`]?.AM;
                              const pm = printData[`${d}-${room}`]?.PM;
                              return (
                                <React.Fragment key={d}>
                                  <td style={{ border: "0.5px solid #aaa", color: am?.temperature != null ? "#1d4ed8" : "#bbb", fontWeight: am?.temperature != null ? "bold" : "normal" }}>{am?.temperature != null ? `${am.temperature}°C` : "—"}</td>
                                  <td style={{ border: "0.5px solid #aaa", color: am?.humidity != null ? "#1d4ed8" : "#bbb", fontWeight: am?.humidity != null ? "bold" : "normal" }}>{am?.humidity != null ? `${am.humidity}%` : "—"}</td>
                                  <td style={{ border: "0.5px solid #aaa", color: pm?.temperature != null ? "#1d4ed8" : "#bbb", fontWeight: pm?.temperature != null ? "bold" : "normal" }}>{pm?.temperature != null ? `${pm.temperature}°C` : "—"}</td>
                                  <td style={{ border: "0.5px solid #aaa", color: pm?.humidity != null ? "#1d4ed8" : "#bbb", fontWeight: pm?.humidity != null ? "bold" : "normal" }}>{pm?.humidity != null ? `${pm.humidity}%` : "—"}</td>
                                </React.Fragment>
                              );
                            })}
                            <td style={{ border: "0.5px solid #aaa", fontSize: "6pt", color: "#555", textAlign: "left", padding: "1px 3px" }}>{roomNote}</td>
                          </tr>
                        );
                      })}
                      <tr style={{ background: "#f8fafc" }}>
                        <td style={{ border: "0.5px solid #aaa", fontWeight: "bold", textAlign: "center", fontSize: "7pt" }}>점검시각</td>
                        {weekDates.map((d) => (
                          <React.Fragment key={d}>
                            <td colSpan={2} style={{ border: "0.5px solid #aaa", fontSize: "7pt" }}>{printTimes[d]?.AM ?? "—"}</td>
                            <td colSpan={2} style={{ border: "0.5px solid #aaa", fontSize: "7pt" }}>{printTimes[d]?.PM ?? "—"}</td>
                          </React.Fragment>
                        ))}
                        <td style={{ border: "0.5px solid #aaa" }} />
                      </tr>
                      <tr style={{ background: "#f8fafc" }}>
                        <td style={{ border: "0.5px solid #aaa", fontWeight: "bold", textAlign: "center", fontSize: "7pt" }}>점검자</td>
                        {weekDates.map((d) => (
                          <React.Fragment key={d}>
                            <td colSpan={2} style={{ border: "0.5px solid #aaa", fontSize: "7pt" }}>{printSigs[d]?.AM ?? "—"}</td>
                            <td colSpan={2} style={{ border: "0.5px solid #aaa", fontSize: "7pt" }}>{printSigs[d]?.PM ?? "—"}</td>
                          </React.Fragment>
                        ))}
                        <td style={{ border: "0.5px solid #aaa" }} />
                      </tr>
                    </tbody>
                  </table>
                  <div style={{ marginTop: "6px", border: "0.5px solid #aaa", borderRadius: "3px", padding: "4px 8px", fontSize: "7.5pt", minHeight: "24px" }}>
                    <span style={{ fontWeight: "bold" }}>비고: </span>{weekNotes}
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
// 7. 냉장·냉동·온장고 모니터링일지
// ═══════════════════════════════════════════════════════════
export function StorageTempTab({ role, userId, showToast }: {
  role: UserRole; userId: string | null;
  showToast: (msg: string, type?: "success" | "error") => void;
}) {
  return <FridgeMonitoringClient />;
}
  