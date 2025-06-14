import { ChartData, StockArray, TreasuryBondOrderBook, TreasuryBillsOrderBook } from '../types';

export interface CurrentPrice {
  symbol: string;
  price: number;
  currency: string;
  exchangeName: string;
  shortName?: string;
  longName?: string;
}

export async function fetchMostActiveStocks(symbol: string): Promise<StockArray> {
  const url = `https://corsproxy.io/?https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?count=5&formatted=true&scrIds=MOST_ACTIVES&sortField=&sortType=&start=0&useRecordsResponse=false&fields=symbol`;
  try {
    const reponse = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const data = await response.json();
    return {
      symbols: data.finance.result[0].quotes.map((item)=>(item.symbol))
    };
  } catch (error) {
    console.error('Error fetching stock data:', error);
    throw new Error(error instanceof Error ? error.message : 'Failed to fetch data');
  }
}

export async function fetchTrendingStocks(symbol: string): Promise<StockArray> {
  const url = `https://corsproxy.io/?https://query1.finance.yahoo.com/v1/finance/trending/US?count=25&fields=logoUrl%2ClongName%2CshortName%2CregularMarketChange%2CregularMarketChangePercent%2CregularMarketPrice%2Cticker%2Csymbol%2ClongName%2Csparkline%2CshortName%2CregularMarketPrice%2CregularMarketChange%2CregularMarketChangePercent%2CregularMarketVolume%2CaverageDailyVolume3Month%2CmarketCap%2CtrailingPE%2CfiftyTwoWeekChangePercent%2CfiftyTwoWeekRange%2CregularMarketOpen&format=true&useQuotes=true&quoteType=equity`;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const data = await response.json();
    return {
      symbols: data.finance.result[0].quotes.map((item)=>(item.symbol))
    };
  } catch (error) {
    console.error('Error fetching trending stock data: ', error);
    throw new Error(error instanceof Error ? error.message : 'Failed to fetch data');
  }
}

export async function fetchBondOrderBook(): Promise<TreasuryBondOrderBook> {
  const url = "https://corsproxy.io/?https://www.barrons.com/market-data/bonds/treasuries?id=%7B%22treasury%22%3A%22NOTES_AND_BONDS%22%7D&type=mdc_treasury";
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const a = await response.json();
    return {
      bonds: a.data.instruments,
      timestamp: a.data.timestamp
    }
  } catch (error) {
    console.error('Error fetching treasury bond data: ', error);
    throw new Error(error instanceof Error ? error.message : 'Failed to fetch data');
  }
}

export async function fetchBillOrderBook(): Promise<TreasuryBillsOrderBookOrderBook> {
  const url = "https://corsproxy.io/?https://www.barrons.com/market-data/bonds/treasuries?id=%7B%22treasury%22%3A%22BILLS%22%7D&type=mdc_treasury";
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const a = await response.json();
    return {
      bonds: a.data.instruments,
      timestamp: a.data.timestamp
    }
  } catch (error) {
    console.error('Error fetching treasury bond data: ', error);
    throw new Error(error instanceof Error ? error.message : 'Failed to fetch data');
  }
}

export async function fetchChartData(symbol: string, timeframe: string): Promise<ChartData> {
  // Calculate start time based on timeframe
  const end = Math.floor(Date.now() / 1000);
  let start = 0; // Default to 0 for full history
  let interval = '1d'; // Default interval
  
  // Set interval and start time based on timeframe
  switch (timeframe) {
    case '1m':
      interval = '1m';
      start = end - (60 * 60 * 24 * 7); // 7 days (within 8 days limit)
      break;
    case '5m':
    case '15m':
    case '30m':
    case '90m':
      interval = timeframe;
      start = end - (60 * 60 * 24 * 60); // 60 days
      break;
    case '1h':
      interval = '1h';
      start = end - (60 * 60 * 24 * 730); // 730 days
      break;
    case '1d':
    case '5d':
    case '1wk':
    case '1mo':
    case '3mo':
      interval = timeframe;
      start = 0; // Full history
      break;
    default:
      interval = '1d';
      start = 0;
  }
  
  const encodedSymbol = encodeURIComponent(symbol);
  const url = `https://corsproxy.io/?https://query1.finance.yahoo.com/v8/finance/chart/${encodedSymbol}?period1=${start}&period2=${end}&interval=${interval}&includePrePost=true&events=div%7Csplit%7Cearn&includeAdjustedClose=true`;
  
  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.chart.error) {
      throw new Error(data.chart.error.description || 'Unknown error');
    }
    
    if (!data.chart.result || data.chart.result.length === 0) {
      throw new Error('No data available for this symbol');
    }
    
    const result = data.chart.result[0];
    const { meta, timestamp, indicators, events } = result;
    const quote = indicators.quote[0];
    
    return {
      timestamp,
      close: quote.close,
      open: quote.open,
      high: quote.high,
      low: quote.low,
      volume: quote.volume,
      meta,
      events: {
        dividends: events?.dividends || {},
        splits: events?.splits || {}
      }
    };
  } catch (error) {
    console.error('Error fetching chart data:', error);
    throw new Error(error instanceof Error ? error.message : 'Failed to fetch data');
  }
}

export async function fetchCurrentPrices(symbols: string[]): Promise<CurrentPrice[]> {
  if (symbols.length === 0) return [];
  
  const results: CurrentPrice[] = [];
  const maxSymbolsPerRequest = 20;
  
  // Split symbols into chunks of 20 or less
  for (let i = 0; i < symbols.length; i += maxSymbolsPerRequest) {
    const symbolChunk = symbols.slice(i, i + maxSymbolsPerRequest);
    const encodedSymbols = symbolChunk.map(s => encodeURIComponent(s)).join('%2C');
    
    const url = `https://corsproxy.io/?https://query1.finance.yahoo.com/v7/finance/spark?includePrePost=true&includeTimestamps=false&indicators=close&interval=1m&range=1d&symbols=${encodedSymbols}`;
    
    try {
      const response = await fetch(url);
      
      if (!response.ok) {
        console.error(`HTTP error for symbols ${symbolChunk.join(', ')}: ${response.status}`);
        continue;
      }
      
      const data = await response.json();
      
      if (data.spark?.result) {
        for (const result of data.spark.result) {
          if (result.response && result.response.length > 0) {
            const meta = result.response[0].meta;
            if (meta && meta.regularMarketPrice !== undefined) {
              results.push({
                symbol: result.symbol,
                price: meta.regularMarketPrice,
                currency: meta.currency || 'USD',
                exchangeName: meta.exchangeName || '',
                shortName: meta.shortName,
                longName: meta.longName
              });
            }
          }
        }
      }
    } catch (error) {
      console.error(`Error fetching prices for symbols ${symbolChunk.join(', ')}:`, error);
    }
  }
  
  return results;
}