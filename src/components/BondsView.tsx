import React, { useEffect, useState, useRef } from 'react';
import { createChart, ISeriesApi, LineSeries, ColorType, CrosshairMode, createYieldCurveChart } from 'lightweight-charts';
import { fetchBondOrderBook, fetchBillOrderBook, fetchQuickBondData, fetchBondData } from '../utils/api';
import { TreasuryBondOrderBook, TreasuryBillsOrderBook } from '../types/index';

interface BondItem {
  shortName: string;
  last: string;
  change: string;
  change_pct: string;
  maturityDate: string;
}

type OutputData = {
    time: number;
    value: number;
};

type YieldData = {
    symbol: string;
    yield: string;
};

function convertYieldData(data: YieldData[]): OutputData[] {
    return data.map(item => {
        // Extract the numeric part and the unit (MO or YR) from the symbol
        // Updated regex to handle "US 1-MO", "US 3-YR" format
        const symbolMatch = item.symbol.match(/US\s+(\d+)-?(MO|YR)/);
        if (!symbolMatch) {
            console.warn(`Could not parse symbol: ${item.symbol}. Skipping this item.`);
            return null;
        }
      
        const value = parseInt(symbolMatch[1]);
        const unit = symbolMatch[2];

        let months: number;
        if (unit === 'MO') {
            months = value;
        } else if (unit === 'YR') {
            months = value * 12;
        } else {
            console.warn(`Unknown unit in symbol: ${item.symbol}. Skipping this item.`);
            return null;
        }

        // Clean and convert the yield string to a number
        const yieldValue = parseFloat(item.yield.replace('%', ''));

        return {
            time: months,
            value: yieldValue
        };
    }).filter(item => item !== null) as OutputData[];
}

export default function BondView() {
  const [bondData, setBondData] = useState<BondItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [bondOrderBook, setBondOrderBook] = useState<TreasuryBondOrderBook[]>([]);
  const [billOrderBook, setBillOrderBook] = useState<TreasuryBillsOrderBook[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'quotes' | 'charts' | 'yield-curve'>('overview');
  const [quoteTab, setQuoteTab] = useState<'bonds' | 'bills'>('bonds');
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const [chartLoaded, setChartLoaded] = useState(false);
  const [chartData, setChartData] = useState<Record<string, { time: number; value: number }[]>>({});  
  const yieldCurveChart = useRef<HTMLDivElement | null>(null);
  const [yieldChartLoaded, setYieldChartLoaded] = useState(false);
  const [yieldChartData, setYieldChartData] = useState<OutputData[]>([]);
  
  // New state for chart selection
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>(['US10Y', 'US2Y']);
  const [availableSymbols] = useState([
    'US1M', 'US2M', 'US3M', 'US4M', 'US6M',
    'US1Y', 'US2Y', 'US3Y', 'US5Y', 'US7Y',
    'US10Y', 'US20Y', 'US30Y'
  ]);

  // Chart colors for legend
  const chartColors = [
    '#2962FF', '#FF6D00', '#D50000', '#00C853', '#AA00FF',
    '#0091EA', '#C51162', '#FFD600', '#6200EA', '#00BFA5',
    '#FF4081', '#3D5AFE', '#FFAB00'
  ];

  useEffect(() => {
    const storedDarkMode = localStorage.getItem('darkMode');
    setIsDarkMode(storedDarkMode === 'true');

    const getBondData = async () => {
      try {
        setLoading(true);
        const quickData = await fetchQuickBondData();
        setBondData(quickData.data);
        
        // Create yield data from the bond data
        const yieldData: YieldData[] = quickData.data.map(bond => ({
          symbol: bond.shortName, // Assuming shortName contains the symbol like "US 1-MO", "US 2-YR", etc.
          yield: bond.last
        }));
        
        const convertedData = convertYieldData(yieldData);
        setYieldChartData(convertedData);

        const bondBook = await fetchBondOrderBook();
        setBondOrderBook(bondBook.notes);

        const billBook = await fetchBillOrderBook();
        setBillOrderBook(billBook.bills);
      } catch (err) {
        setError('Failed to fetch bond data.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    getBondData();
  }, []);

    // Fetch bond data
  useEffect(() => {
    if (activeTab !== 'charts' || chartLoaded) return;
  
    const loadChartData = async () => {
      try {
        const allData: Record<string, { time: number; value: number }[]> = {};
        
        // Only load data for selected symbols
        for (const symbol of selectedSymbols) {
          const response = await fetchBondData(symbol, 'ALL');
          const seriesData = response.symbol.priceBars.map((item: any) => ({
            value: Number(item.close),
            time: Number(item.tradeTimeinMills) / 1000
          })).slice(0, -1);
          allData[symbol] = seriesData;
    
          // API timeout for 0.5 seconds
          await new Promise(resolve => setTimeout(resolve, 500));
        }
    
        setChartData(allData);
        setChartLoaded(true);
      } catch (err) {
        console.error('Error loading chart data:', err);
      }
    };
  
    loadChartData();
  }, [activeTab, selectedSymbols]); // Added selectedSymbols as dependency

  // Initialize yield curve chart
  useEffect(() => {
    if (!yieldCurveChart.current || yieldChartData.length === 0 || activeTab !== 'yield-curve') return;

    const chart = createYieldCurveChart(yieldCurveChart.current, {
      width: yieldCurveChart.current.clientWidth,
      height: 400,
      layout: {
        background: { type: ColorType.Solid, color: isDarkMode ? '#1f2937' : '#ffffff' },
        textColor: isDarkMode ? '#cbd5e1' : '#111827',
      },
      grid: {
        vertLines: { color: isDarkMode ? '#374151' : '#e5e7eb' },
        horzLines: { color: isDarkMode ? '#374151' : '#e5e7eb' },
      },
      handleScroll: false, 
      handleScale: false,
    });

    const lineSeries = chart.addSeries(LineSeries, {
      color: '#2962FF',
      lineWidth: 3,
      priceFormat: {
        type: 'number',
        precision: 3,
        minMove: 1 / Math.pow(10, 3),
      },
    });

    // Sort data by time (months) to ensure proper curve
    const sortedData = [...yieldChartData].sort((a, b) => a.time - b.time);
    lineSeries.setData(sortedData);

    chart.timeScale().fitContent();

    const handleResize = () => {
      chart.resize(yieldCurveChart.current!.clientWidth, 400);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      chart.remove();
      window.removeEventListener('resize', handleResize);
    };
  }, [yieldChartData, isDarkMode, activeTab]);

  // Initialize charts
  useEffect(() => {
    if (!chartContainerRef.current || Object.keys(chartData).length === 0) return;
  
    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 400,
      layout: {
        background: { color: isDarkMode ? '#1f2937' : '#ffffff' },
        textColor: isDarkMode ? '#cbd5e1' : '#111827',
      },
      grid: {
        vertLines: { color: isDarkMode ? '#374151' : '#e5e7eb' },
        horzLines: { color: isDarkMode ? '#374151' : '#e5e7eb' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
      },
      priceScale: { borderVisible: false },
      timeScale: { borderVisible: false },
    });
  
    // Only create series for selected symbols
    selectedSymbols.forEach((symbol, idx) => {
      const data = chartData[symbol];
      if (data) {
        const series = chart.addSeries(LineSeries, {
          color: chartColors[idx % chartColors.length],
          lineWidth: 2,
          title: symbol,
          priceFormat: {
            type: 'number',
            precision: 3,
            minMove: 1 / Math.pow(10, 3),
          },
        });
    
        series.setData(data);
      }
    });
  
    const handleResize = () => {
      chart.resize(chartContainerRef.current!.clientWidth, 400);
    };
  
    window.addEventListener('resize', handleResize);
  
    return () => {
      chart.remove();
      window.removeEventListener('resize', handleResize);
    };
  }, [chartData, isDarkMode, selectedSymbols]);

  const containerClass = isDarkMode ? 'dark' : '';

  const handleSymbolToggle = (symbol: string) => {
    setSelectedSymbols(prev => {
      if (prev.includes(symbol)) {
        return prev.filter(s => s !== symbol);
      } else {
        return [...prev, symbol];
      }
    });
    // Reset chart loaded state to trigger reload with new selection
    setChartLoaded(false);
  };

  const selectAllSymbols = () => {
    setSelectedSymbols([...availableSymbols]);
    setChartLoaded(false);
  };

  const clearAllSymbols = () => {
    setSelectedSymbols([]);
    setChartLoaded(false);
  };

  return (
    <div className={containerClass}>
      <div className="p-4 bg-white dark:bg-gray-900 min-h-screen text-gray-900 dark:text-gray-100">
        <h2 className="text-xl font-semibold mb-4">U.S. Treasury Bond Data</h2>

        {/* Tabs */}
        <div className="flex space-x-4 mb-6 border-b border-gray-300 dark:border-gray-700">
          {['overview', 'quotes', 'charts', 'yield-curve'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`px-4 py-2 font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent hover:text-blue-500 dark:hover:text-blue-300'
              }`}
            >
              {tab === 'yield-curve' ? 'Yield Curve' : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {loading && <div className="text-center">Loading bond data...</div>}
        {error && <div className="text-red-500 text-center">{error}</div>}

        {!loading && !error && (
          <>
            {activeTab === 'overview' && (
              <div className="overflow-x-auto">
                <table className="min-w-full table-auto border border-gray-200 dark:border-gray-700">
                  <thead className="bg-gray-100 dark:bg-gray-800">
                    <tr>
                      <th className="px-4 py-2 text-left">Name</th>
                      <th className="px-4 py-2 text-right">Yield (%)</th>
                      <th className="px-4 py-2 text-right">Change</th>
                      <th className="px-4 py-2 text-right">Change (%)</th>
                      <th className="px-4 py-2 text-right">Maturity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bondData.map((item, idx) => (
                      <tr
                        key={idx}
                        className="border-t border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
                      >
                        <td className="px-4 py-2">{item.shortName}</td>
                        <td className="px-4 py-2 text-right">{item.last}</td>
                        <td
                          className={`px-4 py-2 text-right ${
                            item.change.startsWith('-') ? 'text-green-500' : item.change === "UNCH" ? '' : 'text-red-600'
                          }`}
                        >
                          {item.change}
                        </td>
                        <td
                          className={`px-4 py-2 text-right ${
                            item.change_pct.startsWith('-') ? 'text-green-500' : item.change === "UNCH" ? '' : 'text-red-600'
                          }`}
                        >
                          {item.change_pct}
                        </td>
                        <td className="px-4 py-2 text-right">{item.maturity_date || 'N/A'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {activeTab === 'quotes' && (
              <div className="space-y-8">
                <div className="flex space-x-4 mb-4 border-b border-gray-300 dark:border-gray-700">
                  {['bonds', 'bills'].map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setQuoteTab(tab as 'bonds' | 'bills')}
                      className={`px-3 py-1 font-medium border-b-2 text-sm transition-colors ${
                        quoteTab === tab
                          ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                          : 'border-transparent hover:text-blue-500 dark:hover:text-blue-300'
                      }`}
                    >
                      {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    </button>
                  ))}
                </div>
                {quoteTab === 'bonds' && (
                <div>
                  <h3 className="text-lg font-semibold mb-2">Treasury Bonds</h3>
                  <div className="overflow-x-auto">
                    <table className="min-w-full border border-gray-200 dark:border-gray-700 table-auto">
                      <thead className="bg-gray-100 dark:bg-gray-800">
                        <tr>
                          <th className="px-4 py-2 text-left">Maturity</th>
                          <th className="px-4 py-2 text-right">Coupon</th>
                          <th className="px-4 py-2 text-right">Bid</th>
                          <th className="px-4 py-2 text-right">Ask</th>
                          <th className="px-4 py-2 text-right">Ask Yield</th>
                          <th className="px-4 py-2 text-right">Change</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bondOrderBook.map((bond, idx) => (
                          <tr
                            key={idx}
                            className="border-t border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
                          >
                            <td className="px-4 py-2">{bond.maturityDate}</td>
                            <td className="px-4 py-2 text-right">{bond.coupon}</td>
                            <td className="px-4 py-2 text-right text-green-600">{bond.bid}</td>
                            <td className="px-4 py-2 text-right text-red-500">{bond.ask}</td>
                            <td className="px-4 py-2 text-right">{bond.askYield}</td>
                            <td className={`px-4 py-2 text-right ${bond.change > 0 ? 'text-red-600' : bond.change < 0 ? 'text-green-500' : ''}`}>{bond.change === 'unch.' ? '0.0000' : bond.change}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              
              {quoteTab === 'bills' && (
                <div>
                  <h3 className="text-lg font-semibold mb-2">Treasury Bills</h3>
                  <div className="overflow-x-auto">
                    <table className="min-w-full border border-gray-200 dark:border-gray-700 table-auto">
                      <thead className="bg-gray-100 dark:bg-gray-800">
                        <tr>
                          <th className="px-4 py-2 text-left">Maturity</th>
                          <th className="px-4 py-2 text-right">Bid</th>
                          <th className="px-4 py-2 text-right">Ask</th>
                          <th className="px-4 py-2 text-right">Ask Yield</th>
                        </tr>
                      </thead>
                      <tbody>
                        {billOrderBook.map((bill, idx) => (
                          <tr
                            key={idx}
                            className="border-t border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
                          >
                            <td className="px-4 py-2">{bill.maturityDate}</td>
                            <td className="px-4 py-2 text-right text-green-600">{bill.bid}</td>
                            <td className="px-4 py-2 text-right text-red-500">{bill.ask}</td>
                            <td className="px-4 py-2 text-right">{bill.askYield}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              </div>
            )}
            {activeTab === 'charts' && (
              <div className="space-y-4">
                {/* Symbol Selector */}
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold">Select Treasury Securities to Display</h3>
                    <div className="flex gap-2">
                      <button
                        onClick={selectAllSymbols}
                        className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                      >
                        Select All
                      </button>
                      <button
                        onClick={clearAllSymbols}
                        className="px-3 py-1 text-sm bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
                      >
                        Clear All
                      </button>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-3 md:grid-cols-6 lg:grid-cols-13 gap-2">
                    {availableSymbols.map((symbol) => (
                      <label
                        key={symbol}
                        className={`flex items-center justify-center p-2 rounded cursor-pointer transition-colors ${
                          selectedSymbols.includes(symbol)
                            ? 'bg-blue-500 text-white'
                            : 'bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedSymbols.includes(symbol)}
                          onChange={() => handleSymbolToggle(symbol)}
                          className="sr-only"
                        />
                        <span className="text-sm font-medium">{symbol}</span>
                      </label>
                    ))}
                  </div>
                  
                  <div className="mt-3 text-sm text-gray-600 dark:text-gray-400">
                    Selected: {selectedSymbols.length} of {availableSymbols.length} securities
                    {selectedSymbols.length > 0 && (
                      <span className="ml-2">({selectedSymbols.join(', ')})</span>
                    )}
                  </div>
                </div>

                {/* Chart Legend */}
                {selectedSymbols.length > 0 && (
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                    <h4 className="text-sm font-semibold mb-3 text-gray-700 dark:text-gray-300">Chart Legend</h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
                      {selectedSymbols.map((symbol, idx) => (
                        <div key={symbol} className="flex items-center gap-2">
                          <div 
                            className="w-4 h-0.5 rounded"
                            style={{ backgroundColor: chartColors[idx % chartColors.length] }}
                          ></div>
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            {symbol}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Chart */}
                {selectedSymbols.length > 0 ? (
                  <div className="w-full h-full" ref={chartContainerRef}></div>
                ) : (
                  <div className="flex items-center justify-center h-64 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <p className="text-gray-500 dark:text-gray-400">
                      Select one or more treasury securities above to display their charts
                    </p>
                  </div>
                )}
              </div>
            )}
            {activeTab === 'yield-curve' && (
              <div className="space-y-4">
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100 mb-2">
                    US Treasury Yield Curve
                  </h3>
                  <p className="text-sm text-blue-800 dark:text-blue-200">
                    This chart shows the current yield curve for US Treasury securities, plotting yield against maturity in months.
                    The yield curve is a key indicator of economic conditions and interest rate expectations.
                  </p>
                </div>
                <div className="w-full h-[400px]" ref={yieldCurveChart}></div>
                {yieldChartData.length > 0 && (
                  <div className="mt-4 text-sm text-gray-600 dark:text-gray-400">
                    <p>Data points: {yieldChartData.length} treasury securities</p>
                    <p>Maturity range: {Math.min(...yieldChartData.map(d => d.time))} - {Math.max(...yieldChartData.map(d => d.time))} months</p>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}