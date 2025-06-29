import React, { useState, useEffect, useRef } from 'react';
import { TrendingUp, Calendar, Tag, Search, Filter, ExternalLink, Loader2, AlertTriangle, DollarSign, BarChart3, Users, Clock, ArrowLeft, TrendingDown, ChevronDown, ChevronUp } from 'lucide-react';
import { createChart, ISeriesApi, CandlestickSeries, ColorType, CrosshairMode } from 'lightweight-charts';
import { fetchOrderBook, OrderBookResponse, fetchMarketDetails, fetchCandlestickData, CandlestickResponse } from '../utils/api';

interface PredictionEvent {
  event_ticker: string;
  series_ticker: string;
  sub_title: string;
  title: string;
  collateral_return_type: string;
  mutually_exclusive: boolean;
  category: string;
}

interface Market {
  ticker: string;
  event_ticker: string;
  market_type: string;
  title: string;
  subtitle: string;
  yes_sub_title: string;
  no_sub_title: string;
  open_time: string;
  close_time: string;
  status: string;
  yes_bid: number;
  yes_ask: number;
  no_bid: number;
  no_ask: number;
  last_price: number;
  previous_price: number;
  volume: number;
  volume_24h: number;
  liquidity: number;
  open_interest: number;
  custom_strike?: {
    [key: string]: string;
  };
  rules_primary: string;
}

interface EventWithMarkets extends PredictionEvent {
  markets?: Market[];
  isLoadingMarkets?: boolean;
  marketsError?: string;
}

interface PredictionData {
  events: PredictionEvent[];
}

interface EventDetailResponse {
  event: PredictionEvent;
  markets: Market[];
}

interface MarketCandlestickData {
  marketId: string;
  marketTitle: string;
  candlesticks: CandlestickResponse;
}

// Candlestick Chart Component
interface CandlestickChartProps {
  candlestickData: MarketCandlestickData[];
  isDarkMode: boolean;
}

const CandlestickChart: React.FC<CandlestickChartProps> = ({ candlestickData, isDarkMode }) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<ReturnType<typeof createChart> | null>(null);
  const seriesRefs = useRef<Record<string, ISeriesApi<'Candlestick'>>>({});

  useEffect(() => {
    if (!chartRef.current || candlestickData.length === 0) return;

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

    // Chart colors for different markets
    const colors = [
      { upColor: '#10B981', downColor: '#EF4444', borderUpColor: '#10B981', borderDownColor: '#EF4444', wickUpColor: '#10B981', wickDownColor: '#EF4444' },
      { upColor: '#3B82F6', downColor: '#F97316', borderUpColor: '#3B82F6', borderDownColor: '#F97316', wickUpColor: '#3B82F6', wickDownColor: '#F97316' },
      { upColor: '#8B5CF6', downColor: '#EC4899', borderUpColor: '#8B5CF6', borderDownColor: '#EC4899', wickUpColor: '#8B5CF6', wickDownColor: '#EC4899' },
      { upColor: '#06B6D4', downColor: '#F59E0B', borderUpColor: '#06B6D4', borderDownColor: '#F59E0B', wickUpColor: '#06B6D4', wickDownColor: '#F59E0B' },
      { upColor: '#84CC16', downColor: '#DC2626', borderUpColor: '#84CC16', borderDownColor: '#DC2626', wickUpColor: '#84CC16', wickDownColor: '#DC2626' },
    ];

    // Add series for each market
    candlestickData.forEach((marketData, index) => {
      const colorSet = colors[index % colors.length];
      console.log(marketData);
      const series = chart.addSeries(CandlestickSeries, {
        ...colorSet,
        borderVisible: true,
        wickVisible: true,
        priceLineVisible: false,
        title: marketData.marketTitle,
        priceScaleId: 'right',
        priceFormat: { 
          type: 'price',
          precision: 0,
          minMove: 1
        }
      });

      // Transform candlestick data for the chart
      const chartData = marketData.candlesticks.candlesticks
        .filter(candle => 
          candle.price.open !== null && 
          candle.price.high !== null && 
          candle.price.low !== null && 
          candle.price.close !== null
        )
        .map(candle => ({
          time: candle.end_period_ts,
          open: candle.price.open!,
          high: candle.price.high!,
          low: candle.price.low!,
          close: candle.price.close!,
        }))
        .sort((a, b) => a.time - b.time);

      if (chartData.length > 0) {
        series.setData(chartData);
        seriesRefs.current[marketData.marketId] = series;
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
      chartInstance.current = null;
      seriesRefs.current = {};
    };
  }, [candlestickData, isDarkMode]);

  if (candlestickData.length === 0) {
    return (
      <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-8 text-center">
        <BarChart3 className="h-12 w-12 text-slate-400 mx-auto mb-4" />
        <p className="text-slate-600 dark:text-slate-400">
          No candlestick data available for this event.
        </p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      <div ref={chartRef} className="w-full h-full" />
    </div>
  );
};

const PredictionView: React.FC = () => {
  const [predictionData, setPredictionData] = useState<EventWithMarkets[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  
  // New state for detailed view
  const [selectedEvent, setSelectedEvent] = useState<EventWithMarkets | null>(null);
  const [isLoadingEventDetails, setIsLoadingEventDetails] = useState(false);
  
  // State for expanded market cards
  const [expandedMarkets, setExpandedMarkets] = useState<Set<string>>(new Set());
  
  // State for order book data
  const [orderBookData, setOrderBookData] = useState<{ [ticker: string]: OrderBookResponse }>({});
  const [loadingOrderBooks, setLoadingOrderBooks] = useState<Set<string>>(new Set());

  // State for candlestick data
  const [candlestickData, setCandlestickData] = useState<MarketCandlestickData[]>([]);
  const [isLoadingCandlesticks, setIsLoadingCandlesticks] = useState(false);
  const [candlestickError, setCandlestickError] = useState<string | null>(null);

  // Dark mode detection
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('darkMode') === 'true' || 
        window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  useEffect(() => {
    const handleStorageChange = () => {
      setIsDarkMode(localStorage.getItem('darkMode') === 'true');
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Get unique categories from the data
  const categories = React.useMemo(() => {
    const uniqueCategories = [...new Set(predictionData.map(event => event.category))];
    return uniqueCategories.sort();
  }, [predictionData]);

  // Filter events based on search term and category
  const filteredEvents = React.useMemo(() => {
    return predictionData.filter(event => {
      const matchesSearch = event.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           event.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           event.sub_title.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = selectedCategory === 'all' || event.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [predictionData, searchTerm, selectedCategory]);

  // Pagination
  const totalPages = Math.ceil(filteredEvents.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentEvents = filteredEvents.slice(startIndex, endIndex);

  // Toggle market expansion
  const toggleMarketExpansion = async (marketTicker: string) => {
    setExpandedMarkets(prev => {
      const newSet = new Set(prev);
      if (newSet.has(marketTicker)) {
        newSet.delete(marketTicker);
      } else {
        newSet.add(marketTicker);
        // Load order book data when expanding
        loadOrderBookData(marketTicker);
      }
      return newSet;
    });
  };

  // Load order book data for a specific market
  const loadOrderBookData = async (marketTicker: string) => {
    if (orderBookData[marketTicker] || loadingOrderBooks.has(marketTicker)) {
      return; // Already loaded or loading
    }

    setLoadingOrderBooks(prev => new Set(prev).add(marketTicker));

    try {
      const orderBook = await fetchOrderBook(marketTicker);
      setOrderBookData(prev => ({
        ...prev,
        [marketTicker]: orderBook
      }));
    } catch (error) {
      console.error(`Failed to load order book for ${marketTicker}:`, error);
    } finally {
      setLoadingOrderBooks(prev => {
        const newSet = new Set(prev);
        newSet.delete(marketTicker);
        return newSet;
      });
    }
  };

  // Fetch market details for a specific event
  const fetchEventMarkets = async (eventTicker: string) => {
    try {
      const response = await fetch(`https://corsproxy.io/?https://api.elections.kalshi.com/trade-api/v2/events/${eventTicker}`);
      console.log(response)
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      
      const data: EventDetailResponse = await response.json();
      return data.markets || [];
    } catch (err) {
      console.error(`Error fetching markets for ${eventTicker}:`, err);
      throw err;
    }
  };

  // Load candlestick data for all markets in an event
  const loadCandlestickData = async (event: EventWithMarkets) => {
    if (!event.markets || event.markets.length === 0) return;

    setIsLoadingCandlesticks(true);
    setCandlestickError(null);
    setCandlestickData([]);

    try {
      // Step 1: Get market details to obtain market IDs
      const { marketDetails } = await fetchMarketDetails(event.series_ticker, event.event_ticker);
      console.log(marketDetails);
      if (marketDetails.length === 0) {
        throw new Error('No market details found');
      }

      // Step 2: Fetch candlestick data for each market ID with 10ms delay between calls
      const candlestickResults: MarketCandlestickData[] = [];
      const endTs = Math.floor(Date.now() / 1000);
      const periodInterval = 60; // 1-hour intervals

      for (let i = 0; i < marketDetails.length; i++) {
        const marketDetail = marketDetails[i];
        
        try {
          // Find corresponding market info for title
          const marketTitle = marketDetail.title;

          // Calculate proper start_ts based on API requirements
          // Maximum history allowed: 5000 period_intervals (60 minutes each)
          const maxHistoryStartTs = endTs - (4000 * periodInterval * 60); // 5000 intervals of 60 minutes, converted to seconds
          
          // Get market open date and convert to timestamp
          const marketOpenTs = Math.floor(new Date(marketDetail.openDate).getTime() / 1000) + 3600;

          function roundToHour(date) {
            p = 60 * 60 * 1000; // milliseconds in an hour
            return new Date(Math.ceil(date.getTime() / p ) * p);
          }
          
          // Use the later of the two timestamps to ensure we're within API limits and after market opening
          const startTs = Math.max(maxHistoryStartTs, marketOpenTs);

          const candlestickResponse = await fetchCandlestickData(
            event.series_ticker,
            marketDetail.id,
            startTs,
            endTs,
            periodInterval
          );
          console.log(candlestickResponse);

          if (candlestickResponse.candlesticks.length > 0) {
            candlestickResults.push({
              marketId: marketDetail.id,
              marketTitle,
              candlesticks: candlestickResponse
            });
          }

          // Wait 10ms between API calls as requested
          if (i < marketDetails.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 10));
          }
        } catch (error) {
          console.error(`Failed to fetch candlestick data for market ${marketDetail.id}:`, error);
          // Continue with other markets even if one fails
        }
      }

      setCandlestickData(candlestickResults);
    } catch (error) {
      console.error('Failed to load candlestick data:', error);
      setCandlestickError('Failed to load chart data. Please try again.');
    } finally {
      setIsLoadingCandlesticks(false);
    }
  };

  // Show detailed event view
  const showEventDetails = async (event: EventWithMarkets) => {
    setIsLoadingEventDetails(true);
    setSelectedEvent(event);
    setExpandedMarkets(new Set()); // Reset expanded markets when viewing new event
    setCandlestickData([]); // Reset candlestick data
    
    try {
      let markets = event.markets;
      if (!markets) {
        markets = await fetchEventMarkets(event.event_ticker);
        console.log(markets);
        setSelectedEvent(prev => prev ? { ...prev, markets } : null);
      }

      // Load candlestick data after markets are loaded
      const eventWithMarkets = { ...event, markets };
      await loadCandlestickData(eventWithMarkets);
    } catch (err) {
      setSelectedEvent(prev => prev ? { ...prev, marketsError: 'Failed to load market data' } : null);
    } finally {
      setIsLoadingEventDetails(false);
    }
  };

  // Go back to list view
  const goBackToList = () => {
    setSelectedEvent(null);
    setIsLoadingEventDetails(false);
    setExpandedMarkets(new Set());
    setOrderBookData({}); // Clear order book data when going back
    setCandlestickData([]); // Clear candlestick data when going back
    setCandlestickError(null);
  };

  useEffect(() => {
    const fetchPredictionData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const response = await fetch('https://corsproxy.io/?https://api.elections.kalshi.com/trade-api/v2/events?limit=200');

        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        
        const data: PredictionData = await response.json();
        console.log(data);
        setPredictionData(data.events || []);
      } catch (err) {
        console.error('Error fetching prediction data:', err);
        setError('Failed to fetch prediction market data. Please try again later.');
      } finally {
        setLoading(false);
      }
    };

    fetchPredictionData();
  }, []);

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedCategory]);

  const getCategoryColor = (category: string): string => {
    const colors = {
      'Climate and Weather': 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
      'Politics': 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
      'Economics': 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
      'Technology': 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300',
      'Sports': 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300',
      'Entertainment': 'bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300',
      'Science': 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300',
    };
    return colors[category as keyof typeof colors] || 'bg-gray-100 dark:bg-gray-900/30 text-gray-700 dark:text-gray-300';
  };

  const formatPrice = (price: number): string => {
    return `${price}¢`;
  };

  const formatVolume = (volume: number): string => {
    if (volume >= 1000000) {
      return `${(volume / 1000000).toFixed(1)}M`;
    } else if (volume >= 1000) {
      return `${(volume / 1000).toFixed(1)}K`;
    }
    return volume.toString();
  };

  const getPriceChangeColor = (current: number, previous: number): string => {
    if (current > previous) return 'text-green-600 dark:text-green-400';
    if (current < previous) return 'text-red-600 dark:text-red-400';
    return 'text-slate-600 dark:text-slate-400';
  };

  // If an event is selected, show the detailed view
  if (selectedEvent) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        {/* Header with back button */}
        <div className="mb-8">
          <button
            onClick={goBackToList}
            className="flex items-center gap-2 text-primary hover:text-primary-dark font-medium mb-4 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Prediction Markets
          </button>
          
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-3">
                <span className={`px-3 py-1 rounded-md text-sm font-medium ${getCategoryColor(selectedEvent.category)}`}>
                  {selectedEvent.category}
                </span>
                {selectedEvent.mutually_exclusive && (
                  <span className="px-3 py-1 rounded-md text-sm font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
                    Mutually Exclusive
                  </span>
                )}
                <span className="px-3 py-1 rounded-md text-sm font-medium bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-mono">
                  {selectedEvent.event_ticker}
                </span>
              </div>
              
              <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-3 leading-tight">
                {selectedEvent.title}
              </h1>
              
              {selectedEvent.sub_title && (
                <div className="flex items-center gap-2 text-lg text-slate-600 dark:text-slate-400 mb-4">
                  <Calendar className="h-5 w-5" />
                  <span>{selectedEvent.sub_title}</span>
                </div>
              )}
            </div>
            
            <a
              href={`https://kalshi.com/events/${selectedEvent.event_ticker}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark font-medium transition-colors"
            >
              <span>Trade on Kalshi</span>
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        </div>

        {/* Candlestick Chart Section */}
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Price History</h2>
            {candlestickData.length > 0 && (
              <div className="text-sm text-slate-600 dark:text-slate-400">
                {candlestickData.length} market{candlestickData.length !== 1 ? 's' : ''} • Last 30 days
              </div>
            )}
          </div>
          
          {isLoadingCandlesticks ? (
            <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-8 text-center">
              <Loader2 className="w-8 h-8 text-primary mx-auto animate-spin mb-4" />
              <p className="text-slate-600 dark:text-slate-400">Loading price history...</p>
            </div>
          ) : candlestickError ? (
            <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-8 text-center">
              <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-4" />
              <p className="text-slate-600 dark:text-slate-400">{candlestickError}</p>
            </div>
          ) : (
            <div className="w-full h-[400px]">
              <CandlestickChart 
                candlestickData={candlestickData} 
                isDarkMode={isDarkMode}
              />
            </div>
          )}

          {/* Chart Legend */}
          {candlestickData.length > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-600">
              <div className="flex flex-wrap gap-4">
                {candlestickData.map((data, index) => {
                  const colors = [
                    { up: '#10B981', down: '#EF4444' },
                    { up: '#3B82F6', down: '#F97316' },
                    { up: '#8B5CF6', down: '#EC4899' },
                    { up: '#06B6D4', down: '#F59E0B' },
                    { up: '#84CC16', down: '#DC2626' },
                  ];
                  const colorSet = colors[index % colors.length];
                  
                  return (
                    <div key={data.marketId} className="flex items-center gap-2">
                      <div className="flex gap-1">
                        <div 
                          className="w-3 h-3 rounded-sm"
                          style={{ backgroundColor: colorSet.up }}
                        ></div>
                        <div 
                          className="w-3 h-3 rounded-sm"
                          style={{ backgroundColor: colorSet.down }}
                        ></div>
                      </div>
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        {data.marketTitle}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Markets Section */}
        <div className="space-y-6">
          {isLoadingEventDetails ? (
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-12 text-center">
              <Loader2 className="w-8 h-8 text-primary mx-auto animate-spin mb-4" />
              <p className="text-slate-600 dark:text-slate-400">Loading market data...</p>
            </div>
          ) : selectedEvent.marketsError ? (
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-12 text-center">
              <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Failed to Load Market Data</h3>
              <p className="text-slate-600 dark:text-slate-400">{selectedEvent.marketsError}</p>
            </div>
          ) : selectedEvent.markets && selectedEvent.markets.length > 0 ? (
            <>
              {/* Market Overview */}
              <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-6">
                <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4">
                  Market Overview ({selectedEvent.markets.length} active markets)
                </h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                  {/* Total Volume */}
                  <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold text-slate-900 dark:text-white">
                      {formatVolume(selectedEvent.markets.reduce((sum, market) => sum + market.volume, 0))}
                    </div>
                    <div className="text-sm text-slate-600 dark:text-slate-400">Total Volume</div>
                  </div>
                  
                  {/* Total Open Interest */}
                  <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold text-slate-900 dark:text-white">
                      {formatVolume(selectedEvent.markets.reduce((sum, market) => sum + market.open_interest, 0))}
                    </div>
                    <div className="text-sm text-slate-600 dark:text-slate-400">Open Interest</div>
                  </div>
                  
                  {/* Total Liquidity */}
                  <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold text-slate-900 dark:text-white">
                      {formatVolume(selectedEvent.markets.reduce((sum, market) => sum + market.liquidity, 0))}
                    </div>
                    <div className="text-sm text-slate-600 dark:text-slate-400">Total Liquidity</div>
                  </div>
                  
                  {/* Active Markets */}
                  <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold text-slate-900 dark:text-white">
                      {selectedEvent.markets.filter(m => m.status === 'active').length}
                    </div>
                    <div className="text-sm text-slate-600 dark:text-slate-400">Active Markets</div>
                  </div>
                </div>
              </div>

              {/* Individual Markets */}
              <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-6">
                <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-6">Individual Markets</h2>
                
                <div className="space-y-4">
                  {selectedEvent.markets.map((market) => {
                    const isExpanded = expandedMarkets.has(market.ticker);
                    const orderBook = orderBookData[market.ticker];
                    const isLoadingOrderBook = loadingOrderBooks.has(market.ticker);
                    
                    return (
                      <div
                        key={market.ticker}
                        className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden hover:shadow-md transition-shadow"
                      >
                        {/* Collapsed Market Card */}
                        <div className="p-4">
                          <div className="flex items-center justify-between">
                            {/* Left side - Market info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-3 mb-2">
                                <h3 className="text-lg font-semibold text-slate-900 dark:text-white truncate">
                                  {market.yes_sub_title || market.title || 'Market'}
                                </h3>
                                {market.custom_strike && (
                                  <div className="flex flex-wrap gap-1">
                                    {Object.entries(market.custom_strike).map(([key, value]) => (
                                      <span key={key} className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded text-xs">
                                        {value}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <div className="text-sm text-slate-600 dark:text-slate-400 font-mono">
                                {market.ticker}
                              </div>
                            </div>

                            {/* Center - Last Price */}
                            <div className="text-center mx-6">
                              <div className="text-3xl font-bold text-slate-900 dark:text-white mb-1">
                                {market.last_price}%
                              </div>
                              {market.previous_price > 0 && (
                                <div className="flex items-center justify-center gap-1">
                                  {market.last_price > market.previous_price ? (
                                    <TrendingUp className="h-3 w-3 text-green-500" />
                                  ) : market.last_price < market.previous_price ? (
                                    <TrendingDown className="h-3 w-3 text-red-500" />
                                  ) : null}
                                  <span className={`text-sm font-medium ${getPriceChangeColor(market.last_price, market.previous_price)}`}>
                                    {Math.abs(market.last_price - market.previous_price).toFixed(0)}
                                  </span>
                                </div>
                              )}
                            </div>

                            {/* Right side - YES/NO prices */}
                            <div className="flex items-center gap-4">
                              {/* YES */}
                              <div className="text-center">
                                <div className="text-sm text-slate-600 dark:text-slate-400 mb-1">Yes</div>
                                <div className="px-3 py-2 bg-blue-500 text-white rounded-lg font-bold">
                                  {formatPrice(market.yes_ask)}
                                </div>
                              </div>

                              {/* NO */}
                              <div className="text-center">
                                <div className="text-sm text-slate-600 dark:text-slate-400 mb-1">No</div>
                                <div className="px-3 py-2 bg-purple-500 text-white rounded-lg font-bold">
                                  {formatPrice(market.no_ask)}
                                </div>
                              </div>

                              {/* Expand/Collapse button */}
                              <button
                                onClick={() => toggleMarketExpansion(market.ticker)}
                                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors"
                              >
                                {isExpanded ? (
                                  <ChevronUp className="h-5 w-5 text-slate-600 dark:text-slate-400" />
                                ) : (
                                  <ChevronDown className="h-5 w-5 text-slate-600 dark:text-slate-400" />
                                )}
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Expanded Market Details */}
                        {isExpanded && (
                          <div className="border-t border-slate-200 dark:border-slate-700 p-6 bg-slate-50 dark:bg-slate-700/20">
                            {/* Detailed Price Display */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                              {/* YES Side */}
                              <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
                                <div className="text-center">
                                  <div className="flex items-center justify-center gap-2 mb-2">
                                    <TrendingUp className="h-5 w-5 text-green-600" />
                                    <span className="text-lg font-semibold text-green-700 dark:text-green-300">YES</span>
                                  </div>
                                  <div className="text-3xl font-bold text-green-600 dark:text-green-400 mb-2">
                                    {formatPrice(market.last_price)}
                                  </div>
                                  <div className="grid grid-cols-2 gap-2 text-sm">
                                    <div>
                                      <div className="text-green-700 dark:text-green-300 font-medium">Bid</div>
                                      <div className="text-green-600 dark:text-green-400">{formatPrice(market.yes_bid)}</div>
                                    </div>
                                    <div>
                                      <div className="text-green-700 dark:text-green-300 font-medium">Ask</div>
                                      <div className="text-green-600 dark:text-green-400">{formatPrice(market.yes_ask)}</div>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* NO Side */}
                              <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4">
                                <div className="text-center">
                                  <div className="flex items-center justify-center gap-2 mb-2">
                                    <TrendingDown className="h-5 w-5 text-red-600" />
                                    <span className="text-lg font-semibold text-red-700 dark:text-red-300">NO</span>
                                  </div>
                                  <div className="text-3xl font-bold text-red-600 dark:text-red-400 mb-2">
                                    {formatPrice(100 - market.last_price)}
                                  </div>
                                  <div className="grid grid-cols-2 gap-2 text-sm">
                                    <div>
                                      <div className="text-red-700 dark:text-red-300 font-medium">Bid</div>
                                      <div className="text-red-600 dark:text-red-400">{formatPrice(market.no_bid)}</div>
                                    </div>
                                    <div>
                                      <div className="text-red-700 dark:text-red-300 font-medium">Ask</div>
                                      <div className="text-red-600 dark:text-red-400">{formatPrice(market.no_ask)}</div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Order Book Section */}
                            <div className="mb-6">
                              <h4 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Order Book</h4>
                              
                              {isLoadingOrderBook ? (
                                <div className="bg-white dark:bg-slate-800 rounded-lg p-8 text-center">
                                  <Loader2 className="w-6 h-6 text-primary mx-auto animate-spin mb-2" />
                                  <p className="text-sm text-slate-600 dark:text-slate-400">Loading order book...</p>
                                </div>
                              ) : orderBook && orderBook.order_books.length > 0 ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  {/* YES Order Book */}
                                  <div className="bg-white dark:bg-slate-800 rounded-lg p-4">
                                    <h5 className="text-sm font-semibold text-green-700 dark:text-green-300 mb-3 text-center">
                                      YES Orders
                                    </h5>
                                    <div className="space-y-1">
                                      <div className="grid grid-cols-2 gap-2 text-xs font-medium text-slate-600 dark:text-slate-400 pb-2 border-b border-slate-200 dark:border-slate-600">
                                        <div>Price</div>
                                        <div className="text-right">Quantity</div>
                                      </div>
                                      {orderBook.order_books[0].yes ? (
                                        orderBook.order_books[0].yes.slice(0, 10).reverse().map((order, idx) => (
                                          <div key={idx} className="grid grid-cols-2 gap-2 text-sm">
                                            <div className="text-green-600 dark:text-green-400 font-medium">
                                              {formatPrice(order.price)}
                                            </div>
                                            <div className="text-right text-slate-900 dark:text-white">
                                              {order.quantity.toLocaleString()}
                                            </div>
                                          </div>
                                        ))
                                      ) : (
                                        <div className="text-center text-slate-500 dark:text-slate-400 py-4">
                                          No YES orders available
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  {/* NO Order Book (converted to YES sell orders) */}
                                  <div className="bg-white dark:bg-slate-800 rounded-lg p-4">
                                    <h5 className="text-sm font-semibold text-red-700 dark:text-red-300 mb-3 text-center">
                                      NO Orders
                                    </h5>
                                    <div className="space-y-1">
                                      <div className="grid grid-cols-2 gap-2 text-xs font-medium text-slate-600 dark:text-slate-400 pb-2 border-b border-slate-200 dark:border-slate-600">
                                        <div>Price</div>
                                        <div className="text-right">Quantity</div>
                                      </div>
                                      {orderBook.order_books[0].no ? (
                                        orderBook.order_books[0].no.slice(0, 10).map((order, idx) => (
                                          <div key={idx} className="grid grid-cols-2 gap-2 text-sm">
                                            <div className="text-red-600 dark:text-red-400 font-medium">
                                              {formatPrice(100 - order.price)} {/* Convert NO price to YES sell price */}
                                            </div>
                                            <div className="text-right text-slate-900 dark:text-white">
                                              {order.quantity.toLocaleString()}
                                            </div>
                                          </div>
                                        ))
                                      ) : (
                                        <div className="text-center text-slate-500 dark:text-slate-400 py-4">
                                          No NO orders available
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <div className="bg-white dark:bg-slate-800 rounded-lg p-8 text-center">
                                  <AlertTriangle className="w-6 h-6 text-amber-500 mx-auto mb-2" />
                                  <p className="text-sm text-slate-600 dark:text-slate-400">
                                    Order book data not available
                                  </p>
                                </div>
                              )}
                            </div>

                            {/* Market Statistics */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                              <div className="text-center">
                                <div className="text-sm text-slate-600 dark:text-slate-400 mb-1">Volume</div>
                                <div className="font-semibold text-slate-900 dark:text-white">{formatVolume(market.volume)}</div>
                              </div>
                              <div className="text-center">
                                <div className="text-sm text-slate-600 dark:text-slate-400 mb-1">24h Volume</div>
                                <div className="font-semibold text-slate-900 dark:text-white">{formatVolume(market.volume_24h)}</div>
                              </div>
                              <div className="text-center">
                                <div className="text-sm text-slate-600 dark:text-slate-400 mb-1">Open Interest</div>
                                <div className="font-semibold text-slate-900 dark:text-white">{formatVolume(market.open_interest)}</div>
                              </div>
                              <div className="text-center">
                                <div className="text-sm text-slate-600 dark:text-slate-400 mb-1">Liquidity</div>
                                <div className="font-semibold text-slate-900 dark:text-white">{formatVolume(market.liquidity)}</div>
                              </div>
                            </div>

                            {/* Market Timing */}
                            <div className="border-t border-slate-200 dark:border-slate-600 pt-4 mb-4">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                                <div>
                                  <div className="text-slate-600 dark:text-slate-400 mb-1">Market Opens</div>
                                  <div className="font-medium text-slate-900 dark:text-white">
                                    {new Date(market.open_time).toLocaleString()}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-slate-600 dark:text-slate-400 mb-1">Market Closes</div>
                                  <div className="font-medium text-slate-900 dark:text-white">
                                    {new Date(market.close_time).toLocaleString()}
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Market Rules */}
                            {market.rules_primary && (
                              <div className="border-t border-slate-200 dark:border-slate-600 pt-4">
                                <div className="text-sm text-slate-600 dark:text-slate-400 mb-1">Resolution Rules</div>
                                <div className="text-sm text-slate-900 dark:text-white bg-white dark:bg-slate-800 rounded p-3 border border-slate-200 dark:border-slate-600">
                                  {market.rules_primary}
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
            </>
          ) : (
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-12 text-center">
              <AlertTriangle className="w-8 h-8 text-slate-400 mx-auto mb-4" />
              <p className="text-slate-600 dark:text-slate-400">No active markets found for this event.</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Main list view
  if (loading) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <Loader2 className="w-10 h-10 text-primary mx-auto animate-spin mb-4" />
            <p className="text-slate-600 dark:text-slate-400">Loading prediction markets...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Failed to Load Data</h3>
            <p className="text-slate-600 dark:text-slate-400">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <TrendingUp className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Prediction Markets</h1>
        </div>
        <p className="text-slate-600 dark:text-slate-400">
          Real-time prediction market data from Kalshi showing what people are betting on future events.
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-6 mb-6">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Search */}
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-slate-400" />
              <input
                type="text"
                placeholder="Search prediction markets..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-300 dark:border-slate-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent dark:bg-slate-700 dark:text-white"
              />
            </div>
          </div>

          {/* Category Filter */}
          <div className="lg:w-64">
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-slate-400" />
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-300 dark:border-slate-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent dark:bg-slate-700 dark:text-white appearance-none"
              >
                <option value="all">All Categories</option>
                {categories.map(category => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Results Summary */}
        <div className="mt-4 flex items-center justify-between text-sm text-slate-600 dark:text-slate-400">
          <span>
            Showing {currentEvents.length} of {filteredEvents.length} prediction markets
            {selectedCategory !== 'all' && ` in ${selectedCategory}`}
          </span>
          <span>
            Total: {predictionData.length} markets available
          </span>
        </div>
      </div>

      {/* Prediction Markets List */}
      {currentEvents.length > 0 ? (
        <div className="space-y-6 mb-8">
          {currentEvents.map((event) => (
            <div
              key={event.event_ticker}
              className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden"
            >
              {/* Event Header */}
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`px-2 py-1 rounded-md text-xs font-medium ${getCategoryColor(event.category)}`}>
                        {event.category}
                      </span>
                      {event.mutually_exclusive && (
                        <span className="px-2 py-1 rounded-md text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
                          Exclusive
                        </span>
                      )}
                    </div>
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2 leading-tight">
                      {event.title}
                    </h3>
                    {event.sub_title && (
                      <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                        <Calendar className="h-4 w-4" />
                        <span>{event.sub_title}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Metadata */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 text-sm">
                    <div className="flex items-center gap-2">
                      <Tag className="h-4 w-4 text-slate-400" />
                      <span className="font-mono text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded">
                        {event.event_ticker}
                      </span>
                    </div>
                    
                    <a
                      href={`https://kalshi.com/events/${event.event_ticker}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:text-primary-dark font-medium transition-colors"
                    >
                      <span>View on Kalshi</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>

                  <button
                    onClick={() => showEventDetails(event)}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-primary-dark rounded-md transition-colors"
                  >
                    <BarChart3 className="h-4 w-4" />
                    View Details
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <Search className="h-12 w-12 text-slate-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
            No prediction markets found
          </h3>
          <p className="text-slate-600 dark:text-slate-400">
            Try adjusting your search terms or category filter.
          </p>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            className="px-3 py-2 rounded-md border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Previous
          </button>
          
          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum;
              if (totalPages <= 5) {
                pageNum = i + 1;
              } else if (currentPage <= 3) {
                pageNum = i + 1;
              } else if (currentPage >= totalPages - 2) {
                pageNum = totalPages - 4 + i;
              } else {
                pageNum = currentPage - 2 + i;
              }
              
              return (
                <button
                  key={pageNum}
                  onClick={() => setCurrentPage(pageNum)}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    currentPage === pageNum
                      ? 'bg-primary text-white'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}
          </div>
          
          <button
            onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
            className="px-3 py-2 rounded-md border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Next
          </button>
        </div>
      )}

      {/* Footer Info */}
      <div className="mt-8 text-center text-sm text-slate-500 dark:text-slate-400">
        <p>
          Data provided by{' '}
          <a
            href="https://kalshi.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:text-primary-dark transition-colors"
          >
            Kalshi
          </a>
          {' '}• Updated in real-time
        </p>
      </div>
    </div>
  );
};

export default PredictionView;