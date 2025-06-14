import React, { useRef, useEffect, useState } from 'react';
import { createChart, ISeriesApi, CandlestickSeries, ColorType, CrosshairMode } from 'lightweight-charts';
import { fetchBondOrderBook, fetchBillOrderBook } from '../utils/api';

