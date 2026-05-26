import "server-only";
import { readFile } from "fs/promises";
import path from "path";

export interface DocPageMeta {
  slug: string;
  title: string;
  description: string;
  file: string;
}

export const DOC_PAGES: DocPageMeta[] = [
  {
    slug: "deployment",
    title: "Deployment",
    description: "Production setup, environment, backups, restores, and upgrades.",
    file: "deployment.md",
  },
  {
    slug: "authentication",
    title: "Authentication",
    description: "Admin auth, service auth, SSO/OIDC, shared links, and sessions.",
    file: "authentication.md",
  },
  {
    slug: "services",
    title: "Service Configuration",
    description: "Services, domains, middlewares, advanced routers, and imports.",
    file: "services.md",
  },
  {
    slug: "traefik",
    title: "Traefik Integration",
    description: "HTTP provider setup, forwardAuth, live discovery, and diagnostics.",
    file: "traefik.md",
  },
  {
    slug: "security-hardening",
    title: "Security Hardening",
    description: "Production checklist, cookies, probes, API exposure, and secrets.",
    file: "security-hardening.md",
  },
  {
    slug: "development",
    title: "Development",
    description: "Devcontainer usage, local Traefik setup, and verification.",
    file: "development.md",
  },
];

export function getDocPage(slug?: string) {
  return DOC_PAGES.find((page) => page.slug === slug) || DOC_PAGES[0];
}

export async function getDocMarkdown(slug?: string) {
  const page = getDocPage(slug);
  const filePath = path.join(process.cwd(), "docs", page.file);
  const markdown = await readFile(filePath, "utf8");
  return { page, markdown };
}
