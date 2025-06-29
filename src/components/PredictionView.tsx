import React, { useState, useEffect, useRef } from 'react';
import { createChart, ISeriesApi, CandlestickSeries, ColorType, CrosshairMode } from 'lightweight-charts';
import { TrendingUp, TrendingDown, Calendar, DollarSign, Users, Activity, ChevronLeft, ChevronRight, BarChart3, Loader2 } from 'lucide-react';
import { fetchOrderBook, fetchMarketDetails, fetchCandlestickData, OrderBookResponse, CandlestickResponse } from '../utils/api';

interface PredictionEvent {
  event_ticker: string;
  series_ticker: string;
  title: string;
  subtitle: string;
  close_date: string;
  cap_strike: number;
  strike_type: string;
  category: string;
  sub_category: string;
  mutually_exclusive: boolean;
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
  previous_price: number;
  volume: number;
  open_interest: number;
  liquidity: number;
  can_close_early: boolean;
  status: string;
}

interface MarketDetail {
  id: string;
  openDate: string;
  title?: string;
}

interface CandlestickData {
  time: number;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
}

const PredictionView: React.FC = () => {
  const [events, setEvents] = useState<PredictionEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<PredictionEvent | null>(null);
  const [orderBooks, setOrderBooks] = useState<{ [key: string]: any }>({});
  const [currentPage, setCurrentPage] = useState(1);
  const [eventsPerPage] = useState(10);
  const [candlestickData, setCandlestickData] = useState<{ [marketId: string]: CandlestickData[] }>({});
  const [loadingCandlesticks, setLoadingCandlesticks] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingNextPage, setLoadingNextPage] = useState(false);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);

  const totalPages = Math.ceil(events.length / eventsPerPage);
  const startIndex = (currentPage - 1) * eventsPerPage;
  const endIndex = startIndex + eventsPerPage;
  const currentEvents = events.slice(startIndex, endIndex);

  const loadEvents = async (useCursor: string | null = null) => {
    try {
      if (useCursor) {
        setLoadingNextPage(true);
      } else {
        setLoading(true);
      }
      
      let url = 'https://corsproxy.io/?https://api.elections.kalshi.com/trade-api/v2/events?limit=200';
      if (useCursor) {
        url += `&cursor=${encodeURIComponent(useCursor)}`;
      }
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (useCursor) {
        // Append new events to existing ones
        setEvents(prev => [...prev, ...data.events]);
      } else {
        // Replace events with new ones
        setEvents(data.events);
      }
      
      // Store the cursor for next page
      setCursor(data.cursor || null);
      
    } catch (err) {
      console.error('Error loading events:', err);
      setError('Failed to load prediction markets');
    } finally {
      setLoading(false);
      setLoadingNextPage(false);
    }
  };

  const loadOrderBooks = async (marketTickers: string[]) => {
    if (marketTickers.length === 0) return;
    
    try {
      const tickerString = marketTickers.join(',');
      const orderBookData = await fetchOrderBook(tickerString);
      
      const orderBookMap: { [key: string]: any } = {};
      marketTickers.forEach((ticker, index) => {
        if (orderBookData.order_books[index]) {
          orderBookMap[ticker] = orderBookData.order_books[index];
        }
      });
      
      setOrderBooks(orderBookMap);
    } catch (err) {
      console.error('Error loading order books:', err);
    }
  };

  const loadCandlestickData = async (marketDetails: MarketDetail[], seriesTicker: string) => {
    setLoadingCandlesticks(true);
    const candlestickMap: { [marketId: string]: CandlestickData[] } = {};
    
    try {
      for (const market of marketDetails) {
        try {
          // Calculate time range (4000 hours back from now, but not before market open)
          const endTs = Math.floor(Date.now() / 1000);
          const maxStartTs = endTs - (4000 * 60 * 60); // 4000 hours ago
          const marketOpenTs = Math.floor(new Date(market.openDate).getTime() / 1000);
          const startTs = Math.max(maxStartTs, marketOpenTs);
          
          const candlestickResponse = await fetchCandlestickData(
            seriesTicker,
            market.id,
            startTs,
            endTs,
            60 // 1-hour candles
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
          
          candlestickMap[market.id] = transformedData;
          
          // Wait 10ms between calls to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 10));
        } catch (err) {
          console.error(`Failed to fetch candlestick data for market ${market.id}:`, err);
        }
      }
      
      setCandlestickData(candlestickMap);
    } catch (err) {
      console.error('Error loading candlestick data:', err);
    } finally {
      setLoadingCandlesticks(false);
    }
  };

  const showEventDetails = async (event: PredictionEvent) => {
    setSelectedEvent(event);
    
    // Load order books for the event's markets
    const marketTickers = event.markets.map(market => market.ticker);
    await loadOrderBooks(marketTickers);
    
    // Fetch market details and then candlestick data
    try {
      const marketDetailsResponse = await fetchMarketDetails(event.series_ticker, event.event_ticker);
      await loadCandlestickData(marketDetailsResponse.marketDetails, event.series_ticker);
    } catch (err) {
      console.error('Error fetching market details:', err);
    }
  };

  const handlePageChange = async (newPage: number) => {
    // Check if we're going to the last page and need to load more data
    if (newPage === totalPages && cursor && !loadingNextPage) {
      await loadEvents(cursor);
    }
    setCurrentPage(newPage);
  };

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current || Object.keys(candlestickData).length === 0) return;

    const isDarkMode = document.documentElement.classList.contains('dark');
    
    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 400,
      layout: {
        background: { type: ColorType.Solid, color: isDarkMode ? '#1f2937' : '#ffffff' },
        textColor: isDarkMode ? '#e5e7eb' : '#374151',
      },
      grid: {
        vertLines: { color: isDarkMode ? '#374151' : '#e5e7eb' },
        horzLines: { color: isDarkMode ? '#374151' : '#e5e7eb' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
      },
      rightPriceScale: {
        borderColor: isDarkMode ? '#4b5563' : '#d1d5db',
        scaleMargins: {
          top: 0.1,
          bottom: 0.1,
        },
      },
      timeScale: {
        borderColor: isDarkMode ? '#4b5563' : '#d1d5db',
        timeVisible: true,
        secondsVisible: false,
      },
    });

    chartRef.current = chart;

    // Add series for each market
    const colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
    let colorIndex = 0;

    Object.entries(candlestickData).forEach(([marketId, data]) => {
      if (data.length > 0) {
        const series = chart.addSeries(CandlestickSeries, {
          upColor: colors[colorIndex % colors.length],
          downColor: colors[(colorIndex + 1) % colors.length],
          borderVisible: false,
          wickUpColor: colors[colorIndex % colors.length],
          wickDownColor: colors[(colorIndex + 1) % colors.length],
          priceFormat: {
            type: 'price',
            precision: 2,
            minMove: 0.01,
          },
        });

        series.setData(data);
        colorIndex += 2;
      }
    });

    chart.timeScale().fitContent();

    const handleResize = () => {
      chart.resize(chartContainerRef.current!.clientWidth, 400);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      chart.remove();
      window.removeEventListener('resize', handleResize);
    };
  }, [candlestickData]);

  useEffect(() => {
    loadEvents();
  }, []);

  const calculateTotalStats = () => {
    const totalVolume = events.reduce((sum, event) => 
      sum + event.markets.reduce((marketSum, market) => marketSum + market.volume, 0), 0
    );
    
    const totalOpenInterest = events.reduce((sum, event) => 
      sum + event.markets.reduce((marketSum, market) => marketSum + market.open_interest, 0), 0
    );
    
    const totalLiquidity = events.reduce((sum, event) => 
      sum + event.markets.reduce((marketSum, market) => marketSum + market.liquidity, 0), 0
    );
    
    const activeMarkets = events.reduce((sum, event) => 
      sum + event.markets.filter(market => market.status === 'open').length, 0
    );

    return { totalVolume, totalOpenInterest, totalLiquidity, activeMarkets };
  };

  const formatNumber = (num: number): string => {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
  };

  const formatPrice = (price: number): string => {
    return `${(price * 100).toFixed(0)}¢`;
  };

  if (loading && events.length === 0) {
    return (
      <div className="max-w-7xl mx-auto p-6">
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
      <div className="max-w-7xl mx-auto p-6">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-4">
          <p className="text-red-800 dark:text-red-200">{error}</p>
        </div>
      </div>
    );
  }

  if (selectedEvent) {
    const stats = calculateTotalStats();
    
    return (
      <div className="max-w-7xl mx-auto p-6">
        <div className="mb-6">
          <button
            onClick={() => setSelectedEvent(null)}
            className="flex items-center gap-2 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 mb-4"
          >
            <ChevronLeft size={20} />
            Back to Markets
          </button>
          
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-6 mb-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                  {selectedEvent.title}
                </h1>
                <p className="text-slate-600 dark:text-slate-400 mb-4">
                  {selectedEvent.subtitle}
                </p>
                <div className="flex items-center gap-4 text-sm text-slate-500 dark:text-slate-400">
                  <div className="flex items-center gap-1">
                    <Calendar size={16} />
                    <span>Closes: {new Date(selectedEvent.close_date).toLocaleDateString()}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Activity size={16} />
                    <span>Category: {selectedEvent.category}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Market Overview */}
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
                Market Overview ({selectedEvent.markets.length} active markets)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4">
                  <div className="text-2xl font-bold text-slate-900 dark:text-white">
                    {formatNumber(stats.totalVolume)}
                  </div>
                  <div className="text-sm text-slate-600 dark:text-slate-400">Total Volume</div>
                </div>
                <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4">
                  <div className="text-2xl font-bold text-slate-900 dark:text-white">
                    {formatNumber(stats.totalOpenInterest)}
                  </div>
                  <div className="text-sm text-slate-600 dark:text-slate-400">Open Interest</div>
                </div>
                <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4">
                  <div className="text-2xl font-bold text-slate-900 dark:text-white">
                    {formatNumber(stats.totalLiquidity)}
                  </div>
                  <div className="text-sm text-slate-600 dark:text-slate-400">Total Liquidity</div>
                </div>
                <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4">
                  <div className="text-2xl font-bold text-slate-900 dark:text-white">
                    {stats.activeMarkets}
                  </div>
                  <div className="text-sm text-slate-600 dark:text-slate-400">Active Markets</div>
                </div>
              </div>
            </div>

            {/* Candlestick Chart */}
            {Object.keys(candlestickData).length > 0 && (
              <div className="mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                    <BarChart3 size={20} />
                    Price History
                  </h3>
                  {loadingCandlesticks && (
                    <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                      <Loader2 size={16} className="animate-spin" />
                      Loading chart data...
                    </div>
                  )}
                </div>
                <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4">
                  <div ref={chartContainerRef} className="w-full h-[400px]" />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Markets List */}
        <div className="space-y-4">
          {selectedEvent.markets.map((market) => {
            const orderBook = orderBooks[market.ticker];
            const priceChange = market.last_price - market.previous_price;
            const priceChangePercent = market.previous_price > 0 ? (priceChange / market.previous_price) * 100 : 0;
            
            return (
              <div key={market.ticker} className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                      {market.subtitle}
                    </h3>
                    <div className="flex items-center gap-4 text-sm text-slate-600 dark:text-slate-400">
                      <span>Ticker: {market.ticker}</span>
                      <span>Status: {market.status}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-slate-900 dark:text-white">
                      {formatPrice(market.last_price)}
                    </div>
                    <div className={`text-sm font-medium ${
                      priceChange >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {priceChange >= 0 ? '+' : ''}{formatPrice(Math.abs(priceChange))} ({priceChangePercent.toFixed(1)}%)
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3">
                    <div className="text-sm text-green-700 dark:text-green-300 mb-1">Yes Bid</div>
                    <div className="text-lg font-semibold text-green-800 dark:text-green-200">
                      {formatPrice(market.yes_bid)}
                    </div>
                  </div>
                  <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3">
                    <div className="text-sm text-green-700 dark:text-green-300 mb-1">Yes Ask</div>
                    <div className="text-lg font-semibold text-green-800 dark:text-green-200">
                      {formatPrice(market.yes_ask)}
                    </div>
                  </div>
                  <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3">
                    <div className="text-sm text-red-700 dark:text-red-300 mb-1">No Bid</div>
                    <div className="text-lg font-semibold text-red-800 dark:text-red-200">
                      {formatPrice(market.no_bid)}
                    </div>
                  </div>
                  <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3">
                    <div className="text-sm text-red-700 dark:text-red-300 mb-1">No Ask</div>
                    <div className="text-lg font-semibold text-red-800 dark:text-red-200">
                      {formatPrice(market.no_ask)}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-slate-600 dark:text-slate-400">Volume:</span>
                    <span className="ml-2 font-medium">{formatNumber(market.volume)}</span>
                  </div>
                  <div>
                    <span className="text-slate-600 dark:text-slate-400">Open Interest:</span>
                    <span className="ml-2 font-medium">{formatNumber(market.open_interest)}</span>
                  </div>
                  <div>
                    <span className="text-slate-600 dark:text-slate-400">Liquidity:</span>
                    <span className="ml-2 font-medium">{formatNumber(market.liquidity)}</span>
                  </div>
                </div>

                {orderBook && (
                  <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                    <h4 className="text-sm font-medium text-slate-900 dark:text-white mb-2">Order Book</h4>
                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div>
                        <div className="text-green-700 dark:text-green-300 font-medium mb-1">Yes Orders</div>
                        {orderBook.yes && orderBook.yes.length > 0 ? (
                          <div className="space-y-1">
                            {orderBook.yes.slice(0, 3).map((order: any, idx: number) => (
                              <div key={idx} className="flex justify-between">
                                <span>{formatPrice(order.price)}</span>
                                <span>{order.quantity}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-slate-500">No orders</div>
                        )}
                      </div>
                      <div>
                        <div className="text-red-700 dark:text-red-300 font-medium mb-1">No Orders</div>
                        {orderBook.no && orderBook.no.length > 0 ? (
                          <div className="space-y-1">
                            {orderBook.no.slice(0, 3).map((order: any, idx: number) => (
                              <div key={idx} className="flex justify-between">
                                <span>{formatPrice(order.price)}</span>
                                <span>{order.quantity}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-slate-500">No orders</div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const stats = calculateTotalStats();

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
          Prediction Markets
        </h1>
        <p className="text-slate-600 dark:text-slate-400">
          Real-time prediction market data and trading opportunities
        </p>
      </div>

      {/* Market Overview */}
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-6 mb-8">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4">
          Market Overview ({events.length} total events)
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="text-center">
            <div className="text-3xl font-bold text-slate-900 dark:text-white mb-1">
              {formatNumber(stats.totalVolume)}
            </div>
            <div className="text-sm text-slate-600 dark:text-slate-400">Total Volume</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-slate-900 dark:text-white mb-1">
              {formatNumber(stats.totalOpenInterest)}
            </div>
            <div className="text-sm text-slate-600 dark:text-slate-400">Open Interest</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-slate-900 dark:text-white mb-1">
              {formatNumber(stats.totalLiquidity)}
            </div>
            <div className="text-sm text-slate-600 dark:text-slate-400">Total Liquidity</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-slate-900 dark:text-white mb-1">
              {stats.activeMarkets}
            </div>
            <div className="text-sm text-slate-600 dark:text-slate-400">Active Markets</div>
          </div>
        </div>
      </div>

      {/* Events List */}
      <div className="space-y-4 mb-8">
        {currentEvents.map((event) => {
          const totalVolume = event.markets.reduce((sum, market) => sum + market.volume, 0);
          const avgPrice = event.markets.reduce((sum, market) => sum + market.last_price, 0) / event.markets.length;
          
          return (
            <div 
              key={event.event_ticker}
              className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-6 hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => showEventDetails(event)}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                    {event.title}
                  </h3>
                  <p className="text-slate-600 dark:text-slate-400 mb-3">
                    {event.subtitle}
                  </p>
                  <div className="flex items-center gap-4 text-sm text-slate-500 dark:text-slate-400">
                    <div className="flex items-center gap-1">
                      <Calendar size={16} />
                      <span>Closes: {new Date(event.close_date).toLocaleDateString()}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Activity size={16} />
                      <span>{event.category}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Users size={16} />
                      <span>{event.markets.length} markets</span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-slate-900 dark:text-white mb-1">
                    {formatPrice(avgPrice)}
                  </div>
                  <div className="text-sm text-slate-600 dark:text-slate-400">
                    Avg Price
                  </div>
                  <div className="text-sm text-slate-600 dark:text-slate-400 mt-2">
                    Volume: {formatNumber(totalVolume)}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {event.markets.slice(0, 4).map((market) => (
                  <div key={market.ticker} className="bg-slate-50 dark:bg-slate-700 rounded-lg p-3">
                    <div className="text-sm font-medium text-slate-900 dark:text-white mb-1 truncate">
                      {market.subtitle}
                    </div>
                    <div className="text-lg font-bold text-slate-900 dark:text-white">
                      {formatPrice(market.last_price)}
                    </div>
                    <div className="text-xs text-slate-600 dark:text-slate-400">
                      Vol: {formatNumber(market.volume)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-600 dark:text-slate-400">
          Showing {startIndex + 1}-{Math.min(endIndex, events.length)} of {events.length} events
          {cursor && (
            <span className="ml-2 text-blue-600 dark:text-blue-400">
              (More available)
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-md hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronLeft size={16} />
            Previous
          </button>
          
          <span className="px-3 py-2 text-sm font-medium text-slate-900 dark:text-white">
            Page {currentPage} of {totalPages}
          </span>
          
          <button
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage === totalPages && !cursor}
            className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-md hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
            <ChevronRight size={16} />
            {loadingNextPage && <Loader2 size={16} className="animate-spin ml-1" />}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PredictionView;