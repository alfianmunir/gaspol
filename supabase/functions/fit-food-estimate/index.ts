// Edge Function: fit-food-estimate  (PRD F5 — AI food-photo estimate)
// POST { image: base64, mediaType?: "image/jpeg" }  ->  honest kcal/protein
// ranges the user confirms. Premium-gated. Deploy with verify_jwt = true so
// only signed-in users reach it; we then check the premium flag.
//
//   supabase functions deploy fit-food-estimate
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//
import { corsHeaders, json } from "../_shared/cors.ts";
import { userClient } from "../_shared/supabaseAdmin.ts";
import { claude, extractJson, MODELS } from "../_shared/claude.ts";

interface Estimate {
  dish: string;
  portionLabel: string;
  kcal: number; kcalLow: number; kcalHigh: number;
  protein: number; proteinLow: number; proteinHigh: number;
  confidence: number; // 0..1
}

const SYSTEM = `You are Gaspol's food-estimation coach for an Indonesia-first fitness app.
Estimate the dish, portion, calories and protein from a meal photo. Indonesian foods
(nasi, tempe, dada ayam, gorengan, warteg portions) are common. ALWAYS return ranges,
never false precision. Respond with ONLY a JSON object:
{"dish","portionLabel","kcal","kcalLow","kcalHigh","protein","proteinLow","proteinHigh","confidence"}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  try {
    // --- Auth + premium gate -------------------------------------------
    const auth = req.headers.get("Authorization");
    const sb = userClient(auth);
    const { data: userRes } = await sb.auth.getUser();
    if (!userRes?.user) return json({ error: "Not signed in" }, 401);

    const { data: profileRow } = await sb.from("fit_settings").select("value").eq("key", "profile").maybeSingle();
    const premium = Boolean((profileRow?.value as { premium?: boolean } | null)?.premium);
    if (!premium) return json({ error: "AI food photo is a premium feature", upgrade: true }, 402);

    // --- Input ----------------------------------------------------------
    const { image, mediaType = "image/jpeg" } = await req.json();
    if (!image) return json({ error: "Missing image (base64)" }, 400);

    // --- Estimate -------------------------------------------------------
    const reply = await claude({
      model: MODELS.vision,
      system: SYSTEM,
      maxTokens: 400,
      content: [
        { type: "image", source: { type: "base64", media_type: mediaType, data: image } },
        { type: "text", text: "Estimate this meal. JSON only." },
      ],
    });

    const est = extractJson<Estimate>(reply);
    // Label as an estimate — the client must show ranges + a confirm step.
    return json({ ...est, estimate: true, model: MODELS.vision });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
