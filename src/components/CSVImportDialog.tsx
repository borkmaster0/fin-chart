import React, { useState, useRef } from 'react';
import { X, Upload, FileText, AlertTriangle, CheckCircle, Download, Info, Edit2, Save, RotateCcw, ChevronLeft, ChevronRight } from 'lucide-react';
import { addTransaction, addCashTransaction } from '../utils/db';

interface CSVRow {
  [key: string]: string;
}

interface ParsedTransaction {
  id: string;
  type: 'stock' | 'cash' | 'skip';
  symbol?: string;
  date: string;
  transactionType: 'buy' | 'sell' | 'dividend' | 'options' | 'deposit' | 'withdrawal';
  shares?: number;
  price?: number;
  amount?: number;
  fees?: number;
  description: string;
  originalRow: CSVRow;
  rowIndex: number;
  isEdited?: boolean;
  isDrip?: boolean; // New field for DRIP status
}

interface CSVImportDialogProps {
  onClose: () => void;
}

const CSVImportDialog: React.FC<CSVImportDialogProps> = ({ onClose }) => {
  const [csvData, setCsvData] = useState<string>('');
  const [parsedTransactions, setParsedTransactions] = useState<ParsedTransaction[]>([]);
  const [selectedTransactions, setSelectedTransactions] = useState<Set<string>>(new Set());
  const [editingTransaction, setEditingTransaction] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [importResults, setImportResults] = useState<{
    successful: number;
    failed: number;
    errors: string[];
  } | null>(null);
  const [step, setStep] = useState<'upload' | 'review' | 'results'>('upload');
  const [currentPage, setCurrentPage] = useState(1);
  const [transactionsPerPage] = useState(100);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Calculate pagination
  const totalPages = Math.ceil(parsedTransactions.length / transactionsPerPage);
  const startIndex = (currentPage - 1) * transactionsPerPage;
  const endIndex = startIndex + transactionsPerPage;
  const currentTransactions = parsedTransactions.slice(startIndex, endIndex);

  // Get today's date in YYYY-MM-DD format
  const getTodayDate = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const parseCSV = (csvText: string): CSVRow[] => {
    const lines = csvText.trim().split('\n');
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    const rows: CSVRow[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
      if (values.length >= headers.length) {
        const row: CSVRow = {};
        headers.forEach((header, index) => {
          row[header] = values[index] || '';
        });
        rows.push(row);
      }
    }

    return rows;
  };

  const parseDate = (dateStr: string): string => {
    if (!dateStr) return getTodayDate();

    // Handle various date formats
    let date: Date;
    
    // Try MM/DD/YYYY format first (most common in US CSV exports)
    if (dateStr.includes('/')) {
      const parts = dateStr.split('/');
      if (parts.length === 3) {
        const [month, day, year] = parts;
        // Handle 2-digit years by assuming 20xx
        const fullYear = year.length === 2 ? `20${year}` : year;
        date = new Date(parseInt(fullYear), parseInt(month) - 1, parseInt(day));
      } else {
        date = new Date(dateStr);
      }
    } else if (dateStr.includes('-')) {
      // Handle YYYY-MM-DD format
      date = new Date(dateStr);
    } else {
      // Try to parse as-is
      date = new Date(dateStr);
    }

    if (isNaN(date.getTime())) {
      console.warn(`Could not parse date: ${dateStr}, using today's date`);
      return getTodayDate();
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const extractSymbol = (symbolStr: string, descriptionStr: string): string => {
    if (!symbolStr && !descriptionStr) return '';
    
    // Clean up symbol string
    let symbol = symbolStr.trim().toUpperCase();
    
    // Remove option suffixes (e.g., "ACHR--250606C00013500" -> "ACHR")
    if (symbol.includes('--')) {
      symbol = symbol.split('--')[0];
    }
    
    // Remove option date suffixes (e.g., "ACHR Jun 06 '25 $13.50 Call" -> "ACHR")
    if (symbol.includes(' ')) {
      symbol = symbol.split(' ')[0];
    }
    
    // If no symbol, try to extract from description
    if (!symbol && descriptionStr) {
      const words = descriptionStr.toUpperCase().split(' ');
      for (const word of words) {
        if (word.length >= 2 && word.length <= 5 && /^[A-Z]+$/.test(word)) {
          symbol = word;
          break;
        }
      }
    }
    
    return symbol;
  };

  const determineTransactionType = (
    transactionType: string,
    securityType: string,
    quantity: string,
    amount: string,
    description: string,
    symbol: string
  ): { type: 'stock' | 'cash' | 'skip'; transactionType: 'buy' | 'sell' | 'dividend' | 'options' | 'deposit' | 'withdrawal'; isDrip?: boolean } => {
    const desc = description.toLowerCase();
    const qty = parseFloat(quantity) || 0;
    const amt = parseFloat(amount) || 0;
    const txnType = transactionType.toLowerCase();
    
    // Skip certain transaction types
    if (desc.includes('transfer') || desc.includes('trnsfr') || 
        desc.includes('market data fee') || desc.includes('interest')) {
      return { type: 'skip', transactionType: 'buy' };
    }
    
    // Options detection - check for option indicators in symbol or description
    const isOption = symbol.includes('--') || 
                    desc.includes('call') || desc.includes('put') || 
                    desc.includes('option') || txnType.includes('optn') ||
                    /\d{2}\/\d{2}\/\d{2,4}/.test(desc) || // Date pattern in description
                    /\$\d+(\.\d{2})?\s+(call|put)/i.test(desc); // Strike price pattern
    
    if (isOption) {
      return { type: 'stock', transactionType: 'options' };
    }
    
    // Cash transactions
    if (desc.includes('ach withdrawl') || desc.includes('withdrawal')) {
      return { type: 'cash', transactionType: 'withdrawal' };
    }
    
    // Improved dividend detection - check for dividend keywords and positive amount with zero quantity
    if (desc.includes('dividend') || desc.includes('div ')) {
      if (qty > 0) {
        // Dividend reinvestment (shares purchased with dividend) - DRIP
        return { type: 'stock', transactionType: 'dividend', isDrip: true };
      } else if (amt > 0 && qty === 0) {
        // Cash dividend payment - non-DRIP
        return { type: 'stock', transactionType: 'dividend', isDrip: false };
      }
    }
    
    // Regular deposits (positive amount, no quantity, no dividend mention)
    if (amt > 0 && qty === 0 && !desc.includes('dividend')) {
      return { type: 'cash', transactionType: 'deposit' };
    }
    
    // Stock transactions based on quantity
    if (qty !== 0) {
      if (qty > 0) {
        return { type: 'stock', transactionType: 'buy' };
      } else if (qty < 0) {
        return { type: 'stock', transactionType: 'sell' };
      }
    }
    
    return { type: 'skip', transactionType: 'buy' };
  };

  const parseTransactions = (csvRows: CSVRow[]): ParsedTransaction[] => {
    const transactions: ParsedTransaction[] = [];

    csvRows.forEach((row, index) => {
      const date = parseDate(row.TransactionDate || row.Date || '');
      const symbol = extractSymbol(row.Symbol || '', row.Description || '');
      const quantity = row.Quantity || '0';
      const amount = row.Amount || '0';
      const price = row.Price || '0';
      const commission = row.Commission || '0';
      const description = row.Description || '';
      const transactionType = row.TransactionType || '';
      const securityType = row.SecurityType || '';

      const { type, transactionType: txnType, isDrip } = determineTransactionType(
        transactionType, securityType, quantity, amount, description, symbol
      );

      if (type === 'skip') return;

      const parsedTransaction: ParsedTransaction = {
        id: crypto.randomUUID(),
        type,
        date,
        transactionType: txnType,
        description: description || `${txnType} transaction`,
        originalRow: row,
        rowIndex: index,
        isDrip: isDrip
      };

      if (type === 'stock') {
        parsedTransaction.symbol = symbol;
        parsedTransaction.shares = Math.abs(parseFloat(quantity));
        parsedTransaction.price = Math.abs(parseFloat(price));
        parsedTransaction.fees = Math.abs(parseFloat(commission));
        
        // For dividend payments with amount but no price, calculate price from amount/shares
        if (txnType === 'dividend' && parsedTransaction.shares > 0 && parseFloat(amount) !== 0) {
          const dividendAmount = Math.abs(parseFloat(amount));
          parsedTransaction.price = dividendAmount / parsedTransaction.shares;
        }
        
        // For cash dividends (amount > 0, shares = 0), treat as cash transaction
        if (txnType === 'dividend' && parseFloat(quantity) === 0 && parseFloat(amount) > 0) {
          parsedTransaction.type = 'cash';
          parsedTransaction.transactionType = 'deposit';
          parsedTransaction.amount = Math.abs(parseFloat(amount));
          parsedTransaction.description = `Dividend payment: ${description}`;
          delete parsedTransaction.symbol;
          delete parsedTransaction.shares;
          delete parsedTransaction.price;
          delete parsedTransaction.fees;
          delete parsedTransaction.isDrip;
        }
        
        // For options, use special handling
        if (txnType === 'options') {
          // Options contracts are typically in units of 100 shares
          if (parsedTransaction.shares > 100) {
            parsedTransaction.shares = parsedTransaction.shares / 100;
          }
          parsedTransaction.description = `${description}`;
        }
      } else if (type === 'cash') {
        parsedTransaction.amount = Math.abs(parseFloat(amount));
      }

      transactions.push(parsedTransaction);
    });

    return transactions;
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setCsvData(text);
      
      try {
        const csvRows = parseCSV(text);
        const parsed = parseTransactions(csvRows);
        setParsedTransactions(parsed);
        setSelectedTransactions(new Set(parsed.map(t => t.id)));
        setCurrentPage(1); // Reset to first page
        setStep('review');
      } catch (error) {
        console.error('Error parsing CSV:', error);
      }
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    setIsProcessing(true);
    const results = { successful: 0, failed: 0, errors: [] as string[] };

    try {
      for (const transactionId of selectedTransactions) {
        const transaction = parsedTransactions.find(t => t.id === transactionId);
        if (!transaction) continue;
        
        try {
          if (transaction.type === 'stock') {
            await addTransaction({
              symbol: transaction.symbol!,
              date: transaction.date,
              type: transaction.transactionType as 'buy' | 'sell' | 'dividend' | 'options',
              shares: transaction.shares!,
              price: transaction.price!,
              fees: transaction.fees || 0,
              notes: `Imported: ${transaction.description}`,
              isDrip: transaction.transactionType === 'dividend' ? transaction.isDrip : undefined
            });
          } else if (transaction.type === 'cash') {
            await addCashTransaction({
              date: transaction.date,
              type: transaction.transactionType as 'deposit' | 'withdrawal',
              amount: transaction.amount!,
              description: `Imported: ${transaction.description}`
            });
          }
          results.successful++;
        } catch (error) {
          results.failed++;
          results.errors.push(`Row ${transaction.rowIndex + 2}: ${error}`);
        }
      }

      setImportResults(results);
      setStep('results');

      // Dispatch storage event to trigger updates
      window.dispatchEvent(new Event('storage'));
    } catch (error) {
      console.error('Import failed:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleTransaction = (id: string) => {
    const newSelected = new Set(selectedTransactions);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedTransactions(newSelected);
  };

  const toggleAll = () => {
    if (selectedTransactions.size === parsedTransactions.length) {
      setSelectedTransactions(new Set());
    } else {
      setSelectedTransactions(new Set(parsedTransactions.map(t => t.id)));
    }
  };

  const toggleCurrentPage = () => {
    const currentPageTransactionIds = currentTransactions.map(t => t.id);
    const allCurrentSelected = currentPageTransactionIds.every(id => selectedTransactions.has(id));
    
    const newSelected = new Set(selectedTransactions);
    
    if (allCurrentSelected) {
      // Deselect all on current page
      currentPageTransactionIds.forEach(id => newSelected.delete(id));
    } else {
      // Select all on current page
      currentPageTransactionIds.forEach(id => newSelected.add(id));
    }
    
    setSelectedTransactions(newSelected);
  };

  const updateTransaction = (id: string, field: keyof ParsedTransaction, value: any) => {
    setParsedTransactions(prev => prev.map(t => 
      t.id === id ? { ...t, [field]: value, isEdited: true } : t
    ));
  };

  const resetTransaction = (id: string) => {
    const transaction = parsedTransactions.find(t => t.id === id);
    if (!transaction) return;

    // Re-parse the original row
    const originalRow = transaction.originalRow;
    const date = parseDate(originalRow.TransactionDate || originalRow.Date || '');
    const symbol = extractSymbol(originalRow.Symbol || '', originalRow.Description || '');
    const quantity = originalRow.Quantity || '0';
    const amount = originalRow.Amount || '0';
    const price = originalRow.Price || '0';
    const commission = originalRow.Commission || '0';
    const description = originalRow.Description || '';
    const transactionType = originalRow.TransactionType || '';
    const securityType = originalRow.SecurityType || '';

    const { type, transactionType: txnType, isDrip } = determineTransactionType(
      transactionType, securityType, quantity, amount, description, symbol
    );

    const resetData: Partial<ParsedTransaction> = {
      type,
      date,
      transactionType: txnType,
      description: description || `${txnType} transaction`,
      isEdited: false,
      isDrip: isDrip
    };

    if (type === 'stock') {
      resetData.symbol = symbol;
      resetData.shares = Math.abs(parseFloat(quantity));
      resetData.price = Math.abs(parseFloat(price));
      resetData.fees = Math.abs(parseFloat(commission));
      resetData.amount = undefined;
      
      // Handle dividend special cases
      if (txnType === 'dividend' && resetData.shares! > 0 && parseFloat(amount) !== 0) {
        const dividendAmount = Math.abs(parseFloat(amount));
        resetData.price = dividendAmount / resetData.shares!;
      }
      
      if (txnType === 'dividend' && parseFloat(quantity) === 0 && parseFloat(amount) > 0) {
        resetData.type = 'cash';
        resetData.transactionType = 'deposit';
        resetData.amount = Math.abs(parseFloat(amount));
        resetData.description = `Dividend payment: ${description}`;
        resetData.symbol = undefined;
        resetData.shares = undefined;
        resetData.price = undefined;
        resetData.fees = undefined;
        resetData.isDrip = undefined;
      }
      
      // Handle options special cases
      if (txnType === 'options') {
        if (resetData.shares! > 100) {
          resetData.shares = resetData.shares! / 100;
        }
        resetData.description = `Options: ${description}`;
      }
    } else if (type === 'cash') {
      resetData.amount = Math.abs(parseFloat(amount));
      resetData.symbol = undefined;
      resetData.shares = undefined;
      resetData.price = undefined;
      resetData.fees = undefined;
      resetData.isDrip = undefined;
    }

    setParsedTransactions(prev => prev.map(t => 
      t.id === id ? { ...t, ...resetData } : t
    ));
  };

  const downloadSampleCSV = () => {
    const sampleData = [
      'TransactionDate,TransactionType,SecurityType,Symbol,Quantity,Amount,Price,Commission,Description',
      '6/9/2025,BUY,EQ,AAPL,100,-15000,150.00,4.95,APPLE INC COMMON STOCK',
      '6/8/2025,SELL,EQ,MSFT,-50,17500,350.00,4.95,MICROSOFT CORP COMMON STOCK',
      '6/7/2025,DIV,EQ,AAPL,0,125,0,0,APPLE INC DIVIDEND PAYMENT',
      '6/7/2025,DIV,EQ,AAPL,2.5,125,50.00,0,APPLE INC DIVIDEND REINVESTMENT',
      '6/6/2025,OPTN,OPT,AAPL--250620C00150000,1,500,5.00,1.00,AAPL Jun 20 25 $150 Call',
      '6/5/2025,DEPOSIT,,,-,1000,0,0,CASH DEPOSIT',
      '6/4/2025,WITHDRAWAL,,,-,-500,0,0,CASH WITHDRAWAL'
    ].join('\n');

    const blob = new Blob([sampleData], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sample_transactions.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
    setEditingTransaction(null); // Close any open edits when changing pages
  };

  const currentPageSelectedCount = currentTransactions.filter(t => selectedTransactions.has(t.id)).length;
  const allCurrentPageSelected = currentTransactions.length > 0 && currentPageSelectedCount === currentTransactions.length;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-7xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Upload size={20} className="text-primary" />
            Import Transactions from CSV
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {step === 'upload' && (
            <div className="space-y-6">
              <div className="text-center">
                <FileText className="w-16 h-16 text-slate-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">Upload Your Transaction History</h3>
                <p className="text-slate-600 dark:text-slate-400 mb-6">
                  Import transactions from your brokerage CSV export. We support most common formats.
                </p>
              </div>

              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <Info className="w-5 h-5 text-blue-500 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">Supported Transaction Types</h4>
                    <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
                      <li>• <strong>Stock Transactions:</strong> Buy, Sell, Dividend payments & reinvestments (DRIP)</li>
                      <li>• <strong>Options Transactions:</strong> Calls, Puts, and other derivatives</li>
                      <li>• <strong>Cash Transactions:</strong> Deposits, Withdrawals, Dividend payments</li>
                      <li>• <strong>Smart Detection:</strong> Automatically categorizes options, dividends, and DRIP transactions</li>
                      <li>• <strong>Edit Before Import:</strong> Review, edit, and select which transactions to import</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg p-8 text-center hover:border-primary transition-colors">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <Upload className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="btn btn-primary mb-2"
                  >
                    Choose CSV File
                  </button>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Select your transaction history CSV file
                  </p>
                </div>

                <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-6">
                  <h4 className="font-medium mb-3">Expected CSV Format</h4>
                  <div className="text-sm text-slate-600 dark:text-slate-400 space-y-2">
                    <p><strong>Required columns:</strong></p>
                    <ul className="list-disc list-inside space-y-1 ml-2">
                      <li>TransactionDate or Date</li>
                      <li>Symbol (for stock/options transactions)</li>
                      <li>Quantity or Shares</li>
                      <li>Amount or Price</li>
                      <li>Commission (fees)</li>
                      <li>Description</li>
                    </ul>
                    <button
                      onClick={downloadSampleCSV}
                      className="btn btn-secondary flex items-center gap-2 mt-4"
                    >
                      <Download size={16} />
                      Download Sample CSV
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 'review' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Review & Edit Parsed Transactions</h3>
                <div className="flex items-center gap-4">
                  <span className="text-sm text-slate-600 dark:text-slate-400">
                    {selectedTransactions.size} of {parsedTransactions.length} selected
                  </span>
                  <button
                    onClick={toggleAll}
                    className="btn btn-secondary text-sm"
                  >
                    {selectedTransactions.size === parsedTransactions.length ? 'Deselect All' : 'Select All'}
                  </button>
                </div>
              </div>

              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-amber-900 dark:text-amber-100 mb-1">Review & Edit Before Importing</h4>
                    <p className="text-sm text-amber-800 dark:text-amber-200">
                      Click the edit button to modify any transaction details. You can change transaction types (e.g., deposit → dividend, buy → options).
                      Use the reset button to restore original parsed values. Options, dividends, and DRIP transactions are automatically detected and categorized.
                    </p>
                  </div>
                </div>
              </div>

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-700 rounded-lg p-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-600 dark:text-slate-400">
                      Showing {startIndex + 1}-{Math.min(endIndex, parsedTransactions.length)} of {parsedTransactions.length} transactions
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-500">
                      (Page {currentPage} of {totalPages})
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => goToPage(currentPage - 1)}
                      disabled={currentPage === 1}
                      className="p-2 rounded-md hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      title="Previous page"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    
                    {/* Page numbers */}
                    <div className="flex items-center gap-1">
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        let pageNum;
                        if (totalPages <= 5) {
                          pageNum = i + 1;
                        } else if (currentPage <= 3) {
                          pageNum = i + 1;
                        } else if (currentPage >= totalPages - 2) {
                          pageNum = totalPages - 4 + i;
                        } else {
                          pageNum = currentPage - 2 + i;
                        }
                        
                        return (
                          <button
                            key={pageNum}
                            onClick={() => goToPage(pageNum)}
                            className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                              currentPage === pageNum
                                ? 'bg-primary text-white'
                                : 'hover:bg-slate-200 dark:hover:bg-slate-600'
                            }`}
                          >
                            {pageNum}
                          </button>
                        );
                      })}
                    </div>
                    
                    <button
                      onClick={() => goToPage(currentPage + 1)}
                      disabled={currentPage === totalPages}
                      className="p-2 rounded-md hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      title="Next page"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              )}

              <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-lg">
                <table className="w-full">
                  <thead className="bg-slate-50 dark:bg-slate-700 sticky top-0">
                    <tr>
                      <th className="text-left p-3 font-medium text-slate-600 dark:text-slate-400">
                        <input
                          type="checkbox"
                          checked={allCurrentPageSelected}
                          onChange={toggleCurrentPage}
                          className="form-checkbox h-4 w-4 text-primary rounded"
                          title={`${allCurrentPageSelected ? 'Deselect' : 'Select'} all on this page`}
                        />
                      </th>
                      <th className="text-left p-3 font-medium text-slate-600 dark:text-slate-400">Date</th>
                      <th className="text-left p-3 font-medium text-slate-600 dark:text-slate-400">Type</th>
                      <th className="text-left p-3 font-medium text-slate-600 dark:text-slate-400">Symbol</th>
                      <th className="text-left p-3 font-medium text-slate-600 dark:text-slate-400">Shares</th>
                      <th className="text-left p-3 font-medium text-slate-600 dark:text-slate-400">Price</th>
                      <th className="text-left p-3 font-medium text-slate-600 dark:text-slate-400">Fees</th>
                      <th className="text-left p-3 font-medium text-slate-600 dark:text-slate-400">Amount</th>
                      <th className="text-left p-3 font-medium text-slate-600 dark:text-slate-400">DRIP</th>
                      <th className="text-left p-3 font-medium text-slate-600 dark:text-slate-400">Description</th>
                      <th className="text-left p-3 font-medium text-slate-600 dark:text-slate-400">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                    {currentTransactions.map((transaction) => (
                      <tr 
                        key={transaction.id}
                        className={`hover:bg-slate-50 dark:hover:bg-slate-700/50 ${
                          selectedTransactions.has(transaction.id) ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                        } ${transaction.isEdited ? 'bg-yellow-50 dark:bg-yellow-900/20' : ''}`}
                      >
                        <td className="p-3">
                          <input
                            type="checkbox"
                            checked={selectedTransactions.has(transaction.id)}
                            onChange={() => toggleTransaction(transaction.id)}
                            className="form-checkbox h-4 w-4 text-primary rounded"
                          />
                        </td>
                        <td className="p-3">
                          {editingTransaction === transaction.id ? (
                            <input
                              type="date"
                              value={transaction.date}
                              onChange={(e) => updateTransaction(transaction.id, 'date', e.target.value)}
                              className="input text-xs w-32"
                            />
                          ) : (
                            <span className="text-sm">{transaction.date}</span>
                          )}
                        </td>
                        <td className="p-3">
                          {editingTransaction === transaction.id ? (
                            <select
                              value={transaction.transactionType}
                              onChange={(e) => {
                                const newType = e.target.value;
                                updateTransaction(transaction.id, 'transactionType', newType);
                                
                                // Auto-switch between stock and cash based on transaction type
                                if (['buy', 'sell', 'dividend', 'options'].includes(newType)) {
                                  updateTransaction(transaction.id, 'type', 'stock');
                                  // Set default DRIP status for dividends
                                  if (newType === 'dividend') {
                                    updateTransaction(transaction.id, 'isDrip', false);
                                  }
                                } else {
                                  updateTransaction(transaction.id, 'type', 'cash');
                                  updateTransaction(transaction.id, 'isDrip', undefined);
                                }
                              }}
                              className="input text-xs w-20"
                            >
                              <option value="buy">Buy</option>
                              <option value="sell">Sell</option>
                              <option value="dividend">Dividend</option>
                              <option value="options">Options</option>
                              <option value="deposit">Deposit</option>
                              <option value="withdrawal">Withdrawal</option>
                            </select>
                          ) : (
                            <span className={`px-2 py-1 rounded-md text-xs font-medium ${
                              transaction.type === 'stock' 
                                ? transaction.transactionType === 'buy' 
                                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                                  : transaction.transactionType === 'sell'
                                  ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                                  : transaction.transactionType === 'options'
                                  ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                                  : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300'
                                : transaction.transactionType === 'deposit'
                                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                                : 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300'
                            }`}>
                              {transaction.transactionType}
                            </span>
                          )}
                        </td>
                        <td className="p-3">
                          {editingTransaction === transaction.id && transaction.type === 'stock' ? (
                            <input
                              type="text"
                              value={transaction.symbol || ''}
                              onChange={(e) => updateTransaction(transaction.id, 'symbol', e.target.value.toUpperCase())}
                              className="input text-xs w-16"
                              placeholder="AAPL"
                            />
                          ) : (
                            <span className="text-sm font-medium">{transaction.symbol || '-'}</span>
                          )}
                        </td>
                        <td className="p-3">
                          {editingTransaction === transaction.id && transaction.type === 'stock' ? (
                            <input
                              type="number"
                              min="0"
                              step="0.000001"
                              value={transaction.shares || ''}
                              onChange={(e) => updateTransaction(transaction.id, 'shares', parseFloat(e.target.value) || 0)}
                              className="input text-xs w-20"
                              placeholder="100"
                            />
                          ) : (
                            <span className="text-sm">{transaction.shares || '-'}</span>
                          )}
                        </td>
                        <td className="p-3">
                          {editingTransaction === transaction.id && transaction.type === 'stock' ? (
                            <input
                              type="number"
                              min="0"
                              step="0.000001"
                              value={transaction.price || ''}
                              onChange={(e) => updateTransaction(transaction.id, 'price', parseFloat(e.target.value) || 0)}
                              className="input text-xs w-20"
                              placeholder="150.00"
                            />
                          ) : (
                            <span className="text-sm">{transaction.price ? `$${transaction.price.toFixed(2)}` : '-'}</span>
                          )}
                        </td>
                        <td className="p-3">
                          {editingTransaction === transaction.id && transaction.type === 'stock' ? (
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={transaction.fees || ''}
                              onChange={(e) => updateTransaction(transaction.id, 'fees', parseFloat(e.target.value) || 0)}
                              className="input text-xs w-16"
                              placeholder="0.00"
                            />
                          ) : (
                            <span className="text-sm">{transaction.fees ? `$${transaction.fees.toFixed(2)}` : '-'}</span>
                          )}
                        </td>
                        <td className="p-3">
                          {editingTransaction === transaction.id && (transaction.type === 'cash' || (transaction.transactionType === 'dividend' && !transaction.isDrip)) ? (
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={transaction.amount || ''}
                              onChange={(e) => updateTransaction(transaction.id, 'amount', parseFloat(e.target.value) || 0)}
                              className="input text-xs w-20"
                              placeholder="0.01"
                            />
                          ) : (
                            <span className="text-sm">{transaction.amount ? `$${transaction.amount.toFixed(2)}` : '-'}</span>
                          )}
                        </td>
                        <td className="p-3">
                          {transaction.transactionType === 'dividend' && transaction.type === 'stock' ? (
                            editingTransaction === transaction.id ? (
                              <input
                                type="checkbox"
                                checked={transaction.isDrip || false}
                                onChange={(e) => updateTransaction(transaction.id, 'isDrip', e.target.checked)}
                                className="form-checkbox h-4 w-4 text-yellow-500 rounded"
                              />
                            ) : (
                              <span className={`px-2 py-1 rounded-md text-xs font-medium ${
                                transaction.isDrip 
                                  ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300'
                                  : 'bg-gray-100 dark:bg-gray-900/30 text-gray-700 dark:text-gray-300'
                              }`}>
                                {transaction.isDrip ? 'Yes' : 'No'}
                              </span>
                            )
                          ) : (
                            <span className="text-sm text-slate-400">-</span>
                          )}
                        </td>
                        <td className="p-3">
                          {editingTransaction === transaction.id ? (
                            <input
                              type="text"
                              value={transaction.description}
                              onChange={(e) => updateTransaction(transaction.id, 'description', e.target.value)}
                              className="input text-xs w-32"
                              placeholder="Description..."
                            />
                          ) : (
                            <span className="text-sm text-slate-600 dark:text-slate-400 max-w-xs truncate block">
                              {transaction.description}
                            </span>
                          )}
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-1">
                            {editingTransaction === transaction.id ? (
                              <button
                                onClick={() => setEditingTransaction(null)}
                                className="p-1 hover:bg-green-100 dark:hover:bg-green-900/30 rounded transition-colors"
                                title="Save changes"
                              >
                                <Save size={14} className="text-green-600" />
                              </button>
                            ) : (
                              <button
                                onClick={() => setEditingTransaction(transaction.id)}
                                className="p-1 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded transition-colors"
                                title="Edit transaction"
                              >
                                <Edit2 size={14} className="text-blue-600" />
                              </button>
                            )}
                            {transaction.isEdited && (
                              <button
                                onClick={() => resetTransaction(transaction.id)}
                                className="p-1 hover:bg-orange-100 dark:hover:bg-orange-900/30 rounded transition-colors"
                                title="Reset to original"
                              >
                                <RotateCcw size={14} className="text-orange-600" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Bottom Pagination Controls */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => goToPage(1)}
                      disabled={currentPage === 1}
                      className="px-3 py-2 rounded-md hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                    >
                      First
                    </button>
                    <button
                      onClick={() => goToPage(currentPage - 1)}
                      disabled={currentPage === 1}
                      className="p-2 rounded-md hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    
                    <span className="px-4 py-2 text-sm">
                      Page {currentPage} of {totalPages}
                    </span>
                    
                    <button
                      onClick={() => goToPage(currentPage + 1)}
                      disabled={currentPage === totalPages}
                      className="p-2 rounded-md hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronRight size={16} />
                    </button>
                    <button
                      onClick={() => goToPage(totalPages)}
                      disabled={currentPage === totalPages}
                      className="px-3 py-2 rounded-md hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                    >
                      Last
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 'results' && importResults && (
            <div className="space-y-6 text-center">
              <div className="flex items-center justify-center">
                <CheckCircle className="w-16 h-16 text-green-500" />
              </div>
              
              <div>
                <h3 className="text-xl font-semibold mb-2">Import Complete!</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-md mx-auto">
                  <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg p-4">
                    <div className="text-2xl font-bold text-green-600">{importResults.successful}</div>
                    <div className="text-sm text-green-700 dark:text-green-300">Successful</div>
                  </div>
                  <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-4">
                    <div className="text-2xl font-bold text-red-600">{importResults.failed}</div>
                    <div className="text-sm text-red-700 dark:text-red-300">Failed</div>
                  </div>
                </div>
              </div>

              {importResults.errors.length > 0 && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-4 text-left">
                  <h4 className="font-medium text-red-900 dark:text-red-100 mb-2">Errors:</h4>
                  <ul className="text-sm text-red-800 dark:text-red-200 space-y-1">
                    {importResults.errors.map((error, index) => (
                      <li key={index}>• {error}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-between items-center p-6 border-t border-slate-200 dark:border-slate-700">
          <div>
            {step === 'review' && (
              <button
                onClick={() => setStep('upload')}
                className="btn btn-secondary"
              >
                Back to Upload
              </button>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="btn btn-secondary"
            >
              {step === 'results' ? 'Close' : 'Cancel'}
            </button>
            {step === 'review' && (
              <button
                onClick={handleImport}
                disabled={isProcessing || selectedTransactions.size === 0}
                className={`btn btn-primary flex items-center gap-2 ${
                  isProcessing ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                {isProcessing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Upload size={16} />
                    Import {selectedTransactions.size} Transactions
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CSVImportDialog;