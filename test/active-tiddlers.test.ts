import assert from "node:assert/strict";
import test from "node:test";

import { ActiveTiddlerCoordinator } from "../src/sync/active-tiddlers.ts";

test("checks only newly active or changed active tiddlers", async () => {
  const checked: string[] = [];
  const coordinator = new ActiveTiddlerCoordinator(async (title) => {
    checked.push(title);
  });

  await coordinator.setActiveTitles(["Open"]);
  await coordinator.tiddlerChanged("Closed");
  await coordinator.tiddlerChanged("Open");
  await coordinator.setActiveTitles([]);
  await coordinator.tiddlerChanged("Open");

  assert.deepEqual(checked, ["Open", "Open"]);
});

test("does not recheck unchanged StoryList entries", async () => {
  const checked: string[] = [];
  const coordinator = new ActiveTiddlerCoordinator(async (title) => {
    checked.push(title);
  });

  await coordinator.setActiveTitles(["One", "Two"]);
  await coordinator.setActiveTitles(["One", "Two"]);
  await coordinator.setActiveTitles(["Two", "Three"]);

  assert.deepEqual(checked, ["One", "Two", "Three"]);
});
