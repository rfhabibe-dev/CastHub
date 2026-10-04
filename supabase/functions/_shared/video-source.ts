/**
 * Video source resolution utilities.
 * The videos bucket is private, so we need to either:
 * 1. Generate a signed URL (for APIs that accept a public URL)
 * 2. Download the file server-side (for APIs that require direct file upload)
 */

import { createClient } from "npm:@supabase/supabase-js@2.58.0";

/**
 * Generates a signed URL for a video in the private storage bucket.
 * The URL is valid for 1 hour, giving external APIs time to fetch it.
 *
 * Platforms that accept signed URLs: Facebook (file_url), Instagram (video_url),
 * TikTok (FILE_URL source), Pinterest (video_url source)
 */
export async function getSignedVideoUrl(
  supabase: ReturnType<typeof createClient>,
  filePath: string,
  expiresIn = 3600
): Promise<string> {
  const { data, error } = await supabase.storage
    .from("videos")
    .createSignedUrl(filePath, expiresIn);

  if (error || !data?.signedUrl) {
    throw new Error(`Failed to create signed URL: ${error?.message || "unknown"}`);
  }

  return data.signedUrl;
}

/**
 * Downloads the video file server-side for direct upload to APIs
 * that require the actual file bytes (YouTube resumable upload, Telegram sendVideo).
 */
export async function downloadVideoFile(
  supabase: ReturnType<typeof createClient>,
  filePath: string
): Promise<{ blob: Blob; mimeType: string; size: number }> {
  const { data, error } = await supabase.storage
    .from("videos")
    .download(filePath);

  if (error || !data) {
    throw new Error(`Failed to download video: ${error?.message || "unknown"}`);
  }

  return {
    blob: data,
    mimeType: data.type || "video/mp4",
    size: data.size,
  };
}

/**
 * Downloads the thumbnail file server-side for upload to platforms
 * that require direct file upload for thumbnails (YouTube thumbnails.set).
 */
export async function downloadThumbnailFile(
  supabase: ReturnType<typeof createClient>,
  filePath: string
): Promise<{ blob: Blob; mimeType: string } | null> {
  if (!filePath) return null;

  // For thumbnails stored in the public thumbnails bucket, construct the URL
  const { data } = supabase.storage.from("thumbnails").getPublicUrl(filePath);
  if (!data?.publicUrl) return null;

  const response = await fetch(data.publicUrl);
  if (!response.ok) return null;

  const blob = await response.blob();
  return { blob, mimeType: blob.type || "image/jpeg" };
}

/**
 * Platform video source compatibility:
 *
 * | Platform    | Method         | Description |
 * |-------------|----------------|-------------|
 * | YouTube     | Direct upload  | Resumable upload requires file bytes |
 * | Facebook    | Signed URL     | file_url parameter accepts a URL |
 * | Instagram  | Signed URL     | video_url parameter accepts a URL |
 * | TikTok      | Signed URL     | FILE_URL source accepts a URL |
 * | Pinterest   | Signed URL     | video_url source accepts a URL |
 * | Telegram    | Direct upload  | sendVideo requires multipart file upload |
 * | WhatsApp    | Direct upload  | Media upload then send by ID |
 */
export const PLATFORM_VIDEO_METHOD: Record<string, "signed_url" | "direct_upload"> = {
  youtube: "direct_upload",
  facebook: "signed_url",
  instagram: "signed_url",
  tiktok: "signed_url",
  pinterest: "signed_url",
  telegram: "direct_upload",
  whatsapp: "direct_upload",
};
