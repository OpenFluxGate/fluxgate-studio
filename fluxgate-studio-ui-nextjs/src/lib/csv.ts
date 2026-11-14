type Cell = string | number | null | undefined;

function cell(value: Cell): string {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (typeof value === 'string' && /^[=+\-@]/.test(text)) {
    text = `'${text}`;
  }
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(headers: string[], rows: Cell[][]): string {
  return `${[headers, ...rows].map((row) => row.map(cell).join(',')).join('\n')}\n`;
}

export function downloadCsv(name: string, csv: string): void {
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
