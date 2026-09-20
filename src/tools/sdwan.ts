import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getCredentials, getSdWanConfig, getSdWanConfigStatus, listSdWanConfigs } from '../client.js';
import type { CallToolResult } from './types.js';
import { errorResult, requireCredentials, textResult } from './shared.js';

// unifi_get_sdwan_config and unifi_get_sdwan_config_status return network
// topology (hub/spoke routes, CIDR subnets, WAN IPs) - admin-gated by
// default per this connector's sensitivity policy - see result-cache.ts's
// VENDOR_TOOL_CONFIG entry and tool-naming-exceptions.ts for the
// naming-guard exception this requires. unifi_list_sdwan_configs returns
// only id/name/type and stays read-tier.
export const SDWAN_TOOLS: Tool[] = [
  {
    name: 'unifi_list_sdwan_configs',
    description: "List every SD-WAN configuration associated with this API key's account (id, name, type only).",
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'unifi_get_sdwan_config',
    description:
      'Get the full topology for one SD-WAN configuration: variant, advanced settings, and every hub/spoke including their site/host IDs, attached network IDs, and routed subnets (CIDR). Network-topology data - admin-gated.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'SD-WAN config ID (as returned by unifi_list_sdwan_configs).' },
      },
      required: ['id'],
    },
  },
  {
    name: 'unifi_get_sdwan_config_status',
    description:
      'Get deployment status for one SD-WAN configuration: generation/apply status, and per-hub/spoke details including WAN IPs, latency, routes, and any errors or warnings. Network-topology data - admin-gated.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'SD-WAN config ID (as returned by unifi_list_sdwan_configs).' },
      },
      required: ['id'],
    },
  },
];

const TOOL_NAMES = new Set(SDWAN_TOOLS.map((t) => t.name));
export function isSdWanTool(name: string): boolean {
  return TOOL_NAMES.has(name);
}

export async function handleSdWanTool(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
  const creds = getCredentials();
  const missing = requireCredentials(creds);
  if (missing) return missing;

  try {
    if (name === 'unifi_list_sdwan_configs') {
      return textResult(await listSdWanConfigs(creds!));
    }

    if (name === 'unifi_get_sdwan_config') {
      return textResult(await getSdWanConfig(creds!, args.id as string));
    }

    if (name === 'unifi_get_sdwan_config_status') {
      return textResult(await getSdWanConfigStatus(creds!, args.id as string));
    }

    return errorResult(`Unknown tool: ${name}`);
  } catch (err) {
    return errorResult((err as Error).message);
  }
}
