/**
 * The latest TestSprite result, read from GitHub rather than written down here.
 *
 * TestSprite posts a "TestSprite V3" commit status on every pull request it
 * tests. This finds the most recent finished one across the last few pull
 * requests and returns it as it was posted, so the badge on the page can never
 * claim a result the tests did not give. Cached for ten minutes: GitHub allows
 * an unauthenticated caller sixty requests an hour.
 */

const REPO = "imprint-hash/almanac";
const TTL = 10 * 60_000;
let hit = null;

async function gh(path) {
  const headers = { accept: "application/vnd.github+json", "user-agent": "almanac-tested" };
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const r = await fetch(`https://api.github.com${path}`, { headers, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`GitHub ${r.status}`);
  return r.json();
}

async function latest() {
  const pulls = await gh(`/repos/${REPO}/pulls?state=all&sort=updated&direction=desc&per_page=5`);
  let best = null;
  for (const p of pulls) {
    const statuses = await gh(`/repos/${REPO}/commits/${p.head.sha}/statuses?per_page=50`);
    const done = statuses.find((s) => s.context === "TestSprite V3" && s.state !== "pending");
    if (done && (!best || done.updated_at > best.at)) {
      best = { pr: p.number, title: p.title, state: done.state, result: done.description, report: done.target_url, at: done.updated_at };
    }
  }
  return best;
}

export default async function handler(req, res) {
  try {
    if (!hit || Date.now() - hit.t > TTL) hit = { t: Date.now(), value: await latest() };
    res.setHeader("cache-control", "public, max-age=120, s-maxage=600, stale-while-revalidate=3600");
    res.status(200).json({ repo: REPO, latest: hit.value });
  } catch (err) {
    // Say so rather than show a stale or invented result.
    res.status(200).json({ repo: REPO, latest: null, error: `Could not read GitHub just now: ${err.message}` });
  }
}
