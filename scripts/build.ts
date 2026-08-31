import { generateRuntime } from "./generate-runtime.ts";
import { prepareMarkdownTransformer } from "./markdown-transformer.ts";
import { runTiddlyWiki } from "./tiddlywiki.ts";

await generateRuntime();
const markdownTransformer = await prepareMarkdownTransformer();
await runTiddlyWiki([
  "editions/release",
  "--verbose",
  "--load",
  markdownTransformer,
  "--build",
  "release",
]);
