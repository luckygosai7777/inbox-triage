/**
 * Reading a response from our own API, including when it is not one.
 *
 * `await response.json()` assumes the server got far enough to produce JSON.
 * When a function times out, runs out of memory, or dies before the handler,
 * the platform answers instead — with an HTML or plain-text error page. Calling
 * .json() on that throws a SyntaxError whose message is the first few
 * characters of the page, so the user is shown:
 *
 *     Unexpected token 'A', "An error o"... is not valid JSON
 *
 * which describes our parser rather than their problem, and sends whoever is
 * debugging it looking in exactly the wrong place.
 *
 * This reads the body once as text and decides what it is, so a failure is
 * always reported as what actually happened.
 */

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string; status: number };

export async function readJson<T = any>(response: Response): Promise<ApiResult<T>> {
  const text = await response.text().catch(() => '');

  // An empty body is not JSON either. It routes through the same explanation
  // path, or a 502 with nothing in it reports as a bare "Request failed" —
  // technically true and useless, which is the failure mode this file exists
  // to remove.
  let parsed: any = null;
  if (text.trim()) {
    try {
      parsed = JSON.parse(text);
    } catch {
      return { ok: false, status: response.status, error: describeNonJson(response.status, text) };
    }
  } else if (!response.ok) {
    return { ok: false, status: response.status, error: describeNonJson(response.status, '') };
  }

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: parsed?.error ?? `Request failed (${response.status}).`,
    };
  }
  return { ok: true, data: parsed as T };
}

/** Say what a non-JSON response most likely means, in the user's terms. */
function describeNonJson(status: number, body: string): string {
  if (status === 504 || /timed? ?out/i.test(body)) {
    return 'That took too long and was cut off. It usually means the writing model is busy — try again in a moment.';
  }
  if (status === 413) return 'That was too large to send.';
  if (status === 502 || status === 503) {
    return 'The server did not respond properly. Try again in a moment.';
  }
  if (status >= 500) return `The server hit an error (${status}). Try again in a moment.`;
  if (status === 401) return 'Your session has expired. Sign in again.';
  return `Unexpected response from the server (${status}).`;
}

/** fetch + readJson, for the common case. */
export async function apiFetch<T = any>(
  input: string,
  init?: RequestInit,
): Promise<ApiResult<T>> {
  try {
    const response = await fetch(input, { credentials: 'include', ...init });
    return readJson<T>(response);
  } catch (error) {
    // A thrown fetch is a network problem, not a server one.
    return {
      ok: false,
      status: 0,
      error: `Could not reach the server — ${(error as Error).message}`,
    };
  }
}
