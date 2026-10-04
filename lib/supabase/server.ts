import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export async function createSupabaseServerClient() {
  const cookieStore = cookies();
  const allCookies = cookieStore.getAll();

  const token = allCookies.find((c) => c.name.startsWith('sb-') && c.name.endsWith('-auth-token'))?.value;

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      global: {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      },
    }
  );
}
