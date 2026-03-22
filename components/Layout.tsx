import React from 'react';
import { Section } from '../types';
import { LayoutDashboard, ShoppingBag, PackagePlus, WalletMinimal, LogOut, Menu, X, Gift, RefreshCw } from 'lucide-react';

interface LayoutProps {
  currentSection: Section;
  setSection: (section: Section) => void;
  onLogout: () => void;
  children: React.ReactNode;
  isSyncing?: boolean;
  onForceSync?: () => void;
}

const Layout: React.FC<LayoutProps> = ({ currentSection, setSection, onLogout, children, isSyncing = false, onForceSync }) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);

  const menuItems = [
    { id: 'admin', label: 'PANEL', icon: LayoutDashboard },
    { id: 'ventas', label: 'CAJA', icon: ShoppingBag },
    { id: 'stock', label: 'STOCK', icon: PackagePlus },
    { id: 'gastos', label: 'EGRESOS', icon: WalletMinimal },
    { id: 'giftcards', label: 'GIFT CARDS', icon: Gift },
  ];

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-[#F5F1EB]">
      {/* Sidebar Desktop */}
      <aside className="hidden md:flex w-64 flex-col border-r border-[#C9B8A8]/40 bg-white/80 backdrop-blur-sm p-6 fixed h-full z-30 shadow-sm">
        <div className="mb-12">
          <h1 className="font-serif text-2xl uppercase text-[#1A1A1A] italic tracking-wider">EL ROPERO</h1>
        </div>

        <nav className="flex-1 space-y-2">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setSection(item.id as Section)}
              className={`w-full text-left py-3.5 px-4 flex items-center gap-3 rounded-lg transition-all text-[10px] tracking-[2px] font-medium ${
                currentSection === item.id
                  ? 'bg-[#C9B8A8] text-[#1A1A1A] shadow-md translate-x-1'
                  : 'bg-transparent text-[#1A1A1A]/80 border border-transparent hover:bg-[#C9B8A8]/20 hover:border-[#C9B8A8]/30 hover:translate-x-1'
              }`}
            >
              <item.icon size={16} />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="mt-auto space-y-2.5">
          {onForceSync && (
            <button
              onClick={onForceSync}
              disabled={isSyncing}
              className="w-full py-3 px-4 flex items-center gap-3 text-[10px] tracking-[2px] font-medium border border-[#C9B8A8]/50 rounded-lg hover:bg-[#C9B8A8]/15 hover:border-[#C9B8A8] transition-all uppercase text-[#1A1A1A] disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
              title="Sincronizar con Firebase"
            >
              <RefreshCw size={16} className={isSyncing ? "animate-spin" : ""} /> 
              {isSyncing ? 'Sincronizando...' : 'Sincronizar'}
            </button>
          )}
          <button
            onClick={onLogout}
            className="w-full py-3.5 px-4 flex items-center gap-3 text-[10px] tracking-[2px] font-medium border border-[#C9B8A8]/50 rounded-lg hover:bg-red-50/80 hover:border-red-200 hover:text-red-700 transition-all uppercase group text-[#1A1A1A] shadow-sm"
          >
            <LogOut size={16} className="group-hover:-translate-x-1 transition-transform" /> Salir
          </button>
        </div>
      </aside>

      {/* Mobile Nav */}
      <div className="md:hidden flex items-center justify-between p-4 bg-white/90 backdrop-blur-sm border-b border-[#C9B8A8]/40 sticky top-0 z-50 shadow-sm">
        <span className="font-serif text-lg font-bold text-[#1A1A1A] tracking-wider">EL ROPERO</span>
        <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-2 border border-[#C9B8A8]/50 rounded-lg text-[#1A1A1A] hover:bg-[#C9B8A8]/10 transition-colors">
          {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {isMobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-white/95 backdrop-blur-sm pt-20 px-6 animate-in slide-in-from-top duration-300">
          <nav className="space-y-3">
            {menuItems.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setSection(item.id as Section);
                  setIsMobileMenuOpen(false);
                }}
                className={`w-full text-left py-4 px-6 flex items-center gap-4 rounded-lg text-[11px] tracking-[2px] font-medium transition-all ${
                  currentSection === item.id 
                    ? 'bg-[#C9B8A8] text-[#1A1A1A] shadow-md' 
                    : 'bg-transparent border border-[#C9B8A8]/30 text-[#1A1A1A] hover:bg-[#C9B8A8]/15'
                }`}
              >
                <item.icon size={18} />
                {item.label}
              </button>
            ))}
          </nav>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 md:ml-64 p-4 md:p-6 overflow-auto">
        <div className="max-w-full mx-auto h-full">{children}</div>
      </main>
    </div>
  );
};

export default Layout;
