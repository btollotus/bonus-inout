"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

type LedgerDirection = "IN" | "OUT";
type LedgerMethod = "BANK" | "CARD" | "CASH" | "ETC";

type PartnerRow = {
  id: string;
  name: string;
  business_no: string | null;
};

type LedgerRow = {
  id: string;
  entry_date: string; // YYYY-MM-DD
  entry_ts: string;

  direction: LedgerDirection;
  amount: number;

  category: string;
  method: LedgerMethod;

  // 스냅샷(직접 입력)
  counterparty_name: string | null;
  business_no: string | null;

  // partner 연결/표시용
  partner_id: string | null;
  display_counterparty_name: string | null;
  display_business_no: string | null;

  summary: string | null;
  memo: string | null;

  status: string;
  tax_invoice_received?: boolean | null;
  payment_completed?: boolean | null;

  signed_amount: number;
  running_balance: number | null;

  created_at: string;
  updated_at: string;
};

function todayKST(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

function fmt(n: number | null | undefined) {
  if (n === null || n === undefined) return "";
  const v = typeof n === "number" ? n : Number(n);
  if (Number.isNaN(v)) return "";
  return v.toLocaleString("ko-KR");
}

function safeStr(s: string | null | undefined) {
  return (s ?? "").trim();
}

// localStorage keys
const LS_FAV = "ledger.partnerFavorites.v1";
const LS_RECENT = "ledger.partnerRecent.v1";

export default function LedgerClient() {
  const supabase = useMemo(() => createClient(), []);

  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // ===== 좌측 거래처 =====
  const [partners, setPartners] = useState<PartnerRow[]>([]);
  const [partnerTab, setPartnerTab] = useState<"FAV" | "RECENT" | "ALL">("FAV");
  const [partnerFilter, setPartnerFilter] = useState<string>(""); // 리스트 필터(입력 폼 자동완성 아님)
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(null);

  const selectedPartner = useMemo(() => {
    if (!selectedPartnerId) return null;
    return partners.find((p) => p.id === selectedPartnerId) ?? null;
  }, [partners, selectedPartnerId]);

  // ===== 입력 폼 =====
  const [entryDate, setEntryDate] = useState(todayKST());
  const [direction, setDirection] = useState<LedgerDirection>("IN");
  const [amount, setAmount] = useState<string>("0");
  const [method, setMethod] = useState<LedgerMethod>("BANK");
  const [category, setCategory] = useState<string>("매출입금");
  const [counterpartyName, setCounterpartyName] = useState<string>("");
  const [businessNo, setBusinessNo] = useState<string>("");
  const [summary, setSummary] = useState<string>("");
  const [memo, setMemo] = useState<string>("");

  // ===== 필터(장부 조회) =====
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  const [q, setQ] = useState<string>("");
  const [fDirection, setFDirection] = useState<"" | LedgerDirection>("");
  const [fMethod, setFMethod] = useState<"" | LedgerMethod>("");
  const [fCategory, setFCategory] = useState<string>("");

  // ===== 리스트 =====
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [limit, setLimit] = useState<number>(50);

  const categoryQuick = [
    "매출입금",
    "매입",
    "택배비",
    "급여",
    "카드수수료",
    "임대료",
    "공과금",
    "잡비",
  ];

  // ---------- localStorage helpers ----------
  const loadLocal = () => {
    try {
      const favRaw = localStorage.getItem(LS_FAV);
      const recRaw = localStorage.getItem(LS_RECENT);

      const favArr: string[] = favRaw ? JSON.parse(favRaw) : [];
      const recArr: string[] = recRaw ? JSON.parse(recRaw) : [];

      setFavoriteIds(new Set(Array.isArray(favArr) ? favArr : []));
      setRecentIds(Array.isArray(recArr) ? recArr : []);
    } catch {
      setFavoriteIds(new Set());
      setRecentIds([]);
    }
  };

  const saveFavorites = (setObj: Set<string>) => {
    const arr = Array.from(setObj);
    localStorage.setItem(LS_FAV, JSON.stringify(arr));
  };

  const pushRecent = (id: string) => {
    setRecentIds((prev) => {
      const next = [id, ...prev.filter((x) => x !== id)].slice(0, 30);
      localStorage.setItem(LS_RECENT, JSON.stringify(next));
      return next;
    });
  };

  // ---------- init ----------
  const loadPartners = async () => {
    const { data, error } = await supabase
      .from("partners")
      .select("id,name,business_no")
      .order("name", { ascending: true })
      .limit(1000);

    if (error) throw error;
    setPartners((data as PartnerRow[]) || []);
  };

  useEffect(() => {
    loadLocal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    (async () => {
      try {
        setBusy(true);
        await loadPartners();
      } catch (e: any) {
        setMsg(e?.message ?? "거래처 목록을 불러오지 못했습니다.");
      } finally {
        setBusy(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- partner select ----------
  const selectPartner = (p: PartnerRow) => {
    setSelectedPartnerId(p.id);
    pushRecent(p.id);

    // ✅ 입력 폼에 자동 채움(직접 타이핑 최소화)
    setCounterpartyName(p.name);
    setBusinessNo(p.business_no ?? "");

    setMsg(`거래처 선택: ${p.name}${p.business_no ? ` (${p.business_no})` : ""}`);
  };

  const toggleFavorite = (id: string) => {
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveFavorites(next);
      return next;
    });
  };

  // ---------- ledger load ----------
  const loadLedger = async () => {
    setBusy(true);
    setMsg(null);
    try {
      let qb = supabase
        .from("v_ledger_entries")
        .select("*")
        .order("entry_date", { ascending: false })
        .order("entry_ts", { ascending: false })
        .order("id", { ascending: false })
        .limit(limit);

      // ✅ 거래처 클릭 선택 필터
      if (selectedPartnerId) qb = qb.eq("partner_id", selectedPartnerId);

      if (fromDate) qb = qb.gte("entry_date", fromDate);
      if (toDate) qb = qb.lte("entry_date", toDate);
      if (fDirection) qb = qb.eq("direction", fDirection);
      if (fMethod) qb = qb.eq("method", fMethod);
      if (fCategory) qb = qb.ilike("category", `%${fCategory}%`);

      if (q) {
        const safe = q.replace(/,/g, " ").trim();
        qb = qb.or(
          [
            `display_counterparty_name.ilike.%${safe}%`,
            `display_business_no.ilike.%${safe}%`,
            `counterparty_name.ilike.%${safe}%`,
            `business_no.ilike.%${safe}%`,
            `summary.ilike.%${safe}%`,
            `memo.ilike.%${safe}%`,
          ].join(",")
        );
      }

      const { data, error } = await qb;
      if (error) throw error;
      setRows((data as LedgerRow[]) || []);
    } catch (e: any) {
      setMsg(e?.message ?? "장부를 불러오지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    loadLedger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limit, selectedPartnerId]);

  // ---------- form helpers ----------
  const resetForm = () => {
    setEntryDate(todayKST());
    setDirection("IN");
    setAmount("0");
    setMethod("BANK");
    setCategory("매출입금");

    // ✅ 거래처 선택되어 있으면 거래처는 유지
    if (selectedPartner) {
      setCounterpartyName(selectedPartner.name);
      setBusinessNo(selectedPartner.business_no ?? "");
    } else {
      setCounterpartyName("");
      setBusinessNo("");
    }

    setSummary("");
    setMemo("");
  };

  const copyFromRow = (r: LedgerRow) => {
    setEntryDate(r.entry_date);
    setDirection(r.direction);
    setAmount(String(r.amount ?? 0));
    setMethod(r.method);
    setCategory(r.category || "매출입금");

    setCounterpartyName(
      safeStr(r.display_counterparty_name) || safeStr(r.counterparty_name)
    );
    setBusinessNo(safeStr(r.display_business_no) || safeStr(r.business_no));

    setSummary(r.summary || "");
    setMemo(r.memo || "");
    setMsg("복사 완료: 상단 입력폼에 채워졌습니다.");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submit = async () => {
    setMsg(null);

    const amt = Number(String(amount).replace(/,/g, "").trim());
    if (!entryDate) return setMsg("거래일을 입력하세요.");
    if (!category.trim()) return setMsg("카테고리를 입력하세요. (기본: 매출입금)");
    if (!Number.isFinite(amt) || amt <= 0)
      return setMsg("금액은 0보다 큰 숫자여야 합니다.");

    setBusy(true);
    try {
      const payload: any = {
        entry_date: entryDate,
        direction,
        amount: Math.round(amt),
        category: category.trim(),
        method,
        summary: summary.trim() || null,
        memo: memo.trim() || null,
      };

      // ✅ 거래처 선택형: partner_id를 우선 저장
      if (selectedPartnerId) payload.partner_id = selectedPartnerId;

      // ✅ 스냅샷도 같이 저장
      payload.counterparty_name = counterpartyName.trim() || null;
      payload.business_no = businessNo.trim() || null;

      const { error } = await supabase.from("ledger_entries").insert(payload);
      if (error) throw error;

      setMsg("등록 완료!");
      resetForm();
      await loadLedger();
    } catch (e: any) {
      setMsg(e?.message ?? "등록에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const voidEntry = async (id: string) => {
    if (!confirm("이 항목을 VOID(취소) 처리할까요?")) return;

    setBusy(true);
    setMsg(null);
    try {
      const { error } = await supabase
        .from("ledger_entries")
        .update({ status: "VOID" })
        .eq("id", id);

      if (error) throw error;
      setMsg("VOID 처리 완료!");
      await loadLedger();
    } catch (e: any) {
      setMsg(e?.message ?? "VOID 처리에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const toggleTaxInvoiceReceived = async (r: LedgerRow) => {
    const next = !(r.tax_invoice_received ?? false);
    const { error } = await supabase
      .from("ledger_entries")
      .update({ tax_invoice_received: next })
      .eq("id", r.id);
    if (error) return setMsg(error.message);
    await loadLedger();
  };

  const togglePaymentCompleted = async (r: LedgerRow) => {
    const next = !(r.payment_completed ?? false);
    const { error } = await supabase
      .from("ledger_entries")
      .update({ payment_completed: next })
      .eq("id", r.id);
    if (error) return setMsg(error.message);
    await loadLedger();
  };

  // 합계(현재 rows)
  const sumIn = rows.reduce(
    (acc, r) => acc + (r.direction === "IN" ? Number(r.amount) : 0),
    0
  );
  const sumOut = rows.reduce(
    (acc, r) => acc + (r.direction === "OUT" ? Number(r.amount) : 0),
    0
  );
  const sumNet = sumIn - sumOut;

  // ---------- 좌측 리스트 만들기 ----------
  const partnerMap = useMemo(() => {
    const m = new Map<string, PartnerRow>();
    partners.forEach((p) => m.set(p.id, p));
    return m;
  }, [partners]);

  const favList = useMemo(() => {
    const arr = Array.from(favoriteIds)
      .map((id) => partnerMap.get(id))
      .filter(Boolean) as PartnerRow[];
    return arr.sort((a, b) => a.name.localeCompare(b.name, "ko"));
  }, [favoriteIds, partnerMap]);

  const recentList = useMemo(() => {
    return recentIds
      .map((id) => partnerMap.get(id))
      .filter(Boolean) as PartnerRow[];
  }, [recentIds, partnerMap]);

  const allListFiltered = useMemo(() => {
    const f = partnerFilter.trim();
    if (!f) return partners;
    return partners.filter((p) => {
      const hay = `${p.name} ${p.business_no ?? ""}`.toLowerCase();
      return hay.includes(f.toLowerCase());
    });
  }, [partners, partnerFilter]);

  const listToShow = useMemo(() => {
    if (partnerTab === "FAV") return favList;
    if (partnerTab === "RECENT") return recentList;
    return allListFiltered;
  }, [partnerTab, favList, recentList, allListFiltered]);

  // ---------- UI ----------
  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", padding: 16 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <h1 style={{ fontSize: 28, fontWeight: 900, marginBottom: 12 }}>
          경리장부
        </h1>
        <a href="/" style={topLinkBtn}>
          홈
        </a>
      </div>

      {msg && <div style={msgBox}>{msg}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 12 }}>
        {/* ================= 좌측: 거래처 ================= */}
        <aside style={panel}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 800 }}>거래처</div>
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                try {
                  setBusy(true);
                  await loadPartners();
                  setMsg("거래처 목록 새로고침 완료");
                } catch (e: any) {
                  setMsg(e?.message ?? "거래처 새로고침 실패");
                } finally {
                  setBusy(false);
                }
              }}
              style={miniBtn}
              title="거래처 목록 새로고침"
            >
              새로고침
            </button>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button
              type="button"
              onClick={() => setPartnerTab("FAV")}
              style={{ ...tabBtn, ...(partnerTab === "FAV" ? tabBtnOn : {}) }}
            >
              ⭐ 즐겨찾기
            </button>
            <button
              type="button"
              onClick={() => setPartnerTab("RECENT")}
              style={{ ...tabBtn, ...(partnerTab === "RECENT" ? tabBtnOn : {}) }}
            >
              🕘 최근
            </button>
            <button
              type="button"
              onClick={() => setPartnerTab("ALL")}
              style={{ ...tabBtn, ...(partnerTab === "ALL" ? tabBtnOn : {}) }}
            >
              📁 전체
            </button>
          </div>

          {partnerTab === "ALL" && (
            <div style={{ marginTop: 10 }}>
              <label style={label}>목록 필터(이름/사업자번호)</label>
              <input
                value={partnerFilter}
                onChange={(e) => setPartnerFilter(e.target.value)}
                placeholder="예: 아라한 / 123-45"
                style={inputStyle}
              />
              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
                ※ 입력폼 자동완성이 아니라 “리스트만” 좁히는 필터입니다.
              </div>
            </div>
          )}

          <div style={{ marginTop: 12, borderTop: "1px solid rgba(255,255,255,0.10)" }} />

          {/* 선택 상태 */}
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 13, opacity: 0.8 }}>선택된 거래처</div>
            <div
              style={{
                marginTop: 6,
                display: "flex",
                alignItems: "center",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <div style={selectedBadge}>
                {selectedPartner ? (
                  <>
                    <div style={{ fontWeight: 900 }}>{selectedPartner.name}</div>
                    <div style={{ fontSize: 12, opacity: 0.8 }}>
                      {selectedPartner.business_no ?? "(사업자번호 없음)"}
                    </div>
                  </>
                ) : (
                  <div style={{ opacity: 0.8 }}>선택 없음</div>
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  setSelectedPartnerId(null);
                  setMsg("거래처 선택 해제");
                }}
                style={miniBtn}
              >
                선택 해제
              </button>
            </div>
          </div>

          <div style={{ marginTop: 12, borderTop: "1px solid rgba(255,255,255,0.10)" }} />

          {/* 리스트 */}
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 8 }}>
              {partnerTab === "FAV"
                ? "즐겨찾기"
                : partnerTab === "RECENT"
                ? "최근 사용"
                : "전체"}{" "}
              ({listToShow.length})
            </div>

            <div
              style={{
                maxHeight: 520,
                overflowY: "auto",
                borderWidth: 1,
                borderStyle: "solid",
                borderColor: "rgba(255,255,255,0.10)",
                borderRadius: 12,
              }}
            >
              {listToShow.length === 0 ? (
                <div style={{ padding: 12, opacity: 0.7 }}>
                  {partnerTab === "FAV"
                    ? "즐겨찾기가 없습니다. 전체 탭에서 ⭐를 눌러 추가하세요."
                    : partnerTab === "RECENT"
                    ? "최근 사용 거래처가 없습니다."
                    : "검색 결과가 없습니다."}
                </div>
              ) : (
                listToShow.map((p) => {
                  const isSel = p.id === selectedPartnerId;
                  const isFav = favoriteIds.has(p.id);
                  return (
                    <div
                      key={p.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "10px 10px",
                        borderTop: "1px solid rgba(255,255,255,0.06)",
                        background: isSel ? "rgba(255,255,255,0.06)" : "transparent",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => selectPartner(p)}
                        style={{
                          flex: 1,
                          textAlign: "left",
                          cursor: "pointer",
                          background: "transparent",
                          border: "none",
                          color: "inherit",
                          padding: 0,
                        }}
                      >
                        <div style={{ fontWeight: 850, fontSize: 14, lineHeight: 1.2 }}>
                          {p.name}
                        </div>
                        <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
                          {p.business_no ?? "(사업자번호 없음)"}
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => toggleFavorite(p.id)}
                        style={{
                          ...miniBtn,
                          padding: "6px 8px",
                          // ✅ 여기서도 borderColor만 바뀌게(축약 border 금지)
                          borderColor: isFav
                            ? "rgba(255,255,255,0.55)"
                            : "rgba(255,255,255,0.18)",
                          background: isFav ? "rgba(255,255,255,0.08)" : "transparent",
                        }}
                        title={isFav ? "즐겨찾기 해제" : "즐겨찾기 추가"}
                      >
                        {isFav ? "★" : "☆"}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </aside>

        {/* ================= 우측: 장부 ================= */}
        <section>
          {/* 입력 폼 */}
          <div style={panel}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <h2 style={{ fontSize: 18, fontWeight: 900, margin: 0 }}>장부 입력</h2>
              <div style={{ fontSize: 13, opacity: 0.75 }}>거래처는 왼쪽에서 클릭 선택(추천)</div>
            </div>

            <div
              style={{
                marginTop: 12,
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
              }}
            >
              <div>
                <label style={label}>거래일(YYYY-MM-DD)</label>
                <input
                  type="date"
                  value={entryDate}
                  onChange={(e) => setEntryDate(e.target.value)}
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={label}>방향</label>
                <select
                  value={direction}
                  onChange={(e) => setDirection(e.target.value as LedgerDirection)}
                  style={inputStyle}
                >
                  <option value="IN">IN (입금)</option>
                  <option value="OUT">OUT (출금)</option>
                </select>
              </div>

              <div>
                <label style={label}>금액(원, 항상 양수)</label>
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  inputMode="numeric"
                  placeholder="예: 25000"
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={label}>결제수단</label>
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value as LedgerMethod)}
                  style={inputStyle}
                >
                  <option value="BANK">BANK (계좌)</option>
                  <option value="CARD">CARD (카드)</option>
                  <option value="CASH">CASH (현금)</option>
                  <option value="ETC">ETC (기타)</option>
                </select>
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <label style={label}>카테고리</label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                  {categoryQuick.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCategory(c)}
                      style={{
                        ...chipStyle,
                        // ✅ chipStyle도 borderColor만 바뀌게
                        borderColor: category === c ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.18)",
                        background: category === c ? "rgba(255,255,255,0.08)" : "transparent",
                      }}
                    >
                      {c}
                    </button>
                  ))}
                </div>
                <input
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder='예: "매출입금"'
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={label}>거래처명</label>
                <input
                  value={counterpartyName}
                  onChange={(e) => setCounterpartyName(e.target.value)}
                  placeholder="왼쪽에서 클릭 선택 추천"
                  style={{
                    ...inputStyle,
                    // ✅ borderColor에 border 문자열 넣지 말기
                    borderColor: selectedPartnerId
                      ? "rgba(120,200,255,0.40)"
                      : "rgba(255,255,255,0.18)",
                  }}
                />
              </div>

              <div>
                <label style={label}>사업자번호(선택)</label>
                <input
                  value={businessNo}
                  onChange={(e) => setBusinessNo(e.target.value)}
                  placeholder="왼쪽에서 클릭 선택 추천"
                  style={{
                    ...inputStyle,
                    borderColor: selectedPartnerId
                      ? "rgba(120,200,255,0.40)"
                      : "rgba(255,255,255,0.18)",
                  }}
                />
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <label style={label}>요약</label>
                <input
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  placeholder='예: "아라한 대곡초 온셋 주문"'
                  style={inputStyle}
                />
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <label style={label}>메모(선택)</label>
                <textarea
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  placeholder="추가 메모"
                  style={{ ...inputStyle, height: 90, paddingTop: 10 }}
                />
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
              <button disabled={busy} onClick={submit} style={primaryBtn}>
                {busy ? "처리중..." : "등록"}
              </button>
              <button disabled={busy} onClick={resetForm} style={secondaryBtn}>
                초기화
              </button>
            </div>
          </div>

          {/* 조회 필터 */}
          <div style={{ ...panel, marginTop: 12 }}>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <h2 style={{ fontSize: 18, fontWeight: 900, margin: 0 }}>조회 필터</h2>
              <div style={{ fontSize: 13, opacity: 0.75 }}>
                현재 거래처 필터: {selectedPartner ? selectedPartner.name : "(없음)"}
              </div>
            </div>

            <div
              style={{
                marginTop: 12,
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr 1fr",
                gap: 10,
              }}
            >
              <div>
                <label style={label}>From</label>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={label}>To</label>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={label}>방향</label>
                <select
                  value={fDirection}
                  onChange={(e) => setFDirection(e.target.value as any)}
                  style={inputStyle}
                >
                  <option value="">(전체)</option>
                  <option value="IN">IN</option>
                  <option value="OUT">OUT</option>
                </select>
              </div>

              <div>
                <label style={label}>결제수단</label>
                <select
                  value={fMethod}
                  onChange={(e) => setFMethod(e.target.value as any)}
                  style={inputStyle}
                >
                  <option value="">(전체)</option>
                  <option value="BANK">BANK</option>
                  <option value="CARD">CARD</option>
                  <option value="CASH">CASH</option>
                  <option value="ETC">ETC</option>
                </select>
              </div>

              <div>
                <label style={label}>카테고리(부분검색)</label>
                <input
                  value={fCategory}
                  onChange={(e) => setFCategory(e.target.value)}
                  placeholder="예: 택배"
                  style={inputStyle}
                />
              </div>

              <div style={{ gridColumn: "2 / -1" }}>
                <label style={label}>검색(거래처/요약/메모/사업자번호)</label>
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="예: 아라한, 123-45..."
                  style={inputStyle}
                />
              </div>
            </div>

            <div
              style={{
                display: "flex",
                gap: 10,
                marginTop: 12,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <button disabled={busy} onClick={loadLedger} style={primaryBtn}>
                {busy ? "조회중..." : "조회"}
              </button>

              <button
                disabled={busy}
                onClick={() => {
                  setFromDate("");
                  setToDate("");
                  setQ("");
                  setFDirection("");
                  setFMethod("");
                  setFCategory("");
                  setLimit(50);
                  setMsg(null);
                  loadLedger();
                }}
                style={secondaryBtn}
              >
                필터 초기화
              </button>

              <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 13, opacity: 0.8 }}>표시개수</span>
                <select
                  value={limit}
                  onChange={(e) => setLimit(Number(e.target.value))}
                  style={{ ...inputStyle, width: 120 }}
                >
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={200}>200</option>
                </select>
              </div>
            </div>
          </div>

          {/* 요약 */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 12 }}>
            <div style={statBox}>
              <div style={statLabel}>입금합</div>
              <div style={statValue}>{fmt(sumIn)}원</div>
            </div>
            <div style={statBox}>
              <div style={statLabel}>출금합</div>
              <div style={statValue}>{fmt(sumOut)}원</div>
            </div>
            <div style={statBox}>
              <div style={statLabel}>순증감(입-출)</div>
              <div style={statValue}>{fmt(sumNet)}원</div>
            </div>
          </div>

          {/* 장부 목록 */}
          <div style={{ ...panel, marginTop: 12, overflow: "hidden" }}>
            <div style={{ paddingBottom: 10 }}>
              <h2 style={{ fontSize: 18, fontWeight: 900, margin: 0 }}>장부 목록</h2>
              <div style={{ fontSize: 13, opacity: 0.75, marginTop: 6 }}>
                OUT은 입력은 양수 / 계산에서만 마이너스 처리됩니다.
              </div>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ textAlign: "left", fontSize: 13, opacity: 0.85 }}>
                    <th style={th}>날짜</th>
                    <th style={th}>거래처</th>
                    <th style={th}>카테고리</th>
                    <th style={th}>요약</th>
                    <th style={th}>방법</th>
                    <th style={{ ...th, textAlign: "right" }}>입금</th>
                    <th style={{ ...th, textAlign: "right" }}>출금</th>
                    <th style={{ ...th, textAlign: "right" }}>잔액(러닝)</th>
                    <th style={th}>액션</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={9} style={{ padding: 16, opacity: 0.7 }}>
                        데이터가 없습니다.
                      </td>
                    </tr>
                  ) : (
                    rows.map((r) => (
                      <tr key={r.id} style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                        <td style={td}>{r.entry_date}</td>
                        <td style={td}>{r.display_counterparty_name ?? r.counterparty_name ?? "-"}</td>
                        <td style={td}>{r.category}</td>
                        <td style={td}>{r.summary ?? "-"}</td>
                        <td style={td}>{r.method}</td>
                        <td style={{ ...td, textAlign: "right" }}>{r.direction === "IN" ? fmt(r.amount) : ""}</td>
                        <td style={{ ...td, textAlign: "right" }}>{r.direction === "OUT" ? fmt(r.amount) : ""}</td>
                        <td style={{ ...td, textAlign: "right", opacity: 0.95 }}>{fmt(r.running_balance)}</td>
                        

<td style={td}>
  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
    <button type="button" onClick={() => copyFromRow(r)} style={miniBtn}>
      복사
    </button>
    <button type="button" onClick={() => voidEntry(r.id)} style={miniDangerBtn}>
      VOID
    </button>
    {r.direction === "OUT" ? (
      <>
        <button
          type="button"
          onClick={() => toggleTaxInvoiceReceived(r)}
          style={{
            ...miniBtn,
            borderColor: r.tax_invoice_received ? "rgba(100,200,100,0.6)" : "rgba(255,160,50,0.6)",
            background: r.tax_invoice_received ? "rgba(100,200,100,0.08)" : "transparent",
            color: r.tax_invoice_received ? "#4ade80" : "#fb923c",
          }}
        >
          {r.tax_invoice_received ? "✅ 계산서수령" : "☐ 계산서미수령"}
        </button>
        <button
          type="button"
          onClick={() => togglePaymentCompleted(r)}
          style={{
            ...miniBtn,
            borderColor: r.payment_completed ? "rgba(100,200,100,0.6)" : "rgba(255,160,50,0.6)",
            background: r.payment_completed ? "rgba(100,200,100,0.08)" : "transparent",
            color: r.payment_completed ? "#4ade80" : "#fb923c",
          }}
        >
          {r.payment_completed ? "✅ 결제완료" : "☐ 결제미완료"}
        </button>
      </>
    ) : null}
  </div>
</td>

                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ height: 24 }} />
        </section>
      </div>
    </div>
  );
}

/* ================= 스타일 ================= */

const msgBox: React.CSSProperties = {
  marginBottom: 12,
  padding: "10px 12px",
  borderRadius: 10,
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: "rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.04)",
  fontSize: 14,
  whiteSpace: "pre-wrap",
};

const panel: React.CSSProperties = {
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: "rgba(255,255,255,0.12)",
  borderRadius: 14,
  padding: 16,
  background: "rgba(255,255,255,0.02)",
};

const label: React.CSSProperties = { fontSize: 13, opacity: 0.8 };

const inputStyle: React.CSSProperties = {
  width: "100%",
  marginTop: 6,
  padding: "10px 12px",
  borderRadius: 12,
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: "rgba(255,255,255,0.18)",
  background: "rgba(255,255,255,0.04)",
  color: "inherit",
  outline: "none",
};

const primaryBtn: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 12,
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: "rgba(255,255,255,0.20)",
  background: "rgba(255,255,255,0.10)",
  color: "inherit",
  cursor: "pointer",
  fontWeight: 800,
};

const secondaryBtn: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 12,
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: "rgba(255,255,255,0.18)",
  background: "transparent",
  color: "inherit",
  cursor: "pointer",
  fontWeight: 700,
};

const miniBtn: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 10,
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: "rgba(255,255,255,0.18)",
  background: "transparent",
  color: "inherit",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 700,
};

const miniDangerBtn: React.CSSProperties = {
  ...miniBtn,
  borderColor: "rgba(255,120,120,0.45)",
};

const chipStyle: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 999,
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: "rgba(255,255,255,0.18)",
  background: "transparent",
  color: "inherit",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 700,
};

const th: React.CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid rgba(255,255,255,0.10)", // 여기만 table이라 문제 없음(동적 변경 없음)
  background: "rgba(255,255,255,0.03)",
  whiteSpace: "nowrap",
};

const td: React.CSSProperties = {
  padding: "10px 12px",
  fontSize: 14,
  whiteSpace: "nowrap",
  verticalAlign: "top",
};

const statBox: React.CSSProperties = {
  flex: "0 0 auto",
  minWidth: 200,
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: "rgba(255,255,255,0.12)",
  borderRadius: 14,
  padding: 12,
  background: "rgba(255,255,255,0.03)",
};

const statLabel: React.CSSProperties = { fontSize: 13, opacity: 0.75 };
const statValue: React.CSSProperties = { fontSize: 18, fontWeight: 900, marginTop: 6 };

const tabBtn: React.CSSProperties = {
  flex: 1,
  padding: "8px 10px",
  borderRadius: 12,
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: "rgba(255,255,255,0.18)",
  background: "transparent",
  color: "inherit",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 800,
};

const tabBtnOn: React.CSSProperties = {
  borderColor: "rgba(255,255,255,0.55)",
  background: "rgba(255,255,255,0.08)",
};

const selectedBadge: React.CSSProperties = {
  flex: 1,
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: "rgba(255,255,255,0.14)",
  borderRadius: 12,
  padding: "10px 12px",
  background: "rgba(255,255,255,0.04)",
};

const topLinkBtn: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 12,
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: "rgba(255,255,255,0.18)",
  background: "transparent",
  color: "inherit",
  cursor: "pointer",
  textDecoration: "none",
  fontWeight: 800,
};