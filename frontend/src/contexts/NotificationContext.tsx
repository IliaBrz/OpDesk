import { createContext, useContext, type ReactNode } from 'react';

export type NotifyFn = (message: string) => void;

const NotificationContext = createContext<NotifyFn | null>(null);

export function NotificationProvider({
  notify,
  children,
}: {
  notify: NotifyFn;
  children: ReactNode;
}) {
  return (
    <NotificationContext.Provider value={notify}>
      {children}
    </NotificationContext.Provider>
  );
}

/** Toast into the shared `.notifications` stack (same as WebSocket status toasts). */
export function useNotify(): NotifyFn {
  const notify = useContext(NotificationContext);
  return notify ?? (() => {});
}
