import AuthGate from "@/components/AuthGate";
import LogoutButton from "@/components/LogoutButton";

export default function HomePage() {
  return (
    <AuthGate>
      <main className="min-h-screen bg-black text-white p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">재고관리 MVP</h1>
          <LogoutButton />
        </div>

        <p className="text-white/60 mt-2">
          로그인 성공. 아래 메뉴에서 원하는 기능을 선택하세요.
        </p>

        {/* ✅ 버튼 영역 */}
        <div className="mt-6 flex flex-wrap gap-3">
          <a
            href="/scan"
            className="inline-flex rounded-xl bg-white text-black px-4 py-2 font-medium"
          >
            스캔 화면으로
          </a>

          <a
            href="/products"
            className="inline-flex rounded-xl border border-white/15 px-4 py-2"
          >
            품목/바코드 등록
          </a>

          <a
            href="/report"
            className="inline-flex rounded-xl border border-white/15 px-4 py-2"
          >
            재고대장(리포트)
          </a>

          {/* ✅ 새 구조: 주문/출고 */}
          <a
            href="/orders"
            className="inline-flex rounded-xl border border-white/15 px-4 py-2"
          >
            주문/출고
          </a>

          {/* ✅ 새 구조: 경리장부(통합장부) */}
          <a
            href="/ledger"
            className="inline-flex rounded-xl border border-white/15 px-4 py-2"
          >
            경리장부(통합장부)
          </a>

          <a
            href="/calendar"
            className="inline-flex rounded-xl border border-white/15 px-4 py-2"
          >
            출고 캘린더
          </a>
        </div>
      </main>
    </AuthGate>
  );
}