import semver from 'semver';
import { mapWithConcurrency } from '../utils/mapWithConcurrency.js';
import { triageFindings } from './triage.js';

const DETAIL_CONCURRENCY = 5;
const GITHUB_SEVERITIES = { LOW: 'low', MODERATE: 'moderate', HIGH: 'high', CRITICAL: 'critical' };

/**
 * Checks every installed (name, version) against OSV and returns triaged
 * findings. Dependencies are injected so this runs without network in tests:
 *   osv:   { queryBatch(packages), getVulnerability(id) }
 *   cache: { getMany(ids) -> Map(id -> record), saveMany(records) }
 * Any OSV failure throws, so a scan is either complete or failed, never partial.
 */
export async function scanDependencies(dependencies, { osv, cache }) {
  const idsPerDependency = await osv.queryBatch(dependencies);
  const allIds = [...new Set(idsPerDependency.flat())];

  const records = await cache.getMany(allIds);
  const missing = allIds.filter((id) => !records.has(id));
  const fetched = await mapWithConcurrency(missing, DETAIL_CONCURRENCY, (id) => osv.getVulnerability(id));
  fetched.forEach((record) => records.set(record.id, record));
  if (fetched.length > 0) await cache.saveMany(fetched);

  const findings = dependencies.flatMap((dependency, index) =>
    idsPerDependency[index]
      .map((id) => records.get(id))
      .filter((record) => record && !record.withdrawn)
      .map((record) => findingFromRecord(record, dependency)),
  );
  return triageFindings(findings);
}

/** One OSV record applied to one installed package, in plain terms. */
export function findingFromRecord(record, { name, version, isDev, isDirect }) {
  return {
    vulnId: record.id,
    aliases: record.aliases ?? [],
    packageName: name,
    installedVersion: version,
    severity: severityOf(record),
    summary: record.summary || firstSentence(record.details) || 'No description was published for this issue.',
    fixedVersion: fixedVersionFor(record, name, version),
    isDev,
    isDirect,
  };
}

/** GitHub advisories rate issues LOW, MODERATE, HIGH or CRITICAL; anything else is unknown. */
export function severityOf(record) {
  return GITHUB_SEVERITIES[String(record.database_specific?.severity).toUpperCase()] ?? 'unknown';
}

/**
 * The smallest "fixed" version above the installed one, across this package's
 * SEMVER ranges, or null when no fix has been released yet.
 */
export function fixedVersionFor(record, packageName, installedVersion) {
  if (!semver.valid(installedVersion)) return null;
  const candidates = (record.affected ?? [])
    .filter((entry) => entry.package?.ecosystem === 'npm' && entry.package?.name === packageName)
    .flatMap((entry) => entry.ranges ?? [])
    .filter((range) => range.type === 'SEMVER')
    .flatMap((range) => range.events ?? [])
    .map((event) => event.fixed)
    .filter((fixed) => semver.valid(fixed) && semver.gt(fixed, installedVersion));

  return candidates.length > 0 ? candidates.sort(semver.compare)[0] : null;
}

function firstSentence(text) {
  return text?.split(/(?<=\.)\s|\n/)[0]?.trim();
}
