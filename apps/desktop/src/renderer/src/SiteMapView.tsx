import { useEffect, useMemo, useState } from "react";
import type { FlowDetail, FlowSummary } from "../../shared/types";
import { formatBytes, statusClass } from "../../shared/http";
import { AnnotationBar, FlowContextMenu, useFlowContextMenu, type FlowSendHandlers } from "./FlowActions";
import { HttpViewer } from "./HttpViewer";

type TreeNode = {
  key: string;
  label: string;
  host: string;
  path: string;
  count: number;
  children: TreeNode[];
};

function insert(root: Map<string, HostNode>, flow: FlowSummary) {
  let host = root.get(flow.host);
  if (!host) {
    host = { key: flow.host, label: flow.host, host: flow.host, path: "/", count: 0, kids: new Map() };
    root.set(flow.host, host);
  }
  host.count += 1;
  const segs = flow.path.split("/").filter(Boolean);
  let node = host;
  let acc = "";
  for (const seg of segs) {
    acc += `/${seg}`;
    let next = node.kids.get(seg);
    if (!next) {
      next = { key: `${flow.host}${acc}`, label: `/${seg}`, host: flow.host, path: acc, count: 0, kids: new Map() };
      node.kids.set(seg, next);
    }
    next.count += 1;
    node = next;
  }
}

type HostNode = { key: string; label: string; host: string; path: string; count: number; kids: Map<string, HostNode> };

function toTree(node: HostNode): TreeNode {
  return {
    key: node.key,
    label: node.label,
    host: node.host,
    path: node.path,
    count: node.count,
    children: [...node.kids.values()].sort((a, b) => a.label.localeCompare(b.label)).map(toTree),
  };
}

function buildTree(items: FlowSummary[]): TreeNode[] {
  const root = new Map<string, HostNode>();
  for (const flow of items) {
    insert(root, flow);
  }
  return [...root.values()].sort((a, b) => a.label.localeCompare(b.label)).map(toTree);
}

export function SiteMapView({ projectId, handlers }: { projectId: string | null; handlers: FlowSendHandlers }) {
  const [items, setItems] = useState<FlowSummary[]>([]);
  const [selected, setSelected] = useState<TreeNode | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<FlowDetail | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const { menu, setMenu } = useFlowContextMenu();

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const list = await window.lurkwire.listFlows({
        project_id: projectId ?? undefined,
        hide_static: false,
        limit: 1000,
      });
      if (!cancelled) {
        setItems(list.items);
      }
    };
    void load();
    const timer = setInterval(() => void load(), 1500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [projectId]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    void window.lurkwire.getFlow(selectedId).then((flow) => {
      if (!cancelled) {
        setDetail(flow);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const tree = useMemo(() => buildTree(items), [items]);
  const filtered = useMemo(() => {
    if (!selected) {
      return items.slice(0, 80);
    }
    return items.filter((item) => item.host === selected.host && (item.path === selected.path || item.path.startsWith(selected.path === "/" ? "/" : `${selected.path}/`) || selected.path === "/"));
  }, [items, selected]);

  function toggle(key: string) {
    setOpen((prev) => ({ ...prev, [key]: prev[key] === false ? true : prev[key] === undefined ? false : !prev[key] }));
  }

  function renderNode(node: TreeNode, depth: number) {
    const expanded = open[node.key] !== false;
    return (
      <div key={node.key} className="tree-node">
        <button
          type="button"
          className={`tree-row${selected?.key === node.key ? " selected" : ""}`}
          style={{ paddingLeft: 8 + depth * 14 }}
          onClick={() => setSelected(node)}
        >
          {node.children.length ? (
            <span
              className="tree-twisty"
              onClick={(event) => {
                event.stopPropagation();
                toggle(node.key);
              }}
            >
              {expanded ? "▾" : "▸"}
            </span>
          ) : (
            <span className="tree-twisty empty" />
          )}
          <span className="tree-label">{node.label}</span>
          <span className="muted">{node.count}</span>
        </button>
        {expanded ? node.children.map((child) => renderNode(child, depth + 1)) : null}
      </div>
    );
  }

  return (
    <div className="workbench sitemap-workbench">
      <div className="sitemap-split">
        <div className="sitemap-tree">
          <div className="workbench-toolbar">
            <span className="muted">{tree.length} hosts</span>
          </div>
          {tree.length === 0 ? <p className="muted empty-pane">Browse a site to build the map.</p> : tree.map((node) => renderNode(node, 0))}
        </div>
        <div className="sitemap-detail">
          <div className="history-table-wrap compact">
            <table className="history-table">
              <thead>
                <tr>
                  <th>Method</th>
                  <th>Path</th>
                  <th>Status</th>
                  <th>Length</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr
                    key={item.id}
                    className={selectedId === item.id ? "selected" : ""}
                    onClick={() => setSelectedId(item.id)}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      setSelectedId(item.id);
                      setMenu({ x: event.clientX, y: event.clientY, flow: item });
                    }}
                  >
                    <td>{item.method}</td>
                    <td>{item.path}{item.query ? `?${item.query}` : ""}</td>
                    <td className={statusClass(item.status)}>{item.status ?? ""}</td>
                    <td>{formatBytes(item.resp_len)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <AnnotationBar flow={detail} onPatched={setDetail} />
          <HttpViewer flow={detail} />
        </div>
      </div>
      <FlowContextMenu menu={menu} handlers={handlers} />
    </div>
  );
}
