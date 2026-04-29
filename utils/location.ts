// utils/location.ts

/** 두 좌표 사이 거리 계산 (미터) */
export function getDistanceMeters(
    lat1: number, lon1: number,
    lat2: number, lon2: number
  ): number {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * Math.PI / 180) *
      Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) ** 2;
    return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  }
  
  /** 현재 GPS 좌표 가져오기 */
  export function getCurrentPosition(): Promise<GeolocationPosition> {
    return new Promise((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 10000,
      })
    );
  }
  
  /** UTC 문자열을 KST 날짜 문자열로 변환 */
export function utcToKSTDate(utcStr: string): string {
  const d = new Date(new Date(utcStr).toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }));
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

/** KST 기준 오늘 날짜 문자열 (YYYY-MM-DD) */
  export function todayKST(): string {
    const d = new Date(
      new Date().toLocaleString("sv-SE", { timeZone: "Asia/Seoul" })
    );
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  
  /** 현재 시각을 KST +09:00 ISO 문자열로 반환 */
  export function nowKSTIso(): string {
    return new Date(Date.now() + 9 * 60 * 60 * 1000)
      .toISOString()
      .replace("Z", "+09:00");
  }