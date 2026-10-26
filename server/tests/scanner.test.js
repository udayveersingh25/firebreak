import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createOsvClient, OsvError } from '../src/services/osvClient.js';
import { findingFromRecord, fixedVersionFor, scanDependencies, severityOf } from '../src/services/scanner.js';

// Real OSV records saved on 26 Oct 2026. Tests never touch the network.
const fixture = (id) =>
  JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'fixtures/osv', `${id}.json`), 'utf8'));
const LODASH_PROTOTYPE = fixture('GHSA-p6mc-m468-83gw');
const LODASH_COMMAND = fixture('GHSA-35jh-r3h4-6jhm');
const MINIMIST = fixture('GHSA-xvch-5gv4-984h');

const lodash = { name: 'lodash', version: '4.17.15', isDev: false, isDirect: true };
const minimist = { name: 'minimist', version: '1.2.5', isDev: true, isDirect: true };

describe('mapping an OSV record to a finding', () => {
  test('lodash prototype pollution, as installed by vibe-store', () => {
    assert.deepEqual(findingFromRecord(LODASH_PROTOTYPE, lodash), {
      vulnId: 'GHSA-p6mc-m468-83gw',
      aliases: ['CVE-2020-8203'],
      packageName: 'lodash',
      installedVersion: '4.17.15',
      severity: 'high',
      summary: 'Prototype Pollution in lodash',
      fixedVersion: '4.17.19',
      isDev: false,
      isDirect: true,
    });
  });

  test('uses database_specific.severity, otherwise unknown', () => {
    assert.equal(severityOf(MINIMIST), 'critical');
    assert.equal(severityOf({ ...MINIMIST, database_specific: {} }), 'unknown');
    assert.equal(severityOf({ id: 'X' }), 'unknown');
  });

  test('fixed version only looks at ranges for this exact package', () => {
    // The same record says lodash-es is fixed in 4.17.20; that must not leak in.
    assert.equal(fixedVersionFor(LODASH_PROTOTYPE, 'lodash', '4.17.15'), '4.17.19');
    assert.equal(fixedVersionFor(LODASH_PROTOTYPE, 'lodash-es', '4.17.15'), '4.17.20');
  });

  test('picks the smallest fix above the installed version across ranges', () => {
    // minimist has two ranges: fixed in 0.2.4 and in 1.2.6.
    assert.equal(fixedVersionFor(MINIMIST, 'minimist', '1.2.5'), '1.2.6');
    assert.equal(fixedVersionFor(MINIMIST, 'minimist', '0.0.8'), '0.2.4');
  });

  test('no fix released (only last_affected) gives null', () => {
    assert.equal(fixedVersionFor(LODASH_PROTOTYPE, 'lodash.pick', '4.4.0'), null);
  });

  test('falls back to the first sentence of details when there is no summary', () => {
    const finding = findingFromRecord({ ...MINIMIST, summary: '', details: 'First line here.\nMore.' }, minimist);
    assert.equal(finding.summary, 'First line here.');
  });
});

describe('scanning dependencies', () => {
  function fakeOsv(idsByName, records, { failOn } = {}) {
    const calls = { queryBatch: 0, getVulnerability: [] };
    return {
      calls,
      async queryBatch(packages) {
        calls.queryBatch += 1;
        return packages.map((pkg) => idsByName[pkg.name] ?? []);
      },
      async getVulnerability(id) {
        calls.getVulnerability.push(id);
        if (id === failOn) throw new OsvError('timeout');
        return records[id];
      },
    };
  }

  function memoryCache(initial = []) {
    const store = new Map(initial.map((record) => [record.id, record]));
    return {
      store,
      async getMany(ids) {
        return new Map(ids.filter((id) => store.has(id)).map((id) => [id, store.get(id)]));
      },
      async saveMany(records) {
        records.forEach((record) => store.set(record.id, record));
      },
    };
  }

  const records = {
    [LODASH_PROTOTYPE.id]: LODASH_PROTOTYPE,
    [LODASH_COMMAND.id]: LODASH_COMMAND,
    [MINIMIST.id]: MINIMIST,
  };
  const idsByName = { lodash: [LODASH_PROTOTYPE.id, LODASH_COMMAND.id], minimist: [MINIMIST.id] };

  test('returns triaged findings with real issues before dev-only noise', async () => {
    const findings = await scanDependencies([minimist, lodash, { name: 'ms', version: '2.1.3', isDev: false, isDirect: false }], {
      osv: fakeOsv(idsByName, records),
      cache: memoryCache(),
    });

    assert.deepEqual(
      findings.map((f) => [f.packageName, f.vulnId, f.priority]),
      [
        ['lodash', 'GHSA-35jh-r3h4-6jhm', 'fix_now'],
        ['lodash', 'GHSA-p6mc-m468-83gw', 'fix_now'],
        ['minimist', 'GHSA-xvch-5gv4-984h', 'low_risk'],
      ],
    );
  });

  test('uses cached records and caches new ones', async () => {
    const osv = fakeOsv(idsByName, records);
    const cache = memoryCache([LODASH_PROTOTYPE]);

    await scanDependencies([lodash, minimist], { osv, cache });

    assert.deepEqual(osv.calls.getVulnerability.sort(), [LODASH_COMMAND.id, MINIMIST.id]);
    assert.equal(cache.store.size, 3);
  });

  test('skips withdrawn advisories', async () => {
    const withdrawn = { ...MINIMIST, withdrawn: '2026-01-01T00:00:00Z' };
    const findings = await scanDependencies([minimist], {
      osv: fakeOsv(idsByName, { [MINIMIST.id]: withdrawn }),
      cache: memoryCache(),
    });

    assert.deepEqual(findings, []);
  });

  test('any OSV failure fails the whole scan, so partial results are never shown', async () => {
    await assert.rejects(
      scanDependencies([lodash, minimist], { osv: fakeOsv(idsByName, records, { failOn: MINIMIST.id }), cache: memoryCache() }),
      OsvError,
    );
  });
});

describe('OSV client', () => {
  function fakeFetch(handler) {
    const requests = [];
    const fetchImpl = async (url, init) => {
      requests.push({ url, body: init.body ? JSON.parse(init.body) : null });
      return handler(url, init, requests.length);
    };
    return { requests, fetchImpl };
  }
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status });

  test('sends one npm query per package and keeps the order', async () => {
    const { requests, fetchImpl } = fakeFetch(() =>
      json({ results: [{ vulns: [{ id: 'A', modified: 'x' }] }, {}] }),
    );
    const client = createOsvClient({ baseUrl: 'https://osv.test', fetchImpl });

    const ids = await client.queryBatch([lodash, minimist]);

    assert.deepEqual(ids, [['A'], []]);
    assert.equal(requests[0].url, 'https://osv.test/v1/querybatch');
    assert.deepEqual(requests[0].body.queries[0], { package: { name: 'lodash', ecosystem: 'npm' }, version: '4.17.15' });
  });

  test('follows next_page_token only for the queries that have one', async () => {
    const { requests, fetchImpl } = fakeFetch((url, init, call) =>
      call === 1
        ? json({ results: [{ vulns: [{ id: 'A' }], next_page_token: 'page2' }, { vulns: [{ id: 'B' }] }] })
        : json({ results: [{ vulns: [{ id: 'C' }] }] }),
    );
    const client = createOsvClient({ baseUrl: 'https://osv.test', fetchImpl });

    const ids = await client.queryBatch([lodash, minimist]);

    assert.deepEqual(ids, [['A', 'C'], ['B']]);
    assert.equal(requests[1].body.queries.length, 1);
    assert.equal(requests[1].body.queries[0].page_token, 'page2');
  });

  test('splits large inventories into batches of 1000', async () => {
    const { requests, fetchImpl } = fakeFetch((url, init) =>
      json({ results: JSON.parse(init.body).queries.map(() => ({})) }),
    );
    const client = createOsvClient({ baseUrl: 'https://osv.test', fetchImpl });
    const many = Array.from({ length: 2500 }, (_, i) => ({ name: `pkg-${i}`, version: '1.0.0' }));

    await client.queryBatch(many);

    assert.deepEqual(requests.map((r) => r.body.queries.length), [1000, 1000, 500]);
  });

  test('error statuses, network failures and timeouts become OsvError', async () => {
    const failing = [
      async () => json({}, 503),
      async () => {
        throw new TypeError('fetch failed');
      },
      async () => new Response('<html>oops</html>', { status: 200 }),
    ];
    for (const fetchImpl of failing) {
      const client = createOsvClient({ baseUrl: 'https://osv.test', fetchImpl });
      await assert.rejects(client.getVulnerability('X'), OsvError);
    }

    const slow = createOsvClient({
      baseUrl: 'https://osv.test',
      timeoutMs: 20,
      fetchImpl: (url, { signal }) =>
        new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason))),
    });
    await assert.rejects(slow.getVulnerability('X'), OsvError);
  });

  test('a mismatched number of results is an error, not a silent gap', async () => {
    const client = createOsvClient({ baseUrl: 'https://osv.test', fetchImpl: async () => json({ results: [] }) });

    await assert.rejects(client.queryBatch([lodash]), OsvError);
  });
});
