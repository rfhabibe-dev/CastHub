/**
 * Token encryption utilities using Web Crypto API (available in Deno).
 * Uses AES-GCM with a server-side encryption key stored as an edge function secret.
 */

const ENC_ALGORITHM = "AES-GCM";
const KEY_USAGE: KeyUsage[] = ["encrypt", "decrypt"];

function getEncryptionKey(): string {
  const key = Deno.env.get("TOKEN_ENCRYPTION_KEY");
  if (!key) {
    throw new Error("TOKEN_ENCRYPTION_KEY secret not configured. Set it in edge function secrets.");
  }
  return key;
}

async function importKey(): Promise<CryptoKey> {
  const rawKey = getEncryptionKey();
  const encoder = new TextEncoder();
  const keyData = encoder.encode(rawKey.padEnd(32, "0").slice(0, 32));
  return crypto.subtle.importKey("raw", keyData, { name: ENC_ALGORITHM }, false, KEY_USAGE);
}

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export async function encryptToken(plaintext: string): Promise<string> {
  const key = await importKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();
  const encrypted = await crypto.subtle.encrypt(
    { name: ENC_ALGORITHM, iv },
    key,
    encoder.encode(plaintext)
  );
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.length);
  return bufferToBase64(combined.buffer);
}

export async function decryptToken(ciphertext: string): Promise<string> {
  const key = await importKey();
  const combined = new Uint8Array(base64ToBuffer(ciphertext));
  const iv = combined.slice(0, 12);
  const encrypted = combined.slice(12);
  const decrypted = await crypto.subtle.decrypt(
    { name: ENC_ALGORITHM, iv },
    key,
    encrypted
  );
  return new TextDecoder().decode(decrypted);
}

export async function encryptConnectionTokens(connection: {
  access_token: string | null;
  refresh_token: string | null;
}): Promise<{ encrypted_access_token: string | null; encrypted_refresh_token: string | null }> {
  const encAccess = connection.access_token
    ? await encryptToken(connection.access_token)
    : null;
  const encRefresh = connection.refresh_token
    ? await encryptToken(connection.refresh_token)
    : null;
  return {
    encrypted_access_token: encAccess,
    encrypted_refresh_token: encRefresh,
  };
}

export async function decryptConnectionTokens(connection: {
  encrypted_access_token: string | null;
  encrypted_refresh_token: string | null;
  access_token: string | null;
  refresh_token: string | null;
  token_encrypted: boolean;
}): Promise<{ access_token: string | null; refresh_token: string | null }> {
  if (connection.token_encrypted && connection.encrypted_access_token) {
    try {
      const access_token = await decryptToken(connection.encrypted_access_token);
      const refresh_token = connection.encrypted_refresh_token
        ? await decryptToken(connection.encrypted_refresh_token)
        : null;
      return { access_token, refresh_token };
    } catch (err) {
      throw new Error(`Failed to decrypt tokens: ${err instanceof Error ? err.message : "unknown"}`);
    }
  }
  return {
    access_token: connection.access_token,
    refresh_token: connection.refresh_token,
  };
}
