import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleIspMetricsTool } from '../tools/isp-metrics.js';
import { runWithCredentials } from '../client.js';
import { jsonResponse, textOf } from './test-helpers.js';

describe('handleIspMetricsTool', () => {
  const fetchMock = vi.fn();
  const creds = { apiKey: 'key-1' };

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('unifi_get_isp_metrics requests GET /v1/isp-metrics/{type} with the duration param', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [{ metricType: 'wan', hostId: 'h1', siteId: 's1' }] }));

    const result = await runWithCredentials(creds, () =>
      handleIspMetricsTool('unifi_get_isp_metrics', { type: '1h', duration: '7d' })
    );

    expect(result.isError).toBeUndefined();
    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.pathname).toBe('/v1/isp-metrics/1h');
    expect(url.searchParams.get('duration')).toBe('7d');
  });

  it('unifi_query_isp_metrics POSTs the site filters as a JSON body', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: { metrics: [], status: 'success' } }));

    const result = await runWithCredentials(creds, () =>
      handleIspMetricsTool('unifi_query_isp_metrics', {
        type: '5m',
        sites: [{ hostId: 'h1', siteId: 's1' }],
      })
    );

    expect(result.isError).toBeUndefined();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new URL(url).pathname).toBe('/v1/isp-metrics/5m/query');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ sites: [{ hostId: 'h1', siteId: 's1' }] });
  });
});
