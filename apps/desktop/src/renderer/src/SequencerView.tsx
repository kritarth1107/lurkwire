import { useMemo, useState } from "react";
import { analyzeTokens } from "../../shared/sequencer";

export function SequencerView() {
  const [input, setInput] = useState("");
  const stats = useMemo(() => analyzeTokens(input), [input]);

  return (
    <div className="workbench sequencer-workbench">
      <p className="muted">
        Sequencer-lite measures how random a set of tokens looks (cookies, CSRF, session IDs). Paste samples below —
        one per line — or drop values from Decode.
      </p>
      <textarea
        className="seq-input"
        rows={10}
        placeholder={"session-1\nsession-2\nsession-3"}
        value={input}
        onChange={(event) => setInput(event.target.value)}
      />
      <dl className="seq-stats">
        <div><dt>Samples</dt><dd>{stats.count}</dd></div>
        <div><dt>Unique</dt><dd>{stats.unique}</dd></div>
        <div><dt>Length</dt><dd>{stats.count ? `${stats.minLen}–${stats.maxLen} (avg ${stats.meanLen.toFixed(1)})` : "—"}</dd></div>
        <div><dt>Charset</dt><dd>{stats.charsetSize ? `${stats.charsetSize} chars` : "—"}</dd></div>
        <div><dt>Entropy</dt><dd>{stats.count ? `${stats.entropy.toFixed(2)} / ${stats.maxEntropy.toFixed(2)} bits/char` : "—"}</dd></div>
        <div><dt>Flags</dt><dd>
          {[
            stats.numeric ? "numeric" : null,
            stats.hexLike ? "hex" : null,
            stats.base64Like ? "base64-like" : null,
            stats.timestampLike ? "timestamp" : null,
            stats.incremental ? "incremental" : null,
          ]
            .filter(Boolean)
            .join(", ") || "—"}
        </dd></div>
      </dl>
      {stats.charset ? <p className="seq-charset muted">Charset: {stats.charset}</p> : null}
      <ul className="seq-notes">
        {stats.notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </div>
  );
}
