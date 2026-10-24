import { describe, expect, it } from 'vitest';
import {
  defaultServerName,
  legacyProfile,
  pickActive,
  readServerProfiles,
  removeServer,
  type ServerProfile,
  tokenSecretKey,
  toSetting,
  upsertServer,
  validateServerName,
} from './serverProfiles';

const prod: ServerProfile = { name: 'Prod', url: 'https://prod.jfrog.io' };
const dev: ServerProfile = { name: 'dev', url: 'https://dev.jfrog.io', username: 'alice' };

describe('readServerProfiles', () => {
  it('reads valid entries and normalizes them', () => {
    expect(
      readServerProfiles([
        { name: ' Prod ', url: 'https://prod.jfrog.io/artifactory/' },
        { name: 'dev', url: 'https://dev.jfrog.io', username: ' alice ' },
        { name: 'no user', url: 'http://localhost:8082', username: '  ' },
      ]),
    ).toEqual([
      { name: 'Prod', url: 'https://prod.jfrog.io', username: undefined },
      { name: 'dev', url: 'https://dev.jfrog.io', username: 'alice' },
      { name: 'no user', url: 'http://localhost:8082', username: undefined },
    ]);
  });

  it('skips invalid entries and later duplicates of a name', () => {
    expect(
      readServerProfiles([
        null,
        'https://x.io',
        { name: '', url: 'https://x.io' },
        { name: 'no url' },
        { name: 'bad url', url: 'ftp://x.io' },
        { name: 'Prod', url: 'https://first.io' },
        { name: 'PROD', url: 'https://second.io' },
      ]).map((s) => s.url),
    ).toEqual(['https://first.io']);
  });

  it('returns nothing for a setting that is not an array', () => {
    expect(readServerProfiles(undefined)).toEqual([]);
    expect(readServerProfiles({ name: 'x' })).toEqual([]);
  });
});

describe('pickActive', () => {
  it('finds the active server ignoring case', () => {
    expect(pickActive([prod, dev], 'DEV')).toBe(dev);
  });

  it('falls back to the first server when the active one is gone or unset', () => {
    expect(pickActive([prod, dev], 'removed')).toBe(prod);
    expect(pickActive([prod, dev], undefined)).toBe(prod);
    expect(pickActive([], 'dev')).toBeUndefined();
  });
});

describe('tokenSecretKey', () => {
  it('is stable across case and whitespace and safe for any name', () => {
    expect(tokenSecretKey(' Prod ')).toBe(tokenSecretKey('prod'));
    expect(tokenSecretKey('a/b c')).toBe('jfrogRequestCenter.token.a%2Fb%20c');
    expect(tokenSecretKey('prod')).not.toBe(tokenSecretKey('dev'));
  });
});

describe('validateServerName', () => {
  it('rejects empty and taken names', () => {
    expect(validateServerName('  ', [prod])).toBe('Enter a name');
    expect(validateServerName('prod', [prod])).toBe('A server named "Prod" already exists');
    expect(validateServerName('staging', [prod])).toBeUndefined();
  });

  it('allows keeping (or recasing) the name of the server being edited', () => {
    expect(validateServerName('PROD', [prod, dev], 'Prod')).toBeUndefined();
    expect(validateServerName('dev', [prod, dev], 'Prod')).toBe(
      'A server named "dev" already exists',
    );
  });
});

describe('upsertServer / removeServer', () => {
  it('appends new servers', () => {
    expect(upsertServer([prod], dev)).toEqual([prod, dev]);
  });

  it('replaces an edited server in place, including a rename', () => {
    const renamed = { ...prod, name: 'Production' };
    expect(upsertServer([prod, dev], renamed, 'prod')).toEqual([renamed, dev]);
  });

  it('removes by name ignoring case', () => {
    expect(removeServer([prod, dev], 'PROD')).toEqual([dev]);
  });
});

describe('legacyProfile', () => {
  it('converts the old single-connection settings', () => {
    expect(legacyProfile('https://acme.jfrog.io/artifactory', 'bob')).toEqual({
      name: 'acme.jfrog.io',
      url: 'https://acme.jfrog.io',
      username: 'bob',
    });
  });

  it('ignores missing or invalid URLs', () => {
    expect(legacyProfile('', 'bob')).toBeUndefined();
    expect(legacyProfile(undefined, undefined)).toBeUndefined();
    expect(legacyProfile('not a url', undefined)).toBeUndefined();
  });
});

describe('helpers', () => {
  it('names servers after their host', () => {
    expect(defaultServerName('https://acme.jfrog.io:8443/x')).toBe('acme.jfrog.io:8443');
  });

  it('writes settings without empty usernames', () => {
    expect(toSetting(prod)).toEqual({ name: 'Prod', url: 'https://prod.jfrog.io' });
    expect(toSetting(dev)).toEqual({ name: 'dev', url: 'https://dev.jfrog.io', username: 'alice' });
  });
});
