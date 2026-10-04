import { createClient } from "npm:@supabase/supabase-js@2.58.0";

// ============================================================
// SHARED: Types & Utilities
// ============================================================

type Platform = "youtube" | "facebook" | "instagram" | "tiktok" | "pinterest" | "whatsapp" | "telegram";
type PrivacyStatus = "private" | "unlisted" | "public";

interface VideoData {
  id: string;
  title: string;
  description: string;
  hashtags: string[];
  thumbnail_url: string | null;
  video_url: string | null;
  file_path: string | null;
  file_size: number;
  duration: number;
  mime_type: string | null;
  width: number;
  height: number;
}

interface ConnectionData {
  id: string;
  platform: Platform;
  platform_username: string | null;
  platform_user_id: string | null;
  access_token: string | null;
  refresh_token: string | null;
  encrypted_access_token: string | null;
  encrypted_refresh_token: string | null;
  token_encrypted: boolean;
  token_expires_at: string | null;
  scopes: string[];
  adapter_metadata: Record<string, unknown>;
}

interface PublishResult {
  post_id: string;
  post_url: string;
  status: "success" | "processing";
  metadata?: Record<string, unknown>;
}

interface AdapterContext {
  supabase: ReturnType<typeof createClient>;
  video: VideoData;
  connection: ConnectionData;
  publicationId: string;
  userId: string;
  adapterMetadata: Record<string, unknown>;
}

interface PlatformAdapter {
  platform: Platform;
  publish(ctx: AdapterContext): Promise<PublishResult>;
  refreshToken?(ctx: AdapterContext): Promise<{ access_token: string; refresh_token?: string; expires_at?: string }>;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status);
}

// ============================================================
// SHARED: Crypto (AES-GCM token encryption)
// ============================================================

const ENC_ALGORITHM = "AES-GCM";
const KEY_USAGE: KeyUsage[] = ["encrypt", "decrypt"];

function getEncryptionKey(): string {
  const key = Deno.env.get("TOKEN_ENCRYPTION_KEY");
  if (!key) throw new Error("TOKEN_ENCRYPTION_KEY secret not configured");
  return key;
}

async function importKey(): Promise<CryptoKey> {
  const rawKey = getEncryptionKey();
  const encoder = new TextEncoder();
  const keyData = encoder.encode(rawKey.padEnd(32, "0").slice(0, 32));
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

async function decryptToken(ciphertext: string): Promise<string> {
  const key = await importKey();
  const combined = new Uint8Array(base64ToBuffer(ciphertext));
  const iv = combined.slice(0, 12);
  const encrypted = combined.slice(12);
  const decrypted = await crypto.subtle.decrypt({ name: ENC_ALGORITHM, iv }, key, encrypted);
  return new TextDecoder().decode(decrypted);
}

async function encryptConnectionTokens(conn: { access_token: string | null; refresh_token: string | null }) {
  return {
    encrypted_access_token: conn.access_token ? await encryptToken(conn.access_token) : null,
    encrypted_refresh_token: conn.refresh_token ? await encryptToken(conn.refresh_token) : null,
  };
}

async function decryptConnectionTokens(conn: {
  encrypted_access_token: string | null;
  encrypted_refresh_token: string | null;
  access_token: string | null;
  refresh_token: string | null;
  token_encrypted: boolean;
}): Promise<{ access_token: string | null; refresh_token: string | null }> {
  if (conn.token_encrypted && conn.encrypted_access_token) {
    try {
      const access_token = await decryptToken(conn.encrypted_access_token);
      const refresh_token = conn.encrypted_refresh_token ? await decryptToken(conn.encrypted_refresh_token) : null;
      return { access_token, refresh_token };
    } catch (err) {
      throw new Error(`Failed to decrypt tokens: ${err instanceof Error ? err.message : "unknown"}`);
    }
  }
  return { access_token: conn.access_token, refresh_token: conn.refresh_token };
}

// ============================================================
// SHARED: Retry utilities
// ============================================================

const DEFAULT_MAX_RETRIES = 3;
const BASE_DELAY_MS = 2000;
const MAX_DELAY_MS = 30000;

const PERMANENT_ERROR_PATTERNS = [
  /invalid_grant/i, /invalid_token/i, /unauthorized/i, /forbidden/i,
  /permission_denied/i, /permission denied/i, /not connected/i,
  /account not found/i, /invalid media/i, /unsupported (format|media)/i,
  /4001/i, /40003/i, /invalid_request/i,
];

function isRetryableError(error: Error): boolean {
  for (const pattern of PERMANENT_ERROR_PATTERNS) {
    if (pattern.test(error.message)) return false;
  }
  return true;
}

function getBackoffDelay(attempt: number): number {
  const delay = BASE_DELAY_MS * Math.pow(2, attempt);
  const jitter = Math.random() * 1000;
  return Math.min(delay + jitter, MAX_DELAY_MS);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= DEFAULT_MAX_RETRIES; attempt++) {
    try { return await fn(); } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (!isRetryableError(lastError)) throw lastError;
      if (attempt >= DEFAULT_MAX_RETRIES) throw lastError;
      await sleep(getBackoffDelay(attempt));
    }
  }
  throw lastError!;
}

// ============================================================
// SHARED: Mock mode
// ============================================================

function isMockMode(): boolean { return Deno.env.get("MOCK_MODE") === "true"; }

function mockPublishResult(platform: string, videoTitle: string): PublishResult {
  const fakeId = `mock_${platform}_${Date.now()}`;
  const urls: Record<string, string> = {
    youtube: `https://www.youtube.com/watch?v=${fakeId}`,
    facebook: `https://www.facebook.com/mock/videos/${fakeId}`,
    instagram: `https://www.instagram.com/p/${fakeId}`,
    tiktok: `https://www.tiktok.com/@mock/video/${fakeId}`,
    pinterest: `https://www.pinterest.com/pin/${fakeId}/`,
    telegram: `https://t.me/mock_channel/${fakeId}`,
    whatsapp: `https://wa.me/mock/${fakeId}`,
  };
  return { post_id: fakeId, post_url: urls[platform] || `https://mock.example.com/${fakeId}`, status: "success", metadata: { mock: true, platform, video_title: videoTitle } };
}

function mockRefreshResult() {
  return { access_token: `mock_access_token_${Date.now()}`, refresh_token: `mock_refresh_token_${Date.now()}`, expires_at: new Date(Date.now() + 3600 * 1000).toISOString() };
}

// ============================================================
// SHARED: Video source (signed URLs & direct download)
// ============================================================

async function getSignedVideoUrl(supabase: ReturnType<typeof createClient>, filePath: string, expiresIn = 3600): Promise<string> {
  const { data, error } = await supabase.storage.from("videos").createSignedUrl(filePath, expiresIn);
  if (error || !data?.signedUrl) throw new Error(`Failed to create signed URL: ${error?.message || "unknown"}`);
  return data.signedUrl;
}

async function downloadVideoFile(supabase: ReturnType<typeof createClient>, filePath: string): Promise<{ blob: Blob; mimeType: string; size: number }> {
  const { data, error } = await supabase.storage.from("videos").download(filePath);
  if (error || !data) throw new Error(`Failed to download video: ${error?.message || "unknown"}`);
  return { blob: data, mimeType: data.type || "video/mp4", size: data.size };
}

async function downloadThumbnailFile(supabase: ReturnType<typeof createClient>, filePath: string): Promise<{ blob: Blob; mimeType: string } | null> {
  if (!filePath) return null;
  const { data } = supabase.storage.from("thumbnails").getPublicUrl(filePath);
  if (!data?.publicUrl) return null;
  const response = await fetch(data.publicUrl);
  if (!response.ok) return null;
  const blob = await response.blob();
  return { blob, mimeType: blob.type || "image/jpeg" };
}

// ============================================================
// ADAPTER: YouTube
// ============================================================

const YouTubeAdapter: PlatformAdapter = {
  platform: "youtube",
  async publish(ctx: AdapterContext): Promise<PublishResult> {
    if (isMockMode()) return mockPublishResult("youtube", ctx.video.title);
    const tokens = await decryptConnectionTokens(ctx.connection);
    const accessToken = tokens.access_token;
    if (!accessToken) throw new Error("YouTube access token missing");

    const privacy = (ctx.adapterMetadata.privacy as PrivacyStatus) || "private";
    const tags = ctx.video.hashtags || [];
    const fullDescription = tags.length > 0 ? `${ctx.video.description}\n\n${tags.map((h) => `#${h}`).join(" ")}` : ctx.video.description;
    const videoFile = await downloadVideoFile(ctx.supabase, ctx.video.file_path!);

    const metadata = {
      snippet: { title: ctx.video.title.substring(0, 100), description: fullDescription, tags: tags.length > 0 ? tags : undefined, categoryId: "22" },
      status: { privacyStatus: privacy, selfDeclaredMadeForKids: false },
    };

    const initResponse = await withRetry(() =>
      fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", "X-Upload-Content-Type": videoFile.mimeType, "X-Upload-Content-Length": String(videoFile.size) },
        body: JSON.stringify(metadata),
      })
    );
    if (!initResponse.ok) { const t = await initResponse.text(); throw new Error(`YouTube init upload failed (${initResponse.status}): ${t}`); }
    const uploadUrl = initResponse.headers.get("location");
    if (!uploadUrl) throw new Error("YouTube did not return upload URL");

    const uploadResponse = await withRetry(() => fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": videoFile.mimeType, "Content-Length": String(videoFile.size) }, body: videoFile.blob }));
    if (!uploadResponse.ok) { const t = await uploadResponse.text(); throw new Error(`YouTube upload failed (${uploadResponse.status}): ${t}`); }
    const result = await uploadResponse.json();
    const videoId = result.id;
    if (!videoId) throw new Error("YouTube did not return a video ID");

    if (ctx.video.thumbnail_url) {
      try {
        const thumbPath = ctx.video.thumbnail_url.split("/thumbnails/")[1];
        if (thumbPath) {
          const thumbFile = await downloadThumbnailFile(ctx.supabase, thumbPath);
          if (thumbFile) {
            const fd = new FormData();
            fd.append("videoId", videoId);
            fd.append("file", thumbFile.blob, "thumbnail.jpg");
            await fetch(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${videoId}`, { method: "POST", headers: { Authorization: `Bearer ${accessToken}` }, body: fd });
          }
        }
      } catch { /* thumbnail is optional */ }
    }

    return { post_id: videoId, post_url: `https://www.youtube.com/watch?v=${videoId}`, status: "success", metadata: { video_id: videoId, privacy_status: privacy } };
  },
  async refreshToken(ctx: AdapterContext) {
    if (isMockMode()) return mockRefreshResult();
    const tokens = await decryptConnectionTokens(ctx.connection);
    const refreshToken = tokens.refresh_token;
    if (!refreshToken) throw new Error("YouTube refresh token missing");
    const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
    const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
    if (!clientId || !clientSecret) throw new Error("Google OAuth credentials not configured");
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }),
    });
    if (!response.ok) { const t = await response.text(); throw new Error(`YouTube token refresh failed: ${t}`); }
    const result = await response.json();
    return { access_token: result.access_token, refresh_token: refreshToken, expires_at: new Date(Date.now() + result.expires_in * 1000).toISOString() };
  },
};

// ============================================================
// ADAPTER: Facebook
// ============================================================

const FacebookAdapter: PlatformAdapter = {
  platform: "facebook",
  async publish(ctx: AdapterContext): Promise<PublishResult> {
    if (isMockMode()) return mockPublishResult("facebook", ctx.video.title);
    const tokens = await decryptConnectionTokens(ctx.connection);
    const accessToken = tokens.access_token;
    if (!accessToken) throw new Error("Facebook access token missing");
    const pageId = ctx.connection.platform_user_id || ctx.adapter_metadata.page_id as string;
    if (!pageId) throw new Error("Facebook page ID missing — reconnect and select a Page");
    const videoUrl = await getSignedVideoUrl(ctx.supabase, ctx.video.file_path!);

    const response = await withRetry(() =>
      fetch(`https://graph.facebook.com/v19.0/${pageId}/videos`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_url: videoUrl, title: ctx.video.title.substring(0, 100), description: ctx.video.description, access_token: accessToken }),
      })
    );
    if (!response.ok) { const t = await response.text(); throw new Error(`Facebook upload failed (${response.status}): ${t}`); }
    const result = await response.json();
    const postId = result.id;
    if (!postId) throw new Error("Facebook did not return a post ID");
    return { post_id: postId, post_url: `https://www.facebook.com/${pageId}/videos/${postId}`, status: "success", metadata: { page_id: pageId, video_id: postId } };
  },
  async refreshToken(ctx: AdapterContext) {
    if (isMockMode()) return mockRefreshResult();
    const tokens = await decryptConnectionTokens(ctx.connection);
    const refreshToken = tokens.refresh_token;
    if (!refreshToken) throw new Error("Facebook refresh token missing");
    const appId = Deno.env.get("META_APP_ID");
    const appSecret = Deno.env.get("META_APP_SECRET");
    if (!appId || !appSecret) throw new Error("Meta OAuth credentials not configured");
    const response = await fetch(`https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${refreshToken}`);
    if (!response.ok) { const t = await response.text(); throw new Error(`Facebook token refresh failed: ${t}`); }
    const result = await response.json();
    return { access_token: result.access_token, expires_at: result.expires_in ? new Date(Date.now() + result.expires_in * 1000).toISOString() : undefined };
  },
};

// ============================================================
// ADAPTER: Instagram
// ============================================================

const InstagramAdapter: PlatformAdapter = {
  platform: "instagram",
  async publish(ctx: AdapterContext): Promise<PublishResult> {
    if (isMockMode()) return mockPublishResult("instagram", ctx.video.title);
    const tokens = await decryptConnectionTokens(ctx.connection);
    const accessToken = tokens.access_token;
    if (!accessToken) throw new Error("Instagram access token missing");
    const igUserId = ctx.connection.platform_user_id || ctx.adapter_metadata.ig_user_id as string;
    if (!igUserId) throw new Error("Instagram user ID missing — reconnect your account");
    const videoUrl = await getSignedVideoUrl(ctx.supabase, ctx.video.file_path!);
    const caption = ctx.video.hashtags?.length
      ? `${ctx.video.title}\n\n${ctx.video.description}\n\n${ctx.video.hashtags.map((h) => `#${h}`).join(" ")}`
      : `${ctx.video.title}\n\n${ctx.video.description}`;

    const createResponse = await withRetry(() =>
      fetch(`https://graph.facebook.com/v19.0/${igUserId}/media`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ media_type: "REELS", video_url: videoUrl, caption: caption.substring(0, 2200), access_token: accessToken }),
      })
    );
    if (!createResponse.ok) { const t = await createResponse.text(); throw new Error(`Instagram media creation failed (${createResponse.status}): ${t}`); }
    const createResult = await createResponse.json();
    const creationId = createResult.id;
    if (!creationId) throw new Error("Instagram did not return a creation ID");

    let ready = false;
    for (let i = 0; i < 12; i++) {
      await sleep(5000);
      const sr = await fetch(`https://graph.facebook.com/v19.0/${creationId}?fields=status_code&access_token=${accessToken}`);
      const sResult = await sr.json();
      if (sResult.status_code === "FINISHED") { ready = true; break; }
      if (sResult.status_code === "ERROR") throw new Error("Instagram media processing failed");
    }
    if (!ready) throw new Error("Instagram media processing timed out");

    const publishResponse = await withRetry(() =>
      fetch(`https://graph.facebook.com/v19.0/${igUserId}/media_publish`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creation_id: creationId, access_token: accessToken }),
      })
    );
    if (!publishResponse.ok) { const t = await publishResponse.text(); throw new Error(`Instagram publish failed (${publishResponse.status}): ${t}`); }
    const publishResult = await publishResponse.json();
    const mediaId = publishResult.id;
    if (!mediaId) throw new Error("Instagram did not return a media ID");

    let permalink = "";
    try {
      const pr = await fetch(`https://graph.facebook.com/v19.0/${mediaId}?fields=permalink&access_token=${accessToken}`);
      if (pr.ok) { const pd = await pr.json(); permalink = pd.permalink || ""; }
    } catch { /* best-effort */ }

    return { post_id: mediaId, post_url: permalink || `https://www.instagram.com/p/${mediaId}`, status: "success", metadata: { creation_id: creationId, media_id: mediaId } };
  },
  async refreshToken(ctx: AdapterContext) {
    if (isMockMode()) return mockRefreshResult();
    const tokens = await decryptConnectionTokens(ctx.connection);
    const refreshToken = tokens.refresh_token;
    if (!refreshToken) throw new Error("Instagram refresh token missing");
    const appId = Deno.env.get("META_APP_ID");
    const appSecret = Deno.env.get("META_APP_SECRET");
    if (!appId || !appSecret) throw new Error("Meta OAuth credentials not configured");
    const response = await fetch(`https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${refreshToken}`);
    if (!response.ok) { const t = await response.text(); throw new Error(`Instagram token refresh failed: ${t}`); }
    const result = await response.json();
    return { access_token: result.access_token, expires_at: result.expires_in ? new Date(Date.now() + result.expires_in * 1000).toISOString() : undefined };
  },
};

// ============================================================
// ADAPTER: TikTok
// ============================================================

const TikTokAdapter: PlatformAdapter = {
  platform: "tiktok",
  async publish(ctx: AdapterContext): Promise<PublishResult> {
    if (isMockMode()) return mockPublishResult("tiktok", ctx.video.title);
    const tokens = await decryptConnectionTokens(ctx.connection);
    const accessToken = tokens.access_token;
    if (!accessToken) throw new Error("TikTok access token missing");
    const videoUrl = await getSignedVideoUrl(ctx.supabase, ctx.video.file_path!);

    let privacyLevel = "SELF_ONLY";
    try {
      const cr = await fetch("https://open.tiktokapis.com/v2/post/publish/creator_info/query/", {
        method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json; charset=UTF-8" },
      });
      if (cr.ok) {
        const cd = await cr.json();
        const opts = cd?.data?.privacy_level_options;
        if (opts && opts.includes("PUBLIC_TO_EVERYONE")) privacyLevel = "PUBLIC_TO_EVERYONE";
        else if (opts && opts.includes("MUTUAL_FOLLOW_FRIENDS")) privacyLevel = "MUTUAL_FOLLOW_FRIENDS";
      }
    } catch { /* safe default */ }

    const initResponse = await withRetry(() =>
      fetch("https://open.tiktokapis.com/v2/post/publish/video/init/", {
        method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json; charset=UTF-8" },
        body: JSON.stringify({
          post_info: { title: ctx.video.title.substring(0, 100), privacy_level: privacyLevel, disable_comment: false, disable_duet: false, disable_stitch: false, video_cover_timestamp_ms: 0 },
          source_info: { source: "FILE_URL", video_url: videoUrl },
        }),
      })
    );
    if (!initResponse.ok) { const t = await initResponse.text(); throw new Error(`TikTok init failed (${initResponse.status}): ${t}`); }
    const initResult = await initResponse.json();
    const publishId = initResult.data?.publish_id;
    if (!publishId) throw new Error("TikTok did not return a publish ID");

    let finalStatus = "PUBLISHING";
    let videoId = "";
    let deepLink = "";
    for (let i = 0; i < 12; i++) {
      await sleep(5000);
      const sr = await fetch("https://open.tiktokapis.com/v2/post/publish/status/fetch/", {
        method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json; charset=UTF-8" },
        body: JSON.stringify({ publish_id: publishId }),
      });
      if (sr.ok) {
        const sd = await sr.json();
        const status = sd?.data?.status;
        if (status === "PUBLISHED") { finalStatus = "PUBLISHED"; videoId = sd?.data?.publicaly_available_post_id || ""; deepLink = sd?.data?.deep_link || ""; break; }
        if (status === "FAILED") throw new Error(`TikTok publication failed: ${sd?.data?.fail_reason || "unknown"}`);
      }
    }

    const postUrl = deepLink || (videoId ? `https://www.tiktok.com/@${ctx.connection.platform_username || "user"}/video/${videoId}` : "https://www.tiktok.com/");
    return { post_id: videoId || publishId, post_url: postUrl, status: finalStatus === "PUBLISHED" ? "success" : "processing", metadata: { publish_id: publishId, privacy_level: privacyLevel, final_status: finalStatus } };
  },
  async refreshToken(ctx: AdapterContext) {
    if (isMockMode()) return mockRefreshResult();
    const tokens = await decryptConnectionTokens(ctx.connection);
    const refreshToken = tokens.refresh_token;
    if (!refreshToken) throw new Error("TikTok refresh token missing");
    const clientKey = Deno.env.get("TIKTOK_CLIENT_KEY");
    const clientSecret = Deno.env.get("TIKTOK_CLIENT_SECRET");
    if (!clientKey || !clientSecret) throw new Error("TikTok OAuth credentials not configured");
    const response = await fetch("https://open.tiktokapis.com/v2/oauth/refresh_token/", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_key: clientKey, client_secret: clientSecret, grant_type: "refresh_token", refresh_token: refreshToken }),
    });
    if (!response.ok) { const t = await response.text(); throw new Error(`TikTok token refresh failed: ${t}`); }
    const result = await response.json();
    return { access_token: result.access_token, refresh_token: result.refresh_token, expires_at: new Date(Date.now() + result.expires_in * 1000).toISOString() };
  },
};

// ============================================================
// ADAPTER: Pinterest
// ============================================================

const PinterestAdapter: PlatformAdapter = {
  platform: "pinterest",
  async publish(ctx: AdapterContext): Promise<PublishResult> {
    if (isMockMode()) return mockPublishResult("pinterest", ctx.video.title);
    const tokens = await decryptConnectionTokens(ctx.connection);
    const accessToken = tokens.access_token;
    if (!accessToken) throw new Error("Pinterest access token missing");
    const boardId = ctx.adapterMetadata.board_id as string;
    if (!boardId) throw new Error("No Pinterest board selected. Select a board before publishing.");
    const videoUrl = await getSignedVideoUrl(ctx.supabase, ctx.video.file_path!);

    const pinResponse = await withRetry(() =>
      fetch("https://api.pinterest.com/v5/pins", {
        method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          board_id: boardId, title: ctx.video.title.substring(0, 100), description: ctx.video.description.substring(0, 500),
          media_source: { source_type: "video_url", url: videoUrl }, alt_text: `Video: ${ctx.video.title}`,
        }),
      })
    );
    if (!pinResponse.ok) { const t = await pinResponse.text(); throw new Error(`Pinterest pin creation failed (${pinResponse.status}): ${t}`); }
    const pinResult = await pinResponse.json();
    const pinId = pinResult.id;
    if (!pinId) throw new Error("Pinterest did not return a pin ID");
    return { post_id: pinId, post_url: `https://www.pinterest.com/pin/${pinId}/`, status: "success", metadata: { pin_id: pinId, board_id: boardId } };
  },
  async refreshToken(ctx: AdapterContext) {
    if (isMockMode()) return mockRefreshResult();
    const tokens = await decryptConnectionTokens(ctx.connection);
    const refreshToken = tokens.refresh_token;
    if (!refreshToken) throw new Error("Pinterest refresh token missing");
    const appId = Deno.env.get("PINTEREST_APP_ID");
    const appSecret = Deno.env.get("PINTEREST_APP_SECRET");
    if (!appId || !appSecret) throw new Error("Pinterest OAuth credentials not configured");
    const response = await fetch("https://api.pinterest.com/v5/oauth/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${btoa(`${appId}:${appSecret}`)}` },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
    });
    if (!response.ok) { const t = await response.text(); throw new Error(`Pinterest token refresh failed: ${t}`); }
    const result = await response.json();
    return { access_token: result.access_token, refresh_token: result.refresh_token || refreshToken, expires_at: result.expires_in ? new Date(Date.now() + result.expires_in * 1000).toISOString() : undefined };
  },
};

// ============================================================
// ADAPTER: Telegram
// ============================================================

const TelegramAdapter: PlatformAdapter = {
  platform: "telegram",
  async publish(ctx: AdapterContext): Promise<PublishResult> {
    if (isMockMode()) return mockPublishResult("telegram", ctx.video.title);
    const encryptedBotToken = ctx.connection.adapter_metadata?.bot_token_encrypted as string;
    if (!encryptedBotToken) throw new Error("Telegram bot token not configured");
    const botToken = await decryptToken(encryptedBotToken);
    const chatId = ctx.connection.adapter_metadata?.chat_id as string;
    if (!chatId) throw new Error("Telegram channel/chat ID not configured");

    const memberResponse = await fetch(`https://api.telegram.org/bot${botToken}/getChatMember?chat_id=${chatId}&user_id=${botToken.split(":")[0]}`);
    if (memberResponse.ok) {
      const md = await memberResponse.json();
      const status = md?.result?.status;
      if (status !== "administrator" && status !== "creator") throw new Error("Bot is not an administrator of the target channel. Add the bot as admin first.");
    }

    const videoFile = await downloadVideoFile(ctx.supabase, ctx.video.file_path!);
    const caption = ctx.video.hashtags?.length
      ? `${ctx.video.title}\n\n${ctx.video.description}\n\n${ctx.video.hashtags.map((h) => `#${h}`).join(" ")}`
      : `${ctx.video.title}\n\n${ctx.video.description}`;

    const formData = new FormData();
    formData.append("chat_id", chatId);
    formData.append("video", videoFile.blob, "video.mp4");
    formData.append("caption", caption.substring(0, 1024));
    formData.append("supports_streaming", "true");

    const response = await withRetry(() => fetch(`https://api.telegram.org/bot${botToken}/sendVideo`, { method: "POST", body: formData }));
    if (!response.ok) { const t = await response.text(); throw new Error(`Telegram sendVideo failed (${response.status}): ${t}`); }
    const result = await response.json();
    if (!result.ok) throw new Error(`Telegram API error: ${result.description || "unknown"}`);
    const messageId = result.result?.message_id;
    const chatInfo = result.result?.chat;
    const postUrl = chatInfo?.username ? `https://t.me/${chatInfo.username}/${messageId}` : `https://t.me/c/${chatId.replace("-100", "")}/${messageId}`;
    return { post_id: String(messageId), post_url: postUrl, status: "success", metadata: { message_id: messageId, chat_id: chatId } };
  },
};

// ============================================================
// ADAPTER: WhatsApp
// ============================================================

const WhatsAppAdapter: PlatformAdapter = {
  platform: "whatsapp",
  async publish(ctx: AdapterContext): Promise<PublishResult> {
    if (isMockMode()) return mockPublishResult("whatsapp", ctx.video.title);
    const tokens = await decryptConnectionTokens(ctx.connection);
    const accessToken = tokens.access_token;
    if (!accessToken) throw new Error("WhatsApp access token missing");
    const phoneNumberId = ctx.connection.adapter_metadata?.phone_number_id as string;
    if (!phoneNumberId) throw new Error("WhatsApp phone number ID not configured");
    const recipientPhone = ctx.adapterMetadata.recipient_phone as string;
    if (!recipientPhone) throw new Error("No recipient phone number provided. Recipient must have opted in.");
    const videoFile = await downloadVideoFile(ctx.supabase, ctx.video.file_path!);

    const mediaFormData = new FormData();
    mediaFormData.append("file", videoFile.blob, "video.mp4");
    mediaFormData.append("type", "video/mp4");
    mediaFormData.append("messaging_product", "whatsapp");

    const uploadResponse = await withRetry(() => fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/media`, { method: "POST", headers: { Authorization: `Bearer ${accessToken}` }, body: mediaFormData }));
    if (!uploadResponse.ok) { const t = await uploadResponse.text(); throw new Error(`WhatsApp media upload failed (${uploadResponse.status}): ${t}`); }
    const uploadResult = await uploadResponse.json();
    const mediaId = uploadResult.id;
    if (!mediaId) throw new Error("WhatsApp did not return a media ID");

    const caption = ctx.video.hashtags?.length
      ? `${ctx.video.title}\n\n${ctx.video.description}\n\n${ctx.video.hashtags.map((h) => `#${h}`).join(" ")}`
      : `${ctx.video.title}\n\n${ctx.video.description}`;

    const sendResponse = await withRetry(() =>
      fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
        method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: recipientPhone, type: "video", video: { id: mediaId, caption: caption.substring(0, 1024) } }),
      })
    );
    if (!sendResponse.ok) { const t = await sendResponse.text(); throw new Error(`WhatsApp message send failed (${sendResponse.status}): ${t}`); }
    const sendResult = await sendResponse.json();
    const messageId = sendResult.messages?.[0]?.id;
    if (!messageId) throw new Error("WhatsApp did not return a message ID");
    return { post_id: messageId, post_url: `https://wa.me/${recipientPhone}`, status: "success", metadata: { message_id: messageId, media_id: mediaId, recipient: recipientPhone } };
  },
};

// ============================================================
// ORCHESTRATOR
// ============================================================

const ADAPTERS: Record<string, PlatformAdapter> = {
  youtube: YouTubeAdapter, facebook: FacebookAdapter, instagram: InstagramAdapter,
  tiktok: TikTokAdapter, pinterest: PinterestAdapter, telegram: TelegramAdapter, whatsapp: WhatsAppAdapter,
};

interface PublishRequest {
  video_id?: string;
  user_id: string;
  publication_ids?: string[];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const body: PublishRequest = await req.json();
    if (!body.user_id) return errorResponse("Missing user_id");

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

    let query = supabase.from("publications").select("*, video:videos(*), social_connection:social_connections(*)").eq("user_id", body.user_id).in("status", ["pending", "queued", "retrying"]);
    if (body.video_id) query = query.eq("video_id", body.video_id);
    else if (body.publication_ids?.length) query = query.in("id", body.publication_ids);

    const { data: publications, error: pubsError } = await query;
    if (pubsError) return errorResponse(pubsError.message, 500);
    if (!publications?.length) return jsonResponse({ message: "No pending publications found", results: [] });

    const results = await Promise.allSettled(publications.map(async (pub) => {
      const pubId = pub.id;
      const platform = pub.platform;
      const video = pub.video;
      const connection = pub.social_connection;
      const userId = pub.user_id;
      const adapter = ADAPTERS[platform];
      if (!adapter) throw new Error(`Unknown platform: ${platform}`);
      if (!connection) throw new Error(`No connected account for ${platform}`);
      if (!video) throw new Error(`Video data missing for publication ${pubId}`);

      await supabase.from("publications").update({ status: "publishing", started_at: new Date().toISOString() }).eq("id", pubId);
      await supabase.from("publication_logs").insert({ publication_id: pubId, user_id: userId, event: "publishing", message: `Starting publication to ${platform}` });

      const decryptedTokens = await decryptConnectionTokens({
        encrypted_access_token: connection.encrypted_access_token,
        encrypted_refresh_token: connection.encrypted_refresh_token,
        access_token: connection.access_token, refresh_token: connection.refresh_token,
        token_encrypted: connection.token_encrypted,
      });

      const ctx: AdapterContext = {
        supabase, video: {
          id: video.id, title: video.title, description: video.description || "", hashtags: video.hashtags || [],
          thumbnail_url: video.thumbnail_url, video_url: video.video_url, file_path: video.file_path,
          file_size: video.file_size, duration: video.duration, mime_type: video.mime_type, width: video.width, height: video.height,
        },
        connection: { ...connection, access_token: decryptedTokens.access_token, refresh_token: decryptedTokens.refresh_token },
        publicationId: pubId, userId, adapterMetadata: pub.adapter_metadata || {},
      };

      // Auto-refresh token if expiring soon
      if (connection.token_expires_at && adapter.refreshToken) {
        const expiresAt = new Date(connection.token_expires_at).getTime();
        if (expiresAt < Date.now() + 5 * 60 * 1000) {
          try {
            const refreshed = await adapter.refreshToken(ctx);
            const encrypted = await encryptConnectionTokens({ access_token: refreshed.access_token, refresh_token: refreshed.refresh_token || decryptedTokens.refresh_token });
            await supabase.from("social_connections").update({
              encrypted_access_token: encrypted.encrypted_access_token, encrypted_refresh_token: encrypted.encrypted_refresh_token,
              token_encrypted: true, token_expires_at: refreshed.expires_at || null, last_synced_at: new Date().toISOString(),
            }).eq("id", connection.id);
            await supabase.from("publication_logs").insert({ publication_id: pubId, user_id: userId, event: "token_refreshed", message: `Token refreshed for ${platform}` });
            ctx.connection = { ...ctx.connection, access_token: refreshed.access_token, refresh_token: refreshed.refresh_token || decryptedTokens.refresh_token };
          } catch (refreshErr) {
            const msg = refreshErr instanceof Error ? refreshErr.message : "unknown";
            await supabase.from("publication_logs").insert({ publication_id: pubId, user_id: userId, event: "failed", message: `Token refresh failed for ${platform}: ${msg}` });
            throw new Error(`Token refresh failed: ${msg}`);
          }
        }
      }

      // Publish with retry
      let lastError: Error | null = null;
      const maxRetries = pub.max_retries || DEFAULT_MAX_RETRIES;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const publishResult = await adapter.publish(ctx);
          await supabase.from("publications").update({
            status: "success", published_at: new Date().toISOString(), completed_at: new Date().toISOString(),
            platform_post_id: publishResult.post_id, platform_post_url: publishResult.post_url, is_retryable: false,
          }).eq("id", pubId);
          await supabase.from("publication_logs").insert({ publication_id: pubId, user_id: userId, event: "success", message: `Successfully published to ${platform}`, details: publishResult.metadata || {} });
          return { platform, status: "success", post_id: publishResult.post_id, post_url: publishResult.post_url };
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
          const errorMsg = lastError.message;
          if (!isRetryableError(lastError)) {
            await supabase.from("publications").update({ status: "failed", error_message: errorMsg, completed_at: new Date().toISOString(), is_retryable: false }).eq("id", pubId);
            await supabase.from("publication_logs").insert({ publication_id: pubId, user_id: userId, event: "failed", message: `Failed to publish to ${platform}: ${errorMsg}`, details: { error: errorMsg, permanent: true } });
            return { platform, status: "failed", error: errorMsg, permanent: true };
          }
          if (attempt < maxRetries) {
            const delay = getBackoffDelay(attempt);
            await supabase.from("publications").update({ status: "retrying", retry_count: attempt + 1, error_message: errorMsg }).eq("id", pubId);
            await supabase.from("publication_logs").insert({ publication_id: pubId, user_id: userId, event: "retrying", message: `Retry ${attempt + 1}/${maxRetries} for ${platform} after ${Math.round(delay / 1000)}s: ${errorMsg}`, details: { attempt: attempt + 1, delay, error: errorMsg } });
            await sleep(delay);
          }
        }
      }

      await supabase.from("publications").update({ status: "failed", error_message: lastError?.message || "Unknown error", completed_at: new Date().toISOString() }).eq("id", pubId);
      await supabase.from("publication_logs").insert({ publication_id: pubId, user_id: userId, event: "failed", message: `Failed to publish to ${platform} after ${maxRetries} retries: ${lastError?.message}`, details: { error: lastError?.message, retries_exhausted: true } });
      return { platform, status: "failed", error: lastError?.message };
    }));

    const summary = results.map((r) => r.status === "fulfilled" ? r.value : { status: "rejected", error: r.reason instanceof Error ? r.reason.message : String(r.reason) });
    return jsonResponse({ message: "Processing complete", results: summary });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Internal server error", 500);
  }
});
