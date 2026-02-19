import Redis from "ioredis";

let subscriber: Redis | null = null;

export type JobCompletedEvent = {
  job_type: string;
  project_id: string;
  account_scope_id: string;
  status: "ok" | "failed";
  at: string;
};

export type JobCompletedHandler = (event: JobCompletedEvent) => void | Promise<void>;

const handlers: JobCompletedHandler[] = [];

export function onJobCompleted(handler: JobCompletedHandler): void {
  handlers.push(handler);
}

export function connectRedis(redisUrl: string): Redis {
  if (subscriber) return subscriber;

  subscriber = new Redis(redisUrl, {
    retryStrategy(times) {
      const delay = Math.min(times * 500, 5000);
      console.log(`[redis] Reconnecting in ${delay}ms (attempt ${times})`);
      return delay;
    },
    maxRetriesPerRequest: null,
    lazyConnect: true,
  });

  subscriber.on("error", (err) => {
    console.error("[redis] Connection error:", err.message);
  });

  subscriber.on("connect", () => {
    console.log("[redis] Connected");
  });

  return subscriber;
}

export async function startSubscriber(redisUrl: string): Promise<void> {
  const sub = connectRedis(redisUrl);

  try {
    await sub.connect();
  } catch (err) {
    console.error("[redis] Initial connection failed, will retry:", (err as Error).message);
    return;
  }

  await sub.subscribe("job_completed");
  console.log("[redis] Subscribed to job_completed channel");

  sub.on("message", async (_channel: string, message: string) => {
    try {
      const event = JSON.parse(message) as JobCompletedEvent;
      for (const handler of handlers) {
        try {
          await handler(event);
        } catch (err) {
          console.error("[redis] Handler error:", (err as Error).message);
        }
      }
    } catch {
      console.error("[redis] Failed to parse message:", message);
    }
  });
}

export async function shutdownRedis(): Promise<void> {
  if (subscriber) {
    await subscriber.quit().catch(() => {});
    subscriber = null;
  }
}
