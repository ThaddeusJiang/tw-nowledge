import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

import { prepareMarkdownTransformer } from "./markdown-transformer.ts";
import { runTiddlyWiki } from "./tiddlywiki.ts";

const outputDirectory = resolve("output/playwright");
await mkdir(outputDirectory, { recursive: true });
const markdownTransformer = await prepareMarkdownTransformer();
await runTiddlyWiki([
  "--load",
  "editions/release/output/Nowledge.tid",
  "--load",
  markdownTransformer,
  "--load",
  "test/fixtures/browser-sync-demo.tid",
  "--load",
  "test/fixtures/browser-wikitext-demo.tid",
  "--load",
  "test/fixtures/browser-default-tiddlers.tid",
  "--load",
  "test/fixtures/browser-api-url.tid",
  "--rendertiddler",
  "$:/core/save/all",
  resolve(outputDirectory, "standalone.html"),
  "text/plain",
]);
