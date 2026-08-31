import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(
  projectRoot,
  "src/tiddlers/system/plugins/ThaddeusJiang/Nowledge/startup.tid",
);

export async function generateRuntime(): Promise<void> {
  const result = await build({
    absWorkingDir: projectRoot,
    bundle: true,
    entryPoints: ["src/sync/startup.ts"],
    format: "cjs",
    legalComments: "inline",
    minify: false,
    platform: "browser",
    target: ["es2022"],
    write: false,
  });
  const javascript = result.outputFiles[0]?.text;
  if (!javascript) {
    throw new Error("The browser runtime bundle was not generated.");
  }
  const tiddler = [
    "module-type: startup",
    "title: $:/plugins/ThaddeusJiang/Nowledge/startup.js",
    "type: application/javascript",
    "",
    javascript.trimEnd(),
    "",
  ].join("\n");
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, tiddler, "utf8");
}
