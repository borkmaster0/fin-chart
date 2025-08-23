import React, { useState, useEffect } from 'react';
import { Target, RefreshCw, Calendar, TrendingUp, TrendingDown } from 'lucide-react';
import { fetchSymbolOptionsChain, OptionStraddleResponse, OptionStraddle } from '../utils/api';

interface OptionsViewProps {
  symbol: string;
}

interface ParsedOption {
  contract: string;
  expiry: string;
  strike: number;
  type: 'call' | 'put';
  lastPrice: number;
  bid: number;
  ask: number;
  volume: number;
  openInterest: number;
  impliedVolatility: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
}

interface OptionsByExpiry {
  [expiry: string]: {
    calls: { [strike: string]: ParsedOption };
    puts: { [strike: string]: ParsedOption };
    strikes: number[];
  };
}

const OptionsView: React.FC<OptionsViewProps> = ({ symbol }) => {
  const [optionsData, setOptionsData] = useState<OptionStraddleResponse | null>(null);
  const [cachedSymbol, setCachedSymbol] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedExpiry, setSelectedExpiry] = useState<string>('');
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    const storedDarkMode = localStorage.getItem('darkMode');
    setIsDarkMode(storedDarkMode === 'true');
  }, []);

  const parseOptionContract = (contract: string): { expiry: string; strike: number; type: 'call' | 'put' } => {
    // Example: QQQ250825C00450000
    // Format: [SYMBOL][YYMMDD][C/P][STRIKE*1000]
    const match = contract.match(/^([A-Z]+)(\d{6})([CP])(\d{8})$/);
    if (!match) {
      throw new Error(`Invalid option contract format: ${contract}`);
    }

    const [, , dateStr, typeStr, strikeStr] = match;
    
    // Parse date (YYMMDD)
    const year = 2000 + parseInt(dateStr.substring(0, 2));
    const month = parseInt(dateStr.substring(2, 4));
    const day = parseInt(dateStr.substring(4, 6));
    const expiry = `${month}/${day}/${year}`;
    
    // Parse strike (divide by 1000)
    const strike = parseInt(strikeStr) / 1000;
    
    // Parse type
    const type = typeStr === 'C' ? 'call' : 'put';
    
    return { expiry, strike, type };
  };

  const organizeOptionsByExpiry = (straddles: OptionStraddle[]): OptionsByExpiry => {
    const organized: OptionsByExpiry = {};
    
    straddles.forEach(straddle => {
      try {
        const { expiry, strike, type } = parseOptionContract(straddle.ot);
        
        if (!organized[expiry]) {
          organized[expiry] = {
            calls: {},
            puts: {},
            strikes: []
          };
        }
        
        // Add call option
        const callOption: ParsedOption = {
          contract: straddle.ot,
          expiry,
          strike,
          type: 'call',
          lastPrice: straddle.clp,
          bid: straddle.cb,
          ask: straddle.ca,
          volume: straddle.cv,
          openInterest: straddle.coi,
          impliedVolatility: straddle.civ,
          delta: straddle.cde,
          gamma: straddle.cga,
          theta: straddle.cth,
          vega: straddle.cve,
          rho: straddle.crh
        };
        
        // Add put option
        const putOption: ParsedOption = {
          contract: straddle.ot.replace('C', 'P'), // Convert call contract to put
          expiry,
          strike,
          type: 'put',
          lastPrice: straddle.plp,
          bid: straddle.pb,
          ask: straddle.pa,
          volume: straddle.pv,
          openInterest: straddle.poi,
          impliedVolatility: straddle.piv,
          delta: straddle.pde,
          gamma: straddle.pga,
          theta: straddle.pth,
          vega: straddle.pve,
          rho: straddle.prh
        };
        
        organized[expiry].calls[strike.toString()] = callOption;
        organized[expiry].puts[strike.toString()] = putOption;
        
        // Add strike to strikes array if not already present
        if (!organized[expiry].strikes.includes(strike)) {
          organized[expiry].strikes.push(strike);
        }
      } catch (error) {
        console.error('Error parsing option contract:', straddle.ot, error);
      }
    });
    
    // Sort strikes for each expiry
    Object.keys(organized).forEach(expiry => {
      organized[expiry].strikes.sort((a, b) => a - b);
    });
    
    return organized;
  };

  const loadOptionsData = async () => {
    if (!symbol || (symbol === cachedSymbol && optionsData)) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const data = await fetchSymbolOptionsChain(symbol);
      setOptionsData(data);
      setCachedSymbol(symbol);
      
      // Set default expiry to the first one (most recent)
      if (data.straddles.length > 0) {
        const organized = organizeOptionsByExpiry(data.straddles);
        const expiries = Object.keys(organized).sort((a, b) => {
          const dateA = new Date(a);
          const dateB = new Date(b);
          return dateA.getTime() - dateB.getTime();
        });
        if (expiries.length > 0 && !selectedExpiry) {
          setSelectedExpiry(expiries[0]);
        }
      }
    } catch (err) {
      console.error('Failed to fetch options data:', err);
      setError('Failed to load options data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Only load if we don't have data for this symbol
    if (!optionsData || symbol !== cachedSymbol) {
      loadOptionsData();
    }
  }, [symbol]);

  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const formatPercent = (value: number): string => {
    return `${value.toFixed(3)}%`;
  };

  const formatGreek = (value: number): string => {
    return value.toFixed(4);
  };

  if (!symbol) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="card text-center py-12">
          <Target className="h-16 w-16 text-slate-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
            No Symbol Selected
          </h3>
          <p className="text-slate-600 dark:text-slate-400">
            Please select a symbol from the chart view to view options data
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="card text-center py-12">
          <RefreshCw className="h-16 w-16 text-primary mx-auto mb-4 animate-spin" />
          <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
            Loading Options Data
          </h3>
          <p className="text-slate-600 dark:text-slate-400">
            Fetching options chain for {symbol}...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="card text-center py-12">
          <Target className="h-16 w-16 text-red-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
            Error Loading Options
          </h3>
          <p className="text-slate-600 dark:text-slate-400 mb-4">{error}</p>
          <button
            onClick={loadOptionsData}
            className="btn btn-primary flex items-center gap-2 mx-auto"
          >
            <RefreshCw size={16} />
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!optionsData || optionsData.straddles.length === 0) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="card text-center py-12">
          <Target className="h-16 w-16 text-slate-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
            No Options Data Available
          </h3>
          <p className="text-slate-600 dark:text-slate-400">
            No options data found for {symbol}
          </p>
        </div>
      </div>
    );
  }

  const organizedOptions = organizeOptionsByExpiry(optionsData.straddles);
  const expiries = Object.keys(organizedOptions).sort((a, b) => {
    const dateA = new Date(a);
    const dateB = new Date(b);
    return dateA.getTime() - dateB.getTime();
  });

  const currentExpiryData = selectedExpiry ? organizedOptions[selectedExpiry] : null;

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-3">
              <Target className="h-8 w-8 text-primary" />
              {symbol} Options Chain
            </h1>
            <p className="text-slate-600 dark:text-slate-400">
              Current stock price: {formatCurrency(optionsData.stockPrice)} • 
              Data from {optionsData.source} • 
              Updated: {new Date(optionsData.createdOn).toLocaleString()}
            </p>
          </div>
          <button
            onClick={loadOptionsData}
            disabled={loading}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors ${
              loading ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            <RefreshCw size={18} className={`text-slate-600 dark:text-slate-400 ${loading ? 'animate-spin' : ''}`} />
            <span className="text-sm font-medium">Refresh</span>
          </button>
        </div>
      </div>

      {/* Expiry Selector */}
      <div className="card mb-6">
        <div className="flex items-center gap-4 mb-4">
          <Calendar className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">Expiration Date</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          {expiries.map(expiry => (
            <button
              key={expiry}
              onClick={() => setSelectedExpiry(expiry)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                selectedExpiry === expiry
                  ? 'bg-primary text-white'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
              }`}
            >
              {expiry}
            </button>
          ))}
        </div>
      </div>

      {/* Options Chain Table */}
      {currentExpiryData && (
        <div className="card">
          <div className="mb-4">
            <h3 className="text-lg font-semibold mb-2">
              {symbol} maturity {selectedExpiry} • created {new Date(optionsData.createdOn).toLocaleDateString()} {new Date(optionsData.createdOn).toLocaleTimeString()}
            </h3>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  {/* Call Headers */}
                  <th className="text-center p-3 font-semibold text-slate-900 dark:text-white" colSpan={6}>Call</th>
                  {/* Strike Header */}
                  <th className="text-center p-3 font-semibold text-slate-900 dark:text-white">Strike</th>
                  {/* Put Headers */}
                  <th className="text-center p-3 font-semibold text-slate-900 dark:text-white" colSpan={6}>Put</th>
                </tr>
                <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
                  {/* Call Sub-headers */}
                  <th className="text-center p-2 text-sm font-medium text-slate-600 dark:text-slate-400">Last</th>
                  <th className="text-center p-2 text-sm font-medium text-slate-600 dark:text-slate-400">Bid</th>
                  <th className="text-center p-2 text-sm font-medium text-slate-600 dark:text-slate-400">Ask</th>
                  <th className="text-center p-2 text-sm font-medium text-slate-600 dark:text-slate-400">Vol</th>
                  <th className="text-center p-2 text-sm font-medium text-slate-600 dark:text-slate-400">OI</th>
                  <th className="text-center p-2 text-sm font-medium text-slate-600 dark:text-slate-400">IV</th>
                  {/* Strike */}
                  <th className="text-center p-2 text-sm font-medium text-slate-600 dark:text-slate-400">Price</th>
                  {/* Put Sub-headers */}
                  <th className="text-center p-2 text-sm font-medium text-slate-600 dark:text-slate-400">IV</th>
                  <th className="text-center p-2 text-sm font-medium text-slate-600 dark:text-slate-400">OI</th>
                  <th className="text-center p-2 text-sm font-medium text-slate-600 dark:text-slate-400">Vol</th>
                  <th className="text-center p-2 text-sm font-medium text-slate-600 dark:text-slate-400">Ask</th>
                  <th className="text-center p-2 text-sm font-medium text-slate-600 dark:text-slate-400">Bid</th>
                  <th className="text-center p-2 text-sm font-medium text-slate-600 dark:text-slate-400">Last</th>
                </tr>
              </thead>
              <tbody>
                {currentExpiryData.strikes.map(strike => {
                  const call = currentExpiryData.calls[strike.toString()];
                  const put = currentExpiryData.puts[strike.toString()];
                  const isAtTheMoney = Math.abs(strike - optionsData.stockPrice) < 5; // Within $5 of current price
                  
                  return (
                    <tr 
                      key={strike}
                      className={`border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/50 ${
                        isAtTheMoney ? 'bg-yellow-50 dark:bg-yellow-900/20' : ''
                      }`}
                    >
                      {/* Call Data */}
                      <td className="text-center p-2 text-sm font-medium">{formatCurrency(call?.lastPrice || 0)}</td>
                      <td className="text-center p-2 text-sm">{formatCurrency(call?.bid || 0)}</td>
                      <td className="text-center p-2 text-sm">{formatCurrency(call?.ask || 0)}</td>
                      <td className="text-center p-2 text-sm">{call?.volume || 0}</td>
                      <td className="text-center p-2 text-sm">{call?.openInterest || 0}</td>
                      <td className="text-center p-2 text-sm">{formatPercent(call?.impliedVolatility || 0)}</td>
                      
                      {/* Strike */}
                      <td className={`text-center p-2 font-bold ${
                        isAtTheMoney 
                          ? 'text-yellow-700 dark:text-yellow-300' 
                          : 'text-slate-900 dark:text-white'
                      }`}>
                        {formatCurrency(strike)}
                      </td>
                      
                      {/* Put Data */}
                      <td className="text-center p-2 text-sm">{formatPercent(put?.impliedVolatility || 0)}</td>
                      <td className="text-center p-2 text-sm">{put?.openInterest || 0}</td>
                      <td className="text-center p-2 text-sm">{put?.volume || 0}</td>
                      <td className="text-center p-2 text-sm">{formatCurrency(put?.ask || 0)}</td>
                      <td className="text-center p-2 text-sm">{formatCurrency(put?.bid || 0)}</td>
                      <td className="text-center p-2 text-sm font-medium">{formatCurrency(put?.lastPrice || 0)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          
          <div className="mt-4 text-xs text-slate-500 dark:text-slate-400">
            <p>
              <strong>Legend:</strong> Last = Last Price, Bid/Ask = Bid/Ask Price, Vol = Volume, OI = Open Interest, IV = Implied Volatility
            </p>
            <p className="mt-1">
              Highlighted rows indicate strikes near the current stock price ({formatCurrency(optionsData.stockPrice)})
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default OptionsView;