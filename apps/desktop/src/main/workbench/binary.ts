import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import { BrowserWindow, dialog } from "electron";

const MAX_BYTES = 10 * 1024 * 1024;

const MIME: Record<string, string> = {
  ".json": "application/json",
  ".txt": "text/plain",
  ".xml": "application/xml",
  ".html": "text/html",
  ".bin": "application/octet-stream",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".pdf": "application/pdf",
  ".zip": "application/zip",
};

export type PickedBinary = {
  fileName: string;
  base64: string;
  mime: string;
  size: number;
};

export async function pickBinary(win?: BrowserWindow | null): Promise<PickedBinary | null> {
  const options: Electron.OpenDialogOptions = {
    title: "Attach a request body",
    properties: ["openFile"],
  };
  const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
  const file = result.filePaths[0];
  if (result.canceled || !file) {
    return null;
  }
  const buf = await readFile(file);
  if (buf.byteLength > MAX_BYTES) {
    throw new Error("Binary bodies are limited to 10 MB.");
  }
  const ext = extname(file).toLowerCase();
  return {
    fileName: basename(file),
    base64: buf.toString("base64"),
    mime: MIME[ext] ?? "application/octet-stream",
    size: buf.byteLength,
  };
}
