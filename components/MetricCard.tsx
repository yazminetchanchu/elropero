
import React from 'react';

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
      className={`bg-white/90 backdrop-blur-sm border border-[#C9B8A8]/50 rounded-xl p-6 text-left shadow-lg flex flex-col justify-center min-h-[130px] transition-all ${
        clickable 
          ? 'cursor-pointer hover:-translate-y-1 hover:shadow-xl hover:border-[#C9B8A8] active:translate-y-0' 
          : 'hover:-translate-y-0.5 hover:shadow-xl'
      }`}
    >
      <span className="text-[9px] uppercase tracking-[3px] text-[#1A1A1A]/70 font-medium mb-3 leading-none">{label}</span>
      <h3 className="font-serif text-2xl md:text-3xl font-bold tracking-tight mb-2 leading-none text-[#1A1A1A]">{value}</h3>
      {subValue && (
        <p className="text-[9px] text-[#1A1A1A]/60 mt-2 tracking-[2px] uppercase font-medium border-t border-[#C9B8A8]/30 pt-3">
          {subValue}
        </p>
      )}
      {trend && (
        <div className={`mt-3 text-[8px] uppercase tracking-[1px] font-semibold ${
          trend.isPositive ? 'text-emerald-700' : 'text-rose-700'
        }`}>
          {trend.isPositive ? '↑' : '↓'} {trend.value > 0 ? '+' : ''}{trend.value.toLocaleString()}% vs {trend.label}
        </div>
      )}
      {clickable && (
        <p className="text-[8px] text-[#1A1A1A]/40 mt-3 italic">Click para ver detalles</p>
      )}
    </div>
  );
};

export default MetricCard;
