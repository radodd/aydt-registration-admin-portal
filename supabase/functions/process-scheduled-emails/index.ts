import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async () => {
  try {
    const now = new Date().toISOString();

    // Atomically claim all scheduled emails whose send time has passed.
    // Update status to "sent" in a single query to prevent double-processing.
    const { data: claimed, error: claimErr } = await supabase
      .from("emails")
      .update({
        status: "sent",
        sent_at: now,
      })
      .eq("status", "scheduled")
      .lte("scheduled_at", now)
      .is("deleted_at", null)
      .select("id");

    if (claimErr) {
      console.error("[process-scheduled-emails] claim error:", claimErr.message);
      return new Response(JSON.stringify({ error: claimErr.message }), {
        status: 500,
      });
    }

    const emailIds: string[] = (claimed ?? []).map((r: { id: string }) => r.id);

    if (emailIds.length === 0) {
      return new Response(JSON.stringify({ ok: true, processed: 0 }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    console.log(
      `[process-scheduled-emails] dispatching ${emailIds.length} email(s)`,
    );

    // Invoke the broadcast function for each claimed email
    await Promise.allSettled(
      emailIds.map((emailId) =>
        fetch(`${SUPABASE_URL}/functions/v1/send-email-broadcast`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SERVICE_KEY}`,
          },
          body: JSON.stringify({ emailId }),
        }),
      ),
    );

    return new Response(
      JSON.stringify({ ok: true, processed: emailIds.length }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[process-scheduled-emails]", message);
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
});
