import { randomUUID } from "node:crypto";
import { basename } from "node:path";
import { app, type DownloadItem, type Session, shell } from "electron";
import type { DownloadInfo } from "../shared/types";

type Tracked = {
  id: string;
  item: DownloadItem;
  filename: string;
  url: string;
};

export class DownloadManager {
  private tracked = new Map<string, Tracked>();
  private finished: DownloadInfo[] = [];
  private hooked = new Set<Session>();

  constructor(private onChange: () => void) {}

  hook(ses: Session): void {
    if (this.hooked.has(ses)) {
      return;
    }
    this.hooked.add(ses);
    ses.on("will-download", (_event, item) => {
      const id = randomUUID();
      const filename = item.getFilename() || "download";
      const destination = `${app.getPath("downloads")}/${filename}`;
      item.setSavePath(destination);
      this.tracked.set(id, {
        id,
        item,
        filename,
        url: item.getURL(),
      });
      const update = () => this.onChange();
      item.on("updated", update);
      item.once("done", () => {
        const info = this.toInfo(id);
        if (info) {
          this.finished = [info, ...this.finished].slice(0, 50);
        }
        this.tracked.delete(id);
        this.onChange();
      });
      this.onChange();
    });
  }

  list(): DownloadInfo[] {
    const live = [...this.tracked.keys()]
      .map((id) => this.toInfo(id))
      .filter((item): item is DownloadInfo => Boolean(item));
    return [...live, ...this.finished];
  }

  cancel(id: string): void {
    this.tracked.get(id)?.item.cancel();
  }

  show(id: string): void {
    const info = this.list().find((item) => item.id === id);
    if (info?.path) {
      shell.showItemInFolder(info.path);
    }
  }

  open(id: string): void {
    const info = this.list().find((item) => item.id === id);
    if (info?.path) {
      void shell.openPath(info.path);
    }
  }

  private toInfo(id: string): DownloadInfo | null {
    const tracked = this.tracked.get(id);
    if (tracked) {
      const state = tracked.item.getState();
      return {
        id,
        filename: tracked.filename || basename(tracked.item.getSavePath() || "download"),
        url: tracked.url,
        state,
        receivedBytes: tracked.item.getReceivedBytes(),
        totalBytes: tracked.item.getTotalBytes(),
        path: tracked.item.getSavePath() || null,
      };
    }
    return this.finished.find((item) => item.id === id) ?? null;
  }
}
