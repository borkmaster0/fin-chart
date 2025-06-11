import React, { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Plus, Trash2, Calendar, DollarSign, BarChart3, Play, Settings, Eye, ChevronDown, ChevronUp } from 'lucide-react';

interface Portfolio {
  id: string;
  name: string;
  assets: Asset[];
}

interface Asset {
  id: string;
  symbol: string;
  allocation: number;
}

interface BacktestResult {
  portfolio: Portfolio;
  endingValue: number;
  cagr: number;
  maxDrawdown: number;
  volatility: number;
  sharpe: number;
  totalShares: number;
  totalDividends: number;
  estimatedAnnualDividend: number;
  details: {
    totalValue: number;
    totalShares: number;
    dividendsReceived: number;
    estimatedAnnualDividend: number;
  };
}

const BacktestingView: React.FC = () => {
  const [startDate, setStartDate] = useState('1999-03-10');
  const [endDate, setEndDate] = useState('2025-06-09');
  const [startingValue, setStartingValue] = useState(100000);
  const [cashflow, setCashflow] = useState(0);
  const [cashflowFrequency, setCashflowFrequency] = useState('yearly');
  const [rebalanceFrequency, setRebalanceFrequency] = useState('yearly');
  const [adjustForInflation, setAdjustForInflation] = useState(false);
  const [reinvestDividends, setReinvestDividends] = useState(true);
  const [portfolios, setPortfolios] = useState<Portfolio[]>([
    {
      id: '1',
      name: 'Portfolio 1',
      assets: [
        { id: '1', symbol: 'SPY', allocation: 50 },
        { id: '2', symbol: 'QQQ', allocation: 50 }
      ]
    }
  ]);
  const [results, setResults] = useState<BacktestResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [expandedDetails, setExpandedDetails] = useState<Set<string>>(new Set());

  const addPortfolio = () => {
    const newPortfolio: Portfolio = {
      id: Date.now().toString(),
      name: `Portfolio ${portfolios.length + 1}`,
      assets: [{ id: Date.now().toString(), symbol: '', allocation: 100 }]
    };
    setPortfolios([...portfolios, newPortfolio]);
  };

  const removePortfolio = (portfolioId: string) => {
    setPortfolios(portfolios.filter(p => p.id !== portfolioId));
  };

  const updatePortfolioName = (portfolioId: string, name: string) => {
    setPortfolios(portfolios.map(p => 
      p.id === portfolioId ? { ...p, name } : p
    ));
  };

  const addAsset = (portfolioId: string) => {
    setPortfolios(portfolios.map(p => 
      p.id === portfolioId 
        ? { 
            ...p, 
            assets: [...p.assets, { 
              id: Date.now().toString(), 
              symbol: '', 
              allocation: 0 
            }] 
          }
        : p
    ));
  };

  const removeAsset = (portfolioId: string, assetId: string) => {
    setPortfolios(portfolios.map(p => 
      p.id === portfolioId 
        ? { ...p, assets: p.assets.filter(a => a.id !== assetId) }
        : p
    ));
  };

  const updateAsset = (portfolioId: string, assetId: string, field: keyof Asset, value: string | number) => {
    setPortfolios(portfolios.map(p => 
      p.id === portfolioId 
        ? {
            ...p,
            assets: p.assets.map(a => 
              a.id === assetId ? { ...a, [field]: value } : a
            )
          }
        : p
    ));
  };

  const getTotalAllocation = (portfolio: Portfolio) => {
    return portfolio.assets.reduce((sum, asset) => sum + asset.allocation, 0);
  };

  const runBacktest = async () => {
    setIsRunning(true);
    
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Mock results
    const mockResults: BacktestResult[] = portfolios.map(portfolio => {
      const baseReturn = Math.random() * 0.4 - 0.2; // -20% to +20%
      const endingValue = startingValue * (1 + baseReturn);
      const years = (new Date(endDate).getTime() - new Date(startDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000);
      const cagr = Math.pow(endingValue / startingValue, 1 / years) - 1;
      
      return {
        portfolio,
        endingValue,
        cagr,
        maxDrawdown: Math.random() * -0.6, // 0% to -60%
        volatility: Math.random() * 0.5, // 0% to 50%
        sharpe: Math.random() * 2 - 0.5, // -0.5 to 1.5
        totalShares: Math.random() * 1000 + 100,
        totalDividends: Math.random() * 10000 + 1000,
        estimatedAnnualDividend: Math.random() * 2000 + 500,
        details: {
          totalValue: endingValue,
          totalShares: Math.random() * 1000 + 100,
          dividendsReceived: Math.random() * 10000 + 1000,
          estimatedAnnualDividend: Math.random() * 2000 + 500
        }
      };
    });
    
    setResults(mockResults);
    setIsRunning(false);
  };

  const toggleDetails = (portfolioId: string) => {
    const newExpanded = new Set(expandedDetails);
    if (newExpanded.has(portfolioId)) {
      newExpanded.delete(portfolioId);
    } else {
      newExpanded.add(portfolioId);
    }
    setExpandedDetails(newExpanded);
  };

  const formatCurrency = (value: number) => {
    if (Math.abs(value) >= 1e9) {
      return `$${(value / 1e9).toFixed(1)}B`;
    } else if (Math.abs(value) >= 1e6) {
      return `$${(value / 1e6).toFixed(1)}M`;
    } else if (Math.abs(value) >= 1e3) {
      return `$${(value / 1e3).toFixed(1)}K`;
    }
    return `$${value.toFixed(2)}`;
  };

  const formatPercent = (value: number) => {
    return `${(value * 100).toFixed(2)}%`;
  };

  return (
    <div className="max-w-full mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-3">
          <TrendingUp className="h-8 w-8 text-primary" />
          Backtesting
        </h1>
        <p className="text-slate-600 dark:text-slate-400">
          Test your trading strategies against historical data to evaluate performance
        </p>
      </div>

      {/* Main Layout - Side by Side */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        {/* Left Panel - Configuration */}
        <div className="xl:col-span-1 space-y-6">
          {/* Global Parameters */}
          <div className="card">
            <div className="flex items-center gap-3 mb-6">
              <Settings className="h-5 w-5 text-primary" />
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Global Parameters</h2>
            </div>
            
            <div className="space-y-4">
              {/* Date Range */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Start Date</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="input w-full"
                  />
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Leave blank for when all tickers have data
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">End Date</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="input w-full"
                  />
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Leave blank for when all tickers still have data
                  </p>
                </div>
              </div>

              {/* Starting Value and Cashflow */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Starting Value</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-500">$</span>
                    <input
                      type="number"
                      value={startingValue}
                      onChange={(e) => setStartingValue(Number(e.target.value))}
                      className="input w-full pl-8"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Cashflow</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-500">$</span>
                    <input
                      type="number"
                      value={cashflow}
                      onChange={(e) => setCashflow(Number(e.target.value))}
                      className="input w-full pl-8"
                    />
                  </div>
                </div>
              </div>

              {/* Frequency Settings */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Cashflow Frequency</label>
                  <select
                    value={cashflowFrequency}
                    onChange={(e) => setCashflowFrequency(e.target.value)}
                    className="input w-full"
                  >
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Rebalance Frequency</label>
                  <select
                    value={rebalanceFrequency}
                    onChange={(e) => setRebalanceFrequency(e.target.value)}
                    className="input w-full"
                  >
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </div>
              </div>

              {/* Options */}
              <div className="space-y-3">
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={adjustForInflation}
                    onChange={(e) => setAdjustForInflation(e.target.checked)}
                    className="form-checkbox h-4 w-4 text-primary rounded"
                  />
                  <span className="text-sm font-medium">Adjust for inflation</span>
                </label>
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={reinvestDividends}
                    onChange={(e) => setReinvestDividends(e.target.checked)}
                    className="form-checkbox h-4 w-4 text-primary rounded"
                  />
                  <div>
                    <span className="text-sm font-medium">Reinvest dividends (Total Return)</span>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Include dividend reinvestment for total return calculation
                    </p>
                  </div>
                </label>
              </div>
            </div>
          </div>

          {/* Portfolios */}
          <div className="card">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Portfolios</h2>
              <button
                onClick={addPortfolio}
                className="btn btn-primary flex items-center gap-2"
              >
                <Plus size={16} />
                Add Portfolio
              </button>
            </div>

            <div className="space-y-4">
              {portfolios.map((portfolio) => (
                <div key={portfolio.id} className="border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-4">
                    <input
                      type="text"
                      value={portfolio.name}
                      onChange={(e) => updatePortfolioName(portfolio.id, e.target.value)}
                      className="input flex-1 mr-3"
                    />
                    {portfolios.length > 1 && (
                      <button
                        onClick={() => removePortfolio(portfolio.id)}
                        className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-full transition-colors"
                      >
                        <Trash2 size={16} className="text-red-500" />
                      </button>
                    )}
                  </div>

                  <div className="space-y-3">
                    {portfolio.assets.map((asset) => (
                      <div key={asset.id} className="flex items-center gap-3">
                        <input
                          type="text"
                          placeholder="Symbol"
                          value={asset.symbol}
                          onChange={(e) => updateAsset(portfolio.id, asset.id, 'symbol', e.target.value.toUpperCase())}
                          className="input flex-1"
                        />
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={asset.allocation}
                            onChange={(e) => updateAsset(portfolio.id, asset.id, 'allocation', Number(e.target.value))}
                            className="input w-20 text-center"
                          />
                          <span className="text-sm text-slate-500">%</span>
                        </div>
                        {portfolio.assets.length > 1 && (
                          <button
                            onClick={() => removeAsset(portfolio.id, asset.id)}
                            className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-full transition-colors"
                          >
                            <Trash2 size={14} className="text-red-500" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between mt-4">
                    <button
                      onClick={() => addAsset(portfolio.id)}
                      className="text-primary hover:text-primary-dark text-sm font-medium flex items-center gap-1"
                    >
                      <Plus size={14} />
                      Add Asset
                    </button>
                    <div className={`text-sm font-medium ${
                      getTotalAllocation(portfolio) === 100 
                        ? 'text-green-600' 
                        : 'text-orange-600'
                    }`}>
                      Total: {getTotalAllocation(portfolio)}%
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Run Backtest Button */}
          <button
            onClick={runBacktest}
            disabled={isRunning || portfolios.some(p => getTotalAllocation(p) !== 100)}
            className={`w-full btn btn-primary flex items-center justify-center gap-3 py-4 text-lg font-semibold ${
              isRunning || portfolios.some(p => getTotalAllocation(p) !== 100)
                ? 'opacity-50 cursor-not-allowed' 
                : ''
            }`}
          >
            <Play size={20} />
            {isRunning ? 'RUNNING BACKTEST...' : 'BACKTEST'}
          </button>
        </div>

        {/* Right Panel - Results */}
        <div className="xl:col-span-2">
          {results.length === 0 ? (
            <div className="card h-full flex items-center justify-center">
              <div className="text-center py-12">
                <BarChart3 className="h-16 w-16 text-slate-400 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
                  Configure your portfolios and run a backtest
                </h3>
                <p className="text-slate-600 dark:text-slate-400">
                  Results and performance charts will appear here
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Results Header */}
              <div className="card">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                    <BarChart3 className="h-6 w-6 text-primary" />
                    Results ({results.length} Portfolio{results.length !== 1 ? 's' : ''})
                  </h2>
                  <div className="flex items-center gap-4 text-sm text-slate-600 dark:text-slate-400">
                    <div className="flex items-center gap-2">
                      <Calendar size={16} />
                      <span>{startDate} - {endDate}</span>
                    </div>
                    <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded text-xs font-medium">
                      Total Return
                    </span>
                  </div>
                </div>
                <p className="text-slate-600 dark:text-slate-400 text-sm">
                  Using optimal date range where all tickers have complete data
                </p>
              </div>

              {/* Portfolio Comparison Table */}
              <div className="card">
                <div className="flex items-center gap-3 mb-6">
                  <BarChart3 className="h-5 w-5 text-primary" />
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white">Portfolio Comparison</h3>
                </div>
                
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-700">
                        <th className="text-left py-3 px-4 font-medium text-slate-600 dark:text-slate-400">Portfolio</th>
                        <th className="text-left py-3 px-4 font-medium text-slate-600 dark:text-slate-400">Ending Value</th>
                        <th className="text-left py-3 px-4 font-medium text-slate-600 dark:text-slate-400">CAGR</th>
                        <th className="text-left py-3 px-4 font-medium text-slate-600 dark:text-slate-400">Max Drawdown</th>
                        <th className="text-left py-3 px-4 font-medium text-slate-600 dark:text-slate-400">Volatility</th>
                        <th className="text-left py-3 px-4 font-medium text-slate-600 dark:text-slate-400">Sharpe</th>
                        <th className="text-left py-3 px-4 font-medium text-slate-600 dark:text-slate-400">Details</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                      {results.map((result) => (
                        <React.Fragment key={result.portfolio.id}>
                          <tr className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                            <td className="py-4 px-4">
                              <div className="flex items-center gap-3">
                                <div className={`w-3 h-3 rounded-full ${
                                  result.portfolio.id === '1' ? 'bg-blue-500' : 
                                  result.portfolio.id === '2' ? 'bg-green-500' : 
                                  'bg-orange-500'
                                }`}></div>
                                <span className="font-medium">{result.portfolio.name}</span>
                              </div>
                            </td>
                            <td className="py-4 px-4 font-bold text-lg">
                              {formatCurrency(result.endingValue)}
                            </td>
                            <td className="py-4 px-4">
                              <span className={`font-semibold ${
                                result.cagr >= 0 ? 'text-green-600' : 'text-red-600'
                              }`}>
                                {formatPercent(result.cagr)}
                              </span>
                            </td>
                            <td className="py-4 px-4">
                              <span className="font-semibold text-red-600">
                                {formatPercent(result.maxDrawdown)}
                              </span>
                            </td>
                            <td className="py-4 px-4">
                              <span className="font-semibold">
                                {formatPercent(result.volatility)}
                              </span>
                            </td>
                            <td className="py-4 px-4">
                              <span className="font-semibold">
                                {result.sharpe.toFixed(2)}
                              </span>
                            </td>
                            <td className="py-4 px-4">
                              <button
                                onClick={() => toggleDetails(result.portfolio.id)}
                                className="flex items-center gap-1 text-primary hover:text-primary-dark transition-colors"
                              >
                                <Eye size={16} />
                                {expandedDetails.has(result.portfolio.id) ? (
                                  <ChevronUp size={16} />
                                ) : (
                                  <ChevronDown size={16} />
                                )}
                              </button>
                            </td>
                          </tr>
                          {expandedDetails.has(result.portfolio.id) && (
                            <tr>
                              <td colSpan={7} className="py-4 px-4 bg-slate-50 dark:bg-slate-700/30">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                  <div className="text-center">
                                    <div className="text-sm text-slate-600 dark:text-slate-400">Total Portfolio Value</div>
                                    <div className="text-lg font-bold text-slate-900 dark:text-white">
                                      {formatCurrency(result.details.totalValue)}
                                    </div>
                                  </div>
                                  <div className="text-center">
                                    <div className="text-sm text-slate-600 dark:text-slate-400">Total Shares</div>
                                    <div className="text-lg font-bold text-slate-900 dark:text-white">
                                      {result.details.totalShares.toFixed(2)}
                                    </div>
                                  </div>
                                  <div className="text-center">
                                    <div className="text-sm text-slate-600 dark:text-slate-400">Dividends Received</div>
                                    <div className="text-lg font-bold text-green-600">
                                      {formatCurrency(result.details.dividendsReceived)}
                                    </div>
                                  </div>
                                  <div className="text-center">
                                    <div className="text-sm text-slate-600 dark:text-slate-400">Est. Annual Dividend</div>
                                    <div className="text-lg font-bold text-blue-600">
                                      {formatCurrency(result.details.estimatedAnnualDividend)}
                                    </div>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Performance Chart Placeholder */}
              <div className="card">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white">Performance Comparison</h3>
                  <div className="flex items-center gap-4 text-sm text-slate-600 dark:text-slate-400">
                    <div className="flex items-center gap-2">
                      <Calendar size={16} />
                      <span>{startDate} - {endDate}</span>
                    </div>
                    <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded text-xs font-medium">
                      Total Return
                    </span>
                  </div>
                </div>
                
                <div className="flex items-center gap-4 mb-4">
                  {results.map((result) => (
                    <div key={result.portfolio.id} className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full ${
                        result.portfolio.id === '1' ? 'bg-blue-500' : 
                        result.portfolio.id === '2' ? 'bg-green-500' : 
                        'bg-orange-500'
                      }`}></div>
                      <span className="text-sm font-medium">{result.portfolio.name}</span>
                      <span className="text-sm text-slate-500">-</span>
                    </div>
                  ))}
                </div>
                
                <div className="h-96 bg-slate-100 dark:bg-slate-700 rounded-lg flex items-center justify-center">
                  <div className="text-center">
                    <BarChart3 className="h-12 w-12 text-slate-400 mx-auto mb-2" />
                    <p className="text-slate-600 dark:text-slate-400">Performance chart will be displayed here</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BacktestingView;