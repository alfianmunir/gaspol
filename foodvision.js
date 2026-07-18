/* ============================================================
   Gaspol — embedded food vision (F5, no external API)

   Runs a general-purpose image classifier fully on-device via
   TensorFlow.js + MobileNet (lazy-loaded, then cached by the browser /
   service worker so it works offline after first use). There is NO API
   key and NO server round-trip: the photo never leaves the phone.

   Honesty (PRD §5): a generic model recognises common foods well but
   cannot reliably name Indonesian composite plates. So we always return
   a *range* + a confidence, and the UI makes the user confirm or pick
   from their library. classify() degrades gracefully — if the model
   can't load (offline first-run / blocked CDN), callers fall back to the
   manual quick-pick flow.
   ============================================================ */

const TFJS = 'https://esm.sh/@tensorflow/tfjs@4.22.0';
const MOBILENET = 'https://esm.sh/@tensorflow-models/mobilenet@2.1.1';

let _model = null;      // cached MobileNet
let _loading = null;    // in-flight load promise (dedupe)

/** Lazy-load MobileNet once. Resolves to the model or null on failure. */
export async function loadModel() {
  if (_model) return _model;
  if (_loading) return _loading;
  _loading = (async () => {
    try {
      const [tf, mobilenet] = await Promise.all([import(TFJS), import(MOBILENET)]);
      await tf.ready();
      _model = await mobilenet.load({ version: 2, alpha: 1.0 });
      return _model;
    } catch (e) {
      console.warn('[foodvision] model load failed — manual entry only.', e);
      _model = null;
      return null;
    } finally {
      _loading = null;
    }
  })();
  return _loading;
}

/**
 * Downscale + JPEG-compress a captured photo on a canvas. Keeps it
 * recognisable (long edge ~640px) while shrinking bytes ~10-20x so it is
 * cheap to classify, cache, or optionally store.
 * @returns {Promise<{dataUrl:string, width:number, height:number, bytes:number, img:HTMLImageElement}>}
 */
export async function compressImage(fileOrDataUrl, maxEdge = 640, quality = 0.72) {
  const src = typeof fileOrDataUrl === 'string' ? fileOrDataUrl : await readAsDataUrl(fileOrDataUrl);
  const img = await loadImg(src);
  const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d').drawImage(img, 0, 0, w, h);
  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  const outImg = await loadImg(dataUrl); // decoded, ready for the model
  return { dataUrl, width: w, height: h, bytes: Math.round((dataUrl.length - 23) * 0.75), img: outImg };
}

/**
 * Classify a decoded <img> and map it to a nutrition estimate.
 * @returns {Promise<{dish, kcal, protein, kcalLow, kcalHigh, proteinLow, proteinHigh, confidence, matched, raw}>}
 */
export async function estimate(imgEl) {
  const model = await loadModel();
  if (!model) return null; // caller shows the manual picker
  let preds = [];
  try { preds = await model.classify(imgEl, 5); } catch (e) { console.warn('[foodvision] classify failed', e); return null; }
  const top = preds[0] || { className: '', probability: 0 };
  const hit = matchFood(preds);
  const conf = Math.round((hit ? Math.min(0.95, hit.prob) : top.probability) * 100);
  const base = hit ? hit.food : GENERIC;
  return {
    dish: hit ? hit.food.name : humanize(top.className),
    matched: !!hit,
    confidence: conf,
    kcal: base.kcal, protein: base.protein,
    kcalLow: Math.round(base.kcal * 0.85 / 10) * 10, kcalHigh: Math.round(base.kcal * 1.15 / 10) * 10,
    proteinLow: Math.round(base.protein * 0.85), proteinHigh: Math.round(base.protein * 1.15),
    raw: preds.map((p) => `${humanize(p.className)} ${Math.round(p.probability * 100)}%`),
  };
}

/* ---------- Class → food macro mapping ------------------------------
   Per typical single serving. MobileNet (ImageNet) label substrings →
   rough macros. Indonesian composites usually land on a generic class,
   so GENERIC is the honest default the user then adjusts. */
const GENERIC = { name: 'Mixed meal · nasi + lauk', kcal: 620, protein: 34 };
const TABLE = [
  { k: ['fried chicken', 'drumstick', 'rotisserie'], f: { name: 'Ayam goreng · fried chicken', kcal: 300, protein: 28 } },
  { k: ['plate', 'hotpot', 'hot pot', 'meat loaf', 'meatloaf', 'consomme', 'soup bowl'], f: GENERIC },
  { k: ['rice', 'risotto'], f: { name: 'Nasi · rice', kcal: 260, protein: 5 } },
  { k: ['banana'], f: { name: 'Pisang · banana', kcal: 105, protein: 1 } },
  { k: ['orange', 'lemon', 'granny smith', 'fig', 'pineapple', 'strawberry'], f: { name: 'Buah · fruit', kcal: 90, protein: 1 } },
  { k: ['egg', 'omelette', 'omelet'], f: { name: 'Telur · egg', kcal: 155, protein: 13 } },
  { k: ['cheeseburger', 'hamburger', 'hotdog', 'hot dog'], f: { name: 'Burger / hotdog', kcal: 500, protein: 25 } },
  { k: ['pizza'], f: { name: 'Pizza (slice)', kcal: 285, protein: 12 } },
  { k: ['bagel', 'pretzel', 'french loaf', 'dough'], f: { name: 'Roti · bread', kcal: 250, protein: 8 } },
  { k: ['burrito', 'guacamole', 'taco'], f: { name: 'Burrito / wrap', kcal: 450, protein: 20 } },
  { k: ['mashed potato', 'potato', 'french fries', 'chips'], f: { name: 'Kentang · potato', kcal: 320, protein: 6 } },
  { k: ['ice cream', 'ice lolly', 'trifle', 'chocolate'], f: { name: 'Dessert', kcal: 300, protein: 4 } },
  { k: ['espresso', 'cup', 'coffee', 'eggnog'], f: { name: 'Minuman · drink', kcal: 120, protein: 3 } },
  { k: ['broccoli', 'cauliflower', 'cabbage', 'cucumber', 'cardoon', 'artichoke'], f: { name: 'Sayur · veg', kcal: 60, protein: 3 } },
  { k: ['carbonara', 'spaghetti', 'noodle'], f: { name: 'Mie / pasta', kcal: 400, protein: 14 } },
];

function matchFood(preds) {
  for (const p of preds) {
    const name = (p.className || '').toLowerCase();
    for (const row of TABLE) {
      if (row.k.some((kw) => name.includes(kw))) return { food: row.f, prob: p.probability };
    }
  }
  return null;
}
function humanize(cls) {
  const first = String(cls || '').split(',')[0].trim();
  return first ? first.charAt(0).toUpperCase() + first.slice(1) : 'Unknown';
}

/* ---------- small DOM helpers ---------------------------------------- */
function readAsDataUrl(file) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
}
function loadImg(src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
}

export default { loadModel, compressImage, estimate };
