import React, { useState, useEffect, useRef } from 'react';
import { createChart, ISeriesApi, CandlestickSeries, ColorType, CrosshairMode } from 'lightweight-charts';
import { TrendingUp, TrendingDown, DollarSign, Users, Activity, BarChart3, Loader2, AlertTriangle, Calendar } from 'lucide-react';
import { fetchOrderBook, fetchMarketDetails, fetchCandlestickData, OrderBookResponse, CandlestickResponse } from '../utils/api';

interface PredictionMarket {
  id: string;
  event_ticker: string;
  series_ticker: string;
  title: string;
  subtitle?: string;
  close_date: string;
  volume_24h: number;
  open_interest: number;
  liquidity: number;
  yes_price: number;
  no_price: number;
  yes_bid?: number;
  yes_ask?: number;
  no_bid?: number;
  no_ask?: number;
}

interface CandlestickChartProps {
  data: Record<string, Array<{
    time: number;
    open: number | null;
    high: number | null;
    low: number | null;
    close: number | null;
  }>>;
  isLoading: boolean;
  error: string | null;
}

const CandlestickChart: React.FC<CandlestickChartProps> = ({ data, isLoading, error }) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<ReturnType<typeof createChart> | null>(null);
  const seriesRefs = useRef<Record<string, ISeriesApi<'Candlestick'>>>({});

  // Chart colors for different series
  const chartColors = [
    '#2962FF', '#FF6D00', '#D50000', '#00C853', '#AA00FF',
    '#0091EA', '#C51162', '#FFD600', '#6200EA', '#00BFA5'
  ];

  useEffect(() => {
    if (!chartRef.current || isLoading || error) return;

    const isDarkMode = document.documentElement.classList.contains('dark');
    
    const chart = createChart(chartRef.current, {
      width: chartRef.current.clientWidth,
      height: 400,
      layout: {
        background: { type: ColorType.Solid, color: isDarkMode ? '#1E293B' : '#FFFFFF' },
        textColor: isDarkMode ? '#E2E8F0' : '#334155',
      },
      grid: {
        vertLines: {
          color: isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.06)',
        },
        horzLines: {
          color: isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.06)',
        },
      },
      rightPriceScale: {
        borderColor: isDarkMode ? '#334155' : '#E2E8F0',
        borderVisible: true,
      },
      crosshair: {
        mode: CrosshairMode.Normal,
      },
      timeScale: {
        borderColor: isDarkMode ? '#334155' : '#E2E8F0',
        timeVisible: true,
        secondsVisible: false,
      }
    });

    chartInstance.current = chart;

    // Add series for each market
    Object.entries(data).forEach(([marketId, candlesticks], index) => {
      if (candlesticks.length === 0) return;

      const series = chart.addSeries(CandlestickSeries, {
        upColor: chartColors[index % chartColors.length],
        downColor: chartColors[index % chartColors.length],
        borderVisible: false,
        wickUpColor: chartColors[index % chartColors.length],
        wickDownColor: chartColors[index % chartColors.length],
        priceFormat: {
          type: 'price',
          precision: 2,
          minMove: 0.01,
        },
      });

      // Filter out null values and convert to proper format
      const validData = candlesticks
        .filter(candle => 
          candle.open !== null && 
          candle.high !== null && 
          candle.low !== null && 
          candle.close !== null
        )
        .map(candle => ({
          time: candle.time,
          open: candle.open!,
          high: candle.high!,
          low: candle.low!,
          close: candle.close!,
        }));

      if (validData.length > 0) {
        series.setData(validData);
        seriesRefs.current[marketId] = series;
      }
    });

    chart.timeScale().fitContent();

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
  }, [data, isLoading, error]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[400px] bg-slate-50 dark:bg-slate-800 rounded-lg">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-primary mx-auto animate-spin mb-2" />
          <p className="text-slate-600 dark:text-slate-400">Loading price history...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-[400px] bg-slate-50 dark:bg-slate-800 rounded-lg">
        <div className="text-center">
          <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-2" />
          <p className="text-slate-600 dark:text-slate-400">{error}</p>
        </div>
      </div>
    );
  }

  const hasData = Object.values(data).some(series => series.length > 0);

  if (!hasData) {
    return (
      <div className="flex items-center justify-center h-[400px] bg-slate-50 dark:bg-slate-800 rounded-lg">
        <div className="text-center">
          <BarChart3 className="w-8 h-8 text-slate-400 mx-auto mb-2" />
          <p className="text-slate-600 dark:text-slate-400">No price history available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Chart Legend */}
      <div className="flex flex-wrap gap-4 text-sm">
        {Object.keys(data).map((marketId, index) => (
          <div key={marketId} className="flex items-center gap-2">
            <div 
              className="w-4 h-4 rounded"
              style={{ backgroundColor: chartColors[index % chartColors.length] }}
            ></div>
            <span className="text-slate-600 dark:text-slate-400">
              Market {index + 1}
            </span>
          </div>
        ))}
      </div>
      
      {/* Chart */}
      <div ref={chartRef} className="w-full h-[400px] rounded-lg border border-slate-200 dark:border-slate-700" />
    </div>
  );
};

const PredictionView: React.FC = () => {
  const [selectedEvent, setSelectedEvent] = useState<PredictionMarket | null>(null);
  const [orderBooks, setOrderBooks] = useState<Record<string, OrderBookResponse>>({});
  const [isLoadingOrderBooks, setIsLoadingOrderBooks] = useState(false);
  const [candlestickData, setCandlestickData] = useState<Record<string, Array<{
    time: number;
    open: number | null;
    high: number | null;
    low: number | null;
    close: number | null;
  }>>>({});
  const [isLoadingCandlesticks, setIsLoadingCandlesticks] = useState(false);
  const [candlestickError, setCandlestickError] = useState<string | null>(null);

  // Mock data for demonstration
  const mockEvents: PredictionMarket[] = [
    {
      id: '1',
      event_ticker: 'KXLALEADEROUT-35',
      series_ticker: 'KXLALEADEROUT',
      title: 'Which of these Latin America leaders will leave office next?',
      subtitle: 'Before 2035',
      close_date: '2035-01-01T15:00:00Z',
      volume_24h: 4700,
      open_interest: 4500,
      liquidity: 1200000,
      yes_price: 0.45,
      no_price: 0.55,
      yes_bid: 0.44,
      yes_ask: 0.46,
      no_bid: 0.54,
      no_ask: 0.56,
    },
    {
      id: '2',
      event_ticker: 'KXWARMING-50',
      series_ticker: 'KXWARMING',
      title: 'Will global temperatures rise by 2°C by 2050?',
      subtitle: 'Climate prediction market',
      close_date: '2050-12-31T23:59:59Z',
      volume_24h: 8200,
      open_interest: 12000,
      liquidity: 2500000,
      yes_price: 0.72,
      no_price: 0.28,
      yes_bid: 0.71,
      yes_ask: 0.73,
      no_bid: 0.27,
      no_ask: 0.29,
    },
  ];

  const handleEventClick = async (event: PredictionMarket) => {
    setSelectedEvent(event);
    setIsLoadingOrderBooks(true);
    setIsLoadingCandlesticks(true);
    setCandlestickError(null);

    try {
      // Step 1: Fetch market details to get series IDs
      console.log('Fetching market details for:', event.series_ticker, event.event_ticker);
      const { marketDetails } = await fetchMarketDetails(event.series_ticker, event.event_ticker);
      console.log('Market details received:', marketDetails);

      // Step 2: Calculate timestamps for candlestick data
      const endTs = Math.floor(Date.now() / 1000); // Current time in seconds
      const periodInterval = 60; // 60 minutes
      const maxPeriods = 5000; // API limit
      
      // Calculate start_ts: go back 5000 periods (60 minutes each) from end_ts
      const startTs = endTs - (maxPeriods * periodInterval * 60); // Convert minutes to seconds
      
      console.log('Timestamp range:', {
        startTs,
        endTs,
        periodInterval,
        maxPeriods,
        startDate: new Date(startTs * 1000).toISOString(),
        endDate: new Date(endTs * 1000).toISOString(),
        totalHours: maxPeriods,
        totalDays: Math.round(maxPeriods / 24)
      });

      // Step 3: Fetch candlestick data for each market with delay
      const candlestickResults: Record<string, Array<{
        time: number;
        open: number | null;
        high: number | null;
        low: number | null;
        close: number | null;
      }>> = {};

      for (let i = 0; i < marketDetails.length; i++) {
        const market = marketDetails[i];
        try {
          console.log(`Fetching candlesticks for market ${i + 1}/${marketDetails.length}:`, market.id);
          
          const candlestickResponse = await fetchCandlestickData(
            event.series_ticker,
            market.id,
            startTs,
            endTs,
            periodInterval
          );

          // Transform the data
          const transformedData = candlestickResponse.candlesticks.map(candle => ({
            time: candle.end_period_ts,
            open: candle.price.open,
            high: candle.price.high,
            low: candle.price.low,
            close: candle.price.close,
          }));

          candlestickResults[market.id] = transformedData;
          console.log(`Candlestick data for ${market.id}:`, transformedData.length, 'candles');

          // 10ms delay between calls as requested
          if (i < marketDetails.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 10));
          }
        } catch (error) {
          console.error(`Failed to fetch candlesticks for market ${market.id}:`, error);
          candlestickResults[market.id] = [];
        }
      }

      setCandlestickData(candlestickResults);

      // Step 4: Fetch order books for the markets
      const marketTickers = marketDetails.map(market => market.id).join(',');
      console.log('Fetching order books for tickers:', marketTickers);
      
      const orderBookData = await fetchOrderBook(marketTickers);
      setOrderBooks({ [event.id]: orderBookData });

    } catch (error) {
      console.error('Error fetching event data:', error);
      setCandlestickError(error instanceof Error ? error.message : 'Failed to load price data');
    } finally {
      setIsLoadingOrderBooks(false);
      setIsLoadingCandlesticks(false);
    }
  };

  const formatPrice = (price: number) => `${(price * 100).toFixed(0)}¢`;
  const formatVolume = (volume: number) => {
    if (volume >= 1000000) return `${(volume / 1000000).toFixed(1)}M`;
    if (volume >= 1000) return `${(volume / 1000).toFixed(1)}K`;
    return volume.toString();
  };

  if (selectedEvent) {
    const orderBook = orderBooks[selectedEvent.id];
    const totalVolume = mockEvents.reduce((sum, event) => sum + event.volume_24h, 0);
    const totalOpenInterest = mockEvents.reduce((sum, event) => sum + event.open_interest, 0);
    const totalLiquidity = mockEvents.reduce((sum, event) => sum + event.liquidity, 0);
    const activeMarkets = mockEvents.length;

    return (
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Back Button */}
        <button
          onClick={() => setSelectedEvent(null)}
          className="flex items-center gap-2 text-primary hover:text-primary-dark transition-colors"
        >
          ← Back to Markets
        </button>

        {/* Event Header */}
        <div className="space-y-4">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
                {selectedEvent.title}
              </h1>
              {selectedEvent.subtitle && (
                <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                  <Calendar size={16} />
                  <span>{selectedEvent.subtitle}</span>
                </div>
              )}
            </div>
            <div className="text-right">
              <div className="text-sm text-slate-600 dark:text-slate-400">Closes</div>
              <div className="font-medium">
                {new Date(selectedEvent.close_date).toLocaleDateString()}
              </div>
            </div>
          </div>
        </div>

        {/* Candlestick Chart */}
        <div className="card">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
              Price History
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Historical price movements for all markets in this event (last {Math.round(5000 / 24)} days)
            </p>
          </div>
          
          <CandlestickChart 
            data={candlestickData}
            isLoading={isLoadingCandlesticks}
            error={candlestickError}
          />
        </div>

        {/* Market Overview */}
        <div className="card">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6">
            Market Overview ({activeMarkets} active markets)
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-6 text-center">
              <div className="text-2xl font-bold text-slate-900 dark:text-white">
                {formatVolume(totalVolume)}
              </div>
              <div className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                Total Volume
              </div>
            </div>
            
            <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-6 text-center">
              <div className="text-2xl font-bold text-slate-900 dark:text-white">
                {formatVolume(totalOpenInterest)}
              </div>
              <div className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                Open Interest
              </div>
            </div>
            
            <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-6 text-center">
              <div className="text-2xl font-bold text-slate-900 dark:text-white">
                {formatVolume(totalLiquidity)}
              </div>
              <div className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                Total Liquidity
              </div>
            </div>
            
            <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-6 text-center">
              <div className="text-2xl font-bold text-slate-900 dark:text-white">
                {activeMarkets}
              </div>
              <div className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                Active Markets
              </div>
            </div>
          </div>
        </div>

        {/* Individual Markets */}
        <div className="space-y-6">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            Individual Markets
          </h2>
          
          {isLoadingOrderBooks ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <Loader2 className="w-8 h-8 text-primary mx-auto animate-spin mb-2" />
                <p className="text-slate-600 dark:text-slate-400">Loading market data...</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Mock individual markets for the selected event */}
              {Array.from({ length: 3 }, (_, i) => (
                <div key={i} className="card">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-slate-900 dark:text-white">
                      Option {String.fromCharCode(65 + i)}
                    </h3>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-slate-600 dark:text-slate-400">
                        {formatPrice(0.45 + i * 0.1)}
                      </span>
                      <div className={`flex items-center gap-1 ${
                        i % 2 === 0 ? 'text-positive' : 'text-negative'
                      }`}>
                        {i % 2 === 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                        <span className="text-sm font-medium">
                          {i % 2 === 0 ? '+' : '-'}{(Math.random() * 5).toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="text-center">
                      <div className="text-sm text-slate-600 dark:text-slate-400">Volume</div>
                      <div className="font-medium">{formatVolume(1500 + i * 500)}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-sm text-slate-600 dark:text-slate-400">Open Interest</div>
                      <div className="font-medium">{formatVolume(2000 + i * 300)}</div>
                    </div>
                  </div>
                  
                  {/* Order Book Preview */}
                  <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
                    <div className="text-sm font-medium text-slate-900 dark:text-white mb-2">
                      Order Book
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div>
                        <div className="text-positive font-medium mb-1">YES Bids</div>
                        <div className="space-y-1">
                          <div className="flex justify-between">
                            <span>44¢</span>
                            <span>500</span>
                          </div>
                          <div className="flex justify-between">
                            <span>43¢</span>
                            <span>250</span>
                          </div>
                        </div>
                      </div>
                      <div>
                        <div className="text-negative font-medium mb-1">YES Asks</div>
                        <div className="space-y-1">
                          <div className="flex justify-between">
                            <span>46¢</span>
                            <span>300</span>
                          </div>
                          <div className="flex justify-between">
                            <span>47¢</span>
                            <span>150</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold text-slate-900 dark:text-white">
          Prediction Markets
        </h1>
        <p className="text-xl text-slate-600 dark:text-slate-400">
          Trade on the outcome of future events
        </p>
      </div>

      {/* Market List */}
      <div className="space-y-6">
        {mockEvents.map((event) => (
          <div 
            key={event.id}
            className="card hover:shadow-lg transition-all duration-200 cursor-pointer"
            onClick={() => handleEventClick(event)}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex-1">
                <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
                  {event.title}
                </h3>
                {event.subtitle && (
                  <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400 mb-3">
                    <Calendar size={16} />
                    <span>{event.subtitle}</span>
                  </div>
                )}
              </div>
              <div className="text-right">
                <div className="text-sm text-slate-600 dark:text-slate-400">Closes</div>
                <div className="font-medium">
                  {new Date(event.close_date).toLocaleDateString()}
                </div>
              </div>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div className="text-center">
                <div className="flex items-center justify-center gap-1 text-slate-600 dark:text-slate-400 mb-1">
                  <Activity size={16} />
                  <span className="text-sm">Volume 24h</span>
                </div>
                <div className="font-bold text-lg">{formatVolume(event.volume_24h)}</div>
              </div>
              
              <div className="text-center">
                <div className="flex items-center justify-center gap-1 text-slate-600 dark:text-slate-400 mb-1">
                  <Users size={16} />
                  <span className="text-sm">Open Interest</span>
                </div>
                <div className="font-bold text-lg">{formatVolume(event.open_interest)}</div>
              </div>
              
              <div className="text-center">
                <div className="flex items-center justify-center gap-1 text-slate-600 dark:text-slate-400 mb-1">
                  <DollarSign size={16} />
                  <span className="text-sm">Liquidity</span>
                </div>
                <div className="font-bold text-lg">{formatVolume(event.liquidity)}</div>
              </div>
              
              <div className="text-center">
                <div className="text-sm text-slate-600 dark:text-slate-400 mb-1">YES Price</div>
                <div className="font-bold text-lg text-positive">
                  {formatPrice(event.yes_price)}
                </div>
              </div>
            </div>
            
            <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-positive rounded-full"></div>
                  <span>YES {formatPrice(event.yes_bid || event.yes_price)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-negative rounded-full"></div>
                  <span>NO {formatPrice(event.no_bid || event.no_price)}</span>
                </div>
              </div>
              <button className="text-primary hover:text-primary-dark font-medium">
                View Details →
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PredictionView;