import { useEffect, useState } from "react";

export type ComparerItem = { id: string; label: string };

let comparer: ComparerItem[] = [];
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

export function addComparerItem(id: string, label: string) {
  if (comparer.some((item) => item.id === id)) {
    return;
  }
  comparer = [...comparer, { id, label }].slice(-16);
  emit();
}

export function removeComparerItem(id: string) {
  comparer = comparer.filter((item) => item.id !== id);
  emit();
}

export function clearComparer() {
  comparer = [];
  emit();
}

export function useComparerItems(): ComparerItem[] {
  const [items, setItems] = useState(comparer);
  useEffect(() => {
    const listener = () => setItems(comparer.slice());
    listeners.add(listener);
    listener();
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return items;
}

export async function loadFlowForSend(id: string) {
  return window.lurkwire.getFlow(id);
}
