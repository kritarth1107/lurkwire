import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";

loader.config({ monaco });

// Electron loads the renderer from file://, so Monaco's default worker URLs
// cannot be fetched. A same-origin blob worker keeps the editor usable.
const workerSource = `
self.onmessage = function () {};
`;

const globalWithEnv = globalThis as typeof globalThis & {
  MonacoEnvironment?: { getWorker: (workerId: string, label: string) => Worker };
};

globalWithEnv.MonacoEnvironment = {
  getWorker() {
    return new Worker(URL.createObjectURL(new Blob([workerSource], { type: "application/javascript" })));
  },
};
