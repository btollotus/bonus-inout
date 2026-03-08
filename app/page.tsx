import type { Metadata } from "next";
export const metadata: Metadata = { title: "홈 | BONUSMATE ERP" };

export default function HomePage() {
  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <div className="flex items-center gap-3 mb-2">
            <img src="/bonusmate-logo.png" alt="BONUSMATE" style={{ height: 40, width: "auto" }} />
            <h1 className="text-xl font-bold text-gray-900">BONUSMATE ERP</h1>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            로그인되었습니다. 상단 메뉴에서 원하는 기능을 선택하세요.
          </p>
        </div>
      </div>
    </main>
  );
}
