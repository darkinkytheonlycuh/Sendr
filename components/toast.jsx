'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { IconCheck, IconX } from './ui';

const ToastCtx = createContext(null);

const KIND_ICON = {
  ok: <IconCheck />,
  err: <IconX />,
  info: null,
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const push = useCallback((message, kind = 'info') => {
    idRef.current += 1;
    const id = idRef.current;
    setToasts((list) => [...list.slice(-4), { id, message, kind }]);
    setTimeout(() => {
      setToasts((list) =>
        list.map((t) => (t.id === id ? { ...t, out: true } : t))
      );
    }, 3400);
    setTimeout(() => {
      setToasts((list) => list.filter((t) => t.id !== id));
    }, 3850);
  }, []);

  const api = useMemo(() => ({ push }), [push]);

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind} ${t.out ? 'out' : ''}`.trim()}>
            <span style={{ display: 'inline-flex', flexShrink: 0 }}>
              {KIND_ICON[t.kind] || (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 8h.01M12 11v5" strokeLinecap="round" />
                </svg>
              )}
            </span>
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  return useContext(ToastCtx) || { push: () => {} };
}
