export type Platform = 'youtube' | 'facebook' | 'instagram' | 'tiktok' | 'pinterest' | 'whatsapp' | 'telegram';

export type ConnectionStatus = 'connected' | 'disconnected' | 'expired' | 'error';

export type VideoStatus = 'uploading' | 'ready' | 'processing' | 'failed';

export type PublicationStatus =
  | 'pending'
  | 'queued'
  | 'publishing'
  | 'success'
  | 'failed'
  | 'cancelled'
  | 'scheduled'
  | 'retrying';

export type LogEvent =
  | 'created'
  | 'queued'
  | 'publishing'
  | 'success'
  | 'failed'
  | 'retry'
  | 'cancelled'
  | 'token_refreshed'
  | 'scheduled'
  | 'retrying';

export type PrivacyStatus = 'private' | 'unlisted' | 'public';

export interface SocialConnection {
  id: string;
  user_id: string;
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
  status: ConnectionStatus;
  adapter_metadata: Record<string, unknown>;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Video {
  id: string;
  user_id: string;
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
  status: VideoStatus;
  created_at: string;
  updated_at: string;
}

export interface Publication {
  id: string;
  user_id: string;
  video_id: string;
  platform: Platform;
  social_connection_id: string | null;
  status: PublicationStatus;
  scheduled_at: string | null;
  published_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  platform_post_id: string | null;
  platform_post_url: string | null;
  error_message: string | null;
  retry_count: number;
  max_retries: number;
  is_retryable: boolean;
  adapter_metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  video?: Video;
}

export interface PublicationLog {
  id: string;
  user_id: string;
  publication_id: string;
  event: LogEvent;
  message: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

export interface PublicationWithVideo extends Publication {
  video: Video;
}
