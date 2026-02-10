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
        {/* ✅ 전체 폭을 쓰되, 컨텐츠는 같은 컨테이너에서 정렬 */}
        <div style={{ width: "100%" }}>
          <div
            style={{
              maxWidth: 1400, // 1200이 좁으면 1400~1600 추천
              margin: "0 auto",
              width: "100%",
              padding: "0 24px", // ✅ 체감상 좌우 균형 잡아줌
            }}
          >
            <TopNav />
            <div style={{ paddingTop: 16 }}>{children}</div>
          </div>
        </div>
      </body>
    </html>
  );
}