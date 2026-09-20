import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getCredentials, listSites } from '../client.js';
import type { CallToolResult } from './types.js';
import { PAGE_PARAMS_PROPERTIES, errorResult, requireCredentials, textResult } from './shared.js';

export const SITE_TOOLS: Tool[] = [
  {
    name: 'unifi_list_sites',
    description:
      'List every UniFi site (from hosts running the UniFi Network application) visible to this API key\'s UI.com account. Each entry includes the site and host IDs, site metadata (name, timezone, gateway MAC), aggregate statistics (device/client counts, network performance), and the caller\'s permission level on that site.',
    inputSchema: {
      type: 'object',
      properties: { ...PAGE_PARAMS_PROPERTIES },
    },
  },
];

const TOOL_NAMES = new Set(SITE_TOOLS.map((t) => t.name));
export function isSiteTool(name: string): boolean {
  return TOOL_NAMES.has(name);
}

export async function handleSiteTool(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
  const creds = getCredentials();
  const missing = requireCredentials(creds);
  if (missing) return missing;

  try {
    if (name === 'unifi_list_sites') {
      return textResult(
        await listSites(creds!, {
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
