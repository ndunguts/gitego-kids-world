import { api } from './api.js';
import { renderChildView, sendChildLeaving, stopChildHeartbeat } from './views/childView.js';
import { renderParentView, stopParentLiveRefresh } from './views/parentView.js';
import { renderAdminView } from './views/adminView.js';

let appMode = null; // 'child' | 'parent' | 'admin'
let loginTab = 'account'; // 'account' (Parent) | 'child' (Parent Username + Child Code)
let parentAuthMode = 'login'; // 'login' | 'signup'
let publicSettings = {};

async function loadAndApplyPublicSettings() {
  try {
    publicSettings = await api.request('/api/v1/admin/public-settings');
  } catch {
    publicSettings = {};
  }
  if (publicSettings.brand_accent_color) {
    document.documentElement.style.setProperty('--accent', publicSettings.brand_accent_color);
  }
  if (publicSettings.platform_name) {
    document.title = publicSettings.platform_name;
  }
}

function allowedModesForRole(role) {
  if (role === 'SUPER_ADMIN') return ['admin', 'parent', 'child'];
  if (role === 'CONTENT_ADMIN') return ['admin', 'child'];
  if (role === 'PARENT') return ['parent', 'child'];
  return ['child']; // CHILD
}

function defaultModeForRole(role) {
  if (role === 'SUPER_ADMIN' || role === 'CONTENT_ADMIN') return 'admin';
  if (role === 'PARENT') return 'parent';
  return 'child';
}

function renderLoginScreen(root, initialError = '') {
  const brandName = publicSettings.platform_name || 'Gitego Kids World';
  const brandTagline = publicSettings.platform_tagline || 'Play • Watch • Read • Learn • Explore';
  const allowSignup = String(publicSettings.allow_parent_self_registration ?? 'true').toLowerCase() !== 'false';
  if (!allowSignup) parentAuthMode = 'login';

  root.innerHTML = `
    <div class="auth-screen">
      <div class="auth-card">
        <div class="auth-brand">
          <span class="brand-mark" aria-hidden="true">${brandName.trim().charAt(0).toUpperCase() || 'G'}</span>
          <div>
            <h1>${brandName}</h1>
            <p>${brandTagline}</p>
          </div>
        </div>

        <div class="auth-mode-tabs" role="tablist">
          <button class="auth-tab-btn ${loginTab === 'account' ? 'active' : ''}" id="tab-account-login" type="button">
            🛡️ Parent
          </button>
          <button class="auth-tab-btn ${loginTab === 'child' ? 'active' : ''}" id="tab-child-login" type="button">
            🧒 Child Login
          </button>
        </div>

        <div id="auth-error-box" class="auth-error ${initialError ? 'show' : ''}">${initialError}</div>

        ${
          loginTab === 'account'
            ? parentAuthMode === 'login'
              ? `
          <form id="account-login-form" class="auth-form">
            <label class="form-control">
              Username or Email
              <input id="login-identifier" type="text" placeholder="e.g. mugabo_parent" autocomplete="username" required />
            </label>
            <label class="form-control">
              Password
              <input id="login-password" type="password" placeholder="Enter your password" autocomplete="current-password" required />
            </label>
            <button id="login-submit-btn" class="auth-submit-btn" type="submit">Sign In →</button>
          </form>
          ${
            allowSignup
              ? `<div style="margin-top:14px;text-align:center">
                   <button id="switch-to-signup-btn" type="button" style="background:none;border:none;color:#38bdf8;font-weight:700;font-size:0.86rem;cursor:pointer;text-decoration:underline">
                     Nta konti ufite? Fungura Konti y'Umubyeyi (Sign Up) →
                   </button>
                 </div>`
              : ''
          }
          <div class="auth-hint">
            <strong>Parent:</strong> gucunga konti z'abana, screen-time, no kubaha code yo kwinjira muri <em>Child World</em>.
          </div>
        `
              : `
          <form id="parent-signup-form" class="auth-form">
            <label class="form-control">
              Full Name (Amazina yose)
              <input id="reg-fullname" type="text" placeholder="e.g. Uwimana Claire" required />
            </label>
            <label class="form-control">
              Username
              <input id="reg-username" type="text" placeholder="e.g. uwimana_parent" autocomplete="username" required />
            </label>
            <label class="form-control">
              Email
              <input id="reg-email" type="email" placeholder="e.g. uwimana@example.com" autocomplete="email" required />
            </label>
            <label class="form-control">
              Phone Number (Optional)
              <input id="reg-phone" type="tel" placeholder="e.g. +250 788 000 000" />
            </label>
            <label class="form-control">
              Password (Min 6 characters)
              <input id="reg-password" type="password" minlength="6" placeholder="Create a strong password" autocomplete="new-password" required />
            </label>
            <label style="display:flex;align-items:center;gap:8px;font-size:0.82rem;color:var(--text-2);cursor:pointer">
              <input id="reg-consent" type="checkbox" checked required style="width:auto;height:auto" />
              <span>Ndemeza ko ndi umubyeyi / umurera umwana (Parental Consent)</span>
            </label>
            <button id="reg-submit-btn" class="auth-submit-btn" type="submit">✨ Create Parent Account (Sign Up) →</button>
          </form>
          <div style="margin-top:14px;text-align:center">
            <button id="switch-to-login-btn" type="button" style="background:none;border:none;color:#38bdf8;font-weight:700;font-size:0.86rem;cursor:pointer;text-decoration:underline">
              ← Ufite konti? Subira kuri Sign In
            </button>
          </div>
        `
            : `
          <form id="child-login-form" class="auth-form">
            <label class="form-control">
              Parent's Username (Username y'Umubyeyi)
              <input id="child-parent-ident" type="text" placeholder="e.g. mugabo_parent" autocomplete="username" required />
            </label>
            <label class="form-control">
              Child Access Code (Code y'Umwana)
              <input id="child-pin-code" type="password" inputmode="numeric" placeholder="e.g. 1111" autocomplete="one-time-code" required />
            </label>
            <button id="child-login-submit-btn" class="auth-submit-btn" type="submit">🧒 Injira muri Child World →</button>
          </form>
          <div class="auth-hint">
            Koresha <code>username</code> y'umubyeyi wawe hamwe na <code>code</code> wahawe n'umubyeyi kugira ngo winjire muri <strong>Child World</strong> gusa. (Abana ntibafungura konti — bafungurirwa n'umubyeyi.)
          </div>
        `
        }
      </div>
    </div>
  `;

  root.querySelector('#tab-account-login').addEventListener('click', () => {
    loginTab = 'account';
    renderLoginScreen(root);
  });
  root.querySelector('#tab-child-login').addEventListener('click', () => {
    loginTab = 'child';
    parentAuthMode = 'login';
    renderLoginScreen(root);
  });

  const toSignupBtn = root.querySelector('#switch-to-signup-btn');
  if (toSignupBtn) {
    toSignupBtn.addEventListener('click', () => {
      parentAuthMode = 'signup';
      renderLoginScreen(root);
    });
  }
  const toLoginBtn = root.querySelector('#switch-to-login-btn');
  if (toLoginBtn) {
    toLoginBtn.addEventListener('click', () => {
      parentAuthMode = 'login';
      renderLoginScreen(root);
    });
  }

  const showError = (msg) => {
    const box = root.querySelector('#auth-error-box');
    if (box) {
      box.textContent = msg;
      box.classList.add('show');
    }
  };

  const accForm = root.querySelector('#account-login-form');
  if (accForm) {
    accForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const ident = root.querySelector('#login-identifier').value.trim();
      const pw = root.querySelector('#login-password').value;
      const btn = root.querySelector('#login-submit-btn');
      btn.disabled = true;
      btn.textContent = 'Signing in…';
      try {
        const res = await api.login(ident, pw);
        appMode = defaultModeForRole(res.user.role);
        await renderApp();
      } catch (err) {
        btn.disabled = false;
        btn.textContent = 'Sign In →';
        showError(err.message || 'Invalid username or password');
      }
    });
  }

  const regForm = root.querySelector('#parent-signup-form');
  if (regForm) {
    regForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const full_name = root.querySelector('#reg-fullname').value.trim();
      const username = root.querySelector('#reg-username').value.trim();
      const email = root.querySelector('#reg-email').value.trim();
      const phone_number = root.querySelector('#reg-phone').value.trim() || null;
      const password = root.querySelector('#reg-password').value;
      const parental_consent_given = Boolean(root.querySelector('#reg-consent').checked);
      const btn = root.querySelector('#reg-submit-btn');
      btn.disabled = true;
      btn.textContent = 'Creating account…';
      try {
        const data = await api.request('/api/v1/auth/register', {
          method: 'POST',
          body: JSON.stringify({
            full_name,
            username,
            email,
            phone_number,
            password,
            parental_consent_given,
            preferred_language: publicSettings.default_language || 'rw',
          }),
        });
        api.setSession(data);
        parentAuthMode = 'login';
        appMode = 'parent';
        await renderApp();
      } catch (err) {
        btn.disabled = false;
        btn.textContent = '✨ Create Parent Account (Sign Up) →';
        showError(err.message || 'Could not create parent account');
      }
    });
  }

  const childForm = root.querySelector('#child-login-form');
  if (childForm) {
    childForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const parentIdent = root.querySelector('#child-parent-ident').value.trim();
      const pinCode = root.querySelector('#child-pin-code').value.trim();
      const btn = root.querySelector('#child-login-submit-btn');
      btn.disabled = true;
      btn.textContent = 'Checking code…';
      try {
        await api.childLogin(parentIdent, pinCode);
        appMode = 'child';
        await renderApp();
      } catch (err) {
        btn.disabled = false;
        btn.textContent = '🧒 Injira muri Child World →';
        showError(err.message || 'Invalid parent username or child access code');
      }
    });
  }
}

async function renderApp() {
  const root = document.getElementById('app');
  await loadAndApplyPublicSettings();
  const token = api.getToken();
  let user = api.getCurrentUser();

  if (!token || !user) {
    renderLoginScreen(root);
    return;
  }

  // Verify token is still valid and sync role from server
  try {
    const me = await api.request('/api/v1/auth/me');
    user = {
      id: me.id,
      email: me.email,
      username: me.username,
      full_name: me.role === 'CHILD' && me.child_profile ? me.child_profile.display_name : me.full_name,
      role: me.role,
      child_profile_id: me.child_profile_id,
    };
    api.setSession({ user });
  } catch {
    api.clearSession();
    renderLoginScreen(root);
    return;
  }

  const role = user.role;
  const allowed = allowedModesForRole(role);
  if (!appMode || !allowed.includes(appMode)) {
    appMode = defaultModeForRole(role);
  }

  const fullName = user.full_name || user.username || '';
  const roleLabel = String(role || '').replace('_', ' ');

  const navButtons = [];
  if (allowed.includes('child')) {
    navButtons.push(
      `<button class="role-pill ${appMode === 'child' ? 'active' : ''}" id="switch-child-btn" type="button">Child World</button>`
    );
  }
  if (allowed.includes('parent')) {
    navButtons.push(
      `<button class="role-pill ${appMode === 'parent' ? 'active' : ''}" id="switch-parent-btn" type="button">Parent Portal</button>`
    );
  }
  if (allowed.includes('admin')) {
    const adminLabel = role === 'CONTENT_ADMIN' ? 'Creator Studio' : 'Admin & Game Studio';
    navButtons.push(
      `<button class="role-pill ${appMode === 'admin' ? 'active' : ''}" id="switch-admin-btn" type="button">${adminLabel}</button>`
    );
  }

  await loadAndApplyPublicSettings();
  const brandName = publicSettings.platform_name || 'Gitego Kids World';
  const brandTagline = publicSettings.platform_tagline || 'Play • Watch • Read • Learn • Explore';
  const brandLogoUrl = (publicSettings.platform_logo_url || '').trim();
  const brandMarkHtml = brandLogoUrl
    ? `<img src="${brandLogoUrl}" alt="${brandName}" class="brand-mark" style="object-fit:cover;padding:0" />`
    : `<span class="brand-mark" aria-hidden="true">${brandName.trim().charAt(0).toUpperCase() || 'G'}</span>`;
  const annOn = String(publicSettings.announcement_enabled || '').toLowerCase() === 'true' && (publicSettings.announcement_text || '').trim();
  const annBannerHtml = annOn
    ? `<div id="global-announcement-banner" style="background:${publicSettings.announcement_bg || '#f59e0b'};color:#0b0d12;padding:8px 18px;text-align:center;font-weight:800;font-size:0.86rem">📢 ${publicSettings.announcement_text}</div>`
    : '';
  const maintOn = String(publicSettings.maintenance_mode || '').toLowerCase() === 'true' && role !== 'SUPER_ADMIN';
  const maintBannerHtml = maintOn
    ? `<div style="background:rgba(244,63,94,0.2);border-bottom:1px solid rgba(244,63,94,0.45);color:#fda4af;padding:9px 18px;text-align:center;font-weight:800;font-size:0.86rem">🚧 ${publicSettings.maintenance_message || 'Platform maintenance in progress.'}</div>`
    : '';

  const canReturnToParent = api.hasParentReturnSession();

  root.innerHTML = `
    ${annBannerHtml}
    ${maintBannerHtml}
    <header class="platform-topbar">
      <div class="topbar-brand">
        ${brandMarkHtml}
        <span class="brand-text">
          <span class="brand-name">${brandName}</span>
          <span class="tagline">${brandTagline}</span>
        </span>
      </div>
      <div class="topbar-controls">
        ${canReturnToParent ? `<button class="return-parent-btn" id="return-parent-btn" type="button">↩️ Return to Admin / Parent</button>` : ''}
        ${navButtons.length > 1 ? `<nav class="role-switch" aria-label="Switch portal">${navButtons.join('')}</nav>` : ''}
        <div class="user-chip" title="Signed in as ${fullName} (${roleLabel})">
          <span class="user-initial">${(fullName || '?').trim().charAt(0).toUpperCase()}</span>
          <span class="user-meta"><strong>${fullName}</strong><small>${roleLabel}</small></span>
        </div>
        <button class="logout-btn" id="logout-btn" type="button">Sign Out</button>
      </div>
    </header>
    <div id="view-outlet"></div>
  `;

  const returnParentBtn = root.querySelector('#return-parent-btn');
  if (returnParentBtn) {
    returnParentBtn.addEventListener('click', async () => {
      if (role === 'CHILD') await sendChildLeaving();
      if (api.restoreParentReturnSession()) {
        const restored = api.getCurrentUser();
        appMode = defaultModeForRole(restored?.role || 'PARENT');
        await renderApp();
      }
    });
  }

  const childBtn = root.querySelector('#switch-child-btn');
  if (childBtn) {
    childBtn.addEventListener('click', () => {
      stopParentLiveRefresh();
      appMode = 'child';
      renderApp();
    });
  }
  const parentBtn = root.querySelector('#switch-parent-btn');
  if (parentBtn) {
    parentBtn.addEventListener('click', () => {
      stopChildHeartbeat();
      appMode = 'parent';
      renderApp();
    });
  }
  const adminBtn = root.querySelector('#switch-admin-btn');
  if (adminBtn) {
    adminBtn.addEventListener('click', () => {
      stopChildHeartbeat();
      stopParentLiveRefresh();
      appMode = 'admin';
      renderApp();
    });
  }
  root.querySelector('#logout-btn').addEventListener('click', async () => {
    stopParentLiveRefresh();
    await sendChildLeaving();
    api.clearSession();
    appMode = null;
    renderLoginScreen(root);
  });

  const outlet = root.querySelector('#view-outlet');
  if (appMode === 'child') {
    stopParentLiveRefresh();
    await renderChildView(outlet);
  } else if (appMode === 'parent') {
    stopChildHeartbeat();
    await renderParentView(outlet, () => {
      appMode = 'child';
      renderApp();
    });
  } else if (appMode === 'admin') {
    stopChildHeartbeat();
    stopParentLiveRefresh();
    await renderAdminView(outlet);
  }
}

window.addEventListener('gitego:settings-updated', async () => {
  await loadAndApplyPublicSettings();
  const brandEl = document.querySelector('.topbar-brand .brand-name');
  const tagEl = document.querySelector('.topbar-brand .tagline');
  if (brandEl && publicSettings.platform_name) brandEl.textContent = publicSettings.platform_name;
  if (tagEl && publicSettings.platform_tagline) tagEl.textContent = publicSettings.platform_tagline;
  const existingAnn = document.querySelector('#global-announcement-banner');
  const annOn = String(publicSettings.announcement_enabled || '').toLowerCase() === 'true' && (publicSettings.announcement_text || '').trim();
  if (annOn) {
    if (existingAnn) {
      existingAnn.style.background = publicSettings.announcement_bg || '#f59e0b';
      existingAnn.textContent = `📢 ${publicSettings.announcement_text}`;
    } else {
      const topbar = document.querySelector('.platform-topbar');
      if (topbar && topbar.parentNode) {
        const div = document.createElement('div');
        div.id = 'global-announcement-banner';
        div.style.cssText = `background:${publicSettings.announcement_bg || '#f59e0b'};color:#0b0d12;padding:8px 18px;text-align:center;font-weight:800;font-size:0.86rem`;
        div.textContent = `📢 ${publicSettings.announcement_text}`;
        topbar.parentNode.insertBefore(div, topbar);
      }
    }
  } else if (existingAnn) {
    existingAnn.remove();
  }
});

window.addEventListener('gitego:child-suspended', (e) => {
  const root = document.getElementById('app');
  loginTab = 'child';
  appMode = null;
  renderLoginScreen(root, e.detail?.message || 'Account yahagaritswe n\'umubyeyi.');
});

renderApp();
