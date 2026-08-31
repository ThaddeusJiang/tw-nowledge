import {
  LEGACY_NOWLEDGE_MEM_TAG,
  buildMemoryRequest,
  isMemoryDigest,
  localSourceDigest,
  memoryIdFromUri,
  memorySyncDigest,
  memoryUri,
  stableMemoryId,
  type LocalTiddler,
  type MemoryCreateRequest,
  type MemoryInput,
} from "./protocol.ts";

export type SyncState =
  | "unlinked"
  | "synced"
  | "local-changed"
  | "remote-changed"
  | "conflict"
  | "error";

export interface SyncResult {
  message?: string;
  state: SyncState;
}

export interface RemoteMemory {
  content: string;
  id: string;
  metadata: Record<string, unknown>;
  space_id?: string;
  title: string;
}

export interface RemoteMemoryClient {
  get(id: string): Promise<RemoteMemory | undefined>;
  upsert(request: MemoryCreateRequest): Promise<RemoteMemory>;
}

export interface ContentConverter {
  markdownToWikiText(markdown: string): Promise<string>;
  sanitizeMarkdown(markdown: string): string;
  wikiTextToMarkdown(tiddler: LocalTiddler): Promise<string>;
}

export interface TiddlerPatch {
  nmemDigest?: string;
  nmemTiddlerDigest?: string;
  nmemUri?: string;
  text?: string;
  type?: string;
}

export interface TiddlerRepository {
  get(title: string): LocalTiddler | undefined;
  update(expectedRevision: string, patch: TiddlerPatch): boolean;
}

interface SyncEngineOptions {
  converter: ContentConverter;
  destination: { apiUrl: string; spaceId: string };
  identity: { sourceWiki: string; wikiId: string };
  remote: RemoteMemoryClient;
  repository: TiddlerRepository;
}

interface Inspection extends SyncResult {
  local?: LocalTiddler;
  localDigest?: string;
  localMemory?: MemoryInput;
  remoteDigest?: string;
  remoteMemory?: MemoryInput;
}

function stringMetadata(metadata: Record<string, unknown>, key: string): string {
  const value = metadata[key];
  if (typeof value !== "string") {
    throw new Error(`The linked Memory is missing ${key} metadata.`);
  }
  return value;
}

function tagsMetadata(metadata: Record<string, unknown>): string[] {
  const value = metadata.tiddlywiki_tags;
  if (!Array.isArray(value) || !value.every((tag) => typeof tag === "string")) {
    throw new Error("The linked Memory has invalid tiddlywiki_tags metadata.");
  }
  return value;
}

function remoteMemoryInput(remote: RemoteMemory): MemoryInput {
  if (!remote.id || typeof remote.content !== "string" || typeof remote.title !== "string") {
    throw new Error("The linked Memory response is malformed.");
  }
  return {
    content: remote.content,
    created: stringMetadata(remote.metadata, "tiddlywiki_created"),
    id: remote.id,
    modified: stringMetadata(remote.metadata, "tiddlywiki_modified"),
    sourceWiki: stringMetadata(remote.metadata, "tiddlywiki_source"),
    tags: tagsMetadata(remote.metadata),
    title: remote.title,
    wikiId: stringMetadata(remote.metadata, "tiddlywiki_wiki_id"),
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Synchronization failed.";
}

export class SyncEngine {
  readonly #converter: ContentConverter;
  readonly #destination: { apiUrl: string; spaceId: string };
  readonly #identity: { sourceWiki: string; wikiId: string };
  readonly #remote: RemoteMemoryClient;
  readonly #repository: TiddlerRepository;

  public constructor(options: SyncEngineOptions) {
    this.#converter = options.converter;
    this.#destination = options.destination;
    this.#identity = options.identity;
    this.#remote = options.remote;
    this.#repository = options.repository;
  }

  async #localMemory(local: LocalTiddler, id: string): Promise<MemoryInput> {
    let content: string;
    if (!local.type || local.type === "text/vnd.tiddlywiki") {
      content = await this.#converter.wikiTextToMarkdown(local);
    } else if (
      ["text/markdown", "text/x-markdown", "application/markdown", "application/x-markdown"].includes(
        local.type,
      )
    ) {
      content = this.#converter.sanitizeMarkdown(local.text);
    } else if (local.type === "text/plain") {
      content = local.text;
    } else {
      throw new Error(`Unsupported tiddler type: ${local.type}`);
    }
    return {
      content: `${content.trim()}\n`,
      created: local.created,
      id,
      modified: local.modified,
      sourceWiki: this.#identity.sourceWiki,
      tags: local.tags.filter((tag) => tag !== LEGACY_NOWLEDGE_MEM_TAG),
      title: local.title,
      wikiId: this.#identity.wikiId,
    };
  }

  public async inspect(title: string): Promise<Inspection> {
    try {
      const local = this.#repository.get(title);
      if (!local) {
        return { message: "The tiddler no longer exists.", state: "error" };
      }
      if (!local.nmemUri) {
        if (local.nmemDigest) {
          return { message: "nmem-digest exists without nmem-uri.", state: "error" };
        }
        return { local, state: "unlinked" };
      }
      const memoryId = memoryIdFromUri(local.nmemUri);
      if (!memoryId || !isMemoryDigest(local.nmemDigest)) {
        return { message: "The tiddler has invalid synchronization fields.", state: "error" };
      }

      const remote = await this.#remote.get(memoryId);
      if (!remote) {
        return { message: "The linked Memory was not found.", state: "error" };
      }
      if (remote.id !== memoryId) {
        return { message: "The linked Memory response has a mismatched id.", state: "error" };
      }

      const localDigest = await localSourceDigest(local);
      const remoteMemory = remoteMemoryInput(remote);
      const remoteDigest = await memorySyncDigest(remoteMemory, this.#destination);
      let localChanged = local.nmemTiddlerDigest
        ? local.nmemTiddlerDigest !== localDigest
        : false;
      let localMemory: MemoryInput | undefined;
      if (!local.nmemTiddlerDigest) {
        localMemory = await this.#localMemory(local, memoryId);
        localChanged = (await memorySyncDigest(localMemory, this.#destination)) !== local.nmemDigest;
      }
      const remoteChanged = remoteDigest !== local.nmemDigest;
      const state = localChanged
        ? remoteChanged
          ? "conflict"
          : "local-changed"
        : remoteChanged
          ? "remote-changed"
          : "synced";
      return { local, localDigest, localMemory, remoteDigest, remoteMemory, state };
    } catch (error) {
      return { message: errorMessage(error), state: "error" };
    }
  }

  async #writeBaselines(
    local: LocalTiddler,
    memory: MemoryInput,
    localDigest: string,
    uri: string,
  ): Promise<boolean> {
    return this.#repository.update(local.revision, {
      nmemDigest: await memorySyncDigest(memory, this.#destination),
      nmemTiddlerDigest: localDigest,
      nmemUri: uri,
    });
  }

  public async synchronize(title: string): Promise<SyncResult> {
    const inspection = await this.inspect(title);
    if (inspection.state === "error" || inspection.state === "conflict") {
      return inspection;
    }
    if (inspection.state === "synced") {
      return { state: "synced" };
    }

    try {
      const local = inspection.local;
      if (!local) {
        return { message: "The tiddler no longer exists.", state: "error" };
      }
      if (inspection.state === "unlinked") {
        const id = await stableMemoryId(this.#identity.wikiId, local.title);
        const memory = await this.#localMemory(local, id);
        const request = await buildMemoryRequest(memory, {
          spaceId: this.#destination.spaceId,
        });
        if (this.#repository.get(local.title)?.revision !== local.revision) {
          return { message: "The tiddler changed before the Memory could be created.", state: "error" };
        }
        const response = await this.#remote.upsert(request);
        if (response.id !== id) {
          return { message: "The Memory write returned a mismatched id.", state: "error" };
        }
        const localDigest = await localSourceDigest(local);
        if (!(await this.#writeBaselines(local, memory, localDigest, memoryUri(id)))) {
          return { message: "The tiddler changed before sync metadata could be saved.", state: "error" };
        }
        return { state: "synced" };
      }

      if (inspection.state === "local-changed") {
        const memory =
          inspection.localMemory ??
          (await this.#localMemory(local, memoryIdFromUri(local.nmemUri) ?? ""));
        if (!memory || !inspection.localDigest) {
          return { message: "The local synchronization snapshot is incomplete.", state: "error" };
        }
        const request = await buildMemoryRequest(memory, {
          spaceId: this.#destination.spaceId,
        });
        if (this.#repository.get(local.title)?.revision !== local.revision) {
          return { message: "The tiddler changed before the Memory could be updated.", state: "error" };
        }
        const response = await this.#remote.upsert(request);
        if (response.id !== memory.id) {
          return { message: "The Memory write returned a mismatched id.", state: "error" };
        }
        if (!(await this.#writeBaselines(local, memory, inspection.localDigest, local.nmemUri))) {
          return { message: "The tiddler changed before sync metadata could be saved.", state: "error" };
        }
        return { state: "synced" };
      }

      const remoteMemory = inspection.remoteMemory;
      const remoteDigest = inspection.remoteDigest;
      if (!remoteMemory || !remoteDigest) {
        return { message: "The remote synchronization snapshot is incomplete.", state: "error" };
      }
      const text =
        !local.type || local.type === "text/vnd.tiddlywiki"
          ? await this.#converter.markdownToWikiText(remoteMemory.content)
          : remoteMemory.content;
      const localDigest = await localSourceDigest({ ...local, text });
      if (
        !this.#repository.update(local.revision, {
          nmemDigest: remoteDigest,
          nmemTiddlerDigest: localDigest,
          nmemUri: local.nmemUri,
          text,
          type: local.type || "text/vnd.tiddlywiki",
        })
      ) {
        return { message: "The tiddler changed while the Memory was being pulled.", state: "error" };
      }
      return { state: "synced" };
    } catch (error) {
      return { message: errorMessage(error), state: "error" };
    }
  }
}
