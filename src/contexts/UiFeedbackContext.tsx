import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { useIsMobile } from '../hooks/useIsMobile';
import './UiFeedback.css';

export type FeedbackVariant = 'success' | 'error' | 'warning' | 'info';

export interface AlertOptions {
  title?: string;
  variant?: FeedbackVariant;
  confirmLabel?: string;
}

export interface ConfirmOptions {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

export interface PromptOptions {
  title?: string;
  label?: string;
  placeholder?: string;
  initialValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  requiredMessage?: string;
}

type DialogRequest =
  | {
      id: number;
      kind: 'alert';
      message: string;
      options: AlertOptions;
      resolve: () => void;
    }
  | {
      id: number;
      kind: 'confirm';
      message: string;
      options: ConfirmOptions;
      resolve: (value: boolean) => void;
    }
  | {
      id: number;
      kind: 'prompt';
      message: string;
      options: PromptOptions;
      resolve: (value: string | null) => void;
    };

interface PromptDialogFormProps {
  message: string;
  options: PromptOptions;
  isMobile: boolean;
  onCancel: () => void;
  onSubmit: (value: string) => void;
}

function PromptDialogForm({ message, options, isMobile, onCancel, onSubmit }: PromptDialogFormProps) {
  const [value, setValue] = useState(() => options.initialValue ?? '');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) {
      setError(options.requiredMessage || 'Por favor ingresa un valor.');
      return;
    }
    onSubmit(trimmed);
  };

  return (
    <form onSubmit={handleSubmit}>
      {message && <p className="ui-feedback-message">{message}</p>}
      <label htmlFor="ui-feedback-prompt-input" className="ui-feedback-prompt-label">
        {options.label ?? 'Nombre'}
      </label>
      <input
        id="ui-feedback-prompt-input"
        type="text"
        autoFocus={!isMobile}
        className="ui-feedback-prompt-input"
        placeholder={options.placeholder ?? ''}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          if (error) setError('');
        }}
      />
      {error && (
        <p role="alert" className="ui-feedback-prompt-error">
          {error}
        </p>
      )}
      <div className="ui-feedback-actions">
        <button type="button" className="ui-feedback-btn-secondary" onClick={onCancel}>
          {options.cancelLabel ?? 'Cancelar'}
        </button>
        <button type="submit" className="ui-feedback-btn-primary">
          {options.confirmLabel ?? 'Guardar'}
        </button>
      </div>
    </form>
  );
}

interface ToastPayload {
  id: number;
  message: string;
  variant: FeedbackVariant;
}

interface UiFeedbackContextValue {
  toast: (message: string, variant?: FeedbackVariant) => void;
  showAlert: (message: string, options?: AlertOptions) => Promise<void>;
  confirmAction: (message: string, options?: ConfirmOptions) => Promise<boolean>;
  promptInput: (message: string, options?: PromptOptions) => Promise<string | null>;
}

const UiFeedbackContext = createContext<UiFeedbackContextValue | undefined>(undefined);

export const UiFeedbackProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [queue, setQueue] = useState<DialogRequest[]>([]);
  const activeDialog = queue[0] ?? null;

  const [toastData, setToastData] = useState<ToastPayload | null>(null);
  const [queuedToast, setQueuedToast] = useState<ToastPayload | null>(null);
  const isMobile = useIsMobile();

  const dialogRef = useRef<HTMLDialogElement>(null);
  const nextDialogIdRef = useRef(1);
  const resolvedRef = useRef(false);
  const toastRef = useRef<HTMLDivElement>(null);
  const toastTimerRef = useRef<number | null>(null);
  const supportsPopover =
    typeof HTMLElement !== 'undefined' && 'showPopover' in HTMLElement.prototype;

  const settleActiveDialog = useCallback((accepted: boolean, inputValue?: string) => {
    setQueue((prev) => {
      const current = prev[0];
      if (!current) return prev;
      if (!resolvedRef.current) {
        resolvedRef.current = true;
        if (current.kind === 'alert') {
          current.resolve();
        } else if (current.kind === 'confirm') {
          current.resolve(accepted);
        } else {
          current.resolve(accepted ? (inputValue ?? '') : null);
        }
      }
      return prev.slice(1);
    });
  }, []);

  // Abrir / cerrar el <dialog> nativo conforme cambia la cola
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (activeDialog) {
      resolvedRef.current = false;
      if (!dialog.open) {
        dialog.showModal();
      }
    } else if (dialog.open) {
      dialog.close();
    }
  }, [activeDialog]);

  // Esc, cierre nativo y fallback light-dismiss cuando falta closedBy
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleClose = () => {
      dialog.returnValue = '';
      settleActiveDialog(false);
    };

    dialog.addEventListener('close', handleClose);

    let removeLightDismiss: (() => void) | undefined;
    if (!('closedBy' in HTMLDialogElement.prototype)) {
      let pressedOutside = false;
      const isBackdropClick = (e: PointerEvent) => {
        if (e.target !== dialog) return false;
        const r = dialog.getBoundingClientRect();
        return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
      };
      const onPointerDown = (e: PointerEvent) => {
        pressedOutside = isBackdropClick(e);
      };
      const onPointerUp = (e: PointerEvent) => {
        if (pressedOutside && isBackdropClick(e)) {
          dialog.close();
        }
        pressedOutside = false;
      };
      dialog.addEventListener('pointerdown', onPointerDown);
      dialog.addEventListener('pointerup', onPointerUp);
      removeLightDismiss = () => {
        dialog.removeEventListener('pointerdown', onPointerDown);
        dialog.removeEventListener('pointerup', onPointerUp);
      };
    }

    return () => {
      dialog.removeEventListener('close', handleClose);
      removeLightDismiss?.();
    };
  }, [settleActiveDialog]);

  const scheduleToastHide = useCallback((ms = 4200) => {
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToastData(null);
      toastTimerRef.current = null;
    }, ms);
  }, []);

  const dismissToast = useCallback(() => {
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    const el = toastRef.current as (HTMLDivElement & { hidePopover?: () => void }) | null;
    if (el?.hidePopover && supportsPopover) {
      try { el.hidePopover(); } catch { /* noop */ }
    }
    setToastData(null);
  }, [supportsPopover]);

  // Evita superponer un toast de fondo mientras haya un <dialog> modal abierto
  useEffect(() => {
    if (!queuedToast) return;
    if (activeDialog) return;

    const rafId = window.requestAnimationFrame(() => {
      const hasOpenNativeDialog = Boolean(document.querySelector('dialog[open]'));
      if (!hasOpenNativeDialog) {
        setToastData(queuedToast);
        setQueuedToast(null);
      }
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [queuedToast, activeDialog]);

  useEffect(() => {
    const el = toastRef.current as (HTMLDivElement & { showPopover?: () => void; hidePopover?: () => void }) | null;
    const hasModal = Boolean(activeDialog);

    if (!toastData || hasModal) {
      if (el?.hidePopover && supportsPopover) {
        try { el.hidePopover(); } catch { /* noop */ }
      }
      return;
    }

    if (el?.showPopover && supportsPopover) {
      try { el.showPopover(); } catch { /* noop */ }
    }
    scheduleToastHide();

    return () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
        toastTimerRef.current = null;
      }
    };
  }, [toastData, activeDialog, supportsPopover, scheduleToastHide]);

  const toast = useCallback((message: string, variant: FeedbackVariant = 'info') => {
    setQueuedToast({ id: Date.now(), message, variant });
  }, []);

  const showAlert = useCallback((message: string, options: AlertOptions = {}) => {
    const id = nextDialogIdRef.current++;
    return new Promise<void>((resolve) => {
      setQueue((prev) => [...prev, { id, kind: 'alert', message, options, resolve }]);
    });
  }, []);

  const confirmAction = useCallback((message: string, options: ConfirmOptions = {}) => {
    const id = nextDialogIdRef.current++;
    return new Promise<boolean>((resolve) => {
      setQueue((prev) => [...prev, { id, kind: 'confirm', message, options, resolve }]);
    });
  }, []);

  const promptInput = useCallback((message: string, options: PromptOptions = {}) => {
    const id = nextDialogIdRef.current++;
    return new Promise<string | null>((resolve) => {
      setQueue((prev) => [...prev, { id, kind: 'prompt', message, options, resolve }]);
    });
  }, []);

  const handleConfirmSubmit = () => {
    settleActiveDialog(true);
  };

  const handleCancelClick = () => {
    settleActiveDialog(false);
  };

  const renderBadgeIcon = (variant: FeedbackVariant) => {
    if (variant === 'success') return <CheckCircle2 size={20} aria-hidden="true" />;
    if (variant === 'error' || variant === 'warning') return <AlertTriangle size={20} aria-hidden="true" />;
    return <Info size={20} aria-hidden="true" />;
  };

  const getDialogMeta = () => {
    if (!activeDialog) return { title: '', variant: 'info' as FeedbackVariant };
    if (activeDialog.kind === 'alert') {
      const variant = activeDialog.options.variant ?? 'info';
      const defaultTitle =
        variant === 'error' ? 'Error' : variant === 'warning' ? 'Advertencia' : variant === 'success' ? 'Listo' : 'Aviso';
      return { title: activeDialog.options.title ?? defaultTitle, variant };
    }
    if (activeDialog.kind === 'confirm') {
      const destructive = activeDialog.options.destructive ?? true;
      return {
        title: activeDialog.options.title ?? 'Confirmar acción',
        variant: (destructive ? 'warning' : 'info') as FeedbackVariant,
      };
    }
    return {
      title: activeDialog.options.title ?? 'Ingresar dato',
      variant: 'info' as FeedbackVariant,
    };
  };

  const meta = getDialogMeta();

  return (
    <UiFeedbackContext.Provider value={{ toast, showAlert, confirmAction, promptInput }}>
      {children}

      <dialog
        ref={dialogRef}
        className="ui-feedback-dialog"
        {...({ closedby: 'any' } as Record<string, string>)}
        aria-labelledby="ui-feedback-dialog-title"
      >
        {activeDialog && (
          <div className="card ui-feedback-card">
            <div className="ui-feedback-header">
              <div className="ui-feedback-title-row">
                <span className={`ui-feedback-icon-badge ui-feedback-icon-badge--${meta.variant}`}>
                  {renderBadgeIcon(meta.variant)}
                </span>
                <h2 id="ui-feedback-dialog-title" className="ui-feedback-title">
                  {meta.title}
                </h2>
              </div>
              <button
                type="button"
                className="ui-feedback-close-btn"
                aria-label="Cerrar aviso"
                onClick={handleCancelClick}
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            {activeDialog.kind !== 'prompt' ? (
              <>
                <p className="ui-feedback-message">{activeDialog.message}</p>
                <div className="ui-feedback-actions">
                  {activeDialog.kind === 'confirm' && (
                    <button
                      type="button"
                      autoFocus={activeDialog.options.destructive !== false}
                      className="ui-feedback-btn-secondary"
                      onClick={handleCancelClick}
                    >
                      {activeDialog.options.cancelLabel ?? 'Cancelar'}
                    </button>
                  )}
                  <button
                    type="button"
                    autoFocus={activeDialog.kind === 'alert' || activeDialog.options.destructive === false}
                    className={
                      activeDialog.kind === 'confirm' && activeDialog.options.destructive !== false
                        ? 'ui-feedback-btn-danger'
                        : 'ui-feedback-btn-primary'
                    }
                    onClick={handleConfirmSubmit}
                  >
                    {activeDialog.kind === 'alert'
                      ? activeDialog.options.confirmLabel ?? 'Entendido'
                      : activeDialog.options.confirmLabel ?? 'Confirmar'}
                  </button>
                </div>
              </>
            ) : (
              <PromptDialogForm
                key={activeDialog.id}
                message={activeDialog.message}
                options={activeDialog.options}
                isMobile={isMobile}
                onCancel={handleCancelClick}
                onSubmit={(val) => settleActiveDialog(true, val)}
              />
            )}
          </div>
        )}
      </dialog>

      <div role="region" aria-label="Avisos del sistema" className="ui-feedback-toast-region">
        <div
          ref={toastRef}
          popover="manual"
          role={toastData?.variant === 'error' ? 'alert' : 'status'}
          aria-live={toastData?.variant === 'error' ? 'assertive' : 'polite'}
          className={`ui-feedback-toast ui-feedback-toast--${toastData?.variant ?? 'info'} ${!supportsPopover && toastData && !activeDialog ? 'ui-feedback-toast--fallback-open' : ''}`}
          onMouseEnter={() => {
            if (toastTimerRef.current !== null) {
              window.clearTimeout(toastTimerRef.current);
              toastTimerRef.current = null;
            }
          }}
          onMouseLeave={() => {
            if (toastData) scheduleToastHide(2600);
          }}
          onFocus={() => {
            if (toastTimerRef.current !== null) {
              window.clearTimeout(toastTimerRef.current);
              toastTimerRef.current = null;
            }
          }}
          onBlur={() => {
            if (toastData) scheduleToastHide(2600);
          }}
        >
          <div className="ui-feedback-toast-body">
            {toastData && renderBadgeIcon(toastData.variant)}
            <span>{toastData?.message}</span>
          </div>
          <button
            type="button"
            className="ui-feedback-toast-close"
            onClick={dismissToast}
            aria-label="Cerrar notificación"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
      </div>
    </UiFeedbackContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useFeedback = () => {
  const ctx = useContext(UiFeedbackContext);
  if (!ctx) {
    throw new Error('useFeedback must be used within UiFeedbackProvider');
  }
  return ctx;
};
