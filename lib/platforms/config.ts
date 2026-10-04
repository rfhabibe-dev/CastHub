import type { Platform, PrivacyStatus } from '@/lib/types/database';

export interface PlatformConfig {
  id: Platform;
  name: string;
  color: string;
  bgColor: string;
  borderColor: string;
  textColor: string;
  icon: string;
  maxDuration: number;
  maxFileSize: number;
  aspectRatios: string[];
  description: string;
  oauthUrl: string;
  scopes: string[];
  authType: 'oauth2' | 'bot_token' | 'api_key';
  requiresPageSelection?: boolean;
  requiresBoardSelection?: boolean;
  defaultPrivacy?: PrivacyStatus;
}

export const PLATFORMS: Record<Platform, PlatformConfig> = {
  youtube: {
    id: 'youtube',
    name: 'YouTube',
    color: '#FF0000',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    textColor: 'text-red-600',
    icon: 'youtube',
    maxDuration: 43200,
    maxFileSize: 128 * 1024 * 1024 * 1024,
    aspectRatios: ['16:9', '9:16', '1:1', '4:3'],
    description: 'Publish to YouTube via Data API v3. Supports long-form and Shorts.',
    oauthUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    scopes: [
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube',
    ],
    authType: 'oauth2',
    defaultPrivacy: 'private',
  },
  facebook: {
    id: 'facebook',
    name: 'Facebook',
    color: '#1877F2',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    textColor: 'text-blue-600',
    icon: 'facebook',
    maxDuration: 14400,
    maxFileSize: 10 * 1024 * 1024 * 1024,
    aspectRatios: ['16:9', '9:16', '1:1', '4:5'],
    description: 'Publish to Facebook Pages via Graph API. Requires a Business account.',
    oauthUrl: 'https://www.facebook.com/v19.0/dialog/oauth',
    scopes: ['pages_manage_posts', 'pages_read_engagement', 'pages_show_list', 'video_upload'],
    authType: 'oauth2',
    requiresPageSelection: true,
  },
  instagram: {
    id: 'instagram',
    name: 'Instagram',
    color: '#E4405F',
    bgColor: 'bg-pink-50',
    borderColor: 'border-pink-200',
    textColor: 'text-pink-600',
    icon: 'instagram',
    maxDuration: 900,
    maxFileSize: 650 * 1024 * 1024,
    aspectRatios: ['9:16', '1:1', '4:5', '16:9'],
    description: 'Publish to Instagram via Graph API Content Publishing. Requires a Creator/Business account.',
    oauthUrl: 'https://www.facebook.com/v19.0/dialog/oauth',
    scopes: ['instagram_content_publish', 'instagram_basic', 'instagram_manage_posts', 'pages_show_list', 'pages_read_engagement'],
    authType: 'oauth2',
  },
  tiktok: {
    id: 'tiktok',
    name: 'TikTok',
    color: '#000000',
    bgColor: 'bg-gray-50',
    borderColor: 'border-gray-200',
    textColor: 'text-gray-900',
    icon: 'tiktok',
    maxDuration: 600,
    maxFileSize: 4 * 1024 * 1024 * 1024,
    aspectRatios: ['9:16', '1:1'],
    description: 'Publish via TikTok Content Posting API. Requires developer approval.',
    oauthUrl: 'https://www.tiktok.com/auth/authorize/',
    scopes: ['video.publish', 'user.info.basic'],
    authType: 'oauth2',
  },
  pinterest: {
    id: 'pinterest',
    name: 'Pinterest',
    color: '#BD081C',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    textColor: 'text-red-700',
    icon: 'pinterest',
    maxDuration: 1800,
    maxFileSize: 2 * 1024 * 1024 * 1024,
    aspectRatios: ['9:16', '1:1', '2:3', '4:5'],
    description: 'Publish video pins via Pinterest API v5. Requires a Business account.',
    oauthUrl: 'https://www.pinterest.com/oauth/',
    scopes: ['boards:read', 'pins:write', 'user_accounts:read'],
    authType: 'oauth2',
    requiresBoardSelection: true,
  },
  whatsapp: {
    id: 'whatsapp',
    name: 'WhatsApp',
    color: '#25D366',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200',
    textColor: 'text-green-700',
    icon: 'whatsapp',
    maxDuration: 900,
    maxFileSize: 100 * 1024 * 1024,
    aspectRatios: ['9:16', '1:1', '16:9'],
    description: 'Send video messages via WhatsApp Cloud API to opted-in contacts. Not for WhatsApp Channels.',
    oauthUrl: 'https://www.facebook.com/v19.0/dialog/oauth',
    scopes: ['whatsapp_business_messaging', 'whatsapp_business_management'],
    authType: 'oauth2',
  },
  telegram: {
    id: 'telegram',
    name: 'Telegram',
    color: '#0088CC',
    bgColor: 'bg-sky-50',
    borderColor: 'border-sky-200',
    textColor: 'text-sky-700',
    icon: 'telegram',
    maxDuration: 1800,
    maxFileSize: 50 * 1024 * 1024,
    aspectRatios: ['9:16', '1:1', '16:9'],
    description: 'Publish to Telegram channels via the Bot API. Send video messages to your subscribers.',
    oauthUrl: '',
    scopes: [],
    authType: 'bot_token',
  },
};

export const PLATFORM_LIST = Object.values(PLATFORMS);

export function getPlatformConfig(platform: Platform): PlatformConfig {
  return PLATFORMS[platform];
}
