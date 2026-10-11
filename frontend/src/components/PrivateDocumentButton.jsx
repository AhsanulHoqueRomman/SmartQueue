import { useState } from 'react';
import apiClient from '../api/client';
import { privateDocumentPath, privateDocumentError, privateDocumentFilename } from '../utils/privateDocuments';

// Backend supplies an API destination, never a storage URL. Axios supplies JWT.
export default function PrivateDocumentButton({ url, filename, children = 'Download Document' }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const download = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await apiClient.get(privateDocumentPath(url), { responseType: 'blob' });
      const blobUrl = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = privateDocumentFilename(filename, response.data.type);
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch (err) {
      setError(privateDocumentError(err.response?.status));
    } finally {
      setBusy(false);
    }
  };
  return <>
    <button type="button" className="btn btn-sm btn-secondary" disabled={busy} onClick={download}>
      {busy ? 'Downloading…' : children}
    </button>
    {error && <p role="alert">{error}</p>}
  </>;
}
