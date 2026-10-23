/**
 * Formats paise into Indian Rupee display string
 * e.g., 24000 paise -> "₹240" or "₹240.50"
 */
export function formatPaise(paise) {
  if (paise === null || paise === undefined || isNaN(paise)) {
    return '₹--';
  }
  const rupees = paise / 100;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: rupees % 1 === 0 ? 0 : 2,
    minimumFractionDigits: rupees % 1 === 0 ? 0 : 2,
  }).format(rupees);
}

/**
 * Formats percentage display
 */
export function formatPercent(percent) {
  if (percent === null || percent === undefined || isNaN(percent)) {
    return '--%';
  }
  return `${Math.round(percent)}%`;
}
