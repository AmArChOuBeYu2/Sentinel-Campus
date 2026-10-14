import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseInstance: SupabaseClient | null = null;

export function getSupabaseConfig(): { url: string; key: string; isConfigured: boolean } {
  const url = (process.env.SUPABASE_URL || '').trim();
  const key = (
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    ''
  ).trim();

  return {
    url,
    key,
    isConfigured: Boolean(url && key && url.startsWith('http')),
  };
}

export function getSupabaseClient(): SupabaseClient | null {
  const { url, key, isConfigured } = getSupabaseConfig();
  if (!isConfigured) return null;

  if (!supabaseInstance) {
    supabaseInstance = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return supabaseInstance;
}

export async function testSupabaseConnectivity(): Promise<{
  connected: boolean;
  error?: string;
  tablesFound?: boolean;
}> {
  const client = getSupabaseClient();
  if (!client) {
    return {
      connected: false,
      error: 'Supabase credentials missing. Ensure SUPABASE_URL and SUPABASE_SECRET_KEY are configured.',
    };
  }

  try {
    const { error } = await client.from('profiles').select('id').limit(1);
    if (error) {
      if (error.message.includes('Could not find the table') || error.code === '42P01') {
        return {
          connected: true,
          tablesFound: false,
          error: 'Connected to Supabase endpoint, but required schema tables are not yet created. Execute migration first.',
        };
      }
      return { connected: false, error: error.message };
    }
    return { connected: true, tablesFound: true };
  } catch (err: unknown) {
    const e = err as Error;
    return { connected: false, error: e.message || 'Unknown network error' };
  }
}
