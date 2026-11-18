import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import './VersionNotifier.css';

export default function VersionNotifier() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [initialSignature, setInitialSignature] = useState<string | null>(null);

  const getAssetsSignature = (html: string) => {
    // Buscamos patrones de archivos con hash que genera Vite: index-HASH.js, index-HASH.css
    // IMPORTANTE: Vite usa letras mayúsculas, minúsculas, números, y guiones `[a-zA-Z0-9_-]`
    const scriptMatches = html.match(/src="\/assets\/[a-zA-Z0-9_-]+\.js"/g) || [];
    const linkMatches = html.match(/href="\/assets\/[a-zA-Z0-9_-]+\.css"/g) || [];
    // También incluimos el título por si acaso
    const titleMatch = html.match(/<title>(.*?)<\/title>/) || [];
    
    return [...scriptMatches, ...linkMatches, ...titleMatch].join('|');
  };

  const checkForUpdates = async () => {
    if (localStorage.getItem('agrogestion_modo_campo') === 'true') return;
    try {
      const response = await fetch(`/?v=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) return;
      
      const html = await response.text();
      const serverSignature = getAssetsSignature(html);

      if (!serverSignature) return;

      if (initialSignature === null) {
        setInitialSignature(serverSignature);
      } else if (serverSignature !== initialSignature) {
        setUpdateAvailable(true);
      }
    } catch (e) {
      console.warn("Error al verificar actualizaciones:", e);
    }
  };

  useEffect(() => {
    // Primera verificación para capturar el estado inicial
    checkForUpdates();

    // Verificar cada 5 minutos
    const interval = setInterval(checkForUpdates, 1000 * 60 * 5);
    
    // Verificar cuando el usuario vuelve a la pestaña
    const handleFocus = () => checkForUpdates();
    window.addEventListener('focus', handleFocus);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
    };
  }, [initialSignature]);

  if (!updateAvailable) return null;

  return (
    <div className="version-popup" role="status" aria-live="polite">
      <div style={{ display: 'flex', gap: '16px' }}>
        <div style={{ 
          backgroundColor: 'var(--success-soft-bg)', 
          borderRadius: '14px', 
          width: '52px', 
          height: '52px', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          flexShrink: 0,
          border: '1px solid var(--success-soft-border)'
        }}>
          <RefreshCw className="animate-spin-custom" size={26} color="var(--success)" aria-hidden="true" />
        </div>
        
        <div style={{ flex: 1 }}>
          <h4 style={{ margin: '0 0 6px 0', fontSize: '1.05rem', fontWeight: '700', letterSpacing: '-0.3px', color: 'var(--text-main)' }}>
            Actualización Lista
          </h4>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.88rem', lineHeight: '1.45' }}>
            Hemos realizado mejoras en Agrogestión. Refresca ahora para activarlas.
          </p>
        </div>
      </div>

      <div className="version-popup-actions">
        <button 
          type="button"
          onClick={() => window.location.reload()}
          className="version-popup-btn-refresh"
        >
          Refrescar Ahora
        </button>
        <button 
          type="button"
          onClick={() => setUpdateAvailable(false)}
          className="version-popup-btn-later"
        >
          Después
        </button>
      </div>
    </div>
  );
}
