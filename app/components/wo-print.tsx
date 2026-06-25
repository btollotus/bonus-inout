"use client";

import React, { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

// ─────────────────────── 공통 타입 ───────────────────────
export type WoPrintItem = {
  id: string;
  delivery_date: string;
  sub_items: { name: string; qty: number }[];
  order_qty: number;
  barcode_no?: string | null;
  actual_qty?: number | null;
  defect_qty?: number | null;
  unit_weight?: number | null;
  expiry_date?: string | null;
  note?: string | null;
  images?: string[] | null;
  logo_spec?: string | null;
};

// WoPrintModal/WoPrintContent이 필요로 하는 WorkOrder 최소 타입
export type WoPrintWorkOrder = {
  id: string;
  work_order_no: string;
  barcode_no: string;
  client_name: string;
  sub_name: string | null;
  order_date: string;
  food_type: string | null;
  product_name: string;
  logo_spec: string | null;
  thickness: string | null;
  delivery_method: string | null;
  packaging_type: string | null;
  tray_slot: string | null;
  package_unit: string | null;
  mold_per_sheet: number | null;
  note: string | null;
  reference_note: string | null;
  status: string;
  status_transfer: boolean;
  status_print_check: boolean;
  status_production: boolean;
  status_input: boolean;
  is_reorder: boolean;
  images: string[];
  work_order_items?: WoPrintItem[];
  [key: string]: unknown; // mold_cols, mold_rows, mold_count 등 추가 필드 허용
};

// ─────────────────────── 유틸 ───────────────────────
export function isSpecialItem(itemName: string): boolean {
  const n = String(itemName ?? "").trim();
  return (
    n.startsWith("성형틀") ||
    n.startsWith("인쇄제판") ||
    n.startsWith("아이스박스") ||
    n.startsWith("택배비") ||
    n.startsWith("퀵") ||
  );
}

export function parseLogoSize(
  logoSpec: string | null
): { width: string; height: string } | null {
  if (!logoSpec) return null;
  const m = logoSpec.match(
    /(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)\s*(mm|cm)?/i
  );
  if (!m) return null;
  const unit = m[3] ?? "mm";
  return { width: `${m[1]}${unit}`, height: `${m[2]}${unit}` };
}

async function resolveSignedImageUrls(
  rawImages: string[],
  supabaseClient: ReturnType<typeof createClient>
): Promise<string[]> {
  if (!rawImages || rawImages.length === 0) return [];
  const results: string[] = [];
  for (const raw of rawImages) {
    let storagePath = raw;
    if (raw.startsWith("http")) {
      const m = raw.match(/work-order-images\/(.+?)(\?|$)/);
      storagePath = m ? decodeURIComponent(m[1]) : raw;
    }
    try {
      const { data, error } = await supabaseClient.storage
        .from("work-order-images")
        .createSignedUrl(storagePath, 60 * 60);
      if (!error && data?.signedUrl) results.push(data.signedUrl);
      else console.warn("[이미지 signed URL 실패]", storagePath, error?.message);
    } catch (e) {
      console.warn("[이미지 signed URL 오류]", storagePath, e);
    }
  }
  return results;
}

// ─────────────────────── WoPrintModal ───────────────────────
export function WoPrintModal({
  wo,
  onClose,
}: {
  wo: WoPrintWorkOrder;
  onClose: () => void;
}) {
  const items = (wo.work_order_items ?? [])
    .slice()
    .sort((a, b) => (a.barcode_no ?? "").localeCompare(b.barcode_no ?? ""))
    .filter((i) => !isSpecialItem((i.sub_items ?? [])[0]?.name || ""));
  const totalOrder = items.reduce((s, i) => s + (i.order_qty ?? 0), 0);

  const [itemNotes, setItemNotes] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const item of items) {
      if (item.note) {
        init[item.id] = item.note;
        continue;
      }
      const foodType = wo.food_type ?? "";
      const qty = item.order_qty ?? 0;
      const mold = wo.mold_per_sheet ?? 0;
      const isChocBase = foodType.includes("초콜릿중간재");
      if (!isChocBase && mold > 0 && qty > 0) {
        const cols =
          (wo as any).mold_cols ?? Math.round(Math.sqrt(mold));
        const rows = (wo as any).mold_rows ?? Math.round(mold / Math.max(cols, 1));
        const fullSheets = Math.floor(qty / mold);
        const remainder = qty % mold;
        let extraRows = remainder > 0 ? Math.ceil(remainder / cols) : 0;
        let totalSheets = fullSheets + Math.floor(extraRows / rows);
        extraRows = extraRows % rows;
        let total = totalSheets * mold + extraRows * cols;
        while (total - qty < 16) {
          extraRows += 1;
          if (extraRows >= rows) { extraRows = 0; totalSheets += 1; }
          total = totalSheets * mold + extraRows * cols;
        }
        init[item.id] =
          extraRows > 0
            ? `전사지: ${totalSheets}장 ${extraRows}줄 참고: ${total.toLocaleString("ko-KR")}개 #${cols}개=가로1줄`
            : `전사지: ${totalSheets}장 참고: ${total.toLocaleString("ko-KR")}개 #${cols}개=가로1줄`;
        const needsLabel = (wo.packaging_type ?? "").includes("벌크");
        if (needsLabel) {
          const labelQty = Math.ceil((qty + 20) / (6 * mold));
          init[item.id] = init[item.id] + `  라벨: ${labelQty}장`;
        }
      } else {
        init[item.id] = item.note ?? "";
      }
    }
    return init;
  });

  const [saving, setSaving] = useState(false);
  const [signedImages, setSignedImages] = useState<string[]>([]);
  const [imagesLoading, setImagesLoading] = useState(true);
  const [signedItemImagesMap, setSignedItemImagesMap] = useState<
    Record<string, string[]>
  >({});

  useEffect(() => {
    async function resolveImages() {
      const sb = createClient();
      const rawUrls = wo.images ?? [];
      if (rawUrls.length > 0) {
        const signedUrls = await resolveSignedImageUrls(rawUrls, sb);
        setSignedImages(signedUrls);
      } else {
        setSignedImages([]);
      }
      const itemImagesMap: Record<string, string[]> = {};
      for (const item of wo.work_order_items ?? []) {
        const rawItemUrls: string[] = (item as any).images ?? [];
        if (rawItemUrls.length === 0) continue;
        const paths = rawItemUrls
          .map((v: string) => {
            if (v.startsWith("http")) {
              const m = v.match(/work-order-images\/(.+?)(\?|$)/);
              return m ? m[1] : null;
            }
            return v;
          })
          .filter(Boolean) as string[];
        if (paths.length === 0) continue;
        const { data } = await sb.storage
          .from("work-order-images")
          .createSignedUrls(paths, 60 * 60);
        if (data) itemImagesMap[item.id] = data.map((d: any) => d.signedUrl);
      }
      setSignedItemImagesMap(itemImagesMap);
      setImagesLoading(false);
    }
    resolveImages();
  }, [wo.images]); // eslint-disable-line

  const woWithSigned = {
    ...wo,
    images: imagesLoading ? (wo.images ?? []) : signedImages,
  };

  async function saveAndPrint() {
    setSaving(true);
    const sb = createClient();
    for (const item of items) {
      const newNote = itemNotes[item.id] ?? "";
      if (newNote !== (item.note ?? ""))
        await sb
          .from("work_order_items")
          .update({ note: newNote || null })
          .eq("id", item.id);
    }
    setSaving(false);
    doPrint();
  }

  function doPrint() {
    const content = document.getElementById("wo-print-preview-inner");
    if (!content) return;
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;width:0;height:0;border:none;";
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) return;
    const _san = (s: string) =>
      (s ?? "").replace(/[\\/:*?"<>|]/g, "").trim();
    const _orderDate = wo.order_date ?? "";
    const _datePart =
      _orderDate.slice(2, 4) +
      _orderDate.slice(5, 7) +
      _orderDate.slice(8, 10);
      const EXCLUDE_PREFIXES = ["성형틀", "인쇄제판", "아이스박스", "택배비", "퀵"];
    const _visItems = (wo.work_order_items ?? []).filter((i: any) => {
      const n = (i.sub_items ?? [])[0]?.name ?? "";
      return !EXCLUDE_PREFIXES.some((p) => n.startsWith(p));
    });
    const _itemNames = _visItems
      .map((i: any) => _san((i.sub_items ?? [])[0]?.name ?? ""))
      .filter(Boolean)
      .join("_");
    const _logoSpec = (wo.logo_spec ?? "")
      .replace(/[xX×*]/g, "-")
      .replace(/mm/gi, "")
      .replace(/[\\/:?"<>|]/g, "")
      .trim();
    const _title = [
      "작업지시서",
      _datePart,
      _san(wo.client_name),
      wo.sub_name ? _san(wo.sub_name) : "",
      _logoSpec,
      _itemNames
        ? `(${_itemNames}${wo.food_type ? "-" + _san(wo.food_type) : ""})`
        : "",
    ]
      .filter(Boolean)
      .join("-");

    doc.open();
    doc.write(
      `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${_title}</title>
      <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
<style>@page{size:A4 portrait;margin:12mm 14mm;}body{margin:0;font-family:'Malgun Gothic','맑은 고딕',sans-serif;font-size:10pt;color:#111;}*{box-sizing:border-box;}img{max-width:none;}div[style*="overflow:hidden"] img,div[style*="overflow: hidden"] img{width:100%!important;height:100%!important;max-width:none!important;max-height:none!important;object-fit:cover!important;object-position:top left!important;}textarea{border:1px solid #cbd5e1!important;background:#fff!important;}</style>
    </head><body>${content.innerHTML}
    <script>window.onload=function(){if(typeof JsBarcode!=="undefined"){document.querySelectorAll("svg[data-barcode]").forEach(function(el){JsBarcode(el,el.getAttribute("data-barcode"),{format:"CODE128",displayValue:false,width:2,height:26,margin:0});});}window.print();};<\/script>
    </body></html>`
    );
    doc.close();
    const _origTitle = document.title;
    document.title = _title;
    setTimeout(() => {
      document.title = _origTitle;
      onClose();
    }, 1500);
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        background: "#f1f5f9",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 16px",
          background: "#1e3a5f",
          color: "#fff",
          flexShrink: 0,
        }}
      >
        <div style={{ fontWeight: "bold", fontSize: "14pt" }}>
          작업지시서 인쇄 미리보기
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={saveAndPrint}
            disabled={saving}
            style={{
              padding: "8px 20px",
              background: saving ? "#94a3b8" : "#2563eb",
              color: "#fff",
              border: "none",
              borderRadius: "6px",
              fontSize: "11pt",
              fontWeight: "bold",
              cursor: saving ? "not-allowed" : "pointer",
            }}
          >
            {saving ? "저장 중..." : "🖨️ 인쇄"}
          </button>
          <button
            onClick={onClose}
            style={{
              padding: "8px 16px",
              background: "#64748b",
              color: "#fff",
              border: "none",
              borderRadius: "6px",
              fontSize: "11pt",
              cursor: "pointer",
            }}
          >
            닫기
          </button>
        </div>
      </div>
      <div
        style={{
          flex: 1,
          overflow: "auto",
          padding: "20px",
          display: "flex",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            background: "#fff",
            width: "210mm",
            minHeight: "297mm",
            padding: "12mm 14mm",
            boxShadow: "0 4px 24px rgba(0,0,0,0.15)",
          }}
        >
          <div id="wo-print-preview-inner">
            <WoPrintContent
              wo={woWithSigned}
              items={items}
              totalOrder={totalOrder}
              itemNotes={itemNotes}
              imagesLoading={imagesLoading}
              signedItemImagesMap={signedItemImagesMap}
              onItemNoteChange={(id, val) =>
                setItemNotes((prev) => ({ ...prev, [id]: val }))
              }
              isReorder={wo.is_reorder}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────── WoPrintContent ───────────────────────
export function WoPrintContent({
  wo,
  items,
  totalOrder,
  itemNotes,
  imagesLoading,
  signedItemImagesMap,
  onItemNoteChange,
  isReorder,
}: {
  wo: WoPrintWorkOrder;
  items: WoPrintItem[];
  totalOrder: number;
  itemNotes: Record<string, string>;
  imagesLoading?: boolean;
  signedItemImagesMap?: Record<string, string[]>;
  onItemNoteChange: (itemId: string, value: string) => void;
  isReorder: boolean;
}) {
  const f = (n: number | null | undefined) =>
    Number(n ?? 0).toLocaleString("ko-KR");
  const thS: React.CSSProperties = {
    background: "#f8fafc",
    border: "1px solid #cbd5e1",
    padding: "3px 6px",
    fontWeight: "bold",
    fontSize: "11pt",
    color: "#374151",
    whiteSpace: "nowrap",
    width: "80px",
  };
  const tdS: React.CSSProperties = {
    border: "1px solid #cbd5e1",
    padding: "3px 8px",
    fontSize: "11pt",
  };
  const cellBase: React.CSSProperties = {
    border: "1px solid #cbd5e1",
    fontSize: "8.5pt",
    verticalAlign: "middle",
    padding: "4px 6px",
  };
  const cellHead: React.CSSProperties = {
    ...cellBase,
    background: "#f1f5f9",
    fontWeight: "bold",
    fontSize: "8pt",
    textAlign: "center",
    whiteSpace: "nowrap",
  };
  const statusRows = [
    { label: "전사인쇄", checked: wo.status_transfer },
    { label: "인쇄검수", checked: wo.status_print_check },
    { label: "생산완료", checked: wo.status_production },
    { label: "입력완료", checked: wo.status_input },
  ];
  const visibleItems = items.filter(
    (i) => !isSpecialItem((i.sub_items ?? [])[0]?.name || "")
  );
  const deliveryDate = items[0]?.delivery_date ?? wo.order_date;
  const isMultiItem = visibleItems.length > 1;
  const productNameDisplay = (() => {
    const names = visibleItems
      .map((i) => (i.sub_items ?? [])[0]?.name)
      .filter(Boolean) as string[];
    if (names.length === 0) return wo.product_name;
    if (names.length === 1) return names[0];
    return `${names[0]} 외 ${names.length - 1}건`;
  })();

  return (
    <div
      style={{
        fontFamily: "'Malgun Gothic','맑은 고딕',sans-serif",
        fontSize: "10pt",
        color: "#111",
        background: "#fff",
      }}
    >
      <div
        style={{
          textAlign: "center",
          fontSize: "8.5pt",
          color: "#555",
          marginBottom: "4px",
          letterSpacing: "2px",
        }}
      >
        성실! 신뢰! 화합!
      </div>
      <div
        style={{
          textAlign: "center",
          fontSize: "17pt",
          fontWeight: "bold",
          letterSpacing: "6px",
          marginBottom: "8px",
          borderBottom: "2px solid #111",
          paddingBottom: "6px",
        }}
      >
        작 업 지 시 서
        <span
          style={{
            marginLeft: "14px",
            fontSize: "10pt",
            fontWeight: "bold",
            letterSpacing: "0px",
            padding: "2px 10px",
            borderRadius: "12px",
            verticalAlign: "middle",
            background: isReorder ? "#fef3c7" : "#dbeafe",
            color: isReorder ? "#b45309" : "#1d4ed8",
            border: `1px solid ${isReorder ? "#fcd34d" : "#93c5fd"}`,
          }}
        >
          {isReorder ? "재주문" : "신규"}
        </span>
      </div>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          marginBottom: "10px",
        }}
      >
        <tbody>
          <tr>
            <td style={thS}>거래처명</td>
            <td style={tdS}>
              {wo.client_name}
              {wo.sub_name ? ` (${wo.sub_name})` : ""}
            </td>
            <td style={thS}>납기일</td>
            <td style={{ ...tdS, fontWeight: "bold" }}>
              {deliveryDate}
              {deliveryDate
                ? ` (${
                    ["일", "월", "화", "수", "목", "금", "토"][
                      new Date(
                        deliveryDate + "T00:00:00+09:00"
                      ).getDay()
                    ]
                  })`
                : ""}
            </td>
          </tr>
          <tr>
            <td style={thS}>제품명</td>
            <td style={tdS} colSpan={3}>
              {productNameDisplay}
            </td>
          </tr>
          <tr>
            <td style={thS}>식품유형</td>
            <td style={tdS}>{wo.food_type ?? "—"}</td>
            <td style={thS}>두께</td>
            <td style={tdS}>{wo.thickness ?? "—"}</td>
          </tr>
          <tr>
            <td style={thS}>규격(로고)</td>
            <td style={tdS}>{wo.logo_spec ?? "—"}</td>
            <td style={thS}>포장방법</td>
            <td style={tdS}>
              {wo.packaging_type ?? "—"}
              {wo.packaging_type === "트레이" && wo.tray_slot
                ? ` / ${wo.tray_slot}`
                : ""}
            </td>
          </tr>
          <tr>
            <td style={thS}>포장단위</td>
            <td style={tdS}>{wo.package_unit ?? "—"}</td>
            <td style={thS}>장당 갯수/아크릴 갯수</td>
            <td style={tdS}>
              {wo.mold_per_sheet ? `${wo.mold_per_sheet}개` : "—"}
              {(wo as any).mold_count
                ? ` / ${(wo as any).mold_count}장`
                : ""}
            </td>
          </tr>
          <tr>
            <td style={thS}>납품방법</td>
            <td style={tdS}>{wo.delivery_method ?? "—"}</td>
            <td style={thS}>주문일</td>
            <td style={tdS}>
              {(() => {
                const d = wo.order_date;
                return d
                  ? `${d} (${
                      ["일", "월", "화", "수", "목", "금", "토"][
                        new Date(d + "T00:00:00+09:00").getDay()
                      ]
                    })`
                  : "";
              })()}
            </td>
          </tr>
          <tr>
            <td style={thS}>지시번호</td>
            <td style={tdS} colSpan={3}>
              {wo.work_order_no}
            </td>
          </tr>
          {wo.note ? (
            <tr>
              <td style={thS}>비고</td>
              <td style={tdS} colSpan={3}>
                {wo.note}
              </td>
            </tr>
          ) : null}
          {wo.reference_note ? (
            <tr>
              <td style={thS}>참고사항</td>
              <td style={tdS} colSpan={3}>
                {wo.reference_note}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
      <div
        style={{
          fontWeight: "bold",
          fontSize: "9pt",
          marginBottom: "3px",
          marginTop: "6px",
          borderLeft: "3px solid #2563eb",
          paddingLeft: "5px",
        }}
      >
        진행상태 확인
      </div>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          marginBottom: "10px",
        }}
      >
        <tbody>
          <tr>
            {statusRows.map(({ label, checked }) => (
              <td
                key={label}
                style={{
                  border: "1px solid #cbd5e1",
                  padding: "3px 6px",
                  textAlign: "center",
                  width: "25%",
                }}
              >
                <span style={{ fontSize: "8pt", color: "#555" }}>
                  {label}{" "}
                </span>
                <span style={{ fontSize: "10pt" }}>
                  {checked ? "✅" : "☐"}
                </span>
              </td>
            ))}
          </tr>
        </tbody>
      </table>
      <div
        style={{
          fontWeight: "bold",
          fontSize: "9pt",
          marginBottom: "6px",
          borderLeft: "3px solid #2563eb",
          paddingLeft: "5px",
        }}
      >
        {isMultiItem
          ? `품목별 생산 현황 (총 ${visibleItems.length}건)`
          : "생산 현황"}
      </div>

      {items
        .filter((item) => !isSpecialItem((item.sub_items ?? [])[0]?.name || ""))
        .map((item, idx, arr) => {
          const aq = item.actual_qty ?? null,
            uw = item.unit_weight ?? null;
          const tw = aq && uw ? aq * uw : null;
          const exp = item.expiry_date ?? "",
            itemName = (item.sub_items ?? [])[0]?.name || "—";
          const itemBarcode = item.barcode_no ?? null;
          const noteVal = itemNotes[item.id] ?? (item.note ?? "");
          return (
            <div
              key={item.id}
              style={{ marginBottom: idx < arr.length - 1 ? "10px" : "6px" }}
            >
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <tbody>
                  <tr>
                    <td
                      style={{
                        border: "1px solid #94a3b8",
                        borderBottom: "none",
                        padding: "5px 10px",
                        width: "30%",
                        background: "#f1f5f9",
                        color: "#111",
                        fontWeight: "bold",
                        fontSize: "9pt",
                        verticalAlign: "middle",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {itemName}
                    </td>
                    <td
                      style={{
                        border: "1px solid #94a3b8",
                        borderBottom: "none",
                        borderLeft: "none",
                        padding: "5px 10px",
                        background: "#f8fafc",
                        verticalAlign: "middle",
                      }}
                    >
                      {itemBarcode ? (
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "12px",
                          }}
                        >
                          <span
                            style={{
                              fontFamily: "monospace",
                              fontSize: "11pt",
                              color: "#444",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {itemBarcode}
                          </span>
                          <svg
                            data-barcode={itemBarcode}
                            style={{
                              height: "26px",
                              flex: 1,
                              display: "block",
                              minWidth: 0,
                            }}
                          />
                        </div>
                      ) : (
                        <span style={{ color: "#aaa", fontSize: "8pt" }}>
                          바코드 없음
                        </span>
                      )}
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={2} style={{ border: "1px solid #cbd5e1", borderTop: "none", padding: 0 }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
                        <colgroup>
                          <col style={{ width: "8%" }} />
                          <col style={{ width: "10%" }} />
                          <col style={{ width: "8%" }} />
                          <col style={{ width: "7%" }} />
                          <col style={{ width: "10%" }} />
                          <col style={{ width: "10%" }} />
                          <col style={{ width: "16%" }} />
                          <col style={{ width: "31%" }} />
                        </colgroup>
                        <tbody>
                          <tr>
                            <td style={{ ...cellHead, border: "none", borderRight: "1px solid #cbd5e1" }}>주문수량</td>
                            <td style={{ ...cellHead, border: "none", borderRight: "1px solid #cbd5e1" }}>출고수량</td>
                            <td style={{ ...cellHead, border: "none", borderRight: "1px solid #cbd5e1" }}>추가생산</td>
                            <td style={{ ...cellHead, border: "none", borderRight: "1px solid #cbd5e1" }}>불량</td>
                            <td style={{ ...cellHead, border: "none", borderRight: "1px solid #cbd5e1" }}>개당중량(g)</td>
                            <td style={{ ...cellHead, border: "none", borderRight: "1px solid #cbd5e1" }}>총중량(g)</td>
                            <td style={{ ...cellHead, border: "none", borderRight: "1px solid #cbd5e1" }}>소비기한</td>
                            <td style={{ ...cellHead, border: "none" }}>비고</td>
                          </tr>
                          <tr>
                            <td style={{ ...cellBase, border: "none", borderTop: "1px solid #cbd5e1", borderRight: "1px solid #cbd5e1", textAlign: "right", fontWeight: "bold", fontSize: "11pt" }}>
                              {f(item.order_qty)}
                            </td>
                            <td style={{ ...cellBase, border: "none", borderTop: "1px solid #cbd5e1", borderRight: "1px solid #cbd5e1", textAlign: "right", fontWeight: "bold", color: aq ? "#1d4ed8" : "#111" }}>
                              {aq != null ? f(aq) : ""}
                            </td>
                            <td style={{ ...cellBase, border: "none", borderTop: "1px solid #cbd5e1", borderRight: "1px solid #cbd5e1", textAlign: "right", color: aq != null && aq > item.order_qty ? "#7c3aed" : "#111" }}>
                              {aq != null && aq > item.order_qty ? f(aq - item.order_qty) : ""}
                            </td>
                            <td style={{ ...cellBase, border: "none", borderTop: "1px solid #cbd5e1", borderRight: "1px solid #cbd5e1", textAlign: "right", color: item.defect_qty ? "#dc2626" : "#111" }}>
                              {item.defect_qty ? f(item.defect_qty) : ""}
                            </td>
                            <td style={{ ...cellBase, border: "none", borderTop: "1px solid #cbd5e1", borderRight: "1px solid #cbd5e1", textAlign: "right" }}>
                              {uw != null ? uw : ""}
                            </td>
                            <td style={{ ...cellBase, border: "none", borderTop: "1px solid #cbd5e1", borderRight: "1px solid #cbd5e1", textAlign: "right", color: tw ? "#1d4ed8" : "#999" }}>
                              {tw ? f(Math.round(tw)) : ""}
                            </td>
                            <td style={{ ...cellBase, border: "none", borderTop: "1px solid #cbd5e1", borderRight: "1px solid #cbd5e1", textAlign: "center", fontSize: "8pt" }}>
                              {exp || ""}
                            </td>
                            <td style={{ ...cellBase, border: "none", borderTop: "1px solid #cbd5e1", padding: "4px 6px", fontSize: "11pt", verticalAlign: "middle" }}>
                              {noteVal}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </td>
                  </tr>
                </tbody>
              </table>
              {/* 품목별 이미지 */}
              {(() => {
                const itemSignedUrls = signedItemImagesMap?.[item.id] ?? [];
                if (itemSignedUrls.length === 0) return null;
                const effectiveLogoSpec = item.logo_spec || wo.logo_spec;
                const logoSize = parseLogoSize(effectiveLogoSpec);
                return (
                  <div
                    style={{
                      marginTop: "6px",
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "6px",
                      alignItems: "flex-end",
                    }}
                  >
                    {imagesLoading ? (
                      <div
                        style={{
                          fontSize: "8pt",
                          color: "#94a3b8",
                          padding: "4px",
                        }}
                      >
                        이미지 로딩 중...
                      </div>
                    ) : (
                      itemSignedUrls.map((url, imgIdx) => (
                        <div key={imgIdx} style={{ textAlign: "center" }}>
                          <div
                            style={{
                              width: logoSize ? logoSize.width : "150mm",
                              height: logoSize ? logoSize.height : "150mm",
                              overflow: "hidden",
                              border: "1px solid #e2e8f0",
                              borderRadius: "4px",
                              display: "inline-block",
                              flexShrink: 0,
                              position: "relative",
                            }}
                          >
                          <img
                              src={url}
                              alt={`이미지${imgIdx + 1}`}
                              style={{
                                position: "absolute",
                                top: 0,
                                left: 0,
                                width: logoSize ? logoSize.width : "150mm",
                                height: logoSize ? logoSize.height : "150mm",
                                objectFit: "cover",
                                objectPosition: "top left",
                                display: "block",
                              }}
                            />
                          </div>
                          {effectiveLogoSpec ? (
                            <div
                              style={{
                                fontSize: "7pt",
                                color: "#94a3b8",
                                marginTop: "2px",
                              }}
                            >
                              {effectiveLogoSpec}
                            </div>
                          ) : null} 
                        </div>
                      ))
                    )}
                  </div>
                );
              })()}
            </div>
          );
        })}

      {(wo.images ?? []).length > 0 ? (
        <div style={{ marginBottom: "10px" }}>
          <div
            style={{
              fontWeight: "bold",
              fontSize: "9pt",
              marginBottom: "2px",
              borderLeft: "3px solid #2563eb",
              paddingLeft: "5px",
            }}
          >
            인쇄 디자인 이미지
          </div>
          <div
            style={{
              fontSize: "7.5pt",
              color: "#94a3b8",
              marginBottom: "4px",
            }}
          >
            {parseLogoSize(wo.logo_spec)
              ? `※ 실제크기 적용 (${wo.logo_spec})`
              : "※ 실제크기 적용: 규격(로고스펙)에 25x25mm 형식으로 입력하세요"}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {imagesLoading ? (
              <div
                style={{ fontSize: "8pt", color: "#94a3b8", padding: "8px" }}
              >
                이미지 로딩 중...
              </div>
            ) : (
              wo.images.map((url, i) => {
                const logoSize = parseLogoSize(wo.logo_spec);
                return (
                  <div
                    key={i}
                    style={{
                      width: logoSize ? logoSize.width : "150mm",
                      height: logoSize ? logoSize.height : "150mm",
                      overflow: "hidden",
                      border: "1px solid #e2e8f0",
                      borderRadius: "4px",
                      display: "inline-block",
                      position: "relative",
                    }}
                  >
                    <img
                      src={url}
                      alt={`디자인 ${i + 1}`}
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: logoSize ? logoSize.width : "150mm",
                        height: logoSize ? logoSize.height : "150mm",
                        objectFit: "cover",
                        objectPosition: "top left",
                        display: "block",
                      }}
                    />
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
