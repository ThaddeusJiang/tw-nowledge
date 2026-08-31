import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const generatedRoot = resolve(projectRoot, "output/configuration-defaults");
const tiddlerFile = resolve(generatedRoot, "tiddlers.json");
const pluginLibraryRoot = resolve(generatedRoot, "plugins");
const pluginFolder = resolve(
  pluginLibraryRoot,
  "ThaddeusJiang/tw-nowledge-defaults",
);

export const configurationDefaults = {
  "$:/config/tw-nowledge/api-url": "http://127.0.0.1:14242",
  "$:/config/tw-nowledge/space-id": "default",
  "$:/config/tw-nowledge/wiki-id": "auto",
  "$:/temp/tw-nowledge/api-key": "",
} as const;

const tiddlers = Object.fromEntries(
  Object.entries(configurationDefaults).map(([title, text]) => [
    title,
    { text, title, type: "text/plain" },
  ]),
);

async function writeAtomically(path: string, contents: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp-${process.pid}`;
  await writeFile(temporaryPath, contents, { mode: 0o644 });
  await rename(temporaryPath, path);
}

export async function prepareConfigurationDefaultTiddlers(): Promise<string> {
  await writeAtomically(
    tiddlerFile,
    `${JSON.stringify(Object.values(tiddlers))}\n`,
  );
  return tiddlerFile;
}

export async function prepareConfigurationDefaultsLibrary(): Promise<string> {
  const packageJson = JSON.parse(
    await readFile(resolve(projectRoot, "package.json"), "utf8"),
  ) as { version: string };
  const pluginInfo = {
    author: "Thaddeus Jiang",
    description: "Development shadow defaults for tw-nowledge",
    "plugin-type": "plugin",
    tiddlers,
    title: "$:/plugins/ThaddeusJiang/tw-nowledge-defaults",
    version: packageJson.version,
  };
  await writeAtomically(
    resolve(pluginFolder, "plugin.info"),
    `${JSON.stringify(pluginInfo)}\n`,
  );
  return pluginLibraryRoot;
}
