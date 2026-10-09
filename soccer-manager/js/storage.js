/*
 * 터치라인 매니저 — 저장소
 *
 * 기본은 이 브라우저의 localStorage. claude.ai 아티팩트로 열면 db 기능으로
 * 계정에 개인 저장본을 하나 더 둬서 다른 기기에서도 이어서 할 수 있다.
 * 모든 접근은 실패해도 게임이 계속 돌아가도록 try/catch로 감싼다.
 */
(function (root) {
  'use strict';

  const KEY = 'touchline-manager-save-v1';
  const CLOUD_MIN_GAP = 45 * 1000; // 클라우드 쓰기는 45초에 한 번까지

  const cloud = { ref: null, state: 'off', inFlight: false, lastWrite: 0, lastRev: -1 };

  function loadLocal() {
    try { return root.localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function saveLocal(json) {
    try { root.localStorage.setItem(KEY, json); return true; } catch (e) { return false; }
  }
  function clearLocal() {
    try { root.localStorage.removeItem(KEY); } catch (e) { /* 무시 */ }
  }

  // 내보내기 코드: UTF-8 JSON을 base64로
  function encode(json) {
    const bytes = new TextEncoder().encode(json);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return 'TLM1.' + btoa(bin);
  }
  function decode(code) {
    const raw = String(code || '').trim().replace(/\s+/g, '');
    if (!raw.startsWith('TLM1.')) throw new Error('터치라인 매니저 저장 코드가 아니에요');
    const bin = atob(raw.slice(5));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  async function initCloud() {
    const c = root.claude;
    if (!c || typeof c.use !== 'function') return false;
    try {
      const [db, user] = await Promise.all([c.use('db'), c.use('user')]);
      if (!db || !user) return false;
      const id = await user.id();
      if (!id) return false;
      cloud.ref = db.doc('data/users/' + id + '/save');
      cloud.state = 'on';
      return true;
    } catch (e) {
      cloud.state = 'off';
      return false;
    }
  }

  async function cloudLoad() {
    if (!cloud.ref) return null;
    try {
      const snap = await cloud.ref.get();
      if (!snap.exists) return null;
      const d = snap.data();
      if (!d || typeof d.json !== 'string' || !Number.isFinite(d.savedAt)) return null;
      return { savedAt: d.savedAt, json: d.json };
    } catch (e) {
      return null;
    }
  }

  // 의미 있는 변화(rev)가 있고 마지막 쓰기 후 충분히 지났을 때만 쓴다
  async function cloudSave(json, rev, force) {
    if (!cloud.ref || cloud.inFlight || cloud.state !== 'on') return;
    const now = Date.now();
    if (!force && (rev === cloud.lastRev || now - cloud.lastWrite < CLOUD_MIN_GAP)) return;
    cloud.inFlight = true;
    try {
      await cloud.ref.set({ savedAt: now, json });
      cloud.lastWrite = now;
      cloud.lastRev = rev;
    } catch (e) {
      const code = e && e.code;
      if (code === 'invalid_argument' || code === 'revoked' || code === 'not_granted' || code === 'quota_exceeded') cloud.state = 'blocked';
    } finally {
      cloud.inFlight = false;
    }
  }

  async function cloudClear() {
    if (!cloud.ref || cloud.state !== 'on') return;
    try { await cloud.ref.delete(); } catch (e) { /* 무시 */ }
  }

  root.TLStore = {
    loadLocal, saveLocal, clearLocal, encode, decode,
    initCloud, cloudLoad, cloudSave, cloudClear,
    cloudState: () => cloud.state,
  };
})(typeof window !== 'undefined' ? window : globalThis);
