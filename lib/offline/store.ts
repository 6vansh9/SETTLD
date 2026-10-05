"use client";

import { createStore, get, set } from "idb-keyval";
import type { QueueItem } from "./types";

/**
 * The offline queue, persisted in IndexedDB (idb-keyval) so it survives reloads and app restarts.
 * One list for the device; each item carries its user, and only that user's items are shown or
 * replayed. Nothing is ever dropped silently: items leave only when the server accepts them or the
 * user discards them.
 */
const KEY = "queue";
let idb: ReturnType<typeof createStore> | null = null;
const store = () => (idb ??= createStore("settld-offline", "kv"));

let items: QueueItem[] = [];
let loaded = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export async function loadQueue(): Promise<QueueItem[]> {
  if (loaded) return items;
  try {
    items = ((await get<QueueItem[]>(KEY, store())) ?? []).sort((a, b) => a.createdAt - b.createdAt);
  } catch {
    items = [];
  }
  loaded = true;
  emit();
  return items;
}

async function save(next: QueueItem[]) {
  items = next;
  emit();
  try {
    await set(KEY, next, store());
  } catch (e) {
    console.warn("[offline] couldn't persist the queue", e);
  }
}

export function snapshot(): QueueItem[] {
  return items;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function enqueue(item: QueueItem): Promise<void> {
  await loadQueue();
  await save([...items.filter((i) => i.id !== item.id), item]);
}

export async function updateItem(id: string, patch: Partial<QueueItem>): Promise<void> {
  await loadQueue();
  await save(items.map((i) => (i.id === id ? ({ ...i, ...patch } as QueueItem) : i)));
}

export async function removeItem(id: string): Promise<void> {
  await loadQueue();
  await save(items.filter((i) => i.id !== id));
}

export function findCreate(clientId: string): QueueItem | undefined {
  return items.find((i) => i.kind === "create_expense" && i.id === clientId);
}

/** For tests. */
export function __resetForTests(next: QueueItem[] = []) {
  items = next;
  loaded = true;
}
