import type { UniFiCredentials } from '../types.js';
import type { CallToolResult } from './types.js';

export function textResult(value: unknown): CallToolResult {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return { content: [{ type: 'text', text }] };
}

export function errorResult(message: string): CallToolResult {
  return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
}

/** Returns an error CallToolResult if credentials are missing, else null. */
export function requireCredentials(creds: UniFiCredentials | null): CallToolResult | null {
  if (!creds) {
    return errorResult('No UniFi credentials configured. Set UNIFI_API_KEY.');
  }
  return null;
}

/** Shared input-schema fragment for the cloud-token-paginated list endpoints (pageSize + nextToken, not offset/cursor). */
export const PAGE_PARAMS_PROPERTIES = {
  pageSize: { type: 'number', description: 'Number of items to return per page.' },
  nextToken: { type: 'string', description: 'Pagination token from a previous response, to fetch the next page.' },
} as const;
