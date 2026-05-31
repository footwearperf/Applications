// supabaseClient.js — data layer for FootJoy Vision
// All talking-to-Supabase lives here. Uses only the public publishable key
// plus the signed-in user's session (never the service_role key).
(function () {
  'use strict';
  const SUPABASE_URL = 'https://mlwzpgtdgfaczgxipbsq.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_bzfK6YCmPIcYm8LfMe1CGA_lS-QETHZ';

  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true }
  });

  // --- auth ---
  async function signIn(email, password) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data.user;
  }
  async function signOut() { await sb.auth.signOut(); }
  async function getUser() { const { data } = await sb.auth.getUser(); return data.user; }
  async function getSession() { const { data } = await sb.auth.getSession(); return data.session; }

  // --- accounts (via the read-only SECURITY DEFINER functions) ---
  async function nearestAccounts(lat, lng, limit = 20) {
    const { data, error } = await sb.rpc('vision_nearest_customers',
      { p_lat: lat, p_lng: lng, p_limit: limit });
    if (error) throw error;
    return data || [];
  }
  async function searchAccounts(q, limit = 25) {
    const { data, error } = await sb.rpc('vision_search_accounts',
      { p_query: q, p_limit: limit });
    if (error) throw error;
    return data || [];
  }

  // --- criteria for a fixture (product category + environment) ---
  async function criteriaFor(category, environment) {
    const { data, error } = await sb.from('vision_criteria')
      .select('id,code,name,description,full_credit_def,partial_credit_def,full_points,partial_points,type,reference_source,assessment_tip')
      .eq('category', category).eq('environment', environment).eq('active', true)
      .order('sort_order');
    if (error) throw error;
    return data || [];
  }

  // --- photos ---
  async function uploadPhoto(blob, userId, auditId) {
    const path = `${userId}/${auditId}.jpg`;
    const { error } = await sb.storage.from('vision-photos')
      .upload(path, blob, { contentType: 'image/jpeg', upsert: true });
    if (error) throw error;
    return path;
  }
  async function signedUrl(path, expires = 300) {
    if (!path) return null;
    const { data, error } = await sb.storage.from('vision-photos').createSignedUrl(path, expires);
    if (error) return null;
    return data.signedUrl;
  }

  // --- scoring (Edge Function, with a mock fallback so the app works before deploy) ---
  function gradeFor(pct) { return pct >= 90 ? 'Eagle' : pct >= 75 ? 'Birdie' : pct >= 60 ? 'Par' : 'Bogey'; }

  async function evaluate(payload) {
    try {
      const { data, error } = await sb.functions.invoke('footjoy-vision-evaluate', { body: payload });
      if (error) throw error;
      return data;
    } catch (e) {
      console.warn('evaluate(): Edge Function unavailable, using mock —', e.message);
      return mockEvaluate(payload);
    }
  }
  function mockEvaluate(payload) {
    const items = (payload.criteria || []).map(c => {
      const r = Math.random();
      let verdict = 'pass', pts = Number(c.full_points);
      if (r < 0.2) { verdict = 'fail'; pts = 0; }
      else if (r < 0.5) { verdict = 'partial'; pts = Number(c.partial_points); }
      return { criterion_id: c.id, verdict, points: pts, max_points: Number(c.full_points),
               reason: '(mock) preview score — deploy the Edge Function for real AI scoring.', confidence: 0.6 };
    });
    const score = items.reduce((s, i) => s + i.points, 0);
    const max = items.reduce((s, i) => s + i.max_points, 0) || 1;
    const pct = Math.round(score / max * 100);
    return { overall: { score, max, pct, grade: gradeFor(pct) }, items,
             notes: 'Mock response (Edge Function not deployed yet).',
             fixture_consistency: { matches_chosen: true } };
  }

  // --- save (idempotent upsert keyed on the on-device audit id) ---
  async function saveAudit(audit, items) {
    const { error: e1 } = await sb.from('vision_audits').upsert(audit, { onConflict: 'id' });
    if (e1) throw e1;
    await sb.from('vision_score_items').delete().eq('audit_id', audit.id);
    if (items && items.length) {
      const rows = items.map(i => ({
        audit_id: audit.id, criterion_id: i.criterion_id, verdict: i.verdict,
        points_awarded: i.points, max_points: i.max_points, reason: i.reason, confidence: i.confidence
      }));
      const { error: e2 } = await sb.from('vision_score_items').insert(rows);
      if (e2) throw e2;
    }
  }

  async function storeHistory(account_code) {
    const { data, error } = await sb.from('vision_audits')
      .select('id,fixture,captured_at,total_score,max_score,grade,status')
      .eq('account_code', account_code).order('captured_at', { ascending: false }).limit(50);
    if (error) throw error;
    return data || [];
  }

  window.FJV = {
    sb, signIn, signOut, getUser, getSession,
    nearestAccounts, searchAccounts, criteriaFor,
    uploadPhoto, signedUrl, evaluate, saveAudit, storeHistory, gradeFor
  };
})();
