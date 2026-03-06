"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import React from "react";
import { createClient } from "@/lib/supabase/browser";

const nav = [
  { href: "/scan",              label: "스캔",         adminOnly: false },
  { href: "/products",          label: "품목/바코드",   adminOnly: true  },
  { href: "/report",            label: "재고대장",      adminOnly: false },
  { href: "/trade",             label: "거래내역(통합)", adminOnly: true  },
  { href: "/tax",               label: "세무사",        adminOnly: true  },
  { href: "/tax/spec",          label: "거래명세서",    adminOnly: true  },
  { href: "/tax/statement",     label: "거래원장",      adminOnly: true  },
  { href: "/calendar",          label: "출고 캘린더",   adminOnly: false },
  // ── 인사관리 그룹 ──────────────────────────
  { href: "/leave",             label: "연차신청",      adminOnly: false }, // 전직원
  { href: "/admin/leave-status",label: "연차현황",      adminOnly: false }, // 전직원 (읽기) / 관리자 (승인)
  { href: "/admin/employees",   label: "인사관리",      adminOnly: true  }, // 관리자
  { href: "/admin/payroll",     label: "급여",          adminOnly: true  }, // 관리자
];

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
  const isAdmin = role === "ADMIN";

  const onLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  return (
    <>
      {/* 전역 input 글자색 오버라이드 */}
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
          <button type="button" onClick={onLogout}
            style={{ position: "fixed", top: 10, right: 16, zIndex: 9999, padding: "8px 10px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.16)", backgroundColor: "rgba(255,255,255,0.04)", color: "white", fontWeight: 900, cursor: "pointer" }}>
            로그아웃
          </button>
        )}

        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "10px 16px" }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ color: "white", fontWeight: 900, marginRight: 8 }}>BONUSMATE ERP</span>

            <Link href="/" style={{ ...linkBase, borderColor: "rgba(255,255,255,0.16)", backgroundColor: "rgba(255,255,255,0.04)", color: "white", marginRight: 8 }}>홈</Link>

            {nav.map((x) => {
              const active = pathname === x.href || pathname.startsWith(x.href + "/");
              const disabled = x.adminOnly && !isAdmin;
              const isHR = HR_MENUS.includes(x.href);

              const baseStyle: React.CSSProperties = {
                ...linkBase,
                borderColor: active ? "rgba(255,255,255,0.40)" : isHR ? "rgba(96,165,250,0.40)" : "rgba(255,255,255,0.16)",
                backgroundColor: active ? "rgba(255,255,255,0.16)" : isHR ? "rgba(96,165,250,0.10)" : "rgba(255,255,255,0.04)",
                color: "white",
              };

              if (disabled) {
                return (
                  <a key={x.href} href="#"
                    onClick={(e) => { e.preventDefault(); alert("접근 권한이 없습니다."); }}
                    style={{ ...baseStyle, opacity: 0.35, cursor: "not-allowed" }}>
                    {x.label}
                  </a>
                );
              }

              return (
                <Link key={x.href} href={x.href} style={baseStyle}>{x.label}</Link>
              );
            })}

            {!!email && (
              <span style={{ marginLeft: "auto", color: "rgba(255,255,255,0.70)", fontWeight: 800, fontSize: 12 }}>
                {email}{role ? ` (${role})` : ""}
              </span>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
