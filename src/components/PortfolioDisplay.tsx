import React, { useState, useEffect, useMemo } from 'react';
import { ArrowRight, TrendingUp, TrendingDown, Edit2, HandCoins, RefreshCw, Trash2, DollarSign, Target, PieChart, Activity, Plus, Wallet, Upload } from 'lucide-react';
import { Transaction, getAllTransactions, deleteTransaction, STORE_NAMES, CashTransaction, getAllCashTransactions, deleteCashTransaction, addRealizedGainToCash, addDividendToCash } from '../utils/db';
import { formatCurrency } from '../utils/formatters';
import { fetchCurrentPrices, CurrentPrice } from '../utils/api';
import { calculatePortfolioMetrics, calculateTotalPortfolioMetrics, PortfolioCalculation } from '../utils/portfolioCalculations';
import PortfolioDialog from './PortfolioDialog';
import CashBalanceDialog from './CashBalanceDialog';
import MultipleTransactionsDialog from './MultipleTransactionsDialog';
import ValueWithTooltip from './ValueWithTooltip';

interface PortfolioDisplayProps {
  onSymbolSelect: (symbol: string) => void;
}

interface SymbolTransactions {
  [symbol: string]: Transaction[];
}

// Helper function to get responsive text size based on content length
const getResponsiveTextSize = (text: string, baseSize: string = 'text-3xl') => {
  const length = text.length;
  if (length > 20) return 'text-lg';
  if (length > 15) return 'text-xl';
  if (length > 12) return 'text-2xl';
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

const PortfolioDisplay: React.FC<PortfolioDisplayProps> = ({ onSymbolSelect }) => {
  const [transactions, setTransactions] = useState<SymbolTransactions>({});
  const [cashTransactions, setCashTransactions] = useState<CashTransaction[]>([]);
  const [expandedSymbol, setExpandedSymbol] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [editingCashTransaction, setEditingCashTransaction] = useState<CashTransaction | null>(null);
  const [showCashDialog, setShowCashDialog] = useState(false);
  const [showAddTransactionDialog, setShowAddTransactionDialog] = useState(false);
  const [showMultipleTransactionsDialog, setShowMultipleTransactionsDialog] = useState(false);
  const [currentPrices, setCurrentPrices] = useState<{ [symbol: string]: CurrentPrice }>({});
  const [isLoadingPrices, setIsLoadingPrices] = useState(false);
  const [lastPriceUpdate, setLastPriceUpdate] = useState<Date | null>(null);
  const [deletingTransactionId, setDeletingTransactionId] = useState<string | null>(null);
  const [deletingCashTransactionId, setDeletingCashTransactionId] = useState<string | null>(null);

  // Calculate portfolio values using the new calculation logic
  const portfolioCalculations = useMemo(() => {
    return Object.entries(transactions).reduce((acc, [symbol, transactions]) => {
      const currentPrice = currentPrices[symbol]?.price;
      acc[symbol] = calculatePortfolioMetrics(transactions, currentPrice);
      return acc;
    }, {} as { [symbol: string]: PortfolioCalculation });
  }, [transactions, currentPrices]);

  // Calculate total portfolio metrics
  const totalMetrics = useMemo(() => {
    return calculateTotalPortfolioMetrics(portfolioCalculations);
  }, [portfolioCalculations]);

  // Calculate cash balance
  const cashBalance = useMemo(() => {
    return cashTransactions.reduce((total, transaction) => {
      switch (transaction.type) {
        case 'deposit':
        case 'realized_gain':
        case 'dividend':
          return total + transaction.amount;
        case 'withdrawal':
          return total - transaction.amount;
        default:
          return total;
      }
    }, 0);
  }, [cashTransactions]);

  // Calculate total portfolio value including cash
  const totalPortfolioValue = totalMetrics.totalValue + cashBalance;

  const loadAllTransactions = async () => {
    try {
      const allTransactions = await getAllTransactions();
      const allCashTransactions = await getAllCashTransactions();
      
      const groupedTransactions = allTransactions.reduce((acc, transaction) => {
        if (!acc[transaction.symbol]) {
          acc[transaction.symbol] = [];
        }
        acc[transaction.symbol].push(transaction);
        return acc;
      }, {} as SymbolTransactions);

      // Sort transactions by date for each symbol
      Object.keys(groupedTransactions).forEach(symbol => {
        groupedTransactions[symbol].sort((a, b) => 
          new Date(b.date).getTime() - new Date(a.date).getTime()
        );
      });

      // Sort cash transactions by date (most recent first)
      allCashTransactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      setTransactions(groupedTransactions);
      setCashTransactions(allCashTransactions);
      setIsLoading(false);
      
      // Load current prices for all symbols
      const symbols = Object.keys(groupedTransactions);
      if (symbols.length > 0) {
        await loadCurrentPrices(symbols);
      }

      // Sync realized gains and dividends to cash transactions
      await syncTransactionsToCash(groupedTransactions, allCashTransactions);
    } catch (error) {
      console.error('Failed to load transactions:', error);
      setIsLoading(false);
    }
  };

  const syncTransactionsToCash = async (
    stockTransactions: SymbolTransactions, 
    existingCashTransactions: CashTransaction[]
  ) => {
    try {
      // Get all realized gain and dividend transactions from portfolio calculations
      const allRealizedGains: Array<{
        transactionId: string;
        amount: number;
        date: string;
        description: string;
      }> = [];
      
      const allDividendCash: Array<{
        transactionId: string;
        amount: number;
        date: string;
        description: string;
      }> = [];

      Object.entries(stockTransactions).forEach(([symbol, transactions]) => {
        const calc = calculatePortfolioMetrics(transactions);
        allRealizedGains.push(...calc.realizedGainTransactions);
        allDividendCash.push(...calc.dividendCashTransactions);
      });

      // Find transactions that don't have corresponding cash transactions
      const existingRealizedGainIds = new Set(
        existingCashTransactions
          .filter(ct => ct.type === 'realized_gain' && ct.relatedTransactionId)
          .map(ct => ct.relatedTransactionId!)
      );
      
      const existingDividendIds = new Set(
        existingCashTransactions
          .filter(ct => ct.type === 'dividend' && ct.relatedTransactionId)
          .map(ct => ct.relatedTransactionId!)
      );

      const newRealizedGains = allRealizedGains.filter(
        rg => !existingRealizedGainIds.has(rg.transactionId)
      );
      
      const newDividendCash = allDividendCash.filter(
        dc => !existingDividendIds.has(dc.transactionId)
      );

      // Add missing realized gain cash transactions
      for (const realizedGain of newRealizedGains) {
        await addRealizedGainToCash(
          realizedGain.amount,
          realizedGain.description,
          realizedGain.date,
          realizedGain.transactionId
        );
      }
      
      // Add missing dividend cash transactions
      for (const dividendCash of newDividendCash) {
        await addDividendToCash(
          dividendCash.amount,
          dividendCash.description,
          dividendCash.date,
          dividendCash.transactionId
        );
      }

      // Reload cash transactions if we added any
      if (newRealizedGains.length > 0 || newDividendCash.length > 0) {
        const updatedCashTransactions = await getAllCashTransactions();
        updatedCashTransactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setCashTransactions(updatedCashTransactions);
      }
    } catch (error) {
      console.error('Failed to sync transactions to cash:', error);
    }
  };

  const loadCurrentPrices = async (symbols: string[]) => {
    if (symbols.length === 0) return;
    
    setIsLoadingPrices(true);
    try {
      const prices = await fetchCurrentPrices(symbols);
      const pricesMap = prices.reduce((acc, price) => {
        acc[price.symbol] = price;
        return acc;
      }, {} as { [symbol: string]: CurrentPrice });
      
      setCurrentPrices(pricesMap);
      setLastPriceUpdate(new Date());
    } catch (error) {
      console.error('Failed to load current prices:', error);
    } finally {
      setIsLoadingPrices(false);
    }
  };

  const handleDeleteTransaction = async (transactionId: string) => {
    if (!confirm('Are you sure you want to delete this transaction? This action cannot be undone.')) {
      return;
    }

    setDeletingTransactionId(transactionId);
    try {
      await deleteTransaction(transactionId);
      
      // Dispatch a storage event to trigger the portfolio update
      window.dispatchEvent(new Event('storage'));
      
      // Reload transactions
      await loadAllTransactions();
    } catch (error) {
      console.error('Failed to delete transaction:', error);
    } finally {
      setDeletingTransactionId(null);
    }
  };

  const handleDeleteCashTransaction = async (transactionId: string) => {
    if (!confirm('Are you sure you want to delete this cash transaction? This action cannot be undone.')) {
      return;
    }

    setDeletingCashTransactionId(transactionId);
    try {
      await deleteCashTransaction(transactionId);
      
      // Dispatch a storage event to trigger updates
      window.dispatchEvent(new Event('storage'));
      
      // Reload transactions
      await loadAllTransactions();
    } catch (error) {
      console.error('Failed to delete cash transaction:', error);
    } finally {
      setDeletingCashTransactionId(null);
    }
  };

  useEffect(() => {
    loadAllTransactions();

    // Set up IndexedDB change listener
    const dbRequest = indexedDB.open('finchart');
    dbRequest.onsuccess = () => {
      const db = dbRequest.result;
      db.onversionchange = () => {
        db.close();
      };
    };

    // Create a listener for changes
    const handleStorageChange = () => {
      loadAllTransactions();
    };

    // Listen for changes to IndexedDB
    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  const handleRefreshPrices = () => {
    const symbols = Object.keys(transactions);
    if (symbols.length > 0) {
      loadCurrentPrices(symbols);
    }
  };

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'buy':
        return <TrendingUp size={18} className="text-positive" />;
      case 'sell':
        return <TrendingDown size={18} className="text-negative" />;
      case 'dividend':
        return <HandCoins size={18} className="text-yellow-500" />;
      case 'options':
        return <Target size={18} className="text-purple-500" />;
      default:
        return <TrendingUp size={18} className="text-positive" />;
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
      <div className="max-w-6xl mx-auto">
        <div className="animate-pulse">
          <div className="h-8 bg-slate-200 dark:bg-slate-700 rounded w-1/4 mb-8"></div>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-32 bg-slate-200 dark:bg-slate-700 rounded-lg"></div>
            ))}
          </div>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 bg-slate-200 dark:bg-slate-700 rounded-lg"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (Object.keys(transactions).length === 0 && cashTransactions.length === 0) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">Portfolio</h1>
          <p className="text-slate-600 dark:text-slate-400">Track your investments and performance</p>
        </div>
        
        <div className="card text-center py-12">
          <PieChart className="h-16 w-16 text-slate-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
            No investments yet
          </h3>
          <p className="text-slate-600 dark:text-slate-400 mb-6">
            Start building your portfolio by adding transactions for your favorite stocks or cash deposits
          </p>
          <div className="flex justify-center gap-4">
            <button
              onClick={() => setShowAddTransactionDialog(true)}
              className="btn btn-primary flex items-center gap-2"
            >
              <Plus size={16} />
              Add Stock Transaction
            </button>
            <button
              onClick={() => setShowMultipleTransactionsDialog(true)}
              className="btn btn-secondary flex items-center gap-2"
            >
              <Upload size={16} />
              Add Multiple Transactions
            </button>
            <button
              onClick={() => setShowCashDialog(true)}
              className="btn btn-secondary flex items-center gap-2"
            >
              <Wallet size={16} />
              Add Cash
            </button>
          </div>
        </div>
        
        {/* Dialogs */}
        {showAddTransactionDialog && (
          <PortfolioDialog
            symbol="AAPL"
            onClose={() => {
              setShowAddTransactionDialog(false);
              loadAllTransactions();
            }}
          />
        )}
        
        {showMultipleTransactionsDialog && (
          <MultipleTransactionsDialog
            onClose={() => {
              setShowMultipleTransactionsDialog(false);
              loadAllTransactions();
            }}
          />
        )}
        
        {showCashDialog && (
          <CashBalanceDialog onClose={() => setShowCashDialog(false)} />
        )}
      </div>
    );
  }

  return (
    <>
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">Portfolio</h1>
              <p className="text-slate-600 dark:text-slate-400">Track your investments and performance</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowAddTransactionDialog(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-100 dark:bg-blue-900/20 hover:bg-blue-200 dark:hover:bg-blue-900/30 text-blue-700 dark:text-blue-300 transition-colors"
                title="Add single transaction"
              >
                <Plus size={18} />
                <span className="font-medium">Add Transaction</span>
              </button>
              <button
                onClick={() => setShowMultipleTransactionsDialog(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-100 dark:bg-purple-900/20 hover:bg-purple-200 dark:hover:bg-purple-900/30 text-purple-700 dark:text-purple-300 transition-colors"
                title="Add multiple transactions or import CSV"
              >
                <Upload size={18} />
                <span className="font-medium">Bulk Add</span>
              </button>
              <button
                onClick={() => setShowCashDialog(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-100 dark:bg-green-900/20 hover:bg-green-200 dark:hover:bg-green-900/30 text-green-700 dark:text-green-300 transition-colors"
                title="Add cash transaction"
              >
                <Wallet size={18} />
                <span className="font-medium">Add Cash</span>
              </button>
              <button
                onClick={handleRefreshPrices}
                disabled={isLoadingPrices}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors ${
                  isLoadingPrices ? 'opacity-50 cursor-not-allowed' : ''
                }`}
                title="Refresh all prices"
              >
                <RefreshCw 
                  size={18} 
                  className={`text-slate-600 dark:text-slate-400 ${isLoadingPrices ? 'animate-spin' : ''}`} 
                />
                <span className="text-sm font-medium">Refresh Prices</span>
              </button>
            </div>
          </div>
        </div>

        {/* Portfolio Metrics - Prominent Display */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">
          {/* Total Portfolio Value (including cash) */}
          <div className="card bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 border-blue-200 dark:border-blue-700">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-blue-500 rounded-lg">
                <PieChart className="h-5 w-5 text-white" />
              </div>
              <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100">Total Portfolio</h3>
            </div>
            <ValueWithTooltip
              value={totalPortfolioValue}
              displayValue={formatLargeNumber(totalPortfolioValue)}
              className={`font-bold text-blue-900 dark:text-blue-100 mb-1 ${getResponsiveTextSize(formatLargeNumber(totalPortfolioValue))}`}
            />
            <p className="text-sm text-blue-700 dark:text-blue-300">
              Stocks + Cash
            </p>
          </div>

          {/* Cash Balance */}
          <div className="card bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 border-green-200 dark:border-green-700">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-green-500 rounded-lg">
                <Wallet className="h-5 w-5 text-white" />
              </div>
              <h3 className="text-lg font-semibold text-green-900 dark:text-green-100">Cash</h3>
            </div>
            <ValueWithTooltip
              value={cashBalance}
              displayValue={formatLargeNumber(cashBalance)}
              className={`font-bold text-green-900 dark:text-green-100 mb-1 ${getResponsiveTextSize(formatLargeNumber(cashBalance))}`}
            />
            <p className="text-sm text-green-700 dark:text-green-300">
              Available balance
            </p>
          </div>

          {/* Stock Value */}
          <div className="card bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 border-purple-200 dark:border-purple-700">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-purple-500 rounded-lg">
                <DollarSign className="h-5 w-5 text-white" />
              </div>
              <h3 className="text-lg font-semibold text-purple-900 dark:text-purple-100">Stock Value</h3>
            </div>
            <ValueWithTooltip
              value={totalMetrics.totalValue}
              displayValue={formatLargeNumber(totalMetrics.totalValue)}
              className={`font-bold text-purple-900 dark:text-purple-100 mb-1 ${getResponsiveTextSize(formatLargeNumber(totalMetrics.totalValue))}`}
            />
            {lastPriceUpdate && (
              <p className="text-sm text-purple-700 dark:text-purple-300">
                Updated: {lastPriceUpdate.toLocaleTimeString()}
              </p>
            )}
          </div>

          {/* Unrealized Gain/Loss */}
          <div className={`card bg-gradient-to-br border-2 ${
            totalMetrics.totalUnrealizedGainLoss >= 0 
              ? 'from-emerald-50 to-emerald-100 dark:from-emerald-900/20 dark:to-emerald-800/20 border-emerald-200 dark:border-emerald-700'
              : 'from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-800/20 border-red-200 dark:border-red-700'
          }`}>
            <div className="flex items-center gap-3 mb-2">
              <div className={`p-2 rounded-lg ${
                totalMetrics.totalUnrealizedGainLoss >= 0 ? 'bg-emerald-500' : 'bg-red-500'
              }`}>
                <Activity className="h-5 w-5 text-white" />
              </div>
              <h3 className={`text-lg font-semibold ${
                totalMetrics.totalUnrealizedGainLoss >= 0 
                  ? 'text-emerald-900 dark:text-emerald-100' 
                  : 'text-red-900 dark:text-red-100'
              }`}>
                Unrealized
              </h3>
            </div>
            <ValueWithTooltip
              value={totalMetrics.totalUnrealizedGainLoss}
              displayValue={formatLargeNumber(totalMetrics.totalUnrealizedGainLoss)}
              prefix={totalMetrics.totalUnrealizedGainLoss >= 0 ? '+' : ''}
              className={`font-bold mb-1 ${
                totalMetrics.totalUnrealizedGainLoss >= 0 
                  ? 'text-emerald-900 dark:text-emerald-100' 
                  : 'text-red-900 dark:text-red-100'
              } ${getResponsiveTextSize(formatLargeNumber(totalMetrics.totalUnrealizedGainLoss))}`}
            />
            <div className={`text-lg font-semibold ${
              totalMetrics.totalUnrealizedGainLoss >= 0 
                ? 'text-emerald-700 dark:text-emerald-300' 
                : 'text-red-700 dark:text-red-300'
            }`}>
              {totalMetrics.totalGainLossPercent >= 0 ? '+' : ''}{totalMetrics.totalGainLossPercent.toFixed(2)}%
            </div>
          </div>

          {/* Realized Gain/Loss */}
          <div className={`card bg-gradient-to-br border-2 ${
            totalMetrics.totalRealizedGainLoss >= 0 
              ? 'from-cyan-50 to-cyan-100 dark:from-cyan-900/20 dark:to-cyan-800/20 border-cyan-200 dark:border-cyan-700'
              : 'from-orange-50 to-orange-100 dark:from-orange-900/20 dark:to-orange-800/20 border-orange-200 dark:border-orange-700'
          }`}>
            <div className="flex items-center gap-3 mb-2">
              <div className={`p-2 rounded-lg ${
                totalMetrics.totalRealizedGainLoss >= 0 ? 'bg-cyan-500' : 'bg-orange-500'
              }`}>
                {totalMetrics.totalRealizedGainLoss >= 0 ? (
                  <TrendingUp className="h-5 w-5 text-white" />
                ) : (
                  <TrendingDown className="h-5 w-5 text-white" />
                )}
              </div>
              <h3 className={`text-lg font-semibold ${
                totalMetrics.totalRealizedGainLoss >= 0 
                  ? 'text-cyan-900 dark:text-cyan-100' 
                  : 'text-orange-900 dark:text-orange-100'
              }`}>
                Realized
              </h3>
            </div>
            <ValueWithTooltip
              value={totalMetrics.totalRealizedGainLoss}
              displayValue={formatLargeNumber(totalMetrics.totalRealizedGainLoss)}
              prefix={totalMetrics.totalRealizedGainLoss >= 0 ? '+' : ''}
              className={`font-bold mb-1 ${
                totalMetrics.totalRealizedGainLoss >= 0 
                  ? 'text-cyan-900 dark:text-cyan-100' 
                  : 'text-orange-900 dark:text-orange-100'
              } ${getResponsiveTextSize(formatLargeNumber(totalMetrics.totalRealizedGainLoss))}`}
            />
            <p className={`text-sm ${
              totalMetrics.totalRealizedGainLoss >= 0 
                ? 'text-cyan-700 dark:text-cyan-300' 
                : 'text-orange-700 dark:text-orange-300'
            }`}>
              From completed trades
            </p>
          </div>
        </div>

        {/* Cash Transactions */}
        {cashTransactions.length > 0 && (
          <div className="card mb-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                <Wallet className="h-6 w-6 text-primary" />
                Cash Transactions
              </h2>
              <span className="text-sm text-slate-600 dark:text-slate-400">
                Balance: <ValueWithTooltip
                  value={cashBalance}
                  displayValue={formatLargeNumber(cashBalance)}
                  className="font-medium"
                />
              </span>
            </div>
            
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {cashTransactions.slice(0, 10).map((transaction) => (
                <div 
                  key={transaction.id} 
                  className="flex items-center justify-between p-3 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {transaction.type === 'deposit' ? (
                      <TrendingUp size={18} className="text-green-500" />
                    ) : transaction.type === 'withdrawal' ? (
                      <TrendingDown size={18} className="text-red-500" />
                    ) : transaction.type === 'dividend' ? (
                      <HandCoins size={18} className="text-yellow-500" />
                    ) : (
                      <DollarSign size={18} className="text-blue-500" />
                    )}
                    <div>
                      <div className="font-medium">
                        {transaction.description}
                      </div>
                      <div className="text-sm text-slate-600 dark:text-slate-400">
                        {new Date(transaction.date).toLocaleDateString()}
                        {(transaction.type === 'realized_gain' || transaction.type === 'dividend') && (
                          <span className="ml-2 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded">
                            Auto-generated
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <ValueWithTooltip
                      value={Math.abs(transaction.amount)}
                      displayValue={formatLargeNumber(Math.abs(transaction.amount))}
                      prefix={transaction.type === 'withdrawal' ? '-' : '+'}
                      className={`font-bold ${
                        transaction.type === 'withdrawal' ? 'text-red-600' : 'text-green-600'
                      } ${getResponsiveTextSize(formatLargeNumber(Math.abs(transaction.amount)), 'text-lg')}`}
                    />
                    {(transaction.type !== 'realized_gain' && transaction.type !== 'dividend') && (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setEditingCashTransaction(transaction)}
                          className="p-1 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-full transition-colors"
                          title="Edit cash transaction"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => handleDeleteCashTransaction(transaction.id)}
                          disabled={deletingCashTransactionId === transaction.id}
                          className={`p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-full transition-colors ${
                            deletingCashTransactionId === transaction.id ? 'opacity-50 cursor-not-allowed' : ''
                          }`}
                          title="Delete cash transaction"
                        >
                          <Trash2 size={14} className="text-red-500" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            
            {cashTransactions.length > 10 && (
              <div className="mt-4 text-center">
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Showing 10 of {cashTransactions.length} cash transactions
                </p>
              </div>
            )}
          </div>
        )}

        {/* Holdings */}
        {Object.keys(transactions).length > 0 && (
          <div className="card">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Holdings</h2>
              <span className="text-sm text-slate-600 dark:text-slate-400">
                {Object.keys(transactions).length} position{Object.keys(transactions).length !== 1 ? 's' : ''}
              </span>
            </div>
            
            <div className="space-y-4">
              {Object.entries(transactions).map(([symbol, symbolTransactions]) => {
                const calc = portfolioCalculations[symbol];
                const hasCurrentPrice = calc?.currentPrice !== undefined;
                
                return (
                  <div key={symbol} className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50">
                      <div className="flex items-center gap-4">
                        <div>
                          <div className="flex items-center gap-3">
                            <h3 className="text-xl font-bold text-slate-900 dark:text-white">{symbol}</h3>
                            <button
                              onClick={() => onSymbolSelect(symbol)}
                              className="flex items-center gap-1 px-2 py-1 text-sm text-primary hover:text-primary-dark bg-primary/10 hover:bg-primary/20 rounded-md transition-colors"
                              title="View chart"
                            >
                              <span>View</span>
                              <ArrowRight size={14} />
                            </button>
                          </div>
                          <div className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                            {calc.totalShares.toFixed(4)} shares
                            {calc.averageCostPerShare > 0 && (
                              <span className="ml-2">• Avg: {formatCurrency(calc.averageCostPerShare)}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      <div className="text-right">
                        {hasCurrentPrice ? (
                          <div>
                            <ValueWithTooltip
                              value={calc.currentValue}
                              displayValue={formatLargeNumber(calc.currentValue)}
                              className={`font-bold text-slate-900 dark:text-white ${getResponsiveTextSize(formatLargeNumber(calc.currentValue), 'text-xl')}`}
                            />
                            <div className={`text-sm font-semibold ${
                              calc.unrealizedGainLoss >= 0 ? 'text-positive' : 'text-negative'
                            }`}>
                              <ValueWithTooltip
                                value={calc.unrealizedGainLoss}
                                displayValue={formatLargeNumber(calc.unrealizedGainLoss)}
                                prefix={calc.unrealizedGainLoss >= 0 ? '+' : ''}
                              /> ({calc.gainLossPercent >= 0 ? '+' : ''}{calc.gainLossPercent.toFixed(2)}%)
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400">
                              @ {formatCurrency(calc.currentPrice!)}
                            </div>
                            {calc.realizedGainLoss !== 0 && (
                              <div className={`text-xs font-medium ${
                                calc.realizedGainLoss >= 0 ? 'text-emerald-600' : 'text-orange-600'
                              }`}>
                                Realized: <ValueWithTooltip
                                  value={calc.realizedGainLoss}
                                  displayValue={formatLargeNumber(calc.realizedGainLoss)}
                                  prefix={calc.realizedGainLoss >= 0 ? '+' : ''}
                                />
                              </div>
                            )}
                          </div>
                        ) : (
                          <div>
                            <ValueWithTooltip
                              value={calc.currentValue || calc.costBasis}
                              displayValue={formatLargeNumber(calc.currentValue || calc.costBasis)}
                              className={`font-bold text-slate-900 dark:text-white ${getResponsiveTextSize(formatLargeNumber(calc.currentValue || calc.costBasis), 'text-xl')}`}
                            />
                            <div className="text-sm text-slate-600 dark:text-slate-400">
                              Cost basis
                            </div>
                            {calc.realizedGainLoss !== 0 && (
                              <div className={`text-xs font-medium ${
                                calc.realizedGainLoss >= 0 ? 'text-emerald-600' : 'text-orange-600'
                              }`}>
                                Realized: <ValueWithTooltip
                                  value={calc.realizedGainLoss}
                                  displayValue={formatLargeNumber(calc.realizedGainLoss)}
                                  prefix={calc.realizedGainLoss >= 0 ? '+' : ''}
                                />
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {expandedSymbol === symbol && (
                      <div className="border-t border-slate-200 dark:border-slate-700">
                        <div className="divide-y divide-slate-200 dark:divide-slate-700">
                          {symbolTransactions.map((transaction) => (
                            <div key={transaction.id} className="p-4 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-3">
                                  {getTransactionIcon(transaction.type)}
                                  <div>
                                    <div className="font-semibold">
                                      {getTransactionLabel(transaction.type)} {transaction.shares} {transaction.type === 'options' ? 'contracts' : 'shares'}
                                      {transaction.type === 'dividend' && transaction.isDrip && (
                                        <span className="ml-2 text-xs bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 px-2 py-0.5 rounded">
                                          DRIP
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-sm text-slate-600 dark:text-slate-400">
                                      {new Date(transaction.date).toLocaleDateString()}
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-3">
                                  <div className="text-right">
                                    <ValueWithTooltip
                                      value={transaction.price * transaction.shares}
                                      displayValue={formatLargeNumber(transaction.price * transaction.shares)}
                                      className={`font-semibold ${getResponsiveTextSize(formatLargeNumber(transaction.price * transaction.shares), 'text-base')}`}
                                    />
                                    <div className="text-sm text-slate-600 dark:text-slate-400">
                                      @ {formatCurrency(transaction.price)}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <button
                                      onClick={() => setEditingTransaction(transaction)}
                                      className="p-1 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-full transition-colors"
                                      title="Edit transaction"
                                    >
                                      <Edit2 size={14} />
                                    </button>
                                    <button
                                      onClick={() => handleDeleteTransaction(transaction.id)}
                                      disabled={deletingTransactionId === transaction.id}
                                      className={`p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-full transition-colors ${
                                        deletingTransactionId === transaction.id ? 'opacity-50 cursor-not-allowed' : ''
                                      }`}
                                      title="Delete transaction"
                                    >
                                      <Trash2 size={14} className="text-red-500" />
                                    </button>
                                  </div>
                                </div>
                              </div>
                              
                              {transaction.fees > 0 && (
                                <div className="text-sm text-slate-600 dark:text-slate-400 ml-9">
                                  Fees: {formatCurrency(transaction.fees)}
                                </div>
                              )}
                              
                              {transaction.notes && (
                                <div className="mt-2 text-sm text-slate-600 dark:text-slate-400 ml-9">
                                  {transaction.notes}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    <div className="border-t border-slate-200 dark:border-slate-700 p-3 bg-slate-25 dark:bg-slate-800/25">
                      <button
                        onClick={() => setExpandedSymbol(expandedSymbol === symbol ? null : symbol)}
                        className="w-full text-center text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-medium transition-colors"
                      >
                        {expandedSymbol === symbol ? 'Hide' : 'Show'} {symbolTransactions.length} transaction{symbolTransactions.length !== 1 ? 's' : ''}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Dialogs */}
      {showAddTransactionDialog && (
        <PortfolioDialog
          symbol="AAPL"
          onClose={() => {
            setShowAddTransactionDialog(false);
            loadAllTransactions();
          }}
        />
      )}

      {showMultipleTransactionsDialog && (
        <MultipleTransactionsDialog
          onClose={() => {
            setShowMultipleTransactionsDialog(false);
            loadAllTransactions();
          }}
        />
      )}

      {editingTransaction && (
        <PortfolioDialog
          symbol={editingTransaction.symbol}
          transaction={editingTransaction}
          onClose={() => {
            setEditingTransaction(null);
            loadAllTransactions();
          }}
        />
      )}

      {(showCashDialog || editingCashTransaction) && (
        <CashBalanceDialog
          transaction={editingCashTransaction || undefined}
          onClose={() => {
            setShowCashDialog(false);
            setEditingCashTransaction(null);
            loadAllTransactions();
          }}
        />
      )}
    </>
  );
};

export default PortfolioDisplay;