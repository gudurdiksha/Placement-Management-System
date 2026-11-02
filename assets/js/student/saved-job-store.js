(function () {
  'use strict';
  const SAVED_API_BASE = 'http://127.0.0.1:8080/api/students/saved-jobs';
  const STORAGE_KEY = 'campusconnect.savedJobs';

  function readLocal() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
    catch { return []; }
  }
  function writeLocal(arr) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(arr)); } catch {}
  }

  window.SavedJobsStore = {
    async list() {
      try {
        const res = await fetch(SAVED_API_BASE, { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          // Backend returns [{savedId, jobId, savedAt, job, ...}]
          return data.map(item => ({
            id: item.jobId,
            savedAt: item.savedAt,
            job: item.job,                          // already hydrated
            eligible: item.eligible,
            reasons: item.ineligibilityReasons || []
          }));
        }
      } catch (e) { console.warn('saved-jobs API list failed, using local', e); }
      return readLocal();
    },

    async save(jobId) {
      const entry = { id: jobId, savedAt: new Date().toISOString() };
      try {
        const res = await fetch(SAVED_API_BASE, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ jobId })
        });
        if (res.ok) {
          // Also mirror to local so offline still works
          const cur = readLocal();
          if (!cur.some(e => String(e.id) === String(jobId))) cur.unshift(entry);
          writeLocal(cur);
          return entry;
        } else {
          const txt = await res.text();
          console.warn('Save API failed:', res.status, txt);
        }
      } catch (e) { console.warn('Save API error', e); }

      const cur = readLocal();
      if (!cur.some(e => String(e.id) === String(jobId))) cur.unshift(entry);
      writeLocal(cur);
      return entry;
    },

    async remove(jobId) {
      try {
        await fetch(`${SAVED_API_BASE}/${jobId}`, {
          method: 'DELETE',
          credentials: 'include'
        });
      } catch (e) { console.warn('Remove API error', e); }
      writeLocal(readLocal().filter(e => String(e.id) !== String(jobId)));
    },

    isSaved(jobId) {
      return readLocal().some(e => String(e.id) === String(jobId));
    }
  };
})();

