import { useEffect, useMemo, useState } from "react";
import { CODEC_LABELS, type CodecId, decodeCodec, hashCodec } from "../../shared/codec";
import { runRecipe, type RecipeStep } from "../../shared/codecRecipe";
import {
  type JwtAlg,
  decodeJwt,
  extractJwts,
  signJwt,
  unsignedJwt,
  verifyJwt,
} from "../../shared/jwt";
import { takeToolIntent } from "./workbench/pendingToolIntent";
import { takeJwt } from "./pendingJwt";
import { decodeAll, identifyHash } from "../../shared/decodeAll";
import { EmptyState } from "./EmptyState";

type Tab = "jwt" | "encode" | "recipe" | "magic";

export function DecodeView() {
  const [tab, setTab] = useState<Tab>("jwt");
  useEffect(() => {
    const intent = takeToolIntent();
    if (intent === "jwt") {
      setTab("jwt");
    }
  }, []);
  return (
    <div className="decode">
      <div className="workbench-toolbar">
        <button type="button" className={tab === "jwt" ? "chip active" : "chip"} onClick={() => setTab("jwt")}>
          JWT
        </button>
        <button type="button" className={tab === "encode" ? "chip active" : "chip"} onClick={() => setTab("encode")}>
          Encode
        </button>
        <button type="button" className={tab === "recipe" ? "chip active" : "chip"} onClick={() => setTab("recipe")}>
          Recipe
        </button>
        <button type="button" className={tab === "magic" ? "chip active" : "chip"} onClick={() => setTab("magic")}>
          Decode all
        </button>
      </div>
      {tab === "jwt" ? <JwtPane /> : tab === "encode" ? <EncodePane /> : tab === "recipe" ? <RecipePane /> : <MagicPane />}
    </div>
  );
}

function JwtPane() {
  const [token, setToken] = useState("");
  const [header, setHeader] = useState("{\n  \"alg\": \"HS256\",\n  \"typ\": \"JWT\"\n}");
  const [payload, setPayload] = useState("{\n  \"sub\": \"\",\n  \"name\": \"\"\n}");
  const [secret, setSecret] = useState("");
  const [alg, setAlg] = useState<JwtAlg>("HS256");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const queued = takeJwt();
    if (queued) {
      load(queued);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const decoded = useMemo(() => {
    const raw = token.trim();
    if (!raw) {
      return null;
    }
    try {
      return decodeJwt(raw);
    } catch {
      return null;
    }
  }, [token]);

  function load(next: string) {
    setToken(next);
    setError(null);
    try {
      const parsed = decodeJwt(next);
      setHeader(parsed.headerText);
      setPayload(parsed.payloadText);
      if (parsed.alg === "HS256" || parsed.alg === "HS384" || parsed.alg === "HS512" || parsed.alg === "none") {
        setAlg(parsed.alg);
      }
      setStatus(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function onVerify() {
    setError(null);
    try {
      const result = await verifyJwt(token, secret);
      setStatus(result.ok ? `Signature OK (${result.alg})` : result.reason ?? "Signature mismatch");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function onSign() {
    setError(null);
    try {
      const next = alg === "none" ? unsignedJwt(header, payload) : await signJwt(header, payload, secret, alg);
      setToken(next);
      setStatus(alg === "none" ? "Issued unsigned token (alg none)" : `Signed with ${alg}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const found = extractJwts(token).filter((item) => item !== token.trim());

  return (
    <div className="decode-pane">
      <label className="intruder-label">
        Token or cookie
        <textarea
          className="mono"
          rows={5}
          value={token}
          onChange={(event) => setToken(event.target.value)}
          onBlur={() => {
            if (token.trim()) {
              load(token);
            }
          }}
          spellCheck={false}
          placeholder="Paste a JWT or a Cookie header"
        />
      </label>
      {found.length > 0 ? (
        <div className="intruder-actions">
          {found.map((item) => (
            <button type="button" key={item} className="chip" onClick={() => load(item)}>
              Use found JWT
            </button>
          ))}
        </div>
      ) : null}
      <label className="intruder-label">
        Header
        <textarea className="mono" rows={5} value={header} onChange={(event) => setHeader(event.target.value)} spellCheck={false} />
      </label>
      <label className="intruder-label">
        Payload
        <textarea className="mono" rows={7} value={payload} onChange={(event) => setPayload(event.target.value)} spellCheck={false} />
      </label>
      {decoded?.claims.iat || decoded?.claims.exp || decoded?.claims.nbf ? (
        <p className="muted">
          {decoded.claims.iat ? `iat ${decoded.claims.iat}` : ""}
          {decoded.claims.nbf ? ` · nbf ${decoded.claims.nbf}` : ""}
          {decoded.claims.exp ? ` · exp ${decoded.claims.exp}` : ""}
        </p>
      ) : null}
      <div className="intruder-controls">
        <label>
          Algorithm
          <select value={alg} onChange={(event) => setAlg(event.target.value as JwtAlg)}>
            <option value="HS256">HS256</option>
            <option value="HS384">HS384</option>
            <option value="HS512">HS512</option>
            <option value="none">none</option>
          </select>
        </label>
        <label>
          HMAC secret
          <input
            type="text"
            value={secret}
            onChange={(event) => setSecret(event.target.value)}
            placeholder="required for HS*"
            spellCheck={false}
          />
        </label>
      </div>
      <div className="intruder-actions">
        <button type="button" onClick={() => token.trim() && load(token)}>
          Decode
        </button>
        <button type="button" onClick={() => void onVerify()} disabled={!token.trim()}>
          Verify
        </button>
        <button type="button" className="primary" onClick={() => void onSign()}>
          {alg === "none" ? "Issue unsigned" : "Re-sign"}
        </button>
        <button
          type="button"
          onClick={() => {
            void window.lurkwire.copyText(token);
            setStatus("Copied token");
          }}
          disabled={!token}
        >
          Copy
        </button>
      </div>
      {status ? <p className="muted">{status}</p> : null}
      {error ? <p className="error">{error}</p> : null}
    </div>
  );
}

function EncodePane() {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function run(id: CodecId, direction: "encode" | "decode") {
    setError(null);
    try {
      const meta = CODEC_LABELS.find((item) => item.id === id);
      if (direction === "decode") {
        setOutput(decodeCodec(id, input));
        return;
      }
      setOutput(meta?.hash ? await hashCodec(id, input) : await hashCodec(id, input));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="decode-pane">
      <label className="intruder-label">
        Input
        <textarea className="mono" rows={6} value={input} onChange={(event) => setInput(event.target.value)} spellCheck={false} />
      </label>
      <div className="codec-grid">
        {CODEC_LABELS.map((codec) => (
          <div key={codec.id} className="codec-row">
            <span>{codec.label}</span>
            <button type="button" onClick={() => void run(codec.id, "encode")}>
              {codec.hash ? "Hash" : "Encode"}
            </button>
            {codec.hash ? null : (
              <button type="button" onClick={() => void run(codec.id, "decode")}>
                Decode
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="intruder-actions">
        <button
          type="button"
          onClick={() => {
            setInput(output);
            setOutput(input);
          }}
        >
          Swap
        </button>
      </div>
      <label className="intruder-label">
        Output
        <textarea className="mono" rows={6} value={output} onChange={(event) => setOutput(event.target.value)} spellCheck={false} />
      </label>
      {error ? <p className="error">{error}</p> : null}
    </div>
  );
}


function RecipePane() {
  const [input, setInput] = useState("");
  const [steps, setSteps] = useState<RecipeStep[]>([{ id: "1", codec: "url", direction: "decode" }]);
  const result = runRecipe(input, steps.filter((step) => !CODEC_LABELS.find((item) => item.id === step.codec)?.hash));
  return (
    <div className="decode-pane">
      <p className="muted">Chain encode/decode steps, Chef-style. Hash steps stay on the Encode tab because they are one-way.</p>
      <label className="intruder-label">
        Input
        <textarea className="mono" rows={6} value={input} onChange={(event) => setInput(event.target.value)} spellCheck={false} />
      </label>
      <div className="recipe-steps">
        {steps.map((step, index) => (
          <div key={step.id} className="codec-row">
            <span>{index + 1}</span>
            <select value={step.codec} onChange={(event) => setSteps((current) => current.map((item) => item.id === step.id ? { ...item, codec: event.target.value as CodecId } : item))}>
              {CODEC_LABELS.filter((item) => !item.hash).map((codec) => (
                <option key={codec.id} value={codec.id}>{codec.label}</option>
              ))}
            </select>
            <select value={step.direction} onChange={(event) => setSteps((current) => current.map((item) => item.id === step.id ? { ...item, direction: event.target.value as RecipeStep["direction"] } : item))}>
              <option value="decode">Decode</option>
              <option value="encode">Encode</option>
            </select>
            <button type="button" onClick={() => setSteps((current) => current.filter((item) => item.id !== step.id))}>Remove</button>
          </div>
        ))}
        <button type="button" onClick={() => setSteps((current) => [...current, { id: crypto.randomUUID(), codec: "base64", direction: "decode" }])}>
          Add step
        </button>
      </div>
      {result.error ? <p className="error">Step {((result.step ?? 0) + 1)}: {result.error}</p> : null}
      <label className="intruder-label">
        Output
        <textarea className="mono" rows={6} value={result.output} readOnly spellCheck={false} />
      </label>
    </div>
  );
}


function MagicPane() {
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [gzipOut, setGzipOut] = useState<string | null>(null);
  const steps = input.trim() ? decodeAll(input) : [];
  const hashes = input.trim() ? identifyHash(input) : [];

  async function runGzip(direction: "compress" | "decompress") {
    setError(null);
    try {
      setGzipOut(await gzipCodec(input, direction));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="decode-pane">
      <EmptyState title="Decoder++">
        Paste a token, hash, or stacked encoding. Decode all peels URL, HTML, Base64, hex, and JWT. The identifier guesses hash algorithms from length and prefixes. Gzip uses the browser CompressionStream.
      </EmptyState>
      <label className="intruder-label">
        Input
        <textarea className="mono" rows={6} value={input} onChange={(event) => setInput(event.target.value)} spellCheck={false} />
      </label>
      <div className="intruder-actions">
        <button type="button" onClick={() => void runGzip("compress")}>Gzip compress</button>
        <button type="button" onClick={() => void runGzip("decompress")}>Gzip decompress</button>
      </div>
      {error ? <p className="error">{error}</p> : null}
      {hashes.length ? (
        <p>
          Hash identifier: {hashes.map((item) => `${item.alg} (${item.reason})`).join(" · ")}
        </p>
      ) : (
        <p className="muted">No hash guess yet.</p>
      )}
      {steps.length ? (
        <ol className="decode-steps">
          {steps.map((step, index) => (
            <li key={`${step.codec}-${index}`}>
              <strong>{step.codec}</strong>
              {step.note ? <span className="muted"> {step.note}</span> : null}
              <pre className="mono evidence">{step.output}</pre>
            </li>
          ))}
        </ol>
      ) : (
        <p className="muted">No automatic decode steps.</p>
      )}
      {gzipOut ? <pre className="mono evidence">{gzipOut}</pre> : null}
    </div>
  );
}

async function gzipCodec(input: string, direction: "compress" | "decompress"): Promise<string> {
  const streamName = direction === "compress" ? "CompressionStream" : "DecompressionStream";
  const Ctor = (globalThis as unknown as Record<string, unknown>)[streamName] as
    | (new (format: string) => GenericTransformStream)
    | undefined;
  if (!Ctor) {
    throw new Error("Gzip is not available in this runtime.");
  }
  const bytes = direction === "decompress" ? hexOrBase64OrRaw(input) : new TextEncoder().encode(input);
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const stream = new Blob([copy]).stream().pipeThrough(new Ctor("gzip"));
  const out = new Uint8Array(await new Response(stream).arrayBuffer());
  return direction === "compress" ? toHex(out) : new TextDecoder().decode(out);
}

function hexOrBase64OrRaw(input: string): Uint8Array {
  const trimmed = input.trim();
  if (/^[0-9a-fA-F]+$/.test(trimmed) && trimmed.length % 2 === 0) {
    const out = new Uint8Array(trimmed.length / 2);
    for (let i = 0; i < out.length; i += 1) {
      out[i] = Number.parseInt(trimmed.slice(i * 2, i * 2 + 2), 16);
    }
    return out;
  }
  try {
    const bin = atob(trimmed);
    return Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  } catch {
    return new TextEncoder().encode(input);
  }
}

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}
