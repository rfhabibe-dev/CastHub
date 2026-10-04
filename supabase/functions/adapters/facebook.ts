import type { AdapterContext, PublishResult, PlatformAdapter } from "../_shared/types.ts";
import { decryptConnectionTokens } from "../_shared/crypto.ts";
import { getSignedVideoUrl } from "../_shared/video-source.ts";
import { withRetry } from "../_shared/retry.ts";
import { isMockMode, mockPublishResult } from "../_shared/mock-mode.ts";

export const FacebookAdapter: PlatformAdapter = {
  platform: "facebook",

  async publish(ctx: AdapterContext): Promise<PublishResult> {
    if (isMockMode()) {
      return mockPublishResult("facebook", ctx.video.title);
    }

    const tokens = await decryptConnectionTokens(ctx.connection);
    const accessToken = tokens.access_token;
    if (!accessToken) throw new Error("Facebook access token missing");

    const pageId = ctx.connection.platform_user_id || ctx.adapter_metadata.page_id as string;
    if (!pageId) throw new Error("Facebook page ID missing — reconnect and select a Page");

    const videoUrl = await getSignedVideoUrl(ctx.supabase, ctx.video.file_path!);

    const response = await withRetry(() =>
      fetch(
        `https://graph.facebook.com/v19.0/${pageId}/videos`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            file_url: videoUrl,
            title: ctx.video.title.substring(0, 100),
            description: ctx.video.description,
            access_token: accessToken,
          }),
        }
      )
    );

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Facebook upload failed (${response.status}): ${errText}`);
    }

    const result = await response.json();
    const postId = result.id;
    if (!postId) throw new Error("Facebook did not return a post ID");

    return {
      post_id: postId,
      post_url: `https://www.facebook.com/${pageId}/videos/${postId}`,
      status: "success",
      metadata: { page_id: pageId, video_id: postId },
    };
  },

  async refreshToken(ctx: AdapterContext) {
    if (isMockMode()) {
      return import("../_shared/mock-mode.ts").then((m) => m.mockRefreshResult());
    }

    const tokens = await decryptConnectionTokens(ctx.connection);
    const refreshToken = tokens.refresh_token;
    if (!refreshToken) throw new Error("Facebook refresh token missing");

    const appId = Deno.env.get("META_APP_ID");
    const appSecret = Deno.env.get("META_APP_SECRET");
    if (!appId || !appSecret) throw new Error("Meta OAuth credentials not configured");

    const response = await fetch(
      `https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${refreshToken}`
    );

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Facebook token refresh failed: ${errText}`);
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

    const pageId = ctx.connection.platform_user_id || ctx.adapter_metadata.page_id as string;
    if (!pageId) return { valid: false, message: "No page selected" };

    const response = await fetch(
      `https://graph.facebook.com/v19.0/${pageId}?fields=name&access_token=${tokens.access_token}`
    );

    if (!response.ok) return { valid: false, message: "Token invalid or page not accessible" };
    return { valid: true };
  },
};
