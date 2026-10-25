import { describe, expect, it, vi } from "vitest";
import { resolveInvokeIssueBinding } from "./invoke-issue-binding.js";

/**
 * POST /agents/:id/heartbeat/invoke is the legacy board-wake route. It builds
 * `wakeOpts` by hand, and before this helper it never read `body.issueId`, so
 * every wake through it produced a run with `issueId: null` and no writable
 * issue (BUS-64 / BUS-69 / BUS-70).
 */
describe("resolveInvokeIssueBinding", () => {
  const companyId = "22222222-2222-4222-8222-222222222222";
  const issueId = "44444444-4444-4444-8444-444444444444";

  it("leaves the wake issue-less when the body carries no issueId", async () => {
    const lookup = vi.fn();
    for (const raw of [undefined, null, "", "   "]) {
      await expect(resolveInvokeIssueBinding(raw, { companyId }, lookup)).resolves.toEqual({
        ok: true,
        issueId: null,
      });
    }
    expect(lookup).not.toHaveBeenCalled();
  });

  it("binds the run to an issue that resolves inside the agent's company", async () => {
    const lookup = vi.fn(async () => ({ id: issueId }));
    await expect(resolveInvokeIssueBinding(issueId, { companyId }, lookup)).resolves.toEqual({
      ok: true,
      issueId,
    });
    expect(lookup).toHaveBeenCalledWith(issueId, { companyId });
  });

  it("trims surrounding whitespace before the lookup", async () => {
    const lookup = vi.fn(async (id: string) => ({ id }));
    const result = await resolveInvokeIssueBinding(
      ` ${issueId} `,
      { companyId },
      lookup,
    );
    expect(lookup).toHaveBeenCalledWith(issueId, { companyId });
    expect(result).toEqual({ ok: true, issueId });
  });

  it("rejects an issue that is unknown or belongs to another company", async () => {
    const result = await resolveInvokeIssueBinding(
      "55555555-5555-4555-8555-555555555555",
      { companyId },
      async () => null,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/issueId/);
  });

  it("passes the caller-agent assignee restriction to the lookup", async () => {
    const agentId = "66666666-6666-4666-8666-666666666666";
    const scope = { companyId, restrictToAssigneeAgentId: agentId };
    const lookup = vi.fn(async () => ({ id: issueId }));
    await expect(resolveInvokeIssueBinding(issueId, scope, lookup)).resolves.toEqual({
      ok: true,
      issueId,
    });
    expect(lookup).toHaveBeenCalledWith(issueId, scope);
  });

  it("refuses an issue the calling agent does not own", async () => {
    const agentId = "66666666-6666-4666-8666-666666666666";
    // A lookup honouring restrictToAssigneeAgentId returns null for a foreign card.
    const lookup = vi.fn(async (_id: string, scope: { restrictToAssigneeAgentId?: string | null }) =>
      scope.restrictToAssigneeAgentId ? null : { id: issueId },
    );
    const denied = await resolveInvokeIssueBinding(issueId, { companyId, restrictToAssigneeAgentId: agentId }, lookup);
    expect(denied.ok).toBe(false);
    // The same issue is bindable by the board, which carries no restriction.
    await expect(resolveInvokeIssueBinding(issueId, { companyId }, lookup)).resolves.toEqual({
      ok: true,
      issueId,
    });
  });

  it("rejects non-UUID text before it reaches a uuid column", async () => {
    const lookup = vi.fn();
    for (const raw of ["BUS-70", "garbage"]) {
      const result = await resolveInvokeIssueBinding(raw, { companyId }, lookup);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/UUID/);
    }
    expect(lookup).not.toHaveBeenCalled();
  });

  it("rejects a non-string issueId instead of coercing it", async () => {
    const lookup = vi.fn();
    for (const raw of [42, { id: "x" }, ["x"], true]) {
      const result = await resolveInvokeIssueBinding(raw, { companyId }, lookup);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/issueId/);
    }
    expect(lookup).not.toHaveBeenCalled();
  });
});
