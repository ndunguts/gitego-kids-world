import { api } from '../api.js';

let parentLiveTimer = null;

export function stopParentLiveRefresh() {
  if (parentLiveTimer) {
    clearInterval(parentLiveTimer);
    parentLiveTimer = null;
  }
}

function formatSuspendUntil(iso) {
  if (!iso) return 'Until resumed';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function renderLiveBadge(ls) {
  if (!ls) {
    return `<span class="status-pill offline">⚫ Offline</span>`;
  }
  if (ls.is_suspended) {
    return `<span class="status-pill suspended">⛔ Suspended${ls.suspended_until ? ` · until ${formatSuspendUntil(ls.suspended_until)}` : ''}</span>`;
  }
  if (ls.is_online) {
    return `<span class="status-pill online"><span class="live-dot"></span> Online · ${ls.current_activity || 'Browsing Child World'}</span>`;
  }
  return `<span class="status-pill offline">⚫ Offline</span>`;
}

export async function renderParentView(container, onSwitchToChildMode) {
  stopParentLiveRefresh();
  let children = [];
  let categories = [];
  let notifications = [];
  try {
    [children, categories, notifications] = await Promise.all([
      api.request('/api/v1/parents/children'),
      api.request('/api/v1/categories'),
      api.request('/api/v1/users/me/notifications').catch(() => []),
    ]);
  } catch (err) {
    container.innerHTML = `<div style="padding:32px;color:#fda4af">Parent Portal requires PARENT or SUPER_ADMIN login: ${err.message}</div>`;
    return;
  }

  const currentUser = api.getCurrentUser() || {};
  const isParent = currentUser.role === 'PARENT';
  const parentUsername = currentUser.username || '';

  const renderNotifsHtml = (list) => {
    const unread = (list || []).filter((n) => !n.is_read);
    if (!unread.length) return '';
    return `<div style="display:flex;flex-direction:column;gap:10px;margin-bottom:18px">
        ${unread
          .map((n) => {
            const isWarn = n.message_type === 'warning';
            const isAlert = n.message_type === 'alert';
            const bg = isWarn ? 'rgba(244,63,94,0.14)' : isAlert ? 'rgba(245,158,11,0.14)' : 'rgba(56,189,248,0.14)';
            const border = isWarn ? 'rgba(244,63,94,0.45)' : isAlert ? 'rgba(245,158,11,0.45)' : 'rgba(56,189,248,0.45)';
            const icon = isWarn ? '⚠️' : isAlert ? '🔔' : '💬';
            return `
            <div class="parent-notif-item" data-nid="${n.id}" style="background:${bg};border:1px solid ${border};border-radius:14px;padding:12px 16px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
              <div>
                <strong>${icon} ${n.title}</strong>
                ${n.rule_violated ? `<span style="margin-left:8px;font-size:0.75rem;padding:2px 8px;border-radius:999px;background:rgba(0,0,0,0.28)">Rule: ${n.rule_violated}</span>` : ''}
                <div style="font-size:0.88rem;margin-top:4px;opacity:0.92">${n.body}</div>
              </div>
              <button class="btn-secondary parent-mark-read-btn" data-nid="${n.id}" type="button" style="padding:6px 12px;font-size:0.78rem">✓ Mark Read</button>
            </div>`;
          })
          .join('')}
      </div>`;
  };

  container.innerHTML = `
    <div class="theme-parent">
      <div class="parent-shell">
        <div id="parent-notifs-wrap">${renderNotifsHtml(notifications)}</div>
        <div class="parent-banner">
          <div>
            <h1 style="margin:0;font-size:1.65rem">🛡️ Gitego Parent &amp; Guardian Portal</h1>
            <p style="margin:4px 0 0;opacity:0.9">Manage child profiles, unique access codes, live activity, screen-time limits, and account suspensions.</p>
            ${
              isParent && parentUsername
                ? `<div style="margin-top:12px;display:inline-flex;flex-wrap:wrap;align-items:center;gap:10px;padding:8px 14px;border-radius:12px;background:rgba(0,0,0,0.32);border:1px solid rgba(255,255,255,0.14);font-size:0.84rem">
                    <span>🔑 Parent Username for Child Login: <strong style="color:#6ee7b7;font-family:var(--font-mono)">${parentUsername}</strong></span>
                    <span style="color:var(--text-3)">• Ha umwana iyi username + code ye yinjire muri Child World gusa</span>
                  </div>`
                : ''
            }
          </div>
          <div style="display:flex;gap:10px;flex-wrap:wrap">
            <button id="refresh-live-status-btn" class="btn-secondary" type="button">🔄 Refresh Live</button>
            <button id="toggle-add-child-btn" class="btn-primary" type="button">+ Add Child Profile</button>
          </div>
        </div>

        <div id="new-child-code-banner" class="parent-card" style="display:none;margin-bottom:20px;border-color:rgba(16,185,129,0.45);background:rgba(16,185,129,0.08)"></div>

        <!-- Add Child Profile Form -->
        <div id="add-child-panel" class="parent-card" style="display:none;margin-bottom:22px">
          <h3 style="margin-top:0">Add a New Child Profile</h3>
          <div id="add-child-error" class="auth-error" style="margin-bottom:12px"></div>
          <div class="form-grid">
            <label class="form-control">Child Name <input id="new-child-name" type="text" placeholder="e.g. Teta" /></label>
            <label class="form-control">Avatar
              <select id="new-child-avatar">
                <option value="🦁">🦁 Lion</option>
                <option value="🚀">🚀 Rocket</option>
                <option value="🦋">🦋 Butterfly</option>
                <option value="🦒">🦒 Giraffe</option>
                <option value="🎨">🎨 Artist</option>
              </select>
            </label>
            <label class="form-control">Age <input id="new-child-age" type="number" value="7" min="3" max="14" /></label>
            <label class="form-control">Age Group
              <select id="new-child-age-group">
                <option value="3-5">Ages 3–5</option>
                <option value="6-8" selected>Ages 6–8</option>
                <option value="9-12">Ages 9–12</option>
              </select>
            </label>
            <label class="form-control">Primary Language
              <select id="new-child-lang">
                <option value="rw">🇷🇼 Kinyarwanda</option>
                <option value="fr">🇫🇷 Français</option>
                <option value="sw">🇹🇿 Kiswahili</option>
                <option value="en">🇬🇧 English</option>
              </select>
            </label>
            <label class="form-control">Child Access Code (Unique PIN — optional)
              <input id="new-child-pin" type="text" inputmode="numeric" maxlength="6" placeholder="Auto-generated unique code if blank" />
            </label>
            <label class="form-control">Daily Screen-Time Limit (mins) <input id="new-child-limit" type="number" value="60" min="15" max="240" /></label>
          </div>
          <button id="create-child-submit" class="btn-success" type="button">Save Child Profile &amp; Generate Unique Code</button>
        </div>

        <!-- Child Profiles Grid -->
        <div class="parent-grid" id="parent-children-grid">
          ${children
            .map((ch) => {
              const ls = ch.live_status || {};
              return `
            <div class="parent-card" data-child-card="${ch.id}">
              <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:14px">
                <div style="display:flex;align-items:center;gap:12px">
                  <span style="font-size:2.4rem;background:var(--surface-3);padding:10px;border-radius:16px;border:1px solid var(--line-2)">${ch.avatar}</span>
                  <div>
                    <h3 style="margin:0">${ch.display_name} (Age ${ch.age})</h3>
                    <small style="color:var(--text-3);font-weight:700">Group: ${ch.age_group} • ⭐ ${ch.total_stars} Stars • Level ${ch.current_level}</small>
                    <div style="margin-top:8px;display:flex;flex-wrap:wrap;align-items:center;gap:8px">
                      ${isParent ? `<span class="child-code-pill">🔑 Code: ${ch.pin_code}</span>` : ''}
                      <span id="live-badge-${ch.id}">${renderLiveBadge(ls)}</span>
                    </div>
                  </div>
                </div>
                <div style="display:flex;gap:8px;flex-wrap:wrap">
                  ${
                    isParent
                      ? `<button class="btn-primary launch-child-session-btn" data-id="${ch.id}" data-pin="${ch.pin_code}" type="button">▶️ Launch Child View</button>`
                      : ''
                  }
                  <button class="btn-warning delete-child-btn" data-id="${ch.id}" data-name="${ch.display_name}" type="button" title="Delete child profile">🗑️ Delete</button>
                </div>
              </div>

              <div id="launch-msg-${ch.id}" class="auth-error" style="margin-bottom:12px"></div>

              <!-- Suspend / Resume Account Controls -->
              <div style="background:rgba(244,63,94,0.06);border:1px solid rgba(244,63,94,0.2);padding:12px 14px;border-radius:12px;margin-bottom:14px">
                <div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px">
                  <strong style="font-size:0.84rem;color:${ls.is_suspended ? '#fda4af' : 'var(--text-2)'}">
                    ${ls.is_suspended ? '⛔ Account Currently Suspended' : '⏸️ Pause / Suspend Child Account'}
                  </strong>
                  ${
                    ls.is_suspended
                      ? `<button class="btn-success unsuspend-child-btn" data-id="${ch.id}" type="button">▶️ Resume Account Now</button>`
                      : `<div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px">
                          <input type="number" id="susp-val-${ch.id}" value="30" min="1" max="365" style="width:74px;padding:6px 8px;font-size:0.82rem" />
                          <select id="susp-unit-${ch.id}" style="padding:6px 10px;font-size:0.82rem">
                            <option value="minutes">Minutes</option>
                            <option value="hours">Hours</option>
                            <option value="days">Days</option>
                            <option value="indefinite">Until I resume</option>
                          </select>
                          <button class="btn-warning suspend-child-btn" data-id="${ch.id}" type="button">⏸️ Suspend</button>
                        </div>`
                  }
                </div>
                ${
                  ls.is_suspended && ls.suspension_message
                    ? `<small style="display:block;margin-top:6px;color:#fda4af">${ls.suspension_message}</small>`
                    : ''
                }
              </div>

              <!-- Screen-Time & Parental Controls -->
              <div style="background:var(--surface-2);border:1px solid var(--line);padding:16px;border-radius:14px;margin-bottom:12px">
                <div class="form-grid">
                  <label class="form-control">
                    Daily Screen Limit (Minutes)
                    <input type="number" id="limit-${ch.id}" value="${ch.screen_time.daily_limit_minutes}" min="10" max="240" />
                  </label>
                  <label class="form-control">
                    Allowed Age Group
                    <select id="agegroup-${ch.id}">
                      <option value="3-5" ${ch.screen_time.allowed_age_group === '3-5' ? 'selected' : ''}>Ages 3–5</option>
                      <option value="6-8" ${ch.screen_time.allowed_age_group === '6-8' ? 'selected' : ''}>Ages 6–8</option>
                      <option value="9-12" ${ch.screen_time.allowed_age_group === '9-12' ? 'selected' : ''}>Ages 9–12</option>
                    </select>
                  </label>
                </div>
                <label class="form-control" style="margin-bottom:10px">
                  Restricted Categories (comma-separated, e.g. ${categories.slice(0, 2).map((c) => c.name).join(', ')})
                  <input type="text" id="restricted-${ch.id}" value="${(ch.screen_time.restricted_categories || []).join(', ')}" placeholder="Leave blank for all age-approved categories" />
                </label>
                <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:10px">
                  <label style="font-size:0.84rem;font-weight:700;display:flex;align-items:center;gap:6px">
                    <input type="checkbox" id="consent-${ch.id}" ${ch.parent_consent_approved ? 'checked' : ''} />
                    Parental Consent Approved
                  </label>
                  <div style="display:flex;gap:8px;flex-wrap:wrap">
                    <button class="btn-secondary view-report-btn" data-id="${ch.id}" type="button">📊 Details &amp; Live Report</button>
                    <button class="btn-success save-controls-btn" data-id="${ch.id}" type="button">Save Controls</button>
                  </div>
                </div>
                <div id="ctrl-msg-${ch.id}" style="margin-top:8px;font-size:0.82rem;font-weight:700;color:#4ade80"></div>
              </div>
              <div id="report-panel-${ch.id}"></div>
            </div>
          `;
            })
            .join('')}
        </div>
      </div>
    </div>
  `;

  const wireNotifButtons = () => {
    container.querySelectorAll('.parent-mark-read-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await api.request(`/api/v1/users/me/notifications/${btn.dataset.nid}/read`, { method: 'POST' });
          const row = container.querySelector(`.parent-notif-item[data-nid="${btn.dataset.nid}"]`);
          if (row) row.remove();
        } catch {
          // ignore
        }
      });
    });
  };
  wireNotifButtons();

  // Ping Parent live presence immediately and every 6 seconds (also enforces instant suspension lockout)
  api.request('/api/v1/users/me/heartbeat', {
    method: 'POST',
    body: JSON.stringify({ activity: 'Managing Children in Parent Portal' }),
  }).catch(() => {});

  // Auto-refresh live presence badges + incoming Admin warnings/alerts every 6 seconds
  parentLiveTimer = setInterval(async () => {
    try {
      const [latest, latestNotifs] = await Promise.all([
        api.request('/api/v1/parents/children'),
        api.request('/api/v1/users/me/notifications').catch(() => []),
        api.request('/api/v1/users/me/heartbeat', {
          method: 'POST',
          body: JSON.stringify({ activity: 'Managing Children in Parent Portal' }),
        }).catch(() => {}),
      ]);
      latest.forEach((ch) => {
        const badgeWrap = container.querySelector(`#live-badge-${ch.id}`);
        if (badgeWrap) badgeWrap.innerHTML = renderLiveBadge(ch.live_status);
      });
      const nWrap = container.querySelector('#parent-notifs-wrap');
      if (nWrap) {
        nWrap.innerHTML = renderNotifsHtml(latestNotifs);
        wireNotifButtons();
      }
    } catch {
      // ignore transient poll errors (403 suspension is handled globally in api.js)
    }
  }, 6000);

  container.querySelector('#refresh-live-status-btn').addEventListener('click', () => {
    renderParentView(container, onSwitchToChildMode);
  });

  container.querySelector('#toggle-add-child-btn').addEventListener('click', () => {
    const p = container.querySelector('#add-child-panel');
    p.style.display = p.style.display === 'none' ? 'block' : 'none';
  });

  container.querySelector('#create-child-submit').addEventListener('click', async () => {
    const name = container.querySelector('#new-child-name').value.trim();
    const errBox = container.querySelector('#add-child-error');
    if (!name) {
      errBox.textContent = 'Please enter a child name.';
      errBox.classList.add('show');
      return;
    }
    errBox.classList.remove('show');
    const pinVal = container.querySelector('#new-child-pin').value.trim();
    try {
      const created = await api.request('/api/v1/parents/children', {
        method: 'POST',
        body: JSON.stringify({
          display_name: name,
          avatar: container.querySelector('#new-child-avatar').value,
          age: Number(container.querySelector('#new-child-age').value),
          age_group: container.querySelector('#new-child-age-group').value,
          preferred_language: container.querySelector('#new-child-lang').value,
          pin_code: pinVal || null,
          daily_limit_minutes: Number(container.querySelector('#new-child-limit').value),
        }),
      });
      await renderParentView(container, onSwitchToChildMode);
      const banner = container.querySelector('#new-child-code-banner');
      if (banner && created?.pin_code) {
        banner.style.display = 'block';
        banner.innerHTML = `
          <strong style="color:#6ee7b7">✅ Child profile "${created.display_name}" created!</strong>
          <p style="margin:6px 0 0;color:var(--text-2);font-size:0.9rem">
            Child Login Details — Parent Username: <code style="color:#fff">${parentUsername}</code> • Unique Access Code: <strong class="child-code-pill">${created.pin_code}</strong>
          </p>
        `;
      }
    } catch (err) {
      errBox.textContent = err.message || 'Could not create child profile';
      errBox.classList.add('show');
    }
  });

  container.querySelectorAll('.delete-child-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const cid = Number(btn.dataset.id);
      const cname = btn.dataset.name;
      if (!window.confirm(`Uremeza ko ushaka gusiba burundu profile y'umwana "${cname}"?`)) return;
      await api.request(`/api/v1/parents/children/${cid}`, { method: 'DELETE' });
      renderParentView(container, onSwitchToChildMode);
    });
  });

  container.querySelectorAll('.suspend-child-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const cid = Number(btn.dataset.id);
      const unit = container.querySelector(`#susp-unit-${cid}`).value;
      const val = Number(container.querySelector(`#susp-val-${cid}`).value) || 30;
      await api.request(`/api/v1/parents/children/${cid}/suspend`, {
        method: 'POST',
        body: JSON.stringify({
          duration_unit: unit,
          duration_value: unit === 'indefinite' ? null : val,
        }),
      });
      renderParentView(container, onSwitchToChildMode);
    });
  });

  container.querySelectorAll('.unsuspend-child-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const cid = Number(btn.dataset.id);
      await api.request(`/api/v1/parents/children/${cid}/unsuspend`, { method: 'POST' });
      renderParentView(container, onSwitchToChildMode);
    });
  });

  container.querySelectorAll('.save-controls-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const cid = Number(btn.dataset.id);
      const limit = Number(container.querySelector(`#limit-${cid}`).value);
      const ageGrp = container.querySelector(`#agegroup-${cid}`).value;
      const restRaw = container.querySelector(`#restricted-${cid}`).value;
      const consent = container.querySelector(`#consent-${cid}`).checked;
      await api.request(`/api/v1/parents/children/${cid}/controls`, {
        method: 'PUT',
        body: JSON.stringify({
          daily_limit_minutes: limit,
          allowed_age_group: ageGrp,
          restricted_categories: restRaw
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          parent_consent_approved: consent,
        }),
      });
      container.querySelector(`#ctrl-msg-${cid}`).textContent = '✓ Screen-time & privacy controls updated!';
    });
  });

  container.querySelectorAll('.view-report-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const cid = Number(btn.dataset.id);
      const rep = await api.request(`/api/v1/parents/children/${cid}/report`);
      const ls = rep.live_status || {};
      const panel = container.querySelector(`#report-panel-${cid}`);
      panel.innerHTML = `
        <div style="border-top:1px solid var(--line);padding-top:14px;font-size:0.86rem">
          <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px">
            <strong>📊 Details &amp; Live Activity — ${rep.child.display_name}</strong>
            ${isParent ? `<span class="child-code-pill">🔑 Code: ${rep.child.pin_code}</span>` : ''}
          </div>
          <div style="margin-bottom:10px">${renderLiveBadge(ls)}</div>
          <ul style="margin:6px 0;padding-left:18px">
            <li><strong>Games Played (${rep.games_played.length}):</strong> ${rep.games_played.map((g) => `${g.game_title} (${g.duration_seconds}s)`).join(', ') || 'None yet'}</li>
            <li><strong>High Scores:</strong> ${rep.high_scores.map((s) => `${s.game_title}: ${s.score}`).join(', ') || 'None yet'}</li>
            <li><strong>Books Read (${rep.books_read.length}):</strong> ${rep.books_read.map((b) => `${b.title} (Page ${b.last_page_number}${b.completed ? ' ✓' : ''})`).join(', ') || 'None yet'}</li>
            <li><strong>Cartoons Watched (${rep.cartoons_watched.length}):</strong> ${rep.cartoons_watched.map((v) => `${v.title} (${v.active_watch_seconds}s active)`).join(', ') || 'None yet'}</li>
          </ul>
        </div>
      `;
    });
  });

  container.querySelectorAll('.launch-child-session-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const cid = Number(btn.dataset.id);
      const pin = btn.dataset.pin || '1111';
      const msgBox = container.querySelector(`#launch-msg-${cid}`);
      msgBox.classList.remove('show');
      try {
        const res = await api.request('/api/v1/auth/child-session', {
          method: 'POST',
          body: JSON.stringify({
            child_id: cid,
            pin_code: pin,
            device_id: api.getDeviceId(),
          }),
        });
        // Save parent session so parent can return to Parent Portal with 1 click!
        api.saveParentReturnSession();
        stopParentLiveRefresh();
        api.setSession({
          access_token: res.access_token,
          user: {
            id: cid,
            username: res.child.display_name,
            full_name: res.child.display_name,
            role: 'CHILD',
            child_profile_id: cid,
          },
        });
        if (onSwitchToChildMode) onSwitchToChildMode();
      } catch (err) {
        msgBox.textContent = `⚠️ ${err.message}`;
        msgBox.classList.add('show');
      }
    });
  });
}
