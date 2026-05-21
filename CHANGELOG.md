# Changelog

All notable changes to this project will be documented in this file.

This project follows [Conventional Commits](https://www.conventionalcommits.org/) and uses [Release Please](https://github.com/googleapis/release-please) to manage release pull requests and changelog updates.

## [1.6.2](https://github.com/I-am-PUID-0/traefik-proxy-admin/compare/v1.6.1...v1.6.2) (2026-05-21)


### Bug Fixes

* **sso:** implement SSO state cookies management and refactor cookie handling ([9b14784](https://github.com/I-am-PUID-0/traefik-proxy-admin/commit/9b14784d330495e7cbc711c272977a4e03d47bb1))

## [1.6.1](https://github.com/I-am-PUID-0/traefik-proxy-admin/compare/v1.6.0...v1.6.1) (2026-05-21)


### Bug Fixes

* **auth:** await redirectToSSOLogin for proper async handling ([539d070](https://github.com/I-am-PUID-0/traefik-proxy-admin/commit/539d070baad1225b3c9dcc7790cd38d19e022b01))
* **config:** add adminPanelPublicUrl for browser-facing URL configuration ([539d070](https://github.com/I-am-PUID-0/traefik-proxy-admin/commit/539d070baad1225b3c9dcc7790cd38d19e022b01))
* **config:** improve defaultEnableDurationMinutes handling in config retrieval ([f19e78d](https://github.com/I-am-PUID-0/traefik-proxy-admin/commit/f19e78dedd8109ddf5f731340625538c9b52980c))

## [1.6.0](https://github.com/I-am-PUID-0/traefik-proxy-admin/compare/v1.5.0...v1.6.0) (2026-05-21)


### Features

* **auth:** add SSO provider presets and expand docs ([ad02699](https://github.com/I-am-PUID-0/traefik-proxy-admin/commit/ad02699c32f686ec46ec4ac433d465f0b7448034))
* **auth:** expand OIDC provider presets with additional providers and endpoint details ([3662a1a](https://github.com/I-am-PUID-0/traefik-proxy-admin/commit/3662a1a5e2ddb4d12fa344a252e4ad2f7dd7720e))
* **config:** rename admin panel domain to base URL and improve URL handling ([1ced7ea](https://github.com/I-am-PUID-0/traefik-proxy-admin/commit/1ced7eae323cfcfa372029c442400660a44c947c))
* **security:** implement rate limiting and request body validation for admin and SSO endpoints ([6b44e5e](https://github.com/I-am-PUID-0/traefik-proxy-admin/commit/6b44e5e52fe6314a19faff60525750bd31b27dde))


### Bug Fixes

* **security:** guard SSO endpoint requests against SSRF ([40ebc3c](https://github.com/I-am-PUID-0/traefik-proxy-admin/commit/40ebc3c29046784ef09069fdcfb5a1c63d695841))

## [1.5.0](https://github.com/I-am-PUID-0/traefik-proxy-admin/compare/v1.4.0...v1.5.0) (2026-05-21)


### Features

* **auth:** add admin authentication and reusable SSO providers ([de835f0](https://github.com/I-am-PUID-0/traefik-proxy-admin/commit/de835f07dd22901d161ff3ea94fc62ba990b9b96))

## [1.4.0](https://github.com/I-am-PUID-0/traefik-proxy-admin/compare/v1.3.0...v1.4.0) (2026-05-21)


### Features

* add service import and export ([44f69f2](https://github.com/I-am-PUID-0/traefik-proxy-admin/commit/44f69f2280764143cff15f889b14f5c35f284596))

## [1.3.0](https://github.com/I-am-PUID-0/traefik-proxy-admin/compare/v1.2.1...v1.3.0) (2026-05-20)


### Features

* add advanced Traefik service rules ([34550b6](https://github.com/I-am-PUID-0/traefik-proxy-admin/commit/34550b6cfb04350cb35585070967609e36d39150))


### Bug Fixes

* clarify DNS resolution and CIDR validation in TCP connection handling ([c0ea24a](https://github.com/I-am-PUID-0/traefik-proxy-admin/commit/c0ea24ab6f589f56436f732dcc691d76ba18babc))
* preserve service middlewares and guard target probes ([2d54e62](https://github.com/I-am-PUID-0/traefik-proxy-admin/commit/2d54e621eb4c07bd0da73debb1e53dfd466359ac))

## [1.2.1](https://github.com/I-am-PUID-0/traefik-proxy-admin/compare/v1.2.0...v1.2.1) (2026-05-18)


### Bug Fixes

* implement legacy schema repair and default domain configuration ([78bc880](https://github.com/I-am-PUID-0/traefik-proxy-admin/commit/78bc880b4078d24d25b4f06aeb8d2f6d958ba622))

## [1.2.0](https://github.com/I-am-PUID-0/traefik-proxy-admin/compare/v1.1.0...v1.2.0) (2026-05-18)


### Features

* enhance Docker workflow with QEMU setup and multi-platform support ([9473887](https://github.com/I-am-PUID-0/traefik-proxy-admin/commit/94738874ad34da0fa6b650c62f4419c0eb92ea49))

## [1.1.0](https://github.com/I-am-PUID-0/traefik-proxy-admin/compare/v1.0.0...v1.1.0) (2026-05-18)


### Features

* add functional API coverage and pre-push verification ([04a4bd7](https://github.com/I-am-PUID-0/traefik-proxy-admin/commit/04a4bd7413996344a2d2c4514e8e886b6ced0f63))
* add Traefik discovery and service validation tools ([25482c7](https://github.com/I-am-PUID-0/traefik-proxy-admin/commit/25482c7a8ae1e71bef53eb6b6fa8f4e99f912332))
* add Traefik live diagnostics and import tools ([bef5dbe](https://github.com/I-am-PUID-0/traefik-proxy-admin/commit/bef5dbee7dee99ded3d7492338b71e3f667a5f3a))
* discover Traefik middlewares for service configuration ([443e0a6](https://github.com/I-am-PUID-0/traefik-proxy-admin/commit/443e0a6e79990c00628aec226d1b704306c486ae))
* validate configured middlewares against Traefik discovery ([4abdccd](https://github.com/I-am-PUID-0/traefik-proxy-admin/commit/4abdccdecda9f6424e2e0fb9a8472a5ddf456405))


### Bug Fixes

* normalize service middleware names ([3c3667e](https://github.com/I-am-PUID-0/traefik-proxy-admin/commit/3c3667ed09a188011b9d538eb91ff86d9d06ead0))

## [1.0.0](https://github.com/I-am-PUID-0/traefik-proxy-admin/compare/v0.1.0...v1.0.0) (2026-05-18)


### ⚠ BREAKING CHANGES

* project layout now uses src/ paths, CI/release automation now runs on GitHub Actions, and the supported runtime baseline is Node 22 LTS.

### Miscellaneous Chores

* modernize app structure, tooling, devcontainer, and releases ([1caa6e2](https://github.com/I-am-PUID-0/traefik-proxy-admin/commit/1caa6e22c2690f6559ee66bb1b637b990aaa8f1c))

## 0.1.0 - 2026-05-18

### Changed

- Establish the maintained baseline for `traefik-proxy-admin` under the `I-am-PUID-0` repository.
- Modernize the app structure, development container, GitHub Actions CI, and dependency toolchain.
- Standardize the supported runtime baseline on Node 22 LTS.
