# JFrog Request Center

Write and run AQL (Artifactory Query Language) queries and call JFrog Platform REST APIs
without leaving VS Code.

> This is an independent, community-built extension. It is not affiliated with, endorsed by, or
> supported by JFrog Ltd. JFrog and Artifactory are trademarks of JFrog Ltd.

- **AQL Manager**: an AQL editor with syntax highlighting and autocomplete, and a results table
  that stays fast with very large results.
- **Saved queries**: keep the queries you use often, synced across machines with Settings Sync.
- **API Explorer**: browse common Artifactory and Access endpoints, fill in a form, and read the
  response in an editor tab. Add your own OpenAPI specs for more endpoints.
- **Multiple servers**: keep several JFrog Platforms (for example dev, staging and production)
  and switch between them in one click.

## Getting started

1. Open the Command Palette (Ctrl/Cmd+Shift+P) and run **JFrog Request Center: Add Server**.
2. Enter your JFrog Platform URL (for example `https://mycompany.jfrog.io`), a name for the
   server, an optional username, and an access token. The connection is verified before it's
   saved.
3. The status bar shows the active server's name once you're connected.

The JFrog Request Center icon in the activity bar opens the **Servers**, **API Explorer** and
**Saved Queries** views.

## Multiple servers

- Add as many servers as you like with **Add Server** or the **+** in the Servers view.
- **Switch** by clicking the server name in the status bar, clicking a server in the Servers view,
  clicking the server badge in the AQL Manager or a request form, or running **Switch Server**.
  The active server is marked in the Servers view.
- Everything runs against the active server. Confirmations for requests that may change data
  name the server they'll be sent to.
- Each server has its own access token. Right-click a server to edit it, clear its token, or
  remove it.
- Server names, URLs and usernames are stored in the `jfrogRequestCenter.servers` setting, so a
  team can share a list in a workspace's `.vscode/settings.json`. Tokens are never stored in
  settings: switching to a server without a token asks for one.

## AQL Manager

Run **JFrog Request Center: Open AQL Manager**, or click the status bar item.

- **Editor**: AQL highlighting, bracket matching, and autocomplete for domains (`items`,
  `builds`, ...), methods (`find`, `include`, `sort`, `limit`, ...), the fields of the domain
  you're querying, and `$` operators (`$match`, `$last`, ...).
- **Syntax check**: mistakes are underlined as you type (hover for the explanation), and the
  toolbar shows how many there are; click it to jump to the first one. Execute won't send a
  query with syntax errors: it lists them instead, and **run it anyway** sends it regardless in
  case the check is wrong. Warnings don't stop a query: an unknown domain, or a field name the
  domain doesn't have (with a "did you mean" suggestion, e.g. `nmae` → `name`). Field paths
  through related entities, such as `artifact.module.build.name`, are checked too; properties
  (`@...`) aren't.
- **Format**: **Format** or Shift+Alt+F lays the query out with one condition per line and
  breaks up anything too long for one line. Undo with Ctrl/Cmd+Z.
- **Run**: **Execute AQL** or Ctrl/Cmd+Enter. A running query can be cancelled.
- **Results**: click a column header to sort, type in the filter box to search all columns, and
  drag a header edge to resize a column (double-click to reset). **Copy JSON** and **Open as
  JSON** use the rows currently shown.
- **Layout**: drag the divider between the editor and the results; double-click it to reset.

## Saved queries

- **Save** (Ctrl/Cmd+S) and **Save As…** in the AQL Manager. A ● next to the name means there
  are unsaved changes.
- Saved queries are listed in the sidebar. Click one to open it; right-click to rename or
  delete it. **+** starts a new query.
- You're asked before unsaved changes are discarded.

## API Explorer

- Endpoints are grouped by area: Repositories, Artifacts & Storage, Searches, Builds, Security &
  Access, and System. Icons show the HTTP method.
- **Click** an endpoint to open its request form: path and query parameters, a live preview of
  the URL, and a body editor where the endpoint takes one. Nothing is sent until you press
  **Send** (Ctrl/Cmd+Enter).
- **▶** next to an endpoint sends it right away when it needs no input.
- Responses, including error responses, open in a read-only editor tab with the status and
  timing at the top.
- Requests that may change data (POST, PUT, PATCH, DELETE) always ask for confirmation and show
  the exact URL first.

### Adding OpenAPI specs

JFrog publishes OpenAPI specs in its API reference. To add their endpoints to the explorer, list
the downloaded files (JSON or YAML, OpenAPI 3) in your settings:

```json
"jfrogRequestCenter.openApiSpecs": [
  "~/specs/artifactory-repositories.yaml",
  "specs/access.json"
]
```

Relative paths are resolved against the first workspace folder. After editing a spec file, click
**↻** in the API Explorer title bar.

## Settings

| Setting                           | Description                                                                                                                                                                                             |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `jfrogRequestCenter.servers`      | The servers you can switch between: `name`, `url`, and an optional `username` (when set, the token is sent with Basic auth; otherwise as a Bearer token). Tokens are kept in the OS keychain, not here. |
| `jfrogRequestCenter.openApiSpecs` | OpenAPI 3 files whose endpoints are added to the API Explorer.                                                                                                                                          |

## Commands

All commands are in the Command Palette under **JFrog Request Center**:

| Command                             | What it does                                                  |
| ----------------------------------- | ------------------------------------------------------------- |
| Switch Server…                      | Pick the active server, or add or edit one.                   |
| Add Server… / Edit Server…          | Set a server's URL, name, username and access token.          |
| Remove Server…                      | Remove a server and its stored token.                         |
| Configure Active Server             | Edit the active server (or add the first one).                |
| Clear Access Token                  | Remove the active server's stored token.                      |
| Open AQL Manager                    | Open the AQL editor.                                          |
| New AQL Query                       | Start a new, unsaved query.                                   |
| Open / Rename / Delete Saved Query… | Pick a saved query from a list.                               |
| Send API Request…                   | Search all endpoints and send one.                            |
| Open Request Form…                  | Search all endpoints and open one's form.                     |
| Copy Endpoint Path                  | Copy an endpoint's path (from the API Explorer context menu). |
| Reload OpenAPI Specs                | Re-read the files in `openApiSpecs`.                          |
| Show Logs                           | Open the request log in the Output panel.                     |

## Security and privacy

- Access tokens are stored only in VS Code's SecretStorage (your operating system's keychain),
  one per server, never in settings files. **Clear Access Token** or **Remove Server** deletes
  them.
- The request log (**Show Logs**) records the method, URL, status and timing of each request.
  It never contains the token, other headers, or request and response bodies.
- The extension talks only to the JFrog servers you configure. It collects no telemetry.

## Troubleshooting

- **Authentication failed (401)**: check which server is active, then run **Configure Active
  Server** to enter a new token. If you set a username,
  the token is sent with Basic auth; leave the username empty to send it as a Bearer token.
- **Could not reach the server**: check the URL and your network. Behind a corporate proxy or
  with a private certificate authority, check VS Code's `http.proxy`, `http.proxySupport` and
  `http.systemCertificates` settings. **Show Logs** shows the underlying error.
- **Rate limited (429)**: requests are retried automatically up to two times, following the
  server's `Retry-After` header. If it still fails, wait a moment and try again.

## Feedback

Bugs and feature requests:
[github.com/loudstil/jfrog-request-center/issues](https://github.com/loudstil/jfrog-request-center/issues).

## Requirements

- VS Code 1.95 or later.
- A JFrog Platform or Artifactory instance, and an access token with the permissions the calls
  you make need. Some endpoints, such as System Info and Storage Summary, require an admin.
