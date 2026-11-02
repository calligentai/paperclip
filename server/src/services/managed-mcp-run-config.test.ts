import { describe, expect, it } from "vitest";
import {
  includePaperclipProjectToolsGateway,
  type ManagedMcpGatewayRunConfig,
} from "./managed-mcp-run-config.js";

const existing: ManagedMcpGatewayRunConfig = {
  version: 1,
  managedMcpOnly: true,
  gateways: [
    {
      id: "design-tool",
      name: "Design tool",
      endpointPath: "/mcp/gateways/gw_design",
      bearerToken: "gateway-token",
      tokenPrefix: "pcgw",
    },
  ],
};

const eligibleInput = {
  existing,
  authToken: "issue-bound-agent-token",
  apiBaseUrl: "http://127.0.0.1:3110",
  issueBound: true,
  adapterSupported: true,
  enabled: true,
};

describe("includePaperclipProjectToolsGateway", () => {
  it("adds the issue-bound project-tools endpoint and preserves configured gateways", () => {
    expect(includePaperclipProjectToolsGateway(eligibleInput)).toEqual({
      version: 1,
      managedMcpOnly: true,
      gateways: [
        ...existing.gateways,
        {
          id: "paperclip-project-tools",
          name: "Paperclip projects",
          endpointPath: "/api/mcp/project-tools",
          bearerToken: "issue-bound-agent-token",
        },
      ],
    });
  });

  it.each([
    ["missing run token", { authToken: null }],
    ["missing API base", { apiBaseUrl: null }],
    ["unbound run", { issueBound: false }],
    ["unsupported adapter", { adapterSupported: false }],
    ["MCP opt-out", { enabled: false }],
  ])("does not add project tools for %s", (_name, overrides) => {
    expect(
      includePaperclipProjectToolsGateway({ ...eligibleInput, ...overrides }),
    ).toBe(existing);
  });

  it("does not duplicate the project-tools gateway", () => {
    const configured = {
      ...existing,
      gateways: [
        ...existing.gateways,
        {
          id: "paperclip-project-tools",
          name: "Paperclip projects",
          endpointPath: "/api/mcp/project-tools",
          bearerToken: "existing-run-token",
        },
      ],
    };
    expect(
      includePaperclipProjectToolsGateway({ ...eligibleInput, existing: configured }),
    ).toBe(configured);
  });

  it("creates a managed config when project tools are the only managed endpoint", () => {
    expect(
      includePaperclipProjectToolsGateway({ ...eligibleInput, existing: null }),
    ).toEqual({
      version: 1,
      managedMcpOnly: true,
      gateways: [
        {
          id: "paperclip-project-tools",
          name: "Paperclip projects",
          endpointPath: "/api/mcp/project-tools",
          bearerToken: "issue-bound-agent-token",
        },
      ],
    });
  });
});
