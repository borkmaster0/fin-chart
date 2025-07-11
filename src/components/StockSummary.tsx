import React from 'react';
import { TrendingUp, TrendingDown, Info, Loader } from 'lucide-react';
import { ChartData } from '../types';
import { formatCurrency, formatPercent } from '../utils/formatters';

interface StockSummaryProps {
  data: ChartData | null;
  isLoading: boolean;
}

const StockSummary: React.FC<StockSummaryProps> = ({ data, isLoading }) => {
  if (isLoading) {
    return (
      <div className="card animate-pulse">
        <div className="h-6 bg-slate-200 dark:bg-slate-700 rounded w-3/4 mb-4"></div>
        <div className="space-y-3">
          <div className="h-10 bg-slate-200 dark:bg-slate-700 rounded w-full"></div>
          <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-2/3"></div>
        </div>
        
        <div className="mt-6 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex justify-between">
              <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/3"></div>
              <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/4"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!data || !data.meta) {
    return (
      <div className="card">
        <div className="flex items-center justify-center h-48">
          <div className="text-center">
            <Info className="w-8 h-8 text-slate-400 mx-auto mb-2" />
            <p className="text-slate-600 dark:text-slate-400">No data available</p>
          </div>
        </div>
      </div>
    );
  }

  const { meta } = data;
  
  const previousClose = data.close.at(-2);
  const currentPrice = meta.regularMarketPrice;
  const priceChange = currentPrice - previousClose;
  const percentChange = (priceChange / previousClose) * 100;
  const isPositive = priceChange >= 0;
  const previousOpen = data.open.at(-1);
  
  return (
    <div className="card animate-fade-in">
      <h3 className="text-xl font-bold mb-2">{meta.shortName || meta.symbol}</h3>
      
      <div className="mb-4">
        <div className="flex items-baseline">
          <span className="text-2xl font-bold">
            {currentPrice}
          </span>
          <span className={`ml-2 flex items-center text-sm font-medium ${
            isPositive ? 'text-positive' : 'text-negative'
          }`}>
            {isPositive ? <TrendingUp className="w-4 h-4 mr-1" /> : <TrendingDown className="w-4 h-4 mr-1" />}
            {(Math.abs(priceChange)).toFixed(2).toLocaleString()} ({(Math.abs(percentChange)).toFixed(2).toLocaleString()}%)
          </span>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Last updated: {new Date(meta.regularMarketTime * 1000).toLocaleTimeString()}
        </p>
      </div>
      
      <div className="space-y-3 text-sm">
        <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-700">
          <span className="text-slate-600 dark:text-slate-400">Previous Close</span>
          <span className="font-medium">{previousClose}</span>
        </div>
        <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-700">
          <span className="text-slate-600 dark:text-slate-400">Open</span>
          <span className="font-medium">{(previousOpen)}</span>
        </div>
        <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-700">
          <span className="text-slate-600 dark:text-slate-400">Day Range</span>
          <span className="font-medium">
            {(meta.regularMarketDayLow)} - {(meta.regularMarketDayHigh)}
          </span>
        </div>
        <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-700">
          <span className="text-slate-600 dark:text-slate-400">52 Week Range</span>
          <span className="font-medium">
            {(meta.fiftyTwoWeekLow)} - {(meta.fiftyTwoWeekHigh)}
          </span>
        </div>
        <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-700">
          <span className="text-slate-600 dark:text-slate-400">Volume</span>
          <span className="font-medium">
            {meta.regularMarketVolume}
          </span>
        </div>
        <div className="flex justify-between py-2">
          <span className="text-slate-600 dark:text-slate-400">Exchange</span>
          <span className="font-medium">{meta.fullExchangeName}</span>
        </div>
      </div>
    </div>
  );
};

export default StockSummary;