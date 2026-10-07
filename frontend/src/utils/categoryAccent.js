export function categoryAccent(industry, name = '') {
  if (/diagnostic|imaging|laboratory/i.test(name)) return 'diagnostics';
  if (/dental/i.test(name)) return 'dental';
  return { HEALTHCARE: 'healthcare', BEAUTY: 'beauty', LEGAL: 'legal', REPAIR: 'repair', CONSULTING: 'consulting' }[industry] || 'other';
}
