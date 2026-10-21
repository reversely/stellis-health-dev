/**
 * @fileoverview Uploads one file as a record: MP3 audio becomes a recording
 * and PDF or image files become documents. Shared by the Records page and the
 * notebook Add source dialog.
 */
(function(root) {
'use strict';

const ACCEPT = [
  '.mp3', 'audio/mpeg', '.pdf', 'application/pdf', '.png', 'image/png', '.jpg',
  '.jpeg', 'image/jpeg'
].join(',');

/**
 * Picks the endpoint for an uploaded file from its name.
 * @param {string} name
 * @return {?string} "audio", "document", or null for other files.
 */
function uploadKind(name) {
  if (/\.mp3$/i.test(name)) {
    return 'audio';
  }
  if (/\.(pdf|png|jpe?g)$/i.test(name)) {
    return 'document';
  }
  return null;
}

/**
 * @typedef {{outcome: string, kind: ?string, record: ?Object,
 *     message: string}}
 */
let UploadResult;

/**
 * Uploads one file, filed in a notebook when one is given.
 * @param {!File} file
 * @param {?string} notebookId
 * @return {!Promise<!UploadResult>} outcome is "added", "duplicate",
 *     "refused" for a file type the app does not take, or "failed".
 */
async function uploadFile(file, notebookId) {
  const kind = uploadKind(file.name);
  if (!kind) {
    return {
      outcome: 'refused',
      kind,
      record: null,
      message: 'choose an MP3, PDF or image',
    };
  }
  const body = new FormData();
  body.append('file', file);
  if (notebookId) {
    body.append('notebook_id', notebookId);
  }
  if (kind === 'audio' && file.lastModified) {
    body.append('recorded_at', new Date(file.lastModified).toISOString());
  }
  const path = kind === 'audio' ? '/conversations/import' : '/documents';
  try {
    const result = await root.StellisDom.api(path, {method: 'POST', body});
    const record = result.document || result.conversation;
    if (result.duplicate) {
      return {outcome: 'duplicate', kind, record, message: 'already uploaded'};
    }
    const message = kind === 'audio' ? 'added and transcribing' : 'added';
    return {outcome: 'added', kind, record, message};
  } catch (error) {
    return {outcome: 'failed', kind, record: null, message: error.message};
  }
}

const exported = {
  ACCEPT,
  uploadKind,
  uploadFile
};
root.StellisRecordUpload = exported;
if (typeof module !== 'undefined') {
  module.exports = exported;
}
})(typeof window !== 'undefined' ? window : globalThis);
