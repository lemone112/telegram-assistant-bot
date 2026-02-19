import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import { loadConfig } from "./config";
import { runMigrations, shutdown as shutdownDb } from "./db";
import { startSubscriber, shutdownRedis, onJobCompleted } from "./redis";
import {
  handleCallback,
  handleMessage,
  normalizeError,
  type TelegramUpdate,
} from "./index";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const config = loadConfig();
  console.log("[boot] Config loaded");

  // Run bot schema migrations
  const migrationsDir = path.resolve(__dirname, "..", "supabase", "migrations");
  try {
    await runMigrations(migrationsDir);
    console.log("[boot] Migrations complete");
  } catch (err) {
    console.error("[boot] Migration failed:", err);
    process.exit(1);
  }

  // Start Redis subscriber (non-blocking — bot works without Redis)
  try {
    onJobCompleted((event) => {
      console.log(`[redis] Job completed: ${event.job_type} (${event.status})`);
    });
    await startSubscriber(config.REDIS_URL);
  } catch (err) {
    console.warn("[boot] Redis not available, push notifications disabled:", (err as Error).message);
  }

  // Fastify server
  const app = Fastify({ logger: false });

  app.get("/health", async () => ({ status: "ok" }));

  app.post<{ Body: TelegramUpdate }>("/telegram/webhook", async (request, reply) => {
    // Webhook secret verification (required in prod)
    if (config.TELEGRAM_WEBHOOK_SECRET_TOKEN) {
      const headerToken = request.headers["x-telegram-bot-api-secret-token"];
      if (headerToken !== config.TELEGRAM_WEBHOOK_SECRET_TOKEN) {
        return reply.status(401).send({ ok: false, error: "unauthorized" });
      }
    }

    const update = request.body;
    if (!update || typeof update !== "object") {
      return reply.status(400).send({ ok: false, error: "invalid json" });
    }

    try {
      if (update.callback_query) {
        await handleCallback(update);
      } else if (update.message?.text) {
        await handleMessage(update);
      }

      return { ok: true };
    } catch (e) {
      const err = normalizeError(e);
      console.error("[webhook] Error:", err.code, err.message);
      return { ok: true, error: err.code };
    }
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log("[shutdown] Shutting down...");
    await app.close();
    await shutdownRedis();
    await shutdownDb();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  const port = parseInt(config.PORT, 10);
  await app.listen({ port, host: "0.0.0.0" });
  console.log(`[boot] Server listening on port ${port}`);
}

main().catch((err) => {
  console.error("[boot] Fatal error:", err);
  process.exit(1);
});
