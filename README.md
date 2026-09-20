# UniFi MCP Server

MCP server for [Ubiquiti UniFi](https://www.ui.com/)'s **Cloud Site Manager API** - sites, hosts, devices, WAN/ISP health metrics, and SD-WAN configuration/status, for AI assistants and the WYRE Conduit gateway.

## Scope: Cloud Site Manager API only (deliberate)

UniFi exposes two distinct API surfaces:

- **Local per-controller API** (Network Application API, `developer.ui.com/network/...`) - lives on each customer's own console/controller, requires a separate API key per site with no central integration point, and covers per-site configuration in depth: clients, networks/VLANs/DHCP, WLANs/SSIDs, firewall rules, port forwarding, etc.
- **Cloud Site Manager API** (`developer.ui.com/site-manager/...`, base URL `https://api.ui.com`) - a single UI.com account key that aggregates data across every site adopted to that account, but exposes a **much narrower** read surface: sites, hosts, device inventory, WAN/ISP metrics, and SD-WAN config/status only.

**This connector targets the Cloud Site Manager API only**, per an explicit upstream scope decision - the local per-controller API is deferred, not implemented as a fallback.

**Consequence for tool coverage:** the Cloud Site Manager API does **not** expose several things a "typical" network-management connector would have - there is no client-listing/client-detail endpoint (only aggregate client *counts* inside a site's `statistics`), no VLAN/network/DHCP-config endpoint, no WLAN/SSID endpoint, and no firewall-rule endpoint. Those all live on the local per-controller API only. This connector implements exactly the 9 operations the Cloud Site Manager API's own published OpenAPI spec defines - see Tools below - and does not fabricate tools for surfaces the cloud API can't actually serve.

## Authentication

UniFi Site Manager authenticates with a single **static `X-API-Key` header** tied to a UI.com account - there is no OAuth flow, no token exchange, and no per-request expiry. Generate a key at `unifi.ui.com` under **Settings > API Keys**.

**The key is read-only account-wide, confirmed two ways:** Ubiquiti's own Getting Started documentation states "The API key is currently read-only... limited to read operations and cannot be used to make modifications to your UniFi infrastructure," and independently, the API's own published OpenAPI spec (`developer.ui.com/site-manager/v1.0.0`) defines exactly 9 operations - 8 `GET` and one `POST` (`/v1/isp-metrics/{type}/query`, which is a filtered read, not a mutation: it accepts a list of site/time-range filters and returns matching metrics, same as the `GET` sibling endpoint with query params). **No mutating (`PUT`/`PATCH`/`DELETE`) endpoint exists anywhere on this API surface.** There is accordingly no destructive-action exclusion list the way some other connectors in this fleet require - the vendor API itself cannot mutate anything the key touches.

In gateway mode the key arrives per-request via the `X-UniFi-Api-Key` header; in local/stdio mode it's read once from `UNIFI_API_KEY`.

## Configuration

| Env var | Description |
|---|---|
| `UNIFI_API_KEY` | UniFi Cloud Site Manager API key. |
| `MCP_TRANSPORT` | `stdio` (default) or `http`. |
| `AUTH_MODE` | `env` (default, reads the var above) or `gateway` (credential arrives per-request via the `X-UniFi-Api-Key` header, injected by the Conduit gateway). |
| `CONDUIT_S2S_SECRET` | When set, the HTTP transport requires a valid `X-Gateway-S2S` header (Conduit sidecar auth) on every `/mcp` request. |
| `LOG_LEVEL` | `debug` \| `info` (default) \| `warn` \| `error`. |

## Tools

9 read-only tools, one per operation in the Cloud Site Manager API's published spec.

### Sites
- `unifi_list_sites` - list every site visible to this API key's account, with metadata (name, timezone, gateway MAC) and aggregate statistics (device/client counts, network performance).

### Hosts
- `unifi_list_hosts` - list every host (console / network-server application) associated with this API key's account.
- `unifi_get_host` - get detailed information about a single host by ID.

### Devices
- `unifi_list_devices` - list UniFi devices managed by hosts this account owns or super-admins, grouped by host. **PII-bearing** (MAC address, IP address, user-defined hostname/note per device) - **admin-gated by default**.

### WAN / ISP Health
- `unifi_get_isp_metrics` - WAN/ISP health and traffic metrics for every linked site, at 5-minute or 1-hour granularity.
- `unifi_query_isp_metrics` - the same metrics, scoped to specific host/site pairs and time ranges. A `POST` on UniFi's API, but a filtered read, not a mutation.

### SD-WAN
- `unifi_list_sdwan_configs` - list every SD-WAN configuration (id/name/type only).
- `unifi_get_sdwan_config` - full topology for one SD-WAN configuration: hub/spoke sites, attached networks, and routed subnets (CIDR). **Network-topology data - admin-gated by default**.
- `unifi_get_sdwan_config_status` - deployment status for one SD-WAN configuration, including per-hub/spoke WAN IPs and latency. **Network-topology data - admin-gated by default**.

`unifi_list_sites`, `unifi_list_hosts`, `unifi_get_host`, `unifi_get_isp_metrics`, `unifi_query_isp_metrics`, and `unifi_list_sdwan_configs` are plain-read tier: sites/hosts are the navigational directory most other tools need site/host IDs from, and WAN metrics are aggregate performance data, not PII or topology.

## Sensitivity

This API surfaces two categories of sensitive data even though it's read-only: **PII** (device MAC addresses, IP addresses, user-defined hostnames on every device returned by `unifi_list_devices`) and **network topology** (SD-WAN hub/spoke routes and subnets in `unifi_get_sdwan_config`/`unifi_get_sdwan_config_status`). Those three tools default to `isAdmin: true` in the Conduit wiring; everything else is plain read.

## Development

```bash
npm install
npm run build
npm test
npm run lint   # tsc --noEmit
```

## Docker

```bash
docker build -t unifi-mcp .
docker run -p 8080:8080 -e UNIFI_API_KEY=... unifi-mcp
```

## License

Apache-2.0
