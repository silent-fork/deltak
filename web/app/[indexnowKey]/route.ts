import { notFound } from "next/navigation";

/**
 * IndexNow key verification — https://www.indexnow.org/documentation
 *
 * Bing and other IndexNow-participating search engines confirm ownership of
 * a submitted key by fetching it back from a file named `<key>.txt`, hosted
 * at the site root. Rather than a source folder literally named after the
 * key — which made every rotation a file rename *and* an env var update, and
 * left the previous key's folder behind as dead weight when that rename was
 * forgotten — this dynamic segment matches whatever `<key>.txt` the request
 * asks for and compares it against `DK_INDEXNOW_KEY` itself. Rotating the
 * key is now only ever an env var change and a redeploy: nothing in source
 * encodes the key's value or its former values.
 */

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ indexnowKey: string }> },
) {
  const key = process.env.DK_INDEXNOW_KEY;
  const { indexnowKey } = await params;
  if (!key || indexnowKey !== `${key}.txt`) notFound();

  return new Response(key, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
