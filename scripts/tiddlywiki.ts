import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export async function runTiddlyWiki(
  arguments_: string[],
  options: { env?: NodeJS.ProcessEnv } = {},
): Promise<void> {
  const cliPath = require.resolve("tiddlywiki/tiddlywiki.js");
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, ...arguments_], {
      env: options.env,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            signal
              ? `TiddlyWiki exited after signal ${signal}.`
              : `TiddlyWiki exited with code ${code ?? "unknown"}.`,
          ),
        );
      }
    });
  });
}
