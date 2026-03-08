import "./globals.css";
import TopNavWrapper from "@/components/TopNavWrapper";
import type { Metadata } from "next";
import { cookies, headers } from "next/headers";

export const metadata: Metadata = {
  title: { default: "BONUSMATE ERP", template: "%s | BONUSMATE ERP" },
};

async function getMe(): Promise<{ role: string; email: string }> {
  try {
    const headerStore = await headers();
    const host = headerStore.get("host") ?? "";
    const protocol = host.includes("localhost") ? "http" : "https";
    const cookieStore = await cookies();
    const cookieHeader = cookieStore.getAll()
      .map(({ name, value }) => `${name}=${value}`)
      .join("; ");

    const res = await fetch(`${protocol}://${host}/api/me`, {
      headers: { cookie: cookieHeader },
      cache: "no-store",
    });

    if (!res.ok) return { role: "USER", email: "" };
    return await res.json();
  } catch {
    return { role: "USER", email: "" };
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { role, email } = await getMe();

  return (
    <html lang="ko">
      <body style={{ margin: 0, backgroundColor: "#f9fafb", color: "#111", minHeight: "100vh" }}>
        <TopNavWrapper role={role} email={email} />
        <main style={{ width: "100%" }}>{children}</main>
      </body>
    </html>
  );
}
