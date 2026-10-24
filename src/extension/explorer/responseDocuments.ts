import * as vscode from 'vscode';
import type { RawResponse } from '../services/jfrogClient';
import { renderResponse } from './responseFormat';

export const RESPONSE_SCHEME = 'jfrog-response';
// Response bodies can be large; forget the oldest ones (their tabs then show as empty).
const MAX_KEPT_RESPONSES = 50;

/** Shows API responses as read-only documents in the editor, with a status header. */
export class ResponseDocuments implements vscode.TextDocumentContentProvider {
  private readonly contents = new Map<string, string>();
  private counter = 0;

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.contents.get(uri.toString()) ?? '// This response is no longer available.';
  }

  async show(method: string, title: string, response: RawResponse): Promise<void> {
    const { content, extension } = renderResponse(method, response);
    // The file name is what the tab shows; the counter keeps each response's URI unique.
    const name = `${title} (${response.status}).${extension}`.replace(/[/\\]/g, '-');
    const uri = vscode.Uri.from({ scheme: RESPONSE_SCHEME, path: `/${++this.counter}/${name}` });

    this.contents.set(uri.toString(), content);
    if (this.contents.size > MAX_KEPT_RESPONSES) {
      this.contents.delete(this.contents.keys().next().value!);
    }

    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document, {
      viewColumn: vscode.ViewColumn.Beside,
      preserveFocus: true,
    });
  }
}
