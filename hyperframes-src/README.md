# Video sources

This directory contains the reproducible HyperFrames projects and original recordings for the videos published in the repository README.

## Projects

- `tw-nowledge-sync-demo`: bidirectional synchronization story, including create, push, pull, and conflict states.
- `tw-nowledge-install-demo`: drag-and-drop installation into a clean Node.js TiddlyWiki. The same plugin cards also install into a static HTML TiddlyWiki.

Each project is self-contained. From a project directory, run:

```bash
npm run check
npm run snapshot
npm run render
```

The scripts use the pinned `hyperframes@0.8.22` release. Published MP4, GIF, and poster files are generated under `output/publish/`; review frames are generated under `output/review/`.

The original browser interactions were recorded with CUA Driver. All recorded application interfaces use English.
