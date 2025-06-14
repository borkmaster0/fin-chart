import React, { useEffect, useState } from 'react';
import { createChart, ISeriesApi, CandlestickSeries, ColorType, CrosshairMode } from 'lightweight-charts';
import { fetchBondOrderBook, fetchBillOrderBook, fetchQuickBondData } from '../utils/api';
import { TreasuryBondOrderBook, TreasuryBillsOrderBook } from '../types/index';

interface BondItem {
  shortName: string;
  last: string;
  change: string;
  change_pct: string;
  maturityDate: string;
}

export default function BondView() {
  const [bondData, setBondData] = useState<BondItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [bondOrderBook, setBondOrderBook] = useState<TreasuryBondOrderBook[]>([]);
  const [billOrderBook, setBillOrderBook] = useState<TreasuryBillsOrderBook[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'quotes' | 'charts'>('overview');

  useEffect(() => {
    const storedDarkMode = localStorage.getItem('darkMode');
    setIsDarkMode(storedDarkMode === 'true');

    const getBondData = async () => {
      try {
        setLoading(true);
        const quickData = await fetchQuickBondData();
        setBondData(quickData.data);

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
                            item.change.startsWith('-') ? 'text-red-500' : 'text-green-600'
                          }`}
                        >
                          {item.change}
                        </td>
                        <td
                          className={`px-4 py-2 text-right ${
                            item.change_pct.startsWith('-') ? 'text-red-500' : 'text-green-600'
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
                            <td className="px-4 py-2 text-right text-green">{bond.bid}</td>
                            <td className="px-4 py-2 text-right text-red">{bond.ask}</td>
                            <td className="px-4 py-2 text-right">{bond.askYield}</td>
                            <td className="px-4 py-2 text-right">{bond.change}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

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
                            <td className="px-4 py-2 text-right text-green">{bill.bid}</td>
                            <td className="px-4 py-2 text-right text-red">{bill.ask}</td>
                            <td className="px-4 py-2 text-right">{bill.askYield}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'charts' && (
              <div className="text-center text-gray-500 dark:text-gray-400">Charts will be implemented soon.</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
