'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/components/auth/auth-provider';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { PlatformBadge } from '@/components/platforms/platform-badge';
import { PLATFORM_LIST, getPlatformConfig } from '@/lib/platforms/config';
import type { SocialConnection, Platform } from '@/lib/types/database';
import {
  Link2, CheckCircle2, AlertCircle, Loader2, RefreshCw, Trash2,
  Shield, Clock, XCircle,
} from 'lucide-react';
import { toast } from 'sonner';

export default function ConnectionsPage() {
  const { user } = useAuth();
  const [connections, setConnections] = useState<SocialConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<Platform | null>(null);

  // Telegram config dialog
  const [telegramDialog, setTelegramDialog] = useState(false);
  const [telegramBotToken, setTelegramBotToken] = useState('');
  const [telegramChatId, setTelegramChatId] = useState('');
  const [telegramSaving, setTelegramSaving] = useState(false);

  // WhatsApp config dialog
  const [whatsappDialog, setWhatsappDialog] = useState(false);
  const [whatsappAccessToken, setWhatsappAccessToken] = useState('');
  const [whatsappPhoneNumberId, setWhatsappPhoneNumberId] = useState('');
  const [whatsappWabaId, setWhatsappWabaId] = useState('');
  const [whatsappSaving, setWhatsappSaving] = useState(false);

  const loadConnections = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('social_connections')
      .select('id, user_id, platform, platform_username, platform_user_id, token_encrypted, token_expires_at, scopes, status, adapter_metadata, last_synced_at, created_at, updated_at')
      .order('created_at', { ascending: false });
    setConnections((data || []) as SocialConnection[]);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    loadConnections();
  }, [loadConnections]);

  const getConnection = (platform: Platform) =>
    connections.find((c) => c.platform === platform);

  const handleOAuthConnect = async (platform: Platform) => {
    setConnecting(platform);
    const config = getPlatformConfig(platform);

    const redirectUri = `${window.location.origin}/connections`;

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/oauth-handler`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          platform,
          user_id: user?.id,
          action: 'get_auth_url',
          redirect_uri: redirectUri,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.auth_url) {
        throw new Error(data.error || `${config.name} OAuth not configured yet`);
      }

      sessionStorage.setItem(`oauth_state_${platform}`, data.state);
      sessionStorage.setItem('oauth_platform', platform);
      sessionStorage.setItem('oauth_user_id', user?.id || '');

      toast.info(`Redirecting to ${config.name}...`, {
        description: 'You will be redirected to authorize the connection.',
      });

      window.location.href = data.auth_url;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to start OAuth';
      toast.error(msg);
    } finally {
      setConnecting(null);
    }
  };

  const handleConnect = async (platform: Platform) => {
    const config = getPlatformConfig(platform);

    if (config.authType === 'bot_token') {
      // Telegram — open config dialog
      setTelegramBotToken('');
      setTelegramChatId('');
      setTelegramDialog(true);
      return;
    }

    if (platform === 'whatsapp') {
      // WhatsApp — open config dialog (uses API credentials, not standard OAuth)
      setWhatsappAccessToken('');
      setWhatsappPhoneNumberId('');
      setWhatsappWabaId('');
      setWhatsappDialog(true);
      return;
    }

    // OAuth2 platforms
    await handleOAuthConnect(platform);
  };

  const handleTelegramSave = async () => {
    if (!telegramBotToken.trim() || !telegramChatId.trim()) {
      toast.error('Bot token and chat ID are required');
      return;
    }

    setTelegramSaving(true);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/oauth-handler`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          platform: 'telegram',
          user_id: user?.id,
          adapter_metadata: {
            bot_token: telegramBotToken.trim(),
            chat_id: telegramChatId.trim(),
          },
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to connect Telegram');
      }

      toast.success('Telegram connected successfully');
      setTelegramDialog(false);
      loadConnections();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to connect';
      toast.error(msg);
    } finally {
      setTelegramSaving(false);
    }
  };

  const handleWhatsAppSave = async () => {
    if (!whatsappAccessToken.trim() || !whatsappPhoneNumberId.trim()) {
      toast.error('Access token and phone number ID are required');
      return;
    }

    setWhatsappSaving(true);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/oauth-handler`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          platform: 'whatsapp',
          user_id: user?.id,
          adapter_metadata: {
            access_token: whatsappAccessToken.trim(),
            phone_number_id: whatsappPhoneNumberId.trim(),
            waba_id: whatsappWabaId.trim() || undefined,
          },
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to connect WhatsApp');
      }

      toast.success('WhatsApp connected successfully');
      setWhatsappDialog(false);
      loadConnections();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to connect';
      toast.error(msg);
    } finally {
      setWhatsappSaving(false);
    }
  };

  // Handle OAuth callback (code in URL params)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    const storedPlatform = sessionStorage.getItem('oauth_platform');
    const storedState = storedPlatform ? sessionStorage.getItem(`oauth_state_${storedPlatform}`) : null;
    const storedUserId = sessionStorage.getItem('oauth_user_id') || user?.id || '';

    if (code && state && storedPlatform && storedState === state) {
      // Clean URL
      window.history.replaceState({}, document.title, window.location.pathname);

      // Exchange code for tokens via edge function
      fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/oauth-handler`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          platform: storedPlatform,
          code,
          state,
          user_id: storedUserId,
          redirect_uri: `${window.location.origin}/connections`,
        }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.success) {
            toast.success(`${storedPlatform} connected successfully`);
            loadConnections();
          } else {
            toast.error(data.error || `Failed to connect ${storedPlatform}`);
          }
        })
        .catch(() => {
          toast.error(`Failed to connect ${storedPlatform}`);
        });

      // Clean up sessionStorage
      sessionStorage.removeItem('oauth_platform');
      sessionStorage.removeItem(`oauth_state_${storedPlatform}`);
      sessionStorage.removeItem('oauth_user_id');
    }
  }, [user, loadConnections]);

  const handleDisconnect = async (connection: SocialConnection) => {
    const { error } = await supabase
      .from('social_connections')
      .update({ status: 'disconnected', access_token: null, refresh_token: null, encrypted_access_token: null, encrypted_refresh_token: null, token_encrypted: false })
      .eq('id', connection.id);

    if (error) {
      toast.error('Failed to disconnect: ' + error.message);
      return;
    }

    toast.success(`Disconnected from ${getPlatformConfig(connection.platform).name}`);
    loadConnections();
  };

  const handleDelete = async (connection: SocialConnection) => {
    const { error } = await supabase
      .from('social_connections')
      .delete()
      .eq('id', connection.id);

    if (error) {
      toast.error('Failed to remove: ' + error.message);
      return;
    }

    toast.success(`Removed ${getPlatformConfig(connection.platform).name} connection`);
    loadConnections();
  };

  if (loading) {
    return (
      <div className="p-6 lg:p-8 max-w-5xl mx-auto">
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-48 bg-slate-200 rounded" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[...Array(7)].map((_, i) => (
              <div key={i} className="h-40 bg-slate-200 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-slate-900">Social Connections</h1>
        <p className="text-slate-500 mt-1">Connect your social media accounts to publish across platforms</p>
      </div>

      {/* Info banner */}
      <div className="mb-6 flex items-start gap-3 p-4 rounded-xl bg-blue-50 border border-blue-200">
        <Shield className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-blue-900">Secure Authentication</p>
          <p className="text-xs text-blue-700 mt-1">
            OAuth tokens and bot credentials are encrypted with AES-GCM before storage and are never exposed to the frontend.
            You need a developer account and approved app for each OAuth platform to enable real publishing.
          </p>
        </div>
      </div>

      {/* Platform cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {PLATFORM_LIST.map((platform) => {
          const connection = getConnection(platform.id);
          const isConnected = connection?.status === 'connected';
          const isExpired = connection?.status === 'expired';
          const isError = connection?.status === 'error';

          return (
            <Card
              key={platform.id}
              className={`border-slate-200 shadow-sm transition-all ${
                isConnected ? 'ring-1 ring-green-200' : ''
              }`}
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <PlatformBadge platform={platform.id} showName={false} size="lg" />
                    <div>
                      <CardTitle className="text-base">{platform.name}</CardTitle>
                      <CardDescription className="text-xs mt-0.5">
                        {platform.description}
                      </CardDescription>
                    </div>
                  </div>
                  {isConnected && (
                    <span className="flex items-center gap-1 text-xs font-medium text-green-600">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Connected
                    </span>
                  )}
                  {isExpired && (
                    <span className="flex items-center gap-1 text-xs font-medium text-amber-600">
                      <Clock className="h-3.5 w-3.5" />
                      Expired
                    </span>
                  )}
                  {isError && (
                    <span className="flex items-center gap-1 text-xs font-medium text-red-600">
                      <XCircle className="h-3.5 w-3.5" />
                      Error
                    </span>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {connection && isConnected ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100">
                        <Link2 className="h-4 w-4 text-slate-500" />
                      </div>
                      <div>
                        <p className="font-medium text-slate-700">
                          {connection.platform_username || 'Connected account'}
                        </p>
                        <p className="text-xs text-slate-400">
                          Connected {new Date(connection.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleConnect(platform.id)}
                      >
                        <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                        Reconnect
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={() => handleDisconnect(connection)}
                      >
                        Disconnect
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDelete(connection)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {platform.scopes.length > 0 && (
                      <div className="space-y-1.5">
                        {platform.scopes.map((scope) => (
                          <div key={scope} className="flex items-center gap-1.5 text-xs text-slate-500">
                            <CheckCircle2 className="h-3 w-3 text-slate-400" />
                            {scope}
                          </div>
                        ))}
                      </div>
                    )}
                    <Button
                      onClick={() => handleConnect(platform.id)}
                      disabled={connecting === platform.id}
                      className="w-full"
                    >
                      {connecting === platform.id ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Connecting...
                        </>
                      ) : (
                        <>
                          <Link2 className="h-4 w-4 mr-2" />
                          Connect {platform.name}
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Developer setup note */}
      <div className="mt-8 p-4 rounded-xl bg-slate-50 border border-slate-200">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-slate-500 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-slate-600 space-y-2">
            <p className="font-medium text-slate-700">Developer Setup Required</p>
            <p>To enable real publishing, you need to register a developer app for each platform:</p>
            <ul className="list-disc list-inside space-y-1 text-xs text-slate-500 ml-2">
              <li>YouTube: Google Cloud Console — enable YouTube Data API v3</li>
              <li>Facebook & Instagram: Meta for Developers — create a Business app</li>
              <li>TikTok: TikTok for Developers — apply for Content Posting API access</li>
              <li>Pinterest: Pinterest Developer — create an app with Business account</li>
              <li>WhatsApp: Meta for Developers — enable WhatsApp Cloud API, get access token and phone number ID</li>
              <li>Telegram: BotFather — create a bot, get token, add bot as channel admin</li>
            </ul>
            <p className="text-xs text-slate-500">
              After creating each app, configure the OAuth credentials as edge function secrets. See ENVIRONMENT_VARIABLES.md for the complete list.
            </p>
          </div>
        </div>
      </div>

      {/* Telegram Config Dialog */}
      <Dialog open={telegramDialog} onOpenChange={setTelegramDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connect Telegram</DialogTitle>
            <DialogDescription>
              Configure your Telegram bot to publish to a channel. Create a bot via @BotFather, then add it as an administrator of your channel.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="telegram-bot-token">Bot Token</Label>
              <Input
                id="telegram-bot-token"
                type="password"
                placeholder="123456789:ABCdefGhIjKlMnOpQrStUvWxYz"
                value={telegramBotToken}
                onChange={(e) => setTelegramBotToken(e.target.value)}
              />
              <p className="text-xs text-slate-400">Get this from @BotFather when you create your bot</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="telegram-chat-id">Channel/Chat ID</Label>
              <Input
                id="telegram-chat-id"
                placeholder="@yourchannel or -1001234567890"
                value={telegramChatId}
                onChange={(e) => setTelegramChatId(e.target.value)}
              />
              <p className="text-xs text-slate-400">Use @channelname for public channels or the numeric chat ID for private channels</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTelegramDialog(false)}>Cancel</Button>
            <Button onClick={handleTelegramSave} disabled={telegramSaving}>
              {telegramSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Connecting...
                </>
              ) : (
                'Connect Telegram'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* WhatsApp Config Dialog */}
      <Dialog open={whatsappDialog} onOpenChange={setWhatsappDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connect WhatsApp</DialogTitle>
            <DialogDescription>
              Configure WhatsApp Cloud API credentials. These are obtained from Meta Business Manager. WhatsApp sends messages to individual opted-in contacts, not to public Channels.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="whatsapp-token">Access Token</Label>
              <Input
                id="whatsapp-token"
                type="password"
                placeholder="EAAG..."
                value={whatsappAccessToken}
                onChange={(e) => setWhatsappAccessToken(e.target.value)}
              />
              <p className="text-xs text-slate-400">System User access token from Meta Business Manager</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="whatsapp-phone">Phone Number ID</Label>
              <Input
                id="whatsapp-phone"
                placeholder="123456789012345"
                value={whatsappPhoneNumberId}
                onChange={(e) => setWhatsappPhoneNumberId(e.target.value)}
              />
              <p className="text-xs text-slate-400">Found in WhatsApp Manager under Phone Numbers</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="whatsapp-waba">WhatsApp Business Account ID (optional)</Label>
              <Input
                id="whatsapp-waba"
                placeholder="123456789012"
                value={whatsappWabaId}
                onChange={(e) => setWhatsappWabaId(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWhatsappDialog(false)}>Cancel</Button>
            <Button onClick={handleWhatsAppSave} disabled={whatsappSaving}>
              {whatsappSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Connecting...
                </>
              ) : (
                'Connect WhatsApp'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
