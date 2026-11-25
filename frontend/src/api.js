const TOKEN_KEY = 'gitego_access_token';
const REFRESH_KEY = 'gitego_refresh_token';
const USER_KEY = 'gitego_current_user';
const DEVICE_KEY = 'gitego_device_id';
const PARENT_RETURN_KEY = 'gitego_parent_return_session';

export const api = {
  getDeviceId() {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  },

  getToken() {
    return localStorage.getItem(TOKEN_KEY);
  },

  getCurrentUser() {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY) || 'null');
    } catch {
      return null;
    }
  },

  setSession(data) {
    if (data.access_token) localStorage.setItem(TOKEN_KEY, data.access_token);
    if (data.refresh_token) localStorage.setItem(REFRESH_KEY, data.refresh_token);
    if (data.user) localStorage.setItem(USER_KEY, JSON.stringify(data.user));
  },

  saveParentReturnSession() {
    const access_token = localStorage.getItem(TOKEN_KEY);
    const refresh_token = localStorage.getItem(REFRESH_KEY);
    const user = this.getCurrentUser();
    if (access_token && user && (user.role === 'PARENT' || user.role === 'SUPER_ADMIN')) {
      sessionStorage.setItem(
        PARENT_RETURN_KEY,
        JSON.stringify({ access_token, refresh_token, user })
      );
    }
  },

  hasParentReturnSession() {
    return Boolean(sessionStorage.getItem(PARENT_RETURN_KEY));
  },

  restoreParentReturnSession() {
    try {
      const raw = sessionStorage.getItem(PARENT_RETURN_KEY);
      if (!raw) return false;
      const saved = JSON.parse(raw);
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(REFRESH_KEY);
      localStorage.removeItem(USER_KEY);
      this.setSession(saved);
      sessionStorage.removeItem(PARENT_RETURN_KEY);
      return true;
    } catch {
      sessionStorage.removeItem(PARENT_RETURN_KEY);
      return false;
    }
  },

  clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(USER_KEY);
    sessionStorage.removeItem(PARENT_RETURN_KEY);
  },

  async request(path, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };
    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(path, {
      ...options,
      headers,
    });

    if (res.status === 401 && localStorage.getItem(REFRESH_KEY) && !options._retried) {
      const refRes = await fetch('/api/v1/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: localStorage.getItem(REFRESH_KEY) }),
      });
      if (refRes.ok) {
        const refData = await refRes.json();
        this.setSession(refData);
        return this.request(path, { ...options, _retried: true });
      }
    }

    const contentType = res.headers.get('content-type') || '';
    const payload = contentType.includes('application/json') ? await res.json() : await res.text();
    if (!res.ok) {
      const msg =
        (payload && payload.detail && (typeof payload.detail === 'string' ? payload.detail : JSON.stringify(payload.detail))) ||
        `Request failed (${res.status})`;
      throw new Error(msg);
    }
    return payload;
  },

  login(identifier, password) {
    return this.request('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password }),
    }).then((data) => {
      this.setSession(data);
      return data;
    });
  },

  childLogin(parent_identifier, pin_code) {
    return this.request('/api/v1/auth/child-login', {
      method: 'POST',
      body: JSON.stringify({ parent_identifier, pin_code, device_id: this.getDeviceId() }),
    }).then((data) => {
      this.clearSession();
      this.setSession(data);
      return data;
    });
  },
};
