import React from 'react';
import { Calendar, DollarSign, Split } from 'lucide-react';
import { ChartData } from '../types';
import { formatCurrency } from '../utils/formatters';

interface DividendsTableProps {
  data: ChartData | null;
}

interface TableRow {
  date: Date;
  type: 'dividend' | 'split';
  amount?: number;
  splitRatio?: string;
}

const DividendsTable: React.FC<DividendsTableProps> = ({ data }) => {
  if (!data || (!data.events?.dividends && !data.events?.splits)) {
    return (
      <div className="flex items-center justify-center h-[500px] bg-slate-50 dark:bg-slate-800/50 rounded-lg">
        <div className="text-center">
          <Calendar className="w-10 h-10 text-slate-400 mx-auto mb-2" />
          <p className="text-slate-600 dark:text-slate-400">No dividends or splits data available</p>
        </div>
      </div>
    );
  }

  // Combine dividends and splits into a single array
  const tableData: TableRow[] = [];

  // Add dividends
  if (data.events?.dividends) {
    Object.entries(data.events.dividends).forEach(([timestamp, dividend]) => {
      tableData.push({
        date: new Date(parseInt(timestamp) * 1000),
        type: 'dividend',
        amount: dividend.amount
      });
    });
  }

  // Add splits
  if (data.events?.splits) {
    Object.entries(data.events.splits).forEach(([timestamp, split]) => {
      tableData.push({
        date: new Date(parseInt(timestamp) * 1000),
        type: 'split',
        splitRatio: split.splitRatio
      });
    });
  }

  // Sort by date (most recent first)
  tableData.sort((a, b) => b.date.getTime() - a.date.getTime());

  if (tableData.length === 0) {
    return (
      <div className="flex items-center justify-center h-[500px] bg-slate-50 dark:bg-slate-800/50 rounded-lg">
        <div className="text-center">
          <Calendar className="w-10 h-10 text-slate-400 mx-auto mb-2" />
          <p className="text-slate-600 dark:text-slate-400">No dividends or splits data available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
          Dividends & Stock Splits
        </h3>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          {tableData.length} total events
        </p>
      </div>
      
      <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
        <table className="w-full">
          <thead className="bg-slate-50 dark:bg-slate-700 sticky top-0">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Date
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Type
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Details
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
            {tableData.map((row, index) => (
              <tr 
                key={index}
                className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
              >
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900 dark:text-white">
                  {row.date.toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                  })}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    {row.type === 'dividend' ? (
                      <>
                        <DollarSign className="w-4 h-4 text-green-500 mr-2" />
                        <span className="text-sm font-medium text-green-600 dark:text-green-400">
                          Dividend
                        </span>
                      </>
                    ) : (
                      <>
                        <Split className="w-4 h-4 text-purple-500 mr-2" />
                        <span className="text-sm font-medium text-purple-600 dark:text-purple-400">
                          Stock Split
                        </span>
                      </>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900 dark:text-white">
                  {row.type === 'dividend' ? (
                    <span className="font-medium">
                      ${row.amount} per share
                    </span>
                  ) : (
                    <span className="font-medium">
                      {row.splitRatio} split
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      <div className="px-6 py-3 bg-slate-50 dark:bg-slate-700 border-t border-slate-200 dark:border-slate-600">
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span>
            {tableData.filter(row => row.type === 'dividend').length} dividends, {' '}
            {tableData.filter(row => row.type === 'split').length} splits
          </span>
          <span>Most recent events shown first</span>
        </div>
      </div>
    </div>
  );
};

export default DividendsTable;