import { createServer, Socket } from "node:net";
import { connect as tlsConnect } from "node:tls";
import { activeAllowed, parseTarget } from "../shared/scope";
import type { ScopeRule } from "../shared/types";
import { clTeProbe, parseClFirst, SMUGGLE_MARKER, type LabVerdict } from "../shared/smugglingLab";

export type LabRun = LabVerdict & { port: number; bytesSent: number };

export async function runLocalSmugglingLab(): Promise<LabRun> {
  const server = createServer();
  const port = await new Promise<number>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("Lab failed to bind."));
        return;
      }
      resolve(addr.port);
    });
  });
  const received = new Promise<Buffer>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Lab received no probe.")), 5_000);
    server.once("connection", (socket) => {
      const chunks: Buffer[] = [];
      socket.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      const finish = () => {
        clearTimeout(timer);
        resolve(Buffer.concat(chunks));
      };
      socket.on("end", finish);
      socket.on("close", finish);
      socket.on("error", reject);
    });
  });
  const probe = clTeProbe("127.0.0.1", "/lab");
  await new Promise<void>((resolve, reject) => {
    const sock = new Socket();
    sock.once("error", reject);
    sock.connect(port, "127.0.0.1", () => {
      sock.write(probe, () => {
        sock.end();
        resolve();
      });
    });
  });
  try {
    const raw = await received;
    return { ...parseClFirst(raw), port, bytesSent: probe.byteLength };
  } finally {
    server.close();
  }
}

export type ProbeRun = LabVerdict & { bytesSent: number; raw: string; statusLines: string[] };

export async function runScopedSmugglingProbe(
  url: string,
  control: { listScope: (projectId?: string) => Promise<ScopeRule[]> },
): Promise<ProbeRun> {
  const target = parseTarget(url);
  if (target.scheme !== "http" && target.scheme !== "https") {
    throw new Error("Smuggling probes only support http and https URLs.");
  }
  const rules = await control.listScope();
  if (!activeAllowed(rules, target.host, target.port, target.path)) {
    throw new Error(`Active tools cannot probe ${target.host}${target.path} because it is out of scope. Add an include rule and retry.`);
  }
  const probe = clTeProbe(target.host, target.path || "/");
  const raw = await sendRaw(target.scheme, target.host, target.port, probe);
  const statusLines = raw
    .split(/\r?\n/)
    .filter((line) => /^HTTP\/\d/.test(line));
  const smuggled = statusLines.length >= 2 || raw.includes(SMUGGLE_MARKER);
  return {
    kind: "cl-te",
    smuggled,
    leftover: statusLines.slice(1).join("\n"),
    detail: smuggled
      ? "The server returned more than one HTTP response or echoed the probe marker — inspect the raw reply. This is a hint, not a confirmed finding."
      : statusLines.length
        ? `The server answered with ${statusLines[0]}. No second response was observed.`
        : "No HTTP response was observed (timeout, reset, or empty). Inspect the raw bytes.",
    bytesSent: probe.byteLength,
    raw,
    statusLines,
  };
}

function sendRaw(scheme: string, host: string, port: number, probe: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const finish = (socket: { destroy: () => void }, err?: Error) => {
      socket.destroy();
      if (err) {
        reject(err);
        return;
      }
      resolve(Buffer.concat(chunks).toString("latin1"));
    };
    const onReady = (socket: import("node:net").Socket) => {
      const timer = setTimeout(() => finish(socket), 3_000);
      socket.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      socket.on("error", (err) => {
        clearTimeout(timer);
        finish(socket, err);
      });
      socket.on("end", () => {
        clearTimeout(timer);
        finish(socket);
      });
      socket.write(probe, (err) => {
        if (err) {
          clearTimeout(timer);
          finish(socket, err);
        }
      });
    };
    if (scheme === "https") {
      const socket = tlsConnect({ host, port, servername: host, timeout: 5_000 }, () => onReady(socket));
      socket.on("error", reject);
    } else {
      const socket = new Socket();
      socket.setTimeout(5_000, () => socket.destroy(new Error("Probe timed out.")));
      socket.once("error", reject);
      socket.connect(port, host, () => onReady(socket));
    }
  });
}
