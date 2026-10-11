// Accept only our object-scoped API route; never send credentials to a storage URL.
export function privateDocumentPath(url) {
  if (!/^\/api\/v1\/organizations\/[a-f0-9-]+\/(?:providers\/[a-f0-9-]+\/)?(?:documents|credentials)\/[a-f0-9-]+\/download\/$/i.test(url || '')) {
    throw new Error('This document needs a secure download destination.');
  }
  return url.replace(/^\/api\/v1/, '');
}

export function privateDocumentError(status) {
  if (status === 401 || status === 403) return 'You do not have permission to download this document.';
  if (status === 404) return 'Document file is unavailable. Contact your organization.';
  return 'Unable to download the document. Please try again.';
}

export function privateDocumentFilename(filename, contentType) {
  const extension = { 'application/pdf': '.pdf', 'image/png': '.png', 'image/jpeg': '.jpg' }[contentType] || '.bin';
  // Strip controls intentionally: download filenames must not contain them.
  // eslint-disable-next-line no-control-regex
  const name = (filename || 'document').split(/[\\/]/).pop().replace(/[\x00-\x1f\x7f]/g, '') || 'document';
  return name.replace(/\.[^.]*$/, '') + extension;
}
