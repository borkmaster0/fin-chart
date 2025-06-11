export interface PortfolioCalculation {
  totalShares: number;
  totalCost: number;
  totalFees: number;
  realizedGainLoss: number;
  unrealizedGainLoss: number;
  totalGainLoss: number;
  currentValue: number;
  costBasis: number;
  averageCostPerShare: number;
  currentPrice?: number;
  gainLossPercent: number;
  realizedGainTransactions: Array<{
    transactionId: string;
    amount: number;
    date: string;
    description: string;
  }>;
  dividendCashTransactions: Array<{
    transactionId: string;
    amount: number;
    date: string;
    description: string;
  }>;
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

export function calculatePortfolioMetrics(
  transactions: Transaction[], 
  currentPrice?: number
): PortfolioCalculation {
  let totalShares = 0;
  let totalCost = 0;
  let totalFees = 0;
  let realizedGainLoss = 0;
  let averageCostPerShare = 0;
  const realizedGainTransactions: Array<{
    transactionId: string;
    amount: number;
    date: string;
    description: string;
  }> = [];
  const dividendCashTransactions: Array<{
    transactionId: string;
    amount: number;
    date: string;
    description: string;
  }> = [];

  // Sort transactions by date to process them chronologically
  const sortedTransactions = [...transactions].sort((a, b) => 
    new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  for (const transaction of sortedTransactions) {
    totalFees += transaction.fees;

    if (transaction.type === 'buy' || (transaction.type === 'dividend' && transaction.isDrip)) {
      // For buys and DRIP dividends, add to position
      const transactionCost = transaction.shares * transaction.price;
      totalCost += transactionCost;
      totalShares += transaction.shares;
      
      // Recalculate average cost per share
      if (totalShares > 0) {
        averageCostPerShare = totalCost / totalShares;
      }
    } else if (transaction.type === 'dividend' && !transaction.isDrip) {
      // For non-DRIP dividends, this is a cash payment
      const dividendAmount = transaction.shares * transaction.price;
      dividendCashTransactions.push({
        transactionId: transaction.id,
        amount: dividendAmount,
        date: transaction.date,
        description: `Dividend payment: ${transaction.shares} shares × $${transaction.price.toFixed(4)} = $${dividendAmount.toFixed(2)}`
      });
    } else if (transaction.type === 'sell') {
      // For sells, calculate realized gain/loss using average cost basis
      const sharesSold = transaction.shares;
      const salePrice = transaction.price;
      const costBasisOfSoldShares = sharesSold * averageCostPerShare;
      const saleProceeds = sharesSold * salePrice;
      
      // Calculate realized gain/loss for this sale (including fees)
      const realizedGainLossForSale = saleProceeds - costBasisOfSoldShares - transaction.fees;
      realizedGainLoss += realizedGainLossForSale;
      
      // Track this realized gain transaction for cash balance integration
      realizedGainTransactions.push({
        transactionId: transaction.id,
        amount: realizedGainLossForSale,
        date: transaction.date,
        description: `Realized ${realizedGainLossForSale >= 0 ? 'gain' : 'loss'} from selling ${sharesSold} shares at $${salePrice.toFixed(2)}`
      });
      
      // Reduce position
      totalShares -= sharesSold;
      totalCost -= costBasisOfSoldShares;
      
      // Ensure we don't go negative
      if (totalShares < 0) {
        totalShares = 0;
        totalCost = 0;
        averageCostPerShare = 0;
      } else if (totalShares > 0) {
        averageCostPerShare = totalCost / totalShares;
      } else {
        averageCostPerShare = 0;
        totalCost = 0;
      }
    } else if (transaction.type === 'options') {
      // For options, treat as separate transactions that don't affect stock position
      // Options can have positive or negative shares (buying vs selling contracts)
      const optionValue = transaction.shares * transaction.price;
      const optionGainLoss = optionValue - transaction.fees;
      realizedGainLoss += optionGainLoss;
      
      // Track options realized gain transaction
      realizedGainTransactions.push({
        transactionId: transaction.id,
        amount: optionGainLoss,
        date: transaction.date,
        description: `Options ${optionGainLoss >= 0 ? 'profit' : 'loss'}: ${transaction.notes || 'Options transaction'}`
      });
    }
  }

  // Calculate current metrics
  const currentValue = totalShares * (currentPrice || 0);
  const costBasis = totalCost + totalFees;
  const unrealizedGainLoss = currentPrice ? currentValue - costBasis : 0;
  const totalGainLoss = realizedGainLoss + unrealizedGainLoss;
  
  // Calculate percentage gain/loss
  let gainLossPercent = 0;
  if (costBasis > 0) {
    gainLossPercent = (unrealizedGainLoss / costBasis) * 100;
  }

  return {
    totalShares,
    totalCost,
    totalFees,
    realizedGainLoss,
    unrealizedGainLoss,
    totalGainLoss,
    currentValue,
    costBasis,
    averageCostPerShare,
    currentPrice,
    gainLossPercent,
    realizedGainTransactions,
    dividendCashTransactions
  };
}

export function calculateTotalPortfolioMetrics(
  portfolioCalculations: { [symbol: string]: PortfolioCalculation }
): {
  totalValue: number;
  totalCostBasis: number;
  totalRealizedGainLoss: number;
  totalUnrealizedGainLoss: number;
  totalGainLoss: number;
  totalGainLossPercent: number;
} {
  const totals = Object.values(portfolioCalculations).reduce(
    (acc, calc) => ({
      totalValue: acc.totalValue + calc.currentValue,
      totalCostBasis: acc.totalCostBasis + calc.costBasis,
      totalRealizedGainLoss: acc.totalRealizedGainLoss + calc.realizedGainLoss,
      totalUnrealizedGainLoss: acc.totalUnrealizedGainLoss + calc.unrealizedGainLoss,
    }),
    {
      totalValue: 0,
      totalCostBasis: 0,
      totalRealizedGainLoss: 0,
      totalUnrealizedGainLoss: 0,
    }
  );

  const totalGainLoss = totals.totalRealizedGainLoss + totals.totalUnrealizedGainLoss;
  const totalGainLossPercent = totals.totalCostBasis > 0 
    ? (totalGainLoss / totals.totalCostBasis) * 100 
    : 0;

  return {
    ...totals,
    totalGainLoss,
    totalGainLossPercent,
  };
}