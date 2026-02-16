import StatementClient from "./statement-client";

export default function Page({
  searchParams,
}: {
  searchParams?: { [key: string]: string | string[] | undefined };
}) {
  const partnerId = String(searchParams?.partner_id ?? "");
  const from = String(searchParams?.from ?? "");
  const to = String(searchParams?.to ?? "");

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <StatementClient partnerId={partnerId} from={from} to={to} />
    </div>
  );
}