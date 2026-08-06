import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { AlertTriangle, CheckCircle, Info, XCircle, X } from 'lucide-react';

export type ModalType = 'error' | 'warning' | 'success' | 'info';
export type ModalMode = 'alert' | 'confirm';

export interface ModalOptions {
  title?: string;
  type?: ModalType;
}

export interface ModalContextType {
  showAlert: (message: string, title?: string, type?: ModalType) => Promise<void>;
  showConfirm: (message: string, title?: string, type?: ModalType) => Promise<boolean>;
}

const ModalContext = createContext<ModalContextType | null>(null);

interface QueuedModal {
  mode: ModalMode;
  message: string;
  title?: string;
  type: ModalType;
  resolve: (value: any) => void;
}

export const ModalProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeModal, setActiveModal] = useState<QueuedModal | null>(null);
  const queueRef = useRef<QueuedModal[]>([]);

  const processQueue = useCallback(() => {
    if (activeModal || queueRef.current.length === 0) return;
    const nextModal = queueRef.current.shift() || null;
    setActiveModal(nextModal);
  }, [activeModal]);

  useEffect(() => {
    processQueue();
  }, [activeModal, processQueue]);

  const showAlert = useCallback((message: string, title?: string, type: ModalType = 'info'): Promise<void> => {
    return new Promise((resolve) => {
      queueRef.current.push({
        mode: 'alert',
        message,
        title,
        type,
        resolve: () => {
          setActiveModal(null);
          resolve();
        }
      });
      if (!activeModal) {
        processQueue();
      }
    });
  }, [activeModal, processQueue]);

  const showConfirm = useCallback((message: string, title?: string, type: ModalType = 'warning'): Promise<boolean> => {
    return new Promise((resolve) => {
      queueRef.current.push({
        mode: 'confirm',
        message,
        title,
        type,
        resolve: (val: boolean) => {
          setActiveModal(null);
          resolve(val);
        }
      });
      if (!activeModal) {
        processQueue();
      }
    });
  }, [activeModal, processQueue]);

  // Global override for window.alert so third-party or unrefactored alerts show as modals
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const originalAlert = window.alert;
      window.alert = (msg?: any) => {
        showAlert(String(msg || ''));
      };
      return () => {
        window.alert = originalAlert;
      };
    }
  }, [showAlert]);

  // Handle keyboard interaction (Escape to close/cancel, Enter to accept)
  useEffect(() => {
    if (!activeModal) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (activeModal.mode === 'confirm') {
          activeModal.resolve(false);
        } else {
          activeModal.resolve(undefined);
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (activeModal.mode === 'confirm') {
          activeModal.resolve(true);
        } else {
          activeModal.resolve(undefined);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeModal]);

  const getIcon = (type: ModalType) => {
    switch (type) {
      case 'error':
        return <XCircle size={22} strokeWidth={1.75} className="text-red-600" />;
      case 'warning':
        return <AlertTriangle size={22} strokeWidth={1.75} className="text-amber-600" />;
      case 'success':
        return <CheckCircle size={22} strokeWidth={1.75} className="text-emerald-600" />;
      case 'info':
      default:
        return <Info size={22} strokeWidth={1.75} className="text-neutral-700" />;
    }
  };

  const getIconContainerStyle = (type: ModalType) => {
    switch (type) {
      case 'error':
        return 'bg-red-50 border-red-100';
      case 'warning':
        return 'bg-amber-50 border-amber-100';
      case 'success':
        return 'bg-emerald-50 border-emerald-100';
      case 'info':
      default:
        return 'bg-neutral-100 border-neutral-200';
    }
  };

  const getDefaultTitle = (type: ModalType, mode: ModalMode) => {
    if (mode === 'confirm') return 'CONFIRMACIÓN';
    switch (type) {
      case 'error':
        return 'ERROR';
      case 'warning':
        return 'ATENCIÓN';
      case 'success':
        return '¡ÉXITO!';
      case 'info':
      default:
        return 'AVISO';
    }
  };

  const getConfirmButtonStyle = (type: ModalType) => {
    switch (type) {
      case 'error':
        return 'bg-red-600 hover:bg-red-700 text-white';
      case 'warning':
        return 'bg-black hover:bg-neutral-800 text-white';
      case 'success':
        return 'bg-emerald-600 hover:bg-emerald-700 text-white';
      case 'info':
      default:
        return 'bg-black hover:bg-neutral-800 text-white';
    }
  };

  return (
    <ModalContext.Provider value={{ showAlert, showConfirm }}>
      {children}
      {activeModal && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 font-['Inter'] select-none animate-in fade-in duration-200">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-xs" 
            onClick={() => {
              if (activeModal.mode === 'confirm') {
                activeModal.resolve(false);
              } else {
                activeModal.resolve(undefined);
              }
            }}
          />

          {/* Modal Box */}
          <div className="relative bg-white w-full max-w-[420px] p-8 sm:p-10 shadow-2xl flex flex-col animate-in zoom-in-95 duration-200 border border-black/10 rounded-sm z-10">
            {/* Close Button */}
            <button 
              onClick={() => {
                if (activeModal.mode === 'confirm') {
                  activeModal.resolve(false);
                } else {
                  activeModal.resolve(undefined);
                }
              }}
              className="absolute top-5 right-5 text-black/40 hover:text-black transition-colors p-1"
            >
              <X size={18} strokeWidth={1.5} />
            </button>

            {/* Icon + Title */}
            <div className="text-center space-y-4 mb-6">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto border ${getIconContainerStyle(activeModal.type)}`}>
                {getIcon(activeModal.type)}
              </div>
              <div className="space-y-1">
                <h3 className="text-[12px] tracking-[3px] uppercase font-bold text-black">
                  {activeModal.title || getDefaultTitle(activeModal.type, activeModal.mode)}
                </h3>
              </div>
            </div>

            {/* Message Body */}
            <div className="text-center mb-8 px-2">
              <p className="text-[11px] tracking-[0.5px] text-black/75 leading-relaxed whitespace-pre-line font-normal">
                {activeModal.message}
              </p>
            </div>

            {/* Buttons */}
            <div className="flex items-center justify-center gap-3">
              {activeModal.mode === 'confirm' ? (
                <>
                  <button
                    onClick={() => activeModal.resolve(false)}
                    className="flex-1 py-3 px-4 border border-black/20 text-black/70 hover:text-black hover:border-black transition-all text-[10px] tracking-[2px] uppercase font-semibold rounded-sm"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => activeModal.resolve(true)}
                    className={`flex-1 py-3 px-4 transition-all text-[10px] tracking-[2px] uppercase font-semibold shadow-md rounded-sm ${getConfirmButtonStyle(activeModal.type)}`}
                  >
                    Confirmar
                  </button>
                </>
              ) : (
                <button
                  onClick={() => activeModal.resolve(undefined)}
                  className={`w-full py-3 px-6 transition-all text-[10px] tracking-[2px] uppercase font-semibold shadow-md rounded-sm ${getConfirmButtonStyle(activeModal.type)}`}
                >
                  Entendido
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </ModalContext.Provider>
  );
};

export const useModal = (): ModalContextType => {
  const context = useContext(ModalContext);
  if (!context) {
    return {
      showAlert: async (message: string, _title?: string, _type?: ModalType) => {
        if (typeof window !== 'undefined' && window.alert) {
          window.alert(message);
        }
      },
      showConfirm: async (message: string, _title?: string, _type?: ModalType) => {
        if (typeof window !== 'undefined' && window.confirm) {
          return window.confirm(message);
        }
        return false;
      }
    };
  }
  return context;
};
