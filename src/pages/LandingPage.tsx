import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import './LandingPage.css';

// ─── SEO: Datos estructurados JSON-LD ────────────────────────
// Google muestra las FAQ como Rich Results directamente en búsqueda
// El SoftwareApplication le dice a Google/Bing/IAs qué es AgroGestión
const FAQ_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: '¿De verdad funciona sin internet en la finca?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Sí. AgroGestión es una PWA (Progressive Web App) que opera 100% sin señal celular. Pesajes, registros de lluvia y rotaciones se guardan localmente y se sincronizan con la nube en cuanto hay conexión. Funciona en el tubo del corral o en el potrero más alejado sin depender de señal.',
      },
    },
    {
      '@type': 'Question',
      name: '¿Qué es el semáforo GDP y cómo me ayuda a ganar dinero?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'El semáforo de Ganancia Diaria de Peso (GDP en kg/día) muestra en color verde, amarillo o rojo si cada animal está rindiendo, estancado o perdiendo peso entre pesajes. Identifica qué animales están consumiendo pastura sin generar rentabilidad para tomar decisiones de descarte a tiempo.',
      },
    },
    {
      '@type': 'Question',
      name: '¿Qué pasa si el mayordomo o el vaquero cambian de trabajo?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Con AgroGestión, la información de la finca NO se va con la persona. Cada pesaje, rotación de potrero y milímetro de lluvia queda registrado en la nube, protegido y accesible desde cualquier dispositivo.',
      },
    },
    {
      '@type': 'Question',
      name: '¿De dónde obtienen los precios de las subastas ganaderas?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Los precios se obtienen de las principales subastas de Colombia en tiempo real: Sugaberrío, Subastar, Suganar y Central Ganadera. Puede consultar precios por categoría y región para saber cuánto vale su inventario en pie hoy.',
      },
    },
    {
      '@type': 'Question',
      name: '¿Necesito comprar básculas o equipos especiales?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'No. AgroGestión funciona con cualquier báscula tradicional del corral. Simplemente ingrese el peso en la app desde el celular. No requiere hardware especial, Bluetooth ni equipos adicionales. Funciona en Android, iPhone, tablet o computador.',
      },
    },
  ],
};

const APP_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'AgroGestión',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Android, iOS, Windows, macOS',
  url: 'https://www.appagrogestion.com',
  description: 'Software ganadero para Colombia. Control de inventario bovino, pesaje con ganancia diaria de peso (GDP), rotación de potreros con mapas satelitales KMZ/KML, aforos de pasturas, precios de subastas en tiempo real (Sugaberrío, Subastar, Suganar, Central Ganadera) y pluviometría. Funciona 100% sin internet.',
  offers: [
    { '@type': 'Offer', name: 'Plan Demo', price: '0', priceCurrency: 'COP', description: 'Gratis hasta 40 animales' },
    { '@type': 'Offer', name: 'Plan Finca', price: '80000', priceCurrency: 'COP', description: 'Hasta 500 animales, desde $80.000/mes' },
    { '@type': 'Offer', name: 'Plan Hacienda', price: '180000', priceCurrency: 'COP', description: 'Animales ilimitados, desde $180.000/mes' },
  ],
  featureList: [
    'Control de inventario bovino y trazabilidad individual por chapeta',
    'Pesaje bovino con semáforo GDP offline',
    'Rotación de potreros con mapa satelital KMZ/KML',
    'Aforos de pasturas y cálculo de UGG/ha',
    'Precios de subastas Sugaberrío, Subastar, Suganar, Central Ganadera',
    'Pluviómetro y diagnóstico agroclimático',
    'Exportación a Excel y CSV',
    'PWA instalable en Android e iOS',
  ],
  inLanguage: 'es-CO',
  availableCountry: 'CO',
  provider: {
    '@type': 'Organization',
    name: 'AgroGestión',
    url: 'https://www.appagrogestion.com',
    contactPoint: { '@type': 'ContactPoint', contactType: 'customer support', email: 'soporte@appagrogestion.com' },
  },
};

type Periodicidad = 'mensual' | 'semestral' | 'anual';

const LeafIcon = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#60ad5e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 3.5 1.08 9.2a7 7 0 0 1-9.08 8.8Z" />
    <path d="M11 20c-1.23-.3-2.4-1.53-3-3" />
  </svg>
);

const CheckIcon = ({ color = '#60ad5e' }: { color?: string }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

const WhatsAppIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/>
  </svg>
);

const WA_NUMBER = 'fedejaramilloo';

const planes = [
  {
    id: 'demo',
    nombre: 'Plan Demo',
    badge: 'Gratuito',
    limite: 'Hasta 40 animales',
    color: '#ffb74d',
    border: 'rgba(255, 183, 77, 0.3)',
    bg: 'rgba(255, 183, 77, 0.05)',
    caracteristicas: [
      'Hasta 40 animales activos',
      '1 finca autorizada',
      'Carga de plano KMZ/KML (Vista previa de potreros y areas)',
      'Precios de mercado (Nivel Nacional)',
      'Pesaje y control de pastoreo',
      'Reportes zootecnicos basicos',
    ],
  },
  {
    id: 'finca',
    nombre: 'Plan Finca',
    badge: 'Mas Popular',
    limite: 'Hasta 500 animales',
    color: '#38bdf8',
    border: 'rgba(56, 189, 248, 0.4)',
    bg: 'rgba(56, 189, 248, 0.08)',
    popular: true,
    caracteristicas: [
      'Acceso a AgroBot (IA Mentora)',
      'Hasta 500 animales activos',
      'Plano interactivo con Lotes, Pesos promedio y Dias de ocupacion',
      'Traslado rapido de ganado entre potreros desde el mapa',
      'Precios de mercado regionales (Subastas en tiempo real)',
      'Historial y tendencias de precios ganaderos',
      '1 vaquero + 1 observador/visualizador',
      'Calculo de GDP e indicadores KPI',
      'Exportacion de datos a Excel/CSV',
    ],
  },
  {
    id: 'premium',
    nombre: 'Plan Hacienda',
    badge: 'Empresarial',
    limite: 'Animales Ilimitados',
    color: '#c084fc',
    border: 'rgba(192, 132, 252, 0.4)',
    bg: 'rgba(192, 132, 252, 0.08)',
    caracteristicas: [
      'Animales activos ilimitados',
      'Geolocalizacion GPS en campo sobre el plano en tiempo real',
      'Deteccion automatica de potrero con metricas zootecnicas en vivo',
      'Plano satelital multi-finca interactivo completo',
      'Valoracion Patrimonial del Inventario Vivo en tiempo real',
      'Precios de mercado regionales e historicos',
      'Dashboard Consolidado Multi-Finca',
      'Traslados Inter-Fincas con 1 clic',
      'Roles y usuarios ilimitados',
      'AgroBot Empresarial con soporte prioritario',
    ],
  },
];

const pricingData: Record<string, Record<Periodicidad, { precio: string; subprecio: string; ahorroTag?: string }>> = {
  demo: {
    mensual: { precio: 'Gratis', subprecio: 'Siempre, sin limite de tiempo' },
    semestral: { precio: 'Gratis', subprecio: 'Siempre, sin limite de tiempo' },
    anual: { precio: 'Gratis', subprecio: 'Siempre, sin limite de tiempo' },
  },
  finca: {
    mensual: { precio: '$80.000', subprecio: '$/mes cobro mensual' },
    semestral: { precio: '$70.000', subprecio: '$/mes - $420.000 cobro semestral', ahorroTag: 'Ahorras $60.000' },
    anual: { precio: '$60.000', subprecio: '$/mes - $720.000 cobro anual', ahorroTag: 'Ahorras $240.000 - 25% OFF' },
  },
  premium: {
    mensual: { precio: '$180.000', subprecio: '$/mes cobro mensual' },
    semestral: { precio: '$165.000', subprecio: '$/mes - $990.000 cobro semestral', ahorroTag: 'Ahorras $90.000' },
    anual: { precio: '$150.000', subprecio: '$/mes - $1.800.000 cobro anual', ahorroTag: 'Ahorras $360.000 - 16% OFF' },
  },
};

const faqs = [
  {
    q: 'De verdad funciona sin internet en la finca?',
    a: 'Si. AgroGestion es una PWA (Progressive Web App) que opera 100% sin señal celular. Pesajes, registros de lluvia y rotaciones se guardan localmente en el dispositivo y se sincronizan automaticamente con la nube en cuanto hay conexion. Puede trabajar en el tubo del corral o en el potrero mas alejado sin depender de una sola barra de señal.',
  },
  {
    q: 'Que es el semaforo GDP y como me ayuda a ganar dinero?',
    a: 'El semaforo de Ganancia Diaria de Peso (GDP en kg/dia) muestra en color (verde, amarillo o rojo) si cada animal esta rindiendo, estancado o perdiendo peso entre pesajes. Identifica al instante que animales estan consumiendo pastura sin generar rentabilidad, para tomar decisiones de descarte a tiempo y sin depender del ojo del vaquero.',
  },
  {
    q: 'Que pasa si el mayordomo o el vaquero cambian de trabajo?',
    a: 'Con AgroGestion, la informacion de la finca NO se va con la persona. Cada pesaje, rotacion de potrero y milimetro de lluvia queda registrado en la nube, protegido y accesible desde cualquier dispositivo. El historial productivo de su inversion permanece con usted siempre.',
  },
  {
    q: 'De donde obtienen los precios de las subastas ganaderas?',
    a: 'Los precios se obtienen de las principales subastas de Colombia en tiempo real: Sugaberrio, Subastar, Suganar y Central Ganadera. Puede consultar precios por categoria (macho ceba, hembra, levante) y region para saber exactamente cuanto vale su inventario en pie hoy.',
  },
  {
    q: 'Necesito comprar basculas o equipos especiales?',
    a: 'No. AgroGestion funciona con cualquier bascula tradicional del corral. Simplemente ingresa el peso que marco su bascula en la app desde el celular. No requiere integracion de hardware, Bluetooth ni equipos adicionales. Funciona en cualquier Android, iPhone, tablet o computador.',
  },
];

const modulos = [
  {
    icon: '📋',
    titulo: 'Inventario Bovino y Control de Hato',
    desc: 'Control individual por numero de chapeta, lote, etapa productiva (cria, levante, ceba) y estado reproductivo. Trazabilidad completa desde el ingreso hasta la venta con alertas de permanencia.',
    color: '#a78bfa',
  },
  {
    icon: '⚖️',
    titulo: 'Pesaje Bovino con Semaforo GDP',
    desc: 'Registra lotes de pesaje y visualiza al instante la Ganancia Diaria de Peso (kg/dia) por animal y por lote. El semaforo verde/amarillo/rojo elimina el "manejo al ojo" y protege su margen de rentabilidad.',
    color: '#22c55e',
  },
  {
    icon: '🗺️',
    titulo: 'Rotacion de Potreros con Mapa Satelital',
    desc: 'Cargue su plano KMZ/KML, visualice sus potreros sobre imagen satelital y controle dias de ocupacion, peso promedio por potrero y traslados de ganado con un solo clic. Calcule UGG/ha en tiempo real.',
    color: '#38bdf8',
  },
  {
    icon: '🌿',
    titulo: 'Aforos de Pasturas y Capacidad Forrajera',
    desc: 'Registre aforos de forraje por potrero, calcule la oferta forrajera disponible y planifique la carga animal optima para no sobrepastar ni desperdiciar produccion de pasto.',
    color: '#4ade80',
  },
  {
    icon: '📈',
    titulo: 'Precios de Subastas en Vivo',
    desc: 'Consulte precios actualizados de Sugaberrio, Subastar, Suganar y Central Ganadera. Conozca el valor de su inventario en pie hoy y tome decisiones de venta con informacion real del mercado.',
    color: '#fbbf24',
  },
  {
    icon: '🌧️',
    titulo: 'Pluviometro y Diagnostico Agroclimatico',
    desc: 'Registre lluvias diarias por finca, consulte historicos de precipitaciones y reciba diagnosticos agroclimaticos generados por IA para anticipar epocas criticas de sequia o exceso hidrico.',
    color: '#67e8f9',
  },
];

export default function LandingPage() {
  const [periodicidad, setPeriodicidad] = useState<Periodicidad>('anual');
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // SEO: Actualiza el título y la meta description al entrar a la landing
  // e inyecta los JSON-LD adicionales (FAQ y SoftwareApplication) en el <head>
  useEffect(() => {
    // Título optimizado para buscadores
    document.title = 'AgroGestión — Software Ganadero para Colombia | Pesaje Bovino, Rotación de Potreros y Subastas';

    // Meta description actualizada para la landing
    let metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      metaDesc.setAttribute('content', 'Software ganadero para Colombia. Control de inventario bovino, pesaje con semáforo GDP, rotación de potreros con mapa satelital KMZ/KML, aforos de pasturas y precios de subastas (Sugaberrío, Subastar, Suganar). Funciona 100% sin internet. Prueba gratis hasta 40 animales.');
    }

    // Inyecta JSON-LD de FAQPage para Rich Results en Google
    const faqScript = document.createElement('script');
    faqScript.type = 'application/ld+json';
    faqScript.id = 'lp-faq-schema';
    faqScript.text = JSON.stringify(FAQ_SCHEMA);
    document.head.appendChild(faqScript);

    // Inyecta JSON-LD de SoftwareApplication con precios para Bing/Google
    const appScript = document.createElement('script');
    appScript.type = 'application/ld+json';
    appScript.id = 'lp-app-schema';
    appScript.text = JSON.stringify(APP_SCHEMA);
    document.head.appendChild(appScript);

    return () => {
      // Limpia los scripts al salir de la landing
      document.getElementById('lp-faq-schema')?.remove();
      document.getElementById('lp-app-schema')?.remove();
    };
  }, []);

  return (
    <div className="lp-root">
      {/* NAVBAR */}
      <nav className="lp-nav">
        <div className="lp-nav-inner">
          <a href="#inicio" className="lp-logo">
            <LeafIcon />
            <span>AgroGestion</span>
          </a>
          <button className="lp-hamburger" onClick={() => setMenuOpen(!menuOpen)} aria-label="Menu">
            <span /><span /><span />
          </button>
          <div className={`lp-nav-links ${menuOpen ? 'open' : ''}`}>
            <a href="#por-que" onClick={() => setMenuOpen(false)}>Por Que</a>
            <a href="#modulos" onClick={() => setMenuOpen(false)}>Modulos</a>
            <a href="#precios" onClick={() => setMenuOpen(false)}>Precios</a>
            <a href="#faq" onClick={() => setMenuOpen(false)}>FAQ</a>
            <a href="#contacto" onClick={() => setMenuOpen(false)}>Contacto</a>
          </div>
          <div className="lp-nav-actions">
            <Link to="/login" className="lp-btn-ghost">Iniciar Sesion</Link>
            <Link to="/login" className="lp-btn-primary">Prueba Gratis</Link>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section id="inicio" className="lp-hero">
        <div className="lp-hero-bg-glow" />
        <div className="lp-container">
          <div className="lp-hero-inner">
            <div className="lp-hero-text">
              <div className="lp-hero-tag">Colombia - AgroGestion - Ganaderia de Precision</div>
              <h1 className="lp-hero-title">
                De la Libreta de Bolsillo a la{' '}
                <span className="lp-text-green">Empresa Ganadera Inteligente</span>
              </h1>
              <p className="lp-hero-desc">
                Si ese cuaderno se moja en un aguacero, se extravia en el ajetreo del corral
                o el vaquero decide cambiar de rumbo, donde queda el historial de su inversion?
                AgroGestion blinda cada kilo, cada milimetro de lluvia y cada rotacion de potrero
                como un activo digital permanente. <strong>100% sin internet en el campo.</strong>
              </p>
              <div className="lp-hero-cta">
                <Link to="/login" className="lp-btn-primary lp-btn-lg">
                  Empezar Prueba Gratis - Hasta 40 Animales
                </Link>
                <a
                  href={`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent('Hola, quiero conocer mas sobre AgroGestion para mi finca.')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="lp-btn-ghost lp-btn-lg"
                >
                  <WhatsAppIcon /> Hablar con un Asesor
                </a>
              </div>
              <div className="lp-hero-pills">
                <span>100% Sin Internet en Campo</span>
                <span>Calculo UGG y GDP</span>
                <span>Precios Subastas en Vivo</span>
                <span>IA Zootecnica 24/7</span>
              </div>
            </div>

            <div className="lp-hero-visual">
              <img
                src="/hero-visual.jpg"
                alt="De la libreta del mayordomo al dashboard digital de AgroGestión — pesaje bovino GDP, rotación de potreros, precios Sugaberrío"
                className="lp-hero-img"
                width="600"
                height="450"
                loading="eager"
              />
            </div>
          </div>
        </div>
      </section>

      {/* MANIFIESTO */}
      <section id="por-que" className="lp-section lp-manifesto">
        <div className="lp-container">
          <div className="lp-manifesto-quote">
            <div className="lp-quote-marks">"</div>
            <blockquote>
              El ganado se cuida en el potrero, pero la ganancia se defiende en los datos.
            </blockquote>
            <cite>Principio Gerencial AgroGestion</cite>
          </div>

          <div className="lp-principles-grid">
            <div className="lp-principle-card">
              <div className="lp-principle-num green">01</div>
              <h3>Blindar y Democratizar la Informacion</h3>
              <p>
                Cada kilo pesado en la bascula, cada milimetro de lluvia registrado y cada
                rotacion de potrero deja de ser un apunte suelto para convertirse en un{' '}
                <strong>activo digital permanente</strong>, seguro y accesible en tiempo real,
                incluso sin señal celular.
              </p>
              <div className="lp-principle-chips">
                <span>Offline First</span>
                <span>PWA Instalable</span>
                <span>Cero Perdida de Datos</span>
              </div>
            </div>
            <div className="lp-principle-card">
              <div className="lp-principle-num gold">02</div>
              <h3>Transformar Datos en Kilos de Carne y Rentabilidad</h3>
              <p>
                Una bascula no sirve solo para saber cuanto pesa un lote hoy. Sirve para saber{' '}
                <strong>cuanto cuesta producir cada kilo</strong>, que potreros estan sosteniendo
                la carga animal (UGG/ha) y que animales estan perdiendo dinero silenciosamente en el lote.
              </p>
              <div className="lp-principle-chips">
                <span>Semaforo GDP</span>
                <span>Carga Animal UGG/ha</span>
                <span>Alertas de Descarte</span>
              </div>
            </div>
          </div>

          <div className="lp-compare-table">
            <div className="lp-compare-col traditional">
              <h4>Finca Tradicional</h4>
              <ul>
                <li>Historial en libreta de papel — se moja, se pierde</li>
                <li>Si el mayordomo se va, se va la informacion</li>
                <li>Decisiones al ojo sin datos de GDP</li>
                <li>Sin visibilidad de cuanto cuesta cada kilo</li>
                <li>Precios de subasta de oido o con dias de retraso</li>
                <li>Sin saber que potrero esta siendo sobreexplotado</li>
              </ul>
            </div>
            <div className="lp-compare-vs">VS</div>
            <div className="lp-compare-col modern">
              <h4>Empresa Ganadera AgroGestion</h4>
              <ul>
                <li>Datos en la nube, permanentes y seguros</li>
                <li>Informacion de la finca no depende de ninguna persona</li>
                <li>Semaforo GDP: cada animal rinde o sale</li>
                <li>Costo por kilo producido calculado automaticamente</li>
                <li>Precios de Sugaberrio, Subastar y Suganar en tiempo real</li>
                <li>Mapa de potreros con dias de ocupacion y UGG/ha</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* MODULOS */}
      <section id="modulos" className="lp-section">
        <div className="lp-container">
          <div className="lp-section-header">
            <span className="lp-section-tag">Modulos del Sistema</span>
            <h2>Todo lo que su finca necesita en un solo lugar</h2>
            <p>Seis modulos integrados, disenados desde el corral para el ganadero colombiano.</p>
          </div>
          <div className="lp-modules-grid">
            {modulos.map((mod, i) => (
              <div key={i} className="lp-module-card" style={{ '--mod-color': mod.color } as React.CSSProperties}>
                <h3>{mod.titulo}</h3>
                <p>{mod.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRECIOS */}
      <section id="precios" className="lp-section lp-pricing-section">
        <div className="lp-container">
          <div className="lp-section-header">
            <span className="lp-section-tag">Planes y Precios</span>
            <h2>Transparente desde el primer dia</h2>
            <p>Sin letra pequena. Sin cobros ocultos. Empieza gratis hasta con 40 animales.</p>
          </div>

          <div className="lp-periodo-wrapper">
            <div className="lp-periodo-pills">
              {(['mensual', 'semestral', 'anual'] as Periodicidad[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`lp-periodo-btn ${periodicidad === p ? 'active' : ''}`}
                  onClick={() => setPeriodicidad(p)}
                >
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                  {p === 'semestral' && <span className="lp-periodo-badge">Ahorro</span>}
                  {p === 'anual' && <span className="lp-periodo-badge anual">Hasta 25% OFF</span>}
                </button>
              ))}
            </div>
          </div>

          <div className="lp-planes-grid">
            {planes.map((plan) => {
              const pricing = pricingData[plan.id][periodicidad];
              const isDemo = plan.id === 'demo';
              const msg = isDemo
                ? `Hola, quiero crear mi cuenta gratuita en AgroGestion.\nPlan: ${plan.nombre}`
                : `Hola, quiero el ${plan.nombre} en AgroGestion.\nPeriodicidad: ${periodicidad.charAt(0).toUpperCase() + periodicidad.slice(1)}`;
              const waLink = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`;

              return (
                <div
                  key={plan.id}
                  className={`lp-plan-card ${plan.popular ? 'popular' : ''}`}
                  style={{ background: plan.bg, border: `1.5px solid ${plan.popular ? plan.color : plan.border}` }}
                >
                  {plan.popular && <div className="lp-plan-popular-tag">Mas Popular</div>}
                  <div className="lp-plan-top">
                    <h3 className="lp-plan-name" style={{ color: plan.color }}>{plan.nombre}</h3>
                    <span className="lp-plan-badge" style={{ borderColor: plan.border, color: plan.color }}>{plan.badge}</span>
                  </div>
                  <div className="lp-plan-pricing">
                    <div className="lp-plan-price">{pricing.precio}</div>
                    <div className="lp-plan-subprice">{pricing.subprecio}</div>
                    {pricing.ahorroTag && <div className="lp-plan-ahorro">{pricing.ahorroTag}</div>}
                    <div className="lp-plan-limit" style={{ color: plan.color }}>
                      {plan.limite}
                    </div>
                  </div>
                  <ul className="lp-feature-list">
                    {plan.caracteristicas.map((c, i) => (
                      <li key={i}>
                        <CheckIcon color={plan.color} />
                        <span>{c}</span>
                      </li>
                    ))}
                  </ul>
                  <a
                    href={waLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="lp-plan-btn"
                    style={{
                      background: isDemo
                        ? 'linear-gradient(135deg, #ffb74d, #f59e0b)'
                        : plan.popular
                          ? `linear-gradient(135deg, ${plan.color}, #0ea5e9)`
                          : `linear-gradient(135deg, ${plan.color}, #7c3aed)`,
                    }}
                  >
                    <WhatsAppIcon />
                    <span>{isDemo ? 'Crear Cuenta Gratis' : `Quiero el ${plan.nombre}`}</span>
                  </a>
                </div>
              );
            })}
          </div>

          <div className="lp-activacion-card">
            <h3>Como activar mi plan?</h3>
            <p>Gestionamos la activacion mediante <strong>transferencia bancaria directa</strong>.</p>
            <div className="lp-steps-grid">
              <div className="lp-step">
                <div className="lp-step-num">1</div>
                <div className="lp-step-title">Selecciona tu plan</div>
                <div className="lp-step-desc">Plan Finca (500 animales) o Hacienda (Ilimitado), en modalidad mensual, semestral o anual.</div>
              </div>
              <div className="lp-step">
                <div className="lp-step-num">2</div>
                <div className="lp-step-title">Realiza la transferencia</div>
                <div className="lp-step-desc">Te compartimos las cuentas bancarias autorizadas por WhatsApp al momento.</div>
              </div>
              <div className="lp-step">
                <div className="lp-step-num">3</div>
                <div className="lp-step-title">Envia el comprobante</div>
                <div className="lp-step-desc">Envia el soporte por WhatsApp con el nombre de tu organizacion y tu plan se activa el mismo dia.</div>
              </div>
            </div>
            <a
              href={`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent('Hola, quiero activar mi plan en AgroGestion. Me puede indicar las cuentas para el pago?')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="lp-btn-primary lp-btn-lg lp-activacion-btn"
            >
              <WhatsAppIcon /> Contactar para Activar mi Plan
            </a>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="lp-section">
        <div className="lp-container">
          <div className="lp-section-header">
            <span className="lp-section-tag">Preguntas Frecuentes</span>
            <h2>Lo que todo ganadero nos pregunta</h2>
          </div>
          <div className="lp-faq-list">
            {faqs.map((faq, i) => (
              <div key={i} className={`lp-faq-item ${openFaq === i ? 'open' : ''}`}>
                <button
                  className="lp-faq-question"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                >
                  <span>{faq.q}</span>
                  <span className="lp-faq-arrow">{openFaq === i ? '▲' : '▼'}</span>
                </button>
                {openFaq === i && (
                  <div className="lp-faq-answer"><p>{faq.a}</p></div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CONTACTO */}
      <section id="contacto" className="lp-section lp-contact">
        <div className="lp-container">
          <div className="lp-contact-inner">
            <div className="lp-contact-text">
              <h2>Tiene preguntas? Estamos en el campo con usted.</h2>
              <p>Contactenos directamente, sin formularios ni filas de espera.</p>
              <div className="lp-contact-links">
                <a
                  href={`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent('Hola, quiero informacion sobre AgroGestion.')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="lp-contact-item whatsapp"
                >
                  <WhatsAppIcon />
                  <div>
                    <strong>WhatsApp Comercial</strong>
                    <span>@fedejaramilloo</span>
                  </div>
                </a>
                <a href="mailto:soporte@appagrogestion.com" className="lp-contact-item email">
                  <span className="lp-email-icon">✉️</span>
                  <div>
                    <strong>Correo de Soporte</strong>
                    <span>soporte@appagrogestion.com</span>
                  </div>
                </a>
              </div>
            </div>
            <div className="lp-contact-cta">
              <Link to="/login" className="lp-btn-primary lp-btn-xl">
                Crear Cuenta Gratis
              </Link>
              <span className="lp-contact-note">Sin tarjeta de credito - Hasta 40 animales - Siempre gratis</span>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="lp-footer">
        <div className="lp-container">
          <div className="lp-footer-inner">
            <div className="lp-footer-brand">
              <LeafIcon />
              <span>AgroGestion</span>
            </div>
            <p className="lp-footer-tagline">
              Software ganadero con IA para Colombia - Ganaderia de precision desde el corral y el potrero.
            </p>
            <div className="lp-footer-links">
              <a href="#inicio">Inicio</a>
              <a href="#modulos">Modulos</a>
              <a href="#precios">Precios</a>
              <a href="#faq">FAQ</a>
              <a href="mailto:soporte@appagrogestion.com">soporte@appagrogestion.com</a>
              <Link to="/login">Iniciar Sesion</Link>
            </div>
            <p className="lp-footer-copy">
              {new Date().getFullYear()} AgroGestion - Colombia - Todos los derechos reservados.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
