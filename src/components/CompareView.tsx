import React, { useState, useEffect, useRef } from 'react';
import { createChart, ISeriesApi, CandlestickSeries, ColorType, CrosshairMode } from 'lightweight-charts';
import { evaluate } from 'mathjs';
import { fetchChartData } from '../utils/api';
import { ChartData } from '../types';
import { Calculator, Loader2 } from 'lucide-react'; // Lucide icons

// === Types ===
interface ChartData {
  timestamp: number[];
  close: number[];
  open: number[];
  high: number[];
  low: number[];
  volume: number[];
  meta: any;
  events?: {
    dividends: Record<string, { amount: number; date: number }>;
    splits: Record<string, { date: number; numerator: number; denominator: number; splitRatio: string }>;
  };
}

// === Helpers ===
function extractSymbols(expression: string): string[] {
  const matches = expression.match(/\[([^\]]+)\]/g);
  return matches ? [...new Set(matches.map(m => m.slice(1, -1)))] : [];
}

async function fetchWithDelay(
  symbols: string[],
  timeframe: string,
  fetchChartData: (symbol: string, timeframe: string) => Promise<ChartData>
): Promise<Record<string, ChartData>> {
  const dataMap: Record<string, ChartData> = {};

  for (const symbol of symbols) {
    try {
      const data = await fetchChartData(symbol, timeframe);
      dataMap[symbol] = data;
    } catch (err) {
      console.error(`Failed to fetch data for ${symbol}:`, err);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000)); // ⏱️ 1-second delay
  }

  return dataMap;
}

async function computeOHLCExpression(
  expression: string,
  timeframe: string,
  fetchChartData: (symbol: string, timeframe: string) => Promise<ChartData>
): Promise<CandlestickData[]> {
  const symbols = extractSymbols(expression);
  const dataMap = await fetchWithDelay(symbols, timeframe, fetchChartData);

  const baseTimestamps = dataMap[symbols[0]].timestamp;
  const result: CandlestickData[] = [];

  for (let i = 0; i < baseTimestamps.length; i++) {
    const scope: Record<string, number> = {};

    try {
      // Evaluate each price field independently
      for (const symbol of symbols) {
        scope[`${symbol}_close`] = dataMap[symbol].close[i];
        scope[`${symbol}_open`] = dataMap[symbol].open[i];
        scope[`${symbol}_high`] = dataMap[symbol].high[i];
        scope[`${symbol}_low`] = dataMap[symbol].low[i];
      }

      const cleanExpr = (type: 'close' | 'open' | 'high' | 'low') =>
        expression.replace(/\[([^\]]+)]/g, (_, sym) => `${sym}_${type}`);

      const close = evaluate(cleanExpr('close'), scope);
      const open = evaluate(cleanExpr('open'), scope);
      const high = evaluate(cleanExpr('high'), scope);
      const low = evaluate(cleanExpr('low'), scope);

      result.push({
        time: baseTimestamps[i],
        open,
        high,
        low,
        close,
      });
    } catch (err) {
      console.warn(`Skipping index ${i} due to error`, err);
    }
  }

  return result;
}

// === Chart Rendering ===
interface CandlestickChartProps {
  data: CandlestickData[];
  darkMode: boolean;
}

const CandlestickChart: React.FC<CandlestickChartProps> = ({ data, darkMode }) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);

  useEffect(() => {
    if (!chartRef.current) return;

    const chart = createChart(chartRef.current, {
      width: 700, 
      height: 400 
    });
    const series = chart.addSeries(CandlestickSeries, {
      layout: {
        background: { type: ColorType.Solid, color: darkMode ? '#1E293B' : '#FFFFFF' },
        textColor: darkMode ? '#E2E8F0' : '#334155',
      },
      width: chartRef.current.clientWidth,
      height: 500,
      grid: {
        vertLines: {
          color: darkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.06)',
        },
        horzLines: {
          color: darkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.06)',
        },
      },
      rightPriceScale: {
        borderColor: darkMode ? '#334155' : '#E2E8F0',
        borderVisible: true
      },
      crosshair: {
        mode: CrosshairMode.Normal
      },
      timeScale: {
        borderColor: darkMode ? '#334155' : '#E2E8F0',
        timeVisible: false,
        secondsVisible: false,
      },
    });
    series.setData(data);
    seriesRef.current = series;

    return () => {
      chart.remove();
    };
  }, []);

  useEffect(() => {
    if (seriesRef.current) {
      seriesRef.current.setData(data);
    }
  }, [data]);

  return <div ref={chartRef} />;
};

// === Main App ===
const ChartExpressionApp: React.FC = () => {
  const [expression, setExpression] = useState('([SPY] + [QQQ]) / 2');
  const [chartData, setChartData] = useState<CandlestickData[]>([]);
  const [loading, setLoading] = useState(false);

  const onEvaluate = async () => {
    setLoading(true);
    try {
      const result = await computeOHLCExpression(expression, '1d', fetchChartData);
      setChartData(result);
    } catch (err) {
      console.error('Evaluation failed:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
        <Calculator className="w-6 h-6 text-blue-500" />
        Expression Chart
      </h2>

      <div className="flex flex-col md:flex-row items-center gap-4 mb-6">
        <input
          value={expression}
          onChange={(e) => setExpression(e.target.value)}
          placeholder="Enter expression, e.g. ([AAPL] + [QQQ]) / 2"
          className="w-full md:w-[400px] px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition dark:text-black"
        />
        <button
          onClick={onEvaluate}
          disabled={loading}
          className="inline-flex items-center px-4 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 transition disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 className="animate-spin mr-2 w-4 h-4" />
              Computing...
            </>
          ) : (
            'Evaluate'
          )}
        </button>
      </div>

      {chartData.length > 0 && (
      <>
        <div className="w-full h-[500px] rounded-lg border border-gray-200 shadow-md overflow-hidden">
          <CandlestickChart data={chartData} />
        </div>
      </>
      )}
    </div>
  );
};

export default ChartExpressionApp;
