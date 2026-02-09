export default function CalendarPage() {
    return (
      <main className="min-h-screen bg-black text-white p-6">
        <h1 className="text-2xl font-semibold">출고 캘린더</h1>
        <p className="text-white/60 mt-2">
          orders.ship_date(출고예정/확정일) 기준으로 월간 캘린더를 보여줄 예정입니다.
        </p>
      </main>
    );
  }