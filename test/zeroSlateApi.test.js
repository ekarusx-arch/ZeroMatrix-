import test from 'node:test';
import assert from 'node:assert/strict';
import {
  consumeSuiteLogin,
  createMatrixTask,
  deleteMatrixTask,
  exchangeSuiteCode,
  fetchMatrixBrainDumps,
  fetchMatrixSettings,
  fetchMatrixTasks,
  fetchMatrixTopThree,
  fetchZeroSlateEntitlements,
  removeSuiteCodeFromUrl,
  resolveEntitlementGate,
  updateMatrixTask,
  upsertMatrixSettings,
} from '../src/lib/zeroSlateApi.js';

test('exchangeSuiteCode posts suite code and returns one-time otp payload', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push([url, options]);
    return {
      ok: true,
      json: async () => ({ token_hash: 'otp-hash', type: 'magiclink' }),
    };
  };

  const payload = await exchangeSuiteCode('suite-123', { fetchImpl });

  assert.deepEqual(payload, { token_hash: 'otp-hash', type: 'magiclink' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'https://zeroslate.kr/api/auth/suite/exchange');
  assert.deepEqual(calls[0][1], {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: 'suite-123' }),
  });
});

test('consumeSuiteLogin verifies otp and strips suiteCode from url', async () => {
  const verifyCalls = [];
  const replacedUrls = [];

  const didConsume = await consumeSuiteLogin({
    suiteCode: 'suite-abc',
    locationHref: 'https://matrix.zeroslate.kr/?suiteCode=suite-abc&returnUrl=https%3A%2F%2Fzeroslate.kr%2Fapp',
    replaceUrl: (nextUrl) => replacedUrls.push(nextUrl),
    supabaseAuth: {
      verifyOtp: async (payload) => {
        verifyCalls.push(payload);
        return { error: null };
      },
    },
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ token_hash: 'otp-hash', type: 'magiclink' }),
    }),
  });

  assert.equal(didConsume, true);
  assert.deepEqual(verifyCalls, [{ token_hash: 'otp-hash', type: 'magiclink' }]);
  assert.deepEqual(replacedUrls, [
    'https://matrix.zeroslate.kr/?returnUrl=https%3A%2F%2Fzeroslate.kr%2Fapp',
  ]);
});

test('consumeSuiteLogin verifies otp when suite exchange returns token_hash payload', async () => {
  const verifyCalls = [];

  const didConsume = await consumeSuiteLogin({
    suiteCode: 'suite-otp',
    locationHref: 'https://matrix.zeroslate.kr/?suiteCode=suite-otp',
    replaceUrl: () => {},
    supabaseAuth: {
      verifyOtp: async (payload) => {
        verifyCalls.push(payload);
        return { error: null };
      },
    },
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        token_hash: 'otp-hash',
        type: 'magiclink',
      }),
    }),
  });

  assert.equal(didConsume, true);
  assert.deepEqual(verifyCalls, [{
    token_hash: 'otp-hash',
    type: 'magiclink',
  }]);
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
    supabaseAuth: { verifyOtp: async () => ({ error: null }) },
    fetchImpl: async () => ({
      ok: false,
      json: async () => ({ error: 'invalid_code' }),
    }),
  }));

  assert.deepEqual(replacedUrls, [
    'https://matrix.zeroslate.kr/?from=zeroslate',
  ]);
});

test('fetchZeroSlateEntitlements uses bearer token and no-store cache', async () => {
  const calls = [];
  const payload = await fetchZeroSlateEntitlements('suite-access', {
    fetchImpl: async (url, options) => {
      calls.push([url, options]);
      return {
        ok: true,
        json: async () => ({ plan: 'pro', authenticated: true }),
      };
    },
  });

  assert.deepEqual(payload, { plan: 'pro', authenticated: true });
  assert.equal(calls[0][0], 'https://zeroslate.kr/api/entitlements');
  assert.deepEqual(calls[0][1], {
    cache: 'no-store',
    headers: { Authorization: 'Bearer suite-access' },
  });
});

test('resolveEntitlementGate distinguishes pro free and expired access', () => {
  assert.deepEqual(resolveEntitlementGate({ plan: 'pro' }, Date.UTC(2026, 6, 29)), {
    allowed: true,
    reason: 'pro',
  });
  assert.deepEqual(resolveEntitlementGate({ plan: 'free' }, Date.UTC(2026, 6, 29)), {
    allowed: false,
    reason: 'free',
  });
  assert.deepEqual(resolveEntitlementGate({
    plan: 'pro',
    expiresAt: '2026-07-28T23:59:59.000Z',
  }, Date.UTC(2026, 6, 29)), {
    allowed: false,
    reason: 'expired',
  });
});

test('matrix api helpers call suite endpoints with bearer auth', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push([url, options]);
    return {
      ok: true,
      json: async () => ({ ok: true }),
    };
  };

  await fetchMatrixTasks('suite-access', { fetchImpl });
  await createMatrixTask('suite-access', { content: 'Task' }, { fetchImpl });
  await updateMatrixTask('suite-access', 'task-1', { quadrant: 'q2' }, { fetchImpl });
  await deleteMatrixTask('suite-access', 'task-1', { fetchImpl });
  await fetchMatrixSettings('suite-access', { fetchImpl });
  await upsertMatrixSettings('suite-access', { custom_tags: [] }, { fetchImpl });
  await fetchMatrixBrainDumps('suite-access', '2026-07-29', { fetchImpl });
  await fetchMatrixTopThree('suite-access', '2026-07-29', { fetchImpl });

  assert.deepEqual(calls, [
    ['https://zeroslate.kr/api/suite/matrix/tasks', { method: 'GET', cache: undefined, headers: { Authorization: 'Bearer suite-access' } }],
    ['https://zeroslate.kr/api/suite/matrix/tasks', { method: 'POST', cache: undefined, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer suite-access' }, body: JSON.stringify({ content: 'Task' }) }],
    ['https://zeroslate.kr/api/suite/matrix/tasks/task-1', { method: 'PATCH', cache: undefined, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer suite-access' }, body: JSON.stringify({ quadrant: 'q2' }) }],
    ['https://zeroslate.kr/api/suite/matrix/tasks/task-1', { method: 'DELETE', cache: undefined, headers: { Authorization: 'Bearer suite-access' } }],
    ['https://zeroslate.kr/api/suite/matrix/tag-palette', { method: 'GET', cache: undefined, headers: { Authorization: 'Bearer suite-access' } }],
    ['https://zeroslate.kr/api/suite/matrix/tag-palette', { method: 'PUT', cache: undefined, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer suite-access' }, body: JSON.stringify({ custom_tags: [] }) }],
    ['https://zeroslate.kr/api/suite/matrix/brain-dumps?date=2026-07-29', { method: 'GET', cache: undefined, headers: { Authorization: 'Bearer suite-access' } }],
    ['https://zeroslate.kr/api/suite/matrix/top-three?date=2026-07-29', { method: 'GET', cache: undefined, headers: { Authorization: 'Bearer suite-access' } }],
  ]);
});

test('matrix api helpers turn fetch failures into clear connection errors', async () => {
  await assert.rejects(
    () => fetchMatrixTasks('suite-access', {
      fetchImpl: async () => {
        throw new TypeError('Failed to fetch');
      },
    }),
    /ZeroSlate Matrix 서버에 연결하지 못했습니다/,
  );
});
