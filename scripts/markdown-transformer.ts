import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const version = "1.0.0";
const pluginTitle = "$:/plugins/linonetwo/markdown-transformer";
const downloadUrl =
  "https://github.com/tiddly-gittly/markdown-transformer/releases/download/v1.0.0/__plugins_linonetwo_markdown-transformer.json";
const expectedSha256 =
  "abd2f15f79f745b9519b49414c9c9f58e42825d23bfd6c15831ad287877e8a75";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cachePath = resolve(
  projectRoot,
  "output/vendor/__plugins_linonetwo_markdown-transformer-v1.0.0.json",
);
const pluginLibraryRoot = resolve(projectRoot, "output/vendor/tiddlywiki-plugins");
const pluginFolder = resolve(
  pluginLibraryRoot,
  "linonetwo/markdown-transformer",
);

interface ValidatedPlugin {
  contents: { tiddlers: Record<string, unknown> };
  plugin: Record<string, unknown> & { text: string };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validatePlugin(bytes: Uint8Array): ValidatedPlugin {
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest !== expectedSha256) {
    throw new Error(
      `Markdown Transformer v${version} failed its SHA-256 integrity check.`,
    );
  }

  const plugin = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  if (
    !isRecord(plugin) ||
    plugin.title !== pluginTitle ||
    plugin.version !== version ||
    plugin.type !== "application/json" ||
    plugin["plugin-type"] !== "plugin" ||
    typeof plugin.text !== "string"
  ) {
    throw new Error(
      `Markdown Transformer v${version} has unexpected plugin metadata.`,
    );
  }

  const contents = JSON.parse(plugin.text) as unknown;
  if (!isRecord(contents) || !isRecord(contents.tiddlers)) {
    throw new Error(
      `Markdown Transformer v${version} has an invalid plugin payload.`,
    );
  }

  const converter = contents.tiddlers[`${pluginTitle}/md-to-tid.js`];
  if (
    !isRecord(converter) ||
    converter["module-type"] !== "library" ||
    typeof converter.text !== "string"
  ) {
    throw new Error(
      `Markdown Transformer v${version} does not contain the expected md2tid library.`,
    );
  }
  return {
    contents: contents as { tiddlers: Record<string, unknown> },
    plugin: plugin as Record<string, unknown> & { text: string },
  };
}

async function readVerifiedCache(): Promise<string | undefined> {
  try {
    const bytes = await readFile(cachePath);
    validatePlugin(bytes);
    return cachePath;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    return undefined;
  }
}

export async function prepareMarkdownTransformer(): Promise<string> {
  const cached = await readVerifiedCache();
  if (cached) {
    return cached;
  }

  const response = await fetch(downloadUrl);
  if (!response.ok) {
    throw new Error(
      `Could not download Markdown Transformer v${version}: HTTP ${response.status}.`,
    );
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  validatePlugin(bytes);

  await mkdir(dirname(cachePath), { recursive: true });
  const temporaryPath = `${cachePath}.tmp-${process.pid}`;
  await writeFile(temporaryPath, bytes, { mode: 0o644 });
  await rename(temporaryPath, cachePath);
  return cachePath;
}

export async function prepareMarkdownTransformerLibrary(): Promise<string> {
  const releasePath = await prepareMarkdownTransformer();
  const { contents, plugin } = validatePlugin(await readFile(releasePath));
  const pluginInfo: Record<string, unknown> = {
    ...plugin,
    tiddlers: contents.tiddlers,
  };
  delete pluginInfo.text;
  delete pluginInfo.type;

  await mkdir(pluginFolder, { recursive: true });
  const pluginInfoPath = resolve(pluginFolder, "plugin.info");
  const temporaryPath = `${pluginInfoPath}.tmp-${process.pid}`;
  await writeFile(temporaryPath, `${JSON.stringify(pluginInfo)}\n`, {
    mode: 0o644,
  });
  await rename(temporaryPath, pluginInfoPath);
  return pluginLibraryRoot;
}
