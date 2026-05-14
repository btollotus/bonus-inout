import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DeletedClient from "./deleted-client";

export default async function DeletedWorkOrdersPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: roleData } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  const role = roleData?.role ?? "USER";
  if (role !== "ADMIN" && role !== "SUBADMIN") redirect("/production");

  return <DeletedClient role={role} />;
}