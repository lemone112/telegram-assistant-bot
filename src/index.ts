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

function assertAdmin(env: Env, telegramUserId: number) {
  const allowed = getAllowedUserSet(env);
  if (!allowed || !allowed.has(telegramUserId)) {
    throw new Error("Admin command is restricted (set BOT_ALLOWED_TELEGRAM_USER_IDS)");
  }
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

async function getSettingsValue(env: Env, key: string): Promise<any> {
  const client = supa(env);
  const sch = schema(env);
  const { data, error } = await client.schema(sch).from("settings").select("value").eq("key", key).maybeSingle();
  if (error) throw new Error(`Supabase get settings(${key}) failed: ${error.message}`);
  return (data as any)?.value ?? null;
}

async function upsertSettingsValue(env: Env, key: string, value: any) {
  const client = supa(env);
  const sch = schema(env);
  const { error } = await client.schema(sch).from("settings").upsert({ key, value } as any);
  if (error) throw new Error(`Supabase upsert settings(${key}) failed: ${error.message}`);
}

function safeJsonPreview(value: any, maxLen = 1200): string {
  const s = JSON.stringify(value ?? null, null, 2);
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen) + "\n...<truncated>";
}

async function patchComposioSettings(env: Env, patch: Record<string, unknown>) {
  const current = (await getSettingsValue(env, "composio")) ?? {};
  const next = { ...(typeof current === "object" && current ? current : {}), ...patch };
  await upsertSettingsValue(env, "composio", next);
  return next;
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
    console.log("audit insert failed", error.message);
  }
}

async function createApplyAttempt(env: Env, draftDbId: string, idempotencyKey: string) {
  const client = supa(env);
  const sch = schema(env);

  const { data, error } = await client
    .schema(sch)
    .from("draft_apply_attempts")
    .insert({ draft_id: draftDbId, idempotency_key: idempotencyKey, started_at: nowIso() } as any)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(`Supabase create apply attempt failed: ${error.message}`);
  }

  return (data as any)?.id as string;
}

async function finishApplyAttempt(env: Env, attemptId: string, result: any, errorSummary: string | null) {
  const client = supa(env);
  const sch = schema(env);

  const { error } = await client
    .schema(sch)
    .from("draft_apply_attempts")
    .update({ finished_at: nowIso(), result: result ?? {}, error_summary: errorSummary } as any)
    .eq("id", attemptId);

  if (error) {
    console.log("finishApplyAttempt failed", error.message);
  }
}

async function resolveStageName(env: Env, stageInput: string): Promise<{ stage_key: string; stage_name: string } | null> {
  const client = supa(env);
  const sch = schema(env);
  const normalized = stageInput.trim().toLowerCase();

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

function linearTeamIdOrThrow(env: Env): string {
  const v = env.LINEAR_TEAM_ID?.trim();
  if (v) return v;
  // Friendly guidance. We can't auto-pick a team safely.
  return "";
}

async function applyDealStage(env: Env, actorTelegramId: number, draftDbId: string, dealId: string, stageInput: string) {
  const composioSettings = await getSettingsValue(env, "composio");
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

async function ensureLinearKickoff(env: Env, actorTelegramId: number, draftDbId: string, attioDealId: string, linearTeamId: string) {
  const client = supa(env);
  const sch = schema(env);

  const composioSettings = await getSettingsValue(env, "composio");
  const linearConn = (composioSettings?.linear_connection_id as string | null) ?? null;
  if (!linearConn) {
    throw new Error("Composio Linear connection id is not configured. Set it via /admin composio linear <connected_account_id>");
  }

  // 1) Check mapping (idempotent)
  const { data: existingLink, error: lerr } = await client
    .schema(sch)
    .from("deal_linear_links")
    .select("attio_deal_id,linear_project_id,linear_team_id,project_name")
    .eq("attio_deal_id", attioDealId)
    .maybeSingle();
  if (lerr) throw new Error(`Supabase deal_linear_links read failed: ${lerr.message}`);

  let linearProjectId: string | null = (existingLink as any)?.linear_project_id ?? null;
  let projectName: string | null = (existingLink as any)?.project_name ?? null;

  // 2) Create Linear project if needed.
  // NOTE: We do not have a dedicated Linear "create project" tool in the current tool list.
  // We will use issues-only kickoff for MVP if project creation is not available.
  // To keep progress, we create issues without project_id and store mapping when project creation is implemented.

  if (!linearProjectId) {
    projectName = `Kickoff — Attio deal ${attioDealId}`;
    await audit(env, draftDbId, "linear.kickoff.project.skipped", "info", {
      actor_telegram_user_id: actorTelegramId,
      attio_deal_id: attioDealId,
      reason: "No Linear create-project tool available in this environment; creating issues without project_id",
      linear_team_id: linearTeamId,
    });
  }

  // 3) Create template issues idempotently via bot.project_template_tasks
  const created: any[] = [];

  for (const t of KICKOFF_TEMPLATE_TASKS) {
    // If we don't have a project yet, use synthetic project id keyspace based on deal id.
    const projectKey = linearProjectId ?? `deal:${attioDealId}`;

    const { data: existingTask, error: terr } = await client
      .schema(sch)
      .from("project_template_tasks")
      .select("linear_project_id,template_task_key,linear_issue_id,linear_issue_identifier,title")
      .eq("linear_project_id", projectKey)
      .eq("template_task_key", t.template_task_key)
      .maybeSingle();
    if (terr) throw new Error(`Supabase project_template_tasks read failed: ${terr.message}`);

    if ((existingTask as any)?.linear_issue_id) {
      continue;
    }

    const issue = await composioExecute(env, {
      tool_slug: "LINEAR_CREATE_LINEAR_ISSUE",
      connected_account_id: linearConn,
      arguments: {
        team_id: linearTeamId,
        title: t.title,
        description: t.description,
        // project_id intentionally omitted if we don't have a project yet.
      },
    });

    const issueId = (issue as any)?.id ?? (issue as any)?.data?.id ?? null;
    const identifier = (issue as any)?.identifier ?? (issue as any)?.data?.identifier ?? null;

    // Persist idempotently
    const { error: ierr } = await client.schema(sch).from("project_template_tasks").upsert(
      {
        linear_project_id: projectKey,
        template_task_key: t.template_task_key,
        linear_issue_id: issueId,
        linear_issue_identifier: identifier,
        title: t.title,
      } as any,
      {
        onConflict: "linear_project_id,template_task_key",
      }
    );
    if (ierr) throw new Error(`Supabase project_template_tasks upsert failed: ${ierr.message}`);

    created.push({ template_task_key: t.template_task_key, issue_id: issueId, identifier });
  }

  // Store mapping if we have a real project id (future).
  if (linearProjectId) {
    const { error: uerr } = await client.schema(sch).from("deal_linear_links").upsert(
      {
        attio_deal_id: attioDealId,
        linear_project_id: linearProjectId,
        linear_team_id: linearTeamId,
        project_name: projectName,
      } as any,
      { onConflict: "attio_deal_id" }
    );
    if (uerr) throw new Error(`Supabase deal_linear_links upsert failed: ${uerr.message}`);
  }

  return { linear_project_id: linearProjectId, project_name: projectName, created_issues: created };
}

async function listLinearTeams(env: Env) {
  const composioSettings = await getSettingsValue(env, "composio");
  const linearConn = (composioSettings?.linear_connection_id as string | null) ?? null;
  if (!linearConn) {
    throw new Error("Composio Linear connection id is not configured. Set it via /admin composio linear <connected_account_id>");
  }

  const teams = await composioExecute(env, {
    tool_slug: "LINEAR_GET_ALL_LINEAR_TEAMS",
    connected_account_id: linearConn,
    arguments: {},
  });

  return teams;
}

async function handleAdminCommand(env: Env, chatId: number, fromId: number, args: string) {
  assertAdmin(env, fromId);

  const [sub, ...rest] = args.split(/\s+/).filter(Boolean);

  if (!sub || sub === "help") {
    await tgCall(env, "sendMessage", {
      chat_id: chatId,
      text:
        "Admin commands:\n" +
        "/admin status\n" +
        "/admin composio show\n" +
        "/admin composio attio <connected_account_id>\n" +
        "/admin composio linear <connected_account_id>\n" +
        "/admin linear teams\n",
    });
    return;
  }

  if (sub === "status") {
    const composio = await getSettingsValue(env, "composio");
    const attioConn = composio?.attio_connection_id ?? null;
    const linearConn = composio?.linear_connection_id ?? null;
    await tgCall(env, "sendMessage", {
      chat_id: chatId,
      text:
        "Status:\n" +
        `- schema: ${schema(env)}\n` +
        `- composio.attio_connection_id: ${attioConn ? attioConn : "<not set>"}\n` +
        `- composio.linear_connection_id: ${linearConn ? linearConn : "<not set>"}\n` +
        `- LINEAR_TEAM_ID env: ${env.LINEAR_TEAM_ID ? env.LINEAR_TEAM_ID : "<not set>"}\n`,
    });
    return;
  }

  if (sub === "linear") {
    const [action] = rest;
    if (action !== "teams") {
      await tgCall(env, "sendMessage", { chat_id: chatId, text: "Usage: /admin linear teams" });
      return;
    }

    try {
      const teams = await listLinearTeams(env);

      const list: any[] =
        (teams as any)?.teams ??
        (teams as any)?.data?.teams ??
        (teams as any)?.nodes ??
        (teams as any)?.data?.nodes ??
        (Array.isArray(teams) ? (teams as any[]) : []);

      const lines = (list || []).slice(0, 50).map((t) => {
        const id = t?.id ?? "<no id>";
        const key = t?.key ? ` (${t.key})` : "";
        const name = t?.name ?? "<no name>";
        return `- ${name}${key}: ${id}`;
      });

      const msg =
        "Linear teams (use the UUID as LINEAR_TEAM_ID):\n\n" +
        (lines.length ? lines.join("\n") : "<no teams found>") +
        "\n\nSet GitHub Actions variable LINEAR_TEAM_ID to the chosen UUID.";

      await tgCall(env, "sendMessage", { chat_id: chatId, text: msg });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await tgCall(env, "sendMessage", {
        chat_id: chatId,
        text:
          "Failed to list Linear teams.\n\n" +
          "Checklist:\n" +
          "1) Configure Composio Linear connection: /admin composio linear <connected_account_id>\n" +
          "2) Ensure COMPOSIO_API_KEY is set in env\n\n" +
          `Error: ${msg}`,
      });
    }

    return;
  }

  if (sub === "composio") {
    const [tool, value] = rest;

    if (!tool) {
      await tgCall(env, "sendMessage", { chat_id: chatId, text: "Usage: /admin composio show|attio|linear ..." });
      return;
    }

    if (tool === "show") {
      const composio = await getSettingsValue(env, "composio");
      await tgCall(env, "sendMessage", {
        chat_id: chatId,
        text: "bot.settings[composio] =\n" + safeJsonPreview(composio),
      });
      return;
    }

    if (tool === "attio") {
      if (!value) {
        await tgCall(env, "sendMessage", {
          chat_id: chatId,
          text: "Usage: /admin composio attio <connected_account_id>",
        });
        return;
      }

      const next = await patchComposioSettings(env, { attio_connection_id: value });

      await tgCall(env, "sendMessage", {
        chat_id: chatId,
        text: "Saved.\n\nbot.settings[composio] =\n" + safeJsonPreview(next),
      });
      return;
    }

    if (tool === "linear") {
      if (!value) {
        await tgCall(env, "sendMessage", {
          chat_id: chatId,
          text: "Usage: /admin composio linear <connected_account_id>",
        });
        return;
      }

      const next = await patchComposioSettings(env, { linear_connection_id: value });

      await tgCall(env, "sendMessage", {
        chat_id: chatId,
        text: "Saved.\n\nbot.settings[composio] =\n" + safeJsonPreview(next),
      });
      return;
    }

    await tgCall(env, "sendMessage", { chat_id: chatId, text: "Unknown composio admin command" });
    return;
  }

  await tgCall(env, "sendMessage", { chat_id: chatId, text: "Unknown admin command" });
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
          "/deal won <deal_id>\n" +
          "/admin help\n\n" +
          "Все изменения выполняются только через Draft → Применить.",
      });
      return;
    }

    case "admin": {
      await handleAdminCommand(env, chatId, from.id, args);
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
            "Apply переведёт стадию в «Выиграно» и создаст Linear kickoff (12 задач).\n\n" +
            "Применить/Отмена?",
          reply_markup: JSON.stringify(buildInlineKeyboard(draftDbId)),
        });
        return;
      }

      await tgCall(env, "sendMessage", { chat_id: chatId, text: "Неизвестная команда: /deal stage, /deal won" });
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

  const user = await upsertTelegramUser(env, cb.from);

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

  if (String((draft as any).telegram_user_id) !== String(user.id)) {
    await tgCall(env, "answerCallbackQuery", { callback_query_id: cb.id, text: "Only draft author can do this" });
    return;
  }

  if (action === "cancel") {
    const { error: e2 } = await client.schema(sch).from("drafts").update({ status: "CANCELLED" } as any).eq("id", draftDbId);
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

  const idempotencyKey = `tg:callback:${cb.id}`;

  {
    const { error: idemErr } = await client.schema(sch).from("idempotency_keys").insert({ key: idempotencyKey, draft_id: draftDbId } as any);
    if (idemErr) {
      await tgCall(env, "answerCallbackQuery", { callback_query_id: cb.id, text: "Already applied" });
      return;
    }
  }

  const attemptId = await createApplyAttempt(env, draftDbId, idempotencyKey);

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
      await finishApplyAttempt(env, attemptId, { ok: true, stage: resolved }, null);

      await tgCall(env, "sendMessage", {
        chat_id: chatId,
        text: `Готово. Сделка ${dealId} переведена в стадию: ${resolved.stage_name}`,
      });
      return;
    }

    if (first?.type === "deal.won") {
      const dealId = first.attio_deal_id as string;

      const teamId = env.LINEAR_TEAM_ID?.trim();
      if (!teamId) {
        const friendly =
          "Не настроен LINEAR_TEAM_ID.\n\n" +
          "Сделай одно из двух:\n" +
          "1) Выполни /admin linear teams и выбери UUID\n" +
          "2) Добавь GitHub Actions variable LINEAR_TEAM_ID\n\n" +
          "После деплоя бот начнёт использовать эту команду.";

        await finishApplyAttempt(env, attemptId, { ok: false }, "LINEAR_TEAM_ID not set");
        await tgCall(env, "sendMessage", { chat_id: chatId, text: friendly });
        return;
      }

      const wonStage = await resolveStageName(env, "выиграно");
      if (!wonStage) throw new Error("Stage 'Выиграно' is missing in bot.deal_stages");
      await applyDealStage(env, cb.from.id, draftDbId, dealId, wonStage.stage_name);

      const kickoff = await ensureLinearKickoff(env, cb.from.id, draftDbId, dealId, teamId);

      await client.schema(sch).from("drafts").update({ status: "APPLIED" } as any).eq("id", draftDbId);
      await finishApplyAttempt(env, attemptId, { ok: true, kickoff }, null);

      await tgCall(env, "sendMessage", {
        chat_id: chatId,
        text:
          "Готово.\n\n" +
          `Сделка ${dealId} → стадия «Выиграно».\n` +
          `Kickoff задач создано: ${(kickoff.created_issues ?? []).length}.\n`,
      });
      return;
    }

    await finishApplyAttempt(env, attemptId, { ok: false, reason: "type not implemented", type: first?.type ?? null }, null);

    await tgCall(env, "sendMessage", {
      chat_id: chatId,
      text: `Apply для типа ${(first?.type ?? "unknown") as string} пока не реализован.`,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await audit(env, draftDbId, "draft.apply", "error", { actor_telegram_user_id: cb.from.id }, msg);
    await finishApplyAttempt(env, attemptId, { ok: false }, msg);
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
