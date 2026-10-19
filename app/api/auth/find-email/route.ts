import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

// RRN 복호화 (decrypt-rrn API와 동일한 로직 직접 구현)
function decryptRRN(encrypted: string): string | null {
  try {
    const key = process.env.RRN_ENCRYPTION_KEY;
    if (!key) return null;

        // encrypt-rrn 저장 형식(aes-256-gcm, "iv:authTag:암호문" hex)과 동일하게 복호화
        const [ivHex, authTagHex, encryptedHex] = encrypted.split(":");
        if (!ivHex || !authTagHex || !encryptedHex) return null;
    
        const decipher = crypto.createDecipheriv("aes-256-gcm", Buffer.from(key, "hex"), Buffer.from(ivHex, "hex"));
        decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
        let decrypted = decipher.update(encryptedHex, "hex", "utf8");
        decrypted += decipher.final("utf8");
        return decrypted;
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

        // 개인정보(휴대폰·주민번호 암호화본)는 employee_private에서 조회
        const { data: privRows, error: privError } = await adminClient
        .from("employee_private")
        .select("employee_id, mobile, encrypted_rrn")
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

    // 주민번호 앞 6자리 검증 (직접 복호화)
    let foundEmail = "";

    for (const emp of mobileMatch) {
      const encryptedRrn = privMap.get(emp.id)?.encrypted_rrn;
      if (!encryptedRrn) {
        // 주민번호 미등록 → 이름+휴대폰만으로 통과
        foundEmail = emp.email;
        break;
      }

      // 직접 복호화
      const rrn = decryptRRN(encryptedRrn);
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
