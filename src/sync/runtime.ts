import { ActiveTiddlerCoordinator } from "./active-tiddlers.ts";
import { NmemClient, resolveNmemApiUrl } from "./api-client.ts";
import { SyncEngine, type SyncResult } from "./engine.ts";
import { stableMemoryId } from "./protocol.ts";
import {
  TiddlyWikiConverter,
  TiddlyWikiRepository,
  type TiddlyWikiRuntime,
} from "./tiddlywiki-adapter.ts";

const STORY_LIST = "$:/StoryList";
const STATUS_PREFIX = "$:/temp/tw-nowledge/status/";
const DEFAULT_API_URL = "http://127.0.0.1:14242";
const API_URL_CONFIG = "$:/config/tw-nowledge/api-url";
const SPACE_ID_CONFIG = "$:/config/tw-nowledge/space-id";
const WIKI_ID_CONFIG = "$:/config/tw-nowledge/wiki-id";
const API_KEY_TIDDLER = "$:/temp/tw-nowledge/api-key";

interface PluginEngine {
  inspect(title: string): Promise<SyncResult>;
  synchronize(title: string): Promise<SyncResult>;
}

interface RuntimeOptions {
  engineFactory?: () => Promise<PluginEngine>;
  fetchImpl?: typeof fetch;
  locationHref?: string;
}

export function statusTiddlerTitle(title: string): string {
  return `${STATUS_PREFIX}${encodeURIComponent(title)}`;
}

function writeStatus(runtime: TiddlyWikiRuntime, title: string, result: SyncResult | { state: "checking" }): void {
  runtime.wiki.addTiddler(
    new runtime.Tiddler({
      message: "message" in result ? (result.message ?? "") : "",
      state: result.state,
      title: statusTiddlerTitle(title),
      type: "application/x-tiddler-dictionary",
    }),
  );
}

function activeTitles(runtime: TiddlyWikiRuntime): string[] {
  return runtime.wiki.getTiddlerList(STORY_LIST);
}

async function defaultEngineFactory(
  runtime: TiddlyWikiRuntime,
  repository: TiddlyWikiRepository,
  options: RuntimeOptions,
): Promise<SyncEngine> {
  const apiUrl = resolveNmemApiUrl(
    runtime.wiki.getTiddlerText(API_URL_CONFIG, DEFAULT_API_URL).trim() || DEFAULT_API_URL,
  );
  const spaceId = runtime.wiki.getTiddlerText(SPACE_ID_CONFIG, "default").trim() || "default";
  const sourceWiki = runtime.wiki.getTiddlerText("$:/SiteTitle", "TiddlyWiki").trim() || "TiddlyWiki";
  const configuredWikiId = runtime.wiki.getTiddlerText(WIKI_ID_CONFIG, "").trim();
  const locationHref = options.locationHref ?? globalThis.location?.href ?? "tiddlywiki://local";
  const wikiId =
    configuredWikiId ||
    (await stableMemoryId("tw-nowledge-wiki", `${sourceWiki}\0${locationHref}`));
  const remote = new NmemClient({
    apiKey: runtime.wiki.getTiddlerText(API_KEY_TIDDLER, ""),
    apiUrl,
    fetchImpl: options.fetchImpl,
    spaceId,
  });
  return new SyncEngine({
    converter: new TiddlyWikiConverter(runtime),
    destination: { apiUrl, spaceId },
    identity: { sourceWiki, wikiId },
    remote,
    repository,
  });
}

export async function startPluginRuntime(
  runtime: TiddlyWikiRuntime,
  options: RuntimeOptions = {},
): Promise<void> {
  const repository = new TiddlyWikiRepository(runtime);
  const makeEngine =
    options.engineFactory ?? (() => defaultEngineFactory(runtime, repository, options));
  const busyTitles = new Set<string>();
  const generations = new Map<string, number>();

  const inspectTitle = async (title: string): Promise<void> => {
    if (busyTitles.has(title)) {
      return;
    }
    const generation = (generations.get(title) ?? 0) + 1;
    generations.set(title, generation);
    writeStatus(runtime, title, { state: "checking" });
    let result: SyncResult;
    try {
      result = await (await makeEngine()).inspect(title);
    } catch (error) {
      result = {
        message: error instanceof Error ? error.message : "Synchronization check failed.",
        state: "error",
      };
    }
    if (generations.get(title) === generation) {
      writeStatus(runtime, title, result);
    }
  };

  const coordinator = new ActiveTiddlerCoordinator(inspectTitle);
  runtime.wiki.addEventListener("change", async (changes) => {
    if (Object.hasOwn(changes, STORY_LIST)) {
      await coordinator.setActiveTitles(activeTitles(runtime));
    }
    for (const title of Object.keys(changes)) {
      if (
        title === STORY_LIST ||
        title.startsWith(STATUS_PREFIX) ||
        busyTitles.has(title)
      ) {
        continue;
      }
      await coordinator.tiddlerChanged(title);
    }
  });

  runtime.rootWidget.addEventListener("tm-nowledge-sync", (event) => {
    const title = typeof event.param === "string" ? event.param : "";
    if (!title) {
      return false;
    }
    if (!activeTitles(runtime).includes(title)) {
      writeStatus(runtime, title, {
        message: "Open the tiddler before synchronizing it.",
        state: "error",
      });
      return false;
    }
    if (busyTitles.has(title)) {
      return false;
    }
    busyTitles.add(title);
    writeStatus(runtime, title, { state: "checking" });
    void (async () => {
      let result: SyncResult;
      try {
        result = await (await makeEngine()).synchronize(title);
      } catch (error) {
        result = {
          message: error instanceof Error ? error.message : "Synchronization failed.",
          state: "error",
        };
      } finally {
        busyTitles.delete(title);
      }
      writeStatus(runtime, title, result);
    })();
    return false;
  });

  await coordinator.setActiveTitles(activeTitles(runtime));
}
