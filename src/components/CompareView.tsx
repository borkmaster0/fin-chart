import React, { useState, useEffect, useRef } from 'react';
import { createChart, ColorType, CrosshairMode, ISeriesApi, CandlestickData, CandlestickSeries } from 'lightweight-charts';
import { evaluate } from 'mathjs';
import { fetchChartData } from '../utils/api'; // Adjust path as needed
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

type VisibilityMap = Record<string, boolean>;
type ChartDataMap = Record<string, CandlestickData[]>;

// === Utility Functions ===
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
    await new Promise(res => setTimeout(res, 1000));
  }
  return dataMap;
}

async function computeOHLCExpression(
  expression: string,
  timeframe: string,
  fetchChartData: (symbol: string, timeframe: string) => Promise<ChartData>
): Promise<{ result: CandlestickData[]; rawData: ChartDataMap }> {
  const symbols = extractSymbols(expression);
  const raw = await fetchWithDelay(symbols, timeframe, fetchChartData);

  // Use the latest start timestamp as baseline
  const validTimestamps: number[][] = symbols.map(s => raw[s]?.timestamp ?? []);
  const startIndices = validTimestamps.map(arr => arr.findIndex(Boolean));
  const latestStart = Math.max(...startIndices.map((i, idx) => validTimestamps[idx][i]));

  const baseTimestamps = raw[symbols[0]].timestamp;
  const result: CandlestickData[] = [];

  for (let i = 0; i < baseTimestamps.length; i++) {
    if (baseTimestamps[i] < latestStart) continue;

    const scope: Record<string, number> = {};
    try {
      for (const symbol of symbols) {
        scope[`${symbol}_close`] = raw[symbol].close[i];
        scope[`${symbol}_open`] = raw[symbol].open[i];
        scope[`${symbol}_high`] = raw[symbol].high[i];
        scope[`${symbol}_low`] = raw[symbol].low[i];
      }

      const cleanExpr = (type: 'close' | 'open' | 'high' | 'low') =>
        expression.replace(/\[([^\]]+)]/g, (_, sym) => `${sym}_${type}`);

      result.push({
        time: baseTimestamps[i],
        open: evaluate(cleanExpr('open'), scope),
        high: evaluate(cleanExpr('high'), scope),
        low: evaluate(cleanExpr('low'), scope),
        close: evaluate(cleanExpr('close'), scope),
      });
    } catch (err) {
      console.warn(`Skipping index ${i} due to error`, err);
    }
  }

  const chartDataMap: ChartDataMap = Object.fromEntries(
    symbols.map(symbol =>
      [symbol, raw[symbol].timestamp.map((t, i) => ({
        time: t,
        open: raw[symbol].open[i],
        high: raw[symbol].high[i],
        low: raw[symbol].low[i],
        close: raw[symbol].close[i],
      }))]
    )
  );

  return { result, rawData: chartDataMap };
}

// === Chart Component ===
interface CandlestickChartProps {
  dataMap: ChartDataMap;
  visibility: VisibilityMap;
  precision: number;
  onHover?: (values: CandlestickData | null) => void;
}

const CandlestickChart: React.FC<CandlestickChartProps> = ({ dataMap, visibility, precision, onHover }) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<ReturnType<typeof createChart> | null>(null);
  const seriesMap = useRef<Record<string, ISeriesApi<'Candlestick'>>>({});

  useEffect(() => {
    if (!chartRef.current) return;

    const darkMode = localStorage.darkMode;
    const chart = createChart(chartRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: darkMode ? '#1E293B' : '#FFFFFF' },
        textColor: darkMode ? '#E2E8F0' : '#334155',
      },
      grid: {
        vertLines: { color: 'rgba(197,203,206,0.3)' },
        horzLines: { color: 'rgba(197,203,206,0.3)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
      },
      timeScale: {
        timeVisible: true,
      },
    });

    chartInstance.current = chart;

    for (const [key, data] of Object.entries(dataMap)) {
      const series = chart.addSeries(CandlestickSeries, {
        priceFormat: {
          type: 'price',
          precision: precision,
          minMove: 1 / Math.pow(10, precision),
        },
      });
      series.setData(data);
      seriesMap.current[key] = series;
    }

    chart.subscribeCrosshairMove(param => {
      if (!param?.time || !param.seriesData) {
        onHover?.(null);
        return;
      }

      for (const [key, series] of Object.entries(seriesMap.current)) {
        if (visibility[key]) {
          const data = param.seriesData.get(series);
          if (data) {
            onHover?.(data as CandlestickData);
            return;
          }
        }
      }
      onHover?.(null);
    });

    const observer = new ResizeObserver(() => {
      if (chartRef.current) {
        chart.resize(chartRef.current.clientWidth, chartRef.current.clientHeight);
      }
    });
    observer.observe(chartRef.current);

    return () => {
      observer.disconnect();
      chart.remove();
    };
  }, [dataMap, visibility, precision]);

  return <div ref={chartRef} className="w-full h-full" />;
};

// === Main App ===
const ChartExpressionApp: React.FC = () => {
  const [expression, setExpression] = useState('[SPY] / [QQQ]');
  const [chartDataMap, setChartDataMap] = useState<ChartDataMap>({});
  const [loading, setLoading] = useState(false);
  const [precision, setPrecision] = useState(2);
  const [hovered, setHovered] = useState<CandlestickData | null>(null);
  const [visibility, setVisibility] = useState<VisibilityMap>({});

  const onEvaluate = async () => {
    setLoading(true);
    try {
      const { result, rawData } = await computeOHLCExpression(expression, '1d', fetchChartData);
      const allSeries: ChartDataMap = {
        ...rawData,
        [expression]: result,
      };

      setChartDataMap(allSeries);
      setVisibility(Object.fromEntries(Object.keys(allSeries).map(k => [k, k === expression])));
    } catch (err) {
      console.error('Evaluation failed:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
        <Calculator className="w-6 h-6 text-blue-500" />
        Expression Chart
      </h2>

      <div className="flex flex-col md:flex-row items-center gap-4 mb-4">
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
          {loading ? <><Loader2 className="animate-spin mr-2 w-4 h-4" />Computing...</> : 'Evaluate'}
        </button>
        <select
          value={precision}
          onChange={(e) => setPrecision(Number(e.target.value))}
          className="text-sm border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 bg-white dark:bg-slate-800"
        >
          {Array.from({ length: 10 }, (_, i) => i).map(p => (
            <option key={p} value={p}>
              {p === 0 ? 'No decimals' : `${p} decimal${p > 1 ? 's' : ''}`}
            </option>
          ))}
        </select>
      </div>

      {/* Visibility Toggle */}
      {Object.keys(chartDataMap).length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {Object.keys(chartDataMap).map((key) => (
            <label key={key} className="flex items-center gap-1 text-sm">
              <input
                type="checkbox"
                checked={visibility[key]}
                onChange={() => setVisibility(prev => ({ ...prev, [key]: !prev[key] }))}
              />
              {key === expression ? <span className="font-semibold text-blue-600">[Expression]</span> : key}
            </label>
          ))}
        </div>
      )}

      {Object.keys(chartDataMap).length > 0 && (
        <div className="relative w-full h-[600px] rounded-lg border border-gray-200 shadow-md overflow-hidden">
          {hovered && (
            <div className="absolute top-2 right-4 bg-white dark:bg-slate-800 text-sm shadow-md border border-gray-200 dark:border-gray-700 rounded px-3 py-2 z-10">
              <div className="font-semibold text-gray-700 dark:text-gray-200">O: <span className="text-blue-500">{hovered.open?.toFixed(precision)}</span></div>
              <div className="font-semibold text-gray-700 dark:text-gray-200">H: <span className="text-green-500">{hovered.high?.toFixed(precision)}</span></div>
              <div className="font-semibold text-gray-700 dark:text-gray-200">L: <span className="text-red-500">{hovered.low?.toFixed(precision)}</span></div>
              <div className="font-semibold text-gray-700 dark:text-gray-200">C: <span className="text-purple-500">{hovered.close?.toFixed(precision)}</span></div>
            </div>
          )}
          <CandlestickChart
            dataMap={Object.fromEntries(Object.entries(chartDataMap).filter(([key]) => visibility[key]))}
            visibility={visibility}
            precision={precision}
            onHover={setHovered}
          />
        </div>
      )}
    </div>
  );
};

export default ChartExpressionApp;
