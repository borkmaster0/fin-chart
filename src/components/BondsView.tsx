import React, { useRef, useEffect, useState } from 'react';
import { createChart, ISeriesApi, CandlestickSeries, ColorType, CrosshairMode } from 'lightweight-charts';
import { fetchBondOrderBook, fetchBillOrderBook } from '../utils/api';

interface CandlestickData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

