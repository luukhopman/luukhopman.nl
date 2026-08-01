import { type TouchEvent, useEffect, useLayoutEffect, useRef } from "react";

const MOBILE_SHEET_BREAKPOINT = 760;
const SHEET_CLOSE_THRESHOLD = 110;
const SHEET_INTENT_THRESHOLD = 14;
const SHEET_FLICK_CLOSE_VELOCITY = 0.72;
const SHEET_FLICK_MIN_OFFSET = 52;

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

export function useBottomSheetGesture(open: boolean, onClose: () => void) {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingOffsetRef = useRef(0);
  const gestureRef = useRef({
    tracking: false,
    dragging: false,
    startX: 0,
    startY: 0,
    lastY: 0,
    lastTime: 0,
    offset: 0,
    velocity: 0,
  });

  function syncDragState(active: boolean) {
    if (active) {
      sheetRef.current?.setAttribute("data-sheet-dragging", "true");
      overlayRef.current?.setAttribute("data-sheet-dragging", "true");
      return;
    }
    sheetRef.current?.removeAttribute("data-sheet-dragging");
    overlayRef.current?.removeAttribute("data-sheet-dragging");
  }

  function syncClosingState(active: boolean) {
    if (active) {
      sheetRef.current?.setAttribute("data-sheet-closing", "true");
      overlayRef.current?.setAttribute("data-sheet-closing", "true");
      return;
    }
    sheetRef.current?.removeAttribute("data-sheet-closing");
    overlayRef.current?.removeAttribute("data-sheet-closing");
  }

  function applyOffset(offset: number) {
    const nextOffset = Math.max(offset, 0);
    const viewportHeight = typeof window === "undefined" ? 1 : window.innerHeight || 1;
    const dragRange = Math.max(viewportHeight * 0.42, SHEET_CLOSE_THRESHOLD * 1.75);
    const progress = Math.min(nextOffset / dragRange, 1);

    sheetRef.current?.style.setProperty("--sheet-offset", `${nextOffset}px`);
    overlayRef.current?.style.setProperty(
      "--sheet-backdrop-opacity",
      `${Math.max(0.18, 1 - progress * 0.78)}`,
    );
  }

  function dampSheetOffset(deltaY: number) {
    const viewportHeight = typeof window === "undefined" ? 1 : window.innerHeight || 1;
    const maxOffset = viewportHeight * 0.58;

    if (deltaY <= 0) return 0;
    if (deltaY <= 84) {
      return Math.min(deltaY * 0.92, maxOffset);
    }

    return Math.min(84 * 0.92 + (deltaY - 84) * 0.58, maxOffset);
  }

  function cancelQueuedFrame() {
    if (frameRef.current === null) return;
    window.cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
  }

  function clearScheduledClose() {
    if (!closeTimeoutRef.current) return;
    clearTimeout(closeTimeoutRef.current);
    closeTimeoutRef.current = null;
  }

  function queueOffset(offset: number) {
    pendingOffsetRef.current = offset;
    if (frameRef.current !== null) return;

    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      applyOffset(pendingOffsetRef.current);
    });
  }

  function resetGesture(immediate = false) {
    cancelQueuedFrame();
    clearScheduledClose();
    gestureRef.current = {
      tracking: false,
      dragging: false,
      startX: 0,
      startY: 0,
      lastY: 0,
      lastTime: 0,
      offset: 0,
      velocity: 0,
    };
    pendingOffsetRef.current = 0;
    syncDragState(false);
    syncClosingState(false);

    if (immediate) {
      applyOffset(0);
      return;
    }

    queueOffset(0);
  }

  useEffect(() => {
    if (!open) {
      resetGesture(true);
    }
  }, [open]);

  useEffect(() => {
    return () => {
      resetGesture(true);
    };
  }, []);

  function canStartGesture(target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) return false;
    if (
      target.closest(
        "button, a, input, textarea, select, label, [role='button'], [data-no-sheet-gesture]",
      )
    ) {
      return false;
    }

    if (
      target.closest("[data-sheet-gesture-handle]") ||
      target.closest(".modal-header") ||
      target.closest(".view-modal-header")
    ) {
      return true;
    }

    const scrollContainer = scrollRef.current;
    if (!scrollContainer || !target.closest(".recipe-modal-scroll, .view-modal-scroll")) {
      return false;
    }

    return scrollContainer.scrollTop <= 4;
  }

  function handleTouchStart(event: TouchEvent<HTMLDivElement>) {
    if (
      !open ||
      typeof window === "undefined" ||
      window.innerWidth > MOBILE_SHEET_BREAKPOINT ||
      event.touches.length !== 1
    ) {
      return;
    }

    const touch = event.touches[0];
    if (!canStartGesture(event.target)) return;
    if ((scrollRef.current?.scrollTop || 0) > 4) return;

    gestureRef.current = {
      tracking: true,
      dragging: false,
      startX: touch.clientX,
      startY: touch.clientY,
      lastY: touch.clientY,
      lastTime: performance.now(),
      offset: 0,
      velocity: 0,
    };
    syncClosingState(false);
  }

  function handleTouchMove(event: TouchEvent<HTMLDivElement>) {
    if (!gestureRef.current.tracking || event.touches.length !== 1) return;

    const touch = event.touches[0];
    const currentGesture = gestureRef.current;
    const deltaY = touch.clientY - currentGesture.startY;
    const deltaX = Math.abs(touch.clientX - currentGesture.startX);

    if (!currentGesture.dragging) {
      if (deltaY <= 0) {
        resetGesture();
        return;
      }
      if (deltaX > deltaY && deltaX > SHEET_INTENT_THRESHOLD) {
        resetGesture();
        return;
      }
      if (deltaY < SHEET_INTENT_THRESHOLD) return;

      currentGesture.dragging = true;
      syncDragState(true);
    }

    event.preventDefault();

    const now = performance.now();
    const elapsed = Math.max(now - currentGesture.lastTime, 1);
    const instantaneousVelocity = (touch.clientY - currentGesture.lastY) / elapsed;
    currentGesture.lastY = touch.clientY;
    currentGesture.lastTime = now;
    currentGesture.velocity = currentGesture.velocity * 0.32 + instantaneousVelocity * 0.68;

    const nextOffset = dampSheetOffset(deltaY);
    currentGesture.offset = nextOffset;
    queueOffset(nextOffset);
  }

  function handleTouchEnd() {
    if (!gestureRef.current.tracking) {
      resetGesture(true);
      return;
    }

    if (!gestureRef.current.dragging) {
      resetGesture(true);
      return;
    }

    const shouldClose =
      gestureRef.current.offset >= SHEET_CLOSE_THRESHOLD ||
      (gestureRef.current.offset >= SHEET_FLICK_MIN_OFFSET &&
        gestureRef.current.velocity > SHEET_FLICK_CLOSE_VELOCITY);
    const closeTarget = Math.min(
      window.innerHeight * 1.2,
      Math.max(window.innerHeight * 0.92, gestureRef.current.offset + 240),
    );

    gestureRef.current.tracking = false;
    gestureRef.current.dragging = false;
    syncDragState(false);

    if (shouldClose) {
      syncClosingState(true);
      applyOffset(closeTarget);
      clearScheduledClose();
      closeTimeoutRef.current = setTimeout(() => {
        closeTimeoutRef.current = null;
        onClose();
      }, 300);
      triggerHaptic("tap");
      return;
    }

    queueOffset(0);
  }

  return {
    overlayRef,
    sheetRef,
    scrollRef,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
  };
}
