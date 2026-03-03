"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

function codeToAscii(code: string, shift: boolean, caps: boolean) {
  const upper = shift !== caps;

  if (code.startsWith("Numpad")) {
    const n = code.replace("Numpad", "");
    if (/^\d$/.test(n)) return n;
  }

  if (code.startsWith("Key")) {
    const ch = code.slice(3);
    return upper ? ch : ch.toLowerCase();
  }

  if (code.startsWith("Digit")) {
    return code.slice(5);
  }

  if (code === "Minus") {
    return shift ? "_" : "-";
  }

  return null;
}

type VariantRow = {
  variant_id: string;
  product_id: string;
  product_name: string;
  product_category: string | null;
  variant_name: string;
  barcode: string;
  pack_unit: number;
};

const CATEGORIES = ["기성", "업체", "전사지"] as const;

function hangulToQwerty(input: string) {
  const CONS: Record<string, string> = {
    ㄱ: "r", ㄲ: "R", ㄴ: "s", ㄷ: "e", ㄸ: "E", ㄹ: "f",
    ㅁ: "a", ㅂ: "q", ㅃ: "Q", ㅅ: "t", ㅆ: "T", ㅇ: "d",
    ㅈ: "w", ㅉ: "W", ㅊ: "c", ㅋ: "z", ㅌ: "x", ㅍ: "v", ㅎ: "g",
  };

  const VOW: Record<string, string> = {
    ㅏ: "k", ㅐ: "o", ㅑ: "i", ㅒ: "O",
    ㅓ: "j", ㅔ: "p", ㅕ: "u", ㅖ: "P",
    ㅗ: "h", ㅘ: "hk", ㅙ: "ho", ㅚ: "hl",
    ㅛ: "y", ㅜ: "n", ㅝ: "nj", ㅞ: "np",
    ㅟ: "nl", ㅠ: "b", ㅡ: "m", ㅢ: "ml", ㅣ: "l",
  };

  const JONG: Record<string, string> = {
    "": "", ㄱ: "r", ㄲ: "R", ㄳ: "rt", ㄴ: "s", ㄵ: "sw",
    ㄶ: "sg", ㄷ: "e", ㄹ: "f", ㄺ: "fr", ㄻ: "fa",
    ㄼ: "fq", ㄽ: "ft", ㄾ: "fx", ㄿ: "fv", ㅀ: "fg",
    ㅁ: "a", ㅂ: "q", ㅄ: "qt", ㅅ: "t", ㅆ: "T",
    ㅇ: "d", ㅈ: "w", ㅊ: "c", ㅋ: "z", ㅌ: "x",
    ㅍ: "v", ㅎ: "g",
  };

  const CHO = ["ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];
  const JUNG = ["ㅏ","ㅐ","ㅑ","ㅒ","ㅓ","ㅔ","ㅕ","ㅖ","ㅗ","ㅘ","ㅙ","ㅚ","ㅛ","ㅜ","ㅝ","ㅞ","ㅟ","ㅠ","ㅡ","ㅢ","ㅣ"];
  const JONG_LIST = ["","ㄱ","ㄲ","ㄳ","ㄴ","ㄵ","ㄶ","ㄷ","ㄹ","ㄺ","ㄻ","ㄼ","ㄽ","ㄾ","ㄿ","ㅀ","ㅁ","ㅂ","ㅄ","ㅅ","ㅆ","ㅇ","ㅈ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];

  const out: string[] = [];

  for (const ch of input) {
    if (CONS[ch]) { out.push(CONS[ch]); continue; }
    if (VOW[ch]) { out.push(VOW[ch]); continue; }

    const code = ch.charCodeAt(0);
    if (code >= 0xac00 && code <= 0xd7a3) {
      const sIndex = code - 0xac00;
      const cho = Math.floor(sIndex / (21 * 28));
      const jung = Math.floor((sIndex % (21 * 28)) / 28);
      const jong = sIndex % 28;

      out.push(CONS[CHO[cho]] ?? "");
      out.push(VOW[JUNG[jung]] ?? "");
      out.push(JONG[JONG_LIST[jong]] ?? "");
      continue;
    }

    out.push(ch);
  }

  return out.join("");
}

export default function ProductsClient() {
  const supabase = useMemo(() => createClient(), []);
  const barcodeRef = useRef<HTMLInputElement>(null);

  const [isScanMode, setIsScanMode] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [rows, setRows] = useState<VariantRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");

  const pageBg = "bg-slate-50 text-slate-900";
  const card = "rounded-2xl border border-slate-200 bg-white shadow-sm";
  const input =
    "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300";
  const btn =
    "rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 active:bg-slate-200";
  const btnPrimary =
    "rounded-xl bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 active:bg-blue-800";

  return (
    <div className={`${pageBg} min-h-screen p-6`}>
      <div className="mx-auto max-w-6xl">

        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">제품명/바코드 등록</h1>
          <div className="flex gap-2">
            <a className={btn} href="/scan">스캔</a>
            <a className={btn} href="/">홈</a>
          </div>
        </div>

        <p className="text-slate-600 mt-2">
          제품명 + 식품유형 + 바코드 + 수량을 등록합니다. (바코드는 중복 불가)
        </p>

        <div className={`${card} mt-6 p-6 max-w-3xl`}>
          {msg && (
            <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
              {msg}
            </div>
          )}

          <div className="flex gap-2">
            <button className={btnPrimary} disabled={loading}>
              {loading ? "저장 중..." : "등록"}
            </button>
            <button className={btn}>새로고침</button>
          </div>
        </div>

        <div className={`${card} mt-10 p-6`}>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">등록 목록</h2>
            <input
              className="w-full max-w-sm rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="검색(제품명/구분/식품유형/바코드/수량)"
            />
          </div>

          <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-100 text-slate-600">
                <tr>
                  <th className="text-left p-3">제품명</th>
                  <th className="text-left p-3">구분</th>
                  <th className="text-left p-3">식품유형</th>
                  <th className="text-left p-3">바코드</th>
                  <th className="text-right p-3">수량</th>
                  <th className="text-right p-3">관리</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={6} className="p-6 text-center text-slate-500">
                    등록된 데이터가 없습니다.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <p className="text-xs text-slate-500 mt-3">
            ※ 바코드는 유니크입니다. 같은 바코드를 다시 등록하면 해당 바코드의 식품유형/수량이 갱신됩니다.
          </p>
        </div>
      </div>
    </div>
  );
}