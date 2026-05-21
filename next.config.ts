import type { NextConfig } from "next";
import { execSync } from "child_process";
import packageJson from "./package.json" with { type: "json" };

function getBuildId() {
  if (process.env.BUILD_ID) {
    return process.env.BUILD_ID;
  }

  if (process.env.GITHUB_SHA) {
    return process.env.GITHUB_SHA.slice(0, 7);
  }

  if (process.env.SOURCE_COMMIT) {
    return process.env.SOURCE_COMMIT.slice(0, 7);
  }

  try {
    return execSync(
      "git describe --exact-match --tags 2> /dev/null || git rev-parse --short HEAD",
      { stdio: ["ignore", "pipe", "ignore"] },
    ).toString().trim();
  } catch {
    return packageJson.version;
  }
}

function getAllowedDevOrigins() {
  const configured = process.env.NEXT_ALLOWED_DEV_ORIGINS?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean) ?? [];

  return Array.from(new Set(["tpa-dev.jberts.world", ...configured]));
}

const nextConfig: NextConfig = {
  output: "standalone",
  generateBuildId: async () => getBuildId(),
  allowedDevOrigins: getAllowedDevOrigins(),
};

export default nextConfig;
