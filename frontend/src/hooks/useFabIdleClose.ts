import { useCallback, useEffect, useRef } from "react";

import { fabIdleCloseMs } from "@/constants/motion";
import { useAddTransactionFabStore } from "@/stores/addTransactionFabStore";

/**
 * Closes the add-transaction FAB after a period without interaction.
 * Returns `bump`, which restarts the idle countdown while the FAB is open.
 */
export function useFabIdleClose() {
  const fabOpen = useAddTransactionFabStore((s) => s.fabOpen);
  const holdOpen = useAddTransactionFabStore((s) => s.holdOpen);
  const setFabOpen = useAddTransactionFabStore((s) => s.setFabOpen);
  const idleCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearIdleTimer = useCallback(() => {
    if (idleCloseTimerRef.current) {
      clearTimeout(idleCloseTimerRef.current);
      idleCloseTimerRef.current = null;
    }
  }, []);

  const scheduleIdleClose = useCallback(() => {
    clearIdleTimer();
    idleCloseTimerRef.current = setTimeout(() => {
      idleCloseTimerRef.current = null;
      if (useAddTransactionFabStore.getState().fabOpen) {
        setFabOpen(false);
      }
    }, fabIdleCloseMs);
  }, [clearIdleTimer, setFabOpen]);

  const bump = useCallback(() => {
    const { fabOpen: open, holdOpen: hold } =
      useAddTransactionFabStore.getState();
    if (open && !hold) {
      scheduleIdleClose();
    }
  }, [scheduleIdleClose]);

  useEffect(() => {
    if (!fabOpen || holdOpen) {
      clearIdleTimer();
      return;
    }
    scheduleIdleClose();
    return clearIdleTimer;
  }, [fabOpen, holdOpen, scheduleIdleClose, clearIdleTimer]);

  return bump;
}
