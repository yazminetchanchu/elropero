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
      ? `group relative flex items-center justify-center w-11 h-11 rounded-xl transition-all duration-200 ${
          active
            ? 'bg-[#C9B8A8] text-[#1A1A1A] shadow-md scale-105 font-bold'
            : 'text-[#1A1A1A]/70 hover:bg-[#C9B8A8]/20 hover:text-[#1A1A1A]'
        }`
      : `group relative w-full text-left py-3 px-4 flex items-center gap-3 rounded-xl transition-all duration-200 text-[10px] tracking-[2px] font-medium overflow-hidden ${
          active
            ? 'bg-[#C9B8A8] text-[#1A1A1A] shadow-md translate-x-1 font-extrabold'
            : 'bg-transparent text-[#1A1A1A]/80 hover:bg-[#C9B8A8]/20 hover:translate-x-1'
        }`;

  const SidebarContent: React.FC<{ collapsed?: boolean }> = ({ collapsed = false }) => (
    <>
      <div className={`mb-6 ${collapsed ? 'flex flex-col items-center' : 'flex items-center justify-between gap-2'}`}>
        {!collapsed ? (
          <>
            <h1 className="font-serif text-[clamp(16px,3vw,24px)] uppercase text-[#1A1A1A] italic tracking-wider truncate font-black whitespace-nowrap">
              {webSettings?.storeName || 'EL ROPERO'}
            </h1>
            <button
              onClick={toggleSidebar}
              title="Minimizar centro de control"
              className="p-1.5 rounded-lg border border-[#C9B8A8]/40 hover:bg-[#C9B8A8]/20 text-[#1A1A1A]/70 hover:text-[#1A1A1A] transition-all flex items-center justify-center shrink-0 shadow-xs"
            >
              <ChevronLeft size={16} />
            </button>
          </>
        ) : (
          <button
            onClick={toggleSidebar}
            title="Expandir centro de control"
            className="w-11 h-11 rounded-xl bg-[#C9B8A8]/30 border border-[#C9B8A8]/60 hover:bg-[#C9B8A8] text-[#1A1A1A] transition-all flex items-center justify-center shrink-0 group relative shadow-xs"
          >
            <span className="text-xl leading-none select-none">🖤</span>
            <span className="absolute left-[54px] z-50 px-3 py-1.5 bg-[#1A1A1A] text-white text-[10px] uppercase font-bold tracking-[2px] rounded-lg shadow-xl whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 translate-x-1 group-hover:translate-x-0">
              Centro de Control
            </span>
          </button>
        )}
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto sidebar-nav w-full pr-1">
        {menuGroups.map((group, groupIndex) => (
          <div key={group.title} className={`space-y-1.5 ${collapsed ? 'flex flex-col items-center' : ''}`}>
            {!collapsed && (
              <div className="flex items-center gap-2 px-3 pt-2 pb-1">
                <span className="text-[8px] font-extrabold tracking-[2.5px] uppercase text-[#1A1A1A]/40 leading-none">
                  {group.title}
                </span>
                {groupIndex > 0 && <div className="h-[1px] flex-1 bg-[#C9B8A8]/30" />}
              </div>
            )}
            {collapsed && groupIndex > 0 && (
              <div className="w-6 h-[1px] bg-[#C9B8A8]/30 my-2" />
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
                  <item.icon size={collapsed ? 18 : 16} className="shrink-0 transition-transform duration-200 group-hover:scale-110" />
                  {!collapsed ? (
                    <span className="truncate">{item.label}</span>
                  ) : (
                    <>
                      <span className="absolute left-[54px] z-50 px-3 py-1.5 bg-[#1A1A1A] text-white text-[10px] uppercase font-bold tracking-[2px] rounded-lg shadow-xl whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 translate-x-1 group-hover:translate-x-0">
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

      <div className={`mt-auto space-y-2.5 pt-4 border-t border-[#C9B8A8]/30 ${collapsed ? 'flex flex-col items-center w-full' : 'w-full'}`}>
        {!collapsed ? (
          <>
            <Link
              to="/"
              className="w-full py-3 px-4 flex items-center gap-3 text-[10px] tracking-[2px] font-medium border border-[#C9B8A8]/50 rounded-lg hover:bg-[#C9B8A8]/15 hover:border-[#C9B8A8] transition-all uppercase text-[#1A1A1A] shadow-sm"
            >
              <Globe size={16} className="shrink-0" /> <span className="truncate">Ver Sitio Web</span>
            </Link>
            {onForceSync && (
              <button
                onClick={onForceSync}
                disabled={isSyncing}
                className="w-full py-3 px-4 flex items-center gap-3 text-[10px] tracking-[2px] font-medium border border-[#C9B8A8]/50 rounded-lg hover:bg-[#C9B8A8]/15 hover:border-[#C9B8A8] transition-all uppercase text-[#1A1A1A] disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
                title="Sincronizar con Firebase"
              >
                <RefreshCw size={16} className={`shrink-0 ${isSyncing ? 'animate-spin' : ''}`} />
                <span className="truncate">{isSyncing ? 'Sincronizando...' : 'Sincronizar'}</span>
              </button>
            )}
            <button
              onClick={onLogout}
              className="w-full py-3.5 px-4 flex items-center gap-3 text-[10px] tracking-[2px] font-medium border border-[#C9B8A8]/50 rounded-lg hover:bg-red-50/80 hover:border-red-200 hover:text-red-700 transition-all uppercase group text-[#1A1A1A] shadow-sm"
            >
              <LogOut size={16} className="shrink-0 group-hover:-translate-x-1 transition-transform" /> <span className="truncate">Salir</span>
            </button>
          </>
        ) : (
          <>
            <Link
              to="/"
              className="group relative flex items-center justify-center w-11 h-11 rounded-xl border border-[#C9B8A8]/50 hover:bg-[#C9B8A8]/20 text-[#1A1A1A] transition-all shadow-sm"
            >
              <Globe size={18} className="shrink-0" />
              <span className="absolute left-[54px] z-50 px-3 py-1.5 bg-[#1A1A1A] text-white text-[10px] uppercase font-bold tracking-[2px] rounded-lg shadow-xl whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 translate-x-1 group-hover:translate-x-0">
                Ver Sitio Web
              </span>
            </Link>
            {onForceSync && (
              <button
                onClick={onForceSync}
                disabled={isSyncing}
                className="group relative flex items-center justify-center w-11 h-11 rounded-xl border border-[#C9B8A8]/50 hover:bg-[#C9B8A8]/20 text-[#1A1A1A] disabled:opacity-40 transition-all shadow-sm"
              >
                <RefreshCw size={18} className={`shrink-0 ${isSyncing ? 'animate-spin text-amber-600' : ''}`} />
                <span className="absolute left-[54px] z-50 px-3 py-1.5 bg-[#1A1A1A] text-white text-[10px] uppercase font-bold tracking-[2px] rounded-lg shadow-xl whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 translate-x-1 group-hover:translate-x-0">
                  {isSyncing ? 'Sincronizando...' : 'Sincronizar'}
                </span>
              </button>
            )}
            <button
              onClick={onLogout}
              className="group relative flex items-center justify-center w-11 h-11 rounded-xl border border-[#C9B8A8]/50 hover:bg-red-50 hover:border-red-200 text-[#1A1A1A] hover:text-red-700 transition-all shadow-sm"
            >
              <LogOut size={18} className="shrink-0 group-hover:-translate-x-0.5 transition-transform" />
              <span className="absolute left-[54px] z-50 px-3 py-1.5 bg-red-600 text-white text-[10px] uppercase font-bold tracking-[2px] rounded-lg shadow-xl whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 translate-x-1 group-hover:translate-x-0">
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
          width: 4px;
        }
        .sidebar-nav::-webkit-scrollbar-track {
          background: transparent;
          border-radius: 9999px;
        }
        .sidebar-nav::-webkit-scrollbar-thumb {
          background: #C9B8A8;
          border-radius: 9999px;
          transition: background 0.2s;
        }
        .sidebar-nav::-webkit-scrollbar-thumb:hover {
          background: #8B6F5E;
        }
        .sidebar-nav {
          scrollbar-width: thin;
          scrollbar-color: #C9B8A8 transparent;
        }
      `}</style>
    <div className="min-h-screen flex flex-col md:flex-row bg-[#F5F1EB]">
      {/* Contenedor fixed del sidebar */}
      <div
        className={`hidden md:flex fixed top-0 left-0 h-full z-30 transition-all duration-300 ease-in-out ${isCollapsed ? 'w-[76px]' : 'w-64'}`}
      >
        <aside
          className={`flex flex-col border-r border-[#C9B8A8]/40 bg-white/90 backdrop-blur-md h-full shadow-md select-none w-full ${isCollapsed ? 'px-3 py-6 items-center overflow-hidden' : 'p-6 overflow-hidden'}`}
        >
          <SidebarContent collapsed={isCollapsed} />
        </aside>
      </div>

      <div className="md:hidden flex items-center justify-between p-4 bg-white/90 backdrop-blur-sm border-b border-[#C9B8A8]/40 sticky top-0 z-50 shadow-sm">
        <span className="font-serif text-[clamp(15px,4.2vw,18px)] font-bold text-[#1A1A1A] tracking-wider truncate whitespace-nowrap">
          {webSettings?.storeName || 'EL ROPERO'}
        </span>
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-2 border border-[#C9B8A8]/50 rounded-lg text-[#1A1A1A] hover:bg-[#C9B8A8]/10 transition-colors"
        >
          {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {isMobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-white/95 backdrop-blur-sm pt-20 px-6 flex flex-col overflow-y-auto pb-6">
          <SidebarContent collapsed={false} />
        </div>
      )}

      <main className={`flex-1 transition-all duration-300 ease-in-out p-4 md:p-6 overflow-auto ${isCollapsed ? 'md:ml-[76px]' : 'md:ml-64'}`}>
        <div className="max-w-full mx-auto h-full">{children}</div>
      </main>
    </div>
    </>
  );
};

export default Layout;
