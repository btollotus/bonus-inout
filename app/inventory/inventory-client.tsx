"use client";

// app/inventory/inventory-client.tsx
// 기존 scan-client, report-client 를 그대로 import해서 탭으로 묶음
// 기존 파일은 일절 수정하지 않음

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import ScanClient from "@/app/scan/scan-client";
import ReportClient from "@/app/report/report-client";

type Tab = "SCAN" | "REPORT";

export default function InventoryClient() {
  const searchParams = useSearchParams();

  const [tab, setTab] = useState<Tab>(() =>
    searchParams?.get("tab") === "report" ? "REPORT" : "SCAN"
  );

  // 탭 전환 시 브라우저 탭 타이틀 업데이트
  // (layout template "%s | BONUSMATE ERP" 형식에 맞춤)
  useEffect(() => {
    document.title =
      tab === "SCAN"
        ? "재고관리 · 스캔 | BONUSMATE ERP"
        : "재고관리 · 재고대장 | BONUSMATE ERP";
  }, [tab]);

  return (
    <>
      {/* ── 탭 바 (TopNav 44px 바로 아래 sticky) ── */}
      <div
        style={{
          position: "sticky",
          top: 44,
          zIndex: 40,
          backgroundColor: "rgba(0,0,0,0.75)",
          backdropFilter: "blur(8px)",
          borderBottom: "1px solid rgba(255,255,255,0.10)",
          padding: "6px 16px",
          display: "flex",
          gap: 8,
          alignItems: "center",
        }}
      >
        <span
          style={{
            color: "rgba(255,255,255,0.5)",
            fontSize: 12,
            fontWeight: 700,
            marginRight: 4,
          }}
        >
          재고관리
        </span>

        {(["SCAN", "REPORT"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            style={{
              padding: "4px 14px",
              borderRadius: 8,
              border: "1px solid",
              borderColor:
                tab === t
                  ? "rgba(255,255,255,0.40)"
                  : "rgba(255,255,255,0.16)",
              backgroundColor:
                tab === t
                  ? "rgba(255,255,255,0.16)"
                  : "rgba(255,255,255,0.04)",
              color: "white",
              fontWeight: 700,
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            {t === "SCAN" ? "📦 스캔" : "📋 재고대장"}
          </button>
        ))}
      </div>

      {/* ── 탭 콘텐츠: 기존 컴포넌트 그대로 렌더링 ── */}
      {tab === "SCAN" && <ScanClient />}
      {tab === "REPORT" && <ReportClient />}
    </>
  );
}
