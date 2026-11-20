import { useEffect, useState } from 'react';
import { Bell, BellOff, Download, Loader2, Send, Smartphone, AlertTriangle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useFeedback } from '../contexts/UiFeedbackContext';
import {
  disablePushOnThisDevice,
  enablePushOnThisDevice,
  getDevicePushStatus,
  sendTestPushNotification,
  updateDevicePushPreferences,
  type DevicePushStatus,
  type PushPreferences,
} from '../lib/pushNotifications';
import './PushNotificationsCard.css';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const INITIAL_STATUS: DevicePushStatus = {
  supported: false,
  isIos: false,
  isStandalone: false,
  needsIosHomeScreenInstall: false,
  permission: 'unsupported',
  subscribedInBrowser: false,
  endpoint: null,
  preferences: {
    enabled: false,
    daily_digest_enabled: true,
    realtime_events_enabled: true,
    notify_own_actions: false,
  },
};

export default function PushNotificationsCard() {
  const { user } = useAuth();
  const { toast } = useFeedback();

  const [status, setStatus] = useState<DevicePushStatus>(INITIAL_STATUS);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [savingMaster, setSavingMaster] = useState(false);
  const [savingPref, setSavingPref] = useState(false);
  const [testingPush, setTestingPush] = useState(false);

  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installingApp, setInstallingApp] = useState(false);
  const [installStatusMsg, setInstallStatusMsg] = useState('');

  const supportsWebInstall =
    typeof Navigator !== 'undefined' &&
    typeof (Navigator.prototype as Navigator & { install?: () => Promise<void> }).install === 'function';

  // Cargar polyfill de <input type="checkbox" switch> solo cuando el navegador no lo soporta nativamente
  useEffect(() => {
    if (typeof window !== 'undefined' && !('switch' in HTMLInputElement.prototype)) {
      void import('input-switch-polyfill/input-switch-polyfill.css');
      void import('input-switch-polyfill');
    }
  }, []);

  // Capturar beforeinstallprompt para ofrecer instalación PWA si el navegador la permite
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferredInstallPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall);
  }, []);

  useEffect(() => {
    let active = true;
    const loadStatus = async () => {
      const res = await getDevicePushStatus(user?.id);
      if (!active) return;
      setStatus(res);
      setLoadingStatus(false);
    };
    void loadStatus();
    return () => {
      active = false;
    };
  }, [user?.id]);

  const handleToggleMaster = async (nextChecked: boolean) => {
    if (savingMaster) return;
    setSavingMaster(true);
    try {
      if (nextChecked) {
        const nextStatus = await enablePushOnThisDevice({
          daily_digest_enabled: status.preferences.daily_digest_enabled,
          realtime_events_enabled: status.preferences.realtime_events_enabled,
          notify_own_actions: status.preferences.notify_own_actions,
        });
        setStatus(nextStatus);
        toast('Notificaciones activadas en este celular.', 'success');
      } else {
        await disablePushOnThisDevice(status.endpoint);
        setStatus((prev) => ({
          ...prev,
          preferences: { ...prev.preferences, enabled: false },
        }));
        toast('Notificaciones pausadas en este celular.', 'info');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo actualizar la suscripción push.';
      toast(msg, 'error');
      const refreshed = await getDevicePushStatus(user?.id);
      setStatus(refreshed);
    } finally {
      setSavingMaster(false);
    }
  };

  const handlePrefChange = async (
    key: keyof Omit<PushPreferences, 'enabled'>,
    value: boolean
  ) => {
    if (!status.endpoint || savingPref || !status.preferences.enabled) return;
    const prevPrefs = status.preferences;
    const nextPrefs: PushPreferences = { ...prevPrefs, [key]: value };
    setStatus((prev) => ({ ...prev, preferences: nextPrefs }));
    setSavingPref(true);
    try {
      await updateDevicePushPreferences(status.endpoint, nextPrefs);
    } catch (err) {
      setStatus((prev) => ({ ...prev, preferences: prevPrefs }));
      const msg = err instanceof Error ? err.message : 'Error guardando preferencia.';
      toast(msg, 'error');
    } finally {
      setSavingPref(false);
    }
  };

  const handleTestPush = async () => {
    if (testingPush) return;
    setTestingPush(true);
    try {
      await sendTestPushNotification(status.endpoint);
      toast('Notificación de prueba enviada. Revisa tu celular.', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo enviar la notificación de prueba.';
      toast(msg, 'error');
    } finally {
      setTestingPush(false);
    }
  };

  const handleInstallPwa = async () => {
    if (installingApp) return;
    setInstallingApp(true);
    try {
      const navWithInstall = navigator as Navigator & { install?: () => Promise<void> };
      if (supportsWebInstall && navWithInstall.install) {
        await navWithInstall.install();
        setInstallStatusMsg('Aplicación instalada o abierta en tu dispositivo.');
      } else if (deferredInstallPrompt) {
        const promptEvent = deferredInstallPrompt;
        setDeferredInstallPrompt(null);
        await promptEvent.prompt();
        const { outcome } = await promptEvent.userChoice;
        setInstallStatusMsg(
          outcome === 'accepted'
            ? 'Aplicación agregada a tu pantalla de inicio.'
            : 'Instalación cancelada.'
        );
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setInstallStatusMsg('Instalación cancelada.');
      } else {
        setInstallStatusMsg('No fue posible iniciar la instalación automática.');
      }
    } finally {
      setInstallingApp(false);
    }
  };

  const isMasterEnabled = status.preferences.enabled && status.permission === 'granted';
  const showInstallBtn = !status.isStandalone && (supportsWebInstall || Boolean(deferredInstallPrompt));

  return (
    <div className="push-card-divider">
      <div className="push-card-header">
        <div>
          <h3 className="push-card-heading">
            <Bell size={19} color="var(--primary)" aria-hidden="true" />
            <span>Notificaciones en este celular (PWA)</span>
          </h3>
          <p className="settings-helper-text" style={{ margin: '4px 0 0' }}>
            Recibe avisos del sistema operativo en este dispositivo aunque la aplicación esté cerrada.
          </p>
        </div>

        {!loadingStatus && (
          <span
            className={`push-card-badge ${
              status.permission === 'denied'
                ? 'push-card-badge--blocked'
                : isMasterEnabled
                ? 'push-card-badge--active'
                : 'push-card-badge--inactive'
            }`}
          >
            {isMasterEnabled ? <Bell size={13} aria-hidden="true" /> : <BellOff size={13} aria-hidden="true" />}
            {status.permission === 'denied'
              ? 'Bloqueadas'
              : isMasterEnabled
              ? 'Activas'
              : 'Inactivas'}
          </span>
        )}
      </div>

      {loadingStatus ? (
        <div className="push-card-banner push-card-banner--info" role="status">
          <Loader2 size={18} className="animate-spin" aria-hidden="true" />
          <span>Comprobando compatibilidad y estado de notificaciones en este dispositivo...</span>
        </div>
      ) : status.needsIosHomeScreenInstall ? (
        <div className="push-card-banner push-card-banner--info">
          <Smartphone size={20} color="var(--info)" style={{ flexShrink: 0, marginTop: '2px' }} aria-hidden="true" />
          <div>
            <strong>Para activar notificaciones en iPhone / iPad:</strong>
            <div style={{ marginTop: '4px' }}>
              1. Toca el botón <strong>Compartir</strong> en Safari y elige <strong>&ldquo;Agregar a inicio&rdquo;</strong>.
              <br />
              2. Abre AgroGestión desde el ícono nuevo en tu pantalla y activa este interruptor.
            </div>
          </div>
        </div>
      ) : !status.supported ? (
        <div className="push-card-banner push-card-banner--warning">
          <AlertTriangle size={18} color="var(--warning)" style={{ flexShrink: 0, marginTop: '2px' }} aria-hidden="true" />
          <span>
            Este navegador o entorno no soporta Web Push. Abre AgroGestión en Chrome (Android / escritorio) o Safari instalado en Pantalla de Inicio (iPhone) para activarlas.
          </span>
        </div>
      ) : (
        <>
          {status.permission === 'denied' && (
            <div className="push-card-banner push-card-banner--warning" role="alert">
              <AlertTriangle size={18} color="var(--warning)" style={{ flexShrink: 0, marginTop: '2px' }} aria-hidden="true" />
              <span>
                El permiso de notificaciones está bloqueado en este navegador. Toca el ícono de ajustes/candado en la barra de dirección, permite <strong>Notificaciones</strong> y recarga la página.
              </span>
            </div>
          )}

          <div className="push-card-switch-list">
            <label
              htmlFor="push-enabled-switch"
              className="push-card-switch-row push-card-switch-row--master"
              data-disabled={savingMaster || status.permission === 'denied'}
            >
              <span className="push-card-switch-copy">
                <span className="push-card-switch-title">Recibir notificaciones en este celular</span>
                <span className="push-card-switch-desc">
                  Activa las alertas nativas para tu cuenta en este dispositivo.
                </span>
              </span>
              <input
                id="push-enabled-switch"
                type="checkbox"
                {...({ switch: '' } as React.InputHTMLAttributes<HTMLInputElement>)}
                className="push-switch-input"
                checked={isMasterEnabled}
                disabled={savingMaster || status.permission === 'denied'}
                onChange={(e) => void handleToggleMaster(e.target.checked)}
              />
            </label>

            {isMasterEnabled && (
              <>
                <label
                  htmlFor="push-daily-switch"
                  className="push-card-switch-row"
                  data-disabled={savingPref}
                >
                  <span className="push-card-switch-copy">
                    <span className="push-card-switch-title">Barrido diario (6:30 a.m. Colombia)</span>
                    <span className="push-card-switch-desc">
                      Cambios de potrero, pesajes &gt; 90 días, pérdidas de peso, lotes para despacho, lluvias/clima y licencia.
                    </span>
                  </span>
                  <input
                    id="push-daily-switch"
                    type="checkbox"
                    {...({ switch: '' } as React.InputHTMLAttributes<HTMLInputElement>)}
                    className="push-switch-input"
                    checked={status.preferences.daily_digest_enabled}
                    disabled={savingPref}
                    onChange={(e) => void handlePrefChange('daily_digest_enabled', e.target.checked)}
                  />
                </label>

                <label
                  htmlFor="push-realtime-switch"
                  className="push-card-switch-row"
                  data-disabled={savingPref}
                >
                  <span className="push-card-switch-copy">
                    <span className="push-card-switch-title">Eventos del equipo en tiempo real</span>
                    <span className="push-card-switch-desc">
                      Ventas, compras, reporte al ingresar lluvias del día y resúmenes de jornadas de pesajes.
                    </span>
                  </span>
                  <input
                    id="push-realtime-switch"
                    type="checkbox"
                    {...({ switch: '' } as React.InputHTMLAttributes<HTMLInputElement>)}
                    className="push-switch-input"
                    checked={status.preferences.realtime_events_enabled}
                    disabled={savingPref}
                    onChange={(e) => void handlePrefChange('realtime_events_enabled', e.target.checked)}
                  />
                </label>

                <label
                  htmlFor="push-own-actions-switch"
                  className="push-card-switch-row"
                  data-disabled={savingPref}
                >
                  <span className="push-card-switch-copy">
                    <span className="push-card-switch-title">Incluir mis propios registros</span>
                    <span className="push-card-switch-desc">
                      Útil si registras datos en el computador y quieres ver los reportes en este celular.
                    </span>
                  </span>
                  <input
                    id="push-own-actions-switch"
                    type="checkbox"
                    {...({ switch: '' } as React.InputHTMLAttributes<HTMLInputElement>)}
                    className="push-switch-input"
                    checked={status.preferences.notify_own_actions}
                    disabled={savingPref}
                    onChange={(e) => void handlePrefChange('notify_own_actions', e.target.checked)}
                  />
                </label>
              </>
            )}
          </div>

          {(isMasterEnabled || showInstallBtn) && (
            <div className="push-card-actions">
              {isMasterEnabled && (
                <button
                  type="button"
                  className="push-card-btn-secondary"
                  onClick={() => void handleTestPush()}
                  disabled={testingPush}
                >
                  {testingPush ? (
                    <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                  ) : (
                    <Send size={16} aria-hidden="true" />
                  )}
                  {testingPush ? 'Enviando prueba...' : 'Enviar notificación de prueba'}
                </button>
              )}

              {showInstallBtn && (
                <button
                  type="button"
                  className="push-card-btn-secondary"
                  aria-disabled={installingApp ? 'true' : undefined}
                  onClick={() => void handleInstallPwa()}
                >
                  <Download size={16} aria-hidden="true" />
                  Instalar AgroGestión como App
                </button>
              )}
            </div>
          )}

          {installStatusMsg && (
            <p role="status" className="push-card-install-status">
              {installStatusMsg}
            </p>
          )}
        </>
      )}
    </div>
  );
}
