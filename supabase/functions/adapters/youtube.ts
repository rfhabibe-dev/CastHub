import type { AdapterContext, PublishResult, PlatformAdapter } from "../_shared/types.ts";
import { decryptConnectionTokens } from "../_shared/crypto.ts";
import { downloadVideoFile, downloadThumbnailFile } from "../_shared/video-source.ts";
import { withRetry } from "../_shared/retry.ts";
import { isMockMode, mockPublishResult } from "../_shared/mock-mode.ts";
import type { PrivacyStatus } from "../_shared/types.ts";

export const YouTubeAdapter: PlatformAdapter = {
  platform: "youtube",

  async publish(ctx: AdapterContext): Promise<PublishResult> {
    if (isMockMode()) {
      return mockPublishResult("youtube", ctx.video.title);
    }

    const tokens = await decryptConnectionTokens(ctx.connection);
    const accessToken = tokens.access_token;
    if (!accessToken) throw new Error("YouTube access token missing");

    const privacy = (ctx.adapterMetadata.privacy as PrivacyStatus) || "private";
    const tags = ctx.video.hashtags || [];

    const fullDescription = tags.length > 0
      ? `${ctx.video.description}\n\n${tags.map((h) => `#${h}`).join(" ")}`
      : ctx.video.description;

    const videoFile = await downloadVideoFile(ctx.supabase, ctx.video.file_path!);

    const metadata = {
      snippet: {
        title: ctx.video.title.substring(0, 100),
        description: fullDescription,
        tags: tags.length > 0 ? tags : undefined,
        categoryId: "22",
      },
      status: {
        privacyStatus: privacy,
        selfDeclaredMadeForKids: false,
      },
    };

    const initResponse = await withRetry(() =>
      fetch(
        "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            "X-Upload-Content-Type": videoFile.mimeType,
            "X-Upload-Content-Length": String(videoFile.size),
          },
          body: JSON.stringify(metadata),
        }
      )
    );

    if (!initResponse.ok) {
      const errText = await initResponse.text();
      throw new Error(`YouTube init upload failed (${initResponse.status}): ${errText}`);
    }

    const uploadUrl = initResponse.headers.get("location");
    if (!uploadUrl) throw new Error("YouTube did not return upload URL");

    const uploadResponse = await withRetry(() =>
      fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": videoFile.mimeType,
          "Content-Length": String(videoFile.size),
        },
        body: videoFile.blob,
      })
    );

    if (!uploadResponse.ok) {
      const errText = await uploadResponse.text();
      throw new Error(`YouTube upload failed (${uploadResponse.status}): ${errText}`);
    }

    const result = await uploadResponse.json();
    const videoId = result.id;
    if (!videoId) throw new Error("YouTube did not return a video ID");

    // Upload thumbnail if provided
    if (ctx.video.thumbnail_url) {
      try {
        const thumbPath = ctx.video.thumbnail_url.split("/thumbnails/")[1];
        if (thumbPath) {
          const thumbFile = await downloadThumbnailFile(ctx.supabase, thumbPath);
          if (thumbFile) {
            const thumbFormData = new FormData();
            thumbFormData.append("videoId", videoId);
            thumbFormData.append("file", thumbFile.blob, "thumbnail.jpg");

            await fetch(
              `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${videoId}`,
              {
                method: "POST",
                headers: { Authorization: `Bearer ${accessToken}` },
                body: thumbFormData,
              }
            );
          }
        }
      } catch {
        // Thumbnail upload is optional, don't fail the publish
      }
    }

    return {
      post_id: videoId,
      post_url: `https://www.youtube.com/watch?v=${videoId}`,
      status: "success",
      metadata: { video_id: videoId, privacy_status: privacy },
    };
  },

  async refreshToken(ctx: AdapterContext) {
    if (isMockMode()) {
      return import("../_shared/mock-mode.ts").then((m) => m.mockRefreshResult());
    }

    const tokens = await decryptConnectionTokens(ctx.connection);
    const refreshToken = tokens.refresh_token;
    if (!refreshToken) throw new Error("YouTube refresh token missing");

    const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
    const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
    if (!clientId || !clientSecret) throw new Error("Google OAuth credentials not configured");

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`YouTube token refresh failed: ${errText}`);
    }

    const result = await response.json();
    return {
      access_token: result.access_token,
      refresh_token: refreshToken,
      expires_at: new Date(Date.now() + result.expires_in * 1000).toISOString(),
    };
  },

  async getStatus(_ctx: AdapterContext, externalId: string) {
    return {
      status: "success",
      post_url: `https://www.youtube.com/watch?v=${externalId}`,
    };
  },

  async validate(ctx: AdapterContext) {
    if (isMockMode()) {
      return { valid: true, message: "Mock mode" };
    }

    const tokens = await decryptConnectionTokens(ctx.connection);
    if (!tokens.access_token) return { valid: false, message: "No access token" };

    const response = await fetch(
      "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
      { headers: { Authorization: `Bearer ${tokens.access_token}` } }
    );

    if (!response.ok) return { valid: false, message: "Token invalid or expired" };
    return { valid: true };
  },
};
