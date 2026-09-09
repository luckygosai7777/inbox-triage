/* Thin fetch wrapper for the Django API.
   Sends the session cookie and the CSRF token Django expects on writes. */

const BASE = import.meta.env.VITE_API_BASE || '/api';

function readCookie(name) {
  const match = document.cookie.match(new RegExp('(^|;\\s*)' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[2]) : null;
}

export class ApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

async function request(path, { method = 'GET', body, isForm = false } = {}) {
  const headers = {};
  if (!isForm && body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET' && method !== 'HEAD') {
    const token = readCookie('csrftoken');
    if (token) headers['X-CSRFToken'] = token;
  }

  let response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      headers,
      credentials: 'include',
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
  } catch (cause) {
    throw new ApiError('Could not reach the server. Is the backend running?', 0, null);
  }

  if (response.status === 204) return null;

  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { detail: text.slice(0, 300) };
    }
  }

  if (!response.ok) {
    const detail =
      payload?.detail ||
      (payload && typeof payload === 'object'
        ? Object.entries(payload)
            .map(([field, errors]) => `${field}: ${[].concat(errors).join(', ')}`)
            .join(' · ')
        : null) ||
      `Request failed (${response.status})`;
    throw new ApiError(detail, response.status, payload);
  }
  return payload;
}

const query = (params) => {
  const search = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.set(key, value);
  });
  const string = search.toString();
  return string ? `?${string}` : '';
};

export const api = {
  // auth
  me: () => request('/auth/me/'),
  googleStart: () => request('/auth/google/start/'),
  devLogin: (username, password) =>
    request('/auth/dev-login/', { method: 'POST', body: { username, password } }),
  signOut: () => request('/auth/signout/', { method: 'POST' }),

  // mail
  mail: (params) => request(`/mail/${query(params)}`),
  mailDetail: (id) => request(`/mail/${id}/`),
  archive: (id) => request(`/mail/${id}/archive/`, { method: 'POST' }),
  flagVip: (id) => request(`/mail/${id}/flag-vip/`, { method: 'POST' }),
  bulkDelete: (messageIds) =>
    request('/mail/bulk-delete/', { method: 'POST', body: { message_ids: messageIds } }),
  sync: (maxResults) =>
    request('/mail/sync/', { method: 'POST', body: { max_results: maxResults } }),
  metrics: (params) => request(`/metrics/${query(params)}`),
  vipBrief: () => request('/mail/vip-brief/'),
  dismissBrief: (threadId) =>
    request(`/mail/vip-brief/${threadId}/dismiss/`, { method: 'POST' }),

  // important people
  vips: () => request('/vips/'),
  addVip: (email) => request('/vips/', { method: 'POST', body: { email } }),
  removeVip: (id) => request(`/vips/${id}/`, { method: 'DELETE' }),

  // subscriptions
  subscriptions: (params) => request(`/subscriptions/${query(params)}`),
  dormant: (params) => request(`/subscriptions/dormant/${query(params)}`),
  unsubscribe: (id) => request(`/subscriptions/${id}/unsubscribe/`, { method: 'POST' }),
  blacklist: (id) => request(`/subscriptions/${id}/blacklist/`, { method: 'POST' }),
  resubscribe: (id) => request(`/subscriptions/${id}/resubscribe/`, { method: 'POST' }),
  subscriptionBulk: (action, ids) =>
    request('/subscriptions/bulk/', {
      method: 'POST',
      body: { action, subscription_ids: ids },
    }),

  // schedule
  schedule: (params) => request(`/schedule/${query(params)}`),
  assignSlot: (messageIds, slotKey) =>
    request('/schedule/assign/', {
      method: 'POST',
      body: { message_ids: messageIds, slot_key: slotKey },
    }),
  rebuildSchedule: (blockMinutes) =>
    request('/schedule/rebuild/', { method: 'POST', body: { block_minutes: blockMinutes } }),

  // campaigns
  campaigns: () => request('/campaigns/'),
  useCases: () => request('/campaigns/use-cases/'),
  createCampaign: (body) => request('/campaigns/', { method: 'POST', body }),
  campaign: (id) => request(`/campaigns/${id}/`),
  updateCampaign: (id, body) => request(`/campaigns/${id}/`, { method: 'PATCH', body }),
  addDocument: (id, body) =>
    request(`/campaigns/${id}/documents/`, { method: 'POST', body }),
  uploadDocuments: (id, formData) =>
    request(`/campaigns/${id}/documents/`, { method: 'POST', body: formData, isForm: true }),
  updateDocument: (id, documentId, body) =>
    request(`/campaigns/${id}/documents/${documentId}/`, { method: 'PATCH', body }),
  removeDocument: (id, documentId) =>
    request(`/campaigns/${id}/documents/${documentId}/`, { method: 'DELETE' }),
  addRecipient: (id, body) =>
    request(`/campaigns/${id}/add-recipient/`, { method: 'POST', body }),
  removeRecipient: (id, recipientId) =>
    request(`/campaigns/${id}/recipients/${recipientId}/`, { method: 'DELETE' }),
  importRecipients: (id, body) =>
    request(`/campaigns/${id}/import/`, { method: 'POST', body }),
  preview: (id, params) => request(`/campaigns/${id}/preview/${query(params)}`),
  beginReview: (id) => request(`/campaigns/${id}/begin-review/`, { method: 'POST' }),
  next: (id) => request(`/campaigns/${id}/next/`),
  sendRecord: (id, body) =>
    request(`/campaigns/${id}/send-record/`, { method: 'POST', body: body || {} }),
  resetCampaign: (id) => request(`/campaigns/${id}/reset/`, { method: 'POST' }),
};
