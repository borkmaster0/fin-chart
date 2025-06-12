import React, { useState, useEffect, useRef } from 'react';
import { createChart, ISeriesApi, CandlestickSeries } from 'lightweight-charts';
import { evaluate } from 'mathjs';
import { fetchChartData } from '../utils/api';
import { ChartData } from '../types';

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

async function computeOHLCExpression(
  expression: string,
  timeframe: string,
  fetchChartData: (symbol: string, timeframe: string) => Promise<ChartData>
): Promise<CandlestickData[]> {
  const symbols = extractSymbols(expression);
  const dataMap: Record<string, ChartData> = {};

  await Promise.all(
    symbols.map(async (symbol) => {
      const data = await fetchChartData(symbol, timeframe);
      dataMap[symbol] = data;
    })
  );

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
}

const CandlestickChart: React.FC<CandlestickChartProps> = ({ data }) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);

  useEffect(() => {
    if (!chartRef.current) return;

    const chart = createChart(chartRef.current, { width: 700, height: 400 });
    const series = chart.addSeries(CandlestickSeries, {
        upColor: '#26a69a',
        downColor: '#ef5350',
        borderVisible: false,
        wickUpColor: '#26a69a',
        wickDownColor: '#ef5350',
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
  const [expression, setExpression] = useState('([AAPL] + [QQQ]) / 2');
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
    <div style={{ padding: '1rem' }}>
      <h2>OHLC Expression Chart</h2>
      <input
        value={expression}
        onChange={(e) => setExpression(e.target.value)}
        placeholder="Enter expression, e.g. ([AAPL] + [QQQ]) / 2"
        style={{ width: '400px', marginRight: '1rem' }}
      />
      <button onClick={onEvaluate} disabled={loading}>
        {loading ? 'Computing...' : 'Evaluate'}
      </button>

      {chartData.length > 0 && (
        <div style={{ marginTop: '2rem' }}>
          <CandlestickChart data={chartData} />
        </div>
      )}
    </div>
  );
};

export default ChartExpressionApp;
