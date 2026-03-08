"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import React from "react";
import { createClient } from "@/lib/supabase/browser";

// role 정의
// ADMIN    : 마스터관리자 - 모든 메뉴
// SUBADMIN : 부관리자 - 빨간박스 메뉴만
// USER     : 일반직원 - 노란박스(연차신청, 연차현황)만

const nav = [
  { href: "/scan",               label: "스캔",          role: "SUBADMIN" },
  { href: "/products",           label: "품목/바코드",    role: "SUBADMIN" },
  { href: "/report",             label: "재고대장",       role: "SUBADMIN" },
  { href: "/trade",              label: "거래내역(통합)", role: "SUBADMIN" },
  { href: "/tax",                label: "세무사",         role: "SUBADMIN" },
  { href: "/tax/spec",           label: "거래명세서",     role: "SUBADMIN" },
  { href: "/tax/statement",      label: "거래원장",       role: "SUBADMIN" },
  { href: "/calendar",           label: "출고 캘린더",    role: "SUBADMIN" },
  { href: "/leave",              label: "연차신청",       role: "USER"     },
  { href: "/admin/leave-status", label: "연차현황",       role: "USER"     },
  { href: "/admin/employees",    label: "인사관리",       role: "ADMIN"    },
  { href: "/admin/payroll",      label: "급여",           role: "ADMIN"    },
];

// 해당 role 이상이면 메뉴 표시
function canSee(userRole: string, menuRole: string) {
  if (userRole === "ADMIN") return true;
  if (userRole === "SUBADMIN") return menuRole === "SUBADMIN" || menuRole === "USER";
  return menuRole === "USER"; // 일반직원
}

const HR_MENUS = ["/leave", "/admin/leave-status", "/admin/employees", "/admin/payroll"];

const linkBase: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 12,
  borderWidth: 1,
  borderStyle: "solid",
  textDecoration: "none",
  fontWeight: 800,
  whiteSpace: "nowrap",
};

export default function TopNav({ role, email }: { role?: string; email?: string }) {
  const pathname = usePathname();
  const userRole = role ?? "USER";

  const onLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  return (
    <>
      <style>{`
        input, textarea, select { color: #111 !important; background-color: #fff !important; }
        input::placeholder, textarea::placeholder { color: #aaa !important; }
      `}</style>

      <div
        className="app-topnav"
        style={{
          position: "sticky", top: 0, zIndex: 50,
          backgroundColor: "rgba(0,0,0,0.85)",
          backdropFilter: "blur(8px)",
          borderBottom: "1px solid rgba(255,255,255,0.10)",
        }}
      >
        {!!email && (
          <div style={{ position: "fixed", top: 10, right: 16, zIndex: 9999, display: "flex", gap: 8, alignItems: "center" }}>
            <Link
              href="/settings"
              style={{
                padding: "8px 10px", borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.16)",
                backgroundColor: "rgba(255,255,255,0.04)",
                color: "rgba(255,255,255,0.70)",
                fontWeight: 800, fontSize: 12,
                textDecoration: "none", whiteSpace: "nowrap",
              }}
            >
              {email}{role ? ` (${role})` : ""}
            </Link>
            <button
              type="button"
              onClick={onLogout}
              style={{
                padding: "8px 10px", borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.16)",
                backgroundColor: "rgba(255,255,255,0.04)",
                color: "white", fontWeight: 900, cursor: "pointer",
              }}
            >
              로그아웃
            </button>
          </div>
        )}

        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "10px 16px" }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ color: "white", fontWeight: 900, marginRight: 8 }}>BONUSMATE ERP</span>

            <Link href="/" style={{ ...linkBase, borderColor: "rgba(255,255,255,0.16)", backgroundColor: "rgba(255,255,255,0.04)", color: "white", marginRight: 8 }}>
              홈
            </Link>

            {nav
              .filter((x) => canSee(userRole, x.role))
              .map((x) => {
                const active = pathname === x.href || pathname.startsWith(x.href + "/");
                const isHR = HR_MENUS.includes(x.href);
                return (
                  <Link
                    key={x.href}
                    href={x.href}
                    style={{
                      ...linkBase,
                      borderColor: active ? "rgba(255,255,255,0.40)" : isHR ? "rgba(96,165,250,0.40)" : "rgba(255,255,255,0.16)",
                      backgroundColor: active ? "rgba(255,255,255,0.16)" : isHR ? "rgba(96,165,250,0.10)" : "rgba(255,255,255,0.04)",
                      color: "white",
                    }}
                  >
                    {x.label}
                  </Link>
                );
              })}
          </div>
        </div>
      </div>
    </>
  );
}
