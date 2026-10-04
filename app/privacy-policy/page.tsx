import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Zap, Shield, Lock, Database, Globe, FileText, Clock, Trash2,
  User, Cookie, Edit, HelpCircle, Users, Share2, CheckSquare, Cloud, Mail,
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'Privacy Policy — CastHub',
  description: 'How CastHub collects, uses, and protects your data across multi-platform video publishing.',
};

const PLATFORMS = [
  {
    name: 'YouTube',
    icon: 'youtube',
    color: 'text-red-600',
    bg: 'bg-red-50',
    border: 'border-red-200',
    auth: 'OAuth 2.0 (Google)',
    scopes: [
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube',
    ],
    data: [
      'Your channel name and channel ID (retrieved after authorization)',
      'Video file, title, description, tags, and thumbnail that you upload',
      'Privacy status you select (private, unlisted, or public)',
    ],
    usage: [
      'Uploads videos to your YouTube channel via the YouTube Data API v3',
      'Sets custom thumbnails on uploaded videos',
      'Retrieves your channel information to display the connection name',
    ],
    refresh: 'Access tokens are refreshed automatically using your stored refresh token when they expire.',
  },
  {
    name: 'Facebook',
    icon: 'facebook',
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    auth: 'OAuth 2.0 (Meta)',
    scopes: [
      'pages_manage_posts',
      'pages_read_engagement',
      'pages_show_list',
      'video_upload',
    ],
    data: [
      'Your Facebook Pages list (names and IDs)',
      'Page access token for the first available Page',
      'Video file URL (signed), title, and description',
    ],
    usage: [
      'Publishes videos to your Facebook Page via the Graph API',
      'Retrieves your list of Pages to select a publishing target',
      'Uses the Page access token (not your personal token) for publishing',
    ],
    refresh: 'Page access tokens are refreshed via the Meta token exchange endpoint when needed.',
  },
  {
    name: 'Instagram',
    icon: 'instagram',
    color: 'text-pink-600',
    bg: 'bg-pink-50',
    border: 'border-pink-200',
    auth: 'OAuth 2.0 (Meta, shared with Facebook)',
    scopes: [
      'instagram_content_publish',
      'instagram_basic',
      'instagram_manage_posts',
      'pages_show_list',
      'pages_read_engagement',
    ],
    data: [
      'Your Instagram Business/Creator account username and ID',
      'Associated Facebook Page ID (linkage)',
      'Video file URL (signed), title, and caption',
    ],
    usage: [
      'Creates a media container for your video via the Instagram Graph API',
      'Polls the container until processing completes, then publishes as a Reel',
      'Retrieves the permalink of the published post',
    ],
    refresh: 'Tokens are shared with the Meta app and refreshed via the same mechanism as Facebook.',
  },
  {
    name: 'TikTok',
    icon: 'tiktok',
    color: 'text-gray-900',
    bg: 'bg-gray-50',
    border: 'border-gray-200',
    auth: 'OAuth 2.0 (TikTok for Developers)',
    scopes: [
      'video.publish',
      'user.info.basic',
    ],
    data: [
      'Your TikTok username and open ID',
      'Creator privacy level options (retrieved to set post visibility)',
      'Video file URL (signed), title, and privacy settings',
    ],
    usage: [
      'Queries your creator info to determine available privacy levels',
      'Initiates a video post via the Content Posting API with a file URL',
      'Polls the publish status until the video is published or fails',
    ],
    refresh: 'Access tokens are refreshed using the TikTok refresh token endpoint.',
  },
  {
    name: 'Pinterest',
    icon: 'pinterest',
    color: 'text-red-700',
    bg: 'bg-red-50',
    border: 'border-red-200',
    auth: 'OAuth 2.0 (Pinterest Developers)',
    scopes: [
      'boards:read',
      'pins:write',
      'user_accounts:read',
    ],
    data: [
      'Your Pinterest username and account ID',
      'List of your boards (names and IDs) — only when Pinterest is selected for publishing',
      'Video file URL (signed), pin title, description, and alt text',
    ],
    usage: [
      'Retrieves your board list so you can select where to publish a video pin',
      'Creates a video pin on the board you select via the Pinterest API v5',
      'Does not analyze, aggregate, or scrape Pinterest data — pins are created only at your request',
    ],
    refresh: 'Access tokens are refreshed using the Pinterest refresh token endpoint.',
  },
  {
    name: 'Telegram',
    icon: 'telegram',
    color: 'text-sky-700',
    bg: 'bg-sky-50',
    border: 'border-sky-200',
    auth: 'Bot API (per-user configuration)',
    scopes: ['N/A — uses Bot API token'],
    data: [
      'Bot token and chat/channel ID that you enter manually',
      'Bot username and channel title (retrieved for verification)',
      'Video file, title, description, and hashtags',
    ],
    usage: [
      'Verifies the bot token via the getMe endpoint',
      'Verifies the bot is an administrator of the target channel',
      'Sends the video as a video message to the specified chat via sendVideo',
    ],
    refresh: 'Telegram bot tokens do not expire. You can revoke a token at any time via @BotFather.',
  },
  {
    name: 'WhatsApp',
    icon: 'whatsapp',
    color: 'text-green-700',
    bg: 'bg-green-50',
    border: 'border-green-200',
    auth: 'Cloud API (per-user configuration)',
    scopes: ['N/A — uses access token and phone number ID'],
    data: [
      'WhatsApp Cloud API access token and phone number ID that you enter manually',
      'Display phone number (retrieved for verification)',
      'Video file, title, description, and recipient phone number',
    ],
    usage: [
      'Uploads the video as media via the WhatsApp Cloud API',
      'Sends a video message to the recipient phone number you specify',
      'The recipient must have opted in to receive messages from your WhatsApp Business number',
    ],
    refresh: 'WhatsApp access tokens are system user tokens managed via Meta Business Manager and do not auto-refresh.',
  },
];

const SECTIONS = [
  {
    icon: FileText,
    title: 'About CastHub',
    anchor: 'about',
    content: (
      <>
        <p>
          CastHub is a multi-platform video publishing application that allows you to upload video content once
          and publish it across your connected social media accounts. CastHub currently supports integration with
          seven platforms: YouTube, Facebook, Instagram, TikTok, Pinterest, Telegram, and WhatsApp.
        </p>
        <p className="mt-3">
          This Privacy Policy explains what data CastHub collects, how it is used, how it is stored and protected,
          and what choices you have regarding your personal information. By creating a CastHub account or connecting
          a social media account, you agree to the practices described in this policy.
        </p>
      </>
    ),
  },
  {
    icon: Database,
    title: 'Personal Data We Collect',
    anchor: 'data-collected',
    content: (
      <>
        <p>CastHub collects the following categories of personal data:</p>
        <ul className="mt-3 space-y-2">
          <li><strong>Account information:</strong> Your email address when you create a CastHub account. Your password is hashed by the authentication provider and is never stored in plaintext.</li>
          <li><strong>Video content:</strong> Video files, thumbnails, titles, descriptions, and hashtags that you upload through the New Post page. These are stored in cloud storage and associated with your account.</li>
          <li><strong>Platform tokens:</strong> OAuth access tokens and refresh tokens from connected social media accounts. For Telegram, a bot token and chat ID. For WhatsApp, an access token and phone number ID. All tokens are encrypted before storage (see the Storage and Security section).</li>
          <li><strong>Platform profile data:</strong> Your username or channel/page name and ID from each connected platform, retrieved during the OAuth authorization process.</li>
          <li><strong>Publication records:</strong> Status, timestamps, platform post IDs, post URLs, retry counts, and error messages for each publication attempt. These form your publication history.</li>
          <li><strong>Technical data:</strong> Browser type, device information, and IP address collected automatically when you use the service, used for security and service stability.</li>
        </ul>
      </>
    ),
  },
  {
    icon: Share2,
    title: 'Social Media Account Data',
    anchor: 'social-data',
    content: (
      <>
        <p>
          When you connect a social media account to CastHub, the application requests access to specific data
          and permissions defined by each platform's API. The exact permissions depend on the platform and are
          listed in detail in the Third-Party Integrations section below.
        </p>
        <p className="mt-3">
          CastHub accesses your social media data only to perform actions that you explicitly initiate —
          publishing videos, retrieving board lists, or refreshing expired tokens. CastHub does not read your
          private messages, contacts, followers, analytics, or any data not required for publishing.
        </p>
      </>
    ),
  },
  {
    icon: Globe,
    title: 'How We Use Your Data',
    anchor: 'data-usage',
    content: (
      <>
        <p>Your data is used exclusively for operating CastHub's publishing features:</p>
        <ul className="mt-3 space-y-2">
          <li>Authenticating your account and maintaining your login session.</li>
          <li>Uploading and storing your video content in cloud storage.</li>
          <li>Transmitting your video content and metadata to the social media platforms you select for publication.</li>
          <li>Connecting to your social media accounts via their official APIs to publish content on your behalf.</li>
          <li>Retrieving platform-specific information needed for publishing (e.g., YouTube channel ID, Facebook Page list, Pinterest boards, TikTok creator info).</li>
          <li>Tracking publication status (success, failure, retry) and displaying your publication history.</li>
          <li>Automatically refreshing expired OAuth tokens to maintain continuous platform connections.</li>
          <li>Securing the service against unauthorized access.</li>
        </ul>
        <p className="mt-3">CastHub does not sell, rent, or share your personal data with third parties for advertising or commercial purposes.</p>
      </>
    ),
  },
  {
    icon: Globe,
    title: 'Third-Party Platform Integrations',
    anchor: 'integrations',
    custom: 'platforms',
  },
  {
    icon: CheckSquare,
    title: 'Permissions and User Consent',
    anchor: 'consent',
    content: (
      <>
        <p>CastHub operates on an explicit-consent model:</p>
        <ul className="mt-3 space-y-2">
          <li><strong>Account creation:</strong> You provide your email address and choose a password to create a CastHub account.</li>
          <li><strong>Platform connections:</strong> For OAuth platforms (YouTube, Facebook, Instagram, TikTok, Pinterest), you are redirected to the platform's own authorization page where you explicitly grant CastHub access to the requested permissions. You can decline authorization at any time.</li>
          <li><strong>Telegram and WhatsApp:</strong> You manually enter the bot token or API credentials in the Connections page. These are encrypted before storage.</li>
          <li><strong>Publication actions:</strong> Each publication is initiated by you. CastHub never publishes content automatically without your explicit action.</li>
          <li><strong>Withdraw consent:</strong> You can withdraw consent for any platform at any time by disconnecting it in the Connections page. This immediately deletes all stored tokens for that platform.</li>
        </ul>
      </>
    ),
  },
  {
    icon: Lock,
    title: 'Data Storage and Security',
    anchor: 'security',
    content: (
      <>
        <p>CastHub implements the following security measures, all verified in the application code:</p>
        <ul className="mt-3 space-y-2">
          <li><strong>AES-GCM token encryption:</strong> All OAuth access tokens, refresh tokens, Telegram bot tokens, and WhatsApp access tokens are encrypted using AES-GCM (Advanced Encryption Standard, Galois/Counter Mode) before being stored in the database. Each encrypted value uses a unique random initialization vector (IV).</li>
          <li><strong>Server-side encryption key:</strong> The encryption key is stored as a server-side edge function secret and is never included in frontend code, API responses, or client-side JavaScript.</li>
          <li><strong>No token exposure to the browser:</strong> The frontend queries the connections table selecting only non-sensitive columns (platform name, username, status, dates). Access tokens, refresh tokens, and encrypted token fields are never requested by or sent to the browser.</li>
          <li><strong>Server-side decryption:</strong> Tokens are decrypted only inside server-side edge functions at the moment of publication, using the service role key that bypasses row-level security. This key is never exposed to the client.</li>
          <li><strong>Row-Level Security (RLS):</strong> Database tables are protected by RLS policies that ensure users can only access their own data. A user cannot read or modify another user's videos, connections, or publications.</li>
          <li><strong>HTTPS encryption:</strong> All communication between your browser and CastHub servers uses HTTPS.</li>
          <li><strong>OAuth client secrets:</strong> Platform API client IDs and client secrets (Google, Meta, TikTok, Pinterest) are stored exclusively as server-side environment variables and are never sent to the frontend.</li>
          <li><strong>Signed video URLs:</strong> When a platform API requires a URL to fetch the video (Facebook, Instagram, TikTok, Pinterest), CastHub generates a temporary signed URL with a 1-hour expiry. The video storage bucket is not publicly accessible for these operations.</li>
          <li><strong>Audit logging:</strong> All publication events (created, publishing, success, retry, failure, token refresh) are logged in the publication_logs table with timestamps and relevant details.</li>
        </ul>
        <p className="mt-3 text-sm text-slate-500">
          Note: The Telegram bot token is stored as an encrypted value inside the connection's adapter metadata field,
          separate from the standard token fields. It is decrypted server-side at publication time using the same
          AES-GCM mechanism.
        </p>
      </>
    ),
  },
  {
    icon: Share2,
    title: 'Data Sharing with Third Parties',
    anchor: 'sharing',
    content: (
      <>
        <p>CastHub shares data with third parties only as necessary to provide its core functionality:</p>
        <ul className="mt-3 space-y-2">
          <li><strong>Social media platforms:</strong> When you publish a video, your video file, title, description, and hashtags are transmitted to the selected platform's API. This is the core function of CastHub and happens only when you initiate a publication.</li>
          <li><strong>Supabase (infrastructure provider):</strong> CastHub uses Supabase for database hosting, file storage, authentication, and serverless edge functions. Your data is stored in Supabase's infrastructure. See the Processors section below for details.</li>
        </ul>
        <p className="mt-3">CastHub does not share your data with advertising networks, analytics providers, data brokers, or any other third party not listed above.</p>
      </>
    ),
  },
  {
    icon: Clock,
    title: 'Data Retention',
    anchor: 'retention',
    content: (
      <>
        <p>Your data is retained as follows:</p>
        <ul className="mt-3 space-y-2">
          <li><strong>Account data (email):</strong> Retained for as long as your CastHub account is active. CastHub does not currently offer a self-service account deletion feature in the Settings page. To request account deletion, contact us (see Contact section).</li>
          <li><strong>Video files:</strong> Stored in cloud storage for as long as your account is active. Videos remain in storage until manually removed or the account is deleted. CastHub does not currently offer a video deletion feature in the dashboard interface — this is a known limitation.</li>
          <li><strong>Platform tokens:</strong> Retained until you disconnect a platform or your account is deleted. Expired tokens may be retained for automatic refresh purposes until you disconnect the platform.</li>
          <li><strong>Publication records and logs:</strong> Retained for the lifetime of your account to maintain your publication history and audit trail.</li>
          <li><strong>Technical logs:</strong> Retained for up to 90 days for security and debugging purposes.</li>
        </ul>
        <p className="mt-3 text-sm text-amber-700">
          Note: Deleting content from CastHub does not remove videos that have already been published to your
          social media accounts. You must delete published content directly on each platform.
        </p>
      </>
    ),
  },
  {
    icon: Trash2,
    title: 'Data Deletion and Account Disconnection',
    anchor: 'deletion',
    content: (
      <>
        <p>You have the following options for managing and deleting your data:</p>
        <ul className="mt-3 space-y-2">
          <li>
            <strong>Disconnect a social platform:</strong> Navigate to the Connections page and click "Disconnect"
            on any connected platform. This immediately sets the connection status to "disconnected" and clears all
            stored tokens (both encrypted and plaintext) from the database. The platform will no longer be able to
            publish on your behalf through CastHub.
          </li>
          <li>
            <strong>Delete a connection entirely:</strong> Click the trash icon next to a connection in the Connections
            page to permanently remove the connection record from the database.
          </li>
          <li>
            <strong>Revoke OAuth access at the platform level:</strong> You can additionally revoke CastHub's access
            from within each platform's settings (e.g., Google Account {`>`} Security {`>`} Third-party access, Meta {`>`}
            Settings {`>`} Apps and Websites). This is recommended as a complement to disconnecting within CastHub.
          </li>
          <li>
            <strong>Revoke a Telegram bot token:</strong> If you connected Telegram, you can revoke the bot token at
            any time via @BotFather in Telegram. This immediately invalidates the stored token even if CastHub still
            holds the encrypted copy.
          </li>
          <li>
            <strong>Delete your CastHub account:</strong> CastHub does not currently offer a self-service account
            deletion button in the Settings page. To request full account and data deletion, contact us using the
            information in the Contact section. Upon verification, we will delete your account, all stored videos,
            all platform connections, and all publication records.
          </li>
        </ul>
        <p className="mt-3 text-sm text-amber-700">
          Note: Video deletion from cloud storage is not currently available as a self-service feature in the
          dashboard. If you need a specific video deleted before account deletion is available, contact us and we
          will remove it manually.
        </p>
      </>
    ),
  },
  {
    icon: User,
    title: 'Your Rights and Choices',
    anchor: 'rights',
    content: (
      <>
        <p>Depending on your jurisdiction (GDPR for EU residents, CCPA for California residents, or other applicable privacy laws), you have the following rights:</p>
        <ul className="mt-3 space-y-2">
          <li><strong>Access:</strong> Request a copy of the personal data CastHub holds about you.</li>
          <li><strong>Rectification:</strong> Request correction of inaccurate personal data.</li>
          <li><strong>Erasure:</strong> Request deletion of your personal data (right to be forgotten).</li>
          <li><strong>Restriction:</strong> Request restriction of processing of your personal data.</li>
          <li><strong>Portability:</strong> Request export of your personal data in a structured, machine-readable format.</li>
          <li><strong>Objection:</strong> Object to the processing of your personal data for specific purposes.</li>
          <li><strong>Withdraw consent:</strong> Disconnect any platform at any time from the Connections page to withdraw consent for that platform's data processing.</li>
        </ul>
        <p className="mt-3">To exercise any of these rights, contact us using the information in the Contact section below. We will respond within 30 days of receiving your request.</p>
      </>
    ),
  },
  {
    icon: Cookie,
    title: 'Cookies and Technical Data',
    anchor: 'cookies',
    content: (
      <>
        <p>CastHub uses essential cookies and technologies to operate the service:</p>
        <ul className="mt-3 space-y-2">
          <li><strong>Authentication session cookies:</strong> Maintain your login session so you do not need to sign in on every page load. These cookies are essential and cannot be disabled while using the application.</li>
          <li><strong>OAuth state tokens:</strong> Temporary values stored in sessionStorage during the OAuth flow to prevent cross-site request forgery (CSRF). These are cleared immediately after the OAuth callback completes.</li>
        </ul>
        <p className="mt-3">CastHub does not use advertising cookies, tracking pixels, third-party analytics cookies, or social media tracking plugins. No data from cookies is shared with advertising networks.</p>
      </>
    ),
  },
  {
    icon: Cloud,
    title: 'Service Providers and Processors',
    anchor: 'processors',
    content: (
      <>
        <p>CastHub relies on the following service providers to operate:</p>
        <ul className="mt-3 space-y-2">
          <li>
            <strong>Supabase:</strong> Provides the PostgreSQL database (hosted), file storage for videos and
            thumbnails, user authentication (email/password), and serverless edge functions that handle OAuth
            token exchange, publication orchestration, and scheduled publishing. Your data — including encrypted
            tokens — is stored in Supabase's infrastructure. Supabase acts as a data processor under CastHub's
            instructions.
          </li>
          <li>
            <strong>Netlify:</strong> Hosts the CastHub web application frontend. Netlify serves the web pages
            but does not have access to your database or stored tokens. Authentication sessions are managed
            through Supabase, not Netlify.
          </li>
        </ul>
        <p className="mt-3">
          The social media platforms themselves (Google, Meta, TikTok, Pinterest, Telegram) also process your data
          when you publish content or authorize CastHub. Each platform operates under its own privacy policy and
          terms of service.
        </p>
      </>
    ),
  },
  {
    icon: Users,
    title: "Children's Privacy",
    anchor: 'minors',
    content: (
      <>
        <p>
          CastHub is not directed at children under the age of 13 (or the minimum age required to have an account
          on each respective platform, whichever is higher). CastHub does not knowingly collect personal data from
          children. If you believe a child has provided personal data to CastHub, please contact us and we will
          take steps to delete that data.
        </p>
        <p className="mt-3">
          Each social media platform has its own minimum age requirements. By connecting a platform, you confirm
          that you meet that platform's age requirements.
        </p>
      </>
    ),
  },
  {
    icon: Edit,
    title: 'Changes to This Policy',
    anchor: 'changes',
    content: (
      <>
        <p>We may update this Privacy Policy from time to time to reflect changes in our practices, technology, legal requirements, or platform API terms. When we make material changes, we will:</p>
        <ul className="mt-3 space-y-2">
          <li>Update the "Last updated" date at the top of this page.</li>
          <li>Notify you through the application when significant changes are made.</li>
        </ul>
        <p className="mt-3">Continued use of CastHub after changes take effect constitutes acceptance of the updated policy. We encourage you to review this page periodically.</p>
      </>
    ),
  },
  {
    icon: HelpCircle,
    title: 'Contact for Privacy Questions',
    anchor: 'contact',
    content: (
      <>
        <p>
          If you have questions about this Privacy Policy, wish to exercise your data protection rights, or need to
          request account or data deletion, please contact us at the following address:
        </p>
        <div className="mt-4 p-5 rounded-xl bg-slate-900 text-white">
          <div className="flex items-center gap-3">
            <Mail className="h-5 w-5 text-slate-300 flex-shrink-0" />
            <div>
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Official contact email</p>
              <a
                href="mailto:oaab531@gmail.com"
                className="text-lg font-semibold text-white hover:text-slate-200 transition-colors"
              >
                oaab531@gmail.com
              </a>
            </div>
          </div>
        </div>
        <p className="mt-4 text-sm text-slate-500">
          You can also manage your data directly within CastHub: disconnect platforms from the Connections page,
          and contact the platform providers directly to revoke OAuth access. We will respond to privacy-related
          requests within 30 days of receipt.
        </p>
      </>
    ),
  },
];


export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white">
              <Zap className="h-4 w-4" />
            </div>
            <span className="text-lg font-bold tracking-tight text-slate-900">CastHub</span>
          </Link>
          <Link href="/login" className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">
            Sign in
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900 text-white">
              <Shield className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-3xl lg:text-4xl font-bold tracking-tight text-slate-900">Privacy Policy</h1>
              <p className="text-sm text-slate-500 mt-1">Last updated: October 4, 2026</p>
            </div>
          </div>
          <p className="text-slate-600 leading-relaxed text-base lg:text-lg">
            CastHub ("we", "us", or "our") is a multi-platform video publishing application. This Privacy Policy
            explains how we collect, use, store, and protect your data when you use CastHub to publish videos
            across YouTube, Facebook, Instagram, TikTok, Pinterest, Telegram, and WhatsApp.
          </p>
        </div>

        <nav className="mb-10 p-4 rounded-xl bg-slate-50 border border-slate-200">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Contents</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {SECTIONS.map((section, i) => (
              <a
                key={i}
                href={`#${section.anchor}`}
                className="text-sm text-slate-600 hover:text-slate-900 transition-colors flex items-center gap-2"
              >
                <span className="text-slate-400">{String(i + 1).padStart(2, '0')}</span>
                {section.title}
              </a>
            ))}
          </div>
        </nav>

        <div className="space-y-12">
          {SECTIONS.map((section, i) => {
            const Icon = section.icon;
            return (
              <section key={i} id={section.anchor} className="scroll-mt-24">
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-700 flex-shrink-0">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h2 className="text-xl lg:text-2xl font-bold tracking-tight text-slate-900">
                    {i + 1}. {section.title}
                  </h2>
                </div>
                <div className="pl-0 sm:pl-12 text-slate-600 leading-relaxed text-sm lg:text-base">
                  {section.custom === 'platforms' ? (
                    <div className="space-y-6">
                      <p>
                        CastHub integrates with the following seven social media platforms via their official APIs.
                        Each integration requires your explicit authorization. The data accessed and permissions
                        requested differ by platform.
                      </p>
                      {PLATFORMS.map((platform, pi) => (
                        <div
                          key={pi}
                          className={`rounded-xl border ${platform.border} ${platform.bg} p-5`}
                        >
                          <h3 className="text-base font-bold text-slate-900 mb-2 flex items-center gap-2">
                            <span className={`text-lg ${platform.color}`}>&#9632;</span>
                            {pi + 1}.{pi + 1} {platform.name}
                          </h3>
                          <div className="space-y-3 text-sm">
                            <div>
                              <p className="font-semibold text-slate-700">Authentication method:</p>
                              <p className="text-slate-600">{platform.auth}</p>
                            </div>
                            <div>
                              <p className="font-semibold text-slate-700">Permissions requested:</p>
                              <ul className="mt-1 space-y-1">
                                {platform.scopes.map((scope, si) => (
                                  <li key={si} className="flex items-start gap-2 text-slate-600">
                                    <span className="text-slate-400 mt-0.5">&bull;</span>
                                    <code className="text-xs bg-white/60 px-1.5 py-0.5 rounded font-mono">{scope}</code>
                                  </li>
                                ))}
                              </ul>
                            </div>
                            <div>
                              <p className="font-semibold text-slate-700">Data accessed:</p>
                              <ul className="mt-1 space-y-1">
                                {platform.data.map((d, di) => (
                                  <li key={di} className="flex items-start gap-2 text-slate-600">
                                    <span className="text-slate-400 mt-0.5">&bull;</span>
                                    {d}
                                  </li>
                                ))}
                              </ul>
                            </div>
                            <div>
                              <p className="font-semibold text-slate-700">How CastHub uses this data:</p>
                              <ul className="mt-1 space-y-1">
                                {platform.usage.map((u, ui) => (
                                  <li key={ui} className="flex items-start gap-2 text-slate-600">
                                    <span className="text-slate-400 mt-0.5">&bull;</span>
                                    {u}
                                  </li>
                                ))}
                              </ul>
                            </div>
                            <div>
                              <p className="font-semibold text-slate-700">Token management:</p>
                              <p className="text-slate-600 mt-1">{platform.refresh}</p>
                            </div>
                            <div>
                              <p className="font-semibold text-slate-700">Disconnection:</p>
                              <p className="text-slate-600 mt-1">
                                You can disconnect {platform.name} at any time from the Connections page in CastHub.
                                This immediately deletes all stored tokens. You may also revoke access from within
                                {platform.name === 'Telegram' ? ' @BotFather' : platform.name === 'WhatsApp' ? ' Meta Business Manager' : ` your ${platform.name} account settings`}.
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    section.content
                  )}
                </div>
              </section>
            );
          })}
        </div>

        <footer className="mt-16 pt-8 border-t border-slate-200">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-900 text-white">
                <Zap className="h-3.5 w-3.5" />
              </div>
              <span className="text-sm font-semibold text-slate-900">CastHub</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-slate-500">
              <Link href="/login" className="hover:text-slate-900 transition-colors">Sign in</Link>
              <Link href="/signup" className="hover:text-slate-900 transition-colors">Sign up</Link>
              <Link href="/privacy-policy" className="hover:text-slate-900 transition-colors font-medium">Privacy Policy</Link>
            </div>
          </div>
          <p className="mt-4 text-center text-xs text-slate-400">
            © 2026 CastHub. All rights reserved.
          </p>
        </footer>
      </main>
    </div>
  );
}
