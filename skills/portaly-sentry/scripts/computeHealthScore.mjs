// Canonical Portaly Sentry health score formula.
// MUST stay in sync with portaly-vibe/services/sentryScan/computeHealthScore.ts.
// Formula documented in references/health-check-contract.md (canonical source).

export const HEALTH_DEDUCTION = {
  failCritical: 15,
  failWarning: 5,
  failInfo: 1,
  warned: 2,
}

export function computeHealthScore(results) {
  let score = 100
  for (const r of results) {
    if (r.status === 'fail') {
      if (r.severity === 'critical') score -= HEALTH_DEDUCTION.failCritical
      else if (r.severity === 'warning') score -= HEALTH_DEDUCTION.failWarning
      else if (r.severity === 'info') score -= HEALTH_DEDUCTION.failInfo
    } else if (r.status === 'warn') {
      score -= HEALTH_DEDUCTION.warned
    }
  }
  return Math.max(0, Math.min(100, score))
}

export function healthBand(score) {
  if (score >= 90) return 'healthy'
  if (score >= 70) return 'needs-attention'
  return 'at-risk'
}

export function healthBandLabel(band) {
  if (band === 'healthy') return 'Healthy'
  if (band === 'needs-attention') return 'Needs attention'
  return 'At risk'
}
