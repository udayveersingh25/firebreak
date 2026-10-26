// Talks to the OSV.dev API (https://google.github.io/osv.dev/api/). Request
// and response shapes were checked against the docs and live calls:
//   POST /v1/querybatch { queries: [{ package: { name, ecosystem }, version, page_token? }] }
//     -> { results: [{ vulns: [{ id, modified }], next_page_token? }] } in query order
//   GET /v1/vulns/{id} -> the full OSV record (404 for an unknown ID)

export const BATCH_SIZE = 1000; // the docs give no maximum; this keeps each request small
const TIMEOUT_MS = 10_000;

/** Any OSV problem: unreachable, slow, or an unexpected answer. */
export class OsvError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'OsvError';
  }
}

export function createOsvClient({ baseUrl, fetchImpl = fetch, timeoutMs = TIMEOUT_MS }) {
  async function request(path, init) {
    let res;
    try {
      res = await fetchImpl(`${baseUrl}${path}`, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    } catch (error) {
      throw new OsvError(`OSV request failed: ${error.name}`, { cause: error });
    }
    if (!res.ok) throw new OsvError(`OSV answered ${res.status} for ${path}`);
    try {
      return await res.json();
    } catch (error) {
      throw new OsvError('OSV sent a response that is not JSON', { cause: error });
    }
  }

  return {
    /**
     * For each { name, version }, the IDs of vulnerabilities affecting that
     * exact npm version. Returns an array in the same order as `packages`.
     * Follows next_page_token until every query has all of its IDs.
     */
    async queryBatch(packages) {
      const ids = packages.map(() => []);
      let pending = packages.map((pkg, index) => ({ index, pkg, pageToken: undefined }));

      while (pending.length > 0) {
        const next = [];
        for (let start = 0; start < pending.length; start += BATCH_SIZE) {
          const chunk = pending.slice(start, start + BATCH_SIZE);
          const body = await request('/v1/querybatch', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              queries: chunk.map(({ pkg, pageToken }) => ({
                package: { name: pkg.name, ecosystem: 'npm' },
                version: pkg.version,
                ...(pageToken && { page_token: pageToken }),
              })),
            }),
          });
          if (!Array.isArray(body?.results) || body.results.length !== chunk.length) {
            throw new OsvError('OSV returned a different number of results than queries');
          }
          body.results.forEach((result, position) => {
            const query = chunk[position];
            for (const vuln of result.vulns ?? []) ids[query.index].push(vuln.id);
            // Only queries with more results need a follow-up page.
            if (result.next_page_token) next.push({ ...query, pageToken: result.next_page_token });
          });
        }
        pending = next;
      }

      return ids.map((list) => [...new Set(list)]);
    },

    getVulnerability(id) {
      return request(`/v1/vulns/${encodeURIComponent(id)}`);
    },
  };
}
