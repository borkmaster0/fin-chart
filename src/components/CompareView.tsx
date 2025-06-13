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
  const symbols = extractSymbols(expression);
  const dataMap = await fetchWithDelay(symbols, timeframe, fetchChartData);

  // 1. Convert timestamps into Sets for quick lookup
  const symbolTimestamps: Record<string, Set<number>> = {};
  for (const symbol of symbols) {
    symbolTimestamps[symbol] = new Set(dataMap[symbol].timestamp);
  }

  // 2. Find shared timestamps by filtering the one with the latest starting point
  function intersectSets(sets: Set<number>[]): number[] {
    if (sets.length === 0) return [];
  
    const [first, ...rest] = sets;
    const result: number[] = [];
  
    for (const t of first) {
      if (rest.every(s => s.has(t))) {
        result.push(t);
      }
    }
  
    return result.sort((a, b) => a - b); // ascending
  }
  
  const timestampSets = symbols.map(sym => new Set(dataMap[sym].timestamp));
  const alignedTimestamps = intersectSets(timestampSets);

  const result: CandlestickData[] = [];

  for (const time of alignedTimestamps) {
    // Skip if any symbol doesn't have this timestamp
    if (!symbols.every(sym => symbolTimestamps[sym].has(time))) continue;

    const scope: Record<string, number> = {};
    let skip = false;

    for (const symbol of symbols) {
      const index = dataMap[symbol].timestamp.indexOf(time);
      if (index === -1) {
        skip = true;
        break;
      }

      const d = dataMap[symbol];
      const open = d.open[index];
      const high = d.high[index];
      const low = d.low[index];
      const close = d.close[index];

      if (
        open == null ||
        high == null ||
        low == null ||
        close == null
      ) {
        skip = true;
        break;
      }

      scope[safeVarName(symbol, 'open')] = open;
      scope[safeVarName(symbol, 'high')] = high;
      scope[safeVarName(symbol, 'low')] = low;
      scope[safeVarName(symbol, 'close')] = close;
    }

    if (skip) continue;

    const cleanExpr = (type: 'close' | 'open' | 'high' | 'low') =>
      expression.replace(/\[([^\]]+)]/g, (_, s) => safeVarName(s, type));

    try {
      result.push({
        time,
        open: evaluate(cleanExpr('open'), scope),
        high: evaluate(cleanExpr('high'), scope),
        low: evaluate(cleanExpr('low'), scope),
        close: evaluate(cleanExpr('close'), scope),
      });
    } catch (err) {
      console.warn(`Error evaluating expression at time ${time}:`, err);
    }
  }
  
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
  const [hoveredValues, setHoveredValues] = useState<{
    time?: number;
    open?: number;
    high?: number;
    low?: number;
    close?: number;
  } | null>(null);

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

    chart.subscribeCrosshairMove(param => {
      if (!param?.time || !param.seriesData) {
        setHoveredValues(null);
        return;
      }
    
      const seriesData = param.seriesData.get(series);
      if (seriesData) {
        const { open, high, low, close } = seriesData as CandlestickData;
        setHoveredValues({ time: param.time as number, open, high, low, close });
      } else {
        setHoveredValues(null);
      }
    });

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

  return (
    <div ref={chartRef} className="relative w-full h-full">
      {hoveredValues && (
        <div className="absolute top-2 left-4 bg-white dark:bg-slate-800 text-sm shadow-md border border-gray-200 dark:border-gray-700 rounded px-3 py-2 z-10">
          <div className="font-semibold text-gray-700 dark:text-gray-200">
            <span className="text-blue-500">{new Date(hoveredValues.time).toDateString()}</span>
          </div>
          <div className="font-semibold text-gray-700 dark:text-gray-200">
            O: <span className="text-blue-500">{hoveredValues.open?.toFixed(precision)}</span>
          </div>
          <div className="font-semibold text-gray-700 dark:text-gray-200">
            H: <span className="text-green-500">{hoveredValues.high?.toFixed(precision)}</span>
          </div>
          <div className="font-semibold text-gray-700 dark:text-gray-200">
            L: <span className="text-red-500">{hoveredValues.low?.toFixed(precision)}</span>
          </div>
          <div className="font-semibold text-gray-700 dark:text-gray-200">
            C: <span className="text-purple-500">{hoveredValues.close?.toFixed(precision)}</span>
          </div>
        </div>
      )}
    </div>
  );
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
