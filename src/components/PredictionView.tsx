import React, { useState, useEffect, useRef } from 'react';
import { createChart, ISeriesApi, LineSeries, ColorType, CrosshairMode } from 'lightweight-charts';
import { TrendingUp, TrendingDown, DollarSign, Users, Activity, BarChart3, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { fetchOrderBook, fetchMarketDetails, fetchCandlestickData, OrderBookResponse, EventDetailResponse, CandlestickResponse } from '../utils/api';

interface PredictionEvent {
  event_ticker: string;
  series_ticker: string;
  title: string;
  subtitle: string;
  cap_strike: number;
  floor_strike: number;
  close_time: string;
  expiration_time: string;
  status: string;
  result: string | null;
  mutually_exclusive: boolean;
  category: string;
  tags: string[];
  markets: PredictionMarket[];
}

interface PredictionMarket {
  ticker: string;
  subtitle: string;
  yes_bid: number;
  yes_ask: number;
  no_bid: number;
  no_ask: number;
  last_price: number;
  volume: number;
  open_interest: number;
  dollar_volume: number;
  dollar_open_interest: number;
  close_time: string;
  expiration_time: string;
  status: string;
  result: string | null;
  can_close_early: boolean;
  response_price_units: string;
  strike_type: string;
  underlying: string;
  cap_strike: number;
  floor_strike: number;
}

interface MarketDetail {
  id: string;
  openDate: string;
  ticker: string;
}

interface CandlestickData {
  time: number;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
}

// Helper function to extract candidate name from ticker
const extractCandidateName = (ticker: string): string => {
  // Remove the event prefix (e.g., "KXLALEADEROUT-35-")
  const parts = ticker.split('-');
  if (parts.length >= 3) {
    const suffix = parts[parts.length - 1];
    
    // Map common suffixes to full names
    const nameMap: { [key: string]: string } = {
      'JRM': 'José Raúl Mulino',
      'LULA': 'Luiz Inácio Lula da Silva',
      'DB': 'Dina Boluarte',
      'GB': 'Gabriel Boric',
      'JM': 'Javier Milei',
      'GP': 'Gustavo Petro',
      'NM': 'Nicolás Maduro',
      'CS': 'Claudia Sheinbaum'
    };
    
    return nameMap[suffix] || suffix;
  }
  
  return ticker;
};

const PredictionView: React.FC = () => {
  const [events, setEvents] = useState<PredictionEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<PredictionEvent | null>(null);
  const [orderBooks, setOrderBooks] = useState<OrderBookResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedMarkets, setExpandedMarkets] = useState<Set<string>>(new Set());
  const [marketDetails, setMarketDetails] = useState<MarketDetail[]>([]);
  const [candlestickData, setCandlestickData] = useState<{ [marketId: string]: CandlestickData[] }>({});
  const [loadingChart, setLoadingChart] = useState(false);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);

  // Chart colors for different series
  const chartColors = [
    '#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6',
    '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'
  ];

  useEffect(() => {
    loadPredictionData();
  }, []);

  const loadPredictionData = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('https://corsproxy.io/?https://api.elections.kalshi.com/trade-api/v2/events?limit=200');
      
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const data = await response.json();
      setEvents(data.events || []);
    } catch (err) {
      console.error('Error loading prediction data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load prediction data');
    } finally {
      setLoading(false);
    }
  };

  const loadOrderBooks = async (marketTickers: string[]) => {
    try {
      const tickerString = marketTickers.join(',');
      const orderBookData = await fetchOrderBook(tickerString);
      setOrderBooks(orderBookData);
    } catch (err) {
      console.error('Error loading order books:', err);
    }
  };

  const loadCandlestickData = async (marketDetails: MarketDetail[]) => {
    try {
      setLoadingChart(true);
      const candlestickResults: { [marketId: string]: CandlestickData[] } = {};
      
      const endTs = Math.floor(Date.now() / 1000);
      const maxPeriods = 4000; // Reduced from 5000 to stay within limits
      const periodInterval = 60; // 1 hour
      
      for (const market of marketDetails) {
        try {
          // Calculate start time (4000 hours ago)
          let startTs = endTs - (maxPeriods * periodInterval);
          
          // If market opened after our calculated start time, use market open time
          const marketOpenTs = Math.floor(new Date(market.openDate).getTime() / 1000);
          if (marketOpenTs > startTs) {
            startTs = marketOpenTs;
          }
          
          const candlestickResponse = await fetchCandlestickData(
            selectedEvent!.series_ticker,
            market.id,
            startTs,
            endTs,
            periodInterval
          );
          
          // Transform candlestick data
          const transformedData: CandlestickData[] = candlestickResponse.candlesticks
            .filter(candle => candle.price.close !== null)
            .map(candle => ({
              time: candle.end_period_ts,
              open: candle.price.open,
              high: candle.price.high,
              low: candle.price.low,
              close: candle.price.close
            }));
          
          candlestickResults[market.id] = transformedData;
          
          // Wait 10ms between calls to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 10));
        } catch (err) {
          console.error(`Failed to fetch candlestick data for market ${market.id}:`, err);
        }
      }
      
      setCandlestickData(candlestickResults);
      
      // Create chart after data is loaded
      createChart(candlestickResults, marketDetails);
    } catch (err) {
      console.error('Error loading candlestick data:', err);
    } finally {
      setLoadingChart(false);
    }
  };

  const createChart = (data: { [marketId: string]: CandlestickData[] }, markets: MarketDetail[]) => {
    if (!chartContainerRef.current) return;

    // Clean up existing chart
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const isDarkMode = document.documentElement.classList.contains('dark');
    
    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
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
      },
      crosshair: {
        mode: CrosshairMode.Normal,
      },
      timeScale: {
        borderColor: isDarkMode ? '#334155' : '#E2E8F0',
        timeVisible: true,
        secondsVisible: false,
      },
    });

    chartRef.current = chart;

    // Add series for each market
    markets.forEach((market, index) => {
      const marketData = data[market.id];
      if (marketData && marketData.length > 0) {
        const candidateName = extractCandidateName(market.ticker);
        
        const series = chart.addSeries(LineSeries, {
          color: chartColors[index % chartColors.length],
          lineWidth: 2,
          title: candidateName,
          priceFormat: {
            type: 'price',
            precision: 0,
            minMove: 1,
          },
        });

        // Convert data to line series format (using close price)
        const lineData = marketData.map(candle => ({
          time: candle.time,
          value: candle.close || 0
        }));

        series.setData(lineData);
      }
    });

    chart.timeScale().fitContent();

    // Handle resize
    const resizeObserver = new ResizeObserver(entries => {
      if (entries.length === 0 || !entries[0].contentRect) return;
      const { width } = entries[0].contentRect;
      chart.applyOptions({ width });
    });

    resizeObserver.observe(chartContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  };

  const showEventDetails = async (event: PredictionEvent) => {
    setSelectedEvent(event);
    
    try {
      // Load market details first
      const marketDetailsResponse = await fetchMarketDetails(event.series_ticker, event.event_ticker);
      const markets = marketDetailsResponse.marketDetails.map(market => ({
        id: market.id,
        openDate: market.openDate,
        ticker: event.markets.find(m => m.ticker.includes(market.id.split('-').pop() || ''))?.ticker || market.id
      }));
      
      setMarketDetails(markets);
      
      // Load candlestick data
      await loadCandlestickData(markets);
      
      // Load order books
      const marketTickers = event.markets.map(market => market.ticker);
      await loadOrderBooks(marketTickers);
    } catch (err) {
      console.error('Error loading event details:', err);
    }
  };

  const toggleMarketExpansion = (ticker: string) => {
    const newExpanded = new Set(expandedMarkets);
    if (newExpanded.has(ticker)) {
      newExpanded.delete(ticker);
    } else {
      newExpanded.add(ticker);
    }
    setExpandedMarkets(newExpanded);
  };

  const formatPrice = (price: number) => {
    return `${price}¢`;
  };

  const formatCurrency = (value: number) => {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(1)}M`;
    } else if (value >= 1000) {
      return `$${(value / 1000).toFixed(1)}K`;
    }
    return `$${value.toFixed(0)}`;
  };

  const calculateTotalStats = () => {
    if (!selectedEvent) return { volume: 0, openInterest: 0, liquidity: 0, activeMarkets: 0 };
    
    return selectedEvent.markets.reduce((acc, market) => ({
      volume: acc.volume + market.volume,
      openInterest: acc.openInterest + market.open_interest,
      liquidity: acc.liquidity + market.dollar_open_interest,
      activeMarkets: acc.activeMarkets + (market.status === 'open' ? 1 : 0)
    }), { volume: 0, openInterest: 0, liquidity: 0, activeMarkets: 0 });
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-500" />
            <p className="text-slate-600 dark:text-slate-400">Loading prediction markets...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-4">
          <p className="text-red-800 dark:text-red-200">Error: {error}</p>
          <button 
            onClick={loadPredictionData}
            className="mt-2 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (selectedEvent) {
    const stats = calculateTotalStats();
    
    return (
      <div className="max-w-6xl mx-auto p-6">
        <div className="mb-6">
          <button
            onClick={() => setSelectedEvent(null)}
            className="text-blue-500 hover:text-blue-600 mb-4 flex items-center gap-2"
          >
            ← Back to Events
          </button>
          
          <div className="bg-slate-800 text-white rounded-lg p-6 mb-6">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm bg-slate-700 px-2 py-1 rounded">
                Before {new Date(selectedEvent.close_time).getFullYear()}
              </span>
            </div>
            <h1 className="text-2xl font-bold mb-4">{selectedEvent.title}</h1>
            
            {/* Market Overview Stats */}
            <div className="mb-6">
              <h2 className="text-xl font-semibold mb-4">
                Market Overview ({stats.activeMarkets} active markets)
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-slate-700 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold">{formatCurrency(stats.volume)}</div>
                  <div className="text-slate-300 text-sm">Total Volume</div>
                </div>
                <div className="bg-slate-700 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold">{formatCurrency(stats.openInterest)}</div>
                  <div className="text-slate-300 text-sm">Open Interest</div>
                </div>
                <div className="bg-slate-700 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold">{formatCurrency(stats.liquidity)}</div>
                  <div className="text-slate-300 text-sm">Total Liquidity</div>
                </div>
                <div className="bg-slate-700 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold">{stats.activeMarkets}</div>
                  <div className="text-slate-300 text-sm">Active Markets</div>
                </div>
              </div>
            </div>

            {/* Price History Chart */}
            {marketDetails.length > 0 && (
              <div className="mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-semibold">Price History</h3>
                  <span className="text-sm text-slate-300">
                    {marketDetails.length} markets • Last 30 days
                  </span>
                </div>
                
                {loadingChart ? (
                  <div className="bg-slate-700 rounded-lg p-8 flex items-center justify-center">
                    <div className="text-center">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-400" />
                      <p className="text-slate-300 text-sm">Loading chart data...</p>
                    </div>
                  </div>
                ) : (
                  <div className="bg-slate-700 rounded-lg p-4">
                    <div ref={chartContainerRef} className="w-full h-[400px]" />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Markets List */}
        <div className="space-y-4">
          {selectedEvent.markets.map((market, index) => {
            const isExpanded = expandedMarkets.has(market.ticker);
            const orderBook = orderBooks?.order_books[index];
            const probability = market.last_price;
            
            return (
              <div key={market.ticker} className="bg-slate-800 text-white rounded-lg overflow-hidden">
                <div 
                  className="p-6 cursor-pointer hover:bg-slate-700 transition-colors"
                  onClick={() => toggleMarketExpansion(market.ticker)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-xl font-bold">{market.subtitle}</h3>
                        <span className="text-blue-400 text-sm">{market.subtitle}</span>
                      </div>
                      <div className="text-sm text-slate-400 mb-2">{market.ticker}</div>
                    </div>
                    
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <div className="text-3xl font-bold">{probability}%</div>
                      </div>
                      
                      <div className="flex gap-2">
                        <div className="text-center">
                          <div className="text-xs text-slate-400 mb-1">Yes</div>
                          <button className="bg-blue-500 hover:bg-blue-600 px-3 py-2 rounded-md font-medium transition-colors">
                            {formatPrice(market.yes_bid)}
                          </button>
                        </div>
                        <div className="text-center">
                          <div className="text-xs text-slate-400 mb-1">No</div>
                          <button className="bg-purple-500 hover:bg-purple-600 px-3 py-2 rounded-md font-medium transition-colors">
                            {formatPrice(market.no_ask)}
                          </button>
                        </div>
                      </div>
                      
                      <div className="text-slate-400">
                        {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                      </div>
                    </div>
                  </div>
                </div>
                
                {isExpanded && (
                  <div className="border-t border-slate-700 p-6 bg-slate-750">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                      <div>
                        <div className="text-slate-400 text-sm">Volume</div>
                        <div className="font-semibold">{market.volume.toLocaleString()}</div>
                      </div>
                      <div>
                        <div className="text-slate-400 text-sm">Open Interest</div>
                        <div className="font-semibold">{market.open_interest.toLocaleString()}</div>
                      </div>
                      <div>
                        <div className="text-slate-400 text-sm">Dollar Volume</div>
                        <div className="font-semibold">{formatCurrency(market.dollar_volume)}</div>
                      </div>
                      <div>
                        <div className="text-slate-400 text-sm">Status</div>
                        <div className="font-semibold capitalize">{market.status}</div>
                      </div>
                    </div>
                    
                    {orderBook && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <h4 className="font-semibold mb-3 text-green-400">Yes Orders</h4>
                          <div className="space-y-2">
                            {orderBook.yes?.slice(0, 5).map((order, i) => (
                              <div key={i} className="flex justify-between text-sm">
                                <span>{formatPrice(order.price)}</span>
                                <span className="text-slate-400">{order.quantity}</span>
                              </div>
                            )) || <div className="text-slate-500 text-sm">No orders</div>}
                          </div>
                        </div>
                        
                        <div>
                          <h4 className="font-semibold mb-3 text-red-400">No Orders</h4>
                          <div className="space-y-2">
                            {orderBook.no?.slice(0, 5).map((order, i) => (
                              <div key={i} className="flex justify-between text-sm">
                                <span>{formatPrice(order.price)}</span>
                                <span className="text-slate-400">{order.quantity}</span>
                              </div>
                            )) || <div className="text-slate-500 text-sm">No orders</div>}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">Prediction Markets</h1>
        <p className="text-slate-600 dark:text-slate-400">
          Real-time prediction market data and trading opportunities
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {events.map((event) => {
          const totalVolume = event.markets.reduce((sum, market) => sum + market.dollar_volume, 0);
          const totalOpenInterest = event.markets.reduce((sum, market) => sum + market.dollar_open_interest, 0);
          const activeMarkets = event.markets.filter(market => market.status === 'open').length;
          
          return (
            <div 
              key={event.event_ticker}
              className="card hover:shadow-lg transition-all duration-200 cursor-pointer border border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-600"
              onClick={() => showEventDetails(event)}
            >
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-1 rounded">
                    {event.category}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {activeMarkets} markets
                  </span>
                </div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2 line-clamp-2">
                  {event.title}
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Closes: {new Date(event.close_time).toLocaleDateString()}
                </p>
              </div>
              
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="text-center p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <DollarSign size={16} className="text-green-500" />
                    <span className="text-xs text-slate-600 dark:text-slate-400">Volume</span>
                  </div>
                  <div className="font-semibold text-slate-900 dark:text-white">
                    {formatCurrency(totalVolume)}
                  </div>
                </div>
                <div className="text-center p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <Activity size={16} className="text-blue-500" />
                    <span className="text-xs text-slate-600 dark:text-slate-400">Interest</span>
                  </div>
                  <div className="font-semibold text-slate-900 dark:text-white">
                    {formatCurrency(totalOpenInterest)}
                  </div>
                </div>
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {event.tags.slice(0, 2).map((tag) => (
                    <span 
                      key={tag}
                      className="text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 px-2 py-1 rounded"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="text-sm text-blue-500 hover:text-blue-600 font-medium">
                  View Details →
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PredictionView;