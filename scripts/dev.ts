import { delimiter } from "node:path";

import { generateRuntime } from "./generate-runtime.ts";
import { prepareMarkdownTransformerLibrary } from "./markdown-transformer.ts";
import { runTiddlyWiki } from "./tiddlywiki.ts";

await generateRuntime();
const pluginLibrary = await prepareMarkdownTransformerLibrary();
const existingPluginPath = process.env.TIDDLYWIKI_PLUGIN_PATH;
await runTiddlyWiki(
  ["editions/develop", "--verbose", "--listen", "port=8080"],
  {
    env: {
      ...process.env,
      TIDDLYWIKI_PLUGIN_PATH: existingPluginPath
        ? `${pluginLibrary}${delimiter}${existingPluginPath}`
        : pluginLibrary,
    },
  },
);
