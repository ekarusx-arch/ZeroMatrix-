const ZERO_SLATE_API_URL = ((import.meta.env?.VITE_ZERO_SLATE_API_URL) || 'https://zeroslate.kr').replace(/\/$/, '');
const ZERO_SLATE_MATRIX_API_URL = `${ZERO_SLATE_API_URL}/api/suite/matrix`;
const NETWORK_ERROR_PATTERN = /(Failed to fetch|NetworkError|Load failed|fetch failed)/i;

async function readResponse(response) {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = (
      typeof payload?.error === 'string' && payload.error
    ) || (
      typeof payload?.message === 'string' && payload.message
    ) || 'ZeroSlate 요청에 실패했습니다.';
    throw new Error(message);
  }
  return payload;
}

function buildAuthorizedHeaders(accessToken, hasBody, extraHeaders = {}) {
  return {
    ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
    Authorization: `Bearer ${accessToken}`,
    ...extraHeaders,
  };
}

function wrapNetworkError(error, fallbackMessage) {
  if (error instanceof Error && NETWORK_ERROR_PATTERN.test(error.message)) {
    return new Error(fallbackMessage);
  }
  if (error instanceof Error) return error;
  return new Error(fallbackMessage);
}

async function requestJson(url, { fetchImpl = fetch, fallbackMessage = 'ZeroSlate 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.', ...options } = {}) {
  try {
    const response = await fetchImpl(url, options);
    return await readResponse(response);
  } catch (error) {
    throw wrapNetworkError(error, fallbackMessage);
  }
}

export async function exchangeSuiteCode(code, { fetchImpl = fetch } = {}) {
  if (!code) return false;

  return requestJson(`${ZERO_SLATE_API_URL}/api/auth/suite/exchange`, {
    fetchImpl,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
    fallbackMessage: 'ZeroSlate 로그인 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.',
  });
}

export function removeSuiteCodeFromUrl(locationHref) {
  const cleanUrl = new URL(locationHref);
  cleanUrl.searchParams.delete('suiteCode');
  return cleanUrl.toString();
}

function isExpiredEntitlement(entitlement, now = Date.now()) {
  if (!entitlement) return false;
  if (entitlement.status === 'expired') return true;
  if (!entitlement.expiresAt) return false;
  const expiresAt = new Date(entitlement.expiresAt).getTime();
  return Number.isFinite(expiresAt) && expiresAt <= now;
}

export function resolveEntitlementGate(entitlement, now = Date.now()) {
  if (entitlement?.plan === 'pro' && !isExpiredEntitlement(entitlement, now)) {
    return { allowed: true, reason: 'pro' };
  }
  if (isExpiredEntitlement(entitlement, now)) {
    return { allowed: false, reason: 'expired' };
  }
  return { allowed: false, reason: 'free' };
}

export async function fetchZeroSlateEntitlements(accessToken, { fetchImpl = fetch } = {}) {
  if (!accessToken) {
    throw new Error('ZeroSlate 로그인 토큰이 없어 Pro 권한을 확인할 수 없습니다. 다시 로그인해 주세요.');
  }

  return requestJson(`${ZERO_SLATE_API_URL}/api/entitlements`, {
    fetchImpl,
    cache: 'no-store',
    headers: buildAuthorizedHeaders(accessToken, false),
    fallbackMessage: 'ZeroSlate Pro 권한 확인 서버에 연결하지 못했습니다. 네트워크를 확인한 뒤 다시 시도해 주세요.',
  });
}

async function requestMatrix(path, accessToken, { fetchImpl = fetch, method = 'GET', body, headers, cache } = {}) {
  if (!accessToken) {
    throw new Error('ZeroSlate 로그인 토큰이 없어 Matrix 데이터를 불러올 수 없습니다. 다시 로그인해 주세요.');
  }

  return requestJson(`${ZERO_SLATE_MATRIX_API_URL}${path}`, {
    fetchImpl,
    method,
    cache,
    headers: buildAuthorizedHeaders(accessToken, Boolean(body), headers),
    ...(body ? { body: JSON.stringify(body) } : {}),
    fallbackMessage: 'ZeroSlate Matrix 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.',
  });
}

export function fetchMatrixTasks(accessToken, options) {
  return requestMatrix('/tasks', accessToken, options);
}

export function createMatrixTask(accessToken, task, options) {
  return requestMatrix('/tasks', accessToken, { ...options, method: 'POST', body: task });
}

export function updateMatrixTask(accessToken, taskId, patch, options) {
  return requestMatrix(`/tasks/${taskId}`, accessToken, { ...options, method: 'PATCH', body: patch });
}

export function deleteMatrixTask(accessToken, taskId, options) {
  return requestMatrix(`/tasks/${taskId}`, accessToken, { ...options, method: 'DELETE' });
}

export function fetchMatrixSettings(accessToken, options) {
  return requestMatrix('/tag-palette', accessToken, options);
}

export function upsertMatrixSettings(accessToken, settings, options) {
  return requestMatrix('/tag-palette', accessToken, { ...options, method: 'PUT', body: settings });
}

export function fetchMatrixBrainDumps(accessToken, date, options) {
  const params = new URLSearchParams();
  if (date) params.set('date', date);
  return requestMatrix(`/brain-dumps?${params.toString()}`, accessToken, options);
}

export function fetchMatrixTopThree(accessToken, date, options) {
  const params = new URLSearchParams();
  if (date) params.set('date', date);
  return requestMatrix(`/top-three?${params.toString()}`, accessToken, options);
}

export async function consumeSuiteLogin({
  suiteCode,
  supabaseAuth,
  locationHref,
  replaceUrl,
  fetchImpl,
}) {
  if (!suiteCode) return false;

  replaceUrl?.(removeSuiteCodeFromUrl(locationHref));
  const handoff = await exchangeSuiteCode(suiteCode, { fetchImpl });
  if (handoff?.token_hash && handoff?.type) {
    const { error } = await supabaseAuth.verifyOtp({
      token_hash: handoff.token_hash,
      type: handoff.type,
    });
    if (error) throw error;
    return true;
  }

  throw new Error('ZeroSlate 로그인 응답 형식을 해석하지 못했습니다. 다시 로그인해 주세요.');

}
