import { spawn } from "node:child_process";
import { platform } from "node:os";

/**
 * Abre o ficheiro HTML no browser por defeito (xdg-open / open / start).
 * Defina SKIP_OPEN_HTML=1 ou CI=true para desativar.
 */
export function openHtmlReport(absolutePath: string): void {
  if (process.env.SKIP_OPEN_HTML === "1" || process.env.CI === "true") {
    return;
  }
  const p = platform();
  try {
    if (p === "darwin") {
      spawn("open", [absolutePath], { detached: true, stdio: "ignore" }).unref();
    } else if (p === "win32") {
      spawn("cmd", ["/c", "start", "", absolutePath], { detached: true, stdio: "ignore" }).unref();
    } else {
      spawn("xdg-open", [absolutePath], { detached: true, stdio: "ignore" }).unref();
    }
  } catch {
    /* ignorar se não houver GUI */
  }
}
