/**
 * Derive a professional's display name and designation from the existing
 * backend fields.
 *
 * Provider payload shape varies by endpoint: some expose a nested
 * `membership.user`, others expose flat `user_first_name` / `user_last_name`.
 * Both are read here so the person's actual name is preferred.
 *
 * ProviderProfile.title (the designation) is only used as a display-name
 * fallback when no person name exists. In that case the raw title would
 * otherwise be rendered twice — once as the name and once as the
 * designation — so the designation is rendered only when it genuinely
 * differs from the displayed name.
 */
export function deriveProfessionalDisplay(prov = {}, fallback = 'Professional') {
  const user = prov?.membership?.user || {};
  const first = String(user.first_name ?? prov?.user_first_name ?? '').trim();
  const last = String(user.last_name ?? prov?.user_last_name ?? '').trim();
  const title = typeof prov?.title === 'string' ? prov.title.trim() : '';
  const personName = `${first} ${last}`.trim();

  const displayName = personName || title || fallback;
  const designation = title;
  const showDesignation = Boolean(title) && title.toLowerCase() !== displayName.toLowerCase();

  return { displayName, designation, showDesignation };
}

export default deriveProfessionalDisplay;
