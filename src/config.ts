export type AppConfig = {
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET_TOKEN: string | undefined;

  DASHBOARD_DATABASE_URL: string;
  BOT_DB_SCHEMA: string;

  REDIS_URL: string;
  DASHBOARD_API_URL: string;

  COMPOSIO_API_KEY: string;
  OPENAI_API_KEY: string | undefined;

  BOT_ALLOWED_TELEGRAM_USER_IDS: string;
  BOT_ALLOWED_ADMIN_TELEGRAM_USER_IDS: string | undefined;

  LINEAR_TEAM_ID: string | undefined;
  PAUSE_REMINDER_DAYS: string;

  PORT: string;
};

function requireEnvVar(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing required env var: ${key}`);
  return v;
}

let _config: AppConfig | null = null;

export function loadConfig(): AppConfig {
  if (_config) return _config;
  _config = {
    TELEGRAM_BOT_TOKEN: requireEnvVar("TELEGRAM_BOT_TOKEN"),
    TELEGRAM_WEBHOOK_SECRET_TOKEN: process.env.TELEGRAM_WEBHOOK_SECRET_TOKEN,
    DASHBOARD_DATABASE_URL: requireEnvVar("DASHBOARD_DATABASE_URL"),
    BOT_DB_SCHEMA: process.env.BOT_DB_SCHEMA || "bot",
    REDIS_URL: process.env.REDIS_URL || "redis://localhost:6379",
    DASHBOARD_API_URL: process.env.DASHBOARD_API_URL || "http://server:8080",
    COMPOSIO_API_KEY: requireEnvVar("COMPOSIO_API_KEY"),
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    BOT_ALLOWED_TELEGRAM_USER_IDS: process.env.BOT_ALLOWED_TELEGRAM_USER_IDS || "",
    BOT_ALLOWED_ADMIN_TELEGRAM_USER_IDS: process.env.BOT_ALLOWED_ADMIN_TELEGRAM_USER_IDS,
    LINEAR_TEAM_ID: process.env.LINEAR_TEAM_ID,
    PAUSE_REMINDER_DAYS: process.env.PAUSE_REMINDER_DAYS || "7",
    PORT: process.env.PORT || "3000",
  };
  return _config;
}

export function getConfig(): AppConfig {
  if (!_config) return loadConfig();
  return _config;
}
