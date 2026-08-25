import React, { useState } from 'react';
import { WebSettings } from '../types';
import { X } from 'lucide-react';

export interface FooterProps {
  webSettings?: WebSettings;
  onNavigateCatalog?: () => void;
  onShowLocation?: () => void;
  onShowTerms?: () => void;
}

export const Footer: React.FC<FooterProps> = ({
  webSettings = {},
  onNavigateCatalog,
  onShowLocation,
  onShowTerms
}) => {
  const currentYear = new Date().getFullYear();

  // Modales
  const [showHowToBuy, setShowHowToBuy] = useState(false);
  const [showArrepentimiento, setShowArrepentimiento] = useState(false);

  // Formulario de arrepentimiento
  const [arrepentimientoNombre, setArrepentimientoNombre] = useState('');
  const [arrepentimientoEmail, setArrepentimientoEmail] = useState('');
  const [arrepentimientoTelefono, setArrepentimientoTelefono] = useState('');
  const [arrepentimientoOrden, setArrepentimientoOrden] = useState('');
  const [arrepentimientoMotivo, setArrepentimientoMotivo] = useState('');
  const [arrepentimientoEnviado, setArrepentimientoEnviado] = useState(false);
  const [arrepentimientoTicket, setArrepentimientoTicket] = useState('');

  // Datos de contacto
  const storeDisplayName = webSettings?.storeName || 'EL ROPERO';
  const rawWhatsapp = webSettings?.contactWhatsapp || '5492346685836';
  const cleanWhatsapp = rawWhatsapp.replace(/[^0-9]/g, '');
  const displayWhatsapp = cleanWhatsapp.startsWith('549') 
    ? `+54 9 ${cleanWhatsapp.slice(3, 5)} ${cleanWhatsapp.slice(5, 9)}-${cleanWhatsapp.slice(9)}`
    : `+${cleanWhatsapp}`;
  const whatsappUrl = `https://wa.me/${cleanWhatsapp}?text=${encodeURIComponent(
    'Hola El Ropero, tengo una consulta desde elropero.ar'
  )}`;

  const instagramHandle = webSettings?.instagramHandle || 'elropero.ar';
  const cleanInstagramHandle = instagramHandle.replace('@', '');
  const instagramUrl = `https://instagram.com/${cleanInstagramHandle}`;

  const handleCatalogClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (onNavigateCatalog) {
      onNavigateCatalog();
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleArrepentimientoSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const ticketId = `ARR-${Math.floor(100000 + Math.random() * 900000)}`;
    setArrepentimientoTicket(ticketId);
    setArrepentimientoEnviado(true);
  };

  const resetArrepentimientoForm = () => {
    setArrepentimientoNombre('');
    setArrepentimientoEmail('');
    setArrepentimientoTelefono('');
    setArrepentimientoOrden('');
    setArrepentimientoMotivo('');
    setArrepentimientoEnviado(false);
    setShowArrepentimiento(false);
  };

  return (
    <>
      <footer className="w-full bg-[#fbfbfb] text-[#666666] border-t border-neutral-200 pt-12 pb-12 font-sans selection:bg-black selection:text-white">
        <div className="max-w-6xl mx-auto px-6 lg:px-8">
          
          {/* Grilla Minimalista */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 pb-10 border-b border-neutral-200 text-[11px] font-light">
            
            {/* 1. EL ROPERO */}
            <div className="space-y-3">
              <span className="text-black text-xs font-normal tracking-[0.25em] uppercase block">
                {storeDisplayName}
              </span>
              <div className="space-y-1.5">
                <a 
                  href={whatsappUrl} 
                  target="_blank" 
                  rel="noreferrer" 
                  className="block hover:text-black transition-colors"
                >
                  WhatsApp {displayWhatsapp}
                </a>
                <a 
                  href={instagramUrl} 
                  target="_blank" 
                  rel="noreferrer" 
                  className="block hover:text-black transition-colors"
                >
                  Instagram @{cleanInstagramHandle}
                </a>
              </div>
            </div>

            {/* 2. TIENDA */}
            <div>
              <span className="text-black uppercase tracking-[0.18em] font-medium text-[10px] block mb-3">
                Tienda
              </span>
              <ul className="space-y-2">
                <li>
                  <button 
                    onClick={() => setShowHowToBuy(true)} 
                    className="hover:text-black transition-colors text-left"
                  >
                    Guía de Compra
                  </button>
                </li>
                <li>
                  <button 
                    onClick={() => onShowLocation ? onShowLocation() : null} 
                    className="hover:text-black transition-colors text-left"
                  >
                    Ubicación
                  </button>
                </li>
                <li>
                  <button 
                    onClick={() => onShowTerms ? onShowTerms() : null} 
                    className="hover:text-black transition-colors text-left"
                  >
                    Cambios y Devoluciones
                  </button>
                </li>
              </ul>
            </div>

            {/* 3. AYUDA & LEGAL */}
            <div>
              <span className="text-black uppercase tracking-[0.18em] font-medium text-[10px] block mb-3">
                Ayuda & Legal
              </span>
              <ul className="space-y-2">
                <li>
                  <button 
                    onClick={() => setShowArrepentimiento(true)} 
                    className="text-neutral-900 underline underline-offset-4 hover:text-black transition-colors text-left"
                  >
                    Botón de Arrepentimiento
                  </button>
                </li>
                <li>
                  <a 
                    href="https://www.argentina.gob.ar/produccion/defensadelconsumidor" 
                    target="_blank" 
                    rel="noreferrer" 
                    className="block hover:text-black transition-colors text-left"
                  >
                    Defensa al Consumidor
                  </a>
                </li>
              </ul>
            </div>

            {/* 4. MEDIOS DE PAGO Y ENVÍOS */}
            <div className="space-y-3">
              <div>
                <span className="text-black uppercase tracking-[0.18em] font-medium text-[10px] block mb-1">
                  Medios de Pago
                </span>
                <p className="text-[#888888] leading-relaxed">
                  Ualá Bis • Tarjetas (Visa, Mastercard, Amex) • Transferencia bancaria (20% OFF).
                </p>
              </div>

              <div>
                <span className="text-black uppercase tracking-[0.18em] font-medium text-[10px] block mb-1">
                  Envíos
                </span>
                <p className="text-[#888888] leading-relaxed">
                  Correo Argentino a todo el país • Retiro en Showroom.
                </p>
              </div>
            </div>

          </div>

          {/* Barra Legal Inferior & Firma de Autor */}
          <div className="pt-8 flex flex-col items-center justify-center text-center gap-3 text-[10px] text-[#888888] font-light tracking-wide">
            <div className="flex flex-wrap items-center justify-center gap-3">
              <span>© {currentYear} {storeDisplayName}. Todos los derechos reservados.</span>
              <span className="text-neutral-300">•</span>
              <span className="tracking-wider uppercase text-[9px] text-[#999999]">Compra Protegida • SSL</span>
            </div>

            <div className="pt-1">
              <a
                href="https://www.instagram.com/siao.tech"
                target="_blank"
                rel="noreferrer"
                className="inline-block text-[10px] tracking-[0.2em] uppercase text-neutral-400 hover:text-black transition-colors duration-200"
                title="Ir al Instagram de SIAO Tech (@siao.tech)"
              >
                Desarrollado por <span className="text-neutral-700 hover:text-black font-medium underline underline-offset-4">SIAO Tech</span>
              </a>
            </div>
          </div>

        </div>
      </footer>

      {/* ══════ MODAL: GUÍA DE COMPRA ══════ */}
      {showHowToBuy && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-xs" onClick={() => setShowHowToBuy(false)} />
          <div className="relative bg-white w-full max-w-md p-8 space-y-6 shadow-xl border border-neutral-200 font-sans text-xs">
            <button 
              onClick={() => setShowHowToBuy(false)} 
              className="absolute top-5 right-5 text-neutral-400 hover:text-black transition-colors p-1"
              aria-label="Cerrar"
            >
              <X size={16} />
            </button>

            <div className="border-b border-neutral-100 pb-3">
              <h3 className="text-xs font-medium tracking-[0.15em] uppercase text-black">
                Guía de Compra
              </h3>
            </div>

            <div className="space-y-4 text-left text-[#666666] font-light">
              <div className="flex gap-3">
                <span className="font-mono text-black text-[10px]">01</span>
                <p>Elegí tus prendas, seleccioná talle y agregalas a la bolsa.</p>
              </div>
              <div className="flex gap-3">
                <span className="font-mono text-black text-[10px]">02</span>
                <p>Revisá tu carrito y seleccioná envío a domicilio, sucursal o retiro en showroom.</p>
              </div>
              <div className="flex gap-3">
                <span className="font-mono text-black text-[10px]">03</span>
                <p>Aboná de forma segura con Ualá Bis o transferencia con 20% OFF.</p>
              </div>
            </div>

            <div className="pt-2">
              <button
                onClick={() => {
                  setShowHowToBuy(false);
                  handleCatalogClick({ preventDefault: () => {} } as any);
                }}
                className="w-full bg-black text-white py-2.5 text-[10px] tracking-[0.2em] uppercase font-normal hover:bg-neutral-800 transition-colors"
              >
                Ver Catálogo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════ MODAL: BOTÓN DE ARREPENTIMIENTO (LEY 24.240) ══════ */}
      {showArrepentimiento && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-xs" onClick={resetArrepentimientoForm} />
          <div className="relative bg-white w-full max-w-md p-8 space-y-5 shadow-xl border border-neutral-200 text-left font-sans text-xs">
            <button 
              onClick={resetArrepentimientoForm} 
              className="absolute top-5 right-5 text-neutral-400 hover:text-black transition-colors p-1"
              aria-label="Cerrar"
            >
              <X size={16} />
            </button>

            <div className="border-b border-neutral-100 pb-3">
              <h3 className="text-xs font-medium tracking-[0.15em] uppercase text-black">
                Botón de Arrepentimiento
              </h3>
              <p className="text-[10px] text-[#888888] font-light pt-1">
                Ley 24.240 • Revocación de compra dentro de los 10 días corridos.
              </p>
            </div>

            {!arrepentimientoEnviado ? (
              <form onSubmit={handleArrepentimientoSubmit} className="space-y-3 text-[11px] font-light">
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-black mb-1">
                    Nombre y Apellido *
                  </label>
                  <input
                    type="text"
                    required
                    value={arrepentimientoNombre}
                    onChange={(e) => setArrepentimientoNombre(e.target.value)}
                    placeholder="Nombre completo"
                    className="w-full px-3 py-1.5 bg-[#fcfcfc] border border-neutral-200 text-[11px] focus:outline-none focus:border-black transition-colors rounded-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] uppercase tracking-wider text-black mb-1">
                      Email *
                    </label>
                    <input
                      type="email"
                      required
                      value={arrepentimientoEmail}
                      onChange={(e) => setArrepentimientoEmail(e.target.value)}
                      placeholder="correo@ejemplo.com"
                      className="w-full px-3 py-1.5 bg-[#fcfcfc] border border-neutral-200 text-[11px] focus:outline-none focus:border-black transition-colors rounded-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase tracking-wider text-black mb-1">
                      Teléfono *
                    </label>
                    <input
                      type="tel"
                      required
                      value={arrepentimientoTelefono}
                      onChange={(e) => setArrepentimientoTelefono(e.target.value)}
                      placeholder="+54 9..."
                      className="w-full px-3 py-1.5 bg-[#fcfcfc] border border-neutral-200 text-[11px] focus:outline-none focus:border-black transition-colors rounded-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-black mb-1">
                    N° de Pedido *
                  </label>
                  <input
                    type="text"
                    required
                    value={arrepentimientoOrden}
                    onChange={(e) => setArrepentimientoOrden(e.target.value)}
                    placeholder="Ej. ORD-1234"
                    className="w-full px-3 py-1.5 bg-[#fcfcfc] border border-neutral-200 text-[11px] focus:outline-none focus:border-black transition-colors rounded-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-black mb-1">
                    Motivo (Opcional)
                  </label>
                  <textarea
                    rows={2}
                    value={arrepentimientoMotivo}
                    onChange={(e) => setArrepentimientoMotivo(e.target.value)}
                    placeholder="Comentarios adicionales..."
                    className="w-full px-3 py-1.5 bg-[#fcfcfc] border border-neutral-200 text-[11px] focus:outline-none focus:border-black transition-colors resize-none rounded-none"
                  />
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    className="w-full bg-black text-white py-2.5 text-[10px] tracking-[0.2em] uppercase font-normal hover:bg-neutral-800 transition-colors"
                  >
                    Enviar Solicitud
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-4 text-center py-2">
                <div className="space-y-1">
                  <span className="text-[10px] tracking-[0.15em] uppercase text-neutral-400 block font-light">
                    Gestión Registrada
                  </span>
                  <div className="py-1.5 px-3 bg-neutral-50 border border-neutral-200 font-mono text-xs text-black inline-block mt-1">
                    {arrepentimientoTicket}
                  </div>
                  <p className="text-[11px] text-[#777777] font-light leading-relaxed pt-2">
                    Nos pondremos en contacto a <strong className="font-medium text-black">{arrepentimientoEmail}</strong> dentro de las próximas 24 hs hábiles.
                  </p>
                </div>

                <div className="pt-1">
                  <button
                    onClick={resetArrepentimientoForm}
                    className="w-full bg-black text-white py-2.5 text-[10px] tracking-[0.2em] uppercase font-normal hover:bg-neutral-800 transition-colors"
                  >
                    Entendido
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default Footer;
