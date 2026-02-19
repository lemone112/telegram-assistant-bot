import { createClient } from "@supabase/supabase-js";
import { composioExecute } from "./composio";
import { KICKOFF_TEMPLATE_TASKS } from "./linear_kickoff_template";

type Env = {
  TELEGRAM_BOT_TOKEN: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  COMPOSIO_API_KEY: string;

  // vars
  SUPABASE_SCHEMA?: string;
  PAUSE_REMINDER_DAYS?: string;
  BOT_ALLOWED_TELEGRAM_USER_IDS?: string;
  LINEAR_TEAM_ID?: string;
};

type TelegramUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    date: number;
    text?: string;
    chat: { id: number; type: string; title?: string; username?: string };
    from?: {
      id: number;
      username?: string;
      first_name?: string;
      last_name?: string;
      language_code?: string;
    };
    entities?: Array<{ offset: number; length: number; type: string }>;
  };
  callback_query?: {
    id: string;
    from?: {
      id: number;
      username?: string;
      first_name?: string;
      last_name?: string;
      language_code?: string;
    };
    message?: { message_id: number; chat: { id: number } };
    data?: string;
  };
};

type TelegramApiResponse<T> =
  | { ok: true; result: T }
  | { ok: false; description?: string; error_code?: number };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function text(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

function getAllowedUserSet(env: Env): Set<number> | null {
  const raw = env.BOT_ALLOWED_TELEGRAM_USER_IDS?.trim();
  if (!raw) return null;
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const ids = parts.map((p) => Number(p)).filter((n) => Number.isFinite(n));
  return new Set(ids);
}

function assertAdmin(env: Env, telegramUserId: number) {
  const allowed = getAllowedUserSet(env);
  if (!allowed || !allowed.has(telegramUserId)) {
    throw new Error("Admin command is restricted (set BOT_ALLOWED_TELEGRAM_USER_IDS)");
  }
}

async function tgCall<T>(
  env: Env,
  method: string,
  payload: Record<string, unknown>
): Promise<T> {
  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = (await res.json().catch(() => ({}))) as
    | TelegramApiResponse<T>
    | Record<string, unknown>;

  const okFlag = (data as any)?.ok;
  if (!res.ok || okFlag === false) {
    throw new Error(
      `Telegram API error: ${res.status} ${JSON.stringify(data)}`
    );
  }

  if (okFlag === true && (data as any).result !== undefined) return (data as any)
    .result as T;
  return data as unknown as T;
}

function parseCommand(msgText: string): { cmd: string; args: string } | null {
  const t = msgText.trim();
  if (!t.startsWith("/")) return null;
  const [first, ...rest] = t.split(/\s+/);
  const cmd = first.replace(/^\//, "").split("@")[0];
  return { cmd, args: rest.join(" ") };
}

function nowIso(): string {
  return new Date().toISOString();
}

function requireEnv(env: Env, key: keyof Env): string {
  const v = env[key];
  if (!v || typeof v !== "string") throw new Error(`Missing env: ${String(key)}`);
  return v;
}

function schema(env: Env): string {
  return (env.SUPABASE_SCHEMA ?? "bot").trim() || "bot";
}

function supa(env: Env) {
  const url = requireEnv(env, "SUPABASE_URL");
  const key = requireEnv(env, "SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

function buildInlineKeyboard(draftDbId: string) {
  return {
    inline_keyboard: [
      [
        { text: "Применить", callback_data: `draft:apply:${draftDbId}` },
        { text: "Отмена", callback_data: `draft:cancel:${draftDbId}` },
      ],
    ],
  };
}

async function upsertTelegramUser(
  env: Env,
  from: {
    id: number;
    username?: string;
    first_name?: string;
    last_name?: string;
    language_code?: string;
  }
) {
  const client = supa(env);
  const sch = schema(env);

  const { data, error } = await client
    .schema(sch)
    .from("telegram_users")
    .upsert(
      {
        telegram_user_id: from.id,
        username: from.username ?? null,
        first_name: from.first_name ?? null,
        last_name: from.last_name ?? null,
        language_code: from.language_code ?? null,
        updated_at: nowIso(),
      } as any,
      { onConflict: "telegram_user_id" }
    )
    .select("id,telegram_user_id")
    .maybeSingle();

  if (error) throw new Error(`Supabase upsert telegram_users failed: ${error.message}`);
  if (!data?.id) throw new Error("Supabase upsert telegram_users returned no id");

  return data as { id: string; telegram_user_id: number };
}

// ... rest of file unchanged
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") return text("ok");

    if (url.pathname !== "/telegram/webhook") return text("not found", 404);
    if (request.method !== "POST") return text("method not allowed", 405);

    const allowed = getAllowedUserSet(env);

    let update: TelegramUpdate;
    try {
      update = (await request.json()) as TelegramUpdate;
    } catch {
      return json({ ok: false, error: "invalid json" }, 400);
    }

    try {
      if (update.message?.text) {
        const from = update.message.from;
        const chatId = update.message.chat.id;
        if (!from) return json({ ok: true });
        if (allowed && !allowed.has(from.id)) return json({ ok: true });

        const parsed = parseCommand(update.message.text);
        if (!parsed) return json({ ok: true });
        // handleCommand unchanged; accepts from as non-optional
        await (globalThis as any).handleCommand(env, chatId, from, parsed.cmd, parsed.args, update.message.text);
        return json({ ok: true });
      }

      if (update.callback_query) {
        const fromId = update.callback_query.from?.id;
        if (fromId === undefined) return json({ ok: true });
        if (allowed && !allowed.has(fromId)) return json({ ok: true });
        await (globalThis as any).handleCallback(env, update.callback_query);
        return json({ ok: true });
      }

      return json({ ok: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return json({ ok: false, error: msg }, 500);
    }
  },
};
