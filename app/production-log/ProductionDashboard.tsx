"use client";

import React, { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { todayKST } from "@/lib/utils/date";

const supabase = createClient();

type UserRole = "ADMIN" | "SUBADMIN" | "USER" | null;

// ── 카드 상태 ──
type Status = "ok" | "warn" | "error" | "loading";

type DashCard = {
  key: string;
  label: string;
  icon: string;
  status: Status;
  message: string;
  detail?: string[];
  tab?: string; // 클릭 시 이동할 탭 key
};

// ── 상태별 스타일 ──
const STATUS_STYLE: Record<Status, { border: string; bg: string; badge: string; dot: string }> = {
  ok:      { border: "border-green-200",  bg: "bg-green-50",   badge: "bg-green-100 text-green-700 border-green-200",   dot: "bg-green-400" },
  warn:    { border: "border-amber-200",  bg: "bg-amber-50",   badge: "bg-amber-100 text-amber-700 border-amber-200",   dot: "bg-amber-400" },
  error:   { border: "border-red-200",    bg: "bg-red-50",     badge: "bg-red-100 text-red-700 border-red-300",         dot: "bg-red-500" },
  loading: { border: "border-slate-200",  bg: "bg-slate-50",   badge: "bg-slate-100 text-slate-400 border-slate-200",   dot: "bg-slate-300" },
};

const STATUS_LABEL: Record<Status, string> = {
  ok:      "정상",
  warn:    "주의",
  error:   "확인필요",
  loading: "조회중",
};

export function ProductionDashboard({
  role,
  userId,
  onTabChange,
}: {
  role: UserRole;
  userId: string | null;
  onTabChange: (tab: string) => void;
}) {
  const [cards, setCards] = useState<DashCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string>("");

  const today = todayKST();

  // ── 방충방서 기준일 계산 (금요일, 휴일이면 목요일) ──
  // 단순화: 이번 주 금요일. 오늘이 금요일이면 오늘, 아니면 가장 최근 금요일
  function getPestCheckDate(): string {
    // 오늘 기준 가장 최근 금요일을 역산 (오늘이 금요일이면 오늘)
    const d = new Date(today + "T00:00:00+09:00");
    while (d.getDay() !== 5) {
      d.setDate(d.getDate() - 1);
    }
    return d.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
  }

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    const newCards: DashCard[] = [];

    // ── 1. 근무일지: 출근 누락 / 일지 미작성 / 퇴근 누락 ──
    try {
        const [{ data: attInData }, { data: attOutData }, { data: logData }, { data: empData }, { data: leaveData }] = await Promise.all([
          // 오늘 출근(IN) 기록
          supabase.from("attendance")
            .select("employee_id, employees(name)")
            .eq("type", "IN")
            .gte("happened_at", `${today}T00:00:00+09:00`)
            .lte("happened_at", `${today}T23:59:59+09:00`),
          // 오늘 퇴근(OUT) 기록
          supabase.from("attendance")
            .select("employee_id")
            .eq("type", "OUT")
            .gte("happened_at", `${today}T00:00:00+09:00`)
            .lte("happened_at", `${today}T23:59:59+09:00`),
          // 오늘 일지 작성 여부
          supabase.from("daily_work_logs")
            .select("employee_id")
            .eq("log_date", today),
                    // 재직 중인 전체 직원 (출근 체크 제외 대상 포함)
                    supabase.from("employees")
                    .select("id, name, auth_user_id, skip_attendance_check")
                    .is("resign_date", null),
        
          // 오늘 휴가 (HALF_PM 제외 — 나머지는 출근 체크 제외)
          supabase.from("leave_requests")
            .select("employee_id, user_id, leave_type")
            .eq("leave_date", today)
            .in("leave_type", ["ANNUAL", "HALF_AM", "SICK", "FRIDAY_OFF", "SPECIAL", "REMOTE"]),
        ]);
  
        const allEmployees = (empData ?? []) as { id: string; name: string; auth_user_id?: string; skip_attendance_check?: boolean }[];
        const clockedInIds = new Set((attInData ?? []).map((a: any) => a.employee_id));
        const clockedOutIds = new Set((attOutData ?? []).map((a: any) => a.employee_id));
        const writtenIds = new Set((logData ?? []).map((l: any) => l.employee_id));
        // user_id → employee_id 매핑 (leave_requests에 employee_id가 null인 경우 대비)
        const userToEmpMap: Record<string, string> = {};
        allEmployees.forEach((e) => { if (e.auth_user_id) userToEmpMap[e.auth_user_id] = e.id; });
        // 출근 체크 제외 직원 (HALF_PM 제외한 모든 휴가)
        const excusedIds = new Set(
          (leaveData ?? [])
            .map((l: any) => l.employee_id ?? userToEmpMap[l.user_id])
            .filter(Boolean)
        );
  
      // 출근 체크 대상 = 전체 직원 - 휴가자 - skip_attendance_check 직원
      const checkTargets = allEmployees.filter((e) => !excusedIds.has(e.id) && !e.skip_attendance_check);
  
        // 출근 기록 없는 직원
        const noIn = checkTargets.filter((e) => !clockedInIds.has(e.id));
        // 출근했는데 일지 미작성
        const noLog = checkTargets.filter((e) => clockedInIds.has(e.id) && !writtenIds.has(e.id));
        // 출근했는데 퇴근 미기록 (HALF_PM 포함 — 오전 출근해야 함)
        const noOut = checkTargets.filter((e) => clockedInIds.has(e.id) && !clockedOutIds.has(e.id));
  
        const details: string[] = [];
        if (noIn.length > 0) details.push(`출근 미기록: ${noIn.map((e) => e.name).join(", ")}`);
        if (noLog.length > 0) details.push(`일지 미작성: ${noLog.map((e) => e.name).join(", ")}`);
        if (noOut.length > 0) details.push(`퇴근 미기록: ${noOut.map((e) => e.name).join(", ")}`);
  
        const hasIssue = noIn.length > 0 || noLog.length > 0 || noOut.length > 0;
        const msgParts: string[] = [];
        if (noIn.length > 0) msgParts.push(`출근누락 ${noIn.length}명`);
        if (noLog.length > 0) msgParts.push(`미작성 ${noLog.length}명`);
        if (noOut.length > 0) msgParts.push(`퇴근누락 ${noOut.length}명`);
  
        // 오늘 휴가자 표시 (REMOTE 제외)
        const { data: todayLeaveData } = await supabase.from("leave_requests")
          .select("employee_name, leave_type")
          .eq("leave_date", today)
          .not("leave_type", "eq", "REMOTE");
        const leaveLabels: Record<string, string> = {
          ANNUAL: "연차", HALF_AM: "오전반차", HALF_PM: "오후반차",
          SICK: "병가", FRIDAY_OFF: "금요휴무", SPECIAL: "특별휴가",
        };
        const leaveNames = (todayLeaveData ?? []).map((l: any) =>
          `${l.employee_name}(${leaveLabels[l.leave_type] ?? l.leave_type})`
        );
  
        newCards.push({
          key: "work",
          label: "근무일지",
          icon: "👷",
          tab: "work",
          status: hasIssue ? "error" : "ok",
          message: hasIssue ? msgParts.join(" · ") : `${checkTargets.length - noIn.length}명 출근`,
          detail: [
            ...details,
            ...(leaveNames.length > 0 ? [`휴가: ${leaveNames.join(", ")}`] : []),
          ],
        });
      } catch {
        newCards.push({ key: "work", label: "근무일지", icon: "👷", tab: "work", status: "warn", message: "조회 오류" });
      }
    // ── 2. CCP-1P: 생산완료 중 금속검출 미기록 ──
    try {
      const [{ data: woData }, { data: ccpData }] = await Promise.all([
        supabase.from("work_orders")
          .select("id, client_name, product_name")
          .eq("status_production", true)
          .in("status", ["생산중", "완료"])
          .gte("updated_at", `${today}T00:00:00+09:00`)
          .lte("updated_at", `${today}T23:59:59+09:00`)
          .not("food_type", "ilike", "%중간재%")
          .eq("skip_production_check", false),
        supabase.from("ccp_metal_logs")
          .select("work_order_id")
          .eq("log_date", today),
      ]);
      const recordedIds = new Set((ccpData ?? []).map((c: any) => c.work_order_id));
      const missing = (woData ?? []).filter((w: any) => !recordedIds.has(w.id));
      newCards.push({
        key: "ccp1p",
        label: "CCP-1P 금속검출",
        icon: "🔍",
        tab: "ccp1p",
        status: missing.length > 0 ? "error" : "ok",
        message: missing.length > 0 ? `${missing.length}건 미기록` : (woData ?? []).length === 0 ? `해당 작업 없음` : `전체 기록 완료`,
        detail: missing.map((w: any) => `${w.client_name} — ${w.product_name}`),
      });
    } catch {
      newCards.push({ key: "ccp1p", label: "CCP-1P 금속검출", icon: "🔍", tab: "ccp1p", status: "warn", message: "조회 오류" });
    }

    // ── 3. 압축공기: 오늘 blend_logs(spray/coating)가 있는데 compressor_logs 없음 ──
    try {
      const [{ data: blendData }, { data: compData }] = await Promise.all([
        supabase.from("blend_logs")
          .select("id, recipe_name")
          .eq("log_date", today)
          .in("recipe_id",
            (await supabase.from("blend_recipes").select("id").in("category", ["spray", "coating"])).data?.map((r: any) => r.id) ?? []
          ),
        supabase.from("compressor_logs")
          .select("id")
          .eq("log_date", today),
      ]);
      const hasBlend = (blendData ?? []).length > 0;
      const hasComp = (compData ?? []).length > 0;
      newCards.push({
        key: "compressor",
        label: "압축공기",
        icon: "💨",
        tab: "compressor",
        status: hasBlend && !hasComp ? "error" : !hasBlend ? "ok" : "ok",
        message: hasBlend && !hasComp
          ? "분사/코팅 작업 있으나 기록 누락"
          : hasBlend && hasComp ? "기록 완료"
          : "오늘 분사/코팅 작업 없음",
        detail: hasBlend && !hasComp
          ? (blendData ?? []).map((b: any) => b.recipe_name)
          : [],
      });
    } catch {
      newCards.push({ key: "compressor", label: "압축공기", icon: "💨", tab: "compressor", status: "warn", message: "조회 오류" });
    }

    // ── 4. 온장고세척 ──
    try {
      const { data } = await supabase.from("warmer_cleaning_logs")
        .select("id").eq("log_date", today);
      newCards.push({
        key: "warmer_clean",
        label: "온장고세척",
        icon: "🧹",
        tab: "warmer_clean",
        status: (data ?? []).length === 0 ? "error" : "ok",
        message: (data ?? []).length === 0 ? "오늘 기록 없음" : "기록 완료",
      });
    } catch {
      newCards.push({ key: "warmer_clean", label: "온장고세척", icon: "🧹", tab: "warmer_clean", status: "warn", message: "조회 오류" });
    }

    // ── 5. 방충방서: 이번 주(월~금) 기록 확인 ──
    try {
        // 이번 주 월요일 계산
        const todayD = new Date(today + "T00:00:00+09:00");
        const todayDow = todayD.getDay(); // 0=일, 1=월 ... 6=토
        // 월요일 기준 이번 주 시작 (일요일이면 전 주 월요일)
        const daysFromMon = todayDow === 0 ? 6 : todayDow - 1;
        const thisMonday = new Date(todayD);
        thisMonday.setDate(todayD.getDate() - daysFromMon);
        const thisMondayStr = thisMonday.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
  
        // 이번 주 금요일
        const thisFriday = new Date(thisMonday);
        thisFriday.setDate(thisMonday.getDate() + 4);
        const thisFridayStr = thisFriday.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
  
        const [{ data: flyData }, { data: walkData }] = await Promise.all([
          supabase.from("pest_flying_records")
            .select("id")
            .gte("happened_at", `${thisMondayStr}T00:00:00+09:00`)
            .lte("happened_at", `${thisFridayStr}T23:59:59+09:00`),
          supabase.from("pest_walking_records")
            .select("id")
            .gte("happened_at", `${thisMondayStr}T00:00:00+09:00`)
            .lte("happened_at", `${thisFridayStr}T23:59:59+09:00`),
        ]);
        const hasRecord = (flyData ?? []).length > 0 || (walkData ?? []).length > 0;
        const isCheckDay = todayDow === 5 || todayDow === 4; // 금 또는 목(대체)
        newCards.push({
          key: "pest",
          label: "방충방서",
          icon: "🪲",
          tab: "pest",
          status: hasRecord ? "ok" : isCheckDay ? "error" : "warn",
          message: hasRecord
            ? `이번 주 기록 완료`
            : isCheckDay ? "오늘 기록 필요"
            : `이번 주 미기록 (기준일: ${thisFridayStr})`,
        });
      } catch {
        newCards.push({ key: "pest", label: "방충방서", icon: "🪲", tab: "pest", status: "warn", message: "조회 오류" });
      }

    // ── 6. 이물관리 ──
    try {
      const { data } = await supabase.from("foreign_matter_logs")
        .select("id").eq("log_date", today);
      newCards.push({
        key: "foreign",
        label: "이물관리",
        icon: "🔎",
        tab: "foreign",
        status: (data ?? []).length === 0 ? "error" : "ok",
        message: (data ?? []).length === 0 ? "오늘 기록 없음" : "기록 완료",
      });
    } catch {
      newCards.push({ key: "foreign", label: "이물관리", icon: "🔎", tab: "foreign", status: "warn", message: "조회 오류" });
    }

    // ── 7. 위생관리 ──
    try {
      const { data } = await supabase.from("hygiene_check_logs")
        .select("id").eq("log_date", today);
      newCards.push({
        key: "hygiene",
        label: "위생관리",
        icon: "🧼",
        tab: "hygiene",
        status: (data ?? []).length === 0 ? "error" : "ok",
        message: (data ?? []).length === 0 ? "오늘 기록 없음" : "기록 완료",
      });
    } catch {
      newCards.push({ key: "hygiene", label: "위생관리", icon: "🧼", tab: "hygiene", status: "warn", message: "조회 오류" });
    }

    // ── 8. 온습도: 하루 2회 ──
    try {
      const { data } = await supabase.from("temp_humidity_logs")
        .select("id, check_time").eq("log_date", today);
      const count = (data ?? []).length;
      newCards.push({
        key: "temp_humidity",
        label: "온습도",
        icon: "🌡️",
        tab: "temp_humidity",
        status: count === 0 ? "error" : count < 2 ? "warn" : "ok",
        message: count === 0 ? "오늘 기록 없음" : count < 2 ? `${count}회 기록 (2회 필요)` : "2회 기록 완료",
        detail: count > 0 && count < 2
          ? [(data ?? []).map((d: any) => d.check_time).join(", ") + " 기록됨"]
          : [],
      });
    } catch {
      newCards.push({ key: "temp_humidity", label: "온습도", icon: "🌡️", tab: "temp_humidity", status: "warn", message: "조회 오류" });
    }

    // ── 9. 냉장·냉동·온장고: 하루 2회 ──
    try {
      const { data } = await supabase.from("storage_temp_logs")
        .select("id, check_time").eq("log_date", today);
      const count = (data ?? []).length;
      newCards.push({
        key: "storage_temp",
        label: "냉장·냉동·온장고",
        icon: "❄️",
        tab: "storage_temp",
        status: count === 0 ? "error" : count < 2 ? "warn" : "ok",
        message: count === 0 ? "오늘 기록 없음" : count < 2 ? `${count}회 기록 (2회 필요)` : "2회 기록 완료",
        detail: count > 0 && count < 2
          ? [(data ?? []).map((d: any) => d.check_time).join(", ") + " 기록됨"]
          : [],
      });
    } catch {
      newCards.push({ key: "storage_temp", label: "냉장·냉동·온장고", icon: "❄️", tab: "storage_temp", status: "warn", message: "조회 오류" });
    }

    // ── 10. 소비기한 임박 (30일 이내) ──
    try {
      const thirtyDaysLater = new Date(today + "T00:00:00+09:00");
      thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);
      const limitStr = thirtyDaysLater.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

      const { data } = await supabase.from("material_receipts")
        .select("material_id, expiry_date, material:materials(name, is_active)")
        .not("expiry_date", "is", null)
        .lte("expiry_date", limitStr)
        .gte("expiry_date", today)
        .order("expiry_date");

      // 만료된 항목
      const { data: expiredData } = await supabase.from("material_receipts")
        .select("material_id, expiry_date, material:materials(name, is_active)")
        .not("expiry_date", "is", null)
        .lt("expiry_date", today);

      // is_active=true인 원료만 필터, 중복 제거
      const activeIminent = (data ?? []).filter((r: any) => r.material?.is_active === true);
      const activeExpired = (expiredData ?? []).filter((r: any) => r.material?.is_active === true);

      // 원료별로 가장 가까운 expiry_date만 표시
      const iminentMap = new Map<string, { name: string; expiry: string }>();
      activeIminent.forEach((r: any) => {
        const name = r.material?.name ?? r.material_id;
        if (!iminentMap.has(name)) iminentMap.set(name, { name, expiry: r.expiry_date });
      });
      const expiredMap = new Map<string, { name: string; expiry: string }>();
      activeExpired.forEach((r: any) => {
        const name = r.material?.name ?? r.material_id;
        if (!expiredMap.has(name)) expiredMap.set(name, { name, expiry: r.expiry_date });
      });

      const iminentList = Array.from(iminentMap.values());
      const expiredList = Array.from(expiredMap.values());

      newCards.push({
        key: "expiry",
        label: "소비기한",
        icon: "⏰",
        tab: "expiry",
        status: expiredList.length > 0 ? "error" : iminentList.length > 0 ? "warn" : "ok",
        message: expiredList.length > 0
          ? `만료 ${expiredList.length}종 · 임박 ${iminentList.length}종`
          : iminentList.length > 0 ? `30일 이내 임박 ${iminentList.length}종`
          : "임박 원료 없음",
        detail: [
          ...expiredList.map((r) => `🔴 만료 ${r.expiry} — ${r.name}`),
          ...iminentList.map((r) => {
            const daysLeft = Math.ceil(
              (new Date(r.expiry + "T00:00:00+09:00").getTime() - new Date(today + "T00:00:00+09:00").getTime())
              / (1000 * 60 * 60 * 24)
            );
            return `🟡 D-${daysLeft} (${r.expiry}) — ${r.name}`;
          }),
        ],
      });
    } catch {
      newCards.push({ key: "expiry", label: "소비기한", icon: "⏰", tab: "expiry", status: "warn", message: "조회 오류" });
    }

    setCards(newCards);
    setLastUpdated(new Date().toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit" }));
    setLoading(false);
  }, [today]);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  // ── 요약 카운트 ──
  const errorCount = cards.filter((c) => c.status === "error").length;
  const warnCount = cards.filter((c) => c.status === "warn").length;

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <div className="font-bold text-base text-slate-800">📊 오늘의 현황</div>
            <div className="text-xs text-slate-400 mt-0.5">{today} · 마지막 업데이트 {lastUpdated}</div>
          </div>
          <div className="flex items-center gap-2">
            {errorCount > 0 && (
              <span className="rounded-full border border-red-300 bg-red-100 px-3 py-1 text-xs font-bold text-red-700">
                🔴 확인필요 {errorCount}건
              </span>
            )}
            {warnCount > 0 && (
              <span className="rounded-full border border-amber-300 bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700">
                🟡 주의 {warnCount}건
              </span>
            )}
            {errorCount === 0 && warnCount === 0 && !loading && (
              <span className="rounded-full border border-green-300 bg-green-100 px-3 py-1 text-xs font-bold text-green-700">
                🟢 전체 정상
              </span>
            )}
            <button
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium hover:bg-slate-50"
              onClick={loadDashboard}
              disabled={loading}
            >
              {loading ? "조회중..." : "🔄 새로고침"}
            </button>
          </div>
        </div>
      </div>

      {/* 카드 그리드 */}
      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 animate-pulse h-24" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {cards.map((card) => {
            const s = STATUS_STYLE[card.status];
            return (
              <button
                key={card.key}
                className={`rounded-2xl border ${s.border} ${s.bg} p-4 text-left transition-all hover:shadow-md hover:-translate-y-0.5 active:scale-95`}
                onClick={() => card.tab && onTabChange(card.tab)}
              >
                <div className="flex items-start justify-between gap-1 mb-2">
                  <span className="text-lg">{card.icon}</span>
                  <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-bold ${s.badge}`}>
                    {STATUS_LABEL[card.status]}
                  </span>
                </div>
                <div className="text-xs font-semibold text-slate-600 mb-1">{card.label}</div>
                <div className={`text-sm font-bold ${
                  card.status === "error" ? "text-red-700"
                  : card.status === "warn" ? "text-amber-700"
                  : "text-green-700"
                }`}>
                  {card.message}
                </div>
                {(card.detail ?? []).length > 0 && (
                  <div className="mt-2 space-y-0.5">
                    {card.detail!.slice(0, 3).map((d, i) => (
                      <div key={i} className="text-[10px] text-slate-500 truncate">{d}</div>
                    ))}
                    {card.detail!.length > 3 && (
                      <div className="text-[10px] text-slate-400">+{card.detail!.length - 3}건 더보기</div>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
