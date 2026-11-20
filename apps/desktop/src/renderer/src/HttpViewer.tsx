import { useEffect, useMemo, useState } from "react";
import type { FlowDetail } from "../../shared/types";
import {
  bytesFromBase64,
  formatHeaders,
  headerMime,
  languageFor,
  prettyBody,
  toHexDump,
} from "../../shared/httpFormat";
import { MonacoView } from "./MonacoView";

type Side = "req" | "resp";
type Tab = "raw" | "pretty" | "hex" | "headers" | "render";

export function HttpViewer({ flow }: { flow: FlowDetail | null }) {
  const [side, setSide] = useState<Side>("resp");
  const [tab, setTab] = useState<Tab>("pretty");
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [byteError, setByteError] = useState<string | null>(null);

  useEffect(() => {
    if (!flow) {
      setBytes(null);
      return;
    }
    const hasBlob = side === "req" ? flow.req_blob : flow.resp_blob;
    if (!hasBlob) {
      setBytes(new Uint8Array());
      setByteError(null);
      return;
    }
    let cancelled = false;
    setBytes(null);
    void window.lurkwire
      .getFlowBody(flow.id, side)
      .then((b64) => {
        if (cancelled) {
          return;
        }
        setBytes(bytesFromBase64(b64));
        setByteError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setByteError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [flow, side]);

  const mime = useMemo(() => {
    if (!flow) {
      return null;
    }
    return side === "resp" ? flow.mime : headerMime(flow.req_headers);
  }, [flow, side]);

  if (!flow) {
    return <div className="muted empty-pane">Select a request to inspect it.</div>;
  }

  const preview = side === "req" ? flow.req_preview : flow.resp_preview;
  const text = bytes && bytes.length ? new TextDecoder("utf-8").decode(bytes) : (preview ?? "");
  const headers = side === "req" ? flow.req_headers : flow.resp_headers;
  const language = languageFor(mime, text);

  return (
    <div className="http-viewer">
      <div className="http-viewer-bar">
        <div className="seg">
          <button type="button" className={side === "req" ? "active" : ""} onClick={() => setSide("req")}>
            Request
          </button>
          <button type="button" className={side === "resp" ? "active" : ""} onClick={() => setSide("resp")}>
            Response
          </button>
        </div>
        <div className="seg">
          {(["raw", "pretty", "hex", "headers", "render"] as Tab[]).map((item) => (
            <button
              key={item}
              type="button"
              className={tab === item ? "active" : ""}
              onClick={() => setTab(item)}
            >
              {item[0].toUpperCase() + item.slice(1)}
            </button>
          ))}
        </div>
      </div>
      <div className="http-viewer-body">
        {tab === "headers" ? <MonacoView value={formatHeaders(headers) || "(no headers)"} language="plaintext" /> : null}
        {tab === "raw" ? <MonacoView value={text || "(empty)"} language={language} /> : null}
        {tab === "pretty" ? <MonacoView value={prettyBody(text, mime) || "(empty)"} language={language} /> : null}
        {tab === "hex" ? (
          <MonacoView value={bytes ? toHexDump(bytes) : "Loading body…"} language="plaintext" />
        ) : null}
        {tab === "render" ? <RenderPane mime={mime} text={text} bytes={bytes} /> : null}
      </div>
      {byteError ? <div className="muted">{byteError}</div> : null}
    </div>
  );
}

function RenderPane({
  mime,
  text,
  bytes,
}: {
  mime: string | null;
  text: string;
  bytes: Uint8Array | null;
}) {
  const m = (mime ?? "").toLowerCase();
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!bytes || bytes.length === 0 || !m.startsWith("image/")) {
      setObjectUrl(null);
      return;
    }
    const copy = Uint8Array.from(bytes);
    const url = URL.createObjectURL(new Blob([copy.buffer], { type: mime ?? "application/octet-stream" }));
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [bytes, mime, m]);

  if (objectUrl) {
    return <img className="render-image" src={objectUrl} alt="Rendered response" />;
  }
  if (m.includes("html") || text.trim().startsWith("<")) {
    return <iframe className="render-frame" sandbox="" srcDoc={text} title="Rendered response" />;
  }
  if (m.startsWith("text/") || m.includes("json") || m.includes("xml") || !m) {
    return <pre className="code-block">{text || "(empty)"}</pre>;
  }
  return <div className="muted empty-pane">No safe render preview for {m || "this body"}.</div>;
}
