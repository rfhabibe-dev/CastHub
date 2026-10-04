'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/components/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { VideoUploader } from '@/components/upload/video-uploader';
import { ThumbnailUploader } from '@/components/upload/thumbnail-uploader';
import { PlatformBadge } from '@/components/platforms/platform-badge';
import { PLATFORM_LIST, getPlatformConfig } from '@/lib/platforms/config';
import type { Platform, SocialConnection, PrivacyStatus } from '@/lib/types/database';
import { Loader2, AlertCircle, Calendar, Send, Lock } from 'lucide-react';
import { toast } from 'sonner';

interface UploadData {
  videoId: string;
  videoUrl: string;
  filePath: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}

export default function UploadPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [uploadData, setUploadData] = useState<UploadData | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [hashtags, setHashtags] = useState('');
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>([]);
  const [connections, setConnections] = useState<SocialConnection[]>([]);
  const [schedule, setSchedule] = useState(false);
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingConnections, setLoadingConnections] = useState(true);

  // Per-platform metadata
  const [youtubePrivacy, setYoutubePrivacy] = useState<PrivacyStatus>('private');
  const [pinterestBoardId, setPinterestBoardId] = useState('');
  const [whatsappRecipient, setWhatsappRecipient] = useState('');
  const [pinterestBoards, setPinterestBoards] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    async function loadConnections() {
      if (!user) return;
      const { data } = await supabase
        .from('social_connections')
        .select('id, platform, platform_username, platform_user_id, status, adapter_metadata, token_expires_at')
        .eq('status', 'connected');
      setConnections((data || []) as SocialConnection[]);
      setLoadingConnections(false);
    }
    loadConnections();
  }, [user]);

  const connectedPlatforms = new Set(connections.map((c) => c.platform));

  const togglePlatform = (platform: Platform) => {
    setSelectedPlatforms((prev) =>
      prev.includes(platform)
        ? prev.filter((p) => p !== platform)
        : [...prev, platform]
    );
  };

  const handleUploaded = (data: UploadData) => {
    setUploadData(data);
    setTitle(data.fileName.replace(/\.[^/.]+$/, ''));
  };

  // Fetch Pinterest boards when Pinterest is selected
  useEffect(() => {
    if (selectedPlatforms.includes('pinterest')) {
      const pinterestConn = connections.find((c) => c.platform === 'pinterest');
      if (pinterestConn) {
        fetchPinterestBoards(pinterestConn);
      }
    }
  }, [selectedPlatforms, connections]);

  const fetchPinterestBoards = async (conn: SocialConnection) => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/pinterest-boards`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ connection_id: conn.id, user_id: user?.id }),
      });
      if (response.ok) {
        const data = await response.json();
        setPinterestBoards(data.boards || []);
      }
    } catch {
      // Board fetch is best-effort
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!uploadData) {
      setError('Please upload a video first');
      return;
    }
    if (!title.trim()) {
      setError('Please enter a title');
      return;
    }
    if (selectedPlatforms.length === 0) {
      setError('Select at least one platform to publish to');
      return;
    }
    if (schedule && (!scheduledDate || !scheduledTime)) {
      setError('Please select a date and time for scheduling');
      return;
    }
    if (selectedPlatforms.includes('pinterest') && !pinterestBoardId) {
      setError('Please select a Pinterest board');
      return;
    }
    if (selectedPlatforms.includes('whatsapp') && !whatsappRecipient.trim()) {
      setError('Please enter a WhatsApp recipient phone number');
      return;
    }

    setSubmitting(true);

    try {
      const hashtagArray = hashtags
        .split(/[,\s]+/)
        .map((h) => h.trim().replace(/^#/, ''))
        .filter((h) => h.length > 0);

      const { error: videoUpdateError } = await supabase
        .from('videos')
        .update({
          title: title.trim(),
          description: description.trim(),
          hashtags: hashtagArray,
          thumbnail_url: thumbnailUrl || null,
        })
        .eq('id', uploadData.videoId);

      if (videoUpdateError) throw videoUpdateError;

      const scheduledAt = schedule
        ? new Date(`${scheduledDate}T${scheduledTime}`).toISOString()
        : null;

      const publicationStatus = schedule ? 'scheduled' : 'pending';

      // Build per-platform adapter metadata
      const publications = selectedPlatforms.map((platform) => {
        const conn = connections.find((c) => c.platform === platform);
        let adapterMetadata: Record<string, unknown> = {};

        if (platform === 'youtube') {
          adapterMetadata = { privacy: youtubePrivacy };
        }
        if (platform === 'pinterest') {
          adapterMetadata = { board_id: pinterestBoardId };
        }
        if (platform === 'whatsapp') {
          adapterMetadata = { recipient_phone: whatsappRecipient.trim() };
        }

        return {
          video_id: uploadData.videoId,
          platform,
          social_connection_id: conn?.id || null,
          status: publicationStatus,
          scheduled_at: scheduledAt,
          adapter_metadata: adapterMetadata,
        };
      });

      const { data: createdPubs, error: pubsError } = await supabase
        .from('publications')
        .insert(publications)
        .select('id, platform');

      if (pubsError) throw pubsError;

      if (createdPubs) {
        const logs = createdPubs.map((pub) => ({
          publication_id: pub.id,
          event: schedule ? 'scheduled' : 'created',
          message: schedule
            ? `Publication scheduled for ${new Date(scheduledAt!).toLocaleString()}`
            : `Publication created for ${pub.platform}`,
        }));

        await supabase.from('publication_logs').insert(logs);
      }

      if (!schedule) {
        try {
          await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/publish-orchestrator`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({
              video_id: uploadData.videoId,
              user_id: user?.id,
            }),
          });
        } catch {
          // Orchestrator runs async; publications will be picked up on retry
        }
      }

      toast.success(
        schedule
          ? `Post scheduled for ${selectedPlatforms.length} platform${selectedPlatforms.length > 1 ? 's' : ''}`
          : `Publishing to ${selectedPlatforms.length} platform${selectedPlatforms.length > 1 ? 's' : ''}...`
      );

      router.push('/dashboard');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong';
      setError(message);
      setSubmitting(false);
    }
  };

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-slate-900">Create New Post</h1>
        <p className="text-slate-500 mt-1">Upload a video once and publish it to all your connected platforms</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Step 1: Upload */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-white text-sm font-bold">
                1
              </div>
              <div>
                <CardTitle className="text-lg">Upload your video</CardTitle>
                <CardDescription>Drag and drop or click to browse</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <VideoUploader onUploaded={handleUploaded} />
          </CardContent>
        </Card>

        {/* Step 2: Details */}
        <Card className={`border-slate-200 shadow-sm ${!uploadData ? 'opacity-50' : ''}`}>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-white text-sm font-bold">
                2
              </div>
              <div>
                <CardTitle className="text-lg">Video details</CardTitle>
                <CardDescription>Add a title, description, and hashtags</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title <span className="text-red-500">*</span></Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="My awesome video"
                maxLength={100}
                disabled={!uploadData}
              />
              <p className="text-xs text-slate-400">{title.length}/100</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe your video..."
                rows={4}
                maxLength={5000}
                disabled={!uploadData}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hashtags">Hashtags</Label>
              <Input
                id="hashtags"
                value={hashtags}
                onChange={(e) => setHashtags(e.target.value)}
                placeholder="travel, vlog, adventure"
                disabled={!uploadData}
              />
              <p className="text-xs text-slate-400">Separate with commas or spaces</p>
            </div>
            <div className="space-y-2">
              <Label>Thumbnail (optional)</Label>
              <ThumbnailUploader onUploaded={setThumbnailUrl} />
            </div>
          </CardContent>
        </Card>

        {/* Step 3: Platform Selection */}
        <Card className={`border-slate-200 shadow-sm ${!uploadData ? 'opacity-50' : ''}`}>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-white text-sm font-bold">
                3
              </div>
              <div>
                <CardTitle className="text-lg">Select platforms</CardTitle>
                <CardDescription>Choose where to publish your video</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loadingConnections ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 text-slate-400 animate-spin" />
              </div>
            ) : connectedPlatforms.size === 0 ? (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <AlertCircle className="h-8 w-8 text-amber-500" />
                <div>
                  <p className="text-sm font-medium text-slate-700">No connected accounts</p>
                  <p className="text-xs text-slate-500 mt-1">Connect at least one social account to publish</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => router.push('/connections')}>
                  Go to Connections
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {PLATFORM_LIST.map((platform) => {
                    const isConnected = connectedPlatforms.has(platform.id);
                    const isSelected = selectedPlatforms.includes(platform.id);
                    return (
                      <label
                        key={platform.id}
                        className={`flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                          isSelected
                            ? 'border-slate-900 bg-slate-50'
                            : 'border-slate-200 hover:border-slate-300'
                        } ${!isConnected ? 'opacity-40 cursor-not-allowed' : ''}`}
                      >
                        <Checkbox
                          checked={isSelected}
                          disabled={!isConnected}
                          onCheckedChange={() => togglePlatform(platform.id)}
                        />
                        <PlatformBadge platform={platform.id} size="md" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-700">{platform.name}</p>
                          <p className="text-xs text-slate-400 truncate">{platform.description}</p>
                        </div>
                        {!isConnected && (
                          <span className="text-xs text-slate-400">Not connected</span>
                        )}
                      </label>
                    );
                  })}
                </div>

                {/* YouTube privacy settings */}
                {selectedPlatforms.includes('youtube') && (
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                    <div className="flex items-center gap-2">
                      <Lock className="h-4 w-4 text-slate-500" />
                      <Label className="text-sm font-medium">YouTube Privacy</Label>
                    </div>
                    <Select value={youtubePrivacy} onValueChange={(v) => setYoutubePrivacy(v as PrivacyStatus)}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="private">Private (recommended for first tests)</SelectItem>
                        <SelectItem value="unlisted">Unlisted</SelectItem>
                        <SelectItem value="public">Public</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Pinterest board selection */}
                {selectedPlatforms.includes('pinterest') && (
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                    <Label className="text-sm font-medium">Pinterest Board</Label>
                    {pinterestBoards.length > 0 ? (
                      <Select value={pinterestBoardId} onValueChange={setPinterestBoardId}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select a board" />
                        </SelectTrigger>
                        <SelectContent>
                          {pinterestBoards.map((board) => (
                            <SelectItem key={board.id} value={board.id}>{board.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <p className="text-xs text-slate-400">Loading boards... If none appear, ensure your Pinterest account has boards.</p>
                    )}
                  </div>
                )}

                {/* WhatsApp recipient */}
                {selectedPlatforms.includes('whatsapp') && (
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                    <Label className="text-sm font-medium">WhatsApp Recipient Phone Number</Label>
                    <Input
                      placeholder="1234567890 (country code + number, no spaces)"
                      value={whatsappRecipient}
                      onChange={(e) => setWhatsappRecipient(e.target.value)}
                    />
                    <p className="text-xs text-amber-600">
                      The recipient must have opted in to receive WhatsApp messages from your business number.
                    </p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Step 4: Schedule */}
        <Card className={`border-slate-200 shadow-sm ${!uploadData ? 'opacity-50' : ''}`}>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-white text-sm font-bold">
                4
              </div>
              <div>
                <CardTitle className="text-lg">Schedule</CardTitle>
                <CardDescription>Publish now or schedule for later</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-slate-500" />
                <Label htmlFor="schedule" className="text-sm font-medium cursor-pointer">
                  Schedule for later
                </Label>
              </div>
              <Switch
                id="schedule"
                checked={schedule}
                onCheckedChange={setSchedule}
                disabled={!uploadData}
              />
            </div>
            {schedule && (
              <div className="grid grid-cols-2 gap-4 pt-2">
                <div className="space-y-2">
                  <Label htmlFor="date">Date</Label>
                  <Input
                    id="date"
                    type="date"
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="time">Time</Label>
                  <Input
                    id="time"
                    type="time"
                    value={scheduledTime}
                    onChange={(e) => setScheduledTime(e.target.value)}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-600 border border-red-200">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Submit */}
        <div className="flex justify-end gap-3 pb-8">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting || !uploadData}>
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {schedule ? 'Scheduling...' : 'Publishing...'}
              </>
            ) : schedule ? (
              <>
                <Calendar className="h-4 w-4 mr-2" />
                Schedule Post
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Publish Now
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
