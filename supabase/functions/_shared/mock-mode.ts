/**
 * Mock mode for testing adapters without real credentials.
 * Set MOCK_MODE=true in edge function secrets to enable.
 * When enabled, adapters return simulated success responses.
 */

export function isMockMode(): boolean {
  return Deno.env.get("MOCK_MODE") === "true";
}

export function mockPublishResult(platform: string, videoTitle: string): {
  post_id: string;
  post_url: string;
  status: "success" | "processing";
  metadata: Record<string, unknown>;
} {
  const fakeId = `mock_${platform}_${Date.now()}`;
  const urls: Record<string, string> = {
    youtube: `https://www.youtube.com/watch?v=${fakeId}`,
    facebook: `https://www.facebook.com/mock/videos/${fakeId}`,
    instagram: `https://www.instagram.com/p/${fakeId}`,
    tiktok: `https://www.tiktok.com/@mock/video/${fakeId}`,
    pinterest: `https://www.pinterest.com/pin/${fakeId}/`,
    telegram: `https://t.me/mock_channel/${fakeId}`,
    whatsapp: `https://wa.me/mock/${fakeId}`,
  };

  return {
    post_id: fakeId,
    post_url: urls[platform] || `https://mock.example.com/${fakeId}`,
    status: "success",
    metadata: { mock: true, platform, video_title: videoTitle },
  };
}

export function mockRefreshResult(): {
  access_token: string;
  refresh_token?: string;
  expires_at?: string;
} {
  return {
    access_token: `mock_access_token_${Date.now()}`,
    refresh_token: `mock_refresh_token_${Date.now()}`,
    expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
  };
}

export function mockValidateResult(): { valid: boolean; message?: string } {
  return { valid: true, message: "Mock mode: connection is valid" };
}
