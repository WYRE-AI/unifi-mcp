import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleDeviceTool } from '../tools/devices.js';
import { runWithCredentials } from '../client.js';
import { jsonResponse, textOf } from './test-helpers.js';

describe('handleDeviceTool', () => {
  const fetchMock = vi.fn();
  const creds = { apiKey: 'key-1' };

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('unifi_list_devices requests GET /v1/devices and repeats hostIds as hostIds[]', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ data: [{ hostId: 'h1', devices: [{ id: 'd1', mac: 'aa:bb:cc:dd:ee:ff' }] }] })
    );

    const result = await runWithCredentials(creds, () =>
      handleDeviceTool('unifi_list_devices', { hostIds: ['h1', 'h2'] })
    );

    expect(result.isError).toBeUndefined();
    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.pathname).toBe('/v1/devices');
    expect(url.searchParams.getAll('hostIds[]')).toEqual(['h1', 'h2']);
    expect(JSON.parse(textOf(result)).data[0].devices[0].mac).toBe('aa:bb:cc:dd:ee:ff');
  });

  it('omits hostIds[] entirely when no hostIds filter is given', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [] }));

    await runWithCredentials(creds, () => handleDeviceTool('unifi_list_devices', {}));

    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.searchParams.has('hostIds[]')).toBe(false);
  });

  it('returns a credential error without calling fetch when no key is configured', async () => {
    const result = await handleDeviceTool('unifi_list_devices', {});

    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/UNIFI_API_KEY/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
