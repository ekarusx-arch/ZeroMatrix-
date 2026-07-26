import test from 'node:test';
import assert from 'node:assert/strict';
import {
  consumeSuiteLogin,
  exchangeSuiteCode,
  removeSuiteCodeFromUrl,
} from '../src/lib/zeroSlateApi.js';

test('exchangeSuiteCode posts suite code and returns token payload', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push([url, options]);
    return {
      ok: true,
      json: async () => ({
        access_token: 'access-token',
        refresh_token: 'refresh-token',
      }),
    };
  };

  const payload = await exchangeSuiteCode('suite-123', { fetchImpl });

  assert.deepEqual(payload, {
    access_token: 'access-token',
    refresh_token: 'refresh-token',
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'https://zeroslate.kr/api/auth/suite/exchange');
  assert.deepEqual(calls[0][1], {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: 'suite-123' }),
  });
});

test('consumeSuiteLogin sets Supabase session and strips suiteCode from url', async () => {
  const sessions = [];
  const replacedUrls = [];

  const didConsume = await consumeSuiteLogin({
    suiteCode: 'suite-abc',
    locationHref: 'https://matrix.zeroslate.kr/?suiteCode=suite-abc&returnUrl=https%3A%2F%2Fzeroslate.kr%2Fapp',
    replaceUrl: (nextUrl) => replacedUrls.push(nextUrl),
    supabaseAuth: {
      setSession: async (tokens) => {
        sessions.push(tokens);
      },
    },
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        access_token: 'new-access',
        refresh_token: 'new-refresh',
      }),
    }),
  });

  assert.equal(didConsume, true);
  assert.deepEqual(sessions, [{
    access_token: 'new-access',
    refresh_token: 'new-refresh',
  }]);
  assert.deepEqual(replacedUrls, [
    'https://matrix.zeroslate.kr/?returnUrl=https%3A%2F%2Fzeroslate.kr%2Fapp',
  ]);
});

test('removeSuiteCodeFromUrl only removes suiteCode and preserves the rest', () => {
  assert.equal(
    removeSuiteCodeFromUrl('https://matrix.zeroslate.kr/?suiteCode=once&date=2026-07-26&preview=matrix'),
    'https://matrix.zeroslate.kr/?date=2026-07-26&preview=matrix',
  );
});

test('consumeSuiteLogin strips suiteCode even when exchange fails', async () => {
  const replacedUrls = [];

  await assert.rejects(() => consumeSuiteLogin({
    suiteCode: 'expired-code',
    locationHref: 'https://matrix.zeroslate.kr/?suiteCode=expired-code&from=zeroslate',
    replaceUrl: (nextUrl) => replacedUrls.push(nextUrl),
    supabaseAuth: { setSession: async () => {} },
    fetchImpl: async () => ({
      ok: false,
      json: async () => ({ error: 'invalid_code' }),
    }),
  }));

  assert.deepEqual(replacedUrls, [
    'https://matrix.zeroslate.kr/?from=zeroslate',
  ]);
});
