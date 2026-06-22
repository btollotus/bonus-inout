"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { Ccp1bTab, OtherHeatingTab, CompressorTab, PetLedgerTab } from "./tabs-extra";
import { Ccp1pTab } from "./Ccp1pTab";
import { ExpiryMgmtTab, WarmerCleaningTab, PestTab, ForeignMatterTab, HygieneCheckTab, TempHumidityTab, StorageTempTab } from "./tabs-hygiene";
import { NewProductionLogTab } from "./NewProductionLogTab";
import { ProductionDashboard } from "./ProductionDashboard";
import { HygieneTrainingTab, MonitoringTrainingTab } from "./tabs-training";
import { todayKST } from "@/lib/utils/date";

const supabase = createClient();

// ─────────────────────── Styles ───────────────────────
const card = "rounded-2xl border border-slate-200 bg-white shadow-sm";
const inp = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:outline-none";
const inpR = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-right tabular-nums focus:border-blue-400 focus:outline-none";
const btn = "rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50 active:bg-slate-100";
const btnOn = "rounded-xl border border-blue-500 bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700";
const btnSm = "rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium hover:bg-slate-50";

type UserRole = "ADMIN" | "SUBADMIN" | "USER" | null;

type Tab = "dashboard" | "production" | "material" | "work" | "ccp1b" | "ccp1p" | "other_heating" | "compressor" | "pet"
  | "expiry" | "warmer_clean" | "pest" | "foreign" | "hygiene" | "temp_humidity" | "storage_temp" | "training";

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
  daily_used: number;
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

  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [initialWoId, setInitialWoId] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab") as Tab | null;
    const wo = params.get("wo");
    if (tab) setActiveTab(tab);
    if (wo) setInitialWoId(wo);
  }, []);

  useEffect(() => {
    const TAB_TITLES: Record<Tab, string> = {
      dashboard: "통합관리",
      production: "생산일지",
      material: "원료수불부",
      work: "근무일지",
      ccp1b: "CCP-1B",
      ccp1p: "CCP-1P",
      other_heating: "가열공정",
      compressor: "압축공기",
      pet: "PET수불부",
      expiry: "유효기간관리",
      warmer_clean: "온장고세척",
      pest: "방충방서",
      foreign: "이물관리",
      hygiene: "위생관리",
      temp_humidity: "온습도",
      storage_temp: "냉장·냉동·온장고",
      training: "사내교육",
    };
    document.title = `${TAB_TITLES[activeTab] ?? "생산관리"} | BONUSMATE`;
  }, [activeTab]);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const isAdmin = role === "ADMIN";
  

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
          
        </div>

        {/* 탭 + 컨텐츠 레이아웃 */}
        <div className="flex gap-4 items-start">
        {/* 왼쪽 사이드바 탭 */}
        <div className="flex flex-col gap-1 w-36 shrink-0">
        {([
            { key: "dashboard",     label: "■ 통합관리" },
            { key: "production",    label: "■ 생산일지" },
            { key: "material",      label: "■ 원료수불부" },
            { key: "work",          label: "■ 근무일지" },
            { key: "ccp1b",         label: "■ CCP-1B" },
            { key: "ccp1p",         label: "■ CCP-1P" },
            { key: "other_heating", label: "■ 가열공정" },
            { key: "compressor",    label: "■ 압축공기" },
            { key: "pet",           label: "■ PET수불부" },
            { key: "warmer_clean",  label: "■ 온장고세척" },
            { key: "pest",          label: "■ 방충방서" },
            { key: "foreign",       label: "■ 이물관리" },
            { key: "hygiene",       label: "■ 위생관리" },
            { key: "temp_humidity", label: "■ 온습도" },
            { key: "storage_temp",  label: "■ 냉장·냉동·온장고" },
            { key: "training",      label: "■ 사내교육" },
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
{activeTab === "dashboard" && (
  <ProductionDashboard role={role} userId={userId} onTabChange={(tab) => setActiveTab(tab as Tab)} />
)}
{activeTab === "production" && (
  <NewProductionLogTab role={role} userId={userId} showToast={showToast} />
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
          <Ccp1pTab role={role} userId={userId} showToast={showToast} initialWoId={initialWoId} />
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
{activeTab === "training"      && <TrainingTab role={role} userId={userId} showToast={showToast} />}

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
// 사내교육 (위생교육 / 모니터링교육 서브탭)
// ═══════════════════════════════════════════════════════════
function TrainingTab({ role, userId, showToast }: {
  role: UserRole; userId: string | null;
  showToast: (msg: string, type?: "success" | "error") => void;
}) {
  const [subTab, setSubTab] = useState<"hygiene_edu" | "monitoring_edu">("hygiene_edu");

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button
          className={subTab === "hygiene_edu" ? btnOn : btn}
          onClick={() => setSubTab("hygiene_edu")}
        >위생교육</button>
        <button
          className={subTab === "monitoring_edu" ? btnOn : btn}
          onClick={() => setSubTab("monitoring_edu")}
        >모니터링교육</button>
      </div>

      {subTab === "hygiene_edu" && (
        <HygieneTrainingTab role={role} userId={userId} showToast={showToast} />
      )}
      {subTab === "monitoring_edu" && (
        <MonitoringTrainingTab role={role} userId={userId} showToast={showToast} />
      )}
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
  assignee_transfer: string | null;
  tags: string[]; // ["생산완료", "전사인쇄"]
};

type WoInfoMap = Record<string, { client_name: string; product_name: string }>;

function ProductionLogTab({ role, userId, showToast }: {
  role: UserRole; userId: string | null;
  showToast: (msg: string, type?: "success" | "error") => void;
}) {
  const isAdmin = role === "ADMIN";
  const isAdminOrSubadmin = role === "ADMIN" || role === "SUBADMIN";

  // ── 작업자 선택 + PIN 인증 ──
  const [employees, setEmployees] = useState<{ id: string; name: string; pin: string | null }[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<{ id: string; name: string } | null>(null);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState("");
  const [pinStep, setPinStep] = useState(false);
  const [readOnly, setReadOnly] = useState(false); // ← 추가: 열람 전용 모드

  // ── 일지 데이터 ──
  const [taskTypes, setTaskTypes] = useState<TaskType[]>([]);
  const [todayLog, setTodayLog] = useState<DailyWorkLog | null>(null);
  const [workOrders, setWorkOrders] = useState<WorkOrderRef[]>([]);
  const [taskChecks, setTaskChecks] = useState<Record<string, boolean>>({});
  const [extraNote, setExtraNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [woInfoMap, setWoInfoMap] = useState<WoInfoMap>({});
  const [clockInfo, setClockInfo] = useState<{ in: string | null; out: string | null }>({ in: null, out: null });

  // ── 조회 ──
  const [viewDate, setViewDate] = useState(todayKST());
  const [viewMode, setViewMode] = useState(false);
  const [viewLogs, setViewLogs] = useState<DailyWorkLog[]>([]);
  const [viewLoading, setViewLoading] = useState(false);
  const [viewClockMap, setViewClockMap] = useState<Record<string, { in: string | null; out: string | null }>>({});
  const [woTagMap, setWoTagMap] = useState<Record<string, Record<string, string[]>>>({});
  const [viewRaizeCutMap, setViewRaizeCutMap] = useState<Record<string, number>>({});
  const [todayRaizeCut, setTodayRaizeCut] = useState<number | null>(null);
  const [pestDoneThisWeek, setPestDoneThisWeek] = useState(false);

  // 작업자 선택 화면용 — 선택 날짜 기준 출퇴근+작성여부 맵
  const [empStatusMap, setEmpStatusMap] = useState<Record<string, {
    clockIn: string | null; clockOut: string | null; hasLog: boolean; confirmed: boolean;
  }>>({});

  const today = todayKST();
  const [workDate, setWorkDate] = useState(today);

  useEffect(() => {
    supabase.from("employees").select("id,name,pin").is("resign_date", null).order("name")
      .then(({ data }) => {
        const sorted = (data ?? []).sort((a: any, b: any) => {
          const LAST = ["강미라", "조대성"];
          const aLast = LAST.includes(a.name) ? 1 : 0;
          const bLast = LAST.includes(b.name) ? 1 : 0;
          if (aLast !== bLast) return aLast - bLast;
          return (a.name ?? "").localeCompare(b.name ?? "", "ko");
        });
        setEmployees(sorted as any);
      });
    supabase.from("production_task_types").select("id,name,order_no").eq("is_active", true).order("order_no")
      .then(({ data }) => setTaskTypes(data ?? []));
  }, []);

  // 작업자 선택 화면용 상태 로드
  const loadEmpStatus = useCallback(async (date: string) => {
    const [attRes, logRes] = await Promise.all([
      supabase.from("attendance")
        .select("employee_id, type, happened_at")
        .gte("happened_at", `${date}T00:00:00+09:00`)
        .lte("happened_at", `${date}T23:59:59+09:00`),
      supabase.from("daily_work_logs")
        .select("employee_id, confirmed_at")
        .eq("log_date", date),
    ]);
    const map: Record<string, { clockIn: string | null; clockOut: string | null; hasLog: boolean; confirmed: boolean }> = {};
    (attRes.data ?? []).forEach((a: any) => {
      if (!map[a.employee_id]) map[a.employee_id] = { clockIn: null, clockOut: null, hasLog: false, confirmed: false };
      const t = new Date(a.happened_at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Seoul" });
      if (a.type === "IN") map[a.employee_id].clockIn = t;
      if (a.type === "OUT") map[a.employee_id].clockOut = t;
    });
    (logRes.data ?? []).forEach((l: any) => {
      if (!map[l.employee_id]) map[l.employee_id] = { clockIn: null, clockOut: null, hasLog: false, confirmed: false };
      map[l.employee_id].hasLog = true;
      map[l.employee_id].confirmed = !!l.confirmed_at;
    });
    setEmpStatusMap(map);
  }, []);

  useEffect(() => { loadEmpStatus(workDate); }, [workDate, loadEmpStatus]);

  const loadTodayData = useCallback(async (empId: string, empName: string, date: string) => {
    const [logRes, woRes] = await Promise.all([ 
      supabase.from("daily_work_logs")
        .select("*").eq("log_date", date).eq("employee_id", empId).maybeSingle(),
        Promise.all([
          supabase.from("work_orders")
          .select("id,work_order_no,client_name,product_name,assignee_production,assignee_transfer,assignee_print_check,assignee_input")
          .eq("assignee_production", empName)
          .eq("status_production", true)
          .gte("production_done_at", `${date}T00:00:00+09:00`)
          .order("production_done_at", { ascending: false }),
        supabase.from("work_orders")
          .select("id,work_order_no,client_name,product_name,assignee_production,assignee_transfer,assignee_print_check,assignee_input")
          .eq("assignee_transfer", empName)
          .eq("status_transfer", true)
          .gte("transfer_done_at", `${date}T00:00:00+09:00`)
          .order("transfer_done_at", { ascending: false }),
        supabase.from("work_orders")
          .select("id,work_order_no,client_name,product_name,assignee_production,assignee_transfer,assignee_print_check,assignee_input")
          .eq("assignee_print_check", empName)
          .eq("status_print_check", true)
          .gte("print_check_done_at", `${date}T00:00:00+09:00`)
          .order("print_check_done_at", { ascending: false }),
        supabase.from("work_orders")
          .select("id,work_order_no,client_name,product_name,assignee_production,assignee_transfer,assignee_print_check,assignee_input")
          .eq("assignee_input", empName)
          .eq("status_input", true)
          .gte("input_done_at", `${date}T00:00:00+09:00`)
          .order("input_done_at", { ascending: false }),
        ]).then(([prodRes, transferRes, printCheckRes, inputRes]) => {
          const map = new Map<string, WorkOrderRef>();
          (prodRes.data ?? []).forEach((w: any) => { map.set(w.id, { ...w, tags: ["생산완료"] }); });
          (transferRes.data ?? []).forEach((w: any) => {
            if (map.has(w.id)) { map.get(w.id)!.tags.push("전사인쇄"); }
            else { map.set(w.id, { ...w, tags: ["전사인쇄"] }); }
          });
          (printCheckRes.data ?? []).forEach((w: any) => {
            if (map.has(w.id)) { map.get(w.id)!.tags.push("인쇄검수"); }
            else { map.set(w.id, { ...w, tags: ["인쇄검수"] }); }
          });
          (inputRes.data ?? []).forEach((w: any) => {
            if (map.has(w.id)) { map.get(w.id)!.tags.push("금속검출"); }
            else { map.set(w.id, { ...w, tags: ["금속검출"] }); }
          });
          return { data: Array.from(map.values()) };
        }),
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

    // WO 번호 → 업체명/제품명 맵 구성
    const allNos = (logRes.data as DailyWorkLog | null)?.work_order_nos ?? [];
    const woNosFromOrders = Array.from((woRes.data ?? []) as WorkOrderRef[]).map((w) => w.work_order_no);
    const mergedNos = [...new Set([...allNos, ...woNosFromOrders])];
    if (mergedNos.length > 0) {
      const { data: woData } = await supabase
        .from("work_orders")
        .select("work_order_no, client_name, product_name")
        .in("work_order_no", mergedNos);
      const map: WoInfoMap = {};
      (woData ?? []).forEach((w: any) => {
        map[w.work_order_no] = { client_name: w.client_name, product_name: w.product_name };
      });
      setWoInfoMap(map);
    } else {
      setWoInfoMap({});
    }

    // 레이즈재단 기록 조회
    const { data: raizeData } = await supabase.from("pet_stock_logs")
      .select("quantity")
      .eq("log_date", date)
      .eq("log_type", "sale_cut")
      .ilike("note", `%${empName}%`);
      const raizeTotal = (raizeData ?? []).reduce((s: number, d: any) => s + d.quantity, 0);
      setTodayRaizeCut(raizeTotal > 0 ? raizeTotal : null);
  
      // 이번 주 방충방서 완료 여부 (월요일 기준)
      const todayDate = new Date(date + "T00:00:00+09:00");
      const dayOfWeek = todayDate.getDay(); // 0=일, 1=월 ... 6=토
      const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const monday = new Date(todayDate);
      monday.setDate(todayDate.getDate() + diffToMonday);
      const mondayStr = monday.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
      const { data: pestData } = await supabase.from("pest_flying_records")
        .select("id").gte("record_date", mondayStr).lte("record_date", today).limit(1);
      setPestDoneThisWeek((pestData ?? []).length > 0);

    // 출퇴근 시간 조회
    const { data: attData } = await supabase.from("attendance")
      .select("type,happened_at")
      .eq("employee_id", empId)
      .gte("happened_at", `${date}T00:00:00+09:00`)
      .lte("happened_at", `${date}T23:59:59+09:00`);
    const ci = { in: null as string | null, out: null as string | null };
    (attData ?? []).forEach((a: any) => {
      const t = new Date(a.happened_at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Seoul" });
      if (a.type === "IN") ci.in = t;
      if (a.type === "OUT") ci.out = t;
    });
    setClockInfo(ci);
  }, [today, taskTypes]);

  // ── 열람 진입 (PIN 없이) ──
  function handleEmployeeView(emp: { id: string; name: string; pin: string | null }) {
    setSelectedEmployee({ id: emp.id, name: emp.name });
    setReadOnly(true);
    setPinStep(false);
    setPinInput("");
    setPinError("");
    loadTodayData(emp.id, emp.name, workDate);
  }

  // ── 작성 진입 (PIN 필요) ──
  function handleEmployeeEdit(emp: { id: string; name: string; pin: string | null }) {
    setSelectedEmployee({ id: emp.id, name: emp.name });
    setReadOnly(false);
    setPinInput("");
    setPinError("");
    if (isAdmin) {
      setPinStep(false);
      loadTodayData(emp.id, emp.name, workDate);
    } else {
      setPinStep(true);
    }
  }

  function handlePinDigit(d: string) {
    if (pinInput.length >= 4) return;
    const next = pinInput + d;
    setPinInput(next);
    if (next.length === 4) { setTimeout(() => verifyPin(next), 100); }
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
    loadTodayData(emp.id, emp.name, workDate);
  }

  async function handleTaskCheck(taskId: string, currentChecked: boolean) {
    const nextChecked = !currentChecked;
    setTaskChecks((prev) => ({ ...prev, [taskId]: nextChecked }));

    // 자가품질검사 체크 해제 시 → 차감 기록 삭제
    if (taskId === QC_SAMPLE_TASK_ID && !nextChecked && selectedEmployee) {
      const { error } = await supabase.from("material_usage_logs")
        .delete()
        .eq("used_date", workDate)
        .eq("work_type", "qc_sample")
        .eq("note", `자가품질검사 샘플준비 — ${selectedEmployee.name}`);
      if (error) showToast("차감 취소 실패: " + error.message, "error");
      else showToast("🗑️ 자가품질검사 원료 차감이 취소되었습니다.");
    }

    // 유효성평가검사 체크 해제 시 → 차감 기록 삭제
    if (taskId === VALIDITY_SAMPLE_TASK_ID && !nextChecked && selectedEmployee) {
      const { error } = await supabase.from("material_usage_logs")
        .delete()
        .eq("used_date", workDate)
        .eq("work_type", "validity_sample")
        .eq("note", `유효성평가검사 샘플준비 — ${selectedEmployee.name}`);
      if (error) showToast("차감 취소 실패: " + error.message, "error");
      else showToast("🗑️ 유효성평가검사 원료 차감이 취소되었습니다.");
    }
  }

  async function saveLog() {
    if (!selectedEmployee) return;
    setSaving(true);
    const payload = {
      log_date: workDate,
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
    await loadTodayData(selectedEmployee.id, selectedEmployee.name, workDate);
  }

  async function confirmLog() {
    if (!selectedEmployee) return;
    setConfirming(true);
    const confirmedAt = new Date().toISOString();
    let error;
    if (todayLog) {
      ({ error } = await supabase.from("daily_work_logs")
        .update({ confirmed_at: confirmedAt, task_checks: taskChecks, extra_note: extraNote.trim() || null, work_order_nos: workOrders.map((w) => w.work_order_no), updated_at: confirmedAt })
        .eq("id", todayLog.id));
    } else {
      const { data: existing } = await supabase
        .from("daily_work_logs")
        .select("id")
        .eq("log_date", workDate)
        .eq("employee_id", selectedEmployee.id)
        .maybeSingle();
      if (existing) {
        ({ error } = await supabase.from("daily_work_logs")
          .update({ confirmed_at: confirmedAt, task_checks: taskChecks, extra_note: extraNote.trim() || null, work_order_nos: workOrders.map((w) => w.work_order_no), updated_at: confirmedAt })
          .eq("id", existing.id));
      } else {
        ({ error } = await supabase.from("daily_work_logs").insert({
          log_date: workDate, employee_id: selectedEmployee.id, employee_name: selectedEmployee.name,
          work_order_nos: workOrders.map((w) => w.work_order_no),
          task_checks: taskChecks, extra_note: extraNote.trim() || null,
          confirmed_at: confirmedAt, created_by: userId,
        }));
      }
    }
    setConfirming(false);
    if (error) return showToast("확인 실패: " + error.message, "error");
    showToast("✅ 확인 완료! 근무일지가 확정되었습니다.");
    await loadTodayData(selectedEmployee.id, selectedEmployee.name, workDate);
  }

  async function loadViewLogs() {
    setViewLoading(true);
    const [{ data }, { data: attData }] = await Promise.all([
      supabase.from("daily_work_logs").select("*").eq("log_date", viewDate).order("employee_name"),
      supabase.from("attendance")
        .select("type, happened_at, employee:employees(name)")
        .gte("happened_at", `${viewDate}T00:00:00+09:00`)
        .lte("happened_at", `${viewDate}T23:59:59+09:00`),
    ]);
    const logs = (data ?? []) as DailyWorkLog[];
    setViewLogs(logs);
    const clockMap: Record<string, { in: string | null; out: string | null }> = {};
    (attData ?? []).forEach((a: any) => {
      const name = a.employee?.name;
      if (!name) return;
      if (!clockMap[name]) clockMap[name] = { in: null, out: null };
      const timeKST = new Date(a.happened_at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Seoul" });
      if (a.type === "IN") clockMap[name].in = timeKST;
      if (a.type === "OUT") clockMap[name].out = timeKST;
    });
    setViewClockMap(clockMap);

    const allNos = [...new Set(logs.flatMap((l) => l.work_order_nos ?? []))];
    if (allNos.length > 0) {
      const { data: woData } = await supabase
        .from("work_orders")
        .select("work_order_no, client_name, product_name, assignee_production, assignee_transfer, assignee_print_check, assignee_input")
        .in("work_order_no", allNos);
      const map: WoInfoMap = {};
      const tagMap: Record<string, Record<string, string[]>> = {};
      (woData ?? []).forEach((w: any) => {
        map[w.work_order_no] = { client_name: w.client_name, product_name: w.product_name };
        tagMap[w.work_order_no] = {};
        if (w.assignee_production) {
          if (!tagMap[w.work_order_no][w.assignee_production]) tagMap[w.work_order_no][w.assignee_production] = [];
          tagMap[w.work_order_no][w.assignee_production].push("생산완료");
        }
        if (w.assignee_transfer) {
          if (!tagMap[w.work_order_no][w.assignee_transfer]) tagMap[w.work_order_no][w.assignee_transfer] = [];
          tagMap[w.work_order_no][w.assignee_transfer].push("전사인쇄");
        }
        if (w.assignee_print_check) {
          if (!tagMap[w.work_order_no][w.assignee_print_check]) tagMap[w.work_order_no][w.assignee_print_check] = [];
          tagMap[w.work_order_no][w.assignee_print_check].push("인쇄검수");
        }
        if (w.assignee_input) {
          if (!tagMap[w.work_order_no][w.assignee_input]) tagMap[w.work_order_no][w.assignee_input] = [];
          tagMap[w.work_order_no][w.assignee_input].push("금속검출");
        }
      });
      setWoInfoMap((prev) => ({ ...prev, ...map }));
      setWoTagMap((prev) => ({ ...prev, ...tagMap }));
    }

   // 레이즈재단 기록 조회 (조회 모드용)
   const empNames = logs.map((l) => l.employee_name);
   if (empNames.length > 0) {
     const { data: raizeData } = await supabase.from("pet_stock_logs")
       .select("quantity, note")
       .eq("log_date", viewDate)
       .eq("log_type", "sale_cut");
     const raizeMap: Record<string, number> = {};
     (raizeData ?? []).forEach((d: any) => {
       const match = empNames.find((name) => d.note?.includes(name));
       if (match) raizeMap[match] = (raizeMap[match] ?? 0) + d.quantity;
     });
     setViewRaizeCutMap(raizeMap);
   }

   setViewLoading(false);
 }

 const isConfirmed = !!todayLog?.confirmed_at;
  const checkedCount = Object.values(taskChecks).filter(Boolean).length;
  // 실질적으로 수정 불가 조건: 열람 모드이거나 이미 확인완료된 경우
  const isDisabled = readOnly || isConfirmed;

    // ── 렌더: ADMIN/SUBADMIN 조회 모드 ──
    if (isAdminOrSubadmin && viewMode) {
    return (
      <div className="space-y-4">
        <div className={`${card} p-4`}>
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <div className="mb-1 text-xs text-slate-500">조회 날짜</div>
              <input type="date" className={inp} style={{ width: 160 }} value={viewDate}
                onChange={(e) => setViewDate(e.target.value)} />
            </div>
            <span className="text-sm font-medium text-slate-700">
              {(() => {
                const d = new Date(viewDate + "T00:00:00+09:00");
                const days = ["일","월","화","수","목","금","토"];
                return `(${days[d.getDay()]})`;
              })()}
            </span>
            <button className={btn} onClick={loadViewLogs}>🔄 조회</button>
            <button className={btnSm} onClick={() => {
              const content = document.getElementById("production-view-print-inner");
              if (!content) return;
              const win = window.open("", "_blank");
              if (!win) return;
              win.document.write(`<!DOCTYPE html><html><head>
                <meta charset="utf-8">
                <title>생산일지_${viewDate}</title>
                <style>
                  @page { size: A4 portrait; margin: 15mm 20mm; }
                  body { margin: 0; font-family: 'Malgun Gothic','맑은 고딕',sans-serif; font-size: 9pt; color: #000; }
                  * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                </style>
              </head><body>${content.innerHTML}</body></html>`);
              win.document.close();
              win.focus();
              setTimeout(() => { win.print(); }, 400);
            }}>🖨️ 인쇄</button>
           {isAdmin && (
              <button className="ml-auto rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
                onClick={() => setViewMode(false)}>← 작성 모드</button>
            )}
            {!isAdmin && (
              <button className="ml-auto rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
                onClick={() => { setViewMode(false); setSelectedEmployee(null); }}>← 돌아가기</button>
            )}
          </div>
        </div>
        {viewLoading ? (
          <div className={`${card} p-8 text-center text-sm text-slate-400`}>불러오는 중...</div>
        ) : viewLogs.length === 0 ? (
          <div className={`${card} p-8 text-center text-sm text-slate-400`}>{(() => { const d = new Date(viewDate + "T00:00:00+09:00"); const days = ["일","월","화","수","목","금","토"]; return `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일 (${days[d.getDay()]}) 근무일지가 없습니다.`; })()}</div>
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
              {(log.work_order_nos ?? []).length > 0 && (
                <div className="mb-3">
                  <div className="mb-1.5 text-xs font-semibold text-slate-500">처리한 작업지시서</div>
                  <div className="space-y-1.5">
                  {(() => {
                    const TAG_LIST = ["생산완료", "전사인쇄", "인쇄검수", "금속검출"];
                    const TAG_CLS: Record<string, string> = {
                      "생산완료": "border-green-300 bg-green-100 text-green-800",
                      "전사인쇄": "border-blue-300 bg-blue-100 text-blue-800",
                      "인쇄검수": "border-violet-300 bg-violet-100 text-violet-800",
                      "금속검출": "border-orange-300 bg-orange-100 text-orange-800",
                    };
                    const grouped: Record<string, string[]> = {};
                    for (const no of (log.work_order_nos ?? [])) {
                      const tags = woTagMap[no]?.[log.employee_name] ?? [];
                      for (const tag of tags) {
                        if (!grouped[tag]) grouped[tag] = [];
                        grouped[tag].push(no);
                      }
                    }
                    return TAG_LIST.filter((tag) => grouped[tag]?.length > 0).map((tag) => (
                      <div key={tag} className="flex flex-wrap items-start gap-1.5">
                        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-bold ${TAG_CLS[tag]}`}>
                          {tag} {grouped[tag].length}건
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {grouped[tag].map((no) => (
                            <span key={no} className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-700">
                              {woInfoMap[no] ? `${woInfoMap[no].client_name} — ${woInfoMap[no].product_name}` : no}
                            </span>
                          ))}
                        </div>
                      </div>
                    ));
                  })()}
                  </div> 
                </div>
              )}
              <div className="mb-3">
                <div className="mb-1.5 text-xs font-semibold text-slate-500">업무 체크</div>
                <div className="flex flex-wrap gap-2">
                  {taskTypes.filter((t) => (log.task_checks ?? {})[t.id] === true).length === 0 ? (
                    <span className="text-xs text-slate-400">체크된 항목 없음</span>
                  ) : taskTypes.filter((t) => (log.task_checks ?? {})[t.id] === true).map((t) => (
                    <span key={t.id} className="rounded-lg border border-green-200 bg-green-50 px-2 py-1 text-xs font-medium text-green-700">
                      ✅ {t.name}
                    </span>
                  ))}
                </div>
              </div>
              {viewRaizeCutMap[log.employee_name] && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className="rounded-lg border border-purple-200 bg-purple-50 px-2 py-1 text-xs font-medium text-purple-700">
                    ✂️ 레이즈재단 {viewRaizeCutMap[log.employee_name].toLocaleString()} EA
                  </span>
                </div>
              )}
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
        <div id="production-view-print-inner" style={{ display: "none" }}> 
          <div style={{ fontFamily: "'Malgun Gothic','맑은 고딕',sans-serif", fontSize: "9pt", color: "#000" }}>
          <div style={{ textAlign: "center", fontSize: "13pt", fontWeight: "bold", marginBottom: 12 }}>
              {(() => {
                const d = new Date(viewDate + "T00:00:00+09:00");
                const days = ["일","월","화","수","목","금","토"];
                return `근무일지 — ${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
              })()}
            </div>
            {viewLogs.map((log) => (
              <div key={log.id} style={{ border: "1px solid #ccc", borderRadius: 6, padding: "10px 14px", marginBottom: 10, pageBreakInside: "avoid" }}>
               <div style={{ fontSize: "10pt", fontWeight: "bold", marginBottom: 6, paddingBottom: 4, borderBottom: "0.5px solid #ddd", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>{log.employee_name}</span>
                  {viewClockMap[log.employee_name] && (
                    <span style={{ fontSize: "8pt", fontWeight: "normal", color: "#555" }}>
                      {viewClockMap[log.employee_name].in && `출근 ${viewClockMap[log.employee_name].in}`}
                      {viewClockMap[log.employee_name].in && viewClockMap[log.employee_name].out && " · "}
                      {viewClockMap[log.employee_name].out && `퇴근 ${viewClockMap[log.employee_name].out}`}
                    </span>
                  )}  
                </div>
                {(log.work_order_nos ?? []).length > 0 && (
                  <div style={{ marginBottom: 6 }}>
                   <div style={{ fontSize: "7pt", color: "#333", fontWeight: "bold", marginBottom: 2 }}>처리한 작업지시서</div>
                    {(log.work_order_nos ?? []).map((no) => (
                      <div key={no} style={{ fontSize: "8pt", padding: "2px 0", borderBottom: "0.5px solid #f0f0f0" }}>
                        {woInfoMap[no] ? `${woInfoMap[no].client_name} — ${woInfoMap[no].product_name}` : no}
                      </div>
                    ))}
                  </div>
                )}
                {Object.values(log.task_checks ?? {}).some(Boolean) && (
                  <div style={{ marginBottom: 6 }}>
                   <div style={{ fontSize: "7pt", color: "#333", fontWeight: "bold", marginBottom: 3 }}>업무 체크</div>
                    <div style={{ fontSize: "7.5pt", color: "#333", lineHeight: 1.8 }}>
                      {taskTypes.filter((t) => (log.task_checks ?? {})[t.id] === true).map((t) => t.name).join(" · ")}
                    </div> 
                  </div>
                )}
                {log.extra_note && (
                  <div style={{ fontSize: "8pt" }}><b>기타:</b> {log.extra_note}</div>
                )}
              </div>
            ))}
          </div>
        </div>
    </div>
    );
  }

  // ── 렌더: 작업자 선택 ──
  if (!selectedEmployee || pinStep) {
    return (
      <div className="space-y-4">
        {isAdminOrSubadmin && (
          <div className="flex justify-end">
            <button className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
              onClick={() => { setViewMode(true); loadViewLogs(); }}>📋 조회 모드</button>
          </div>
        )}

        {/* 작업자 선택 */}
        {!pinStep && (
          <div className={`${card} p-6`}>
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <div className="font-semibold text-base text-slate-700">👤 작업자를 선택하세요</div>
              <div className="flex items-center gap-2 ml-auto">
                <span className="text-xs text-slate-500">날짜</span>
                <input type="date"
                  className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
                  value={workDate}
                  onChange={(e) => {
                    setWorkDate(e.target.value);
                  }} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {employees.map((emp) => {
                const st = empStatusMap[emp.id];
                const hasAtt = st?.clockIn || st?.clockOut;
                return (
                  <div key={emp.id}
                    className="rounded-2xl border-2 border-slate-200 bg-white px-4 py-4 text-center transition-all hover:border-slate-300">
                    <div className="font-bold text-slate-700 text-base mb-0.5">{emp.name}</div>
                    {/* 출퇴근 시간 */}
                    <div className="mb-1 text-[11px] text-slate-500 min-h-[16px]">
                      {hasAtt ? (
                        <>
                          {st?.clockIn && <span>출 {st.clockIn}</span>}
                          {st?.clockIn && st?.clockOut && <span className="mx-1 text-slate-300">·</span>}
                          {st?.clockOut && <span>퇴 {st.clockOut}</span>}
                        </>
                      ) : (
                        <span className="text-slate-300">출퇴근 기록 없음</span>
                      )}
                    </div>
                    {/* 작성여부 배지 */}
                    <div className="mb-2 min-h-[18px]">
                      {st?.confirmed ? (
                        <span className="rounded-full border border-green-200 bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">✅ 확인완료</span>
                      ) : st?.hasLog ? (
                        <span className="rounded-full border border-amber-200 bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">📝 임시저장</span>
                      ) : (
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-normal text-slate-400">미작성</span>
                      )}
                    </div>
                    {/* 열람 / 작성 버튼 */}
                    <div className="flex gap-1.5 justify-center">
                      <button
                        className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 active:scale-95 transition-all"
                        onClick={() => handleEmployeeView(emp)}>
                        👁 열람
                      </button>
                      <button
                        className="flex-1 rounded-lg border border-blue-400 bg-blue-50 px-2 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 active:scale-95 transition-all"
                        onClick={() => handleEmployeeEdit(emp)}>
                        ✏️ 작성
                      </button>
                    </div>
                  </div>
                );
              })}
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
            <div className="flex justify-center gap-3 mb-4">
              {[0,1,2,3].map((i) => (
                <div key={i} className={`w-10 h-10 rounded-xl border-2 flex items-center justify-center text-lg font-bold transition-all
                  ${pinInput.length > i ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 bg-slate-50 text-slate-300"}`}>
                  {pinInput.length > i ? "●" : "○"}
                </div>
              ))}
            </div>
            {pinError && <div className="mb-3 text-center text-xs text-red-500">{pinError}</div>}
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

  // ── 렌더: 일지 열람/작성 ──
  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className={`${card} p-4`}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <div className="font-bold text-base">
              {readOnly ? "👁" : "📝"} {selectedEmployee.name}의 생산일지
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              {workDate}
              {(clockInfo.in || clockInfo.out) && (
                <span className="ml-2">
                  {clockInfo.in && `출근 ${clockInfo.in}`}
                  {clockInfo.in && clockInfo.out && " · "}
                  {clockInfo.out && `퇴근 ${clockInfo.out}`}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* 열람 모드 배지 */}
            {readOnly && (
              <span className="rounded-full border border-slate-300 bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-500">
                👁 열람 전용
              </span>
            )}
            {isConfirmed && (
              <span className="rounded-full border border-green-200 bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700">
                ✅ {new Date(todayLog!.confirmed_at!).toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit" })} 확인완료
              </span>
            )}
            <button className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-50"
              onClick={() => { setSelectedEmployee(null); setPinStep(false); setPinInput(""); setReadOnly(false); }}>
              작업자 변경
            </button>
             {isAdminOrSubadmin && (
              <button className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
                onClick={() => { setViewMode(true); loadViewLogs(); }}>📋 조회</button>
            )}
           <button className={btnSm} onClick={() => {
              const d = new Date(today + "T00:00:00+09:00");
              const days = ["일","월","화","수","목","금","토"];
              const dateLabel = `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
              const woHtml = workOrders.map((wo) =>
                `<div style="font-size:8pt;padding:3px 0;border-bottom:0.5px solid #f0f0f0;">${wo.client_name} — ${wo.product_name}</div>`
              ).join("");
              const html = `
                <div style="font-size:13pt;font-weight:bold;margin-bottom:10px;padding-bottom:6px;border-bottom:1.5px solid #222;">
                  ${selectedEmployee.name}
                </div>
                <div style="border:1px solid #ccc;border-radius:6px;padding:12px 14px;">
                  <div style="font-size:9pt;font-weight:bold;margin-bottom:8px;padding-bottom:5px;border-bottom:0.5px solid #ddd;">${dateLabel}</div>
                  ${woHtml ? `<div style="margin-bottom:8px;"><div style="font-size:7pt;color:#888;font-weight:bold;margin-bottom:3px;">처리한 작업지시서</div>${woHtml}</div>` : ""}
                  ${extraNote ? `<div style="font-size:8pt;margin-top:6px;"><b>기타:</b> ${extraNote}</div>` : ""}
                </div>
              `;
              const win = window.open("", "_blank");
              if (!win) return;
              win.document.write(`<!DOCTYPE html><html><head>
                <meta charset="utf-8">
                <title>생산일지_${selectedEmployee.name}_${today}</title>
                <style>
                  @page { size: A4 portrait; margin: 20mm; }
                  body { margin: 0; font-family: 'Malgun Gothic','맑은 고딕',sans-serif; color: #000; }
                  * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                </style>
              </head><body>${html}</body></html>`);
              win.document.close();
              win.focus();
              setTimeout(() => { win.print(); }, 400);
            }}>🖨️ 인쇄</button>
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
                <span className="text-sm font-medium text-slate-700">{wo.client_name}</span>
                <span className="text-xs text-slate-500">{wo.product_name}</span>
                <div className="ml-auto flex gap-1">
                {(wo.tags ?? []).map((tag) => (
                    <span key={tag} className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold
                      ${tag === "생산완료" ? "border-green-200 bg-green-100 text-green-700"
                      : tag === "전사인쇄" ? "border-blue-200 bg-blue-100 text-blue-700"
                      : tag === "인쇄검수" ? "border-violet-200 bg-violet-100 text-violet-700"
                      : "border-orange-200 bg-orange-100 text-orange-700"}`}>
                      {tag}
                    </span>
                  ))}
                </div>
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
            const isPigment = t.id === "7e8ecc06-6f92-49b5-802e-7da0bd868a2c";
            const isGuar = t.id === "3ab0bd67-4215-4f8d-a0c1-0f06f3f4f673";
            const isPest = t.id === PEST_TASK_ID;
            const pestWarning = isPest && !pestDoneThisWeek && !checked;
            return (
              <button key={t.id}
                disabled={isDisabled}
                className={`rounded-xl border-2 px-3 py-3 text-sm font-medium text-left transition-all
                  ${checked
                    ? (isPigment || isGuar)
                      ? "border-blue-400 bg-blue-50 text-blue-700"
                      : "border-green-400 bg-green-50 text-green-700"
                    : pestWarning
                      ? "border-amber-400 bg-amber-50 text-amber-700"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"}
                  ${isDisabled ? "opacity-60 cursor-not-allowed" : "active:scale-95"}`}
                  onClick={() => !isDisabled && handleTaskCheck(t.id, taskChecks[t.id] === true)}>
                <span className="mr-1.5">{checked ? "✅" : pestWarning ? "⚠" : "☐"}</span>
                {t.name}
                {pestWarning && <span className="ml-1 text-[10px] font-semibold">이번 주 미완료</span>}
                {isPest && pestDoneThisWeek && !checked && <span className="ml-1 text-[10px] text-green-600 font-semibold">이번 주 완료</span>}
              </button>
            );
          })}
        </div>

        {/* 색소 배합 폼 */}
        {taskChecks["7e8ecc06-6f92-49b5-802e-7da0bd868a2c"] && !isDisabled && (
          <PigmentBlendForm
            employeeName={selectedEmployee.name}
            userId={userId}
            showToast={showToast}
          />
        )}

        {/* 구아검 배합 폼 */}
        {taskChecks["3ab0bd67-4215-4f8d-a0c1-0f06f3f4f673"] && !isDisabled && (
          <GuarBlendForm
            employeeName={selectedEmployee.name}
            userId={userId}
            showToast={showToast}
          />
        )}

        {/* 레이즈재단 폼 */}
        {taskChecks["ab0142bd-5f95-48cc-9786-1100186b0502"] && !isDisabled && (
          <RaizeCutForm
            employeeName={selectedEmployee.name}
            userId={userId}
            showToast={showToast}
          />
        )}

       {/* 방충방서 폼 */}
       {taskChecks[PEST_TASK_ID] && !isDisabled && (
          <PestInputForm
            employeeName={selectedEmployee.name}
            userId={userId}
            showToast={showToast}
            onSaved={() => setPestDoneThisWeek(true)}
          />
        )}

       {/* 자가품질검사 샘플준비 폼 */}
       {taskChecks[QC_SAMPLE_TASK_ID] && !isDisabled && (
          <QcSampleForm
            employeeName={selectedEmployee.name}
            userId={userId}
            showToast={showToast}
          />
        )}

        {/* 유효성평가검사 샘플준비 폼 */}
        {taskChecks[VALIDITY_SAMPLE_TASK_ID] && !isDisabled && (
          <ValiditySampleForm
            employeeName={selectedEmployee.name}
            userId={userId}
            showToast={showToast}
          />
        )}
      </div>

     {/* 레이즈재단 완료 표시 (열람 모드) */}
     {readOnly && todayRaizeCut && (
        <div className={`${card} p-4`}>
          <div className="mb-2 font-semibold text-sm text-purple-700">✂️ 레이즈재단 기록</div>
          <span className="rounded-full border border-purple-200 bg-purple-50 px-3 py-1.5 text-sm font-semibold text-purple-700">
            ✂️ 레이즈재단 {todayRaizeCut.toLocaleString()} EA 완료
          </span>
        </div>
      )}

      {/* 기타 입력 */}
      <div className={`${card} p-4`}>
        <div className="mb-2 font-semibold text-sm">📝 기타 특이사항</div>
        <textarea
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:outline-none resize-none"
          rows={3}
          placeholder={readOnly ? "작성된 내용이 없습니다." : "오늘 특이사항, 메모 등을 자유롭게 입력하세요"}
          value={extraNote}
          disabled={isDisabled}
          onChange={(e) => setExtraNote(e.target.value)}
        />
      </div>

      {/* 저장 / 확인 완료 버튼 — 열람 모드일 때 숨김 */}
      {!readOnly && (
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
            <>
              <div className="flex-1 rounded-xl border border-green-200 bg-green-50 py-2.5 text-sm font-semibold text-green-700 text-center">
                ✅ 오늘 근무일지가 확정되었습니다
              </div>
              <button
                className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                onClick={async () => {
                  if (!todayLog) return;
                  const { error } = await supabase.from("daily_work_logs")
                    .update({ confirmed_at: null, updated_at: new Date().toISOString() })
                    .eq("id", todayLog.id);
                    if (error) return showToast("수정 실패: " + error.message, "error");
                    showToast("🔓 확정이 해제되었습니다. 수정 후 다시 확인 완료를 눌러주세요.");
                    await loadTodayData(selectedEmployee!.id, selectedEmployee!.name, workDate);
                }}>
                ✏️ 수정하기
              </button>
            </>
          )}
        </div>
    )}
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

  // ── PIN 인증 ──
  const [employees, setEmployees] = useState<{ id: string; name: string; pin: string | null }[]>([]);
  const [pinTarget, setPinTarget] = useState<"receipt" | "adjust" | "disposal" | null>(null);
  const [pinEmp, setPinEmp] = useState<{ id: string; name: string; pin: string | null } | null>(null);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState("");

  const [stocks, setStocks] = useState<MaterialStock[]>([]);
  const [receipts, setReceipts] = useState<MaterialReceipt[]>([]);
  const [filterDate, setFilterDate] = useState(todayKST());
  const [filterCategory, setFilterCategory] = useState("전체");
  const [loading, setLoading] = useState(false);
  const [showReceiptForm, setShowReceiptForm] = useState(false);
  const [materials, setMaterials] = useState<{ id: string; name: string; category: string }[]>([]);

  // 입고 폼
  const [rMaterialId, setRMaterialId] = useState("");
  const [rDate, setRDate] = useState(todayKST());
  const [rQty, setRQty] = useState("");
  const [rExpiry, setRExpiry] = useState("");
  const [rSupplier, setRSupplier] = useState("");
  const [rNote, setRNote] = useState("");
  const [saving, setSaving] = useState(false);

  // ── 재고 조정 ──
  const [showAdjustForm, setShowAdjustForm] = useState(false);
  const [adjMaterialId, setAdjMaterialId] = useState("");
  const [adjMode, setAdjMode] = useState<"actual" | "delta">("actual");
  const [adjActualQty, setAdjActualQty] = useState("");
  const [adjDeltaQty, setAdjDeltaQty] = useState("");
  const [adjDate, setAdjDate] = useState(filterDate);
  const [adjReason, setAdjReason] = useState("");
  const [adjSaving, setAdjSaving] = useState(false);
  const [adjustments, setAdjustments] = useState<{
    id: string; adjust_date: string; material_id: string;
    actual_qty: number | null; adjust_qty: number; reason: string | null;
    material?: { name: string } | null;
  }[]>([]);

  // ── 폐기 등록 ──
  const [showDisposalForm, setShowDisposalForm] = useState(false);
  const [dispReceiptId, setDispReceiptId] = useState("");
  const [dispQty, setDispQty] = useState("");
  const [dispReason, setDispReason] = useState("");
  const [dispNote, setDispNote] = useState("");
  const [dispDate, setDispDate] = useState(filterDate);
  const [dispSaving, setDispSaving] = useState(false);
  const [disposalLogs, setDisposalLogs] = useState<{
    id: string; disposal_date: string; material_id: string; quantity: number;
    unit: string; reason: string; note: string | null;
    receipt_id: string | null;
    material?: { name: string } | null;
    receipt?: { received_date: string; expiry_date: string | null } | null;
  }[]>([]);

  // ── 로트별 현황 ──
  const [lotStocks, setLotStocks] = useState<{
    receipt_id: string; material_id: string; material_name: string;
    category: string; unit: string; received_date: string;
    expiry_date: string | null; supplier: string | null;
    received_qty: number; disposed_qty: number; remaining_qty: number;
    expiry_status: "normal" | "expiring_soon" | "expired";
  }[]>([]);

 // ── 드릴다운 ──
 const [expandedMaterialId, setExpandedMaterialId] = useState<string | null>(null);
 const [drillRows, setDrillRows] = useState<{ displayLabel: string; quantity: number; unit: string; woId?: string }[]>([]);
 const [drillLoading, setDrillLoading] = useState(false);

 const selectedStock = stocks.find((s) => s.material_id === adjMaterialId);
  const currentStockForAdj = selectedStock?.current_stock ?? 0;
  const computedDelta = adjMode === "actual" && adjActualQty !== ""
    ? parseFloat(adjActualQty) - currentStockForAdj
    : null;
  const deltaValue = adjMode === "delta" && adjDeltaQty !== ""
    ? parseFloat(adjDeltaQty)
    : null;
  const finalDelta = adjMode === "actual" ? computedDelta : deltaValue;

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
    const [stockRes, receiptRes, usageRes, cumulativeUsageRes, cumulativeDisposalRes, adjRes] = await Promise.all([
      supabase.from("materials").select("id,name,category,unit,safety_stock").eq("is_active", true).neq("id", "00000000-0007-0000-0000-000000000001").order("order_no", { nullsFirst: false }),
      supabase.from("material_receipts")
        .select("id,received_date,material_id,quantity,unit,expiry_date,supplier,note,material:materials(name)")
        .eq("received_date", filterDate)
        .order("created_at", { ascending: false }),
      supabase.from("material_usage_logs")
        .select("material_id, quantity")
        .eq("used_date", filterDate),
      supabase.from("material_usage_logs")
        .select("material_id, quantity")
        .lte("used_date", filterDate),
      supabase.from("material_disposal_logs")
        .select("material_id, quantity")
        .lte("created_at", `${filterDate}T23:59:59+09:00`),
      supabase.from("material_adjustments")
        .select("id,adjust_date,material_id,actual_qty,adjust_qty,reason,material:materials(name)")
        .lte("adjust_date", filterDate)
        .order("adjust_date", { ascending: false }),
    ]);

    // 당일 사용량
    const dailyUsageMap: Record<string, number> = {};
    (usageRes.data ?? []).forEach((u: any) => {
      if (!dailyUsageMap[u.material_id]) dailyUsageMap[u.material_id] = 0;
      dailyUsageMap[u.material_id] += u.quantity;
    });

    // filterDate까지 누적 사용량
    const cumulativeUsageMap: Record<string, number> = {};
    (cumulativeUsageRes.data ?? []).forEach((u: any) => {
      if (!cumulativeUsageMap[u.material_id]) cumulativeUsageMap[u.material_id] = 0;
      cumulativeUsageMap[u.material_id] += u.quantity;
    });

    // filterDate까지 누적 폐기량
    const cumulativeDisposalMap: Record<string, number> = {};
    (cumulativeDisposalRes.data ?? []).forEach((d: any) => {
      if (!cumulativeDisposalMap[d.material_id]) cumulativeDisposalMap[d.material_id] = 0;
      cumulativeDisposalMap[d.material_id] += d.quantity;
    });

    // filterDate까지 누적 입고량 (현재고 계산용)
    const { data: cumulativeReceiptData } = await supabase
      .from("material_receipts")
      .select("material_id, quantity")
      .lte("received_date", filterDate);
    const cumulativeReceiptMap: Record<string, number> = {};
    (cumulativeReceiptData ?? []).forEach((r: any) => {
      if (!cumulativeReceiptMap[r.material_id]) cumulativeReceiptMap[r.material_id] = 0;
      cumulativeReceiptMap[r.material_id] += r.quantity;
    });

    // 당일 입고량 (화면 표시용)
    const dailyReceiptMap: Record<string, number> = {};
    (receiptRes.data ?? []).forEach((r: any) => {
      if (!dailyReceiptMap[r.material_id]) dailyReceiptMap[r.material_id] = 0;
      dailyReceiptMap[r.material_id] += r.quantity;
    });

    // filterDate까지 누적 조정량
    const cumulativeAdjMap: Record<string, number> = {};
    (adjRes.data ?? []).forEach((a: any) => {
      if (!cumulativeAdjMap[a.material_id]) cumulativeAdjMap[a.material_id] = 0;
      cumulativeAdjMap[a.material_id] += a.adjust_qty;
    });

    const stocksWithDaily = (stockRes.data ?? []).map((s: any) => {
      const totalReceived = cumulativeReceiptMap[s.id] ?? 0;
      const totalUsed = cumulativeUsageMap[s.id] ?? 0;
      const totalDisposed = cumulativeDisposalMap[s.id] ?? 0;
      const totalAdj = cumulativeAdjMap[s.id] ?? 0;
      const currentStock = totalReceived - totalUsed - totalDisposed + totalAdj;
      return {
        material_id: s.id,
        material_name: s.name,
        category: s.category,
        unit: s.unit,
        safety_stock: s.safety_stock,
        total_received: dailyReceiptMap[s.id] ?? 0,
        total_used: totalUsed,
        total_disposed: totalDisposed,
        current_stock: currentStock,
        is_below_safety_stock: s.safety_stock != null && currentStock < s.safety_stock,
        daily_used: dailyUsageMap[s.id] ?? 0,
      };
    });
    setStocks(stocksWithDaily as MaterialStock[]);
    setReceipts((receiptRes.data ?? []) as unknown as MaterialReceipt[]);
    setAdjustments((adjRes.data ?? []) as any);

    // 로트별 현황 (뷰 조회)
    const { data: lotData } = await supabase
      .from("material_lot_stock")
      .select("*")
      .gt("remaining_qty", 0);
    setLotStocks((lotData ?? []) as any);

    // 당일 폐기 내역
    const { data: dispData } = await supabase
      .from("material_disposal_logs")
      .select("id,disposal_date,material_id,quantity,unit,reason,note,receipt_id,material:materials(name),receipt:material_receipts(received_date,expiry_date)")
      .eq("disposal_date", filterDate)
      .order("created_at", { ascending: false });
    setDisposalLogs((dispData ?? []) as any);

    setLoading(false);
  }, [filterDate]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { setExpandedMaterialId(null); setDrillRows([]); }, [filterDate]);
  useEffect(() => {
    supabase.from("materials").select("id,name,category").eq("is_active", true).neq("id", "00000000-0007-0000-0000-000000000001").order("order_no", { nullsFirst: false })
      .then(({ data }) => setMaterials(data ?? []));
    supabase.from("employees").select("id,name,pin").is("resign_date", null).order("name")
      .then(({ data }) => setEmployees((data ?? []) as any));
  }, []);

  // ── 월별 수불부 인쇄 ──
  const [printYear, setPrintYear] = useState(() => new Date().getFullYear());
  const [printMonth, setPrintMonth] = useState(() => new Date().getMonth() + 1);
  const [showPrintForm, setShowPrintForm] = useState(false);
  const [printLoading, setPrintLoading] = useState(false);

  async function printMonthlyLedger() {
    setPrintLoading(true);
    const y = printYear;
    const m = printMonth;
    const monthStart = `${y}-${String(m).padStart(2, "0")}-01`;
    const lastDay = new Date(y, m, 0).getDate();
    const monthEnd = `${y}-${String(m).padStart(2, "0")}-${lastDay}`;
    // 전월 말일 (전월이월 계산용)
    const prevEnd = new Date(y, m - 1, 0);
    const prevEndStr = `${prevEnd.getFullYear()}-${String(prevEnd.getMonth() + 1).padStart(2, "0")}-${String(prevEnd.getDate()).padStart(2, "0")}`;

    // 해당 월 변동 원료 ID 수집
    const [recRes, useRes, adjRes] = await Promise.all([
      supabase.from("material_receipts").select("material_id,received_date,quantity").gte("received_date", monthStart).lte("received_date", monthEnd),
      supabase.from("material_usage_logs").select("material_id,used_date,quantity").gte("used_date", monthStart).lte("used_date", monthEnd),
      supabase.from("material_adjustments").select("material_id,adjust_date,adjust_qty,reason").gte("adjust_date", monthStart).lte("adjust_date", monthEnd),
    ]);
    const changedIds = [...new Set([
      ...(recRes.data ?? []).map((r: any) => r.material_id),
      ...(useRes.data ?? []).map((u: any) => u.material_id),
      ...(adjRes.data ?? []).map((a: any) => a.material_id),
    ])].filter((id) => id !== "00000000-0007-0000-0000-000000000001");
    if (changedIds.length === 0) { setPrintLoading(false); return alert("해당 월에 변동 내역이 없습니다."); }

    // 원료 정보
    const { data: matsData } = await supabase.from("materials").select("id,name,category,unit").in("id", changedIds).order("category").order("name");
    const mats = matsData ?? [];

    // 전월이월 재고 계산 (각 원료별)
    const [prevRecRes, prevUseRes, prevAdjRes] = await Promise.all([
      supabase.from("material_receipts").select("material_id,quantity").lte("received_date", prevEndStr),
      supabase.from("material_usage_logs").select("material_id,quantity").lte("used_date", prevEndStr),
      supabase.from("material_adjustments").select("material_id,adjust_qty").lte("adjust_date", prevEndStr),
    ]);
    const prevStockMap: Record<string, number> = {};
    (prevRecRes.data ?? []).forEach((r: any) => { prevStockMap[r.material_id] = (prevStockMap[r.material_id] ?? 0) + r.quantity; });
    (prevUseRes.data ?? []).forEach((u: any) => { prevStockMap[u.material_id] = (prevStockMap[u.material_id] ?? 0) - u.quantity; });
    (prevAdjRes.data ?? []).forEach((a: any) => { prevStockMap[a.material_id] = (prevStockMap[a.material_id] ?? 0) + a.adjust_qty; });

    // 날짜별 집계 맵 구성
    type DayEntry = { in: number; use: number; adj: number; adjNote: string };
    const dayMap: Record<string, Record<string, DayEntry>> = {};
    (recRes.data ?? []).forEach((r: any) => {
      if (!dayMap[r.material_id]) dayMap[r.material_id] = {};
      if (!dayMap[r.material_id][r.received_date]) dayMap[r.material_id][r.received_date] = { in: 0, use: 0, adj: 0, adjNote: "" };
      dayMap[r.material_id][r.received_date].in += r.quantity;
    });
    (useRes.data ?? []).forEach((u: any) => {
      if (!dayMap[u.material_id]) dayMap[u.material_id] = {};
      if (!dayMap[u.material_id][u.used_date]) dayMap[u.material_id][u.used_date] = { in: 0, use: 0, adj: 0, adjNote: "" };
      dayMap[u.material_id][u.used_date].use += u.quantity;
    });
    (adjRes.data ?? []).forEach((a: any) => {
      if (!dayMap[a.material_id]) dayMap[a.material_id] = {};
      if (!dayMap[a.material_id][a.adjust_date]) dayMap[a.material_id][a.adjust_date] = { in: 0, use: 0, adj: 0, adjNote: "" };
      dayMap[a.material_id][a.adjust_date].adj += a.adjust_qty;
      if (a.reason) dayMap[a.material_id][a.adjust_date].adjNote = a.reason;
    });

    // HTML 생성
    const days = ["일","월","화","수","목","금","토"];
    let html = `
      <style>
        @page { size: A4 portrait; margin: 15mm 18mm; }
        body { margin: 0; font-family: 'Malgun Gothic','맑은 고딕',sans-serif; font-size: 9pt; color: #000; }
        * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        .page { page-break-after: always; }
        .page:last-child { page-break-after: avoid; }
        .header-top { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 4px; }
        .company { font-size: 8pt; color: #555; }
        .doc-title { font-size: 15pt; font-weight: bold; text-align: center; letter-spacing: 2px; margin-bottom: 2px; }
        .doc-sub { font-size: 8.5pt; text-align: center; color: #333; margin-bottom: 10px; }
        .info-row { display: flex; gap: 0; margin-bottom: 8px; border: 1px solid #333; }
        .info-cell { flex: 1; padding: 4px 8px; font-size: 8.5pt; border-right: 1px solid #ccc; }
        .info-cell:last-child { border-right: none; }
        .info-label { font-weight: bold; margin-right: 6px; }
        table { width: 100%; border-collapse: collapse; font-size: 8.5pt; }
        th { background: #f0f0f0; border: 1px solid #999; padding: 5px 4px; text-align: center; font-weight: bold; font-size: 8pt; }
        td { border: 1px solid #bbb; padding: 4px 6px; }
        td.num { text-align: right; font-variant-numeric: tabular-nums; }
        td.center { text-align: center; }
        tr:nth-child(even) { background: #fafafa; }
        tr.carry { background: #f5f5f5; font-weight: bold; }
        .footer { margin-top: 10px; font-size: 7.5pt; color: #555; display: flex; justify-content: space-between; }
        .sign-row { display: flex; justify-content: flex-end; gap: 0; margin-bottom: 8px; }
        .sign-box { border: 1px solid #999; width: 60px; text-align: center; }
        .sign-label { background: #f0f0f0; border-bottom: 1px solid #bbb; padding: 3px 0; font-size: 7.5pt; font-weight: bold; }
        .sign-space { height: 28px; }
      </style>`;

    mats.forEach((mat: any, idx: number) => {
      const matDays = dayMap[mat.id] ?? {};
      const sortedDates = Object.keys(matDays).sort();
      const prevStock = prevStockMap[mat.id] ?? 0;
      let runningStock = prevStock;
      let rowNo = 1;

      let rows = `
        <tr class="carry">
          <td class="center">-</td>
          <td class="center">전월이월</td>
          <td class="num">-</td>
          <td class="num">-</td>
          <td class="num">-</td>
          <td class="num">${prevStock.toLocaleString()}</td>
          <td class="center"></td>
          <td class="center"></td>
          <td></td>
        </tr>`;

      sortedDates.forEach((date) => {
        const d = new Date(date + "T00:00:00+09:00");
        const dayLabel = `${d.getMonth() + 1}/${d.getDate()}(${days[d.getDay()]})`;
        const entry = matDays[date];
        runningStock = runningStock + entry.in - entry.use + entry.adj;
        const adjCell = entry.adj !== 0 ? `${entry.adj > 0 ? "+" : ""}${entry.adj.toLocaleString()}` : "-";
        const noteCell = entry.adjNote || "";
        rows += `
          <tr>
            <td class="center">${rowNo++}</td>
            <td class="center">${dayLabel}</td>
            <td class="num">${entry.in > 0 ? entry.in.toLocaleString() : "-"}</td>
            <td class="num">${entry.use > 0 ? entry.use.toLocaleString() : "-"}</td>
            <td class="num ${entry.adj !== 0 ? (entry.adj > 0 ? "color: #1a7a1a;" : "color: #cc0000;") : ""}">${adjCell}</td>
            <td class="num">${runningStock.toLocaleString()}</td>
            <td class="center"></td>
            <td class="center"></td>
            <td>${noteCell}</td>
          </tr>`;
      });

      const isLast = idx === mats.length - 1;
      html += `
        <div class="${isLast ? "" : "page"}">
          <div class="header-top">
            <div class="company">BONUSMATE</div>
            <div style="font-size:7.5pt;color:#555;">${y}년 ${m}월 원료수불부</div>
          </div>
          <div class="doc-title">원 료 수 불 부</div>
          <div class="doc-sub">${y}년 ${m}월</div>
         <div class="sign-row">
            <div class="sign-box">
              <div class="sign-label">확인</div>
              <div class="sign-space" style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:2px 0;">
                <img src="/sign-kimyg.png" style="height:26px;object-fit:contain;" alt="김영각" />
                <div style="font-size:7pt;margin-top:1px;">김영각</div>
              </div>
            </div>
            <div class="sign-box">
              <div class="sign-label">승인</div>
              <div class="sign-space" style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:2px 0;">
                <img src="/sign-chods.png" style="height:26px;object-fit:contain;" alt="조대성" />
                <div style="font-size:7pt;margin-top:1px;">조대성</div>
              </div>
            </div>
          </div>
          <div class="info-row">
            <div class="info-cell"><span class="info-label">원료명</span>${mat.name}</div>
            <div class="info-cell"><span class="info-label">분류</span>${mat.category}</div>
            <div class="info-cell"><span class="info-label">단위</span>${mat.unit}</div>
          </div>
          <table>
            <thead>
              <tr>
                <th style="width:32px">No</th>
                <th style="width:72px">일자</th>
                <th style="width:80px">입고량</th>
                <th style="width:80px">사용량</th>
                <th style="width:70px">조정량</th>
                <th style="width:90px">당일재고</th>
                <th style="width:52px">담당자</th>
                <th style="width:48px">확인</th>
                <th>비고</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
          <div class="footer">
            <span>* 본 문서는 BONUSMATE ERP에서 자동 생성되었습니다.</span>
            <span>출력일시: ${new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</span>
          </div>
        </div>`;
    });

    setPrintLoading(false);
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>원료수불부_${y}년_${m}월</title></head><body>${html}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 500);
  }

  async function handleDrillDown(materialId: string, unit: string) {
    if (expandedMaterialId === materialId) {
      setExpandedMaterialId(null);
      setDrillRows([]);
      return;
    }
    setExpandedMaterialId(materialId);
    setDrillLoading(true);

    const { data: usageData } = await supabase
      .from("material_usage_logs")
      .select("quantity, note, unit")
      .eq("material_id", materialId)
      .eq("used_date", filterDate)
      .order("created_at");

    // note에서 WO 번호 추출
    const woPattern = /WO-\d{8}-\d{4}/;
    const woNos = [...new Set(
      (usageData ?? [])
        .map((u: any) => u.note?.match(woPattern)?.[0])
        .filter(Boolean) as string[]
    )];

    let woMap: Record<string, { id: string; client_name: string; product_name: string }> = {};
    if (woNos.length > 0) {
      const { data: woData } = await supabase
        .from("work_orders")
        .select("id, work_order_no, client_name, product_name")
        .in("work_order_no", woNos);
      (woData ?? []).forEach((w: any) => {
        woMap[w.work_order_no] = { id: w.id, client_name: w.client_name, product_name: w.product_name };
      });
    }

    const rows = (usageData ?? []).map((u: any) => {
      const note: string = u.note ?? "";
      const woNo = note.match(woPattern)?.[0];
      let displayLabel = note;
      let woId: string | undefined;
      if (woNo && woMap[woNo]) {
        const wo = woMap[woNo];
        woId = wo.id;
        const tag = note.includes("생산완료") ? "생산완료"
          : note.includes("이산화티타늄 차감") ? "TiO₂"
          : "";
        displayLabel = `${wo.client_name} — ${wo.product_name}${tag ? ` (${tag})` : ""}`;
      }
      return { displayLabel, quantity: u.quantity, unit: u.unit ?? unit, woId };
    });

    setDrillRows(rows);
    setDrillLoading(false);
  }

  async function saveAdjustment() {
    if (!adjMaterialId) return showToast("원료를 선택하세요.", "error");
    if (finalDelta === null || isNaN(finalDelta)) return showToast("수량을 입력하세요.", "error");
    if (finalDelta === 0) return showToast("조정량이 0입니다. 현재고와 동일하거나 0을 입력했습니다.", "error");
    if (!adjReason.trim()) return showToast("조정 사유를 입력하세요.", "error");
    setAdjSaving(true);
    const { error } = await supabase.from("material_adjustments").insert({
      material_id: adjMaterialId,
      adjust_date: adjDate,
      actual_qty: adjMode === "actual" ? parseFloat(adjActualQty) : null,
      adjust_qty: finalDelta,
      reason: adjReason.trim(),
      created_by: userId,
    });
    setAdjSaving(false);
    if (error) return showToast("조정 실패: " + error.message, "error");
    const mat = materials.find((m) => m.id === adjMaterialId);
    showToast(`✅ ${mat?.name ?? "원료"} 재고 ${finalDelta > 0 ? "+" : ""}${finalDelta}g 조정 완료`);
    setShowAdjustForm(false);
    setAdjMaterialId(""); setAdjActualQty(""); setAdjDeltaQty(""); setAdjReason("");
    loadData();
  }

  async function deleteAdjustment(adjId: string) {
    if (!confirm("이 조정 내역을 삭제하시겠습니까? 현재고가 다시 변경됩니다.")) return;
    const { error } = await supabase.from("material_adjustments").delete().eq("id", adjId);
    if (error) return showToast("삭제 실패: " + error.message, "error");
    showToast("🗑️ 조정 내역 삭제 완료");
    loadData();
  }

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
            <>
              <button
                className={showReceiptForm ? btnOn : "rounded-xl border border-blue-300 bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-700 hover:bg-blue-100"}
                onClick={() => {
                  if (showReceiptForm) { setShowReceiptForm(false); return; }
                  setShowAdjustForm(false); setShowDisposalForm(false);
                  setPinTarget("receipt"); setPinEmp(null); setPinInput(""); setPinError("");
                }}
              >
                {showReceiptForm ? "✕ 닫기" : "✚ 입고 등록"}
              </button>
              <button
                className={showAdjustForm
                  ? "rounded-xl border border-amber-500 bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-700"
                  : "rounded-xl border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-semibold text-amber-700 hover:bg-amber-100"}
                onClick={() => {
                  if (showAdjustForm) { setShowAdjustForm(false); return; }
                  setShowReceiptForm(false); setShowDisposalForm(false);
                  setPinTarget("adjust"); setPinEmp(null); setPinInput(""); setPinError("");
                }}
              >
                {showAdjustForm ? "✕ 닫기" : "⚖️ 재고 조정"}
              </button>
              <button
                className={showDisposalForm
                  ? "rounded-xl border border-red-500 bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700"
                  : "rounded-xl border border-red-300 bg-red-50 px-3 py-1.5 text-sm font-semibold text-red-700 hover:bg-red-100"}
                onClick={() => {
                  if (showDisposalForm) { setShowDisposalForm(false); return; }
                  setShowReceiptForm(false); setShowAdjustForm(false);
                  setPinTarget("disposal"); setPinEmp(null); setPinInput(""); setPinError("");
                }}
              >
                {showDisposalForm ? "✕ 닫기" : "🗑️ 폐기 등록"}
              </button>
            </>
          )}
          <button
            className={showPrintForm
              ? "rounded-xl border border-violet-500 bg-violet-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-violet-700"
              : "rounded-xl border border-violet-300 bg-violet-50 px-3 py-1.5 text-sm font-semibold text-violet-700 hover:bg-violet-100"}
            onClick={() => setShowPrintForm((v) => !v)}>
            {showPrintForm ? "✕ 닫기" : "📄 월별 수불부인쇄"}
          </button>
        </div>
      </div>

      {/* ── PIN 인증 모달 ── */}
      {pinTarget && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm mx-4 rounded-2xl bg-white shadow-2xl p-6">
            {!pinEmp ? (
              <>
                <div className="mb-4 font-bold text-base text-slate-700 text-center">
                  {pinTarget === "receipt" ? "✚ 입고 등록" : pinTarget === "adjust" ? "⚖️ 재고 조정" : "🗑️ 폐기 등록"} — 작업자 선택
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {employees.map((emp) => (
                    <button key={emp.id}
                      className="rounded-xl border-2 border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-700 hover:border-blue-300 hover:bg-blue-50 active:scale-95 transition-all text-center"
                      onClick={() => { setPinEmp(emp); setPinInput(""); setPinError(""); }}>
                      {emp.name}
                      <div className="text-[10px] font-normal text-slate-400 mt-0.5">{emp.pin ? "PIN 설정됨" : "PIN 미설정"}</div>
                    </button>
                  ))}
                </div>
                <button className="mt-4 w-full text-xs text-slate-400 hover:text-slate-600"
                  onClick={() => { setPinTarget(null); setPinEmp(null); }}>취소</button>
              </>
            ) : (
              <>
                <button className="mb-4 text-xs text-slate-400 hover:text-slate-600"
                  onClick={() => { setPinEmp(null); setPinInput(""); setPinError(""); }}>
                  ← 작업자 선택으로
                </button>
                <div className="mb-1 font-semibold text-base text-slate-700 text-center">{pinEmp.name}</div>
                <div className="mb-4 text-sm text-slate-500 text-center">PIN 4자리를 입력하세요</div>
                <div className="flex justify-center gap-3 mb-4">
                  {[0,1,2,3].map((i) => (
                    <div key={i} className={`w-10 h-10 rounded-xl border-2 flex items-center justify-center text-lg font-bold transition-all
                      ${pinInput.length > i ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 bg-slate-50 text-slate-300"}`}>
                      {pinInput.length > i ? "●" : "○"}
                    </div>
                  ))}
                </div>
                {pinError && <div className="mb-3 text-center text-xs text-red-500">{pinError}</div>}
                <div className="grid grid-cols-3 gap-2">
                  {["1","2","3","4","5","6","7","8","9","","0","⌫"].map((d, i) => (
                    <button key={i}
                      className={`rounded-xl border py-3 text-lg font-semibold transition-all
                        ${d === "" ? "invisible" : "border-slate-200 bg-white hover:bg-slate-50 active:bg-slate-100 active:scale-95"}`}
                      onClick={() => {
                        if (d === "⌫") { setPinInput((p) => p.slice(0, -1)); setPinError(""); return; }
                        if (d === "") return;
                        if (pinInput.length >= 4) return;
                        const next = pinInput + d;
                        setPinInput(next);
                        if (next.length === 4) {
                          setTimeout(() => {
                            if (!pinEmp.pin) {
                              setPinError("PIN이 설정되지 않았습니다.");
                              setPinInput(""); return;
                            }
                            if (pinEmp.pin !== next) {
                              setPinError("PIN이 올바르지 않습니다.");
                              setPinInput(""); return;
                            }
                            // 인증 성공 — target을 로컬 변수에 먼저 저장 후 상태 초기화
                            const target = pinTarget;
                            setPinTarget(null);
                            setPinEmp(null);
                            setPinInput("");
                            setPinError("");
                            if (target === "receipt")  { setShowReceiptForm(true);  setRDate(filterDate); }
                            if (target === "adjust")   { setShowAdjustForm(true);   setAdjDate(filterDate); }
                            if (target === "disposal") { setShowDisposalForm(true); setDispDate(filterDate); }
                          }, 100);
                        }
                      }}>
                      {d}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* 월별 수불부 인쇄 폼 */}
      {showPrintForm && (
        <div className={`${card} p-4`}>
          <div className="mb-3 font-semibold text-sm text-violet-700">📄 월별 원료수불부 인쇄</div>
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <div className="mb-1 text-xs text-slate-500">연도</div>
              <select className={inp} style={{ width: 100 }} value={printYear}
                onChange={(e) => setPrintYear(Number(e.target.value))}>
                {[2024, 2025, 2026, 2027].map((y) => (
                  <option key={y} value={y}>{y}년</option>
                ))}
              </select>
            </div>
            <div>
              <div className="mb-1 text-xs text-slate-500">월</div>
              <select className={inp} style={{ width: 90 }} value={printMonth}
                onChange={(e) => setPrintMonth(Number(e.target.value))}>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>{m}월</option>
                ))}
              </select>
            </div>
            <button
              className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-bold text-white hover:bg-violet-700 disabled:opacity-60"
              disabled={printLoading}
              onClick={printMonthlyLedger}>
              {printLoading ? "데이터 조회 중..." : "🖨️ 인쇄 미리보기"}
            </button>
          </div>
          <div className="mt-2 text-xs text-slate-400">
            해당 월에 입고·사용·조정 내역이 있는 원료만 출력됩니다.
          </div>
        </div>
      )} 

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

      {/* ── 폐기 등록 폼 ── */}
      {showDisposalForm && isAdminOrSubadmin && (
        <div className={`${card} p-4`} style={{ borderColor: "#fca5a5" }}>
          <div className="mb-3 flex items-center justify-between">
            <div className="font-semibold text-sm text-red-700">🗑️ 원료 폐기 등록</div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">폐기일</span>
              <input type="date" className="rounded-lg border border-red-300 bg-white px-2 py-1 text-sm focus:outline-none focus:border-red-500"
                value={dispDate}
                onChange={(e) => setDispDate(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <div className="mb-1 text-xs text-slate-500">폐기할 로트 선택 * <span className="text-slate-400">(원료명 · 입고일 · 소비기한 · 잔여수량)</span></div>
              <select className={inp} value={dispReceiptId}
                onChange={(e) => setDispReceiptId(e.target.value)}>
                <option value="">— 로트 선택 —</option>
                {lotStocks.map((lot) => (
                  <option key={lot.receipt_id} value={lot.receipt_id}>
                    [{lot.category}] {lot.material_name}
                    {" · 입고 "}{lot.received_date}
                    {lot.expiry_date ? ` · 소비기한 ${lot.expiry_date}` : " · 소비기한 없음"}
                    {" · 잔여 "}{lot.remaining_qty.toLocaleString()}{lot.unit}
                    {lot.expiry_status === "expired" ? " ⚠️만료" : lot.expiry_status === "expiring_soon" ? " ⚡임박" : ""}
                  </option>
                ))}
              </select>
              {dispReceiptId && (() => {
                const lot = lotStocks.find((l) => l.receipt_id === dispReceiptId);
                if (!lot) return null;
                return (
                  <div className={`mt-1.5 rounded-lg border px-3 py-1.5 text-xs
                    ${lot.expiry_status === "expired" ? "border-red-200 bg-red-50 text-red-700"
                    : lot.expiry_status === "expiring_soon" ? "border-orange-200 bg-orange-50 text-orange-700"
                    : "border-slate-200 bg-slate-50 text-slate-600"}`}>
                    {lot.material_name} · 입고일 {lot.received_date}
                    {lot.expiry_date && ` · 소비기한 ${lot.expiry_date}`}
                    {lot.expiry_status === "expired" && " 🚨 소비기한 만료"}
                    {lot.expiry_status === "expiring_soon" && " ⚡ 소비기한 임박 (30일 이내)"}
                    {" · 잔여 "}<span className="font-bold">{lot.remaining_qty.toLocaleString()}{lot.unit}</span>
                  </div>
                );
              })()}
            </div>
            <div>
              <div className="mb-1 text-xs text-slate-500">폐기 수량 ({(() => { const lot = lotStocks.find((l) => l.receipt_id === dispReceiptId); return lot?.unit ?? "g"; })()} ) *</div>
              <input className={inpR} inputMode="decimal" value={dispQty}
                onChange={(e) => setDispQty(e.target.value)}
                placeholder="폐기 수량 입력" />
              {dispReceiptId && dispQty && (() => {
                const lot = lotStocks.find((l) => l.receipt_id === dispReceiptId);
                if (!lot) return null;
                const qty = parseFloat(dispQty);
                if (isNaN(qty)) return null;
                if (qty > lot.remaining_qty) return (
                  <div className="mt-1 text-xs text-red-600 font-semibold">⚠️ 잔여수량({lot.remaining_qty.toLocaleString()}{lot.unit}) 초과</div>
                );
                return (
                  <div className="mt-1 text-xs text-slate-500">폐기 후 잔여: {(lot.remaining_qty - qty).toLocaleString()}{lot.unit}</div>
                );
              })()}
            </div>
            <div>
              <div className="mb-1 text-xs text-slate-500">폐기 사유 *</div>
              <select className={inp} value={dispReason}
                onChange={(e) => setDispReason(e.target.value)}>
                <option value="">— 선택 —</option>
                <option value="소비기한 만료">소비기한 만료</option>
                <option value="변질">변질</option>
                <option value="오염">오염</option>
                <option value="품질 불량">품질 불량</option>
                <option value="기타">기타</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <div className="mb-1 text-xs text-slate-500">비고</div>
              <input className={inp} value={dispNote}
                onChange={(e) => setDispNote(e.target.value)}
                placeholder="선택 입력" />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-60"
              disabled={dispSaving || !dispReceiptId || !dispQty || !dispReason}
              onClick={async () => {
                const lot = lotStocks.find((l) => l.receipt_id === dispReceiptId);
                if (!lot) return;
                const qty = parseFloat(dispQty);
                if (isNaN(qty) || qty <= 0) return showToast("수량을 확인하세요.", "error");
                if (qty > lot.remaining_qty) return showToast(`잔여수량(${lot.remaining_qty.toLocaleString()}${lot.unit}) 초과입니다.`, "error");
                setDispSaving(true);
                const { error } = await supabase.from("material_disposal_logs").insert({
                  material_id: lot.material_id,
                  disposal_date: dispDate,
                  quantity: qty,
                  unit: lot.unit,
                  reason: dispReason,
                  note: dispNote.trim() || null,
                  receipt_id: dispReceiptId,
                  created_by: userId,
                });
                setDispSaving(false);
                if (error) return showToast("폐기 등록 실패: " + error.message, "error");
                showToast(`✅ ${lot.material_name} ${qty.toLocaleString()}${lot.unit} 폐기 등록 완료`);
                setShowDisposalForm(false);
                setDispReceiptId(""); setDispQty(""); setDispReason(""); setDispNote("");
                loadData();
              }}>
              {dispSaving ? "저장 중..." : "🗑️ 폐기 등록"}
            </button>
            <button className={btn} onClick={() => { setShowDisposalForm(false); setDispReceiptId(""); setDispQty(""); setDispReason(""); setDispNote(""); }}>취소</button>
          </div>
        </div>
      )}

     {/* ── 재고 조정 폼 ── */}
     {showAdjustForm && isAdminOrSubadmin && (
        <div className={`${card} p-4`} style={{ borderColor: "#fcd34d" }}>
          <div className="mb-3 flex items-center justify-between">
            <div className="font-semibold text-sm text-amber-700">⚖️ 재고 조정</div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">조정일</span>
              <input type="date" className="rounded-lg border border-amber-300 bg-white px-2 py-1 text-sm focus:outline-none focus:border-amber-500"
                value={adjDate}
                onChange={(e) => setAdjDate(e.target.value)} />
            </div>
          </div>
          <div className="mb-4 flex gap-2">
            <button
              className={`flex-1 rounded-xl border-2 py-2 text-sm font-semibold transition-all
                ${adjMode === "actual" ? "border-amber-500 bg-amber-50 text-amber-700" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"}`}
              onClick={() => { setAdjMode("actual"); setAdjActualQty(""); setAdjDeltaQty(""); }}>
              📦 실제재고 입력<br/>
              <span className="text-xs font-normal opacity-70">실사 후 실제 수량 입력 → 차이 자동 계산</span>
            </button>
            <button
              className={`flex-1 rounded-xl border-2 py-2 text-sm font-semibold transition-all
                ${adjMode === "delta" ? "border-amber-500 bg-amber-50 text-amber-700" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"}`}
              onClick={() => { setAdjMode("delta"); setAdjActualQty(""); setAdjDeltaQty(""); }}>
              ± 조정량 직접 입력<br/>
              <span className="text-xs font-normal opacity-70">증가(+) / 감소(-) 값 직접 입력</span>
            </button>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <div className="mb-1 text-xs text-slate-500">원료 *</div>
              <select className={inp} value={adjMaterialId}
                onChange={(e) => { setAdjMaterialId(e.target.value); setAdjActualQty(""); setAdjDeltaQty(""); }}>
                <option value="">— 원료 선택 —</option>
                {materials.map((m) => (
                  <option key={m.id} value={m.id}>[{m.category}] {m.name}</option>
                ))}
              </select>
              {adjMaterialId && selectedStock && (
                <div className="mt-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600">
                  현재 DB 재고: <span className="font-bold tabular-nums">{currentStockForAdj.toLocaleString()}{selectedStock.unit}</span>
                </div>
              )}
            </div>
            <div>
              {adjMode === "actual" ? (
                <>
                  <div className="mb-1 text-xs text-slate-500">실제 재고량 (실사값) *</div>
                  <input className={inpR} inputMode="decimal" value={adjActualQty}
                    onChange={(e) => setAdjActualQty(e.target.value)}
                    placeholder={selectedStock ? `현재 ${currentStockForAdj.toLocaleString()}${selectedStock.unit}` : "g 입력"} />
                  {computedDelta !== null && !isNaN(computedDelta) && adjMaterialId && (
                    <div className={`mt-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold
                      ${computedDelta > 0 ? "border-green-200 bg-green-50 text-green-700"
                        : computedDelta < 0 ? "border-red-200 bg-red-50 text-red-600"
                        : "border-slate-200 bg-slate-50 text-slate-500"}`}>
                      조정량: {computedDelta > 0 ? "+" : ""}{computedDelta.toLocaleString()}{selectedStock?.unit}
                      {computedDelta === 0 && " (변동 없음)"}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="mb-1 text-xs text-slate-500">조정량 * <span className="text-slate-400">(증가: 양수, 감소: 음수)</span></div>
                  <input className={inpR} inputMode="decimal" value={adjDeltaQty}
                    onChange={(e) => setAdjDeltaQty(e.target.value)}
                    placeholder="예: 5000 또는 -3000" />
                  {deltaValue !== null && !isNaN(deltaValue) && adjMaterialId && (
                    <div className={`mt-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold
                      ${deltaValue > 0 ? "border-green-200 bg-green-50 text-green-700"
                        : deltaValue < 0 ? "border-red-200 bg-red-50 text-red-600"
                        : "border-slate-200 bg-slate-50 text-slate-500"}`}>
                      조정 후 재고: {(currentStockForAdj + deltaValue).toLocaleString()}{selectedStock?.unit}
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="md:col-span-2">
              <div className="mb-1 text-xs text-slate-500">조정 사유 * <span className="text-slate-400">(예: 실사, 손실 반영 등)</span></div>
              <input className={inp} value={adjReason}
                onChange={(e) => setAdjReason(e.target.value)}
                placeholder="조정 사유를 입력하세요" />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              className="flex-1 rounded-xl bg-amber-500 py-2.5 text-sm font-bold text-white hover:bg-amber-600 disabled:opacity-60"
              disabled={adjSaving || !adjMaterialId || finalDelta === null || !adjReason.trim()}
              onClick={saveAdjustment}>
              {adjSaving ? "저장 중..." : `⚖️ 재고 조정 저장${finalDelta !== null && !isNaN(finalDelta) && adjMaterialId ? ` (${finalDelta > 0 ? "+" : ""}${finalDelta}${selectedStock?.unit ?? "g"})` : ""}`}
            </button>
            <button className={btn} onClick={() => { setShowAdjustForm(false); setAdjMaterialId(""); setAdjActualQty(""); setAdjDeltaQty(""); setAdjReason(""); setAdjDate(filterDate); }}>취소</button>
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
              {filteredStocks.map((s) => {
                  const hasAdj = adjustments.some((a) => a.material_id === s.material_id);
                  const isExpanded = expandedMaterialId === s.material_id;
                  return (
                  <React.Fragment key={s.material_id}>
                  <tr className={`border-b border-slate-100 hover:bg-slate-50 ${s.is_below_safety_stock ? "bg-red-50" : ""}`}>
                    <td className="py-2 px-3 text-xs text-slate-500">{s.category}</td>
                    <td className="py-2 px-3 font-medium">
                      {s.material_name}
                      {hasAdj && (
                        <span className="ml-1.5 rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[9px] font-semibold text-amber-600">조정있음</span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums text-green-700">{s.total_received.toLocaleString()}{s.unit}</td>
                    <td className="py-2 px-3 text-right tabular-nums">
                      {s.daily_used > 0 ? (
                        <button
                          className={`tabular-nums font-semibold underline decoration-dotted hover:decoration-solid transition-colors ${isExpanded ? "text-blue-800" : "text-blue-600 hover:text-blue-800"}`}
                          onClick={() => handleDrillDown(s.material_id, s.unit)}>
                          {s.daily_used.toLocaleString()}{s.unit} {isExpanded ? "▲" : "▼"}
                        </button>
                      ) : (
                        <span className="text-blue-700">0{s.unit}</span>
                      )}
                    </td>
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
                  {isExpanded && (
                    <tr className="bg-blue-50">
                      <td colSpan={7} className="py-2 px-6">
                        {drillLoading ? (
                          <div className="text-xs text-slate-400 py-1">불러오는 중...</div>
                        ) : drillRows.length === 0 ? (
                          <div className="text-xs text-slate-400 py-1">내역이 없습니다.</div>
                        ) : (
                          <div className="space-y-0.5">
                          {drillRows.map((row, i) => (
                              <div key={i} className="flex items-center justify-between text-xs py-0.5 border-b border-blue-100 last:border-0">
                                <span className="text-slate-600 flex items-center gap-1.5">
                                  └ {row.displayLabel}
                                  {row.woId && (
                                    
                                    <a href={`/production?wo=${row.woId}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="rounded border border-blue-300 bg-white px-1 py-0.5 text-[10px] font-semibold text-blue-600 hover:bg-blue-50"
                                      onClick={(e) => e.stopPropagation()}>
                                      🔗
                                    </a>
                                  )}
                                </span>
                                <span className="tabular-nums font-semibold text-slate-700 ml-4">{row.quantity.toLocaleString()}{row.unit}</span>
                              </div>
                            ))}
                            <div className="flex items-center justify-between text-xs py-1 font-bold text-blue-700 border-t border-blue-200 mt-0.5">
                              <span>합계</span>
                              <span className="tabular-nums">{drillRows.reduce((sum, r) => sum + r.quantity, 0).toLocaleString()}{drillRows[0]?.unit ?? ""}</span>
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                  );
                })}
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

{/* 당일 조정 내역 */}
{adjustments.filter((a) => a.adjust_date === filterDate).length > 0 && (
  <div className={`${card} p-4`}>
    <div className="mb-3 font-semibold text-sm text-amber-700">⚖️ 재고 조정 내역 — {filterDate}</div>
    <div className="space-y-2">
      {adjustments.filter((a) => a.adjust_date === filterDate).map((a) => (
        <div key={a.id} className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm">{(a.material as any)?.name ?? "—"}</div>
            <div className="text-xs text-slate-600">
              조정량: <b className={a.adjust_qty > 0 ? "text-green-700" : "text-red-600"}>
                {a.adjust_qty > 0 ? "+" : ""}{a.adjust_qty.toLocaleString()}g
              </b>
              {a.actual_qty != null && ` · 실사값: ${a.actual_qty.toLocaleString()}g`}
              {a.reason && ` · ${a.reason}`}
            </div>
          </div>
          {isAdminOrSubadmin && (
            <button
              className="shrink-0 rounded-lg border border-red-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-red-500 hover:bg-red-50"
              onClick={() => deleteAdjustment(a.id)}>
              삭제
            </button>
          )}
        </div>
      ))}
    </div>
  </div>
)}


{/* ── 로트별 현황 ── */}
{lotStocks.length > 0 && (
  <div className={`${card} p-4`}>
    <div className="mb-3 font-semibold text-sm">📋 로트별 소비기한 현황</div>
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-slate-200">
            <th className="text-left py-2 px-3 text-xs text-slate-500 font-semibold">분류</th>
            <th className="text-left py-2 px-3 text-xs text-slate-500 font-semibold">원료명</th>
            <th className="text-center py-2 px-3 text-xs text-slate-500 font-semibold">입고일</th>
            <th className="text-center py-2 px-3 text-xs text-slate-500 font-semibold">소비기한</th>
            <th className="text-right py-2 px-3 text-xs text-slate-500 font-semibold">입고수량</th>
            <th className="text-right py-2 px-3 text-xs text-slate-500 font-semibold">폐기수량</th>
            <th className="text-right py-2 px-3 text-xs text-slate-500 font-semibold">잔여수량</th>
            <th className="text-center py-2 px-3 text-xs text-slate-500 font-semibold">상태</th>
          </tr>
        </thead>
        <tbody>
          {lotStocks.map((lot) => (
            <tr key={lot.receipt_id} className={`border-b border-slate-100 hover:bg-slate-50
              ${lot.expiry_status === "expired" ? "bg-red-50" : lot.expiry_status === "expiring_soon" ? "bg-orange-50" : ""}`}>
              <td className="py-2 px-3 text-xs text-slate-500">{lot.category}</td>
              <td className="py-2 px-3 font-medium text-sm">{lot.material_name}</td>
              <td className="py-2 px-3 text-center text-xs text-slate-600">{lot.received_date}</td>
              <td className="py-2 px-3 text-center text-xs">
                {lot.expiry_date ?? <span className="text-slate-400">없음</span>}
              </td>
              <td className="py-2 px-3 text-right tabular-nums text-xs">{lot.received_qty.toLocaleString()}{lot.unit}</td>
              <td className="py-2 px-3 text-right tabular-nums text-xs text-red-600">
                {lot.disposed_qty > 0 ? lot.disposed_qty.toLocaleString() + lot.unit : "—"}
              </td>
              <td className="py-2 px-3 text-right tabular-nums text-sm font-bold">{lot.remaining_qty.toLocaleString()}{lot.unit}</td>
              <td className="py-2 px-3 text-center">
                {lot.expiry_status === "expired" ? (
                  <span className="rounded-full border border-red-300 bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">🚨 만료</span>
                ) : lot.expiry_status === "expiring_soon" ? (
                  <span className="rounded-full border border-orange-300 bg-orange-100 px-2 py-0.5 text-[10px] font-semibold text-orange-700">⚡ 임박</span>
                ) : (
                  <span className="rounded-full border border-green-200 bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">정상</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
)}

{/* ── 당일 폐기 내역 ── */}
{disposalLogs.length > 0 && (
  <div className={`${card} p-4`}>
    <div className="mb-3 font-semibold text-sm text-red-700">🗑️ 폐기 내역 — {filterDate}</div>
    <div className="space-y-2">
      {disposalLogs.map((d) => (
        <div key={d.id} className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5">
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm">{(d.material as any)?.name ?? "—"}</div>
            <div className="text-xs text-slate-600">
              폐기량: <b className="text-red-700">{d.quantity.toLocaleString()}{d.unit}</b>
              {" · 사유: "}{d.reason}
              {(d.receipt as any)?.received_date && ` · 입고일 ${(d.receipt as any).received_date}`}
              {(d.receipt as any)?.expiry_date && ` · 소비기한 ${(d.receipt as any).expiry_date}`}
              {d.note && ` · ${d.note}`}
            </div>
          </div>
          {isAdminOrSubadmin && (
            <button
              className="shrink-0 rounded-lg border border-red-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-red-500 hover:bg-red-100"
              onClick={async () => {
                if (!confirm("폐기 내역을 삭제하면 해당 수량이 복구됩니다. 삭제하시겠습니까?")) return;
                const { error } = await supabase.from("material_disposal_logs").delete().eq("id", d.id);
                if (error) return showToast("삭제 실패: " + error.message, "error");
                showToast("🗑️ 폐기 내역 삭제 완료");
                loadData();
              }}>
              삭제
            </button>
          )}
        </div>
      ))}
    </div>
  </div>
)}
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

  // ── 작업자 선택 + PIN 인증 ──

  const [logs, setLogs] = useState<WorkLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterDate, setFilterDate] = useState(todayKST());
  const [printFrom, setPrintFrom] = useState(todayKST());
  const [printTo, setPrintTo] = useState(todayKST());
  const [showForm, setShowForm] = useState(false);
  const [employees, setEmployees] = useState<{ id: string; name: string | null }[]>([]);

  // 폼 state
  const [fDate, setFDate] = useState(todayKST());
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

  async function printLogs() {
    const dates: string[] = [];
    const cur = new Date(printFrom + "T00:00:00+09:00");
    const end = new Date(printTo + "T00:00:00+09:00");
    while (cur <= end) {
      dates.push(cur.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }));
      cur.setDate(cur.getDate() + 1);
    }
    if (dates.length === 0) return;

    const results: { date: string; logs: WorkLog[] }[] = [];
    const woByDate = new Map<string, { client_name: string; product_name: string; assignee_production: string | null; assignee_transfer: string | null }[]>();

    for (const date of dates) {
      const [logRes, woRes] = await Promise.all([
        supabase.from("work_logs")
          .select(`id, log_date, worker_id, worker_name, clock_in, clock_out,
            production_summary, instruction, extra_work, note,
            created_by, confirmed_by, approved_by, approved_at,
            creator:users!created_by(name),
            confirmer:users!confirmed_by(name),
            approver:users!approved_by(name)`)
          .eq("log_date", date)
          .order("worker_name"),
        supabase.from("work_orders")
          .select("client_name, product_name, assignee_production, assignee_transfer")
          .eq("status_production", true)
          .gte("updated_at", `${date}T00:00:00+09:00`)
          .lt("updated_at", `${date}T23:59:59+09:00`),
      ]);
      results.push({ date, logs: (logRes.data ?? []) as unknown as WorkLog[] });
      woByDate.set(date, (woRes.data ?? []) as any);
    }

    const employeeMap = new Map<string, { date: string; log: WorkLog }[]>();
    for (const { date, logs: dayLogs } of results) {
      for (const log of dayLogs) {
        if (!employeeMap.has(log.worker_name)) employeeMap.set(log.worker_name, []);
        employeeMap.get(log.worker_name)!.push({ date, log });
      }
    }

    const dayBlock = (date: string, log: WorkLog | null, empName: string) => {
      const d = new Date(date + "T00:00:00+09:00");
      const days = ["일","월","화","수","목","금","토"];
      const dateLabel = `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
      if (!log) {
        return `<div style="flex:1;border:1px solid #ccc;border-radius:6px;padding:10px 12px;min-height:160px;">
          <div style="font-size:8.5pt;font-weight:bold;color:#999;margin-bottom:6px;border-bottom:0.5px solid #eee;padding-bottom:5px;">${dateLabel}</div>
          <div style="font-size:8pt;color:#ccc;text-align:center;margin-top:40px;">기록 없음</div>
        </div>`;
      }
      const dayWos = (woByDate.get(date) ?? []).filter((w: any) =>
        w.assignee_production === empName || w.assignee_transfer === empName
      );
      const woHtml = dayWos.length > 0
        ? dayWos.map((w: any) => `<div style="font-size:7.5pt;padding:2px 0;border-bottom:0.5px solid #f0f0f0;">${w.client_name} — ${w.product_name}</div>`).join("")
        : "";
      return `<div style="flex:1;border:1px solid #ccc;border-radius:6px;padding:10px 12px;min-height:160px;display:flex;flex-direction:column;gap:4px;">
        <div style="font-size:8.5pt;font-weight:bold;margin-bottom:5px;border-bottom:0.5px solid #ddd;padding-bottom:5px;display:flex;justify-content:space-between;align-items:center;"><span>${dateLabel}</span>${(log.clock_in || log.clock_out) ? `<span style="font-size:7.5pt;font-weight:normal;color:#555;">${log.clock_in ? `출근 ${log.clock_in}` : ""}${log.clock_in && log.clock_out ? " · " : ""}${log.clock_out ? `퇴근 ${log.clock_out}` : ""}</span>` : ""}</div>
        ${woHtml ? `<div style="margin-bottom:4px;"><div style="font-size:7pt;color:#888;margin-bottom:2px;font-weight:bold;">처리한 작업지시서</div>${woHtml}</div>` : ""}
        ${log.instruction ? `<div style="font-size:7.5pt;margin-bottom:3px;"><b>지시사항:</b> ${log.instruction}</div>` : ""}
        ${log.extra_work ? `<div style="font-size:7.5pt;margin-bottom:3px;"><b>기타작업:</b> ${log.extra_work}</div>` : ""}
        ${log.note ? `<div style="font-size:7.5pt;color:#666;margin-bottom:3px;">비고: ${log.note}</div>` : ""}
        <div style="margin-top:auto;padding-top:6px;font-size:7pt;color:#888;display:flex;gap:10px;border-top:0.5px solid #eee;">
          <span>작성: ${(log.creator as any)?.name ?? "—"}</span>
          <span>확인: ${(log.confirmer as any)?.name ?? "미확인"}</span>
          <span>승인: ${(log.approver as any)?.name ?? "미승인"}</span>
        </div>
      </div>`;
    };

    let html = "";
    const empEntries = Array.from(employeeMap.entries());
    for (let ei = 0; ei < empEntries.length; ei++) {
      const [empName, entries] = empEntries[ei];
      for (let i = 0; i < dates.length; i += 2) {
        const d1 = dates[i];
        const d2 = dates[i + 1] ?? null;
        const e1 = entries.find((e) => e.date === d1)?.log ?? null;
        const e2 = d2 ? (entries.find((e) => e.date === d2)?.log ?? null) : null;
        const isLastGroup = i + 2 >= dates.length;
        html += `<div style="page-break-inside:avoid;">
          <div style="font-size:12pt;font-weight:bold;margin-bottom:10px;padding-bottom:5px;border-bottom:1.5px solid #222;">
            ${empName}
          </div>
          <div style="display:flex;gap:10px;margin-bottom:16px;">
            ${dayBlock(d1, e1, empName)}
            ${d2 ? dayBlock(d2, e2, empName) : `<div style="flex:1;"></div>`}
          </div>
        </div>`;
        if (!isLastGroup) {
          html += `<div style="page-break-after:always;"></div>`;
        }
      }
      if (ei < empEntries.length - 1) {
        html += `<div style="page-break-after:always;"></div>`;
      }
    }

    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head>
      <meta charset="utf-8">
      <title>근무일지_${printFrom}_${printTo}</title>
      <style>
        @page { size: A4 portrait; margin: 15mm 18mm; }
        body { margin: 0; font-family: 'Malgun Gothic','맑은 고딕',sans-serif; font-size: 9pt; color: #000; }
        * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      </style>
    </head><body>${html}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 500);
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
          
        <div className="flex items-center gap-1.5">
            <input type="date" className="rounded-lg border border-slate-200 px-2 py-1 text-xs focus:outline-none focus:border-blue-400"
              value={printFrom} onChange={(e) => setPrintFrom(e.target.value)} />
            <span className="text-xs text-slate-400">~</span>
            <input type="date" className="rounded-lg border border-slate-200 px-2 py-1 text-xs focus:outline-none focus:border-blue-400"
              value={printTo} onChange={(e) => setPrintTo(e.target.value)} />
            <button className={btnSm} onClick={printLogs}>🖨️ 인쇄</button>
          </div>  
        </div>
      </div>

     

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



{/* 인쇄 전용 숨김 영역 */}
<div id="work-log-print-inner" style={{ display: "none" }}>
  <div style={{ fontFamily: "'Malgun Gothic','맑은 고딕',sans-serif", fontSize: "9pt", color: "#000" }}>
    <div style={{ textAlign: "center", fontSize: "14pt", fontWeight: "bold", marginBottom: 8 }}>
      근무일지 — {filterDate}
    </div>
    {logs.map((log) => (
      <div key={log.id} style={{ border: "1px solid #ccc", borderRadius: 8, padding: "12px 16px", marginBottom: 12, pageBreakInside: "avoid" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <div style={{ fontSize: "11pt", fontWeight: "bold" }}>
            👤 {log.worker_name}
            {(log.clock_in || log.clock_out) && (
              <span style={{ fontSize: "8pt", fontWeight: "normal", color: "#555", marginLeft: 10 }}>
                {log.clock_in && `출근 ${log.clock_in}`}
                {log.clock_in && log.clock_out && " · "}
                {log.clock_out && `퇴근 ${log.clock_out}`}
              </span>
            )}
          </div>
        </div>  
        {log.production_summary && (
          <div style={{ background: "#f8f8f8", border: "1px solid #e0e0e0", borderRadius: 4, padding: "4px 8px", marginBottom: 6, fontSize: "8pt" }}>
            <span style={{ fontWeight: "bold" }}>생산목록: </span>{log.production_summary}
          </div>
        )}
        {log.instruction && (
          <div style={{ fontSize: "8pt", marginBottom: 3 }}><span style={{ fontWeight: "bold" }}>지시사항:</span> {log.instruction}</div>
        )}
        {log.extra_work && (
          <div style={{ fontSize: "8pt", marginBottom: 3 }}><span style={{ fontWeight: "bold" }}>기타작업:</span> {log.extra_work}</div>
        )}
        {log.note && (
          <div style={{ fontSize: "8pt", color: "#666", marginBottom: 3 }}>비고: {log.note}</div>
        )}
        <div style={{ marginTop: 6, fontSize: "7.5pt", color: "#888", display: "flex", gap: 12 }}>
          <span>작성: {(log.creator as any)?.name ?? "—"}</span>
          <span>확인: {(log.confirmer as any)?.name ?? "미확인"}</span>
          <span>승인: {(log.approver as any)?.name ?? "미승인"}</span>
          {log.approved_by && <span style={{ color: "#059669", fontWeight: "bold" }}>✅ 승인완료</span>}
        </div>
      </div>
    ))}
{logs.length === 0 && (
      <div style={{ textAlign: "center", color: "#aaa", padding: 32 }}>해당 날짜 근무일지가 없습니다.</div>
    )}
  </div>
</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 색소 배합 폼 (체크리스트 연동)
// ═══════════════════════════════════════════════════════════
const PIGMENT_TASK_ID = "7e8ecc06-6f92-49b5-802e-7da0bd868a2c";
const GUAR_TASK_ID    = "3ab0bd67-4215-4f8d-a0c1-0f06f3f4f673";
const RAIZE_CUT_TASK_ID = "ab0142bd-5f95-48cc-9786-1100186b0502";
const PEST_TASK_ID = "3d4a86df-e4cb-455e-b672-9f1910c04bc9";
const QC_SAMPLE_TASK_ID = "acccc4a9-e51b-4fe4-95e3-172ce81288c5";
const VALIDITY_SAMPLE_TASK_ID = "8ff14867-9b34-491c-ac1f-eb00c777340f";

function PigmentBlendForm({ employeeName, userId, showToast }: {
  employeeName: string;
  userId: string | null;
  showToast: (msg: string, type?: "success" | "error") => void;
}) {
  const today = todayKST();
  const [recipes, setRecipes] = useState<BlendRecipe[]>([]);
  const [activeCategory, setActiveCategory] = useState("pigment_oil");
  const [selectedRecipeId, setSelectedRecipeId] = useState("");
  const [recipeItems, setRecipeItems] = useState<BlendRecipeItem[]>([]);
  const [multiplier, setMultiplier] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedLogs, setSavedLogs] = useState<{ recipe_name: string; multiplier: number }[]>([]);

  useEffect(() => {
    supabase.from("blend_recipes").select("id,name,category")
      .in("category", ["pigment_oil", "pigment_water"])
      .order("name")
      .then(({ data }) => setRecipes(data ?? []));
    loadSavedLogs();
  }, []);

  async function loadSavedLogs() {
    const { data } = await supabase.from("blend_logs")
      .select("recipe_name,multiplier")
      .eq("log_date", today)
      .eq("employee_name", employeeName)
      .in("recipe_id",
        (await supabase.from("blend_recipes").select("id").in("category", ["pigment_oil", "pigment_water"])).data?.map((r: any) => r.id) ?? []
      )
      .order("happened_at", { ascending: false });
    setSavedLogs(data ?? []);
  }

  const filteredRecipes = recipes.filter((r) => r.category === activeCategory);
  const mult = parseFloat(multiplier) || 1;
  const previewItems = recipeItems.map((i) => ({
    ...i,
    actual_g: Math.round(i.quantity_g * mult * 10) / 10,
  }));

  async function handleRecipeSelect(id: string) {
    setSelectedRecipeId(id);
    if (!id) { setRecipeItems([]); return; }
    const { data } = await supabase.from("blend_recipe_items")
      .select("material_name,quantity_g,step_no").eq("recipe_id", id).order("step_no");
    setRecipeItems(data ?? []);
  }

  async function handleSave() {
    if (!selectedRecipeId) return showToast("레시피를 선택하세요.", "error");
    if (mult <= 0) return showToast("배합 횟수를 확인하세요.", "error");
    setSaving(true);

    const recipe = recipes.find((r) => r.id === selectedRecipeId);
    if (!recipe) { setSaving(false); return; }

    const { data: blendLog, error: blendErr } = await supabase.from("blend_logs")
      .insert({
        happened_at: `${today}T00:00:00+09:00`,
        log_date: today,
        employee_name: employeeName,
        recipe_id: selectedRecipeId,
        recipe_name: recipe.name,
        multiplier: mult,
        note: note.trim() || null,
        created_by: userId,
      })
      .select("id").single();

    if (blendErr || !blendLog) { setSaving(false); return showToast("저장 실패: " + blendErr?.message, "error"); }

    const logItems = previewItems.map((i) => ({ blend_log_id: blendLog.id, material_name: i.material_name, quantity_g: i.actual_g }));
    const { error: itemErr } = await supabase.from("blend_log_items").insert(logItems);
    if (itemErr) { setSaving(false); return showToast("차감 내역 저장 실패: " + itemErr.message, "error"); }

    const { data: matsData } = await supabase.from("materials").select("id,name").in("name", previewItems.map((i) => i.material_name));
    const matMap: Record<string, string> = {};
    (matsData ?? []).forEach((m: any) => { matMap[m.name] = m.id; });
    const usageLogs = previewItems.filter((i) => matMap[i.material_name]).map((i) => ({
      material_id: matMap[i.material_name], used_date: today, quantity: i.actual_g,
      unit: "g", work_type: "blend", note: `${recipe.name} ${mult}배합`, created_by: userId,
    }));
    if (usageLogs.length > 0) {
      const { error: usageErr } = await supabase.from("material_usage_logs").insert(usageLogs);
      if (usageErr) { setSaving(false); return showToast("재고 차감 실패: " + usageErr.message, "error"); }
    }

    setSaving(false);
    showToast(`✅ ${recipe.name} ${mult}배합 저장! 원료 ${usageLogs.length}종 차감됨`);
    setSelectedRecipeId(""); setRecipeItems([]); setMultiplier(""); setNote("");
    loadSavedLogs(); // 저장 기록 갱신, 폼은 유지
  }

  return (
    <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-3">
      <div className="font-semibold text-sm text-blue-700">🎨 색소 배합 기록</div>

      {savedLogs.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {savedLogs.map((l, i) => (
            <span key={i} className="rounded-full border border-green-200 bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-700">
              ✅ {l.recipe_name} {l.multiplier}배합
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {[{ key: "pigment_oil", label: "🎨 지용성" }, { key: "pigment_water", label: "💧 수용성" }].map(({ key, label }) => (
          <button key={key}
            className={`rounded-xl px-3 py-1.5 text-sm font-semibold border transition-all
              ${activeCategory === key ? "border-blue-500 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
            onClick={() => { setActiveCategory(key); setSelectedRecipeId(""); setRecipeItems([]); }}>
            {label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
        {filteredRecipes.map((r) => (
          <button key={r.id}
            className={`rounded-xl border-2 px-3 py-2 text-sm font-medium text-left transition-all
              ${selectedRecipeId === r.id ? "border-blue-500 bg-white text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}
            onClick={() => handleRecipeSelect(r.id)}>
            {r.name}
          </button>
        ))}
      </div>

      {previewItems.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="mb-2 text-xs font-semibold text-slate-500">📋 차감 원료 ({mult}배합)</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
            {previewItems.map((i, idx) => (
              <div key={idx} className="flex justify-between text-xs py-0.5 border-b border-slate-100">
                <span className="text-slate-600">{i.material_name}</span>
                <span className="tabular-nums font-semibold">{i.actual_g}g</span>
              </div>
            ))}
          </div>
        </div>
      )}

<div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <div>
          <div className="mb-1 text-xs text-slate-500">배합 횟수 *</div>
          <div className="flex items-center gap-2">
            <button
              className="w-10 h-10 rounded-xl border-2 border-slate-200 bg-white text-lg font-bold text-slate-600 hover:bg-slate-50 active:bg-slate-100 disabled:opacity-40"
              disabled={parseFloat(multiplier) <= 1 || !multiplier}
              onClick={() => setMultiplier(String(Math.max(1, (parseFloat(multiplier) || 1) - 1)))}>
              −
            </button>
            <div className="flex-1 rounded-xl border-2 border-blue-300 bg-blue-50 py-2 text-center text-lg font-bold text-blue-700">
              {multiplier || "0"}
            </div>
            <button
              className="w-10 h-10 rounded-xl border-2 border-slate-200 bg-white text-lg font-bold text-slate-600 hover:bg-slate-50 active:bg-slate-100"
              onClick={() => setMultiplier(String((parseFloat(multiplier) || 0) + 1))}>
              ＋
            </button>
          </div>
        </div>
        <div>
          <div className="mb-1 text-xs text-slate-500">비고</div>
          <input className={inp} value={note} onChange={(e) => setNote(e.target.value)} placeholder="선택 입력" />
        </div>
      </div>

      <button
        className="w-full rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60"
        disabled={saving || !selectedRecipeId}
        onClick={handleSave}>
        {saving ? "저장 중..." : "💾 색소 배합 저장 (재고 차감)"}
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 구아검 배합 폼 (체크리스트 연동)
// ═══════════════════════════════════════════════════════════
function GuarBlendForm({ employeeName, userId, showToast }: {
  employeeName: string;
  userId: string | null;
  showToast: (msg: string, type?: "success" | "error") => void;
}) {
  const today = todayKST();
  const [multiplier, setMultiplier] = useState(1);
  const [saving, setSaving] = useState(false);
  const [savedLog, setSavedLog] = useState<{ multiplier: number } | null>(null);

  // 구아검 레시피 ID (spray 카테고리, 레이즈 분사)
  // 구아검 배합은 별도 레시피: guar 카테고리로 찾음
  const GUAR_PER_BATCH = 4;
  const WATER_PER_BATCH = 1000;

  useEffect(() => { loadSavedLog(); }, []);

  async function loadSavedLog() {
    const { data: guarRecipe } = await supabase.from("blend_recipes")
      .select("id").eq("name", "레이즈 분사").single();
    if (!guarRecipe) return;
    const { data } = await supabase.from("blend_logs")
      .select("multiplier").eq("log_date", today).eq("employee_name", employeeName)
      .eq("recipe_id", guarRecipe.id).maybeSingle();
    if (data) setSavedLog(data);
  }

  async function handleSave() {
    setSaving(true);
    const { data: guarRecipe } = await supabase.from("blend_recipes")
      .select("id").eq("name", "레이즈 분사").single();
    if (!guarRecipe) { setSaving(false); return showToast("구아검 레시피를 찾을 수 없습니다.", "error"); }

    const { data: blendLog, error: blendErr } = await supabase.from("blend_logs")
      .insert({
        happened_at: `${today}T00:00:00+09:00`,
        log_date: today,
        employee_name: employeeName,
        recipe_id: guarRecipe.id,
        recipe_name: "구아검 배합",
        multiplier,
        note: null,
        created_by: userId,
      })
      .select("id").single();

    if (blendErr || !blendLog) { setSaving(false); return showToast("저장 실패: " + blendErr?.message, "error"); }

    const logItems = [
      { blend_log_id: blendLog.id, material_name: "구아검", quantity_g: GUAR_PER_BATCH * multiplier },
    ];
    await supabase.from("blend_log_items").insert(logItems);

    // 재고 차감 (구아검만, 물은 차감 불필요)
    const { data: matsData } = await supabase.from("materials").select("id,name").eq("name", "구아검");
    if (matsData && matsData.length > 0) {
      await supabase.from("material_usage_logs").insert({
        material_id: matsData[0].id,
        used_date: today,
        quantity: GUAR_PER_BATCH * multiplier,
        unit: "g",
        work_type: "blend",
        note: `구아검 배합 ${multiplier}번`,
        created_by: userId,
      });
    }

    setSaving(false);
    showToast(`✅ 구아검 배합 ${multiplier}번 저장! 구아검 ${GUAR_PER_BATCH * multiplier}g 차감됨`);
    setSavedLog({ multiplier });
  }

  return (
    <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 space-y-3">
      <div className="font-semibold text-sm text-emerald-700">🌿 구아검 배합 기록</div>

      {savedLog && (
        <span className="rounded-full border border-green-200 bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-700">
          ✅ 구아검 배합 {savedLog.multiplier}번 완료
        </span>
      )}

<div>
        <div className="mb-1 text-xs text-slate-600">배합 횟수 *</div>
        <div className="flex items-center gap-2">
          <button
            className="w-10 h-10 rounded-xl border-2 border-slate-200 bg-white text-lg font-bold text-slate-600 hover:bg-slate-50 active:bg-slate-100 disabled:opacity-40"
            disabled={multiplier <= 1}
            onClick={() => setMultiplier((n) => Math.max(1, n - 1))}>
            −
          </button>
          <div className="flex-1 rounded-xl border-2 border-emerald-300 bg-emerald-50 py-2 text-center text-lg font-bold text-emerald-700">
            {multiplier}
          </div>
          <button
            className="w-10 h-10 rounded-xl border-2 border-slate-200 bg-white text-lg font-bold text-slate-600 hover:bg-slate-50 active:bg-slate-100"
            onClick={() => setMultiplier((n) => n + 1)}>
            ＋
          </button>
        </div>
        <div className="mt-2 text-xs text-slate-500">
          구아검 {GUAR_PER_BATCH * multiplier}g · 물 {(WATER_PER_BATCH * multiplier).toLocaleString()}g
        </div>
      </div>

      <button
        className="w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
        disabled={saving}
        onClick={handleSave}>
        {saving ? "저장 중..." : "💾 구아검 배합 저장 (재고 차감)"}
      </button>
    </div>
  );
}

function RaizeCutForm({ employeeName, userId, showToast }: {
  employeeName: string;
  userId: string | null;
  showToast: (msg: string, type?: "success" | "error") => void;
}) {
  const today = todayKST();
  const [cutDate, setCutDate] = useState(today);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savedLogs, setSavedLogs] = useState<{ lot_id: string; qty: number; expiry_date: string }[]>([]);

  type SprayLot = { lot_id: string; expiry_date: string; remaining_qty: number };
  const [lotOptions, setLotOptions] = useState<SprayLot[]>([]);
  const [selected, setSelected] = useState<{ lot_id: string; qty: string }[]>([]);

  useEffect(() => { loadLots(); loadSavedLogs(); }, []);

  async function loadLots() {
    setLoading(true);
    const { data: variants } = await supabase.from("product_variants")
      .select("id").eq("variant_name", "분사-레이즈");
    const variantIds = (variants ?? []).map((v: any) => v.id);
    if (variantIds.length === 0) { setLoading(false); return; }
    const { data: lots } = await supabase.from("lots")
      .select("id, expiry_date").in("variant_id", variantIds)
      .order("expiry_date", { ascending: true });
    const lotIds = (lots ?? []).map((l: any) => l.id);
    if (lotIds.length === 0) { setLoading(false); return; }
    const { data: movements } = await supabase.from("movements")
      .select("lot_id, type, qty").in("lot_id", lotIds);
    const remainMap: Record<string, number> = {};
    (movements ?? []).forEach((m: any) => {
      if (!remainMap[m.lot_id]) remainMap[m.lot_id] = 0;
      if (m.type === "IN") remainMap[m.lot_id] += m.qty;
      else remainMap[m.lot_id] -= m.qty;
    });
    const result: SprayLot[] = (lots ?? [])
      .filter((l: any) => (remainMap[l.id] ?? 0) > 0)
      .map((l: any) => ({ lot_id: l.id, expiry_date: l.expiry_date, remaining_qty: remainMap[l.id] ?? 0 }));
    setLotOptions(result);
    setLoading(false);
  }

  async function loadSavedLogs() {
    const { data } = await supabase.from("pet_stock_logs")
      .select("quantity, log_date, note")
      .eq("log_date", today)
      .eq("log_type", "sale_cut")
      .ilike("note", `%${employeeName}%`);
    if (data && data.length > 0) {
      setSavedLogs(data.map((d: any) => ({
        lot_id: "",
        qty: d.quantity,
        expiry_date: d.log_date,
      })));
    }
  }

  function toggleLot(lotId: string) {
    setSelected((prev) => {
      if (prev.find((s) => s.lot_id === lotId)) {
        return prev.filter((s) => s.lot_id !== lotId);
      }
      return [...prev, { lot_id: lotId, qty: "" }];
    });
  }

  function setQty(lotId: string, qty: string) {
    setSelected((prev) => prev.map((s) => s.lot_id === lotId ? { ...s, qty } : s));
  }

  async function handleSave() {
    if (selected.length === 0) return showToast("재단할 lot을 선택하세요.", "error");
    if (selected.some((s) => !s.qty || Number(s.qty) <= 0)) return showToast("선택한 lot의 수량을 모두 입력하세요.", "error");

    // 잔량 초과 검사
    for (const s of selected) {
      const lot = lotOptions.find((l) => l.lot_id === s.lot_id);
      if (lot && Number(s.qty) > lot.remaining_qty) {
        return showToast(`소비기한 ${lot.expiry_date} lot 차감 수량(${s.qty})이 잔량(${lot.remaining_qty})을 초과합니다.`, "error");
      }
    }

    setSaving(true);
    try {
      // 1. movements OUT 기록 (lot별)
      for (const s of selected) {
        const { error: movErr } = await supabase.from("movements").insert({
          lot_id: s.lot_id,
          type: "OUT",
          qty: Number(s.qty),
          happened_at: `${cutDate}T00:00:00+09:00`,
          note: `레이즈재단 — ${employeeName}`,
          created_by: userId,
        });
        if (movErr) { showToast("재고 차감 실패: " + movErr.message, "error"); setSaving(false); return; }
      }

      // 2. pet_stock_logs sale_cut 기록 (총 수량)
      const totalQty = selected.reduce((s, l) => s + Number(l.qty), 0);
      const { error: petErr } = await supabase.from("pet_stock_logs").insert({
        log_date: cutDate,
        log_type: "sale_cut",
        quantity: totalQty,
        defect_qty: 0,
        note: `재단판매 — ${employeeName}`,
        created_by: userId,
      });
      if (petErr) { showToast("수불 기록 실패: " + petErr.message, "error"); setSaving(false); return; }

      showToast(`✅ 레이즈재단 ${totalQty.toLocaleString()} EA 기록 완료!`);
      setSelected([]);
      await loadLots();
      await loadSavedLogs();
    } finally {
      setSaving(false);
    }
  }

  const totalSelected = selected.reduce((s, l) => s + (Number(l.qty) || 0), 0);

  return (
    <div className="mt-4 rounded-xl border border-purple-200 bg-purple-50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="font-semibold text-sm text-purple-700">✂️ 레이즈재단 기록</div>
        {totalSelected > 0 && (
          <span className="text-xs font-semibold text-purple-700">총 {totalSelected.toLocaleString()} EA</span>
        )}
      </div>

      {savedLogs.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {savedLogs.map((l, i) => (
            <span key={i} className="rounded-full border border-green-200 bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-700">
              ✅ 재단 {l.qty.toLocaleString()} EA 완료
            </span>
          ))}
        </div>
      )}

      <div>
        <div className="mb-1 text-xs text-slate-500">재단일 *</div>
        <input type="date"
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-purple-400 focus:outline-none"
          value={cutDate} onChange={(e) => setCutDate(e.target.value)} />
      </div>

      <div>
        <div className="mb-1.5 text-xs font-semibold text-slate-600">분사-레이즈 재고 선택 (다중 선택 가능)</div>
        {loading ? (
          <div className="text-xs text-slate-400 py-2">불러오는 중...</div>
        ) : lotOptions.length === 0 ? (
          <div className="text-xs text-slate-400 py-2">재고 없음</div>
        ) : (
          <div className="space-y-2">
            {lotOptions.map((lot) => {
              const sel = selected.find((s) => s.lot_id === lot.lot_id);
              const isSelected = !!sel;
              const usedByOthers = selected.filter((s) => s.lot_id !== lot.lot_id).reduce((sum, s) => sum, 0);
              return (
                <div key={lot.lot_id}
                  className={`rounded-xl border p-2.5 transition-all ${isSelected ? "border-purple-400 bg-white" : "border-slate-200 bg-white"}`}>
                  <div className="flex items-center gap-2">
                    <button type="button"
                      className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-all ${isSelected ? "border-purple-500 bg-purple-500" : "border-slate-300 bg-white"}`}
                      onClick={() => toggleLot(lot.lot_id)}>
                      {isSelected && <span className="text-white text-[10px] font-bold">✓</span>}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-slate-700">소비기한: {lot.expiry_date}</div>
                      <div className="text-[11px] text-slate-500">잔량: <b className="text-purple-700">{lot.remaining_qty.toLocaleString()} EA</b></div>
                    </div>
                    {isSelected && (
                      <input
                        className="w-24 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-right tabular-nums focus:border-purple-400 focus:outline-none"
                        inputMode="numeric" placeholder="수량"
                        value={sel.qty}
                        onChange={(e) => setQty(lot.lot_id, e.target.value.replace(/[^\d]/g, ""))}
                        onClick={(e) => e.stopPropagation()}
                      />
                    )}
                    {isSelected && sel.qty && (
                      <div className={`text-[11px] shrink-0 ${lot.remaining_qty - Number(sel.qty) < 0 ? "text-red-600 font-semibold" : "text-slate-400"}`}>
                        차감 후 {(lot.remaining_qty - Number(sel.qty)).toLocaleString()} EA
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <button
        className="w-full rounded-xl bg-purple-600 py-2.5 text-sm font-bold text-white hover:bg-purple-700 disabled:opacity-60"
        disabled={saving || selected.length === 0}
        onClick={handleSave}>
        {saving ? "저장 중..." : `💾 레이즈재단 기록 저장${totalSelected > 0 ? ` (${totalSelected.toLocaleString()} EA)` : ""}`}
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 방충방서 입력 폼 (체크리스트 연동)
// ═══════════════════════════════════════════════════════════
const LOCATIONS_PEST = ["P1-입구","P2-위생전실","P3-생산실","P4-입출고실","P5-원부재료실"];
const TRAPS_PEST = ["NO-01","NO-02","NO-03","NO-04","NO-05","NO-06","NO-07","NO-08"];
const TRAP_LABELS_PEST: Record<string,string> = {
  "NO-01":"NO-01 (원부재료실 우측)","NO-02":"NO-02 (외포장실 좌측)",
  "NO-03":"NO-03 (외포장실 우측)","NO-04":"NO-04 (원부재료실 좌측)",
  "NO-05":"NO-05 (위생전실입구 좌측)","NO-06":"NO-06 (위생전실입구 우측)",
  "NO-07":"NO-07 (생산실입구 좌측)","NO-08":"NO-08 (생산실입구 우측)",
};
const ZONE_MAP_PEST: Record<string,"entrance"|"sanitary"|"production"> = {
  "P1-입구":"entrance","P2-위생전실":"sanitary","P3-생산실":"production",
  "P4-입출고실":"entrance","P5-원부재료실":"sanitary",
};
const THRESHOLDS_PEST = {
  summer:{ entrance:[19,30], sanitary:[9,15], production:[9,15] },
  winter:{ entrance:[14,25], sanitary:[9,15], production:[9,15] },
};
function getPestSeason(dateStr: string): "summer"|"winter" {
  const m = new Date(dateStr+"T00:00:00+09:00").getMonth()+1;
  return m>=5 && m<=10 ? "summer" : "winter";
}
function getPestStep(total: number, loc: string, season: "summer"|"winter"): number {
  const zone = ZONE_MAP_PEST[loc];
  if (!zone) return 1;
  const [t1,t2] = THRESHOLDS_PEST[season][zone];
  if (total<=t1) return 1;
  if (total<=t2) return 2;
  return 3;
}
type PestFlyingRow = { fly:number; mosquito:number; midges:number; fruit_fly:number; moth:number; housefly:number; other:number; total:number; step:number; action_note:string; };
type PestWalkingRow = { grima:number; spider:number; centipede:number; mosquito:number; earwig:number; other:number; total:number; };

function initPestFlying(): Record<string,PestFlyingRow> {
  const m: Record<string,PestFlyingRow> = {};
  for (const loc of LOCATIONS_PEST)
    m[loc] = { fly:0,mosquito:0,midges:0,fruit_fly:0,moth:0,housefly:0,other:0,total:0,step:1,action_note:"" };
  return m;
}
function initPestWalking(): Record<string,PestWalkingRow> {
  const m: Record<string,PestWalkingRow> = {};
  for (const trap of TRAPS_PEST)
    m[trap] = { grima:0,spider:0,centipede:0,mosquito:0,earwig:0,other:0,total:0 };
  return m;
}

function PestNumCell({ value, onChange }: { value:number; onChange:(v:number)=>void }) {
  const [focused, setFocused] = useState(false);
  const displayVal = focused && value===0 ? "" : value!==0 ? value : "";
  return (
    <input type="number" min={0} value={displayVal} placeholder=""
      onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)}
      onChange={e=>onChange(Math.max(0,parseInt(e.target.value)||0))}
      className="w-full text-center text-xs py-1 rounded bg-transparent focus:outline-none focus:bg-blue-50 hover:bg-slate-50"
    />
  );
}

function PestInputForm({ employeeName, userId, showToast, onSaved }: {
  employeeName: string; userId: string | null;
  showToast: (msg:string, type?:"success"|"error")=>void;
  onSaved: ()=>void;
}) {
  const today = todayKST();
  const season = getPestSeason(today);
  const [flying, setFlying] = useState<Record<string,PestFlyingRow>>(()=>initPestFlying());
  const [walking, setWalking] = useState<Record<string,PestWalkingRow>>(()=>initPestWalking());
  const [lureLeft,setLureLeft]=useState("X"); const [damageLeft,setDamageLeft]=useState("X"); const [ratLeft,setRatLeft]=useState("X");
  const [lureRight,setLureRight]=useState("X"); const [damageRight,setDamageRight]=useState("X"); const [ratRight,setRatRight]=useState("X");
  const [ratActionNote, setRatActionNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedDate, setSavedDate] = useState<string|null>(null);
  const [prevFlying, setPrevFlying] = useState<Record<string, number>>({});
  const [prevWalking, setPrevWalking] = useState<Record<string, number>>({});
  const [prevDate, setPrevDate] = useState<string|null>(null);
  const [stickyFlying, setStickyFlying] = useState<Record<string, { replaced: boolean; note: string }>>(() => {
    const m: Record<string, { replaced: boolean; note: string }> = {};
    for (const loc of LOCATIONS_PEST) m[loc] = { replaced: false, note: "" };
    return m;
  });
  const [stickyWalking, setStickyWalking] = useState<Record<string, { replaced: boolean; note: string }>>(() => {
    const m: Record<string, { replaced: boolean; note: string }> = {};
    for (const trap of TRAPS_PEST) m[trap] = { replaced: false, note: "" };
    return m;
  });

  useEffect(() => {
    // 오늘 이미 저장된 기록 있으면 불러오기
    supabase.from("pest_flying_records").select("*").eq("record_date", today)
      .then(({ data }) => {
        if (!data || data.length === 0) return;
        const fMap = initPestFlying();
        for (const row of data) {
          if (fMap[row.location]) {
            fMap[row.location] = {
              fly:row.fly??0, mosquito:row.mosquito??0, midges:row.midges??0,
              fruit_fly:row.fruit_fly??0, moth:row.moth??0, housefly:row.housefly??0,
              other:row.other??0, total:row.total??0, step:row.step??1,
              action_note:row.action_note??"",
            };
            if (row.location==="P1-입구") {
              setLureLeft(row.lure_left??"X"); setDamageLeft(row.damage_left??"X"); setRatLeft(row.rat_left??"X");
              setLureRight(row.lure_right??"X"); setDamageRight(row.damage_right??"X"); setRatRight(row.rat_right??"X");
              setRatActionNote(row.rat_action_note??"");
            }
          }
        }
        setFlying(fMap);
        setSavedDate(today);
      });
      supabase.from("pest_walking_records").select("*").eq("record_date", today)
      .then(({ data }) => {
        if (!data || data.length === 0) return;
        const wMap = initPestWalking();
        for (const row of data) {
          if (wMap[row.trap_no])
            wMap[row.trap_no] = { grima:row.grima??0,spider:row.spider??0,centipede:row.centipede??0,mosquito:row.mosquito??0,earwig:row.earwig??0,other:row.other??0,total:row.total??0 };
        }
        setWalking(wMap);
      });
    supabase.from("pest_sticky_replacements").select("*").eq("record_date", today)
      .then(({ data }) => {
        if (!data || data.length === 0) return;
        const fMap: Record<string, { replaced: boolean; note: string }> = {};
        for (const loc of LOCATIONS_PEST) fMap[loc] = { replaced: false, note: "" };
        const wMap: Record<string, { replaced: boolean; note: string }> = {};
        for (const trap of TRAPS_PEST) wMap[trap] = { replaced: false, note: "" };
        for (const row of data) {
          if (row.target_type === "flying" && fMap[row.target_key] !== undefined)
            fMap[row.target_key] = { replaced: row.replaced, note: row.note ?? "" };
          if (row.target_type === "walking" && wMap[row.target_key] !== undefined)
            wMap[row.target_key] = { replaced: row.replaced, note: row.note ?? "" };
        }
        setStickyFlying(fMap);
        setStickyWalking(wMap);
      });
  }, [today]);

  useEffect(() => {
    // 위치별/트랩별 "마지막 교체일(replaced=true) 이후 ~ 오늘 이전 가장 최근 점검일까지" 누적 합계
    // 교체일 당일 수치는 교체 전 누적에 포함, 다음 점검부터 새 누적 시작 (사용자 확인됨)
    (async () => {
      const [{ data: stickyRows }, { data: fRows }, { data: wRows }] = await Promise.all([
        supabase.from("pest_sticky_replacements")
          .select("target_type,target_key,record_date")
          .eq("replaced", true)
          .lt("record_date", today),
        supabase.from("pest_flying_records")
          .select("location,record_date,total")
          .lt("record_date", today),
        supabase.from("pest_walking_records")
          .select("trap_no,record_date,total")
          .lt("record_date", today),
      ]);

      const lastReplaceFlying: Record<string, string> = {};
      const lastReplaceWalking: Record<string, string> = {};
      (stickyRows ?? []).forEach((s: any) => {
        if (s.target_type === "flying") {
          if (!lastReplaceFlying[s.target_key] || s.record_date > lastReplaceFlying[s.target_key])
            lastReplaceFlying[s.target_key] = s.record_date;
        } else if (s.target_type === "walking") {
          if (!lastReplaceWalking[s.target_key] || s.record_date > lastReplaceWalking[s.target_key])
            lastReplaceWalking[s.target_key] = s.record_date;
        }
      });

      const fMap: Record<string, number> = {};
      (fRows ?? []).forEach((r: any) => {
        const cutoff = lastReplaceFlying[r.location];
        if (cutoff && r.record_date <= cutoff) return;
        fMap[r.location] = (fMap[r.location] ?? 0) + (r.total ?? 0);
      });
      setPrevFlying(fMap);

      const wMap: Record<string, number> = {};
      (wRows ?? []).forEach((r: any) => {
        const cutoff = lastReplaceWalking[r.trap_no];
        if (cutoff && r.record_date <= cutoff) return;
        wMap[r.trap_no] = (wMap[r.trap_no] ?? 0) + (r.total ?? 0);
      });
      setPrevWalking(wMap);

      const flyingDates = (fRows ?? []).map((r: any) => r.record_date);
      if (flyingDates.length > 0) setPrevDate(flyingDates.sort().slice(-1)[0]);
    })();
  }, [today]);

  function updateFlying(loc: string, field: keyof PestFlyingRow, value: number|string) {
    setFlying(prev => {
      const rec = { ...prev[loc], [field]: value };
      if (["fly","mosquito","midges","fruit_fly","moth","housefly","other"].includes(field as string)) {
        rec.total = rec.fly+rec.mosquito+rec.midges+rec.fruit_fly+rec.moth+rec.housefly+rec.other;
        rec.step = getPestStep(rec.total, loc, season);
        if (rec.step===1) rec.action_note="";
      }
      return { ...prev, [loc]: rec };
    });
  }

  function updateWalking(trap: string, field: keyof PestWalkingRow, value: number) {
    setWalking(prev => {
      const rec = { ...prev[trap], [field]: value };
      rec.total = rec.grima+rec.spider+rec.centipede+rec.mosquito+rec.earwig+rec.other;
      return { ...prev, [trap]: rec };
    });
  }

  const ratFound = ratLeft==="O" || ratRight==="O";
  const flyFields: (keyof PestFlyingRow)[] = ["fly","mosquito","midges","fruit_fly","moth","housefly","other"];
  const walkFields: (keyof PestWalkingRow)[] = ["grima","spider","centipede","mosquito","earwig","other"];

  async function handleSave() {
    const missingAction = LOCATIONS_PEST.filter(loc=>flying[loc].step>=2 && !flying[loc].action_note.trim());
    if (missingAction.length>0) return showToast("⚠ 기준 초과 항목의 조치사항을 입력해주세요.","error");
    if (ratFound && !ratActionNote.trim()) return showToast("⚠ 쥐흔적 발견 — 조치사항을 입력해주세요.","error");
    setSaving(true);
    try {
      const happenedAt = `${today}T00:00:00+09:00`;
      const flyRows = LOCATIONS_PEST.map(loc => ({
        record_date: today, location: loc, happened_at: happenedAt,
        inspector_name: employeeName, created_by: userId,
        fly:flying[loc].fly, mosquito:flying[loc].mosquito, midges:flying[loc].midges,
        fruit_fly:flying[loc].fruit_fly, moth:flying[loc].moth, housefly:flying[loc].housefly,
        other:flying[loc].other, total:flying[loc].total, step:flying[loc].step,
        action_note: flying[loc].action_note.trim()||null,
        lure_left: loc==="P1-입구" ? lureLeft : null,
        damage_left: loc==="P1-입구" ? damageLeft : null,
        rat_left: loc==="P1-입구" ? ratLeft : null,
        lure_right: loc==="P1-입구" ? lureRight : null,
        damage_right: loc==="P1-입구" ? damageRight : null,
        rat_right: loc==="P1-입구" ? ratRight : null,
        rat_action_note: loc==="P1-입구" ? (ratActionNote.trim()||null) : null,
      }));
      const { error: fErr } = await supabase.from("pest_flying_records")
        .upsert(flyRows, { onConflict:"record_date,location" });
      if (fErr) throw fErr;
      const walkRows = TRAPS_PEST.map(trap => ({
        record_date: today, trap_no: trap, happened_at: happenedAt,
        inspector_name: employeeName, created_by: userId,
        grima:walking[trap].grima, spider:walking[trap].spider, centipede:walking[trap].centipede,
        mosquito:walking[trap].mosquito, earwig:walking[trap].earwig, other:walking[trap].other,
        total:walking[trap].total,
      }));
      const { error: wErr } = await supabase.from("pest_walking_records")
      .upsert(walkRows, { onConflict:"record_date,trap_no" });
    if (wErr) throw wErr;
    // 끈끈이 교체 기록 저장
    const stickyRows = [
      ...LOCATIONS_PEST.map(loc => ({
        record_date: today,
        target_type: "flying" as const,
        target_key: loc,
        replaced: stickyFlying[loc]?.replaced ?? false,
        note: stickyFlying[loc]?.note?.trim() || null,
        inspector_name: employeeName,
        created_by: userId,
      })),
      ...TRAPS_PEST.map(trap => ({
        record_date: today,
        target_type: "walking" as const,
        target_key: trap,
        replaced: stickyWalking[trap]?.replaced ?? false,
        note: stickyWalking[trap]?.note?.trim() || null,
        inspector_name: employeeName,
        created_by: userId,
      })),
    ];
    const { error: sErr } = await supabase.from("pest_sticky_replacements")
      .upsert(stickyRows, { onConflict: "record_date,target_type,target_key" });
    if (sErr) throw sErr;
    showToast("✅ 방충방서 기록 완료!");
    setSavedDate(today);
    onSaved();
    } catch(e:any) {
      showToast("저장 실패: "+e.message,"error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="font-semibold text-sm text-green-700">🪲 방충방서 점검 기록</div>
        {savedDate && <span className="rounded-full border border-green-300 bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-700">✅ {savedDate} 저장됨</span>}
        {prevDate && <span className="text-[11px] text-slate-400">(지난주 컬럼: {prevDate} 기록)</span>}
      </div>

      {/* 비래해충 */}
      <div>
        <div className="mb-2 text-xs font-semibold text-slate-600">비래해충 — 포충등</div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs" style={{minWidth:520}}>
            <thead>
              <tr className="bg-slate-100">
              <th className="border border-slate-200 py-1.5 px-2 text-slate-500 w-24 whitespace-nowrap">위치</th>
                {["파리","모기","깔다구","초파리","나방","날파리","기타"].map(h=>(
                  <th key={h} className="border border-slate-200 py-1.5 px-1 text-slate-500">{h}</th>
                ))}
               <th className="border border-slate-200 py-1.5 px-2 bg-blue-50 text-blue-700 w-10">계</th>
               <th className="border border-slate-200 py-1.5 px-2 bg-slate-100 text-slate-400 w-12 text-[10px] whitespace-nowrap">누계</th>
               <th className="border border-slate-200 py-1.5 px-2 w-14 whitespace-nowrap">단계</th>
                <th className="border border-slate-200 py-1.5 px-2 bg-lime-50 text-lime-700 w-20 text-[10px] whitespace-nowrap">끈끈이교체</th>
              </tr>
            </thead>
            <tbody>
              {LOCATIONS_PEST.map(loc=>{
                const r=flying[loc];
                const stepCls = r.step===3?"bg-red-50 text-red-700":r.step===2?"bg-amber-50 text-amber-700":"bg-blue-50 text-blue-700";
                const stepLabel = r.step===3?"3단계":r.step===2?"2단계":"1단계";
                return (
                  <React.Fragment key={loc}>
                    <tr>
                    <td className="border border-slate-200 py-1 px-2 bg-slate-50 text-[11px] font-medium text-slate-600 whitespace-nowrap">{loc}</td>
                      {flyFields.map(f=>(
                        <td key={f as string} className="border border-slate-200 p-0.5">
                          <PestNumCell value={r[f] as number} onChange={v=>updateFlying(loc,f,v)} />
                        </td>
                      ))}
                      <td className={`border border-slate-200 py-1 px-2 text-center font-semibold ${stepCls}`}>{r.total>0?r.total:""}</td>
                      <td className="border border-slate-200 py-1 px-2 text-center text-[11px] text-slate-400">{prevFlying[loc] ?? "—"}</td>
                      <td className="border border-slate-200 py-1 px-2 text-center whitespace-nowrap">
                        <span className={`inline-block rounded-full border px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap ${r.step===3?"bg-red-50 border-red-300 text-red-700":r.step===2?"bg-amber-50 border-amber-300 text-amber-700":"bg-green-50 border-green-300 text-green-700"}`}>{stepLabel}</span>
                      </td>
                      <td className="border border-slate-200 py-1 px-2 text-center bg-lime-50">
                        <input type="checkbox"
                          checked={stickyFlying[loc]?.replaced ?? false}
                          onChange={e => setStickyFlying(prev => ({ ...prev, [loc]: { ...prev[loc], replaced: e.target.checked } }))}
                          className="w-4 h-4 accent-lime-600"
                        />
                      </td>
                    </tr>
                    {r.step>=2 && (
                     <tr>
                     <td colSpan={12} className={`border px-3 py-1.5 ${r.step===3?"border-red-200 bg-red-50":"border-amber-200 bg-amber-50"}`}>
                       <div className={`text-[11px] font-semibold mb-1 ${r.step===3?"text-red-600":"text-amber-700"}`}>⚠ {r.step===3?"3단계":"2단계"} — 조치사항 입력 필수</div>
                       <input className={`w-full rounded-lg border px-2 py-1 text-xs focus:outline-none ${r.step===3?"border-red-300":"border-amber-300"}`}
                         placeholder="조치사항 입력" value={r.action_note}
                         onChange={e=>updateFlying(loc,"action_note",e.target.value)} />
                     </td>
                   </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 쥐먹이 상자 */}
      <div>
        <div className="mb-2 text-xs font-semibold text-slate-600">쥐먹이 상자 점검</div>
        <div className="grid grid-cols-2 gap-3">
          {([["left","좌측"],["right","우측"]] as const).map(([side,label])=>{
            const vals = side==="left"
              ? {lure:lureLeft,damage:damageLeft,rat:ratLeft}
              : {lure:lureRight,damage:damageRight,rat:ratRight};
            const setters = side==="left"
              ? {lure:setLureLeft,damage:setDamageLeft,rat:setRatLeft}
              : {lure:setLureRight,damage:setDamageRight,rat:setRatRight};
            return (
              <div key={side} className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="text-xs font-semibold text-slate-600 mb-2">{label}</div>
                {(["lure","damage","rat"] as const).map(field=>{
                  const fieldLabels={lure:"이끼상태",damage:"훼손여부",rat:"쥐흔적"};
                  return (
                    <div key={field} className="mb-2">
                      <div className="text-[11px] text-slate-500 mb-1">{fieldLabels[field]}</div>
                      <div className="flex gap-1">
                        {["O","X"].map(v=>(
                          <button key={v} type="button"
                            className={`flex-1 rounded-lg border py-1 text-xs font-bold transition-all
                              ${vals[field]===v
                                ? v==="O"?"border-green-400 bg-green-100 text-green-700":"border-red-400 bg-red-100 text-red-700"
                                : "border-slate-200 bg-white text-slate-400 hover:bg-slate-50"}`}
                            onClick={()=>setters[field](v)}>{v}</button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
        {ratFound && (
          <div className="mt-2 rounded-xl border border-red-200 bg-red-50 p-3">
            <div className="text-[11px] font-semibold text-red-600 mb-1">⚠ 쥐흔적 발견 — 조치사항 입력 필수</div>
            <input className={`w-full rounded-lg border px-2 py-1.5 text-xs focus:outline-none ${!ratActionNote.trim()?"border-red-300 bg-red-50":"border-slate-200 bg-white"}`}
              placeholder="예: 서식장소 확인, 구서제 추가 설치 및 투여"
              value={ratActionNote} onChange={e=>setRatActionNote(e.target.value)} />
          </div>
        )}
      </div>

      {/* 보행해충 */}
      <div>
        <div className="mb-2 text-xs font-semibold text-slate-600">보행해충 — 트랩</div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs" style={{minWidth:480}}>
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-200 py-1.5 px-2 text-slate-500" style={{minWidth:140}}>트랩</th>
                {["그리마","거미","노래기","모기","집게벌래","기타"].map(h=>(
                  <th key={h} className="border border-slate-200 py-1.5 px-1 text-slate-500">{h}</th>
                ))}
                <th className="border border-slate-200 py-1.5 px-2 bg-blue-50 text-blue-700 w-10">계</th>
                <th className="border border-slate-200 py-1.5 px-2 bg-slate-100 text-slate-400 w-12 text-[10px] whitespace-nowrap">누계</th>
                <th className="border border-slate-200 py-1.5 px-2 bg-lime-50 text-lime-700 w-20 text-[10px] whitespace-nowrap">끈끈이교체</th>
              </tr>
            </thead>
            <tbody>
              {TRAPS_PEST.map(trap=>{
                const r=walking[trap];
                return (
                  <tr key={trap}>
                    <td className="border border-slate-200 py-1 px-2 bg-slate-50 text-[11px] font-medium text-slate-600 whitespace-nowrap">{TRAP_LABELS_PEST[trap]}</td>
                    {walkFields.map(f=>(
                      <td key={f as string} className="border border-slate-200 p-0.5">
                        <PestNumCell value={r[f] as number} onChange={v=>updateWalking(trap,f,v)} />
                      </td>
                    ))}
                  <td className="border border-slate-200 py-1 px-2 text-center font-semibold bg-blue-50 text-blue-700">{r.total>0?r.total:""}</td>
                    <td className="border border-slate-200 py-1 px-2 text-center text-[11px] text-slate-400">{prevWalking[trap] ?? "—"}</td>
                    <td className="border border-slate-200 py-1 px-2 text-center bg-lime-50">
                      <input type="checkbox"
                        checked={stickyWalking[trap]?.replaced ?? false}
                        onChange={e => setStickyWalking(prev => ({ ...prev, [trap]: { ...prev[trap], replaced: e.target.checked } }))}
                        className="w-4 h-4 accent-lime-600"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <button
        className="w-full rounded-xl bg-green-600 py-2.5 text-sm font-bold text-white hover:bg-green-700 disabled:opacity-60"
        disabled={saving} onClick={handleSave}>
        {saving ? "저장 중..." : "💾 방충방서 기록 저장"}
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 자가품질검사 샘플준비 폼
// ═══════════════════════════════════════════════════════════
const QC_MATERIALS = [
  { id: "00000000-0003-0000-0000-000000000002", name: "이산화티타늄", qty: 160 },
  { id: "00000000-0003-0000-0000-000000000001", name: "팜유",         qty: 180 },
  { id: "00000000-0003-0000-0000-000000000007", name: "밀납",         qty: 40  },
  { id: "00000000-0001-0000-0000-000000000001", name: "다크컴파운드", qty: 150 },
  { id: "00000000-0002-0000-0000-000000000001", name: "화이트컴파운드", qty: 600 },
];

function QcSampleForm({ employeeName, userId, showToast }: {
  employeeName: string;
  userId: string | null;
  showToast: (msg: string, type?: "success" | "error") => void;
}) {
  const today = todayKST();
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [qtys, setQtys] = useState<Record<string, number>>(
    () => Object.fromEntries(QC_MATERIALS.map((m) => [m.id, m.qty]))
  );

  useEffect(() => {
    supabase.from("material_usage_logs")
      .select("id")
      .eq("used_date", today)
      .eq("work_type", "qc_sample")
      .eq("note", `자가품질검사 샘플준비 — ${employeeName}`)
      .limit(1)
      .then(({ data }) => {
        if (data && data.length > 0) setSavedAt(today);
      });
  }, [today, employeeName]);

  async function handleSave() {
    if (savedAt) return showToast("이미 오늘 저장된 기록이 있습니다.", "error");
    if (QC_MATERIALS.some((m) => !qtys[m.id] || qtys[m.id] <= 0))
      return showToast("수량을 확인하세요.", "error");
    setSaving(true);
    const usageLogs = QC_MATERIALS.map((m) => ({
      material_id: m.id,
      used_date: today,
      quantity: qtys[m.id],
      unit: "g",
      work_type: "qc_sample",
      note: `자가품질검사 샘플준비 — ${employeeName}`,
      created_by: userId,
    }));
    const { error } = await supabase.from("material_usage_logs").insert(usageLogs);
    setSaving(false);
    if (error) return showToast("재고 차감 실패: " + error.message, "error");
    showToast("✅ 자가품질검사 샘플준비 원료 차감 완료!");
    setSavedAt(today);
  }

  const total = QC_MATERIALS.reduce((s, m) => s + (qtys[m.id] || 0), 0);

  return (
    <div className="mt-4 rounded-xl border border-cyan-200 bg-cyan-50 p-4 space-y-3">
      <div className="font-semibold text-sm text-cyan-700">🔬 자가품질검사 샘플준비 — 원료 차감</div>

      {savedAt && (
        <span className="rounded-full border border-green-200 bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-700">
          ✅ 오늘 차감 완료
        </span>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <div className="mb-2 text-xs font-semibold text-slate-500">차감 원료 목록</div>
        <div className="space-y-1.5">
          {QC_MATERIALS.map((m) => (
            <div key={m.id} className="flex items-center gap-2 py-0.5 border-b border-slate-100">
              <span className="flex-1 text-xs text-slate-600">{m.name}</span>
              {savedAt ? (
                <span className="tabular-nums text-xs font-semibold text-slate-700">{qtys[m.id]}g</span>
              ) : (
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={1}
                    className="w-20 rounded-lg border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-right tabular-nums focus:border-cyan-400 focus:outline-none"
                    value={qtys[m.id]}
                    onChange={(e) => setQtys((prev) => ({
                      ...prev,
                      [m.id]: Math.max(0, parseInt(e.target.value) || 0),
                    }))}
                  />
                  <span className="text-xs text-slate-400">g</span>
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="mt-2 text-right text-xs font-bold text-slate-700">
          총 {total.toLocaleString()}g
        </div>
      </div>

      <button
        className="w-full rounded-xl bg-cyan-600 py-2.5 text-sm font-bold text-white hover:bg-cyan-700 disabled:opacity-60"
        disabled={saving || !!savedAt}
        onClick={handleSave}>
        {saving ? "저장 중..." : savedAt ? "✅ 완료" : "💾 저장"}
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 유효성평가검사 샘플준비 폼
// ═══════════════════════════════════════════════════════════
const VALIDITY_MATERIALS = [
  { id: "00000000-0001-0000-0000-000000000001", name: "다크컴파운드",   qty: 700 },
  { id: "00000000-0002-0000-0000-000000000001", name: "화이트컴파운드", qty: 700 },
  { id: "00000000-0003-0000-0000-000000000001", name: "팜유",           qty: 200 },
];

function ValiditySampleForm({ employeeName, userId, showToast }: {
  employeeName: string;
  userId: string | null;
  showToast: (msg: string, type?: "success" | "error") => void;
}) {
  const today = todayKST();
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [qtys, setQtys] = useState<Record<string, number>>(
    () => Object.fromEntries(VALIDITY_MATERIALS.map((m) => [m.id, m.qty]))
  );

  useEffect(() => {
    supabase.from("material_usage_logs")
      .select("id")
      .eq("used_date", today)
      .eq("work_type", "validity_sample")
      .eq("note", `유효성평가검사 샘플준비 — ${employeeName}`)
      .limit(1)
      .then(({ data }) => {
        if (data && data.length > 0) setSavedAt(today);
      });
  }, [today, employeeName]);

  async function handleSave() {
    if (savedAt) return showToast("이미 오늘 저장된 기록이 있습니다.", "error");
    if (VALIDITY_MATERIALS.some((m) => !qtys[m.id] || qtys[m.id] <= 0))
      return showToast("수량을 확인하세요.", "error");
    setSaving(true);
    const usageLogs = VALIDITY_MATERIALS.map((m) => ({
      material_id: m.id,
      used_date: today,
      quantity: qtys[m.id],
      unit: "g",
      work_type: "validity_sample",
      note: `유효성평가검사 샘플준비 — ${employeeName}`,
      created_by: userId,
    }));
    const { error } = await supabase.from("material_usage_logs").insert(usageLogs);
    setSaving(false);
    if (error) return showToast("재고 차감 실패: " + error.message, "error");
    showToast("✅ 유효성평가검사 샘플준비 원료 차감 완료!");
    setSavedAt(today);
  }

  const total = VALIDITY_MATERIALS.reduce((s, m) => s + (qtys[m.id] || 0), 0);

  return (
    <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50 p-4 space-y-3">
      <div className="font-semibold text-sm text-violet-700">🧫 유효성평가검사 샘플준비 — 원료 차감</div>

      {savedAt && (
        <span className="rounded-full border border-green-200 bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-700">
          ✅ 오늘 차감 완료
        </span>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <div className="mb-2 text-xs font-semibold text-slate-500">차감 원료 목록</div>
        <div className="space-y-1.5">
          {VALIDITY_MATERIALS.map((m) => (
            <div key={m.id} className="flex items-center gap-2 py-0.5 border-b border-slate-100">
              <span className="flex-1 text-xs text-slate-600">{m.name}</span>
              {savedAt ? (
                <span className="tabular-nums text-xs font-semibold text-slate-700">{qtys[m.id]}g</span>
              ) : (
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={1}
                    className="w-20 rounded-lg border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-right tabular-nums focus:border-violet-400 focus:outline-none"
                    value={qtys[m.id]}
                    onChange={(e) => setQtys((prev) => ({
                      ...prev,
                      [m.id]: Math.max(0, parseInt(e.target.value) || 0),
                    }))}
                  />
                  <span className="text-xs text-slate-400">g</span>
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="mt-2 text-right text-xs font-bold text-slate-700">
          총 {total.toLocaleString()}g
        </div>
      </div>

      <button
        className="w-full rounded-xl bg-violet-600 py-2.5 text-sm font-bold text-white hover:bg-violet-700 disabled:opacity-60"
        disabled={saving || !!savedAt}
        onClick={handleSave}>
        {saving ? "저장 중..." : savedAt ? "✅ 완료" : "💾 저장"}
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 배합 섹션 (색소/구아검/분사/코팅)
// ═══════════════════════════════════════════════════════════
type BlendRecipe = { id: string; name: string; category: string };
type BlendRecipeItem = { material_name: string; quantity_g: number; step_no: number | null };
type BlendLog = {
  id: string; happened_at: string; log_date: string;
  employee_name: string; recipe_name: string; multiplier: number; note: string | null;
  items: { material_name: string; quantity_g: number }[];
};

const CATEGORY_LABELS: Record<string, string> = {
  pigment_oil:   "🎨 지용성 색소",
  pigment_water: "💧 수용성 색소",
  spray:         "💨 레이즈 분사",
  coating:       "🧴 레이즈 코팅",
};

function BlendSection({ userId, showToast }: {
  userId: string | null;
  showToast: (msg: string, type?: "success" | "error") => void;
}) {
  const [recipes, setRecipes] = useState<BlendRecipe[]>([]);
  const [selectedRecipeId, setSelectedRecipeId] = useState("");
  const [recipeItems, setRecipeItems] = useState<BlendRecipeItem[]>([]);
  const [multiplier, setMultiplier] = useState("1");
  const [employeeName, setEmployeeName] = useState("");
  const [employees, setEmployees] = useState<{ id: string; name: string }[]>([]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [logs, setLogs] = useState<BlendLog[]>([]);
  const [logDate, setLogDate] = useState(todayKST());
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [activeCategory, setActiveCategory] = useState("pigment_oil");

  useEffect(() => {
    supabase.from("blend_recipes").select("id,name,category").order("category").order("name")
      .then(({ data }) => setRecipes(data ?? []));
    supabase.from("employees").select("id,name").is("resign_date", null).order("name")
      .then(({ data }) => setEmployees(data ?? []));
  }, []);

  useEffect(() => { loadLogs(); }, [logDate]);

  const filteredRecipes = recipes.filter((r) => r.category === activeCategory);

  async function handleRecipeSelect(id: string) {
    setSelectedRecipeId(id);
    if (!id) { setRecipeItems([]); return; }
    const { data } = await supabase
      .from("blend_recipe_items")
      .select("material_name,quantity_g,step_no")
      .eq("recipe_id", id)
      .order("step_no");
    setRecipeItems(data ?? []);
  }

  const mult = parseFloat(multiplier) || 1;
  const previewItems = recipeItems.map((i) => ({
    ...i,
    actual_g: Math.round(i.quantity_g * mult * 10) / 10,
  }));

  async function handleSave() {
    if (!selectedRecipeId || !employeeName)
      return showToast("레시피와 작업자를 선택하세요.", "error");
    if (mult <= 0) return showToast("배합 횟수를 확인하세요.", "error");
    setSaving(true);

    const recipe = recipes.find((r) => r.id === selectedRecipeId);
    if (!recipe) { setSaving(false); return; }

    const happenedAt = `${logDate}T00:00:00+09:00`;

    const { data: blendLog, error: blendErr } = await supabase
      .from("blend_logs")
      .insert({
        happened_at: happenedAt,
        log_date: logDate,
        employee_name: employeeName,
        recipe_id: selectedRecipeId,
        recipe_name: recipe.name,
        multiplier: mult,
        note: note.trim() || null,
        created_by: userId,
      })
      .select("id")
      .single();

    if (blendErr || !blendLog) {
      setSaving(false);
      return showToast("저장 실패: " + blendErr?.message, "error");
    }

    const logItems = previewItems.map((i) => ({
      blend_log_id: blendLog.id,
      material_name: i.material_name,
      quantity_g: i.actual_g,
    }));
    const { error: itemErr } = await supabase.from("blend_log_items").insert(logItems);
    if (itemErr) { setSaving(false); return showToast("차감 내역 저장 실패: " + itemErr.message, "error"); }

    const { data: matsData } = await supabase
      .from("materials").select("id,name")
      .in("name", previewItems.map((i) => i.material_name));
    const matMap: Record<string, string> = {};
    (matsData ?? []).forEach((m: any) => { matMap[m.name] = m.id; });

    const usageLogs = previewItems
      .filter((i) => matMap[i.material_name])
      .map((i) => ({
        material_id: matMap[i.material_name],
        used_date: logDate,
        quantity: i.actual_g,
        unit: "g",
        work_type: "blend",
        note: `${recipe.name} ${mult}배합`,
        created_by: userId,
      }));

    if (usageLogs.length > 0) {
      const { error: usageErr } = await supabase.from("material_usage_logs").insert(usageLogs);
      if (usageErr) { setSaving(false); return showToast("재고 차감 실패: " + usageErr.message, "error"); }
    }

    setSaving(false);
    showToast(`✅ ${recipe.name} ${mult}배합 저장! 원료 ${usageLogs.length}종 차감됨`);
    setSelectedRecipeId(""); setRecipeItems([]); setMultiplier("1"); setNote(""); setShowForm(false);
    loadLogs();
  }

  async function loadLogs() {
    setLoadingLogs(true);
    const { data } = await supabase
      .from("blend_logs")
      .select(`id,happened_at,log_date,employee_name,recipe_name,multiplier,note,
        items:blend_log_items(material_name,quantity_g)`)
      .eq("log_date", logDate)
      .order("happened_at", { ascending: false });
    setLogs((data ?? []) as any);
    setLoadingLogs(false);
  }

  async function handleDelete(logId: string) {
    if (!confirm("삭제하면 재고 차감도 취소됩니다. 삭제하시겠습니까?")) return;
    const { data: items } = await supabase
      .from("blend_log_items").select("material_name,quantity_g").eq("blend_log_id", logId);
    const log = logs.find((l) => l.id === logId);
    if (log && items && items.length > 0) {
      const { data: matsData } = await supabase.from("materials").select("id,name")
        .in("name", items.map((i: any) => i.material_name));
      const matMap: Record<string, string> = {};
      (matsData ?? []).forEach((m: any) => { matMap[m.name] = m.id; });
      const matIds = items.map((i: any) => matMap[i.material_name]).filter(Boolean);
      if (matIds.length > 0) {
        await supabase.from("material_usage_logs").delete()
          .eq("used_date", log.log_date)
          .eq("work_type", "blend")
          .eq("note", `${log.recipe_name} ${log.multiplier}배합`)
          .in("material_id", matIds);
      }
    }
    const { error } = await supabase.from("blend_logs").delete().eq("id", logId);
    if (error) return showToast("삭제 실패: " + error.message, "error");
    showToast("🗑️ 삭제 완료");
    loadLogs();
  }

  return (
    <div className="space-y-4">
      <div className={`${card} p-4`}>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="font-semibold text-sm text-slate-700">🧪 배합 기록</div>
          <div>
            <input type="date" className={inp} style={{ width: 160 }} value={logDate}
              onChange={(e) => setLogDate(e.target.value)} />
          </div>
          <button className={btn} onClick={loadLogs}>🔄 조회</button>
          <button
            className={showForm ? btnOn : "rounded-xl border border-blue-300 bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-700 hover:bg-blue-100"}
            onClick={() => setShowForm((v) => !v)}>
            {showForm ? "✕ 닫기" : "✚ 배합 기록 추가"}
          </button>
        </div>
      </div>

      {showForm && (
        <div className={`${card} p-4 space-y-4`}>
          <div className="font-semibold text-sm text-blue-700">✚ 배합 기록 추가</div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
              <button key={key}
                className={`rounded-xl px-3 py-1.5 text-sm font-semibold border transition-all
                  ${activeCategory === key ? "border-blue-500 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
                onClick={() => { setActiveCategory(key); setSelectedRecipeId(""); setRecipeItems([]); }}>
                {label}
              </button>
            ))}
          </div>

          <div>
            <div className="mb-1 text-xs text-slate-500">레시피 선택 *</div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
              {filteredRecipes.map((r) => (
                <button key={r.id}
                  className={`rounded-xl border-2 px-3 py-2.5 text-sm font-medium text-left transition-all
                    ${selectedRecipeId === r.id ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}
                  onClick={() => handleRecipeSelect(r.id)}>
                  {r.name}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <div>
              <div className="mb-1 text-xs text-slate-500">배합 횟수 *{activeCategory === "spray" && <span className="ml-1 text-slate-400">(1~5번)</span>}</div>
              {activeCategory === "spray" ? (
                <div className="flex gap-1.5">
                  {[1,2,3,4,5].map((n) => (
                    <button key={n}
                      className={`flex-1 rounded-xl border-2 py-2 text-sm font-bold transition-all
                        ${mult === n ? "border-blue-500 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}
                      onClick={() => setMultiplier(String(n))}>
                      {n}
                    </button>
                  ))}
                </div>
              ) : (
                <input className={inpR} inputMode="decimal" value={multiplier}
                  onChange={(e) => setMultiplier(e.target.value)} placeholder="1" />
              )}
            </div>
            <div>
              <div className="mb-1 text-xs text-slate-500">작업자 *</div>
              <select className={inp} value={employeeName} onChange={(e) => setEmployeeName(e.target.value)}>
                <option value="">— 선택 —</option>
                {employees.map((e) => <option key={e.id} value={e.name}>{e.name}</option>)}
              </select>
            </div>
            <div>
              <div className="mb-1 text-xs text-slate-500">비고</div>
              <input className={inp} value={note} onChange={(e) => setNote(e.target.value)} placeholder="선택 입력" />
            </div>
          </div>

          {previewItems.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="mb-2 text-xs font-semibold text-slate-500">📋 차감 원료 미리보기 ({mult}배합)</div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
                {previewItems.map((i, idx) => (
                  <div key={idx} className="flex justify-between text-xs py-0.5 border-b border-slate-100">
                    <span className="text-slate-600">{i.material_name}</span>
                    <span className="tabular-nums font-semibold text-slate-800">{i.actual_g}g</span>
                  </div>
                ))}
              </div>
              <div className="mt-2 text-right text-xs font-bold text-slate-700">
                총 {previewItems.reduce((s, i) => s + i.actual_g, 0).toLocaleString()}g
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button
              className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60"
              disabled={saving || !selectedRecipeId || !employeeName}
              onClick={handleSave}>
              {saving ? "저장 중..." : "💾 배합 기록 저장 (재고 차감)"}
            </button>
            <button className={btn} onClick={() => { setShowForm(false); setSelectedRecipeId(""); setRecipeItems([]); setMultiplier("1"); setNote(""); }}>취소</button>
          </div>
        </div>
      )}

      <div className={`${card} p-4`}>
        <div className="mb-3 flex items-center justify-between">
          <div className="font-semibold text-sm">배합 기록 — {logDate}</div>
          <div className="text-xs text-slate-400">{logs.length}건</div>
        </div>
        {loadingLogs ? (
          <div className="py-6 text-center text-sm text-slate-400">불러오는 중...</div>
        ) : logs.length === 0 ? (
          <div className="py-6 text-center text-sm text-slate-400">해당 날짜 배합 기록이 없습니다.</div>
        ) : (
          <div className="space-y-3">
            {logs.map((log) => (
              <div key={log.id} className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <span className="font-semibold text-sm">{log.recipe_name}</span>
                    <span className="ml-2 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700">{log.multiplier}배합</span>
                    <span className="ml-1.5 text-xs text-slate-500">{log.employee_name}</span>
                  </div>
                  <button
                    className="rounded-lg border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-500 hover:bg-red-100"
                    onClick={() => handleDelete(log.id)}>삭제</button>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 sm:grid-cols-3 md:grid-cols-4">
                  {(log.items ?? []).map((item, idx) => (
                    <div key={idx} className="flex justify-between text-xs py-0.5 border-b border-slate-100">
                      <span className="text-slate-500">{item.material_name}</span>
                      <span className="tabular-nums font-medium">{item.quantity_g}g</span>
                    </div>
                  ))}
                </div>
                {log.note && <div className="mt-1.5 text-xs text-slate-400">비고: {log.note}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}