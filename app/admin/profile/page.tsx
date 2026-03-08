import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import ProfileClient from "./ProfileClient";
import { SignatureConfig } from "@/types";

export default async function AdminProfilePage() {
  const supabase = await createClient();

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) redirect("/auth");

  const { data: admin } = await supabase
    .from("users")
    .select(
      "id, role, first_name, last_name, email, phone_number, display_name, signature_html, signature_config",
    )
    .eq("id", authUser.id)
    .single();

  const displayEmail = admin?.email ?? authUser.email ?? "";
  const fullName = admin
    ? `${admin.first_name ?? ""} ${admin.last_name ?? ""}`.trim()
    : "";

  const initialConfig: SignatureConfig =
    (admin?.signature_config as SignatureConfig) ?? {
      name: admin?.display_name ?? fullName,
      title: "",
      phone: admin?.phone_number ?? "",
      website: "",
    };

  return (
    <div className="max-w-2xl mx-auto py-10 px-6 space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">My Profile</h1>
        <p className="text-sm text-gray-500 mt-1">{displayEmail}</p>
      </div>
      <ProfileClient
        initialConfig={initialConfig}
        currentSignatureHtml={admin?.signature_html ?? null}
      />
    </div>
  );
}
