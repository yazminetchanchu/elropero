import React, { useEffect, useState } from 'react';
import { Wifi, WifiOff } from 'lucide-react';

const NetworkStatus: React.FC = () => {
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [show, setShow] = useState<boolean>(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setShow(true);
      // Auto hide online notification after 3 seconds
      const timer = setTimeout(() => {
        setShow(false);
      }, 3000);
      return () => clearTimeout(timer);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setShow(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // If starting offline, show it immediately
    if (!navigator.onLine) {
      setShow(true);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!show && isOnline) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] px-6 w-full max-w-md animate-slide-up">
      <style>{`
        @keyframes slideUp {
          from {
            transform: translate(-50%, 100%);
            opacity: 0;
          }
          to {
            transform: translate(-50%, 0);
            opacity: 1;
          }
        }
        .animate-slide-up {
          animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .pulse-amber {
          animation: pulseAmber 2s infinite;
        }
        .pulse-emerald {
          animation: pulseEmerald 2s infinite;
        }
        @keyframes pulseAmber {
          0% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.4); }
          70% { box-shadow: 0 0 0 6px rgba(245, 158, 11, 0); }
          100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0); }
        }
        @keyframes pulseEmerald {
          0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.4); }
          70% { box-shadow: 0 0 0 6px rgba(16, 185, 129, 0); }
          100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
        }
      `}</style>

      {isOnline ? (
        // Connected Elegant Toast
        <div className="flex items-center gap-4 p-4 rounded-xl border border-emerald-500/20 bg-zinc-950/90 text-white shadow-2xl backdrop-blur-md transition-all duration-300">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400">
            <Wifi size={16} />
          </div>
          <div className="flex-grow">
            <p className="text-[10px] tracking-[3px] uppercase font-semibold text-emerald-400">Conexión Restaurada</p>
            <p className="text-[11px] tracking-[0.5px] uppercase font-light text-zinc-300">Sincronizando catálogo...</p>
          </div>
          <div className="flex-shrink-0 w-2.5 h-2.5 rounded-full bg-emerald-500 pulse-emerald" />
        </div>
      ) : (
        // Disconnected Elegant Toast
        <div className="flex items-center gap-4 p-4 rounded-xl border border-amber-500/20 bg-zinc-950/90 text-white shadow-2xl backdrop-blur-md transition-all duration-300">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-400">
            <WifiOff size={16} />
          </div>
          <div className="flex-grow">
            <p className="text-[10px] tracking-[3px] uppercase font-semibold text-amber-400">Modo Offline</p>
            <p className="text-[11px] tracking-[0.5px] uppercase font-light text-zinc-300">Sin conexión. Los datos se guardan localmente.</p>
          </div>
          <div className="flex-shrink-0 w-2.5 h-2.5 rounded-full bg-amber-500 pulse-amber" />
        </div>
      )}
    </div>
  );
};

export default NetworkStatus;
