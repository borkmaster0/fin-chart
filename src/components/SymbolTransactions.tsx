import React, { useState, useEffect } from 'react';
import { Edit2, Trash2, Plus, TrendingUp, TrendingDown, HandCoins, Target, RefreshCw } from 'lucide-react';
import { Transaction, getTransactions, deleteTransaction } from '../utils/db';
import { formatCurrency } from '../utils/formatters';
import { fetchCurrentPrices, CurrentPrice } from '../utils/api';
import { calculatePortfolioMetrics } from '../utils/portfolioCalculations';
import PortfolioDialog from './PortfolioDialog';
import ValueWithTooltip from './ValueWithTooltip';

interface SymbolTransactionsProps {
  symbol: string;
}

// Helper function to get responsive text size based on content length
const getResponsiveTextSize = (text: string, baseSize: string = 'text-lg') => {
  const length = text.length;
  if (length > 20) return 'text-sm';
  if (length > 15) return 'text-base';
  if (length > 12) return 'text-lg';
  return baseSize;
};

// Helper function to format large numbers with abbreviations
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

const SymbolTransactions: React.FC<SymbolTransactionsProps> = ({ symbol }) => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [currentPrice, setCurrentPrice] = useState<CurrentPrice | null>(null);
  const [isLoadingPrice, setIsLoadingPrice] = useState(false);
  const [lastPriceUpdate, setLastPriceUpdate] = useState<Date | null>(null);
  const [deletingTransactionId, setDeletingTransactionId] = useState<string | null>(null);

  const loadTransactions = async () => {
    try {
      setIsLoading(true);
      const symbolTransactions = await getTransactions(symbol);
      // Sort by date (most recent first)
      symbolTransactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setTransactions(symbolTransactions);
      
      // Load current price if we have transactions
      if (symbolTransactions.length > 0) {
        await loadCurrentPrice();
      }
    } catch (error) {
      console.error('Failed to load transactions:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadCurrentPrice = async () => {
    setIsLoadingPrice(true);
    try {
      const prices = await fetchCurrentPrices([symbol]);
      if (prices.length > 0) {
        setCurrentPrice(prices[0]);
        setLastPriceUpdate(new Date());
      }
    } catch (error) {
      console.error('Failed to load current price:', error);
    } finally {
      setIsLoadingPrice(false);
    }
  };

  const handleDeleteTransaction = async (transactionId: string) => {
    if (!confirm('Are you sure you want to delete this transaction? This action cannot be undone.')) {
      return;
    }

    setDeletingTransactionId(transactionId);
    try {
      await deleteTransaction(transactionId);
      
      // Dispatch a storage event to trigger updates
      window.dispatchEvent(new Event('storage'));
      
      // Reload transactions
      await loadTransactions();
    } catch (error) {
      console.error('Failed to delete transaction:', error);
    } finally {
      setDeletingTransactionId(null);
    }
  };

  useEffect(() => {
    loadTransactions();

    // Listen for changes to IndexedDB
    const handleStorageChange = () => {
      loadTransactions();
    };

    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [symbol]);

  // Calculate portfolio metrics using the new calculation logic
  const portfolioMetrics = calculatePortfolioMetrics(transactions, currentPrice?.price);

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'buy':
        return <TrendingUp size={16} className="text-positive" />;
      case 'sell':
        return <TrendingDown size={16} className="text-negative" />;
      case 'dividend':
        return <HandCoins size={16} className="text-yellow-500" />;
      case 'options':
        return <Target size={16} className="text-purple-500" />;
      default:
        return <TrendingUp size={16} className="text-positive" />;
    }
  };

  const getTransactionLabel = (type: string) => {
    switch (type) {
      case 'buy':
        return 'Bought';
      case 'sell':
        return 'Sold';
      case 'dividend':
        return 'Dividend';
      case 'options':
        return 'Options';
      default:
        return 'Transaction';
    }
  };

  if (isLoading) {
    return (
      <div className="card animate-pulse">
        <div className="h-6 bg-slate-200 dark:bg-slate-700 rounded w-3/4 mb-4"></div>
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="h-16 bg-slate-200 dark:bg-slate-700 rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">{symbol} Transactions</h3>
          <button
            onClick={() => setShowAddDialog(true)}
            className="p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            title="Add transaction"
          >
            <Plus size={20} className="text-primary" />
          </button>
        </div>
        <p className="text-slate-600 dark:text-slate-400 text-center py-4">
          No transactions for {symbol}
        </p>
        
        {/* Dialogs */}
        {showAddDialog && (
          <PortfolioDialog
            symbol={symbol}
            onClose={() => {
              setShowAddDialog(false);
              loadTransactions();
            }}
          />
        )}
      </div>
    );
  }

  return (
    <>
      <div className="card space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">{symbol} Portfolio</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={loadCurrentPrice}
              disabled={isLoadingPrice}
              className={`p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors ${
                isLoadingPrice ? 'opacity-50 cursor-not-allowed' : ''
              }`}
              title="Refresh price"
            >
              <RefreshCw 
                size={16} 
                className={`text-slate-600 dark:text-slate-400 ${isLoadingPrice ? 'animate-spin' : ''}`} 
              />
            </button>
            <button
              onClick={() => setShowAddDialog(true)}
              className="p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              title="Add transaction"
            >
              <Plus size={20} className="text-primary" />
            </button>
          </div>
        </div>

        {/* Summary */}
        <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4">
          <div className="grid grid-cols-1 gap-4">
            <div className="text-center">
              <div className="text-sm text-slate-600 dark:text-slate-400">Total Shares</div>
              <div className="text-lg font-bold">{portfolioMetrics.totalShares.toFixed(4)}</div>
              {portfolioMetrics.averageCostPerShare > 0 && (
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Avg Cost: {formatCurrency(portfolioMetrics.averageCostPerShare)}
                </div>
              )}
            </div>
            
            <div className="text-center">
              <div className="text-sm text-slate-600 dark:text-slate-400">Current Value</div>
              <ValueWithTooltip
                value={portfolioMetrics.currentValue}
                displayValue={formatLargeNumber(portfolioMetrics.currentValue)}
                className={`font-bold ${getResponsiveTextSize(formatLargeNumber(portfolioMetrics.currentValue))}`}
              />
              {portfolioMetrics.currentPrice && (
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  @ {formatCurrency(portfolioMetrics.currentPrice)}
                </div>
              )}
            </div>
            
            {portfolioMetrics.unrealizedGainLoss !== 0 && (
              <div className="text-center">
                <div className="text-sm text-slate-600 dark:text-slate-400">Unrealized Gain/Loss</div>
                <ValueWithTooltip
                  value={portfolioMetrics.unrealizedGainLoss}
                  displayValue={formatLargeNumber(portfolioMetrics.unrealizedGainLoss)}
                  prefix={portfolioMetrics.unrealizedGainLoss >= 0 ? '+' : ''}
                  className={`font-bold ${
                    portfolioMetrics.unrealizedGainLoss >= 0 ? 'text-positive' : 'text-negative'
                  } ${getResponsiveTextSize(formatLargeNumber(portfolioMetrics.unrealizedGainLoss))}`}
                />
                <div className={`text-xs font-medium ${
                  portfolioMetrics.unrealizedGainLoss >= 0 ? 'text-positive' : 'text-negative'
                }`}>
                  ({portfolioMetrics.gainLossPercent >= 0 ? '+' : ''}{portfolioMetrics.gainLossPercent.toFixed(2)}%)
                </div>
              </div>
            )}
            
            {portfolioMetrics.realizedGainLoss !== 0 && (
              <div className="text-center">
                <div className="text-sm text-slate-600 dark:text-slate-400">Realized Gain/Loss</div>
                <ValueWithTooltip
                  value={portfolioMetrics.realizedGainLoss}
                  displayValue={formatLargeNumber(portfolioMetrics.realizedGainLoss)}
                  prefix={portfolioMetrics.realizedGainLoss >= 0 ? '+' : ''}
                  className={`font-bold ${
                    portfolioMetrics.realizedGainLoss >= 0 ? 'text-emerald-600' : 'text-orange-600'
                  } ${getResponsiveTextSize(formatLargeNumber(portfolioMetrics.realizedGainLoss))}`}
                />
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  From completed trades
                </div>
              </div>
            )}
          </div>
          
          {lastPriceUpdate && (
            <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-600 text-center">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Price updated: {lastPriceUpdate.toLocaleTimeString()}
              </p>
            </div>
          )}
        </div>

        {/* Recent Transactions */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-medium text-slate-900 dark:text-white">Recent Transactions</h4>
            <span className="text-sm text-slate-600 dark:text-slate-400">
              {transactions.length} transaction{transactions.length !== 1 ? 's' : ''}
            </span>
          </div>
          
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {transactions.slice(0, 5).map((transaction) => (
              <div 
                key={transaction.id} 
                className="border border-slate-200 dark:border-slate-700 rounded-lg p-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {getTransactionIcon(transaction.type)}
                    <div>
                      <div className="font-medium text-sm">
                        {getTransactionLabel(transaction.type)} {transaction.shares} {transaction.type === 'options' ? 'contracts' : 'shares'}
                      </div>
                      <div className="text-xs text-slate-600 dark:text-slate-400">
                        {new Date(transaction.date).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setEditingTransaction(transaction)}
                      className="p-1 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-full transition-colors"
                      title="Edit transaction"
                    >
                      <Edit2 size={12} />
                    </button>
                    <button
                      onClick={() => handleDeleteTransaction(transaction.id)}
                      disabled={deletingTransactionId === transaction.id}
                      className={`p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-full transition-colors ${
                        deletingTransactionId === transaction.id ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                      title="Delete transaction"
                    >
                      <Trash2 size={12} className="text-red-500" />
                    </button>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-slate-600 dark:text-slate-400">
                      {transaction.type === 'options' ? 'Premium:' : 'Price:'}
                    </span>
                    <span className="ml-1 font-medium">{formatCurrency(transaction.price)}</span>
                  </div>
                  <div>
                    <span className="text-slate-600 dark:text-slate-400">Total:</span>
                    <ValueWithTooltip
                      value={transaction.price * transaction.shares}
                      displayValue={formatLargeNumber(transaction.price * transaction.shares)}
                      className={`ml-1 font-medium ${getResponsiveTextSize(formatLargeNumber(transaction.price * transaction.shares), 'text-xs')}`}
                    />
                  </div>
                </div>
                
                {transaction.notes && (
                  <div className="mt-2 text-xs text-slate-600 dark:text-slate-400">
                    {transaction.notes}
                  </div>
                )}
              </div>
            ))}
          </div>
          
          {transactions.length > 5 && (
            <div className="mt-3 text-center">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Showing 5 of {transactions.length} transactions
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Dialogs */}
      {showAddDialog && (
        <PortfolioDialog
          symbol={symbol}
          onClose={() => {
            setShowAddDialog(false);
            loadTransactions();
          }}
        />
      )}

      {editingTransaction && (
        <PortfolioDialog
          symbol={symbol}
          transaction={editingTransaction}
          onClose={() => {
            setEditingTransaction(null);
            loadTransactions();
          }}
        />
      )}
    </>
  );
};

export default SymbolTransactions;