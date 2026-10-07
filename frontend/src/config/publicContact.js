// Explicitly public details only; blank values never create placeholder links.
const publicUrl = value => {
  try {
    const url = new URL(value?.trim());
    return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
  } catch { return ''; }
};

export const footerSocials = [
  { platform: 'facebook', label: 'Facebook', url: publicUrl(import.meta.env.VITE_PUBLIC_FACEBOOK_URL) },
  { platform: 'instagram', label: 'Instagram', url: publicUrl(import.meta.env.VITE_PUBLIC_INSTAGRAM_URL) },
  { platform: 'x', label: 'X', url: publicUrl(import.meta.env.VITE_PUBLIC_X_URL) },
  { platform: 'youtube', label: 'YouTube', url: publicUrl(import.meta.env.VITE_PUBLIC_YOUTUBE_URL) },
];

export const publicContact = {
  phone: (import.meta.env.VITE_PUBLIC_SUPPORT_PHONE || '').trim(),
  email: (import.meta.env.VITE_PUBLIC_SUPPORT_EMAIL || '').trim(),
  location: (import.meta.env.VITE_PUBLIC_LOCATION || '').trim(),
};
