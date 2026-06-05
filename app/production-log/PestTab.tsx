"use client";

import React, { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

const supabase = createClient();

type UserRole = "ADMIN" | "SUBADMIN" | "USER" | null;

type FlyingRecord = {
  id?: string;
  record_date: string;
  location: string;
  fly: number;
  mosquito: number;
  midges: number;
  fruit_fly: number;
  moth: number;
  housefly: number;
  other: number;
  total: number;
  step: number;
  action_note: string;
  lure_left: string;
  damage_left: string;
  rat_left: string;
  lure_right: string;
  damage_right: string;
  rat_right: string;
  rat_action_note: string;
  inspector_id: string | null;
  inspector_name: string | null;
};

type WalkingRecord = {
  id?: string;
  record_date: string;
  trap_no: string;
  grima: number;
  spider: number;
  centipede: number;
  mosquito: number;
  earwig: number;
  other: number;
  total: number;
  inspector_id: string | null;
  inspector_name: string | null;
};

type Employee = { id: string; name: string; pin: string | null; auth_user_id: string | null };

const LOCATIONS = [
  "P1-입구",
  "P2-위생전실",
  "P3-생산실",
  "P4-입출고실",
  "P5-원부재료실",
];

const TRAP_LABELS: Record<string, string> = {
  "NO-01": "NO-01 (원부재료실 우측)",
  "NO-02": "NO-02 (외포장실 좌측)",
  "NO-03": "NO-03 (외포장실 우측)",
  "NO-04": "NO-04 (원부재료실 좌측)",
  "NO-05": "NO-05 (위생전실입구 좌측)",
  "NO-06": "NO-06 (위생전실입구 우측)",
  "NO-07": "NO-07 (생산실입구 좌측)",
  "NO-08": "NO-08 (생산실입구 우측)",
};
const TRAPS = Object.keys(TRAP_LABELS);

const ZONE_MAP: Record<string, "entrance" | "sanitary" | "production"> = {
  "P1-입구":       "entrance",
  "P2-위생전실":   "sanitary",
  "P3-생산실":     "production",
  "P4-입출고실":   "entrance",
  "P5-원부재료실": "sanitary",
};

const THRESHOLDS = {
  summer: { entrance: [19, 30], sanitary: [9, 15], production: [9, 15] },
  winter: { entrance: [14, 25], sanitary: [9, 15], production: [9, 15] },
};

const CRITERIA_LABELS = {
  summer: {
    entrance:   ["20 미만", "20~30", "30 초과"],
    sanitary:   ["10 미만", "10~15", "15 초과"],
    production: ["10 미만", "10~15", "15 초과"],
  },
  winter: {
    entrance:   ["15 미만", "15~25", "25 초과"],
    sanitary:   ["10 미만", "10~15", "15 초과"],
    production: ["10 미만", "10~15", "15 초과"],
  },
};

function getSeason(dateStr: string): "summer" | "winter" {
  const m = new Date(dateStr + "T00:00:00+09:00").getMonth() + 1;
  return m >= 5 && m <= 10 ? "summer" : "winter";
}

function getStep(total: number, location: string, season: "summer" | "winter"): number {
  const zone = ZONE_MAP[location];
  if (!zone) return 1;
  const [t1, t2] = THRESHOLDS[season][zone];
  if (total <= t1) return 1;
  if (total <= t2) return 2;
  return 3;
}

const card = "rounded-2xl border border-slate-200 bg-white shadow-sm";
const inp  = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:outline-none";
const btn  = "rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50 active:bg-slate-100";
const btnOn= "rounded-xl border border-blue-500 bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700";

function StepBadge({ step }: { step: number }) {
  const cfg = [
    null,
    { bg: "bg-green-50", border: "border-green-300", text: "text-green-700",  label: "1단계" },
    { bg: "bg-amber-50", border: "border-amber-300", text: "text-amber-700",  label: "2단계" },
    { bg: "bg-red-50",   border: "border-red-300",   text: "text-red-700",    label: "3단계" },
  ];
  const c = cfg[step] ?? cfg[1]!;
  return (
    <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold ${c.bg} ${c.border} ${c.text}`}>
      {c.label}
    </span>
  );
}

function totalCellClass(step: number): string {
  if (step === 3) return "bg-red-50 text-red-700 font-bold";
  if (step === 2) return "bg-amber-50 text-amber-700 font-bold";
  return "bg-blue-50 text-blue-700 font-semibold";
}



export function PestTab({ role, userId, showToast }: {
  role: UserRole;
  userId: string | null;
  showToast: (msg: string, type?: "success" | "error") => void;
}) {
  const [viewYear,    setViewYear]    = useState(new Date().getFullYear());
  const [viewMonth,   setViewMonth]   = useState(new Date().getMonth() + 1);
  const [viewFlying,  setViewFlying]  = useState<FlyingRecord[]>([]);
  const [viewWalking, setViewWalking] = useState<WalkingRecord[]>([]);
  const [viewLoading, setViewLoading] = useState(false);

  async function loadView() {
    setViewLoading(true);
    const [{ data: fRows }, { data: wRows }] = await Promise.all([
      supabase.from("pest_flying_records").select("*")
        .eq("year", viewYear).eq("month", viewMonth).order("record_date").order("location"),
      supabase.from("pest_walking_records").select("*")
        .eq("year", viewYear).eq("month", viewMonth).order("record_date").order("trap_no"),
    ]);
    setViewFlying((fRows ?? []) as FlyingRecord[]);
    setViewWalking((wRows ?? []) as WalkingRecord[]);
    setViewLoading(false);
  }

  useEffect(() => { loadView(); }, [viewYear, viewMonth]);

  const viewDates = [...new Set(viewFlying.map(r => r.record_date))].sort();
  const flyingByDate: Record<string, Record<string, FlyingRecord>> = {};
  for (const r of viewFlying) {
    if (!flyingByDate[r.record_date]) flyingByDate[r.record_date] = {};
    flyingByDate[r.record_date][r.location] = r;
  }
  const walkingByDate: Record<string, Record<string, WalkingRecord>> = {};
  for (const r of viewWalking) {
    if (!walkingByDate[r.record_date]) walkingByDate[r.record_date] = {};
    walkingByDate[r.record_date][r.trap_no] = r;
  }
  const flyingCumul: Record<string, Record<string, number>> = {};
  for (const date of viewDates) {
    flyingCumul[date] = {};
    for (const loc of LOCATIONS)
      flyingCumul[date][loc] = viewDates.filter(d => d <= date)
        .reduce((s, d) => s + (flyingByDate[d]?.[loc]?.total ?? 0), 0);
  }
  const walkingCumul: Record<string, Record<string, number>> = {};
  for (const date of viewDates) {
    walkingCumul[date] = {};
    for (const trap of TRAPS)
      walkingCumul[date][trap] = viewDates.filter(d => d <= date)
        .reduce((s, d) => s + (walkingByDate[d]?.[trap]?.total ?? 0), 0);
  }
  const flyingMonthTotal = LOCATIONS.reduce((acc, loc) => {
    acc[loc] = viewFlying.filter(r => r.location === loc).reduce((s, r) => s + r.total, 0);
    return acc;
  }, {} as Record<string, number>);
  const walkingMonthTotal = TRAPS.reduce((acc, trap) => {
    acc[trap] = viewWalking.filter(r => r.trap_no === trap).reduce((s, r) => s + r.total, 0);
    return acc;
  }, {} as Record<string, number>);

  const viewSeason = getSeason(`${viewYear}-${String(viewMonth).padStart(2,"0")}-01`);
  const criteriaLabels = CRITERIA_LABELS[viewSeason];

  function fmtDate(d: string) {
    const dt = new Date(d + "T00:00:00+09:00");
    return `${dt.getMonth()+1}/${dt.getDate()}`;
  }

  function printPest(type: "flying" | "walking") {
    const id = type === "flying" ? "pest-flying-print-inner" : "pest-walking-print-inner";
    const content = document.getElementById(id);
    if (!content) return;
    const title = type === "flying"
      ? `방충방서_비래해충_${viewYear}년_${viewMonth}월`
      : `방충방서_보행해충_${viewYear}년_${viewMonth}월`;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head>
      <meta charset="utf-8"><title>${title}</title>
      <style>
        @page { size: A4 landscape; margin: 8mm 10mm; }
        body { margin:0; font-family:'Malgun Gothic','맑은 고딕',sans-serif; font-size:9pt; color:#000; }
        * { box-sizing:border-box; -webkit-print-color-adjust:exact!important; print-color-adjust:exact!important; }
        table { border-collapse:collapse; width:100%; }
        th,td { border:1px solid #999; padding:3px 4px; font-size:8pt; }
        .page-break { page-break-after:always; }
      </style>
    </head><body>${content.innerHTML}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 400);
  }

  return (
    <div className="space-y-4">
      {/* ══ 월별 조회 ══ */}
          <div className={`${card} p-4`}>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <div className="mb-1 text-xs text-slate-500">연도</div>
                <select className={inp} style={{ width: 100 }} value={viewYear} onChange={e => setViewYear(Number(e.target.value))}>
                  {[2024,2025,2026,2027].map(y => <option key={y}>{y}</option>)}
                </select>
              </div>
              <div>
                <div className="mb-1 text-xs text-slate-500">월</div>
                <select className={inp} style={{ width: 80 }} value={viewMonth} onChange={e => setViewMonth(Number(e.target.value))}>
                  {Array.from({length:12},(_,i)=>i+1).map(m => <option key={m} value={m}>{m}월</option>)}
                </select>
              </div>
              <button className={btn} onClick={loadView}>🔄 조회</button>
              <button className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
                onClick={() => printPest("flying")}>🖨️ 비래해충 인쇄</button>
              <button className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
                onClick={() => printPest("walking")}>🖨️ 보행해충 인쇄</button>
              <span className={`rounded-full border px-3 py-1 text-xs font-semibold
                ${viewSeason === "summer" ? "border-blue-300 bg-blue-50 text-blue-700" : "border-green-300 bg-green-50 text-green-700"}`}>
                {viewSeason === "summer" ? "하계 기준" : "동계 기준"}
              </span>
            </div>
          </div>

          {viewLoading ? (
            <div className="py-8 text-center text-sm text-slate-400">불러오는 중...</div>
          ) : viewDates.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-400">{viewYear}년 {viewMonth}월 기록이 없습니다.</div>
          ) : (
            <>
              {/* 비래해충 조회 */}
              <div className={card}>
                <div className="px-4 pt-4 pb-2 font-semibold text-sm border-b border-slate-100">
                  비래해충 — {viewYear}년 {viewMonth}월
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-xs" style={{ minWidth: 680 }}>
                    <thead>
                      <tr className="bg-slate-50">
                        <th className="border border-slate-200 py-2 px-2 text-slate-500 w-12">날짜</th>
                        <th className="border border-slate-200 py-2 px-2 text-slate-500 w-20">위치</th>
                        <th className="border border-slate-200 py-2 px-1">파리</th>
                        <th className="border border-slate-200 py-2 px-1">모기</th>
                        <th className="border border-slate-200 py-2 px-1">링다구</th>
                        <th className="border border-slate-200 py-2 px-1">초파리</th>
                        <th className="border border-slate-200 py-2 px-1">나방</th>
                        <th className="border border-slate-200 py-2 px-1">날파리</th>
                        <th className="border border-slate-200 py-2 px-1">기타</th>
                        <th className="border border-slate-200 py-2 px-2 bg-blue-50 text-blue-700 w-10">계</th>
                        <th className="border border-slate-200 py-2 px-2 bg-green-50 text-green-700 w-10">누계</th>
                        <th className="border border-slate-200 py-2 px-2 w-12">단계</th>
                        <th className="border border-slate-200 py-1 px-1 bg-amber-50 text-amber-700 text-[10px]" colSpan={3}>쥐먹이(좌)</th>
                        <th className="border border-slate-200 py-1 px-1 bg-orange-50 text-orange-700 text-[10px]" colSpan={3}>쥐먹이(우)</th>
                      </tr>
                      <tr className="bg-slate-50 text-[10px]">
                        <th className="border border-slate-200" colSpan={12}></th>
                        <th className="border border-slate-200 py-1 bg-amber-50 text-amber-600">이끼</th>
                        <th className="border border-slate-200 py-1 bg-amber-50 text-amber-600">훼손</th>
                        <th className="border border-slate-200 py-1 bg-amber-50 text-amber-600">쥐</th>
                        <th className="border border-slate-200 py-1 bg-orange-50 text-orange-600">이끼</th>
                        <th className="border border-slate-200 py-1 bg-orange-50 text-orange-600">훼손</th>
                        <th className="border border-slate-200 py-1 bg-orange-50 text-orange-600">쥐</th>
                      </tr>
                    </thead>
                    <tbody>
                      {viewDates.map(date => (
                        <React.Fragment key={date}>
                          {LOCATIONS.map((loc, li) => {
                            const r = flyingByDate[date]?.[loc];
                            const total = r?.total ?? 0;
                            const step  = r ? r.step : 1;
                            const cumul = flyingCumul[date]?.[loc] ?? 0;
                            const vp1 = flyingByDate[date]?.["P1-입구"];
                            return (
                              <React.Fragment key={loc}>
                                <tr>
                                  {li === 0 && (
                                    <td className="border border-slate-200 py-1.5 px-2 font-medium bg-slate-50 text-center text-[11px]"
                                      rowSpan={LOCATIONS.length}>
                                      {fmtDate(date)}
                                    </td>
                                  )}
                                  <td className="border border-slate-200 py-1 px-2 bg-slate-50 text-[11px] text-slate-600">{loc}</td>
                                  <td className="border border-slate-200 py-1 px-1 text-center">{r?.fly || ""}</td>
                                  <td className="border border-slate-200 py-1 px-1 text-center">{r?.mosquito || ""}</td>
                                  <td className="border border-slate-200 py-1 px-1 text-center">{r?.midges || ""}</td>
                                  <td className="border border-slate-200 py-1 px-1 text-center">{r?.fruit_fly || ""}</td>
                                  <td className="border border-slate-200 py-1 px-1 text-center">{r?.moth || ""}</td>
                                  <td className="border border-slate-200 py-1 px-1 text-center">{r?.housefly || ""}</td>
                                  <td className="border border-slate-200 py-1 px-1 text-center">{r?.other || ""}</td>
                                  <td className={`border border-slate-200 py-1 px-2 text-center font-semibold ${totalCellClass(step)}`}>
                                    {total > 0 ? total : ""}
                                  </td>
                                  <td className="border border-slate-200 py-1 px-2 text-center font-semibold bg-green-50 text-green-700">
                                    {cumul > 0 ? cumul : ""}
                                  </td>
                                  <td className="border border-slate-200 py-1 px-2 text-center"><StepBadge step={step} /></td>
                                  {li === 0 && (
                                    <>
                                      <td rowSpan={LOCATIONS.length} className="border border-slate-200 py-1 px-1 text-center bg-amber-50 text-[11px]">
                                        <span className={vp1?.lure_left === "O" ? "text-green-600 font-bold" : "text-slate-400"}>{vp1?.lure_left ?? "—"}</span>
                                      </td>
                                      <td rowSpan={LOCATIONS.length} className="border border-slate-200 py-1 px-1 text-center bg-amber-50 text-[11px]">
                                        <span className={vp1?.damage_left === "O" ? "text-red-600 font-bold" : "text-slate-400"}>{vp1?.damage_left ?? "—"}</span>
                                      </td>
                                      <td rowSpan={LOCATIONS.length} className="border border-slate-200 py-1 px-1 text-center bg-amber-50 text-[11px]">
                                        <span className={vp1?.rat_left === "O" ? "text-red-600 font-bold" : "text-slate-400"}>{vp1?.rat_left ?? "—"}</span>
                                      </td>
                                      <td rowSpan={LOCATIONS.length} className="border border-slate-200 py-1 px-1 text-center bg-orange-50 text-[11px]">
                                        <span className={vp1?.lure_right === "O" ? "text-green-600 font-bold" : "text-slate-400"}>{vp1?.lure_right ?? "—"}</span>
                                      </td>
                                      <td rowSpan={LOCATIONS.length} className="border border-slate-200 py-1 px-1 text-center bg-orange-50 text-[11px]">
                                        <span className={vp1?.damage_right === "O" ? "text-red-600 font-bold" : "text-slate-400"}>{vp1?.damage_right ?? "—"}</span>
                                      </td>
                                      <td rowSpan={LOCATIONS.length} className="border border-slate-200 py-1 px-1 text-center bg-orange-50 text-[11px]">
                                        <span className={vp1?.rat_right === "O" ? "text-red-600 font-bold" : "text-slate-400"}>{vp1?.rat_right ?? "—"}</span>
                                      </td>
                                    </>
                                  )}
                                </tr>
                                {r && r.step >= 2 && r.action_note && (
                                  <tr>
                                    <td colSpan={18} className={`border px-3 py-1 text-[10px] ${r.step === 3 ? "bg-red-50 text-red-700 border-red-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
                                      <span className="font-semibold">{r.step === 3 ? "3단계 조치: " : "2단계 조치: "}</span>{r.action_note}
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </React.Fragment>
                      ))}
                      <tr className="bg-slate-50 font-semibold">
                        <td colSpan={2} className="border border-slate-200 py-2 px-2 text-center text-xs">월 합계</td>
                        <td colSpan={7} className="border border-slate-200 py-2 px-2 text-center text-xs text-slate-400">—</td>
                        <td className="border border-slate-200 py-2 px-2 text-center text-xs bg-blue-50 text-blue-700">
                          {Object.values(flyingMonthTotal).reduce((a,b)=>a+b,0) || ""}
                        </td>
                        <td colSpan={8} className="border border-slate-200" />
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 보행해충 조회 */}
              <div className={card}>
                <div className="px-4 pt-4 pb-2 font-semibold text-sm border-b border-slate-100">
                  보행해충 — {viewYear}년 {viewMonth}월
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-xs" style={{ minWidth: 540 }}>
                    <thead>
                      <tr className="bg-slate-50">
                        <th className="border border-slate-200 py-2 px-2 text-slate-500 w-12">날짜</th>
                        <th className="border border-slate-200 py-2 px-2 text-slate-500" style={{ minWidth: 160 }}>트랩</th>
                        <th className="border border-slate-200 py-2 px-1">그리마</th>
                        <th className="border border-slate-200 py-2 px-1">거미</th>
                        <th className="border border-slate-200 py-2 px-1">노래기</th>
                        <th className="border border-slate-200 py-2 px-1">모기</th>
                        <th className="border border-slate-200 py-2 px-1">집게벌래</th>
                        <th className="border border-slate-200 py-2 px-1">기타</th>
                        <th className="border border-slate-200 py-2 px-2 bg-blue-50 text-blue-700 w-10">계</th>
                        <th className="border border-slate-200 py-2 px-2 bg-green-50 text-green-700 w-10">누계</th>
                      </tr>
                    </thead>
                    <tbody>
                      {viewDates.map(date => (
                        <React.Fragment key={date}>
                          {TRAPS.map((trap, ti) => {
                            const r = walkingByDate[date]?.[trap];
                            const total = r?.total ?? 0;
                            const cumul = walkingCumul[date]?.[trap] ?? 0;
                            return (
                              <tr key={trap}>
                                {ti === 0 && (
                                  <td className="border border-slate-200 py-1.5 px-2 font-medium bg-slate-50 text-center text-[11px]"
                                    rowSpan={TRAPS.length}>{fmtDate(date)}</td>
                                )}
                                <td className="border border-slate-200 py-1 px-2 bg-slate-50 text-[11px] text-slate-600">{TRAP_LABELS[trap]}</td>
                                <td className="border border-slate-200 py-1 px-1 text-center">{r?.grima || ""}</td>
                                <td className="border border-slate-200 py-1 px-1 text-center">{r?.spider || ""}</td>
                                <td className="border border-slate-200 py-1 px-1 text-center">{r?.centipede || ""}</td>
                                <td className="border border-slate-200 py-1 px-1 text-center">{r?.mosquito || ""}</td>
                                <td className="border border-slate-200 py-1 px-1 text-center">{r?.earwig || ""}</td>
                                <td className="border border-slate-200 py-1 px-1 text-center">{r?.other || ""}</td>
                                <td className="border border-slate-200 py-1 px-2 text-center font-semibold bg-blue-50 text-blue-700">
                                  {total > 0 ? total : ""}
                                </td>
                                <td className="border border-slate-200 py-1 px-2 text-center font-semibold bg-green-50 text-green-700">
                                  {cumul > 0 ? cumul : ""}
                                </td>
                              </tr>
                            );
                          })}
                        </React.Fragment>
                      ))}
                      <tr className="bg-slate-50 font-semibold">
                        <td colSpan={2} className="border border-slate-200 py-2 px-2 text-center text-xs">월 합계</td>
                        <td colSpan={6} className="border border-slate-200 py-2 px-2 text-center text-xs text-slate-400">—</td>
                        <td className="border border-slate-200 py-2 px-2 text-center text-xs bg-blue-50 text-blue-700">
                          {Object.values(walkingMonthTotal).reduce((a,b)=>a+b,0) || ""}
                        </td>
                        <td className="border border-slate-200" />
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
       {/* ══ 비래해충 인쇄 전용 ══ */}
       <div id="pest-flying-print-inner" style={{ display: "none" }}>
        <div style={{ fontFamily: "'Malgun Gothic','맑은 고딕',sans-serif", fontSize: "9pt", color: "#000" }}>
          {/* 제목 + 결재란 */}
          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 6 }}>
            <tbody>
              <tr>
                <td rowSpan={2} style={{ border: "1px solid #000", padding: "6px 10px", fontSize: "12pt", fontWeight: "bold", textAlign: "center" }}>
                  방충·방서 점검표(매주 1회 작성) — {viewMonth}월<br/>
                  <span style={{ fontSize: "9pt", fontWeight: "normal" }}>{viewSeason === "summer" ? "하절기" : "동절기"} 기준</span>
                </td>
                <td style={{ border: "1px solid #000", padding: "2px 6px", fontWeight: "bold", textAlign: "center", width: 60 }}>작성</td>
                <td style={{ border: "1px solid #000", padding: "2px 6px", fontWeight: "bold", textAlign: "center", width: 60 }}>승인</td>
              </tr>
              <tr>
                <td style={{ border: "1px solid #000", padding: "3px", textAlign: "center", height: 36 }}></td>
                <td style={{ border: "1px solid #000", padding: "3px", textAlign: "center", height: 36 }}></td>
              </tr>
            </tbody>
          </table>

          {/* 비래해충 데이터 */}
          <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
            <thead>
              <tr style={{ background: "#f0f0f0" }}>
                <th rowSpan={2} style={{ border: "1px solid #000", padding: "3px", textAlign: "center", width: 44, fontSize: "8pt" }}>날짜</th>
                <th rowSpan={2} style={{ border: "1px solid #000", padding: "3px", textAlign: "center", width: 60, fontSize: "8pt" }}>위치</th>
                <th colSpan={7} style={{ border: "1px solid #000", padding: "3px", textAlign: "center", fontSize: "8pt" }}>비래해충</th>
                <th rowSpan={2} style={{ border: "1px solid #000", padding: "3px", textAlign: "center", width: 24, fontSize: "8pt" }}>계</th>
                <th rowSpan={2} style={{ border: "1px solid #000", padding: "3px", textAlign: "center", width: 28, fontSize: "8pt" }}>누계</th>
                <th colSpan={3} style={{ border: "1px solid #000", padding: "3px", textAlign: "center", fontSize: "8pt", background: "#fff8e1" }}>쥐먹이(좌)</th>
                <th colSpan={3} style={{ border: "1px solid #000", padding: "3px", textAlign: "center", fontSize: "8pt", background: "#fff3e0" }}>쥐먹이(우)</th>
              </tr>
              <tr style={{ background: "#f0f0f0" }}>
                {["파리","모기","링다구","초파리","나방","날파리","기타"].map(h => (
                  <th key={h} style={{ border: "1px solid #000", padding: "3px", textAlign: "center", fontSize: "7.5pt" }}>{h}</th>
                ))}
                {["이끼","훼손","쥐"].map(h => (
                  <th key={`l-${h}`} style={{ border: "1px solid #000", padding: "3px", textAlign: "center", fontSize: "7.5pt", background: "#fff8e1" }}>{h}</th>
                ))}
                {["이끼","훼손","쥐"].map(h => (
                  <th key={`r-${h}`} style={{ border: "1px solid #000", padding: "3px", textAlign: "center", fontSize: "7.5pt", background: "#fff3e0" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {viewDates.map(date => (
                <React.Fragment key={date}>
                  {LOCATIONS.map((loc, li) => {
                    const r = flyingByDate[date]?.[loc];
                    const total = r?.total ?? 0;
                    const cumul = flyingCumul[date]?.[loc] ?? 0;
                    const vp1 = flyingByDate[date]?.["P1-입구"];
                    return (
                      <React.Fragment key={loc}>
                        <tr>
                          {li === 0 && (
                            <td rowSpan={LOCATIONS.length} style={{ border: "1px solid #000", padding: "3px", textAlign: "center", fontSize: "8pt", fontWeight: "bold", verticalAlign: "middle" }}>
                              {fmtDate(date)}
                            </td>
                          )}
                          <td style={{ border: "1px solid #000", padding: "3px", fontSize: "7.5pt" }}>{loc}</td>
                          <td style={{ border: "1px solid #000", padding: "3px", textAlign: "center" }}>{r?.fly || ""}</td>
                          <td style={{ border: "1px solid #000", padding: "3px", textAlign: "center" }}>{r?.mosquito || ""}</td>
                          <td style={{ border: "1px solid #000", padding: "3px", textAlign: "center" }}>{r?.midges || ""}</td>
                          <td style={{ border: "1px solid #000", padding: "3px", textAlign: "center" }}>{r?.fruit_fly || ""}</td>
                          <td style={{ border: "1px solid #000", padding: "3px", textAlign: "center" }}>{r?.moth || ""}</td>
                          <td style={{ border: "1px solid #000", padding: "3px", textAlign: "center" }}>{r?.housefly || ""}</td>
                          <td style={{ border: "1px solid #000", padding: "3px", textAlign: "center" }}>{r?.other || ""}</td>
                          <td style={{ border: "1px solid #000", padding: "3px", textAlign: "center", fontWeight: "bold" }}>{total > 0 ? total : ""}</td>
                          <td style={{ border: "1px solid #000", padding: "3px", textAlign: "center" }}>{cumul > 0 ? cumul : ""}</td>
                          {li === 0 && (
                            <>
                              <td rowSpan={LOCATIONS.length} style={{ border: "1px solid #000", padding: "3px", textAlign: "center", background: "#fff8e1" }}>{vp1?.lure_left ?? "—"}</td>
                              <td rowSpan={LOCATIONS.length} style={{ border: "1px solid #000", padding: "3px", textAlign: "center", background: "#fff8e1" }}>{vp1?.damage_left ?? "—"}</td>
                              <td rowSpan={LOCATIONS.length} style={{ border: "1px solid #000", padding: "3px", textAlign: "center", background: "#fff8e1" }}>{vp1?.rat_left ?? "—"}</td>
                              <td rowSpan={LOCATIONS.length} style={{ border: "1px solid #000", padding: "3px", textAlign: "center", background: "#fff3e0" }}>{vp1?.lure_right ?? "—"}</td>
                              <td rowSpan={LOCATIONS.length} style={{ border: "1px solid #000", padding: "3px", textAlign: "center", background: "#fff3e0" }}>{vp1?.damage_right ?? "—"}</td>
                              <td rowSpan={LOCATIONS.length} style={{ border: "1px solid #000", padding: "3px", textAlign: "center", background: "#fff3e0" }}>{vp1?.rat_right ?? "—"}</td>
                            </>
                          )}
                        </tr>
                        {r && r.step >= 2 && r.action_note && (
                          <tr>
                            <td colSpan={15} style={{ border: "1px solid #000", padding: "3px", fontSize: "7.5pt", color: r.step === 3 ? "red" : "#854F0B" }}>
                              <span style={{ fontWeight: "bold" }}>{r.step === 3 ? "3단계 조치: " : "2단계 조치: "}</span>{r.action_note}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </React.Fragment>
              ))}
              {/* 월 합계 행 */}
              <tr style={{ background: "#f5f5f5", fontWeight: "bold" }}>
                <td colSpan={2} style={{ border: "1px solid #000", padding: "3px", textAlign: "center", fontSize: "8pt" }}>계</td>
                <td colSpan={7} style={{ border: "1px solid #000", padding: "3px", textAlign: "center", fontSize: "8pt", color: "#999" }}>—</td>
                <td style={{ border: "1px solid #000", padding: "3px", textAlign: "center", fontSize: "8pt" }}>
                  {Object.values(flyingMonthTotal).reduce((a,b)=>a+b,0) || ""}
                </td>
                <td colSpan={6} style={{ border: "1px solid #000", padding: "3px" }} />
              </tr>
            </tbody>
          </table>

          {/* 이달내용 / 조치자 / 확인자 */}
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 6 }}>
            <tbody>
              <tr>
                <td style={{ border: "1px solid #000", padding: "3px 6px", fontWeight: "bold", fontSize: "8pt", width: 60, whiteSpace: "nowrap" }}>이달내용</td>
                <td style={{ border: "1px solid #000", padding: "3px 6px", fontSize: "8pt" }}>
                  {viewDates.flatMap(date =>
                    LOCATIONS.map(loc => {
                      const r = flyingByDate[date]?.[loc];
                      if (!r || r.step < 2 || !r.action_note) return null;
                      return `${fmtDate(date)} ${loc}: ${r.action_note}`;
                    }).filter(Boolean)
                  ).join("  /  ") || " "}
                </td>
                <td style={{ border: "1px solid #000", padding: "3px 6px", fontWeight: "bold", textAlign: "center", fontSize: "8pt", width: 50 }}>조치자</td>
                <td style={{ border: "1px solid #000", padding: "3px 6px", width: 60 }}></td>
                <td style={{ border: "1px solid #000", padding: "3px 6px", fontWeight: "bold", textAlign: "center", fontSize: "8pt", width: 50 }}>확인자</td>
                <td style={{ border: "1px solid #000", padding: "3px 6px", width: 60 }}></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ══ 보행해충 인쇄 전용 ══ */}
      <div id="pest-walking-print-inner" style={{ display: "none" }}>
        <div style={{ fontFamily: "'Malgun Gothic','맑은 고딕',sans-serif", fontSize: "9pt", color: "#000" }}>
          {/* 제목 + 결재란 */}
          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 6 }}>
            <tbody>
              <tr>
                <td rowSpan={2} style={{ border: "1px solid #000", padding: "6px 10px", fontSize: "12pt", fontWeight: "bold", textAlign: "center" }}>
                  방충·방서 점검표-보행해충 모니터링(매주 1회 작성) — {viewMonth}월
                </td>
                <td style={{ border: "1px solid #000", padding: "2px 6px", fontWeight: "bold", textAlign: "center", width: 60 }}>작성</td>
                <td style={{ border: "1px solid #000", padding: "2px 6px", fontWeight: "bold", textAlign: "center", width: 60 }}>승인</td>
              </tr>
              <tr>
                <td style={{ border: "1px solid #000", padding: "3px", textAlign: "center", height: 36 }}></td>
                <td style={{ border: "1px solid #000", padding: "3px", textAlign: "center", height: 36 }}></td>
              </tr>
            </tbody>
          </table>

          {/* 보행해충 데이터 */}
          <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
            <thead>
              <tr style={{ background: "#f0f0f0" }}>
                <th style={{ border: "1px solid #000", padding: "3px", textAlign: "center", width: 44, fontSize: "8pt" }}>날짜</th>
                <th style={{ border: "1px solid #000", padding: "3px", textAlign: "center", fontSize: "8pt" }}>트랩</th>
                {["그리마","거미","노래기","모기","집게벌래","기타"].map(h => (
                  <th key={h} style={{ border: "1px solid #000", padding: "3px", textAlign: "center", fontSize: "7.5pt" }}>{h}</th>
                ))}
                <th style={{ border: "1px solid #000", padding: "3px", textAlign: "center", width: 28, fontSize: "8pt" }}>계</th>
                <th style={{ border: "1px solid #000", padding: "3px", textAlign: "center", width: 28, fontSize: "8pt" }}>누계</th>
              </tr>
            </thead>
            <tbody>
              {viewDates.map(date => (
                <React.Fragment key={date}>
                  {TRAPS.map((trap, ti) => {
                    const r = walkingByDate[date]?.[trap];
                    const total = r?.total ?? 0;
                    const cumul = walkingCumul[date]?.[trap] ?? 0;
                    return (
                      <tr key={trap}>
                        {ti === 0 && (
                          <td rowSpan={TRAPS.length} style={{ border: "1px solid #000", padding: "3px", textAlign: "center", fontSize: "8pt", fontWeight: "bold", verticalAlign: "middle" }}>
                            {fmtDate(date)}
                          </td>
                        )}
                        <td style={{ border: "1px solid #000", padding: "3px", fontSize: "7.5pt" }}>{TRAP_LABELS[trap]}</td>
                        <td style={{ border: "1px solid #000", padding: "3px", textAlign: "center" }}>{r?.grima || ""}</td>
                        <td style={{ border: "1px solid #000", padding: "3px", textAlign: "center" }}>{r?.spider || ""}</td>
                        <td style={{ border: "1px solid #000", padding: "3px", textAlign: "center" }}>{r?.centipede || ""}</td>
                        <td style={{ border: "1px solid #000", padding: "3px", textAlign: "center" }}>{r?.mosquito || ""}</td>
                        <td style={{ border: "1px solid #000", padding: "3px", textAlign: "center" }}>{r?.earwig || ""}</td>
                        <td style={{ border: "1px solid #000", padding: "3px", textAlign: "center" }}>{r?.other || ""}</td>
                        <td style={{ border: "1px solid #000", padding: "3px", textAlign: "center", fontWeight: "bold" }}>{total > 0 ? total : ""}</td>
                        <td style={{ border: "1px solid #000", padding: "3px", textAlign: "center" }}>{cumul > 0 ? cumul : ""}</td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              ))}
              {/* 월 합계 행 */}
              <tr style={{ background: "#f5f5f5", fontWeight: "bold" }}>
                <td colSpan={2} style={{ border: "1px solid #000", padding: "3px", textAlign: "center", fontSize: "8pt" }}>계</td>
                <td colSpan={6} style={{ border: "1px solid #000", padding: "3px", textAlign: "center", fontSize: "8pt", color: "#999" }}>—</td>
                <td style={{ border: "1px solid #000", padding: "3px", textAlign: "center", fontSize: "8pt" }}>
                  {Object.values(walkingMonthTotal).reduce((a,b)=>a+b,0) || ""}
                </td>
                <td style={{ border: "1px solid #000", padding: "3px" }} />
              </tr>
            </tbody>
          </table>

          {/* 이달내용 / 조치자 / 확인자 */}
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 6 }}>
            <tbody>
              <tr>
                <td style={{ border: "1px solid #000", padding: "3px 6px", fontWeight: "bold", fontSize: "8pt", width: 60, whiteSpace: "nowrap" }}>이달내용</td>
                <td style={{ border: "1px solid #000", padding: "3px 6px", fontSize: "8pt" }}> </td>
                <td style={{ border: "1px solid #000", padding: "3px 6px", fontWeight: "bold", textAlign: "center", fontSize: "8pt", width: 50 }}>조치자</td>
                <td style={{ border: "1px solid #000", padding: "3px 6px", width: 60 }}></td>
                <td style={{ border: "1px solid #000", padding: "3px 6px", fontWeight: "bold", textAlign: "center", fontSize: "8pt", width: 50 }}>확인자</td>
                <td style={{ border: "1px solid #000", padding: "3px 6px", width: 60 }}></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      </div>
  );
}
