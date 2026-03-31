/**
 * Verifica se PAGESPEED_API_KEY responde em mobile e desktop (CrUX via PSI API v5).
 * Uso: npm run test:pagespeed-key
 *
 * - Uma URL: TEST_URL=https://... npm run test:pagespeed-key
 * - Várias (substitui o conjunto predefinido): TEST_URLS="https://a/,https://b/" npm run test:pagespeed-key
 */
import "dotenv/config";

import { fetchBothStrategies } from "../src/pagespeed-field.js";

const DEFAULT_TEST_URLS = [
  "https://www.reclameaqui.com.br/",
  "https://www.reclameaqui.com.br/fatal-model/reativacao-de-site-banido-apos-um-ano_5uc1u1gjFd2AK0D0/",
  "https://www.reclameaqui.com.br/detector-site-confiavel/",
] as const;

const key = process.env.PAGESPEED_API_KEY?.trim();

function resolveUrls(): string[] {
  const single = process.env.TEST_URL?.trim();
  if (single) return [single.replace(/\/$/, "") || single];

  const multi = process.env.TEST_URLS?.trim();
  if (multi) {
    return multi
      .split(/[,\n]+/)
      .map((u) => u.trim().replace(/\/$/, ""))
      .filter(Boolean);
  }

  return [...DEFAULT_TEST_URLS].map((u) => u.replace(/\/$/, ""));
}

function line(strategy: string, ok: boolean, detail: string): void {
  const tag = ok ? "OK" : "FALHA";
  console.log(`  [${tag}] ${strategy}: ${detail}`);
}

async function main(): Promise<void> {
  if (!key) {
    console.error("Defina PAGESPEED_API_KEY no .env ou no ambiente.");
    process.exit(1);
  }

  const urls = resolveUrls();
  console.log(`${urls.length} URL(s) de teste`);
  console.log("(chave não é impressa)\n");

  let exit = 0;

  for (const url of urls) {
    console.log(`— ${url}`);
    const { mobile, desktop } = await fetchBothStrategies(url, key);

    if (mobile.ok) {
      const d = mobile.data;
      line(
        "mobile",
        true,
        `CrUX LCP=${d.lcpMs}ms INP=${d.inpMs}ms CLS=${d.cls} categoria=${d.overallCategory ?? "—"}`,
      );
    } else {
      line("mobile", false, mobile.error);
      exit = 1;
    }

    if (desktop.ok) {
      const d = desktop.data;
      line(
        "desktop",
        true,
        `CrUX LCP=${d.lcpMs}ms INP=${d.inpMs}ms CLS=${d.cls} categoria=${d.overallCategory ?? "—"}`,
      );
    } else {
      line("desktop", false, desktop.error);
      exit = 1;
    }

    console.log();
  }

  process.exit(exit);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
