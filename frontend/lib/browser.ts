import { useEffect } from "react";

export function useBodyClass(className: string) {
  useEffect(() => {
    document.body.classList.add(className);
    return () => {
      document.body.classList.remove(className);
    };
  }, [className]);
}

export function useLockedBody(active: boolean) {
  useEffect(() => {
    if (!active) return;

    const scrollY = window.scrollY || window.pageYOffset || 0;
    document.body.dataset.scrollY = String(scrollY);
    document.body.style.top = `-${scrollY}px`;
    document.body.classList.add("modal-open");

    return () => {
      const savedScrollY = Number(document.body.dataset.scrollY || "0");
      document.body.classList.remove("modal-open");
      document.body.style.top = "";
      delete document.body.dataset.scrollY;
      window.scrollTo(0, savedScrollY);
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
