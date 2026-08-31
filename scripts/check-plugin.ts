import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { prepareConfigurationDefaultsLibrary } from "./configuration-defaults.ts";
import { prepareMarkdownTransformerLibrary } from "./markdown-transformer.ts";

interface PluginFile {
  tiddlers: Record<string, Record<string, string>>;
}

const expectedConfigurationDefaults = {
  "$:/config/tw-nowledge/api-url": "http://127.0.0.1:14242",
  "$:/config/tw-nowledge/space-id": "default",
  "$:/config/tw-nowledge/wiki-id": "auto",
  "$:/temp/tw-nowledge/api-key": "",
} as const;

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(
  await readFile(resolve(projectRoot, "package.json"), "utf8"),
) as { version: string };
const pluginText = await readFile(
  resolve(projectRoot, "editions/release/output/Nowledge.tid"),
  "utf8",
);
const separator = pluginText.indexOf("\n\n");
assert.ok(separator > 0, "The packaged plugin must contain a TID header.");
const headers = Object.fromEntries(
  pluginText
    .slice(0, separator)
    .split("\n")
    .map((line) => {
      const colon = line.indexOf(":");
      return [line.slice(0, colon), line.slice(colon + 1).trim()];
    }),
);
assert.equal(headers.version, packageJson.version);
assert.match(headers.dependents ?? "", /\$:\/plugins\/linonetwo\/markdown-transformer/u);

const plugin = JSON.parse(pluginText.slice(separator + 2)) as PluginFile;
const startup = plugin.tiddlers["$:/plugins/ThaddeusJiang/Nowledge/startup.js"];
assert.ok(startup, "The packaged plugin must contain the browser startup module.");
assert.equal(startup["module-type"], "startup");
assert.match(startup.text ?? "", /markdown-transformer\/md-to-tid\.js/u);
assert.ok(!/from ["'][^"']+\.ts["']/u.test(startup.text ?? ""));

const button = plugin.tiddlers["$:/plugins/ThaddeusJiang/Nowledge/button/import-to-nowledge"];
assert.ok(button);
assert.match(button.text ?? "", /tm-nowledge-sync/u);
assert.ok(!(button.text ?? "").includes("tm-http-request"));

const readme = plugin.tiddlers["$:/plugins/ThaddeusJiang/Nowledge/readme"];
assert.ok(readme);
assert.ok(
  !(readme.text ?? "").includes("{{$:/plugins/linonetwo/markdown-transformer}}"),
  "The plugin readme must link to Markdown Transformer instead of transcluding its package JSON.",
);

for (const [title, text] of Object.entries(expectedConfigurationDefaults)) {
  const configuration = plugin.tiddlers[title];
  assert.ok(configuration, `The packaged plugin must provide the ${title} shadow tiddler.`);
  const actualText = configuration.text ?? "";
  assert.equal(text ? actualText.trim() : actualText, text);
}

assert.ok(
  !Object.keys(plugin.tiddlers).some((title) =>
    title.startsWith("$:/plugins/linonetwo/markdown-transformer"),
  ),
  "The standalone Nowledge.tid must not redistribute Markdown Transformer.",
);

const demoHtml = await readFile(
  resolve(projectRoot, "editions/release/output/index.html"),
  "utf8",
);
assert.match(
  demoHtml,
  /"title":"\$:\/plugins\/linonetwo\/markdown-transformer"/u,
  "The demo HTML must include Markdown Transformer for zero-configuration WikiText pulls.",
);
assert.match(
  demoHtml,
  /\$:\/Demo\/ThirdPartyNotices/u,
  "The demo HTML must include its third-party notice.",
);

const pluginLibrary = await prepareMarkdownTransformerLibrary();
const developmentPlugin = JSON.parse(
  await readFile(
    resolve(pluginLibrary, "linonetwo/markdown-transformer/plugin.info"),
    "utf8",
  ),
) as PluginFile & { title?: string; version?: string };
assert.equal(developmentPlugin.title, "$:/plugins/linonetwo/markdown-transformer");
assert.equal(developmentPlugin.version, "1.0.0");
assert.ok(
  developmentPlugin.tiddlers["$:/plugins/linonetwo/markdown-transformer/md-to-tid.js"],
  "The development plugin library must contain the md2tid module.",
);
const developmentWiki = JSON.parse(
  await readFile(resolve(projectRoot, "editions/develop/tiddlywiki.info"), "utf8"),
) as { plugins?: string[] };
assert.ok(developmentWiki.plugins?.includes("ThaddeusJiang/tw-nowledge-defaults"));
assert.ok(developmentWiki.plugins?.includes("linonetwo/markdown-transformer"));

const configurationDefaultsLibrary = await prepareConfigurationDefaultsLibrary();
const configurationDefaultsPlugin = JSON.parse(
  await readFile(
    resolve(
      configurationDefaultsLibrary,
      "ThaddeusJiang/tw-nowledge-defaults/plugin.info",
    ),
    "utf8",
  ),
) as PluginFile & { title?: string };
assert.equal(
  configurationDefaultsPlugin.title,
  "$:/plugins/ThaddeusJiang/tw-nowledge-defaults",
);
for (const [title, text] of Object.entries(expectedConfigurationDefaults)) {
  assert.equal(configurationDefaultsPlugin.tiddlers[title]?.text ?? "", text);
}
for (const relativePath of [
  "src/tiddlers/system/config/tw-nowledge/api-url.tid",
  "src/tiddlers/system/config/tw-nowledge/space-id.tid",
  "src/tiddlers/system/config/tw-nowledge/wiki-id.tid",
  "src/tiddlers/system/temp/tw-nowledge/api-key.tid",
]) {
  assert.ok(
    !existsSync(resolve(projectRoot, relativePath)),
    `${relativePath} must be a plugin shadow, not an ordinary source tiddler.`,
  );
}
assert.ok(
  !existsSync(
    resolve(
      projectRoot,
      "src/tiddlers/system/plugins/linonetwo/markdown-transformer.tid",
    ),
  ),
  "nr dev must not copy Markdown Transformer into source tiddlers.",
);
process.stdout.write("Packaged plugin checks passed.\n");
