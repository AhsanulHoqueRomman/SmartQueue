export const formatCurrency = (amount) => {
  if (amount === null || amount === undefined || amount === '') return 'Price unavailable';
  const number = Number(amount);
  return Number.isFinite(number) ? `৳${number.toLocaleString('en-US', { maximumFractionDigits: 2 })}` : 'Price unavailable';
};

export const startingPrice = (service) => service?.starting_from_price == null
  ? 'Price unavailable' : `Starting from ${formatCurrency(service.starting_from_price)}`;

export const providerCharge = (provider, serviceId) => provider?.service_charges
  ?.find(charge => charge.service_id === serviceId)?.effective_customer_charge ?? null;

export const currentBusinessDate = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

export const bookingError = (error, fallback = 'Unable to save. Please try again.') => {
  const data = error.response?.data;
  if (!data) return fallback;
  return Object.entries(data).map(([field, value]) => `${['detail', 'message'].includes(field) ? '' : `${field.replaceAll('_', ' ')}: `}${Array.isArray(value) ? value.join(' ') : typeof value === 'object' ? JSON.stringify(value) : value}`).join(' ');
};
