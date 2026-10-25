import { describe, expect, it } from "vitest";
import { resolvePolicyWriteAuthority } from "../services/budget-policy-authority.js";

const project = {
  scopeType: "project" as const,
  scopeId: "project-1",
  amount: 800,
};

function decide(overrides: Partial<Parameters<typeof resolvePolicyWriteAuthority>[0]> = {}) {
  return resolvePolicyWriteAuthority({
    actorType: "agent",
    actorAgentId: "orchestrator-1",
    body: project,
    projectFound: true,
    projectLeadAgentId: "orchestrator-1",
    companyBudgetCents: 5000,
    companyCommittedCents: 200,
    ...overrides,
  });
}

describe("budget policy write authority", () => {
  it("lets the board write any scope", () => {
    const result = resolvePolicyWriteAuthority({
      actorType: "board",
      actorUserId: "board",
      actorAgentId: null,
      body: { scopeType: "company", scopeId: "company-1", amount: 5000 },
      projectFound: false,
      companyBudgetCents: 5000,
      companyCommittedCents: 0,
    });
    expect(result.ok).toBe(true);
  });

  it("lets the project lead budget its own project", () => {
    const result = decide();
    expect(result).toMatchObject({ ok: true, agentIssued: true, amount: 800, hardStopEnabled: true });
  });

  it("refuses an agent budgeting its own agent scope", () => {
    expect(decide({ body: { scopeType: "agent", scopeId: "orchestrator-1", amount: 100000 } }))
      .toMatchObject({ ok: false });
  });

  it("refuses an agent budgeting the company scope", () => {
    expect(decide({ body: { scopeType: "company", scopeId: "company-1", amount: 100000 } }))
      .toMatchObject({ ok: false });
  });

  it("refuses a non-lead agent", () => {
    expect(decide({ actorAgentId: "other-agent" })).toMatchObject({ ok: false });
  });

  it("refuses an unknown project", () => {
    expect(decide({ projectFound: false, projectLeadAgentId: null })).toMatchObject({ ok: false });
  });

  it("refuses a budget larger than the company's remaining headroom", () => {
    expect(decide({ body: { ...project, amount: 4900 } })).toMatchObject({ ok: false });
    expect(decide({ body: { ...project, amount: 4800 } })).toMatchObject({ ok: true });
  });

  it("refuses a zero or non-finite amount", () => {
    expect(decide({ body: { ...project, amount: 0 } })).toMatchObject({ ok: false });
    expect(decide({ body: { ...project, amount: Number.NaN } })).toMatchObject({ ok: false });
  });

  it("cannot be talked into an advisory policy by an agent", () => {
    const result = decide({ body: { ...project, hardStopEnabled: false } });
    expect(result).toMatchObject({ ok: true, hardStopEnabled: true });
  });
});
