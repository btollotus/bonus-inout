"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

type PartnerRow = {
  id: string;
  name: string;
  business_no: string | null;
};

type OrderRow = {
  id: string;
  customer_name: string | null;
  title: string | null;
  ship_date: string | null; // YYYY-MM-DD
  ship_method: string | null;
  status: string | null;
  total_amount: number | null;
  created_at: string;
};

function todayKST(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

const LS_FAV = "orders.partnerFavorites.v1";
const LS_RECENT = "orders.partnerRecent.v1";

export default function OrdersClient() {
  const supabase = useMemo(() => createClient(), []);

  const [msg, setMsg] = useState<string | null>("왼쪽에서 거래처를 먼저 선택하세요.");
  const [busy, setBusy] = useState(false);

  // ===== 거래처(좌측) =====
  const [partners, setPartners] = useState<PartnerRow[]>([]);
  const [tab, setTab] = useState<"FAV" | "RECENT" | "ALL">("ALL");
  const [filter, setFilter] = useState("");

  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(null);

  const selectedPartner = useMemo(() => {
    if (!selectedPartnerId) return null;
    return partners.find((p) => p.id === selectedPartnerId) ?? null;
  }, [partners, selectedPartnerId]);

  // ===== 주문(우측) =====
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [limit, setLimit] = useState(50);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  // ===== 신규 주문(초안) =====
  const [shipDate, setShipDate] = useState(todayKST());
  const [shipMethod, setShipMethod] = useState<string>("택배");
  const [title, setTitle] = useState<string>(""); // 메모 대신 title 사용
  const [totalAmount, setTotalAmount] = useState<string>("0");

  // localStorage
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
    localStorage.setItem(LS_FAV, JSON.stringify(Array.from(setObj)));
  };

  const pushRecent = (id: string) => {
    setRecentIds((prev) => {
      const next = [id, ...prev.filter((x) => x !== id)].slice(0, 30);
      localStorage.setItem(LS_RECENT, JSON.stringify(next));
      return next;
    });
  };

  // DB load
  const loadPartners = async () => {
    const { data, error } = await supabase
      .from("partners")
      .select("id,name,business_no")
      .order("name", { ascending: true })
      .limit(5000);

    if (error) throw error;
    setPartners((data as PartnerRow[]) || []);
  };

  const loadOrders = async () => {
    setBusy(true);
    setMsg(null);
    try {
      let qb = supabase
        .from("orders")
        .select("id, customer_name, title, ship_date, ship_method, status, total_amount, created_at")
        .order("ship_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(limit);

      // 거래처 선택 시: customer_name으로 필터 (현재 구조에 맞춤)
      if (selectedPartner?.name) qb = qb.eq("customer_name", selectedPartner.name);

      if (fromDate) qb = qb.gte("ship_date", fromDate);
      if (toDate) qb = qb.lte("ship_date", toDate);

      const { data, error } = await qb;
      if (error) throw error;

      setOrders((data as OrderRow[]) || []);
    } catch (e: any) {
      setMsg(e?.message ?? "주문 목록을 불러오지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    loadLocal();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        setBusy(true);
        await loadPartners();
        setMsg("거래처를 선택한 뒤 주문을 생성하세요.");
      } catch (e: any) {
        setMsg(e?.message ?? "거래처 목록을 불러오지 못했습니다.");
      } finally {
        setBusy(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPartnerId, limit]);

  // 좌측 리스트 계산
  const partnerMap = useMemo(() => {
    const m = new Map<string, PartnerRow>();
    partners.forEach((p) => m.set(p.id, p));
    return m;
  }, [partners]);

  const toggleFavorite = (id: string) => {
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveFavorites(next);
      return next;
    });
  };

  const favList = useMemo(() => {
    const arr = Array.from(favoriteIds)
      .map((id) => partnerMap.get(id))
      .filter(Boolean) as PartnerRow[];
    return arr.sort((a, b) => a.name.localeCompare(b.name, "ko"));
  }, [favoriteIds, partnerMap]);

  const recentList = useMemo(() => {
    return recentIds.map((id) => partnerMap.get(id)).filter(Boolean) as PartnerRow[];
  }, [recentIds, partnerMap]);

  const allListFiltered = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return partners;
    return partners.filter((p) => {
      const hay = `${p.name} ${p.business_no ?? ""}`.toLowerCase();
      return hay.includes(f);
    });
  }, [partners, filter]);

  const listToShow = useMemo(() => {
    if (tab === "FAV") return favList;
    if (tab === "RECENT") return recentList;
    return allListFiltered;
  }, [tab, favList, recentList, allListFiltered]);

  const selectPartner = (p: PartnerRow) => {
    setSelectedPartnerId(p.id);
    pushRecent(p.id);
    // 거래처 선택하면 title도 기본값 살짝 만들어주기(원하면 삭제 가능)
    setMsg(`거래처 선택됨: ${p.name}${p.business_no ? ` (${p.business_no})` : ""}`);
  };

  // actions
  const createOrder = async () => {
    if (!selectedPartner?.name) {
      setMsg("거래처가 선택되지 않았습니다. 왼쪽에서 거래처를 클릭하세요.");
      return;
    }
    if (!shipDate) {
      setMsg("출고일(=주문일)을 입력하세요.");
      return;
    }

    const amt = Number(String(totalAmount).replace(/,/g, "").trim());
    if (!Number.isFinite(amt) || amt < 0) {
      setMsg("총액은 0 이상의 숫자여야 합니다.");
      return;
    }

    setBusy(true);
    setMsg(null);
    try {
      const payload = {
        customer_name: selectedPartner.name,
        title: title.trim() || null,
        ship_date: shipDate,
        ship_method: shipMethod,
        status: "DRAFT",
        total_amount: Math.round(amt),
      };

      const { error } = await supabase.from("orders").insert(payload);
      if (error) throw error;

      setMsg("✅ 주문 생성 완료!");
      setTitle("");
      setTotalAmount("0");
      await loadOrders();
    } catch (e: any) {
      setMsg(e?.message ?? "주문 생성 실패");
    } finally {
      setBusy(false);
    }
  };

  const copyOrder = async (orderId: string) => {
    if (!confirm("이 주문을 복사해서 새 주문을 만들까요?")) return;

    setBusy(true);
    setMsg(null);
    try {
      const { data, error } = await supabase.rpc("rpc_copy_order", {
        p_order_id: orderId,
        p_new_ship_date: todayKST(),
      });
      if (error) throw error;

      setMsg(`✅ 주문 복사 완료! 새 주문 ID: ${data}`);
      await loadOrders();
    } catch (e: any) {
      setMsg(e?.message ?? "주문 복사 실패 (rpc_copy_order 함수는 다음 단계에서 붙입니다)");
    } finally {
      setBusy(false);
    }
  };

  const canCreate = !!selectedPartner?.name && !busy;

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <h1 style={{ fontSize: 28, fontWeight: 900 }}>주문/출고</h1>
        <a href="/" style={topLinkBtn}>홈</a>
      </div>

      {msg && <div style={msgBox}>{msg}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 12 }}>
        {/* 좌측 */}
        <aside style={panel}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 16, fontWeight: 900 }}>거래처</div>
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
            >
              새로고침
            </button>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button type="button" onClick={() => setTab("FAV")} style={tab === "FAV" ? tabBtnOn : tabBtn}>
              ⭐ 즐겨찾기
            </button>
            <button type="button" onClick={() => setTab("RECENT")} style={tab === "RECENT" ? tabBtnOn : tabBtn}>
              🕘 최근
            </button>
            <button type="button" onClick={() => setTab("ALL")} style={tab === "ALL" ? tabBtnOn : tabBtn}>
              📁 전체
            </button>
          </div>

          {tab === "ALL" && (
            <div style={{ marginTop: 10 }}>
              <label style={label}>목록 필터(이름/사업자번호)</label>
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="예: 아라한 / 123-45"
                style={inputStyle}
              />
              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
                ※ 자동완성 아님. 리스트만 좁혀서 클릭 선택합니다.
              </div>
            </div>
          )}

          <div style={{ marginTop: 12, borderTop: "1px solid rgba(255,255,255,0.10)" }} />

          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 13, opacity: 0.8 }}>선택된 거래처</div>
            <div style={{ marginTop: 6, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <div style={selectedBadge}>
                {selectedPartner ? (
                  <>
                    <div style={{ fontWeight: 900 }}>{selectedPartner.name}</div>
                    <div style={{ fontSize: 12, opacity: 0.8 }}>{selectedPartner.business_no ?? "(사업자번호 없음)"}</div>
                  </>
                ) : (
                  <div style={{ opacity: 0.8 }}>선택 없음</div>
                )}
              </div>
              <button type="button" style={miniBtn} onClick={() => setSelectedPartnerId(null)}>
                선택 해제
              </button>
            </div>
          </div>

          <div style={{ marginTop: 12, borderTop: "1px solid rgba(255,255,255,0.10)" }} />

          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 8 }}>
              {tab === "FAV" ? "즐겨찾기" : tab === "RECENT" ? "최근 사용" : "전체"} ({listToShow.length})
            </div>

            <div style={{ maxHeight: 560, overflowY: "auto", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 12 }}>
              {listToShow.length === 0 ? (
                <div style={{ padding: 12, opacity: 0.7 }}>
                  {tab === "FAV"
                    ? "즐겨찾기가 없습니다. 전체 탭에서 ☆를 눌러 추가하세요."
                    : tab === "RECENT"
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
                        <div style={{ fontWeight: 900, fontSize: 14, lineHeight: 1.2 }}>{p.name}</div>
                        <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
                          {p.business_no ?? "(사업자번호 없음)"}
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => toggleFavorite(p.id)}
                        style={isFav ? favBtnOn : favBtnOff}
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

        {/* 우측 */}
        <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={panel}>
            <h2 style={{ fontSize: 18, fontWeight: 900, margin: 0 }}>신규 주문(초안)</h2>
            <div style={{ fontSize: 13, opacity: 0.75, marginTop: 6 }}>
              왼쪽에서 거래처 클릭 → 출고일/메모/총액 입력 → “주문 생성”
            </div>

            {!selectedPartnerId && (
              <div style={{ marginTop: 10, padding: 10, borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)" }}>
                ⚠️ 거래처가 선택되지 않았습니다. 왼쪽 리스트에서 거래처를 클릭하세요.
              </div>
            )}

            <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label style={label}>출고일(=주문일)</label>
                <input type="date" value={shipDate} onChange={(e) => setShipDate(e.target.value)} style={inputStyle} />
              </div>

              <div>
                <label style={label}>출고방법</label>
                <select value={shipMethod} onChange={(e) => setShipMethod(e.target.value)} style={inputStyle}>
                  <option value="택배">택배</option>
                  <option value="방문">방문</option>
                  <option value="퀵">퀵</option>
                  <option value="기타">기타</option>
                </select>
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <label style={label}>메모(=title)</label>
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder='예: "2월 정기 주문"' style={inputStyle} />
              </div>

              <div>
                <label style={label}>총액(원)</label>
                <input
                  value={totalAmount}
                  onChange={(e) => setTotalAmount(e.target.value)}
                  inputMode="numeric"
                  placeholder="예: 25000"
                  style={inputStyle}
                />
              </div>

              <div style={{ display: "flex", alignItems: "flex-end" }}>
                <button disabled={!canCreate} onClick={createOrder} style={!canCreate ? disabledBtn : primaryBtn}>
                  {busy ? "처리중..." : "주문 생성"}
                </button>
              </div>
            </div>
          </div>

          <div style={panel}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
              <h2 style={{ fontSize: 18, fontWeight: 900, margin: 0 }}>주문 목록</h2>
              <div style={{ fontSize: 13, opacity: 0.75 }}>
                거래처 필터: {selectedPartner ? selectedPartner.name : "(전체)"}
              </div>
            </div>

            <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr 140px", gap: 10 }}>
              <div>
                <label style={label}>From</label>
                <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={label}>To</label>
                <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={label}>표시개수</label>
                <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} style={{ ...inputStyle, width: "100%" }}>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={200}>200</option>
                </select>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
              <button disabled={busy} onClick={loadOrders} style={primaryBtn}>
                {busy ? "조회중..." : "조회"}
              </button>
              <button
                disabled={busy}
                onClick={() => {
                  setFromDate("");
                  setToDate("");
                  setMsg(null);
                  loadOrders();
                }}
                style={secondaryBtn}
              >
                필터 초기화
              </button>
            </div>

            <div style={{ marginTop: 12, overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ textAlign: "left", fontSize: 13, opacity: 0.85 }}>
                    <th style={th}>출고일</th>
                    <th style={th}>거래처</th>
                    <th style={th}>상태</th>
                    <th style={th}>메모</th>
                    <th style={th}>총액</th>
                    <th style={th}>액션</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ padding: 16, opacity: 0.7 }}>
                        주문이 없습니다.
                      </td>
                    </tr>
                  ) : (
                    orders.map((o) => (
                      <tr key={o.id} style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                        <td style={td}>{o.ship_date ?? "-"}</td>
                        <td style={td}>{o.customer_name ?? "-"}</td>
                        <td style={td}>{o.status ?? "-"}</td>
                        <td style={td}>{o.title ?? "-"}</td>
                        <td style={{ ...td, textAlign: "right" }}>{(o.total_amount ?? 0).toLocaleString("ko-KR")}</td>
                        <td style={td}>
                          <button disabled={busy} onClick={() => copyOrder(o.id)} style={miniBtn}>
                            주문 복사
                          </button>
                          <div style={{ fontSize: 11, opacity: 0.6, marginTop: 6 }}>ID: {o.id}</div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 10 }}>
              ※ “주문 복사”는 다음 단계에서 DB 함수(<code>rpc_copy_order</code>)로 붙입니다.
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

/* ===== styles ===== */
const msgBox: React.CSSProperties = {
  marginTop: 12,
  marginBottom: 12,
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.04)",
  fontSize: 14,
  whiteSpace: "pre-wrap",
};

const panel: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.12)",
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
  border: "1px solid rgba(255,255,255,0.18)",
  background: "rgba(255,255,255,0.04)",
  color: "inherit",
  outline: "none",
};

const primaryBtn: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.20)",
  background: "rgba(255,255,255,0.10)",
  color: "inherit",
  cursor: "pointer",
  fontWeight: 900,
};

const disabledBtn: React.CSSProperties = {
  ...primaryBtn,
  cursor: "not-allowed",
  opacity: 0.5,
};

const secondaryBtn: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.18)",
  background: "transparent",
  color: "inherit",
  cursor: "pointer",
  fontWeight: 800,
};

const miniBtn: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.18)",
  background: "transparent",
  color: "inherit",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 800,
};

const th: React.CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.03)",
  whiteSpace: "nowrap",
};

const td: React.CSSProperties = {
  padding: "10px 12px",
  fontSize: 14,
  whiteSpace: "nowrap",
  verticalAlign: "top",
};

const tabBtn: React.CSSProperties = {
  flex: 1,
  padding: "8px 10px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.18)",
  background: "transparent",
  color: "inherit",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 900,
};

const tabBtnOn: React.CSSProperties = {
  ...tabBtn,
  border: "1px solid rgba(255,255,255,0.55)",
  background: "rgba(255,255,255,0.08)",
};

const selectedBadge: React.CSSProperties = {
  flex: 1,
  border: "1px solid rgba(255,255,255,0.14)",
  borderRadius: 12,
  padding: "10px 12px",
  background: "rgba(255,255,255,0.04)",
};

const favBtnOff: React.CSSProperties = {
  padding: "6px 8px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.18)",
  background: "transparent",
  color: "inherit",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 900,
};

const favBtnOn: React.CSSProperties = {
  ...favBtnOff,
  border: "1px solid rgba(255,255,255,0.55)",
  background: "rgba(255,255,255,0.08)",
};

const topLinkBtn: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.18)",
  background: "transparent",
  color: "inherit",
  cursor: "pointer",
  textDecoration: "none",
  fontWeight: 900,
};