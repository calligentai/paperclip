/**
 * A clean exit is success: hermes writes harmless warnings to stderr (e.g.
 * "Failed to load bundled provider plugin solstice"), and the old stderr
 * pattern scan turned those into run failures on runs that exited 0.
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("@paperclipai/adapter-utils/server-utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@paperclipai/adapter-utils/server-utils")>();
  return {
    ...actual,
    runChildProcess: vi.fn(async () => ({
      exitCode: 0,
      signal: null,
      timedOut: false,
      stdout: "All done.\n\n[hermes] Exit code: 0, timedOut: false\n",
      stderr: "Failed to load bundled provider plugin solstice: No module named 'httpx'\n",
    })),
  };
});

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(async () => ""),
  writeFile: vi.fn(async () => undefined),
  mkdir: vi.fn(async () => undefined),
  rm: vi.fn(async () => undefined),
  access: vi.fn(async () => undefined),
  readdir: vi.fn(async () => []),
  stat: vi.fn(async () => ({ isFile: () => true, isDirectory: () => false })),
}));

import { execute } from "./execute.js";

function makeCtx() {
  return {
    runId: "test-run-stderr",
    agent: {
      id: "agent-1",
      companyId: "company-1",
      name: "Hermes",
      adapterType: "hermes_local",
      adapterConfig: {},
    },
    runtime: { sessionId: null, sessionParams: null, sessionDisplayId: null, taskKey: null },
    config: { command: "/usr/bin/hermes", timeoutSec: 60, graceSec: 5 },
    context: { issueId: "issue-1", wakeReason: "manual", paperclipWake: null },
    onLog: async () => undefined,
    onMeta: async () => undefined,
    onSpawn: async () => undefined,
  } as never;
}

describe("hermes-local adapter stderr handling", () => {
  it("does not fail a run that exited 0 because stderr mentions a failure", async () => {
    const result = await execute(makeCtx());
    expect(result.exitCode).toBe(0);
    expect(result.errorMessage).toBeUndefined();
  });
});
