"use client";

import NextLink from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { LogOut, Settings, Menu, X } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { PalettePicker } from "@/components/palette-picker";
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
      .then(async (response) => {
        if (response.status === 401) {
          const returnTo = window.location.pathname + window.location.search;
          window.location.href = `/auth/login?returnTo=${encodeURIComponent(returnTo)}`;
          return null;
        }

        return response.ok ? response.json() : null;
      })
      .then((payload) => {
        if (payload) setAdminSession(payload.session || null);
      })
      .catch(() => setAdminSession(null));
  }, []);

  async function logout() {
    await fetch("/api/auth/admin/logout", { method: "POST" });
    window.location.href = "/auth/login";
  }

  const isActive = (path: string) => pathname === path;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="border-b bg-card flex-shrink-0">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                {/* Plain img avoids dev hydration churn for this static SVG app mark. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/tpa-icon.svg" alt="" className="h-7 w-7" />
                <h1 className="text-xl font-bold text-foreground">
                  Traefik Admin
                </h1>
              </div>
              <nav className="hidden lg:flex space-x-6">
                <NextLink
                  href="/"
                  className={
                    isActive("/")
                      ? "text-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground"
                  }
                >
                  Services
                </NextLink>
                <NextLink
                  href="/domains"
                  className={
                    isActive("/domains")
                      ? "text-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground"
                  }
                >
                  Domains
                </NextLink>
                <NextLink
                  href="/security"
                  className={
                    isActive("/security")
                      ? "text-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground"
                  }
                >
                  Security
                </NextLink>
                <NextLink
                  href="/sessions"
                  className={
                    isActive("/sessions")
                      ? "text-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground"
                  }
                >
                  Sessions
                </NextLink>
                <NextLink
                  href="/traefik"
                  className={
                    isActive("/traefik")
                      ? "text-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground"
                  }
                >
                  Traefik
                </NextLink>
                <NextLink
                  href="/docs"
                  className={
                    pathname.startsWith("/docs")
                      ? "text-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground"
                  }
                >
                  Docs
                </NextLink>
                <NextLink
                  href="/config"
                  className={
                    isActive("/config")
                      ? "text-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground"
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
                <PalettePicker />
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
          <div className="lg:hidden border-t bg-card">
            <div className="container mx-auto px-4 py-4 space-y-3">
              <NextLink
                href="/"
                className={`block ${
                  isActive("/")
                    ? "text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setMobileMenuOpen(false)}
              >
                Services
              </NextLink>
              <NextLink
                href="/domains"
                className={`block ${
                  isActive("/domains")
                    ? "text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setMobileMenuOpen(false)}
              >
                Domains
              </NextLink>
              <NextLink
                href="/security"
                className={`block ${
                  isActive("/security")
                    ? "text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setMobileMenuOpen(false)}
              >
                Security
              </NextLink>
              <NextLink
                href="/sessions"
                className={`block ${
                  isActive("/sessions")
                    ? "text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setMobileMenuOpen(false)}
              >
                Sessions
              </NextLink>
              <NextLink
                href="/traefik"
                className={`block ${
                  isActive("/traefik")
                    ? "text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setMobileMenuOpen(false)}
              >
                Traefik
              </NextLink>
              <NextLink
                href="/docs"
                className={`block ${
                  pathname.startsWith("/docs")
                    ? "text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setMobileMenuOpen(false)}
              >
                Docs
              </NextLink>
              <NextLink
                href="/config"
                className={`block ${
                  isActive("/config")
                    ? "text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setMobileMenuOpen(false)}
              >
                Config
              </NextLink>
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t">
                <TraefikConfigDialog
                  trigger={
                    <Button variant="outline" size="sm">
                      <Settings className="h-4 w-4 mr-2" />
                      Traefik Config
                    </Button>
                  }
                />
                <PalettePicker />
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
