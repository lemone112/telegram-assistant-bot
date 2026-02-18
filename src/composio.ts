type Env = {
  COMPOSIO_API_KEY: string;
};

export type ComposioToolExecuteRequest = {
  tool_slug: string;
  arguments: Record<string, any>;
  // optional routing to the right connection (implementation dependent)
  connected_account_id?: string;
};

export async function composioExecute(env: Env, req: ComposioToolExecuteRequest) {
  // NOTE:
  // This is a minimal wrapper. The exact Composio HTTP endpoint may differ depending on your Composio deployment.
  // We keep this isolated so we can adjust without touching business logic.
  //
  // Expected behavior:
  // - POST to Composio "execute" endpoint with tool_slug + arguments
  // - returns JSON with { successful, data, error }

  const endpoint = "https://backend.composio.dev/api/v2/actions/execute";

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.COMPOSIO_API_KEY}`,
    },
    body: JSON.stringify({
      action: req.tool_slug,
      params: req.arguments,
      connected_account_id: req.connected_account_id,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Composio HTTP ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}
