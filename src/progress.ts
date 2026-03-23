/** Spinner + % + passos (done/total) + tempo na fase atual (stderr). */

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export class AuditProgressReporter {
  private frame = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private done = 0;
  private total = 1;
  private label = "";
  private phaseStartedAt = 0;

  start(totalSteps: number) {
    this.total = Math.max(1, totalSteps);
    this.done = 0;
    this.label = "Iniciando…";
    this.phaseStartedAt = Date.now();
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => this.paint(), 90);
    this.paint();
  }

  setPhase(label: string) {
    this.label = label.length > 72 ? `${label.slice(0, 69)}…` : label;
    this.phaseStartedAt = Date.now();
    this.paint();
  }

  /** Chamar ao concluir uma fase (Playwright, Lighthouse mobile, etc.). */
  completeStep() {
    this.done = Math.min(this.total, this.done + 1);
    this.paint();
  }

  private paint() {
    const spin = FRAMES[this.frame++ % FRAMES.length];
    const pct = Math.round((this.done / this.total) * 100);
    const elapsed = Math.floor((Date.now() - this.phaseStartedAt) / 1000);
    const timeHint = elapsed > 0 ? ` · ${elapsed}s nesta etapa` : "";
    const line = `${spin} ${pct}% (${this.done}/${this.total}) ${this.label}${timeHint}`;
    process.stderr.write(`\r\x1b[2K${line}`);
  }

  finish(finalLabel?: string) {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.done = this.total;
    if (finalLabel) this.label = finalLabel;
    this.paint();
    process.stderr.write("\n");
  }

  fail(message: string) {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    process.stderr.write(`\n\x1b[31m✖ ${message}\x1b[0m\n`);
  }
}

export function countAuditSteps(
  urlCount: number,
  runMobile: boolean,
  runDesktop: boolean,
  includeCruxField: boolean
): number {
  const perUrl =
    (includeCruxField ? 1 : 0) +
    1 +
    (runMobile ? 1 : 0) +
    (runDesktop ? 1 : 0);
  return urlCount * perUrl;
}
