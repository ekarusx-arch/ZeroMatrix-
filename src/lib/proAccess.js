import { supabase } from './supabaseClient';

const ACTIVE_STATUSES = new Set(['active', 'trialing', 'manual']);

function isActiveEntitlement(row) {
  if (!row || !ACTIVE_STATUSES.has(row.status || 'active')) return false;
  if (!row.expires_at) return true;
  return new Date(row.expires_at).getTime() > Date.now();
}

function freeAccess(status = 'free', error = null) {
  return {
    isPro: false,
    plan: 'free',
    status,
    expiresAt: null,
    error,
  };
}

export async function getProAccess(user) {
  if (!user?.id) return freeAccess('unauthenticated');

  let { data: row, error } = await supabaseQuery('user_id', user.id);
  if (error) return freeAccess('unavailable', error);

  if (!row && user.email) {
    ({ data: row, error } = await supabaseQuery('email', user.email));
    if (error) return freeAccess('unavailable', error);
  }

  if (!row) return freeAccess();

  const isPro = row.plan === 'pro' && isActiveEntitlement(row);
  return {
    isPro,
    plan: isPro ? 'pro' : 'free',
    status: row.status || 'active',
    expiresAt: row.expires_at || null,
    error: null,
  };
}

// Keep entitlement reads scoped to the authenticated user through Supabase RLS.
async function supabaseQuery(column, value) {
  const normalizedValue = column === 'email' ? String(value).trim().toLowerCase() : value;
  const request = supabase
    .from('user_entitlements')
    .select('plan, status, expires_at');

  return (column === 'email'
    ? request.ilike(column, normalizedValue)
    : request.eq(column, normalizedValue)
  ).maybeSingle();
}
