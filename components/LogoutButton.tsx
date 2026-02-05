"use client";

import { createClient } from "@/lib/supabase/browser";

export default function LogoutButton() {
  const supabase = createClient();
  return (
    <button
      className="rounded-xl bg-white text-black px-3 py-2 text-sm font-medium"
      onClick={async () => {
        await supabase.auth.signOut();
        location.href = "/login";
      }}
    >
      로그아웃
    </button>
  );
}
