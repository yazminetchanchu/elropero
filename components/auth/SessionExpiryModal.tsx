import React from 'react';
import { X, Lock, Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

interface SessionExpiryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SessionExpiryModal: React.FC<SessionExpiryModalProps> = ({ isOpen, onClose }) => {
  const { user, reauthenticate } = useAuth();
  const [password, setPassword] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState(false);

  React.useEffect(() => {
    if (isOpen) {
      setPassword('');
      setErrorMsg(null);
      setSuccess(false);
    }
  }, [isOpen]);

  if (!isOpen || !user) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;

    setIsLoading(true);
    setErrorMsg(null);

    try {
      const ok = await reauthenticate(password);
      if (ok) {
        setSuccess(true);
        setTimeout(() => {
          onClose();
        }, 1500);
      } else {
        setErrorMsg('La contraseña ingresada es incorrecta.');
      }
    } catch (e: any) {
      console.error(e);
      setErrorMsg('Error de conexión. Intente nuevamente.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 font-['Inter'] select-none">
      {/* Dark backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-xs" />

      {/* Modal Box */}
      <div className="relative bg-white w-full max-w-[400px] p-8 sm:p-10 shadow-2xl flex flex-col animate-in fade-in zoom-in duration-300">
        
        {/* Close Button */}
        {!isLoading && !success && (
          <button 
            onClick={onClose}
            className="absolute top-6 right-6 opacity-40 hover:opacity-100 transition-opacity"
          >
            <X size={18} strokeWidth={1.5} />
          </button>
        )}

        <div className="text-center space-y-4 mb-8">
          <div className="w-12 h-12 bg-neutral-100 rounded-full flex items-center justify-center mx-auto text-black">
            <Lock size={20} strokeWidth={1.5} />
          </div>
          <div className="space-y-1">
            <h3 className="text-[12px] tracking-[3px] uppercase font-bold text-black">Sesión Expirada</h3>
            <p className="text-[10px] tracking-[0.5px] uppercase text-black/50 leading-relaxed max-w-[280px] mx-auto">
              Por tu seguridad, ingresá tu contraseña nuevamente para continuar con tu compra.
            </p>
          </div>
        </div>

        {errorMsg && (
          <div className="mb-6 flex items-start gap-2 bg-red-50 text-red-700 p-4 border-l-2 border-red-500 animate-in fade-in duration-200">
            <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
            <p className="text-[9px] tracking-[1px] leading-relaxed uppercase">{errorMsg}</p>
          </div>
        )}

        {success ? (
          <div className="flex flex-col items-center gap-3 bg-neutral-50 p-6 border border-black text-black">
            <CheckCircle size={18} strokeWidth={1.5} className="text-black" />
            <p className="text-[9px] tracking-[2px] uppercase font-bold text-center">¡Verificado con éxito! Continuando...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="group text-left">
              <label className="block text-[8px] font-medium uppercase tracking-[2px] text-black/40 mb-2 transition-colors group-focus-within:text-black">
                Contraseña de Cuenta
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
                placeholder="••••••••"
                className="w-full bg-transparent border-b border-black/10 py-2.5 text-[12px] focus:outline-none focus:border-black tracking-[4px] text-black placeholder:text-black/10 text-center"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading || !password}
              className="w-full bg-black text-white py-4.5 text-[10px] tracking-[3px] uppercase font-semibold hover:bg-neutral-800 transition-colors flex items-center justify-center gap-2 disabled:opacity-30"
            >
              {isLoading ? (
                <Loader2 className="animate-spin" size={12} />
              ) : (
                'Confirmar Contraseña'
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default SessionExpiryModal;
