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

// Crypto
const ENC_ALGORITHM = "AES-GCM";
const KEY_USAGE: KeyUsage[] = ["encrypt", "decrypt"];

async function importKey(): Promise<CryptoKey> {
  const key = Deno.env.get("TOKEN_ENCRYPTION_KEY");
  if (!key) throw new Error("TOKEN_ENCRYPTION_KEY secret not configured");
  const encoder = new TextEncoder();
  const keyData = encoder.encode(key.padEnd(32, "0").slice(0, 32));
  return crypto.subtle.importKey("raw", keyData, { name: ENC_ALGORITHM }, false, KEY_USAGE);
}

function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function decryptToken(ciphertext: string): Promise<string> {
  const key = await importKey();
  const combined = new Uint8Array(base64ToBuffer(ciphertext));
  const iv = combined.slice(0, 12);
  const encrypted = combined.slice(12);
  const decrypted = await crypto.subtle.decrypt({ name: ENC_ALGORITHM, iv }, key, encrypted);
  return new TextDecoder().decode(decrypted);
}

async function decryptConnectionTokens(conn: {
  encrypted_access_token: string | null;
  encrypted_refresh_token: string | null;
  access_token: string | null;
  refresh_token: string | null;
  token_encrypted: boolean;
}): Promise<{ access_token: string | null; refresh_token: string | null }> {
  if (conn.token_encrypted && conn.encrypted_access_token) {
    const access_token = await decryptToken(conn.encrypted_access_token);
    const refresh_token = conn.encrypted_refresh_token ? await decryptToken(conn.encrypted_refresh_token) : null;
    return { access_token, refresh_token };
  }
  return { access_token: conn.access_token, refresh_token: conn.refresh_token };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const { connection_id, user_id } = await req.json();
    if (!connection_id || !user_id) return errorResponse("Missing connection_id or user_id");

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

    const { data: connection, error: connError } = await supabase
      .from("social_connections").select("*").eq("id", connection_id).eq("user_id", user_id).single();

    if (connError || !connection) return errorResponse("Connection not found", 404);
    if (connection.platform !== "pinterest") return errorResponse("Connection is not a Pinterest account");

    const tokens = await decryptConnectionTokens({
      encrypted_access_token: connection.encrypted_access_token,
      encrypted_refresh_token: connection.encrypted_refresh_token,
      access_token: connection.access_token, refresh_token: connection.refresh_token,
      token_encrypted: connection.token_encrypted,
    });

    if (!tokens.access_token) return errorResponse("Pinterest access token missing — reconnect your account");

    const response = await fetch("https://api.pinterest.com/v5/boards?page_size=50", { headers: { Authorization: `Bearer ${tokens.access_token}` } });
    if (!response.ok) { const t = await response.text(); return errorResponse(`Pinterest boards fetch failed (${response.status}): ${t}`, 502); }

    const data = await response.json();
    const boards = (data.items || []).map((b: { id: string; name: string }) => ({ id: b.id, name: b.name }));
    return jsonResponse({ boards });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Internal server error", 500);
  }
});
