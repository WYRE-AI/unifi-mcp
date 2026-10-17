/**
 * HTTP transport fail-closed auth (CWE-306).
 *
 * Startup requires a real CONDUIT_S2S_SECRET. Empty and known placeholders
 * refuse to listen. MCP_ALLOW_INSECURE_DEV=1 is the empty-secret bypass: it
 * binds 127.0.0.1 only, including when MCP_HTTP_HOST is a wider address.
 * /mcp rejects a missing or invalid X-Gateway-S2S header.
 * AUTH_MODE=gateway rejects requests that omit X-UniFi-Api-Key and must not
 * fall back to UNIFI_API_KEY in process.env.
 */

import { createHmac } from 'node:crypto';
import { request as httpRequest, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const getCredentialsMock = vi.hoisted(() => vi.fn());

vi.mock('../client.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../client.js')>();
  return {
    ...actual,
    getCredentials: (...args: Parameters<typeof actual.getCredentials>) => {
      getCredentialsMock(...args);
      return actual.getCredentials(...args);
    },
  };
});

import { startHttpTransport } from '../http.js';

const S2S_SECRET = 's2s-do-not-log-7f3a';
const ENV_API_KEY = 'env-api-key-must-not-be-used';
const HEADER_API_KEY = 'header-api-key-do-not-log';

const ENV_KEYS = [
  'CONDUIT_S2S_SECRET',
  'MCP_ALLOW_INSECURE_DEV',
  'MCP_HTTP_PORT',
  'MCP_HTTP_HOST',
  'AUTH_MODE',
  'UNIFI_API_KEY',
  'LOG_LEVEL',
  'MCP_TRANSPORT',
] as const;

const savedEnv = new Map<string, string | undefined>();
const servers: Server[] = [];

function mintS2sHeader(secret: string, unixSeconds = Math.floor(Date.now() / 1000)): string {
  const message = `t=${unixSeconds}`;
  const hex = createHmac('sha256', secret).update(message).digest('hex');
  return `${message},v1=${hex}`;
}

function captureStderr(): { text: () => string; restore: () => void } {
  const lines: string[] = [];
  const spy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    lines.push(args.map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' '));
  });
  return {
    text: () => lines.join('\n'),
    restore: () => spy.mockRestore(),
  };
}

interface HttpResult {
  status: number;
  body: string;
}

function sendHttp(options: {
  port: number;
  method: string;
  path: string;
  headers?: Record<string, string>;
  body?: string;
}): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        hostname: '127.0.0.1',
        port: options.port,
        method: options.method,
        path: options.path,
        headers: options.headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      },
    );
    req.setTimeout(5000, () => {
      req.destroy(new Error(`timeout ${options.method} ${options.path}`));
    });
    req.on('error', reject);
    if (options.body !== undefined) req.write(options.body);
    req.end();
  });
}

async function listen(): Promise<{ port: number; address: string; close: () => Promise<void> }> {
  const server = await startHttpTransport();
  servers.push(server);
  const bound = server.address() as AddressInfo | null;
  if (!bound || typeof bound === 'string') {
    throw new Error('HTTP server did not bind a TCP port');
  }
  return {
    port: bound.port,
    address: bound.address,
    close: () => new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    }),
  };
}

function mcpHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    ...extra,
  };
}

const listSitesCall = JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'tools/call',
  params: { name: 'unifi_list_sites', arguments: {} },
});

function exitSpy() {
  return vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new Error(`process.exit:${String(code)}`);
  }) as typeof process.exit);
}

function stubSitesFetch(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ data: [{ siteId: 's1' }], httpStatusCode: 200 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeAll(() => {
  for (const key of ENV_KEYS) savedEnv.set(key, process.env[key]);
});

afterAll(() => {
  for (const key of ENV_KEYS) {
    const value = savedEnv.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

beforeEach(() => {
  process.env.MCP_HTTP_PORT = '0';
  process.env.MCP_HTTP_HOST = '127.0.0.1';
  process.env.LOG_LEVEL = 'info';
  delete process.env.CONDUIT_S2S_SECRET;
  delete process.env.MCP_ALLOW_INSECURE_DEV;
  delete process.env.AUTH_MODE;
  delete process.env.UNIFI_API_KEY;
  getCredentialsMock.mockReset();
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  while (servers.length > 0) {
    const server = servers.pop();
    if (!server?.listening) continue;
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
});

describe('HTTP startup', () => {
  it('refuses to start when CONDUIT_S2S_SECRET is empty', async () => {
    const logs = captureStderr();
    const exit = exitSpy();

    try {
      await expect(startHttpTransport()).rejects.toThrow('process.exit:1');
      expect(exit).toHaveBeenCalledWith(1);
      const text = logs.text();
      expect(text).toContain('Refusing to start HTTP transport');
      expect(text).toContain('CONDUIT_S2S_SECRET is empty');
      expect(text).not.toContain(S2S_SECRET);
    } finally {
      logs.restore();
    }
  });

  it('refuses to start when CONDUIT_S2S_SECRET is whitespace', async () => {
    process.env.CONDUIT_S2S_SECRET = '   ';
    const logs = captureStderr();
    const exit = exitSpy();

    try {
      await expect(startHttpTransport()).rejects.toThrow('process.exit:1');
      expect(exit).toHaveBeenCalledWith(1);
      expect(logs.text()).toContain('CONDUIT_S2S_SECRET is empty');
    } finally {
      logs.restore();
    }
  });

  it('still refuses when MCP_ALLOW_INSECURE_DEV is not exactly 1', async () => {
    process.env.MCP_ALLOW_INSECURE_DEV = 'true';
    const logs = captureStderr();
    exitSpy();

    try {
      await expect(startHttpTransport()).rejects.toThrow('process.exit:1');
      expect(logs.text()).toContain('Refusing to start HTTP transport');
    } finally {
      logs.restore();
    }
  });

  it.each(['changeme', 'Change-Me', '  replace-with-a-real-secret  ', 'your-s2s-secret'])(
    'refuses known placeholder %j and does not log it',
    async (placeholder) => {
      process.env.CONDUIT_S2S_SECRET = placeholder;
      const logs = captureStderr();
      const exit = exitSpy();

      try {
        await expect(startHttpTransport()).rejects.toThrow('process.exit:1');
        expect(exit).toHaveBeenCalledWith(1);
        const text = logs.text();
        expect(text).toContain('known placeholder');
        expect(text).toContain('openssl rand -hex 32');
        expect(text).not.toContain(placeholder.trim());
        expect(text).not.toContain(`CONDUIT_S2S_SECRET=${placeholder.trim()}`);
      } finally {
        logs.restore();
      }
    },
  );

  it('refuses the placeholder word secret without echoing the configured value', async () => {
    process.env.CONDUIT_S2S_SECRET = 'secret';
    const logs = captureStderr();
    exitSpy();

    try {
      await expect(startHttpTransport()).rejects.toThrow('process.exit:1');
      const text = logs.text();
      expect(text).toContain('known placeholder');
      expect(text).not.toContain('CONDUIT_S2S_SECRET=secret');
    } finally {
      logs.restore();
    }
  });

  it('refuses a placeholder even when MCP_ALLOW_INSECURE_DEV=1', async () => {
    process.env.CONDUIT_S2S_SECRET = 'your-s2s-secret';
    process.env.MCP_ALLOW_INSECURE_DEV = '1';
    const logs = captureStderr();
    exitSpy();

    try {
      await expect(startHttpTransport()).rejects.toThrow('process.exit:1');
      const text = logs.text();
      expect(text).toContain('known placeholder');
      expect(text).not.toContain('your-s2s-secret');
      expect(text).not.toContain('SECURITY WARNING');
    } finally {
      logs.restore();
    }
  });

  it('allows startup with a warning when MCP_ALLOW_INSECURE_DEV=1 and binds 127.0.0.1', async () => {
    process.env.MCP_ALLOW_INSECURE_DEV = '1';
    delete process.env.MCP_HTTP_HOST;
    const logs = captureStderr();
    const exit = exitSpy();

    try {
      const server = await listen();
      expect(exit).not.toHaveBeenCalled();
      expect(server.address).toBe('127.0.0.1');
      const text = logs.text();
      expect(text).toContain('SECURITY WARNING');
      expect(text).toContain('CONDUIT_S2S_SECRET');
      expect(text).toContain('MCP_ALLOW_INSECURE_DEV=1');
      expect(text).toContain('127.0.0.1');
      expect(text).not.toContain('not a loopback address');
      expect(text).not.toContain(S2S_SECRET);
    } finally {
      logs.restore();
    }
  });

  it('forces 127.0.0.1 when the dev bypass host is localhost', async () => {
    process.env.MCP_ALLOW_INSECURE_DEV = '1';
    process.env.MCP_HTTP_HOST = 'localhost';
    const logs = captureStderr();

    try {
      const server = await listen();
      expect(server.address).toBe('127.0.0.1');
      expect(logs.text()).toContain('SECURITY WARNING');
      expect(logs.text()).toContain('listening on 127.0.0.1');
      expect(logs.text()).not.toContain('not a loopback address');
    } finally {
      logs.restore();
    }
  });

  it.each(['0.0.0.0', '10.1.2.3'])(
    'forces 127.0.0.1 when the dev bypass host is %s',
    async (host) => {
      process.env.MCP_ALLOW_INSECURE_DEV = '1';
      process.env.MCP_HTTP_HOST = host;
      const logs = captureStderr();
      const exit = exitSpy();

      try {
        const server = await listen();
        expect(exit).not.toHaveBeenCalled();
        expect(server.address).toBe('127.0.0.1');
        const text = logs.text();
        expect(text).toContain('SECURITY WARNING');
        expect(text).toContain(`MCP_HTTP_HOST=${host} is not a loopback address`);
        expect(text).toContain('Binding 127.0.0.1 only');
        expect(text).not.toContain(S2S_SECRET);
      } finally {
        logs.restore();
      }
    },
  );

  it('honors a non-loopback MCP_HTTP_HOST when CONDUIT_S2S_SECRET is set', async () => {
    process.env.CONDUIT_S2S_SECRET = S2S_SECRET;
    process.env.MCP_HTTP_HOST = '0.0.0.0';
    const logs = captureStderr();

    try {
      const server = await listen();
      expect(server.address).toBe('0.0.0.0');
      expect(logs.text()).not.toContain('not a loopback address');
      expect(logs.text()).not.toContain(S2S_SECRET);
    } finally {
      logs.restore();
    }
  });

  it('keeps the 0.0.0.0 bind when a secret is set and MCP_HTTP_HOST is unset', async () => {
    process.env.CONDUIT_S2S_SECRET = S2S_SECRET;
    delete process.env.MCP_HTTP_HOST;
    const server = await listen();
    expect(server.address).toBe('0.0.0.0');
  });
});

describe('HTTP /mcp authentication', () => {
  beforeEach(() => {
    process.env.CONDUIT_S2S_SECRET = S2S_SECRET;
    process.env.AUTH_MODE = 'gateway';
    process.env.MCP_HTTP_HOST = '127.0.0.1';
    process.env.UNIFI_API_KEY = ENV_API_KEY;
  });

  it('returns 401 when the S2S header is missing or invalid and does not log the secret', async () => {
    const logs = captureStderr();
    const server = await listen();
    try {
      const missing = await sendHttp({
        port: server.port,
        method: 'POST',
        path: '/mcp',
        headers: mcpHeaders(),
        body: listSitesCall,
      });
      const invalid = await sendHttp({
        port: server.port,
        method: 'POST',
        path: '/mcp',
        headers: mcpHeaders({ 'x-gateway-s2s': mintS2sHeader('wrong-secret') }),
        body: listSitesCall,
      });

      expect(missing.status).toBe(401);
      expect(invalid.status).toBe(401);
      expect(missing.body).toContain('X-Gateway-S2S');
      expect(invalid.body).toContain('X-Gateway-S2S');
      expect(missing.body).not.toContain(S2S_SECRET);
      expect(invalid.body).not.toContain(S2S_SECRET);
      expect(missing.body).not.toContain(ENV_API_KEY);
      expect(logs.text()).not.toContain(S2S_SECRET);
      expect(getCredentialsMock).not.toHaveBeenCalled();
    } finally {
      logs.restore();
    }
  });

  it('returns 401 in gateway mode without credential headers and does not use env credentials', async () => {
    const fetchMock = stubSitesFetch();
    const server = await listen();
    const response = await sendHttp({
      port: server.port,
      method: 'POST',
      path: '/mcp',
      headers: mcpHeaders({ 'x-gateway-s2s': mintS2sHeader(S2S_SECRET) }),
      body: listSitesCall,
    });

    expect(response.status).toBe(401);
    expect(response.body).toContain('Missing credentials');
    expect(response.body).toContain('X-UniFi-Api-Key');
    expect(response.body).not.toContain(ENV_API_KEY);
    expect(response.body).not.toContain(S2S_SECRET);
    expect(getCredentialsMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects whitespace-only gateway credential headers', async () => {
    const server = await listen();
    const response = await sendHttp({
      port: server.port,
      method: 'POST',
      path: '/mcp',
      headers: mcpHeaders({
        'x-gateway-s2s': mintS2sHeader(S2S_SECRET),
        'x-unifi-api-key': '   ',
      }),
      body: listSitesCall,
    });

    expect(response.status).toBe(401);
    expect(response.body).toContain('Missing credentials');
    expect(getCredentialsMock).not.toHaveBeenCalled();
  });

  it('accepts a valid S2S header plus the API key header and uses that key', async () => {
    const logs = captureStderr();
    const fetchMock = stubSitesFetch();
    const server = await listen();
    try {
      const response = await sendHttp({
        port: server.port,
        method: 'POST',
        path: '/mcp',
        headers: mcpHeaders({
          'x-gateway-s2s': mintS2sHeader(S2S_SECRET),
          'x-unifi-api-key': HEADER_API_KEY,
        }),
        body: listSitesCall,
      });

      expect(response.status).toBe(200);
      expect(response.body).not.toContain(S2S_SECRET);
      expect(response.body).not.toContain(ENV_API_KEY);
      const payload = JSON.parse(response.body) as {
        result?: { content?: Array<{ text?: string }> };
      };
      const text = payload.result?.content?.[0]?.text ?? '';
      expect(JSON.parse(text).data[0].siteId).toBe('s1');
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect((init.headers as Record<string, string>)['X-API-Key']).toBe(HEADER_API_KEY);
      expect(logs.text()).not.toContain(S2S_SECRET);
      expect(logs.text()).not.toContain(HEADER_API_KEY);
      expect(logs.text()).not.toContain(ENV_API_KEY);
      expect(getCredentialsMock).toHaveBeenCalled();
    } finally {
      logs.restore();
    }
  });

  it('serves /health and /healthz without authentication and without reading credentials', async () => {
    const server = await listen();
    for (const path of ['/health', '/healthz']) {
      const response = await sendHttp({
        port: server.port,
        method: 'GET',
        path,
      });
      expect(response.status).toBe(200);
      const body = JSON.parse(response.body) as { status?: string; mode?: string };
      expect(body.status).toBe('ok');
      expect(body.mode).toBe('gateway');
      expect(response.body).not.toContain(S2S_SECRET);
      expect(response.body).not.toContain(ENV_API_KEY);
    }
    expect(getCredentialsMock).not.toHaveBeenCalled();
  });
});

describe('HTTP env mode', () => {
  it('uses UNIFI_API_KEY after a valid S2S header when AUTH_MODE is not gateway', async () => {
    process.env.CONDUIT_S2S_SECRET = S2S_SECRET;
    process.env.AUTH_MODE = 'env';
    process.env.MCP_HTTP_HOST = '127.0.0.1';
    process.env.UNIFI_API_KEY = ENV_API_KEY;
    const fetchMock = stubSitesFetch();
    const server = await listen();

    const response = await sendHttp({
      port: server.port,
      method: 'POST',
      path: '/mcp',
      headers: mcpHeaders({ 'x-gateway-s2s': mintS2sHeader(S2S_SECRET) }),
      body: listSitesCall,
    });

    expect(response.status).toBe(200);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['X-API-Key']).toBe(ENV_API_KEY);
    expect(response.body).not.toContain(S2S_SECRET);
  });
});
