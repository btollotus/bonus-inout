import "./globals.css";
import TopNav from "@/components/TopNav";

export const metadata = {
  title: "재고관리 MVP",
  description: "BONUS In/Out",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body style={{ margin: 0, backgroundColor: "black", color: "white" }}>
        <TopNav />
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>{children}</div>
      </body>
    </html>
  );
}