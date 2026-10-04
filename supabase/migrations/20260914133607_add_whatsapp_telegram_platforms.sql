/*
# Add WhatsApp Channel and Telegram as supported platforms

## Overview
This migration updates the CHECK constraints on `social_connections` and `publications`
to accept two new platform values: `whatsapp` and `telegram`.

## Changes
1. `social_connections.platform` CHECK constraint updated to include 'whatsapp' and 'telegram'.
2. `publications.platform` CHECK constraint updated to include 'whatsapp' and 'telegram'.

## Security
- No changes to RLS policies. Existing owner-scoped policies apply to the new platforms automatically.
- No new tables or columns.

## Important Notes
1. The constraint is dropped and recreated (not altered) because PostgreSQL does not support
   modifying a CHECK constraint in place. Data is unaffected — only the constraint definition changes.
2. Existing rows with platforms 'youtube', 'facebook', 'instagram', 'tiktok', 'pinterest'
   remain valid under the new constraint.
*/

-- social_connections: update platform CHECK constraint
ALTER TABLE social_connections DROP CONSTRAINT IF EXISTS social_connections_platform_check;

ALTER TABLE social_connections
  ADD CONSTRAINT social_connections_platform_check
  CHECK (platform IN ('youtube', 'facebook', 'instagram', 'tiktok', 'pinterest', 'whatsapp', 'telegram'));

-- publications: update platform CHECK constraint
ALTER TABLE publications DROP CONSTRAINT IF EXISTS publications_platform_check;

ALTER TABLE publications
  ADD CONSTRAINT publications_platform_check
  CHECK (platform IN ('youtube', 'facebook', 'instagram', 'tiktok', 'pinterest', 'whatsapp', 'telegram'));
