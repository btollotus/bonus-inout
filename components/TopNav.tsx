"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import React from "react";
import { createClient } from "@/lib/supabase/browser";

const nav = [
  { href: "/scan", label: "스캔" },
  { href: "/products", label: "품목/바코드" },
  { href: "/report", label: "재고대장" },

  // ❌ 경리장부(/ledger), 주문/출고(/orders) 제거
  { href: "/trade", label: "거래내역(통합)" },

  // ✅ 세무 메뉴 추가
  { href: "/tax", label: "세무사" },
  { href: "/tax/spec", label: "거래명세서" },
  { href: "/tax/statement", label: "거래원장" },

  { href: "/calendar", label: "출고 캘린더" },
];

export default function TopNav({ role, email }: { role?: string; email?: string }) {
  const pathname = usePathname();
  const isAdmin = role === "ADMIN";

  const onLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  return (
    <div
      className="app-topnav"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        backgroundColor: "rgba(0,0,0,0.85)",
        backdropFilter: "blur(8px)",
        borderBottomWidth: 1,
        borderBottomStyle: "solid",
        borderBottomColor: "rgba(255,255,255,0.10)",
      }}
    >
      {/* ✅ 로그아웃 버튼 상단 우측 상시 고정(로그인 상태에서만 노출) */}
      {!!email && (
        <button
          type="button"
          onClick={onLogout}
          style={{
            position: "fixed",
            top: 10,
            right: 16,
            zIndex: 9999,
            padding: "8px 10px",
            borderRadius: 12,
            borderWidth: 1,
            borderStyle: "solid",
            borderColor: "rgba(255,255,255,0.16)",
            backgroundColor: "rgba(255,255,255,0.04)",
            color: "white",
            fontWeight: 900,
            cursor: "pointer",
          }}
        >
          로그아웃
        </button>
      )}

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "10px 16px" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ color: "white", fontWeight: 900, marginRight: 8 }}>BONUSMATE ERP</span>

          <Link
            href="/"
            style={{
              padding: "8px 10px",
              borderRadius: 12,
              borderWidth: 1,
              borderStyle: "solid",
              borderColor: "rgba(255,255,255,0.16)",
              color: "white",
              textDecoration: "none",
              fontWeight: 900,
              marginRight: 8,
              backgroundColor: "rgba(255,255,255,0.04)",
            }}
          >
            홈
          </Link>

          {nav.map((x) => {
            const active = pathname === x.href;

            const isRestricted =
              x.href === "/products" ||
              x.href === "/trade" ||
              x.href === "/tax" ||
              x.href === "/tax/spec" ||
              x.href === "/tax/statement";
            const disabled = isRestricted && !isAdmin;

            if (disabled) {
              return (
                <a
                  key={x.href}
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    alert("접근 권한이 없습니다.");
                  }}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 12,
                    borderWidth: 1,
                    borderStyle: "solid",
                    borderColor: active ? "rgba(255,255,255,0.40)" : "rgba(255,255,255,0.14)",
                    backgroundColor: active ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.02)",
                    color: "white",
                    textDecoration: "none",
                    fontWeight: 800,
                    opacity: 0.55,
                    cursor: "not-allowed",
                  }}
                >
                  {x.label}
                </a>
              );
            }

            return (
              <Link
                key={x.href}
                href={x.href}
                style={{
                  padding: "8px 10px",
                  borderRadius: 12,
                  borderWidth: 1,
                  borderStyle: "solid",
                  borderColor: active ? "rgba(255,255,255,0.40)" : "rgba(255,255,255,0.14)",
                  backgroundColor: active ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.02)",
                  color: "white",
                  textDecoration: "none",
                  fontWeight: 800,
                }}
              >
                {x.label}
              </Link>
            );
          })}

          {!!email && (
            <>
              <span
                style={{
                  marginLeft: "auto",
                  color: "rgba(255,255,255,0.70)",
                  fontWeight: 800,
                  fontSize: 12,
                }}
              >
                {email} {role ? `(${role})` : ""}
              </span>

              {/* ✅ 기존 로그아웃 버튼은 제거(상단 우측 고정 버튼으로 대체) */}
            </>
          )}
        </div>
      </div>
    </div>
  );
}