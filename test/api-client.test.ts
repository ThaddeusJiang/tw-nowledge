import assert from "node:assert/strict";
import test from "node:test";

import { NmemClient, resolveNmemApiUrl } from "../src/sync/api-client.ts";
import type { MemoryCreateRequest } from "../src/sync/protocol.ts";

const memory = {
  content: "# Hello",
  id: "12345678-1234-5123-8123-123456789abc",
  metadata: {
    tiddlywiki_created: "2026-08-31T00:00:00.000Z",
    tiddlywiki_modified: "2026-08-31T01:00:00.000Z",
    tiddlywiki_source: "My Wiki",
    tiddlywiki_tags: ["alpha"],
    tiddlywiki_title: "Hello",
    tiddlywiki_wiki_id: "my-wiki",
  },
  space_id: "default",
  title: "Hello",
};

const request: MemoryCreateRequest = {
  ...memory,
  labels: ["tiddlywiki", "alpha"],
  source: "tiddlywiki",
  source_app: "tiddlynmem",
};

test("validates and normalizes the selected API URL", () => {
  assert.equal(resolveNmemApiUrl("http://127.0.0.1:14242/"), "http://127.0.0.1:14242");
  assert.throws(() => resolveNmemApiUrl("file:///tmp/nmem"), /HTTP or HTTPS/u);
  assert.throws(() => resolveNmemApiUrl("https://user:secret@example.com"), /credentials/u);
  assert.throws(() => resolveNmemApiUrl("https://example.com?token=secret"), /query or fragment/u);
});

test("reads only the exact linked Memory without following redirects", async () => {
  let captured: { input: RequestInfo | URL; init?: RequestInit } | undefined;
  let fetchReceiver: unknown;
  const client = new NmemClient({
    apiKey: "secret-key",
    apiUrl: "http://127.0.0.1:14242",
    fetchImpl: async function fetchMemory(input, init) {
      fetchReceiver = this;
      captured = { input, init };
      return Response.json(memory);
    },
    spaceId: "personal notes",
  });

  assert.deepEqual(await client.get(memory.id), memory);
  assert.equal(
    String(captured?.input),
    `http://127.0.0.1:14242/memories/${memory.id}?space_id=personal+notes`,
  );
  assert.equal(captured?.init?.method, "GET");
  assert.equal(captured?.init?.redirect, "error");
  assert.equal((captured?.init?.headers as Record<string, string>).Authorization, "Bearer secret-key");
  assert.equal(fetchReceiver, globalThis);
});

test("upserts content only in a JSON request body and validates the returned id", async () => {
  let captured: { input: RequestInfo | URL; init?: RequestInit } | undefined;
  const client = new NmemClient({
    apiUrl: "http://127.0.0.1:14242",
    fetchImpl: async (input, init) => {
      captured = { input, init };
      return Response.json({ action: "created", memory });
    },
    spaceId: "default",
  });

  assert.deepEqual(await client.upsert(request), memory);
  assert.equal(String(captured?.input), "http://127.0.0.1:14242/memories");
  assert.equal(captured?.init?.method, "POST");
  assert.equal(captured?.init?.redirect, "error");
  assert.deepEqual(JSON.parse(String(captured?.init?.body)), request);
  assert.ok(!String(captured?.input).includes("Hello"));
});

test("returns undefined for a missing linked Memory", async () => {
  const client = new NmemClient({
    apiUrl: "http://127.0.0.1:14242",
    fetchImpl: async () => new Response(null, { status: 404 }),
    spaceId: "default",
  });

  assert.equal(await client.get(memory.id), undefined);
});

test("does not expose response bodies or credentials in errors", async () => {
  const client = new NmemClient({
    apiKey: "super-secret",
    apiUrl: "http://127.0.0.1:14242",
    fetchImpl: async () => new Response("private server details", { status: 500 }),
    spaceId: "default",
  });

  await assert.rejects(
    () => client.get(memory.id),
    (error: Error) => {
      assert.match(error.message, /HTTP 500/u);
      assert.ok(!error.message.includes("private server details"));
      assert.ok(!error.message.includes("super-secret"));
      return true;
    },
  );
});
