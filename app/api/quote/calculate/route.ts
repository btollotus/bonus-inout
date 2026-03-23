import { NextRequest, NextResponse } from "next/server";
import { calculateQuote, calculateSheetQuote } from "@/lib/quoteCalculator";

/**
 * POST /api/quote/calculate
 *
 * 초콜릿 제작 견적 계산 API
 *
 * Body (제품 견적):
 * {
 *   type?: "product",           // 생략 시 product
 *   productKey: string,         // 예: "전사3mm"
 *   width: number,              // 가로 (mm)
 *   height: number,             // 세로 (mm)
 *   quantity: number,           // 수량
 *   isNew?: boolean,            // 신규 여부 (default: true)
 *   designChanged?: boolean,    // 디자인 변경 재주문 (default: false)
 *   useStockMold?: boolean,     // 기성 성형틀 사용 (default: false)
 *   reuseExistingMold?: boolean,// 타 제품 성형틀 재사용 (default: false)
 *   moldQty?: number,           // 성형틀 수량 (default: 1)
 * }
 *
 * Body (전사지 단독 견적):
 * {
 *   type: "sheet",
 *   sheets: number,             // 전사지 장수 (최소 5)
 *   isNew?: boolean,            // 신규 여부 (default: true)
 * }
 *
 * Response: 계산 결과 JSON
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const type = body.type ?? "product";

    // ── 전사지 단독 계산 ──────────────────────────────
    if (type === "sheet") {
      const sheets = Number(body.sheets);
      const isNew  = body.isNew !== false;

      if (!sheets || sheets < 1) {
        return NextResponse.json({ error: "전사지 장수를 입력하세요." }, { status: 400 });
      }

      const result = calculateSheetQuote({ sheets, isNew });
      return NextResponse.json(result);
    }

    // ── 제품 견적 계산 ───────────────────────────────
    const {
      productKey,
      width,
      height,
      quantity,
      isNew             = true,
      designChanged     = false,
      useStockMold      = false,
      reuseExistingMold = false,
      moldQty           = 1,
    } = body;

    if (!productKey) {
      return NextResponse.json({ error: "productKey가 필요합니다." }, { status: 400 });
    }
    if (!quantity || quantity < 1) {
      return NextResponse.json({ error: "수량을 올바르게 입력하세요." }, { status: 400 });
    }

    const result = calculateQuote(productKey, {
      width:   Number(width)   || 0,
      height:  Number(height)  || 0,
      quantity: Number(quantity),
      isNew,
      designChanged,
      useStockMold,
      reuseExistingMold,
      moldQty: Number(moldQty) || 1,
    });

    return NextResponse.json(result);

  } catch (err: any) {
    // 알 수 없는 제품 키 등 계산 엔진 에러
    return NextResponse.json(
      { error: err?.message ?? "계산 중 오류가 발생했습니다." },
      { status: 400 }
    );
  }
}
