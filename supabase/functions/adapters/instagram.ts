import type { AdapterContext, PublishResult, PlatformAdapter } from "../_shared/types.ts";
import { decryptConnectionTokens } from "../_shared/crypto.ts";
import { getSignedVideoUrl } from "../_shared/video-source.ts";
import { withRetry, sleep } from "../_shared/retry.ts";
import { isMockMode, mockPublishResult } from "../_shared/mock-mode.ts";

export const InstagramAdapter: PlatformAdapter = {
  platform: "instagram",

  async publish(ctx: AdapterContext): Promise<PublishResult> {
    if (isMockMode()) {
      return mockPublishResult("instagram", ctx.video.title);
    }

    const tokens = await decryptConnectionTokens(ctx.connection);
    const accessToken = tokens.access_token;
    if (!accessToken) throw new Error("Instagram access token missing");

    const igUserId = ctx.connection.platform_user_id || ctx.adapter_metadata.ig_user_id as string;
    if (!igUserId) throw new Error("Instagram user ID missing — reconnect your account");

    const videoUrl = await getSignedVideoUrl(ctx.supabase, ctx.video.file_path!);

    const caption = ctx.video.hashtags?.length
      ? `${ctx.video.title}\n\n${ctx.video.description}\n\n${ctx.video.hashtags.map((h) => `#${h}`).join(" ")}`
      : `${ctx.video.title}\n\n${ctx.video.description}`;

    // Step 1: Create media container
    const createResponse = await withRetry(() =>
      fetch(`https://graph.facebook.com/v19.0/${igUserId}/media`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          media_type: "REELS",
          video_url: videoUrl,
          caption: caption.substring(0, 2200),
          access_token: accessToken,
        }),
      })
    );

    if (!createResponse.ok) {
      const errText = await createResponse.text();
      throw new Error(`Instagram media creation failed (${createResponse.status}): ${errText}`);
    }

    const createResult = await createResponse.json();
    const creationId = createResult.id;
    if (!creationId) throw new Error("Instagram did not return a creation ID");

    // Step 2: Poll for processing status
    let ready = false;
    for (let i = 0; i < 12; i++) {
      await sleep(5000);
      const statusResponse = await fetch(
        `https://graph.facebook.com/v19.0/${creationId}?fields=status_code&access_token=${accessToken}`
      );
      const statusResult = await statusResponse.json();
      if (statusResult.status_code === "FINISHED") {
        ready = true;
        break;
      }
      if (statusResult.status_code === "ERROR") {
        throw new Error("Instagram media processing failed");
      }
    }
    if (!ready) throw new Error("Instagram media processing timed out");

    // Step 3: Publish the media
    const publishResponse = await withRetry(() =>
      fetch(`https://graph.facebook.com/v19.0/${igUserId}/media_publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creation_id: creationId,
          access_token: accessToken,
        }),
      })
    );

    if (!publishResponse.ok) {
      const errText = await publishResponse.text();
      throw new Error(`Instagram publish failed (${publishResponse.status}): ${errText}`);
    }

    const publishResult = await publishResponse.json();
    const mediaId = publishResult.id;
    if (!mediaId) throw new Error("Instagram did not return a media ID");

    // Step 4: Get the real permalink
    let permalink = "";
    try {
      const permalinkResponse = await fetch(
        `https://graph.facebook.com/v19.0/${mediaId}?fields=permalink&access_token=${accessToken}`
      );
      if (permalinkResponse.ok) {
        const permalinkData = await permalinkResponse.json();
        permalink = permalinkData.permalink || "";
      }
    } catch {
      // permalink fetch is best-effort
    }

    return {
      post_id: mediaId,
      post_url: permalink || `https://www.instagram.com/p/${mediaId}`,
      status: "success",
      metadata: { creation_id: creationId, media_id: mediaId },
    };
  },

  async refreshToken(ctx: AdapterContext) {
    if (isMockMode()) {
      return import("../_shared/mock-mode.ts").then((m) => m.mockRefreshResult());
    }

    const tokens = await decryptConnectionTokens(ctx.connection);
    const refreshToken = tokens.refresh_token;
    if (!refreshToken) throw new Error("Instagram refresh token missing");

    const appId = Deno.env.get("META_APP_ID");
    const appSecret = Deno.env.get("META_APP_SECRET");
    if (!appId || !appSecret) throw new Error("Meta OAuth credentials not configured");

    const response = await fetch(
      `https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${refreshToken}`
    );

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Instagram token refresh failed: ${errText}`);
    }

    const result = await response.json();
    return {
      access_token: result.access_token,
      expires_at: result.expires_in
        ? new Date(Date.now() + result.expires_in * 1000).toISOString()
        : undefined,
    };
  },

  async validate(ctx: AdapterContext) {
    if (isMockMode()) return { valid: true, message: "Mock mode" };

    const tokens = await decryptConnectionTokens(ctx.connection);
    if (!tokens.access_token) return { valid: false, message: "No access token" };

    const igUserId = ctx.connection.platform_user_id || ctx.adapter_metadata.ig_user_id as string;
    if (!igUserId) return { valid: false, message: "No Instagram account ID" };

    const response = await fetch(
      `https://graph.facebook.com/v19.0/${igUserId}?fields=username,account_type&access_token=${tokens.access_token}`
    );

    if (!response.ok) return { valid: false, message: "Token invalid or account not accessible" };

    const data = await response.json();
    if (data.account_type && data.account_type !== "BUSINESS" && data.account_type !== "CREATOR") {
      return { valid: false, message: `Account type is ${data.account_type}. Requires BUSINESS or CREATOR account.` };
    }

    return { valid: true };
  },
};
