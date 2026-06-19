"use client";

import React, { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { todayKST } from "@/lib/utils/date";
import { PinModal } from "@/app/contexts/PinSessionContext";

const supabase = createClient();

const card = "rounded-2xl border border-slate-200 bg-white shadow-sm";
const inp = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:outline-none";
const btn = "rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50 active:bg-slate-100";
const btnSm = "rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium hover:bg-slate-50";

const SIGN_MAP: Record<string, string> = {
  "조은미": "/sign-choem.png",
  "강미라": "/sign-kangml.png",
  "나현우": "/sign-nahw.png",
  "나미영": "/sign-namiy.png",
  "조대성": "/sign-chods.png",
  "김영각": "/sign-kimyg.png",
  "고한결": "/sign-gohg.png",
};

type UserRole = "ADMIN" | "SUBADMIN" | "USER" | null;

type Curriculum = { id: string; month: number; content: string };
type Attendee = { id?: string; employee_id: string | null; name: string; note: string; signed_at: string | null };
type HygieneLog = {
  id: string; training_date: string; start_time: string | null; end_time: string | null;
  location: string | null; target: string | null; absentee_type: string | null; absentee_note: string | null;
  content: string | null; result_note: string | null; attachment_docs: string[] | null; photo_path: string | null;
  educator_name: string | null;
  hygiene_training_attendees?: Attendee[];
};

const ABSENTEE_OPTIONS = ["재교육", "전달교육", "기타"];
const ATTACHMENT_OPTIONS = ["참석자 명단", "교 안", "기타"];

// ═══════════════════════════════════════════════════════════
// 사내 위생 및 안전교육
// ═══════════════════════════════════════════════════════════
export function HygieneTrainingTab({ role, userId, showToast }: {
  role: UserRole; userId: string | null;
  showToast: (msg: string, type?: "success" | "error") => void;
}) {
  const isAdminOrSubadmin = role === "ADMIN" || role === "SUBADMIN";
  const today = todayKST();

  const [employees, setEmployees] = useState<{ id: string; name: string; pin: string | null }[]>([]);

  // 커리큘럼
  const [curriculum, setCurriculum] = useState<Record<number, Curriculum>>({});
  const [curriculumOpen, setCurriculumOpen] = useState(false);
  const [curriculumEditingMonth, setCurriculumEditingMonth] = useState<number | null>(null);
  const [curriculumDraft, setCurriculumDraft] = useState("");
  const [curriculumSaving, setCurriculumSaving] = useState(false);

  // 목록 / 조회기간
  const [logs, setLogs] = useState<HygieneLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [rangeFrom, setRangeFrom] = useState(() => {
    const d = new Date(today + "T00:00:00+09:00");
    d.setMonth(d.getMonth() - 2);
    return d.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
  });
  const [rangeTo, setRangeTo] = useState(today);

  // 등록 폼
  const [formOpen, setFormOpen] = useState(false);
  const [fDate, setFDate] = useState(today);
  const [contentMonthLoaded, setContentMonthLoaded] = useState<number | null>(null);
  const [fStart, setFStart] = useState("");
  const [fEnd, setFEnd] = useState("");
  const [fLocation, setFLocation] = useState("");
  const [fTarget, setFTarget] = useState("전원");
  const [fAbsentee, setFAbsentee] = useState("재교육");
  const [fAbsenteeNote, setFAbsenteeNote] = useState("");
  const [fContent, setFContent] = useState("");
  const [fResultNote, setFResultNote] = useState("");
  const [fAttachments, setFAttachments] = useState<string[]>([]);
  const [fAttachmentNote, setFAttachmentNote] = useState("");
  const [fEducator, setFEducator] = useState<{ id: string; name: string } | null>(null);
  const [fAttendees, setFAttendees] = useState<Attendee[]>([]);
  const [fPhotoFile, setFPhotoFile] = useState<File | null>(null);
  const [fPhotoPreview, setFPhotoPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [showPinFor, setShowPinFor] = useState<"educator" | "attendee" | null>(null);
  const [photoSignedUrls, setPhotoSignedUrls] = useState<Record<string, string>>({});
  const [signingEmpId, setSigningEmpId] = useState<string | null>(null);
  const [signingPin, setSigningPin] = useState("");
  const [signingError, setSigningError] = useState("");

  useEffect(() => {
    supabase.from("employees").select("id,name,pin").is("resign_date", null).order("name")
      .then(({ data }) => setEmployees((data ?? []) as any));
  }, []);

  const loadCurriculum = useCallback(async () => {
    const { data } = await supabase.from("hygiene_training_curriculum").select("*");
    const map: Record<number, Curriculum> = {};
    for (const c of (data ?? []) as Curriculum[]) map[c.month] = c;
    setCurriculum(map);
  }, []);

  const loadLogs = useCallback(async () => {
    if (!rangeFrom || !rangeTo || rangeFrom > rangeTo) return;
    setLoading(true);
    const { data, error } = await supabase.from("hygiene_training_logs")
      .select("*, hygiene_training_attendees(*)")
      .gte("training_date", rangeFrom).lte("training_date", rangeTo)
      .order("training_date", { ascending: false });
    if (error) showToast("조회 실패: " + error.message, "error");
    setLogs((data ?? []) as any);
    setLoading(false);
  }, [rangeFrom, rangeTo, showToast]);

  useEffect(() => { loadCurriculum(); }, [loadCurriculum]);
  useEffect(() => { loadLogs(); }, [loadLogs]);

  async function saveCurriculumMonth(month: number) {
    setCurriculumSaving(true);
    const existing = curriculum[month];
    const { error } = existing
      ? await supabase.from("hygiene_training_curriculum").update({ content: curriculumDraft, updated_at: new Date().toISOString() }).eq("id", existing.id)
      : await supabase.from("hygiene_training_curriculum").insert({ month, content: curriculumDraft });
    setCurriculumSaving(false);
    if (error) return showToast("저장 실패: " + error.message, "error");
    showToast("✅ 저장 완료!");
    setCurriculumEditingMonth(null);
    loadCurriculum();
  }

  function resetForm() {
    setFDate(today); setContentMonthLoaded(null); setFStart(""); setFEnd(""); setFLocation("");
    setFTarget("전원"); setFAbsentee("재교육"); setFAbsenteeNote(""); setFContent(""); setFResultNote("");
    setFAttachments([]); setFAttachmentNote(""); setFEducator(null); setFAttendees([]);
    setFPhotoFile(null); setFPhotoPreview(null);
  }

  function openNewForm() {
    resetForm();
    setFormOpen(true);
  }

  // 교육일자(월)가 바뀔 때만 해당 월 커리큘럼 자동 반영 (같은 달 안에서 입력한 내용은 보존)
  useEffect(() => {
    if (!formOpen) return;
    const d = new Date(fDate + "T00:00:00+09:00");
    const month = d.getMonth() + 1;
    if (month !== contentMonthLoaded) {
      setFContent(curriculum[month]?.content ?? "");
      setContentMonthLoaded(month);
    }
  }, [fDate, curriculum, formOpen, contentMonthLoaded]);

  function toggleAttachment(opt: string) {
    setFAttachments((prev) => prev.includes(opt) ? prev.filter((o) => o !== opt) : [...prev, opt]);
  }

  function addAttendee(empId: string, empName: string) {
    if (fAttendees.some((a) => a.employee_id === empId)) {
      showToast("이미 추가된 참석자입니다.", "error");
      return;
    }
    setFAttendees((prev) => [...prev, { employee_id: empId, name: empName, note: "", signed_at: new Date().toISOString() }]);
  }

  function removeAttendee(idx: number) {
    setFAttendees((prev) => prev.filter((_, i) => i !== idx));
  }

  function removeAttendeeById(empId: string) {
    setFAttendees((prev) => prev.filter((a) => a.employee_id !== empId));
  }

  function handleSigningDigit(emp: { id: string; name: string; pin: string | null }, d: string) {
    if (d === "⌫") { setSigningPin((p) => p.slice(0, -1)); setSigningError(""); return; }
    if (signingPin.length >= 4) return;
    const next = signingPin + d;
    setSigningPin(next);
    if (next.length === 4) {
      setTimeout(() => {
        if (!emp.pin) { setSigningError("PIN 미설정"); setSigningPin(""); return; }
        if (emp.pin !== next) { setSigningError("PIN 오류"); setSigningPin(""); return; }
        addAttendee(emp.id, emp.name);
        setSigningEmpId(null); setSigningPin(""); setSigningError("");
      }, 100);
    }
  }

  function onPhotoSelected(file: File | null) {
    setFPhotoFile(file);
    setFPhotoPreview(file ? URL.createObjectURL(file) : null);
  }

  async function uploadPhoto(file: File, dateStr: string): Promise<string | null> {
    const ext = file.name.split(".").pop() || "jpg";
    const path = `hygiene/${dateStr}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("training-photos").upload(path, file);
    if (error) { showToast("사진 업로드 실패: " + error.message, "error"); return null; }
    return path;
  }

  async function saveLog() {
    const educator = employees.find((e) => e.name === "조대성");
    if (!fLocation.trim()) return showToast("장소를 입력하세요.", "error");
    if (fAttendees.length === 0) return showToast("참석자를 1명 이상 추가하세요.", "error");
    if (!fPhotoFile) return showToast("단체사진을 첨부하세요.", "error");

    setSaving(true);
    const photoPath = await uploadPhoto(fPhotoFile, fDate);
    if (!photoPath) { setSaving(false); return; }

    const attachmentDocs = fAttachments.length > 0
      ? (fAttachments.includes("기타")
          ? [...fAttachments.filter((a) => a !== "기타"), `기타(${fAttachmentNote.trim()})`]
          : fAttachments)
      : null;

    const { data: logData, error: logError } = await supabase.from("hygiene_training_logs").insert({
      training_date: fDate, start_time: fStart || null, end_time: fEnd || null,
      location: fLocation.trim(), target: fTarget.trim(),
      absentee_type: fAbsentee, absentee_note: fAbsentee === "기타" ? fAbsenteeNote.trim() : null,
      content: fContent, result_note: fResultNote.trim() || null,
      attachment_docs: attachmentDocs,
      photo_path: photoPath,
      educator_employee_id: educator?.id ?? null, educator_name: "조대성", educator_signed_at: new Date().toISOString(),
      created_by: userId,
    }).select().single();

    if (logError || !logData) { setSaving(false); return showToast("저장 실패: " + (logError?.message ?? ""), "error"); }

    const attendeeRows = fAttendees.map((a) => ({
      log_id: logData.id, employee_id: a.employee_id, name: a.name, note: a.note || null, signed_at: a.signed_at,
    }));
    const { error: attError } = await supabase.from("hygiene_training_attendees").insert(attendeeRows);
    setSaving(false);
    if (attError) return showToast("참석자 저장 실패: " + attError.message, "error");

    showToast("✅ 교육 기록 저장 완료!");
    setFormOpen(false);
    resetForm();
    loadLogs();
  }

  async function deleteLog(id: string) {
    if (!confirm("이 교육 기록을 삭제하시겠습니까? 참석자 명단도 함께 삭제됩니다.")) return;
    const { error } = await supabase.from("hygiene_training_logs").delete().eq("id", id);
    if (error) return showToast("삭제 실패: " + error.message, "error");
    showToast("🗑️ 삭제 완료!");
    loadLogs();
  }

  async function getSignedPhotoUrl(path: string): Promise<string | null> {
    if (photoSignedUrls[path]) return photoSignedUrls[path];
    const { data, error } = await supabase.storage.from("training-photos").createSignedUrl(path, 3600);
    if (error || !data) return null;
    setPhotoSignedUrls((prev) => ({ ...prev, [path]: data.signedUrl }));
    return data.signedUrl;
  }

  // ── 인쇄 ──
  function buildLogHtml(log: HygieneLog, photoUrl: string | null): string {
    const tdS = `border:1px solid #000;padding:4px 6px;font-size:9pt;vertical-align:middle;`;
    const d = new Date(log.training_date + "T00:00:00+09:00");
    const days = ["일", "월", "화", "수", "목", "금", "토"];
    const dateLabel = `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
    const timeLabel = log.start_time && log.end_time ? `${log.start_time.slice(0, 5)} ~ ${log.end_time.slice(0, 5)}` : "";
    const attendees = log.hygiene_training_attendees ?? [];

    function signCell(name: string | null): string {
      if (!name) return "";
      const src = SIGN_MAP[name];
      return src
        ? `<img src="${src}" style="height:20px;object-fit:contain;display:block;margin:0 auto;" alt="${name}"/><div style="font-size:7pt;">${name}</div>`
        : `<div style="font-size:8pt;">${name}</div>`;
    }

    const absenteeChecks = ABSENTEE_OPTIONS.map((opt) => `${log.absentee_type === opt ? "☑" : "☐"}${opt}`).join("&nbsp;&nbsp;");
    const attachmentLabels = log.attachment_docs ?? [];
    const attachChecks = ATTACHMENT_OPTIONS.map((opt) => {
      const checked = attachmentLabels.some((a) => a === opt || a.startsWith("기타("));
      return `${checked ? "☑" : "☐"}${opt}`;
    }).join("&nbsp;&nbsp;");

    let attendeeRows = "";
    for (let i = 0; i < attendees.length; i += 6) {
      const chunk = attendees.slice(i, i + 6);
      attendeeRows += `<tr>`;
      for (const a of chunk) attendeeRows += `<td style="${tdS}text-align:center;height:40px;">${signCell(a.name)}</td>`;
      for (let j = chunk.length; j < 6; j++) attendeeRows += `<td style="${tdS}"></td>`;
      attendeeRows += `</tr>`;
    }
    if (attendees.length === 0) attendeeRows = `<tr>${Array.from({ length: 6 }).map(() => `<td style="${tdS}height:40px;"></td>`).join("")}</tr>`;

    return `<div style="page-break-after:always;">
      <table style="width:100%;border-collapse:collapse;margin-bottom:4px;"><tbody>
        <tr>
          <td rowspan="2" style="${tdS}font-size:13pt;font-weight:bold;text-align:center;padding:8px;">사내 위생 및 안전교육</td>
          <td rowspan="2" style="${tdS}width:28px;font-weight:bold;text-align:center;font-size:8pt;">결<br/>재<br/>란</td>
          <td style="${tdS}width:80px;text-align:center;font-weight:bold;">작성</td>
          <td style="${tdS}width:80px;text-align:center;font-weight:bold;">승인</td>
        </tr>
        <tr>
          <td style="${tdS}text-align:center;padding:3px;"><img src="/sign-kimyg.png" style="height:30px;object-fit:contain;display:block;margin:0 auto;" alt="김영각"/><div style="font-size:7pt;margin-top:2px;">김영각</div></td>
          <td style="${tdS}text-align:center;padding:3px;"><img src="/sign-chods.png" style="height:30px;object-fit:contain;display:block;margin:0 auto;" alt="조대성"/><div style="font-size:7pt;margin-top:2px;">조대성</div></td>
        </tr>
      </tbody></table>
      <table style="width:100%;border-collapse:collapse;margin-bottom:4px;"><tbody>
        <tr>
          <td style="${tdS}font-weight:bold;width:80px;">교육자</td><td style="${tdS}width:160px;">${log.educator_name ?? ""}</td>
          <td style="${tdS}font-weight:bold;width:60px;">장소</td><td style="${tdS}">${log.location ?? ""}</td>
        </tr>
        <tr>
          <td style="${tdS}font-weight:bold;">일 시</td><td style="${tdS}" colspan="3">${dateLabel} &nbsp; ${timeLabel}</td>
        </tr>
        <tr>
          <td style="${tdS}font-weight:bold;">대 상</td><td style="${tdS}">${log.target ?? ""}</td>
          <td style="${tdS}font-weight:bold;">불참자처리</td><td style="${tdS}font-size:8pt;">${absenteeChecks}${log.absentee_type === "기타" && log.absentee_note ? ` (${log.absentee_note})` : ""}</td>
        </tr>
      </tbody></table>
      <table style="width:100%;border-collapse:collapse;margin-bottom:4px;"><tbody>
        <tr><td style="${tdS}font-weight:bold;width:80px;vertical-align:top;">교육내용</td><td style="${tdS}white-space:pre-wrap;min-height:60px;">${(log.content ?? "").replace(/\n/g, "<br/>")}</td></tr>
      </tbody></table>
      <table style="width:100%;border-collapse:collapse;margin-bottom:4px;"><tbody>
        <tr><td style="${tdS}font-weight:bold;text-align:center;" colspan="6">참석자 서명</td></tr>
        ${attendeeRows}
      </tbody></table>
      <table style="width:100%;border-collapse:collapse;margin-bottom:4px;"><tbody>
        <tr><td style="${tdS}font-weight:bold;width:80px;">교육 후 결과</td><td style="${tdS}">${log.result_note ?? ""}</td></tr>
        <tr><td style="${tdS}font-weight:bold;">유첨서류</td><td style="${tdS}font-size:8pt;">${attachChecks}</td></tr>
      </tbody></table>
      ${photoUrl ? `<div style="margin-top:6px;"><div style="font-size:8pt;font-weight:bold;margin-bottom:3px;">📷 교육 사진</div><img src="${photoUrl}" style="max-width:260px;max-height:200px;border:1px solid #999;"/></div>` : ""}
    </div>`;
  }

  async function printSingle(log: HygieneLog) {
    let photoUrl: string | null = null;
    if (log.photo_path) photoUrl = await getSignedPhotoUrl(log.photo_path);
    const html = buildLogHtml(log, photoUrl);
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>위생안전교육_${log.training_date}</title>
      <style>@page{size:A4 portrait;margin:12mm 15mm;}body{margin:0;font-family:'Malgun Gothic','맑은 고딕',sans-serif;color:#000;}
      *{box-sizing:border-box;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;}
      table{border-collapse:collapse;}img{max-width:none;}</style></head><body>${html}</body></html>`);
    win.document.close(); win.focus();
    setTimeout(() => { win.print(); }, 400);
  }

  async function printRange() {
    if (logs.length === 0) return showToast("조회된 기록이 없습니다.", "error");
    const sorted = [...logs].sort((a, b) => a.training_date.localeCompare(b.training_date));
    const htmlParts: string[] = [];
    for (const log of sorted) {
      let photoUrl: string | null = null;
      if (log.photo_path) photoUrl = await getSignedPhotoUrl(log.photo_path);
      htmlParts.push(buildLogHtml(log, photoUrl));
    }
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>위생안전교육_${rangeFrom}_${rangeTo}</title>
      <style>@page{size:A4 portrait;margin:12mm 15mm;}body{margin:0;font-family:'Malgun Gothic','맑은 고딕',sans-serif;color:#000;}
      *{box-sizing:border-box;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;}
      table{border-collapse:collapse;}img{max-width:none;}</style></head><body>${htmlParts.join("")}</body></html>`);
    win.document.close(); win.focus();
    setTimeout(() => { win.print(); }, 500);
  }

  return (
    <div className="space-y-4">
      {/* 조회 기간 + 인쇄 + 신규등록 */}
      <div className={`${card} p-3 flex flex-wrap items-center gap-3`}>
        <span className="text-sm font-semibold text-slate-600">조회 기간</span>
        <input type="date" className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:border-blue-400" value={rangeFrom} max={today} onChange={(e) => setRangeFrom(e.target.value)} />
        <span className="text-slate-400">~</span>
        <input type="date" className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:border-blue-400" value={rangeTo} max={today} onChange={(e) => setRangeTo(e.target.value)} />
        <button className={btn} onClick={loadLogs}>🔄 조회</button>
        <button className={btnSm} onClick={printRange}>🖨️ 기간 인쇄</button>
        <div className="flex-1" />
        <button className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700" onClick={openNewForm}>+ 새 교육 등록</button>
      </div>

      {/* 커리큘럼 관리 */}
      {isAdminOrSubadmin && (
        <div className={`${card} p-4`}>
          <button className="flex w-full items-center justify-between text-sm font-semibold" onClick={() => setCurriculumOpen(!curriculumOpen)}>
            <span>📚 1~12월 교육 커리큘럼 관리</span>
            <span className="text-xs text-slate-400">{curriculumOpen ? "닫기 ▲" : "열기 ▼"}</span>
          </button>
          {curriculumOpen && (
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 12 }).map((_, i) => {
                const month = i + 1;
                const c = curriculum[month];
                const isEditing = curriculumEditingMonth === month;
                return (
                  <div key={month} className="rounded-xl border border-slate-200 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold">{month}월</span>
                      {!isEditing && (
                        <button className={btnSm} onClick={() => { setCurriculumEditingMonth(month); setCurriculumDraft(c?.content ?? ""); }}>{c ? "수정" : "등록"}</button>
                      )}
                    </div>
                    {isEditing ? (
                      <div className="mt-2 space-y-2">
                        <textarea className={`${inp} min-h-[80px]`} value={curriculumDraft} onChange={(e) => setCurriculumDraft(e.target.value)} placeholder="교육내용 입력" />
                        <div className="flex gap-2">
                          <button className="rounded-lg border border-blue-400 bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60" disabled={curriculumSaving} onClick={() => saveCurriculumMonth(month)}>{curriculumSaving ? "..." : "저장"}</button>
                          <button className={btnSm} onClick={() => setCurriculumEditingMonth(null)}>취소</button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-1 text-xs text-slate-500 whitespace-pre-wrap line-clamp-3">{c?.content || "등록된 내용이 없습니다."}</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 등록 폼 */}
      {formOpen && (
        <div className={`${card} border-blue-200 p-4`}>
          <div className="mb-3 flex items-center justify-between">
            <span className="font-semibold text-sm">📝 새 교육 등록</span>
            <button className="text-xs text-slate-400 hover:text-slate-600" onClick={() => setFormOpen(false)}>✕ 닫기</button>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <div className="mb-1 text-xs text-slate-500">교육일자 *</div>
              <input type="date" className={inp} value={fDate} max={today} onChange={(e) => setFDate(e.target.value)} />
            </div>
            <div>
              <div className="mb-1 text-xs text-slate-500">장소 *</div>
              <input className={inp} value={fLocation} onChange={(e) => setFLocation(e.target.value)} placeholder="예: 휴게실·복도" />
            </div>
            <div>
              <div className="mb-1 text-xs text-slate-500">시작시각</div>
              <input type="time" className={inp} value={fStart} onChange={(e) => setFStart(e.target.value)} />
            </div>
            <div>
              <div className="mb-1 text-xs text-slate-500">종료시각</div>
              <input type="time" className={inp} value={fEnd} onChange={(e) => setFEnd(e.target.value)} />
            </div>
            <div>
              <div className="mb-1 text-xs text-slate-500">대상</div>
              <input className={inp} value={fTarget} onChange={(e) => setFTarget(e.target.value)} placeholder="예: 전원" />
            </div>
            <div>
              <div className="mb-1 text-xs text-slate-500">불참자처리</div>
              <div className="flex gap-2">
                {ABSENTEE_OPTIONS.map((opt) => (
                  <button key={opt} type="button" className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium ${fAbsentee === opt ? "border-blue-400 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-500"}`} onClick={() => setFAbsentee(opt)}>{opt}</button>
                ))}
              </div>
              {fAbsentee === "기타" && (
                <input className={`${inp} mt-2`} value={fAbsenteeNote} onChange={(e) => setFAbsenteeNote(e.target.value)} placeholder="기타 내용" />
              )}
            </div>
          </div>

          <div className="mt-3">
            <div className="mb-1 text-xs text-slate-500">교육내용 ({new Date(fDate + "T00:00:00+09:00").getMonth() + 1}월 커리큘럼 자동 반영 — 필요시 수정)</div>
            <textarea className={`${inp} min-h-[100px]`} value={fContent} onChange={(e) => setFContent(e.target.value)} />
          </div>

          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="mb-1 text-xs font-semibold text-slate-500">교육자 (고정)</div>
            <div className="flex items-center gap-2">
              <img src="/sign-chods.png" style={{ height: 24, objectFit: "contain" }} alt="조대성" />
              <span className="text-sm font-semibold text-slate-700">조대성</span>
              <span className="text-xs text-green-600">✓ 고정</span>
            </div>
          </div>

          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="mb-2 text-xs font-semibold text-slate-500">참석자 서명 ({fAttendees.length}명 완료) — 각자 본인 PIN 입력</div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {employees.filter((e) => e.name !== "조대성").map((emp) => {
                const signed = fAttendees.some((a) => a.employee_id === emp.id);
                const isSigning = signingEmpId === emp.id;
                return (
                  <div key={emp.id} className={`rounded-xl border p-2.5 transition-all ${signed ? "border-green-300 bg-green-50" : "border-slate-200 bg-white"}`}>
                    <div className="text-sm font-semibold text-center text-slate-700">{emp.name}</div>
                    {signed ? (
                      <div className="flex items-center justify-center gap-1.5 mt-1.5">
                        {SIGN_MAP[emp.name] && <img src={SIGN_MAP[emp.name]} style={{ height: 18, objectFit: "contain" }} alt={emp.name} />}
                        <span className="text-xs text-green-600">✓ 서명완료</span>
                        <button className="text-[10px] text-slate-300 hover:text-red-400 ml-1" onClick={() => removeAttendeeById(emp.id)}>✕</button>
                      </div>
                    ) : isSigning ? (
                      <div className="mt-1.5">
                        <div className="flex justify-center gap-1.5 mb-1.5">
                          {[0,1,2,3].map((i) => (
                            <div key={i} className={`w-5 h-5 rounded border-2 flex items-center justify-center text-[10px] font-bold transition-all ${signingPin.length > i ? "border-blue-500 bg-blue-500 text-white" : "border-slate-200 bg-white"}`}>
                              {signingPin.length > i ? "●" : ""}
                            </div>
                          ))}
                        </div>
                        {signingError && <div className="text-[10px] text-red-500 text-center mb-1">{signingError}</div>}
                        <div className="grid grid-cols-3 gap-0.5">
                          {["1","2","3","4","5","6","7","8","9","","0","⌫"].map((d, i) => (
                            <button key={i} type="button"
                              className={`py-1.5 text-xs font-semibold rounded transition-all ${d === "" ? "invisible" : "bg-white border border-slate-200 hover:bg-slate-50 active:bg-slate-100"}`}
                              onClick={() => handleSigningDigit(emp, d)}>{d}</button>
                          ))}
                        </div>
                        <button className="mt-1 w-full text-[10px] text-slate-400 hover:text-slate-600" onClick={() => { setSigningEmpId(null); setSigningPin(""); setSigningError(""); }}>취소</button>
                      </div>
                    ) : (
                      <button className="mt-1.5 w-full rounded-lg border border-slate-200 py-1 text-xs text-slate-500 hover:bg-slate-50 hover:border-blue-300 hover:text-blue-600 transition-all"
                        onClick={() => { setSigningEmpId(emp.id); setSigningPin(""); setSigningError(""); }}>
                        🔒 PIN 입력
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-3">
            <div className="mb-1 text-xs text-slate-500">교육 후 결과</div>
            <input className={inp} value={fResultNote} onChange={(e) => setFResultNote(e.target.value)} placeholder="예: 복장착용 요령 및 필요성 인식 제고" />
          </div>

          <div className="mt-3">
            <div className="mb-1 text-xs text-slate-500">유첨서류</div>
            <div className="flex flex-wrap gap-3">
              {ATTACHMENT_OPTIONS.map((opt) => (
                <label key={opt} className="flex items-center gap-1.5 text-xs text-slate-600">
                  <input type="checkbox" checked={fAttachments.includes(opt)} onChange={() => toggleAttachment(opt)} />
                  {opt}
                </label>
              ))}
            </div>
            {fAttachments.includes("기타") && (
              <input className={`${inp} mt-2`} value={fAttachmentNote} onChange={(e) => setFAttachmentNote(e.target.value)} placeholder="기타 서류명" />
            )}
          </div>

          <div className="mt-3">
            <div className="mb-1 text-xs text-slate-500">교육 사진 (단체사진 1장) *</div>
            <input type="file" accept="image/*" onChange={(e) => onPhotoSelected(e.target.files?.[0] ?? null)} className="text-xs" />
            {fPhotoPreview && (
              <img src={fPhotoPreview} className="mt-2 h-32 rounded-lg border border-slate-200 object-cover" alt="미리보기" />
            )}
          </div>

          <div className="mt-4">
            <button className="w-full rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60" disabled={saving} onClick={saveLog}>
              {saving ? "저장 중..." : "💾 교육 기록 저장"}
            </button>
          </div>
        </div>
      )}

    {/* 목록 */}
    <div className={`${card} p-4`}>
        <div className="mb-3 font-semibold text-sm">📋 교육 기록 — {rangeFrom} ~ {rangeTo}</div>
        {loading ? (
          <div className="py-6 text-center text-sm text-slate-400">불러오는 중...</div>
        ) : logs.length === 0 ? (
          <div className="py-6 text-center text-sm text-slate-400">기록이 없습니다.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b-2 border-slate-200 bg-slate-50">
                  <th className="py-2 px-3 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">일자</th>
                  <th className="py-2 px-3 text-left text-xs font-semibold text-slate-500">장소</th>
                  <th className="py-2 px-3 text-left text-xs font-semibold text-slate-500">교육자</th>
                  <th className="py-2 px-3 text-center text-xs font-semibold text-slate-500 whitespace-nowrap">참석자</th>
                  <th className="py-2 px-3 text-center text-xs font-semibold text-slate-500 whitespace-nowrap">사진</th>
                  <th className="py-2 px-3 text-center text-xs font-semibold text-slate-500 whitespace-nowrap">작업</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log, idx) => (
                  <tr key={log.id} className={`border-b border-slate-100 ${idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}`}>
                    <td className="py-2 px-3 whitespace-nowrap">{log.training_date}</td>
                    <td className="py-2 px-3">{log.location}</td>
                    <td className="py-2 px-3">{log.educator_name}</td>
                    <td className="py-2 px-3 text-center">{(log.hygiene_training_attendees ?? []).length}명</td>
                    <td className="py-2 px-3 text-center">{log.photo_path ? "✅" : "—"}</td>
                    <td className="py-2 px-3 text-center whitespace-nowrap">
                      <button className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-500 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600 mr-1" onClick={() => printSingle(log)}>인쇄</button>
                      {isAdminOrSubadmin && (
                        <button className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-400 hover:bg-red-50 hover:border-red-300 hover:text-red-500" onClick={() => deleteLog(log.id)}>삭제</button>
                      )}
                    </td>
                    </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 모니터링 담당자교육 (내용 고정, 참석자 1인당 사진 2장)
// ═══════════════════════════════════════════════════════════

const MONITORING_FIXED_CONTENT = `CCP-1P
1. CCP-1P 모니터링 방법
2. 상황별 개선조치 방법
 ① 기기고장인 경우
 ② 감도 저하 시
 ③ 제품에 혼입된 경우
3. 일지작성 방법

CCP-1B
1. CCP-1B 모니터링 방법
2. 상황별 개선조치 방법
 ① 가열 품온 온도·시간 이탈 시
 ② 기기고장인 경우
3. 일지작성 방법`;

type MAttendee = {
  employee_id: string; name: string; note: string; signed_at: string | null;
  photo1: File | null; photo1Preview: string | null;
  photo2: File | null; photo2Preview: string | null;
};
type MonitoringLog = {
  id: string; training_date: string; start_time: string | null; end_time: string | null;
  location: string | null; target: string | null; absentee_type: string | null; absentee_note: string | null;
  attachment_docs: string[] | null; educator_name: string | null;
  monitoring_training_attendees?: {
    id?: string; employee_id: string | null; name: string | null; note: string | null;
    photo_path_1: string | null; photo_path_2: string | null; signed_at: string | null;
  }[];
};

export function MonitoringTrainingTab({ role, userId, showToast }: {
  role: UserRole; userId: string | null;
  showToast: (msg: string, type?: "success" | "error") => void;
}) {
  const isAdminOrSubadmin = role === "ADMIN" || role === "SUBADMIN";
  const today = todayKST();

  const [employees, setEmployees] = useState<{ id: string; name: string; pin: string | null }[]>([]);

  const [logs, setLogs] = useState<MonitoringLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [rangeFrom, setRangeFrom] = useState(() => {
    const d = new Date(today + "T00:00:00+09:00");
    d.setMonth(d.getMonth() - 2);
    return d.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
  });
  const [rangeTo, setRangeTo] = useState(today);

  const [formOpen, setFormOpen] = useState(false);
  const [fDate, setFDate] = useState(today);
  const [fStart, setFStart] = useState("");
  const [fEnd, setFEnd] = useState("");
  const [fLocation, setFLocation] = useState("각 모니터링 장소");
  const [fTarget, setFTarget] = useState("각 모니터링 담당자 및 직원");
  const [fAbsentee, setFAbsentee] = useState("재교육");
  const [fAbsenteeNote, setFAbsenteeNote] = useState("");
  const [fAttachments, setFAttachments] = useState<string[]>([]);
  const [fAttachmentNote, setFAttachmentNote] = useState("");
  const [fEducator, setFEducator] = useState<{ id: string; name: string } | null>(null);
  const [fAttendees, setFAttendees] = useState<MAttendee[]>([]);
  const [saving, setSaving] = useState(false);

  const [showPinFor, setShowPinFor] = useState<"educator" | "attendee" | null>(null);
  const [photoSignedUrls, setPhotoSignedUrls] = useState<Record<string, string>>({});
  const [signingEmpId, setSigningEmpId] = useState<string | null>(null);
  const [signingPin, setSigningPin] = useState("");
  const [signingError, setSigningError] = useState("");

  useEffect(() => {
    supabase.from("employees").select("id,name,pin").is("resign_date", null).order("name")
      .then(({ data }) => setEmployees((data ?? []) as any));
  }, []);

  const loadLogs = useCallback(async () => {
    if (!rangeFrom || !rangeTo || rangeFrom > rangeTo) return;
    setLoading(true);
    const { data, error } = await supabase.from("monitoring_training_logs")
      .select("*, monitoring_training_attendees(*)")
      .gte("training_date", rangeFrom).lte("training_date", rangeTo)
      .order("training_date", { ascending: false });
    if (error) showToast("조회 실패: " + error.message, "error");
    setLogs((data ?? []) as any);
    setLoading(false);
  }, [rangeFrom, rangeTo, showToast]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  function resetForm() {
    setFDate(today); setFStart(""); setFEnd("");
    setFLocation("각 모니터링 장소"); setFTarget("각 모니터링 담당자 및 직원");
    setFAbsentee("재교육"); setFAbsenteeNote("");
    setFAttachments([]); setFAttachmentNote("");
    setFEducator(null); setFAttendees([]);
  }

  function openNewForm() { resetForm(); setFormOpen(true); }

  function toggleAttachment(opt: string) {
    setFAttachments((prev) => prev.includes(opt) ? prev.filter((o) => o !== opt) : [...prev, opt]);
  }

  function addAttendee(empId: string, empName: string) {
    if (fAttendees.some((a) => a.employee_id === empId)) {
      showToast("이미 추가된 참석자입니다.", "error");
      return;
    }
    setFAttendees((prev) => [...prev, {
      employee_id: empId, name: empName, note: "", signed_at: new Date().toISOString(),
      photo1: null, photo1Preview: null, photo2: null, photo2Preview: null,
    }]);
  }

  function removeAttendee(idx: number) {
    setFAttendees((prev) => prev.filter((_, i) => i !== idx));
  }

  function removeAttendeeById(empId: string) {
    setFAttendees((prev) => prev.filter((a) => a.employee_id !== empId));
  }

  function handleSigningDigit(emp: { id: string; name: string; pin: string | null }, d: string) {
    if (d === "⌫") { setSigningPin((p) => p.slice(0, -1)); setSigningError(""); return; }
    if (signingPin.length >= 4) return;
    const next = signingPin + d;
    setSigningPin(next);
    if (next.length === 4) {
      setTimeout(() => {
        if (!emp.pin) { setSigningError("PIN 미설정"); setSigningPin(""); return; }
        if (emp.pin !== next) { setSigningError("PIN 오류"); setSigningPin(""); return; }
        addAttendee(emp.id, emp.name);
        setSigningEmpId(null); setSigningPin(""); setSigningError("");
      }, 100);
    }
  }

  function setAttendeePhoto(idx: number, slot: 1 | 2, file: File | null) {
    setFAttendees((prev) => prev.map((a, i) => {
      if (i !== idx) return a;
      if (slot === 1) return { ...a, photo1: file, photo1Preview: file ? URL.createObjectURL(file) : null };
      return { ...a, photo2: file, photo2Preview: file ? URL.createObjectURL(file) : null };
    }));
  }

  async function uploadPhoto(file: File, dateStr: string, empId: string, slot: 1 | 2): Promise<string | null> {
    const ext = file.name.split(".").pop() || "jpg";
    const path = `monitoring/${dateStr}-${empId}-${slot}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("training-photos").upload(path, file);
    if (error) { showToast("사진 업로드 실패: " + error.message, "error"); return null; }
    return path;
  }

  async function saveLog() {
    const educator = employees.find((e) => e.name === "조대성");
    if (!fLocation.trim()) return showToast("장소를 입력하세요.", "error");
    if (fAttendees.length === 0) return showToast("참석자를 1명 이상 추가하세요.", "error");
    const missingPhoto = fAttendees.find((a) => !a.photo1 || !a.photo2);
    if (missingPhoto) return showToast(`${missingPhoto.name} 참석자의 사진 2장을 모두 첨부하세요.`, "error");

    setSaving(true);

    const attachmentDocs = fAttachments.length > 0
      ? (fAttachments.includes("기타")
          ? [...fAttachments.filter((a) => a !== "기타"), `기타(${fAttachmentNote.trim()})`]
          : fAttachments)
      : null;

    const { data: logData, error: logError } = await supabase.from("monitoring_training_logs").insert({
      training_date: fDate, start_time: fStart || null, end_time: fEnd || null,
      location: fLocation.trim(), target: fTarget.trim(),
      absentee_type: fAbsentee, absentee_note: fAbsentee === "기타" ? fAbsenteeNote.trim() : null,
      attachment_docs: attachmentDocs,
      educator_employee_id: educator?.id ?? null, educator_name: "조대성",
      created_by: userId,
    }).select().single();

    if (logError || !logData) { setSaving(false); return showToast("저장 실패: " + (logError?.message ?? ""), "error"); }

    const attendeeRows: any[] = [];
    for (const a of fAttendees) {
      const p1 = await uploadPhoto(a.photo1!, fDate, a.employee_id, 1);
      const p2 = await uploadPhoto(a.photo2!, fDate, a.employee_id, 2);
      if (!p1 || !p2) { setSaving(false); return; }
      attendeeRows.push({
        log_id: logData.id, employee_id: a.employee_id, name: a.name, note: a.note || null,
        photo_path_1: p1, photo_path_2: p2, signed_at: a.signed_at,
      });
    }

    const { error: attError } = await supabase.from("monitoring_training_attendees").insert(attendeeRows);
    setSaving(false);
    if (attError) return showToast("참석자 저장 실패: " + attError.message, "error");

    showToast("✅ 교육 기록 저장 완료!");
    setFormOpen(false);
    resetForm();
    loadLogs();
  }

  async function deleteLog(id: string) {
    if (!confirm("이 교육 기록을 삭제하시겠습니까? 참석자 명단도 함께 삭제됩니다.")) return;
    const { error } = await supabase.from("monitoring_training_logs").delete().eq("id", id);
    if (error) return showToast("삭제 실패: " + error.message, "error");
    showToast("🗑️ 삭제 완료!");
    loadLogs();
  }

  async function getSignedPhotoUrl(path: string): Promise<string | null> {
    if (photoSignedUrls[path]) return photoSignedUrls[path];
    const { data, error } = await supabase.storage.from("training-photos").createSignedUrl(path, 3600);
    if (error || !data) return null;
    setPhotoSignedUrls((prev) => ({ ...prev, [path]: data.signedUrl }));
    return data.signedUrl;
  }

  // ── 인쇄 ──
  async function buildLogHtml(log: MonitoringLog): Promise<string> {
    const tdS = `border:1px solid #000;padding:4px 6px;font-size:9pt;vertical-align:middle;`;
    const d = new Date(log.training_date + "T00:00:00+09:00");
    const days = ["일", "월", "화", "수", "목", "금", "토"];
    const dateLabel = `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
    const timeLabel = log.start_time && log.end_time ? `${log.start_time.slice(0, 5)} ~ ${log.end_time.slice(0, 5)}` : "";
    const attendees = log.monitoring_training_attendees ?? [];

    function signCell(name: string | null): string {
      if (!name) return "";
      const src = SIGN_MAP[name];
      return src
        ? `<img src="${src}" style="height:20px;object-fit:contain;display:block;margin:0 auto;" alt="${name}"/><div style="font-size:7pt;">${name}</div>`
        : `<div style="font-size:8pt;">${name}</div>`;
    }

    const absenteeChecks = ABSENTEE_OPTIONS.map((opt) => `${log.absentee_type === opt ? "☑" : "☐"}${opt}`).join("&nbsp;&nbsp;");
    const attachmentLabels = log.attachment_docs ?? [];
    const attachChecks = ATTACHMENT_OPTIONS.map((opt) => {
      const checked = attachmentLabels.some((a) => a === opt || a.startsWith("기타("));
      return `${checked ? "☑" : "☐"}${opt}`;
    }).join("&nbsp;&nbsp;");

    let attendeeRows = "";
    for (let i = 0; i < attendees.length; i += 6) {
      const chunk = attendees.slice(i, i + 6);
      attendeeRows += `<tr>`;
      for (const a of chunk) attendeeRows += `<td style="${tdS}text-align:center;height:40px;">${signCell(a.name)}</td>`;
      for (let j = chunk.length; j < 6; j++) attendeeRows += `<td style="${tdS}"></td>`;
      attendeeRows += `</tr>`;
    }
    if (attendees.length === 0) attendeeRows = `<tr>${Array.from({ length: 6 }).map(() => `<td style="${tdS}height:40px;"></td>`).join("")}</tr>`;

    let photoRows = "";
    for (const a of attendees) {
      const url1 = a.photo_path_1 ? await getSignedPhotoUrl(a.photo_path_1) : null;
      const url2 = a.photo_path_2 ? await getSignedPhotoUrl(a.photo_path_2) : null;
      photoRows += `<div style="display:inline-block;margin:4px 8px;text-align:center;">
        <div style="font-size:8pt;font-weight:bold;margin-bottom:3px;">${a.name ?? ""}</div>
        <div style="display:flex;gap:4px;">
          ${url1 ? `<img src="${url1}" style="width:110px;height:80px;object-fit:cover;border:1px solid #999;"/>` : ""}
          ${url2 ? `<img src="${url2}" style="width:110px;height:80px;object-fit:cover;border:1px solid #999;"/>` : ""}
        </div>
      </div>`;
    }

    return `<div style="page-break-after:always;">
      <table style="width:100%;border-collapse:collapse;margin-bottom:4px;"><tbody>
        <tr>
          <td rowspan="2" style="${tdS}font-size:13pt;font-weight:bold;text-align:center;padding:8px;">모니터링 담당자교육</td>
          <td rowspan="2" style="${tdS}width:28px;font-weight:bold;text-align:center;font-size:8pt;">결<br/>재<br/>란</td>
          <td style="${tdS}width:80px;text-align:center;font-weight:bold;">작성</td>
          <td style="${tdS}width:80px;text-align:center;font-weight:bold;">승인</td>
        </tr>
        <tr>
          <td style="${tdS}text-align:center;padding:3px;"><img src="/sign-kimyg.png" style="height:30px;object-fit:contain;display:block;margin:0 auto;" alt="김영각"/><div style="font-size:7pt;margin-top:2px;">김영각</div></td>
          <td style="${tdS}text-align:center;padding:3px;"><img src="/sign-chods.png" style="height:30px;object-fit:contain;display:block;margin:0 auto;" alt="조대성"/><div style="font-size:7pt;margin-top:2px;">조대성</div></td>
        </tr>
      </tbody></table>
      <table style="width:100%;border-collapse:collapse;margin-bottom:4px;"><tbody>
        <tr>
          <td style="${tdS}font-weight:bold;width:80px;">교육자</td><td style="${tdS}width:160px;">${log.educator_name ?? ""}</td>
          <td style="${tdS}font-weight:bold;width:60px;">장소</td><td style="${tdS}">${log.location ?? ""}</td>
        </tr>
        <tr>
          <td style="${tdS}font-weight:bold;">일 시</td><td style="${tdS}" colspan="3">${dateLabel} &nbsp; ${timeLabel}</td>
        </tr>
        <tr>
          <td style="${tdS}font-weight:bold;">대 상</td><td style="${tdS}">${log.target ?? ""}</td>
          <td style="${tdS}font-weight:bold;">불참자처리</td><td style="${tdS}font-size:8pt;">${absenteeChecks}${log.absentee_type === "기타" && log.absentee_note ? ` (${log.absentee_note})` : ""}</td>
        </tr>
      </tbody></table>
      <table style="width:100%;border-collapse:collapse;margin-bottom:4px;"><tbody>
        <tr><td style="${tdS}font-weight:bold;width:80px;vertical-align:top;">교육내용</td><td style="${tdS}white-space:pre-wrap;font-size:8pt;">${MONITORING_FIXED_CONTENT.replace(/\n/g, "<br/>")}</td></tr>
      </tbody></table>
      <table style="width:100%;border-collapse:collapse;margin-bottom:4px;"><tbody>
        <tr><td style="${tdS}font-weight:bold;text-align:center;" colspan="6">참석자 서명</td></tr>
        ${attendeeRows}
      </tbody></table>
      <table style="width:100%;border-collapse:collapse;margin-bottom:4px;"><tbody>
        <tr><td style="${tdS}font-weight:bold;">유첨서류</td><td style="${tdS}font-size:8pt;">${attachChecks}</td></tr>
      </tbody></table>
      ${photoRows ? `<div style="margin-top:6px;"><div style="font-size:8pt;font-weight:bold;margin-bottom:3px;">📷 참석자별 첨부사진</div>${photoRows}</div>` : ""}
    </div>`;
  }

  async function printSingle(log: MonitoringLog) {
    const html = await buildLogHtml(log);
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>모니터링교육_${log.training_date}</title>
      <style>@page{size:A4 portrait;margin:12mm 15mm;}body{margin:0;font-family:'Malgun Gothic','맑은 고딕',sans-serif;color:#000;}
      *{box-sizing:border-box;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;}
      table{border-collapse:collapse;}img{max-width:none;}</style></head><body>${html}</body></html>`);
    win.document.close(); win.focus();
    setTimeout(() => { win.print(); }, 400);
  }

  async function printRange() {
    if (logs.length === 0) return showToast("조회된 기록이 없습니다.", "error");
    const sorted = [...logs].sort((a, b) => a.training_date.localeCompare(b.training_date));
    const htmlParts: string[] = [];
    for (const log of sorted) htmlParts.push(await buildLogHtml(log));
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>모니터링교육_${rangeFrom}_${rangeTo}</title>
      <style>@page{size:A4 portrait;margin:12mm 15mm;}body{margin:0;font-family:'Malgun Gothic','맑은 고딕',sans-serif;color:#000;}
      *{box-sizing:border-box;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;}
      table{border-collapse:collapse;}img{max-width:none;}</style></head><body>${htmlParts.join("")}</body></html>`);
    win.document.close(); win.focus();
    setTimeout(() => { win.print(); }, 500);
  }

  return (
    <div className="space-y-4">
      {/* 조회 기간 + 인쇄 + 신규등록 */}
      <div className={`${card} p-3 flex flex-wrap items-center gap-3`}>
        <span className="text-sm font-semibold text-slate-600">조회 기간</span>
        <input type="date" className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:border-blue-400" value={rangeFrom} max={today} onChange={(e) => setRangeFrom(e.target.value)} />
        <span className="text-slate-400">~</span>
        <input type="date" className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:border-blue-400" value={rangeTo} max={today} onChange={(e) => setRangeTo(e.target.value)} />
        <button className={btn} onClick={loadLogs}>🔄 조회</button>
        <button className={btnSm} onClick={printRange}>🖨️ 기간 인쇄</button>
        <div className="flex-1" />
        <button className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700" onClick={openNewForm}>+ 새 교육 등록</button>
      </div>

      {/* 고정 교육내용 안내 */}
      <div className={`${card} p-4`}>
        <div className="mb-1 text-xs font-semibold text-slate-500">📚 교육내용 (매월 동일, 고정)</div>
        <div className="text-xs text-slate-500 whitespace-pre-wrap">{MONITORING_FIXED_CONTENT}</div>
      </div>

      {/* 등록 폼 */}
      {formOpen && (
        <div className={`${card} border-blue-200 p-4`}>
          <div className="mb-3 flex items-center justify-between">
            <span className="font-semibold text-sm">📝 새 교육 등록</span>
            <button className="text-xs text-slate-400 hover:text-slate-600" onClick={() => setFormOpen(false)}>✕ 닫기</button>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <div className="mb-1 text-xs text-slate-500">교육일자 *</div>
              <input type="date" className={inp} value={fDate} max={today} onChange={(e) => setFDate(e.target.value)} />
            </div>
            <div>
              <div className="mb-1 text-xs text-slate-500">장소 *</div>
              <input className={inp} value={fLocation} onChange={(e) => setFLocation(e.target.value)} placeholder="각 모니터링 장소" />
            </div>
            <div>
              <div className="mb-1 text-xs text-slate-500">시작시각</div>
              <input type="time" className={inp} value={fStart} onChange={(e) => setFStart(e.target.value)} />
            </div>
            <div>
              <div className="mb-1 text-xs text-slate-500">종료시각</div>
              <input type="time" className={inp} value={fEnd} onChange={(e) => setFEnd(e.target.value)} />
            </div>
            <div>
              <div className="mb-1 text-xs text-slate-500">대상</div>
              <input className={inp} value={fTarget} onChange={(e) => setFTarget(e.target.value)} placeholder="각 모니터링 담당자 및 직원" />
            </div>
            <div>
              <div className="mb-1 text-xs text-slate-500">불참자처리</div>
              <div className="flex gap-2">
                {ABSENTEE_OPTIONS.map((opt) => (
                  <button key={opt} type="button" className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium ${fAbsentee === opt ? "border-blue-400 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-500"}`} onClick={() => setFAbsentee(opt)}>{opt}</button>
                ))}
              </div>
              {fAbsentee === "기타" && (
                <input className={`${inp} mt-2`} value={fAbsenteeNote} onChange={(e) => setFAbsenteeNote(e.target.value)} placeholder="기타 내용" />
              )}
            </div>
          </div>

          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="mb-1 text-xs font-semibold text-slate-500">교육내용 (매월 동일, 고정 — 수정 불가)</div>
            <div className="text-xs text-slate-500 whitespace-pre-wrap">{MONITORING_FIXED_CONTENT}</div>
          </div>

          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="mb-1 text-xs font-semibold text-slate-500">교육자 (고정)</div>
            <div className="flex items-center gap-2">
              <img src="/sign-chods.png" style={{ height: 24, objectFit: "contain" }} alt="조대성" />
              <span className="text-sm font-semibold text-slate-700">조대성</span>
              <span className="text-xs text-green-600">✓ 고정</span>
            </div>
          </div>

          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="mb-2 text-xs font-semibold text-slate-500">참석자 서명 ({fAttendees.length}명 완료) — 각자 본인 PIN 입력 후 사진 2장 첨부</div>
            <div className="space-y-2">
              {employees.filter((e) => e.name !== "조대성").map((emp) => {
                const attendeeIdx = fAttendees.findIndex((a) => a.employee_id === emp.id);
                const signed = attendeeIdx >= 0;
                const isSigning = signingEmpId === emp.id;
                const attendee = signed ? fAttendees[attendeeIdx] : null;
                return (
                  <div key={emp.id} className={`rounded-xl border p-3 transition-all ${signed ? "border-blue-200 bg-blue-50" : "border-slate-200 bg-white"}`}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-700">{emp.name}</span>
                        {signed && SIGN_MAP[emp.name] && <img src={SIGN_MAP[emp.name]} style={{ height: 18, objectFit: "contain" }} alt={emp.name} />}
                        {signed && <span className="text-xs text-green-600">✓ 서명완료</span>}
                      </div>
                      {signed && <button className="text-[10px] text-slate-300 hover:text-red-400" onClick={() => removeAttendeeById(emp.id)}>✕ 취소</button>}
                    </div>
                    {!signed && !isSigning && (
                      <button className="w-full rounded-lg border border-slate-200 py-1.5 text-xs text-slate-500 hover:bg-slate-50 hover:border-blue-300 hover:text-blue-600 transition-all"
                        onClick={() => { setSigningEmpId(emp.id); setSigningPin(""); setSigningError(""); }}>
                        🔒 PIN 입력
                      </button>
                    )}
                    {!signed && isSigning && (
                      <div>
                        <div className="flex justify-center gap-1.5 mb-1.5">
                          {[0,1,2,3].map((i) => (
                            <div key={i} className={`w-5 h-5 rounded border-2 flex items-center justify-center text-[10px] font-bold transition-all ${signingPin.length > i ? "border-blue-500 bg-blue-500 text-white" : "border-slate-200 bg-white"}`}>
                              {signingPin.length > i ? "●" : ""}
                            </div>
                          ))}
                        </div>
                        {signingError && <div className="text-[10px] text-red-500 text-center mb-1">{signingError}</div>}
                        <div className="grid grid-cols-6 gap-0.5 mb-1">
                          {["1","2","3","4","5","6","7","8","9","","0","⌫"].map((d, i) => (
                            <button key={i} type="button"
                              className={`py-1.5 text-xs font-semibold rounded transition-all ${d === "" ? "invisible" : "bg-white border border-slate-200 hover:bg-slate-50 active:bg-slate-100"}`}
                              onClick={() => handleSigningDigit(emp, d)}>{d}</button>
                          ))}
                        </div>
                        <button className="w-full text-[10px] text-slate-400 hover:text-slate-600" onClick={() => { setSigningEmpId(null); setSigningPin(""); setSigningError(""); }}>취소</button>
                      </div>
                    )}
                    {signed && (
                      <div className="mt-2 flex flex-wrap gap-3">
                        <div>
                          <div className="mb-1 text-[11px] text-slate-400">사진 1 *</div>
                          <input type="file" accept="image/*" className="text-xs" onChange={(e) => setAttendeePhoto(attendeeIdx, 1, e.target.files?.[0] ?? null)} />
                          {attendee?.photo1Preview && <img src={attendee.photo1Preview} className="mt-1 h-20 w-28 rounded-lg border border-slate-200 object-cover" alt="사진1" />}
                        </div>
                        <div>
                          <div className="mb-1 text-[11px] text-slate-400">사진 2 *</div>
                          <input type="file" accept="image/*" className="text-xs" onChange={(e) => setAttendeePhoto(attendeeIdx, 2, e.target.files?.[0] ?? null)} />
                          {attendee?.photo2Preview && <img src={attendee.photo2Preview} className="mt-1 h-20 w-28 rounded-lg border border-slate-200 object-cover" alt="사진2" />}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-3">
            <div className="mb-1 text-xs text-slate-500">유첨서류</div>
            <div className="flex flex-wrap gap-3">
              {ATTACHMENT_OPTIONS.map((opt) => (
                <label key={opt} className="flex items-center gap-1.5 text-xs text-slate-600">
                  <input type="checkbox" checked={fAttachments.includes(opt)} onChange={() => toggleAttachment(opt)} />
                  {opt}
                </label>
              ))}
            </div>
            {fAttachments.includes("기타") && (
              <input className={`${inp} mt-2`} value={fAttachmentNote} onChange={(e) => setFAttachmentNote(e.target.value)} placeholder="기타 서류명" />
            )}
          </div>

          <div className="mt-4">
            <button className="w-full rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60" disabled={saving} onClick={saveLog}>
              {saving ? "저장 중..." : "💾 교육 기록 저장"}
            </button>
          </div>
        </div>
      )}

      {/* 목록 */}
      <div className={`${card} p-4`}>
        <div className="mb-3 font-semibold text-sm">📋 교육 기록 — {rangeFrom} ~ {rangeTo}</div>
        {loading ? (
          <div className="py-6 text-center text-sm text-slate-400">불러오는 중...</div>
        ) : logs.length === 0 ? (
          <div className="py-6 text-center text-sm text-slate-400">기록이 없습니다.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b-2 border-slate-200 bg-slate-50">
                  <th className="py-2 px-3 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">일자</th>
                  <th className="py-2 px-3 text-left text-xs font-semibold text-slate-500">장소</th>
                  <th className="py-2 px-3 text-left text-xs font-semibold text-slate-500">교육자</th>
                  <th className="py-2 px-3 text-center text-xs font-semibold text-slate-500 whitespace-nowrap">참석자</th>
                  <th className="py-2 px-3 text-center text-xs font-semibold text-slate-500 whitespace-nowrap">작업</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log, idx) => (
                  <tr key={log.id} className={`border-b border-slate-100 ${idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}`}>
                    <td className="py-2 px-3 whitespace-nowrap">{log.training_date}</td>
                    <td className="py-2 px-3">{log.location}</td>
                    <td className="py-2 px-3">{log.educator_name}</td>
                    <td className="py-2 px-3 text-center">{(log.monitoring_training_attendees ?? []).length}명</td>
                    <td className="py-2 px-3 text-center whitespace-nowrap">
                      <button className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-500 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600 mr-1" onClick={() => printSingle(log)}>인쇄</button>
                      {isAdminOrSubadmin && (
                        <button className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-400 hover:bg-red-50 hover:border-red-300 hover:text-red-500" onClick={() => deleteLog(log.id)}>삭제</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
