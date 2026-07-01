/* REACH Election — API client
   All endpoints from 03_BACKEND.md + missing entries from 10_AUDIT.md Pass 2. */

export const BASE = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL.replace(/\/$/, '') + '/v1'
  : '/v1';

export const tokenStore = {
  token: null,
  set(t)   { this.token = t; },
  get()    { return this.token; },
  clear()  { this.token = null; },
};

function handleError(status, data) {
  if (status === 401) window.dispatchEvent(new CustomEvent('reach:logout', { detail: { reason: 'unauthorized' } }));
  const detail = typeof data === 'object' ? (data?.detail || JSON.stringify(data)) : data;
  throw new Error(detail || `HTTP ${status}`);
}

async function request(method, path, body = null, signal = null) {
  const headers = { 'Content-Type': 'application/json' };
  const token = tokenStore.get();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const options = { method, headers, credentials: 'include' };
  if (body)   options.body   = JSON.stringify(body);
  if (signal) options.signal = signal;

  let res = await fetch(`${BASE}${path}`, options);

  // Token refresh on 401
  if (res.status === 401) {
    const refreshRes = await fetch(`${BASE}/auth/refresh`, { method: 'POST', credentials: 'include' });
    if (refreshRes.ok) {
      const { access_token } = await refreshRes.json();
      tokenStore.set(access_token);
      headers['Authorization'] = `Bearer ${access_token}`;
      res = await fetch(`${BASE}${path}`, { ...options, headers });
    } else {
      tokenStore.clear();
      window.dispatchEvent(new CustomEvent('reach:logout'));
      throw new Error('Session expired.');
    }
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) handleError(res.status, data);
  return data;
}

function authHeader() {
  const t = tokenStore.get();
  return t ? { 'Authorization': `Bearer ${t}` } : {};
}

export const api = {
  // ── Auth ──────────────────────────────────────────────────────────────────
  getMe:              ()              => request('GET',    '/auth/me'),
  sendOtp:            (ch, id)        => request('POST',   '/auth/send-otp',
    ch === 'sms' ? { channel: ch, phone: id } : { channel: ch, email: id }),
  verifyOtp:          (ch, id, otp, extra) => request('POST', '/auth/verify-otp',
    { channel: ch, ...(ch === 'sms' ? { phone: id } : { email: id }), otp, ...extra })
    .then(d => { if (d.access_token) tokenStore.set(d.access_token); return d; }),
  logout:             ()              => request('POST',   '/auth/logout').finally(() => tokenStore.clear()),
  refresh:            ()              => fetch(`${BASE}/auth/refresh`, { method: 'POST', credentials: 'include' })
                                           .then(r => r.json())
                                           .then(d => { if (d.access_token) tokenStore.set(d.access_token); return d; }),
  // 10_AUDIT.md Pass 2 missing entries
  listAuthSessions:   ()              => request('GET',    '/auth/sessions'),
  revokeSession:      (id)            => request('DELETE', `/auth/sessions/${id}`),
  revokeAllSessions:  ()              => request('POST',   '/auth/revoke-all'),

  // ── Invites ───────────────────────────────────────────────────────────────
  previewInvite:      (token)         => request('GET',    `/invites/preview/${token}`),
  claimInvite:        (body)          => request('POST',   '/invites/claim', body)
                                           .then(d => { if (d.access_token) tokenStore.set(d.access_token); return d; }),
  createCoordInvite:  (zone_id)       => request('POST',   '/invites/coordinator', { zone_id }),
  createAgentInvite:  (body)          => request('POST',   '/invites/agent', body),
  // 10_AUDIT.md Pass 2 missing entries
  listZoneInvites:    (zone_id)       => request('GET',    `/invites/zone/${zone_id}`),
  revokeInvite:       (id)            => request('DELETE', `/invites/${id}`),

  // ── Campaigns ─────────────────────────────────────────────────────────────
  createCampaign:     (body)          => request('POST',   '/campaigns', body),
  getCampaign:        ()              => request('GET',    '/campaigns/mine'),
  updateCampaign:     (id, body)      => request('PATCH',  `/campaigns/${id}`, body),
  // 10_AUDIT.md Pass 2 missing entries
  getCampaignStats:   (id)            => request('GET',    `/campaigns/${id}/stats`),
  uploadLogo:         (id, formData)  => fetch(`${BASE}/campaigns/${id}/logo`, {
    method: 'POST', headers: authHeader(), body: formData, credentials: 'include',
  }).then(r => r.json()),

  // ── Zones ─────────────────────────────────────────────────────────────────
  createZone:         (body)          => request('POST',   '/zones', body),
  listZones:          ()              => request('GET',    '/zones'),
  deleteZone:         (id)            => request('DELETE', `/zones/${id}`),
  // 10_AUDIT.md Pass 2 missing entries
  getZone:            (id)            => request('GET',    `/zones/${id}`),
  updateZone:         (id, body)      => request('PATCH',  `/zones/${id}`, body),

  // ── Polling Units ─────────────────────────────────────────────────────────
  createPU:           (body)          => request('POST',   '/polling-units', body),
  importPUs:          (formData)      => fetch(`${BASE}/polling-units/import`, {
    method: 'POST', headers: authHeader(), body: formData, credentials: 'include',
  }).then(r => r.json()),
  listPUs:            (zoneId)        => request('GET',    `/polling-units${zoneId ? `?zone_id=${zoneId}` : ''}`),
  // 10_AUDIT.md Pass 2 missing entries
  updatePU:           (id, body)      => request('PATCH',  `/polling-units/${id}`, body),
  deletePU:           (id)            => request('DELETE', `/polling-units/${id}`),
  downloadPUTemplate: ()              => fetch(`${BASE}/polling-units/template`, { headers: authHeader(), credentials: 'include' }),

  // ── Voters ────────────────────────────────────────────────────────────────
  addVoter:           (body)          => request('POST',   '/voters', body),
  importVoters:       (formData)      => fetch(`${BASE}/voters/bulk`, {
    method: 'POST', headers: authHeader(), body: formData, credentials: 'include',
  }).then(r => r.json()),
  listVoters:         (params)        => request('GET',    `/voters?${new URLSearchParams(params)}`),
  getVoter:           (id)            => request('GET',    `/voters/${id}`),
  updateVoter:        (id, body)      => request('PATCH',  `/voters/${id}`, body),
  deleteVoter:        (id)            => request('DELETE', `/voters/${id}`),
  logContact:         (id, body)      => request('POST',   `/voters/${id}/contacts`, body),
  getQueue:           ()              => request('GET',    '/voters/queue'),
  getDuplicates:      ()              => request('GET',    '/voters/duplicates'),
  resolveDuplicate:   (id, body)      => request('POST',   `/voters/${id}/resolve-duplicate`, body),
  // 10_AUDIT.md Pass 2 missing entry
  downloadVoterTemplate: ()           => fetch(`${BASE}/voters/template`, { headers: authHeader(), credentials: 'include' }),
  // Option C — seeded voter flow
  searchVoters:       (q)             => request('GET',    `/voters/search?q=${encodeURIComponent(q)}`),
  claimVoter:         (id, body)      => request('PATCH',  `/voters/${id}/claim`, body),
  importINECVoters:   (formData)      => fetch(`${BASE}/voters/import/inec`, {
    method: 'POST', headers: authHeader(), body: formData, credentials: 'include',
  }).then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d?.detail || `HTTP ${r.status}`); return d; }),
  listImports:        ()              => request('GET',    '/voters/imports'),
  searchINECReference: (params)       => request('GET',    `/voters/inec-reference?${new URLSearchParams(params)}`),

  // ── Templates ─────────────────────────────────────────────────────────────
  createTemplate:     (body)          => request('POST',   '/templates', body),
  listTemplates:      ()              => request('GET',    '/templates'),
  updateTemplate:     (id, body)      => request('PATCH',  `/templates/${id}`, body),
  deleteTemplate:     (id)            => request('DELETE', `/templates/${id}`),
  previewTemplate:    (id, body)      => request('POST',   `/templates/${id}/preview`, body),

  // ── Sessions ──────────────────────────────────────────────────────────────
  createSession:      (body)          => request('POST',   '/sessions', body),
  activateSession:    (id)            => request('POST',   `/sessions/${id}/activate`),
  cancelSession:      (id)            => request('POST',   `/sessions/${id}/cancel`),
  listSessions:       ()              => request('GET',    '/sessions'),
  getActiveSessions:  ()              => request('GET',    '/sessions/active'),
  getSessionQueue:    (id)            => request('GET',    `/sessions/${id}/queue`),
  logSend:            (id, body)      => request('POST',   `/sessions/${id}/send`, body),
  getSessionProgress: (id)            => request('GET',    `/sessions/${id}/progress`),
  // 10_AUDIT.md Pass 2 missing entry
  getSession:         (id)            => request('GET',    `/sessions/${id}`),

  // ── Dashboards ────────────────────────────────────────────────────────────
  directorDash:       ()              => request('GET',    '/dashboard/director'),
  coordinatorDash:    ()              => request('GET',    '/dashboard/coordinator'),
  agentDash:          ()              => request('GET',    '/dashboard/agent'),
  exportVoters:       ()              => fetch(`${BASE}/dashboard/export/voters`, {
    headers: authHeader(), credentials: 'include',
  }),
  exportContacts:     ()              => fetch(`${BASE}/dashboard/export/contacts`, {
    headers: authHeader(), credentials: 'include',
  }),

  // ── Users ─────────────────────────────────────────────────────────────────
  updateProfile:      (body)          => request('PATCH',  '/users/me', body),
  uploadAvatar:       (formData)      => fetch(`${BASE}/users/me/avatar`, {
    method: 'POST', headers: authHeader(), body: formData, credentials: 'include',
  }).then(r => r.json()),
  listAgents:         ()              => request('GET',    '/users/agents'),
  listCoordinators:   ()              => request('GET',    '/users/coordinators'),
  suspendUser:        (id)            => request('PATCH',  `/users/${id}/status`, { status: 'suspended' }),
  reinstateUser:      (id)            => request('PATCH',  `/users/${id}/status`, { status: 'active' }),
};
