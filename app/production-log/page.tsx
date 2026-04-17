"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { Ccp1bTab, OtherHeatingTab, CompressorTab, PetLedgerTab } from "./tabs-extra";
import { Ccp1pTab } from "./Ccp1pTab";
import { ExpiryMgmtTab, WarmerCleaningTab, PestTab, ForeignMatterTab, HygieneCheckTab, TempHumidityTab, StorageTempTab } from "./tabs-hygiene";

const supabase = createClient();

// ─────────────────────── Styles ───────────────────────
const card = "rounded-2xl border border-slate-200 bg-white shadow-sm";
const inp = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:outline-none";
const inpR = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-right tabular-nums focus:border-blue-400 focus:outline-none";
const btn = "rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50 active:bg-slate-100";
const btnOn = "rounded-xl border border-blue-500 bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700";
const btnSm = "rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium hover:bg-slate-50";

type UserRole = "ADMIN" | "SUBADMIN" | "USER" | null;

type Tab = "production" | "material" | "work" | "ccp1b" | "ccp1p" | "other_heating" | "compressor" | "pet"
  | "expiry" | "warmer_clean" | "pest" | "foreign" | "hygiene" | "temp_humidity" | "storage_temp";

// ─────────────────────── 생산일지 Types ───────────────────────
type ProductionLog = {
  id: string;
  log_date: string;
  work_type: string;
  work_name: string | null;
  quantity: number | null;
  defect_qty: number | null;
  work_start: string | null;
  work_end: string | null;
  note: string | null;
  created_by: string | null;
  confirmed_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  formula?: { name: string } | null;
  creator?: { name: string } | null;
  confirmer?: { name: string } | null;
  approver?: { name: string } | null;
};

type Formula = { id: string; name: string; work_type: string };
type Employee = { id: string; name: string | null };

const WORK_TYPE_LABELS: Record<string, string> = {
  product:       "① 준초콜릿/당류가공품",
  jeonsa:        "② 전사지 생산",
  pigment:       "③ 색소 배합",
  pet_coating:   "④ PET 코팅",
  pet_spray:     "⑤ PET 분사",
  guar:          "⑥ 구아검 배합",
  raize_pigment: "레이즈 색소 배합",
};

// ─────────────────────── 원료수불부 Types ───────────────────────
type MaterialStock = {
  material_id: string;
  material_name: string;
  category: string;
  unit: string;
  total_received: number;
  total_used: number;
  total_disposed: number;
  current_stock: number;
  is_below_safety_stock: boolean;
};

type MaterialReceipt = {
  id: string;
  received_date: string;
  material_id: string;
  quantity: number;
  unit: string;
  expiry_date: string | null;
  supplier: string | null;
  note: string | null;
  material?: { name: string } | null;
};

// ─────────────────────── 근무일지 Types ───────────────────────
type WorkLog = {
  id: string;
  log_date: string;
  worker_id: string | null;
  worker_name: string;
  clock_in: string | null;
  clock_out: string | null;
  production_summary: string | null;
  instruction: string | null;
  extra_work: string | null;
  note: string | null;
  created_by: string | null;
  confirmed_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  creator?: { name: string } | null;
  confirmer?: { name: string } | null;
  approver?: { name: string } | null;
};

// ─────────────────────── Main Component ───────────────────────
export default function ProductionLogPage() {
  const [role, setRole] = useState<UserRole>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("production");
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const isAdmin = role === "ADMIN";
  const isAdminOrSubadmin = role === "ADMIN" || role === "SUBADMIN";

  function showToast(msg: string, type: "success" | "error" = "success") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2500);
  }

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      const { data } = await supabase
        .from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
      setRole((data?.role as UserRole) ?? "USER");
    })();
  }, []);

  if (role === "USER") {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="text-center text-slate-400">
          <div className="text-4xl mb-3">🔒</div>
          <div className="text-sm">접근 권한이 없습니다.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="mx-auto max-w-[1400px] space-y-4">

        {/* 헤더 */}
        <div>
          <h1 className="text-xl font-bold text-slate-800">📋 생산관리</h1>
          <div className="mt-0.5 text-xs text-slate-500">생산일지 · 원료수불부 · 근무일지</div>
        </div>

        {/* 탭 + 컨텐츠 레이아웃 */}
        <div className="flex gap-4 items-start">
        {/* 왼쪽 사이드바 탭 */}
        <div className="flex flex-col gap-1 w-36 shrink-0">
        {([
            { key: "production",    label: "📝 생산일지" },
            { key: "material",      label: "🧪 원료수불부" },
            { key: "work",          label: "👷 근무일지" },
            { key: "ccp1b",         label: "🌡️ CCP-1B" },
            { key: "ccp1p",         label: "🔍 CCP-1P" },
            { key: "other_heating", label: "🔥 가열공정" },
            { key: "compressor",    label: "💨 압축공기" },
            { key: "pet",           label: "📦 PET수불부" },
            { key: "expiry",       label: "📅 소비기한" },
{ key: "warmer_clean", label: "🧹 온장고세척" },
{ key: "pest",         label: "🪲 방충방서" },
{ key: "foreign",      label: "🔍 이물관리" },
{ key: "hygiene",      label: "🧼 위생관리" },
{ key: "temp_humidity",label: "🌡️ 온습도" },
{ key: "storage_temp", label: "❄️ 냉장온도" },
] as { key: Tab; label: string }[]).map((t) => (    
  <button key={t.key}
    className={`w-full text-left ${activeTab === t.key ? btnOn : btn}`}
    onClick={() => setActiveTab(t.key)}
  >{t.label}</button>
))}
</div>

{/* 오른쪽 컨텐츠 */}
<div className="flex-1 min-w-0">
{/* 탭 컨텐츠 */}
{activeTab === "production" && (
  <WorkLogTab role={role} userId={userId} showToast={showToast} />
)}
        {activeTab === "material" && (
          <MaterialLedgerTab role={role} userId={userId} showToast={showToast} />
        )}
{activeTab === "work" && (
  <ProductionLogTab role={role} userId={userId} showToast={showToast} />
)}
        {activeTab === "ccp1b" && (
          <Ccp1bTab role={role} userId={userId} showToast={showToast} />
        )}
        {activeTab === "ccp1p" && (
          <Ccp1pTab role={role} userId={userId} showToast={showToast} />
        )}
        {activeTab === "other_heating" && (
          <OtherHeatingTab role={role} userId={userId} showToast={showToast} />
        )}
        {activeTab === "compressor" && (
          <CompressorTab role={role} userId={userId} showToast={showToast} />
        )}
        {activeTab === "pet" && (
          <PetLedgerTab role={role} userId={userId} showToast={showToast} />
        )}
        {activeTab === "expiry"        && <ExpiryMgmtTab role={role} userId={userId} showToast={showToast} />}
{activeTab === "warmer_clean"  && <WarmerCleaningTab role={role} userId={userId} showToast={showToast} />}
{activeTab === "pest"          && <PestTab role={role} userId={userId} showToast={showToast} />}
{activeTab === "foreign"       && <ForeignMatterTab role={role} userId={userId} showToast={showToast} />}
{activeTab === "hygiene"       && <HygieneCheckTab role={role} userId={userId} showToast={showToast} />}
{activeTab === "temp_humidity" && <TempHumidityTab role={role} userId={userId} showToast={showToast} />}
{activeTab === "storage_temp"  && <StorageTempTab role={role} userId={userId} showToast={showToast} />}

</div>{/* 오른쪽 컨텐츠 끝 */}
        </div>{/* 탭+컨텐츠 레이아웃 끝 */}

        {/* 토스트 */} 
        {toast && (
          <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] rounded-2xl border px-5 py-3 text-sm font-semibold shadow-xl
            ${toast.type === "success" ? "border-green-300 bg-green-600 text-white" : "border-red-300 bg-red-600 text-white"}`}>
            {toast.msg}
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 탭 1: 생산일지 (일별 작업일지)
// ═══════════════════════════════════════════════════════════
type TaskType = { id: string; name: string; order_no: number };
type DailyWorkLog = {
  id: string;
  log_date: string;
  employee_id: string;
  employee_name: string;
  work_order_nos: string[];
  task_checks: Record<string, boolean>;
  extra_note: string | null;
  confirmed_at: string | null;
  created_at: string;
};
type WorkOrderRef = {
  id: string;
  work_order_no: string;
  client_name: string;
  product_name: string;
  assignee_production: string | null;
};

function ProductionLogTab({ role, userId, showToast }: {
  role: UserRole; userId: string | null;
  showToast: (msg: string, type?: "success" | "error") => void;
}) {
  const isAdmin = role === "ADMIN";

  // ── 작업자 선택 + PIN 인증 ──
  const [employees, setEmployees] = useState<{ id: string; name: string; pin: string | null }[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<{ id: string; name: string } | null>(null);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState("");
  const [pinStep, setPinStep] = useState(false); // false=작업자선택, true=PIN입력

  // ── 일지 데이터 ──
  const [taskTypes, setTaskTypes] = useState<TaskType[]>([]);
  const [todayLog, setTodayLog] = useState<DailyWorkLog | null>(null);
  const [workOrders, setWorkOrders] = useState<WorkOrderRef[]>([]);
  const [taskChecks, setTaskChecks] = useState<Record<string, boolean>>({});
  const [extraNote, setExtraNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);

  // ── 조회 ──
  const [viewDate, setViewDate] = useState(new Date().toISOString().slice(0, 10));
  const [viewMode, setViewMode] = useState(false); // 조회모드(ADMIN)
  const [viewLogs, setViewLogs] = useState<DailyWorkLog[]>([]);
  const [viewLoading, setViewLoading] = useState(false);

  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    supabase.from("employees").select("id,name,pin").is("resign_date", null).order("name")
      .then(({ data }) => setEmployees((data ?? []) as any));
    supabase.from("production_task_types").select("id,name,order_no").eq("is_active", true).order("order_no")
      .then(({ data }) => setTaskTypes(data ?? []));
  }, []);

  // 작업자 선택 후 오늘 일지 + 작업지시서 로드
  const loadTodayData = useCallback(async (empId: string, empName: string) => {
    const [logRes, woRes] = await Promise.all([
      supabase.from("daily_work_logs")
        .select("*").eq("log_date", today).eq("employee_id", empId).maybeSingle(),
      supabase.from("work_orders")
        .select("id,work_order_no,client_name,product_name,assignee_production")
        .eq("assignee_production", empName)
        .eq("status", "완료")
        .gte("order_date", today)
        .order("created_at", { ascending: false }),
    ]);
    const log = logRes.data as DailyWorkLog | null;
    setTodayLog(log);
    setWorkOrders((woRes.data ?? []) as WorkOrderRef[]);
    if (log) {
      setTaskChecks(log.task_checks ?? {});
      setExtraNote(log.extra_note ?? "");
    } else {
      const init: Record<string, boolean> = {};
      taskTypes.forEach((t) => { init[t.id] = false; });
      setTaskChecks(init);
      setExtraNote("");
    }
  }, [today, taskTypes]);

  // PIN 인증
  function handleEmployeeSelect(emp: { id: string; name: string; pin: string | null }) {
    setSelectedEmployee({ id: emp.id, name: emp.name });
    setPinInput("");
    setPinError("");
    setPinStep(true);
  }

  function handlePinDigit(d: string) {
    if (pinInput.length >= 4) return;
    const next = pinInput + d;
    setPinInput(next);
    if (next.length === 4) {
      setTimeout(() => verifyPin(next), 100);
    }
  }

  function verifyPin(pin: string) {
    const emp = employees.find((e) => e.id === selectedEmployee?.id);
    if (!emp) return;
    if (!emp.pin) {
      setPinError("PIN이 설정되지 않았습니다. 설정 페이지에서 먼저 PIN을 등록해주세요.");
      setPinInput("");
      return;
    }
    if (emp.pin !== pin) {
      setPinError("PIN이 올바르지 않습니다.");
      setPinInput("");
      return;
    }
    setPinError("");
    setPinStep(false);
    loadTodayData(emp.id, emp.name);
  }

  // 저장
  async function saveLog() {
    if (!selectedEmployee) return;
    setSaving(true);
    const payload = {
      log_date: today,
      employee_id: selectedEmployee.id,
      employee_name: selectedEmployee.name,
      work_order_nos: workOrders.map((w) => w.work_order_no),
      task_checks: taskChecks,
      extra_note: extraNote.trim() || null,
      updated_at: new Date().toISOString(),
    };
    let error;
    if (todayLog) {
      ({ error } = await supabase.from("daily_work_logs").update(payload).eq("id", todayLog.id));
    } else {
      ({ error } = await supabase.from("daily_work_logs").insert({ ...payload, created_by: userId }));
    }
    setSaving(false);
    if (error) return showToast("저장 실패: " + error.message, "error");
    showToast("✅ 저장 완료!");
    await loadTodayData(selectedEmployee.id, selectedEmployee.name);
  }

  // 확인 완료
  async function confirmLog() {
    if (!selectedEmployee) return;
    if (!todayLog) { await saveLog(); }
    setConfirming(true);
    const confirmedAt = new Date().toISOString();
    let error;
    if (todayLog) {
      ({ error } = await supabase.from("daily_work_logs")
        .update({ confirmed_at: confirmedAt, task_checks: taskChecks, extra_note: extraNote.trim() || null, work_order_nos: workOrders.map((w) => w.work_order_no), updated_at: confirmedAt })
        .eq("id", todayLog.id));
    } else {
      ({ error } = await supabase.from("daily_work_logs").insert({
        log_date: today, employee_id: selectedEmployee.id, employee_name: selectedEmployee.name,
        work_order_nos: workOrders.map((w) => w.work_order_no),
        task_checks: taskChecks, extra_note: extraNote.trim() || null,
        confirmed_at: confirmedAt, created_by: userId,
      }));
    }
    setConfirming(false);
    if (error) return showToast("확인 실패: " + error.message, "error");
    showToast("✅ 확인 완료! 오늘 생산일지가 확정되었습니다.");
    await loadTodayData(selectedEmployee.id, selectedEmployee.name);
  }

  // ADMIN 조회
  async function loadViewLogs() {
    setViewLoading(true);
    const { data } = await supabase.from("daily_work_logs")
      .select("*").eq("log_date", viewDate).order("employee_name");
    setViewLogs((data ?? []) as DailyWorkLog[]);
    setViewLoading(false);
  }

  const isConfirmed = !!todayLog?.confirmed_at;
  const checkedCount = Object.values(taskChecks).filter(Boolean).length;

  // ── 렌더: ADMIN 조회 모드 ──
  if (isAdmin && viewMode) {
    return (
      <div className="space-y-4">
        <div className={`${card} p-4`}>
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <div className="mb-1 text-xs text-slate-500">조회 날짜</div>
              <input type="date" className={inp} style={{ width: 160 }} value={viewDate}
                onChange={(e) => setViewDate(e.target.value)} />
            </div>
            <button className={btn} onClick={loadViewLogs}>🔄 조회</button>
            <button className={btnSm} onClick={() => window.print()}>🖨️ 인쇄</button>
            <button className="ml-auto rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
              onClick={() => setViewMode(false)}>← 작성 모드</button>
          </div>
        </div>
        {viewLoading ? (
          <div className={`${card} p-8 text-center text-sm text-slate-400`}>불러오는 중...</div>
        ) : viewLogs.length === 0 ? (
          <div className={`${card} p-8 text-center text-sm text-slate-400`}>해당 날짜 생산일지가 없습니다.</div>
        ) : (
          viewLogs.map((log) => (
            <div key={log.id} className={`${card} p-4`}>
              <div className="flex items-center justify-between mb-3">
                <div className="font-bold text-base">👤 {log.employee_name}</div>
                <div className="flex items-center gap-2">
                  {log.confirmed_at
                    ? <span className="rounded-full border border-green-200 bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-700">✅ 확인완료</span>
                    : <span className="rounded-full border border-amber-200 bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">미확인</span>}
                </div>
              </div>
              {/* 작업지시서 */}
              {(log.work_order_nos ?? []).length > 0 && (
                <div className="mb-3">
                  <div className="mb-1.5 text-xs font-semibold text-slate-500">처리한 작업지시서</div>
                  <div className="flex flex-wrap gap-1.5">
                    {(log.work_order_nos ?? []).map((no) => (
                      <span key={no} className="rounded-lg border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-mono text-blue-700">{no}</span>
                    ))}
                  </div>
                </div>
              )}
              {/* 업무 체크 */}
              <div className="mb-3">
                <div className="mb-1.5 text-xs font-semibold text-slate-500">업무 체크</div>
                <div className="flex flex-wrap gap-2">
                  {taskTypes.map((t) => {
                    const checked = (log.task_checks ?? {})[t.id] === true;
                    return (
                      <span key={t.id} className={`rounded-lg border px-2 py-1 text-xs font-medium ${checked ? "border-green-200 bg-green-50 text-green-700" : "border-slate-200 bg-slate-50 text-slate-400 line-through"}`}>
                        {checked ? "✅" : "☐"} {t.name}
                      </span>
                    );
                  })}
                </div>
              </div>
              {log.extra_note && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  <span className="font-semibold">기타: </span>{log.extra_note}
                </div>
              )}
              {log.confirmed_at && (
                <div className="mt-2 text-[11px] text-slate-400">
                  확인시각: {new Date(log.confirmed_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    );
  }

  // ── 렌더: 작업자 선택 ──
  if (!selectedEmployee || pinStep) {
    return (
      <div className="space-y-4">
        {isAdmin && (
          <div className="flex justify-end">
            <button className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
              onClick={() => { setViewMode(true); loadViewLogs(); }}>📋 조회 모드</button>
          </div>
        )}

        {/* 작업자 선택 */}
        {!pinStep && (
          <div className={`${card} p-6`}>
            <div className="mb-4 font-semibold text-base text-slate-700">👤 오늘 작업자를 선택하세요</div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {employees.map((emp) => (
                <button key={emp.id}
                  className="rounded-2xl border-2 border-slate-200 bg-white px-4 py-5 text-center font-bold text-slate-700 text-base hover:border-blue-400 hover:bg-blue-50 active:scale-95 transition-all"
                  onClick={() => handleEmployeeSelect(emp)}>
                  {emp.name}
                  <div className="mt-1 text-[10px] font-normal text-slate-400">
                    {emp.pin ? "PIN 설정됨" : "PIN 미설정"}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* PIN 입력 */}
        {pinStep && selectedEmployee && (
          <div className={`${card} p-6 max-w-xs mx-auto`}>
            <button className="mb-4 text-xs text-slate-400 hover:text-slate-600"
              onClick={() => { setPinStep(false); setSelectedEmployee(null); setPinInput(""); setPinError(""); }}>
              ← 작업자 선택으로
            </button>
            <div className="mb-1 font-semibold text-base text-slate-700 text-center">{selectedEmployee.name}</div>
            <div className="mb-4 text-sm text-slate-500 text-center">PIN 4자리를 입력하세요</div>
            {/* PIN 표시 */}
            <div className="flex justify-center gap-3 mb-4">
              {[0,1,2,3].map((i) => (
                <div key={i} className={`w-10 h-10 rounded-xl border-2 flex items-center justify-center text-lg font-bold transition-all
                  ${pinInput.length > i ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 bg-slate-50 text-slate-300"}`}>
                  {pinInput.length > i ? "●" : "○"}
                </div>
              ))}
            </div>
            {pinError && <div className="mb-3 text-center text-xs text-red-500">{pinError}</div>}
            {/* 키패드 */}
            <div className="grid grid-cols-3 gap-2">
              {["1","2","3","4","5","6","7","8","9","","0","⌫"].map((d, i) => (
                <button key={i}
                  className={`rounded-xl border py-3 text-lg font-semibold transition-all
                    ${d === "" ? "invisible" : "border-slate-200 bg-white hover:bg-slate-50 active:bg-slate-100 active:scale-95"}`}
                  onClick={() => {
                    if (d === "⌫") { setPinInput((p) => p.slice(0, -1)); setPinError(""); }
                    else if (d !== "") handlePinDigit(d);
                  }}>
                  {d}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── 렌더: 일지 작성 ──
  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className={`${card} p-4`}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <div className="font-bold text-base">📝 {selectedEmployee.name}의 생산일지</div>
            <div className="text-xs text-slate-500 mt-0.5">{today}</div>
          </div>
          <div className="flex items-center gap-2">
            {isConfirmed && (
              <span className="rounded-full border border-green-200 bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700">
                ✅ {new Date(todayLog!.confirmed_at!).toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit" })} 확인완료
              </span>
            )}
            <button className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-50"
              onClick={() => { setSelectedEmployee(null); setPinStep(false); setPinInput(""); }}>
              작업자 변경
            </button>
            {isAdmin && (
              <button className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
                onClick={() => { setViewMode(true); loadViewLogs(); }}>📋 조회</button>
            )}
            <button className={btnSm} onClick={() => window.print()}>🖨️ 인쇄</button>
          </div>
        </div>
      </div>

      {/* 작업지시서 목록 */}
      <div className={`${card} p-4`}>
        <div className="mb-3 font-semibold text-sm">✅ 오늘 처리한 작업지시서</div>
        {workOrders.length === 0 ? (
          <div className="py-3 text-center text-sm text-slate-400">
            오늘 날짜 기준 생산완료된 작업지시서가 없습니다.
          </div>
        ) : (
          <div className="space-y-2">
            {workOrders.map((wo) => (
              <div key={wo.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <span className="font-mono text-xs text-blue-600 font-semibold">{wo.work_order_no}</span>
                <span className="text-sm font-medium text-slate-700">{wo.client_name}</span>
                <span className="text-xs text-slate-500">{wo.product_name}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 업무 체크리스트 */}
      <div className={`${card} p-4`}>
        <div className="mb-3 flex items-center justify-between">
          <div className="font-semibold text-sm">📋 업무 체크리스트</div>
          <div className="text-xs text-slate-400">{checkedCount}/{taskTypes.length} 완료</div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {taskTypes.map((t) => {
            const checked = taskChecks[t.id] === true;
            return (
              <button key={t.id}
                disabled={isConfirmed}
                className={`rounded-xl border-2 px-3 py-3 text-sm font-medium text-left transition-all
                  ${checked
                    ? "border-green-400 bg-green-50 text-green-700"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"}
                  ${isConfirmed ? "opacity-60 cursor-not-allowed" : "active:scale-95"}`}
                onClick={() => setTaskChecks((prev) => ({ ...prev, [t.id]: !prev[t.id] }))}>
                <span className="mr-1.5">{checked ? "✅" : "☐"}</span>
                {t.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* 기타 입력 */}
      <div className={`${card} p-4`}>
        <div className="mb-2 font-semibold text-sm">📝 기타 특이사항</div>
        <textarea
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:outline-none resize-none"
          rows={3}
          placeholder="오늘 특이사항, 메모 등을 자유롭게 입력하세요"
          value={extraNote}
          disabled={isConfirmed}
          onChange={(e) => setExtraNote(e.target.value)}
        />
      </div>

      {/* 저장 / 확인 완료 버튼 */}
      <div className={`${card} p-4 flex gap-3`}>
        {!isConfirmed ? (
          <>
            <button
              className="flex-1 rounded-xl border border-slate-300 bg-white py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60"
              disabled={saving} onClick={saveLog}>
              {saving ? "저장 중..." : "💾 임시저장"}
            </button>
            <button
              className="flex-1 rounded-xl border border-green-500 bg-green-600 py-2.5 text-sm font-bold text-white hover:bg-green-700 disabled:opacity-60"
              disabled={confirming} onClick={confirmLog}>
              {confirming ? "처리 중..." : "✅ 확인 완료 (오늘 일지 확정)"}
            </button>
          </>
        ) : (
          <div className="flex-1 rounded-xl border border-green-200 bg-green-50 py-2.5 text-sm font-semibold text-green-700 text-center">
            ✅ 오늘 생산일지가 확정되었습니다
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 탭 2: 원료수불부
// ═══════════════════════════════════════════════════════════
function MaterialLedgerTab({ role, userId, showToast }: {
  role: UserRole; userId: string | null;
  showToast: (msg: string, type?: "success" | "error") => void;
}) {
  const isAdminOrSubadmin = role === "ADMIN" || role === "SUBADMIN";

  const [stocks, setStocks] = useState<MaterialStock[]>([]);
  const [receipts, setReceipts] = useState<MaterialReceipt[]>([]);
  const [filterDate, setFilterDate] = useState(new Date().toISOString().slice(0, 10));
  const [filterCategory, setFilterCategory] = useState("전체");
  const [loading, setLoading] = useState(false);
  const [showReceiptForm, setShowReceiptForm] = useState(false);
  const [materials, setMaterials] = useState<{ id: string; name: string; category: string }[]>([]);

  // 입고 폼
  const [rMaterialId, setRMaterialId] = useState("");
  const [rDate, setRDate] = useState(new Date().toISOString().slice(0, 10));
  const [rQty, setRQty] = useState("");
  const [rExpiry, setRExpiry] = useState("");
  const [rSupplier, setRSupplier] = useState("");
  const [rNote, setRNote] = useState("");
  const [saving, setSaving] = useState(false);

  const categories = useMemo(() => {
    const cats = [...new Set(stocks.map((s) => s.category))].sort();
    return ["전체", ...cats];
  }, [stocks]);

  const filteredStocks = useMemo(() =>
    filterCategory === "전체" ? stocks : stocks.filter((s) => s.category === filterCategory),
    [stocks, filterCategory]
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    const [stockRes, receiptRes] = await Promise.all([
      supabase.from("v_material_stock").select("*").order("category").order("material_name"),
      supabase.from("material_receipts")
        .select("id,received_date,material_id,quantity,unit,expiry_date,supplier,note,material:materials(name)")
        .eq("received_date", filterDate)
        .order("created_at", { ascending: false }),
    ]);
    setStocks((stockRes.data ?? []) as MaterialStock[]);
    setReceipts((receiptRes.data ?? []) as unknown as MaterialReceipt[]);
    setLoading(false);
  }, [filterDate]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => {
    supabase.from("materials").select("id,name,category").order("name")
      .then(({ data }) => setMaterials(data ?? []));
  }, []);

  async function saveReceipt() {
    if (!rMaterialId || !rQty) return showToast("원료와 수량을 입력하세요.", "error");
    setSaving(true);
    const { error } = await supabase.from("material_receipts").insert({
      material_id: rMaterialId,
      received_date: rDate,
      quantity: Number(rQty),
      unit: "g",
      expiry_date: rExpiry || null,
      supplier: rSupplier.trim() || null,
      note: rNote.trim() || null,
      created_by: userId,
    });
    setSaving(false);
    if (error) return showToast("저장 실패: " + error.message, "error");
    showToast("✅ 입고 등록 완료!");
    setShowReceiptForm(false);
    setRMaterialId(""); setRQty(""); setRExpiry(""); setRSupplier(""); setRNote("");
    loadData();
  }

  return (
    <div className="space-y-4">
      {/* 필터 */}
      <div className={`${card} p-4`}>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <div className="mb-1 text-xs text-slate-500">입고일 조회</div>
            <input type="date" className={inp} style={{ width: 160 }} value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)} />
          </div>
          <div>
            <div className="mb-1 text-xs text-slate-500">분류</div>
            <select className={inp} style={{ width: 160 }} value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <button className={btn} onClick={loadData}>🔄 조회</button>
          {isAdminOrSubadmin && (
            <button
              className={showReceiptForm ? btnOn : "rounded-xl border border-blue-300 bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-700 hover:bg-blue-100"}
              onClick={() => setShowReceiptForm((v) => !v)}
            >
              {showReceiptForm ? "✕ 닫기" : "✚ 입고 등록"}
            </button>
          )}
          <button className={btnSm} onClick={() => window.print()}>🖨️ 인쇄</button>
        </div>
      </div>

      {/* 입고 등록 폼 */}
      {showReceiptForm && isAdminOrSubadmin && (
        <div className={`${card} p-4`}>
          <div className="mb-3 font-semibold text-sm text-blue-700">✚ 원료 입고 등록</div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div>
              <div className="mb-1 text-xs text-slate-500">원료 *</div>
              <select className={inp} value={rMaterialId} onChange={(e) => setRMaterialId(e.target.value)}>
                <option value="">— 원료 선택 —</option>
                {materials.map((m) => (
                  <option key={m.id} value={m.id}>[{m.category}] {m.name}</option>
                ))}
              </select>
            </div>
            <div>
              <div className="mb-1 text-xs text-slate-500">입고일 *</div>
              <input type="date" className={inp} value={rDate} onChange={(e) => setRDate(e.target.value)} />
            </div>
            <div>
              <div className="mb-1 text-xs text-slate-500">수량 (g) *</div>
              <input className={inpR} inputMode="numeric" value={rQty}
                onChange={(e) => setRQty(e.target.value.replace(/[^\d]/g, ""))} placeholder="g" />
            </div>
            <div>
              <div className="mb-1 text-xs text-slate-500">소비기한</div>
              <input type="date" className={inp} value={rExpiry} onChange={(e) => setRExpiry(e.target.value)} />
            </div>
            <div>
              <div className="mb-1 text-xs text-slate-500">공급업체</div>
              <input className={inp} value={rSupplier} onChange={(e) => setRSupplier(e.target.value)} />
            </div>
            <div>
              <div className="mb-1 text-xs text-slate-500">비고</div>
              <input className={inp} value={rNote} onChange={(e) => setRNote(e.target.value)} />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60"
              disabled={saving} onClick={saveReceipt}
            >
              {saving ? "저장 중..." : "💾 입고 등록"}
            </button>
            <button className={btn} onClick={() => setShowReceiptForm(false)}>취소</button>
          </div>
        </div>
      )}

      {/* 현재고 현황 */}
      <div className={`${card} p-4`}>
        <div className="mb-3 font-semibold text-sm">🧪 원료별 현재고</div>
        {loading ? (
          <div className="py-4 text-center text-sm text-slate-400">불러오는 중...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-2 px-3 text-xs text-slate-500 font-semibold">분류</th>
                  <th className="text-left py-2 px-3 text-xs text-slate-500 font-semibold">원료명</th>
                  <th className="text-right py-2 px-3 text-xs text-slate-500 font-semibold">입고</th>
                  <th className="text-right py-2 px-3 text-xs text-slate-500 font-semibold">사용</th>
                  <th className="text-right py-2 px-3 text-xs text-slate-500 font-semibold">폐기</th>
                  <th className="text-right py-2 px-3 text-xs text-slate-500 font-semibold">현재고</th>
                  <th className="text-center py-2 px-3 text-xs text-slate-500 font-semibold">상태</th>
                </tr>
              </thead>
              <tbody>
                {filteredStocks.map((s) => (
                  <tr key={s.material_id} className={`border-b border-slate-100 hover:bg-slate-50 ${s.is_below_safety_stock ? "bg-red-50" : ""}`}>
                    <td className="py-2 px-3 text-xs text-slate-500">{s.category}</td>
                    <td className="py-2 px-3 font-medium">{s.material_name}</td>
                    <td className="py-2 px-3 text-right tabular-nums text-green-700">{s.total_received.toLocaleString()}{s.unit}</td>
                    <td className="py-2 px-3 text-right tabular-nums text-blue-700">{s.total_used.toLocaleString()}{s.unit}</td>
                    <td className="py-2 px-3 text-right tabular-nums text-slate-500">{s.total_disposed.toLocaleString()}{s.unit}</td>
                    <td className={`py-2 px-3 text-right tabular-nums font-bold ${s.current_stock < 0 ? "text-red-600" : s.is_below_safety_stock ? "text-amber-600" : "text-slate-800"}`}>
                      {s.current_stock.toLocaleString()}{s.unit}
                    </td>
                    <td className="py-2 px-3 text-center">
                      {s.is_below_safety_stock ? (
                        <span className="rounded-full border border-amber-200 bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">⚠ 미달</span>
                      ) : (
                        <span className="rounded-full border border-green-200 bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-700">정상</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 당일 입고 내역 */}
      <div className={`${card} p-4`}>
        <div className="mb-3 font-semibold text-sm">📦 입고 내역 — {filterDate}</div>
        {receipts.length === 0 ? (
          <div className="py-4 text-center text-sm text-slate-400">해당 날짜 입고 내역이 없습니다.</div>
        ) : (
          <div className="space-y-2">
            {receipts.map((r) => (
              <div key={r.id} className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{(r.material as any)?.name ?? "—"}</div>
                  <div className="text-xs text-slate-500">
                    수량: <b>{r.quantity.toLocaleString()}{r.unit}</b>
                    {r.expiry_date && ` · 소비기한: ${r.expiry_date}`}
                    {r.supplier && ` · 공급: ${r.supplier}`}
                    {r.note && ` · ${r.note}`}
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
// 탭 3: 근무일지
// ═══════════════════════════════════════════════════════════
function WorkLogTab({ role, userId, showToast }: {
  role: UserRole; userId: string | null;
  showToast: (msg: string, type?: "success" | "error") => void;
}) {
  const isAdminOrSubadmin = role === "ADMIN" || role === "SUBADMIN";
  const isAdmin = role === "ADMIN";

  const [logs, setLogs] = useState<WorkLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterDate, setFilterDate] = useState(new Date().toISOString().slice(0, 10));
  const [showForm, setShowForm] = useState(false);
  const [employees, setEmployees] = useState<{ id: string; name: string | null }[]>([]);

  // 폼 state
  const [fDate, setFDate] = useState(new Date().toISOString().slice(0, 10));
  const [fWorkerName, setFWorkerName] = useState("");
  const [fClockIn, setFClockIn] = useState("");
  const [fClockOut, setFClockOut] = useState("");
  const [fInstruction, setFInstruction] = useState("");
  const [fExtraWork, setFExtraWork] = useState("");
  const [fNote, setFNote] = useState("");
  const [saving, setSaving] = useState(false);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("work_logs")
      .select(`id, log_date, worker_id, worker_name, clock_in, clock_out,
        production_summary, instruction, extra_work, note,
        created_by, confirmed_by, approved_by, approved_at,
        creator:users!created_by(name),
        confirmer:users!confirmed_by(name),
        approver:users!approved_by(name)`)
      .eq("log_date", filterDate)
      .order("created_at", { ascending: false });
    setLogs((data ?? []) as unknown as WorkLog[]);
    setLoading(false);
  }, [filterDate]);

  useEffect(() => { loadLogs(); }, [loadLogs]);
  useEffect(() => {
    supabase.from("employees").select("id,name").is("resign_date", null).order("name")
      .then(({ data }) => setEmployees(data ?? []));
  }, []);

  // 당일 생산요약 자동 생성
  async function buildProductionSummary(date: string): Promise<string> {
    const { data } = await supabase.from("production_logs")
      .select("work_type, work_name, quantity, formula:product_formulas(name)")
      .eq("log_date", date);
    if (!data || data.length === 0) return "";
    return (data as any[]).map((d) => {
      const name = (d.formula as any)?.name ?? d.work_name ?? WORK_TYPE_LABELS[d.work_type] ?? d.work_type;
      const qty = d.quantity ? ` ${d.quantity.toLocaleString()}` : "";
      return `${name}${qty}`;
    }).join(", ");
  }

  async function saveLog() {
    if (!fDate || !fWorkerName) return showToast("날짜와 담당자를 입력하세요.", "error");
    setSaving(true);
    const summary = await buildProductionSummary(fDate);
    const { error } = await supabase.from("work_logs").insert({
      log_date: fDate,
      worker_name: fWorkerName,
      clock_in: fClockIn || null,
      clock_out: fClockOut || null,
      production_summary: summary || null,
      instruction: fInstruction.trim() || null,
      extra_work: fExtraWork.trim() || null,
      note: fNote.trim() || null,
      created_by: userId,
    });
    setSaving(false);
    if (error) return showToast("저장 실패: " + error.message, "error");
    showToast("✅ 근무일지 등록 완료!");
    setShowForm(false);
    setFWorkerName(""); setFClockIn(""); setFClockOut(""); setFInstruction(""); setFExtraWork(""); setFNote("");
    loadLogs();
  }

  async function approveLog(logId: string, step: "confirm" | "approve") {
    const field = step === "confirm"
      ? { confirmed_by: userId }
      : { approved_by: userId, approved_at: new Date().toISOString() };
    const { error } = await supabase.from("work_logs").update(field).eq("id", logId);
    if (error) return showToast("처리 실패: " + error.message, "error");
    showToast(step === "confirm" ? "✅ 확인 완료!" : "✅ 승인 완료!");
    loadLogs();
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
          <button className={btn} onClick={loadLogs}>🔄 조회</button>
          {isAdminOrSubadmin && (
            <button
              className={showForm ? btnOn : "rounded-xl border border-blue-300 bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-700 hover:bg-blue-100"}
              onClick={() => setShowForm((v) => !v)}
            >
              {showForm ? "✕ 닫기" : "✚ 근무일지 등록"}
            </button>
          )}
          <button className={btnSm} onClick={() => window.print()}>🖨️ 인쇄</button>
        </div>
      </div>

      {/* 등록 폼 */}
      {showForm && isAdminOrSubadmin && (
        <div className={`${card} p-4`}>
          <div className="mb-3 font-semibold text-sm text-blue-700">✚ 근무일지 신규 등록</div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div>
              <div className="mb-1 text-xs text-slate-500">날짜 *</div>
              <input type="date" className={inp} value={fDate} onChange={(e) => setFDate(e.target.value)} />
            </div>
            <div>
              <div className="mb-1 text-xs text-slate-500">담당자 *</div>
              <select className={inp} value={fWorkerName} onChange={(e) => setFWorkerName(e.target.value)}>
                <option value="">— 담당자 선택 —</option>
                {employees.map((e) => e.name ? (
                  <option key={e.id} value={e.name}>{e.name}</option>
                ) : null)}
              </select>
            </div>
            <div>
              <div className="mb-1 text-xs text-slate-500">출근</div>
              <input type="time" className={inp} value={fClockIn} onChange={(e) => setFClockIn(e.target.value)} />
            </div>
            <div>
              <div className="mb-1 text-xs text-slate-500">퇴근</div>
              <input type="time" className={inp} value={fClockOut} onChange={(e) => setFClockOut(e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <div className="mb-1 text-xs text-slate-500">지시사항</div>
              <input className={inp} value={fInstruction} onChange={(e) => setFInstruction(e.target.value)}
                placeholder="당일 지시사항" />
            </div>
            <div className="md:col-span-2">
              <div className="mb-1 text-xs text-slate-500">기타작업기록</div>
              <input className={inp} value={fExtraWork} onChange={(e) => setFExtraWork(e.target.value)}
                placeholder="청소, 재고정리 등" />
            </div>
            <div>
              <div className="mb-1 text-xs text-slate-500">비고</div>
              <input className={inp} value={fNote} onChange={(e) => setFNote(e.target.value)} />
            </div>
          </div>
          <div className="mt-2 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-600">
            💡 생산목록은 해당 날짜의 생산일지에서 자동으로 불러옵니다.
          </div>
          <div className="mt-4 flex gap-2">
            <button
              className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60"
              disabled={saving} onClick={saveLog}
            >
              {saving ? "저장 중..." : "💾 등록"}
            </button>
            <button className={btn} onClick={() => setShowForm(false)}>취소</button>
          </div>
        </div>
      )}

      {/* 목록 */}
      <div className={`${card} p-4`}>
        <div className="mb-3 flex items-center justify-between">
          <div className="font-semibold text-sm">근무일지 목록 — {filterDate}</div>
          <div className="text-xs text-slate-400">{logs.length}건</div>
        </div>
        {loading ? (
          <div className="py-8 text-center text-sm text-slate-400">불러오는 중...</div>
        ) : logs.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-400">해당 날짜 근무일지가 없습니다.</div>
        ) : (
          <div className="space-y-3">
            {logs.map((log) => (
              <div key={log.id} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
                  <div>
                    <div className="font-bold text-base">👤 {log.worker_name}</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {log.clock_in && `출근: ${log.clock_in}`}
                      {log.clock_in && log.clock_out && " · "}
                      {log.clock_out && `퇴근: ${log.clock_out}`}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 items-end">
                    {!log.confirmed_by && !isAdminOrSubadmin && (
                      <button className="rounded-lg border border-violet-300 bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700 hover:bg-violet-100"
                        onClick={() => approveLog(log.id, "confirm")}>✅ 확인</button>
                    )}
                    {log.confirmed_by && !log.approved_by && isAdmin && (
                      <button className="rounded-lg border border-green-300 bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-700 hover:bg-green-100"
                        onClick={() => approveLog(log.id, "approve")}>✅ 최종승인</button>
                    )}
                    {log.approved_by && (
                      <span className="rounded-full border border-green-200 bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">승인완료</span>
                    )}
                  </div>
                </div>
                <div className="space-y-1.5 text-sm">
                  {log.production_summary && (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                      <span className="font-semibold text-slate-600">생산목록: </span>{log.production_summary}
                    </div>
                  )}
                  {log.instruction && (
                    <div className="text-xs text-slate-600"><span className="font-semibold">지시사항:</span> {log.instruction}</div>
                  )}
                  {log.extra_work && (
                    <div className="text-xs text-slate-600"><span className="font-semibold">기타작업:</span> {log.extra_work}</div>
                  )}
                  {log.note && (
                    <div className="text-xs text-slate-500">비고: {log.note}</div>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-400">
                  <span>작성: {(log.creator as any)?.name ?? "—"}</span>
                  <span>확인: {(log.confirmer as any)?.name ?? "미확인"}</span>
                  <span>승인: {(log.approver as any)?.name ?? "미승인"}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
