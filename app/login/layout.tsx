import "../globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "로그인" };

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body
        style={{
          margin: 0,
          backgroundColor: "black",
          color: "white",
          minHeight: "100vh",
        }}
      >
        <main style={{ width: "100%" }}>{children}</main>
      </body>
    </html>
  );
}