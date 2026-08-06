import React from 'react';
import { Loader2, CheckCircle, AlertCircle, ArrowRight, Eye, EyeOff, Lock } from 'lucide-react';
import { auth } from '../../services/firebase';
import { verifyPasswordResetCode, confirmPasswordReset } from 'firebase/auth';

interface ResetPasswordPageProps {
  webSettings?: import('../../types').WebSettings;
}

const ResetPasswordPage: React.FC<ResetPasswordPageProps> = ({ webSettings }) => {
  const [oobCode, setOobCode] = React.useState<string | null>(null);
  const [email, setEmail] = React.useState<string | null>(null);
  
  // UI States
  const [isVerifying, setIsVerifying] = React.useState(true);
  const [isValidCode, setIsValidCode] = React.useState(false);
  const [password, setPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false);
  
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [successMsg, setSuccessMsg] = React.useState<string | null>(null);

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('oobCode');
    const mode = params.get('mode');

    if (!code || mode !== 'resetPassword') {
      setErrorMsg('El enlace de recuperación es inválido o ha expirado.');
      setIsVerifying(false);
      return;
    }

    setOobCode(code);

    // Verificar el código de Firebase
    verifyPasswordResetCode(auth, code)
      .then((userEmail) => {
        setEmail(userEmail);
        setIsValidCode(true);
        setIsVerifying(false);
      })
      .catch((err) => {
        console.error('Error verifying reset code:', err);
        setErrorMsg('El enlace de restablecimiento de contraseña ha expirado o ya fue utilizado.');
        setIsVerifying(false);
      });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oobCode) return;

    setErrorMsg(null);
    setSuccessMsg(null);

    if (password.length < 6) {
      setErrorMsg('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMsg('Las contraseñas no coinciden.');
      return;
    }

    setIsSubmitting(true);

    try {
      await confirmPasswordReset(auth, oobCode, password);
      setSuccessMsg('Contraseña restaurada con éxito. Redirigiendo...');
      
      // Esperar 2.5 segundos y redirigir con el flag showLogin
      setTimeout(() => {
        window.location.href = '/?showLogin=true';
      }, 2500);
    } catch (err: any) {
      console.error('Error resetting password:', err);
      let msg = 'No se pudo restablecer la contraseña. Intentá nuevamente.';
      if (err?.code === 'auth/expired-action-code') {
        msg = 'El enlace de recuperación ha expirado.';
      } else if (err?.code === 'auth/invalid-action-code') {
        msg = 'El enlace de recuperación no es válido.';
      } else if (err?.code === 'auth/weak-password') {
        msg = 'La contraseña elegida es muy débil. Debe tener al menos 6 caracteres.';
      }
      setErrorMsg(msg);
      setIsSubmitting(false);
    }
  };

  const storeName = webSettings?.storeName || 'EL ROPERO';

  if (isVerifying) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white p-6 font-['Inter']">
        <div className="text-center space-y-6 max-w-[320px] px-6">
          <div className="space-y-3">
            <p className="text-[10px] tracking-[6px] uppercase opacity-40 font-light">Verificando</p>
            <h1 className="text-[20px] sm:text-[24px] tracking-[12px] sm:tracking-[18px] uppercase font-medium leading-none text-black">
              {storeName}
            </h1>
          </div>
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="animate-spin text-black" size={24} strokeWidth={1.5} />
            <p className="text-[9px] uppercase tracking-[3px] font-light text-black/40">
              Validando enlace de recuperación...
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-white p-6 selection:bg-black selection:text-white font-['Inter'] overflow-y-auto py-12">
      <div className="max-w-[420px] w-full my-auto px-8 py-12 sm:py-16 border border-black/5 shadow-sm space-y-12 sm:space-y-16 animate-in fade-in duration-700">
        
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <p className="text-[10px] tracking-[6px] uppercase opacity-40 font-light">Recuperación de Cuenta</p>
          <h1 className="text-[20px] sm:text-[24px] tracking-[12px] sm:tracking-[18px] uppercase font-medium leading-none text-black">
            {storeName}
          </h1>
        </div>

        {/* Success Msg */}
        {successMsg && (
          <div className="flex items-start gap-3 bg-neutral-50 text-black p-5 border-l-2 border-black animate-in fade-in slide-in-from-top-1 duration-200">
            <CheckCircle size={16} className="mt-0.5 flex-shrink-0 text-black animate-pulse" />
            <div className="space-y-1">
              <p className="text-[10px] tracking-[1px] leading-relaxed uppercase font-semibold">{successMsg}</p>
              <p className="text-[9px] tracking-[0.5px] leading-relaxed text-black/40 uppercase">Serás redirigido para iniciar sesión.</p>
            </div>
          </div>
        )}

        {/* Error Msg */}
        {errorMsg && (
          <div className="flex items-start gap-3 bg-red-50 text-red-700 p-5 border-l-2 border-red-500 animate-in fade-in slide-in-from-top-1 duration-200">
            <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
            <p className="text-[10px] tracking-[1px] leading-relaxed uppercase">{errorMsg}</p>
          </div>
        )}

        {isValidCode ? (
          <form onSubmit={handleSubmit} className="space-y-10">
            {email && (
              <div className="bg-neutral-50 px-4 py-3 border border-black/5">
                <p className="text-[9px] uppercase tracking-[2px] text-black/40">Restableciendo cuenta de:</p>
                <p className="text-[11px] font-medium tracking-[0.5px] text-black truncate">{email}</p>
              </div>
            )}

            <div className="space-y-8">
              {/* Nueva Contraseña */}
              <div className="relative group">
                <label className="block text-[9px] font-medium uppercase tracking-[3px] text-black/40 mb-2 transition-colors group-focus-within:text-black">
                  Nueva Contraseña *
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={isSubmitting || !!successMsg}
                    placeholder="••••••••"
                    className="w-full bg-transparent border-b border-black/10 py-3 pr-10 text-[12px] focus:outline-none focus:border-black tracking-[4px] text-black placeholder:text-black/10 transition-all disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                    className="absolute right-0 top-1/2 -translate-y-1/2 opacity-30 hover:opacity-100 transition-opacity"
                  >
                    {showPassword ? <EyeOff size={16} strokeWidth={1.5} /> : <Eye size={16} strokeWidth={1.5} />}
                  </button>
                </div>
              </div>

              {/* Confirmar Contraseña */}
              <div className="relative group">
                <label className="block text-[9px] font-medium uppercase tracking-[3px] text-black/40 mb-2 transition-colors group-focus-within:text-black">
                  Confirmar Contraseña *
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    disabled={isSubmitting || !!successMsg}
                    placeholder="••••••••"
                    className="w-full bg-transparent border-b border-black/10 py-3 pr-10 text-[12px] focus:outline-none focus:border-black tracking-[4px] text-black placeholder:text-black/10 transition-all disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    tabIndex={-1}
                    className="absolute right-0 top-1/2 -translate-y-1/2 opacity-30 hover:opacity-100 transition-opacity"
                  >
                    {showConfirmPassword ? <EyeOff size={16} strokeWidth={1.5} /> : <Eye size={16} strokeWidth={1.5} />}
                  </button>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="pt-4">
              <button
                type="submit"
                disabled={isSubmitting || !!successMsg}
                className="w-full bg-black text-white py-5 text-[11px] tracking-[4px] uppercase font-medium hover:bg-neutral-800 transition-all flex items-center justify-center gap-4 disabled:opacity-30"
              >
                {isSubmitting ? (
                  <Loader2 className="animate-spin" size={14} strokeWidth={1.5} />
                ) : (
                  <>
                    Restablecer Contraseña
                    <ArrowRight size={13} />
                  </>
                )}
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-8 pt-4">
            <p className="text-[10px] text-black/40 text-center uppercase tracking-[2px] leading-relaxed">
              Si crees que esto es un error, por favor solicita un nuevo enlace desde el formulario de ingreso.
            </p>
            <a
              href="/"
              className="w-full border border-black/10 text-black py-4 text-[10px] tracking-[3px] uppercase font-medium hover:border-black hover:bg-neutral-50 transition-all flex items-center justify-center gap-3"
            >
              Volver a la Tienda
            </a>
          </div>
        )}

        {/* Footer info */}
        <div className="pt-10 border-t border-black/5 flex flex-col items-center gap-4">
          <div className="flex items-center gap-2 opacity-20">
            <Lock size={16} strokeWidth={1.5} />
            <span className="text-[8px] uppercase tracking-[2px]">Conexión Encriptada Segura</span>
          </div>
        </div>

      </div>
    </div>
  );
};

export default ResetPasswordPage;
