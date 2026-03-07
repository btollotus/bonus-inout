import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

// RRN 복호화 (decrypt-rrn API와 동일한 로직 직접 구현)
function decryptRRN(encrypted: string): string | null {
  try {
    const key = process.env.RRN_ENCRYPTION_KEY;
    if (!key) return null;

    const keyBuffer = Buffer.from(key, "hex");
    const data = Buffer.from(encrypted, "base64");
    const iv = data.slice(0, 16);
    const encryptedData = data.slice(16);

    const decipher = crypto.createDecipheriv("aes-256-cbc", keyBuffer, iv);
    let decrypted = decipher.update(encryptedData);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString("utf8");
  } catch {
    return null;
  }
}

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
      .select("id, name, email, mobile, encrypted_rrn")
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

    // 주민번호 앞 6자리 검증 (직접 복호화)
    let foundEmail = "";

    for (const emp of mobileMatch) {
      if (!emp.encrypted_rrn) {
        // 주민번호 미등록 → 이름+휴대폰만으로 통과
        foundEmail = emp.email;
        break;
      }

      // 직접 복호화
      const rrn = decryptRRN(emp.encrypted_rrn);
      if (!rrn) {
        // 복호화 실패 → 이름+휴대폰만으로 통과
        foundEmail = emp.email;
        break;
      }

      const rrnFirst6 = rrn.replace(/-/g, "").slice(0, 6);
      if (rrnFirst6 === birthdateClean) {
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
