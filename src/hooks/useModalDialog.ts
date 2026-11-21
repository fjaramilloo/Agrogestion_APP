import { useEffect, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent, SyntheticEvent } from 'react';

/**
 * Sincroniza un <dialog> nativo con estado booleano de React, manteniendo
 * tecla Esc, gesto atrás en móvil y light-dismiss opcional cuando closedby="any".
 */
export function useModalDialog(
  isOpen: boolean,
  onClose: () => void,
  allowLightDismiss = true,
  disabled = false
) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pressedOutsideRef = useRef(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else if (dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  const isOutsideDialog = (
    e: ReactPointerEvent<HTMLDialogElement>,
    dialog: HTMLDialogElement
  ) => {
    const rect = dialog.getBoundingClientRect();
    return (
      e.clientX < rect.left ||
      e.clientX > rect.right ||
      e.clientY < rect.top ||
      e.clientY > rect.bottom
    );
  };

  const handleCancel = (e: SyntheticEvent<HTMLDialogElement>) => {
    e.preventDefault();
    if (!disabled) {
      onClose();
    }
  };

  const handlePointerDown = (e: ReactPointerEvent<HTMLDialogElement>) => {
    if (disabled || !allowLightDismiss || 'closedBy' in HTMLDialogElement.prototype) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    pressedOutsideRef.current = isOutsideDialog(e, dialog);
  };

  const handlePointerUp = (e: ReactPointerEvent<HTMLDialogElement>) => {
    if (disabled || !allowLightDismiss || 'closedBy' in HTMLDialogElement.prototype) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const shouldClose = pressedOutsideRef.current && isOutsideDialog(e, dialog);
    pressedOutsideRef.current = false;
    if (shouldClose) {
      onClose();
    }
  };

  const handleNativeClose = () => {
    const dialog = dialogRef.current;
    if (dialog) {
      dialog.returnValue = '';
    }
    if (isOpen && !disabled) {
      onClose();
    }
  };

  const closedByValue = disabled ? 'none' : allowLightDismiss ? 'any' : 'closerequest';

  return {
    ref: dialogRef,
    onCancel: handleCancel,
    onClose: handleNativeClose,
    onPointerDown: handlePointerDown,
    onPointerUp: handlePointerUp,
    ...({ closedby: closedByValue } as Record<string, string>),
  };
}
