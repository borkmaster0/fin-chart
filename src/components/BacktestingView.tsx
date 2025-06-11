import React, { useState, useEffect, useRef } from 'react';
import { TrendingUp, BarChart3, Settings, Play, Loader, Plus, Trash2, Download, Calendar, DollarSign, Target, Activity, ChevronDown, ChevronUp, HandCoins, Share as Shares } from 'lucide-react';
import { createChart, ColorType, LineStyle, AreaSeries, LineSeries } from 'lightweight-charts';
import { fetchChartData } from '../utils/api';
import { formatCurrency } from '../utils/formatters';
import ValueWithTooltip from './ValueWithTooltip';

interface BacktestConfig {
  startDate: string;
  endDate: string;
  initialValue: number;
  cashflow: number;
  cashflowFrequency: 'daily' | 'monthly' | 'quarterly' | 'yearly';
  reinvestDividends: boolean; // New option for total return
}

interface PortfolioAllocation {
  symbol: string;
  allocation: number; // percentage
}

interface Portfolio {
  id: string;
  name: string;
  allocations: PortfolioAllocation[];
}

interface DividendEvent {
  date: number;
  amount: number;
}

interface SplitEvent {
  date: number;
  ratio: number;
}

interface SymbolData {
  timestamps: number[];
  prices: number[];
  dividends: DividendEvent[];
  splits: SplitEvent[];
}

interface PortfolioBacktestResult {
  portfolioId: string;
  portfolioName: string;
  portfolioValue: Array<{ time: number; value: number }>;
  statistics: {
    endingValue: number;
    cagr: number;
    maxDrawdown: number;
    volatility: number;
    sharpeRatio: number;
    totalReturn: number;
    totalDividends: number; // New metric
  };
  yearlyReturns: Array<{ year: number; return: number }>;
  detailedMetrics: {
    totalShares: { [symbol: string]: number };
    totalDividendsReceived: { [symbol: string]: number };
    estimatedAnnualDividend: { [symbol: string]: number };
    lastDividendPayment: { [symbol: string]: number };
  };
}

interface BacktestResult {
  portfolios: PortfolioBacktestResult[];
  actualStartDate: string;
  actualEndDate: string;
}

// Portfolio colors for chart lines
const PORTFOLIO_COLORS = [
  '#3B82F6', // Blue
  '#10B981', // Green
  '#F59E0B', // Amber
  '#EF4444', // Red
  '#8B5CF6', // Purple
  '#06B6D4', // Cyan
  '#F97316', // Orange
  '#84CC16', // Lime
];

const BacktestingView: React.FC = () => {
  const [config, setConfig] = useState<BacktestConfig>({
    startDate: '', // Blank by default
    endDate: '',   // Blank by default
    initialValue: 100000,
    cashflow: 0,
    cashflowFrequency: 'yearly',
    reinvestDividends: true // Default to true for total return
  });

  const [portfolios, setPortfolios] = useState<Portfolio[]>([
    {
      id: '1',
      name: 'Portfolio 1',
      allocations: [
        { symbol: 'SPY', allocation: 50 },
        { symbol: 'QQQ', allocation: 50 }
      ]
    }
  ]);

  const [isBacktesting, setIsBacktesting] = useState(false);
  const [results, setResults] = useState<BacktestResult | null>(null);
  const [fetchProgress, setFetchProgress] = useState<{ current: number; total: number; symbol: string }>({ current: 0, total: 0, symbol: '' });
  const [activeTab, setActiveTab] = useState<'summary' | 'withdrawal' | 'rolling' | 'annual'>('summary');
  const [selectedPortfolios, setSelectedPortfolios] = useState<Set<string>>(new Set());
  const [legendValues, setLegendValues] = useState<{ [portfolioId: string]: string }>({});
  const [stockLegendValues, setStockLegendValues] = useState<{ [symbol: string]: string }>({});
  const [expandedPortfolio, setExpandedPortfolio] = useState<string | null>(null);
  const [priceChartData, setPriceChartData] = useState<{ [symbol: string]: { time: number; value: number }[] }>({});
  const [selectedSymbols, setSelectedSymbols] = useState<Set<string>>(new Set());
  
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartContainerTwo = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const chartRefTwo = useRef<any>(null);

  // Initialize selected portfolios when portfolios change
  useEffect(() => {
    setSelectedPortfolios(new Set(portfolios.map(p => p.id)));
  }, [portfolios]);

  // Get all unique symbols from portfolios
  const getAllSymbols = () => {
    const symbols = new Set<string>();
    portfolios.forEach(portfolio => {
      portfolio.allocations.forEach(allocation => {
        symbols.add(allocation.symbol);
      });
    });
    return Array.from(symbols);
  };

  // Add new portfolio
  const addPortfolio = () => {
    const newId = (portfolios.length + 1).toString();
    setPortfolios([...portfolios, {
      id: newId,
      name: `Portfolio ${newId}`,
      allocations: [{ symbol: '', allocation: 100 }]
    }]);
  };

  // Remove portfolio
  const removePortfolio = (id: string) => {
    if (portfolios.length > 1) {
      setPortfolios(portfolios.filter(p => p.id !== id));
    }
  };

  // Update portfolio allocation
  const updateAllocation = (portfolioId: string, index: number, field: 'symbol' | 'allocation', value: string | number) => {
    setPortfolios(portfolios.map(portfolio => {
      if (portfolio.id === portfolioId) {
        const newAllocations = [...portfolio.allocations];
        if (field === 'symbol') {
          newAllocations[index].symbol = value as string;
        } else {
          newAllocations[index].allocation = Number(value);
        }
        return { ...portfolio, allocations: newAllocations };
      }
      return portfolio;
    }));
  };

  // Add allocation to portfolio
  const addAllocation = (portfolioId: string) => {
    setPortfolios(portfolios.map(portfolio => {
      if (portfolio.id === portfolioId) {
        return {
          ...portfolio,
          allocations: [...portfolio.allocations, { symbol: '', allocation: 0 }]
        };
      }
      return portfolio;
    }));
  };

  // Remove allocation from portfolio
  const removeAllocation = (portfolioId: string, index: number) => {
    setPortfolios(portfolios.map(portfolio => {
      if (portfolio.id === portfolioId) {
        const newAllocations = portfolio.allocations.filter((_, i) => i !== index);
        return { ...portfolio, allocations: newAllocations };
      }
      return portfolio;
    }));
  };

  // Calculate total allocation percentage
  const getTotalAllocation = (portfolioId: string) => {
    const portfolio = portfolios.find(p => p.id === portfolioId);
    return portfolio?.allocations.reduce((sum, allocation) => sum + allocation.allocation, 0) || 0;
  };

  // Process raw chart data into structured format with dividends and splits
  const processSymbolData = (chartData: any): SymbolData => {
    const timestamps = chartData.timestamp || [];
    const prices = chartData.close || [];
    
    // Process dividends
    const dividends: DividendEvent[] = [];
    if (chartData.events?.dividends) {
      Object.entries(chartData.events.dividends).forEach(([timestamp, dividend]: [string, any]) => {
        dividends.push({
          date: parseInt(timestamp),
          amount: dividend.amount
        });
      });
    }
    
    // Process splits
    const splits: SplitEvent[] = [];
    if (chartData.events?.splits) {
      Object.entries(chartData.events.splits).forEach(([timestamp, split]: [string, any]) => {
        splits.push({
          date: parseInt(timestamp),
          ratio: split.numerator / split.denominator
        });
      });
    }
    
    // Sort events by date
    dividends.sort((a, b) => a.date - b.date);
    splits.sort((a, b) => a.date - b.date);
    
    return {
      timestamps,
      prices,
      dividends,
      splits
    };
  };

  // Determine actual start and end dates from data
  const determineActualDates = (historicalData: { [symbol: string]: SymbolData }) => {
    let latestStartDate = 0; // Latest of the earliest dates (when all tickers have data)
    let earliestEndDate = Infinity; // Earliest of the latest dates

    Object.values(historicalData).forEach((data: SymbolData) => {
      if (data && data.timestamps && data.timestamps.length > 0) {
        const firstTimestamp = data.timestamps[0];
        const lastTimestamp = data.timestamps[data.timestamps.length - 1];
        
        // For start date: we want the LATEST of all first timestamps
        // This ensures all tickers have data from this point forward
        if (firstTimestamp > latestStartDate) {
          latestStartDate = firstTimestamp;
        }
        
        // For end date: we want the EARLIEST of all last timestamps
        // This ensures all tickers have data up to this point
        if (lastTimestamp < earliestEndDate) {
          earliestEndDate = lastTimestamp;
        }
      }
    });

    return {
      latestStartDate: latestStartDate === 0 ? Date.now() / 1000 : latestStartDate,
      earliestEndDate: earliestEndDate === Infinity ? Date.now() / 1000 : earliestEndDate
    };
  };

  // Fetch historical data for all symbols
  const fetchAllData = async (symbols: string[]) => {
    const data: { [symbol: string]: SymbolData } = {};
    
    setFetchProgress({ current: 0, total: symbols.length, symbol: '' });
    
    for (let i = 0; i < symbols.length; i++) {
      const symbol = symbols[i];
      setFetchProgress({ current: i + 1, total: symbols.length, symbol });
      
      try {
        const chartData = await fetchChartData(symbol, '1d');
        data[symbol] = processSymbolData(chartData);
        
        // Wait 1 second between requests
        if (i < symbols.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (error) {
        console.error(`Failed to fetch data for ${symbol}:`, error);
      }
    }

    const symbolPriceSeries: { [symbol: string]: { time: number; value: number }[] } = {};
    Object.entries(data).forEach(([symbol, data]) => {
      symbolPriceSeries[symbol] = data.timestamps.map((t, i) => ({
        time: t,
        value: data.prices[i],
      }));
    });
    setPriceChartData(symbolPriceSeries);
    
    return data;
  };

  // Simulate portfolio performance with proper dividend reinvestment
  const simulatePortfolio = (
    portfolio: Portfolio,
    historicalData: { [symbol: string]: SymbolData },
    startTime: number,
    endTime: number
  ): PortfolioBacktestResult => {
    const portfolioValue: Array<{ time: number; value: number }> = [];
    let currentValue = config.initialValue;
    let totalDividends = 0;
    
    // Track shares for each symbol if reinvesting dividends
    const symbolShares: { [symbol: string]: number } = {};
    const totalDividendsReceived: { [symbol: string]: number } = {};
    const lastDividendPayment: { [symbol: string]: number } = {};
    
    // Initialize shares based on initial allocation
    portfolio.allocations.forEach(allocation => {
      const symbolData = historicalData[allocation.symbol];
      if (symbolData && symbolData.timestamps.length > 0) {
        // Find the starting price
        const startIndex = symbolData.timestamps.findIndex(t => t >= startTime);
        if (startIndex >= 0) {
          const startPrice = symbolData.prices[startIndex];
          const allocationValue = currentValue * (allocation.allocation / 100);
          symbolShares[allocation.symbol] = allocationValue / startPrice;
          totalDividendsReceived[allocation.symbol] = 0;
          lastDividendPayment[allocation.symbol] = 0;
        }
      }
    });
    
    // Get all timestamps in the range and sort them
    const allTimestamps = new Set<number>();
    Object.values(historicalData).forEach(data => {
      data.timestamps.forEach(timestamp => {
        if (timestamp >= startTime && timestamp <= endTime) {
          allTimestamps.add(timestamp);
        }
      });
    });
    
    const sortedTimestamps = Array.from(allTimestamps).sort((a, b) => a - b);
    
    for (const timestamp of sortedTimestamps) {
      let portfolioValueAtTime = 0;
      
      // Calculate portfolio value at this timestamp
      portfolio.allocations.forEach(allocation => {
        const symbolData = historicalData[allocation.symbol];
        if (symbolData) {
          const priceIndex = symbolData.timestamps.findIndex(t => t >= timestamp);
          if (priceIndex >= 0) {
            const price = symbolData.prices[priceIndex];
            
            if (config.reinvestDividends && symbolShares[allocation.symbol]) {
              // Use actual shares owned
              portfolioValueAtTime += symbolShares[allocation.symbol] * price;
            } else {
              // Use percentage allocation
              const allocationValue = currentValue * (allocation.allocation / 100);
              portfolioValueAtTime += allocationValue * (price / symbolData.prices[0]);
            }
          }
        }
      });
      
      // Handle dividends at this timestamp
      if (config.reinvestDividends) {
        portfolio.allocations.forEach(allocation => {
          const symbolData = historicalData[allocation.symbol];
          if (symbolData && symbolShares[allocation.symbol]) {
            // Check for dividends on this date
            const dividendsOnThisDate = symbolData.dividends.filter(div => 
              Math.abs(div.date - timestamp) < 86400 // Within 1 day
            );
            
            dividendsOnThisDate.forEach(dividend => {
              const priceIndex = symbolData.timestamps.findIndex(t => t >= timestamp);
              if (priceIndex >= 0) {
                const price = symbolData.prices[priceIndex];
                const dividendAmount = symbolShares[allocation.symbol] * dividend.amount;
                const additionalShares = dividendAmount / price;
                symbolShares[allocation.symbol] += additionalShares;
                totalDividends += dividendAmount;
                totalDividendsReceived[allocation.symbol] += dividendAmount;
                lastDividendPayment[allocation.symbol] = dividend.amount;
              }
            });
          }
        });
      } else {
        // For non-reinvestment, just track dividend payments
        portfolio.allocations.forEach(allocation => {
          const symbolData = historicalData[allocation.symbol];
          if (symbolData) {
            const dividendsOnThisDate = symbolData.dividends.filter(div => 
              Math.abs(div.date - timestamp) < 86400
            );
            
            dividendsOnThisDate.forEach(dividend => {
              const allocationValue = currentValue * (allocation.allocation / 100);
              const priceIndex = symbolData.timestamps.findIndex(t => t >= timestamp);
              if (priceIndex >= 0) {
                const price = symbolData.prices[priceIndex];
                const shares = allocationValue / price;
                const dividendAmount = shares * dividend.amount;
                totalDividends += dividendAmount;
                totalDividendsReceived[allocation.symbol] = (totalDividendsReceived[allocation.symbol] || 0) + dividendAmount;
                lastDividendPayment[allocation.symbol] = dividend.amount;
              }
            });
          }
        });
      }
      
      if (config.reinvestDividends) {
        currentValue = portfolioValueAtTime;
      }
      
      portfolioValue.push({ time: timestamp, value: currentValue });
    }
    
    // Calculate statistics
    const endingValue = currentValue;
    const totalReturn = (endingValue - config.initialValue) / config.initialValue;
    const years = (endTime - startTime) / (365.25 * 24 * 60 * 60);
    const cagr = Math.pow(endingValue / config.initialValue, 1 / years) - 1;
    
    // Calculate max drawdown
    let maxDrawdown = 0;
    let peak = config.initialValue;
    portfolioValue.forEach(point => {
      if (point.value > peak) {
        peak = point.value;
      }
      const drawdown = (peak - point.value) / peak;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    });
    
    // Calculate volatility (simplified)
    const returns = portfolioValue.slice(1).map((point, i) => 
      (point.value - portfolioValue[i].value) / portfolioValue[i].value
    );
    const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const volatility = Math.sqrt(variance * 252); // Annualized
    
    const sharpeRatio = volatility > 0 ? (cagr - 0.02) / volatility : 0; // Assuming 2% risk-free rate
    
    // Calculate estimated annual dividends
    const estimatedAnnualDividend: { [symbol: string]: number } = {};
    portfolio.allocations.forEach(allocation => {
      const shares = symbolShares[allocation.symbol] || 0;
      const lastDividend = lastDividendPayment[allocation.symbol] || 0;
      // Estimate quarterly dividends (multiply by 4)
      estimatedAnnualDividend[allocation.symbol] = shares * lastDividend * 4;
    });
    
    return {
      portfolioId: portfolio.id,
      portfolioName: portfolio.name,
      portfolioValue,
      statistics: {
        endingValue,
        cagr,
        maxDrawdown,
        volatility,
        sharpeRatio,
        totalReturn,
        totalDividends
      },
      yearlyReturns: [], // Simplified for now
      detailedMetrics: {
        totalShares: symbolShares,
        totalDividendsReceived,
        estimatedAnnualDividend,
        lastDividendPayment
      }
    };
  };

  // Run backtest
  const runBacktest = async () => {
    if (portfolios.length === 0) return;
    
    setIsBacktesting(true);
    setResults(null);
    
    try {
      const symbols = getAllSymbols();
      const historicalData = await fetchAllData(symbols);
      
      // Determine actual date range using corrected logic
      const { latestStartDate, earliestEndDate } = determineActualDates(historicalData);
      
      // Use config dates if provided, otherwise use data-determined dates
      const actualStartDate = config.startDate 
        ? new Date(config.startDate).getTime() / 1000 
        : latestStartDate; // Use latest start date (when all tickers have data)
      const actualEndDate = config.endDate 
        ? new Date(config.endDate).getTime() / 1000 
        : earliestEndDate; // Use earliest end date (when all tickers still have data)
      
      // Simulate all portfolios
      const portfolioResults = portfolios.map(portfolio => 
        simulatePortfolio(portfolio, historicalData, actualStartDate, actualEndDate)
      );
      
      setResults({
        portfolios: portfolioResults,
        actualStartDate: new Date(actualStartDate * 1000).toISOString().split('T')[0],
        actualEndDate: new Date(actualEndDate * 1000).toISOString().split('T')[0]
      });

      const symbolPriceSeries: { [symbol: string]: { time: number; value: number }[] } = {};
      Object.entries(historicalData).forEach(([symbol, data]) => {
        symbolPriceSeries[symbol] = data.timestamps.map((t, i) => ({
          time: t,
          value: data.prices[i],
        }));
      });
      setPriceChartData(symbolPriceSeries);
      
    } catch (error) {
      console.error('Backtest failed:', error);
    } finally {
      setIsBacktesting(false);
      setFetchProgress({ current: 0, total: 0, symbol: '' });
    }
  };

  // Toggle portfolio visibility in chart
  const togglePortfolioVisibility = (portfolioId: string) => {
    const newSelected = new Set(selectedPortfolios);
    if (newSelected.has(portfolioId)) {
      newSelected.delete(portfolioId);
    } else {
      newSelected.add(portfolioId);
    }
    setSelectedPortfolios(newSelected);
  };

  // Initialize selected symbols for price chart when priceChartData changes
  useEffect(() => {
    if (priceChartData && Object.keys(priceChartData).length > 0) {
      setSelectedSymbols(new Set(Object.keys(priceChartData)));
    }
  }, [priceChartData]);

  // Create performance chart
  useEffect(() => {
    if (!results || !chartContainerRef.current) return;
    if (!results || !chartContainerTwo.current) return;

    // Clean up previous chart
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    // Clean up price chart
    if (chartRefTwo.current) {
      chartRefTwo.current.remove();
      chartRefTwo.current = null;
    }

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#64748B',
      },
      width: chartContainerRef.current.clientWidth,
      height: 400,
      grid: {
        vertLines: { color: 'rgba(100, 116, 139, 0.1)' },
        horzLines: { color: 'rgba(100, 116, 139, 0.1)' },
      },
      rightPriceScale: {
        borderColor: '#E2E8F0',
      },
      timeScale: {
        borderColor: '#E2E8F0',
        timeVisible: false,
      },
    });

    const priceChart = createChart(chartContainerTwo.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#64748B',
      },
      width: chartContainerTwo.current.clientWidth,
      height: 400,
      grid: {
        vertLines: { color: 'rgba(100, 116, 139, 0.1)' },
        horzLines: { color: 'rgba(100, 116, 139, 0.1)' },
      },
      rightPriceScale: {
        borderColor: '#E2E8F0',
      },
      timeScale: {
        borderColor: '#E2E8F0',
        timeVisible: false,
      },
    })

    const seriesMap = new Map();

    // Add a line series for each portfolio
    results.portfolios.forEach((portfolioResult, index) => {
      if (selectedPortfolios.has(portfolioResult.portfolioId)) {
        const color = PORTFOLIO_COLORS[index % PORTFOLIO_COLORS.length];
        const lineSeries = chart.addSeries(LineSeries, {
          color,
          lineWidth: 2,
          title: portfolioResult.portfolioName,
        });

        lineSeries.setData(portfolioResult.portfolioValue);
        seriesMap.set(portfolioResult.portfolioId, lineSeries);
      }
    });
    
    chart.timeScale().fitContent();
    chartRef.current = chart;
    
    // Price Chart
    chartRefTwo.current = priceChart;

    // Stock price chart legend values
    const stockSeriesMap = new Map();
    let idx = 0;
    Object.entries(priceChartData).forEach(([symbol, seriesData]) => {
      if (selectedSymbols.has(symbol)) {
        const color = PORTFOLIO_COLORS[idx % PORTFOLIO_COLORS.length];
        const lineSeries = priceChart.addSeries(LineSeries, {
          color,
          lineWidth: 2,
          title: symbol,
        });
        lineSeries.setData(seriesData);
        stockSeriesMap.set(symbol, lineSeries);
      }
      idx++;
    });
    priceChart.timeScale().fitContent();

    // Subscribe to crosshair move for legend updates
    chart.subscribeCrosshairMove(param => {
      if (!param.time || param.point.x < 0 || param.point.y < 0) {
        const defaultValues: { [portfolioId: string]: string } = {};
        results.portfolios.forEach(p => {
          defaultValues[p.portfolioId] = '-';
        });
        setLegendValues(defaultValues);
        return;
      }

      const newLegendValues: { [portfolioId: string]: string } = {};
      results.portfolios.forEach(portfolioResult => {
        const series = seriesMap.get(portfolioResult.portfolioId);
        if (series && selectedPortfolios.has(portfolioResult.portfolioId)) {
          const value = param.seriesData.get(series);
          if (value && typeof value.value === 'number') {
            newLegendValues[portfolioResult.portfolioId] = formatCurrency(value.value);
          } else {
            newLegendValues[portfolioResult.portfolioId] = '-';
          }
        } else {
          newLegendValues[portfolioResult.portfolioId] = '-';
        }
      });
      setLegendValues(newLegendValues);
    });

    // Subscribe to crosshair move for stock legend updates
    priceChart.subscribeCrosshairMove(param => {
      if (!param.time || param.point.x < 0 || param.point.y < 0) {
        const defaultValues: { [symbol: string]: string } = {};
        Object.keys(priceChartData).forEach(symbol => {
          defaultValues[symbol] = '-';
        });
        setStockLegendValues(defaultValues);
        return;
      }
      const newLegendValues: { [symbol: string]: string } = {};
      Object.keys(priceChartData).forEach((symbol, idx) => {
        if (selectedSymbols.has(symbol)) {
          const series = stockSeriesMap.get(symbol);
          const value = param.seriesData.get(series);
          if (value && typeof value.value === 'number') {
            newLegendValues[symbol] = formatCurrency(value.value);
          } else {
            newLegendValues[symbol] = '-';
          }
        } else {
          newLegendValues[symbol] = '-';
        }
      });
      setStockLegendValues(newLegendValues);
    });

    // Handle resize
    const resizeObserver = new ResizeObserver(entries => {
      if (entries.length === 0 || !entries[0].contentRect) return;
      const { width } = entries[0].contentRect;
      chart.applyOptions({ width });
      priceChart.applyOptions({ width });
    });

    resizeObserver.observe(chartContainerRef.current);
    resizeObserver.observe(chartContainerTwo.current);

    return () => {
      resizeObserver.disconnect();
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
      if (chartRefTwo.current) {
        chartRefTwo.current.remove();
        chartRefTwo.current = null;
      }
    };
  }, [results, selectedPortfolios, priceChartData, selectedSymbols]);

  // Toggle symbol visibility in price chart
  const toggleSymbolVisibility = (symbol: string) => {
    setSelectedSymbols(prev => {
      const newSet = new Set(prev);
      if (newSet.has(symbol)) {
        newSet.delete(symbol);
      } else {
        newSet.add(symbol);
      }
      return newSet;
    });
  };

  const formatLargeNumber = (value: number): string => {
    const absValue = Math.abs(value);
    const sign = value < 0 ? '-' : '';
    
    if (absValue >= 1e12) {
      return `${sign}$${(absValue / 1e12).toFixed(1)}T`;
    } else if (absValue >= 1e9) {
      return `${sign}$${(absValue / 1e9).toFixed(1)}B`;
    } else if (absValue >= 1e6) {
      return `${sign}$${(absValue / 1e6).toFixed(1)}M`;
    } else if (absValue >= 1e3) {
      return `${sign}$${(absValue / 1e3).toFixed(1)}K`;
    }
    
    return formatCurrency(value);
  };

  return (
    <div className="max-w-full mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-3">
            <TrendingUp className="h-8 w-8 text-primary" />
            Backtesting
          </h1>
        </div>
        <p className="text-slate-600 dark:text-slate-400">
          Test your trading strategies against historical data to evaluate performance
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Configuration Panel */}
        <div className="lg:col-span-1 space-y-6">
          {/* Global Parameters */}
          <div className="card">
            <div className="flex items-center gap-3 mb-6">
              <Settings className="h-5 w-5 text-primary" />
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Global Parameters</h2>
            </div> 
            
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Start Date</label>
                  <input
                    type="date"
                    value={config.startDate}
                    onChange={(e) => setConfig({ ...config, startDate: e.target.value })}
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
                    value={config.endDate}
                    onChange={(e) => setConfig({ ...config, endDate: e.target.value })}
                    className="input w-full"
                  />
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Leave blank for when all tickers still have data
                  </p>
                </div>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Starting Value</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-500">$</span>
                    <input
                      type="number"
                      value={config.initialValue}
                      onChange={(e) => setConfig({ ...config, initialValue: Number(e.target.value) })}
                      className="input w-full pl-8"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Cashflow</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-500">$</span>
                    <input
                      type="number"
                      value={config.cashflow}
                      onChange={(e) => setConfig({ ...config, cashflow: Number(e.target.value) })}
                      className="input w-full pl-8"
                    />
                  </div>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Cashflow Frequency</label>
                <select
                  value={config.cashflowFrequency}
                  onChange={(e) => setConfig({ ...config, cashflowFrequency: e.target.value as any })}
                  className="input w-full"
                >
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>
                
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={config.reinvestDividends}
                    onChange={(e) => setConfig({ ...config, reinvestDividends: e.target.checked })}
                    className="form-checkbox h-4 w-4 text-primary rounded"
                  />
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">Reinvest dividends (Total Return)</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      Include dividend reinvestment for total return calculation
                    </span>
                  </div>
                </label>
              </div>
            </div>
          </div>

          {/* Portfolios */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Portfolios</h2>
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
                  <div className="flex items-center justify-between mb-3">
                    <input
                      type="text"
                      value={portfolio.name}
                      onChange={(e) => {
                        setPortfolios(portfolios.map(p => 
                          p.id === portfolio.id ? { ...p, name: e.target.value } : p
                        ));
                      }}
                      className="input flex-1 mr-2"
                    />
                    {portfolios.length > 1 && (
                      <button
                        onClick={() => removePortfolio(portfolio.id)}
                        className="p-1 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    {portfolio.allocations.map((allocation, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={allocation.symbol}
                          onChange={(e) => updateAllocation(portfolio.id, index, 'symbol', e.target.value.toUpperCase())}
                          className="input flex-1"
                          placeholder="Symbol"
                        />
                        <div className="relative">
                          <input
                            type="number"
                            value={allocation.allocation}
                            onChange={(e) => updateAllocation(portfolio.id, index, 'allocation', e.target.value)}
                            className="input w-20 pr-6"
                            min="0"
                            max="100"
                          />
                          <span className="absolute right-2 top-1/2 transform -translate-y-1/2 text-slate-500 text-sm">%</span>
                        </div>
                        {portfolio.allocations.length > 1 && (
                          <button
                            onClick={() => removeAllocation(portfolio.id, index)}
                            className="p-1 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    ))}
                    
                    <div className="flex items-center justify-between pt-2">
                      <button
                        onClick={() => addAllocation(portfolio.id)}
                        className="text-sm text-primary hover:text-primary-dark flex items-center gap-1"
                      >
                        <Plus size={14} />
                        Add Asset
                      </button>
                      <div className={`text-sm font-medium ${
                        getTotalAllocation(portfolio.id) === 100 ? 'text-green-600' : 'text-orange-600'
                      }`}>
                        Total: {getTotalAllocation(portfolio.id)}%
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Run Backtest Button */}
          <button
            onClick={runBacktest}
            disabled={isBacktesting || portfolios.some(p => getTotalAllocation(p.id) !== 100)}
            className="btn btn-primary w-full flex items-center justify-center gap-2 py-3 text-lg"
          >
            {isBacktesting ? (
              <>
                <Loader className="animate-spin\" size={20} />
                Backtesting...
              </>
            ) : (
              <>
                <Play size={20} />
                BACKTEST
              </>
            )}
          </button>

          {/* Fetch Progress */}
          {isBacktesting && fetchProgress.total > 0 && (
            <div className="card">
              <div className="text-sm text-slate-600 dark:text-slate-400 mb-1">
                Fetching data: {fetchProgress.current} of {fetchProgress.total}
              </div>
              <div className="text-sm font-medium mb-1">{fetchProgress.symbol}</div>
              <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                <div 
                  className="bg-primary h-2 rounded-full transition-all duration-300"
                  style={{ width: `${(fetchProgress.current / fetchProgress.total) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Results Panel */}
        <div className="lg:col-span-2">
          {results ? (
            <div className="space-y-6">
              {/* Results Header with Date Range and Return Type */}
              <div className="card">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold">Results ({results.portfolios.length} Portfolio{results.portfolios.length !== 1 ? 's' : ''})</h2>
                  <div className="flex items-center gap-4 text-sm">
                    <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                      <Calendar className="h-4 w-4" />
                      <span>
                        {results.actualStartDate} - {results.actualEndDate}
                      </span>
                    </div>
                    <div className={`px-2 py-1 rounded-md text-xs font-medium ${
                      config.reinvestDividends 
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                        : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    }`}>
                      {config.reinvestDividends ? 'Total Return' : 'Price Return'}
                    </div>
                  </div>
                </div>
                {(!config.startDate || !config.endDate) && (
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
                    {!config.startDate && !config.endDate 
                      ? 'Using optimal date range where all tickers have complete data'
                      : !config.startDate 
                        ? 'Start date: when all tickers have data available'
                        : 'End date: when all tickers still have data available'
                    }
                  </p>
                )}
              </div>

              {/* Portfolio Statistics Table */}
              <div className="card">
                <div className="flex items-center gap-2 mb-4">
                  <BarChart3 className="h-5 w-5 text-primary" />
                  <h3 className="text-lg font-semibold">Portfolio Comparison</h3>
                </div>
                
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-700">
                        <th className="text-left py-3 px-2 font-medium text-slate-600 dark:text-slate-400">Portfolio</th>
                        <th className="text-right py-3 px-2 font-medium text-slate-600 dark:text-slate-400">Ending Value</th>
                        <th className="text-right py-3 px-2 font-medium text-slate-600 dark:text-slate-400">CAGR</th>
                        <th className="text-right py-3 px-2 font-medium text-slate-600 dark:text-slate-400">Max Drawdown</th>
                        <th className="text-right py-3 px-2 font-medium text-slate-600 dark:text-slate-400">Volatility</th>
                        <th className="text-right py-3 px-2 font-medium text-slate-600 dark:text-slate-400">Sharpe</th>
                        {!config.reinvestDividends && (
                          <th className="text-right py-3 px-2 font-medium text-slate-600 dark:text-slate-400">Dividends</th>
                        )}
                        <th className="text-center py-3 px-2 font-medium text-slate-600 dark:text-slate-400">Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.portfolios.map((portfolio, index) => (
                        <React.Fragment key={portfolio.portfolioId}>
                          <tr 
                            className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer"
                            onClick={() => setExpandedPortfolio(expandedPortfolio === portfolio.portfolioId ? null : portfolio.portfolioId)}
                          >
                            <td className="py-3 px-2">
                              <div className="flex items-center gap-2">
                                <div 
                                  className="w-3 h-3 rounded-full"
                                  style={{ backgroundColor: PORTFOLIO_COLORS[index % PORTFOLIO_COLORS.length] }}
                                />
                                <span className="font-medium">{portfolio.portfolioName}</span>
                              </div>
                            </td>
                            <td className="py-3 px-2 text-right">
                              <ValueWithTooltip
                                value={portfolio.statistics.endingValue}
                                displayValue={formatLargeNumber(portfolio.statistics.endingValue)}
                                className="font-medium"
                              />
                            </td>
                            <td className="py-3 px-2 text-right">
                              <span className={`font-medium ${
                                portfolio.statistics.cagr >= 0 ? 'text-green-600' : 'text-red-600'
                              }`}>
                                {(portfolio.statistics.cagr * 100).toFixed(2)}%
                              </span>
                            </td>
                            <td className="py-3 px-2 text-right">
                              <span className="font-medium text-red-600">
                                -{(portfolio.statistics.maxDrawdown * 100).toFixed(2)}%
                              </span>
                            </td>
                            <td className="py-3 px-2 text-right">
                              <span className="font-medium">
                                {(portfolio.statistics.volatility * 100).toFixed(2)}%
                              </span>
                            </td>
                            <td className="py-3 px-2 text-right">
                              <span className="font-medium">
                                {portfolio.statistics.sharpeRatio.toFixed(2)}
                              </span>
                            </td>
                            {!config.reinvestDividends && (
                              <td className="py-3 px-2 text-right">
                                <ValueWithTooltip
                                  value={portfolio.statistics.totalDividends}
                                  displayValue={formatLargeNumber(portfolio.statistics.totalDividends)}
                                  className="font-medium text-green-600"
                                />
                              </td>
                            )}
                            <td className="py-3 px-2 text-center">
                              <button className="p-1 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-full transition-colors">
                                {expandedPortfolio === portfolio.portfolioId ? (
                                  <ChevronUp size={16} />
                                ) : (
                                  <ChevronDown size={16} />
                                )}
                              </button>
                            </td>
                          </tr>
                          
                          {/* Detailed View */}
                          {expandedPortfolio === portfolio.portfolioId && (
                            <tr>
                              <td colSpan={config.reinvestDividends ? 7 : 8} className="py-4 px-2 bg-slate-50 dark:bg-slate-700/30">
                                <div className="space-y-4">
                                  <h4 className="font-semibold text-lg mb-3 flex items-center gap-2">
                                    <Activity className="h-5 w-5 text-primary" />
                                    Detailed Portfolio Metrics
                                  </h4>
                                  
                                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                    {/* Total Portfolio Value */}
                                    <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-600">
                                      <div className="flex items-center gap-2 mb-2">
                                        <DollarSign className="h-4 w-4 text-blue-500" />
                                        <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Total Value</span>
                                      </div>
                                      <ValueWithTooltip
                                        value={portfolio.statistics.endingValue}
                                        displayValue={formatLargeNumber(portfolio.statistics.endingValue)}
                                        className="text-xl font-bold text-blue-600"
                                      />
                                    </div>
                                    
                                    {/* Total Shares */}
                                    <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-600">
                                      <div className="flex items-center gap-2 mb-2">
                                        <Shares className="h-4 w-4 text-purple-500" />
                                        <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Total Shares</span>
                                      </div>
                                      <div className="space-y-1">
                                        {Object.entries(portfolio.detailedMetrics.totalShares).map(([symbol, shares]) => (
                                          <div key={symbol} className="flex justify-between text-sm">
                                            <span className="font-medium">{symbol}:</span>
                                            <span>{shares.toFixed(2)}</span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                    
                                    {/* Dividends Received */}
                                    <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-600">
                                      <div className="flex items-center gap-2 mb-2">
                                        <HandCoins className="h-4 w-4 text-green-500" />
                                        <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Dividends Received</span>
                                      </div>
                                      <div className="space-y-1">
                                        {Object.entries(portfolio.detailedMetrics.totalDividendsReceived).map(([symbol, dividends]) => (
                                          <div key={symbol} className="flex justify-between text-sm">
                                            <span className="font-medium">{symbol}:</span>
                                            <ValueWithTooltip
                                              value={dividends}
                                              displayValue={formatLargeNumber(dividends)}
                                              className="text-green-600 font-medium"
                                            />
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                    
                                    {/* Estimated Annual Dividend */}
                                    <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-600">
                                      <div className="flex items-center gap-2 mb-2">
                                        <Target className="h-4 w-4 text-orange-500" />
                                        <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Est. Annual Dividend</span>
                                      </div>
                                      <div className="space-y-1">
                                        {Object.entries(portfolio.detailedMetrics.estimatedAnnualDividend).map(([symbol, estimated]) => (
                                          <div key={symbol} className="flex justify-between text-sm">
                                            <span className="font-medium">{symbol}:</span>
                                            <ValueWithTooltip
                                              value={estimated}
                                              displayValue={formatLargeNumber(estimated)}
                                              className="text-orange-600 font-medium"
                                            />
                                          </div>
                                        ))}
                                      </div>
                                      <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-600">
                                        <div className="flex justify-between text-sm font-semibold">
                                          <span>Total:</span>
                                          <ValueWithTooltip
                                            value={Object.values(portfolio.detailedMetrics.estimatedAnnualDividend).reduce((sum, val) => sum + val, 0)}
                                            displayValue={formatLargeNumber(Object.values(portfolio.detailedMetrics.estimatedAnnualDividend).reduce((sum, val) => sum + val, 0))}
                                            className="text-orange-600"
                                          />
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                  
                                  {/* Last Dividend Payments */}
                                  <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-600">
                                    <h5 className="font-medium mb-3 flex items-center gap-2">
                                      <HandCoins className="h-4 w-4 text-yellow-500" />
                                      Last Dividend Payments (Per Share)
                                    </h5>
                                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                                      {Object.entries(portfolio.detailedMetrics.lastDividendPayment).map(([symbol, lastDividend]) => (
                                        <div key={symbol} className="flex justify-between items-center p-2 bg-slate-50 dark:bg-slate-700 rounded">
                                          <span className="font-medium text-sm">{symbol}:</span>
                                          <span className="text-sm text-yellow-600 font-medium">
                                            {lastDividend > 0 ? formatCurrency(lastDividend) : 'N/A'}
                                          </span>
                                        </div>
                                      ))}
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

              {/* Performance Chart */}
              <div className="card">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">Performance Comparison</h3>
                  <div className="flex items-center gap-4 text-sm">
                    <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                      <Calendar className="h-4 w-4" />
                      <span>
                        {results.actualStartDate} - {results.actualEndDate}
                      </span>
                    </div>
                    <div className={`px-2 py-1 rounded-md text-xs font-medium ${
                      config.reinvestDividends 
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                        : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    }`}>
                      {config.reinvestDividends ? 'Total Return' : 'Price Return'}
                    </div>
                  </div>
                </div>
                
                {/* Portfolio Toggle Controls */}
                <div className="mb-4 flex flex-wrap gap-2">
                  {results.portfolios.map((portfolio, index) => (
                    <button
                      key={portfolio.portfolioId}
                      onClick={() => togglePortfolioVisibility(portfolio.portfolioId)}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                        selectedPortfolios.has(portfolio.portfolioId)
                          ? 'bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      <div 
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: PORTFOLIO_COLORS[index % PORTFOLIO_COLORS.length] }}
                      />
                      {portfolio.portfolioName}
                    </button>
                  ))}
                </div>
                
                {/* Chart Legend */}
                <div className="mb-3 p-3 bg-white/90 dark:bg-slate-800/90 rounded-md shadow-sm border border-slate-200 dark:border-slate-700">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {results.portfolios.map((portfolio, index) => (
                      selectedPortfolios.has(portfolio.portfolioId) && (
                        <div key={portfolio.portfolioId} className="flex items-center gap-2">
                          <div 
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: PORTFOLIO_COLORS[index % PORTFOLIO_COLORS.length] }}
                          />
                          <span className="text-sm font-mono text-slate-700 dark:text-slate-300">
                            {portfolio.portfolioName}: {legendValues[portfolio.portfolioId] || '-'}
                          </span>
                        </div>
                      )
                    ))}
                  </div>
                </div>
                
                <div ref={chartContainerRef} className="w-full h-[400px]" />
              </div>
              <div className="card">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">Stock Comparison</h3>
                  <div className="flex items-center gap-4 text-sm">
                    <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                      <Calendar className="h-4 w-4" />
                      <span>
                        {results.actualStartDate} - {results.actualEndDate}
                      </span>
                    </div>
                  </div>
                </div>
                {}
                {/* Stock Toggle Controls */}
                {priceChartData && Object.keys(priceChartData).length > 0 && (
                  <div className="mb-4 flex flex-wrap gap-2">
                    {Object.keys(priceChartData).map((symbol, idx) => (
                      <button
                        key={symbol}
                        onClick={() => toggleSymbolVisibility(symbol)}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors
                          ${selectedSymbols.has(symbol)
                            ? 'bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                        }`}
                        style={{ minWidth: 80 }}
                        aria-pressed={selectedSymbols.has(symbol)}
                      >
                        <div 
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: PORTFOLIO_COLORS[idx % PORTFOLIO_COLORS.length] }}
                        />
                        {symbol}
                      </button>
                    ))}
                  </div>
                )}
                {/* Stock Chart Legend */}
                {priceChartData && Object.keys(priceChartData).length > 0 && (
                  <div className="mb-3 p-3 bg-white/90 dark:bg-slate-800/90 rounded-md shadow-sm border border-slate-200 dark:border-slate-700">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {Object.keys(priceChartData).map((symbol, idx) => (
                        selectedSymbols.has(symbol) && (
                          <div key={symbol} className="flex items-center gap-2">
                            <div 
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: PORTFOLIO_COLORS[idx % PORTFOLIO_COLORS.length] }}
                            />
                            <span className="text-sm font-mono text-slate-700 dark:text-slate-300">
                              {symbol}: {stockLegendValues[symbol] || '-'}
                            </span>
                          </div>
                        )
                      ))}
                    </div>
                  </div>
                )}
                <div ref={chartContainerTwo} className="h-[400px]" />
              </div>
              
            </div>
          ) : (
            <div className="card">
              <div className="flex items-center justify-center h-64 bg-slate-50 dark:bg-slate-700/50 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-600">
                <div className="text-center">
                  <BarChart3 className="h-12 w-12 text-slate-400 mx-auto mb-3" />
                  <p className="text-slate-600 dark:text-slate-400 text-lg font-medium">
                    Configure your portfolios and run a backtest
                  </p>
                  <p className="text-slate-500 dark:text-slate-500 text-sm mt-2">
                    Results and performance charts will appear here
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
  );
};

export default BacktestingView;