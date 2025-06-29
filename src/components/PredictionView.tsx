import React, { useState, useEffect } from 'react';
import { TrendingUp, Calendar, Tag, Search, Filter, ExternalLink, Loader2, AlertTriangle } from 'lucide-react';

interface PredictionEvent {
  event_ticker: string;
  series_ticker: string;
  sub_title: string;
  title: string;
  collateral_return_type: string;
  mutually_exclusive: boolean;
  category: string;
}

interface PredictionData {
  events: PredictionEvent[];
}

const PredictionView: React.FC = () => {
  const [predictionData, setPredictionData] = useState<PredictionEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(20);

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

  useEffect(() => {
    const fetchPredictionData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const response = await fetch('https://api.elections.kalshi.com/trade-api/v2/events?limit=200');
        
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

      {/* Prediction Markets Grid */}
      {currentEvents.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {currentEvents.map((event) => (
            <div
              key={event.event_ticker}
              className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-6 hover:shadow-md transition-shadow"
            >
              {/* Header */}
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
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <Tag className="h-4 w-4 text-slate-400" />
                  <span className="text-slate-600 dark:text-slate-400">Event Ticker:</span>
                  <span className="font-mono text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded">
                    {event.event_ticker}
                  </span>
                </div>
                
                <div className="flex items-center gap-2 text-sm">
                  <TrendingUp className="h-4 w-4 text-slate-400" />
                  <span className="text-slate-600 dark:text-slate-400">Series:</span>
                  <span className="font-mono text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded">
                    {event.series_ticker}
                  </span>
                </div>

                {event.collateral_return_type && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-slate-600 dark:text-slate-400">Return Type:</span>
                    <span className="text-slate-900 dark:text-white">
                      {event.collateral_return_type}
                    </span>
                  </div>
                )}
              </div>

              {/* Action */}
              <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                <a
                  href={`https://kalshi.com/events/${event.event_ticker}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-primary hover:text-primary-dark font-medium text-sm transition-colors"
                >
                  <span>View on Kalshi</span>
                  <ExternalLink className="h-4 w-4" />
                </a>
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