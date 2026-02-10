"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

type FoodTypeRow = {
  id: string;
  name: string;
  is_active: boolean;
  sort_order: number;
};

export default function FoodTypeCombobox(props: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const { value, onChange, placeholder, disabled, className } = props;
  const supabase = useMemo(() => createClient(), []);

  const [all, setAll] = useState<FoodTypeRow[]>([]);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(value ?? "");
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setQ(value ?? "");
  }, [value]);

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      setMsg(null);

      const { data, error } = await supabase
        .from("food_types")
        .select("id,name,is_active,sort_order")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });

      if (!alive) return;
      setLoading(false);

      if (error) {
        setMsg(error.message);
        setAll([]);
        return;
      }
      setAll((data ?? []) as FoodTypeRow[]);
    })();

    return () => {
      alive = false;
    };
  }, [supabase]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const filtered = useMemo(() => {
    const s = (q ?? "").trim().toLowerCase();
    if (!s) return all.slice(0, 12);
    return all.filter((x) => x.name.toLowerCase().includes(s)).slice(0, 12);
  }, [all, q]);

  const exactExists = useMemo(() => {
    const s = (q ?? "").trim().toLowerCase();
    if (!s) return false;
    return all.some((x) => x.name.toLowerCase() === s);
  }, [all, q]);

  async function addNew() {
    const name = (q ?? "").trim();
    if (!name) return;

    setAdding(true);
    setMsg(null);

    const { data, error } = await supabase
      .from("food_types")
      .insert([{ name, is_active: true }])
      .select("id,name,is_active,sort_order")
      .single();

    setAdding(false);

    if (error) {
      setMsg(error.message);
      return;
    }

    const row = data as FoodTypeRow;
    setAll((prev) => {
      if (prev.some((x) => x.name === row.name)) return prev;
      return [...prev, row].sort((a, b) => {
        if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
        return a.name.localeCompare(b.name);
      });
    });

    onChange(row.name);
    setQ(row.name);
    setOpen(false);
  }

  return (
    <div ref={wrapRef} className={`relative ${className ?? ""}`}>
      <input
        value={q}
        disabled={disabled}
        placeholder={placeholder ?? "예: 당류가공품, 과자…"}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          const v = e.target.value;
          setQ(v);
          setOpen(true);
          onChange(v); // 입력 중에도 값 반영(원하면 선택 시점만 반영으로 변경 가능)
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
        className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
      />

      {open && (
        <div className="absolute z-50 mt-2 w-full overflow-hidden rounded-md border border-white/10 bg-[#0b0b0b] shadow-xl">
          <div className="px-3 py-2 text-xs text-white/60 flex items-center justify-between gap-2">
            <span>{loading ? "불러오는 중…" : `추천 ${filtered.length}개`}</span>

            {!exactExists && (q ?? "").trim() ? (
              <button
                type="button"
                onClick={addNew}
                disabled={adding}
                className="rounded-md bg-white/10 px-2 py-1 text-xs text-white hover:bg-white/15 disabled:opacity-50"
                title="새 식품유형 등록"
              >
                {adding ? "등록 중…" : `“${(q ?? "").trim()}” 등록`}
              </button>
            ) : null}
          </div>

          {msg ? (
            <div className="px-3 pb-3 text-xs text-red-300">{msg}</div>
          ) : null}

          <div className="max-h-64 overflow-auto">
            {filtered.map((x) => (
              <button
                key={x.id}
                type="button"
                onClick={() => {
                  onChange(x.name);
                  setQ(x.name);
                  setOpen(false);
                }}
                className="block w-full text-left px-3 py-2 text-sm text-white hover:bg-white/10"
              >
                {x.name}
              </button>
            ))}

            {!loading && filtered.length === 0 ? (
              <div className="px-3 py-3 text-sm text-white/60">
                검색 결과가 없습니다.
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}