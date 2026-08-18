import React from 'react';
import { Section, WebSettings } from '../types';
import { LayoutDashboard, ShoppingBag, PackagePlus, WalletMinimal, LogOut, Menu, X, Gift, RefreshCw, Globe, ShoppingCart, ChevronLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

interface LayoutProps {
  currentSection: Section;
  setSection: (section: Section) => void;
  onLogout: () => void;
  children: React.ReactNode;
  isSyncing?: boolean;
  onForceSync?: () => void;
  webSettings: WebSettings;
  selectedCategory: string;
  setSelectedCategory: (cat: string) => void;
}

const Layout: React.FC<LayoutProps> = ({
  currentSection,
  setSection,
  onLogout,
  children,
  isSyncing = false,
  onForceSync,
  webSettings,
  selectedCategory,
  setSelectedCategory
}) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);
  const [isCollapsed, setIsCollapsed] = React.useState<boolean>(() => {
    try {
      return localStorage.getItem('sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const toggleSidebar = () => {
    setIsCollapsed(prev => {
      const next = !prev;
      try {
        localStorage.setItem('sidebar_collapsed', String(next));
      } catch {}
      return next;
    });
  };

  const menuGroups = [
    {
      title: 'CONTROL GENERAL',
      items: [
        { id: 'admin', label: 'PANEL', icon: LayoutDashboard },
      ]
    },
    {
      title: 'OPERATORIA DIARIA',
      items: [
        { id: 'ventas', label: 'CAJA', icon: ShoppingBag },
        { id: 'giftcards', label: 'GIFT CARDS', icon: Gift },
      ]
    },
    {
      title: 'MERCADERÍA Y FINANZAS',
      items: [
        { id: 'stock', label: 'STOCK', icon: PackagePlus },
        { id: 'gastos', label: 'EGRESOS', icon: WalletMinimal },
      ]
    },
    {
      title: 'E-COMMERCE',
      items: [
        { id: 'pedidos', label: 'PEDIDOS WEB', icon: ShoppingCart },
        { id: 'sitio', label: 'SITIO WEB', icon: Globe },
      ]
    }
  ];

  const navButtonClass = (active: boolean, collapsed: boolean) =>
    collapsed
      ? `group relative flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-200 ease-out shrink-0 ${
          active
            ? 'bg-stone-900 text-white shadow-xs font-medium hover:bg-black hover:scale-105 hover:shadow-sm'
            : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900 hover:scale-105 hover:shadow-2xs'
        }`
      : `group relative w-full text-left py-2.5 px-3.5 flex items-center gap-3 rounded-xl transition-all duration-200 ease-out text-[10px] tracking-[0.18em] font-medium overflow-hidden ${
          active
            ? 'bg-stone-900 text-white shadow-xs font-semibold hover:bg-black hover:-translate-y-0.5 hover:shadow-sm'
            : 'bg-transparent text-stone-600 hover:bg-stone-100 hover:text-stone-900 hover:-translate-y-0.5 hover:shadow-2xs border border-transparent hover:border-stone-200/60'
        }`;

  const SidebarContent: React.FC<{ collapsed?: boolean }> = ({ collapsed = false }) => (
    <>
      <div className={`mb-6 ${collapsed ? 'flex flex-col items-center justify-center w-full' : 'flex items-center justify-between gap-2'}`}>
        {!collapsed ? (
          <>
            <div className="flex flex-col">
              <h1 className="font-serif text-lg uppercase text-stone-900 italic tracking-[0.12em] truncate font-normal whitespace-nowrap">
                {webSettings?.storeName || 'EL ROPERO'}
              </h1>
              <span className="text-[8px] uppercase tracking-[0.25em] text-stone-400 font-light">Showroom Admin</span>
            </div>
            <button
              onClick={toggleSidebar}
              title="Minimizar centro de control"
              className="p-1.5 rounded-lg border border-stone-200/60 hover:bg-stone-100/60 text-stone-500 hover:text-stone-900 transition-all flex items-center justify-center shrink-0 shadow-2xs"
            >
              <ChevronLeft size={15} strokeWidth={1.5} />
            </button>
          </>
        ) : (
          <button
            onClick={toggleSidebar}
            title="Expandir centro de control"
            className="w-10 h-10 rounded-xl bg-stone-100/80 border border-stone-200/60 hover:bg-stone-200/80 text-stone-900 transition-all flex items-center justify-center shrink-0 group relative shadow-2xs hover:scale-105"
          >
            <span className="text-base leading-none select-none">🖤</span>
            <span className="absolute left-[54px] top-1/2 -translate-y-1/2 z-50 px-3 py-1.5 bg-stone-900/95 text-stone-100 text-[9px] uppercase font-medium tracking-[0.2em] rounded-lg shadow-xl backdrop-blur-xs whitespace-nowrap opacity-0 group-hover:opacity-100 group-hover:translate-x-1 pointer-events-none transition-all duration-200">
              Centro de Control
            </span>
          </button>
        )}
      </div>

      <nav className={`flex-1 space-y-5 overflow-y-auto w-full ${collapsed ? 'no-scrollbar px-0 flex flex-col items-center' : 'sidebar-nav pr-1'}`}>
        {menuGroups.map((group, groupIndex) => (
          <div key={group.title} className={`space-y-1.5 w-full ${collapsed ? 'flex flex-col items-center' : ''}`}>
            {!collapsed && (
              <div className="flex items-center gap-2 px-2 pt-1 pb-1">
                <span className="text-[8px] font-semibold tracking-[0.2em] uppercase text-stone-400/90 leading-none">
                  {group.title}
                </span>
                {groupIndex > 0 && <div className="h-[1px] flex-1 bg-stone-200/40" />}
              </div>
            )}
            {collapsed && groupIndex > 0 && (
              <div className="w-6 h-[1px] bg-stone-200/60 my-2" />
            )}
            {group.items.map((item) => {
              const active = currentSection === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setSection(item.id as Section);
                    setSelectedCategory('');
                    setIsMobileMenuOpen(false);
                  }}
                  className={navButtonClass(active, collapsed)}
                >
                  <item.icon size={collapsed ? 18 : 15} strokeWidth={1.5} className="shrink-0 transition-transform duration-200 group-hover:scale-110" />
                  {!collapsed ? (
                    <span className="truncate">{item.label}</span>
                  ) : (
                    <>
                      <span className="absolute left-[54px] top-1/2 -translate-y-1/2 z-50 px-3 py-1.5 bg-stone-900/95 text-stone-100 text-[9px] uppercase font-medium tracking-[0.2em] rounded-lg shadow-xl backdrop-blur-xs whitespace-nowrap opacity-0 group-hover:opacity-100 group-hover:translate-x-1 pointer-events-none transition-all duration-200">
                        {item.label}
                      </span>
                    </>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      <div className={`mt-auto space-y-2 pt-4 border-t border-stone-200/50 ${collapsed ? 'flex flex-col items-center w-full px-0' : 'w-full'}`}>
        {!collapsed ? (
          <>
            <Link
              to="/"
              className="w-full py-2.5 px-3.5 flex items-center gap-3 text-[9px] tracking-[0.18em] font-medium border border-stone-200/70 rounded-xl hover:bg-stone-100 hover:border-stone-300 hover:-translate-y-0.5 transition-all duration-200 uppercase text-stone-700 hover:text-stone-900 shadow-2xs hover:shadow-xs"
            >
              <Globe size={15} strokeWidth={1.5} className="shrink-0 text-stone-500" /> <span className="truncate">Ver Sitio Web</span>
            </Link>
            {onForceSync && (
              <button
                onClick={onForceSync}
                disabled={isSyncing}
                className="w-full py-2.5 px-3.5 flex items-center gap-3 text-[9px] tracking-[0.18em] font-medium border border-stone-200/70 rounded-xl hover:bg-stone-100 hover:border-stone-300 hover:-translate-y-0.5 transition-all duration-200 uppercase text-stone-700 hover:text-stone-900 disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs hover:shadow-xs"
                title="Sincronizar con Firebase"
              >
                <RefreshCw size={15} strokeWidth={1.5} className={`shrink-0 text-stone-500 ${isSyncing ? 'animate-spin' : ''}`} />
                <span className="truncate">{isSyncing ? 'Sincronizando...' : 'Sincronizar'}</span>
              </button>
            )}
            <button
              onClick={onLogout}
              className="w-full py-2.5 px-3.5 flex items-center gap-3 text-[9px] tracking-[0.18em] font-medium border border-stone-200/70 rounded-xl hover:bg-rose-50 hover:border-rose-300 hover:text-rose-700 hover:-translate-y-0.5 transition-all duration-200 uppercase group text-stone-600 shadow-2xs hover:shadow-xs"
            >
              <LogOut size={15} strokeWidth={1.5} className="shrink-0 group-hover:-translate-x-0.5 transition-transform text-stone-400 group-hover:text-rose-600" /> <span className="truncate">Salir</span>
            </button>
          </>
        ) : (
          <>
            <Link
              to="/"
              className="group relative flex items-center justify-center w-10 h-10 rounded-xl border border-stone-200/70 hover:bg-stone-100 hover:border-stone-300 hover:scale-105 text-stone-700 transition-all duration-200 shadow-2xs hover:shadow-xs shrink-0"
            >
              <Globe size={18} strokeWidth={1.5} className="shrink-0 text-stone-500 transition-transform duration-200 group-hover:scale-110" />
              <span className="absolute left-[54px] top-1/2 -translate-y-1/2 z-50 px-3 py-1.5 bg-stone-900/95 text-stone-100 text-[9px] uppercase font-medium tracking-[0.2em] rounded-lg shadow-xl backdrop-blur-xs whitespace-nowrap opacity-0 group-hover:opacity-100 group-hover:translate-x-1 pointer-events-none transition-all duration-200">
                Ver Sitio Web
              </span>
            </Link>
            {onForceSync && (
              <button
                onClick={onForceSync}
                disabled={isSyncing}
                className="group relative flex items-center justify-center w-10 h-10 rounded-xl border border-stone-200/70 hover:bg-stone-100 hover:border-stone-300 hover:scale-105 text-stone-700 disabled:opacity-40 transition-all duration-200 shadow-2xs hover:shadow-xs shrink-0"
              >
                <RefreshCw size={18} strokeWidth={1.5} className={`shrink-0 text-stone-500 transition-transform duration-200 group-hover:scale-110 ${isSyncing ? 'animate-spin text-amber-600' : ''}`} />
                <span className="absolute left-[54px] top-1/2 -translate-y-1/2 z-50 px-3 py-1.5 bg-stone-900/95 text-stone-100 text-[9px] uppercase font-medium tracking-[0.2em] rounded-lg shadow-xl backdrop-blur-xs whitespace-nowrap opacity-0 group-hover:opacity-100 group-hover:translate-x-1 pointer-events-none transition-all duration-200">
                  {isSyncing ? 'Sincronizando...' : 'Sincronizar'}
                </span>
              </button>
            )}
            <button
              onClick={onLogout}
              className="group relative flex items-center justify-center w-10 h-10 rounded-xl border border-stone-200/70 hover:bg-rose-50 hover:border-rose-300 hover:scale-105 text-stone-600 hover:text-rose-700 transition-all duration-200 shadow-2xs hover:shadow-xs shrink-0"
            >
              <LogOut size={18} strokeWidth={1.5} className="shrink-0 group-hover:-translate-x-0.5 transition-transform text-stone-400 group-hover:text-rose-600" />
              <span className="absolute left-[54px] top-1/2 -translate-y-1/2 z-50 px-3 py-1.5 bg-rose-900/95 text-stone-100 text-[9px] uppercase font-medium tracking-[0.2em] rounded-lg shadow-xl backdrop-blur-xs whitespace-nowrap opacity-0 group-hover:opacity-100 group-hover:translate-x-1 pointer-events-none transition-all duration-200">
                Salir
              </span>
            </button>
          </>
        )}
      </div>
    </>
  );

  return (
    <>
    <style>{`
        .sidebar-nav::-webkit-scrollbar {
          width: 3px;
        }
        .sidebar-nav::-webkit-scrollbar-track {
          background: transparent;
        }
        .sidebar-nav::-webkit-scrollbar-thumb {
          background: #E7E5E4;
          border-radius: 9999px;
        }
        .sidebar-nav::-webkit-scrollbar-thumb:hover {
          background: #D6D3D1;
        }
        .sidebar-nav {
          scrollbar-width: thin;
          scrollbar-color: #E7E5E4 transparent;
        }
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    <div className="min-h-[100dvh] w-full max-w-full flex flex-col md:flex-row bg-[#FAF9F5] overflow-x-hidden">
      {/* Contenedor fixed del sidebar */}
      <div
        className={`hidden md:flex fixed top-0 left-0 h-full z-30 transition-all duration-300 ease-in-out ${isCollapsed ? 'w-[72px]' : 'w-64'}`}
      >
        <aside
          className={`flex flex-col border-r border-stone-200/60 bg-white/95 backdrop-blur-md h-full shadow-[1px_0_15px_rgba(0,0,0,0.015)] select-none w-full ${isCollapsed ? 'px-3 py-5 items-center overflow-visible' : 'p-5 overflow-hidden'}`}
        >
          <SidebarContent collapsed={isCollapsed} />
        </aside>
      </div>

      <div className="md:hidden flex items-center justify-between p-4 bg-white/95 backdrop-blur-sm border-b border-stone-200/60 sticky top-0 z-50 shadow-2xs">
        <span className="font-serif text-[clamp(15px,4.2vw,18px)] italic text-stone-900 tracking-wider truncate whitespace-nowrap">
          {webSettings?.storeName || 'EL ROPERO'}
        </span>
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-2 border border-stone-200/60 rounded-xl text-stone-800 hover:bg-stone-100/60 transition-colors"
        >
          {isMobileMenuOpen ? <X size={18} strokeWidth={1.5} /> : <Menu size={18} strokeWidth={1.5} />}
        </button>
      </div>

      {isMobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-white/98 backdrop-blur-md pt-20 px-6 flex flex-col overflow-y-auto visible-scrollbar pb-6">
          <SidebarContent collapsed={false} />
        </div>
      )}

      <main className={`flex-1 transition-all duration-300 ease-in-out p-4 md:p-8 overflow-auto visible-scrollbar ${isCollapsed ? 'md:ml-[72px]' : 'md:ml-64'}`}>
        <div className="max-w-7xl mx-auto h-full">{children}</div>
      </main>
    </div>
    </>
  );
};

export default Layout;
