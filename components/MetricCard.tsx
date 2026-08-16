
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
      className={`group relative bg-white border border-stone-200/80 rounded-2xl p-5 md:p-6 text-left shadow-[0_2px_18px_-4px_rgba(0,0,0,0.03)] flex flex-col justify-between min-h-[140px] transition-all duration-200 ease-out overflow-hidden ${
        clickable 
          ? 'cursor-pointer hover:-translate-y-1 hover:shadow-[0_12px_32px_-6px_rgba(0,0,0,0.07)] hover:border-stone-300 hover:bg-stone-50/60 active:translate-y-0 active:shadow-xs' 
          : 'hover:-translate-y-1 hover:shadow-[0_10px_25px_-5px_rgba(0,0,0,0.05)] hover:border-stone-300 hover:bg-stone-50/40'
      }`}
    >
      <div>
        <div className="flex items-center justify-between gap-2 mb-3">
          <span className="text-[9px] uppercase tracking-[0.2em] text-stone-400 font-semibold leading-none truncate">
            {label}
          </span>
          {trend && (
            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-medium tracking-tight border shadow-2xs shrink-0 ${
              trend.isPositive 
                ? 'bg-emerald-500/10 text-emerald-800 border-emerald-500/20' 
                : 'bg-rose-500/10 text-rose-800 border-rose-500/20'
            }`}>
              {trend.isPositive ? <TrendingUp size={10} strokeWidth={1.5} /> : <TrendingDown size={10} strokeWidth={1.5} />}
              <span>{trend.value > 0 ? '+' : ''}{trend.value.toFixed(1)}%</span>
            </span>
          )}
        </div>

        <h3 className="font-serif text-2xl md:text-3xl font-medium tracking-tight text-stone-900 mb-1 leading-none">
          {value}
        </h3>
      </div>

      <div className="mt-3 pt-3 border-t border-stone-100/80 flex items-center justify-between gap-2">
        {subValue ? (
          <span className="text-[9px] text-stone-400 tracking-[0.15em] uppercase font-light truncate">
            {subValue}
          </span>
        ) : <span />}

        {clickable && (
          <span className="text-[9px] text-stone-400 font-medium group-hover:text-stone-900 tracking-[0.1em] uppercase transition-colors flex items-center gap-1 shrink-0">
            <span>Ver detalles</span>
            <ArrowRight size={11} strokeWidth={1.5} className="group-hover:translate-x-0.5 transition-transform" />
          </span>
        )}
      </div>
    </div>
  );
};

export default MetricCard;
