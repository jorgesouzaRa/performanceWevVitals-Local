import { AxeBuilder } from "@axe-core/playwright";
import type { Page } from "playwright";
import type { Result, IncompleteResult } from "axe-core";

export type AxeViolationSummary = {
  id: string;
  impact: string | null;
  description: string;
  help: string;
  helpUrl: string;
  nodes: number;
  wcagTags: string[];
};

export type AxeAuditResult = {
  ok: boolean;
  error?: string;
  violations: AxeViolationSummary[];
  incomplete: { id: string; help: string }[];
};

export async function runAxeOnPage(page: Page): Promise<AxeAuditResult> {
  try {
    const raw = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    const violations: AxeViolationSummary[] = raw.violations.map((v: Result) => ({
      id: v.id,
      impact: v.impact ?? null,
      description: v.description,
      help: v.help,
      helpUrl: v.helpUrl,
      nodes: v.nodes?.length ?? 0,
      wcagTags: (v.tags ?? []).filter((t: string) => t.startsWith("wcag")),
    }));
    const incomplete = (raw.incomplete ?? []).map((i: IncompleteResult) => ({
      id: i.id,
      help: i.help,
    }));
    return { ok: true, violations, incomplete };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg, violations: [], incomplete: [] };
  }
}
