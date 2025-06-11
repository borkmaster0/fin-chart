interface ChartSettings {
  showDividends: boolean;
  showSplits: boolean;
  chartType: 'line' | 'candlestick';
  timezoneOffset: number;
  precision: number;
}

export interface Transaction {
  id: string;
  symbol: string;
  date: string;
  type: 'buy' | 'sell' | 'dividend' | 'options';
  shares: number;
  price: number;
  fees: number;
  notes: string;
  isDrip?: boolean; // New field for DRIP transactions
}

export interface CashTransaction {
  id: string;
  date: string;
  type: 'deposit' | 'withdrawal' | 'realized_gain' | 'dividend';
  amount: number;
  description: string;
  relatedTransactionId?: string; // For linking to stock transactions
}

interface AppState {
  currentSymbol: string;
  lastUpdated: number;
}

const DB_NAME = 'finchart';
export const STORE_NAMES = {
  settings: 'settings',
  portfolio: 'portfolio',
  appState: 'appState',
  cash: 'cash'
} as const;
const DB_VERSION = 6; // Increment version for schema change

export async function initDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      
      if (!db.objectStoreNames.contains(STORE_NAMES.settings)) {
        db.createObjectStore(STORE_NAMES.settings);
      }
      
      if (!db.objectStoreNames.contains(STORE_NAMES.portfolio)) {
        const portfolioStore = db.createObjectStore(STORE_NAMES.portfolio, { keyPath: 'id' });
        portfolioStore.createIndex('symbol', 'symbol', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORE_NAMES.appState)) {
        db.createObjectStore(STORE_NAMES.appState);
      }

      if (!db.objectStoreNames.contains(STORE_NAMES.cash)) {
        const cashStore = db.createObjectStore(STORE_NAMES.cash, { keyPath: 'id' });
        cashStore.createIndex('date', 'date', { unique: false });
        cashStore.createIndex('type', 'type', { unique: false });
      }
    };
  });
}

export async function saveSettings(settings: ChartSettings): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAMES.settings, 'readwrite');
    const store = transaction.objectStore(STORE_NAMES.settings);
    const request = store.put(settings, 'chartSettings');

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

export async function loadSettings(): Promise<ChartSettings | null> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAMES.settings, 'readonly');
    const store = transaction.objectStore(STORE_NAMES.settings);
    const request = store.get('chartSettings');

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result || null);
  });
}

export async function saveCurrentSymbol(symbol: string): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const appState: AppState = {
      currentSymbol: symbol,
      lastUpdated: Date.now()
    };
    
    const transaction = db.transaction(STORE_NAMES.appState, 'readwrite');
    const store = transaction.objectStore(STORE_NAMES.appState);
    const request = store.put(appState, 'currentState');

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

export async function loadCurrentSymbol(): Promise<string | null> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAMES.appState, 'readonly');
    const store = transaction.objectStore(STORE_NAMES.appState);
    const request = store.get('currentState');

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const result = request.result as AppState | undefined;
      resolve(result?.currentSymbol || null);
    };
  });
}

export async function addTransaction(transaction: Omit<Transaction, 'id'>): Promise<string> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const fullTransaction = { ...transaction, id };
    
    const dbTransaction = db.transaction([STORE_NAMES.portfolio, STORE_NAMES.cash], 'readwrite');
    const portfolioStore = dbTransaction.objectStore(STORE_NAMES.portfolio);
    const cashStore = dbTransaction.objectStore(STORE_NAMES.cash);
    
    const portfolioRequest = portfolioStore.add(fullTransaction);

    portfolioRequest.onerror = () => reject(portfolioRequest.error);
    portfolioRequest.onsuccess = () => {
      // If this is a non-DRIP dividend, add a cash transaction
      if (transaction.type === 'dividend' && !transaction.isDrip) {
        const dividendAmount = transaction.shares * transaction.price;
        const cashTransaction: CashTransaction = {
          id: crypto.randomUUID(),
          date: transaction.date,
          type: 'dividend',
          amount: dividendAmount,
          description: `Dividend payment: ${transaction.shares} shares × $${transaction.price} = $${dividendAmount}`,
          relatedTransactionId: id
        };
        
        const cashRequest = cashStore.add(cashTransaction);
        cashRequest.onerror = () => reject(cashRequest.error);
        cashRequest.onsuccess = () => resolve(id);
      } else {
        resolve(id);
      }
    };
  });
}

export async function updateTransaction(transaction: Transaction): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const dbTransaction = db.transaction([STORE_NAMES.portfolio, STORE_NAMES.cash], 'readwrite');
    const portfolioStore = dbTransaction.objectStore(STORE_NAMES.portfolio);
    const cashStore = dbTransaction.objectStore(STORE_NAMES.cash);
    
    const portfolioRequest = portfolioStore.put(transaction);

    portfolioRequest.onerror = () => reject(portfolioRequest.error);
    portfolioRequest.onsuccess = () => {
      // Handle dividend cash transactions
      if (transaction.type === 'dividend') {
        // First, delete any existing related cash transactions
        const cashIndex = cashStore.index('type');
        const cashRequest = cashIndex.getAll('dividend');
        
        cashRequest.onsuccess = () => {
          const cashTransactions = cashRequest.result as CashTransaction[];
          const relatedCashTransactions = cashTransactions.filter(ct => ct.relatedTransactionId === transaction.id);
          
          // Delete existing related cash transactions
          let deletedCount = 0;
          const totalToDelete = relatedCashTransactions.length;
          
          const handleDeletions = () => {
            if (!transaction.isDrip) {
              // Add new cash transaction for non-DRIP dividend
              const dividendAmount = transaction.shares * transaction.price;
              const newCashTransaction: CashTransaction = {
                id: crypto.randomUUID(),
                date: transaction.date,
                type: 'dividend',
                amount: dividendAmount,
                description: `Dividend payment: ${transaction.shares} shares × $${transaction.price.toFixed(4)} = $${dividendAmount.toFixed(2)}`,
                relatedTransactionId: transaction.id
              };
              
              const addCashRequest = cashStore.add(newCashTransaction);
              addCashRequest.onerror = () => reject(addCashRequest.error);
              addCashRequest.onsuccess = () => resolve();
            } else {
              resolve();
            }
          };
          
          if (totalToDelete === 0) {
            handleDeletions();
          } else {
            relatedCashTransactions.forEach(ct => {
              const deleteRequest = cashStore.delete(ct.id);
              deleteRequest.onsuccess = () => {
                deletedCount++;
                if (deletedCount === totalToDelete) {
                  handleDeletions();
                }
              };
              deleteRequest.onerror = () => reject(deleteRequest.error);
            });
          }
        };
        
        cashRequest.onerror = () => reject(cashRequest.error);
      } else {
        resolve();
      }
    };
  });
}

export async function deleteTransaction(id: string): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAMES.portfolio, STORE_NAMES.cash], 'readwrite');
    const portfolioStore = transaction.objectStore(STORE_NAMES.portfolio);
    const cashStore = transaction.objectStore(STORE_NAMES.cash);
    
    // Delete the portfolio transaction
    const portfolioRequest = portfolioStore.delete(id);
    
    portfolioRequest.onerror = () => reject(portfolioRequest.error);
    portfolioRequest.onsuccess = () => {
      // Also delete any related cash transactions
      const cashIndex = cashStore.index('type');
      const cashRequest = cashIndex.getAll();
      
      cashRequest.onsuccess = () => {
        const cashTransactions = cashRequest.result as CashTransaction[];
        const relatedCashTransactions = cashTransactions.filter(ct => ct.relatedTransactionId === id);
        
        let deletedCount = 0;
        if (relatedCashTransactions.length === 0) {
          resolve();
          return;
        }
        
        relatedCashTransactions.forEach(ct => {
          const deleteRequest = cashStore.delete(ct.id);
          deleteRequest.onsuccess = () => {
            deletedCount++;
            if (deletedCount === relatedCashTransactions.length) {
              resolve();
            }
          };
          deleteRequest.onerror = () => reject(deleteRequest.error);
        });
      };
      
      cashRequest.onerror = () => reject(cashRequest.error);
    };
  });
}

export async function getTransactions(symbol: string): Promise<Transaction[]> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAMES.portfolio, 'readonly');
    const store = transaction.objectStore(STORE_NAMES.portfolio);
    const index = store.index('symbol');
    const request = index.getAll(symbol);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

export async function getAllTransactions(): Promise<Transaction[]> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAMES.portfolio, 'readonly');
    const store = transaction.objectStore(STORE_NAMES.portfolio);
    const request = store.getAll();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

// Cash transaction functions
export async function addCashTransaction(cashTransaction: Omit<CashTransaction, 'id'>): Promise<string> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const fullCashTransaction = { ...cashTransaction, id };
    
    const transaction = db.transaction(STORE_NAMES.cash, 'readwrite');
    const store = transaction.objectStore(STORE_NAMES.cash);
    const request = store.add(fullCashTransaction);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(id);
  });
}

export async function updateCashTransaction(cashTransaction: CashTransaction): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAMES.cash, 'readwrite');
    const store = transaction.objectStore(STORE_NAMES.cash);
    const request = store.put(cashTransaction);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

export async function deleteCashTransaction(id: string): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAMES.cash, 'readwrite');
    const store = transaction.objectStore(STORE_NAMES.cash);
    const request = store.delete(id);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

export async function getAllCashTransactions(): Promise<CashTransaction[]> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAMES.cash, 'readonly');
    const store = transaction.objectStore(STORE_NAMES.cash);
    const request = store.getAll();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

export async function addRealizedGainToCash(
  amount: number, 
  description: string, 
  date: string,
  relatedTransactionId: string
): Promise<string> {
  return addCashTransaction({
    date,
    type: 'realized_gain',
    amount,
    description,
    relatedTransactionId
  });
}

export async function addDividendToCash(
  amount: number, 
  description: string, 
  date: string,
  relatedTransactionId: string
): Promise<string> {
  return addCashTransaction({
    date,
    type: 'dividend',
    amount,
    description,
    relatedTransactionId
  });
}