import type { AdapterContext, PublishResult, PlatformAdapter } from "../_shared/types.ts";
import { decryptConnectionTokens } from "../_shared/crypto.ts";
import { downloadVideoFile } from "../_shared/video-source.ts";
import { withRetry } from "../_shared/retry.ts";
import { isMockMode, mockPublishResult } from "../_shared/mock-mode.ts";

export const WhatsAppAdapter: PlatformAdapter = {
  platform: "whatsapp",

  async publish(ctx: AdapterContext): Promise<PublishResult> {
    if (isMockMode()) {
      return mockPublishResult("whatsapp", ctx.video.title);
    }

    const tokens = await decryptConnectionTokens(ctx.connection);
    const accessToken = tokens.access_token;
    if (!accessToken) throw new Error("WhatsApp access token missing");

    const phoneNumberId = ctx.connection.adapter_metadata?.phone_number_id as string;
    if (!phoneNumberId) throw new Error("WhatsApp phone number ID not configured");

    const recipientPhone = ctx.adapterMetadata.recipient_phone as string;
    if (!recipientPhone) throw new Error("No recipient phone number provided. Recipient must have opted in.");

    const videoFile = await downloadVideoFile(ctx.supabase, ctx.video.file_path!);

    // Step 1: Upload media to WhatsApp
    const mediaFormData = new FormData();
    mediaFormData.append("file", videoFile.blob, "video.mp4");
    mediaFormData.append("type", "video/mp4");
    mediaFormData.append("messaging_product", "whatsapp");

    const uploadResponse = await withRetry(() =>
      fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/media`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: mediaFormData,
      })
    );

    if (!uploadResponse.ok) {
      const errText = await uploadResponse.text();
      throw new Error(`WhatsApp media upload failed (${uploadResponse.status}): ${errText}`);
    }

    const uploadResult = await uploadResponse.json();
    const mediaId = uploadResult.id;
    if (!mediaId) throw new Error("WhatsApp did not return a media ID");

    // Step 2: Send the video message
    const caption = ctx.video.hashtags?.length
      ? `${ctx.video.title}\n\n${ctx.video.description}\n\n${ctx.video.hashtags.map((h) => `#${h}`).join(" ")}`
      : `${ctx.video.title}\n\n${ctx.video.description}`;

    const sendResponse = await withRetry(() =>
      fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: recipientPhone,
          type: "video",
          video: {
            id: mediaId,
            caption: caption.substring(0, 1024),
          },
        }),
      })
    );

    if (!sendResponse.ok) {
      const errText = await sendResponse.text();
      throw new Error(`WhatsApp message send failed (${sendResponse.status}): ${errText}`);
    }

    const sendResult = await sendResponse.json();
    const messageId = sendResult.messages?.[0]?.id;
    if (!messageId) throw new Error("WhatsApp did not return a message ID");

    return {
      post_id: messageId,
      post_url: `https://wa.me/${recipientPhone}`,
      status: "success",
      metadata: { message_id: messageId, media_id: mediaId, recipient: recipientPhone },
    };
  },

  async validate(ctx: AdapterContext) {
    if (isMockMode()) return { valid: true, message: "Mock mode" };

    const tokens = await decryptConnectionTokens(ctx.connection);
    if (!tokens.access_token) return { valid: false, message: "No access token" };

    const phoneNumberId = ctx.connection.adapter_metadata?.phone_number_id as string;
    if (!phoneNumberId) return { valid: false, message: "No phone number ID configured" };

    const response = await fetch(
      `https://graph.facebook.com/v19.0/${phoneNumberId}?fields=display_phone_number,verified&access_token=${tokens.access_token}`
    );

    if (!response.ok) return { valid: false, message: "Token invalid or phone number not accessible" };
    return { valid: true };
  },
};
