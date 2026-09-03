import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Junta classes resolvendo conflitos do Tailwind — a última vence de verdade. */
export function cn(...entradas: ClassValue[]): string {
  return twMerge(clsx(entradas));
}
