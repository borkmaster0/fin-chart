import React, { useRef, useEffect, useState } from 'react';
import { CandlestickSeries, AreaSeries, HistogramSeries, CrosshairMode, createChart, ColorType, SeriesMarker, createSeriesMarkers } from 'lightweight-charts';
import { AlertTriangle, Loader, LineChart, CandlestickChart, Table } from 'lucide-react';
import { ChartData } from '../types';
import { formatTimeTooltip, formatCurrency } from '../utils/formatters';
import { saveSettings, loadSettings } from '../utils/db';
import DividendsTable from './DividendsTable';

interface ChartContainerProps {
  data: ChartData | null;
  isLoading: boolean;
  error: string | null;
  darkMode: boolean;
  timeframe?: string;
}

const ChartContainer: React.FC<ChartContainerProps> = ({ 
  data, 
  isLoading, 
  error,
  darkMode,
  timeframe = '1d'
}) => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [showDividends, setShowDividends] = useState(true);
  const [showSplits, setShowSplits] = useState(true);
  const [chartType, setChartType] = useState<'line' | 'candlestick'>('line');
  const [viewMode, setViewMode] = useState<'chart' | 'table'>('chart');
  const [timezoneOffset, setTimezoneOffset] = useState(0);
  const [precision, setPrecision] = useState(2);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const toolTipRef = useRef<HTMLDivElement | null>(null);
  const legendRef = useRef<HTMLDivElement>(null);

  // Determine if time should be visible based on timeframe
  const shouldShowTime = !['1d', '5d', '1wk', '1mo', '3mo'].includes(timeframe);

  // Load settings from IndexedDB when component mounts
  useEffect(() => {
    const loadSavedSettings = async () => {
      try {
        const settings = await loadSettings();
        if (settings) {
          setShowDividends(settings.showDividends);
          setShowSplits(settings.showSplits);
          setChartType(settings.chartType);
          setTimezoneOffset(settings.timezoneOffset);
          setPrecision(settings.precision);
        }
        setIsInitialized(true);
      } catch (error) {
        console.error('Failed to load settings:', error);
        setIsInitialized(true);
      }
    };
    loadSavedSettings();
  }, []);

  // Save settings to IndexedDB whenever they change
  useEffect(() => {
    if (!isInitialized) return;

    const saveChartSettings = async () => {
      try {
        await saveSettings({
          showDividends,
          showSplits,
          chartType,
          timezoneOffset,
          precision
        });
      } catch (error) {
        console.error('Failed to save settings:', error);
      }
    };
    saveChartSettings();
  }, [showDividends, showSplits, chartType, timezoneOffset, precision, isInitialized]);

  useEffect(() => {
    if (!chartContainerRef.current || !isInitialized || viewMode === 'table') return;

    // Clean up previous chart and tooltip if they exist
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }
    
    if (toolTipRef.current) {
      toolTipRef.current.remove();
      toolTipRef.current = null;
    }

    // Create new chart instance
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: darkMode ? '#1E293B' : '#FFFFFF' },
        textColor: darkMode ? '#E2E8F0' : '#334155',
      },
      width: chartContainerRef.current.clientWidth,
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
      },
      crosshair: {
        mode: CrosshairMode.Normal
      },
      timeScale: {
        borderColor: darkMode ? '#334155' : '#E2E8F0',
        timeVisible: shouldShowTime,
        secondsVisible: false,
      },
    });
    
    chartRef.current = chart;

    // Create and add series only if we have data
    if (data && data.timestamp && data.close) {
      const mainSeries = chart.addSeries(chartType === 'line' ? AreaSeries : CandlestickSeries, {
        ...(chartType === 'line' ? {
          lineColor: '#3B82F6',
          topColor: 'rgba(59, 130, 246, 0.4)',
          bottomColor: 'rgba(59, 130, 246, 0.1)',
          lineWidth: 2,
        } : {
          upColor: '#10B981',
          downColor: '#EF4444',
          borderVisible: false,
          wickUpColor: '#10B981',
          wickDownColor: '#EF4444',
        }),
        priceScaleId: 'right',
        priceFormat: { 
          type: 'price',
          precision: precision,
          minMove: 1 / Math.pow(10, precision)
        }
      });

      const volumeSeries = chart.addSeries(HistogramSeries, {
        color: '#60A5FA',
        priceFormat: { type: 'volume' },
        priceScaleId: '',
        scaleMargins: {
          top: 0.8,
          bottom: 0,
        },
      });

      // Apply timezone offset to timestamps
      const offsetMs = timezoneOffset * 60 * 60 * 1000;
      const priceData = data.timestamp.map((time, index) => ({
        time: time + (offsetMs / 1000), // Convert offset to seconds
        ...(chartType === 'line' ? {
          value: data.close[index],
        } : {
          open: data.open[index],
          high: data.high[index],
          low: data.low[index],
          close: data.close[index],
        }),
      })).filter(point => chartType === 'line' ? point.value !== null : point.close !== null);

      const volumeData = data.timestamp.map((time, index) => ({
        time: time + (offsetMs / 1000), // Convert offset to seconds
        value: data.volume[index],
        color: index > 0 && data.close[index] > data.close[index - 1] 
          ? '#10B981' 
          : '#EF4444',
      })).filter(point => point.value !== null);

      // Create markers for dividends and splits based on visibility settings
      const markers: SeriesMarker[] = [];
      
      if (data.events?.dividends && showDividends) {
        Object.entries(data.events.dividends).forEach(([timestamp, dividend]) => {
          const time = parseInt(timestamp) + (offsetMs / 1000);
          markers.push({
            time,
            position: 'aboveBar',
            color: '#22C55E',
            shape: 'circle',
            text: `Div $${dividend.amount.toFixed(precision)}`,
          });
        });
      }

      if (data.events?.splits && showSplits) {
        Object.entries(data.events.splits).forEach(([timestamp, split]) => {
          const time = parseInt(timestamp) + (offsetMs / 1000);
          markers.push({
            time,
            position: 'aboveBar',
            color: '#8B5CF6',
            shape: 'square',
            text: `Split ${split.splitRatio}`,
          });
        });
      }

      mainSeries.setData(priceData);
      volumeSeries.setData(volumeData);
      
      // Add markers if any exist
      if (markers.length > 0) {
        createSeriesMarkers(mainSeries, markers);
      }

      chart.timeScale().fitContent();

      volumeSeries.priceScale().applyOptions({
        scaleMargins: {
          top: 0.8,
          bottom: 0,
        },
      });

      // Create tooltip
      const toolTip = document.createElement('div');
      toolTip.className = 'tooltip invisible absolute z-10 p-2 rounded shadow-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs';
      chartContainerRef.current.appendChild(toolTip);
      toolTipRef.current = toolTip;

      // Subscribe to crosshair move for legend and tooltip updates
      chart.subscribeCrosshairMove(param => {
        if (!param.time || param.point.x < 0 || param.point.y < 0) {
          toolTip.style.display = 'none';
          if (legendRef.current) {
            legendRef.current.innerHTML = chartType === 'line' 
              ? '<div class="flex flex-wrap gap-2 text-xs sm:text-sm"><span>Price: -</span><span>Vol: -</span></div>'
              : '<div class="flex flex-wrap gap-1 text-xs sm:text-sm"><span>O: -</span><span>H: -</span><span>L: -</span><span>C: -</span><span>Vol: -</span></div>';
          }
          return;
        }

        const price = param.seriesData.get(mainSeries);
        const volume = param.seriesData.get(volumeSeries)?.value;

        if (!price) {
          toolTip.style.display = 'none';
          return;
        }

        const priceValue = chartType === 'line' ? price.value : price.close;

        // Update tooltip with timezone-adjusted time
        toolTip.style.display = 'block';
        toolTip.innerHTML = `
          <div class="font-medium">Time: ${formatTimeTooltip(param.time, timezoneOffset)}</div>
          ${chartType === 'candlestick' ? `
            <div class="font-medium mt-1">Open: ${(price.open.toFixed(precision))}</div>
            <div class="font-medium">High: ${(price.high.toFixed(precision))}</div>
            <div class="font-medium">Low: ${(price.low.toFixed(precision))}</div>
            <div class="font-medium">Close: ${(price.close.toFixed(precision))}</div>
          ` : `
            <div class="font-medium mt-1">Price: ${(priceValue.toFixed(precision))}</div>
          `}
          ${volume ? `<div class="font-medium mt-1">Volume: ${volume.toLocaleString()}</div>` : ''}
        `;

        const left = param.point.x;
        const top = param.point.y;
        const toolTipWidth = 120;
        const toolTipHeight = chartType === 'candlestick' ? 120 : 80;
        const chartRect = chartContainerRef.current!.getBoundingClientRect();

        toolTip.style.left = Math.max(0, Math.min(left - toolTipWidth / 2, chartRect.width - toolTipWidth)) + 'px';
        toolTip.style.top = Math.max(0, top - toolTipHeight - 8) + 'px';

        // Update legend with mobile-friendly layout
        if (legendRef.current) {
          if (chartType === 'line') {
            legendRef.current.innerHTML = `
              <div class="flex flex-wrap gap-2 text-xs sm:text-sm">
                <span>Price: ${(priceValue.toFixed(precision))}</span>
                <span>Vol: ${volume?.toLocaleString() || '-'}</span>
              </div>
            `;
          } else {
            legendRef.current.innerHTML = `
              <div class="flex flex-wrap gap-1 text-xs sm:text-sm">
                <span>O: ${(price.open.toFixed(precision))}</span>
                <span>H: ${(price.high.toFixed(precision))}</span>
                <span>L: ${(price.low.toFixed(precision))}</span>
                <span>C: ${(price.close.toFixed(precision))}</span>
                <span>Vol: ${volume?.toLocaleString() || '-'}</span>
              </div>
            `;
          }

          // Set legend color based on price movement
          const priceIndex = data.timestamp.indexOf(param.time - (offsetMs / 1000)); // Adjust for timezone
          if (priceIndex > 0) {
            const prevPrice = data.close[priceIndex - 1];
            if (priceValue > prevPrice) {
              legendRef.current.style.color = '#10B981'; // green for up
            } else if (priceValue < prevPrice) {
              legendRef.current.style.color = '#EF4444'; // red for down
            } else {
              legendRef.current.style.color = darkMode ? '#E2E8F0' : '#334155'; // neutral
            }
          }
        }
      });
    }

    // Set up resize observer
    const resizeObserver = new ResizeObserver(entries => {
      if (entries.length === 0 || !entries[0].contentRect) return;
      const { width } = entries[0].contentRect;
      chart.applyOptions({ width });
    });
    
    resizeObserver.observe(chartContainerRef.current);
    resizeObserverRef.current = resizeObserver;

    // Cleanup function
    return () => {
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
      }
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
      if (toolTipRef.current) {
        toolTipRef.current.remove();
        toolTipRef.current = null;
      }
    };
  }, [darkMode, data, timezoneOffset, precision, showDividends, showSplits, chartType, isInitialized, viewMode, shouldShowTime]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[500px] bg-slate-50 dark:bg-slate-800/50 rounded-lg">
        <div className="text-center">
          <Loader className="w-10 h-10 text-primary mx-auto animate-spin" />
          <p className="mt-4 text-slate-600 dark:text-slate-400">Loading chart data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-[500px] bg-slate-50 dark:bg-slate-800/50 rounded-lg">
        <div className="text-center max-w-md">
          <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto" />
          <h3 className="mt-2 text-lg font-semibold">Failed to load chart</h3>
          <p className="mt-1 text-slate-600 dark:text-slate-400">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-[500px] bg-slate-50 dark:bg-slate-800/50 rounded-lg">
        <div className="text-center">
          <p className="text-slate-600 dark:text-slate-400">No data available. Please search for a symbol.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode('chart')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors ${
              viewMode === 'chart'
                ? 'bg-primary text-white'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
            }`}
          >
            <LineChart size={16} />
            <span className="text-sm">Chart</span>
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors ${
              viewMode === 'table'
                ? 'bg-primary text-white'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
            }`}
          >
            <Table size={16} />
            <span className="text-sm">Dividends & Splits</span>
          </button>
        </div>

        {viewMode === 'chart' && (
          <>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setChartType('line')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors ${
                  chartType === 'line'
                    ? 'bg-primary text-white'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                }`}
              >
                <LineChart size={16} />
                <span className="text-sm">Line</span>
              </button>
              <button
                onClick={() => setChartType('candlestick')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors ${
                  chartType === 'candlestick'
                    ? 'bg-primary text-white'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                }`}
              >
                <CandlestickChart size={16} />
                <span className="text-sm">Candlestick</span>
              </button>
            </div>

            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={showDividends}
                  onChange={(e) => setShowDividends(e.target.checked)}
                  className="form-checkbox h-4 w-4 text-primary rounded border-slate-300 dark:border-slate-600"
                />
                Show Dividends
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={showSplits}
                  onChange={(e) => setShowSplits(e.target.checked)}
                  className="form-checkbox h-4 w-4 text-primary rounded border-slate-300 dark:border-slate-600"
                />
                Show Splits
              </label>
            </div>
          </>
        )}
      </div>
      
      {viewMode === 'chart' && (
        <>
          <div className="mb-4 flex items-center gap-4 flex-wrap">
            <select
              value={timezoneOffset}
              onChange={(e) => setTimezoneOffset(Number(e.target.value))}
              className="text-sm border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 bg-white dark:bg-slate-800"
            >
              {Array.from({ length: 25 }, (_, i) => i - 12).map((offset) => (
                <option key={offset} value={offset}>
                  {offset === 0 ? 'UTC' : `UTC${offset > 0 ? '+' : ''}${offset}`}
                </option>
              ))}
            </select>

            <select
              value={precision}
              onChange={(e) => setPrecision(Number(e.target.value))}
              className="text-sm border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 bg-white dark:bg-slate-800"
            >
              {Array.from({ length: 6 }, (_, i) => i).map((p) => (
                <option key={p} value={p}>
                  {p === 0 ? 'No decimals' : `${p} decimal${p > 1 ? 's' : ''}`}
                </option>
              ))}
            </select>
          </div>
          
          <div className="relative">
            {/* Mobile-friendly legend positioned below chart controls */}
            <div 
              ref={legendRef}
              className="mb-3 p-2 bg-white/90 dark:bg-slate-800/90 rounded-md shadow-sm border border-slate-200 dark:border-slate-700"
            >
              <div className="flex flex-wrap gap-2 text-xs sm:text-sm font-mono">
                {chartType === 'line' ? (
                  <>
                    <span>Price: -</span>
                    <span>Vol: -</span>
                  </>
                ) : (
                  <>
                    <span>O: -</span>
                    <span>H: -</span>
                    <span>L: -</span>
                    <span>C: -</span>
                    <span>Vol: -</span>
                  </>
                )}
              </div>
            </div>
            <div 
              ref={chartContainerRef} 
              className="w-full h-[500px] rounded-lg overflow-hidden"
            />
          </div>
        </>
      )}

      {viewMode === 'table' && (
        <DividendsTable data={data} />
      )}
    </div>
  );
};

export default ChartContainer;