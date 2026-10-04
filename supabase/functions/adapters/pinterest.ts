import type { AdapterContext, PublishResult, PlatformAdapter } from "../_shared/types.ts";
import { decryptConnectionTokens } from "../_shared/crypto.ts";
import { getSignedVideoUrl } from "../_shared/video-source.ts";
import { withRetry } from "../_shared/retry.ts";
import { isMockMode, mockPublishResult } from "../_shared/mock-mode.ts";

export const PinterestAdapter: PlatformAdapter = {
  platform: "pinterest",

  async publish(ctx: AdapterContext): Promise<PublishResult> {
    if (isMockMode()) {
      return mockPublishResult("pinterest", ctx.video.title);
    }

    const tokens = await decryptConnectionTokens(ctx.connection);
    const accessToken = tokens.access_token;
    if (!accessToken) throw new Error("Pinterest access token missing");

    const boardId = ctx.adapterMetadata.board_id as string;
    if (!boardId) throw new Error("No Pinterest board selected. Select a board before publishing.");

    const videoUrl = await getSignedVideoUrl(ctx.supabase, ctx.video.file_path!);

    const pinResponse = await withRetry(() =>
      fetch("https://api.pinterest.com/v5/pins", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          board_id: boardId,
          title: ctx.video.title.substring(0, 100),
          description: ctx.video.description.substring(0, 500),
          media_source: {
            source_type: "video_url",
            url: videoUrl,
          },
          alt_text: `Video: ${ctx.video.title}`,
        }),
      })
    );

    if (!pinResponse.ok) {
      const errText = await pinResponse.text();
      throw new Error(`Pinterest pin creation failed (${pinResponse.status}): ${errText}`);
    }

    const pinResult = await pinResponse.json();
    const pinId = pinResult.id;
    if (!pinId) throw new Error("Pinterest did not return a pin ID");

    return {
      post_id: pinId,
      post_url: `https://www.pinterest.com/pin/${pinId}/`,
      status: "success",
      metadata: { pin_id: pinId, board_id: boardId },
    };
  },

  async refreshToken(ctx: AdapterContext) {
    if (isMockMode()) {
      return import("../_shared/mock-mode.ts").then((m) => m.mockRefreshResult());
    }

    const tokens = await decryptConnectionTokens(ctx.connection);
    const refreshToken = tokens.refresh_token;
    if (!refreshToken) throw new Error("Pinterest refresh token missing");

    const appId = Deno.env.get("PINTEREST_APP_ID");
    const appSecret = Deno.env.get("PINTEREST_APP_SECRET");
    if (!appId || !appSecret) throw new Error("Pinterest OAuth credentials not configured");

    const response = await fetch("https://api.pinterest.com/v5/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${btoa(`${appId}:${appSecret}`)}`,
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Pinterest token refresh failed: ${errText}`);
    }

    const result = await response.json();
    return {
      access_token: result.access_token,
      refresh_token: result.refresh_token || refreshToken,
      expires_at: result.expires_in
        ? new Date(Date.now() + result.expires_in * 1000).toISOString()
        : undefined,
    };
  },

  async validate(ctx: AdapterContext) {
    if (isMockMode()) return { valid: true, message: "Mock mode" };

    const tokens = await decryptConnectionTokens(ctx.connection);
    if (!tokens.access_token) return { valid: false, message: "No access token" };

    const response = await fetch("https://api.pinterest.com/v5/user_account", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!response.ok) return { valid: false, message: "Token invalid or expired" };

    const data = await response.json();
    if (data.account_type && data.account_type !== "BUSINESS") {
      return { valid: false, message: `Account type is ${data.account_type}. Requires BUSINESS account.` };
    }

    return { valid: true };
  },
};
