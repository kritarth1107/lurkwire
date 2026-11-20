import { app, BrowserWindow, type NativeImage } from "electron";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, unlinkSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ControlClient } from "./control";
import type { TabManager } from "./tabs";
import type { AppPrefs, ToolId } from "../shared/types";
import type { PanelManager } from "./panels";
import { parseRunnerData } from "../shared/workbench";
import { loadWorkspace, runWorkbenchCollection, sendFromWorkbench, transportFrom } from "./workbench";
import { runLocalSmugglingLab } from "./smugglingLab";
import { invokeGrpc } from "./workbench/grpcClient";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor<T>(
  label: string,
  fn: () => Promise<T | null | undefined> | T | null | undefined,
  timeoutMs = 30_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last: unknown;
  while (Date.now() < deadline) {
    try {
      const value = await fn();
      if (value) {
        return value;
      }
    } catch (err) {
      last = err;
    }
    await sleep(200);
  }
  const extra = last instanceof Error ? `: ${last.message}` : last ? `: ${String(last)}` : "";
  throw new Error(`timeout waiting for ${label}${extra}`);
}

function isMostlySolid(image: NativeImage): boolean {
  const size = image.getSize();
  const bitmap = image.toBitmap();
  if (size.width * size.height === 0 || bitmap.length < 16) {
    return true;
  }
  const step = Math.max(1, Math.floor((size.width * size.height) / 200));
  let first = -1;
  for (let i = 0; i < size.width * size.height; i += step) {
    const o = i * 4;
    const key = bitmap[o]! | (bitmap[o + 1]! << 8) | (bitmap[o + 2]! << 16);
    if (first === -1) {
      first = key;
    } else if (key !== first) {
      return false;
    }
  }
  return true;
}

function stitch(
  chromePath: string,
  pagePath: string,
  bounds: { x: number; y: number; width: number; height: number },
  outPath: string,
): boolean {
  const result = spawnSync(
    "python3",
    [
      "-c",
      "from PIL import Image\nimport sys\nchrome, page, out = sys.argv[1:4]\nx, y, w, h = map(int, sys.argv[4:])\nbase = Image.open(chrome).convert('RGBA')\noverlay = Image.open(page).convert('RGBA')\nif overlay.size != (w, h):\n    overlay = overlay.resize((max(1,w), max(1,h)))\nbase.paste(overlay, (x, y), overlay)\nbase.convert('RGB').save(out, 'PNG')\n",
      chromePath,
      pagePath,
      outPath,
      String(Math.round(bounds.x)),
      String(Math.round(bounds.y)),
      String(Math.round(bounds.width)),
      String(Math.round(bounds.height)),
    ],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    console.log(`SMOKE stitch failed: ${result.stderr || result.stdout}`);
    return false;
  }
  return true;
}

function stitchAtBox(
  basePath: string,
  overlayPath: string,
  x: number,
  y: number,
  w: number,
  h: number,
  outPath: string,
): boolean {
  const result = spawnSync(
    "python3",
    [
      "-c",
      "from PIL import Image\nimport sys\nbase_path, overlay_path, out = sys.argv[1:4]\nx, y, w, h = map(int, sys.argv[4:])\nbase = Image.open(base_path).convert('RGBA')\noverlay = Image.open(overlay_path).convert('RGBA')\nif overlay.size != (w, h) and w > 1 and h > 1:\n    overlay = overlay.resize((w, h))\nbase.paste(overlay, (x, y), overlay)\nbase.convert('RGB').save(out, 'PNG')\n",
      basePath,
      overlayPath,
      outPath,
      String(Math.round(x)),
      String(Math.round(y)),
      String(Math.round(w)),
      String(Math.round(h)),
    ],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    console.log(`SMOKE box stitch failed: ${result.stderr || result.stdout}`);
    return false;
  }
  return true;
}

function stitchOverlay(
  basePath: string,
  overlayPath: string,
  x: number,
  y: number,
  outPath: string,
): boolean {
  const result = spawnSync(
    "python3",
    [
      "-c",
      "from PIL import Image\nimport sys\nbase_path, overlay_path, out = sys.argv[1:4]\nx, y = map(int, sys.argv[4:])\nbase = Image.open(base_path).convert('RGBA')\noverlay = Image.open(overlay_path).convert('RGBA')\nbase.paste(overlay, (x, y), overlay)\nbase.convert('RGB').save(out, 'PNG')\n",
      basePath,
      overlayPath,
      outPath,
      String(Math.round(x)),
      String(Math.round(y)),
    ],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    console.log(`SMOKE overlay stitch failed: ${result.stderr || result.stdout}`);
    return false;
  }
  return true;
}

async function captureDom(contents: Electron.WebContents): Promise<Buffer> {
  const dataUrl = (await contents.executeJavaScript(`(() => {
    const w = Math.max(document.documentElement.scrollWidth, 1440);
    const h = Math.max(document.documentElement.scrollHeight, 920);
    let css = "";
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        css += Array.from(sheet.cssRules).map((rule) => rule.cssText).join("\\n");
      } catch {}
    }
    const clone = document.documentElement.cloneNode(true);
    const style = document.createElement("style");
    style.textContent = css;
    const head = clone.querySelector("head") || clone;
    head.appendChild(style);
    const serialized = new XMLSerializer().serializeToString(clone);
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '">'
      + '<foreignObject width="100%" height="100%">' + serialized + "</foreignObject></svg>";
    const img = new Image();
    const loaded = new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error("dom snapshot failed"));
    });
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    return loaded.then(() => {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      const bg = getComputedStyle(document.body).backgroundColor || "#fff";
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0);
      return canvas.toDataURL("image/png");
    });
  })()`)) as string;
  if (!dataUrl?.startsWith("data:image/png")) {
    throw new Error("dom snapshot did not return a PNG");
  }
  return Buffer.from(dataUrl.split(",", 2)[1] ?? "", "base64");
}

async function captureWindow(
  window: BrowserWindow,
  dir: string,
  name: string,
  tabs: TabManager | null,
  opts?: { wholeWindow?: boolean },
): Promise<string> {
  const outPath = join(dir, name);
  console.log(`SMOKE capturing ${name}`);
  await sleep(300);
  let image = opts?.wholeWindow ? await window.capturePage() : await window.webContents.capturePage();
  console.log(`SMOKE webContents.capturePage ${name} solid=${isMostlySolid(image)} bytes=${image.toPNG().length}`);
  if (isMostlySolid(image)) {
    image = await window.capturePage();
    console.log(`SMOKE window.capturePage ${name} solid=${isMostlySolid(image)} bytes=${image.toPNG().length}`);
  }
  let png = image.toPNG();
  if (isMostlySolid(image) || png.length <= 12_000) {
    console.log(`SMOKE ${name} falling back to DOM snapshot`);
    png = await captureDom(window.webContents);
    console.log(`SMOKE ${name} DOM snapshot ${png.length} bytes`);
  }
  if (png.length <= 12_000) {
    throw new Error(`${name} capture is a solid color`);
  }
  if (opts?.wholeWindow && !isMostlySolid(image)) {
    writeFileSync(outPath, png);
    const size = image.getSize();
    console.log(`SMOKE wrote ${outPath} (whole window, ${png.length} bytes, ${size.width}x${size.height})`);
    return outPath;
  }
  const tabContents = tabs?.active()?.view.webContents;
  const bounds = tabs?.contentBounds();
  if (tabContents && bounds && bounds.width > 8 && bounds.height > 8 && !tabContents.isDestroyed()) {
    try {
      const pageImage = await tabContents.capturePage();
      if (!isMostlySolid(pageImage)) {
        const chromePath = join(dir, `.${name}.chrome.png`);
        const pagePath = join(dir, `.${name}.page.png`);
        writeFileSync(chromePath, png);
        writeFileSync(pagePath, pageImage.toPNG());
        const ok = stitch(chromePath, pagePath, bounds, outPath);
        try {
          unlinkSync(chromePath);
          unlinkSync(pagePath);
        } catch {
          // ignore
        }
        if (ok) {
          console.log(`SMOKE wrote ${outPath} (stitched)`);
          return outPath;
        }
      }
    } catch (err) {
      console.log(`SMOKE tab composite skipped for ${name}: ${err instanceof Error ? err.message : err}`);
    }
  }
  writeFileSync(outPath, png);
  const { width, height } = image.getSize();
  console.log(`SMOKE wrote ${outPath} (${png.length} bytes, ${width}x${height})`);
  return outPath;
}


async function captureContents(contents: Electron.WebContents): Promise<Buffer> {
  let image = await contents.capturePage();
  let png = image.toPNG();
  if (isMostlySolid(image) || png.length <= 12_000) {
    png = await captureDom(contents);
  }
  return png;
}

async function captureWithPanel(
  window: BrowserWindow,
  dir: string,
  name: string,
  tabs: TabManager | null,
  panels: PanelManager | null,
): Promise<string> {
  const outPath = await captureWindow(window, dir, name, tabs);
  const panel = panels?.currentWindow();
  if (!panel || panel.isDestroyed()) {
    return outPath;
  }
  await sleep(400);
  try {
    if (panel.webContents.isLoading()) {
      await new Promise<void>((resolve) => panel.webContents.once("did-finish-load", () => resolve()));
    }
    const overlay = await captureContents(panel.webContents);
    const overlayPath = join(dir, `.${name}.panel.png`);
    writeFileSync(overlayPath, overlay);
    const pb = panel.getBounds();
    const mb = window.getBounds();
    const ok = stitchOverlay(outPath, overlayPath, pb.x - mb.x, pb.y - mb.y, outPath);
    try {
      unlinkSync(overlayPath);
    } catch {
      // ignore
    }
    if (ok) {
      console.log(`SMOKE wrote ${outPath} (with panel)`);
    }
  } catch (err) {
    console.log(`SMOKE panel overlay skipped for ${name}: ${err instanceof Error ? err.message : err}`);
  }
  return outPath;
}

async function clickSelector(window: BrowserWindow, selector: string): Promise<boolean> {
  return (await window.webContents.executeJavaScript(
    `Boolean(document.querySelector(${JSON.stringify(selector)}) && (document.querySelector(${JSON.stringify(selector)}).click(), true))`,
  )) as boolean;
}


async function captureDevtools(
  window: BrowserWindow,
  dir: string,
  name: string,
  tabs: TabManager | null,
): Promise<string> {
  const outPath = await captureWindow(window, dir, name, tabs);
  const windows = BrowserWindow.getAllWindows().filter((item) => !item.isDestroyed() && item !== window);
  const devtoolsWin =
    windows.find((item) => item.webContents.getURL().startsWith("devtools://")) ??
    (tabs?.active()?.view.webContents.devToolsWebContents
      ? { webContents: tabs.active()!.view.webContents.devToolsWebContents! }
      : null);
  if (!devtoolsWin?.webContents || devtoolsWin.webContents.isDestroyed()) {
    console.log(`SMOKE devtools window missing (extra windows=${windows.length})`);
    return outPath;
  }
  try {
    const overlay = await captureContents(devtoolsWin.webContents);
    const overlayPath = join(dir, `.${name}.devtools.png`);
    writeFileSync(overlayPath, overlay);
    const size = window.getContentBounds();
    const slot = {
      x: Math.round(size.width * 0.42),
      y: Math.round(size.height * 0.22),
      width: Math.round(size.width * 0.56),
      height: Math.round(size.height * 0.72),
    };
    stitchAtBox(outPath, overlayPath, slot.x, slot.y, slot.width, slot.height, outPath);
    console.log(`SMOKE wrote ${outPath} (with detached devtools)`);
    try {
      unlinkSync(overlayPath);
    } catch {
      // ignore
    }
  } catch (err) {
    console.log(`SMOKE devtools overlay skipped: ${err instanceof Error ? err.message : err}`);
  }
  return outPath;
}



function flowMatches(item: { url: string; path?: string }, urlOrPath: string): boolean {
  try {
    const parsed = new URL(item.url);
    if (item.url === urlOrPath || parsed.href === urlOrPath) {
      return true;
    }
    if (urlOrPath.startsWith("/")) {
      return parsed.pathname === urlOrPath || parsed.pathname.startsWith(`${urlOrPath}/`);
    }
    if (urlOrPath.startsWith("http")) {
      const target = new URL(urlOrPath);
      return parsed.hostname === target.hostname && (parsed.pathname === target.pathname || parsed.pathname === `${target.pathname}/`);
    }
    return parsed.hostname.includes(urlOrPath) && (parsed.pathname === "/" || parsed.pathname === "");
  } catch {
    return item.url.includes(urlOrPath);
  }
}

async function assertDecodedBody(hooks: SmokeHooks, id: string, needle: string): Promise<void> {
  const detail = await hooks.control.getFlow(id);
  const preview = `${detail.resp_preview ?? ""} ${detail.req_preview ?? ""}`;
  const body = new Uint8Array(await hooks.control.getFlowBody(id, "resp"));
  if (body.length >= 2 && body[0] === 0x1f && body[1] === 0x8b) {
    throw new Error(`response body for ${id} is still gzip-compressed`);
  }
  const text = new TextDecoder("utf-8", { fatal: false }).decode(body);
  if (!text.includes(needle) && !preview.includes(needle)) {
    throw new Error(`decoded body for ${id} did not contain ${JSON.stringify(needle)} (preview=${preview.slice(0, 180)} text=${text.slice(0, 180)})`);
  }
  console.log(`SMOKE decoded body ok (${needle})`);
}

export function isSmokeRun(): boolean {
  return process.env.LURKWIRE_SMOKE === "1";
}

export type SmokeHooks = {
  window: () => BrowserWindow | null;
  tabs: () => TabManager | null;
  panels: () => PanelManager | null;
  control: ControlClient;
  proxyReady: () => boolean;
  currentProjectId: () => string | null;
  setPrefs: (patch: Partial<AppPrefs>) => void;
  selectTool: (tool: ToolId) => void;
  openNewTab: (url?: string) => Promise<void>;
  openDevTools: (mode?: Electron.OpenDevToolsOptions["mode"]) => void;
};

export async function runSmoke(hooks: SmokeHooks): Promise<string[]> {
  const out = process.env.LURKWIRE_SMOKE_OUT ?? join(__dirname, "../../../docs/screenshots");
  mkdirSync(out, { recursive: true });

  await waitFor("proxy ready", () => hooks.proxyReady());
  await waitFor("project", () => hooks.currentProjectId());
  const window = await waitFor("main window", () => hooks.window());
  if (window.webContents.isLoading()) {
    await new Promise<void>((resolve) => window.webContents.once("did-finish-load", () => resolve()));
  }
  window.setPosition(60, 60);
  window.show();
  await sleep(800);
  await window.webContents.executeJavaScript(
    "new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
  );
  window.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    console.log(`SMOKE render[${level}] ${message} (${sourceId}:${line})`);
  });
  const diag = await waitFor("renderer mount", async () => {
    const info = await window.webContents.executeJavaScript(`({
      title: document.title,
      theme: document.documentElement.dataset.theme || document.body.dataset.theme,
      text: (document.body.innerText || "").slice(0, 300),
      html: document.body.innerHTML.length,
      root: document.getElementById("root")?.childElementCount ?? 0,
      url: location.href,
    })`);
    return info.root > 0 ? info : null;
  }, 15_000);
  console.log("SMOKE renderer", JSON.stringify(diag));

  const tabs = hooks.tabs();
  if (!tabs) {
    throw new Error("tab manager missing");
  }
  let id = tabs.activeInfo()?.id;
  if (!id) {
    await hooks.openNewTab("https://example.com/");
    id = tabs.activeInfo()?.id;
  }
  if (!id) {
    throw new Error("no tab to navigate");
  }
  await tabs.navigate(id, "https://example.com/");
  await waitFor("example.com tab", () => {
    const url = tabs.activeInfo()?.url ?? "";
    return url.includes("example.com") ? url : null;
  });

  const projectId = hooks.currentProjectId() ?? undefined;
  const flow = await waitFor("example.com history flow", async () => {
    const list = await hooks.control.listFlows({ project_id: projectId, host: "example.com", limit: 50 });
    return list.items.find((item) => flowMatches(item, "https://example.com/")) ?? null;
  });
  console.log(`SMOKE history hit ${flow.method} ${flow.url} status=${flow.status} id=${flow.id}`);
  await assertDecodedBody(hooks, flow.id, "Example Domain");

  const sites = [
    { url: "https://httpbin.org/html", host: "httpbin.org", needle: "Herman Melville" },
    { url: "https://www.iana.org/domains/reserved", host: "www.iana.org", needle: "IANA" },
  ];
  for (const site of sites) {
    await tabs.navigate(id, site.url);
    await waitFor(`${site.host} tab`, () => {
      const url = tabs.activeInfo()?.url ?? "";
      return url.includes(site.host) ? url : null;
    }, 45_000);
    const hit = await waitFor(`${site.host} history flow`, async () => {
      const list = await hooks.control.listFlows({ project_id: projectId, host: site.host, limit: 50 });
      return list.items.find((item) => flowMatches(item, site.url)) ?? null;
    }, 45_000);
    console.log(`SMOKE history hit ${hit.method} ${hit.url} status=${hit.status} id=${hit.id}`);
    await assertDecodedBody(hooks, hit.id, site.needle);
  }

  if (projectId) {
    await hooks.control.addScope({ project_id: projectId, kind: "include", host: "httpbin.org", enabled: true });
  }
  const repeated = await hooks.control.sendRepeater({
    project_id: projectId,
    method: "GET",
    url: "https://httpbin.org/get?source=lurkwire-repeater",
    headers: [{ name: "Accept", value: "application/json" }],
  });
  console.log(`SMOKE repeater ${repeated.status} ${repeated.url}`);
  if (repeated.status !== 200) {
    throw new Error(`repeater expected 200, got ${repeated.status}`);
  }
  if (!repeated.resp_preview?.includes("lurkwire-repeater") && !repeated.resp_preview?.includes("httpbin")) {
    // Body may still be on the blob; check decoded bytes.
    await assertDecodedBody(hooks, repeated.id, "lurkwire-repeater");
  } else {
    console.log("SMOKE repeater preview ok");
  }

  const job = await hooks.control.startIntruder({
    project_id: projectId,
    method: "GET",
    url: "https://httpbin.org/get?q=§probe§",
    headers: [{ name: "Accept", value: "application/json" }],
    attack: "sniper",
    payloads: [["alpha", "beta"]],
    grep: "alpha",
    max_requests: 2,
  });
  const finished = await waitFor("intruder job", async () => {
    const current = await hooks.control.getIntruder(job.id);
    if (current.status === "error") {
      throw new Error(current.error || "intruder failed");
    }
    return current.status === "done" || current.status === "stopped" ? current : null;
  }, 60_000);
  console.log(`SMOKE intruder ${finished.status} finished=${finished.finished} results=${finished.results.length}`);
  if (finished.results.length < 2 || finished.results.some((row) => row.status !== 200 && !row.error)) {
    const detail = finished.results.map((row) => `${row.payload}:${row.status}:${row.error ?? ""}`).join(", ");
    throw new Error(`intruder results unexpected: ${detail || finished.error || finished.status}`);
  }

  const paths: string[] = [];

  const transport = transportFrom(hooks.control, hooks.currentProjectId);
  const workspace = loadWorkspace();
  const getEcho = workspace.requests.find((item) => item.name === "GET echo") ?? workspace.requests[0];
  const postJson = workspace.requests.find((item) => item.name === "POST JSON");
  if (!getEcho) {
    throw new Error("starter Workbench collection is missing");
  }
  const sent = await sendFromWorkbench(getEcho, transport);
  console.log(`SMOKE workbench send ${sent.status} flow=${sent.flowId ?? ""} error=${sent.error ?? ""}`);
  if (sent.error) {
    throw new Error(`workbench send failed: ${sent.error}`);
  }
  if (sent.status !== 200) {
    throw new Error(`workbench send expected 200, got ${sent.status}`);
  }
  if (postJson) {
    const posted = await sendFromWorkbench(postJson, transport);
    console.log(`SMOKE workbench post ${posted.status} error=${posted.error ?? ""}`);
    if (posted.error || posted.status !== 200) {
      throw new Error(`workbench POST failed: ${posted.error ?? posted.status}`);
    }
  }
  const ran = await runWorkbenchCollection({
    requestIds: [getEcho.id],
    data: parseRunnerData("id,q\n1,alpha\n2,beta"),
    delayMs: 0,
    stopOnFail: false,
  }, transport);
  console.log(`SMOKE workbench runner ${ran.length} ${ran.map((item) => item.result.status).join(",")}`);
  if (ran.length !== 2 || ran.some((item) => item.result.error || item.result.status !== 200)) {
    throw new Error(`workbench runner unexpected: ${JSON.stringify(ran.map((item) => ({ status: item.result.status, error: item.result.error })))}`);
  }
  const workbenchFlows = await hooks.control.listFlows({ project_id: projectId, source: "workbench", limit: 20 });
  console.log(`SMOKE workbench history ${workbenchFlows.items.length} source=${workbenchFlows.items.map((item) => item.source).join(",")}`);
  if (workbenchFlows.items.length < 3 || workbenchFlows.items.some((item) => item.source !== "workbench")) {
    throw new Error(`expected workbench history entries, got ${workbenchFlows.items.length}`);
  }


  const lab = await runLocalSmugglingLab();
  console.log(`SMOKE smuggling lab port=${lab.port} smuggled=${lab.smuggled}`);
  if (!lab.smuggled) {
    throw new Error(`local smuggling lab did not confirm the CL.TE leftover: ${lab.detail}`);
  }
  const proto = `
syntax = "proto3";
package helloworld;
service Greeter {
  rpc SayHello (HelloRequest) returns (HelloReply);
  rpc RecordHellos (stream HelloRequest) returns (HelloReply);
}
message HelloRequest { string name = 1; }
message HelloReply { string message = 1; }
`;
  const tmp = mkdtempSync(join(tmpdir(), "lurkwire-smoke-grpc-"));
  writeFileSync(join(tmp, "hello.proto"), proto);
  const packed = grpc.loadPackageDefinition(protoLoader.loadSync(join(tmp, "hello.proto"), { keepCase: true, longs: String, enums: String, defaults: true }));
  const Greeter = (packed.helloworld as { Greeter: grpc.ServiceClientConstructor }).Greeter;
  const grpcServer = new grpc.Server();
  grpcServer.addService(Greeter.service, {
    SayHello: (call: grpc.ServerUnaryCall<{ name: string }, { message: string }>, cb: grpc.sendUnaryData<{ message: string }>) => {
      cb(null, { message: `hello ${call.request.name}` });
    },
    RecordHellos: (call: grpc.ServerReadableStream<{ name: string }, { message: string }>, cb: grpc.sendUnaryData<{ message: string }>) => {
      const names: string[] = [];
      call.on("data", (message: { name: string }) => names.push(message.name));
      call.on("end", () => cb(null, { message: `hello ${names.join(",")}` }));
    },
  });
  const grpcTarget = await new Promise<string>((resolve, reject) => {
    grpcServer.bindAsync("127.0.0.1:0", grpc.ServerCredentials.createInsecure(), (error, port) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(`127.0.0.1:${port}`);
    });
  });
  if (projectId) {
    await hooks.control.addScope({ project_id: projectId, kind: "include", host: "127.0.0.1", enabled: true });
  }
  const grpcResult = await invokeGrpc({
    target: grpcTarget,
    proto,
    service: "helloworld.Greeter",
    method: "SayHello",
    body: JSON.stringify({ name: "smoke" }),
  });
  console.log(`SMOKE grpc ${grpcResult.error ?? "ok"} events=${grpcResult.events.length}`);
  if (grpcResult.error || !grpcResult.events.some((item) => item.text.includes("hello smoke"))) {
    throw new Error(`gRPC smoke failed: ${grpcResult.error ?? "missing greeting"}`);
  }
  const streamResult = await invokeGrpc({
    target: grpcTarget,
    proto,
    service: "helloworld.Greeter",
    method: "RecordHellos",
    body: JSON.stringify([{ name: "a" }, { name: "b" }]),
  });
  console.log(`SMOKE grpc-client-stream ${streamResult.error ?? "ok"} events=${streamResult.events.length}`);
  if (streamResult.error || !streamResult.events.some((item) => item.text.includes("hello a,b"))) {
    throw new Error(`gRPC client-stream smoke failed: ${streamResult.error ?? "missing greeting"}`);
  }
  await new Promise<void>((resolve) => grpcServer.tryShutdown(() => resolve()));
  rmSync(tmp, { recursive: true, force: true });

  hooks.setPrefs({ theme: "light", sidebarOpen: false });
  await sleep(700);
  paths.push(await captureWindow(window, out, "main-light.png", tabs));

  hooks.setPrefs({ theme: "dark", sidebarOpen: false });
  await sleep(700);
  paths.push(await captureWindow(window, out, "main-dark.png", tabs));

  hooks.setPrefs({ theme: "light", sidebarOpen: true, sidebarWidth: 420 });
  hooks.selectTool("history");
  await sleep(600);
  await clickSelector(window, ".history-table tbody tr");
  await sleep(700);
  paths.push(await captureWindow(window, out, "sidebar-history.png", tabs));

  hooks.selectTool("repeater");
  await sleep(700);
  paths.push(await captureWindow(window, out, "sidebar-repeater.png", tabs));

  hooks.selectTool("intruder");
  await sleep(700);
  paths.push(await captureWindow(window, out, "sidebar-intruder.png", tabs));

  hooks.selectTool("scanner");
  await sleep(700);
  paths.push(await captureWindow(window, out, "sidebar-scanner.png", tabs));

  hooks.selectTool("recon");
  await sleep(700);
  paths.push(await captureWindow(window, out, "sidebar-recon.png", tabs));

  hooks.selectTool("ai");
  await sleep(700);
  paths.push(await captureWindow(window, out, "sidebar-ai.png", tabs));

  hooks.setPrefs({ sidebarOpen: false });
  await sleep(300);
  const identity = (await window.webContents.executeJavaScript(`(() => {
    const el = document.querySelector('button[title="Site identity"]');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  })()`)) as { left: number; top: number; right: number; bottom: number } | null;
  const tabUrl = hooks.tabs()?.activeInfo()?.url ?? "https://example.com/";
  if (identity) {
    console.log(`SMOKE opening identity panel panels=${Boolean(hooks.panels())} url=${tabUrl}`);
    await hooks.panels()?.open({
      kind: "identity",
      x: Math.round(identity.left),
      y: Math.round(identity.bottom),
      width: 380,
      height: 560,
      payload: { url: tabUrl, secure: tabUrl.startsWith("https:") },
      anchor: identity,
      align: "start",
      placement: "below",
    });
    const panel = await waitFor("identity panel", () => hooks.panels()?.currentWindow() ?? null, 5_000);
    console.log(`SMOKE identity panel bounds=${JSON.stringify(panel.getBounds())}`);
    await sleep(800);
  } else {
    console.log("SMOKE identity button not found");
  }
  paths.push(await captureWithPanel(window, out, "site-info.png", tabs, hooks.panels()));
  hooks.panels()?.close();
  await sleep(200);

  await clickSelector(window, 'button[aria-label="Downloads"]');
  await sleep(500);
  paths.push(await captureWithPanel(window, out, "downloads-popover.png", tabs, hooks.panels()));
  hooks.panels()?.close();
  await sleep(200);

  await clickSelector(window, 'button[aria-label="Application menu"]');
  await sleep(500);
  paths.push(await captureWithPanel(window, out, "app-menu.png", tabs, hooks.panels()));
  hooks.panels()?.close();
  await sleep(200);


  hooks.setPrefs({ sidebarOpen: false });
  await hooks.openNewTab("lurkwire://newtab");
  await waitFor("newtab", () => {
    const url = hooks.tabs()?.activeInfo()?.url ?? "";
    return url.includes("lurkwire://newtab") ? url : null;
  });
  await sleep(700);
  paths.push(await captureWindow(window, out, "newtab.png", hooks.tabs()));

  await hooks.openNewTab("lurkwire://about");
  await waitFor("about", () => {
    const url = hooks.tabs()?.activeInfo()?.url ?? "";
    return url.includes("lurkwire://about") ? url : null;
  });
  await sleep(700);
  paths.push(await captureWindow(window, out, "about.png", hooks.tabs()));

  await hooks.openNewTab("lurkwire://workbench");
  await waitFor("workbench", () => {
    const url = hooks.tabs()?.activeInfo()?.url ?? "";
    return url.includes("lurkwire://workbench") ? url : null;
  });
  await sleep(900);
  paths.push(await captureWindow(window, out, "workbench.png", hooks.tabs()));
  await window.webContents.executeJavaScript(`(() => {
    const buttons = Array.from(document.querySelectorAll("button"));
    buttons.find((el) => (el.textContent || "").trim() === "Run")?.click();
  })()`);
  await sleep(500);
  paths.push(await captureWindow(window, out, "workbench-runner.png", hooks.tabs()));
  await window.webContents.executeJavaScript(`(() => {
    const buttons = Array.from(document.querySelectorAll("button"));
    buttons.find((el) => (el.textContent || "").includes("Close"))?.click();
    buttons.find((el) => (el.textContent || "").includes("AI"))?.click();
  })()`);
  await sleep(500);
  paths.push(await captureWindow(window, out, "workbench-ai.png", hooks.tabs()));
  await window.webContents.executeJavaScript(`(() => {
    const closeAi = Array.from(document.querySelectorAll("button")).find((el) => (el.textContent || "").trim() === "Close" && el.closest(".wb-ai, .wb-drawer, aside, [class*='ai']"));
    (closeAi ?? Array.from(document.querySelectorAll("button")).find((el) => (el.textContent || "").trim() === "Close"))?.click();
    const sel = document.querySelector('select[aria-label="Protocol"]');
    if (sel) {
      sel.value = "grpc";
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    }
  })()`);
  await sleep(500);
  paths.push(await captureWindow(window, out, "workbench-grpc.png", hooks.tabs()));
  await window.webContents.executeJavaScript(`(() => {
    const btn = Array.from(document.querySelectorAll("button")).find((el) => (el.textContent || "").trim() === "Cookies");
    btn?.click();
  })()`);
  await sleep(400);
  paths.push(await captureWindow(window, out, "workbench-cookies.png", hooks.tabs()));
  await window.webContents.executeJavaScript(`(() => {
    const btn = Array.from(document.querySelectorAll(".wb-modal button")).find((el) => (el.textContent || "").trim() === "Close");
    btn?.click();
  })()`);
  await sleep(200);

  window.webContents.send("lurkwire:command-palette");
  await sleep(400);
  paths.push(await captureWindow(window, out, "command-palette.png", hooks.tabs()));
  await window.webContents.executeJavaScript(`document.querySelector(".palette-backdrop")?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }))`);
  await sleep(200);

  hooks.setPrefs({ theme: "light", sidebarOpen: true, sidebarWidth: 420 });
  hooks.selectTool("logger");
  await sleep(600);
  paths.push(await captureWindow(window, out, "sidebar-logger.png", hooks.tabs()));
  hooks.selectTool("autorize");
  await sleep(600);
  paths.push(await captureWindow(window, out, "sidebar-autorize.png", hooks.tabs()));
  hooks.selectTool("discover");
  await sleep(600);
  paths.push(await captureWindow(window, out, "sidebar-discover.png", hooks.tabs()));
  hooks.selectTool("graphql");
  await sleep(600);
  paths.push(await captureWindow(window, out, "sidebar-graphql.png", hooks.tabs()));
  hooks.selectTool("notes");
  await sleep(600);
  paths.push(await captureWindow(window, out, "sidebar-notes.png", hooks.tabs()));
  hooks.selectTool("decode");
  await sleep(600);
  paths.push(await captureWindow(window, out, "sidebar-decode.png", hooks.tabs()));
  hooks.selectTool("scanner");
  await sleep(400);
  await window.webContents.executeJavaScript(`(() => {
    const btn = Array.from(document.querySelectorAll("button")).find((el) => (el.textContent || "").includes("Local smuggling lab"));
    btn?.click();
  })()`);
  await sleep(800);
  paths.push(await captureWindow(window, out, "sidebar-scanner-lab.png", hooks.tabs()));

  hooks.setPrefs({ sidebarOpen: false });
  const delayNav = (async () => {
    await hooks.openNewTab("https://httpbin.org/delay/2");
  })();
  try {
    await waitFor("tab throbber", () => {
      const tab = hooks.tabs()?.activeInfo();
      return tab?.loading ? tab : null;
    }, 8_000);
    paths.push(await captureWindow(window, out, "tab-throbber.png", hooks.tabs()));
  } catch (error) {
    console.log(`SMOKE throbber capture skipped: ${error instanceof Error ? error.message : error}`);
  }
  await delayNav;
  await waitFor("delay tab settled", () => {
    const tab = hooks.tabs()?.activeInfo();
    return tab && !tab.loading && (tab.url ?? "").includes("httpbin.org") ? tab : null;
  }, 20_000);

  await hooks.openNewTab("lurkwire://settings");
  await waitFor("settings tab", () => {
    const url = hooks.tabs()?.activeInfo()?.url ?? "";
    return url.includes("lurkwire://settings") ? url : null;
  });
  await sleep(700);
  paths.push(await captureWindow(window, out, "settings.png", hooks.tabs()));

  await hooks.openNewTab("lurkwire://settings#llm");
  await waitFor("AI settings tab", () => {
    const url = hooks.tabs()?.activeInfo()?.url ?? "";
    return url.includes("lurkwire://settings") ? url : null;
  });
  await sleep(800);
  await window.webContents.executeJavaScript(`(() => {
    const items = Array.from(document.querySelectorAll("button, a, .settings-nav *"));
    const target = items.find((el) => (el.textContent || "").trim() === "AI connectors");
    if (target) target.click();
  })()`);
  await sleep(500);
  paths.push(await captureWindow(window, out, "ai-settings.png", hooks.tabs()));

  // Back to the captured site so docked DevTools have a page to inspect.
  const project = hooks.currentProjectId();
  const exampleId = project
    ? hooks.tabs()?.list(project).find((tab) => tab.url.includes("example.com"))?.id
    : undefined;
  if (exampleId) {
    hooks.tabs()?.show(exampleId);
  } else {
    await hooks.openNewTab("https://example.com/");
  }
  hooks.setPrefs({ sidebarOpen: false });
  await sleep(500);
  hooks.openDevTools("detach");
  await sleep(1200);
  paths.push(await captureDevtools(window, out, "devtools.png", hooks.tabs()));

  window.hide();
  hooks.panels()?.close();
  return paths;
}

export function isolateSmokeUserData(): void {
  if (!isSmokeRun()) {
    return;
  }
  const dir =
    process.env.LURKWIRE_SMOKE_USERDATA ??
    join(app.getPath("temp"), `lurkwire-smoke-${process.pid}`);
  mkdirSync(dir, { recursive: true });
  app.setPath("userData", dir);
  console.log(`SMOKE userData ${dir}`);
}
