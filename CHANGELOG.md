# Changelog

All notable changes to this project will be documented in this file. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/).

Per-version release notes for tagged releases are published on the [GitHub Releases page](https://github.com/WYRE-AI/unifi-mcp/releases) - `semantic-release` generates them from commit history at release time.

## [Unreleased]

### Added

- Initial v1 release: 9 read-only tools covering the full UniFi Cloud Site Manager API surface (sites, hosts, devices, ISP/WAN metrics, SD-WAN configs and status). Static `X-API-Key` authentication against a UI.com account - no OAuth. Deliberately targets the Cloud Site Manager API only; the local per-controller Network API (client-level detail, VLANs/WLANs/firewall rules, which the cloud API does not expose) is out of scope for this connector by design. See README's Scope section.
