import React, { useState, useEffect, useRef } from 'react';
import { createChart, ISeriesApi, CandlestickSeries, ColorType, CrosshairMode } from 'lightweight-charts';
import { evaluate } from 'mathjs';
import { fetchChartData } from '../utils/api';
import { Calculator, Loader2 } from 'lucide-react';

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

interface CandlestickData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
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
    await new Promise((resolve) => setTimeout(resolve, 1000)); // 1-second delay
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

  const symbolTimestamps: Record<string, Set<number>> = {};
  for (const symbol of symbols) {
    symbolTimestamps[symbol] = new Set(dataMap[symbol]?.timestamp || []);
  }

  function intersectSets(sets: Set<number>[]): number[] {
    if (sets.length === 0) return [];

    const [first, ...rest] = sets;
    const result: number[] = [];

    for (const t of first) {
      if (rest.every(s => s.has(t))) {
        result.push(t);
      }
    }

    return result.sort((a, b) => a - b);
  }

  const timestampSets = symbols.map(sym => new Set(dataMap[sym]?.timestamp || []));
  const alignedTimestamps = intersectSets(timestampSets);

  const result: CandlestickData[] = [];

  for (const time of alignedTimestamps) {
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

// === CandlestickChart supporting multiple series ===
interface CandlestickChartProps {
  seriesData: Record<string, CandlestickData[]>;
  selectedPlots: string[];
  precision: number;
}

const CandlestickChart: React.FC<CandlestickChartProps> = ({ seriesData, selectedPlots, precision }) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<ReturnType<typeof createChart> | null>(null);
  const seriesRefs = useRef<Record<string, ISeriesApi<'Candlestick'>>>({});

  useEffect(() => {
    if (!chartRef.current) return;
    const darkMode = localStorage.darkMode === 'true';

    const chart = createChart(chartRef.current, {
      width: chartRef.current.clientWidth,
      height: 400,
      layout: {
        background: { type: ColorType.Solid, color: darkMode ? '#1E293B' : '#FFFFFF' },
        textColor: darkMode ? '#E2E8F0' : '#334155',
      },
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
        borderVisible: true,
      },
      crosshair: {
        mode: CrosshairMode.Normal,
      },
      timeScale: {
        borderColor: darkMode ? '#334155' : '#E2E8F0',
        timeVisible: false,
        secondsVisible: false,
      },
    });

    chartInstance.current = chart;

    const resizeObserver = new ResizeObserver(entries => {
      for (let entry of entries) {
        if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
          chart.resize(entry.contentRect.width, entry.contentRect.height);
        }
      }
    });

    resizeObserver.observe(chartRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
    };
  }, []);

  useEffect(() => {
    if (!chartInstance.current) return;

    // Remove series that are no longer selected
    for (const key of Object.keys(seriesRefs.current)) {
      if (!selectedPlots.includes(key)) {
        chartInstance.current.removeSeries(seriesRefs.current[key]);
        delete seriesRefs.current[key];
      }
    }

    // Add or update series for selected plots
    selectedPlots.forEach((key, idx) => {
      const data = seriesData[key];
      if (!data) return;

      if (!seriesRefs.current[key]) {
        const series = chartInstance.current.addSeries(CandlestickSeries, {
          borderVisible: true,
          wickVisible: true,
          priceLineVisible: false,
          title: key
        });
        seriesRefs.current[key] = series;
      }

      seriesRefs.current[key].setData(data);
    });
  }, [seriesData, selectedPlots]);

  return <div ref={chartRef} className="relative w-full h-full" />;
};

// === Main App ===
const ChartExpressionApp: React.FC = () => {
  const [expression, setExpression] = useState('([SPY] + [QQQ]) / 2');
  const [symbolsData, setSymbolsData] = useState<Record<string, CandlestickData[]>>({});
  const [expressionData, setExpressionData] = useState<CandlestickData[]>([]);
  const [selectedPlots, setSelectedPlots] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [precision, setPrecision] = useState(2);

  const onEvaluate = async () => {
    setLoading(true);
    try {
      const symbols = extractSymbols(expression);
      const symbolsRawData = await fetchWithDelay(symbols, '1d', fetchChartData);

      // Convert raw ChartData for each symbol into CandlestickData[]
      const convertedSymbolsData: Record<string, CandlestickData[]> = {};
      for (const sym of symbols) {
        const d = symbolsRawData[sym];
        if (!d) continue;
        convertedSymbolsData[sym] = d.timestamp.map((time, i) => ({
          time,
          open: d.open[i],
          high: d.high[i],
          low: d.low[i],
          close: d.close[i],
        }));
      }

      setSymbolsData(convertedSymbolsData);

      // Compute expression data
      const exprData = await computeOHLCExpression(expression, '1d', fetchChartData);
      setExpressionData(exprData);

      // Default selected plots = all symbols + expression
      setSelectedPlots([...symbols, 'expression']);
    } catch (err) {
      console.error('Evaluation failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const togglePlot = (plot: string) => {
    setSelectedPlots((prev) =>
      prev.includes(plot) ? prev.filter(p => p !== plot) : [...prev, plot]
    );
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

      {(Object.keys(symbolsData).length > 0 || expressionData.length > 0) && (
        <div className="mb-4 flex flex-wrap gap-4">
          {Object.keys(symbolsData).map((sym) => (
            <label key={sym} className="inline-flex items-center space-x-2">
              <input
                type="checkbox"
                checked={selectedPlots.includes(sym)}
                onChange={() => togglePlot(sym)}
              />
              <span>{sym}</span>
            </label>
          ))}
          <label className="inline-flex items-center space-x-2">
            <input
              type="checkbox"
              checked={selectedPlots.includes('expression')}
              onChange={() => togglePlot('expression')}
            />
            <span>Expression</span>
          </label>
        </div>
      )}

      <div className="relative w-full h-[600px] md:h-[500px] rounded-lg border border-gray-200 shadow-md overflow-hidden">
        <CandlestickChart
          seriesData={{ ...symbolsData, expression: expressionData }}
          selectedPlots={selectedPlots}
          precision={precision}
        />
      </div>
    </div>
  );
};

export default ChartExpressionApp;
