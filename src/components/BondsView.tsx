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

type InputData = {
    symbol: string;
    yield: string;
};

type OutputData = {
    time: number;
    value: number;
};

function convertYieldData(data: InputData[]): OutputData[] {
    return data.map(item => {
        // Extract the numeric part and the unit (M or Y) from the symbol
        const symbolMatch = item.symbol.match(/US(\d+)([MY])/);
        if (!symbolMatch) {
            console.warn(`Could not parse symbol: ${item.symbol}. Skipping this item.`);
            return null; // Or throw an error, depending on desired error handling
        }

        const value = parseInt(symbolMatch[1]);
        const unit = symbolMatch[2];

        let months: number;
        if (unit === 'M') {
            months = value;
        } else if (unit === 'Y') {
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
    }).filter(item => item !== null) as OutputData[]; // Filter out any skipped items
}

export default function BondView() {
  const [bondData, setBondData] = useState<BondItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [bondOrderBook, setBondOrderBook] = useState<TreasuryBondOrderBook[]>([]);
  const [billOrderBook, setBillOrderBook] = useState<TreasuryBillsOrderBook[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'quotes' | 'charts'>('overview');
  const [quoteTab, setQuoteTab] = useState<'bonds' | 'bills'>('bonds');
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const [chartLoaded, setChartLoaded] = useState(false);
  const [chartData, setChartData] = useState<Record<string, { time: number; value: number }[]>>({});  
  const yieldCurveChart = useRef<HTMLDivElement | null>(null);
  const [yieldChartLoaded, setYieldChartLoaded] = useState(false);
  const [yieldChartData, setYieldChartData] = useState<Record<string, { time: number; value: number }[]>>({});

  useEffect(() => {
    const storedDarkMode = localStorage.getItem('darkMode');
    setIsDarkMode(storedDarkMode === 'true');

    const getBondData = async () => {
      try {
        setLoading(true);
        const quickData = await fetchQuickBondData();
        setBondData(quickData.data);
        setYieldChartData(convertYieldData(quickData.data));
        console.log(yieldChartData)

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
  
    const symbols = [
      'US1M', 'US2M', 'US3M', 'US4M', 'US6M',
      'US1Y', 'US2Y', 'US3Y', 'US5Y', 'US7Y',
      'US10Y', 'US20Y', 'US30Y'
    ];
  
    const loadChartData = async () => {
      try {
        const allData: Record<string, { time: number; value: number }[]> = {};
        const symbols = [
          'US1M', 'US2M', 'US3M', 'US4M', 'US6M',
          'US1Y', 'US2Y', 'US3Y', 'US5Y', 'US7Y',
          'US10Y', 'US20Y', 'US30Y'
        ];
    
        for (const symbol of symbols) {
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
  }, [activeTab, chartLoaded]);


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
  
    const colors = [
      '#2962FF', '#FF6D00', '#D50000', '#00C853', '#AA00FF',
      '#0091EA', '#C51162', '#FFD600', '#6200EA', '#00BFA5',
      '#FF4081', '#3D5AFE', '#FFAB00'
    ];
  
    Object.entries(chartData).forEach(([symbol, data], idx) => {
      const series = chart.addSeries(LineSeries, {
        color: colors[idx % colors.length],
        lineWidth: 2,
        title: symbol,
        priceFormat: {
          type: 'number',
          precision: 3,
          minMove: 1 / Math.pow(10, 3),
        },
      });
  
      series.setData(data);
    });
  
    const handleResize = () => {
      chart.resize(chartContainerRef.current!.clientWidth, 400);
    };
  
    window.addEventListener('resize', handleResize);
  
    return () => {
      chart.remove();
      window.removeEventListener('resize', handleResize);
    };
  }, [chartData, isDarkMode]);

  const containerClass = isDarkMode ? 'dark' : '';

  return (
    <div className={containerClass}>
      <div className="p-4 bg-white dark:bg-gray-900 min-h-screen text-gray-900 dark:text-gray-100">
        <h2 className="text-xl font-semibold mb-4">U.S. Treasury Bond Data</h2>

        {/* Tabs */}
        <div className="flex space-x-4 mb-6 border-b border-gray-300 dark:border-gray-700">
          {['overview', 'quotes', 'charts'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`px-4 py-2 font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent hover:text-blue-500 dark:hover:text-blue-300'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
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
                            item.change.startsWith('-') ? 'text-red-500' : item.change === "UNCH" ? '' : 'text-green-600'
                          }`}
                        >
                          {item.change}
                        </td>
                        <td
                          className={`px-4 py-2 text-right ${
                            item.change_pct.startsWith('-') ? 'text-red-500' : item.change === "UNCH" ? '' : 'text-green-600'
                          }`}
                        >
                          {item.change_pct}
                        </td>
                        <td className="px-4 py-2 text-right">{item.maturity_date || 'N/A'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="w-full h-[400px]"></div>
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
                            <td className={`px-4 py-2 text-right ${bond.change > 0 ? 'text-green-600' : bond.change < 0 ? 'text-red-500' : ''}`}>{bond.change === 'unch.' ? '0.0000' : bond.change}</td>
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
              <div className="w-full h-full" ref={chartContainerRef}></div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
