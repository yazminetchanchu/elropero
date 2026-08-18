import React, { useState, useEffect } from 'react';

interface InnovativeLoaderProps {
  storeName?: string;
  message?: string;
  isDataLoaded?: boolean;
  onComplete?: () => void;
}

export const InnovativeLoader: React.FC<InnovativeLoaderProps> = ({
  storeName = 'EL ROPERO',
  message = '',
  isDataLoaded,
  onComplete,
}) => {
  const [progress, setProgress] = useState(0);
  const [displayedText, setDisplayedText] = useState('');
  const [isTyping, setIsTyping] = useState(true);

  // Sync progress with loading state
  useEffect(() => {
    // If data is confirmed 100% loaded, complete immediately/smoothly
    if (isDataLoaded === true) {
      setProgress(100);
      if (onComplete) {
        const t = setTimeout(() => onComplete(), 200);
        return () => clearTimeout(t);
      }
      return;
    }

    const duration = 2000;
    const intervalTime = 30;
    const steps = duration / intervalTime;
    let currentStep = 0;

    const timer = setInterval(() => {
      currentStep++;
      const rawProgress = Math.min((currentStep / steps), 1);
      const easedProgress = 1 - Math.pow(1 - rawProgress, 3);
      const currentProgressValue = Math.min(easedProgress * 100, 100);
      
      setProgress(currentProgressValue);

      if (currentStep >= steps) {
        clearInterval(timer);
        if (onComplete) onComplete();
      }
    }, intervalTime);

    return () => clearInterval(timer);
  }, [isDataLoaded, onComplete]);

  // Sync typing with progress
  useEffect(() => {
    const textToType = storeName;
    const charactersToShow = Math.ceil((progress / 100) * textToType.length);
    setDisplayedText(textToType.slice(0, charactersToShow));
    
    if (progress >= 100) {
      setIsTyping(false);
    } else {
      setIsTyping(true);
    }
  }, [progress, storeName]);
  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#FAF8F5] selection:bg-black selection:text-white font-['Inter'] relative overflow-hidden p-6">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Inter:wght@200;300;400;500;600&display=swap');
        
        @keyframes spin-slow {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes reverse-spin {
          0% { transform: rotate(360deg); }
          100% { transform: rotate(0deg); }
        }
        @keyframes progress-pulse-slide {
          0% { transform: translateX(-100%) scaleX(0.5); opacity: 0.5; }
          50% { transform: translateX(0%) scaleX(1); opacity: 1; }
          100% { transform: translateX(100%) scaleX(0.5); opacity: 0.5; }
        }
        @keyframes pulse-glow {
          0%, 100% { opacity: 0.35; transform: scale(0.98); }
          50% { opacity: 0.85; transform: scale(1.02); }
        }
        .animate-spin-slow {
          animation: spin-slow 9s linear infinite;
        }
        .animate-reverse-spin {
          animation: reverse-spin 13s linear infinite;
        }
        .animate-pulse-glow {
          animation: pulse-glow 3s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
      `}</style>

      {/* Ambient glowing background aura */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-[380px] sm:w-[520px] h-[380px] sm:h-[520px] rounded-full bg-gradient-to-tr from-black/[0.04] via-black/[0.015] to-transparent blur-3xl animate-pulse-glow" />
      </div>

      <div className="relative z-10 flex flex-col items-center justify-center max-w-[440px] w-full mx-auto text-center space-y-12 animate-in fade-in duration-700">
        

        {/* Main Title & Subtitle with Typewriter Effect */}
        <div className="space-y-1 sm:space-y-2 w-full max-w-full px-2 flex flex-col items-center">
          <div className="flex items-center justify-center min-h-[clamp(20px,6vw,40px)]">
            <h1 className="text-[clamp(16px,5vw,30px)] tracking-[clamp(4px,3vw,22px)] uppercase font-medium leading-none text-black whitespace-nowrap transition-all duration-700 select-none flex items-center">
              {displayedText}
              <span className={`inline-block w-[2px] sm:w-[3px] h-[clamp(16px,5vw,25px)] bg-black ml-1 sm:ml-2 ${isTyping ? 'animate-pulse' : 'opacity-0 transition-opacity duration-1000'}`}></span>
            </h1>
          </div>
          <div className={`flex items-center justify-center gap-3 sm:gap-4 pt-2 w-full max-w-full transition-all duration-1000 delay-300 ${isTyping ? 'opacity-0 translate-y-4' : 'opacity-100 translate-y-0'}`}>
            <span className="w-6 sm:w-12 h-[1px] bg-gradient-to-r from-transparent via-black/20 to-black/40"></span>
            <span className="font-serif italic text-[clamp(13px,3.5vw,18px)] tracking-[clamp(2px,1.5vw,6px)] text-black/75 font-normal select-none whitespace-nowrap">
              Sitio Web
            </span>
            <span className="w-6 sm:w-12 h-[1px] bg-gradient-to-l from-transparent via-black/20 to-black/40"></span>
          </div>
        </div>

        {/* Progress System */}
        <div className="flex flex-col items-center gap-4 w-full pt-6">
          <div className="flex items-center gap-2.5 transition-opacity duration-500">
            <span className="text-[10px] sm:text-[11px] tracking-[5px] uppercase font-semibold text-black/80 pl-[5px]">
              {progress < 100 ? 'Cargando' : 'Completado'}
            </span>
            <span className={`inline-flex gap-1.5 items-center ${progress >= 100 ? 'opacity-0' : 'opacity-100'}`}>
              <span className="w-1 h-1 rounded-full bg-black animate-ping" style={{ animationDuration: '1.4s' }}></span>
              <span className="w-1 h-1 rounded-full bg-black animate-ping" style={{ animationDuration: '1.4s', animationDelay: '0.2s' }}></span>
              <span className="w-1 h-1 rounded-full bg-black animate-ping" style={{ animationDuration: '1.4s', animationDelay: '0.4s' }}></span>
            </span>
          </div>

          {/* Real loading bar tied to progress */}
          <div className="w-48 sm:w-64 h-[2px] bg-black/10 rounded-full overflow-hidden relative">
            <div 
              className="absolute inset-y-0 left-0 bg-black transition-all duration-100 ease-out"
              style={{ width: `${progress}%` }} 
            />
          </div>

          {message ? (
            <p className="text-[9px] sm:text-[10px] uppercase tracking-[3px] font-light text-black/45 animate-pulse-glow">
              {message}
            </p>
          ) : null}
        </div>

      </div>
    </div>
  );
};

export default InnovativeLoader;
