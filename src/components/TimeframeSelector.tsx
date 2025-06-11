import React from 'react';

interface TimeframeSelectorProps {
  selectedTimeframe: string;
  onTimeframeChange: (timeframe: string) => void;
}

const timeframes = [
  { id: '1m', label: '1M', description: '1 Minute' },
  { id: '5m', label: '5M', description: '5 Minutes' },
  { id: '15m', label: '15M', description: '15 Minutes' },
  { id: '30m', label: '30M', description: '30 Minutes' },
  { id: '90m', label: '90M', description: '90 Minutes' },
  { id: '1h', label: '1H', description: '1 Hour' },
  { id: '1d', label: '1D', description: '1 Day' },
  { id: '5d', label: '5D', description: '5 Days' },
  { id: '1wk', label: '1W', description: '1 Week' },
  { id: '1mo', label: '1M', description: '1 Month' },
  { id: '3mo', label: '3M', description: '3 Months' },
];

const TimeframeSelector: React.FC<TimeframeSelectorProps> = ({ 
  selectedTimeframe, 
  onTimeframeChange 
}) => {
  return (
    <div className="inline-flex bg-slate-100 dark:bg-slate-700 rounded-md p-1">
      {timeframes.map((timeframe) => (
        <button
          key={timeframe.id}
          className={`px-3 py-1 text-sm font-medium rounded-md transition-all ${
            selectedTimeframe === timeframe.id 
              ? 'bg-white dark:bg-slate-600 text-primary dark:text-white shadow-sm' 
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
          }`}
          onClick={() => onTimeframeChange(timeframe.id)}
          title={timeframe.description}
        >
          {timeframe.label}
        </button>
      ))}
    </div>
  );
};

export default TimeframeSelector;