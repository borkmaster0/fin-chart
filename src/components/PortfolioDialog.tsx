import React, { useState } from 'react';
import { X, TrendingUp, TrendingDown, HandCoins, Target } from 'lucide-react';
import { addTransaction, updateTransaction, Transaction } from '../utils/db';

interface PortfolioDialogProps {
  symbol?: string;
  onClose: () => void;
  transaction?: Transaction;
}

const PortfolioDialog: React.FC<PortfolioDialogProps> = ({ symbol = '', onClose, transaction }) => {
  // Get today's date in YYYY-MM-DD format without timezone conversion
  const getTodayDate = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [formData, setFormData] = useState({
    symbol: transaction?.symbol || symbol,
    date: transaction?.date || getTodayDate(),
    type: transaction?.type || 'buy',
    shares: transaction?.shares.toString() || '',
    price: transaction?.price.toString() || '',
    fees: transaction?.fees.toString() || '0',
    notes: transaction?.notes || '',
    isDrip: transaction?.isDrip || false
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.symbol.trim()) {
      alert('Please enter a valid ticker symbol');
      return;
    }
    
    try {
      if (transaction) {
        await updateTransaction({
          id: transaction.id,
          symbol: formData.symbol.toUpperCase().trim(),
          date: formData.date, // Keep date as-is, no conversion
          type: formData.type as 'buy' | 'sell' | 'dividend' | 'options',
          shares: formData.type === 'options' ? Number(formData.shares) : Math.abs(Number(formData.shares)), // Allow negative for options
          price: Number(formData.price),
          fees: Number(formData.fees),
          notes: formData.notes,
          isDrip: formData.type === 'dividend' ? formData.isDrip : undefined
        });
      } else {
        await addTransaction({
          symbol: formData.symbol.toUpperCase().trim(),
          date: formData.date, // Keep date as-is, no conversion
          type: formData.type as 'buy' | 'sell' | 'dividend' | 'options',
          shares: formData.type === 'options' ? Number(formData.shares) : Math.abs(Number(formData.shares)), // Allow negative for options
          price: Number(formData.price),
          fees: Number(formData.fees),
          notes: formData.notes,
          isDrip: formData.type === 'dividend' ? formData.isDrip : undefined
        });
      }

      // Dispatch a storage event to trigger the portfolio update
      window.dispatchEvent(new Event('storage'));
      
      onClose();
    } catch (error) {
      console.error('Failed to save transaction:', error);
    }
  };

  const getTransactionIcon = () => {
    switch (formData.type) {
      case 'buy':
        return <TrendingUp className="text-green-500" />;
      case 'sell':
        return <TrendingDown className="text-red-500" />;
      case 'dividend':
        return <HandCoins className="text-yellow-500" />;
      case 'options':
        return <Target className="text-purple-500" />;
      default:
        return <TrendingUp className="text-green-500" />;
    }
  };

  const getTransactionDescription = () => {
    switch (formData.type) {
      case 'buy':
        return 'Purchase shares of this stock';
      case 'sell':
        return 'Sell shares of this stock';
      case 'dividend':
        return 'Dividend payment or reinvestment (DRIP)';
      case 'options':
        return 'Options contract transaction (positive = buy, negative = sell)';
      default:
        return '';
    }
  };

  const getSharesLabel = () => {
    if (formData.type === 'options') {
      return 'Contracts (+ for buy, - for sell)';
    } else if (formData.type === 'dividend' && formData.isDrip) {
      return 'Shares Purchased (DRIP)';
    } else if (formData.type === 'dividend' && !formData.isDrip) {
      return 'Shares (for dividend calculation)';
    }
    return 'Shares';
  };

  const getPriceLabel = () => {
    if (formData.type === 'options') {
      return 'Premium per Contract';
    } else if (formData.type === 'dividend') {
      return 'Dividend per Share';
    }
    return 'Price per Share';
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            {getTransactionIcon()}
            {transaction ? 'Edit' : 'Add'} Transaction
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full"
          >
            <X size={20} />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Ticker Symbol</label>
              <input
                type="text"
                value={formData.symbol}
                onChange={(e) => setFormData(prev => ({ ...prev, symbol: e.target.value.toUpperCase() }))}
                className="input w-full"
                placeholder="AAPL"
                required
                disabled={!!transaction} // Disable editing symbol for existing transactions
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Date</label>
              <input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
                className="input w-full"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Type</label>
            <select
              value={formData.type}
              onChange={(e) => setFormData(prev => ({ ...prev, type: e.target.value }))}
              className="input w-full"
              required
            >
              <option value="buy">Buy</option>
              <option value="sell">Sell</option>
              <option value="dividend">Dividend</option>
              <option value="options">Options</option>
            </select>
          </div>

          {/* Transaction type description */}
          <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3">
            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
              {getTransactionIcon()}
              <span>{getTransactionDescription()}</span>
            </div>
          </div>

          {/* DRIP checkbox for dividend transactions */}
          {formData.type === 'dividend' && (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-lg p-3">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.isDrip}
                  onChange={(e) => setFormData(prev => ({ ...prev, isDrip: e.target.checked }))}
                  className="form-checkbox h-4 w-4 text-yellow-500 rounded border-yellow-300 dark:border-yellow-600"
                />
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-yellow-900 dark:text-yellow-100">
                    DRIP (Dividend Reinvestment Plan)
                  </span>
                  <span className="text-xs text-yellow-700 dark:text-yellow-300">
                    {formData.isDrip 
                      ? 'Dividend was used to purchase additional shares'
                      : 'Dividend was paid as cash (will be added to cash balance)'
                    }
                  </span>
                </div>
              </label>
            </div>
          )}
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                {getSharesLabel()}
              </label>
              <input
                type="number"
                step="0.000001"
                value={formData.shares}
                onChange={(e) => setFormData(prev => ({ ...prev, shares: e.target.value }))}
                className="input w-full"
                placeholder={formData.type === 'options' ? '+1 or -1' : '0.000000'}
                required
              />
              {formData.type === 'options' && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Positive = buying contracts, Negative = selling contracts
                </p>
              )}
              {formData.type === 'dividend' && !formData.isDrip && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Used to calculate total dividend amount
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                {getPriceLabel()}
              </label>
              <input
                type="number"
                min="0"
                step="0.000001"
                value={formData.price}
                onChange={(e) => setFormData(prev => ({ ...prev, price: e.target.value }))}
                className="input w-full"
                placeholder="0.000000"
                required
              />
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">Fees</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={formData.fees}
              onChange={(e) => setFormData(prev => ({ ...prev, fees: e.target.value }))}
              className="input w-full"
              placeholder="0.00"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">Notes</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              className="input w-full h-24 resize-none"
              placeholder={
                formData.type === 'options' 
                  ? "e.g., AAPL Jan 21 '25 $150 Call, Opened/Closed position..."
                  : formData.type === 'dividend'
                  ? "e.g., Quarterly dividend payment..."
                  : "Add any notes about this transaction..."
              }
            />
          </div>
          
          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary flex items-center gap-2"
            >
              {getTransactionIcon()}
              {transaction ? 'Update' : 'Add'} Transaction
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PortfolioDialog;