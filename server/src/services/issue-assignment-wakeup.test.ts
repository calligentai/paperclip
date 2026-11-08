import { describe, expect, it, vi } from "vitest";
vi.mock("../middleware/logger.js", () => ({ logger: { warn: vi.fn() } }));

import { queueIssueAssignmentWakeup } from "./issue-assignment-wakeup.js";

const setup = (status: string) => {
  const wakeup = vi.fn().mockResolvedValue(undefined);
  return {
    wakeup,
    input: {
      heartbeat: { wakeup },
      issue: { id: "issue-1", assigneeAgentId: "agent-1", status },
      reason: "issue_assigned",
      mutation: "assignment",
      contextSource: "issue_assignment",
    },
  };
};

describe("queueIssueAssignmentWakeup", () => {
  it("does not wake an assignee while the issue is blocked", async () => {
    const { input, wakeup } = setup("blocked");

    await queueIssueAssignmentWakeup(input);

    expect(wakeup).not.toHaveBeenCalled();
  });

  it("still wakes an assignee for a ready issue", async () => {
    const { input, wakeup } = setup("todo");

    await queueIssueAssignmentWakeup(input);

    expect(wakeup).toHaveBeenCalledOnce();
    expect(wakeup).toHaveBeenCalledWith(
      "agent-1",
      expect.objectContaining({
        source: "assignment",
        reason: "issue_assigned",
        payload: expect.objectContaining({ issueId: "issue-1" }),
      }),
    );
  });
});
