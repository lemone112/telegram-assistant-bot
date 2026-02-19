import { getConfig } from "./config";

type ComposioExecuteRequest = {
  tool_slug: string;
  arguments: Record<string, unknown>;
  connected_account_id?: string;
};

export async function composioExecute(req: ComposioExecuteRequest): Promise<unknown> {
  const config = getConfig();
  const base = "https://backend.composio.dev";
  const url = `${base}/api/v2/actions/execute`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.COMPOSIO_API_KEY}`,
    },
    body: JSON.stringify({
      action: req.tool_slug,
      input: req.arguments,
      connectedAccountId: req.connected_account_id,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Composio execute failed: ${res.status} ${JSON.stringify(data)}`);
  }
  return data;
}
