export const SMUGGLE_MARKER = "LURKWIRE-SMUGGLE";

/** Harmless CL.TE request: a front-end that honors Content-Length leaves a second request in the buffer. */
export function clTeProbe(host = "127.0.0.1", path = "/"): Buffer {
  const smuggled = `GET ${path} HTTP/1.1\r\nHost: ${host}\r\nX-Lurkwire-Probe: ${SMUGGLE_MARKER}\r\n\r\n`;
  const body = `0\r\n\r\n${smuggled}`;
  const head =
    `POST ${path} HTTP/1.1\r\n` +
    `Host: ${host}\r\n` +
    `Content-Length: 5\r\n` +
    `Transfer-Encoding: chunked\r\n` +
    `Connection: keep-alive\r\n` +
    `\r\n`;
  return Buffer.concat([Buffer.from(head, "ascii"), Buffer.from(body, "ascii")]);
}

export type LabVerdict = {
  kind: "cl-te";
  smuggled: boolean;
  leftover: string;
  detail: string;
};

/** Mimic a proxy that reads Content-Length when both CL and TE are present. */
export function parseClFirst(raw: Buffer): LabVerdict {
  const text = raw.toString("latin1");
  const split = text.indexOf("\r\n\r\n");
  const headers = split === -1 ? text : text.slice(0, split);
  const body = split === -1 ? "" : text.slice(split + 4);
  const hasCl = /^Content-Length:/im.test(headers);
  const hasTe = /^Transfer-Encoding:/im.test(headers);
  const cl = Number(headers.match(/^Content-Length:\s*(\d+)/im)?.[1] ?? "NaN");
  if (hasCl && hasTe && Number.isFinite(cl)) {
    const leftover = body.slice(cl);
    const smuggled = /^(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\s/i.test(leftover.trim()) || leftover.includes(SMUGGLE_MARKER);
    return {
      kind: "cl-te",
      smuggled,
      leftover,
      detail: smuggled
        ? "A Content-Length-first front-end would leave a second request in the buffer (CL.TE)."
        : "Both CL and TE were present, but no second request was left over.",
    };
  }
  return { kind: "cl-te", smuggled: false, leftover: "", detail: "The probe did not include both Content-Length and Transfer-Encoding." };
}
