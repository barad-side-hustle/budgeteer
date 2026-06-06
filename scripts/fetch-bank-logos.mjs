/**
 * Download every supported bank / card-company logo and bundle it with the app
 * so the onboarding provider picker renders real logos offline, with no
 * render-time calls to a third-party favicon service.
 *
 * For each provider domain the script tries, in order:
 *   1. the Google S2 favicon (www + apex, 256px then 128px)
 *   2. the site's own /favicon.ico (www + apex)
 * and saves the first valid image to public/bank-logos/<domain>.png. ICO bytes
 * are saved under the .png name; browsers render them in an <img> regardless of
 * extension. Domains that resolve to nothing fall back to the colored letter
 * tile in provider-badge.tsx.
 *
 * Re-run any time (e.g. when a bank changes its logo):
 *   bun scripts/fetch-bank-logos.mjs
 */

import fs from "node:fs/promises";
import path from "node:path";

const OUT_DIR = path.resolve(new URL(".", import.meta.url).pathname, "../public/bank-logos");

// Every provider domain in BANK_PROVIDERS (src/lib/types.ts). Providers that
// share a domain (the FIBI group) share one logo file, which is fine.
const DOMAINS = [
  "isracard.co.il",
  "cal-online.co.il",
  "max.co.il",
  "bankhapoalim.co.il",
  "leumi.co.il",
  "mizrahi-tefahot.co.il",
  "discountbank.co.il",
  "mercantile.co.il",
  "fibi.co.il",
  "bankpagi.co.il",
  "bank-yahav.co.il",
  "bankmassad.co.il",
  "unionbank.co.il",
  "americanexpress.co.il",
  "beyahad-bishvilha.co.il",
  "behatsdaa.org.il",
  "onezerobank.com",
];

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const gfav = (host, sz) => `https://www.google.com/s2/favicons?domain=${host}&sz=${sz}`;

function sourcesFor(domain) {
  return [
    gfav(`www.${domain}`, 256),
    gfav(`www.${domain}`, 128),
    gfav(domain, 256),
    gfav(domain, 128),
    `https://www.${domain}/favicon.ico`,
    `https://${domain}/favicon.ico`,
  ];
}

async function tryFetch(url) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "image/*,*/*;q=0.8" },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "";
    if (!ct.startsWith("image/")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    // Reject Google's tiny "no favicon" placeholder and empty payloads.
    if (buf.length < 150) return null;
    return buf;
  } catch {
    return null;
  }
}

(async () => {
  await fs.mkdir(OUT_DIR, { recursive: true });

  const found = [];
  const missing = [];
  for (const domain of DOMAINS) {
    let saved = false;
    for (const url of sourcesFor(domain)) {
      const buf = await tryFetch(url);
      if (buf) {
        await fs.writeFile(path.join(OUT_DIR, `${domain}.png`), buf);
        const src = url.includes("s2/favicons") ? "favicon" : "site-ico";
        console.log(
          `✓ ${domain.padEnd(24)} ${src.padEnd(8)} ${buf.length.toString().padStart(7)} B`,
        );
        found.push(domain);
        saved = true;
        break;
      }
    }
    if (!saved) {
      missing.push(domain);
      console.log(`✗ ${domain.padEnd(24)} no source returned a usable image (letter tile)`);
    }
  }

  console.log(`\nFetched ${found.length}/${DOMAINS.length} logos into public/bank-logos/.`);
  if (missing.length) {
    console.log(`Letter-tile fallback for: ${missing.join(", ")}`);
  }
})().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
