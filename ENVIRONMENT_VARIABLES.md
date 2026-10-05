# Environment Variables — CastHub Multi-Platform Publishing

This document lists every secret and environment variable required by the application.
Private platform credentials are configured as **Edge Function Secrets** in your Supabase project — never in the frontend or any `NEXT_PUBLIC_` variable. The browser only needs the public Supabase URL and anon key for its client connection.

## Already Configured (Supabase Built-in)

| Variable | Secret? | Where Used | Description |
|----------|---------|------------|-------------|
| `SUPABASE_URL` | No | All edge functions | Supabase project URL |
| `SUPABASE_ANON_KEY` | No | Edge functions, frontend | Supabase anon public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | All edge functions | Service role key (bypasses RLS) |
| `SUPABASE_DB_URL` | Yes | Database access | Direct Postgres connection string |

## Required Secrets (Set as Edge Function Secrets)

### Token Encryption

| Variable | Platform | Obligatory | Secret? | Where Used | Description |
|----------|----------|------------|---------|------------|-------------|
| `TOKEN_ENCRYPTION_KEY` | All | **Yes** | Yes | `_shared/crypto.ts` | 32+ character string used to encrypt/decrypt OAuth tokens with AES-GCM. Generate with: `openssl rand -base64 32` |

### Mock/Test Mode

| Variable | Platform | Obligatory | Secret? | Where Used | Description |
|----------|----------|------------|---------|------------|-------------|
| `MOCK_MODE` | All | No | No | `_shared/mock-mode.ts` | Set to `"true"` to enable mock mode — adapters return simulated success responses without calling real APIs |

### OAuth Redirect URI

| Variable | Platform | Obligatory | Secret? | Where Used | Description |
|----------|----------|------------|---------|------------|-------------|
| `OAUTH_REDIRECT_URI` | All OAuth | No | No | `oauth-handler/index.ts` | Optional fallback only. The current browser flow sends `${window.location.origin}/connections` explicitly for both authorization and token exchange. Set this only if a server-side fallback is needed, using the exact production `/connections` URL. |

### YouTube (Google)

| Variable | Platform | Obligatory | Secret? | Where Used | Description |
|----------|----------|------------|---------|------------|-------------|
| `GOOGLE_CLIENT_ID` | YouTube | **Yes** | Yes | `oauth-handler/index.ts`, `adapters/youtube.ts` | Google OAuth 2.0 Client ID from Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | YouTube | **Yes** | Yes | `oauth-handler/index.ts`, `adapters/youtube.ts` | Google OAuth 2.0 Client Secret |

**Where to get them:** Google Cloud Console → APIs & Services → Credentials → Create OAuth 2.0 Client ID (Web Application)

### Facebook + Instagram (Meta)

| Variable | Platform | Obligatory | Secret? | Where Used | Description |
|----------|----------|------------|---------|------------|-------------|
| `META_APP_ID` | Facebook, Instagram | **Yes** | Yes | `oauth-handler/index.ts`, `adapters/facebook.ts`, `adapters/instagram.ts` | Meta App ID from Meta for Developers |
| `META_APP_SECRET` | Facebook, Instagram | **Yes** | Yes | `oauth-handler/index.ts`, `adapters/facebook.ts`, `adapters/instagram.ts` | Meta App Secret |

**Where to get them:** Meta for Developers → Your App → Settings → Basic

### TikTok

| Variable | Platform | Obligatory | Secret? | Where Used | Description |
|----------|----------|------------|---------|------------|-------------|
| `TIKTOK_CLIENT_KEY` | TikTok | **Yes** | Yes | `oauth-handler/index.ts`, `adapters/tiktok.ts` | TikTok Client Key from TikTok for Developers |
| `TIKTOK_CLIENT_SECRET` | TikTok | **Yes** | Yes | `oauth-handler/index.ts`, `adapters/tiktok.ts` | TikTok Client Secret |

**Where to get them:** TikTok for Developers → Your App → Basic Settings

### Pinterest

| Variable | Platform | Obligatory | Secret? | Where Used | Description |
|----------|----------|------------|---------|------------|-------------|
| `PINTEREST_APP_ID` | Pinterest | **Yes** | Yes | `oauth-handler/index.ts`, `adapters/pinterest.ts` | Pinterest App ID from Pinterest Developers |
| `PINTEREST_APP_SECRET` | Pinterest | **Yes** | Yes | `oauth-handler/index.ts`, `adapters/pinterest.ts` | Pinterest App Secret |

**Where to get them:** Pinterest Developers → Your App → Basic Info

### Telegram

| Variable | Platform | Obligatory | Secret? | Where Used | Description |
|----------|----------|------------|---------|------------|-------------|
| _(none — configured per-user via Connections page)_ | Telegram | N/A | N/A | `adapters/telegram.ts` | Bot token and chat ID are entered by each user in the Connections page and encrypted before storage |

**How to get credentials:**
1. Open Telegram, search `@BotFather`
2. Send `/newbot`, follow instructions
3. Copy the bot token
4. Create a channel, add the bot as administrator
5. In the Connections page, enter the bot token and channel ID

### WhatsApp

| Variable | Platform | Obligatory | Secret? | Where Used | Description |
|----------|----------|------------|---------|------------|-------------|
| _(none — configured per-user via Connections page)_ | WhatsApp | N/A | N/A | `adapters/whatsapp.ts` | Access token and phone number ID are entered by each user in the Connections page and encrypted before storage |

**How to get credentials:**
1. Go to Meta Business Manager → WhatsApp Manager
2. Add a phone number
3. Create a System User and generate an access token
4. Note the Phone Number ID
5. In the Connections page, enter the access token and phone number ID

## OAuth Redirect URIs

The OAuth flow uses the **frontend URL** as the redirect URI (not the edge function URL). The Connections page sends its current origin plus `/connections` to the Edge Function for authorization and token exchange. `OAUTH_REDIRECT_URI` is not required for this normal browser flow; it is only a fallback if the request does not include a redirect URI.

Register this exact URI in each platform's developer console:

| Platform | Redirect URI | Where Configured |
|----------|-------------|------------------|
| YouTube (Google) | `https://YOUR_APP_URL/connections` | Google Cloud Console → Credentials → Authorized redirect URIs |
| Facebook (Meta) | `https://YOUR_APP_URL/connections` | Meta for Developers → Your App → Facebook Login → Settings → Valid OAuth Redirect URIs |
| Instagram (Meta) | `https://YOUR_APP_URL/connections` | Meta for Developers → Your App → Instagram Graph API → Display Login |
| TikTok | `https://YOUR_APP_URL/connections` | TikTok for Developers → Your App → Login Configuration |
| Pinterest | `https://YOUR_APP_URL/connections` | Pinterest Developers → Your App → Redirect URIs |

**Note:** Replace `YOUR_APP_URL` with your actual deployed app URL. Do not use a GitHub Pages preview or invent a domain. The redirect URI is `${window.location.origin}/connections` — the Connections page handles the OAuth callback.

**Callback implementation:** `app/(app)/connections/page.tsx` — the `useEffect` at line 195 detects `code` and `state` URL parameters and sends them to the `oauth-handler` edge function.

## OAuth Scopes

| Platform | Scopes |
|----------|--------|
| YouTube | `https://www.googleapis.com/auth/youtube.upload`, `https://www.googleapis.com/auth/youtube` |
| Facebook | `pages_manage_posts`, `pages_read_engagement`, `pages_show_list`, `video_upload` |
| Instagram | `instagram_content_publish`, `instagram_basic`, `instagram_manage_posts`, `pages_show_list`, `pages_read_engagement` |
| TikTok | `video.publish`, `user.info.basic` |
| Pinterest | `boards:read`, `pins:write`, `user_accounts:read` |
| Telegram | N/A (Bot API, not OAuth) |
| WhatsApp | N/A (Cloud API, configured per-user) |

## Summary Table

| Secret Name | Platform | Required | Where to Get It |
|-------------|----------|----------|-----------------|
| `TOKEN_ENCRYPTION_KEY` | All | **Yes** | Generate: `openssl rand -base64 32` |
| `MOCK_MODE` | All | No | Set to `"true"` for testing |
| `OAUTH_REDIRECT_URI` | All OAuth | No | Optional production frontend callback URL, used only as a fallback |
| `GOOGLE_CLIENT_ID` | YouTube | **Yes** | Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | YouTube | **Yes** | Google Cloud Console |
| `META_APP_ID` | Facebook + Instagram | **Yes** | Meta for Developers |
| `META_APP_SECRET` | Facebook + Instagram | **Yes** | Meta for Developers |
| `TIKTOK_CLIENT_KEY` | TikTok | **Yes** | TikTok for Developers |
| `TIKTOK_CLIENT_SECRET` | TikTok | **Yes** | TikTok for Developers |
| `PINTEREST_APP_ID` | Pinterest | **Yes** | Pinterest Developers |
| `PINTEREST_APP_SECRET` | Pinterest | **Yes** | Pinterest Developers |

## Recommended Setup Order

1. **`TOKEN_ENCRYPTION_KEY`** — Generate and set first. Required for all token storage.
2. **`MOCK_MODE=true`** — Enable for initial testing without real credentials.
3. **Telegram** — No OAuth secrets needed. Create a bot, configure in Connections page.
4. **YouTube** — Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Well-documented OAuth.
5. **Pinterest** — Set `PINTEREST_APP_ID` and `PINTEREST_APP_SECRET`. Simple OAuth flow.
6. **Facebook + Instagram** — Set `META_APP_ID` and `META_APP_SECRET`. Shared Meta app.
7. **TikTok** — Set `TIKTOK_CLIENT_KEY` and `TIKTOK_CLIENT_SECRET`. Requires Content Posting API approval.
8. **WhatsApp** — No server secrets needed. Configure per-user in Connections page.
9. **`MOCK_MODE`** — Remove or set to `"false"` once all credentials are configured.
