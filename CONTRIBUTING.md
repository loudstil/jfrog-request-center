# Contributing

## Setup

```sh
npm install
npm run build      # bundle dist/extension.js, dist/webview.js and dist/editor.worker.js
npm run watch      # rebuild on change
npm test           # unit tests (Vitest)
npm run typecheck  # extension + webview
npm run lint
npm run format     # Prettier
npm run package    # build a .vsix
```

Press **F5** in VS Code to launch an Extension Development Host with the extension loaded.
Run **Developer: Reload Window** there after rebuilding.

## Layout

- `src/extension/`: extension host code (Node), with full access to the VS Code API.
  - `commands/`: command handlers.
  - `explorer/`: API Explorer: the built-in endpoint catalog, the OpenAPI parser, spec loading,
    request execution and response documents.
  - `panels/`: the AQL Manager and request form webview panels.
  - `providers/`: the Saved Queries and API Explorer trees.
  - `services/`: the JFrog HTTP client, credentials, and the saved query store.
- `src/webview/`: the React UI shown in the webview panels (browser environment).
  - `views/`: `AqlBuilder` (AQL Manager) and `RequestForm` (API Explorer).
  - `components/`: the code editor, results grid and split pane.
  - `aql/`: the AQL language: highlighting rules and completions.
  - `monaco/`: Monaco setup: editor features, worker, theme sync.
- `src/shared/`: code and types used by both sides, including the postMessage protocol in
  `messages.ts`.

The extension host and the webviews only communicate through the typed messages in
`src/shared/messages.ts`.

## Conventions

- Logic that doesn't need VS Code (the HTTP client, request building, OpenAPI parsing, AQL
  completions, results sorting and filtering) has no `vscode` imports, so it can be unit-tested.
  Tests live next to the code as `*.test.ts`.
- Commands, settings and storage keys are prefixed `jfrogRequestCenter.` to avoid clashing with
  JFrog's official extension.
- Never log credentials, headers or bodies.
