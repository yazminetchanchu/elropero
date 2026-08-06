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
      <div className="relative bg-white w-full max-w-[440px] px-8 py-12 sm:px-12 sm:py-16 shadow-2xl flex flex-col max-h-[90vh] overflow-y-auto no-scrollbar animate-in fade-in zoom-in duration-300">
        
        {/* Close Button */}
        <button 
          onClick={onClose} 
          disabled={isLoading}
          className="absolute top-6 right-6 opacity-40 hover:opacity-100 transition-opacity disabled:opacity-10"
        >
          <X size={20} strokeWidth={1.5} />
        </button>

        {/* Brand / Logo */}
        <div className="text-center space-y-2 mb-12">
          <p className="text-[9px] tracking-[6px] uppercase opacity-40 font-light">E-commerce</p>
          <h2 className="text-[18px] sm:text-[22px] tracking-[10px] sm:tracking-[14px] uppercase font-semibold leading-none text-black">
            MI CUENTA
          </h2>
        </div>

        {/* Tab Headers */}
        {tab !== 'forgot' && (
          <div className="flex border-b border-black/5 mb-10">
            <button
              onClick={() => { setTab('login'); setErrorMsg(null); }}
              className={`w-1/2 text-center pb-4 text-[10px] tracking-[3px] uppercase font-medium transition-all ${
                tab === 'login' 
                  ? 'border-b border-black font-semibold text-black' 
                  : 'opacity-40 hover:opacity-100 text-black'
              }`}
            >
              Ingresar
            </button>
            <button
              onClick={() => { setTab('register'); setErrorMsg(null); }}
              className={`w-1/2 text-center pb-4 text-[10px] tracking-[3px] uppercase font-medium transition-all ${
                tab === 'register' 
                  ? 'border-b border-black font-semibold text-black' 
                  : 'opacity-40 hover:opacity-100 text-black'
              }`}
            >
              Registrarse
            </button>
          </div>
        )}

        {/* Form Title for Recovery */}
        {tab === 'forgot' && (
          <div className="mb-8">
            <h3 className="text-[11px] tracking-[3px] uppercase font-semibold text-black mb-2">Recuperar Contraseña</h3>
            <p className="text-[11px] tracking-[0.5px] text-black/50 leading-relaxed uppercase">
              Ingresá tu correo y te enviaremos un enlace para restablecer tu contraseña.
            </p>
          </div>
        )}

        {/* Errors & Success */}
        {errorMsg && (
          <div className="mb-6 flex items-start gap-3 bg-red-50 text-red-700 p-4 border-l-2 border-red-500 animate-in fade-in slide-in-from-top-1 duration-200">
            <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
            <p className="text-[10px] tracking-[1px] leading-relaxed uppercase">{errorMsg}</p>
          </div>
        )}

        {successMsg && (
          <div className="mb-6 flex items-start gap-3 bg-neutral-50 text-black p-4 border-l-2 border-black animate-in fade-in slide-in-from-top-1 duration-200">
            <CheckCircle size={14} className="mt-0.5 flex-shrink-0 text-black" />
            <p className="text-[10px] tracking-[1px] leading-relaxed uppercase">{successMsg}</p>
          </div>
        )}

        {/* Auth Forms */}
        <form onSubmit={handleSubmit} className="space-y-8">
          {tab === 'register' && (
            <div className="relative group">
              <label className="block text-[9px] font-medium uppercase tracking-[3px] text-black/40 mb-2 transition-colors group-focus-within:text-black">
                Nombre Completo *
              </label>
              <input
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                required
                disabled={isLoading}
                placeholder="EJ. SOFÍA PÉREZ"
                className="w-full bg-transparent border-b border-black/10 py-3 text-[12px] focus:outline-none focus:border-black tracking-[2px] uppercase text-black placeholder:text-black/10 transition-all disabled:opacity-50"
              />
            </div>
          )}

          <div className="relative group">
            <label className="block text-[9px] font-medium uppercase tracking-[3px] text-black/40 mb-2 transition-colors group-focus-within:text-black">
              Correo Electrónico *
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={isLoading}
              placeholder="EJEMPLO@CORREO.COM"
              className="w-full bg-transparent border-b border-black/10 py-3 text-[12px] focus:outline-none focus:border-black tracking-[2px] text-black placeholder:text-black/10 transition-all disabled:opacity-50"
            />
          </div>

          {tab !== 'forgot' && (
            <div className="relative group">
              <div className="flex justify-between items-baseline mb-2">
                <label className="block text-[9px] font-medium uppercase tracking-[3px] text-black/40 transition-colors group-focus-within:text-black">
                  Contraseña *
                </label>
                {tab === 'login' && (
                  <button 
                    type="button"
                    onClick={() => { setTab('forgot'); setErrorMsg(null); }}
                    className="text-[9px] tracking-[2px] uppercase opacity-40 hover:opacity-100 hover:underline transition-opacity"
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
                className="w-full bg-transparent border-b border-black/10 py-3 text-[12px] focus:outline-none focus:border-black tracking-[4px] text-black placeholder:text-black/10 transition-all disabled:opacity-50"
              />
            </div>
          )}

          {tab === 'register' && (
            <div className="relative group">
              <label className="block text-[9px] font-medium uppercase tracking-[3px] text-black/40 mb-2 transition-colors group-focus-within:text-black">
                Teléfono de Contacto (Opcional)
              </label>
              <input
                type="tel"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                disabled={isLoading}
                placeholder="EJ. 11 1234-5678"
                className="w-full bg-transparent border-b border-black/10 py-3 text-[12px] focus:outline-none focus:border-black tracking-[2px] uppercase text-black placeholder:text-black/10 transition-all disabled:opacity-50"
              />
            </div>
          )}

          {/* Form Actions */}
          <div className="space-y-4 pt-4">
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-black text-white py-5 text-[11px] tracking-[4px] uppercase font-medium hover:bg-neutral-800 transition-all flex items-center justify-center gap-4 disabled:opacity-30"
            >
              {isLoading ? (
                <Loader2 className="animate-spin" size={14} strokeWidth={1.5} />
              ) : (
                <>
                  {tab === 'login' && 'Ingresar'}
                  {tab === 'register' && 'Crear Cuenta'}
                  {tab === 'forgot' && 'Enviar Email'}
                  <ArrowRight size={13} />
                </>
              )}
            </button>

            {/* Recovery Cancel Button */}
            {tab === 'forgot' && (
              <button
                type="button"
                onClick={() => { setTab('login'); setErrorMsg(null); }}
                disabled={isLoading}
                className="w-full border border-black/10 text-black py-4 text-[10px] tracking-[3px] uppercase font-medium hover:border-black hover:bg-neutral-50 transition-all flex items-center justify-center disabled:opacity-30"
              >
                Volver a Iniciar Sesión
              </button>
            )}
          </div>
        </form>

        {/* Social / OAuth Divider */}
        {tab !== 'forgot' && (
          <div className="mt-8 space-y-6">
            <div className="relative flex py-2 items-center">
              <div className="flex-grow border-t border-black/5"></div>
              <span className="flex-shrink mx-4 text-[9px] tracking-[3px] uppercase text-black/30 font-medium">O</span>
              <div className="flex-grow border-t border-black/5"></div>
            </div>

            <button
              onClick={handleGoogleSignIn}
              disabled={isLoading}
              className="w-full border border-black/15 bg-white text-black py-4 text-[10px] tracking-[3px] uppercase font-medium hover:border-black hover:bg-neutral-50 transition-all flex items-center justify-center gap-3 disabled:opacity-30"
            >
              {/* Simple Google SVG Icon */}
              <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24">
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
          <div className="mt-8 border-t border-black/5 pt-8 text-center space-y-4">
            <p className="text-[10px] tracking-[1px] uppercase text-black/40">
              ¿No querés crear una cuenta todavía?
            </p>
            <button
              onClick={onContinueAsGuest}
              disabled={isLoading}
              className="w-full border border-dashed border-black/20 text-black py-4 text-[10px] tracking-[3px] uppercase font-medium hover:border-black hover:bg-neutral-50/50 transition-all flex items-center justify-center"
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
