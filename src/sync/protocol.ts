const DNS_NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
const MEMORY_ID_PATTERN =
  "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";

export const NOWLEDGE_MEM_TAG = "$:/NowledgeMem";
export const NMEM_URI_FIELD = "nmem-uri";
export const NMEM_DIGEST_FIELD = "nmem-digest";
export const NMEM_LOCAL_DIGEST_FIELD = "nmem-local-digest";

export interface LocalTiddler {
  created: string;
  modified: string;
  nmemDigest: string;
  nmemLocalDigest: string;
  nmemUri: string;
  revision: string;
  tags: string[];
  text: string;
  title: string;
  type: string;
}

export interface MemoryInput {
  content: string;
  created: string;
  id: string;
  modified: string;
  sourceWiki: string;
  tags: string[];
  title: string;
  wikiId: string;
}

export interface MemoryCreateRequest {
  content: string;
  id: string;
  labels: string[];
  metadata: {
    tiddlywiki_created: string;
    tiddlywiki_modified: string;
    tiddlywiki_source: string;
    tiddlywiki_tags: string[];
    tiddlywiki_title: string;
    tiddlywiki_wiki_id: string;
  };
  source: "tiddlywiki";
  source_app: "tiddlynmem";
  space_id: string;
  title: string;
}

function bytesToHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

async function hash(algorithm: "SHA-1" | "SHA-256", value: string | Uint8Array): Promise<string> {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const input = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(input).set(bytes);
  return bytesToHex(await globalThis.crypto.subtle.digest(algorithm, input));
}

function uuidBytes(namespace: string): Uint8Array {
  return Uint8Array.from(
    namespace.replaceAll("-", "").match(/.{2}/gu)?.map((part) => Number.parseInt(part, 16)) ?? [],
  );
}

export async function stableMemoryId(wikiId: string, title: string): Promise<string> {
  const namespace = uuidBytes(DNS_NAMESPACE);
  const value = new TextEncoder().encode(`tiddlywiki-nmem-importer\0${wikiId}\0${title}`);
  const combined = new Uint8Array(namespace.length + value.length);
  combined.set(namespace);
  combined.set(value, namespace.length);
  const digest = Uint8Array.from(
    (await hash("SHA-1", combined)).match(/.{2}/gu)?.map((part) => Number.parseInt(part, 16)) ?? [],
  ).slice(0, 16);
  digest[6] = ((digest[6] ?? 0) & 0x0f) | 0x50;
  digest[8] = ((digest[8] ?? 0) & 0x3f) | 0x80;
  const hex = [...digest].map((value) => value.toString(16).padStart(2, "0")).join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

export async function memoryFingerprint(memory: MemoryInput): Promise<string> {
  return hash(
    "SHA-256",
    JSON.stringify({
      content: memory.content,
      created: memory.created,
      id: memory.id,
      modified: memory.modified,
      sourceWiki: memory.sourceWiki,
      tags: memory.tags,
      title: memory.title,
      wikiId: memory.wikiId,
    }),
  );
}

export async function memorySyncDigest(
  memory: MemoryInput,
  destination: { apiUrl: string; spaceId: string },
): Promise<string> {
  return `sha256:${await hash(
    "SHA-256",
    JSON.stringify({
      apiUrl: destination.apiUrl,
      memory: await memoryFingerprint(memory),
      spaceId: destination.spaceId,
    }),
  )}`;
}

export async function localSourceDigest(tiddler: LocalTiddler): Promise<string> {
  return `sha256:${await hash(
    "SHA-256",
    JSON.stringify({
      created: tiddler.created,
      modified: tiddler.modified,
      tags: tiddler.tags.filter((tag) => tag !== NOWLEDGE_MEM_TAG),
      text: tiddler.text,
      title: tiddler.title,
      type: tiddler.type || "text/vnd.tiddlywiki",
    }),
  )}`;
}

export function memoryIdFromUri(uri: string): string | undefined {
  const match = uri.match(new RegExp(`^nowledgemem://memory/(${MEMORY_ID_PATTERN})$`, "u"));
  return match?.[1];
}

export function memoryUri(memoryId: string): string {
  return `nowledgemem://memory/${memoryId}`;
}

async function sourceWikiLabel(sourceWiki: string): Promise<string> {
  const slug = sourceWiki
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-|-$/gu, "");
  return slug ? `tiddlywiki-${slug}` : `tiddlywiki-${(await hash("SHA-256", sourceWiki)).slice(0, 8)}`;
}

export async function buildMemoryRequest(
  memory: MemoryInput,
  options: { spaceId?: string } = {},
): Promise<MemoryCreateRequest> {
  const spaceId = options.spaceId ?? "default";
  return {
    content: memory.content,
    id: memory.id,
    labels: [
      ...new Set(["tiddlywiki", await sourceWikiLabel(memory.sourceWiki), ...memory.tags]),
    ],
    metadata: {
      tiddlywiki_created: memory.created,
      tiddlywiki_modified: memory.modified,
      tiddlywiki_source: memory.sourceWiki,
      tiddlywiki_tags: memory.tags,
      tiddlywiki_title: memory.title,
      tiddlywiki_wiki_id: memory.wikiId,
    },
    source: "tiddlywiki",
    source_app: "tiddlynmem",
    space_id: spaceId,
    title: memory.title,
  };
}

export function isMemoryDigest(value: string): boolean {
  return /^sha256:[0-9a-f]{64}$/u.test(value);
}
