"use client";

// app/inventory/inventory-client.tsx
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import ScanClient from "@/app/scan/scan-client";
import ReportClient from "@/app/report/report-client";
import ProductsClient from "@/app/products/products-client";

type Tab = "SCAN" | "REPORT" | "PRODUCTS";

export default function InventoryClient() {
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);

  // role: null = 로딩중, string = 로드완료
  const [role, setRole] = useState<string | null>(null);

  const [tab, setTab] = useState<Tab>(() => {
    const t = searchParams?.get("tab");
    if (t === "report") return "REPORT";
    return "SCAN";
  });

  // ✅ useEffect보다 먼저 선언 (참조 오류 방지)
  const canSeeProducts = role === "ADMIN" || role === "SUBADMIN";

  // ── role 조회 ──
  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(async ({ data }) => {
      if (!active || !data?.user) return;
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", data.user.id)
        .single();
      if (!active) return;
      setRole(roleData?.role ?? "USER");
    });
    return () => { active = false; };
  }, [supabase]);

  // ── role 로드 후: URL에 tab=products 있고 권한 있으면 PRODUCTS로 이동 ──
  useEffect(() => {
    if (role === null) return;
    const t = searchParams?.get("tab");
    if (t === "products" && canSeeProducts) {
      setTab("PRODUCTS");
    }
  }, [role, searchParams, canSeeProducts]);

  // ── PRODUCTS 탭인데 권한 없는 경우 강제 SCAN ──
  useEffect(() => {
    if (role === null) return;
    if (tab === "PRODUCTS" && !canSeeProducts) {
      setTab("SCAN");
    }
  }, [role, tab, canSeeProducts]);

  // ── 탭 타이틀 업데이트 ──
  useEffect(() => {
    const titles: Record<Tab, string> = {
      SCAN:     "재고관리 · 스캔 | BONUSMATE ERP",
      REPORT:   "재고관리 · 재고대장 | BONUSMATE ERP",
      PRODUCTS: "재고관리 · 품목/바코드 | BONUSMATE ERP",
    };
    document.title = titles[tab];
  }, [tab]);

  const tabs: { key: Tab; label: string; productsOnly?: boolean }[] = [
    { key: "SCAN",     label: "📦 스캔"          },
    { key: "REPORT",   label: "📋 재고대장"      },
    { key: "PRODUCTS", label: "🏷️ 품목/바코드", productsOnly: true },
  ];

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

        {/* role 로딩 중엔 기본 탭만 표시 (깜빡임 방지) */}
        {tabs
          .filter((t) => !t.productsOnly || canSeeProducts)
          .map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key as Tab)}
              style={{
                padding: "4px 14px",
                borderRadius: 8,
                border: "1px solid",
                borderColor:
                  tab === t.key
                    ? "rgba(255,255,255,0.40)"
                    : "rgba(255,255,255,0.16)",
                backgroundColor:
                  tab === t.key
                    ? "rgba(255,255,255,0.16)"
                    : "rgba(255,255,255,0.04)",
                color: "white",
                fontWeight: 700,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              {t.label}
            </button>
          ))}
      </div>

      {/* ── 탭 콘텐츠: 기존 컴포넌트 그대로 렌더링 ── */}
      {tab === "SCAN"                     && <ScanClient />}
      {tab === "REPORT"                   && <ReportClient />}
      {tab === "PRODUCTS" && canSeeProducts && <ProductsClient />}
    </>
  );
}