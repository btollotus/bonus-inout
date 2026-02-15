import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";

function toNumberSafe(v: any) {
  const n = Number(String(v ?? "").replaceAll(",", "").trim());
  return Number.isFinite(n) ? n : 0;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  if (!from || !to) {
    return new NextResponse("from/to 파라미터가 필요합니다. 예: ?from=2026-02-01&to=2026-02-16", { status: 400 });
  }

  const supabase = createClient();

  // 1) 매출(orders)
  const { data: orders, error: e1 } = await supabase
    .from("orders")
    .select("id,customer_id,customer_name,title,ship_date,ship_method,status,memo,supply_amount,vat_amount,total_amount")
    .gte("ship_date", from)
    .lte("ship_date", to)
    .order("ship_date", { ascending: true })
    .limit(50000);

  if (e1) return new NextResponse(e1.message, { status: 500 });

  // 2) 매입(ledger_entries OUT)
  const { data: ledgers, error: e2 } = await supabase
    .from("ledger_entries")
    .select("id,entry_date,direction,category,method,counterparty_name,business_no,memo,supply_amount,vat_amount,total_amount,vat_type,vat_rate,amount")
    .gte("entry_date", from)
    .lte("entry_date", to)
    .eq("direction", "OUT")
    .order("entry_date", { ascending: true })
    .limit(200000);

  if (e2) return new NextResponse(e2.message, { status: 500 });

  // 엑셀 생성
  const wb = new ExcelJS.Workbook();
  wb.creator = "BONUSMATE";
  wb.created = new Date();

  // ---- 시트1: 통합요약(수식은 최소, 값 위주)
  const wsSummary = wb.addWorksheet("통합요약", { views: [{ state: "frozen", ySplit: 1 }] });
  wsSummary.addRow(["세무사용 통합요약"]);
  wsSummary.getRow(1).font = { bold: true, size: 14 };

  const sumOrders = (orders ?? []).reduce(
    (a: any, x: any) => {
      a.supply += toNumberSafe(x.supply_amount);
      a.vat += toNumberSafe(x.vat_amount);
      a.total += toNumberSafe(x.total_amount);
      return a;
    },
    { supply: 0, vat: 0, total: 0 }
  );

  const sumPurchase = (ledgers ?? []).reduce(
    (a: any, x: any) => {
      const total = toNumberSafe(x.total_amount ?? x.amount);
      const supply = x.supply_amount == null ? 0 : toNumberSafe(x.supply_amount);
      const vt = String(x.vat_type ?? "TAXED").toUpperCase();
      const vat = vt === "TAXED" ? (x.vat_amount == null ? 0 : toNumberSafe(x.vat_amount)) : 0;

      a.total += total;
      // 옵션2 컬럼이 채워진 건만 공급가/부가세 합산(정확성)
      if (x.total_amount != null && x.supply_amount != null && x.vat_amount != null) {
        a.supply += supply;
        a.vat += vat;
      }
      return a;
    },
    { supply: 0, vat: 0, total: 0 }
  );

  wsSummary.addRow(["기간 From", from]);
  wsSummary.addRow(["기간 To", to]);
  wsSummary.addRow([]);
  wsSummary.addRow(["매출 합계(orders)"]);
  wsSummary.addRow(["공급가", sumOrders.supply]);
  wsSummary.addRow(["부가세", sumOrders.vat]);
  wsSummary.addRow(["총액", sumOrders.total]);
  wsSummary.addRow([]);
  wsSummary.addRow(["매입 합계(ledger OUT)"]);
  wsSummary.addRow(["공급가(옵션2)", sumPurchase.supply]);
  wsSummary.addRow(["부가세(과세만)", sumPurchase.vat]);
  wsSummary.addRow(["총액", sumPurchase.total]);
  wsSummary.addRow([]);
  wsSummary.addRow(["예상 부가세(매출VAT-매입VAT)", sumOrders.vat - sumPurchase.vat]);

  // 숫자 포맷
  [6, 7, 8, 11, 12, 13, 15].forEach((r) => {
    const cell = wsSummary.getCell(r, 2);
    if (typeof cell.value === "number") cell.numFmt = "#,##0";
  });

  wsSummary.getColumn(1).width = 28;
  wsSummary.getColumn(2).width = 22;

  // ---- 시트2: 매출(orders)
  const wsSales = wb.addWorksheet("매출(orders)", { views: [{ state: "frozen", ySplit: 1 }] });
  wsSales.addRow(["출고일", "주문ID", "고객명", "품목/제목", "방법", "공급가", "부가세", "총액"]);
  wsSales.getRow(1).font = { bold: true };

  (orders ?? []).forEach((o: any) => {
    wsSales.addRow([
      o.ship_date,
      o.id,
      o.customer_name,
      o.title ?? "",
      o.ship_method ?? "",
      toNumberSafe(o.supply_amount),
      toNumberSafe(o.vat_amount),
      toNumberSafe(o.total_amount),
    ]);
  });

  ["F", "G", "H"].forEach((col) => {
    wsSales.getColumn(col).numFmt = "#,##0";
  });

  wsSales.columns.forEach((c) => (c.width = Math.max(c.width ?? 10, 14)));
  wsSales.getColumn(1).width = 12;
  wsSales.getColumn(2).width = 38;
  wsSales.getColumn(3).width = 18;
  wsSales.getColumn(4).width = 26;
  wsSales.getColumn(5).width = 10;

  // ---- 시트3: 매입(ledger_out)
  const wsBuy = wb.addWorksheet("매입(ledger_out)", { views: [{ state: "frozen", ySplit: 1 }] });
  wsBuy.addRow(["거래일", "전표ID", "매입처명", "사업자번호", "카테고리(내부)", "지급수단", "VAT유형", "공급가", "부가세(과세만)", "총액", "메모(내부)"]);
  wsBuy.getRow(1).font = { bold: true };

  (ledgers ?? []).forEach((l: any) => {
    const vt = String(l.vat_type ?? "TAXED").toUpperCase();
    const hasVatCols = l.total_amount != null && l.supply_amount != null && l.vat_amount != null;

    const supply = hasVatCols ? toNumberSafe(l.supply_amount) : 0;
    const vat = hasVatCols && vt === "TAXED" ? toNumberSafe(l.vat_amount) : 0;
    const total = toNumberSafe(l.total_amount ?? l.amount);

    wsBuy.addRow([
      l.entry_date,
      l.id,
      l.counterparty_name ?? "",
      l.business_no ?? "",
      l.category ?? "",
      l.method ?? "",
      vt,
      supply,
      vat,
      total,
      l.memo ?? "",
    ]);
  });

  ["H", "I", "J"].forEach((col) => {
    wsBuy.getColumn(col).numFmt = "#,##0";
  });

  wsBuy.getColumn(1).width = 12;
  wsBuy.getColumn(2).width = 38;
  wsBuy.getColumn(3).width = 18;
  wsBuy.getColumn(4).width = 16;
  wsBuy.getColumn(5).width = 14;
  wsBuy.getColumn(6).width = 12;
  wsBuy.getColumn(7).width = 12;
  wsBuy.getColumn(11).width = 24;

  // 파일 반환
  const buf = await wb.xlsx.writeBuffer();

  const filename = `세무사용_통합장부_${from}~${to}.xlsx`;
  return new NextResponse(buf as any, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}