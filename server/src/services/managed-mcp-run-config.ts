export type ManagedMcpGatewayRunConfig = {
  version: 1;
  managedMcpOnly: boolean;
  gateways: Array<{
    id: string;
    name: string;
    endpointPath: string;
    bearerToken: string;
    tokenPrefix?: string;
  }>;
};

/**
 * Add project tools to the run's managed MCP config when the run is issue-bound,
 * the adapter supports it, managed MCP is enabled, and both a run token and API
 * base are present. The API base is only checked for presence here.
 *
 * Returns the existing config unchanged when those conditions are not met or a
 * project-tools gateway already exists; otherwise returns a new config preserving
 * existing gateways, or creates one if needed.
 */
export function includePaperclipProjectToolsGateway(input: {
  existing: ManagedMcpGatewayRunConfig | null;
  authToken: string | null;
  apiBaseUrl: string | null;
  issueBound: boolean;
  adapterSupported: boolean;
  enabled: boolean;
}): ManagedMcpGatewayRunConfig | null {
  if (
    !input.authToken ||
    !input.apiBaseUrl ||
    !input.issueBound ||
    !input.adapterSupported ||
    !input.enabled
  ) {
    return input.existing;
  }

  const gateways = input.existing?.gateways ?? [];
  if (gateways.some((gateway) => gateway.id === "paperclip-project-tools")) {
    return input.existing;
  }

  return {
    version: 1,
    managedMcpOnly: true,
    gateways: [
      ...gateways,
      {
        id: "paperclip-project-tools",
        name: "Paperclip projects",
        endpointPath: "/api/mcp/project-tools",
        bearerToken: input.authToken,
      },
    ],
  };
}
