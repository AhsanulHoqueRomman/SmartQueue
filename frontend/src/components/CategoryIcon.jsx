const paths = {
  HEALTHCARE: <><path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6Z" /><path d="M10 12h4" /></>,
  LEGAL: <><path d="M12 3v18M7 21h10M4 7h16M5 7l-3 7h6L5 7Zm14 0-3 7h6l-3-7Z" /><path d="M2 14c0 4 6 4 6 0m8 0c0 4 6 4 6 0" /></>,
  BEAUTY: <><path d="M12 19C2 15 3 8 7 8c0-6 10-6 10 0 4 0 5 7-5 11Z" /><path d="M12 10v11m-4-9 4 4 4-4M20 2v4m-2-2h4" /></>,
  REPAIR: <><path d="m14 6 4 4 3-3a6 6 0 0 1-8 8l-6 6a3 3 0 0 1-4-4l6-6a6 6 0 0 1 8-8l-3 3Z" /><path d="m5 18 1 1" /></>,
  CONSULTING: <><rect x="3" y="7" width="18" height="14" rx="2" /><path d="M8 7V3h8v4M3 12l9 3 9-3m-9 1v4" /></>,
  OTHER: <><rect x="3" y="10" width="18" height="11" rx="2" /><path d="M6 14h6m-6 3h4m7-3v3M8 10V7a4 4 0 0 1 8 0v3" /></>,
};

export default function CategoryIcon({ industry }) {
  const details = { HEALTHCARE: <path d="M8 12h2l1-2 2 4 1-2h2" />, LEGAL: <path d="M4 7h16M7 21h10" />, BEAUTY: <path d="M20 2v4m-2-2h4" />, REPAIR: <path d="m14 6 4 4 3-3" />, CONSULTING: <path d="M8 7V3h8v4m-4 6v4" /> };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="6" fill="currentColor" opacity=".08" stroke="none" /><g fill="currentColor" fillOpacity=".08">{paths[industry] || paths.OTHER}</g><g className="category-icon-detail">{details[industry] || <path d="M6 14h6m-6 3h4" />}</g></svg>;
}
