import { createClient } from "@supabase/supabase-js";
import { composioExecute } from "./composio";

type Env = {
  TELEGRAM_BOT_TOKEN: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  COMPOSIO_API_KEY: string;

  // vars
  SUPABASE_SCHEMA?: string;
  PAUSE_REMINDER_DAYS?: string;
  BOT_ALLOWED_TELEGRAM_USER_IDS?: string;
};

type TelegramUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    date: number;
    text?: string;
    chat: { id: number; type: string; title?: string; username?: string };
    from?: { id: number; username?: string; first_name?: string; last_name?: string };
    entities?: Array<{ offset: number; length: number; type: string }>;
  };
  callback_query?: {
    id: string;
    from: { id: number; username?: string; first_name?: string; last_name?: string };
    message?: { message_id: number; chat: { id: number } };
    data?: string;
  };
};

type TelegramApiResponse<T> = { ok: true; result: T } | { ok: false; description?: string; error_code?: number };

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
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  const ids = parts.map((p) => Number(p)).filter((n) => Number.isFinite(n));
  return new Set(ids);
}

async function tgCall<T>(env: Env, method: string, payload: Record<string, unknown>): Promise<T> {
  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = (await res.json().catch(() => ({}))) as TelegramApiResponse<T> | Record<string, unknown>;

  // Support both: real Telegram responses and defensive fallback when JSON parse fails.
  const okFlag = (data as any)?.ok;
  if (!res.ok || okFlag === false) {
    throw new Error(`Telegram API error: ${res.status} ${JSON.stringify(data)}`);
  }

  // If response matches TelegramApiResponse<T>, return result; otherwise return as-is.
  if (okFlag === true && (data as any).result !== undefined) return (data as any).result as T;
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

function supa(env: Env) {
  const url = requireEnv(env, "SUPABASE_URL");
  const key = requireEnv(env, "SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

type DraftRow = {
  draft_id: string;
  chat_id: string;
  author_telegram_user_id: string;
  status: "DRAFT" | "APPLIED" | "CANCELLED" | "EXPIRED";
  payload: any;
  created_at?: string;
  expires_at?: string;
};

function buildInlineKeyboard(draftId: string) {
  return {
    inline_keyboard: [
      [
        { text: "Применить", callback_data: `draft:apply:${draftId}` },
        { text: "Отмена", callback_data: `draft:cancel:${draftId}` },
      ],
    ],
  };
}

async function createDraft(env: Env, draft: Omit<DraftRow, "status"> & { status?: DraftRow["status"] }) {
  const client = supa(env);
  const schema = env.SUPABASE_SCHEMA ?? "bot";

  const row: DraftRow = {
    ...draft,
    status: draft.status ?? "DRAFT",
  };

  const { error } = await client.schema(schema).from("drafts").insert(row as any);
  if (error) throw new Error(`Supabase insert draft failed: ${error.message}`);
}

async function getSettings(env: Env, key: string): Promise<any> {
  const client = supa(env);
  const schema = env.SUPABASE_SCHEMA ?? "bot";
  const { data, error } = await client.schema(schema).from("settings").select("value").eq("key", key).limit(1);
  if (error) throw new Error(`Supabase settings read failed: ${error.message}`);
  return (data?.[0] as any)?.value;
}

async function audit(env: Env, actorId: number | null, action: string, status: "success" | "failure", target?: any, errorMsg?: string) {
  const client = supa(env);
  const schema = env.SUPABASE_SCHEMA ?? "bot";
  const { error } = await client.schema(schema).from("audit_log").insert({
    actor_telegram_user_id: actorId ? String(actorId) : null,
    action,
    target: target ?? null,
    status,
    error: errorMsg ?? null,
    created_at: nowIso(),
  } as any);
  if (error) {
    // don't fail the request because of audit failure
    console.log("audit insert failed", error.message);
  }
}

async function resolveStageName(env: Env, stageInput: string): Promise<{ stage_key: string; stage_name: string } | null> {
  const client = supa(env);
  const schema = env.SUPABASE_SCHEMA ?? "bot";
  const normalized = stageInput.trim().toLowerCase();

  // 1) alias exact match
  {
    const { data, error } = await client.schema(schema).from("deal_stage_aliases").select("stage_key").eq("alias", normalized).limit(1);
    if (error) throw new Error(`Supabase stage alias lookup failed: ${error.message}`);
    const stageKey = (data?.[0] as any)?.stage_key as string | undefined;
    if (stageKey) {
      const { data: s, error: e2 } = await client.schema(schema).from("deal_stages").select("stage_key,stage_name").eq("stage_key", stageKey).limit(1);
      if (e2) throw new Error(`Supabase stage lookup failed: ${e2.message}`);
      const row = s?.[0] as any;
      if (row?.stage_key && row?.stage_name) return { stage_key: row.stage_key, stage_name: row.stage_name };
    }
  }

  // 2) stage_name match (case-insensitive)
  {
    const { data, error } = await client.schema(schema).from("deal_stages").select("stage_key,stage_name").ilike("stage_name", normalized).limit(1);
    if (error) throw new Error(`Supabase stage name lookup failed: ${error.message}`);
    const row = data?.[0] as any;
    if (row?.stage_key && row?.stage_name) return { stage_key: row.stage_key, stage_name: row.stage_name };
  }

  return null;
}

async function applyDealStage(env: Env, actorId: number, draftId: string, dealId: string, stageInput: string) {
  const composioSettings = await getSettings(env, "composio");
  const attioConn = (composioSettings?.attio_connection_id as string | null) ?? null;
  if (!attioConn) throw new Error("Composio Attio connection id is not configured in bot.settings (key=composio)");

  const resolved = await resolveStageName(env, stageInput);
  if (!resolved) throw new Error(`Unknown stage: ${stageInput}`);

  await audit(env, actorId, "deal.stage.update.requested", "success", { draftId, dealId, stage: resolved });

  // Execute Attio update via Composio
  await composioExecute(env, {
    tool_slug: "ATTIO_UPDATE_RECORD",
    connected_account_id: attioConn,
    arguments: {
      object_type: "deals",
      record_id: dealId,
      values: {
        stage: [resolved.stage_name],
      },
    },
  });

  await audit(env, actorId, "deal.stage.update", "success", { draftId, dealId, stage: resolved });

  return resolved;
}

async function handleCommand(env: Env, chatId: number, fromId: number, cmd: string, args: string) {
  switch (cmd) {
    case "start":
    case "help": {
      await tgCall(env, "sendMessage", {
        chat_id: chatId,
        text:
          "Команды:\n" +
          "/deal stage <deal_id> <stage>\n" +
          "/deal won <deal_id>\n\n" +
          "Все изменения выполняются только через Draft → Применить.",
      });
      return;
    }

    case "deal": {
      const [sub, ...rest] = args.split(/\s+/).filter(Boolean);
      if (!sub) {
        await tgCall(env, "sendMessage", { chat_id: chatId, text: "Используй: /deal stage|won ..." });
        return;
      }

      if (sub === "stage") {
        const dealId = rest.shift();
        const stageText = rest.join(" ").trim();
        if (!dealId || !stageText) {
          await tgCall(env, "sendMessage", { chat_id: chatId, text: "Формат: /deal stage <deal_id> <stage>" });
          return;
        }

        const draftId = crypto.randomUUID();
        await createDraft(env, {
          draft_id: draftId,
          chat_id: String(chatId),
          author_telegram_user_id: String(fromId),
          payload: {
            type: "deal.stage",
            attio_deal_id: dealId,
            stage_input: stageText,
            created_at: nowIso(),
          },
        });

        await tgCall(env, "sendMessage", {
          chat_id: chatId,
          text: `Draft создан.\n\nСделка: ${dealId}\nНовая стадия: ${stageText}\n\nПрименить/Отмена?`,
          reply_markup: JSON.stringify(buildInlineKeyboard(draftId)),
        });
        return;
      }

      if (sub === "won") {
        const dealId = rest.shift();
        if (!dealId) {
          await tgCall(env, "sendMessage", { chat_id: chatId, text: "Формат: /deal won <deal_id>" });
          return;
        }

        const draftId = crypto.randomUUID();
        await createDraft(env, {
          draft_id: draftId,
          chat_id: String(chatId),
          author_telegram_user_id: String(fromId),
          payload: {
            type: "deal.won",
            attio_deal_id: dealId,
            target_stage_key: "won",
            created_at: nowIso(),
          },
        });

        await tgCall(env, "sendMessage", {
          chat_id: chatId,
          text:
            `Draft создан.\n\nСделка будет переведена в «Выиграно», затем будет создан Linear project и 12 задач.\n\nDeal: ${dealId}\n\nПрименить/Отмена?`,
          reply_markup: JSON.stringify(buildInlineKeyboard(draftId)),
        });
        return;
      }

      await tgCall(env, "sendMessage", { chat_id: chatId, text: "Пока реализовано: /deal stage, /deal won." });
      return;
    }

    default:
      await tgCall(env, "sendMessage", { chat_id: chatId, text: `Неизвестная команда: /${cmd}` });
      return;
  }
}

async function handleCallback(env: Env, cb: NonNullable<TelegramUpdate["callback_query"]>) {
  const chatId = cb.message?.chat.id;
  if (!chatId) return;

  const data = cb.data ?? "";
  const [prefix, action, draftId] = data.split(":");
  if (prefix !== "draft" || !draftId) {
    await tgCall(env, "answerCallbackQuery", { callback_query_id: cb.id, text: "Unknown action" });
    return;
  }

  const client = supa(env);
  const schema = env.SUPABASE_SCHEMA ?? "bot";

  // fetch draft
  const { data: drafts, error } = await client
    .schema(schema)
    .from("drafts")
    .select("draft_id,chat_id,author_telegram_user_id,status,payload")
    .eq("draft_id", draftId)
    .limit(1);
  if (error) throw new Error(`Supabase draft fetch failed: ${error.message}`);
  const draft = drafts?.[0] as any as DraftRow | undefined;
  if (!draft) {
    await tgCall(env, "answerCallbackQuery", { callback_query_id: cb.id, text: "Draft not found" });
    return;
  }

  // only author can apply/cancel
  if (String(cb.from.id) !== String(draft.author_telegram_user_id)) {
    await tgCall(env, "answerCallbackQuery", { callback_query_id: cb.id, text: "Only draft author can do this" });
    return;
  }

  if (action === "cancel") {
    const { error: e2 } = await client.schema(schema).from("drafts").update({ status: "CANCELLED" } as any).eq("draft_id", draftId);
    if (e2) throw new Error(`Supabase cancel failed: ${e2.message}`);
    await audit(env, cb.from.id, "draft.cancel", "success", { draftId });
    await tgCall(env, "answerCallbackQuery", { callback_query_id: cb.id, text: "Cancelled" });
    await tgCall(env, "sendMessage", { chat_id: chatId, text: `Draft отменён: ${draftId}` });
    return;
  }

  if (action !== "apply") {
    await tgCall(env, "answerCallbackQuery", { callback_query_id: cb.id, text: "Unknown action" });
    return;
  }

  // idempotency on callback
  const idemKey = `${draftId}:${cb.id}`;
  {
    const { error: idemErr } = await client.schema(schema).from("idempotency_keys").insert({ key: idemKey, draft_id: draftId } as any);
    if (idemErr) {
      await tgCall(env, "answerCallbackQuery", { callback_query_id: cb.id, text: "Already applied" });
      return;
    }
  }

  await tgCall(env, "answerCallbackQuery", { callback_query_id: cb.id, text: "Applying..." });

  try {
    const payload: any = (draft as any).payload;

    if (payload?.type === "deal.stage") {
      const dealId = payload.attio_deal_id as string;
      const stageInput = payload.stage_input as string;
      const resolved = await applyDealStage(env, cb.from.id, draftId, dealId, stageInput);

      await client.schema(schema).from("drafts").update({ status: "APPLIED" } as any).eq("draft_id", draftId);
      await audit(env, cb.from.id, "draft.apply", "success", { draftId, type: payload.type });

      await tgCall(env, "sendMessage", {
        chat_id: chatId,
        text: `Готово. Сделка ${dealId} переведена в стадию: ${resolved.stage_name}`,
      });
      return;
    }

    await tgCall(env, "sendMessage", { chat_id: chatId, text: `Apply для типа ${payload?.type ?? "unknown"} пока не реализован.` });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await audit(env, cb.from.id, "draft.apply", "failure", { draftId }, msg);
    await tgCall(env, "sendMessage", { chat_id: chatId, text: `Ошибка Apply: ${msg}` });
  }
}

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
        const fromId = update.message.from?.id;
        const chatId = update.message.chat.id;
        if (!fromId) return json({ ok: true });
        if (allowed && !allowed.has(fromId)) return json({ ok: true });

        const parsed = parseCommand(update.message.text);
        if (!parsed) return json({ ok: true });

        await handleCommand(env, chatId, fromId, parsed.cmd, parsed.args);
        return json({ ok: true });
      }

      if (update.callback_query) {
        const fromId = update.callback_query.from.id;
        if (allowed && !allowed.has(fromId)) return json({ ok: true });

        await handleCallback(env, update.callback_query);
        return json({ ok: true });
      }

      return json({ ok: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return json({ ok: false, error: msg }, 500);
    }
  },
};
