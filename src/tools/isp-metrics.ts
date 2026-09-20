import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getCredentials, getIspMetrics, queryIspMetrics } from '../client.js';
import type { CallToolResult } from './types.js';
import { errorResult, requireCredentials, textResult } from './shared.js';

const INTERVAL_ENUM = ['5m', '1h'] as const;

export const ISP_METRICS_TOOLS: Tool[] = [
  {
    name: 'unifi_get_isp_metrics',
    description:
      "Get WAN/ISP health and traffic metrics for every site linked to this API key's account, at 5-minute or 1-hour granularity. 5-minute data is retained at least 24h; 1-hour data at least 30 days. Provide either `duration` alone, or `beginTimestamp`/`endTimestamp` (not both).",
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: [...INTERVAL_ENUM], description: 'Metric interval.' },
        beginTimestamp: { type: 'string', description: 'Earliest timestamp to retrieve, RFC3339. Cannot be combined with duration.' },
        endTimestamp: { type: 'string', description: 'Latest timestamp to retrieve, RFC3339. Cannot be combined with duration.' },
        duration: {
          type: 'string',
          enum: ['24h', '7d', '30d'],
          description: "Time range ending now. '24h' for 5m metrics; '7d' or '30d' for 1h metrics. Cannot be combined with beginTimestamp/endTimestamp.",
        },
      },
      required: ['type'],
    },
  },
  {
    name: 'unifi_query_isp_metrics',
    description:
      "Get WAN/ISP health and traffic metrics for specific host/site pairs and time ranges. A filtered read, not a mutation, despite being a POST on UniFi's API. If the API key lacks access to a requested site, the response reports status:partialSuccess for a mixed result or fails outright if none are accessible.",
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: [...INTERVAL_ENUM], description: 'Metric interval.' },
        sites: {
          type: 'array',
          description: 'Host/site pairs to query, each with an optional time range.',
          items: {
            type: 'object',
            properties: {
              hostId: { type: 'string' },
              siteId: { type: 'string' },
              beginTimestamp: { type: 'string', description: 'RFC3339.' },
              endTimestamp: { type: 'string', description: 'RFC3339.' },
            },
            required: ['hostId', 'siteId'],
          },
        },
      },
      required: ['type', 'sites'],
    },
  },
];

const TOOL_NAMES = new Set(ISP_METRICS_TOOLS.map((t) => t.name));
export function isIspMetricsTool(name: string): boolean {
  return TOOL_NAMES.has(name);
}

export async function handleIspMetricsTool(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
  const creds = getCredentials();
  const missing = requireCredentials(creds);
  if (missing) return missing;

  try {
    if (name === 'unifi_get_isp_metrics') {
      return textResult(
        await getIspMetrics(creds!, args.type as '5m' | '1h', {
          beginTimestamp: args.beginTimestamp as string | undefined,
          endTimestamp: args.endTimestamp as string | undefined,
          duration: args.duration as '24h' | '7d' | '30d' | undefined,
        })
      );
    }

    if (name === 'unifi_query_isp_metrics') {
      return textResult(
        await queryIspMetrics(creds!, args.type as '5m' | '1h', {
          sites: (args.sites as QuerySite[]) ?? [],
        })
      );
    }

    return errorResult(`Unknown tool: ${name}`);
  } catch (err) {
    return errorResult((err as Error).message);
  }
}

interface QuerySite {
  hostId: string;
  siteId: string;
  beginTimestamp?: string;
  endTimestamp?: string;
}
