import React, { useState } from 'react';
import { X, DollarSign, TrendingUp, TrendingDown, HandCoins } from 'lucide-react';
import { addCashTransaction, CashTransaction, updateCashTransaction } from '../utils/db';

interface CashBalanceDialogProps {
  onClose: () => void;
  transaction?: CashTransaction;
}

const CashBalanceDialog: React.FC<CashBalanceDialogProps> = ({ onClose, transaction }) => {
  // Get today's date in YYYY-MM-DD format without timezone conversion
  const getTodayDate = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [formData, setFormData] = useState({
    date: transaction?.date || getTodayDate(),
    type: transaction?.type || 'deposit',
    amount: transaction?.amount.toString() || '',
    description: transaction?.description || ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      if (transaction) {
        await updateCashTransaction({
          id: transaction.id,
          date: formData.date, // Keep date as-is, no conversion
          type: formData.type as 'deposit' | 'withdrawal' | 'realized_gain' | 'dividend',
          amount: Number(formData.amount),
          description: formData.description
        });
      } else {
        await addCashTransaction({
          date: formData.date, // Keep date as-is, no conversion
          type: formData.type as 'deposit' | 'withdrawal' | 'realized_gain' | 'dividend',
          amount: Number(formData.amount),
          description: formData.description
        });
      }

      // Dispatch a storage event to trigger updates
      window.dispatchEvent(new Event('storage'));
      
      onClose();
    } catch (error) {
      console.error('Failed to save cash transaction:', error);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <DollarSign size={20} className="text-primary" />
            {transaction ? 'Edit' : 'Add'} Cash Transaction
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
              <label className="block text-sm font-medium mb-1">Date</label>
              <input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
                className="input w-full"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Type</label>
              <select
                value={formData.type}
                onChange={(e) => setFormData(prev => ({ ...prev, type: e.target.value }))}
                className="input w-full"
                required
                disabled={transaction?.type === 'realized_gain' || transaction?.type === 'dividend'}
              >
                <option value="deposit">Deposit</option>
                <option value="withdrawal">Withdrawal</option>
                {(transaction?.type === 'realized_gain' || transaction?.type === 'dividend') && (
                  <>
                    <option value="realized_gain">Realized Gain</option>
                    <option value="dividend">Dividend</option>
                  </>
                )}
              </select>
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">Amount</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <span className="text-slate-500 dark:text-slate-400">$</span>
              </div>
              <input
                type="number"
                min="0"
                step="0.01"
                value={formData.amount}
                onChange={(e) => setFormData(prev => ({ ...prev, amount: e.target.value }))}
                className="input w-full pl-8"
                placeholder="0.00"
                required
              />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Enter amount with cents (e.g., 0.01 for 1 cent)
            </p>
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <input
              type="text"
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              className="input w-full"
              placeholder="Enter description..."
              required
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
              {formData.type === 'deposit' ? (
                <TrendingUp size={16} />
              ) : formData.type === 'dividend' ? (
                <HandCoins size={16} />
              ) : (
                <TrendingDown size={16} />
              )}
              {transaction ? 'Update' : 'Add'} Transaction
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CashBalanceDialog;