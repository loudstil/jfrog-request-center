# Changelog

## 0.1.0 (2026-10-24)

First release.

### Servers

- Multiple JFrog servers with one-click switching from the status bar, the Servers view, or the
  server badge in the AQL Manager and request forms.
- Server profiles in the `jfrogRequestCenter.servers` setting (shareable per workspace); one
  access token per server in VS Code's SecretStorage.
- Connections are verified before they're saved.
- Confirmations for requests that may change data name the target server.
- An existing single connection (`platformUrl`/`username`) is migrated automatically.

### AQL Manager

- Monaco editor with AQL syntax highlighting and context-aware autocomplete.
- Execute with Ctrl/Cmd+Enter, with cancellation.
- Virtualized results table with sorting, filtering and resizable columns; copy or open the
  shown rows as JSON.
- Resizable split between the editor and the results.

### Saved queries

- Save and Save As (Ctrl/Cmd+S), a Saved Queries sidebar view with rename and delete, and
  Settings Sync support.

### API Explorer

- Sidebar tree of common Artifactory and Access REST endpoints.
- Request form with parameter fields, live URL preview and a JSON body editor.
- Responses open as read-only documents.
- Confirmation before requests that may change data.
- Additional endpoints from OpenAPI 3 specs listed in `jfrogRequestCenter.openApiSpecs`.

### Reliability

- Automatic retries for rate-limited requests (429), honoring `Retry-After`.
- Request log in the Output panel (**Show Logs**), without credentials or bodies.
