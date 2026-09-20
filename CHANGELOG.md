# Changelog

All notable changes to this project will be documented in this file. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/).

Per-version release notes for tagged releases are published on the [GitHub Releases page](https://github.com/WYRE-AI/unifi-mcp/releases) - `semantic-release` generates them from commit history at release time.

## [Unreleased]

### Added

- Initial v1 release: 9 read-only tools covering every dedicated read operation on the UniFi Cloud Site Manager API (sites, hosts, devices, ISP/WAN metrics, SD-WAN configs and status). Static `X-API-Key` authentication against a UI.com account - no OAuth. Deliberately targets the Cloud Site Manager API only; the local per-controller Network API (client-level detail, VLANs/WLANs/firewall rules, which the cloud API does not expose as dedicated operations) is out of scope for this connector by design. The live spec defines a 10th path, `/v1/connector/consoles/{id}/*path` - a generic, genuinely mutating (GET/POST/PUT/PATCH/DELETE) reverse-proxy into a console's local API - which this connector deliberately never calls; the connector's own code is read-only by construction, independent of what the underlying API key is capable of if called directly. See README's Scope and Authentication sections.
