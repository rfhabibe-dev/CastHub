import type { AdapterContext, PublishResult, PlatformAdapter } from "../_shared/types.ts";
import { downloadVideoFile } from "../_shared/video-source.ts";
import { withRetry } from "../_shared/retry.ts";
import { isMockMode, mockPublishResult } from "../_shared/mock-mode.ts";

export const TelegramAdapter: PlatformAdapter = {
  platform: "telegram",

  async publish(ctx: AdapterContext): Promise<PublishResult> {
    if (isMockMode()) {
      return mockPublishResult("telegram", ctx.video.title);
    }

    const botToken = ctx.connection.adapter_metadata?.bot_token as string;
    if (!botToken) throw new Error("Telegram bot token not configured");

    const chatId = ctx.connection.adapter_metadata?.chat_id as string;
    if (!chatId) throw new Error("Telegram channel/chat ID not configured");

    // Verify bot is admin of the channel
    const memberResponse = await fetch(
      `https://api.telegram.org/bot${botToken}/getChatMember?chat_id=${chatId}&user_id=${botToken.split(":")[0]}`
    );

    if (memberResponse.ok) {
      const memberData = await memberResponse.json();
      const status = memberData?.result?.status;
      if (status !== "administrator" && status !== "creator") {
        throw new Error("Bot is not an administrator of the target channel. Add the bot as admin first.");
      }
    }

    // Download video file for direct upload
    const videoFile = await downloadVideoFile(ctx.supabase, ctx.video.file_path!);

    const caption = ctx.video.hashtags?.length
      ? `${ctx.video.title}\n\n${ctx.video.description}\n\n${ctx.video.hashtags.map((h) => `#${h}`).join(" ")}`
      : `${ctx.video.title}\n\n${ctx.video.description}`;

    const formData = new FormData();
    formData.append("chat_id", chatId);
    formData.append("video", videoFile.blob, "video.mp4");
    formData.append("caption", caption.substring(0, 1024));
    formData.append("supports_streaming", "true");

    const response = await withRetry(() =>
      fetch(`https://api.telegram.org/bot${botToken}/sendVideo`, {
        method: "POST",
        body: formData,
      })
    );

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Telegram sendVideo failed (${response.status}): ${errText}`);
    }

    const result = await response.json();
    if (!result.ok) {
      throw new Error(`Telegram API error: ${result.description || "unknown"}`);
    }

    const messageId = result.result?.message_id;
    const chatInfo = result.result?.chat;

    const postUrl = chatInfo?.username
      ? `https://t.me/${chatInfo.username}/${messageId}`
      : `https://t.me/c/${chatId.replace("-100", "")}/${messageId}`;

    return {
      post_id: String(messageId),
      post_url: postUrl,
      status: "success",
      metadata: { message_id: messageId, chat_id: chatId },
    };
  },

  async validate(ctx: AdapterContext) {
    if (isMockMode()) return { valid: true, message: "Mock mode" };

    const botToken = ctx.connection.adapter_metadata?.bot_token as string;
    if (!botToken) return { valid: false, message: "No bot token configured" };

    const chatId = ctx.connection.adapter_metadata?.chat_id as string;
    if (!chatId) return { valid: false, message: "No channel/chat ID configured" };

    // Verify bot can access the chat
    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/getChat?chat_id=${chatId}`
    );

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      return { valid: false, message: `Bot cannot access chat: ${data?.description || "unknown"}` };
    }

    // Verify bot is admin
    const memberResponse = await fetch(
      `https://api.telegram.org/bot${botToken}/getChatMember?chat_id=${chatId}&user_id=${botToken.split(":")[0]}`
    );

    if (memberResponse.ok) {
      const memberData = await memberResponse.json();
      const status = memberData?.result?.status;
      if (status !== "administrator" && status !== "creator") {
        return { valid: false, message: "Bot is not an admin of the channel" };
      }
    }

    return { valid: true };
  },
};
