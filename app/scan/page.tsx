import AuthGate from "@/components/AuthGate";
import ScanClient from "./scan-client";

export const metadata = {
  title: "품목/바코드",
};

export default function ScanPage() {
  return (
    <AuthGate>
      <ScanClient />
    </AuthGate>
  );
}
