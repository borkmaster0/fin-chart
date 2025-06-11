import React, { useState } from 'react';
import { X, Plus, Trash2, Upload, Download, Save, FileText } from 'lucide-react';
import { addTransaction } from '../utils/db';
import CSVImportDialog from './CSVImportDialog';

interface TransactionRow {
  id: string;
  symbol: string;
  date: string;
  type: 'buy' | 'sell' | 'dividend' | 'options';
  shares: string;
  price: string;
  fees: string;
  notes: string;
}

interface MultipleTransactionsDialogProps {
  onClose: () => void;
  initialSymbol?: string;
}

const MultipleTransactionsDialog: React.FC<MultipleTransactionsDialogProps> = ({ 
  onClose, 
  initialSymbol = '' 
}) => {
  // Get today's date in YYYY-MM-DD format without timezone conversion
  const getTodayDate = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [transactions, setTransactions] = useState<TransactionRow[]>([
    {
      id: crypto.randomUUID(),
      symbol: initialSymbol,
      date: getTodayDate(),
      type: 'buy',
      shares: '',
      price: '',
      fees: '0',
      notes: ''
    }
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [showCSVImport, setShowCSVImport] = useState(false);

  const addRow = () => {
    const newRow: TransactionRow = {
      id: crypto.randomUUID(),
      symbol: '',
      date: getTodayDate(),
      type: 'buy',
      shares: '',
      price: '',
      fees: '0',
      notes: ''
    };
    setTransactions([...transactions, newRow]);
  };

  const removeRow = (id: string) => {
    if (transactions.length > 1) {
      setTransactions(transactions.filter(t => t.id !== id));
      // Clear any errors for the removed row
      const newErrors = { ...errors };
      Object.keys(newErrors).forEach(key => {
        if (key.startsWith(id)) {
          delete newErrors[key];
        }
      });
      setErrors(newErrors);
    }
  };

  const updateTransaction = (id: string, field: keyof TransactionRow, value: string) => {
    setTransactions(transactions.map(t => 
      t.id === id ? { ...t, [field]: value } : t
    ));
    
    // Clear error for this field when user starts typing
    const errorKey = `${id}-${field}`;
    if (errors[errorKey]) {
      const newErrors = { ...errors };
      delete newErrors[errorKey];
      setErrors(newErrors);
    }
  };

  const validateTransactions = (): boolean => {
    const newErrors: { [key: string]: string } = {};
    let isValid = true;

    transactions.forEach(transaction => {
      // Validate symbol
      if (!transaction.symbol.trim()) {
        newErrors[`${transaction.id}-symbol`] = 'Symbol is required';
        isValid = false;
      }

      // Validate shares
      if (!transaction.shares || Number(transaction.shares) <= 0) {
        newErrors[`${transaction.id}-shares`] = 'Shares must be greater than 0';
        isValid = false;
      }

      // Validate price
      if (!transaction.price || Number(transaction.price) <= 0) {
        newErrors[`${transaction.id}-price`] = 'Price must be greater than 0';
        isValid = false;
      }

      // Validate fees
      if (Number(transaction.fees) < 0) {
        newErrors[`${transaction.id}-fees`] = 'Fees cannot be negative';
        isValid = false;
      }
    });

    setErrors(newErrors);
    return isValid;
  };

  const handleSubmit = async () => {
    if (!validateTransactions()) {
      return;
    }

    setIsSubmitting(true);
    try {
      // Submit all transactions
      for (const transaction of transactions) {
        await addTransaction({
          symbol: transaction.symbol.toUpperCase().trim(),
          date: transaction.date, // Keep date as-is, no conversion
          type: transaction.type,
          shares: Number(transaction.shares),
          price: Number(transaction.price),
          fees: Number(transaction.fees),
          notes: transaction.notes
        });
      }

      // Dispatch storage event to trigger updates
      window.dispatchEvent(new Event('storage'));
      onClose();
    } catch (error) {
      console.error('Failed to save transactions:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const duplicateRow = (id: string) => {
    const rowToDuplicate = transactions.find(t => t.id === id);
    if (rowToDuplicate) {
      const newRow: TransactionRow = {
        ...rowToDuplicate,
        id: crypto.randomUUID(),
        notes: ''
      };
      const index = transactions.findIndex(t => t.id === id);
      const newTransactions = [...transactions];
      newTransactions.splice(index + 1, 0, newRow);
      setTransactions(newTransactions);
    }
  };

  const exportToCSV = () => {
    const headers = ['Symbol', 'Date', 'Type', 'Shares', 'Price', 'Fees', 'Notes'];
    const csvContent = [
      headers.join(','),
      ...transactions.map(t => [
        t.symbol,
        t.date,
        t.type,
        t.shares,
        t.price,
        t.fees,
        `"${t.notes.replace(/"/g, '""')}"`
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transactions_${getTodayDate()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getErrorForField = (transactionId: string, field: string) => {
    return errors[`${transactionId}-${field}`];
  };

  if (showCSVImport) {
    return (
      <CSVImportDialog
        onClose={() => {
          setShowCSVImport(false);
          onClose(); // Close the parent dialog too
        }}
      />
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-7xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Save size={20} className="text-primary" />
            Add Multiple Transactions
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowCSVImport(true)}
              className="btn btn-secondary flex items-center gap-2 text-sm"
              title="Import from CSV"
            >
              <FileText size={16} />
              Import CSV
            </button>
            <button
              onClick={exportToCSV}
              className="btn btn-secondary flex items-center gap-2 text-sm"
              title="Export to CSV"
            >
              <Download size={16} />
              Export
            </button>
            <button
              onClick={onClose}
              className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full"
            >
              <X size={20} />
            </button>
          </div>
        </div>
        
        <div className="flex-1 overflow-auto p-6">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Add multiple transactions at once. Each row represents one transaction.
            </p>
            <button
              onClick={addRow}
              className="btn btn-primary flex items-center gap-2 text-sm"
            >
              <Plus size={16} />
              Add Row
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className="text-left p-2 font-medium text-slate-600 dark:text-slate-400 min-w-[100px]">Symbol</th>
                  <th className="text-left p-2 font-medium text-slate-600 dark:text-slate-400 min-w-[130px]">Date</th>
                  <th className="text-left p-2 font-medium text-slate-600 dark:text-slate-400 min-w-[100px]">Type</th>
                  <th className="text-left p-2 font-medium text-slate-600 dark:text-slate-400 min-w-[100px]">Shares</th>
                  <th className="text-left p-2 font-medium text-slate-600 dark:text-slate-400 min-w-[100px]">Price</th>
                  <th className="text-left p-2 font-medium text-slate-600 dark:text-slate-400 min-w-[80px]">Fees</th>
                  <th className="text-left p-2 font-medium text-slate-600 dark:text-slate-400 min-w-[150px]">Notes</th>
                  <th className="text-left p-2 font-medium text-slate-600 dark:text-slate-400 w-[100px]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((transaction, index) => (
                  <tr key={transaction.id} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="p-2">
                      <input
                        type="text"
                        value={transaction.symbol}
                        onChange={(e) => updateTransaction(transaction.id, 'symbol', e.target.value.toUpperCase())}
                        className={`input w-full text-sm ${
                          getErrorForField(transaction.id, 'symbol') ? 'border-red-500' : ''
                        }`}
                        placeholder="AAPL"
                      />
                      {getErrorForField(transaction.id, 'symbol') && (
                        <div className="text-xs text-red-500 mt-1">
                          {getErrorForField(transaction.id, 'symbol')}
                        </div>
                      )}
                    </td>
                    <td className="p-2">
                      <input
                        type="date"
                        value={transaction.date}
                        onChange={(e) => updateTransaction(transaction.id, 'date', e.target.value)}
                        className="input w-full text-sm"
                      />
                    </td>
                    <td className="p-2">
                      <select
                        value={transaction.type}
                        onChange={(e) => updateTransaction(transaction.id, 'type', e.target.value)}
                        className="input w-full text-sm"
                      >
                        <option value="buy">Buy</option>
                        <option value="sell">Sell</option>
                        <option value="dividend">Dividend</option>
                        <option value="options">Options</option>
                      </select>
                    </td>
                    <td className="p-2">
                      <input
                        type="number"
                        min="0"
                        step="0.000001"
                        value={transaction.shares}
                        onChange={(e) => updateTransaction(transaction.id, 'shares', e.target.value)}
                        className={`input w-full text-sm ${
                          getErrorForField(transaction.id, 'shares') ? 'border-red-500' : ''
                        }`}
                        placeholder="100"
                      />
                      {getErrorForField(transaction.id, 'shares') && (
                        <div className="text-xs text-red-500 mt-1">
                          {getErrorForField(transaction.id, 'shares')}
                        </div>
                      )}
                    </td>
                    <td className="p-2">
                      <input
                        type="number"
                        min="0"
                        step="0.000001"
                        value={transaction.price}
                        onChange={(e) => updateTransaction(transaction.id, 'price', e.target.value)}
                        className={`input w-full text-sm ${
                          getErrorForField(transaction.id, 'price') ? 'border-red-500' : ''
                        }`}
                        placeholder="150.00"
                      />
                      {getErrorForField(transaction.id, 'price') && (
                        <div className="text-xs text-red-500 mt-1">
                          {getErrorForField(transaction.id, 'price')}
                        </div>
                      )}
                    </td>
                    <td className="p-2">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={transaction.fees}
                        onChange={(e) => updateTransaction(transaction.id, 'fees', e.target.value)}
                        className={`input w-full text-sm ${
                          getErrorForField(transaction.id, 'fees') ? 'border-red-500' : ''
                        }`}
                        placeholder="0.00"
                      />
                      {getErrorForField(transaction.id, 'fees') && (
                        <div className="text-xs text-red-500 mt-1">
                          {getErrorForField(transaction.id, 'fees')}
                        </div>
                      )}
                    </td>
                    <td className="p-2">
                      <input
                        type="text"
                        value={transaction.notes}
                        onChange={(e) => updateTransaction(transaction.id, 'notes', e.target.value)}
                        className="input w-full text-sm"
                        placeholder={
                          transaction.type === 'options' 
                            ? "e.g., AAPL Jan 21 '25 $150 Call"
                            : "Optional notes..."
                        }
                      />
                    </td>
                    <td className="p-2">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => duplicateRow(transaction.id)}
                          className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors"
                          title="Duplicate row"
                        >
                          <Plus size={14} />
                        </button>
                        {transactions.length > 1 && (
                          <button
                            onClick={() => removeRow(transaction.id)}
                            className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-colors"
                            title="Remove row"
                          >
                            <Trash2 size={14} className="text-red-500" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {transactions.length === 0 && (
            <div className="text-center py-8">
              <p className="text-slate-500 dark:text-slate-400">No transactions added yet.</p>
              <button
                onClick={addRow}
                className="btn btn-primary mt-4"
              >
                Add First Transaction
              </button>
            </div>
          )}
        </div>
        
        <div className="flex justify-between items-center p-6 border-t border-slate-200 dark:border-slate-700">
          <div className="text-sm text-slate-600 dark:text-slate-400">
            {transactions.length} transaction{transactions.length !== 1 ? 's' : ''} ready to submit
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || transactions.length === 0}
              className={`btn btn-primary flex items-center gap-2 ${
                isSubmitting ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save size={16} />
                  Save All Transactions
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MultipleTransactionsDialog;