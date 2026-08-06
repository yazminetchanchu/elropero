
import React from 'react';
import { TrendingUp, TrendingDown, ArrowRight } from 'lucide-react';

interface MetricCardProps {
  label: string;
  value: string | number;
  subValue?: string;
  onClick?: () => void;
  clickable?: boolean;
  trend?: {
    value: number;
    label: string;
    isPositive: boolean;
  };
  dataTestId?: string;
}

const MetricCard: React.FC<MetricCardProps> = ({ 
  label, 
  value, 
  subValue, 
  onClick,
  clickable = false,
  trend,
  dataTestId
}) => {
  return (
    <div 
      data-testid={dataTestId}
      onClick={clickable ? onClick : undefined}
      className={`group relative bg-white/95 backdrop-blur-md border border-[#C9B8A8]/50 rounded-2xl p-6 text-left shadow-lg flex flex-col justify-between min-h-[145px] transition-all duration-300 overflow-hidden ${
        clickable 
          ? 'cursor-pointer hover:-translate-y-1.5 hover:shadow-xl hover:border-[#1A1A1A]/40 active:translate-y-0' 
          : 'hover:-translate-y-0.5 hover:shadow-xl'
      }`}
    >
      {/* Top subtle hover accent */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#C9B8A8] via-[#1A1A1A] to-[#C9B8A8] opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

      <div>
        <div className="flex items-center justify-between gap-2 mb-3">
          <span className="text-[9px] uppercase tracking-[3px] text-[#1A1A1A]/70 font-bold leading-none truncate">
            {label}
          </span>
          {trend && (
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold tracking-tight border shadow-2xs shrink-0 ${
              trend.isPositive 
                ? 'bg-emerald-500/15 text-emerald-800 border-emerald-500/30' 
                : 'bg-rose-500/15 text-rose-800 border-rose-500/30'
            }`}>
              {trend.isPositive ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
              <span>{trend.value > 0 ? '+' : ''}{trend.value.toFixed(1)}%</span>
            </span>
          )}
        </div>

        <h3 className="font-serif text-2xl md:text-3xl font-extrabold tracking-tight text-[#1A1A1A] mb-2 leading-none">
          {value}
        </h3>
      </div>

      <div className="mt-3 pt-3 border-t border-[#C9B8A8]/30 flex items-center justify-between gap-2">
        {subValue ? (
          <span className="text-[9px] text-[#1A1A1A]/60 tracking-[2px] uppercase font-medium truncate">
            {subValue}
          </span>
        ) : <span />}

        {clickable && (
          <span className="text-[9px] text-[#1A1A1A]/50 font-medium group-hover:text-[#1A1A1A] transition-colors flex items-center gap-1 shrink-0">
            <span>Ver detalles</span>
            <ArrowRight size={12} className="group-hover:translate-x-1 transition-transform" />
          </span>
        )}
      </div>
    </div>
  );
};

export default MetricCard;
