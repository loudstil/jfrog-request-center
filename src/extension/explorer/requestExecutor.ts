import * as vscode from 'vscode';
import { type Endpoint, isMutating } from '../../shared/endpoints';
import type { RequestOutcome } from '../../shared/messages';
import { errorMessage } from '../commands/connection';
import { JFrogError, type JFrogClient } from '../services/jfrogClient';
import { buildRequest } from '../../shared/requestBuilder';
import type { ResponseDocuments } from './responseDocuments';

/** Builds, confirms (if it changes data), sends, and shows the response of an endpoint call. */
export class RequestExecutor {
  constructor(
    private readonly client: JFrogClient,
    private readonly responses: ResponseDocuments,
    private readonly getBaseUrl: () => Promise<string | undefined>,
  ) {}

  async execute(
    endpoint: Endpoint,
    values: Record<string, string>,
    body: string | undefined,
  ): Promise<RequestOutcome> {
    const built = buildRequest(endpoint, values);
    if (!built.ok) {
      return { kind: 'invalid', missing: built.missing };
    }
    const { method, path } = built.request;

    if (isMutating(endpoint)) {
      const host = (await this.getBaseUrl()) ?? 'the JFrog Platform';
      const choice = await vscode.window.showWarningMessage(
        `Send ${method} ${endpoint.name}?`,
        { modal: true, detail: `${method} ${host}${path}\n\nThis request may change data.` },
        'Send',
      );
      if (choice !== 'Send') {
        return { kind: 'notSent' };
      }
    }

    try {
      const response = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `${method} ${endpoint.name}`,
          cancellable: true,
        },
        (_, token) => {
          const controller = new AbortController();
          token.onCancellationRequested(() => controller.abort());
          return this.client.send(method, path, {
            body: endpoint.body ? (body ?? '') : undefined,
            contentType: endpoint.body?.contentType,
            signal: controller.signal,
          });
        },
      );
      await this.responses.show(method, endpoint.name, response);
      return {
        kind: 'sent',
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        elapsedMs: response.elapsedMs,
      };
    } catch (err) {
      // Callers decide how to surface failures (inline in the form, or a notification).
      return {
        kind: 'failed',
        message: errorMessage(err),
        errorKind: err instanceof JFrogError ? err.kind : 'unknown',
      };
    }
  }
}
