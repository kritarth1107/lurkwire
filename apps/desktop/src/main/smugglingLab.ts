import { createServer, Socket } from "node:net";
import { clTeProbe, parseClFirst, type LabVerdict } from "../shared/smugglingLab";

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
