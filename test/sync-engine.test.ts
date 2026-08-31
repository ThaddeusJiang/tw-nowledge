import assert from "node:assert/strict";
import test from "node:test";

import {
  SyncEngine,
  type ContentConverter,
  type RemoteMemory,
  type RemoteMemoryClient,
  type TiddlerPatch,
  type TiddlerRepository,
} from "../src/sync/engine.ts";
import {
  buildMemoryRequest,
  localSourceDigest,
  memorySyncDigest,
  type LocalTiddler,
  type MemoryCreateRequest,
  type MemoryInput,
} from "../src/sync/protocol.ts";

const destination = {
  apiUrl: "http://127.0.0.1:14242",
  spaceId: "default",
};

function baseTiddler(overrides: Partial<LocalTiddler> = {}): LocalTiddler {
  return {
    created: "2026-08-31T00:00:00.000Z",
    modified: "2026-08-31T01:00:00.000Z",
    nmemDigest: "",
    nmemTiddlerDigest: "",
    nmemUri: "",
    revision: "revision-1",
    tags: ["alpha"],
    text: "wiki source",
    title: "Hello",
    type: "text/vnd.tiddlywiki",
    ...overrides,
  };
}

function memoryFor(tiddler: LocalTiddler, content = "# Hello\n"): MemoryInput {
  return {
    content,
    created: tiddler.created,
    id: "12345678-1234-5123-8123-123456789abc",
    modified: tiddler.modified,
    sourceWiki: "My Wiki",
    tags: tiddler.tags.filter((tag) => tag !== "$:/NowledgeMem"),
    title: tiddler.title,
    wikiId: "my-wiki",
  };
}

async function remoteFor(memory: MemoryInput): Promise<RemoteMemory> {
  const request = await buildMemoryRequest(memory, destination);
  return {
    content: request.content,
    id: request.id,
    metadata: request.metadata,
    space_id: request.space_id,
    title: request.title,
  };
}

class FakeRepository implements TiddlerRepository {
  public patches: TiddlerPatch[] = [];

  public constructor(public current: LocalTiddler | undefined) {}

  public get(title: string): LocalTiddler | undefined {
    return this.current?.title === title ? { ...this.current, tags: [...this.current.tags] } : undefined;
  }

  public update(expectedRevision: string, patch: TiddlerPatch): boolean {
    if (!this.current || this.current.revision !== expectedRevision) {
      return false;
    }
    this.patches.push(patch);
    this.current = {
      ...this.current,
      ...patch,
      revision: `revision-${this.patches.length + 1}`,
      tags: [...this.current.tags],
    };
    return true;
  }
}

class FakeRemote implements RemoteMemoryClient {
  public gets = 0;
  public upserts: MemoryCreateRequest[] = [];

  public constructor(public memory: RemoteMemory | undefined) {}

  public async get(): Promise<RemoteMemory | undefined> {
    this.gets += 1;
    return this.memory;
  }

  public async upsert(request: MemoryCreateRequest): Promise<RemoteMemory> {
    this.upserts.push(request);
    this.memory = {
      content: request.content,
      id: request.id,
      metadata: request.metadata,
      space_id: request.space_id,
      title: request.title,
    };
    return this.memory;
  }
}

const converter: ContentConverter = {
  async markdownToWikiText(markdown) {
    return `converted:${markdown}`;
  },
  sanitizeMarkdown(markdown) {
    return markdown;
  },
  async wikiTextToMarkdown() {
    return "# Hello";
  },
};

function engine(repository: FakeRepository, remote: FakeRemote): SyncEngine {
  return new SyncEngine({
    converter,
    destination,
    identity: { sourceWiki: "My Wiki", wikiId: "my-wiki" },
    remote,
    repository,
  });
}

async function linkedPair(): Promise<{
  local: LocalTiddler;
  memory: MemoryInput;
  remote: RemoteMemory;
}> {
  const unlinked = baseTiddler();
  const memory = memoryFor(unlinked);
  const local = {
    ...unlinked,
    nmemDigest: await memorySyncDigest(memory, destination),
    nmemTiddlerDigest: await localSourceDigest(unlinked),
    nmemUri: `nowledgemem://memory/${memory.id}`,
  };
  return { local, memory, remote: await remoteFor(memory) };
}

test("classifies all five synchronization states", async () => {
  const unlinkedRepository = new FakeRepository(baseTiddler());
  const unlinkedRemote = new FakeRemote(undefined);
  assert.equal((await engine(unlinkedRepository, unlinkedRemote).inspect("Hello")).state, "unlinked");
  assert.equal(unlinkedRemote.gets, 0);

  const pair = await linkedPair();
  assert.equal(
    (await engine(new FakeRepository(pair.local), new FakeRemote(pair.remote)).inspect("Hello")).state,
    "synced",
  );

  const localChanged = { ...pair.local, text: "locally changed", revision: "revision-2" };
  assert.equal(
    (await engine(new FakeRepository(localChanged), new FakeRemote(pair.remote)).inspect("Hello")).state,
    "local-changed",
  );

  const remoteChanged = { ...pair.remote, content: "# Remote" };
  assert.equal(
    (await engine(new FakeRepository(pair.local), new FakeRemote(remoteChanged)).inspect("Hello")).state,
    "remote-changed",
  );
  assert.equal(
    (await engine(new FakeRepository(localChanged), new FakeRemote(remoteChanged)).inspect("Hello")).state,
    "conflict",
  );
});

test("creates a Memory for an unlinked tiddler and records both baselines", async () => {
  const repository = new FakeRepository(baseTiddler());
  const remote = new FakeRemote(undefined);

  const result = await engine(repository, remote).synchronize("Hello");

  assert.equal(result.state, "synced");
  assert.equal(remote.gets, 0);
  assert.equal(remote.upserts.length, 1);
  assert.match(repository.current?.nmemUri ?? "", /^nowledgemem:\/\/memory\//u);
  assert.match(repository.current?.nmemDigest ?? "", /^sha256:[0-9a-f]{64}$/u);
  assert.match(repository.current?.nmemTiddlerDigest ?? "", /^sha256:[0-9a-f]{64}$/u);
  assert.deepEqual(repository.current?.tags, ["alpha"]);
  assert.ok(!Object.hasOwn(repository.patches[0] ?? {}, "tags"));
  assert.equal(repository.current?.modified, "2026-08-31T01:00:00.000Z");
});

test("does nothing when both sides are unchanged", async () => {
  const pair = await linkedPair();
  const repository = new FakeRepository(pair.local);
  const remote = new FakeRemote(pair.remote);

  const result = await engine(repository, remote).synchronize("Hello");

  assert.equal(result.state, "synced");
  assert.equal(remote.gets, 1);
  assert.equal(remote.upserts.length, 0);
  assert.equal(repository.patches.length, 0);
});

test("classifies an importer-linked legacy mapping without a local baseline", async () => {
  const pair = await linkedPair();
  const repository = new FakeRepository({
    ...pair.local,
    nmemTiddlerDigest: "",
    tags: [...pair.local.tags, "$:/NowledgeMem"],
  });

  const result = await engine(repository, new FakeRemote(pair.remote)).inspect("Hello");

  assert.equal(result.state, "synced");
});

test("pushes a local-only change to the existing Memory", async () => {
  const pair = await linkedPair();
  const repository = new FakeRepository({ ...pair.local, text: "locally changed" });
  const remote = new FakeRemote(pair.remote);

  const result = await engine(repository, remote).synchronize("Hello");

  assert.equal(result.state, "synced");
  assert.equal(remote.upserts.length, 1);
  assert.equal(remote.upserts[0]?.id, pair.memory.id);
  assert.equal(repository.patches.length, 1);
  assert.ok(!Object.hasOwn(repository.patches[0] ?? {}, "tags"));
});

test("preserves the legacy marker without exporting it as a Memory label", async () => {
  const pair = await linkedPair();
  const repository = new FakeRepository({
    ...pair.local,
    tags: [...pair.local.tags, "$:/NowledgeMem"],
    text: "locally changed",
  });
  const remote = new FakeRemote(pair.remote);

  const result = await engine(repository, remote).synchronize("Hello");

  assert.equal(result.state, "synced");
  assert.deepEqual(repository.current?.tags, ["alpha", "$:/NowledgeMem"]);
  assert.deepEqual(remote.upserts[0]?.labels, ["tiddlywiki", "tiddlywiki-my-wiki", "alpha"]);
  assert.deepEqual(remote.upserts[0]?.metadata.tiddlywiki_tags, ["alpha"]);
});

test("does not push a tiddler changed during WikiText conversion", async () => {
  const pair = await linkedPair();
  const repository = new FakeRepository({ ...pair.local, text: "locally changed" });
  const remote = new FakeRemote(pair.remote);
  const racingConverter: ContentConverter = {
    ...converter,
    async wikiTextToMarkdown() {
      repository.current = {
        ...repository.current!,
        revision: "revision-raced",
        text: "newer local edit",
      };
      return "# Stale";
    },
  };
  const sync = new SyncEngine({
    converter: racingConverter,
    destination,
    identity: { sourceWiki: "My Wiki", wikiId: "my-wiki" },
    remote,
    repository,
  });

  const result = await sync.synchronize("Hello");

  assert.equal(result.state, "error");
  assert.equal(remote.upserts.length, 0);
  assert.equal(repository.current?.text, "newer local edit");
});

test("pulls a remote-only change into WikiText through md2tid", async () => {
  const pair = await linkedPair();
  const repository = new FakeRepository(pair.local);
  const remote = new FakeRemote({ ...pair.remote, content: "# Remote" });

  const result = await engine(repository, remote).synchronize("Hello");

  assert.equal(result.state, "synced");
  assert.equal(repository.current?.text, "converted:# Remote");
  assert.equal(repository.current?.type, "text/vnd.tiddlywiki");
  assert.deepEqual(repository.current?.tags, ["alpha"]);
  assert.ok(!Object.hasOwn(repository.patches[0] ?? {}, "tags"));
  assert.equal(remote.upserts.length, 0);
});

test("pulls a remote-only change verbatim into Markdown", async () => {
  const pair = await linkedPair();
  const markdownLocal = baseTiddler({
    nmemDigest: pair.local.nmemDigest,
    nmemTiddlerDigest: "",
    nmemUri: pair.local.nmemUri,
    tags: pair.local.tags,
    text: "# Hello",
    type: "text/markdown",
  });
  markdownLocal.nmemTiddlerDigest = await localSourceDigest(markdownLocal);
  const repository = new FakeRepository(markdownLocal);
  const remote = new FakeRemote({ ...pair.remote, content: "# Remote" });

  await engine(repository, remote).synchronize("Hello");

  assert.equal(repository.current?.text, "# Remote");
  assert.equal(repository.current?.type, "text/markdown");
});

test("reports a conflict without changing either side", async () => {
  const pair = await linkedPair();
  const repository = new FakeRepository({ ...pair.local, text: "locally changed" });
  const remote = new FakeRemote({ ...pair.remote, content: "# Remote" });

  const result = await engine(repository, remote).synchronize("Hello");

  assert.equal(result.state, "conflict");
  assert.equal(remote.upserts.length, 0);
  assert.equal(repository.patches.length, 0);
});

test("rejects a local edit that happens while remote content is converted", async () => {
  const pair = await linkedPair();
  const repository = new FakeRepository(pair.local);
  const remote = new FakeRemote({ ...pair.remote, content: "# Remote" });
  const racingConverter: ContentConverter = {
    ...converter,
    async markdownToWikiText(markdown) {
      repository.current = { ...pair.local, revision: "revision-raced", text: "new edit" };
      return `converted:${markdown}`;
    },
  };
  const sync = new SyncEngine({
    converter: racingConverter,
    destination,
    identity: { sourceWiki: "My Wiki", wikiId: "my-wiki" },
    remote,
    repository,
  });

  const result = await sync.synchronize("Hello");

  assert.equal(result.state, "error");
  assert.equal(repository.current?.text, "new edit");
  assert.equal(repository.patches.length, 0);
});
