"use client";

import NextLink from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { LogOut, Settings, Menu, X } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { TraefikConfigDialog } from "@/components/traefik-config-dialog";
import { AppFooter } from "@/components/app-footer";

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [adminSession, setAdminSession] = useState<{ name?: string; role: string } | null>(null);

  useEffect(() => {
    fetch("/api/auth/admin/me")
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => setAdminSession(payload?.session || null))
      .catch(() => setAdminSession(null));
  }, []);

  async function logout() {
    await fetch("/api/auth/admin/logout", { method: "POST" });
    window.location.href = "/auth/login";
  }

  const isActive = (path: string) => pathname === path;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col">
      {/* Header */}
      <div className="border-b bg-white dark:bg-gray-800 flex-shrink-0">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                {/* Plain img avoids dev hydration churn for this static SVG app mark. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/tpa-icon.svg" alt="" className="h-7 w-7" />
                <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                  Traefik Admin
                </h1>
              </div>
              <nav className="hidden lg:flex space-x-6">
                <NextLink
                  href="/"
                  className={
                    isActive("/")
                      ? "text-gray-900 dark:text-gray-100 font-medium"
                      : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
                  }
                >
                  Services
                </NextLink>
                <NextLink
                  href="/domains"
                  className={
                    isActive("/domains")
                      ? "text-gray-900 dark:text-gray-100 font-medium"
                      : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
                  }
                >
                  Domains
                </NextLink>
                <NextLink
                  href="/security"
                  className={
                    isActive("/security")
                      ? "text-gray-900 dark:text-gray-100 font-medium"
                      : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
                  }
                >
                  Security
                </NextLink>
                <NextLink
                  href="/sessions"
                  className={
                    isActive("/sessions")
                      ? "text-gray-900 dark:text-gray-100 font-medium"
                      : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
                  }
                >
                  Sessions
                </NextLink>
                <NextLink
                  href="/traefik"
                  className={
                    isActive("/traefik")
                      ? "text-gray-900 dark:text-gray-100 font-medium"
                      : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
                  }
                >
                  Traefik
                </NextLink>
                <NextLink
                  href="/docs"
                  className={
                    pathname.startsWith("/docs")
                      ? "text-gray-900 dark:text-gray-100 font-medium"
                      : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
                  }
                >
                  Docs
                </NextLink>
                <NextLink
                  href="/config"
                  className={
                    isActive("/config")
                      ? "text-gray-900 dark:text-gray-100 font-medium"
                      : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
                  }
                >
                  Config
                </NextLink>
              </nav>
            </div>
            <div className="flex items-center gap-2">
              <div className="hidden lg:flex items-center gap-2">
                <TraefikConfigDialog
                  trigger={
                    <Button variant="outline" size="sm">
                      <Settings className="h-4 w-4 mr-2" />
                      Traefik Config
                    </Button>
                  }
                />
                <ThemeToggle />
                {adminSession && (
                  <Button variant="outline" size="sm" onClick={logout}>
                    <LogOut className="h-4 w-4 mr-2" />
                    {adminSession.name || adminSession.role}
                  </Button>
                )}
              </div>
              {/* Mobile menu button */}
              <Button
                variant="ghost"
                size="sm"
                className="lg:hidden"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              >
                {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </Button>
            </div>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-t bg-white dark:bg-gray-800">
            <div className="container mx-auto px-4 py-4 space-y-3">
              <NextLink
                href="/"
                className={`block ${
                  isActive("/")
                    ? "text-gray-900 dark:text-gray-100 font-medium"
                    : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
                }`}
                onClick={() => setMobileMenuOpen(false)}
              >
                Services
              </NextLink>
              <NextLink
                href="/domains"
                className={`block ${
                  isActive("/domains")
                    ? "text-gray-900 dark:text-gray-100 font-medium"
                    : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
                }`}
                onClick={() => setMobileMenuOpen(false)}
              >
                Domains
              </NextLink>
              <NextLink
                href="/security"
                className={`block ${
                  isActive("/security")
                    ? "text-gray-900 dark:text-gray-100 font-medium"
                    : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
                }`}
                onClick={() => setMobileMenuOpen(false)}
              >
                Security
              </NextLink>
              <NextLink
                href="/sessions"
                className={`block ${
                  isActive("/sessions")
                    ? "text-gray-900 dark:text-gray-100 font-medium"
                    : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
                }`}
                onClick={() => setMobileMenuOpen(false)}
              >
                Sessions
              </NextLink>
              <NextLink
                href="/traefik"
                className={`block ${
                  isActive("/traefik")
                    ? "text-gray-900 dark:text-gray-100 font-medium"
                    : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
                }`}
                onClick={() => setMobileMenuOpen(false)}
              >
                Traefik
              </NextLink>
              <NextLink
                href="/docs"
                className={`block ${
                  pathname.startsWith("/docs")
                    ? "text-gray-900 dark:text-gray-100 font-medium"
                    : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
                }`}
                onClick={() => setMobileMenuOpen(false)}
              >
                Docs
              </NextLink>
              <NextLink
                href="/config"
                className={`block ${
                  isActive("/config")
                    ? "text-gray-900 dark:text-gray-100 font-medium"
                    : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
                }`}
                onClick={() => setMobileMenuOpen(false)}
              >
                Config
              </NextLink>
              <div className="flex items-center gap-2 pt-2 border-t">
                <TraefikConfigDialog
                  trigger={
                    <Button variant="outline" size="sm">
                      <Settings className="h-4 w-4 mr-2" />
                      Traefik Config
                    </Button>
                  }
                />
                <ThemeToggle />
                {adminSession && (
                  <Button variant="outline" size="sm" onClick={logout}>
                    <LogOut className="h-4 w-4 mr-2" />
                    Sign out
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        <div className="container mx-auto px-4 py-8 flex-1">
          {children}
        </div>
        <AppFooter />
      </div>
    </div>
  );
}