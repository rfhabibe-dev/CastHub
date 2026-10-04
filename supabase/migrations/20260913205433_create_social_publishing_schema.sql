/*
# Social Video Publishing Platform - Database Schema

## Overview
This migration creates the complete database schema for a multi-platform video publishing application.
Content creators upload a video once and publish it automatically to Facebook, Instagram, TikTok, Pinterest, and YouTube.

## New Tables

### 1. social_connections
Stores OAuth tokens and connection state for each social platform per user.
- `id` (uuid, PK)
- `user_id` (uuid, FK to auth.users) - owner of the connection
- `platform` (text) - one of: youtube, facebook, instagram, tiktok, pinterest
- `platform_username` (text) - the user's handle/name on that platform
- `platform_user_id` (text) - the user's ID on that platform
- `access_token` (text) - encrypted OAuth access token
- `refresh_token` (text) - encrypted OAuth refresh token
- `token_expires_at` (timestamptz) - when the access token expires
- `scopes` (text[]) - OAuth scopes granted
- `status` (text) - 'connected', 'disconnected', 'expired', 'error'
- `last_synced_at` (timestamptz) - last time the token was refreshed
- `created_at`, `updated_at` (timestamptz)

### 2. videos
Stores uploaded video metadata and file information.
- `id` (uuid, PK)
- `user_id` (uuid, FK to auth.users) - owner
- `title` (text) - video title
- `description` (text) - video description
- `hashtags` (text[]) - hashtags for the video
- `thumbnail_url` (text) - URL to custom thumbnail image
- `video_url` (text) - storage URL of the video file
- `file_path` (text) - path in storage bucket
- `file_size` (bigint) - file size in bytes
- `duration` (integer) - duration in seconds
- `mime_type` (text) - MIME type of the video
- `width` (integer) - video width in pixels
- `height` (integer) - video height in pixels
- `status` (text) - 'uploading', 'ready', 'processing', 'failed'
- `created_at`, `updated_at` (timestamptz)

### 3. publications
Represents a single act of publishing a video to one platform. One video upload creates N publications (one per selected platform).
- `id` (uuid, PK)
- `user_id` (uuid, FK to auth.users) - owner
- `video_id` (uuid, FK to videos) - the video being published
- `platform` (text) - target platform
- `social_connection_id` (uuid, FK to social_connections) - connection used
- `status` (text) - 'pending', 'queued', 'publishing', 'success', 'failed', 'cancelled', 'scheduled'
- `scheduled_at` (timestamptz) - when to publish (null = immediate)
- `published_at` (timestamptz) - when actually published
- `platform_post_id` (text) - ID of the post on the target platform
- `platform_post_url` (text) - URL to the published post
- `error_message` (text) - last error message if failed
- `retry_count` (integer) - number of retry attempts
- `max_retries` (integer) - max retry limit (default 3)
- `adapter_metadata` (jsonb) - platform-specific data (e.g., privacy, category)
- `created_at`, `updated_at` (timestamptz)

### 4. publication_logs
Audit trail of every action/event for each publication.
- `id` (uuid, PK)
- `user_id` (uuid, FK to auth.users) - owner
- `publication_id` (uuid, FK to publications) - the publication this log relates to
- `event` (text) - 'created', 'queued', 'publishing', 'success', 'failed', 'retry', 'cancelled', 'token_refreshed'
- `message` (text) - human-readable event description
- `details` (jsonb) - structured event details
- `created_at` (timestamptz)

## Security (RLS)
- All tables have RLS enabled.
- All tables are owner-scoped: users can only CRUD their own rows (auth.uid() = user_id).
- user_id columns default to auth.uid() so inserts that omit user_id succeed.

## Indexes
- social_connections: (user_id, platform) unique
- videos: (user_id, created_at)
- publications: (user_id, status), (video_id), (scheduled_at)
- publication_logs: (publication_id, created_at)

## Important Notes
1. This is a multi-user app with authentication. All policies use `TO authenticated` with `auth.uid()` ownership checks.
2. `user_id` columns default to `auth.uid()` so frontend inserts work without explicitly passing user_id.
3. The `social_connections` table has a unique constraint on (user_id, platform) to prevent duplicate connections.
4. `adapter_metadata` is a flexible JSONB column for platform-specific settings (YouTube category ID, TikTok privacy level, etc.).
5. `publication_logs` provides a complete audit trail for compliance and debugging.
*/

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- Table: social_connections
-- ============================================================
CREATE TABLE IF NOT EXISTS social_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('youtube', 'facebook', 'instagram', 'tiktok', 'pinterest')),
  platform_username text,
  platform_user_id text,
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  scopes text[] DEFAULT '{}',
  status text NOT NULL DEFAULT 'connected' CHECK (status IN ('connected', 'disconnected', 'expired', 'error')),
  last_synced_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE social_connections ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS idx_social_connections_user_platform ON social_connections(user_id, platform);

DROP POLICY IF EXISTS "select_own_social_connections" ON social_connections;
CREATE POLICY "select_own_social_connections" ON social_connections FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_social_connections" ON social_connections;
CREATE POLICY "insert_own_social_connections" ON social_connections FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_social_connections" ON social_connections;
CREATE POLICY "update_own_social_connections" ON social_connections FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_social_connections" ON social_connections;
CREATE POLICY "delete_own_social_connections" ON social_connections FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- Table: videos
-- ============================================================
CREATE TABLE IF NOT EXISTS videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text DEFAULT '',
  hashtags text[] DEFAULT '{}',
  thumbnail_url text,
  video_url text,
  file_path text,
  file_size bigint DEFAULT 0,
  duration integer DEFAULT 0,
  mime_type text,
  width integer DEFAULT 0,
  height integer DEFAULT 0,
  status text NOT NULL DEFAULT 'uploading' CHECK (status IN ('uploading', 'ready', 'processing', 'failed')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE videos ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_videos_user_created ON videos(user_id, created_at DESC);

DROP POLICY IF EXISTS "select_own_videos" ON videos;
CREATE POLICY "select_own_videos" ON videos FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_videos" ON videos;
CREATE POLICY "insert_own_videos" ON videos FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_videos" ON videos;
CREATE POLICY "update_own_videos" ON videos FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_videos" ON videos;
CREATE POLICY "delete_own_videos" ON videos FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- Table: publications
-- ============================================================
CREATE TABLE IF NOT EXISTS publications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  video_id uuid NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('youtube', 'facebook', 'instagram', 'tiktok', 'pinterest')),
  social_connection_id uuid REFERENCES social_connections(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'queued', 'publishing', 'success', 'failed', 'cancelled', 'scheduled')),
  scheduled_at timestamptz,
  published_at timestamptz,
  platform_post_id text,
  platform_post_url text,
  error_message text,
  retry_count integer NOT NULL DEFAULT 0,
  max_retries integer NOT NULL DEFAULT 3,
  adapter_metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE publications ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_publications_user_status ON publications(user_id, status);
CREATE INDEX IF NOT EXISTS idx_publications_video ON publications(video_id);
CREATE INDEX IF NOT EXISTS idx_publications_scheduled ON publications(scheduled_at) WHERE status IN ('scheduled', 'pending');

DROP POLICY IF EXISTS "select_own_publications" ON publications;
CREATE POLICY "select_own_publications" ON publications FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_publications" ON publications;
CREATE POLICY "insert_own_publications" ON publications FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_publications" ON publications;
CREATE POLICY "update_own_publications" ON publications FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_publications" ON publications;
CREATE POLICY "delete_own_publications" ON publications FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- Table: publication_logs
-- ============================================================
CREATE TABLE IF NOT EXISTS publication_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  publication_id uuid NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
  event text NOT NULL CHECK (event IN ('created', 'queued', 'publishing', 'success', 'failed', 'retry', 'cancelled', 'token_refreshed', 'scheduled')),
  message text,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE publication_logs ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_publication_logs_pub_created ON publication_logs(publication_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_publication_logs_user ON publication_logs(user_id, created_at DESC);

DROP POLICY IF EXISTS "select_own_publication_logs" ON publication_logs;
CREATE POLICY "select_own_publication_logs" ON publication_logs FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_publication_logs" ON publication_logs;
CREATE POLICY "insert_own_publication_logs" ON publication_logs FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_publication_logs" ON publication_logs;
CREATE POLICY "update_own_publication_logs" ON publication_logs FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_publication_logs" ON publication_logs;
CREATE POLICY "delete_own_publication_logs" ON publication_logs FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- Trigger: auto-update updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_social_connections_updated ON social_connections;
CREATE TRIGGER trg_social_connections_updated BEFORE UPDATE ON social_connections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_videos_updated ON videos;
CREATE TRIGGER trg_videos_updated BEFORE UPDATE ON videos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_publications_updated ON publications;
CREATE TRIGGER trg_publications_updated BEFORE UPDATE ON publications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- Storage buckets for videos and thumbnails
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('videos', 'videos', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('thumbnails', 'thumbnails', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for videos bucket (private - user-scoped)
DROP POLICY IF EXISTS "Users can upload own videos" ON storage.objects;
CREATE POLICY "Users can upload own videos" ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (bucket_id = 'videos' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Users can read own videos" ON storage.objects;
CREATE POLICY "Users can read own videos" ON storage.objects FOR SELECT
  TO authenticated USING (bucket_id = 'videos' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Users can delete own videos" ON storage.objects;
CREATE POLICY "Users can delete own videos" ON storage.objects FOR DELETE
  TO authenticated USING (bucket_id = 'videos' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Storage policies for thumbnails bucket (public read, user-scoped write)
DROP POLICY IF EXISTS "Users can upload own thumbnails" ON storage.objects;
CREATE POLICY "Users can upload own thumbnails" ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (bucket_id = 'thumbnails' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Anyone can read thumbnails" ON storage.objects;
CREATE POLICY "Anyone can read thumbnails" ON storage.objects FOR SELECT
  TO anon, authenticated USING (bucket_id = 'thumbnails');

DROP POLICY IF EXISTS "Users can delete own thumbnails" ON storage.objects;
CREATE POLICY "Users can delete own thumbnails" ON storage.objects FOR DELETE
  TO authenticated USING (bucket_id = 'thumbnails' AND auth.uid()::text = (storage.foldername(name))[1]);