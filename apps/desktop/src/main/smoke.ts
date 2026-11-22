import { app, BrowserWindow, session as electronSession, type NativeImage } from "electron";
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
import { reportFromStores } from "../shared/reportExport";
import { emptyNotes } from "../shared/notes";
import { analyzeCors, CORS_PROBE_ORIGIN, corsProbeHeaders } from "../shared/corsProbe";
import { invokeGrpc } from "./workbench/grpcClient";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { setupDvwa, DVWA_SQLI_OR, DVWA_SQLI_UNION, DVWA_XSS } from "./dvwaLab";

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


async function captureCategorizedMenus(
  window: BrowserWindow,
  out: string,
  paths: string[],
  tabs: TabManager | null,
): Promise<void> {
  paths.push(await captureWindow(window, out, "chrome-tools-bar.png", tabs));
  for (const id of ["proxy", "attack", "recon", "decode", "report"]) {
    const opened = await clickSelector(window, `button[data-menu="${id}"]`);
    if (!opened) {
      console.log(`SMOKE tool menu ${id} button missing`);
      continue;
    }
    await sleep(350);
    paths.push(await captureWindow(window, out, `menu-${id}.png`, tabs));
    await clickSelector(window, `button[data-menu="${id}"]`);
    await sleep(150);
  }
}

async function clickSelector(window: BrowserWindow, selector: string): Promise<boolean> {
  return (await window.webContents.executeJavaScript(
    `Boolean(document.querySelector(${JSON.stringify(selector)}) && (document.querySelector(${JSON.stringify(selector)}).click(), true))`,
  )) as boolean;
}

type AnchorProbe = {
  ok: boolean;
  reason?: string;
  button?: { left: number; right: number; top: number; bottom: number };
  popover?: { left: number; right: number; top: number; bottom: number };
};

async function waitForPopover(window: BrowserWindow, timeout = 5_000): Promise<boolean> {
  return Boolean(
    await waitFor(
      "anchored popover",
      async () => {
        const present = (await window.webContents.executeJavaScript(
          `Boolean(document.querySelector('[data-testid="anchored-popover"]'))`,
        )) as boolean;
        return present ? true : null;
      },
      timeout,
    ),
  );
}

async function assertPopoverAnchored(
  window: BrowserWindow,
  buttonSelector: string,
  align: "start" | "end",
): Promise<AnchorProbe> {
  const result = (await window.webContents.executeJavaScript(`(() => {
    const btn = document.querySelector(${JSON.stringify(buttonSelector)});
    const pop = document.querySelector('[data-testid="anchored-popover"]');
    if (!btn) return { ok: false, reason: "no button" };
    if (!pop) return { ok: false, reason: "no popover" };
    const b = btn.getBoundingClientRect();
    const p = pop.getBoundingClientRect();
    const button = { left: b.left, right: b.right, top: b.top, bottom: b.bottom };
    const popover = { left: p.left, right: p.right, top: p.top, bottom: p.bottom };
    const overlapsX = p.left < b.right && p.right > b.left;
    const endAligned = Math.abs(p.right - b.right) <= 12;
    const startAligned = Math.abs(p.left - b.left) <= 12;
    const below = p.top >= b.bottom - 8;
    const ok = below && (${JSON.stringify(align)} === "end" ? endAligned || overlapsX : startAligned || overlapsX);
    // The reported bug placed the menu near x=105 under the sidebar.
    if (${JSON.stringify(align)} === "end" && p.left < 400 && b.left > 800) {
      return { ok: false, reason: "popover on far left while button is on the right", button, popover };
    }
    return { ok, button, popover, reason: ok ? undefined : "not under trigger" };
  })()`)) as AnchorProbe;
  console.log(`SMOKE anchor ${buttonSelector} ${align} ${JSON.stringify(result)}`);
  if (!result.ok) {
    throw new Error(`popover not anchored under ${buttonSelector}: ${JSON.stringify(result)}`);
  }
  return result;
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
  const corsFlow = await hooks.control.sendWorkbench({
    project_id: projectId ?? undefined,
    method: "OPTIONS",
    url: "https://httpbin.org/get",
    headers: corsProbeHeaders("GET"),
    source: "scanner",
  });
  const cors = analyzeCors(corsFlow.resp_headers);
  console.log(`SMOKE cors status=${corsFlow.status} acao=${cors.allowOrigin ?? ""} wildcard=${cors.wildcard}`);
  if (corsFlow.status && corsFlow.status >= 400) {
    throw new Error(`CORS preflight to httpbin.org failed: ${corsFlow.status}`);
  }
  if (cors.allowOrigin !== "*" && cors.allowOrigin !== CORS_PROBE_ORIGIN) {
    throw new Error(`unexpected CORS policy from httpbin.org: ${cors.summary}`);
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

  hooks.setPrefs({ theme: "light", sidebarOpen: false, llmSidebarOpen: false });
  await sleep(700);
  paths.push(await captureWindow(window, out, "main-light.png", tabs));
  await captureCategorizedMenus(window, out, paths, tabs);

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

  hooks.selectTool("cors");
  await sleep(700);
  paths.push(await captureWindow(window, out, "sidebar-cors.png", tabs));

  hooks.selectTool("ai");
  await sleep(700);
  paths.push(await captureWindow(window, out, "sidebar-ai.png", tabs));

  hooks.setPrefs({ sidebarOpen: true, toolsDockHeight: 400, llmSidebarOpen: true, llmSidebarWidth: 340 });
  hooks.selectTool("history");
  await sleep(700);
  paths.push(await captureWindow(window, out, "topbar-traffic-llm.png", tabs));

  hooks.setPrefs({ sidebarOpen: false, llmSidebarOpen: false });
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
    await waitForPopover(window);
    await assertPopoverAnchored(window, 'button[title="Site identity"]', "start");
    await sleep(400);
  } else {
    console.log("SMOKE identity button not found");
  }
  paths.push(await captureWithPanel(window, out, "site-info.png", tabs, hooks.panels()));
  hooks.panels()?.close();
  await sleep(200);

  await clickSelector(window, 'button[aria-label="Downloads"]');
  await waitForPopover(window);
  await assertPopoverAnchored(window, 'button[aria-label="Downloads"]', "end");
  await sleep(300);
  paths.push(await captureWithPanel(window, out, "downloads-popover.png", tabs, hooks.panels()));
  hooks.panels()?.close();
  await sleep(200);

  await clickSelector(window, 'button[aria-label="Lurkwire tools"]');
  await waitForPopover(window);
  await assertPopoverAnchored(window, 'button[aria-label="Lurkwire tools"]', "end");
  await sleep(300);
  paths.push(await captureWithPanel(window, out, "lurkwire-tools.png", tabs, hooks.panels()));
  hooks.panels()?.close();
  await sleep(200);

  await clickSelector(window, 'button[aria-label="Project"]');
  await waitForPopover(window);
  await assertPopoverAnchored(window, 'button[aria-label="Project"]', "end");
  await sleep(300);
  paths.push(await captureWithPanel(window, out, "project-popover.png", tabs, hooks.panels()));
  hooks.panels()?.close();
  await sleep(200);

  await clickSelector(window, 'button[aria-label="Application menu"]');
  await waitForPopover(window);
  await assertPopoverAnchored(window, 'button[aria-label="Application menu"]', "end");
  await sleep(300);
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

  try {
    await runPracticeTargets(hooks, window, out, paths, id);
  } catch (error) {
    console.log(`SMOKE practice targets failed: ${error instanceof Error ? error.stack ?? error.message : error}`);
  }

  window.hide();
  hooks.panels()?.close();
  return paths;
}


const PRACTICE_JWT =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJqdWljZS1zaG9wIiwibmFtZSI6IlByYWN0aWNlIiwicm9sZSI6ImFkbWluIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";

async function reachable(url: string, timeoutMs = 5000): Promise<boolean> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ac.signal, redirect: "follow" });
    return res.ok || res.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function runPracticeTargets(
  hooks: SmokeHooks,
  window: BrowserWindow,
  out: string,
  paths: string[],
  tabId: string,
): Promise<void> {
  const tabs = hooks.tabs();
  if (!tabs) {
    throw new Error("tab manager missing");
  }
  const projectId = hooks.currentProjectId();
  const showAndGo = async (url: string, label: string, match: string, timeoutMs = 20_000) => {
    tabs.show(tabId);
    await tabs.navigate(tabId, url);
    return waitFor(label, () => {
      const info = tabs.list(projectId ?? "").find((item) => item.id === tabId) ?? tabs.activeInfo();
      const current = info?.url ?? "";
      return current.includes(match) ? current : null;
    }, timeoutMs);
  };

  let dvwaCookieHeader = "";

  const pageJs = async (code: string) => {
    const wc = tabs.active()?.view.webContents;
    if (!wc || wc.isDestroyed()) {
      throw new Error("no tab page");
    }
    return wc.executeJavaScript(code);
  };

  const juice = "http://127.0.0.1:3000/";
  try {
  if (await reachable(juice, 4000)) {
    await showAndGo(juice, "Juice Shop tab", "127.0.0.1:3000");
    await sleep(1200);
    const dismissed = await pageJs(`(() => {
      const labels = (el) => ((el.getAttribute("aria-label") || "") + " " + (el.textContent || "")).trim();
      const clickers = Array.from(document.querySelectorAll("button, a, .close-dialog, [aria-label]"));
      let count = 0;
      for (const el of clickers) {
        if (/me want it|dismiss|close this dialog|force close|welcome|skip|got it|accept all|allow all|ok, i agree/i.test(labels(el))) {
          el.click();
          count += 1;
        }
      }
      document.querySelectorAll(".close-dialog, button.close-dialog, .cc-dismiss, #cookieconsent .cc-btn").forEach((el) => {
        el.click();
        count += 1;
      });
      return { count, text: document.body.innerText.slice(0, 180) };
    })()`);
    console.log("SMOKE Juice modal dismiss", JSON.stringify(dismissed));
    await sleep(800);
    hooks.setPrefs({ sidebarOpen: true, sidebarPanel: "history", toolsDockHeight: 360, llmSidebarOpen: false });
    hooks.selectTool("history");
    await sleep(400);
    paths.push(await captureWindow(window, out, "practice-juice-shop.png", tabs));

    await showAndGo("http://127.0.0.1:3000/#/login", "Juice Shop login", "127.0.0.1:3000");
    await sleep(900);
    await pageJs(`(() => {
      const labels = (el) => ((el.getAttribute("aria-label") || "") + " " + (el.textContent || "")).trim();
      Array.from(document.querySelectorAll("button, .close-dialog")).forEach((el) => {
        if (/me want it|close this dialog|dismiss/i.test(labels(el))) el.click();
      });
      const email = document.querySelector('#email, input[name="email"], input[type="email"]');
      const pass = document.querySelector('#password, input[name="password"], input[type="password"]');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
      if (email) { setter?.call(email, "' or 1=1--"); email.dispatchEvent(new Event("input", { bubbles: true })); }
      if (pass) { setter?.call(pass, "a"); pass.dispatchEvent(new Event("input", { bubbles: true })); }
      const btn = Array.from(document.querySelectorAll("button, input[type=submit]")).find((el) =>
        /log in|login/i.test(el.textContent || el.getAttribute("aria-label") || el.getAttribute("value") || ""),
      );
      if (btn) btn.click();
      return Boolean(email && pass && btn);
    })()`);
    const loggedIn = await waitFor("Juice login admin challenge", async () => {
      const state = await pageJs(`(() => {
        const buttons = Array.from(document.querySelectorAll("button, a, span"));
        const account = buttons.find((el) => /account|show\/hide account menu/i.test(el.getAttribute("aria-label") || el.textContent || ""));
        if (account && !/logout/i.test(document.body.innerText || "")) account.click();
        const text = document.body.innerText || "";
        return {
          text: text.slice(0, 500),
          hasAdminChallenge: /Login Admin|administrator's user account/i.test(text),
          hasLogout: /\blogout\b/i.test(text),
          href: location.href,
        };
      })()`);
      return state.hasAdminChallenge || state.hasLogout ? state : null;
    }, 10_000).catch(async () => pageJs(`(() => {
      const text = document.body.innerText || "";
      return { text: text.slice(0, 500), hasAdminChallenge: false, hasLogout: /\blogout\b/i.test(text), href: location.href };
    })()`));
    console.log("SMOKE Juice login bypass", JSON.stringify(loggedIn));
    hooks.setPrefs({ sidebarOpen: false, llmSidebarOpen: false });
    await sleep(400);
    paths.push(await captureWindow(window, out, "practice-juice-login-bypass.png", tabs));
    hooks.setPrefs({ sidebarOpen: true, sidebarPanel: "history" });
    await sleep(200);
    console.log("SMOKE practice Juice Shop ok");
  } else {
    console.log("SMOKE practice Juice Shop skipped (not reachable on :3000)");
  }
  } catch (error) {
    console.log(`SMOKE practice Juice Shop failed: ${error instanceof Error ? error.message : error}`);
  }

  try {
  if (await reachable("http://demo.testfire.net/", 6000)) {
    await showAndGo("http://demo.testfire.net/search.jsp?query=%27+OR+1%3D1--", "testfire tab", "demo.testfire.net");
    await sleep(700);
    paths.push(await captureWindow(window, out, "practice-testfire-sqli.png", tabs));
    console.log("SMOKE practice Altoro Mutual / testfire ok");
  } else {
    console.log("SMOKE practice testfire skipped (not reachable)");
  }
  } catch (error) {
    console.log(`SMOKE practice testfire failed: ${error instanceof Error ? error.message : error}`);
  }

  try {
  const dvwaBase = "http://127.0.0.1:4280/";
  if (await reachable(dvwaBase, 4000)) {
    const setup = await setupDvwa(dvwaBase.replace(/\/$/, ""));
    console.log(`SMOKE DVWA setup ok=${setup.ok} cookies=${setup.cookies.map((c) => c.name).join(",")} error=${setup.error ?? ""}`);
    if (setup.ok && projectId) {
      const ses = electronSession.fromPartition(`persist:proj-${projectId}`);
      dvwaCookieHeader = setup.sessionHeader;
      for (const cookie of setup.cookies) {
        await ses.cookies.set({
          url: dvwaBase,
          name: cookie.name,
          value: cookie.value,
          path: cookie.path || "/",
        });
      }
    } else if (!setup.ok) {
      console.log("SMOKE DVWA headless setup failed; pages may redirect to login");
    }
    try {
      await hooks.control.addScope({ project_id: projectId ?? undefined, kind: "include", host: "127.0.0.1", enabled: true });
    } catch {
      /* already present */
    }

    await showAndGo(DVWA_SQLI_OR, "DVWA SQLi OR", "vulnerabilities/sqli");
    await sleep(800);
    const orBody = await pageJs(`({ href: location.href, text: document.body.innerText.slice(0, 1200) })`);
    console.log("SMOKE DVWA SQLi OR", JSON.stringify(orBody).slice(0, 500));
    paths.push(await captureWindow(window, out, "practice-dvwa-sqli.png", tabs));

    await showAndGo(DVWA_SQLI_UNION, "DVWA SQLi hashes", "vulnerabilities/sqli");
    await sleep(800);
    const dump = await pageJs(`({ href: location.href, text: document.body.innerText, hasHash: /5f4dcc3b5aa765d61d8327deb882cf99/.test(document.body.innerText) })`);
    console.log(`SMOKE DVWA SQLi hashes hasHash=${(dump as { hasHash?: boolean }).hasHash}`);
    paths.push(await captureWindow(window, out, "practice-dvwa-sqli-hashes.png", tabs));

    // Use a script payload that paints a visible banner instead of alert(),
    // which would block the tab and stall smoke on a native dialog.
    const xssUrl =
      "http://127.0.0.1:4280/vulnerabilities/xss_r/?name=" +
      encodeURIComponent(
        "<script>document.documentElement.prepend(Object.assign(document.createElement('div'),{id:'lurkwire-xss-proof',textContent:'XSS executed',style:'position:fixed;z-index:2147483647;top:0;left:0;right:0;padding:16px;background:#b00020;color:#fff;font:600 18px/1.4 sans-serif'}))</script>",
      );
    void DVWA_XSS;
    await showAndGo(xssUrl, "DVWA XSS", "vulnerabilities/xss_r");
    await sleep(1000);
    let xss: unknown = null;
    try {
      xss = await Promise.race([
        pageJs(`({
          href: location.href,
          proof: Boolean(document.getElementById("lurkwire-xss-proof")),
          text: document.body.innerText.slice(0, 400),
        })`),
        new Promise((_, reject) => setTimeout(() => reject(new Error("xss pageJs timeout")), 4000)),
      ]);
    } catch (error) {
      console.log(`SMOKE DVWA XSS pageJs: ${error instanceof Error ? error.message : error}`);
    }
    console.log("SMOKE DVWA XSS", JSON.stringify(xss));
    paths.push(await captureWindow(window, out, "practice-dvwa-xss.png", tabs));
    console.log("SMOKE practice DVWA attempted");
  } else {
    console.log("SMOKE practice DVWA skipped (not reachable on :4280)");
  }
  } catch (error) {
    console.log(`SMOKE practice DVWA failed: ${error instanceof Error ? error.message : error}`);
  }

  console.log("SMOKE practice testphp.vulnweb skipped by request");


    // Intercept + edit request and response against httpbin (authorized sandbox).
  try {
  if (!(await reachable("https://httpbin.org/get", 8000))) {
    console.log("SMOKE practice intercept skipped (httpbin not reachable)");
  } else {
    await hooks.control.setIntercept({
      enabled: true,
      requests: true,
      responses: true,
      timeout_ms: 60_000,
    });
    hooks.setPrefs({ sidebarOpen: true, sidebarPanel: "intercept", toolsDockHeight: 420 });
    hooks.selectTool("intercept");
    await sleep(300);
    tabs.show(tabId);
    void tabs.navigate(tabId, "https://httpbin.org/headers");
    const pausedReq = await waitFor("intercepted request", async () => {
      const state = await hooks.control.getIntercept();
      return state.queue.find((item) => item.direction === "request" && item.url.includes("httpbin.org")) ?? null;
    }, 20_000);
    await hooks.control.forwardIntercept(pausedReq.id, {
      headers: [...pausedReq.headers, { name: "X-Lurkwire-Practice", value: "1" }],
    });
    const pausedRes = await waitFor("intercepted response", async () => {
      const state = await hooks.control.getIntercept();
      return state.queue.find((item) => item.direction === "response" && item.url.includes("httpbin.org")) ?? null;
    }, 20_000);
    await sleep(400);
    paths.push(await captureWindow(window, out, "practice-intercept-response.png", tabs));
    // Same held response, after we already injected a request header the page never set.
    paths.push(await captureWindow(window, out, "practice-intercept-bypass.png", tabs));
    const editedBody = (pausedRes.body && !pausedRes.body_base64)
      ? `${pausedRes.body}\n/* lurkwire-edited */`
      : undefined;
    await hooks.control.forwardIntercept(pausedRes.id, {
      status: pausedRes.status ?? 200,
      body: editedBody,
    });
    await hooks.control.setIntercept({
      enabled: false,
      requests: true,
      responses: true,
      timeout_ms: 30_000,
    });
    await waitFor("httpbin headers tab", () => {
      const url = tabs.activeInfo()?.url ?? "";
      return url.includes("httpbin.org") ? url : null;
    }, 15_000);
    console.log("SMOKE practice intercept edit + forward ok");

    const repeater = await hooks.control.sendRepeater({
      project_id: projectId ?? undefined,
      method: "GET",
      url: "https://httpbin.org/get?from=repeater",
      headers: [{ name: "X-Lurkwire-Practice", value: "repeater" }],
      source: "repeater",
    });
    hooks.selectTool("repeater");
    await sleep(500);
    paths.push(await captureWindow(window, out, "practice-repeater-httpbin.png", tabs));
    console.log(`SMOKE practice repeater status=${(repeater as { status?: number }).status ?? "?"}`);
  }
  } catch (error) {
    try {
      await hooks.control.setIntercept({ enabled: false, requests: true, responses: true, timeout_ms: 30_000 });
    } catch {
      // ignore
    }
    console.log(`SMOKE practice intercept/repeater failed: ${error instanceof Error ? error.message : error}`);
  }

  try {
    hooks.selectTool("cors");
    await sleep(400);
    await window.webContents.executeJavaScript(`(() => {
      const url = document.querySelector('input[aria-label="CORS target URL"]');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
      if (url) {
        setter?.call(url, "https://httpbin.org/get");
        url.dispatchEvent(new Event("input", { bubbles: true }));
      }
      const btn = Array.from(document.querySelectorAll("button")).find((el) =>
        /Send preflight/i.test(el.textContent || ""),
      );
      if (btn) btn.click();
      return Boolean(url && btn);
    })()`);
    await sleep(2500);
    paths.push(await captureWindow(window, out, "practice-cors.png", tabs));
  } catch (error) {
    console.log(`SMOKE practice CORS failed: ${error instanceof Error ? error.message : error}`);
  }

  hooks.selectTool("decode");
  await sleep(400);
  await window.webContents.executeJavaScript(`(() => {
    const area = document.querySelector(".decode textarea");
    if (!area) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
    setter?.call(area, ${JSON.stringify(PRACTICE_JWT)});
    area.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  })()`);
  await sleep(500);
  paths.push(await captureWindow(window, out, "practice-jwt-decode.png", tabs));
  await window.webContents.executeJavaScript(`(() => {
    const alg = document.querySelector('select, [aria-label="JWT algorithm"]');
    if (alg && "value" in alg) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value")?.set;
      setter?.call(alg, "none");
      alg.dispatchEvent(new Event("change", { bubbles: true }));
    }
    const btn = Array.from(document.querySelectorAll("button")).find((el) =>
      /Issue unsigned|alg none/i.test(el.textContent || ""),
    );
    if (btn) btn.click();
    return Boolean(btn);
  })()`);
  await sleep(500);
  paths.push(await captureWindow(window, out, "practice-jwt-tamper.png", tabs));

  hooks.selectTool("cookies");
  await sleep(600);
  paths.push(await captureWindow(window, out, "practice-cookies.png", tabs));

  hooks.selectTool("scanner");
  await sleep(700);
  paths.push(await captureWindow(window, out, "practice-scanner.png", tabs));

  try {
  hooks.selectTool("history");
  await sleep(400);
  await window.webContents.executeJavaScript(`(() => {
    const btn = Array.from(document.querySelectorAll("button")).find((el) =>
      (el.textContent || "").includes("Export HAR"),
    );
    if (btn) btn.click();
    return Boolean(btn);
  })()`);
  await sleep(400);
  paths.push(await captureWindow(window, out, "practice-traffic-har.png", tabs));
  } catch (error) {
    console.log(`SMOKE practice HAR failed: ${error instanceof Error ? error.message : error}`);
  }


  // v6: send-to UX, match/replace, intruder, discover, report, new tools.
  try {
    const project = projectId ?? undefined;
    for (const host of ["httpbin.org", "127.0.0.1", "localhost", "demo.testfire.net"]) {
      try {
        await hooks.control.addScope({ project_id: project, kind: "include", host, enabled: true });
      } catch {
        /* already present */
      }
    }
    hooks.selectTool("scope");
    hooks.setPrefs({ sidebarOpen: true, sidebarPanel: "scope", toolsDockHeight: 420, llmSidebarOpen: false });
    await sleep(400);
    paths.push(await captureWindow(window, out, "practice-scope.png", tabs));

    const rule = await hooks.control.addMatchRule({
      project_id: project,
      name: "probe-rewrite",
      match: "lurkwire-match",
      replace: "lurkwire-replaced",
      regex: false,
      where: "anywhere",
      direction: "request",
      enabled: true,
    });
    void rule;
    hooks.selectTool("matchreplace");
    await sleep(400);
    paths.push(await captureWindow(window, out, "practice-match-replace.png", tabs));
    const rewritten = await hooks.control.sendRepeater({
      project_id: project,
      method: "GET",
      url: "https://httpbin.org/get?token=lurkwire-match",
      headers: [],
      source: "repeater",
    });
    const preview = (rewritten as { resp_preview?: string }).resp_preview ?? "";
    if (!preview.includes("lurkwire-replaced")) {
      console.log("SMOKE practice match/replace: response did not echo rewritten query, preview follows");
      console.log(preview.slice(0, 400));
    } else {
      console.log("SMOKE practice match/replace rewrote token=lurkwire-replaced");
    }

    hooks.selectTool("history");
    await sleep(400);
    await window.webContents.executeJavaScript(`(() => {
      const row = document.querySelector(".history-table tbody tr, .traffic-table tbody tr, table tbody tr");
      if (!row) return false;
      const rect = row.getBoundingClientRect();
      row.dispatchEvent(new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: rect.left + 80,
        clientY: rect.top + 10,
        button: 2,
      }));
      return true;
    })()`);
    await sleep(400);
    paths.push(await captureWindow(window, out, "practice-send-to-menu.png", tabs));
    // close menu
    await window.webContents.executeJavaScript(`document.body.click()`);
    await sleep(200);

    const job = await hooks.control.startIntruder({
      project_id: project,
      method: "GET",
      url: "https://httpbin.org/get?q=§probe§",
      headers: [],
      attack: "sniper",
      payloads: [["alpha", "beta", "gamma"]],
    });
    const finished = await waitFor("practice intruder", async () => {
      const current = await hooks.control.getIntruder(job.id);
      return current.status === "running" ? null : current;
    }, 30_000);
    hooks.selectTool("intruder");
    await sleep(500);
    paths.push(await captureWindow(window, out, "practice-intruder.png", tabs));
    console.log(`SMOKE practice intruder status=${finished.status} results=${finished.results.length}`);

    if (dvwaCookieHeader) {
      hooks.selectTool("intruder");
      hooks.setPrefs({ sidebarOpen: true, sidebarPanel: "intruder", toolsDockHeight: 480, llmSidebarOpen: false });
      await sleep(500);
      const bruteUrl = "http://127.0.0.1:4280/vulnerabilities/brute/?username=admin&password=§pass§&Login=Login";
      const headerBlock = `Cookie: ${dvwaCookieHeader}\n`;
      const payloadBlock = "password\nwrong\nadmin";
      const filled = await window.webContents.executeJavaScript(`(() => {
        const setNative = (el, value) => {
          const proto = el instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
          const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
          setter?.call(el, value);
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        };
        const method = document.querySelector('input[aria-label="Method"]');
        const url = document.querySelector('input[aria-label="URL template"]');
        const areas = Array.from(document.querySelectorAll("textarea"));
        const headers = areas.find((el) => (el.closest("label")?.textContent || "").includes("Headers"));
        const payloads = areas.find((el) => /payloads/i.test(el.closest("label")?.textContent || ""));
        if (method) setNative(method, "GET");
        if (url) setNative(url, ${JSON.stringify(bruteUrl)});
        if (headers) setNative(headers, ${JSON.stringify(headerBlock)});
        if (payloads) setNative(payloads, ${JSON.stringify(payloadBlock)});
        const start = Array.from(document.querySelectorAll("button")).find((el) => /Start attack/i.test(el.textContent || ""));
        if (start) start.click();
        return { method: Boolean(method), url: Boolean(url), headers: Boolean(headers), payloads: Boolean(payloads), start: Boolean(start) };
      })()`);
      console.log("SMOKE DVWA intruder fill", JSON.stringify(filled));
      hooks.setPrefs({ sidebarOpen: true, sidebarPanel: "intruder", toolsDockHeight: 720, llmSidebarOpen: false });
      const rows = await waitFor("DVWA intruder results table", async () => {
        const info = await window.webContents.executeJavaScript(`(() => {
          const table = document.querySelector(".intruder-results");
          const payloads = Array.from(document.querySelectorAll(".intruder-results tbody td.path")).map((el) => el.textContent || "");
          const empty = Boolean(document.querySelector(".intruder-results td.empty"));
          return { payloads, empty, rows: document.querySelectorAll(".intruder-results tbody tr").length };
        })()`);
        return !info.empty && info.payloads.length >= 2 ? info : null;
      }, 30_000);
      await window.webContents.executeJavaScript(`(() => {
        document.querySelectorAll(".intruder textarea").forEach((el) => {
          el.setAttribute("rows", "2");
          el.style.height = "40px";
          el.style.minHeight = "40px";
          el.style.flex = "none";
        });
        const results = document.querySelector(".intruder-results");
        if (results) {
          results.style.flex = "none";
          results.style.minHeight = "240px";
          results.style.maxHeight = "none";
        }
        document.querySelector(".intruder")?.scrollTo({ top: 10_000, behavior: "instant" });
        results?.scrollIntoView({ block: "start", inline: "nearest" });
        document.querySelector(".tool-workspace-body")?.scrollTo({ top: 10_000, behavior: "instant" });
        return Boolean(results);
      })()`);
      await sleep(400);
      paths.push(await captureWindow(window, out, "practice-intruder-dvwa-results.png", tabs));
      console.log(`SMOKE practice DVWA intruder results table ${JSON.stringify(rows)}`);
    }

    if (await reachable("http://127.0.0.1:3000/", 3000)) {
      hooks.selectTool("discover");
      await sleep(300);
      await window.webContents.executeJavaScript(`(() => {
        const inputs = Array.from(document.querySelectorAll("input"));
        const base = inputs.find((el) => (el.getAttribute("placeholder") || "").includes("http") || el.value === "");
        const first = document.querySelector(".discover input, .workbench input");
        const target = first;
        if (!target) return false;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
        setter?.call(target, "http://127.0.0.1:3000/");
        target.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
      })()`);
      // also run a short wordlist through the proxy so the tool isn't empty
      for (const word of ["robots.txt", "rest/products", "api-docs"]) {
        try {
          await hooks.control.sendWorkbench({
            project_id: project,
            method: "GET",
            url: "http://127.0.0.1:3000/" + word,
            headers: [],
            source: "discover",
          });
        } catch (error) {
          console.log(`SMOKE discover ${word}: ${error instanceof Error ? error.message : error}`);
        }
      }
      await sleep(400);
      paths.push(await captureWindow(window, out, "practice-discover.png", tabs));
      console.log("SMOKE practice discover probes sent");
    } else {
      console.log("SMOKE practice discover skipped (Juice Shop not up)");
    }

    hooks.selectTool("scanner");
    await sleep(500);
    paths.push(await captureWindow(window, out, "practice-scanner-grouped.png", tabs));

    try {
    const interesting = await waitFor("SQLi or XSS finding", async () => {
      const list = await hooks.control.listFindings({ project_id: project, limit: 250 });
      return list.items.find((item) => item.check_id === "sqli-data" || item.check_id === "reflected-xss" || item.check_id === "sql-error") ?? null;
    }, 20_000);
    hooks.setPrefs({ sidebarOpen: true, sidebarPanel: "scanner", toolsDockHeight: 500, llmSidebarOpen: false });
    await window.webContents.executeJavaScript(`(() => {
      const rows = Array.from(document.querySelectorAll(".scanner tr, table tr, .finding-row, tbody tr"));
      const hit = rows.find((el) => /sql injection|cross-site scripting|reflected|sqli/i.test(el.textContent || ""));
      if (hit) hit.click();
      return { clicked: Boolean(hit), text: (hit?.textContent || "").slice(0, 160) };
    })()`);
    await sleep(600);
    paths.push(await captureWindow(window, out, "practice-scanner-finding-evidence.png", tabs));
    const explained = await window.webContents.executeJavaScript(`(() => {
      const btn = Array.from(document.querySelectorAll("button")).find((el) => /Explain finding/i.test(el.textContent || ""));
      if (btn) btn.click();
      return Boolean(btn);
    })()`);
    console.log(`SMOKE scanner finding ${interesting.check_id} explainClick=${explained}`);
    await sleep(800);
    paths.push(await captureWindow(window, out, "practice-scanner-explain-finding.png", tabs));

    } catch (error) {
      console.log(`SMOKE scanner finding evidence failed: ${error instanceof Error ? error.message : error}`);
    }

    const findings = await hooks.control.listFindings({ project_id: project, limit: 200 });
    const notes = emptyNotes();
    const report = reportFromStores({
      product: "Lurkwire",
      projectName: "Practice (Juice Shop / httpbin / testfire)",
      findings: findings.items,
      notes,
    });
    writeFileSync(join(out, "practice-findings-report.md"), report.markdown, "utf8");
    writeFileSync(join(out, "practice-findings-report.html"), report.html, "utf8");
    hooks.selectTool("report");
    await sleep(600);
    paths.push(await captureWindow(window, out, "practice-report.png", tabs));
    console.log(`SMOKE practice report findings=${findings.items.length}`);

    hooks.selectTool("paramminer");
    await sleep(400);
    paths.push(await captureWindow(window, out, "practice-paramminer.png", tabs));
    hooks.selectTool("smuggling");
    await sleep(400);
    paths.push(await captureWindow(window, out, "practice-smuggling.png", tabs));
    hooks.selectTool("decode");
    await sleep(300);
    await window.webContents.executeJavaScript(`(() => {
      const btn = Array.from(document.querySelectorAll("button")).find((el) => (el.textContent || "").includes("Decode all"));
      if (btn) btn.click();
      return Boolean(btn);
    })()`);
    await sleep(300);
    paths.push(await captureWindow(window, out, "practice-decoder-plus.png", tabs));
    hooks.selectTool("oob");
    await sleep(400);
    paths.push(await captureWindow(window, out, "practice-oob.png", tabs));
    hooks.selectTool("websocket");
    await sleep(400);
    paths.push(await captureWindow(window, out, "practice-websocket.png", tabs));

    hooks.setPrefs({ sidebarOpen: true, sidebarPanel: "history", toolsDockHeight: 380 });
    await sleep(200);
    window.webContents.send("lurkwire:command-palette");
    await sleep(400);
    paths.push(await captureWindow(window, out, "practice-command-palette.png", tabs));
    window.webContents.send("lurkwire:escape");
    await sleep(200);
    window.webContents.send("lurkwire:tool-hotkey", "shortcuts");
    await sleep(400);
    paths.push(await captureWindow(window, out, "practice-shortcuts.png", tabs));
    window.webContents.send("lurkwire:escape");

    hooks.selectTool("history");
    hooks.setPrefs({ sidebarOpen: true, sidebarPanel: "history", toolsDockHeight: 420, llmSidebarOpen: false });
    await sleep(400);
    await window.webContents.executeJavaScript(`(() => {
      const input = document.querySelector('.history-workbench input[type="search"], .workbench-toolbar input[type="search"]');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, "status:2xx host:127.0.0.1");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    })()`);
    await sleep(800);
    paths.push(await captureWindow(window, out, "feature-filter-dsl.png", tabs));

    window.webContents.send("lurkwire:open-all-tabs");
    await sleep(400);
    paths.push(await captureWindow(window, out, "feature-tab-search.png", tabs));
    window.webContents.send("lurkwire:escape");
    await sleep(200);

    window.webContents.send("lurkwire:open-find");
    await sleep(300);
    paths.push(await captureWindow(window, out, "feature-find-in-page.png", tabs));
    window.webContents.send("lurkwire:escape");

    hooks.selectTool("repeater");
    await sleep(400);
    paths.push(await captureWindow(window, out, "feature-repeater-collections.png", tabs));
    hooks.selectTool("comparer");
    await sleep(400);
    paths.push(await captureWindow(window, out, "feature-comparer-diff.png", tabs));
    console.log("SMOKE practice v6 tools ok");
  } catch (error) {
    console.log(`SMOKE practice v6 tools failed: ${error instanceof Error ? error.message : error}`);
  }


  hooks.setPrefs({ llmSidebarOpen: true, llmSidebarWidth: 340, sidebarOpen: true, toolsDockHeight: 360 });
  await sleep(500);
  paths.push(await captureWindow(window, out, "practice-topbar-llm.png", tabs));
  hooks.setPrefs({ llmSidebarOpen: false });
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
