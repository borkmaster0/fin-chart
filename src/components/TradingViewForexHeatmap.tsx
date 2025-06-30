// TradingViewWidget.jsx
import React, { useEffect, useRef, memo } from 'react';

function TradingViewForexHeatmap() {
  const container = useRef();

  useEffect(
    () => {
      const script = document.createElement("script");
      script.src = "https://s3.tradingview.com/external-embedding/embed-widget-forex-heat-map.js";
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
            "SGD",
            "SEK",
            "DKK",
            "ZAR",
            "HKD",
            "THB",
            "IDR",
            "MXN",
            "KRW",
            "PLN",
            "KWD",
            "RUB",
            "ARS",
            "COP",
            "UYU",
            "ISK",
            "AED",
            "CLP",
            "ILS",
            "PEN"
          ],
          "backgroundColor": "#0F0F0F",
          "width": "100%",
          "height": "100%"
        }`;
      if (!document.querySelector(`#tradingview-forexheatmap-script`)) {
        script.id = "tradingview-forexheatmap-script";
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

export default memo(TradingViewForexHeatmap);
