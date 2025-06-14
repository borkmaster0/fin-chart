import React, { useRef, useEffect, useState } from 'react';
import { createChart, ISeriesApi, CandlestickSeries, ColorType, CrosshairMode } from 'lightweight-charts';
import { fetchBondOrderBook, fetchBillOrderBook, fetchQuickBondData } from '../utils/api';

//import React, { useEffect, useState } from 'react';
//import { fetchQuickBondData } from '../utils/api';

interface BondItem {
  shortName: string;
  last: string;
  change: string;
  change_pct: string;
  maturityDate: string;
}

export default function BondView() {
  const [bondData, setBondData] = useState<BondItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(false);

  useEffect(() => {
    const storedDarkMode = localStorage.getItem('darkMode');
    setIsDarkMode(storedDarkMode === 'true');

    const getBondData = async () => {
      try {
        setLoading(true);
        const response = await fetchQuickBondData();
        setBondData(response.data);
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
    <div className={`${containerClass}`}>
      <div className="p-4 bg-white dark:bg-gray-900 min-h-screen text-gray-900 dark:text-gray-100">
        <h2 className="text-xl font-semibold mb-4">U.S. Treasury Bond Data</h2>

        {loading && <div className="text-center">Loading bond data...</div>}
        {error && <div className="text-red-500 text-center">{error}</div>}

        {!loading && !error && (
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
                    <td className={`px-4 py-2 text-right ${item.change.startsWith('-') ? 'text-red-500' : 'text-green-600'}`}>
                      {item.change}
                    </td>
                    <td className={`px-4 py-2 text-right ${item.change_pct.startsWith('-') ? 'text-red-500' : 'text-green-600'}`}>
                      {item.change_pct}
                    </td>
                    <td className="px-4 py-2 text-right">{item.maturity_date || 'N/A'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
