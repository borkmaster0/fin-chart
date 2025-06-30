// TradingViewWidget.jsx
import React, { useEffect, useRef, memo } from 'react';

function TradingViewEconomicCalendar() {
  const container = useRef();

  useEffect(
    () => {
      const script = document.createElement("script");
      script.src = "https://s3.tradingview.com/external-embedding/embed-widget-events.js";
      script.type = "text/javascript";
      script.async = true;
      script.innerHTML = `
        {
          "colorTheme": "dark",
          "isTransparent": false,
          "locale": "en",
          "countryFilter": "",
          "importanceFilter": "0,1",
          "width": "100%",
          "height": "100%"
        }`;
      if (!document.querySelector(`#tradingview-economiccalendar-script`)) {
        script.id = "tradingview-economiccalendar-script";
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

export default memo(TradingViewEconomicCalendar);
