export function quotaState(policy, usage) {
  const required = ['monthlyCostUsd', 'monthlyRequests', 'dailyRequests', 'currentSecondRequests', 'projectedRequestCostUsd'];
  if (!usage || required.some((field) => !Number.isFinite(usage[field]) || usage[field] < 0)) return 'budget-exhausted';
  const dailyLimit = Math.min(policy.limits.requestsPerDay, policy.limits.applicationDailyBudget);
  const projectedCost = usage.projectedRequestCostUsd;
  if (usage.monthlyCostUsd + projectedCost > policy.limits.paidMonthlyCeilingUsd) return 'budget-exhausted';
  if (policy.limits.paidMonthlyCeilingUsd > 0 && usage.monthlyCostUsd >= policy.limits.paidMonthlyCeilingUsd) return 'budget-exhausted';
  if (usage.monthlyRequests >= policy.limits.applicationMonthlyBudget) return 'budget-exhausted';
  if (usage.currentSecondRequests >= policy.limits.requestsPerSecond) return 'quota-limited';
  if (usage.dailyRequests >= dailyLimit) return 'quota-limited';
  return 'available';
}

export function circuitState({ consecutiveFailures, circuitOpenUntil }, policy, now = new Date()) {
  if (circuitOpenUntil && Date.parse(circuitOpenUntil) > now.valueOf()) return 'open';
  if (consecutiveFailures >= policy.failure.automaticDisableAfterConsecutiveFailures) return 'open';
  if (circuitOpenUntil) return 'half-open';
  return 'closed';
}

export async function requestFingerprint({ sourceId, productId, zip = '', radiusMiles = '', condition = '', fulfillment = '' }) {
  const bytes = new TextEncoder().encode([sourceId, productId, zip, radiusMiles, condition, fulfillment].join(':'));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}
