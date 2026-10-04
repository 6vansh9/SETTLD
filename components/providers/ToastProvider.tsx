"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { Toast, type ToastData } from "@/components/ui/Toast";

type ShowToast = (toast: Omit<ToastData, "id"> & { id?: string }) => void;

const ToastContext = createContext<{ show: ShowToast }>({ show: () => {} });

/** One app-wide toast (Undo, errors with Retry). Anything, including query hooks, can show one. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastData | null>(null);
  const dismiss = useCallback(() => setToast(null), []);
  const show = useCallback<ShowToast>((t) => setToast({ ...t, id: t.id ?? `t-${Date.now()}-${Math.random().toString(36).slice(2)}` }), []);
  const value = useMemo(() => ({ show }), [show]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <Toast toast={toast} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
