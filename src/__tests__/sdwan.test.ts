import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleSdWanTool } from '../tools/sdwan.js';
import { runWithCredentials } from '../client.js';
import { jsonResponse, textOf } from './test-helpers.js';

describe('handleSdWanTool', () => {
  const fetchMock = vi.fn();
  const creds = { apiKey: 'key-1' };

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('unifi_list_sdwan_configs hits GET /v1/sd-wan-configs with no query params', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [{ id: 'c1', name: 'Main', type: 'sdwan-hbsp' }] }));

    const result = await runWithCredentials(creds, () => handleSdWanTool('unifi_list_sdwan_configs', {}));

    expect(result.isError).toBeUndefined();
    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.pathname).toBe('/v1/sd-wan-configs');
    expect(JSON.parse(textOf(result)).data[0].id).toBe('c1');
  });

  it('unifi_get_sdwan_config requests the config by ID and returns its topology', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ data: { id: 'c1', hubs: [{ id: 'hub1', routes: ['10.0.0.0/24'] }] } })
    );

    const result = await runWithCredentials(creds, () =>
      handleSdWanTool('unifi_get_sdwan_config', { id: 'c1' })
    );

    expect(new URL(fetchMock.mock.calls[0][0] as string).pathname).toBe('/v1/sd-wan-configs/c1');
    expect(JSON.parse(textOf(result)).data.hubs[0].routes[0]).toBe('10.0.0.0/24');
  });

  it('unifi_get_sdwan_config_status requests the /status subpath', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: { id: 'c1', generateStatus: 'OK' } }));

    await runWithCredentials(creds, () => handleSdWanTool('unifi_get_sdwan_config_status', { id: 'c1' }));

    expect(new URL(fetchMock.mock.calls[0][0] as string).pathname).toBe('/v1/sd-wan-configs/c1/status');
  });
});
