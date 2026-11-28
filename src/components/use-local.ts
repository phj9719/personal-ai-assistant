"use client";

import {useRef,useState, useSyncExternalStore} from "react";

const updateEvent = "onharu-storage";

function subscribe(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener(updateEvent, listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener(updateEvent, listener);
  };
}

const noSubscription = () => () => {};

function read(key: string) {
  try { return localStorage.getItem(key); } catch { return null; }
}

export function useLocal<T>(key: string, initial: T, enabled = true) {
  const savedFallback = useRef<{value:T}|undefined>(undefined);
  const [fallback, setFallback] = useState<{value:T}>();
  const stored = useSyncExternalStore(enabled ? subscribe : noSubscription, () => enabled ? read(key) : null, () => null);
  let value = initial;
  if (fallback) {
    value = fallback.value;
  } else if (stored !== null) {
    try { value = JSON.parse(stored) as T; } catch {}
  }
  function save(next: T) {
    try {
      localStorage.setItem(key, JSON.stringify(next));
      window.dispatchEvent(new Event(updateEvent));
      savedFallback.current = undefined;
      setFallback(undefined);
    } catch {
      savedFallback.current = {value:next};
      setFallback(savedFallback.current);
    }
  }
  function current() {
    if (savedFallback.current) return savedFallback.current.value;
    const raw = read(key);
    if (raw!==null) {
      try { return JSON.parse(raw) as T; } catch {}
    }
    return initial;
  }
  return [value, save, current] as const;
}
