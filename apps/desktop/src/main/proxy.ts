import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";
import { EventEmitter } from "node:events";
import { proxyBinary } from "./paths";

export type ProxyReady = {
  ok: boolean;
  proxy_listen: string;
  control_listen: string;
  ca_path: string;
  ca_fingerprint_sha256: string;
  data_dir: string;
  auth_token: string;
  default_project_id: string;
};

export class ProxySidecar extends EventEmitter {
  ready: ProxyReady | null = null;
  private child: ChildProcess | null = null;
  private token = randomBytes(32).toString("hex");
  private stopping = false;
  private restartTimer: NodeJS.Timeout | null = null;

  dataDir(): string {
    return join(app.getPath("userData"), "engine");
  }

  async start(): Promise<ProxyReady> {
    this.stopping = false;
    return this.spawnProcess();
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    const child = this.child;
    this.child = null;
    if (!child) {
      return;
    }
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        child.kill("SIGKILL");
        resolve();
      }, 2000);
      child.once("exit", () => {
        clearTimeout(timeout);
        resolve();
      });
      child.kill("SIGTERM");
    });
  }

  private spawnProcess(): Promise<ProxyReady> {
    const bin = proxyBinary();
    const dataDir = this.dataDir();
    mkdirSync(dataDir, { recursive: true });

    return new Promise((resolve, reject) => {
      const child = spawn(
        bin,
        [
          "--listen",
          "127.0.0.1:0",
          "--control",
          "127.0.0.1:0",
          "--data-dir",
          dataDir,
          "--auth-token",
          this.token,
        ],
        { stdio: ["ignore", "pipe", "pipe"] },
      );
      this.child = child;
      let stdout = "";
      let settled = false;

      const onReady = (ready: ProxyReady) => {
        if (settled) {
          return;
        }
        settled = true;
        this.ready = ready;
        this.emit("ready", ready);
        resolve(ready);
      };

      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        stdout += chunk;
        const lines = stdout.split("\n");
        stdout = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("{")) {
            continue;
          }
          try {
            const parsed = JSON.parse(trimmed) as ProxyReady;
            if (parsed.ok && parsed.proxy_listen) {
              onReady(parsed);
            }
          } catch {
            // ignore non-JSON
          }
        }
      });

      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk: string) => {
        for (const line of chunk.trim().split("\n")) {
          if (line) {
            console.error(`[proxy] ${line}`);
          }
        }
      });

      child.once("error", (err) => {
        if (!settled) {
          settled = true;
          reject(err);
        }
      });

      child.once("exit", (code, signal) => {
        this.child = null;
        this.emit("exit", { code, signal });
        if (!settled) {
          settled = true;
          reject(
            new Error(
              `lurkwire-proxy exited before becoming ready (code=${code}, signal=${signal})`,
            ),
          );
          return;
        }
        if (!this.stopping) {
          this.ready = this.ready
            ? { ...this.ready, ok: false }
            : this.ready;
          this.emit("down");
          this.restartTimer = setTimeout(() => {
            if (this.stopping) {
              return;
            }
            this.spawnProcess().catch((err) => {
              console.error("[proxy] restart failed", err);
              this.emit("down");
            });
          }, 750);
        }
      });

      setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error("lurkwire-proxy did not become ready in time"));
          child.kill("SIGTERM");
        }
      }, 15_000);
    });
  }
}
