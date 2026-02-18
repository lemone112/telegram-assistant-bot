import { createClient } from "@supabase/supabase-js";

type Env = {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;

  // vars
  SUPABASE_SCHEMA?: string;
};

function requireEnv(env: Env, key: keyof Env): string {
  const v = env[key];
  if (!v || typeof v !== "string") throw new Error(`Missing env: ${String(key)}`);
  return v;
}

export function getSchema(env: Env): string {
  return (env.SUPABASE_SCHEMA ?? "bot").trim() || "bot";
}

export function supa(env: Env) {
  const url = requireEnv(env, "SUPABASE_URL");
  const key = requireEnv(env, "SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

/**
 * Returns a schema-bound query builder.
 * This is critical because the project uses a single app schema (default: `bot`).
 */
export function db(env: Env) {
  return supa(env).schema(getSchema(env));
}

export async function getSetting<T>(env: Env, key: string): Promise<T | null> {
  const { data, error } = await db(env)
    .from("settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();

  if (error) throw new Error(`Supabase getSetting(${key}) failed: ${error.message}`);
  return (data?.value as T) ?? null;
}

export async function upsertSetting(env: Env, key: string, value: any) {
  const { error } = await db(env).from("settings").upsert({ key, value } as any);
  if (error) throw new Error(`Supabase upsertSetting(${key}) failed: ${error.message}`);
}
