import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { name, birthdate, mobile } = await req.json();

    // 입력값 검증
    if (!name?.trim() || !birthdate?.trim() || !mobile?.trim()) {
      return NextResponse.json(
        { error: "이름, 생년월일, 휴대폰 번호를 모두 입력해주세요." },
        { status: 400 }
      );
    }

    const birthdateClean = birthdate.replace(/[^0-9]/g, "");
    if (birthdateClean.length !== 6) {
      return NextResponse.json(
        { error: "생년월일은 6자리 숫자로 입력해주세요. (예: 901225)" },
        { status: 400 }
      );
    }

    const mobileClean = mobile.replace(/[^0-9]/g, "");

    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 이름으로 1차 조회
    const { data: employees, error } = await adminClient
      .from("employees")
      .select("id, name, email")
      .eq("name", name.trim())
      .not("email", "is", null);

    if (error) {
      console.error("DB 조회 오류:", error);
      return NextResponse.json({ error: "조회 중 오류가 발생했습니다." }, { status: 500 });
    }

    if (!employees || employees.length === 0) {
      return NextResponse.json(
        { error: "입력하신 정보와 일치하는 계정을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

        // 개인정보(휴대폰·생년월일)는 employee_private에서 조회
        const { data: privRows, error: privError } = await adminClient
        .from("employee_private")
        .select("employee_id, mobile, birth_date")
        .in("employee_id", employees.map((emp) => emp.id));
  
      if (privError) {
        console.error("employee_private 조회 오류:", privError);
        return NextResponse.json({ error: "조회 중 오류가 발생했습니다." }, { status: 500 });
      }
  
      const privMap = new Map((privRows ?? []).map((p) => [p.employee_id, p]));
  
      // 휴대폰 번호로 필터링
      const mobileMatch = employees.filter((emp) => {
        const empMobile = (privMap.get(emp.id)?.mobile || "").replace(/[^0-9]/g, "");
      return empMobile === mobileClean;
    });

    if (mobileMatch.length === 0) {
      return NextResponse.json(
        { error: "입력하신 정보와 일치하는 계정을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

        // 생년월일(양력, employee_private.birth_date) 검증
    // birth_date가 비어 있으면 통과시키지 않음 (이름+휴대폰만으로는 찾을 수 없음)
    let foundEmail = "";

    for (const emp of mobileMatch) {
      const birthDate = privMap.get(emp.id)?.birth_date as string | null | undefined;
      if (!birthDate) continue;

      // date 타입은 'YYYY-MM-DD' 문자열 → 'YYMMDD'로 변환해 비교
      const yymmdd = birthDate.replace(/-/g, "").slice(2, 8);
      if (yymmdd === birthdateClean) {
        foundEmail = emp.email;
        break;
      }
    }

    if (!foundEmail) {
      return NextResponse.json(
        { error: "입력하신 정보와 일치하는 계정을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    // 이메일 마스킹 (ho**@company.com)
    const atIdx = foundEmail.lastIndexOf("@");
    const localPart = foundEmail.slice(0, atIdx);
    const domain = foundEmail.slice(atIdx + 1);
    const maskedLocal =
      localPart.length <= 2
        ? localPart[0] + "*".repeat(localPart.length - 1)
        : localPart.slice(0, 2) + "*".repeat(localPart.length - 2);

    return NextResponse.json({ maskedEmail: `${maskedLocal}@${domain}` });

  } catch (err) {
    console.error("find-email 오류:", err);
    return NextResponse.json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
