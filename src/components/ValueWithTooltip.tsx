import React, { useState, useRef } from 'react';
import { formatCurrency } from '../utils/formatters';

interface ValueWithTooltipProps {
  value: number;
  displayValue: string;
  className?: string;
  prefix?: string;
}

const ValueWithTooltip: React.FC<ValueWithTooltipProps> = ({ 
  value, 
  displayValue, 
  className = '', 
  prefix = '' 
}) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const elementRef = useRef<HTMLSpanElement>(null);
  const fullValue = formatCurrency(value);
  
  // Only show tooltip if the display value is different from full value
  const shouldShowTooltip = displayValue !== fullValue && displayValue !== `${prefix}${fullValue}`;

  const handleMouseEnter = (e: React.MouseEvent) => {
    if (!shouldShowTooltip || !elementRef.current) return;
    
    const rect = elementRef.current.getBoundingClientRect();
    
    // Position tooltip above the element, accounting for scroll
    setTooltipPosition({
      top: rect.top - 8, // 8px above the element
      left: rect.left + (rect.width / 2), // Center horizontally
    });
    
    setShowTooltip(true);
  };

  const handleMouseLeave = () => {
    setShowTooltip(false);
  };

  return (
    <>
      <span
        ref={elementRef}
        className={`${className} ${shouldShowTooltip ? 'cursor-help' : ''}`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {prefix}{displayValue}
      </span>
      
      {shouldShowTooltip && showTooltip && (
        <div 
          className="fixed pointer-events-none z-[9999]"
          style={{
            top: tooltipPosition.top,
            left: tooltipPosition.left,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <div className="bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 px-3 py-2 rounded-lg shadow-xl border border-slate-700 dark:border-slate-300 text-sm font-medium whitespace-nowrap">
            {prefix}{fullValue}
            {/* Tooltip arrow pointing down */}
            <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-slate-900 dark:border-t-slate-100"></div>
          </div>
        </div>
      )}
    </>
  );
};

export default ValueWithTooltip;