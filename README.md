# JFrog Request Center

A VS Code extension for writing and running AQL (Artifactory Query Language) queries, and
(coming in Phase 4) exploring JFrog REST APIs, without leaving the editor.

## Features (so far)

- **JFrog Request Center: Configure Connection**: enter your platform URL, an optional
  username and an access token. The connection is checked before saving, and the token is
  stored in VS Code's SecretStorage (your OS keychain), never in settings.
- **JFrog Request Center: Open AQL Manager**: write a query in a Monaco editor with AQL
  syntax highlighting and autocomplete (domains, methods, fields for the queried domain, and `$`
  operators), run it with **Execute AQL** or Ctrl/Cmd+Enter, and see the results in a table. You
  can copy them or open them as JSON. The editor follows your VS Code theme and editor font.
- **Saved queries**: **Save** (Ctrl/Cmd+S) and **Save As…** in the AQL Manager. Saved queries are
  listed in the JFrog Request Center sidebar (activity bar icon). Click one to open it, or use the
  context menu to rename or delete it. They're stored in VS Code's global state and sync with
  Settings Sync.
- **Status bar**: shows whether Artifactory can be reached and which version it runs.

## Development

```sh
npm install
npm run build      # bundle dist/extension.js and dist/webview.js
npm run watch      # rebuild on change
npm test           # unit tests (Vitest)
npm run typecheck  # extension + webview
npm run lint
```

Press **F5** in VS Code to launch an Extension Development Host with the extension loaded.

- `src/extension/`: extension host code (Node): commands, services, panels
- `src/webview/`: React UI rendered inside the AQL Manager panel
  - `src/webview/aql/`: the AQL language (highlighting rules and completions)
  - `src/webview/monaco/setup.ts`: Monaco setup: editor features, worker, theme sync
- `src/shared/`: types used by both sides, including the postMessage protocol
