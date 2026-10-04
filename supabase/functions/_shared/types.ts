export type Platform = 'youtube' | 'facebook' | 'instagram' | 'tiktok' | 'pinterest' | 'whatsapp' | 'telegram';

export type PublicationStatus = 'pending' | 'queued' | 'publishing' | 'success' | 'failed' | 'cancelled' | 'scheduled' | 'retrying';

export type PrivacyStatus = 'private' | 'unlisted' | 'public';

export interface VideoData {
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

export interface ConnectionData {
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

export interface PublishResult {
  post_id: string;
  post_url: string;
  status: 'success' | 'processing';
  metadata?: Record<string, unknown>;
}

export interface AdapterContext {
  supabase: ReturnType<typeof import("npm:@supabase/supabase-js@2.58.0").createClient>;
  video: VideoData;
  connection: ConnectionData;
  publicationId: string;
  userId: string;
  adapterMetadata: Record<string, unknown>;
}

export interface PlatformAdapter {
  platform: Platform;

  publish(ctx: AdapterContext): Promise<PublishResult>;

  refreshToken?(ctx: AdapterContext): Promise<{ access_token: string; refresh_token?: string; expires_at?: string }>;

  getStatus?(ctx: AdapterContext, externalId: string): Promise<{ status: string; post_url?: string }>;

  validate?(ctx: AdapterContext): Promise<{ valid: boolean; message?: string }>;
}

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status);
}
