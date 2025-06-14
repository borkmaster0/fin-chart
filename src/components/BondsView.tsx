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

  useEffect(() => {
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

  if (loading) {
    return <div className="p-4 text-center">Loading bond data...</div>;
  }

  if (error) {
    return <div className="p-4 text-red-500 text-center">{error}</div>;
  }

  return (
    <div className="p-4">
      <h2 className="text-xl font-semibold mb-4">Current U.S. Treasury Yields</h2>
      <div className="overflow-x-auto">
        <table className="min-w-full table-auto border border-gray-200">
          <thead className="bg-gray-100">
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
              <tr key={idx} className="border-t border-gray-200 hover:bg-gray-50">
                <td className="px-4 py-2">{item.shortName}</td>
                <td className="px-4 py-2 text-right">{item.last}</td>
                <td className={`px-4 py-2 text-right ${item.change.startsWith('-') ? 'text-red-500' : 'text-green-600'}`}>
                  {item.change}
                </td>
                <td className={`px-4 py-2 text-right ${item.change_pct.startsWith('-') ? 'text-red-500' : 'text-green-600'}`}>
                  {item.change_pct}%
                </td>
                <td className="px-4 py-2 text-right">{item.maturityDate || 'N/A'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
