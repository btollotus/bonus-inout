import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { name, birthdate, mobile } = await req.json();

  // 입력값 검증
  if (!name?.trim() || !birthdate?.trim() || !mobile?.trim()) {
    return NextResponse.json(
      { error: "이름, 생년월일, 휴대폰 번호를 모두 입력해주세요." },
      { status: 400 }
    );
  }

  // 생년월일 형식 검증 (6자리 숫자)
  const birthdateClean = birthdate.replace(/[^0-9]/g, "");
  if (birthdateClean.length !== 6) {
    return NextResponse.json(
      { error: "생년월일은 6자리 숫자로 입력해주세요. (예: 901225)" },
      { status: 400 }
    );
  }

  // 휴대폰 하이픈 제거
  const mobileClean = mobile.replace(/[^0-9]/g, "");

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // employees 테이블에서 이름 + 휴대폰으로 1차 조회
  const { data: employees, error } = await adminClient
    .from("employees")
    .select("id, name, email, mobile, encrypted_rrn")
    .eq("name", name.trim())
    .not("email", "is", null);

  if (error) {
    return NextResponse.json({ error: "조회 중 오류가 발생했습니다." }, { status: 500 });
  }

  if (!employees || employees.length === 0) {
    return NextResponse.json(
      { error: "입력하신 정보와 일치하는 계정을 찾을 수 없습니다." },
      { status: 404 }
    );
  }

  // 휴대폰 번호로 필터링
  const mobileMatch = employees.filter((emp) => {
    const empMobile = (emp.mobile || "").replace(/[^0-9]/g, "");
    return empMobile === mobileClean;
  });

  if (mobileMatch.length === 0) {
    return NextResponse.json(
      { error: "입력하신 정보와 일치하는 계정을 찾을 수 없습니다." },
      { status: 404 }
    );
  }

  // 주민번호 앞 6자리로 최종 검증
  // encrypted_rrn이 있는 경우 복호화 후 앞 6자리 비교
  let verified = false;
  let foundEmail = "";

  for (const emp of mobileMatch) {
    if (!emp.encrypted_rrn) {
      // 주민번호 없으면 이름+휴대폰만으로 통과 (관리자가 미입력한 경우)
      verified = true;
      foundEmail = emp.email;
      break;
    }

    // 복호화 API 호출
    try {
      const decryptRes = await fetch(
        `${process.env.NEXT_PUBLIC_SITE_URL}/api/admin/decrypt-rrn`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ empId: emp.id, _internal: process.env.SUPABASE_SERVICE_ROLE_KEY }),
        }
      );
      const decryptData = await decryptRes.json();

      if (decryptData.rrn) {
        const rrnFirst6 = decryptData.rrn.replace(/-/g, "").slice(0, 6);
        if (rrnFirst6 === birthdateClean) {
          verified = true;
          foundEmail = emp.email;
          break;
        }
      }
    } catch {
      // 복호화 실패 시 이름+휴대폰만으로 통과
      verified = true;
      foundEmail = emp.email;
      break;
    }
  }

  if (!verified || !foundEmail) {
    return NextResponse.json(
      { error: "입력하신 정보와 일치하는 계정을 찾을 수 없습니다." },
      { status: 404 }
    );
  }

  // 이메일 마스킹 처리 (보안: 일부만 노출)
  // 예: hong@company.com → ho**@company.com
  const [localPart, domain] = foundEmail.split("@");
  const maskedLocal =
    localPart.length <= 2
      ? localPart[0] + "*".repeat(localPart.length - 1)
      : localPart.slice(0, 2) + "*".repeat(localPart.length - 2);
  const maskedEmail = `${maskedLocal}@${domain}`;

  return NextResponse.json({ maskedEmail });
}
