export interface ChartData {
  timestamp: number[];
  close: number[];
  open: number[];
  high: number[];
  low: number[];
  volume: number[];
  meta: {
    symbol: string;
    currency: string;
    regularMarketPrice: number;
    previousClose: number;
    regularMarketOpen?: number;
    regularMarketDayHigh: number;
    regularMarketDayLow: number;
    fiftyTwoWeekHigh: number;
    fiftyTwoWeekLow: number;
    regularMarketTime: number;
    shortName?: string;
    longName?: string;
    exchangeName: string;
    fullExchangeName: string;
    priceHint?: number;
  };
  events?: {
    dividends: {
      [key: string]: {
        amount: number;
        date: number;
      };
    };
    splits: {
      [key: string]: {
        date: number;
        numerator: number;
        denominator: number;
        splitRatio: string;
      };
    };
  };
}

interface ChartPoint {
  time: number;
  value: number;
}