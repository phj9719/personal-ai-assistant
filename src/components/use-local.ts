"use client";

import {useState, useSyncExternalStore} from "react";

const updateEvent = "onharu-storage";

function subscribe(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener(updateEvent, listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener(updateEvent, listener);
  };
}

function read(key: string) {
  try { return localStorage.getItem(key); } catch { return null; }
}

export function useLocal<T>(key: string, initial: T) {
  const [fallback, setFallback] = useState<{value:T}>();
  const stored = useSyncExternalStore(subscribe, () => read(key), () => null);
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
      setFallback(undefined);
    } catch {
      setFallback({value:next});
    }
  }
  return [value, save] as const;
}
