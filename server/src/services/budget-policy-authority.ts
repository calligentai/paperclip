import { forbidden, badRequest } from "../errors.js";

/**
 * Who may write a budget policy, and on what terms.
 *
 * The board may budget anything. An agent may budget exactly one thing: the
 * monthly spend of a *project it leads*. It may never write agent or company
 * scope, because a policy on its own agent record is its own spending cap —
 * an agent that can raise its own cap has no cap.
 *
 * Kept pure so the gate can be tested without a database.
 */
export type PolicyWriteRequest = {
  scopeType: "company" | "agent" | "project";
  scopeId: string;
  amount: number;
  hardStopEnabled?: boolean;
};

export type PolicyWriteAuthority =
  | { ok: true; actorId: string; agentIssued: boolean; amount: number; hardStopEnabled: boolean }
  | { ok: false; kind: "forbidden" | "invalid"; reason: string };

export function resolvePolicyWriteAuthority(input: {
  actorType: "board" | "agent" | "user";
  actorUserId?: string | null;
  actorAgentId?: string | null;
  body: PolicyWriteRequest;
  projectLeadAgentId?: string | null;
  projectFound: boolean;
  companyBudgetCents: number;
  companyCommittedCents: number;
}): PolicyWriteAuthority {
  const { actorType, body } = input;

  if (actorType === "board") {
    return {
      ok: true,
      actorId: input.actorUserId ?? "board",
      agentIssued: false,
      amount: body.amount,
      hardStopEnabled: body.hardStopEnabled ?? true,
    };
  }

  if (actorType !== "agent" || !input.actorAgentId) {
    return { ok: false, kind: "forbidden", reason: "Board access required" };
  }

  if (body.scopeType !== "project") {
    return {
      ok: false,
      kind: "forbidden",
      reason: "An agent may only budget a project it leads, never an agent or company scope",
    };
  }
  if (!input.projectFound) {
    return { ok: false, kind: "invalid", reason: "Unknown project" };
  }
  if (!input.projectLeadAgentId || input.projectLeadAgentId !== input.actorAgentId) {
    return { ok: false, kind: "forbidden", reason: "Only the project lead agent may set this project's budget" };
  }
  const remaining = input.companyBudgetCents - input.companyCommittedCents;
  if (remaining <= 0) {
    return { ok: false, kind: "invalid", reason: "Company budget is already fully committed" };
  }
  if (!Number.isFinite(body.amount) || body.amount <= 0) {
    return { ok: false, kind: "invalid", reason: "A project budget must be a positive amount" };
  }
  if (body.amount > remaining) {
    return {
      ok: false,
      kind: "invalid",
      reason: `Project budget ${body.amount}c exceeds the company's remaining ${remaining}c`,
    };
  }

  return {
    ok: true,
    actorId: input.actorAgentId,
    agentIssued: true,
    amount: body.amount,
    // An agent-created policy always stops work; it may not be advisory.
    hardStopEnabled: true,
  };
}

export function throwIfPolicyWriteDenied(authority: PolicyWriteAuthority): asserts authority is Extract<PolicyWriteAuthority, { ok: true }> {
  if (authority.ok) return;
  if (authority.kind === "forbidden") throw forbidden(authority.reason);
  throw badRequest(authority.reason);
}
