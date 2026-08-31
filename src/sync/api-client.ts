import type { RemoteMemory, RemoteMemoryClient } from "./engine.ts";
import type { MemoryCreateRequest } from "./protocol.ts";

const DEFAULT_TIMEOUT_MS = 30_000;

interface NmemClientOptions {
  apiKey?: string;
  apiUrl: string;
  fetchImpl?: typeof fetch;
  spaceId: string;
  timeoutMs?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseRemoteMemory(value: unknown): RemoteMemory {
  if (
    !isRecord(value) ||
    typeof value.content !== "string" ||
    typeof value.id !== "string" ||
    !isRecord(value.metadata) ||
    typeof value.title !== "string"
  ) {
    throw new Error("Nowledge Mem returned a malformed Memory response.");
  }
  return {
    content: value.content,
    id: value.id,
    metadata: value.metadata,
    space_id: typeof value.space_id === "string" ? value.space_id : undefined,
    title: value.title,
  };
}

export function resolveNmemApiUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch (error) {
    throw new Error("Nowledge Mem API URL is not a valid URL.", { cause: error });
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Nowledge Mem API URL must use HTTP or HTTPS.");
  }
  if (parsed.username || parsed.password) {
    throw new Error("Nowledge Mem API URL must not contain credentials.");
  }
  if (parsed.search || parsed.hash) {
    throw new Error("Nowledge Mem API URL must not contain a query or fragment.");
  }
  return parsed.toString().replace(/\/$/u, "");
}

export class NmemClient implements RemoteMemoryClient {
  readonly #apiKey: string;
  readonly #apiUrl: string;
  readonly #fetch: typeof fetch;
  readonly #spaceId: string;
  readonly #timeoutMs: number;

  public constructor(options: NmemClientOptions) {
    this.#apiKey = options.apiKey?.trim() ?? "";
    this.#apiUrl = resolveNmemApiUrl(options.apiUrl);
    this.#fetch = (options.fetchImpl ?? globalThis.fetch).bind(globalThis);
    this.#spaceId = options.spaceId;
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!Number.isFinite(this.#timeoutMs) || this.#timeoutMs <= 0) {
      throw new Error("Nowledge Mem request timeout must be positive.");
    }
  }

  #url(path: string): URL {
    return new URL(path, `${this.#apiUrl}/`);
  }

  #headers(json = false): Record<string, string> {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (json) {
      headers["Content-Type"] = "application/json";
    }
    if (this.#apiKey) {
      headers.Authorization = `Bearer ${this.#apiKey}`;
    }
    return headers;
  }

  async #request(url: URL, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeout = globalThis.setTimeout(() => controller.abort(), this.#timeoutMs);
    try {
      return await this.#fetch(url, {
        ...init,
        redirect: "error",
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error("Nowledge Mem request timed out.", { cause: error });
      }
      throw new Error("Nowledge Mem request failed.", { cause: error });
    } finally {
      globalThis.clearTimeout(timeout);
    }
  }

  async #json(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch (error) {
      throw new Error("Nowledge Mem returned invalid JSON.", { cause: error });
    }
  }

  public async get(id: string): Promise<RemoteMemory | undefined> {
    const url = this.#url(`memories/${encodeURIComponent(id)}`);
    url.searchParams.set("space_id", this.#spaceId);
    const response = await this.#request(url, {
      headers: this.#headers(),
      method: "GET",
    });
    if (response.status === 404) {
      return undefined;
    }
    if (!response.ok) {
      throw new Error(`Nowledge Mem read failed with HTTP ${response.status}.`);
    }
    return parseRemoteMemory(await this.#json(response));
  }

  public async upsert(request: MemoryCreateRequest): Promise<RemoteMemory> {
    const response = await this.#request(this.#url("memories"), {
      body: JSON.stringify(request),
      headers: this.#headers(true),
      method: "POST",
    });
    if (!response.ok) {
      throw new Error(`Nowledge Mem write failed with HTTP ${response.status}.`);
    }
    const body = await this.#json(response);
    if (!isRecord(body)) {
      throw new Error("Nowledge Mem returned a malformed write response.");
    }
    const memory = parseRemoteMemory(body.memory);
    if (memory.id !== request.id) {
      throw new Error("Nowledge Mem returned a mismatched Memory id.");
    }
    return memory;
  }
}
