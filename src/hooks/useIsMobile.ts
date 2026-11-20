import { useCallback, useSyncExternalStore } from 'react';

const subscribeNoop = () => () => {};

export function useIsMobile(maxWidthPx = 768): boolean {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (typeof window === 'undefined') return subscribeNoop();
      const mq = window.matchMedia(`(max-width: ${maxWidthPx}px)`);
      mq.addEventListener('change', onStoreChange);
      return () => mq.removeEventListener('change', onStoreChange);
    },
    [maxWidthPx]
  );

  const getSnapshot = () =>
    typeof window !== 'undefined' ? window.matchMedia(`(max-width: ${maxWidthPx}px)`).matches : false;

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
