// Ranks findings by real-world risk, so the scary-but-irrelevant ones
// (dev-only tools) do not bury the ones that matter.

export const PRIORITIES = ['fix_now', 'fix_soon', 'plan_fix', 'low_risk'];
export const SEVERITIES = ['critical', 'high', 'moderate', 'low', 'unknown'];

export const PRIORITY_LABELS = {
  fix_now: 'Fix now',
  fix_soon: 'Fix soon',
  plan_fix: 'Plan a fix',
  low_risk: 'Low real-world risk',
};

const SEVERITY_WORDS = {
  critical: 'critical',
  high: 'high-severity',
  moderate: 'moderate',
  low: 'low-severity',
  unknown: 'not yet rated',
};

/** { priority, explanation } for one finding. */
export function triageFinding({ isDev, isDirect, severity }) {
  if (isDev) {
    return {
      priority: 'low_risk',
      explanation:
        'This package only runs on your computer during development, for example a file watcher. It is not part of what your users interact with.',
    };
  }

  const serious = severity === 'critical' || severity === 'high';
  if (serious && isDirect) {
    return {
      priority: 'fix_now',
      explanation: `You installed this package yourself and it runs in your live app. The issue is ${SEVERITY_WORDS[severity]}.`,
    };
  }
  if (serious) {
    return {
      priority: 'fix_soon',
      explanation: `This comes from a package you installed, not one you installed directly. It runs in your live app and the issue is ${SEVERITY_WORDS[severity]}.`,
    };
  }
  return {
    priority: 'plan_fix',
    explanation: `This runs in your live app, but the issue is ${SEVERITY_WORDS[severity] ?? 'not yet rated'}, so it can wait for your next planned update.`,
  };
}

/** Adds priority and explanation, then sorts by priority, severity, package name. */
export function triageFindings(findings) {
  return findings
    .map((finding) => ({ ...finding, ...triageFinding(finding) }))
    .sort(
      (a, b) =>
        PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority) ||
        SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity) ||
        a.packageName.localeCompare(b.packageName) ||
        a.vulnId.localeCompare(b.vulnId),
    );
}

/** { fix_now: 2, fix_soon: 0, ... } for the overview. */
export function countByPriority(findings) {
  return Object.fromEntries(
    PRIORITIES.map((priority) => [priority, findings.filter((finding) => finding.priority === priority).length]),
  );
}
