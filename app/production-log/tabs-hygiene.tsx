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

// ═══════════════════════════════════════════════════════════
// 5. 일반위생관리 점검표
// ═══════════════════════════════════════════════════════════
export function HygieneCheckTab({ role, userId, showToast }: {
  role: UserRole; userId: string | null;
  showToast: (msg: string, type?: "success" | "error") => void;
}) {
  const isAdmin = role === "ADMIN";
  const isAdminOrSubadmin = role === "ADMIN" || role === "SUBADMIN";
  const [logs, setLogs] = useState<any[]>([]);
  const [filterDate, setFilterDate] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [fCategory, setFCategory] = useState("개인위생");
  const [fCheckItem, setFCheckItem] = useState("");
  const [fResult, setFResult] = useState("");
  const [fDeviation, setFDeviation] = useState("");
  const [fImprovement, setFImprovement] = useState("");
  const [saving, setSaving] = useState(false);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("hygiene_check_logs").select("*").eq("log_date", filterDate).order("created_at", { ascending: false });
    setLogs(data ?? []); setLoading(false);
  }, [filterDate]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  async function saveLog() {
    if (!fCheckItem) return showToast("점검사항을 입력하세요.", "error");
    setSaving(true);
    const { error } = await supabase.from("hygiene_check_logs").insert({
      log_date: filterDate, category: fCategory, check_item: fCheckItem.trim(),
      result: fResult.trim() || null, deviation: fDeviation.trim() || null,
      improvement: fImprovement.trim() || null, created_by: userId,
    });
    setSaving(false);
    if (error) return showToast("저장 실패: " + error.message, "error");
    showToast("✅ 위생관리 기록 완료!"); setShowForm(false);
    setFCheckItem(""); setFResult(""); setFDeviation(""); setFImprovement("");
    loadLogs();
  }

  async function approveLog(id: string) {
    await supabase.from("hygiene_check_logs").update({ approved_by: userId, approved_at: new Date().toISOString() }).eq("id", id);
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
          <div className="mb-3 font-semibold text-sm text-blue-700">✚ 일반위생관리 점검 기록</div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div><div className="mb-1 text-xs text-slate-500">구분</div>
              <select className={inp} value={fCategory} onChange={(e) => setFCategory(e.target.value)}>
                {["개인위생","시설위생","공정","기타"].map((c) => <option key={c} value={c}>{c}</option>)}
              </select></div>
            <div><div className="mb-1 text-xs text-slate-500">점검사항 *</div>
              <input className={inp} value={fCheckItem} onChange={(e) => setFCheckItem(e.target.value)} /></div>
            <div><div className="mb-1 text-xs text-slate-500">점검결과</div>
              <input className={inp} value={fResult} onChange={(e) => setFResult(e.target.value)} /></div>
            <div><div className="mb-1 text-xs text-slate-500">이탈사항</div>
              <input className={inp} value={fDeviation} onChange={(e) => setFDeviation(e.target.value)} /></div>
            <div className="md:col-span-2"><div className="mb-1 text-xs text-slate-500">개선조치사항</div>
              <input className={inp} value={fImprovement} onChange={(e) => setFImprovement(e.target.value)} /></div>
          </div>
          <div className="mt-4 flex gap-2">
            <button className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60" disabled={saving} onClick={saveLog}>{saving ? "저장 중..." : "💾 등록"}</button>
            <button className={btn} onClick={() => setShowForm(false)}>취소</button>
          </div>
        </div>
      )}
      <div className={`${card} p-4`}>
        <div className="mb-3 font-semibold text-sm">🧼 일반위생관리 점검표 — {filterDate}</div>
        {loading ? <div className="py-4 text-center text-sm text-slate-400">불러오는 중...</div>
          : logs.length === 0 ? <div className="py-4 text-center text-sm text-slate-400">기록이 없습니다.</div>
          : <div className="overflow-x-auto"><table className="w-full text-sm border-collapse">
              <thead><tr className="border-b border-slate-200">{["구분","점검사항","점검결과","이탈사항","개선조치","승인"].map((h) => <th key={h} className="text-left py-2 px-3 text-xs text-slate-500 font-semibold">{h}</th>)}</tr></thead>
              <tbody>{logs.map((log) => (
                <tr key={log.id} className={`border-b border-slate-100 hover:bg-slate-50 ${log.deviation ? "bg-amber-50" : ""}`}>
                  <td className="py-2 px-3"><span className="rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">{log.category}</span></td>
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

// ═══════════════════════════════════════════════════════════
// 6. 중요지점 온·습도 관리일지
// ═══════════════════════════════════════════════════════════
export function TempHumidityTab({ role, userId, showToast }: {
  role: UserRole; userId: string | null;
  showToast: (msg: string, type?: "success" | "error") => void;
}) {
  const isAdmin = role === "ADMIN";
  const isAdminOrSubadmin = role === "ADMIN" || role === "SUBADMIN";
  const [logs, setLogs] = useState<any[]>([]);
  const [filterDate, setFilterDate] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [fCheckTime, setFCheckTime] = useState("AM");
  const [temps, setTemps] = useState({ outer_temp: "", outer_humidity: "", material_temp: "", material_humidity: "", production_temp: "", production_humidity: "" });
  const [fNote, setFNote] = useState("");
  const [saving, setSaving] = useState(false);

  const ZONES = [{ key: "outer", label: "외포장실" }, { key: "material", label: "원부재료실" }, { key: "production", label: "생산실" }];

  const loadLogs = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("temp_humidity_logs").select("*").eq("log_date", filterDate).order("check_time");
    setLogs(data ?? []); setLoading(false);
  }, [filterDate]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  async function saveLog() {
    setSaving(true);
    const payload: any = { log_date: filterDate, check_time: fCheckTime, note: fNote.trim() || null, created_by: userId };
    Object.entries(temps).forEach(([k, v]) => { if (v) payload[k] = Number(v); });
    const { error } = await supabase.from("temp_humidity_logs").insert(payload);
    setSaving(false);
    if (error) return showToast("저장 실패: " + error.message, "error");
    showToast("✅ 온·습도 기록 완료!"); setShowForm(false);
    setTemps({ outer_temp: "", outer_humidity: "", material_temp: "", material_humidity: "", production_temp: "", production_humidity: "" }); setFNote("");
    loadLogs();
  }

  async function approveLog(id: string) {
    await supabase.from("temp_humidity_logs").update({ approved_by: userId, approved_at: new Date().toISOString() }).eq("id", id);
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
          <div className="mb-3 font-semibold text-sm text-blue-700">✚ 온·습도 기록 (기준: 25°C 이하, 50% 이하)</div>
          <div className="mb-3 flex gap-2">
            {["AM","PM"].map((t) => <button key={t} className={fCheckTime === t ? btnOn : btn} onClick={() => setFCheckTime(t)}>{t}</button>)}
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {ZONES.map(({ key, label }) => (
              <div key={key} className="rounded-xl border border-slate-200 p-3">
                <div className="mb-2 font-semibold text-xs text-slate-700">{label}</div>
                <div className="space-y-2">
                  <div><div className="mb-1 text-xs text-slate-500">온도 (°C)</div>
                    <input className={inpR} inputMode="decimal" value={(temps as any)[`${key}_temp`]}
                      onChange={(e) => setTemps((p) => ({ ...p, [`${key}_temp`]: e.target.value }))} placeholder="≤ 25" /></div>
                  <div><div className="mb-1 text-xs text-slate-500">습도 (%)</div>
                    <input className={inpR} inputMode="decimal" value={(temps as any)[`${key}_humidity`]}
                      onChange={(e) => setTemps((p) => ({ ...p, [`${key}_humidity`]: e.target.value }))} placeholder="≤ 50" /></div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3"><div className="mb-1 text-xs text-slate-500">비고</div>
            <input className={inp} value={fNote} onChange={(e) => setFNote(e.target.value)} /></div>
          <div className="mt-4 flex gap-2">
            <button className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60" disabled={saving} onClick={saveLog}>{saving ? "저장 중..." : "💾 등록"}</button>
            <button className={btn} onClick={() => setShowForm(false)}>취소</button>
          </div>
        </div>
      )}
      <div className={`${card} p-4`}>
        <div className="mb-3 font-semibold text-sm">🌡️ 온·습도 관리일지 — {filterDate}</div>
        {loading ? <div className="py-4 text-center text-sm text-slate-400">불러오는 중...</div>
          : logs.length === 0 ? <div className="py-4 text-center text-sm text-slate-400">기록이 없습니다.</div>
          : <div className="space-y-3">{logs.map((log) => (
              <div key={log.id} className="rounded-2xl border border-slate-200 p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-sm">{log.check_time} 측정</span>
                  <div className="flex items-center gap-2">
                    {!log.approved_by && isAdmin && <button className="rounded-lg border border-green-300 bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-700" onClick={() => approveLog(log.id)}>✅ 승인</button>}
                    {log.approved_by && <span className="text-[10px] text-green-600 font-semibold">승인완료</span>}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {ZONES.map(({ key, label }) => {
                    const t = log[`${key}_temp`]; const h = log[`${key}_humidity`];
                    const over = (t != null && t > 25) || (h != null && h > 50);
                    return (
                      <div key={key} className={`rounded-xl border px-3 py-2 text-center ${over ? "border-red-200 bg-red-50" : "border-slate-200 bg-slate-50"}`}>
                        <div className="text-xs text-slate-500 mb-1">{label}</div>
                        <div className={`text-sm font-bold ${t != null && t > 25 ? "text-red-600" : "text-slate-800"}`}>{t != null ? `${t}°C` : "—"}</div>
                        <div className={`text-xs ${h != null && h > 50 ? "text-red-600" : "text-slate-500"}`}>{h != null ? `${h}%` : "—"}</div>
                      </div>
                    );
                  })}
                </div>
                {log.note && <div className="mt-1 text-xs text-slate-400">비고: {log.note}</div>}
              </div>
            ))}</div>}
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
  const isAdmin = role === "ADMIN";
  const isAdminOrSubadmin = role === "ADMIN" || role === "SUBADMIN";
  const [logs, setLogs] = useState<any[]>([]);
  const [filterDate, setFilterDate] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [fEquipmentType, setFEquipmentType] = useState("fridge");
  const [fEquipmentNo, setFEquipmentNo] = useState("");
  const [fCheckTime, setFCheckTime] = useState("AM");
  const [fTemperature, setFTemperature] = useState("");
  const [fIsOk, setFIsOk] = useState(true);
  const [fActionNote, setFActionNote] = useState("");
  const [saving, setSaving] = useState(false);

  const EQUIP: Record<string,string> = { fridge:"냉장", freezer:"냉동", warmer:"온장고" };
  const RANGES: Record<string,string> = { fridge:"0~10°C", freezer:"0~-35°C", warmer:"40~50°C" };

  const loadLogs = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("storage_temp_logs").select("*").eq("log_date", filterDate).order("equipment_type").order("equipment_no").order("check_time");
    setLogs(data ?? []); setLoading(false);
  }, [filterDate]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  async function saveLog() {
    if (!fEquipmentNo || !fTemperature) return showToast("장비 번호와 온도를 입력하세요.", "error");
    setSaving(true);
    const { error } = await supabase.from("storage_temp_logs").insert({
      log_date: filterDate, check_time: fCheckTime, equipment_type: fEquipmentType,
      equipment_no: fEquipmentNo.trim(), temperature: Number(fTemperature),
      is_ok: fIsOk, action_note: fActionNote.trim() || null, created_by: userId,
    });
    setSaving(false);
    if (error) return showToast("저장 실패: " + error.message, "error");
    showToast("✅ 온도 기록 완료!"); setShowForm(false);
    setFEquipmentNo(""); setFTemperature(""); setFIsOk(true); setFActionNote("");
    loadLogs();
  }

  async function approveLog(id: string) {
    await supabase.from("storage_temp_logs").update({ approved_by: userId, approved_at: new Date().toISOString() }).eq("id", id);
    showToast("✅ 승인 완료!"); loadLogs();
  }

  const grouped = logs.reduce((acc, log) => { if (!acc[log.equipment_type]) acc[log.equipment_type] = []; acc[log.equipment_type].push(log); return acc; }, {} as Record<string,any[]>);

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
          <div className="mb-3 font-semibold text-sm text-blue-700">✚ 냉장·냉동·온장고 온도 기록</div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div><div className="mb-1 text-xs text-slate-500">장비 유형</div>
              <select className={inp} value={fEquipmentType} onChange={(e) => setFEquipmentType(e.target.value)}>
                {Object.entries(EQUIP).map(([k, v]) => <option key={k} value={k}>{v} ({RANGES[k]})</option>)}
              </select></div>
            <div><div className="mb-1 text-xs text-slate-500">장비 번호</div>
              <input className={inp} value={fEquipmentNo} onChange={(e) => setFEquipmentNo(e.target.value)} placeholder="예: 01" /></div>
            <div><div className="mb-1 text-xs text-slate-500">측정시간</div>
              <div className="flex gap-2">{["AM","PM"].map((t) => <button key={t} className={fCheckTime === t ? btnOn : btn} onClick={() => setFCheckTime(t)}>{t}</button>)}</div></div>
            <div><div className="mb-1 text-xs text-slate-500">온도 ({RANGES[fEquipmentType]})</div>
              <input className={inpR} inputMode="decimal" value={fTemperature} onChange={(e) => setFTemperature(e.target.value.replace(/[^\d.-]/g, ""))} /></div>
            <div><div className="mb-1 text-xs text-slate-500">적합 여부</div>
              <select className={inp} value={fIsOk ? "ok" : "ng"} onChange={(e) => setFIsOk(e.target.value === "ok")}>
                <option value="ok">✅ 적합</option><option value="ng">❌ 부적합</option>
              </select></div>
            {!fIsOk && <div><div className="mb-1 text-xs text-slate-500">조치사항</div>
              <input className={inp} value={fActionNote} onChange={(e) => setFActionNote(e.target.value)} /></div>}
          </div>
          <div className="mt-4 flex gap-2">
            <button className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60" disabled={saving} onClick={saveLog}>{saving ? "저장 중..." : "💾 등록"}</button>
            <button className={btn} onClick={() => setShowForm(false)}>취소</button>
          </div>
        </div>
      )}
      <div className={`${card} p-4`}>
        <div className="mb-3 font-semibold text-sm">❄️ 냉장·냉동·온장고 모니터링 — {filterDate}</div>
        {loading ? <div className="py-4 text-center text-sm text-slate-400">불러오는 중...</div>
          : logs.length === 0 ? <div className="py-4 text-center text-sm text-slate-400">기록이 없습니다.</div>
          : Object.entries(grouped).map(([type, items]) => (
            <div key={type} className="mb-4">
              <div className="mb-2 text-xs font-semibold text-slate-500">{EQUIP[type]} ({RANGES[type]})</div>
              <div className="overflow-x-auto"><table className="w-full text-sm border-collapse">
                <thead><tr className="border-b border-slate-200">{["번호","측정시간","온도","적합","조치","승인"].map((h) => <th key={h} className="text-left py-1.5 px-3 text-xs text-slate-500 font-semibold">{h}</th>)}</tr></thead>
                <tbody>{(items as any[]).map((log) => (
                  <tr key={log.id} className={`border-b border-slate-100 hover:bg-slate-50 ${log.is_ok === false ? "bg-red-50" : ""}`}>
                    <td className="py-2 px-3 font-medium">{log.equipment_no}</td>
                    <td className="py-2 px-3">{log.check_time}</td>
                    <td className={`py-2 px-3 font-bold tabular-nums ${log.is_ok === false ? "text-red-600" : "text-slate-800"}`}>{log.temperature}°C</td>
                    <td className="py-2 px-3"><span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${log.is_ok ? "bg-green-100 border-green-200 text-green-700" : "bg-red-100 border-red-200 text-red-700"}`}>{log.is_ok ? "적합" : "부적합"}</span></td>
                    <td className="py-2 px-3 text-xs text-slate-500">{log.action_note ?? "—"}</td>
                    <td className="py-2 px-3">{!log.approved_by && isAdmin ? <button className="rounded-lg border border-green-300 bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-700" onClick={() => approveLog(log.id)}>✅ 승인</button> : log.approved_by ? <span className="text-[10px] text-green-600 font-semibold">승인완료</span> : "—"}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            </div>
          ))}
      </div>
    </div>
  );
}
