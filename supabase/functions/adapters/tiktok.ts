import type { AdapterContext, PublishResult, PlatformAdapter } from "../_shared/types.ts";
import { decryptConnectionTokens } from "../_shared/crypto.ts";
import { getSignedVideoUrl } from "../_shared/video-source.ts";
import { withRetry, sleep } from "../_shared/retry.ts";
import { isMockMode, mockPublishResult } from "../_shared/mock-mode.ts";

export const TikTokAdapter: PlatformAdapter = {
  platform: "tiktok",

  async publish(ctx: AdapterContext): Promise<PublishResult> {
    if (isMockMode()) {
      return mockPublishResult("tiktok", ctx.video.title);
    }

    const tokens = await decryptConnectionTokens(ctx.connection);
    const accessToken = tokens.access_token;
    if (!accessToken) throw new Error("TikTok access token missing");

    const videoUrl = await getSignedVideoUrl(ctx.supabase, ctx.video.file_path!);

    // Step 1: Query creator info to get available privacy options
    let privacyLevel = "SELF_ONLY"; // Safe default for non-approved apps
    try {
      const creatorResponse = await fetch(
        "https://open.tiktokapis.com/v2/post/publish/creator_info/query/",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json; charset=UTF-8",
          },
        }
      );

      if (creatorResponse.ok) {
        const creatorData = await creatorResponse.json();
        const privacyOptions = creatorData?.data?.privacy_level_options;
        if (privacyOptions && privacyOptions.includes("PUBLIC_TO_EVERYONE")) {
          privacyLevel = "PUBLIC_TO_EVERYONE";
        } else if (privacyOptions && privacyOptions.includes("MUTUAL_FOLLOW_FRIENDS")) {
          privacyLevel = "MUTUAL_FOLLOW_FRIENDS";
        }
      }
    } catch {
      // If creator info query fails, use safe default
    }

    // Step 2: Initialize upload
    const initResponse = await withRetry(() =>
      fetch("https://open.tiktokapis.com/v2/post/publish/video/init/", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
        },
        body: JSON.stringify({
          post_info: {
            title: ctx.video.title.substring(0, 100),
            privacy_level: privacyLevel,
            disable_comment: false,
            disable_duet: false,
            disable_stitch: false,
            video_cover_timestamp_ms: 0,
          },
          source_info: {
            source: "FILE_URL",
            video_url: videoUrl,
          },
        }),
      })
    );

    if (!initResponse.ok) {
      const errText = await initResponse.text();
      throw new Error(`TikTok init failed (${initResponse.status}): ${errText}`);
    }

    const initResult = await initResponse.json();
    const publishId = initResult.data?.publish_id;
    if (!publishId) throw new Error("TikTok did not return a publish ID");

    // Step 3: Poll for publication status
    let finalStatus = "PUBLISHING";
    let videoId = "";
    let deepLink = "";
    for (let i = 0; i < 12; i++) {
      await sleep(5000);
      const statusResponse = await fetch(
        "https://open.tiktokapis.com/v2/post/publish/status/fetch/",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json; charset=UTF-8",
          },
          body: JSON.stringify({ publish_id: publishId }),
        }
      );

      if (statusResponse.ok) {
        const statusData = await statusResponse.json();
        const status = statusData?.data?.status;
        if (status === "PUBLISHED") {
          finalStatus = "PUBLISHED";
          videoId = statusData?.data?.publicaly_available_post_id || "";
          deepLink = statusData?.data?.deep_link || "";
          break;
        }
        if (status === "FAILED") {
          throw new Error(`TikTok publication failed: ${statusData?.data?.fail_reason || "unknown"}`);
        }
      }
    }

    const postUrl = deepLink || (videoId
      ? `https://www.tiktok.com/@${ctx.connection.platform_username || "user"}/video/${videoId}`
      : `https://www.tiktok.com/`);

    return {
      post_id: videoId || publishId,
      post_url: postUrl,
      status: finalStatus === "PUBLISHED" ? "success" : "processing",
      metadata: { publish_id: publishId, privacy_level: privacyLevel, final_status: finalStatus },
    };
  },

  async refreshToken(ctx: AdapterContext) {
    if (isMockMode()) {
      return import("../_shared/mock-mode.ts").then((m) => m.mockRefreshResult());
    }

    const tokens = await decryptConnectionTokens(ctx.connection);
    const refreshToken = tokens.refresh_token;
    if (!refreshToken) throw new Error("TikTok refresh token missing");

    const clientKey = Deno.env.get("TIKTOK_CLIENT_KEY");
    const clientSecret = Deno.env.get("TIKTOK_CLIENT_SECRET");
    if (!clientKey || !clientSecret) throw new Error("TikTok OAuth credentials not configured");

    const response = await fetch("https://open.tiktokapis.com/v2/oauth/refresh_token/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`TikTok token refresh failed: ${errText}`);
    }

    const result = await response.json();
    return {
      access_token: result.access_token,
      refresh_token: result.refresh_token,
      expires_at: new Date(Date.now() + result.expires_in * 1000).toISOString(),
    };
  },

  async validate(ctx: AdapterContext) {
    if (isMockMode()) return { valid: true, message: "Mock mode" };

    const tokens = await decryptConnectionTokens(ctx.connection);
    if (!tokens.access_token) return { valid: false, message: "No access token" };

    const response = await fetch("https://open.tiktokapis.com/v2/user/info/", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!response.ok) return { valid: false, message: "Token invalid or expired" };
    return { valid: true };
  },
};
