# Changelog

All notable changes to this project will be documented in this file.

This project follows [Conventional Commits](https://www.conventionalcommits.org/) and uses [Release Please](https://github.com/googleapis/release-please) to manage release pull requests and changelog updates.

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
