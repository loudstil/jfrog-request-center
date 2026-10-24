import { describe, expect, it } from 'vitest';
import type { RawResponse } from '../services/jfrogClient';
import { renderResponse } from './responseFormat';

const response = (overrides: Partial<RawResponse>): RawResponse => ({
  url: 'https://acme.jfrog.io/artifactory/api/repositories',
  status: 200,
  statusText: 'OK',
  ok: true,
  contentType: 'application/json',
  body: '',
  elapsedMs: 42,
  ...overrides,
});

describe('renderResponse', () => {
  it('pretty-prints JSON under a comment header', () => {
    const { content, extension } = renderResponse('GET', response({ body: '[{"key":"libs"}]' }));
    expect(extension).toBe('jsonc');
    expect(content).toBe(
      '// GET https://acme.jfrog.io/artifactory/api/repositories\n' +
        '// 200 OK · 42 ms · application/json\n\n' +
        '[\n  {\n    "key": "libs"\n  }\n]\n',
    );
  });

  it('detects JSON bodies even with a text content type', () => {
    expect(
      renderResponse('GET', response({ contentType: 'text/plain', body: '{"a":1}' })).extension,
    ).toBe('jsonc');
  });

  it('shows error responses too', () => {
    const { content } = renderResponse(
      'DELETE',
      response({ status: 404, statusText: 'Not Found', body: '{"errors":[{"message":"x"}]}' }),
    );
    expect(content).toContain('// 404 Not Found · 42 ms');
  });

  it('uses XML comments for XML', () => {
    const { content, extension } = renderResponse(
      'GET',
      response({ contentType: 'application/xml', body: '<config/>' }),
    );
    expect(extension).toBe('xml');
    expect(content).toMatch(/^<!-- GET https:\/\/.+ -->\n<!-- 200 OK .+ -->\n<config\/>\n$/);
  });

  it('falls back to plain text, including for broken JSON and empty bodies', () => {
    const text = renderResponse('GET', response({ contentType: 'text/plain', body: 'OK' }));
    expect(text.extension).toBe('txt');
    expect(text.content).toContain('\nOK\n');
    expect(renderResponse('GET', response({ body: '{broken' })).extension).toBe('txt');
    expect(renderResponse('GET', response({ contentType: '', body: '' })).content).toContain(
      '(empty body)',
    );
  });
});
