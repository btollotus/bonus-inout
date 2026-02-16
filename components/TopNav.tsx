"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import React from "react";

const nav = [
  { href: "/scan", label: "스캔" },
  { href: "/products", label: "품목/바코드" },
  { href: "/report", label: "재고대장" },
  { href: "/ledger", label: "경리장부" },
  { href: "/orders", label: "주문/출고" },
  { href: "/trade", label: "거래내역(통합)" },
  { href: "/calendar", label: "출고 캘린더" },
];

export default function TopNav() {
  const pathname = usePathname();

  // ✅ /tax/statement 에서는 상단 검은 영역(TopNav) 완전 숨김
  if (pathname?.startsWith("/tax/statement")) return null;

  return (
    <div
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
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "10px 16px" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
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
        </div>
      </div>
    </div>
  );
}