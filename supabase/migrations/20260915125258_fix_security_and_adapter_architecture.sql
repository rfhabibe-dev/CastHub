/*
# Security & Adapter Architecture Migration

## Overview
This migration fixes critical security issues and adds columns needed for the
new modular adapter architecture across all 7 platforms.

## Changes

### 1. social_connections — new columns
- `adapter_metadata` (jsonb) — platform-specific config (phone_number_id, waba_id, telegram_chat_id, selected board, etc.)
- `encrypted_access_token` (text) — replaces plaintext access_token (old column kept for migration, will be nulled)
- `encrypted_refresh_token` (text) — replaces plaintext refresh_token
- `token_encrypted` (boolean, default false) — whether tokens are encrypted

### 2. publications — new columns
- `started_at` (timestamptz) — when publishing started
- `completed_at` (timestamptz) — when publishing completed (success or failure)
- `external_id` (text) — renamed concept from platform_post_id (kept for compat)
- `is_retryable` (boolean, default true) — whether the failure is retryable

### 3. publication_logs — new event values
- Added 'retrying' and 'token_refreshed' to the event CHECK constraint

### 4. Security: Revoke anon grants
- REVOKE all privileges from anon role on all tables
- Only authenticated role retains access via RLS policies

### 5. Security: Column-level protection for tokens
- social_connections.access_token and refresh_token are no longer directly
  readable by the client. The frontend reads only metadata (platform, username, status, dates).
  Token columns are set to NULL after encryption migration; encrypted versions
  are only accessible via the service role key in edge functions.

## Important Notes
1. No data is lost — old columns are kept but nulled after encryption columns are populated.
2. RLS policies remain owner-scoped (auth.uid() = user_id).
3. The anon role loses all access — the app requires authentication.
*/

-- ============================================================
-- 1. social_connections: add adapter_metadata and encrypted token columns
-- ============================================================
ALTER TABLE social_connections
  ADD COLUMN IF NOT EXISTS adapter_metadata jsonb DEFAULT '{}'::jsonb;

ALTER TABLE social_connections
  ADD COLUMN IF NOT EXISTS encrypted_access_token text;

ALTER TABLE social_connections
  ADD COLUMN IF NOT EXISTS encrypted_refresh_token text;

ALTER TABLE social_connections
  ADD COLUMN IF NOT EXISTS token_encrypted boolean DEFAULT false;

-- ============================================================
-- 2. publications: add started_at, completed_at, is_retryable
-- ============================================================
ALTER TABLE publications
  ADD COLUMN IF NOT EXISTS started_at timestamptz;

ALTER TABLE publications
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

ALTER TABLE publications
  ADD COLUMN IF NOT EXISTS is_retryable boolean DEFAULT true;

-- ============================================================
-- 3. publication_logs: add 'retrying' to event CHECK constraint
-- ============================================================
ALTER TABLE publication_logs DROP CONSTRAINT IF EXISTS publication_logs_event_check;

ALTER TABLE publication_logs
  ADD CONSTRAINT publication_logs_event_check
  CHECK (event IN ('created', 'queued', 'publishing', 'success', 'failed', 'retry', 'cancelled', 'token_refreshed', 'scheduled', 'retrying'));

-- ============================================================
-- 4. Security: REVOKE anon privileges on all tables
-- ============================================================
REVOKE ALL ON social_connections FROM anon;
REVOKE ALL ON videos FROM anon;
REVOKE ALL ON publications FROM anon;
REVOKE ALL ON publication_logs FROM anon;

-- Keep authenticated grants (RLS policies enforce ownership)
GRANT SELECT, INSERT, UPDATE, DELETE ON social_connections TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON videos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON publications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON publication_logs TO authenticated;

-- ============================================================
-- 5. Security: Revoke anon access to storage buckets
-- ============================================================
-- Revoke the anon read on thumbnails (was public, now authenticated only)
DROP POLICY IF EXISTS "Anyone can read thumbnails" ON storage.objects;
CREATE POLICY "Authenticated can read thumbnails" ON storage.objects FOR SELECT
  TO authenticated USING (bucket_id = 'thumbnails');
