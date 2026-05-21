# Contributing to Traefik Proxy Admin

Thanks for contributing to Traefik Proxy Admin.

## Branch Model

- `main` is the production and release branch.
- Open normal feature and bugfix pull requests against `main` unless a maintainer directs otherwise.
- Release Please uses conventional commits on `main` to prepare releases.

## Basic Workflow

1. Fork the repository.
2. Create a focused feature or bugfix branch.
3. Make the smallest coherent change that solves the issue.
4. Update relevant docs when behavior, setup, security, or operations change.
5. Run verification before opening a pull request.
6. Open the pull request with a conventional title.

## Pull Request Expectations

- Use Conventional Commit style for PR titles and commits.
- Include a concise summary and testing notes.
- Link related issues when applicable.
- Update docs or explicitly explain why docs were not needed.
- Keep unrelated refactors out of feature and bugfix PRs.

## Verification

Run the full suite inside the devcontainer before pushing:

```bash
pnpm verify
```

This runs dependency audit, lint, unit tests, Playwright tests, and production build. During active development, use:

```bash
pnpm lint
pnpm test
pnpm build
```

## Documentation Policy

The README should remain production-focused and concise. Put durable operational detail in `docs/`:

- Production setup: `docs/deployment.md`
- Authentication and SSO: `docs/authentication.md`
- Services and import/export: `docs/services.md`
- Traefik integration: `docs/traefik.md`
- Security guidance: `docs/security-hardening.md`
- Contributor/dev workflow: `docs/development.md`
