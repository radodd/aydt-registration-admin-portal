import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { signOut } from "../../auth/actions";

export default async function PrivatePage() {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) {
    redirect("/");
  }

  return (
    <>
      <p className="text-black">Hello {data.user.email}</p>
      <form>
        <button className="text-black" formAction={signOut}>
          Log Out
        </button>
      </form>
    </>
  );
}
