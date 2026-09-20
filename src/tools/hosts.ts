import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getCredentials, getHost, listHosts } from '../client.js';
import type { CallToolResult } from './types.js';
import { PAGE_PARAMS_PROPERTIES, errorResult, requireCredentials, textResult } from './shared.js';

export const HOST_TOOLS: Tool[] = [
  {
    name: 'unifi_list_hosts',
    description:
      'List every host (UniFi console or network-server application) associated with this API key\'s UI.com account. Includes hardware ID, current IP address, ownership/block status, and registration/backup timestamps.',
    inputSchema: {
      type: 'object',
      properties: { ...PAGE_PARAMS_PROPERTIES },
    },
  },
  {
    name: 'unifi_get_host',
    description: 'Get detailed information about a single host by ID (as returned by unifi_list_hosts).',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Host ID.' },
      },
      required: ['id'],
    },
  },
];

const TOOL_NAMES = new Set(HOST_TOOLS.map((t) => t.name));
export function isHostTool(name: string): boolean {
  return TOOL_NAMES.has(name);
}

export async function handleHostTool(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
  const creds = getCredentials();
  const missing = requireCredentials(creds);
  if (missing) return missing;

  try {
    if (name === 'unifi_list_hosts') {
      return textResult(
        await listHosts(creds!, {
          pageSize: args.pageSize as number | undefined,
          nextToken: args.nextToken as string | undefined,
        })
      );
    }

    if (name === 'unifi_get_host') {
      return textResult(await getHost(creds!, args.id as string));
    }

    return errorResult(`Unknown tool: ${name}`);
  } catch (err) {
    return errorResult((err as Error).message);
  }
}
