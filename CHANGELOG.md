# Changelog

All notable changes to this project will be documented in this file.

This project follows [Conventional Commits](https://www.conventionalcommits.org/) and uses [Release Please](https://github.com/googleapis/release-please) to manage release pull requests and changelog updates.

## [1.16.0](https://github.com/I-am-PUID-0/traefik-proxy-admin/compare/v1.15.0...v1.16.0) (2026-06-03)


### Features

* **auth:** implement isDirectVerifierRequest function for improved request handling ([eee69ea](https://github.com/I-am-PUID-0/traefik-proxy-admin/commit/eee69ea5adcd9e73c9f13274b60280dec62a55ca))

## [1.15.0](https://github.com/I-am-PUID-0/traefik-proxy-admin/compare/v1.14.0...v1.15.0) (2026-05-29)


### Features

* **cookie:** add ADMIN_COOKIE_SECURE option for configurable cookie security ([e7396c0](https://github.com/I-am-PUID-0/traefik-proxy-admin/commit/e7396c0c3e75f5860d87597048b1866e2a067204))

## [1.14.0](https://github.com/I-am-PUID-0/traefik-proxy-admin/compare/v1.13.0...v1.14.0) (2026-05-29)


### Features

* **auth:** replace redirectToSSOLogin with ssoRequiredResponse for improved SSO handling ([c3caf4d](https://github.com/I-am-PUID-0/traefik-proxy-admin/commit/c3caf4d00a6517847e3aabc28eec04b88b6f2255))
* **cert-resolver:** improve handling of certificate resolvers across components ([a18ef93](https://github.com/I-am-PUID-0/traefik-proxy-admin/commit/a18ef933c31bd1e29a45c3ee9c76e792f8778173))

## [1.13.0](https://github.com/I-am-PUID-0/traefik-proxy-admin/compare/v1.12.0...v1.13.0) (2026-05-28)


### Features

* **startup:** add build phase check and improve service initialization logic ([0bf145a](https://github.com/I-am-PUID-0/traefik-proxy-admin/commit/0bf145affb6b1ae9d88f65cead94e6dd28882391))

## [1.12.0](https://github.com/I-am-PUID-0/traefik-proxy-admin/compare/v1.11.4...v1.12.0) (2026-05-28)


### Features

* **instrumentation:** enhance migration resolution and add build phase check ([cb1fca7](https://github.com/I-am-PUID-0/traefik-proxy-admin/commit/cb1fca7dbaa8631cb45524a0f30a9302b3cda225))

## [1.11.4](https://github.com/I-am-PUID-0/traefik-proxy-admin/compare/v1.11.3...v1.11.4) (2026-05-28)


### Bug Fixes

* **migrations:** remove unused migrationCount from runMigrations function ([5be614f](https://github.com/I-am-PUID-0/traefik-proxy-admin/commit/5be614fad4b3fec5850ae24fc2c2b765810f8e90))

## [1.11.3](https://github.com/I-am-PUID-0/traefik-proxy-admin/compare/v1.11.2...v1.11.3) (2026-05-27)


### Bug Fixes

* **services:** normalize custom hostname input ([84408b1](https://github.com/I-am-PUID-0/traefik-proxy-admin/commit/84408b1442c6bdd00998e5bdedb92705823b3f33))

## [1.11.2](https://github.com/I-am-PUID-0/traefik-proxy-admin/compare/v1.11.1...v1.11.2) (2026-05-27)


### Bug Fixes

* **services:** recognize app-managed middleware references ([ff74099](https://github.com/I-am-PUID-0/traefik-proxy-admin/commit/ff7409951c34dddec99a9e9461ebb07a1b7089eb))

## [1.11.1](https://github.com/I-am-PUID-0/traefik-proxy-admin/compare/v1.11.0...v1.11.1) (2026-05-27)


### Bug Fixes

* **auth:** finalize service SSO tickets on reserved route ([922d7cb](https://github.com/I-am-PUID-0/traefik-proxy-admin/commit/922d7cb89e72716efe09d4e93483f4ffbf41b5cd))

## [1.11.0](https://github.com/I-am-PUID-0/traefik-proxy-admin/compare/v1.10.1...v1.11.0) (2026-05-27)


### Features

* **security:** add service bypass rules with observed sessions ([1e4e03f](https://github.com/I-am-PUID-0/traefik-proxy-admin/commit/1e4e03f78fd0df78b4fa8e4e33cb1abe07d1c57a))

## [1.10.1](https://github.com/I-am-PUID-0/traefik-proxy-admin/compare/v1.10.0...v1.10.1) (2026-05-26)


### Bug Fixes

* **logs:** correct Traefik access log viewer and parsing functionality ([436179c](https://github.com/I-am-PUID-0/traefik-proxy-admin/commit/436179c1269214281ab76d3e5e751e2502341158))

## [1.10.0](https://github.com/I-am-PUID-0/traefik-proxy-admin/compare/v1.9.0...v1.10.0) (2026-05-26)


### Features

* **backup:** implement backup and restore functionality with UI integration ([cb8dbd2](https://github.com/I-am-PUID-0/traefik-proxy-admin/commit/cb8dbd2d491f1bab6b5cd4ecd2ef4c139dc020d1)), closes [#26](https://github.com/I-am-PUID-0/traefik-proxy-admin/issues/26)
* **docs:** add documentation pages and context help components ([9a48c11](https://github.com/I-am-PUID-0/traefik-proxy-admin/commit/9a48c11c742a31dbcd50c5017be815f97fe478c5)), closes [#25](https://github.com/I-am-PUID-0/traefik-proxy-admin/issues/25)
* **logs:** add Traefik access log functionality and viewer ([c71c904](https://github.com/I-am-PUID-0/traefik-proxy-admin/commit/c71c90410b6b352d611dd62fa48d2bedc78071b5))

## [1.9.0](https://github.com/I-am-PUID-0/traefik-proxy-admin/compare/v1.8.1...v1.9.0) (2026-05-26)


### Features

* **auth:** enhance session management with risk context and user agent tracking ([c180cc0](https://github.com/I-am-PUID-0/traefik-proxy-admin/commit/c180cc011e61e0c00fe42fa0575e5547016209ac))

## [1.8.1](https://github.com/I-am-PUID-0/traefik-proxy-admin/compare/v1.8.0...v1.8.1) (2026-05-22)


### Bug Fixes

* **auth:** enhance service authentication response handling ([54d227a](https://github.com/I-am-PUID-0/traefik-proxy-admin/commit/54d227ae95b5b72b8ed523353369d68bb2e51df6))

## [1.8.0](https://github.com/I-am-PUID-0/traefik-proxy-admin/compare/v1.7.0...v1.8.0) (2026-05-22)


### Features

* add import preview API for Traefik routers and services ([b772fd6](https://github.com/I-am-PUID-0/traefik-proxy-admin/commit/b772fd6e0ccd567da5c1312956ee435c382e1bff))
* enhance session management with filtering, sorting, and improved UI ([c755262](https://github.com/I-am-PUID-0/traefik-proxy-admin/commit/c75526218a4f8990bf557cc50e4f10b24d8449ec))


### Bug Fixes

* **sso:** replace fetchWithTimeout with AbortController for token and userinfo requests ([5855c48](https://github.com/I-am-PUID-0/traefik-proxy-admin/commit/5855c482fb7d49a2bb88f10ae6873cb0d05fcc04))
* update homepage test to check for correct heading visibility ([c863750](https://github.com/I-am-PUID-0/traefik-proxy-admin/commit/c86375085795952466745fa4bf103bbd3252c29c))

## [1.7.0](https://github.com/I-am-PUID-0/traefik-proxy-admin/compare/v1.6.4...v1.7.0) (2026-05-22)


### Features

* **auth:** support multi-domain service SSO sessions ([084760d](https://github.com/I-am-PUID-0/traefik-proxy-admin/commit/084760dd65232a7b102c3b3680db2b96e20f005e))

## [1.6.4](https://github.com/I-am-PUID-0/traefik-proxy-admin/compare/v1.6.3...v1.6.4) (2026-05-22)


### Bug Fixes

* **sso:** enhance SSO error handling and improve shared link descriptions ([bd7188a](https://github.com/I-am-PUID-0/traefik-proxy-admin/commit/bd7188ae38f6c1e93169287ebc70cfd2c1798b01))

## [1.6.3](https://github.com/I-am-PUID-0/traefik-proxy-admin/compare/v1.6.2...v1.6.3) (2026-05-22)


### Bug Fixes

* **sso:** implement signed SSO state management for secure authentication ([c2a2083](https://github.com/I-am-PUID-0/traefik-proxy-admin/commit/c2a2083751578ab5bbcb3e23ae5a0eff3f8d1de9))

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
