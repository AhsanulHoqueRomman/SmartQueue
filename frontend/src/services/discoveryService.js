import organizationService from './organizationService';

// Reuse the existing paginated public APIs; no separate discovery data model.
export async function allPublicPages(fetchPage) {
  const items = [];
  let page = 1;
  let more = true;
  while (more) {
    const data = await fetchPage({ page, page_size: 100 });
    items.push(...(Array.isArray(data) ? data : data.results || []));
    more = !Array.isArray(data) && Boolean(data.next);
    page += 1;
  }
  return items;
}

export const publicOrganizations = () => allPublicPages(params => organizationService.getOrganizations(params));

export async function publicProfessionals(organizations) {
  const results = await Promise.allSettled(organizations.map(async organization => {
    const providers = await allPublicPages(params => organizationService.getProviders(organization.id, params));
    return providers.filter(provider => provider.is_operationally_active === true)
      .map(provider => ({ ...provider, organization }));
  }));
  return {
    providers: results.flatMap(result => result.status === 'fulfilled' ? result.value : []),
    incomplete: results.some(result => result.status === 'rejected'),
  };
}
