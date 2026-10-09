import { describe, expect, it } from 'vitest';
import { isUsableApiKey } from './home.js';

describe('isUsableApiKey', () => {
  it('accepts a real key', () => {
    expect(isUsableApiKey('ts_live_0123456789abcdef')).toBe(true);
  });

  it('rejects a missing or blank value', () => {
    expect(isUsableApiKey(undefined)).toBe(false);
    expect(isUsableApiKey('')).toBe(false);
    expect(isUsableApiKey('   ')).toBe(false);
  });

  it('rejects the .env.example placeholder', () => {
    expect(isUsableApiKey('your-key-from-https://console.typesafe.ai/keys')).toBe(false);
  });

  it('rejects an unresolved secret reference instead of sending it as a bearer token', () => {
    expect(isUsableApiKey('op://Vault/TypeSafe/credential')).toBe(false);
    expect(isUsableApiKey('vault://secret/typesafe')).toBe(false);
  });
});
