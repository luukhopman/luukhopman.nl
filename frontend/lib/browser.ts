import { useEffect, useLayoutEffect } from "react";

type BodyLockSnapshot = {
  overflow: string;
  position: string;
  inset: string;
  width: string;
  top: string;
  scrollY: number;
} | null;

let activeBodyLocks = 0;
let bodyLockSnapshot: BodyLockSnapshot = null;

export function useBodyClass(className: string) {
  useEffect(() => {
    document.body.classList.add(className);
    return () => {
      document.body.classList.remove(className);
    };
  }, [className]);
}

export function useLockedBody(active: boolean) {
  useLayoutEffect(() => {
    if (!active) return;

    if (activeBodyLocks === 0) {
      const scrollY = window.scrollY || window.pageYOffset || 0;
      bodyLockSnapshot = {
        overflow: document.body.style.overflow,
        position: document.body.style.position,
        inset: document.body.style.inset,
        width: document.body.style.width,
        top: document.body.style.top,
        scrollY,
      };
      document.body.classList.add("modal-open");
      document.body.style.overflow = "hidden";
      document.body.style.position = "fixed";
      document.body.style.inset = "0";
      document.body.style.width = "100%";
      document.body.style.top = `-${scrollY}px`;
    }

    activeBodyLocks += 1;

    return () => {
      activeBodyLocks = Math.max(0, activeBodyLocks - 1);

      if (activeBodyLocks > 0 || !bodyLockSnapshot) {
        return;
      }

      document.body.classList.remove("modal-open");
      document.body.style.overflow = bodyLockSnapshot.overflow;
      document.body.style.position = bodyLockSnapshot.position;
      document.body.style.inset = bodyLockSnapshot.inset;
      document.body.style.width = bodyLockSnapshot.width;
      document.body.style.top = bodyLockSnapshot.top;
      window.scrollTo(0, bodyLockSnapshot.scrollY);
      bodyLockSnapshot = null;
    };
  }, [active]);
}

export function triggerHaptic(type: "success" | "delete" | "tap" | "error") {
  if (!navigator.vibrate) return;

  try {
    if (type === "success") {
      navigator.vibrate([30, 50, 30]);
      return;
    }
    if (type === "delete") {
      navigator.vibrate([50]);
      return;
    }
    if (type === "tap") {
      navigator.vibrate([20]);
      return;
    }
    navigator.vibrate([50, 100, 50, 100, 50]);
  } catch {
    // Ignore vibration failures.
  }
}
