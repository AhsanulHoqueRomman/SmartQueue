export function emergencyNotice(appointment) {
  return appointment?.emergency || appointment?.queue_entry?.readiness_info?.emergency || null;
}

export function recoveryPayload(action, form) {
  if (!['INBOUND', 'OUTBOUND'].includes(form.direction)) throw new Error('Record the actual contact direction.');
  if (action === 'CONTACT') return { action, direction: form.direction, outcome: form.outcome, note: form.note, request_id: form.requestId };
  if (form.consent !== true || !form.consentNote.trim()) throw new Error('Record the customer’s explicit agreement or cancellation request.');
  if (action === 'RESCHEDULE' && (!form.targetDate || !form.targetProvider)) throw new Error('Choose the agreed provider and date.');
  return { action, direction: form.direction, consent: true, consent_note: form.consentNote.trim(),
    ...(action === 'RESCHEDULE' ? { target_date: form.targetDate, target_provider_id: form.targetProvider } : {}) };
}
