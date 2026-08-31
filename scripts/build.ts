import { prepareConfigurationDefaultTiddlers } from "./configuration-defaults.ts";
import { generateRuntime } from "./generate-runtime.ts";
import { prepareMarkdownTransformer } from "./markdown-transformer.ts";
import { runTiddlyWiki } from "./tiddlywiki.ts";

await generateRuntime();
const configurationDefaults = await prepareConfigurationDefaultTiddlers();
const markdownTransformer = await prepareMarkdownTransformer();
await runTiddlyWiki([
  "editions/release",
  "--verbose",
  "--load",
  configurationDefaults,
  "--load",
  markdownTransformer,
  "--build",
  "release",
]);
