import { Minus, Square, X } from "lucide-react";

export function WindowControls() {
  return (
    <div className="window-controls">
      <button type="button" className="win-btn" aria-label="Minimize" onClick={() => void window.lurkwire.windowMinimize()}>
        <Minus size={12} />
      </button>
      <button
        type="button"
        className="win-btn"
        aria-label="Maximize"
        onClick={() => void window.lurkwire.windowToggleMaximize()}
      >
        <Square size={10} />
      </button>
      <button type="button" className="win-btn close" aria-label="Close" onClick={() => void window.lurkwire.windowClose()}>
        <X size={12} />
      </button>
    </div>
  );
}
