// TradingViewWidget.jsx
import React, { useEffect, useRef, memo } from 'react';

function TradingViewETFHeatmap() {
  const container = useRef();

  useEffect(
    () => {
      const script = document.createElement("script");
      script.src = "https://s3.tradingview.com/external-embedding/embed-widget-etf-heatmap.js";
      script.type = "text/javascript";
      script.async = true;
      script.innerHTML = `
        {
          "dataSource": "AllUSEtf",
          "blockSize": "volume",
          "blockColor": "change",
          "grouping": "asset_class",
          "locale": "en",
          "symbolUrl": "",
          "colorTheme": "dark",
          "hasTopBar": true,
          "isDataSetEnabled": true,
          "isZoomEnabled": true,
          "hasSymbolTooltip": true,
          "isMonoSize": false,
          "width": "100%",
          "height": "100%"
        }`;
      if (!document.querySelector(`#tradingview-etfheatmap-script`)) {
        script.id = "tradingview-etfheatmap-script";
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

export default memo(TradingViewETFHeatmap);
