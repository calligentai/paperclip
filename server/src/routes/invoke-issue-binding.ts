/**
 * Issue binding for the legacy on-demand wake route.
 *
 * `POST /agents/:id/heartbeat/invoke` builds its own `wakeOpts` instead of going
 * through `validate(wakeAgentSchema)`, so it used to drop `body.issueId`
 * entirely: every wake through it created a run with `issueId: null`, which the
 * agent contract then asks the agent to comment on and transition — impossible,
 * because an unbound run has no writable issue (BUS-64 / BUS-69 / BUS-70).
 *
 * Absent / empty stays issue-less (behavior unchanged), a UUID in the agent's
 * company binds the run, anything else is rejected before a run is created.
 */
import { isUuidLike } from "@paperclipai/shared";

export type InvokeIssueScope = {
  companyId: string;
  /** Set for agent callers: they may only bind an issue assigned to themselves. */
  restrictToAssigneeAgentId?: string | null;
};

export type InvokeIssueBindingResult =
  | { ok: true; issueId: string | null }
  | { ok: false; error: string };

export type InvokeIssueLookup = (
  issueId: string,
  scope: InvokeIssueScope,
) => Promise<{ id: string } | null>;

export async function resolveInvokeIssueBinding(
  rawIssueId: unknown,
  scope: InvokeIssueScope,
  lookup: InvokeIssueLookup,
): Promise<InvokeIssueBindingResult> {
  if (rawIssueId === undefined || rawIssueId === null) {
    return { ok: true, issueId: null };
  }
  if (typeof rawIssueId !== "string") {
    return { ok: false, error: "issueId must be a string" };
  }
  const issueId = rawIssueId.trim();
  if (!issueId) {
    return { ok: true, issueId: null };
  }
  // A uuid column rejects non-UUID text with Postgres 22P02; return 400 instead.
  if (!isUuidLike(issueId)) {
    return { ok: false, error: "issueId must be a UUID" };
  }
  const issue = await lookup(issueId, scope);
  if (!issue) {
    return { ok: false, error: "issueId must name an issue in this agent's company" };
  }
  return { ok: true, issueId: issue.id };
}
