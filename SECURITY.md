# Security Policy

## Supported Versions

| Version/Branch | Supported |
| --- | --- |
| `main` | Yes |
| Older branches/tags | No |

## Reporting a Vulnerability

Please do not open public issues for security reports.

Use GitHub's private reporting flow:

1. Open the repository Security tab.
2. Click **Report a vulnerability**.
3. Include reproduction steps, impact, affected version or tag, and deployment assumptions.

If private reporting is unavailable, contact a maintainer directly and share details privately.

## Response Targets

- Initial triage response: within 7 days.
- Status update after validation: within 14 days.
- Fix timeline depends on severity, exploitability, and release risk.

## Scope

This policy covers Traefik Proxy Admin application code, Docker images, release automation, and repository workflows.

TPA manages Traefik dynamic configuration, authentication hooks, target probes, and operational secrets. Treat deployment-specific findings involving exposed admin UI, exposed Traefik API, weak cookie domains, or broad target probe ranges as security-sensitive.
