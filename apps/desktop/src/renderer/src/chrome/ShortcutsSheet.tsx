import { SHORTCUTS } from "../../../shared/shortcuts";

export function ShortcutsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) {
    return null;
  }
  const groups = ["Tools", "Editor", "Browser"] as const;
  return (
    <div className="palette-backdrop" onMouseDown={onClose} role="presentation">
      <div className="shortcuts-sheet" role="dialog" aria-label="Keyboard shortcuts" onMouseDown={(event) => event.stopPropagation()}>
        <div className="shortcuts-head">
          <strong>Keyboard shortcuts</strong>
          <button type="button" className="tb" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <p className="muted">
          Ctrl+R and Ctrl+I send the selected (or latest) request to Repeater and Intruder. Reload is F5. Developer tools are F12.
        </p>
        {groups.map((group) => (
          <section key={group}>
            <h3>{group}</h3>
            <table className="shortcuts-table">
              <tbody>
                {SHORTCUTS.filter((item) => item.group === group).map((item) => (
                  <tr key={item.id}>
                    <td>
                      <kbd>{item.keys}</kbd>
                    </td>
                    <td>{item.action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
      </div>
    </div>
  );
}
