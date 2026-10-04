'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/auth-provider';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { User, LogOut, Shield, AlertCircle, Lock, Key } from 'lucide-react';
import { toast } from 'sonner';

export default function SettingsPage() {
  const router = useRouter();
  const { user, signOut } = useAuth();

  const handleSignOut = async () => {
    await signOut();
    router.replace('/login');
  };

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-slate-900">Settings</h1>
        <p className="text-slate-500 mt-1">Manage your account and security settings</p>
      </div>

      {/* Account */}
      <Card className="border-slate-200 shadow-sm mb-6">
        <CardHeader>
          <div className="flex items-center gap-2">
            <User className="h-5 w-5 text-slate-500" />
            <CardTitle className="text-lg">Account</CardTitle>
          </div>
          <CardDescription>Your account information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Email</Label>
            <Input value={user?.email || ''} disabled className="bg-slate-50" />
          </div>
          <Button variant="outline" onClick={handleSignOut} className="text-red-600 hover:text-red-700">
            <LogOut className="h-4 w-4 mr-2" />
            Sign out
          </Button>
        </CardContent>
      </Card>

      {/* Platform Credentials Info */}
      <Card className="border-slate-200 shadow-sm mb-6">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Key className="h-5 w-5 text-slate-500" />
            <CardTitle className="text-lg">Platform API Credentials</CardTitle>
          </div>
          <CardDescription>
            OAuth credentials are configured as edge function secrets, not in the frontend.
            See ENVIRONMENT_VARIABLES.md for the complete list of required secrets.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200">
            <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-amber-800">
              <p className="font-medium mb-1">Server-Side Configuration Required</p>
              <p className="text-xs">
                Platform OAuth client IDs and secrets (Google, Meta, TikTok, Pinterest) must be set as
                edge function secrets in your Supabase project. They are never exposed in the frontend
                or stored in the database. Telegram bot tokens and WhatsApp access tokens are entered
                in the Connections page and encrypted before storage.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Security */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-slate-500" />
            <CardTitle className="text-lg">Security & Privacy</CardTitle>
          </div>
          <CardDescription>Your data protection settings</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between p-3 rounded-lg border border-slate-100">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-green-600" />
              <div>
                <p className="text-sm font-medium text-slate-700">Token encryption</p>
                <p className="text-xs text-slate-500">OAuth tokens encrypted with AES-GCM server-side</p>
              </div>
            </div>
            <span className="text-xs font-medium text-green-600">Enabled</span>
          </div>
          <div className="flex items-center justify-between p-3 rounded-lg border border-slate-100">
            <div>
              <p className="text-sm font-medium text-slate-700">Auto token refresh</p>
              <p className="text-xs text-slate-500">Expired tokens are refreshed automatically before publishing</p>
            </div>
            <span className="text-xs font-medium text-green-600">Enabled</span>
          </div>
          <div className="flex items-center justify-between p-3 rounded-lg border border-slate-100">
            <div>
              <p className="text-sm font-medium text-slate-700">Audit logging</p>
              <p className="text-xs text-slate-500">All publication actions are logged with timestamps</p>
            </div>
            <span className="text-xs font-medium text-green-600">Enabled</span>
          </div>
          <div className="flex items-center justify-between p-3 rounded-lg border border-slate-100">
            <div>
              <p className="text-sm font-medium text-slate-700">Row Level Security</p>
              <p className="text-xs text-slate-500">Users can only access their own data</p>
            </div>
            <span className="text-xs font-medium text-green-600">Enabled</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
