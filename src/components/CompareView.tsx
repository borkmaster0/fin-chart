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

function safeVarName(symbol: string, field: string): string {
  return `${symbol.replace(/[^a-zA-Z0-9]/g, '_')}_${field}`;
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
  const symbols = extractSymbols(expression).map((item)=>(encodeURI(item)));
  const dataMap = await fetchWithDelay(symbols, timeframe, fetchChartData);

  const baseTimestamps = dataMap[symbols[0]].timestamp;
  const result: CandlestickData[] = [];
  console.log(dataMap);

  for (let i = 0; i < baseTimestamps.length; i++) {
    const scope: Record<string, number> = {};

    try {
      // Evaluate each price field independently
      for (const symbol of symbols) {
        scope[safeVarName(symbol, 'close')] = dataMap[symbol].close[i];
        scope[safeVarName(symbol, 'open')] = dataMap[symbol].open[i];
        scope[safeVarName(symbol, 'high')] = dataMap[symbol].high[i];
        scope[safeVarName(symbol, 'low')] = dataMap[symbol].low[i];
      }
      
      // Replace [SYMBOL] with safe variable names
      const cleanExpr = (type: 'close' | 'open' | 'high' | 'low') =>
        expression.replace(/\[([^\]]+)]/g, (_, s) => safeVarName(s, type));

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
  console.log(result)
  return result;
}

// === Chart Rendering ===
interface CandlestickChartProps {
  data: CandlestickData[];
  precision: number;
}

const CandlestickChart: React.FC<CandlestickChartProps> = ({ data, precision }) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<ReturnType<typeof createChart> | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);

  useEffect(() => {
    if (!chartRef.current) return;
    const darkMode = localStorage.darkMode;
    const container = chartRef.current;  
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
      priceScaleId: 'right',
      priceFormat: { 
        type: 'price',
        precision: precision,
        minMove: 1 / Math.pow(10, precision)
      }
    });
    series.setData(data);
    chartInstance.current = chart;
    seriesRef.current = series;

    const resizeObserver = new ResizeObserver(entries => {
      for (let entry of entries) {
        if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
          chart.resize(entry.contentRect.width, entry.contentRect.height);
        }
      }
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
    };
  }, [precision]);

  useEffect(() => {
    if (seriesRef.current) {
      seriesRef.current.setData(data);
    }
  }, [data]);

  return <div ref={chartRef} className="w-full h-full" />;
};

// === Main App ===
const ChartExpressionApp: React.FC = () => {
  const [expression, setExpression] = useState('([SPY] + [QQQ]) / 2');
  const [chartData, setChartData] = useState<CandlestickData[]>([]);
  const [loading, setLoading] = useState(false);
  const [precision, setPrecision] = useState(2);

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
        <select
          value={precision}
          onChange={(e) => setPrecision(Number(e.target.value))}
          className="text-sm border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 bg-white dark:bg-slate-800"
        >
          {Array.from({ length: 10 }, (_, i) => i).map((p) => (
            <option key={p} value={p}>
              {p === 0 ? 'No decimals' : `${p} decimal${p > 1 ? 's' : ''}`}
            </option>
          ))}
        </select>
      </div>
      {chartData.length > 0 && (
      <div className="relative w-full h-[600px] md:h-[500px] rounded-lg border border-gray-200 shadow-md overflow-hidden">
        <CandlestickChart data={chartData} precision={precision} />
      </div>
      )}
    </div>
  );
};

export default ChartExpressionApp;
