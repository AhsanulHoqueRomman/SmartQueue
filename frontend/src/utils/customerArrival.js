export const ARRIVAL_DECLARATION = 'I confirm that I have arrived at the organization.';

// This is an explicit declaration, not technical verification of location.
export function confirmCustomerArrival(confirm = globalThis.confirm) {
  return typeof confirm === 'function' && confirm(ARRIVAL_DECLARATION) === true;
}
