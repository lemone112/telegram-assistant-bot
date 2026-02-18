import { createClient } from "@supabase/supabase-js";

type Env = {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SUPABASE_SCHEMA?: string;
};

export function supa(env: Env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

export async function getSetting<T>(env: Env, key: string): Promise<T | null> {
  const client = supa(env);
  const schema = env.SUPABASE_SCHEMA ?? "bot";

  // PostgREST may not expose custom schemas immediately; for reliability we will use RPC/SQL later if needed.
  const { data, error } = await client.schema(schema).from("settings").select("value").eq("key", key).maybeSingle();
  if (error) throw new Error(`Supabase getSetting(${key}) failed: ${error.message}`);
  return (data?.value as T) ?? null;
}

export async function upsertSetting(env: Env, key: string, value: any) {
  const client = supa(env);
  const schema = env.SUPABASE_SCHEMA ?? "bot";
  const { error } = await client.schema(schema).from("settings").upsert({ key, value } as any);
  if (error) throw new Error(`Supabase upsertSetting(${key}) failed: ${error.message}`);
}
