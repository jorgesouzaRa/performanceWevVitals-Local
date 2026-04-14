/**
 * Executa só o fluxo de login e grava o storage state (útil antes de `npm run audit`).
 * Requer `browserAuth.login` em config/urls.json e AUDIT_LOGIN_EMAIL / AUDIT_LOGIN_PASSWORD no .env.
 */
import { config as loadEnv } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: join(__dirname, "..", ".env") });

import { isAnalysisModePagespeedApiOnly, loadConfig } from "../src/config.js";
import { ensureBrowserAuthState } from "../src/browser-auth.js";

async function main() {
  const cfg = loadConfig();
  if (isAnalysisModePagespeedApiOnly(cfg)) {
    console.error("Este script só faz sentido no modo legacy (sem pagespeed_api_only).");
    process.exit(1);
  }
  if (!cfg.browserAuth?.login) {
    console.error(
      'Defina "browserAuth": { "login": { "url", "emailSelector", ... } } em config/urls.json'
    );
    process.exit(1);
  }
  await ensureBrowserAuthState(cfg, { forceLogin: true });
  console.log("Concluído. Pode correr npm run audit.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
