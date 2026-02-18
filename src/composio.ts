type ComposioExecuteRequest = {
  tool_slug: string;
  arguments: Record<string, unknown>;
  connected_account_id?: string;
};

type Env = {
  COMPOSIO_API_KEY: string;
  COMPOSIO_BASE_URL?: string;
};

export async function composioExecute(env: Env, req: ComposioExecuteRequest): Promise<any> {
  const base = (env.COMPOSIO_BASE_URL ?? "https://backend.composio.dev").replace(/\/$/, "");
  const url = `${base}/api/v2/actions/execute`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.COMPOSIO_API_KEY}`,
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
