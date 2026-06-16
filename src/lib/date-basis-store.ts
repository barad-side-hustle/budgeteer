"use client";

import { useSyncExternalStore } from "react";
import { type DateBasis, DEFAULT_DATE_BASIS, isDateBasis } from "@/lib/date-basis";

const STORAGE_KEY = "budgeteer.dateBasis";

let memValue: DateBasis = readFromStorage();
const listeners = new Set<() => void>();

function readFromStorage(): DateBasis {
  if (typeof window === "undefined") return DEFAULT_DATE_BASIS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return isDateBasis(raw) ? raw : DEFAULT_DATE_BASIS;
  } catch {
    return DEFAULT_DATE_BASIS;
  }
}

function writeToStorage(value: DateBasis): void {
  if (typeof window === "undefined") return;
  try {
    if (value === DEFAULT_DATE_BASIS) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    return;
  }
}

export function getDateBasisSync(): DateBasis {
  return memValue;
}

export function setDateBasis(value: DateBasis): void {
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

export function useDateBasis(): DateBasis {
  return useSyncExternalStore(
    subscribe,
    () => memValue,
    () => DEFAULT_DATE_BASIS,
  );
}
