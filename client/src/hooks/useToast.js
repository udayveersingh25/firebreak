import { createContext, useContext } from 'react';

export const ToastContext = createContext(null);

/** toast.success(message) and toast.error(message). */
export function useToast() {
  return useContext(ToastContext);
}
