import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMemoryRequest,
  localSourceDigest,
  memoryFingerprint,
  memorySyncDigest,
  stableMemoryId,
  type LocalTiddler,
  type MemoryInput,
} from "../src/sync/protocol.ts";

const memory: MemoryInput = {
  content: "# Hello",
  created: "2026-08-31T00:00:00.000Z",
  id: "12345678-1234-5123-8123-123456789abc",
  modified: "2026-08-31T01:00:00.000Z",
  sourceWiki: "My Wiki",
  tags: ["alpha", "中文"],
  title: "Hello",
  wikiId: "my-wiki",
};

test("matches the tiddlynmem fingerprint and destination digest contract", async () => {
  assert.equal(
    await memoryFingerprint(memory),
    "e31bd363e7bd4e965d254b852d67ad0c11472a83448d2d75e7c8254df4bed61d",
  );
  assert.equal(
    await memorySyncDigest(memory, {
      apiUrl: "http://127.0.0.1:14242",
      spaceId: "default",
    }),
    "sha256:b2dfb736a3984e40dd1f600dd680b3797dfa5102af38a103d015152a926fa6d6",
  );
});

test("matches the importer's deterministic Memory identity", async () => {
  assert.equal(
    await stableMemoryId("my-wiki", "Hello"),
    "a59b6e96-82ac-51af-9f84-1bee1d775faf",
  );
});

test("builds the importer-compatible native Memory request", async () => {
  assert.deepEqual(await buildMemoryRequest(memory, { spaceId: "default" }), {
    content: "# Hello",
    id: "12345678-1234-5123-8123-123456789abc",
    labels: ["tiddlywiki", "tiddlywiki-my-wiki", "alpha", "中文"],
    metadata: {
      tiddlywiki_created: "2026-08-31T00:00:00.000Z",
      tiddlywiki_modified: "2026-08-31T01:00:00.000Z",
      tiddlywiki_source: "My Wiki",
      tiddlywiki_tags: ["alpha", "中文"],
      tiddlywiki_title: "Hello",
      tiddlywiki_wiki_id: "my-wiki",
    },
    source: "tiddlywiki",
    source_app: "tiddlynmem",
    space_id: "default",
    title: "Hello",
  });
});

test("local source digest ignores sync fields but detects source changes", async () => {
  const tiddler: LocalTiddler = {
    created: "2026-08-31T00:00:00.000Z",
    modified: "2026-08-31T01:00:00.000Z",
    nmemDigest: "sha256:" + "1".repeat(64),
    nmemLocalDigest: "sha256:" + "2".repeat(64),
    nmemUri: "nowledgemem://memory/12345678-1234-5123-8123-123456789abc",
    revision: "one",
    tags: ["alpha", "$:/NowledgeMem"],
    text: "hello",
    title: "Hello",
    type: "text/markdown",
  };
  const digest = await localSourceDigest(tiddler);

  assert.equal(
    await localSourceDigest({
      ...tiddler,
      nmemDigest: "sha256:" + "3".repeat(64),
      nmemLocalDigest: "sha256:" + "4".repeat(64),
    }),
    digest,
  );
  assert.notEqual(await localSourceDigest({ ...tiddler, text: "changed" }), digest);
});
