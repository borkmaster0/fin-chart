import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Sun, Moon, LineChart, Menu, X, RefreshCw, Plus, BarChart3, Briefcase, TrendingUp, LineChart } from 'lucide-react';
import SymbolSearch from './components/SymbolSearch';
import ChartContainer from './components/ChartContainer';
import TimeframeSelector from './components/TimeframeSelector';
import StockSummary from './components/StockSummary';
import PortfolioDialog from './components/PortfolioDialog';
import PortfolioDisplay from './components/PortfolioDisplay';
import SymbolTransactions from './components/SymbolTransactions';
import BacktestingView from './components/BacktestingView';
import { fetchChartData } from './utils/api';
import { ChartData } from './types';
import { loadSettings, saveCurrentSymbol, loadCurrentSymbol } from './utils/db';

function App() {
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('darkMode') === 'true' || 
        window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });
  
  const [symbol, setSymbol] = useState('');
  const [timeframe, setTimeframe] = useState('1d');
  const [chartData, setChartData] = useState<ChartData | null>(null);
  const previousDataRef = useRef<ChartData | null>(null);
  const previousSymbolRef = useRef(symbol);
  const previousTimeframeRef = useRef(timeframe);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showPortfolioDialog, setShowPortfolioDialog] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [currentView, setCurrentView] = useState<'chart' | 'portfolio' | 'backtesting' | 'compare'>('chart');

  // Load saved symbol on app initialization
  useEffect(() => {
    const loadSavedSymbol = async () => {
      try {
        const savedSymbol = await loadCurrentSymbol();
        if (savedSymbol) {
          setSymbol(savedSymbol);
          previousSymbolRef.current = savedSymbol;
        }
      } catch (error) {
        console.error('Failed to load saved symbol:', error);
      } finally {
        setIsInitialized(true);
      }
    };
    
    loadSavedSymbol();
  }, []);

  // Save symbol whenever it changes (but only after initialization)
  useEffect(() => {
    if (!isInitialized) return;
    
    const saveSymbol = async () => {
      try {
        await saveCurrentSymbol(symbol);
      } catch (error) {
        console.error('Failed to save current symbol:', error);
      }
    };
    
    saveSymbol();
  }, [symbol, isInitialized]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    localStorage.setItem('darkMode', darkMode.toString());
  }, [darkMode]);

  const compareData = (oldData: ChartData, newData: ChartData) => {
    // Only compare if symbol and timeframe haven't changed
    if (previousSymbolRef.current !== symbol || previousTimeframeRef.current !== timeframe) {
      return;
    }

    const changes: any = {};

    // Compare latest price
    if (oldData.meta.regularMarketPrice !== newData.meta.regularMarketPrice) {
      changes.price = {
        old: oldData.meta.regularMarketPrice,
        new: newData.meta.regularMarketPrice,
        change: newData.meta.regularMarketPrice - oldData.meta.regularMarketPrice
      };
    }

    // Compare latest volume
    const oldLatestVolume = oldData.volume[oldData.volume.length - 1];
    const newLatestVolume = newData.volume[newData.volume.length - 1];
    if (oldLatestVolume !== newLatestVolume) {
      changes.volume = {
        old: oldLatestVolume,
        new: newLatestVolume,
        change: newLatestVolume - oldLatestVolume
      };
    }

    // Compare new data points
    const oldLastTimestamp = oldData.timestamp[oldData.timestamp.length - 1];
    const newDataPoints = newData.timestamp
      .map((timestamp, i) => ({
        timestamp,
        close: newData.close[i],
        volume: newData.volume[i]
      }))
      .filter(point => point.timestamp > oldLastTimestamp);

    if (newDataPoints.length > 0) {
      changes.newDataPoints = newDataPoints;
    }

    // Log changes if any were found
    if (Object.keys(changes).length > 0) {
      console.log('Data changes detected:', changes);
    }
  };

  const loadChartData = useCallback(async () => {
    if (!symbol || !isInitialized) return;
    
    setIsRefreshing(true);
    setError(null);
    
    try {
      const data = await fetchChartData(symbol, timeframe);
      
      // Compare with previous data if it exists
      if (previousDataRef.current) {
        compareData(previousDataRef.current, data);
      }
      
      // Update refs and state
      previousDataRef.current = data;
      previousSymbolRef.current = symbol;
      previousTimeframeRef.current = timeframe;
      setChartData(data);
      setLastRefreshed(new Date());
    } catch (err) {
      console.error('Failed to fetch chart data:', err);
      setError('Failed to load chart data. Please try again.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [symbol, timeframe, isInitialized]);

  useEffect(() => {
    loadChartData();
  }, [loadChartData]);

  useEffect(() => {
    if (!autoRefresh) return;

    const intervalId = setInterval(() => {
      loadChartData();
    }, 60000);

    return () => clearInterval(intervalId);
  }, [autoRefresh, loadChartData]);

  const toggleDarkMode = () => {
    setDarkMode(prev => !prev);
  };

  const handleRefresh = () => {
    loadChartData();
  };

  const navigationItems = [
    { id: 'chart', label: 'Chart', icon: BarChart3 },
    { id: 'portfolio', label: 'Portfolio', icon: Briefcase },
    { id: 'backtesting', label: 'Backtesting', icon: TrendingUp },
    { id: 'compare', label: 'Compare', icon: LineChart }
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 transition-colors">
      {/* Header */}
      <header className="bg-white dark:bg-slate-800 shadow-sm">
        <div className="container mx-auto px-4 py-3 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <LineChart className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">FinChart</h1>
          </div>
          
          {/* Navigation Menu - Desktop */}
          <div className="hidden md:flex items-center space-x-6">
            <nav className="flex items-center space-x-1 bg-slate-100 dark:bg-slate-700 rounded-lg p-1">
              {navigationItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => setCurrentView(item.id as any)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all ${
                      currentView === item.id
                        ? 'bg-white dark:bg-slate-600 text-primary dark:text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <Icon size={16} />
                    {item.label}
                  </button>
                );
              })}
            </nav>
            
            <SymbolSearch 
              symbol={symbol} 
              onSymbolChange={setSymbol} 
            />
            <button
              onClick={toggleDarkMode}
              className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}
            >
              {darkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>
          </div>
          
          <button 
            className="md:hidden p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700"
            onClick={() => setMobileMenuOpen(true)}
          >
            <Menu size={24} />
          </button>
        </div>
      </header>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-50 md:hidden">
          <div className="fixed right-0 top-0 h-full w-64 bg-white dark:bg-slate-800 shadow-lg p-4 transform transition-transform duration-300 ease-in-out">
            <div className="flex justify-between items-center mb-6">
              <h2 className="font-semibold text-lg">Menu</h2>
              <button 
                onClick={() => setMobileMenuOpen(false)}
                className="p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                <X size={24} />
              </button>
            </div>
            <div className="space-y-4">
              {/* Navigation - Mobile */}
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Navigation
                </h3>
                {navigationItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        setCurrentView(item.id as any);
                        setMobileMenuOpen(false);
                      }}
                      className={`flex items-center space-x-3 w-full p-3 rounded-md transition-colors ${
                        currentView === item.id
                          ? 'bg-primary text-white'
                          : 'hover:bg-slate-100 dark:hover:bg-slate-700'
                      }`}
                    >
                      <Icon size={18} />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
              
              <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
                <SymbolSearch 
                  symbol={symbol} 
                  onSymbolChange={(newSymbol) => {
                    setSymbol(newSymbol);
                    setMobileMenuOpen(false);
                  }} 
                />
              </div>
              
              <button
                onClick={toggleDarkMode}
                className="flex items-center space-x-2 w-full p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                {darkMode ? (
                  <>
                    <Sun size={18} />
                    <span>Light Mode</span>
                  </>
                ) : (
                  <>
                    <Moon size={18} />
                    <span>Dark Mode</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="container mx-auto px-4 py-6">
        {currentView === 'chart' && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div className="lg:col-span-3">
              <div className="card mb-6 animate-fade-in">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-4">
                  <div className="flex items-center gap-2">
                    <h2 className="text-2xl font-bold">{symbol}</h2>
                    <button
                      onClick={() => setShowPortfolioDialog(true)}
                      className="p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                      title="Add to portfolio"
                    >
                      <Plus size={20} className="text-primary" />
                    </button>
                    {chartData?.meta?.shortName && (
                      <p className="text-slate-600 dark:text-slate-400">{chartData.meta.shortName}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <select
                        value={timeframe}
                        onChange={(e) => setTimeframe(e.target.value)}
                        className="text-sm border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 bg-white dark:bg-slate-800"
                      >
                        <optgroup label="Intraday">
                          <option value="1m">1 Minute</option>
                          <option value="5m">5 Minutes</option>
                          <option value="15m">15 Minutes</option>
                          <option value="30m">30 Minutes</option>
                          <option value="90m">90 Minutes</option>
                          <option value="1h">1 Hour</option>
                        </optgroup>
                        <optgroup label="Daily">
                          <option value="1d">1 Day</option>
                          <option value="5d">5 Days</option>
                          <option value="1wk">1 Week</option>
                          <option value="1mo">1 Month</option>
                          <option value="3mo">3 Months</option>
                        </optgroup>
                      </select>
                      <button
                        onClick={handleRefresh}
                        disabled={isRefreshing}
                        className={`p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors ${
                          isRefreshing ? 'opacity-50 cursor-not-allowed' : ''
                        }`}
                        aria-label="Refresh data"
                      >
                        <RefreshCw 
                          size={20} 
                          className={`text-primary ${isRefreshing ? 'animate-spin' : ''}`} 
                        />
                      </button>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={autoRefresh}
                          onChange={(e) => setAutoRefresh(e.target.checked)}
                          className="form-checkbox h-4 w-4 text-primary rounded border-slate-300 dark:border-slate-600"
                        />
                        Auto-refresh
                      </label>
                    </div>
                  </div>
                </div>
                
                <ChartContainer 
                  data={chartData} 
                  isLoading={isLoading} 
                  error={error} 
                  darkMode={darkMode}
                  timeframe={timeframe}
                />
                
                {lastRefreshed && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                    Last refreshed: {lastRefreshed.toLocaleTimeString()}
                  </p>
                )}
              </div>
            </div>
            
            <div className="lg:col-span-1 space-y-6">
              <StockSummary data={chartData} isLoading={isLoading} />
              <SymbolTransactions symbol={symbol} />
            </div>
          </div>
        )}

        {currentView === 'portfolio' && (
          <PortfolioDisplay onSymbolSelect={setSymbol} />
        )}

        {currentView === 'backtesting' && (
          <BacktestingView />
        )}
      </main>
      
      <footer className="bg-white dark:bg-slate-800 shadow-inner mt-auto py-4">
        <div className="container mx-auto px-4 text-center text-slate-600 dark:text-slate-400 text-sm">
          <p>© {new Date().getFullYear()} FinChart. Data provided by Yahoo Finance API.</p>
        </div>
      </footer>

      {showPortfolioDialog && (
        <PortfolioDialog
          symbol={symbol}
          onClose={() => setShowPortfolioDialog(false)}
        />
      )}
    </div>
  );
}

export default App;