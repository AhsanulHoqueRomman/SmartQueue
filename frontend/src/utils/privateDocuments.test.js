import test from 'node:test';
import assert from 'node:assert/strict';
import { privateDocumentPath, privateDocumentError, privateDocumentFilename } from './privateDocuments.js';

test('object-scoped provider/organization/credential endpoints use the authenticated client base', () => {
  for (const path of ['documents/abc/download/', 'credentials/abc/download/', 'providers/def/documents/abc/download/']) {
    assert.equal(privateDocumentPath(`/api/v1/organizations/abc/${path}`), `/organizations/abc/${path}`);
  }
});

test('storage/public/external/traversal destinations are refused before requesting', () => {
  for (const url of ['/media/provider_docs/proof.pdf', 'https://foreign.invalid/api/v1/organizations/abc/documents/abc/download/',
    '//foreign.invalid/file', '/api/v1/organizations/abc/documents/../download/', '', null]) {
    assert.throws(() => privateDocumentPath(url));
  }
});

test('authorization and missing-file errors are clear without private paths', () => {
  assert.match(privateDocumentError(403), /permission/);
  assert.match(privateDocumentError(404), /unavailable/);
  assert.match(privateDocumentError(500), /try again/);
});

test('download filenames cannot preserve executable extensions or user paths', () => {
  assert.equal(privateDocumentFilename('C:\\private\\license.exe', 'application/pdf'), 'license.pdf');
  assert.equal(privateDocumentFilename('../../old.doc', 'application/octet-stream'), 'old.bin');
  assert.equal(privateDocumentFilename('proof.jpeg', 'image/jpeg'), 'proof.jpg');
});
