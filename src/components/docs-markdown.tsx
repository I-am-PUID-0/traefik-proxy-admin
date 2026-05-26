import Link from "next/link";
import { Fragment, ReactNode } from "react";

import { cn } from "@/lib/utils";

function inlineMarkdown(text: string, currentSlug: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(`([^`]+)`)|\[([^\]]+)\]\(([^)]+)\)|(\*\*([^*]+)\*\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text))) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));

    if (match[2]) {
      nodes.push(<code key={match.index}>{match[2]}</code>);
    } else if (match[3] && match[4]) {
      nodes.push(renderLink(match[3], match[4], currentSlug, match.index));
    } else if (match[6]) {
      nodes.push(<strong key={match.index}>{match[6]}</strong>);
    }

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

function renderLink(label: string, href: string, currentSlug: string, key: number) {
  if (href.startsWith("http://") || href.startsWith("https://")) {
    return (
      <a key={key} href={href} target="_blank" rel="noreferrer">
        {label}
      </a>
    );
  }

  if (href.startsWith("#")) {
    return <a key={key} href={href}>{label}</a>;
  }

  const [target, hash] = href.split("#");
  if (target.endsWith(".md")) {
    const slug = target.replace(/\.md$/, "");
    return (
      <Link key={key} href={`/docs/${slug}${hash ? `#${hash}` : ""}`}>
        {label}
      </Link>
    );
  }

  return <Link key={key} href={`/docs/${currentSlug}`}>{label}</Link>;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/`/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

function flushParagraph(lines: string[], currentSlug: string, output: ReactNode[]) {
  if (lines.length === 0) return;
  output.push(
    <p key={`p-${output.length}`}>
      {inlineMarkdown(lines.join(" "), currentSlug)}
    </p>,
  );
  lines.length = 0;
}

function flushList(items: string[], currentSlug: string, output: ReactNode[], ordered: boolean) {
  if (items.length === 0) return;
  const children = items.map((item, index) => (
    <li key={`${index}-${item}`}>{inlineMarkdown(item, currentSlug)}</li>
  ));
  output.push(ordered ? <ol key={`ol-${output.length}`}>{children}</ol> : <ul key={`ul-${output.length}`}>{children}</ul>);
  items.length = 0;
}

function flushTable(rows: string[][], currentSlug: string, output: ReactNode[]) {
  if (rows.length === 0) return;
  const [head, ...body] = rows;
  output.push(
    <div key={`table-${output.length}`} className="docs-table-wrap">
      <table>
        <thead>
          <tr>
            {head.map((cell) => (
              <th key={cell}>{inlineMarkdown(cell, currentSlug)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td key={`${cellIndex}-${cell}`}>{inlineMarkdown(cell, currentSlug)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>,
  );
  rows.length = 0;
}

function flushCode(lines: string[], language: string, output: ReactNode[]) {
  output.push(
    <pre key={`code-${output.length}`} data-language={language || undefined}>
      <code>{lines.join("\n")}</code>
    </pre>,
  );
  lines.length = 0;
}

function parseTableRow(line: string) {
  if (!line.trim().startsWith("|")) return null;
  const cells = line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
  if (cells.every((cell) => /^:?-{3,}:?$/.test(cell))) return "separator" as const;
  return cells;
}

export function DocsMarkdown({ markdown, slug, className }: { markdown: string; slug: string; className?: string }) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const output: ReactNode[] = [];
  const paragraph: string[] = [];
  const list: string[] = [];
  const table: string[][] = [];
  const code: string[] = [];
  let inCode = false;
  let language = "";
  let orderedList = false;

  for (const line of lines) {
    const codeFence = line.match(/^```(.*)$/);
    if (codeFence) {
      if (inCode) {
        flushCode(code, language, output);
        inCode = false;
        language = "";
      } else {
        flushParagraph(paragraph, slug, output);
        flushList(list, slug, output, orderedList);
        flushTable(table, slug, output);
        inCode = true;
        language = codeFence[1]?.trim() || "";
      }
      continue;
    }

    if (inCode) {
      code.push(line);
      continue;
    }

    const tableRow = parseTableRow(line);
    if (tableRow) {
      flushParagraph(paragraph, slug, output);
      flushList(list, slug, output, orderedList);
      if (tableRow !== "separator") table.push(tableRow);
      continue;
    }

    if (!line.trim()) {
      flushParagraph(paragraph, slug, output);
      flushList(list, slug, output, orderedList);
      flushTable(table, slug, output);
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushParagraph(paragraph, slug, output);
      flushList(list, slug, output, orderedList);
      flushTable(table, slug, output);
      const level = heading[1].length;
      const text = heading[2].trim();
      const id = slugify(text);
      const content = inlineMarkdown(text, slug);
      if (level === 1) output.push(<h1 key={id} id={id}>{content}</h1>);
      else if (level === 2) output.push(<h2 key={id} id={id}>{content}</h2>);
      else if (level === 3) output.push(<h3 key={id} id={id}>{content}</h3>);
      else output.push(<h4 key={id} id={id}>{content}</h4>);
      continue;
    }

    const unorderedItem = line.match(/^[-*]\s+(.+)$/);
    const orderedItem = line.match(/^\d+\.\s+(.+)$/);
    if (unorderedItem || orderedItem) {
      flushParagraph(paragraph, slug, output);
      flushTable(table, slug, output);
      const nextOrdered = Boolean(orderedItem);
      if (list.length > 0 && orderedList !== nextOrdered) flushList(list, slug, output, orderedList);
      orderedList = nextOrdered;
      list.push((unorderedItem || orderedItem)?.[1] || "");
      continue;
    }

    paragraph.push(line.trim());
  }

  if (inCode) flushCode(code, language, output);
  flushParagraph(paragraph, slug, output);
  flushList(list, slug, output, orderedList);
  flushTable(table, slug, output);

  return <div className={cn("docs-markdown", className)}>{output.map((node, index) => <Fragment key={index}>{node}</Fragment>)}</div>;
}
