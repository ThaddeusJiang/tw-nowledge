import assert from "node:assert/strict";
import test from "node:test";

import { startPluginRuntime, statusTiddlerTitle } from "../src/sync/runtime.ts";
import type { SyncEngine, SyncResult } from "../src/sync/engine.ts";
import type { TiddlerFields, TiddlyWikiRuntime } from "../src/sync/tiddlywiki-adapter.ts";

test("runtime checks only StoryList tiddlers and refuses closed-title messages", async () => {
  let storyTitles = ["Open"];
  const wikiListeners: Array<(changes: Record<string, unknown>) => unknown> = [];
  const messageListeners: Array<(event: Record<string, unknown>) => unknown> = [];
  const tiddlers = new Map<string, TiddlerFields>([
    ["Open", { text: "open", title: "Open", type: "text/markdown" }],
    ["Closed", { text: "closed", title: "Closed", type: "text/markdown" }],
  ]);
  class FakeTiddler {
    public fields: TiddlerFields;

    public constructor(...fields: TiddlerFields[]) {
      this.fields = Object.assign({}, ...fields);
    }
  }
  const runtime: TiddlyWikiRuntime = {
    Tiddler: FakeTiddler,
    modules: { execute: () => undefined },
    rootWidget: {
      addEventListener(_type, listener) {
        messageListeners.push(listener);
      },
    },
    utils: { parseStringArray: () => [] },
    wiki: {
      addEventListener(_type, listener) {
        wikiListeners.push(listener);
      },
      addTiddler(tiddler) {
        const title = String(tiddler.fields.title);
        tiddlers.set(title, tiddler.fields);
      },
      getTiddler: (title) => {
        const fields = tiddlers.get(title);
        return fields ? { fields } : undefined;
      },
      getTiddlerList: () => storyTitles,
      getTiddlerText: (_title, defaultText = "") => defaultText,
      renderTiddler: () => "",
    },
  };
  const inspected: string[] = [];
  const synchronized: string[] = [];
  const fakeEngine = {
    async inspect(title: string): Promise<SyncResult> {
      inspected.push(title);
      return { state: "unlinked" };
    },
    async synchronize(title: string): Promise<SyncResult> {
      synchronized.push(title);
      return { state: "synced" };
    },
  } as SyncEngine;

  await startPluginRuntime(runtime, { engineFactory: async () => fakeEngine });
  assert.deepEqual(inspected, ["Open"]);

  await wikiListeners[0]?.({ Closed: { modified: true } });
  assert.deepEqual(inspected, ["Open"]);

  messageListeners[0]?.({ param: "Closed" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(synchronized, []);
  assert.equal(tiddlers.get(statusTiddlerTitle("Closed"))?.state, "error");

  storyTitles = ["Open", "Closed"];
  await wikiListeners[0]?.({ "$:/StoryList": { modified: true } });
  assert.deepEqual(inspected, ["Open", "Closed"]);

  messageListeners[0]?.({ param: "Closed" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(synchronized, ["Closed"]);
});
