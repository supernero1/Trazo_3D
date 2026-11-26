const factors = { m: 1, cm: 0.01, mm: 0.001 };
export const unitFactor = (unit) => factors[unit] || 1;
export function parseLength(text, unit = 'm') {
  const match = String(text)
    .trim()
    .match(/^([+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+))\s*(mm|cm|m)?$/i);
  if (!match) throw new Error('Medida inválida. Ejemplos: 2.5m, 30cm o 4;3.');
  const value = Number(match[1].replace(',', '.')) * unitFactor(match[2]?.toLowerCase() || unit);
  if (!Number.isFinite(value) || Math.abs(value) > 100000)
    throw new Error('La medida está fuera de rango.');
  return value;
}
export function parseMeasures(text, unit) {
  return text.split(';').map((s) => parseLength(s, unit));
}
export function formatLength(value, unit = 'm', digits = 3) {
  return (
    Number((value / unitFactor(unit)).toFixed(digits)).toLocaleString('es-CL', {
      maximumFractionDigits: digits,
    }) +
    ' ' +
    unit
  );
}
