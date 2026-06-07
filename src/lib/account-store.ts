"use client";

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "budgeteer.accountSelection";

let memValue: string | null = readFromStorage();
const listeners = new Set<() => void>();

function readFromStorage(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeToStorage(value: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (value == null) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    return;
  }
}

export function getAccountSelectionSync(): string | null {
  return memValue;
}

export function setAccountSelection(value: string | null): void {
  if (memValue === value) return;
  memValue = value;
  writeToStorage(value);
  for (const fn of listeners) fn();
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function useAccountSelection(): string | null {
  return useSyncExternalStore(
    subscribe,
    () => memValue,
    () => null,
  );
}
