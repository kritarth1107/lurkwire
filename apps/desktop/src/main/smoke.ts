import { app, type BrowserWindow, type NativeImage } from "electron";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import type { ControlClient } from "./control";
import type { TabManager } from "./tabs";
import type { AppPrefs, ToolId } from "../shared/types";

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
): Promise<string> {
  const outPath = join(dir, name);
  console.log(`SMOKE capturing ${name}`);
  await sleep(300);
  let image = await window.webContents.capturePage();
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

export function isSmokeRun(): boolean {
  return process.env.LURKWIRE_SMOKE === "1";
}

export type SmokeHooks = {
  window: () => BrowserWindow | null;
  tabs: () => TabManager | null;
  control: ControlClient;
  proxyReady: () => boolean;
  currentProjectId: () => string | null;
  setPrefs: (patch: Partial<AppPrefs>) => void;
  selectTool: (tool: ToolId) => void;
  openNewTab: (url?: string) => Promise<void>;
};

export async function runSmoke(hooks: SmokeHooks): Promise<string[]> {
  const out = process.env.LURKWIRE_SMOKE_OUT ?? join(process.cwd(), "docs/screenshots");
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
    const list = await hooks.control.listFlows({ project_id: projectId, host: "example.com", limit: 20 });
    return list.items.find((item) => item.host === "example.com" || item.url.includes("example.com")) ?? null;
  });
  console.log(`SMOKE history hit ${flow.method} ${flow.url} status=${flow.status} id=${flow.id}`);

  const paths: string[] = [];
  hooks.setPrefs({ theme: "light", sidebarOpen: false });
  await sleep(700);
  paths.push(await captureWindow(window, out, "main-light.png", tabs));

  hooks.setPrefs({ theme: "dark", sidebarOpen: false });
  await sleep(700);
  paths.push(await captureWindow(window, out, "main-dark.png", tabs));

  hooks.setPrefs({ theme: "light", sidebarOpen: true, sidebarWidth: 420 });
  hooks.selectTool("history");
  await sleep(800);
  paths.push(await captureWindow(window, out, "sidebar-history.png", tabs));

  hooks.selectTool("repeater");
  await sleep(700);
  paths.push(await captureWindow(window, out, "sidebar-repeater.png", tabs));

  hooks.selectTool("ai");
  await sleep(700);
  paths.push(await captureWindow(window, out, "sidebar-ai.png", tabs));

  window.hide();
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
