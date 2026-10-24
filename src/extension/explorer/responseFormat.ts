// Formats an API response as document text. No vscode imports.
import type { RawResponse } from '../services/jfrogClient';

/** The document text and a file extension that selects the right language mode. */
export function renderResponse(
  method: string,
  response: RawResponse,
): { content: string; extension: string } {
  const summary = [
    `${method} ${response.url}`,
    [
      `${response.status} ${response.statusText}`.trim(),
      `${response.elapsedMs} ms`,
      response.contentType,
    ]
      .filter(Boolean)
      .join(' · '),
  ];

  const json = tryFormatJson(response.body);
  if (json !== undefined) {
    return {
      content: `${summary.map((l) => `// ${l}`).join('\n')}\n\n${json}\n`,
      extension: 'jsonc',
    };
  }
  if (response.contentType.includes('xml') || response.body.trimStart().startsWith('<?xml')) {
    const header = summary.map((l) => `<!-- ${l.replace(/--/g, '- -')} -->`).join('\n');
    return { content: `${header}\n${response.body}\n`, extension: 'xml' };
  }
  return {
    content: `${summary.join('\n')}\n${'─'.repeat(40)}\n${response.body || '(empty body)'}\n`,
    extension: 'txt',
  };
}

function tryFormatJson(body: string): string | undefined {
  const trimmed = body.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return undefined;
  }
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    return undefined;
  }
}
