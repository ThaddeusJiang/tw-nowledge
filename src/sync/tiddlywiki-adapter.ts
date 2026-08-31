import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

import type { ContentConverter, TiddlerPatch, TiddlerRepository } from "./engine.ts";
import {
  NMEM_DIGEST_FIELD,
  NMEM_LOCAL_DIGEST_FIELD,
  NMEM_URI_FIELD,
  type LocalTiddler,
} from "./protocol.ts";

export type TiddlerFields = Record<string, unknown> & { title?: unknown };

export interface TiddlyWikiRuntime {
  Tiddler: new (...fields: TiddlerFields[]) => { fields: TiddlerFields };
  modules: { execute(title: string): unknown };
  rootWidget: {
    addEventListener(type: string, listener: (event: Record<string, unknown>) => unknown): void;
  };
  utils: { parseStringArray(value: unknown): string[] | null };
  wiki: {
    addEventListener(type: string, listener: (changes: Record<string, unknown>) => unknown): void;
    addTiddler(tiddler: { fields: TiddlerFields }): void;
    getTiddler(title: string): { fields: TiddlerFields } | undefined;
    getTiddlerList(title: string): string[];
    getTiddlerText(title: string, defaultText?: string): string;
    renderTiddler(outputType: string, title: string, options?: Record<string, unknown>): string;
  };
}

function normalizeRevisionValue(value: unknown): unknown {
  if (value instanceof Date) {
    return { date: value.toISOString() };
  }
  if (Array.isArray(value)) {
    return value.map(normalizeRevisionValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, normalizeRevisionValue(entry)]),
    );
  }
  return value;
}

function revisionOf(fields: TiddlerFields): string {
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(fields)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, value]) => [key, normalizeRevisionValue(value)]),
    ),
  );
}

function toIsoTimestamp(value: unknown): string {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "" : value.toISOString();
  }
  if (typeof value !== "string" || !value) {
    return "";
  }
  const match = value.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{3})$/u);
  if (!match) {
    return value;
  }
  const [, year, month, day, hour, minute, second, millisecond] = match;
  return new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
      Number(millisecond),
    ),
  ).toISOString();
}

function fieldString(fields: TiddlerFields, name: string): string {
  return typeof fields[name] === "string" ? fields[name] : "";
}

function createTurndownService(): TurndownService {
  const service = new TurndownService({
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "_",
    fence: "```",
    headingStyle: "atx",
    strongDelimiter: "**",
  });
  service.use(gfm);
  service.remove(["button", "form", "input", "script", "select", "style", "textarea"]);
  service.addRule("embeddedImage", {
    filter(node) {
      return node.nodeName === "IMG" && (node.getAttribute("src") ?? "").startsWith("data:");
    },
    replacement(_content, node) {
      const alt = node.getAttribute("alt")?.trim();
      return alt ? `[Embedded image: ${alt}]` : "[Embedded image omitted]";
    },
  });
  return service;
}

export function sanitizeMarkdownMedia(markdown: string): string {
  const imagePattern =
    /!\[([^\]\r\n]*)\]\(\s*(?:<([^>\r\n]+)>|([^\s)\r\n]+))(?:\s+(?:"[^"\r\n]*"|'[^'\r\n]*'|\([^\)\r\n]*\)))?\s*\)/giu;
  const referenceImagePattern = /!\[([^\]\r\n]*)\]\[([^\]\r\n]*)\]/gu;
  const shortcutReferenceImagePattern = /!\[([^\]\r\n]+)\](?![\[(])/gu;
  const referenceDefinitionPattern =
    /^ {0,3}\[([^\]\r\n]+)\]:[ \t]*(?:<([^>\r\n]+)>|([^ \t\r\n]+))(?:[ \t]+.*)?$/gmu;
  const rawImagePattern =
    /<img\b[^>]*\bsrc=(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))[^>]*>/giu;
  const definitions = new Map<string, string>();
  const referencedLabels = new Set<string>();
  const normalizeReference = (value: string): string =>
    value.trim().replace(/\s+/gu, " ").toLowerCase();
  for (const match of markdown.matchAll(referenceDefinitionPattern)) {
    definitions.set(
      normalizeReference(match[1] ?? ""),
      (match[2] ?? match[3] ?? "").trim(),
    );
  }
  const embeddedImageMarker = (alt: string): string => {
    const label = alt.trim();
    return label ? `[Embedded image: ${label}]` : "[Embedded image omitted]";
  };

  let sanitized = markdown.replace(
    imagePattern,
    (match, alt: string, angledSource?: string, bareSource?: string) => {
      const source = (angledSource ?? bareSource ?? "").trim();
      return /^data:/iu.test(source) ? embeddedImageMarker(alt) : match;
    },
  );
  sanitized = sanitized.replace(
    referenceImagePattern,
    (match, alt: string, reference: string) => {
      const label = normalizeReference(reference || alt);
      const source = definitions.get(label);
      if (!source) {
        return match;
      }
      referencedLabels.add(label);
      return /^data:/iu.test(source) ? embeddedImageMarker(alt) : match;
    },
  );
  sanitized = sanitized.replace(shortcutReferenceImagePattern, (match, alt: string) => {
    const label = normalizeReference(alt);
    const source = definitions.get(label);
    if (!source) {
      return match;
    }
    referencedLabels.add(label);
    return /^data:/iu.test(source) ? embeddedImageMarker(alt) : match;
  });
  sanitized = sanitized.replace(
    referenceDefinitionPattern,
    (match, label: string, angledSource?: string, bareSource?: string) => {
      const source = (angledSource ?? bareSource ?? "").trim();
      return referencedLabels.has(normalizeReference(label)) && /^data:/iu.test(source)
        ? `[${label}]: # "Embedded image omitted"`
        : match;
    },
  );
  return sanitized.replace(
    rawImagePattern,
    (
      match,
      doubleQuotedSource?: string,
      singleQuotedSource?: string,
      unquotedSource?: string,
    ) => {
      const source = (doubleQuotedSource ?? singleQuotedSource ?? unquotedSource ?? "").trim();
      if (!/^data:/iu.test(source)) {
        return match;
      }
      const altMatch = match.match(/\balt=(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/iu);
      return embeddedImageMarker(altMatch?.[1] ?? altMatch?.[2] ?? altMatch?.[3] ?? "");
    },
  );
}

export class TiddlyWikiRepository implements TiddlerRepository {
  readonly #runtime: TiddlyWikiRuntime;
  readonly #revisionTitles = new Map<string, string>();

  public constructor(runtime: TiddlyWikiRuntime) {
    this.#runtime = runtime;
  }

  public get(title: string): LocalTiddler | undefined {
    const tiddler = this.#runtime.wiki.getTiddler(title);
    if (!tiddler || title.startsWith("$:/") || fieldString(tiddler.fields, "draft.of")) {
      return undefined;
    }
    const fields = tiddler.fields;
    const revision = revisionOf(fields);
    this.#revisionTitles.set(revision, title);
    const tags = Array.isArray(fields.tags)
      ? fields.tags.filter((tag): tag is string => typeof tag === "string")
      : (this.#runtime.utils.parseStringArray(fields.tags) ?? []);
    return {
      created: toIsoTimestamp(fields.created),
      modified: toIsoTimestamp(fields.modified),
      nmemDigest: fieldString(fields, NMEM_DIGEST_FIELD),
      nmemLocalDigest: fieldString(fields, NMEM_LOCAL_DIGEST_FIELD),
      nmemUri: fieldString(fields, NMEM_URI_FIELD),
      revision,
      tags,
      text: fieldString(fields, "text"),
      title,
      type: fieldString(fields, "type") || "text/vnd.tiddlywiki",
    };
  }

  public update(expectedRevision: string, patch: TiddlerPatch): boolean {
    const title = this.#revisionTitles.get(expectedRevision);
    if (!title) {
      return false;
    }
    const current = this.#runtime.wiki.getTiddler(title);
    if (!current || revisionOf(current.fields) !== expectedRevision) {
      return false;
    }
    const updates: TiddlerFields = {};
    if (patch.nmemDigest !== undefined) updates[NMEM_DIGEST_FIELD] = patch.nmemDigest;
    if (patch.nmemLocalDigest !== undefined) updates[NMEM_LOCAL_DIGEST_FIELD] = patch.nmemLocalDigest;
    if (patch.nmemUri !== undefined) updates[NMEM_URI_FIELD] = patch.nmemUri;
    if (patch.tags !== undefined) updates.tags = patch.tags;
    if (patch.text !== undefined) updates.text = patch.text;
    if (patch.type !== undefined) updates.type = patch.type;
    this.#runtime.wiki.addTiddler(new this.#runtime.Tiddler(current.fields, updates));
    return true;
  }
}

interface MarkdownTransformerModule {
  md2tid?: (markdown: string) => Promise<string> | string;
}

export class TiddlyWikiConverter implements ContentConverter {
  readonly #runtime: TiddlyWikiRuntime;

  public constructor(runtime: TiddlyWikiRuntime) {
    this.#runtime = runtime;
  }

  public async markdownToWikiText(markdown: string): Promise<string> {
    const module = this.#runtime.modules.execute(
      "$:/plugins/linonetwo/markdown-transformer/md-to-tid.js",
    ) as MarkdownTransformerModule | undefined;
    if (typeof module?.md2tid !== "function") {
      throw new Error("$:/plugins/linonetwo/markdown-transformer is required for WikiText pulls.");
    }
    return module.md2tid(markdown);
  }

  public sanitizeMarkdown(markdown: string): string {
    return sanitizeMarkdownMedia(markdown);
  }

  public async wikiTextToMarkdown(tiddler: LocalTiddler): Promise<string> {
    const html = this.#runtime.wiki.renderTiddler("text/html", tiddler.title, {
      parseAsInline: false,
    });
    const markdown = createTurndownService()
      .turndown(html)
      .replace(/\n{3,}/gu, "\n\n")
      .trim();
    return sanitizeMarkdownMedia(markdown);
  }
}
