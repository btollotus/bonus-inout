import type { Metadata } from "next";
import { Suspense } from "react";
import Client from "./_client";

export const metadata: Metadata = {
  title: "내 계정 | BONUSMATE ERP",
};

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64 text-gray-500 text-sm">로딩 중...</div>}>
      <Client />
    </Suspense>
  );
}