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

// ============================================================
// Crypto (AES-GCM token encryption)
// ============================================================

const ENC_ALGORITHM = "AES-GCM";
const KEY_USAGE: KeyUsage[] = ["encrypt", "decrypt"];

async function importKey(): Promise<CryptoKey> {
  const key = Deno.env.get("TOKEN_ENCRYPTION_KEY");
  if (!key) throw new Error("TOKEN_ENCRYPTION_KEY secret not configured");
  const encoder = new TextEncoder();
  const keyData = encoder.encode(key.padEnd(32, "0").slice(0, 32));
  return crypto.subtle.importKey("raw", keyData, { name: ENC_ALGORITHM }, false, KEY_USAGE);
}

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function encryptToken(plaintext: string): Promise<string> {
  const key = await importKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();
  const encrypted = await crypto.subtle.encrypt({ name: ENC_ALGORITHM, iv }, key, encoder.encode(plaintext));
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.length);
  return bufferToBase64(combined.buffer);
}

async function encryptConnectionTokens(conn: { access_token: string | null; refresh_token: string | null }) {
  return {
    encrypted_access_token: conn.access_token ? await encryptToken(conn.access_token) : null,
    encrypted_refresh_token: conn.refresh_token ? await encryptToken(conn.refresh_token) : null,
  };
}

// ============================================================
// OAuth Handler
// ============================================================

interface OAuthCallbackRequest {
  platform: string;
  code: string;
  state: string;
  user_id: string;
  redirect_uri?: string;
}

interface OAuthConnectRequest {
  platform: string;
  user_id: string;
  action?: string;
  redirect_uri?: string;
  adapter_metadata?: Record<string, unknown>;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const body: OAuthCallbackRequest | OAuthConnectRequest = await req.json();
    const platform = body.platform;
    const userId = body.user_id;
    if (!platform || !userId) return errorResponse("Missing platform or user_id");

    const action = (body as OAuthConnectRequest).action;

    if (action === "get_auth_url") {
      return await handleGetAuthUrl(platform, userId, (body as OAuthConnectRequest).redirect_uri || "");
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

    if (platform === "telegram") return await handleTelegramConnect(supabase, body as OAuthConnectRequest, userId);
    if (platform === "whatsapp") return await handleWhatsAppConnect(supabase, body as OAuthConnectRequest, userId);
    return await handleOAuthCallback(supabase, body as OAuthCallbackRequest, platform, userId);
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Internal server error", 500);
  }
});

async function handleGetAuthUrl(platform: string, userId: string, redirectUri: string): Promise<Response> {
  if (!redirectUri) return errorResponse("Missing redirect_uri");
  const state = crypto.randomUUID();
  const scopeMap: Record<string, { clientId: string; url: string; scopes: string[] }> = {
    youtube: { clientId: Deno.env.get("GOOGLE_CLIENT_ID") || "", url: "https://accounts.google.com/o/oauth2/v2/auth", scopes: ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube"] },
    facebook: { clientId: Deno.env.get("META_APP_ID") || "", url: "https://www.facebook.com/v19.0/dialog/oauth", scopes: ["pages_manage_posts", "pages_read_engagement", "pages_show_list", "video_upload"] },
    instagram: { clientId: Deno.env.get("META_APP_ID") || "", url: "https://www.facebook.com/v19.0/dialog/oauth", scopes: ["instagram_content_publish", "instagram_basic", "instagram_manage_posts", "pages_show_list", "pages_read_engagement"] },
    tiktok: { clientId: Deno.env.get("TIKTOK_CLIENT_KEY") || "", url: "https://www.tiktok.com/auth/authorize/", scopes: ["video.publish", "user.info.basic"] },
    pinterest: { clientId: Deno.env.get("PINTEREST_APP_ID") || "", url: "https://www.pinterest.com/oauth/", scopes: ["boards:read", "pins:write", "user_accounts:read"] },
  };
  const config = scopeMap[platform];
  if (!config) return errorResponse(`Unknown OAuth platform: ${platform}`);
  if (!config.clientId) return errorResponse(`${platform} OAuth credentials not configured. Set the required secrets as edge function secrets.`, 500);

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: config.scopes.join(platform === "tiktok" ? "," : " "),
    state,
  });
  return jsonResponse({ auth_url: `${config.url}?${params.toString()}`, state, platform });
}

async function handleOAuthCallback(supabase: ReturnType<typeof createClient>, body: OAuthCallbackRequest, platform: string, userId: string): Promise<Response> {
  const { code } = body;
  if (!code) return errorResponse("Missing authorization code");

  const redirectUri = body.redirect_uri || Deno.env.get("OAUTH_REDIRECT_URI") || `${Deno.env.get("SUPABASE_URL")}/functions/v1/oauth-handler`;
  let tokenUrl: string;
  let tokenBody: URLSearchParams;
  const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" };

  switch (platform) {
    case "youtube": {
      const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
      const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
      if (!clientId || !clientSecret) return errorResponse("Google OAuth credentials not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET as edge function secrets.", 500);
      tokenUrl = "https://oauth2.googleapis.com/token";
      tokenBody = new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" });
      break;
    }
    case "facebook":
    case "instagram": {
      const appId = Deno.env.get("META_APP_ID");
      const appSecret = Deno.env.get("META_APP_SECRET");
      if (!appId || !appSecret) return errorResponse("Meta OAuth credentials not configured. Set META_APP_ID and META_APP_SECRET as edge function secrets.", 500);
      tokenUrl = "https://graph.facebook.com/v19.0/oauth/access_token";
      tokenBody = new URLSearchParams({ code, client_id: appId, client_secret: appSecret, redirect_uri: redirectUri });
      break;
    }
    case "tiktok": {
      const clientKey = Deno.env.get("TIKTOK_CLIENT_KEY");
      const clientSecret = Deno.env.get("TIKTOK_CLIENT_SECRET");
      if (!clientKey || !clientSecret) return errorResponse("TikTok OAuth credentials not configured. Set TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET as edge function secrets.", 500);
      tokenUrl = "https://open.tiktokapis.com/v2/oauth/token/";
      tokenBody = new URLSearchParams({ code, client_key: clientKey, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" });
      break;
    }
    case "pinterest": {
      const appId = Deno.env.get("PINTEREST_APP_ID");
      const appSecret = Deno.env.get("PINTEREST_APP_SECRET");
      if (!appId || !appSecret) return errorResponse("Pinterest OAuth credentials not configured. Set PINTEREST_APP_ID and PINTEREST_APP_SECRET as edge function secrets.", 500);
      tokenUrl = "https://api.pinterest.com/v5/oauth/token";
      tokenBody = new URLSearchParams({ code, redirect_uri: redirectUri, grant_type: "authorization_code" });
      headers["Authorization"] = `Basic ${btoa(`${appId}:${appSecret}`)}`;
      break;
    }
    default:
      return errorResponse(`Unknown OAuth platform: ${platform}`);
  }

  const tokenResponse = await fetch(tokenUrl, { method: "POST", headers, body: tokenBody });
  if (!tokenResponse.ok) {
    const errText = await tokenResponse.text();
    return errorResponse(`Token exchange failed for ${platform} (${tokenResponse.status}): ${errText}`, 502);
  }

  const tokenData = await tokenResponse.json();
  const accessToken = tokenData.access_token;
  const refreshToken = tokenData.refresh_token;
  const expiresIn = tokenData.expires_in;
  if (!accessToken) return errorResponse(`No access token returned from ${platform}`);

  let platformUsername: string | null = null;
  let platformUserId: string | null = null;
  let adapterMetadata: Record<string, unknown> = {};

  try {
    switch (platform) {
      case "youtube": {
        const r = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", { headers: { Authorization: `Bearer ${accessToken}` } });
        if (r.ok) { const d = await r.json(); const ch = d.items?.[0]; platformUsername = ch?.snippet?.title || null; platformUserId = ch?.id || null; }
        break;
      }
      case "facebook": {
        const r = await fetch(`https://graph.facebook.com/v19.0/me/accounts?fields=id,name,access_token&access_token=${accessToken}`);
        if (r.ok) {
          const d = await r.json();
          const pages = d.data || [];
          if (pages.length > 0) {
            const page = pages[0];
            platformUserId = page.id;
            platformUsername = page.name;
            const pageAccessToken = page.access_token;
            const encrypted = await encryptConnectionTokens({ access_token: pageAccessToken, refresh_token: refreshToken });
            return await storeConnection(supabase, {
              userId, platform, platformUsername, platformUserId,
              encrypted, adapterMetadata: { available_pages: pages.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })) },
            });
          }
        }
        break;
      }
      case "instagram": {
        const r = await fetch(`https://graph.facebook.com/v19.0/me/accounts?fields=id,name,instagram_business_account&access_token=${accessToken}`);
        if (r.ok) {
          const d = await r.json();
          const pages = d.data || [];
          for (const page of pages) {
            if (page.instagram_business_account) {
              const igId = page.instagram_business_account.id;
              const ir = await fetch(`https://graph.facebook.com/v19.0/${igId}?fields=username,account_type&access_token=${accessToken}`);
              if (ir.ok) { const ig = await ir.json(); platformUsername = ig.username; platformUserId = igId; adapterMetadata = { page_id: page.id, ig_user_id: igId }; }
              break;
            }
          }
        }
        break;
      }
      case "tiktok": {
        const r = await fetch("https://open.tiktokapis.com/v2/user/info/", { headers: { Authorization: `Bearer ${accessToken}` } });
        if (r.ok) { const d = await r.json(); platformUsername = d?.data?.user?.username || null; platformUserId = d?.data?.user?.open_id || null; }
        break;
      }
      case "pinterest": {
        const r = await fetch("https://api.pinterest.com/v5/user_account", { headers: { Authorization: `Bearer ${accessToken}` } });
        if (r.ok) { const d = await r.json(); platformUsername = d.username || null; platformUserId = d.account_id || null; }
        break;
      }
    }
  } catch { /* best-effort */ }

  const encrypted = await encryptConnectionTokens({ access_token: accessToken, refresh_token: refreshToken });
  return await storeConnection(supabase, { userId, platform, platformUsername, platformUserId, encrypted, adapterMetadata });
}

async function handleTelegramConnect(supabase: ReturnType<typeof createClient>, body: OAuthConnectRequest, userId: string): Promise<Response> {
  const botToken = body.adapter_metadata?.bot_token as string;
  const chatId = body.adapter_metadata?.chat_id as string;
  if (!botToken) return errorResponse("Missing bot_token");
  if (!chatId) return errorResponse("Missing chat_id");

  const meResponse = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
  if (!meResponse.ok) return errorResponse("Invalid Telegram bot token");
  const meData = await meResponse.json();
  if (!meData.ok) return errorResponse(`Telegram bot verification failed: ${meData.description}`);
  const botName = meData.result?.username || "Unknown Bot";

  const chatResponse = await fetch(`https://api.telegram.org/bot${botToken}/getChat?chat_id=${chatId}`);
  if (!chatResponse.ok) return errorResponse("Bot cannot access the specified channel. Add the bot as an administrator.");
  const chatData = await chatResponse.json();
  if (!chatData.ok) return errorResponse(`Cannot access chat: ${chatData.description}`);
  const chatTitle = chatData.result?.title || chatData.result?.username || chatId;

  const memberResponse = await fetch(`https://api.telegram.org/bot${botToken}/getChatMember?chat_id=${chatId}&user_id=${botToken.split(":")[0]}`);
  if (memberResponse.ok) {
    const md = await memberResponse.json();
    const status = md?.result?.status;
    if (status !== "administrator" && status !== "creator") return errorResponse("Bot is not an administrator of the channel. Promote the bot to admin first.");
  }

  const encryptedBotToken = await encryptConnectionTokens({ access_token: botToken, refresh_token: null });
  return await storeConnection(supabase, {
    userId, platform: "telegram", platformUsername: chatTitle, platformUserId: chatId,
    encrypted: { encrypted_access_token: null, encrypted_refresh_token: null },
    adapterMetadata: { bot_token_encrypted: encryptedBotToken.encrypted_access_token, chat_id: chatId, bot_name: botName },
  });
}

async function handleWhatsAppConnect(supabase: ReturnType<typeof createClient>, body: OAuthConnectRequest, userId: string): Promise<Response> {
  const phoneNumberId = body.adapter_metadata?.phone_number_id as string;
  const wabaId = body.adapter_metadata?.waba_id as string;
  const accessToken = body.adapter_metadata?.access_token as string;
  if (!phoneNumberId) return errorResponse("Missing phone_number_id");
  if (!accessToken) return errorResponse("Missing WhatsApp access token");

  const verifyResponse = await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}?fields=display_phone_number,verified&access_token=${accessToken}`);
  if (!verifyResponse.ok) return errorResponse("WhatsApp phone number ID verification failed. Check your access token and phone number ID.");
  const verifyData = await verifyResponse.json();
  const displayNumber = verifyData.display_phone_number || "Unknown";

  const encrypted = await encryptConnectionTokens({ access_token: accessToken, refresh_token: null });
  return await storeConnection(supabase, {
    userId, platform: "whatsapp", platformUsername: displayNumber, platformUserId: phoneNumberId,
    encrypted, adapterMetadata: { phone_number_id: phoneNumberId, waba_id: wabaId || null },
  });
}

async function storeConnection(supabase: ReturnType<typeof createClient>, params: {
  userId: string; platform: string; platformUsername: string | null; platformUserId: string | null;
  encrypted: { encrypted_access_token: string | null; encrypted_refresh_token: string | null };
  adapterMetadata: Record<string, unknown>;
}): Promise<Response> {
  const { error } = await supabase.from("social_connections").upsert({
    user_id: params.userId, platform: params.platform,
    platform_username: params.platformUsername, platform_user_id: params.platformUserId,
    access_token: null, refresh_token: null,
    encrypted_access_token: params.encrypted.encrypted_access_token,
    encrypted_refresh_token: params.encrypted.encrypted_refresh_token,
    token_encrypted: true, token_expires_at: null, scopes: [], status: "connected",
    adapter_metadata: params.adapterMetadata, last_synced_at: new Date().toISOString(),
  }, { onConflict: "user_id,platform" });

  if (error) return errorResponse(`Failed to store connection: ${error.message}`, 500);
  return jsonResponse({ success: true, platform: params.platform, username: params.platformUsername });
}
