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
    from?: { id: number; username?: string; first_name?: string; last_name?: string; language_code?: string };
    entities?: Array<{ offset: number; length: number; type: string }>;
  };
  callback_query?: {
    id: string;
    from: { id: number; username?: string; first_name?: string; last_name?: string; language_code?: string };
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

async function tgCall<T>(env: Env, method: string, payload: Record<string, unknown>): Promise<T> {
  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = (await res.json().catch(() => ({}))) as TelegramApiResponse<T> | Record<string, unknown>;

  const okFlag = (data as any)?.ok;
  if (!res.ok || okFlag === false) {
    throw new Error(`Telegram API error: ${res.status} ${JSON.stringify(data)}`);
  }

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

async function upsertTelegramUser(env: Env, from: { id: number; username?: string; first_name?: string; last_name?: string; language_code?: string }) {
  const client = supa(env);
  const sch = schema(env);

  // Upsert by unique telegram_user_id
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

  if (error) throw new Error(`Supabase upsert telegram_user failed: ${error.message}`);
  if (!data?.id) throw new Error("Supabase upsert telegram_user returned no id");

  return data as { id: string; telegram_user_id: number };
}

async function audit(
  env: Env,
  draftDbId: string | null,
  eventType: string,
  level: "info" | "error" = "info",
  payload: any = {},
  message: string | null = null
) {
  const client = supa(env);
  const sch = schema(env);

  const { error } = await client.schema(sch).from("audit_log").insert({
    draft_id: draftDbId,
    level,
    event_type: eventType,
    message,
    payload,
    created_at: nowIso(),
  } as any);

  if (error) {
    // don't fail the request because of audit failure
    console.log("audit insert failed", error.message);
  }
}

async function resolveStageName(env: Env, stageInput: string): Promise<{ stage_key: string; stage_name: string } | null> {
  const client = supa(env);
  const sch = schema(env);
  const normalized = stageInput.trim().toLowerCase();

  // 1) alias exact match
  {
    const { data, error } = await client
      .schema(sch)
      .from("deal_stage_aliases")
      .select("stage_key")
      .eq("alias", normalized)
      .limit(1);
    if (error) throw new Error(`Supabase stage alias lookup failed: ${error.message}`);
    const stageKey = (data?.[0] as any)?.stage_key as string | undefined;
    if (stageKey) {
      const { data: s, error: e2 } = await client
        .schema(sch)
        .from("deal_stages")
        .select("stage_key,stage_name")
        .eq("stage_key", stageKey)
        .limit(1);
      if (e2) throw new Error(`Supabase stage lookup failed: ${e2.message}`);
      const row = s?.[0] as any;
      if (row?.stage_key && row?.stage_name) return { stage_key: row.stage_key, stage_name: row.stage_name };
    }
  }

  // 2) stage_name match (case-insensitive)
  {
    const { data, error } = await client
      .schema(sch)
      .from("deal_stages")
      .select("stage_key,stage_name")
      .ilike("stage_name", normalized)
      .limit(1);
    if (error) throw new Error(`Supabase stage name lookup failed: ${error.message}`);
    const row = data?.[0] as any;
    if (row?.stage_key && row?.stage_name) return { stage_key: row.stage_key, stage_name: row.stage_name };
  }

  return null;
}

async function applyDealStage(env: Env, actorTelegramId: number, draftDbId: string, dealId: string, stageInput: string) {
  const client = supa(env);
  const sch = schema(env);

  const { data: settings, error: se } = await client
    .schema(sch)
    .from("settings")
    .select("value")
    .eq("key", "composio")
    .maybeSingle();
  if (se) throw new Error(`Supabase get settings(composio) failed: ${se.message}`);

  const composioSettings = (settings as any)?.value ?? null;
  const attioConn = (composioSettings?.attio_connection_id as string | null) ?? null;
  if (!attioConn) throw new Error("Composio Attio connection id is not configured in bot.settings (key=composio)");

  const resolved = await resolveStageName(env, stageInput);
  if (!resolved) throw new Error(`Unknown stage: ${stageInput}`);

  await audit(env, draftDbId, "deal.stage.update.requested", "info", {
    actor_telegram_user_id: actorTelegramId,
    deal_id: dealId,
    stage: resolved,
  });

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

  await audit(env, draftDbId, "deal.stage.update", "info", {
    actor_telegram_user_id: actorTelegramId,
    deal_id: dealId,
    stage: resolved,
  });

  return resolved;
}

async function handleCommand(env: Env, chatId: number, from: NonNullable<TelegramUpdate["message"]>["from"], cmd: string, args: string, rawText: string) {
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

        const user = await upsertTelegramUser(env, from);
        const draftDbId = crypto.randomUUID();

        const client = supa(env);
        const sch = schema(env);

        const { error } = await client.schema(sch).from("drafts").insert({
          id: draftDbId,
          telegram_user_id: user.id,
          chat_id: chatId,
          source_type: "text",
          source_text: rawText,
          intent_summary: "deal.stage",
          status: "DRAFT",
          actions: [
            {
              type: "deal.stage",
              attio_deal_id: dealId,
              stage_input: stageText,
              created_at: nowIso(),
            },
          ],
        } as any);
        if (error) throw new Error(`Supabase insert draft failed: ${error.message}`);

        await tgCall(env, "sendMessage", {
          chat_id: chatId,
          text: `Draft создан.\n\nСделка: ${dealId}\nНовая стадия: ${stageText}\n\nПрименить/Отмена?`,
          reply_markup: JSON.stringify(buildInlineKeyboard(draftDbId)),
        });
        return;
      }

      if (sub === "won") {
        const dealId = rest.shift();
        if (!dealId) {
          await tgCall(env, "sendMessage", { chat_id: chatId, text: "Формат: /deal won <deal_id>" });
          return;
        }

        const user = await upsertTelegramUser(env, from);
        const draftDbId = crypto.randomUUID();

        const client = supa(env);
        const sch = schema(env);

        const { error } = await client.schema(sch).from("drafts").insert({
          id: draftDbId,
          telegram_user_id: user.id,
          chat_id: chatId,
          source_type: "text",
          source_text: rawText,
          intent_summary: "deal.won",
          status: "DRAFT",
          actions: [
            {
              type: "deal.won",
              attio_deal_id: dealId,
              target_stage_key: "won",
              created_at: nowIso(),
            },
          ],
        } as any);
        if (error) throw new Error(`Supabase insert draft failed: ${error.message}`);

        await tgCall(env, "sendMessage", {
          chat_id: chatId,
          text:
            `Draft создан.\n\nСделка: ${dealId}\n\n` +
            "Apply подготовит перенос в «Выиграно» и создаст Linear project и 12 задач.\n\n" +
            "Применить/Отмена?",
          reply_markup: JSON.stringify(buildInlineKeyboard(draftDbId)),
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
  const [prefix, action, draftDbId] = data.split(":");
  if (prefix !== "draft" || !draftDbId) {
    await tgCall(env, "answerCallbackQuery", { callback_query_id: cb.id, text: "Unknown action" });
    return;
  }

  const client = supa(env);
  const sch = schema(env);

  // Upsert user and use FK for author check
  const user = await upsertTelegramUser(env, cb.from);

  // fetch draft
  const { data: draft, error } = await client
    .schema(sch)
    .from("drafts")
    .select("id,chat_id,telegram_user_id,status,actions")
    .eq("id", draftDbId)
    .maybeSingle();
  if (error) throw new Error(`Supabase draft fetch failed: ${error.message}`);

  if (!draft) {
    await tgCall(env, "answerCallbackQuery", { callback_query_id: cb.id, text: "Draft not found" });
    return;
  }

  // only author can apply/cancel
  if (String((draft as any).telegram_user_id) !== String(user.id)) {
    await tgCall(env, "answerCallbackQuery", { callback_query_id: cb.id, text: "Only draft author can do this" });
    return;
  }

  if (action === "cancel") {
    const { error: e2 } = await client
      .schema(sch)
      .from("drafts")
      .update({ status: "CANCELLED" } as any)
      .eq("id", draftDbId);
    if (e2) throw new Error(`Supabase cancel failed: ${e2.message}`);

    await audit(env, draftDbId, "draft.cancel", "info", { actor_telegram_user_id: cb.from.id });

    await tgCall(env, "answerCallbackQuery", { callback_query_id: cb.id, text: "Cancelled" });
    await tgCall(env, "sendMessage", { chat_id: chatId, text: `Draft отменён: ${draftDbId}` });
    return;
  }

  if (action !== "apply") {
    await tgCall(env, "answerCallbackQuery", { callback_query_id: cb.id, text: "Unknown action" });
    return;
  }

  // idempotency gate (baseline: bot.idempotency_keys)
  const idempotencyKey = `tg:callback:${cb.id}`;
  {
    const { error: idemErr } = await client
      .schema(sch)
      .from("idempotency_keys")
      .insert({ key: idempotencyKey, draft_id: draftDbId } as any);
    if (idemErr) {
      await tgCall(env, "answerCallbackQuery", { callback_query_id: cb.id, text: "Already applied" });
      return;
    }
  }

  await tgCall(env, "answerCallbackQuery", { callback_query_id: cb.id, text: "Applying..." });

  try {
    const actions: any[] = ((draft as any).actions as any[]) ?? [];
    const first = actions[0] ?? null;

    if (first?.type === "deal.stage") {
      const dealId = first.attio_deal_id as string;
      const stageInput = first.stage_input as string;

      const resolved = await applyDealStage(env, cb.from.id, draftDbId, dealId, stageInput);

      await client.schema(sch).from("drafts").update({ status: "APPLIED" } as any).eq("id", draftDbId);
      await audit(env, draftDbId, "draft.apply", "info", { actor_telegram_user_id: cb.from.id, type: first.type });

      await tgCall(env, "sendMessage", {
        chat_id: chatId,
        text: `Готово. Сделка ${dealId} переведена в стадию: ${resolved.stage_name}`,
      });
      return;
    }

    await tgCall(env, "sendMessage", {
      chat_id: chatId,
      text: `Apply для типа ${(first?.type ?? "unknown")} пока не реализован.`,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await audit(env, draftDbId, "draft.apply", "error", { actor_telegram_user_id: cb.from.id }, msg);
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
        const from = update.message.from;
        const chatId = update.message.chat.id;
        if (!from) return json({ ok: true });
        if (allowed && !allowed.has(from.id)) return json({ ok: true });

        const parsed = parseCommand(update.message.text);
        if (!parsed) return json({ ok: true });

        await handleCommand(env, chatId, from, parsed.cmd, parsed.args, update.message.text);
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
