"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import React from "react";
import { createClient } from "@/lib/supabase/browser";

const nav = [
  { href: "/scan",               label: "스캔",          allowedRoles: ["ADMIN", "SUBADMIN"] },
  { href: "/products",           label: "품목/바코드",    allowedRoles: ["ADMIN"]             },
  { href: "/report",             label: "재고대장",       allowedRoles: ["ADMIN", "SUBADMIN"] },
  { href: "/trade",              label: "거래내역(통합)", allowedRoles: ["ADMIN"]             },
  { href: "/tax",                label: "세무사",         allowedRoles: ["ADMIN"]             },
  { href: "/tax/spec",           label: "거래명세서",     allowedRoles: ["ADMIN", "SUBADMIN"] },
  { href: "/tax/statement",      label: "거래원장",       allowedRoles: ["ADMIN", "SUBADMIN"] },
  { href: "/calendar",           label: "출고 캘린더",    allowedRoles: ["ADMIN", "SUBADMIN", "USER"] },
  { href: "/leave",              label: "연차신청",       allowedRoles: ["ADMIN", "USER"]     },
  { href: "/admin/employees",    label: "인사관리",       allowedRoles: ["ADMIN"]             },
];

function canSee(userRole: string, allowedRoles: string[]) {
  return allowedRoles.includes(userRole);
}

const HR_MENUS = ["/leave", "/admin/employees"];

const linkBase: React.CSSProperties = {
  padding: "5px 8px",
  borderRadius: 8,
  borderWidth: 1,
  borderStyle: "solid",
  textDecoration: "none",
  fontWeight: 700,
  fontSize: 12,
  whiteSpace: "nowrap",
};


const HR_SUB_MENUS = [
  { href: "/admin/employees", label: "인사관리" },
  { href: "/admin/payroll",   label: "급여관리" },
];

function HRDropdown({ pathname, active }: { pathname: string; active: boolean }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          ...linkBase,
          cursor: "pointer",
          borderColor: active ? "rgba(255,255,255,0.40)" : "rgba(96,165,250,0.40)",
          backgroundColor: active ? "rgba(255,255,255,0.16)" : "rgba(96,165,250,0.10)",
          color: "white",
          display: "flex", alignItems: "center", gap: 3,
          fontSize: 12,
        }}
      >
        인사관리 <span style={{ fontSize: 10, opacity: 0.7 }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div style={{
          position: "absolute", top: 0, left: "calc(100% + 6px)",
          backgroundColor: "rgba(15,15,20,0.97)",
          border: "1px solid rgba(255,255,255,0.15)",
          borderRadius: 10, overflow: "hidden",
          minWidth: 110, zIndex: 9999,
          boxShadow: "8px 8px 24px rgba(0,0,0,0.4)",
        }}>
          {HR_SUB_MENUS.map((m) => {
            const isActive = pathname === m.href || pathname.startsWith(m.href + "/");
            return (
              <Link
                key={m.href}
                href={m.href}
                onClick={() => setOpen(false)}
                style={{
                  display: "block",
                  padding: "10px 16px",
                  color: "white",
                  textDecoration: "none",
                  fontWeight: 700,
                  fontSize: 13,
                  backgroundColor: isActive ? "rgba(96,165,250,0.20)" : "transparent",
                  borderLeft: isActive ? "3px solid rgba(96,165,250,0.8)" : "3px solid transparent",
                  whiteSpace: "nowrap",
                }}
              >
                {m.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

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
          <div style={{ position: "fixed", top: 8, right: 16, zIndex: 9999, display: "flex", gap: 6, alignItems: "center" }}>
            <Link
              href="/settings"
              style={{
                padding: "5px 8px", borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.16)",
                backgroundColor: "rgba(255,255,255,0.04)",
                color: "rgba(255,255,255,0.70)",
                fontWeight: 700, fontSize: 11,
                textDecoration: "none", whiteSpace: "nowrap",
              }}
            >
              {email}{role ? ` (${role})` : ""}
            </Link>
            <button
              type="button"
              onClick={onLogout}
              style={{
                padding: "5px 8px", borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.16)",
                backgroundColor: "rgba(255,255,255,0.04)",
                color: "white", fontWeight: 700, fontSize: 11, cursor: "pointer",
              }}
            >
              로그아웃
            </button>
          </div>
        )}

        <div style={{ maxWidth: 1400, margin: "0 auto", padding: "8px 16px" }}>
          <div style={{ display: "flex", gap: 5, flexWrap: "nowrap", alignItems: "center", overflowX: "auto" }}>
            <span style={{ color: "white", fontWeight: 900, fontSize: 13, marginRight: 6, whiteSpace: "nowrap" }}>BONUSMATE ERP</span>

            {nav
              .filter((x) => canSee(userRole, x.allowedRoles))
              .map((x) => {
                const active = pathname === x.href || pathname.startsWith(x.href + "/");
                const isHR = HR_MENUS.includes(x.href);

                // 인사관리 → 드롭다운 그룹
                if (x.href === "/admin/employees" && userRole === "ADMIN") {
                  const isHRActive = ["/admin/employees", "/admin/payroll", "/leave"].some(
                    (p) => pathname === p || pathname.startsWith(p + "/")
                  );
                  return (
                    <HRDropdown key={x.href} pathname={pathname} active={isHRActive} />
                  );
                }
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
