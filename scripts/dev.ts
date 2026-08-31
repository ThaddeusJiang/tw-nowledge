import { delimiter } from "node:path";

import { prepareConfigurationDefaultsLibrary } from "./configuration-defaults.ts";
import { generateRuntime } from "./generate-runtime.ts";
import { prepareMarkdownTransformerLibrary } from "./markdown-transformer.ts";
import { runTiddlyWiki } from "./tiddlywiki.ts";

await generateRuntime();
const configurationDefaultsLibrary = await prepareConfigurationDefaultsLibrary();
const markdownTransformerLibrary = await prepareMarkdownTransformerLibrary();
const existingPluginPath = process.env.TIDDLYWIKI_PLUGIN_PATH;
const pluginPaths = [configurationDefaultsLibrary, markdownTransformerLibrary];
if (existingPluginPath) {
  pluginPaths.push(existingPluginPath);
}
await runTiddlyWiki(
  ["editions/develop", "--verbose", "--listen", "port=8080"],
  {
    env: {
      ...process.env,
      TIDDLYWIKI_PLUGIN_PATH: pluginPaths.join(delimiter),
    },
  },
);
