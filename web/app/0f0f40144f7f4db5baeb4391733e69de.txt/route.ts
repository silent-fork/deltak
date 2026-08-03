/**
 * IndexNow key verification — https://www.indexnow.org/documentation
 *
 * Bing and other IndexNow-participating search engines confirm ownership of
 * a submitted key by fetching it back from a file named after the key
 * itself, hosted at the site root. That means the *route path* has to stay
 * this exact string to answer the URL IndexNow expects — but the value it
 * serves still comes from the environment, not a second hardcoded copy, so
 * rotating the key later is one env var away from correct rather than a
 * source-file hunt.
 */
const INDEXNOW_KEY = process.env.DK_INDEXNOW_KEY ?? "0f0f40144f7f4db5baeb4391733e69de";

export function GET() {
  return new Response(INDEXNOW_KEY, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
