import Editor from "@monaco-editor/react";
import { useEffect, useState } from "react";
import "./monacoEnv";

type Props = {
  value: string;
  language?: string;
  readOnly?: boolean;
};

export function MonacoView({ value, language = "plaintext", readOnly = true }: Props) {
  const [failed, setFailed] = useState(false);
  const [theme, setTheme] = useState<"vs" | "vs-dark">("vs");

  useEffect(() => {
    const read = () => {
      const current = document.documentElement.dataset.theme === "dark" ? "vs-dark" : "vs";
      setTheme(current);
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  if (failed) {
    return <pre className="code-block monaco-fallback">{value || "(empty)"}</pre>;
  }

  return (
    <div className="monaco-wrap">
      <Editor
        value={value}
        language={language}
        theme={theme}
        options={{
          readOnly,
          minimap: { enabled: false },
          wordWrap: "on",
          fontSize: 12,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
          scrollBeyondLastLine: false,
          automaticLayout: true,
          renderLineHighlight: "line",
          lineNumbers: "on",
          tabSize: 2,
          folding: true,
          contextmenu: true,
        }}
        loading={<pre className="code-block monaco-fallback">{value || "Loading editor…"}</pre>}
        onMount={() => setFailed(false)}
        onValidate={() => undefined}
      />
    </div>
  );
}
