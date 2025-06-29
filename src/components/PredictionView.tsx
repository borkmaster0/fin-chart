import React, { useState, useEffect } from 'react';
import { TrendingUp, Calendar, Tag, Search, Filter, ExternalLink, Loader2, AlertTriangle, DollarSign, BarChart3, Users, Clock } from 'lucide-react';

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

const PredictionView: React.FC = () => {
  const [predictionData, setPredictionData] = useState<EventWithMarkets[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10); // Reduced for better performance with market data
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());

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

  // Fetch market details for a specific event
  const fetchEventMarkets = async (eventTicker: string) => {
    try {
      const response = await fetch(`https://corsproxy.io/?https://api.elections.kalshi.com/trade-api/v2/events/${eventTicker}`);
      
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

  // Toggle event expansion and load markets if needed
  const toggleEventExpansion = async (eventTicker: string) => {
    const newExpanded = new Set(expandedEvents);
    
    if (expandedEvents.has(eventTicker)) {
      newExpanded.delete(eventTicker);
    } else {
      newExpanded.add(eventTicker);
      
      // Load markets if not already loaded
      const event = predictionData.find(e => e.event_ticker === eventTicker);
      if (event && !event.markets && !event.isLoadingMarkets) {
        // Set loading state
        setPredictionData(prev => prev.map(e => 
          e.event_ticker === eventTicker 
            ? { ...e, isLoadingMarkets: true }
            : e
        ));
        
        try {
          const markets = await fetchEventMarkets(eventTicker);
          setPredictionData(prev => prev.map(e => 
            e.event_ticker === eventTicker 
              ? { ...e, markets, isLoadingMarkets: false }
              : e
          ));
        } catch (err) {
          setPredictionData(prev => prev.map(e => 
            e.event_ticker === eventTicker 
              ? { ...e, isLoadingMarkets: false, marketsError: 'Failed to load market data' }
              : e
          ));
        }
      }
    }
    
    setExpandedEvents(newExpanded);
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
                    onClick={() => toggleEventExpansion(event.event_ticker)}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-primary hover:text-primary-dark bg-primary/10 hover:bg-primary/20 rounded-md transition-colors"
                  >
                    <BarChart3 className="h-4 w-4" />
                    {expandedEvents.has(event.event_ticker) ? 'Hide Markets' : 'Show Markets'}
                  </button>
                </div>
              </div>

              {/* Markets Section */}
              {expandedEvents.has(event.event_ticker) && (
                <div className="border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/50">
                  {event.isLoadingMarkets ? (
                    <div className="p-6 text-center">
                      <Loader2 className="w-6 h-6 text-primary mx-auto animate-spin mb-2" />
                      <p className="text-sm text-slate-600 dark:text-slate-400">Loading market data...</p>
                    </div>
                  ) : event.marketsError ? (
                    <div className="p-6 text-center">
                      <AlertTriangle className="w-6 h-6 text-amber-500 mx-auto mb-2" />
                      <p className="text-sm text-slate-600 dark:text-slate-400">{event.marketsError}</p>
                    </div>
                  ) : event.markets && event.markets.length > 0 ? (
                    <div className="p-6">
                      <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">
                        Active Markets ({event.markets.length})
                      </h4>
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {event.markets.map((market) => (
                          <div
                            key={market.ticker}
                            className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4"
                          >
                            {/* Market Header */}
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex-1">
                                <h5 className="font-medium text-slate-900 dark:text-white mb-1">
                                  {market.yes_sub_title || market.title || 'Market'}
                                </h5>
                                {market.custom_strike && (
                                  <div className="text-xs text-slate-600 dark:text-slate-400">
                                    {Object.entries(market.custom_strike).map(([key, value]) => (
                                      <span key={key}>{key}: {value}</span>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <span className={`px-2 py-1 rounded text-xs font-medium ${
                                market.status === 'active' 
                                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                                  : 'bg-gray-100 dark:bg-gray-900/30 text-gray-700 dark:text-gray-300'
                              }`}>
                                {market.status}
                              </span>
                            </div>

                            {/* Price Information */}
                            <div className="grid grid-cols-2 gap-4 mb-3">
                              <div className="text-center">
                                <div className="text-xs text-slate-600 dark:text-slate-400 mb-1">YES</div>
                                <div className="text-lg font-bold text-green-600 dark:text-green-400">
                                  {formatPrice(market.last_price)}
                                </div>
                                <div className="text-xs text-slate-500 dark:text-slate-400">
                                  Bid: {formatPrice(market.yes_bid)} | Ask: {formatPrice(market.yes_ask)}
                                </div>
                              </div>
                              <div className="text-center">
                                <div className="text-xs text-slate-600 dark:text-slate-400 mb-1">NO</div>
                                <div className="text-lg font-bold text-red-600 dark:text-red-400">
                                  {formatPrice(100 - market.last_price)}
                                </div>
                                <div className="text-xs text-slate-500 dark:text-slate-400">
                                  Bid: {formatPrice(market.no_bid)} | Ask: {formatPrice(market.no_ask)}
                                </div>
                              </div>
                            </div>

                            {/* Market Stats */}
                            <div className="grid grid-cols-3 gap-3 text-xs">
                              <div className="text-center">
                                <div className="flex items-center justify-center gap-1 text-slate-600 dark:text-slate-400 mb-1">
                                  <BarChart3 className="h-3 w-3" />
                                  <span>Volume</span>
                                </div>
                                <div className="font-medium text-slate-900 dark:text-white">
                                  {formatVolume(market.volume)}
                                </div>
                              </div>
                              <div className="text-center">
                                <div className="flex items-center justify-center gap-1 text-slate-600 dark:text-slate-400 mb-1">
                                  <Users className="h-3 w-3" />
                                  <span>Open Interest</span>
                                </div>
                                <div className="font-medium text-slate-900 dark:text-white">
                                  {formatVolume(market.open_interest)}
                                </div>
                              </div>
                              <div className="text-center">
                                <div className="flex items-center justify-center gap-1 text-slate-600 dark:text-slate-400 mb-1">
                                  <DollarSign className="h-3 w-3" />
                                  <span>Liquidity</span>
                                </div>
                                <div className="font-medium text-slate-900 dark:text-white">
                                  {formatVolume(market.liquidity)}
                                </div>
                              </div>
                            </div>

                            {/* Market Dates */}
                            <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-400">
                              <div className="flex items-center gap-1 mb-1">
                                <Clock className="h-3 w-3" />
                                <span>Closes: {new Date(market.close_time).toLocaleDateString()}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="p-6 text-center">
                      <p className="text-sm text-slate-600 dark:text-slate-400">No active markets found for this event.</p>
                    </div>
                  )}
                </div>
              )}
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