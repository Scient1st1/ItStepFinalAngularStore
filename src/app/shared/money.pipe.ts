import { Pipe, PipeTransform } from '@angular/core';

/** 1234.5 → "$1,234.50" */
export function formatMoney(price: number | string | null | undefined, currency = 'USD'): string {
  const amount = Number(price) || 0;
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}

@Pipe({ name: 'money' })
export class MoneyPipe implements PipeTransform {
  transform(price: number | string | null | undefined, currency = 'USD'): string {
    return formatMoney(price, currency);
  }
}
