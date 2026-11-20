export type AuthzSession = {
  id: string;
  name: string;
  /** Replacement Cookie header, or empty to drop cookies. */
  cookie?: string;
  /** Extra or replacement headers (Authorization, etc.). */
  headers: { name: string; value: string }[];
  /** When true, strip Cookie and Authorization from the baseline request. */
  stripAuth?: boolean;
};

export type AuthzReplay = {
  sessionId: string;
  sessionName: string;
  status: number | null;
  length: number;
  body: string;
  flowId?: string;
  error?: string;
};

export type AuthzVerdict = {
  sessionId: string;
  kind: "same" | "similar" | "different" | "denied" | "error";
  summary: string;
};

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function similarity(a: string, b: string): number {
  if (a === b) {
    return 1;
  }
  if (!a && !b) {
    return 1;
  }
  const left = new Set(normalize(a).split(" "));
  const right = new Set(normalize(b).split(" "));
  if (left.size === 0 && right.size === 0) {
    return 1;
  }
  let inter = 0;
  for (const token of left) {
    if (right.has(token)) {
      inter += 1;
    }
  }
  return inter / new Set([...left, ...right]).size;
}

export function compareAuthz(baseline: AuthzReplay, other: AuthzReplay): AuthzVerdict {
  if (other.error) {
    return { sessionId: other.sessionId, kind: "error", summary: other.error };
  }
  const status = other.status ?? 0;
  if (status === 401 || status === 403) {
    return { sessionId: other.sessionId, kind: "denied", summary: `${other.sessionName} was denied (${status}).` };
  }
  const score = similarity(baseline.body, other.body);
  const sameStatus = (baseline.status ?? 0) === status;
  if (score >= 0.98 && sameStatus) {
    return {
      sessionId: other.sessionId,
      kind: "same",
      summary: `${other.sessionName} received the same ${status} response — possible broken access control.`,
    };
  }
  if (score >= 0.7 && sameStatus && status >= 200 && status < 300) {
    return {
      sessionId: other.sessionId,
      kind: "similar",
      summary: `${other.sessionName} received a similar ${status} body (${Math.round(score * 100)}% overlap).`,
    };
  }
  return {
    sessionId: other.sessionId,
    kind: "different",
    summary: `${other.sessionName} received ${status} with a different body.`,
  };
}

export function applySessionHeaders(
  baseline: { name: string; value: string }[],
  session: AuthzSession,
): { name: string; value: string }[] {
  const skip = new Set(["cookie", "authorization"]);
  let headers = session.stripAuth
    ? baseline.filter((item) => !skip.has(item.name.toLowerCase()))
    : [...baseline];
  if (session.cookie !== undefined) {
    headers = headers.filter((item) => item.name.toLowerCase() !== "cookie");
    if (session.cookie) {
      headers.push({ name: "Cookie", value: session.cookie });
    }
  }
  for (const header of session.headers) {
    headers = headers.filter((item) => item.name.toLowerCase() !== header.name.toLowerCase());
    if (header.value) {
      headers.push(header);
    }
  }
  return headers;
}

export const DEFAULT_SESSIONS: AuthzSession[] = [
  { id: "original", name: "Original", headers: [] },
  { id: "anon", name: "Unauthenticated", headers: [], stripAuth: true, cookie: "" },
  { id: "other", name: "Other user", headers: [], cookie: "" },
];
