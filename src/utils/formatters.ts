import { format } from 'date-fns';

export function formatCurrency(value?: number): string {
  if (value === undefined || value === null) return 'N/A';
  
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatPercent(value?: number): string {
  if (value === undefined || value === null) return 'N/A';
  
  return new Intl.NumberFormat('en-US', {
    style: 'percent',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value / 100);
}

export function formatTimeTooltip(timestamp: number, timezoneOffset: number = 0): string {
  const date = new Date((timestamp + timezoneOffset * 3600) * 1000);
  return format(date, 'MMM d, yyyy HH:mm');
}

function formatDate(timestamp: number, timezoneOffset: number = 0): string {
  if (!timestamp) return '';
  const date = new Date((timestamp + timezoneOffset * 3600) * 1000);
  return format(date, 'PP'); // Format: Mar 15, 2022
}

