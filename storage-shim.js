// storage-shim.js
// Provides a localStorage-backed implementation of window.storage
// so this app keeps working when deployed outside Claude.ai (e.g. Vercel),
// where the native window.storage API used inside Claude artifacts doesn't exist.
//
// Note: this shim is local to one browser. It makes the personal ledger
// persist correctly. It does NOT provide real cross-device sync — a
// "shared household" code will only appear shared to tabs/browsers that
// share the same localStorage (i.e. the same browser on the same device).
// True cross-device sharing would require a real backend.
(function () {
  if (window.storage) return; // already provided by the Claude artifact host — leave it alone

  const PREFIX = "ledger-app:";

  function fullKey(key, shared) {
    return PREFIX + (shared ? "shared:" : "personal:") + key;
  }

  window.storage = {
    async get(key, shared = false) {
      const raw = localStorage.getItem(fullKey(key, shared));
      if (raw === null) throw new Error("key not found");
      return { key, value: raw, shared: !!shared };
    },
    async set(key, value, shared = false) {
      localStorage.setItem(fullKey(key, shared), value);
      return { key, value, shared: !!shared };
    },
    async delete(key, shared = false) {
      localStorage.removeItem(fullKey(key, shared));
      return { key, deleted: true, shared: !!shared };
    },
    async list(prefix = "", shared = false) {
      const scope = PREFIX + (shared ? "shared:" : "personal:");
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(scope + prefix)) {
          keys.push(k.slice(scope.length));
        }
      }
      return { keys, prefix, shared: !!shared };
    },
  };
})();
