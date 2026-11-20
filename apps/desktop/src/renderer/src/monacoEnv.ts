import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
// Inline workers so the packaged file:// app can start them without
// CORS-blocked module workers. The TypeScript language service worker is
// omitted (~13MB); JS/TS bodies reuse the editor worker for highlighting.
import EditorWorker from "./monaco/editor.worker?worker&inline";
import JsonWorker from "./monaco/json.worker?worker&inline";
import CssWorker from "./monaco/css.worker?worker&inline";
import HtmlWorker from "./monaco/html.worker?worker&inline";

loader.config({ monaco });

const globalWithEnv = globalThis as typeof globalThis & {
  MonacoEnvironment?: { getWorker: (workerId: string, label: string) => Worker };
};

globalWithEnv.MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    switch (label) {
      case "json":
        return new JsonWorker();
      case "css":
      case "scss":
      case "less":
        return new CssWorker();
      case "html":
      case "handlebars":
      case "razor":
        return new HtmlWorker();
      default:
        return new EditorWorker();
    }
  },
};
