# AGENTS.md

This repository is the standalone TiddlyWiki plugin for bidirectional synchronization with Nowledge Mem. It may be checked out independently or used as the `tw-nowledge` submodule of `tiddlynmem`.

## Product contract

- Every saved, non-system, non-draft tiddler exposes the Nowledge Mem toolbar button.
- Only titles currently in `$:/StoryList` may trigger a remote check. Do not add polling, a background wiki scan, or remote discovery.
- A button click always rechecks the exact linked Memory before changing either side.
- The five stable states are `unlinked`, `synced`, `local-changed`, `remote-changed`, and `conflict`. `checking` and `error` are transient presentation states.
- `unlinked` creates a deterministic Memory and writes `nmem-uri`, `nmem-digest`, and `nmem-tiddler-digest` only after the API confirms the requested Memory ID.
- `synced` performs no write. `local-changed` upserts the existing Memory. `remote-changed` updates only the existing tiddler body and synchronization fields. `conflict` modifies neither side.
- Reverse sync is explicit and per tiddler. Never create, rename, or delete tiddlers during a pull.
- Preserve the tiddler type: Markdown and plain text are written directly; WikiText pulls use the public `md2tid` module from `$:/plugins/linonetwo/markdown-transformer`.
- Keep the production `Nowledge.tid` independent: it must declare Markdown Transformer as an external dependency and must not contain Markdown Transformer or `md-to-tid` tiddlers.
- Preserve the source `modified` value when writing synchronization fields or a remote body. Reject a concurrent source change rather than overwriting it.
- Never add, remove, or change tiddler tags during synchronization. Ignore the historical `$:/NowledgeMem` marker when building Memory labels and source digests so older importer-linked tiddlers remain compatible.
- Read browser credentials only from `$:/temp/tw-nowledge/api-key`. Never persist them, include them in a URL, follow redirects, or expose credentials or raw API bodies in errors.
- Package configuration defaults as shadow tiddlers. User edits override them, and deleting an override must restore the plugin default. Treat `auto` or an empty Wiki identity as the derived identity mode.
- Keep Memory request metadata, deterministic IDs, and `nmem-digest` compatible with `tiddlynmem`. `nmem-tiddler-digest` is plugin-owned and tracks one tiddler's local source representation. Read `nmem-local-digest` only as a legacy fallback when the new field is absent; never write the legacy field.

## Source and build

- Write TypeScript in `src/sync/` and `scripts/`; keep strict type checking enabled.
- Use ESM imports with explicit `.ts` extensions.
- Do not add handwritten JavaScript source. `scripts/generate-runtime.ts` bundles the browser startup module into the ignored `startup.tid` build input.
- Do not commit `node_modules/`, generated startup tiddlers, release output, or browser artifacts.
- `nr dev`, release demo HTML, and browser fixtures must load the exact pinned, unmodified upstream Markdown Transformer plugin release after SHA-256 and plugin-structure validation. Keep the download cache in ignored build output, include `$:/Demo/ThirdPartyNotices` in the standalone demo, and never copy upstream tiddlers into source or `Nowledge.tid`.
- Review upstream code, license metadata, the pinned digest, tests, and the third-party notice together before changing the embedded Markdown Transformer version.
- Keep the plugin manifest dependency, package version, user README, internal plugin readme/history, and behavior specification synchronized.
- The existing MIT licensing decision applies to this standalone repository; keep `LICENSE`, package metadata, and README synchronized.

## Testing and validation

Use `ni` for dependency installation and `nr` for package scripts.

After source or test changes, run:

```bash
nr typecheck
nr test
nr build
nr check:plugin
```

Tests use fake repositories and HTTP services. Never write to the user's real Nowledge Mem during automated or browser validation. Browser acceptance must cover both the npm `tiddlywiki` package as a Node.js TiddlyWiki server (`nr dev` / `editions/develop --listen`) and a standalone HTML artifact. The Node.js path must prove browser behavior plus TiddlyWeb persistence; the HTML path must prove the generated file contains every required TiddlyWiki-side plugin. Do not use Python to serve either path.

Test behavior rather than implementation details, including:

- importer-compatible fingerprint, destination digest, deterministic ID, request metadata, and response ID validation;
- all five synchronization states, importer mappings without a tiddler baseline, and the read-only legacy `nmem-local-digest` fallback;
- no-op, create, push, format-preserving pull, conflict, and concurrent-edit rejection;
- StoryList-only remote checks and closed-title message rejection;
- safe API URL handling, Bearer authentication, redirect rejection, timeout behavior, and sanitized errors;
- mapping writeback that preserves arbitrary fields and source `modified`;
- packaged dependency declaration, startup module presence, production-plugin independence, and a self-contained demo converter.

Do not commit, push, publish, tag, or create a release unless the user explicitly asks.
