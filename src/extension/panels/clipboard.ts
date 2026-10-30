import * as vscode from 'vscode';
import type { ExtensionToWebview, WebviewToExtension } from '../../shared/messages';

/**
 * Handles the editors' clipboard messages, which every panel with a code editor shares.
 * Returns false for other messages.
 */
export async function handleClipboardMessage(
  msg: WebviewToExtension,
  post: (msg: ExtensionToWebview) => void,
): Promise<boolean> {
  switch (msg.type) {
    case 'clipboardWrite':
      await vscode.env.clipboard.writeText(msg.text);
      return true;
    case 'clipboardRead':
      post({
        type: 'clipboardText',
        requestId: msg.requestId,
        text: await vscode.env.clipboard.readText(),
      });
      return true;
    default:
      return false;
  }
}
