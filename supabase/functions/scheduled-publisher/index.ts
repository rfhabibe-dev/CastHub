import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

    const { data: duePublications, error: queryError } = await supabase
      .from("publications").select("id, user_id, video_id, platform")
      .eq("status", "scheduled").lte("scheduled_at", new Date().toISOString());

    if (queryError) return errorResponse(`Failed to query scheduled publications: ${queryError.message}`, 500);
    if (!duePublications?.length) return jsonResponse({ message: "No scheduled publications due", processed: 0 });

    const processed: string[] = [];
    const byUser = new Map<string, string[]>();

    for (const pub of duePublications) {
      const { data: updated, error: updateError } = await supabase
        .from("publications").update({ status: "pending" }).eq("id", pub.id).eq("status", "scheduled").select("id, user_id").single();

      if (updateError || !updated) continue;
      processed.push(pub.id);
      const userId = updated.user_id;
      if (!byUser.has(userId)) byUser.set(userId, []);
      byUser.get(userId)!.push(pub.id);

      await supabase.from("publication_logs").insert({ publication_id: pub.id, user_id: userId, event: "queued", message: `Scheduled publication triggered for ${pub.platform}` });
    }

    const orchestratorUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/publish-orchestrator`;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

    const triggerResults = await Promise.allSettled(
      Array.from(byUser.entries()).map(async ([userId, pubIds]) => {
        const response = await fetch(orchestratorUrl, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${anonKey}` }, body: JSON.stringify({ user_id: userId, publication_ids: pubIds }) });
        return { userId, status: response.status, ok: response.ok };
      })
    );

    const triggerSummary = triggerResults.map((r) => r.status === "fulfilled" ? r.value : { error: r.reason instanceof Error ? r.reason.message : String(r.reason) });
    return jsonResponse({ message: "Scheduled publications processed", processed: processed.length, triggers: triggerSummary });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Internal server error", 500);
  }
});
