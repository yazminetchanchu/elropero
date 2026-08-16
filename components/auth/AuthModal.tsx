import React from 'react';
import { X, Loader2, ArrowRight, CheckCircle, Mail, AlertCircle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { sendNotificationEmail } from '../../services/emailService';
import { sanitizeInput } from '../../utils/sanitize';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onContinueAsGuest?: () => void; // Si se abre en checkout, permite comprar como invitado
}

type TabType = 'login' | 'register' | 'forgot';

const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onContinueAsGuest }) => {
  const { loginWithEmail, signUpWithEmail, loginWithGoogle, resetPassword } = useAuth();
  
  const [tab, setTab] = React.useState<TabType>('login');
  
  // Form fields
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [nombre, setNombre] = React.useState('');
  const [telefono, setTelefono] = React.useState('');
  
  // UI States
  const [isLoading, setIsLoading] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [successMsg, setSuccessMsg] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (isOpen) {
      // Reset states
      setEmail('');
      setPassword('');
      setNombre('');
      setTelefono('');
      setErrorMsg(null);
      setSuccessMsg(null);
      setTab('login');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setIsLoading(true);

    try {
      if (tab === 'login') {
        if (!email.trim() || !password) {
          throw new Error('Por favor, completa todos los campos.');
        }
        await loginWithEmail(email.trim(), password);
        onClose();
      } else if (tab === 'register') {
        if (!email.trim() || !password || !nombre.trim()) {
          throw new Error('Por favor, completa los campos requeridos (Email, Contraseña y Nombre).');
        }
        if (password.length < 6) {
          throw new Error('La contraseña debe tener al menos 6 caracteres.');
        }
        await signUpWithEmail(email.trim(), password, sanitizeInput(nombre.trim()), sanitizeInput(telefono.trim()));
        onClose();
      } else if (tab === 'forgot') {
        if (!email.trim()) {
          throw new Error('Por favor, ingresá tu correo electrónico.');
        }
        await resetPassword(email.trim());
        try {
          await sendNotificationEmail(
            'Recuperación de Contraseña Solicitada',
            `Se ha solicitado un enlace de restablecimiento de contraseña para la cuenta de cliente: ${email.trim()}`
          );
        } catch (mailErr) {
          console.error('Error al notificar al showroom:', mailErr);
        }
        setSuccessMsg('Enlace de recuperación enviado. Revisa tu casilla de correo.');
        setTimeout(() => setTab('login'), 4000);
      }
    } catch (error: any) {
      console.error('Error de autenticación:', error);
      let friendlyMessage = 'Ocurrió un error inesperado. Por favor, reintentá.';
      
      const code = error?.code || error?.message;
      if (code === 'auth/user-not-found' || code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        friendlyMessage = 'Credenciales inválidas. Verifica tu correo y contraseña.';
      } else if (code === 'auth/email-already-in-use') {
        friendlyMessage = 'El correo electrónico ya está registrado en el sistema.';
      } else if (code === 'auth/invalid-email') {
        friendlyMessage = 'El formato del correo electrónico es inválido.';
      } else if (code === 'auth/weak-password') {
        friendlyMessage = 'La contraseña es muy débil. Debe tener al menos 6 caracteres.';
      } else if (error instanceof Error) {
        friendlyMessage = error.message;
      }
      
      setErrorMsg(friendlyMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setErrorMsg(null);
    setIsLoading(true);
    try {
      await loginWithGoogle();
      onClose();
    } catch (error: any) {
      console.error('Google Sign In Error:', error);
      if (error?.code !== 'auth/popup-closed-by-user') {
        setErrorMsg('Error al conectar con Google. Por favor, reintente.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 sm:p-6 select-none font-['Inter'] overflow-y-auto py-10">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300"
        onClick={() => { if (!isLoading) onClose(); }} 
      />

      {/* Main Container */}
      <div className="relative bg-white w-full max-w-[420px] px-6 py-10 sm:px-10 sm:py-12 shadow-xl flex flex-col max-h-[90vh] overflow-y-auto no-scrollbar animate-in fade-in duration-200 border border-black/10 rounded-none">
        
        {/* Close Button */}
        <button 
          onClick={onClose} 
          disabled={isLoading}
          className="absolute top-5 right-5 opacity-40 hover:opacity-100 transition-opacity disabled:opacity-10"
        >
          <X size={18} strokeWidth={1.2} />
        </button>

        {/* Brand / Logo */}
        <div className="text-center space-y-1 mb-8">
          <p className="text-[8px] tracking-[0.3em] uppercase text-neutral-400 font-light">Showroom</p>
          <h2 className="text-sm sm:text-base tracking-[0.25em] uppercase font-light leading-none text-black">
            MI CUENTA
          </h2>
        </div>

        {/* Tab Headers */}
        {tab !== 'forgot' && (
          <div className="flex border-b border-neutral-200 mb-8">
            <button
              onClick={() => { setTab('login'); setErrorMsg(null); }}
              className={`w-1/2 text-center pb-3 text-[10px] tracking-[0.2em] uppercase transition-all ${
                tab === 'login' 
                  ? 'border-b border-black font-normal text-black' 
                  : 'text-neutral-400 hover:text-black font-light'
              }`}
            >
              Ingresar
            </button>
            <button
              onClick={() => { setTab('register'); setErrorMsg(null); }}
              className={`w-1/2 text-center pb-3 text-[10px] tracking-[0.2em] uppercase transition-all ${
                tab === 'register' 
                  ? 'border-b border-black font-normal text-black' 
                  : 'text-neutral-400 hover:text-black font-light'
              }`}
            >
              Registrarse
            </button>
          </div>
        )}

        {/* Form Title for Recovery */}
        {tab === 'forgot' && (
          <div className="mb-6">
            <h3 className="text-xs tracking-[0.2em] uppercase font-light text-black mb-1.5">Recuperar Contraseña</h3>
            <p className="text-[10px] tracking-[0.1em] text-neutral-500 leading-relaxed uppercase font-light">
              Ingresá tu correo y te enviaremos un enlace para restablecer tu contraseña.
            </p>
          </div>
        )}

        {/* Errors & Success */}
        {errorMsg && (
          <div className="mb-5 flex items-start gap-2.5 bg-neutral-50 text-neutral-900 p-3 border-l-2 border-black animate-in fade-in duration-200">
            <AlertCircle size={13} className="mt-0.5 flex-shrink-0 text-neutral-800" />
            <p className="text-[9px] tracking-[0.1em] leading-relaxed uppercase font-light">{errorMsg}</p>
          </div>
        )}

        {successMsg && (
          <div className="mb-5 flex items-start gap-2.5 bg-neutral-50 text-black p-3 border-l-2 border-black animate-in fade-in duration-200">
            <CheckCircle size={13} className="mt-0.5 flex-shrink-0 text-black" />
            <p className="text-[9px] tracking-[0.1em] leading-relaxed uppercase font-light">{successMsg}</p>
          </div>
        )}

        {/* Auth Forms */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {tab === 'register' && (
            <div className="relative group">
              <label className="block text-[8px] font-light uppercase tracking-[0.25em] text-neutral-400 mb-1">
                Nombre Completo *
              </label>
              <input
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                required
                disabled={isLoading}
                placeholder="EJ. SOFÍA PÉREZ"
                className="w-full bg-transparent border-b border-neutral-200 py-2.5 text-[11px] font-light focus:outline-none focus:border-black tracking-[0.15em] uppercase text-black placeholder:text-neutral-300 transition-all disabled:opacity-50"
              />
            </div>
          )}

          <div className="relative group">
            <label className="block text-[8px] font-light uppercase tracking-[0.25em] text-neutral-400 mb-1">
              Correo Electrónico *
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={isLoading}
              placeholder="EJEMPLO@CORREO.COM"
              className="w-full bg-transparent border-b border-neutral-200 py-2.5 text-[11px] font-light focus:outline-none focus:border-black tracking-[0.15em] text-black placeholder:text-neutral-300 transition-all disabled:opacity-50"
            />
          </div>

          {tab !== 'forgot' && (
            <div className="relative group">
              <div className="flex justify-between items-baseline mb-1">
                <label className="block text-[8px] font-light uppercase tracking-[0.25em] text-neutral-400">
                  Contraseña *
                </label>
                {tab === 'login' && (
                  <button 
                    type="button"
                    onClick={() => { setTab('forgot'); setErrorMsg(null); }}
                    className="text-[8px] tracking-[0.2em] uppercase text-neutral-400 hover:text-black underline transition-colors font-light"
                  >
                    ¿La olvidaste?
                  </button>
                )}
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
                placeholder="••••••••"
                className="w-full bg-transparent border-b border-neutral-200 py-2.5 text-[11px] font-light focus:outline-none focus:border-black tracking-[0.25em] text-black placeholder:text-neutral-300 transition-all disabled:opacity-50"
              />
            </div>
          )}

          {tab === 'register' && (
            <div className="relative group">
              <label className="block text-[8px] font-light uppercase tracking-[0.25em] text-neutral-400 mb-1">
                Teléfono de Contacto (Opcional)
              </label>
              <input
                type="tel"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                disabled={isLoading}
                placeholder="EJ. 11 1234-5678"
                className="w-full bg-transparent border-b border-neutral-200 py-2.5 text-[11px] font-light focus:outline-none focus:border-black tracking-[0.15em] uppercase text-black placeholder:text-neutral-300 transition-all disabled:opacity-50"
              />
            </div>
          )}

          {/* Form Actions */}
          <div className="space-y-3 pt-2">
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-black text-white py-3 text-[10px] tracking-[0.25em] uppercase font-light hover:bg-neutral-800 transition-all flex items-center justify-center gap-2 rounded-none disabled:opacity-30"
            >
              {isLoading ? (
                <Loader2 className="animate-spin" size={13} strokeWidth={1.2} />
              ) : (
                <>
                  {tab === 'login' && 'Ingresar'}
                  {tab === 'register' && 'Crear Cuenta'}
                  {tab === 'forgot' && 'Enviar Email'}
                  <ArrowRight size={12} />
                </>
              )}
            </button>

            {/* Recovery Cancel Button */}
            {tab === 'forgot' && (
              <button
                type="button"
                onClick={() => { setTab('login'); setErrorMsg(null); }}
                disabled={isLoading}
                className="w-full border border-neutral-300 text-black py-2.5 text-[9px] tracking-[0.2em] uppercase font-light hover:border-black transition-all flex items-center justify-center rounded-none disabled:opacity-30"
              >
                Volver a Iniciar Sesión
              </button>
            )}
          </div>
        </form>

        {/* Social / OAuth Divider */}
        {tab !== 'forgot' && (
          <div className="mt-6 space-y-4">
            <div className="relative flex py-1 items-center">
              <div className="flex-grow border-t border-neutral-200"></div>
              <span className="flex-shrink mx-3 text-[8px] tracking-[0.25em] uppercase text-neutral-400 font-light">O</span>
              <div className="flex-grow border-t border-neutral-200"></div>
            </div>

            <button
              onClick={handleGoogleSignIn}
              disabled={isLoading}
              className="w-full border border-neutral-300 bg-white text-black py-2.5 text-[9px] tracking-[0.2em] uppercase font-light hover:border-black transition-all flex items-center justify-center gap-2 rounded-none disabled:opacity-30"
            >
              <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v3.92h6.69a5.74 5.74 0 0 1-2.5 3.77v3.13h4.03c2.36-2.17 3.72-5.37 3.72-8.75Z"/>
                <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-4.03-3.13c-1.12.75-2.55 1.19-3.9 1.19-3.03 0-5.6-2.05-6.51-4.82H1.31v3.23A12.02 12.02 0 0 0 12 24Z"/>
                <path fill="#FBBC05" d="M5.49 14.33c-.24-.71-.38-1.47-.38-2.25s.14-1.54.38-2.25V6.6H1.31A12.01 12.01 0 0 0 0 12c0 1.95.47 3.79 1.31 5.4l4.18-3.07Z"/>
                <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.43-3.43C17.95 1.19 15.24 0 12 0 7.31 0 3.28 2.69 1.31 6.6l4.18 3.07c.91-2.77 3.48-4.82 6.51-4.82Z"/>
              </svg>
              Google
            </button>
          </div>
        )}

        {/* Continue as Guest Button (For Checkout Flow) */}
        {onContinueAsGuest && tab !== 'forgot' && (
          <div className="mt-6 border-t border-neutral-100 pt-6 text-center space-y-3">
            <p className="text-[9px] tracking-[0.1em] uppercase text-neutral-400 font-light">
              ¿Comprar sin iniciar sesión?
            </p>
            <button
              onClick={onContinueAsGuest}
              disabled={isLoading}
              className="w-full border border-black/20 text-black py-2.5 text-[9px] tracking-[0.2em] uppercase font-light hover:border-black transition-all flex items-center justify-center rounded-none"
            >
              Comprar como Invitado
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default AuthModal;
