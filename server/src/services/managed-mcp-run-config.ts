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
