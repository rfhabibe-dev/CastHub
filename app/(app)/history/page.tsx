'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/components/auth/auth-provider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PlatformBadge } from '@/components/platforms/platform-badge';
import { StatusBadge } from '@/components/publications/status-badge';
import { PLATFORM_LIST } from '@/lib/platforms/config';
import type { Publication, PublicationLog, Platform, PublicationStatus } from '@/lib/types/database';
import {
  Search, Filter, ChevronDown, ChevronRight, Video, RotateCw,
  ExternalLink, AlertCircle, History as HistoryIcon, Loader2,
} from 'lucide-react';
import { toast } from 'sonner';

export default function HistoryPage() {
  const { user } = useAuth();
  const [publications, setPublications] = useState<Publication[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterPlatform, setFilterPlatform] = useState<Platform | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<PublicationStatus | 'all'>('all');
  const [expandedPub, setExpandedPub] = useState<string | null>(null);
  const [logs, setLogs] = useState<Record<string, PublicationLog[]>>({});
  const [retrying, setRetrying] = useState<string | null>(null);

  const loadPublications = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('publications')
      .select('*, video:videos(*)')
      .order('created_at', { ascending: false })
      .limit(50);
    setPublications((data || []) as Publication[]);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    loadPublications();
  }, [loadPublications]);

  const loadLogs = async (publicationId: string) => {
    const { data } = await supabase
      .from('publication_logs')
      .select('*')
      .eq('publication_id', publicationId)
      .order('created_at', { ascending: false });
    setLogs((prev) => ({ ...prev, [publicationId]: (data || []) as PublicationLog[] }));
  };

  const toggleExpand = (pubId: string) => {
    if (expandedPub === pubId) {
      setExpandedPub(null);
    } else {
      setExpandedPub(pubId);
      if (!logs[pubId]) loadLogs(pubId);
    }
  };

  const handleRetry = async (pub: Publication) => {
    setRetrying(pub.id);
    const { error } = await supabase
      .from('publications')
      .update({ status: 'pending', error_message: null })
      .eq('id', pub.id);

    if (error) {
      toast.error('Failed to retry: ' + error.message);
      setRetrying(null);
      return;
    }

    await supabase.from('publication_logs').insert({
      publication_id: pub.id,
      event: 'retry',
      message: `Manual retry triggered by user`,
    });

    toast.success('Retry queued');
    setRetrying(null);
    loadPublications();
  };

  const filtered = publications.filter((pub) => {
    const matchesSearch =
      !search ||
      pub.video?.title?.toLowerCase().includes(search.toLowerCase()) ||
      pub.platform.toLowerCase().includes(search.toLowerCase());
    const matchesPlatform = filterPlatform === 'all' || pub.platform === filterPlatform;
    const matchesStatus = filterStatus === 'all' || pub.status === filterStatus;
    return matchesSearch && matchesPlatform && matchesStatus;
  });

  if (loading) {
    return (
      <div className="p-6 lg:p-8 max-w-5xl mx-auto">
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-48 bg-slate-200 rounded" />
          <div className="h-12 bg-slate-200 rounded" />
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-20 bg-slate-200 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-slate-900">Publication History</h1>
        <p className="text-slate-500 mt-1">Complete audit trail of all your publications across platforms</p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search by title or platform..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <select
          value={filterPlatform}
          onChange={(e) => setFilterPlatform(e.target.value as Platform | 'all')}
          className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700"
        >
          <option value="all">All platforms</option>
          {PLATFORM_LIST.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as PublicationStatus | 'all')}
          className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700"
        >
          <option value="all">All statuses</option>
          <option value="success">Success</option>
          <option value="failed">Failed</option>
          <option value="pending">Pending</option>
          <option value="scheduled">Scheduled</option>
          <option value="publishing">Publishing</option>
          <option value="retrying">Retrying</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="py-16">
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
                <HistoryIcon className="h-6 w-6 text-slate-400" />
              </div>
              <p className="text-sm font-medium text-slate-700">No publications found</p>
              <p className="text-xs text-slate-500">
                {publications.length === 0
                  ? 'Upload your first video to start publishing'
                  : 'Try adjusting your filters'}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((pub) => (
            <Card key={pub.id} className="border-slate-200 shadow-sm overflow-hidden">
              <div
                className="flex items-center gap-4 p-4 cursor-pointer hover:bg-slate-50 transition-colors"
                onClick={() => toggleExpand(pub.id)}
              >
                <button className="p-1 rounded hover:bg-slate-100">
                  {expandedPub === pub.id ? (
                    <ChevronDown className="h-4 w-4 text-slate-400" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-slate-400" />
                  )}
                </button>

                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 flex-shrink-0">
                  <PlatformBadge platform={pub.platform} showName={false} size="sm" />
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">
                    {pub.video?.title || 'Untitled'}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <PlatformBadge platform={pub.platform} showName size="sm" />
                    <span className="text-xs text-slate-400">
                      {new Date(pub.created_at).toLocaleString('en-US', {
                        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                      })}
                    </span>
                    {pub.retry_count > 0 && (
                      <span className="text-xs text-amber-600">
                        Retried {pub.retry_count}x
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <StatusBadge status={pub.status} size="md" />
                  {pub.status === 'failed' && pub.retry_count < pub.max_retries && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRetry(pub);
                      }}
                      disabled={retrying === pub.id}
                    >
                      {retrying === pub.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <>
                          <RotateCw className="h-3.5 w-3.5 mr-1" />
                          Retry
                        </>
                      )}
                    </Button>
                  )}
                  {pub.platform_post_url && (
                    <a
                      href={pub.platform_post_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="p-2 rounded-lg hover:bg-slate-100"
                    >
                      <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
                    </a>
                  )}
                </div>
              </div>

              {/* Expanded detail */}
              {expandedPub === pub.id && (
                <div className="border-t border-slate-100 bg-slate-50 p-4 space-y-3">
                  {pub.error_message && (
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200">
                      <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
                      <div className="text-sm">
                        <p className="font-medium text-red-700">Error</p>
                        <p className="text-red-600 text-xs mt-1">{pub.error_message}</p>
                      </div>
                    </div>
                  )}

                  {pub.scheduled_at && (
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <span className="font-medium">Scheduled for:</span>
                      {new Date(pub.scheduled_at).toLocaleString()}
                    </div>
                  )}

                  {pub.published_at && (
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <span className="font-medium">Published at:</span>
                      {new Date(pub.published_at).toLocaleString()}
                    </div>
                  )}

                  {pub.video && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div>
                        <p className="text-slate-400">File size</p>
                        <p className="font-medium text-slate-600">
                          {(pub.video.file_size / (1024 * 1024)).toFixed(1)} MB
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-400">Duration</p>
                        <p className="font-medium text-slate-600">
                          {pub.video.duration > 0 ? `${pub.video.duration}s` : '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-400">MIME type</p>
                        <p className="font-medium text-slate-600">{pub.video.mime_type || '—'}</p>
                      </div>
                      <div>
                        <p className="text-slate-400">Retries</p>
                        <p className="font-medium text-slate-600">{pub.retry_count}/{pub.max_retries}</p>
                      </div>
                    </div>
                  )}

                  {/* Logs */}
                  <div>
                    <p className="text-xs font-medium text-slate-500 mb-2">Audit Log</p>
                    {logs[pub.id] ? (
                      <div className="space-y-2">
                        {logs[pub.id].length === 0 ? (
                          <p className="text-xs text-slate-400">No log entries</p>
                        ) : (
                          logs[pub.id].map((log) => (
                            <div key={log.id} className="flex items-start gap-2 text-xs">
                              <div className={`flex h-1.5 w-1.5 rounded-full mt-1.5 flex-shrink-0 ${
                                log.event === 'success' ? 'bg-green-500' :
                                log.event === 'failed' ? 'bg-red-500' :
                                log.event === 'retry' ? 'bg-amber-500' :
                                'bg-slate-300'
                              }`} />
                              <div className="flex-1">
                                <span className="font-medium text-slate-600">{log.event}</span>
                                {log.message && <span className="text-slate-500"> — {log.message}</span>}
                                <span className="text-slate-400 ml-2">
                                  {new Date(log.created_at).toLocaleString('en-US', {
                                    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                                  })}
                                </span>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    ) : (
                      <Loader2 className="h-4 w-4 text-slate-400 animate-spin" />
                    )}
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
