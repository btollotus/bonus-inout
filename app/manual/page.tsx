import type { Metadata } from "next";
import ManualClient from "./manual-client";

export const metadata: Metadata = { title: "메뉴얼" };

export default function ManualPage() {
  return <ManualClient />;
}