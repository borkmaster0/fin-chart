// TradingViewWidget.jsx
import React, { useEffect, useRef, memo } from 'react';

function TradingViewWidget() {
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
            "CNY",
            "SEK",
            "NZD",
            "TRY",
            "NOK",
            "ZAR",
            "SGD",
            "DKK",
            "HKD",
            "PLN",
            "THB",
            "IDR",
            "MXN",
            "KRW",
            "AED",
            "ISK",
            "KWD",
            "RUB",
            "ILS",
            "ARS",
            "CLP",
            "PEN",
            "UYU",
            "COP"
          ],
          "backgroundColor": "#0F0F0F",
          "width": "100%",
          "height": "100%"
        }`;
      if (!document.querySelector(`#tradingview-fxcrossrates-script`)) {
        script.id = "tradingview-fxcrossrates-script";
        container.current.appendChild(script);
      }
    },
    []
  );

  return (
    <div className="tradingview-widget-container" ref={container}>
      <div className="tradingview-widget-container__widget"></div>
    </div>
  );
}

export default memo(TradingViewWidget);
