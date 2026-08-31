# tw-nowledge

`tw-nowledge` is a standalone TiddlyWiki plugin for bidirectional synchronization with [Nowledge Mem](https://mem.nowledge.co/). It can be used by itself or alongside the independent [`tiddlynmem`](https://github.com/nowledge-co/tiddlynmem) importer.

## Behavior

Every saved, non-system tiddler has a Nowledge Mem toolbar button:

| Button | State | Click behavior |
| --- | --- | --- |
| `Mem ＋` | Not linked | Create a Memory and save the mapping fields |
| `Mem ✓` | Both snapshots are current | Do nothing |
| `Mem NEW` | TiddlyWiki changed | Update the linked Memory |
| `Mem OLD` | Nowledge Mem changed | Pull the Memory into the existing tiddler |
| `Mem !` | Both sides changed | Report a conflict and modify neither side |

Only tiddlers currently open in `$:/StoryList` are checked. The plugin never polls or scans closed tiddlers. Clicking the button performs a fresh remote check before any write.

The plugin records `nmem-uri` and `nmem-digest`, using the same Memory request and digest contract as `tiddlynmem`. It also records `nmem-tiddler-digest` so a Markdown-to-WikiText pull does not look like a new local edit merely because the conversion is not byte-reversible. The legacy `nmem-local-digest` field is a read-only fallback when the new field is absent; successful create, push, and pull operations write only `nmem-tiddler-digest`. Synchronization never adds, removes, or changes tiddler tags. The historical `$:/NowledgeMem` marker is ignored when an older importer-linked tiddler is synchronized.

## Formats

- `text/markdown` is pushed and pulled as Markdown.
- `text/vnd.tiddlywiki` is rendered to GitHub Flavored Markdown when pushed and converted back to WikiText when pulled.
- `text/plain` remains plain text.

WikiText pulls use the community [`$:/plugins/linonetwo/markdown-transformer`](https://github.com/tiddly-gittly/markdown-transformer) plugin and call its public `md2tid` module. The production `Nowledge.tid` keeps this as an external plugin dependency; the standalone demo HTML embeds a verified upstream release so it works without a separate import.

## Install and configure

Build the plugin, then install Markdown Transformer and drag `editions/release/output/Nowledge.tid` into your TiddlyWiki:

```bash
ni
nr build
```

The plugin provides these defaults as shadow tiddlers. Click a title to inspect it in TiddlyWiki. Editing creates a user override; deleting that override restores the plugin default.

| Tiddler | Default |
| --- | --- |
| `$:/config/tw-nowledge/api-url` | `http://127.0.0.1:14242` |
| `$:/config/tw-nowledge/space-id` | `default` |
| `$:/config/tw-nowledge/wiki-id` | `auto` (derived from the wiki and browser location) |
| `$:/temp/tw-nowledge/api-key` | Empty; temporary only |

Never persist the API key tiddler. When using the importer and plugin together, use the same Wiki identity here and with `tiddlynmem plan --wiki-id <id>`.

## Develop with Node.js TiddlyWiki

Use the Node.js TiddlyWiki server for day-to-day development:

```bash
ni
nr dev
```

Open `http://127.0.0.1:8080`. The `dev` script runs the npm `tiddlywiki` package with `editions/develop --listen` and automatically loads the same verified Markdown Transformer release used by the HTML build. No converter import is required. Use a disposable Nowledge Mem service or test space for synchronization acceptance.

## Check the standalone release artifact

```bash
nr build
open editions/release/output/index.html
```

The generated `index.html` contains TiddlyWiki, `tw-nowledge`, and the pinned Markdown Transformer release in one file. No plugin import or converter configuration is required. The first `nr dev` or `nr build` downloads the exact upstream release, verifies its SHA-256 digest and plugin structure, then caches it under ignored build output. The demo includes `$:/Demo/ThirdPartyNotices`; the separately packaged `Nowledge.tid` remains independent.

Acceptance must cover both forms: the Node.js TiddlyWiki started by `nr dev`, including TiddlyWeb persistence, and the generated standalone HTML artifact.

## Development

```bash
ni
nr typecheck
nr test
nr build
nr check:plugin
```

The browser startup module is authored in TypeScript and bundled into an ignored generated TiddlyWiki tiddler before development and release builds. See [AGENTS.md](AGENTS.md) and the [bidirectional sync specification](docs/specs/bidirectional-sync.md) for the implementation contract.

## Acknowledgements

Thanks to [TiddlyWiki](https://tiddlywiki.com/), [Nowledge Mem](https://mem.nowledge.co/), [Markdown Transformer](https://github.com/tiddly-gittly/markdown-transformer), [Turndown](https://github.com/mixmark-io/turndown), [ThirdFlow](https://github.com/TheDiveO/ThirdFlow), and [Nub](https://github.com/nubjs/nub).

## Author

[Thaddeus Jiang](https://github.com/ThaddeusJiang)

## License

Copyright 2026 Thaddeus Jiang. Licensed under the [MIT License](LICENSE).
