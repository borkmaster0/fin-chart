import React, { useState, useEffect, useCallback } from 'react';
import { Search } from 'lucide-react';
import debounce from 'lodash/debounce';

interface SearchResult {
  symbol: string;
  shortname: string;
  exchDisp: string;
  typeDisp: string;
}

interface SymbolSearchProps {
  symbol: string;
  onSymbolChange: (symbol: string) => void;
}

const SymbolSearch: React.FC<SymbolSearchProps> = ({ symbol, onSymbolChange }) => {
  const [inputValue, setInputValue] = useState(symbol);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  const searchSymbols = async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(
        `https://corsproxy.io/?https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&lang=en-US&region=US&quotesCount=6&newsCount=0&listsCount=2&enableFuzzyQuery=false`
      );
      const data = await response.json();
      setSearchResults(data.quotes || []);
    } catch (error) {
      console.error('Search error:', error);
      setSearchResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  const debouncedSearch = useCallback(
    debounce((query: string) => searchSymbols(query), 1000),
    []
  );

  useEffect(() => {
    return () => {
      debouncedSearch.cancel();
    };
  }, [debouncedSearch]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputValue(value);
    debouncedSearch(value);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim()) {
      onSymbolChange(inputValue.toUpperCase().trim());
      setIsDropdownOpen(false);
    }
  };
  
  return (
    <div className="relative w-full max-w-xs">
      <form onSubmit={handleSubmit} className="relative">
        <div className="relative">
          <input
            type="text"
            className="input w-full pl-10 pr-4"
            placeholder="Enter symbol..."
            value={inputValue}
            onChange={handleInputChange}
            onFocus={() => setIsDropdownOpen(true)}
          />
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className={`h-5 w-5 text-slate-400 ${isLoading ? 'animate-pulse' : ''}`} />
          </div>
        </div>
      </form>
      
      {isDropdownOpen && searchResults.length > 0 && (
        <div className="absolute z-10 mt-1 w-full bg-white dark:bg-slate-800 shadow-lg rounded-md overflow-hidden border border-slate-200 dark:border-slate-700">
          <ul>
            {searchResults.map((result) => (
              <li key={result.symbol}>
                <button
                  type="button"
                  className="w-full text-left px-4 py-2 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                  onClick={() => {
                    setInputValue(result.symbol);
                    onSymbolChange(result.symbol);
                    setIsDropdownOpen(false);
                  }}
                >
                  <div className="font-medium">{result.symbol}</div>
                  <div className="text-sm text-slate-500 dark:text-slate-400">
                    {result.shortname} • {result.exchDisp}
                  </div>
                </button>
              </li>
            ))}
          </ul>
          <div className="p-2 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
            <button
              type="button"
              className="w-full text-center text-sm text-primary hover:text-primary-dark"
              onClick={() => setIsDropdownOpen(false)}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SymbolSearch;