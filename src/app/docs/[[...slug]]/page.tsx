import Link from "next/link";
import { BookOpen, FileText } from "lucide-react";

import { AppLayout } from "@/components/app-layout";
import { DocsMarkdown } from "@/components/docs-markdown";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { DOC_PAGES, getDocMarkdown, getDocPage } from "@/lib/docs";
import { cn } from "@/lib/utils";

interface DocsPageProps {
  params: Promise<{ slug?: string[] }>;
}

export async function generateStaticParams() {
  return DOC_PAGES.map((page) => ({ slug: [page.slug] }));
}

export async function generateMetadata({ params }: DocsPageProps) {
  const resolved = await params;
  const page = getDocPage(resolved.slug?.[0]);
  return {
    title: `${page.title} | TPA Docs`,
    description: page.description,
  };
}

export default async function DocsPage({ params }: DocsPageProps) {
  const resolved = await params;
  const { page, markdown } = await getDocMarkdown(resolved.slug?.[0]);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <BookOpen className="h-4 w-4" />
              Application Docs
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">{page.title}</h1>
            <p className="text-gray-600 dark:text-gray-400">{page.description}</p>
          </div>
          <Badge variant="outline">Bundled with TPA</Badge>
        </div>

        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <aside className="lg:sticky lg:top-6 lg:self-start">
            <Card>
              <CardContent className="p-3">
                <nav className="space-y-1">
                  {DOC_PAGES.map((item) => {
                    const active = item.slug === page.slug;
                    return (
                      <Link
                        key={item.slug}
                        href={`/docs/${item.slug}`}
                        className={cn(
                          "flex items-start gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                          active
                            ? "bg-primary/15 text-foreground"
                            : "text-muted-foreground hover:bg-accent hover:text-foreground",
                        )}
                      >
                        <FileText className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>
                          <span className="block font-medium">{item.title}</span>
                          <span className="block text-xs text-muted-foreground">{item.description}</span>
                        </span>
                      </Link>
                    );
                  })}
                </nav>
              </CardContent>
            </Card>
          </aside>

          <article className="min-w-0 rounded-md border bg-card p-5 shadow-sm md:p-7">
            <DocsMarkdown markdown={markdown} slug={page.slug} />
          </article>
        </div>
      </div>
    </AppLayout>
  );
}
