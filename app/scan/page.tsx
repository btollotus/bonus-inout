import AuthGate from "@/components/AuthGate";
import ScanClient from "./scan-client";

export default function ScanPage() {
  return (
    <AuthGate>
      <ScanClient />
    </AuthGate>
  );
}
