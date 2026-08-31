# Bidirectional sync

## Outcome

`tw-nowledge` is a standalone TiddlyWiki plugin that synchronizes one explicitly linked tiddler with one Nowledge Mem Memory. It can be used by itself or alongside the independent `tiddlynmem` importer.

## User-visible states

Every saved, non-system tiddler has a Nowledge Mem toolbar button. The button reports one of these states:

| State | Meaning | Button action |
| --- | --- | --- |
| `unlinked` | The tiddler has no valid `nmem-uri` | Create the Memory and save the synchronization fields |
| `synced` | Neither side changed since the last successful sync | Do nothing |
| `local-changed` | Only the TiddlyWiki source changed | Upsert the linked Memory |
| `remote-changed` | Only the linked Memory changed | Pull its content into the existing tiddler |
| `conflict` | Both sides changed | Display the conflict and modify neither side |
| `checking` / `error` | The remote state is being resolved or could not be resolved | Display progress or a safe diagnostic |

The plugin checks remote state only for titles currently listed in `$:/StoryList`. Opening a linked tiddler checks it; changing an open tiddler checks it again. Closed or otherwise unviewed tiddlers do not trigger remote reads, and the plugin does not poll or scan the wiki in the background. Clicking the button always performs a fresh check before any write.

## Synchronization protocol

The plugin uses the importer-compatible fields and digest algorithm:

- `$:/NowledgeMem`
- `nmem-uri`
- `nmem-digest`

It additionally stores `nmem-local-digest`, a digest of the local source representation. This is necessary because Markdown-to-WikiText conversion is not byte-reversible. `nmem-digest` remains the destination-aware baseline of the Memory payload; `nmem-local-digest` records the exact local source baseline after a successful push or pull.

Existing importer-linked tiddlers without `nmem-local-digest` remain supported. For their first classification, the plugin compares the current locally converted Memory payload with `nmem-digest`; the next successful sync writes both baselines.

The Memory request remains compatible with `tiddlynmem`: deterministic UUID, `source: "tiddlywiki"`, `source_app: "tiddlynmem"`, native labels, and `tiddlywiki_*` metadata. A valid existing `nmem-uri` always owns the Memory identity.

## Format behavior

- A `text/markdown` tiddler is pushed as its source Markdown and receives pulled Memory content verbatim.
- A `text/vnd.tiddlywiki` tiddler is rendered to HTML and converted to GitHub Flavored Markdown when pushed. A pull calls the public `md2tid` library module from `$:/plugins/linonetwo/markdown-transformer` and keeps the tiddler as WikiText.
- A `text/plain` tiddler is synchronized as plain text.
- Unsupported content types fail safely without writes.

The Markdown transformer is a required peer TiddlyWiki plugin and is not bundled or redistributed by `tw-nowledge`.

## Safety constraints

- Reverse sync is explicit and per tiddler. It reads only the Memory named by a valid `nmem-uri`.
- Pull never creates, renames, or deletes a tiddler. It updates only the existing tiddler body and synchronization fields, preserving its original type and other user fields.
- A concurrent local edit detected after an asynchronous request or conversion rejects the write.
- A conflict, conversion error, malformed response, mismatched response ID, missing Memory, or API failure changes no user tiddler and performs no unsafe fallback.
- The API key is read only from `$:/temp/tw-nowledge/api-key`; it is never persisted, placed in a URL, or included in an error.
- Requests do not follow redirects.

## Acceptance checks

1. An unlinked tiddler creates exactly one deterministic Memory and records `nmem-uri`, `nmem-digest`, `nmem-local-digest`, and `$:/NowledgeMem` without changing its source `modified` value.
2. A synchronized tiddler performs no write.
3. A local-only edit upserts the linked Memory and advances both baselines.
4. A remote-only edit updates the existing body in its original format and advances both baselines.
5. A two-sided edit reports `conflict` and modifies neither side.
6. A linked tiddler outside `$:/StoryList` performs no remote read.
7. The packaged plugin declares the Markdown transformer dependency and contains no bundled copy of it.
