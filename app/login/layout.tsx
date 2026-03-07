import type { Metadata } from "next";

export const metadata: Metadata = { title: "로그인" };

// html/body는 app/layout.tsx에서 처리 - 여기선 children만 렌더링
export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
