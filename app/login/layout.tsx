import type { Metadata } from "next";

export const metadata: Metadata = { title: "로그인" };

// html/body는 app/layout.tsx에서 처리
// 로그인 페이지는 TopNavWrapper가 숨겨주므로 여기선 배경색만 오버라이드
export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#f9fafb" }}>
      {children}
    </div>
  );
}
