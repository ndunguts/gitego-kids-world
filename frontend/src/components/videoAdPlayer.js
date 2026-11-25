function esc(val) {
  return String(val ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function isSafeMediaUrl(url) {
  const s = String(url || '').trim();
  return s.startsWith('/') || s.startsWith('http://') || s.startsWith('https://') || s.startsWith('data:image/');
}

function buildEmbedHtml(provider, embedUrl, videoUrl, title, className = 'video-frame', autoplay = true) {
  const src = embedUrl || videoUrl || '';
  if (provider === 'self_hosted' || /\.(mp4|webm|ogg)(\?.*)?$/i.test(src)) {
    return `<video class="${className}" src="${esc(src)}" controls ${autoplay ? 'autoplay' : ''} playsinline></video>`;
  }
  let finalSrc = src;
  if (autoplay && finalSrc.includes('youtube.com/embed/') && !finalSrc.includes('autoplay=')) {
    finalSrc += (finalSrc.includes('?') ? '&' : '?') + 'autoplay=1';
  }
  return `<iframe
    class="${className}"
    src="${esc(finalSrc)}"
    title="${esc(title || 'Video')}"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
    allowfullscreen
  ></iframe>`;
}

/**
 * Mounts a video player with full support for:
 *  - Pre-roll, Mid-roll, and Post-roll video ads (with countdown & skip)
 *  - Promo Banner overlay (image, text, optional link, dismissible)
 *  - Scrolling Text Ticker (marquee at top/bottom, configurable speed & colors)
 *  - Watermark (logo image and/or text at any corner with opacity)
 *
 * Returns { destroy, triggerMidRoll, triggerPostRoll }
 */
export function mountVideoWithAds(containerEl, video, options = {}) {
  const frameClass = options.frameClass || 'video-frame';
  const adCfg = video?.ad_settings || {};
  const adsEnabled = Boolean(adCfg.enabled);
  const preRoll = adsEnabled && adCfg.video_ads?.pre_roll?.enabled ? adCfg.video_ads.pre_roll : null;
  const midRoll = adsEnabled && adCfg.video_ads?.mid_roll?.enabled ? adCfg.video_ads.mid_roll : null;
  const postRoll = adsEnabled && adCfg.video_ads?.post_roll?.enabled ? adCfg.video_ads.post_roll : null;
  const banner = adsEnabled && adCfg.banner?.enabled && (adCfg.banner.text || adCfg.banner.image_url) ? adCfg.banner : null;
  const ticker = adsEnabled && adCfg.ticker?.enabled && adCfg.ticker.text ? adCfg.ticker : null;
  const watermark = adsEnabled && adCfg.watermark?.enabled && (adCfg.watermark.text || adCfg.watermark.image_url) ? adCfg.watermark : null;

  const timers = [];
  let destroyed = false;
  let midRollPlayed = false;
  let postRollPlayed = false;
  let activeAdCleanup = null;
  let mainVideoMounted = false;
  let elapsedWatchSec = 0;

  const addTimer = (id) => {
    timers.push(id);
    return id;
  };
  const clearAllTimers = () => {
    while (timers.length) {
      const id = timers.pop();
      clearInterval(id);
      clearTimeout(id);
    }
  };

  // Build static overlays HTML (watermark, banner, ticker)
  let watermarkHtml = '';
  if (watermark) {
    const posClass = `vad-wm-${esc(watermark.position || 'top-right')}`;
    const op = Math.max(0.1, Math.min(1, Number(watermark.opacity) || 0.65));
    watermarkHtml = `
      <div class="vad-watermark ${posClass}" style="opacity:${op}">
        ${isSafeMediaUrl(watermark.image_url) ? `<img src="${esc(watermark.image_url)}" alt="" class="vad-wm-img" />` : ''}
        ${watermark.text ? `<span class="vad-wm-text">${esc(watermark.text)}</span>` : ''}
      </div>
    `;
  }

  let tickerHtml = '';
  if (ticker) {
    const posClass = ticker.position === 'top' ? 'vad-pos-top' : 'vad-pos-bottom';
    const speedClass = `vad-speed-${esc(ticker.speed || 'normal')}`;
    const bg = esc(ticker.bg_color || '#f59e0b');
    const fg = esc(ticker.text_color || '#0b0d12');
    tickerHtml = `
      <div class="vad-ticker ${posClass}" style="background:${bg};color:${fg}">
        <div class="vad-ticker-track ${speedClass}">
          <span>${esc(ticker.text)}</span>
          <span aria-hidden="true">${esc(ticker.text)}</span>
        </div>
      </div>
    `;
  }

  let bannerHtml = '';
  if (banner) {
    const posClass = banner.position === 'top' ? 'vad-pos-top' : 'vad-pos-bottom';
    const offsetClass = ticker && ticker.position === banner.position ? 'vad-banner-offset' : '';
    const bg = esc(banner.bg_color || '#0f172a');
    const fg = esc(banner.text_color || '#ffffff');
    const hasLink = isSafeMediaUrl(banner.link_url);
    bannerHtml = `
      <div class="vad-banner ${posClass} ${offsetClass}" id="vad-banner-el" style="background:${bg};color:${fg}">
        ${isSafeMediaUrl(banner.image_url) ? `<img src="${esc(banner.image_url)}" alt="" class="vad-banner-img" />` : ''}
        <div class="vad-banner-text">${esc(banner.text)}</div>
        ${hasLink ? `<a href="${esc(banner.link_url)}" target="_blank" rel="noopener noreferrer" class="vad-banner-cta">Learn More →</a>` : ''}
        ${banner.dismissible ? `<button type="button" class="vad-banner-close" aria-label="Close banner">✕</button>` : ''}
      </div>
    `;
  }

  containerEl.innerHTML = `
    <div class="vad-stage">
      <div class="vad-main-slot"></div>
      ${watermarkHtml}
      ${bannerHtml}
      ${tickerHtml}
      <div class="vad-ad-overlay" style="display:none"></div>
    </div>
  `;

  const mainSlot = containerEl.querySelector('.vad-main-slot');
  const adOverlay = containerEl.querySelector('.vad-ad-overlay');

  const closeBannerBtn = containerEl.querySelector('.vad-banner-close');
  if (closeBannerBtn) {
    closeBannerBtn.addEventListener('click', () => {
      const bEl = containerEl.querySelector('#vad-banner-el');
      if (bEl) bEl.remove();
    });
  }

  function getMainVideoEl() {
    return mainSlot.querySelector('video');
  }

  function mountMainVideo() {
    if (destroyed || mainVideoMounted) return;
    mainVideoMounted = true;
    mainSlot.innerHTML = buildEmbedHtml(video.provider, video.embed_url, video.video_url, video.title, frameClass, true);

    const vidEl = getMainVideoEl();
    if (vidEl) {
      if (midRoll) {
        vidEl.addEventListener('timeupdate', () => {
          if (!midRollPlayed && vidEl.currentTime >= (Number(midRoll.trigger_at_seconds) || 30)) {
            midRollPlayed = true;
            playAdSlot('Mid-Roll', midRoll, () => {
              if (!destroyed) vidEl.play().catch(() => {});
            });
          }
        });
      }
      if (postRoll) {
        vidEl.addEventListener('ended', () => {
          if (!postRollPlayed) {
            postRollPlayed = true;
            playAdSlot('Post-Roll', postRoll, () => {});
          }
        });
      }
    } else if (midRoll) {
      // For YouTube/Vimeo iframes, trigger mid-roll based on elapsed active time
      const triggerAt = Number(midRoll.trigger_at_seconds) || 30;
      const tickId = addTimer(
        setInterval(() => {
          if (destroyed || midRollPlayed || document.hidden || adOverlay.style.display !== 'none') return;
          elapsedWatchSec += 1;
          if (elapsedWatchSec >= triggerAt) {
            midRollPlayed = true;
            clearInterval(tickId);
            playAdSlot('Mid-Roll', midRoll, () => {});
          }
        }, 1000)
      );
    }
  }

  function playAdSlot(label, slot, onDone) {
    if (destroyed || !slot || !slot.video_url) {
      if (onDone) onDone();
      return;
    }
    if (activeAdCleanup) activeAdCleanup();

    const mainVid = getMainVideoEl();
    if (mainVid && !mainVid.paused) {
      mainVid.pause();
    }

    const totalSec = Math.max(3, Number(slot.duration_seconds) || 10);
    const skipAfter = Math.max(0, Math.min(totalSec, Number(slot.skip_after_seconds ?? 5)));
    let remaining = totalSec;
    let elapsed = 0;

    const ctaHtml =
      slot.cta_text && isSafeMediaUrl(slot.cta_url)
        ? `<a href="${esc(slot.cta_url)}" target="_blank" rel="noopener noreferrer" class="vad-ad-cta">${esc(slot.cta_text)} ↗</a>`
        : slot.cta_text
          ? `<span class="vad-ad-cta">${esc(slot.cta_text)}</span>`
          : '';

    adOverlay.style.display = 'flex';
    adOverlay.innerHTML = `
      <div class="vad-ad-topbar">
        <span class="vad-ad-badge">📢 Ad • ${esc(label)}</span>
        <span class="vad-ad-countdown" id="vad-ad-countdown">Ends in ${remaining}s</span>
        ${ctaHtml}
        <button type="button" id="vad-ad-skip-btn" class="vad-ad-skip-btn" ${skipAfter > 0 ? 'disabled' : ''}>
          ${skipAfter > 0 ? `Skip in ${skipAfter}s` : 'Skip Ad ⏭'}
        </button>
      </div>
      <div class="vad-ad-player-wrap">
        ${buildEmbedHtml(slot.provider, slot.embed_url, slot.video_url, `${label} Ad`, 'vad-ad-frame', true)}
      </div>
    `;

    const countdownEl = adOverlay.querySelector('#vad-ad-countdown');
    const skipBtn = adOverlay.querySelector('#vad-ad-skip-btn');
    const adVidEl = adOverlay.querySelector('video');

    let finished = false;
    let intervalId = null;

    const finishAd = () => {
      if (finished) return;
      finished = true;
      if (intervalId) clearInterval(intervalId);
      adOverlay.innerHTML = '';
      adOverlay.style.display = 'none';
      activeAdCleanup = null;
      if (onDone) onDone();
    };

    activeAdCleanup = () => {
      if (intervalId) clearInterval(intervalId);
      adOverlay.innerHTML = '';
      adOverlay.style.display = 'none';
    };

    skipBtn.addEventListener('click', () => {
      if (!skipBtn.disabled) finishAd();
    });

    if (adVidEl) {
      adVidEl.addEventListener('ended', finishAd);
    }

    intervalId = addTimer(
      setInterval(() => {
        if (destroyed) {
          clearInterval(intervalId);
          return;
        }
        elapsed += 1;
        remaining = Math.max(0, totalSec - elapsed);
        if (countdownEl) countdownEl.textContent = remaining > 0 ? `Ends in ${remaining}s` : 'Finishing...';
        const skipLeft = Math.max(0, skipAfter - elapsed);
        if (skipBtn) {
          if (skipLeft <= 0) {
            skipBtn.disabled = false;
            skipBtn.textContent = 'Skip Ad ⏭';
          } else {
            skipBtn.textContent = `Skip in ${skipLeft}s`;
          }
        }
        if (remaining <= 0) {
          finishAd();
        }
      }, 1000)
    );
  }

  // Kick off pre-roll first if configured, otherwise mount main video immediately
  if (preRoll) {
    playAdSlot('Pre-Roll', preRoll, () => {
      mountMainVideo();
    });
  } else {
    mountMainVideo();
  }

  return {
    triggerMidRoll() {
      if (midRoll) {
        midRollPlayed = true;
        playAdSlot('Mid-Roll', midRoll, () => {
          const v = getMainVideoEl();
          if (v && !destroyed) v.play().catch(() => {});
        });
      }
    },
    triggerPostRoll(onComplete) {
      if (postRoll && !postRollPlayed) {
        postRollPlayed = true;
        playAdSlot('Post-Roll', postRoll, () => {
          if (onComplete) onComplete();
        });
        return true;
      }
      if (onComplete) onComplete();
      return false;
    },
    destroy() {
      destroyed = true;
      clearAllTimers();
      if (activeAdCleanup) activeAdCleanup();
      containerEl.innerHTML = '';
    },
  };
}
