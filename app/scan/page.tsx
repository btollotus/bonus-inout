// app/scan/page.tsx
// /scan → /inventory 로 redirect (기존 북마크/링크 호환)

import { redirect } from "next/navigation";

export default function ScanPage() {
  redirect("/inventory");
}
