export function EmptyState({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon" aria-hidden="true" />
      <h3>{title}</h3>
      <div className="empty-state-body">{children}</div>
    </div>
  );
}
