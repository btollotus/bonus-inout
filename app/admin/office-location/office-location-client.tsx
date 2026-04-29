"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

export default function OfficeLocationClient() {
  const supabase = useMemo(() => createClient(), []);

  const [saved, setSaved] = useState<{
    latitude: number; longitude: number; radius_m: number; name: string;
  } | null>(null);
  const [radius, setRadius] = useState(100);
  const [status, setStatus] = useState<{ type: "idle"|"ok"|"err"|"warn"; msg: string }>
    ({ type: "idle", msg: "" });
  const [loading, setLoading] = useState(false);

  const input = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300";
  const btnOn = "rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 active:scale-95 disabled:opacity-50 transition-all";

  const statusStyle = {
    idle: "bg-slate-50 border-slate-200 text-slate-500",
    ok:   "bg-green-50 border-green-200 text-green-700",
    err:  "bg-red-50 border-red-200 text-red-700",
    warn: "bg-amber-50 border-amber-200 text-amber-700",
  }[status.type];

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const { data } = await supabase
      .from("office_location")
      .select("*")
      .single();
    if (data) {
      setSaved(data);
      setRadius(data.radius_m);
    }
  }

  async function registerCurrentLocation() {
    if (!navigator.geolocation) {
      setStatus({ type: "err", msg: "이 브라우저는 GPS를 지원하지 않습니다." });
      return;
    }
    setLoading(true);
    setStatus({ type: "warn", msg: "현재 위치 확인 중..." });

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        try {
          // 기존 레코드 있으면 update, 없으면 insert
          const { data: existing } = await supabase
            .from("office_location")
            .select("id")
            .single();

          let error;
          if (existing?.id) {
            ({ error } = await supabase
              .from("office_location")
              .update({ latitude, longitude, radius_m: radius, updated_at: new Date().toISOString() })
              .eq("id", existing.id));
          } else {
            ({ error } = await supabase
              .from("office_location")
              .insert({ latitude, longitude, radius_m: radius }));
          }

          if (error) throw new Error(error.message);

          setStatus({ type: "ok", msg: `회사 위치 등록 완료 — ${latitude.toFixed(5)}, ${longitude.toFixed(5)} (반경 ${radius}m)` });
          await load();
        } catch (e: any) {
          setStatus({ type: "err", msg: "저장 실패: " + e.message });
        } finally {
          setLoading(false);
        }
      },
      () => {
        setStatus({ type: "err", msg: "위치 권한을 허용해주세요." });
        setLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-lg mx-auto rounded-2xl border border-slate-200 bg-white shadow-sm p-6">
        <div className="text-lg font-bold text-slate-800 mb-1">회사 위치 등록</div>
        <div className="text-xs text-slate-400 mb-6">
          출퇴근 기록 시 위치 검증 기준점입니다. 회사에서 접속한 상태로 등록해주세요.
        </div>

        {/* 현재 등록된 위치 */}
        {saved ? (
          <div className="mb-6 rounded-xl border border-green-200 bg-green-50 p-4">
            <div className="text-xs font-semibold text-green-700 mb-2">현재 등록된 위치</div>
            <div className="text-sm text-green-800 font-mono">
              {saved.latitude.toFixed(5)}, {saved.longitude.toFixed(5)}
            </div>
            <div className="text-xs text-green-600 mt-1">허용 반경: {saved.radius_m}m</div>
          </div>
        ) : (
          <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
            아직 회사 위치가 등록되지 않았습니다.
          </div>
        )}

        {/* 허용 반경 설정 */}
        <div className="mb-4">
          <div className="text-xs font-semibold text-slate-700 mb-1">
            허용 반경: <span className="text-blue-600">{radius}m</span>
          </div>
          <input
            type="range"
            min={50} max={300} step={10}
            value={radius}
            onChange={e => setRadius(Number(e.target.value))}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-slate-400 mt-1">
            <span>50m</span>
            <span>300m</span>
          </div>
        </div>

        {/* 등록 버튼 */}
        <button
          className={btnOn + " w-full py-3"}
          onClick={registerCurrentLocation}
          disabled={loading}
        >
          {loading ? "위치 확인 중..." : saved ? "현재 위치로 업데이트" : "현재 위치로 등록"}
        </button>

        {/* 상태 메시지 */}
        {status.msg && (
          <div className={`mt-4 rounded-xl border px-4 py-3 text-sm ${statusStyle}`}>
            {status.msg}
          </div>
        )}

        <div className="mt-4 text-xs text-slate-400">
          ※ 반드시 회사 내에서 등록해주세요. 직원 출퇴근 시 이 위치 기준으로 거리를 계산합니다.
        </div>
      </div>
    </div>
  );
}