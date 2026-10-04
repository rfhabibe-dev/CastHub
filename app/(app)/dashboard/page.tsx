'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/components/auth/auth-provider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PlatformBadge } from '@/components/platforms/platform-badge';
import { StatusBadge } from '@/components/publications/status-badge';
import { PLATFORM_LIST } from '@/lib/platforms/config';
import type { Publication, SocialConnection, Platform } from '@/lib/types/database';
import { Upload, TrendingUp, Video, CheckCircle2, Clock, ArrowRight, Link2 } from 'lucide-react';

interface DashboardStats {
  totalPublications: number;
  successful: number;
  failed: number;
  scheduled: number;
  totalVideos: number;
  connectedPlatforms: number;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    totalPublications: 0,
    successful: 0,
    failed: 0,
    scheduled: 0,
    totalVideos: 0,
    connectedPlatforms: 0,
  });
  const [recentPubs, setRecentPubs] = useState<Publication[]>([]);
  const [connections, setConnections] = useState<SocialConnection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      if (!user) return;

      const [pubsRes, videosRes, connRes] = await Promise.all([
        supabase
          .from('publications')
          .select('*, video:videos(*)')
          .order('created_at', { ascending: false })
          .limit(10),
        supabase.from('videos').select('id', { count: 'exact', head: true }),
        supabase.from('social_connections').select('id, platform, platform_username, status, created_at'),
      ]);

      const pubs = pubsRes.data || [];
      const conns = connRes.data || [];

      setRecentPubs(pubs as Publication[]);
      setConnections(conns as SocialConnection[]);
      setStats({
        totalPublications: pubs.length,
        successful: pubs.filter((p) => p.status === 'success').length,
        failed: pubs.filter((p) => p.status === 'failed').length,
        scheduled: pubs.filter((p) => p.status === 'scheduled' || p.status === 'pending').length,
        totalVideos: videosRes.count || 0,
        connectedPlatforms: conns.filter((c) => c.status === 'connected').length,
      });
      setLoading(false);
    }
    loadData();
  }, [user]);

  const connectedPlatforms = new Set(
    connections.filter((c) => c.status === 'connected').map((c) => c.platform)
  );

  if (loading) {
    return (
      <div className="p-6 lg:p-8">
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-48 bg-slate-200 rounded" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-28 bg-slate-200 rounded-xl" />
            ))}
          </div>
          <div className="h-64 bg-slate-200 rounded-xl" />
        </div>
      </div>
    );
  }

  const statCards = [
    { label: 'Total Posts', value: stats.totalPublications, icon: TrendingUp, color: 'text-slate-900', bg: 'bg-slate-100' },
    { label: 'Published', value: stats.successful, icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50' },
    { label: 'Scheduled', value: stats.scheduled, icon: Clock, color: 'text-violet-600', bg: 'bg-violet-50' },
    { label: 'Failed', value: stats.failed, icon: Video, color: 'text-red-600', bg: 'bg-red-50' },
  ];

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-slate-900">Dashboard</h1>
          <p className="text-slate-500 mt-1">Track your multi-platform publishing at a glance</p>
        </div>
        <Link href="/upload">
          <Button>
            <Upload className="h-4 w-4 mr-2" />
            New Post
          </Button>
        </Link>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label} className="border-slate-200 shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${stat.bg}`}>
                    <Icon className={`h-5 w-5 ${stat.color}`} />
                  </div>
                </div>
                <p className="text-2xl font-bold text-slate-900">{stat.value}</p>
                <p className="text-sm text-slate-500 mt-0.5">{stat.label}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Platform Connections Overview */}
      <Card className="border-slate-200 shadow-sm mb-8">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg font-semibold">Connected Platforms</CardTitle>
          <Link href="/connections">
            <Button variant="ghost" size="sm">
              Manage
              <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {PLATFORM_LIST.map((platform) => {
              const isConnected = connectedPlatforms.has(platform.id as Platform);
              return (
                <div
                  key={platform.id}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-colors ${
                    isConnected
                      ? 'border-slate-200 bg-white'
                      : 'border-dashed border-slate-200 bg-slate-50'
                  }`}
                >
                  <PlatformBadge platform={platform.id} showName={false} size="lg" />
                  <span className="text-sm font-medium text-slate-700">{platform.name}</span>
                  <span className={`text-xs ${isConnected ? 'text-green-600' : 'text-slate-400'}`}>
                    {isConnected ? 'Connected' : 'Not connected'}
                  </span>
                </div>
              );
            })}
          </div>
          {stats.connectedPlatforms === 0 && (
            <div className="mt-4 flex flex-col items-center gap-3 p-6 rounded-xl bg-slate-50 border border-dashed border-slate-200">
              <Link2 className="h-6 w-6 text-slate-400" />
              <p className="text-sm text-slate-500 text-center">
                You haven't connected any social accounts yet.
              </p>
              <Link href="/connections">
                <Button variant="outline" size="sm">Connect your first account</Button>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Publications */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg font-semibold">Recent Publications</CardTitle>
          <Link href="/history">
            <Button variant="ghost" size="sm">
              View all
              <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {recentPubs.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
                <Video className="h-6 w-6 text-slate-400" />
              </div>
              <p className="text-sm text-slate-500">No publications yet. Upload your first video to get started.</p>
              <Link href="/upload">
                <Button size="sm">Create your first post</Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {recentPubs.map((pub) => (
                <div
                  key={pub.id}
                  className="flex items-center gap-4 p-3 rounded-lg border border-slate-100 hover:border-slate-200 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 flex-shrink-0">
                    <PlatformBadge platform={pub.platform} showName={false} size="sm" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">
                      {pub.video?.title || 'Untitled video'}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <PlatformBadge platform={pub.platform} showName size="sm" />
                      <span className="text-xs text-slate-400">
                        {new Date(pub.created_at).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  </div>
                  <StatusBadge status={pub.status} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
