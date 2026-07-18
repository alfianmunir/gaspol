// Minimal Claude (Anthropic Messages API) helper for Edge Functions.
// Key stays server-side in ANTHROPIC_API_KEY — never ship it to the browser.
//
// Model choice (cost control per PRD §8/§10):
//   - weekly review  → a capable text model (default here: claude-sonnet-5)
//   - food photo     → a vision-capable model (claude-sonnet-5); swap to
//                      claude-haiku-4-5-20251001 to cut per-estimate cost.
const API = "https://api.anthropic.com/v1/messages";
const VERSION = "2023-06-01";

export const MODELS = {
  review: Deno.env.get("GASPOL_REVIEW_MODEL") ?? "claude-sonnet-5",
  vision: Deno.env.get("GASPOL_VISION_MODEL") ?? "claude-sonnet-5",
};

type Block =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } };

export async function claude(opts: {
  model: string;
  system?: string;
  content: string | Block[];
  maxTokens?: number;
}): Promise<string> {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) throw new Error("Missing ANTHROPIC_API_KEY");

  const res = await fetch(API, {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": VERSION,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: opts.maxTokens ?? 1024,
      system: opts.system,
      messages: [{ role: "user", content: opts.content }],
    }),
  });

  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return (data.content ?? []).filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("");
}

/** Parse the first JSON object out of a model reply (tolerates prose/fences). */
export function extractJson<T>(text: string): T {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("No JSON found in model reply");
  return JSON.parse(m[0]) as T;
}
