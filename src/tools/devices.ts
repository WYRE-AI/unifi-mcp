import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getCredentials, listDevices } from '../client.js';
import type { CallToolResult } from './types.js';
import { PAGE_PARAMS_PROPERTIES, errorResult, requireCredentials, textResult } from './shared.js';

// PII-bearing: each device entry carries a MAC address, IP address and
// user-defined hostname/note. Admin-gated by default per this connector's
// sensitivity policy - see result-cache.ts's VENDOR_TOOL_CONFIG entry and
// tool-naming-exceptions.ts for the naming-guard exception this requires.
export const DEVICE_TOOLS: Tool[] = [
  {
    name: 'unifi_list_devices',
    description:
      'List UniFi devices managed by hosts this API key\'s account owns or super-admins, grouped by host. Each device includes its MAC address, IP address, model, firmware status, and adoption/uptime info. PII-bearing (device MAC/hostname/IP) - admin-gated.',
    inputSchema: {
      type: 'object',
      properties: {
        hostIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Restrict results to devices managed by these host IDs.',
        },
        time: { type: 'string', description: 'Only return devices last processed at or after this RFC3339 timestamp.' },
        ...PAGE_PARAMS_PROPERTIES,
      },
    },
  },
];

const TOOL_NAMES = new Set(DEVICE_TOOLS.map((t) => t.name));
export function isDeviceTool(name: string): boolean {
  return TOOL_NAMES.has(name);
}

export async function handleDeviceTool(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
  const creds = getCredentials();
  const missing = requireCredentials(creds);
  if (missing) return missing;

  try {
    if (name === 'unifi_list_devices') {
      return textResult(
        await listDevices(creds!, {
          hostIds: args.hostIds as string[] | undefined,
          time: args.time as string | undefined,
          pageSize: args.pageSize as number | undefined,
          nextToken: args.nextToken as string | undefined,
        })
      );
    }

    return errorResult(`Unknown tool: ${name}`);
  } catch (err) {
    return errorResult((err as Error).message);
  }
}
