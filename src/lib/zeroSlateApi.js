const ZERO_SLATE_API_URL = ((import.meta.env?.VITE_ZERO_SLATE_API_URL) || 'https://zeroslate.kr').replace(/\/$/, '');

async function readResponse(response) {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = typeof payload?.error === 'string' ? payload.error : 'ZeroSlate 요청에 실패했습니다.';
    throw new Error(message);
  }
  return payload;
}

export async function exchangeSuiteCode(code, { fetchImpl = fetch } = {}) {
  if (!code) return false;

  const response = await fetchImpl(`${ZERO_SLATE_API_URL}/api/auth/suite/exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });

  return readResponse(response);
}

export function removeSuiteCodeFromUrl(locationHref) {
  const cleanUrl = new URL(locationHref);
  cleanUrl.searchParams.delete('suiteCode');
  return cleanUrl.toString();
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
  await supabaseAuth.setSession({
    access_token: handoff.access_token,
    refresh_token: handoff.refresh_token,
  });

  return true;
}
