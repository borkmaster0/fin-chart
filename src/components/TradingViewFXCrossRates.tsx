// TradingViewWidget.jsx
import React, { useEffect, useRef, memo } from 'react';

function TradingViewFXCrossRates() {
  const container = useRef();

  useEffect(
    () => {
      const script = document.createElement("script");
      script.src = "https://s3.tradingview.com/external-embedding/embed-widget-forex-cross-rates.js";
      script.type = "text/javascript";
      script.async = true;
      script.innerHTML = `
        {
          "colorTheme": "dark",
          "isTransparent": false,
          "locale": "en",
          "currencies": [
            "EUR",
            "USD",
            "JPY",
            "GBP",
            "CHF",
            "AUD",
            "CAD",
            "NZD",
            "CNY",
            "TRY",
            "NOK",
            "SEK",
            "DKK",
            "ZAR",
            "SGD",
            "HKD",
            "THB",
            "MXN",
            "KRW",
            "IDR",
            "PLN",
            "KWD",
            "RUB",
            "ARS",
            "COP",
            "UYU",
            "PEN",
            "CLP",
            "AED",
            "ILS",
            "ISK"
          ],
          "backgroundColor": "#0F0F0F",
          "width": 550,
          "height": 400
        }`;
      container.current.appendChild(script);
    },
    []
  );

  return (
    <div className="tradingview-widget-container" ref={container}>
      <div className="tradingview-widget-container__widget"></div>
      <div className="tradingview-widget-copyright"><a href="https://www.tradingview.com/" rel="noopener nofollow" target="_blank"><span className="blue-text">Track all markets on TradingView</span></a></div>
    </div>
  );
}

export default memo(TradingViewFXCrossRates);
