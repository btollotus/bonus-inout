// lib/utils/date.ts

// KST 기준 오늘 날짜를 YYYY-MM-DD로 반환
export const todayKST = (): string => {
    const d = new Date(new Date().toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }));
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  
  // UTC 문자열을 KST 기준 YYYY-MM-DD로 변환 (DB에서 가져온 날짜 표시 시 사용)
  export const utcToKSTDate = (utcStr: string): string => {
    const d = new Date(new Date(utcStr).toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }));
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };