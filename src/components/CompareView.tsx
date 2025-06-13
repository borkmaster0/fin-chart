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
): Promise<Record<string, CandlestickData[]>> {
  const symbols = extractSymbols(expression);
  const dataMap = await fetchWithDelay(symbols, timeframe, fetchChartData);

  // Find the symbol with the latest starting timestamp
  const alignedSymbols = symbols.map((sym) => ({
    symbol: sym,
    timestamps: dataMap[sym]?.timestamp || [],
  }));
  const base = alignedSymbols.reduce((a, b) =>
    a.timestamps[0] > b.timestamps[0] ? a : b
  );
  const baseTimestamps = base.timestamps;

  const resultMap: Record<string, CandlestickData[]> = {};

  // Raw symbol series
  for (const symbol of symbols) {
    const chartData: CandlestickData[] = [];
    const ts = dataMap[symbol]?.timestamp || [];
    for (let i = 0; i < ts.length; i++) {
      chartData.push({
        time: ts[i],
        open: dataMap[symbol].open[i],
        high: dataMap[symbol].high[i],
        low: dataMap[symbol].low[i],
        close: dataMap[symbol].close[i],
      });
    }
    resultMap[symbol] = chartData;
  }

  // Computed expression series
  const computed: CandlestickData[] = [];
  for (let i = 0; i < baseTimestamps.length; i++) {
    const scope: Record<string, number> = {};
    try {
      for (const sym of symbols) {
        const idx = dataMap[sym].timestamp.indexOf(baseTimestamps[i]);
        if (idx === -1) throw new Error(`Missing timestamp for ${sym}`);

        scope[`${sym}_close`] = dataMap[sym].close[idx];
        scope[`${sym}_open`] = dataMap[sym].open[idx];
        scope[`${sym}_high`] = dataMap[sym].high[idx];
        scope[`${sym}_low`] = dataMap[sym].low[idx];
      }

      const cleanExpr = (type: 'close' | 'open' | 'high' | 'low') =>
        expression.replace(/\[([^\]]+)]/g, (_, sym) => `${sym}_${type}`);

      const close = evaluate(cleanExpr('close'), scope);
      const open = evaluate(cleanExpr('open'), scope);
      const high = evaluate(cleanExpr('high'), scope);
      const low = evaluate(cleanExpr('low'), scope);

      computed.push({
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

  resultMap['Expression'] = computed;
  return resultMap;
}

// === Chart Rendering ===
interface CandlestickChartProps {
  data: CandlestickData[];
  precision: number;
}

interface CandlestickChartProps {
  dataMap: Record<string, CandlestickData[]>;
  visibility: Record<string, boolean>;
  precision: number;
}

const CandlestickChart: React.FC<CandlestickChartProps> = ({ dataMap, visibility, precision }) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<ReturnType<typeof createChart> | null>(null);
  const seriesRefs = useRef<Record<string, ISeriesApi<'Candlestick'>>>({});
  const [hoveredValues, setHoveredValues] = useState<any>(null);

  useEffect(() => {
    if (!chartRef.current) return;

    const container = chartRef.current;
    const darkMode = localStorage.darkMode;
    const chart = createChart(container, {
      width: container.clientWidth,
      height: 500,
      layout: {
        background: { type: ColorType.Solid, color: darkMode ? '#1E293B' : '#FFFFFF' },
        textColor: darkMode ? '#E2E8F0' : '#334155',
      },
      grid: {
        vertLines: { color: 'rgba(197, 203, 206, 0.2)' },
        horzLines: { color: 'rgba(197, 203, 206, 0.2)' },
      },
      rightPriceScale: { borderColor: '#D1D5DB' },
      crosshair: { mode: CrosshairMode.Normal },
      timeScale: {
        borderColor: darkMode ? '#334155' : '#E2E8F0',
        timeVisible: true,
        secondsVisible: false,
      },
    });

    chartInstance.current = chart;

    const resizeObserver = new ResizeObserver(() => {
      chart.resize(container.clientWidth, container.clientHeight);
    });

    resizeObserver.observe(container);

    return () => {
      chart.remove();
      resizeObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    const chart = chartInstance.current;
    if (!chart) return;

    // Clear old series
    Object.values(seriesRefs.current).forEach(series => chart.removeSeries(series));
    seriesRefs.current = {};

    Object.entries(dataMap).forEach(([key, data], idx) => {
      const color = key === 'Expression' ? '#3B82F6' : ['#EF4444', '#10B981', '#F59E0B'][idx % 3];
      const series = chart.addCandlestickSeries({
        priceScaleId: 'right',
        priceFormat: {
          type: 'price',
          precision: precision,
          minMove: 1 / Math.pow(10, precision),
        },
        upColor: color,
        downColor: color,
        borderVisible: false,
        wickUpColor: color,
        wickDownColor: color,
        visible: visibility[key],
      });
      series.setData(data);
      seriesRefs.current[key] = series;
    });

    chartInstance.current?.subscribeCrosshairMove(param => {
      if (!param?.time || !param.seriesData) return setHoveredValues(null);
      const expressionSeries = seriesRefs.current["Expression"];
      const hovered = param.seriesData.get(expressionSeries) as CandlestickData;
      if (hovered) {
        setHoveredValues(hovered);
      }
    });
  }, [dataMap, visibility, precision]);

  return (
    <div ref={chartRef} className="relative w-full h-full">
      {hoveredValues && (
        <div className="absolute top-2 right-4 bg-white dark:bg-slate-800 text-sm shadow-md border border-gray-200 dark:border-gray-700 rounded px-3 py-2 z-10">
          <div>O: <span className="text-blue-500">{hoveredValues.open?.toFixed(precision)}</span></div>
          <div>H: <span className="text-green-500">{hoveredValues.high?.toFixed(precision)}</span></div>
          <div>L: <span className="text-red-500">{hoveredValues.low?.toFixed(precision)}</span></div>
          <div>C: <span className="text-purple-500">{hoveredValues.close?.toFixed(precision)}</span></div>
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
