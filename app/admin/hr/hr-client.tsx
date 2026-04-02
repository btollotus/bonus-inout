"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import EmployeesPage from "@/app/admin/hr/employees-page";
import PayrollPage from "@/app/admin/payroll/page";

type Tab = "EMPLOYEES" | "PAYROLL";

export default function HRClient() {
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);
  const [role, setRole] = useState<string | null>(null);

  const [tab, setTab] = useState<Tab>(() => {
    return searchParams?.get("tab") === "payroll" ? "PAYROLL" : "EMPLOYEES";
  });

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

  useEffect(() => {
    document.title =
      tab === "EMPLOYEES"
        ? "인사관리 | BONUSMATE ERP"
        : "급여관리 | BONUSMATE ERP";
  }, [tab]);

  // ADMIN이 아니면 접근 차단 (미들웨어에서 이미 막지만 클라이언트 이중 보호)
  if (role !== null && role !== "ADMIN") {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500 text-sm">
        접근 권한이 없습니다.
      </div>
    );
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "EMPLOYEES", label: "👤 인사관리" },
    { key: "PAYROLL",   label: "💰 급여관리" },
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
          인사/급여
        </span>
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
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

      {/* ── 탭 콘텐츠 ── */}
      {tab === "EMPLOYEES" && <EmployeesPage />}
      {tab === "PAYROLL"   && <PayrollPage />}
    </>
  );
}