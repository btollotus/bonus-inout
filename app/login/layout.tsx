import "../globals.css";

export const metadata = {
  title: "BONUSMATE ERP-로그인",
};

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