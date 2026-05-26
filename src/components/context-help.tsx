"use client";

import Link from "next/link";
import { HelpCircle, X } from "lucide-react";
import { ReactNode, useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ContextHelpProps {
  title: string;
  children: ReactNode;
  href?: string;
  linkLabel?: string;
  className?: string;
}

export function ContextHelp({ title, children, href, linkLabel = "Open docs", className }: ContextHelpProps) {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <span className={cn("relative inline-flex align-middle", className)}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Help: ${title}`}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
        className="h-6 w-6 rounded-full text-muted-foreground hover:text-foreground"
      >
        <HelpCircle className="h-4 w-4" />
      </Button>
      {open && (
        <span
          id={id}
          role="note"
          className="absolute right-0 top-8 z-40 block w-80 max-w-[calc(100vw-2rem)] rounded-md border bg-popover p-4 text-left text-sm text-popover-foreground shadow-lg"
        >
          <span className="mb-2 flex items-start justify-between gap-3">
            <span className="font-semibold leading-5">{title}</span>
            <button
              type="button"
              aria-label="Close help"
              onClick={() => setOpen(false)}
              className="rounded-sm text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <X className="h-4 w-4" />
            </button>
          </span>
          <span className="block space-y-2 text-muted-foreground">{children}</span>
          {href && (
            <Link href={href} className="mt-3 block text-sm font-medium text-secondary hover:underline" onClick={() => setOpen(false)}>
              {linkLabel}
            </Link>
          )}
        </span>
      )}
    </span>
  );
}

export function HelpLabel({ children, help }: { children: ReactNode; help: ReactNode }) {
  return <span className="inline-flex items-center gap-1.5">{children}{help}</span>;
}
