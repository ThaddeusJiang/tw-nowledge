import assert from "node:assert/strict";
import test from "node:test";

import {
  TiddlyWikiRepository,
  sanitizeMarkdownMedia,
  type TiddlerFields,
  type TiddlyWikiRuntime,
} from "../src/sync/tiddlywiki-adapter.ts";

function fakeRuntime(initialFields: TiddlerFields): {
  runtime: TiddlyWikiRuntime;
  setFields(fields: TiddlerFields): void;
  fields(): TiddlerFields;
} {
  let current = { ...initialFields };
  class FakeTiddler {
    public fields: TiddlerFields;

    public constructor(...fields: TiddlerFields[]) {
      this.fields = Object.assign({}, ...fields);
    }
  }
  return {
    fields: () => current,
    runtime: {
      Tiddler: FakeTiddler,
      modules: { execute: () => undefined },
      rootWidget: { addEventListener: () => undefined },
      utils: {
        parseStringArray: (value) => String(value).split(" ").filter(Boolean),
      },
      wiki: {
        addEventListener: () => undefined,
        addTiddler(tiddler) {
          current = { ...tiddler.fields };
        },
        getTiddler(title) {
          return current.title === title ? { fields: current } : undefined;
        },
        getTiddlerList: () => [],
        getTiddlerText: () => "",
        renderTiddler: () => "",
      },
    },
    setFields(fields) {
      current = { ...fields };
    },
  };
}

const fields: TiddlerFields = {
  created: new Date("2026-08-31T00:00:00.000Z"),
  custom: "preserved",
  modified: new Date("2026-08-31T01:00:00.000Z"),
  tags: ["alpha"],
  text: "hello",
  title: "Hello",
  type: "text/markdown",
};

test("writes mapping fields without changing modified or unrelated fields", () => {
  const fake = fakeRuntime(fields);
  const repository = new TiddlyWikiRepository(fake.runtime);
  const local = repository.get("Hello");
  assert.ok(local);

  assert.equal(
    repository.update(local.revision, {
      nmemDigest: `sha256:${"1".repeat(64)}`,
      nmemTiddlerDigest: `sha256:${"2".repeat(64)}`,
      nmemUri: "nowledgemem://memory/12345678-1234-5123-8123-123456789abc",
    }),
    true,
  );

  assert.equal(fake.fields().custom, "preserved");
  assert.equal((fake.fields().modified as Date).toISOString(), "2026-08-31T01:00:00.000Z");
  assert.equal(fake.fields()["nmem-uri"], "nowledgemem://memory/12345678-1234-5123-8123-123456789abc");
  assert.equal(fake.fields()["nmem-tiddler-digest"], `sha256:${"2".repeat(64)}`);
  assert.equal(fake.fields()["nmem-local-digest"], undefined);
  assert.deepEqual(fake.fields().tags, ["alpha"]);
});

test("reads the tiddler digest with a legacy field fallback", () => {
  const currentDigest = `sha256:${"1".repeat(64)}`;
  const legacyDigest = `sha256:${"2".repeat(64)}`;
  const current = fakeRuntime({
    ...fields,
    "nmem-local-digest": legacyDigest,
    "nmem-tiddler-digest": currentDigest,
  });
  const legacy = fakeRuntime({ ...fields, "nmem-local-digest": legacyDigest });

  assert.equal(new TiddlyWikiRepository(current.runtime).get("Hello")?.nmemTiddlerDigest, currentDigest);
  assert.equal(new TiddlyWikiRepository(legacy.runtime).get("Hello")?.nmemTiddlerDigest, legacyDigest);
});

test("rejects an update after any concurrent source edit", () => {
  const fake = fakeRuntime(fields);
  const repository = new TiddlyWikiRepository(fake.runtime);
  const local = repository.get("Hello");
  assert.ok(local);
  fake.setFields({ ...fields, text: "concurrent edit" });

  assert.equal(repository.update(local.revision, { text: "remote body" }), false);
  assert.equal(fake.fields().text, "concurrent edit");
});

test("does not expose system or draft tiddlers as sync targets", () => {
  const system = fakeRuntime({ ...fields, title: "$:/System" });
  assert.equal(new TiddlyWikiRepository(system.runtime).get("$:/System"), undefined);

  const draft = fakeRuntime({ ...fields, "draft.of": "Hello", title: "Draft" });
  assert.equal(new TiddlyWikiRepository(draft.runtime).get("Draft"), undefined);
});

test("normalizes TiddlyWiki's null tag list to an empty list", () => {
  const fake = fakeRuntime({ ...fields, tags: undefined });
  fake.runtime.utils.parseStringArray = () => null;

  assert.deepEqual(new TiddlyWikiRepository(fake.runtime).get("Hello")?.tags, []);
});

test("removes embedded data images from Markdown without changing remote images", () => {
  assert.equal(
    sanitizeMarkdownMedia(
      "![secret](data:image/png;base64,AAAA)\n\n![remote](https://example.com/image.png)",
    ),
    "[Embedded image: secret]\n\n![remote](https://example.com/image.png)",
  );
});
