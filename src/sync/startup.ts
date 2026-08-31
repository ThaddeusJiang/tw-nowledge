import { startPluginRuntime } from "./runtime.ts";
import type { TiddlyWikiRuntime } from "./tiddlywiki-adapter.ts";

declare const $tw: TiddlyWikiRuntime;

export const name = "tw-nowledge-sync";
export const platforms = ["browser"];
export const after = ["startup"];
export const synchronous = true;

export function startup(): void {
  void startPluginRuntime($tw);
}
