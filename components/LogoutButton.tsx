"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

export default function LogoutButton() {
  const supabase = createClient();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const onLogout = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await supabase.auth.signOut();
      router.replace("/login");
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={onLogout}
      disabled={loading}
      className="rounded-md px-3 py-2 text-sm bg-white/10 text-white border border-white/10 hover:bg-white/15 disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {loading ? "로그아웃 중..." : "로그아웃"}
    </button>
  );
}