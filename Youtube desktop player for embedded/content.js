// YouTube Embed Controls Restorer v2.4

(() => {
  "use strict";

  const showControlsFullscreen = true;
  const IDLE_MS = 2500;

  const svg = (d) =>
    `<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="${d}"/></svg>`;
  const ICON = {
    play: svg("M8 5v14l11-7z"),
    pause: svg("M6 19h4V5H6v14zm8-14v14h4V5h-4z"),
    enterFs: svg("M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"),
    exitFs: svg("M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"),
    volume: svg("M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4z"),
    backArrow: svg("M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"),
  };

  function start() {
    const video = document.querySelector("video");
    if (video) {
      init(video);
      return;
    }
    const observer = new MutationObserver(() => {
      const v = document.querySelector("video");
      if (v) {
        observer.disconnect();
        clearTimeout(timeout);
        init(v);
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    const timeout = setTimeout(() => { observer.disconnect(); }, 20000);
  }

  function init(video) {
    if (document.querySelector(".ytp-play-button")) return;
    if (document.getElementById("ytc-pp")) return;

    const root = document.documentElement;
    root.classList.add("ytc-active", "ytc-show");

    /* ---------- Auto-hide logic ---------- */
    let hideTimer = 0;
    let overBar = false;

    // An open menu = a visible panel (the empty container is always in the DOM, so don't test that).
    const POPUP_SEL =
      "#bottom-sheet-wrapper bottom-sheet-layout,.dialog-container .dialog,.menu-container .menu-content";
    const KEEP_OPEN =
      "#ytc-pp,#ytc-mute,#ytc-vol,#ytc-fs,#ytc-custom-menu,.player-controls-top-right,.player-controls-bottom-left,yt-progress-bar,#bottom-sheet-wrapper," +
      POPUP_SEL;

    const popupOpen = () =>
      [...document.querySelectorAll(POPUP_SEL)].some((el) => el.getClientRects().length > 0);

    const showBar = () => {
      root.classList.add("ytc-show");
      clearTimeout(hideTimer);
      if (video.paused || video.ended) return;
      hideTimer = setTimeout(function tick() {
        if (overBar || popupOpen()) hideTimer = setTimeout(tick, IDLE_MS);
        else root.classList.remove("ytc-show");
      }, IDLE_MS);
    };

    ["mousemove", "mousedown", "keydown", "touchstart"].forEach((t) =>
      document.addEventListener(t, showBar, { passive: true, capture: true })
    );
    document.addEventListener("mouseover", (e) => {
      overBar = !!(e.target.closest && e.target.closest(KEEP_OPEN));
    }, { passive: true });
    
    root.addEventListener("mouseleave", () => {
      if (!video.paused && !video.ended && !popupOpen()) {
        clearTimeout(hideTimer);
        root.classList.remove("ytc-show");
      }
    });

    /* ---------- Click handling: play/pause zone, Stats for nerds, menus ---------- */
    const togglePlayPause = () => {
      const native = document.querySelector(".player-control-play-pause-icon");
      if (native) native.click();
      else if (video.paused) video.play();
      else video.pause();
    };

    const visibleRect = (el) => (el && el.getClientRects().length ? el.getBoundingClientRect() : null);
    const inRect = (r, x, y) => !!r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;

    // Stats for nerds lives under YouTube's overlay, so we track it and forward clicks to its [X].
    const statsPanel = () => {
      const p = document.querySelector(".html5-video-info-panel");
      return p && p.getClientRects().length ? p : null;
    };
    let lastStatsSync = 0;
    const syncStats = () => {
      const now = performance.now();
      if (now - lastStatsSync < 200) return;
      lastStatsSync = now;
      root.classList.toggle("ytc-stats", !!statsPanel());
    };
    document.addEventListener("mousemove", syncStats, { passive: true, capture: true });

    // Click-to-play zone: below the title bar, above the seek bar. While the controls are hidden
    // nothing is drawn, so the whole video counts.
    const inVideoZone = (y) => {
      if (!root.classList.contains("ytc-show")) return true;
      const bar = visibleRect(document.querySelector("#player-control-overlay .watch-page-progress-bar"));
      const title = visibleRect(document.querySelector("#player-control-overlay .ytwPlayerTopControlsLeftContent"));
      const top = title && !root.classList.contains("ytc-stats") ? title.bottom : 0;
      const bottom = bar ? bar.top : window.innerHeight - 56;
      return y > top && y < bottom;
    };

    const INTERACTIVE =
      "button, input, a, [role='button'], [role='menuitem'], [role='slider'], " +
      "yt-progress-bar, .ytPlayerProgressBarHost, .player-settings-icon, " +
      ".html5-video-info-panel, #bottom-sheet-wrapper, #ytc-custom-menu";

    let suppressNextClick = false;   // set when the press that started this click just closed a menu

    document.addEventListener("click", (e) => {
      const suppressed = suppressNextClick;
      suppressNextClick = false;
      syncStats();

      // 1. Stats for nerds: if YouTube's overlay is in front of it, forward the close button ourselves.
      const stats = statsPanel();
      if (stats && !stats.contains(e.target) && inRect(stats.getBoundingClientRect(), e.clientX, e.clientY)) {
        e.stopPropagation();
        e.preventDefault();
        const close = stats.querySelector(".html5-video-info-panel-close");
        if (inRect(close && close.getBoundingClientRect(), e.clientX, e.clientY)) close.click();
        return;
      }

      // 2. Buttons, links, seek bar, menus: leave to the page.
      if (e.target.closest(INTERACTIVE)) return;

      // 3. This click only closed the settings menu: don't also toggle playback.
      if (suppressed || popupOpen()) {
        e.stopPropagation();
        e.preventDefault();
        return;
      }

      // 4. Title band / control band (not a video click): swallow so YouTube's overlay can't toggle either.
      if (!inVideoZone(e.clientY)) {
        e.stopPropagation();
        e.preventDefault();
        return;
      }

      // 5. Video surface: toggle exactly once (stop YouTube's own handler to avoid a double toggle).
      e.stopPropagation();
      e.preventDefault();
      togglePlayPause();
    }, true);

    /* ---------- Play / Pause Button ---------- */
    const ppBtn = Object.assign(document.createElement("button"), { id: "ytc-pp" });
    const setPP = () => {
      ppBtn.innerHTML = video.paused ? ICON.play : ICON.pause;
      ppBtn.title = ppBtn.ariaLabel = video.paused ? "Play" : "Pause";
    };
    setPP();
    ppBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      togglePlayPause();
    });
    ["play", "pause", "ended"].forEach((t) => video.addEventListener(t, () => { setPP(); showBar(); }));

    /* ---------- Fullscreen ---------- */
    const toggleFullscreen = () => {
      if (document.fullscreenElement) {
        document.exitFullscreen?.();
        return;
      }
      if (showControlsFullscreen) {
        root.requestFullscreen();
      } else {
        const player = document.getElementById("player") || root;
        (player.requestFullscreen ?? player.webkitRequestFullscreen)?.call(player);
      }
    };

    const fsBtn = Object.assign(document.createElement("button"), { id: "ytc-fs", title: "Full screen (f)" });
    fsBtn.innerHTML = ICON.enterFs;
    fsBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleFullscreen();
    });
    document.addEventListener("fullscreenchange", () => {
      fsBtn.innerHTML = document.fullscreenElement ? ICON.exitFs : ICON.enterFs;
    });
    document.body.addEventListener("dblclick", (e) => {
      if (inVideoZone(e.clientY) && !popupOpen() && !e.target.closest(".html5-video-info-panel, button, a, input, yt-progress-bar")) {
        toggleFullscreen();
      }
    });

    window.addEventListener("keydown", (e) => {
      if (e.key === "f" || e.key === "F") {
        e.stopImmediatePropagation();
        e.preventDefault();
        toggleFullscreen();
      }
    }, true);

    /* ---------- Mute & Volume (Reaches 100%) ---------- */
    let lastVolume = video.volume || 1;
    let userMuted = false;

    const muteBtn = Object.assign(document.createElement("button"), { id: "ytc-mute", title: "Mute (m)" });
    muteBtn.innerHTML = ICON.volume;

    const toggleMute = () => {
      if (video.muted || video.volume === 0) {
        userMuted = false;
        video.muted = false;
        video.volume = lastVolume > 0 ? lastVolume : 1.0;
      } else {
        lastVolume = video.volume;
        userMuted = true;
        video.muted = true;
        video.volume = 0;
      }
    };
    muteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleMute();
    });

    const vol = Object.assign(document.createElement("input"), {
      id: "ytc-vol", type: "range", title: "Volume", min: "0", max: "1", step: "0.01"
    });
    vol.value = String(video.volume);

    vol.addEventListener("input", (e) => {
      e.stopPropagation();
      video.volume = parseFloat(vol.value);
      video.muted = video.volume === 0;
    });
    vol.addEventListener("wheel", (e) => {
      e.preventDefault();
      const v = Number(Math.min(1.0, Math.max(0, video.volume + (e.deltaY > 0 ? -0.05 : 0.05))).toFixed(2));
      video.volume = v;
      video.muted = v === 0;
    });

    const preventYouTubeMute = (e) => {
      if (e.key.toLowerCase() === "m") {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      }
    };
    window.addEventListener("keyup", preventYouTubeMute, true);
    window.addEventListener("keypress", preventYouTubeMute, true);
    window.addEventListener("keydown", (e) => {
      if (e.key.toLowerCase() === "m") {
        preventYouTubeMute(e);
        toggleMute();
      } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.stopImmediatePropagation();
        e.preventDefault();
        const v = Math.min(1.0, Math.max(0, video.volume + (e.key === "ArrowUp" ? 0.05 : -0.05)));
        video.muted = false;
        video.volume = Number(v.toFixed(2));
      }
    }, true);

    video.addEventListener("volumechange", () => {
      if ((String(video.volume).split(".")[1] || "").length > 2) {
        video.volume = lastVolume;
        return;
      }
      if (video.volume === 1 && userMuted) {
        toggleMute();
        return;
      }
      muteBtn.classList.toggle("muted", video.muted || !video.volume);
      vol.value = String(video.muted ? 0 : video.volume);
      if (video.volume > 0) lastVolume = video.volume;
    });

    document.body.prepend(fsBtn, vol, muteBtn, ppBtn);

    /* ---------- Submenu Back Button Handling ---------- */
    const checkSubmenuHeader = () => {
      const header = document.querySelector(
        "#bottom-sheet-wrapper bottom-sheet-container:not([hidden]) yt-panel-header-view-model"
      );
      if (header && !header.querySelector(".ytc-back-btn")) {
        const backBtn = document.createElement("button");
        backBtn.className = "ytc-back-btn";
        backBtn.title = "Back";
        backBtn.innerHTML = ICON.backArrow;
        backBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          const activeContainer = header.closest("bottom-sheet-container");
          const closeBtn = activeContainer?.querySelector(".close-button, .ytWebScrimHiddenButton");
          if (closeBtn) closeBtn.click();
          setTimeout(() => {
            const settingsBtn = document.querySelector(".player-settings-icon");
            if (settingsBtn) settingsBtn.click();
          }, 60);
        });
        header.prepend(backBtn);
      }
    };

    document.addEventListener("click", (e) => {
      if (e.target.closest('.player-settings-icon') || e.target.closest('#bottom-sheet-wrapper')) {
        setTimeout(checkSubmenuHeader, 60);
        setTimeout(checkSubmenuHeader, 140);
      }
    }, true);

    // Clicking outside or pressing Escape closes the settings menu
    document.addEventListener("pointerdown", (e) => {
      const openSheet = document.querySelector(
        "#bottom-sheet-wrapper bottom-sheet-container:not([hidden]):not([inert])"
      );
      if (
        openSheet &&
        !e.target.closest("bottom-sheet-layout") &&
        !e.target.closest(".player-settings-icon")
      ) {
        const closeBtn = openSheet.querySelector(".close-button, .ytWebScrimHiddenButton");
        if (closeBtn) {
          closeBtn.click();
          suppressNextClick = true;
        }
      }
    }, true);

    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        const openSheet = document.querySelector(
          "#bottom-sheet-wrapper bottom-sheet-container:not([hidden]):not([inert])"
        );
        if (openSheet) {
          e.stopPropagation();
          const closeBtn = openSheet.querySelector(".close-button, .ytWebScrimHiddenButton");
          if (closeBtn) closeBtn.click();
        }
      }
    }, true);

    /* ---------- Settings menu: gear toggles it, +/- steppers auto-close it ---------- */
    // Closes the menu only if a panel is really visible; returns true if it clicked the close button.
    const closeSheet = () => {
      if (!popupOpen()) return false;
      const container = document.querySelector(
        "#bottom-sheet-wrapper bottom-sheet-container:not([hidden]):not([inert])"
      );
      const btn = container && container.querySelector(".close-button, .ytWebScrimHiddenButton");
      if (!btn) return false;
      btn.click();
      return true;
    };

    // Gear pressed while the menu is open -> close it (and don't let YouTube re-open it on the same click).
    // Only real user input counts, so the synthetic gear click used by the submenu Back button still works.
    let swallowGearClick = false;
    document.addEventListener("pointerdown", (e) => {
      swallowGearClick = false;
      if (e.isTrusted && e.target.closest(".player-settings-icon") && closeSheet()) swallowGearClick = true;
    }, true);
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".player-settings-icon")) return;
      if (swallowGearClick) {
        swallowGearClick = false;
        e.stopPropagation();
        e.preventDefault();
      } else if (e.isTrusted && closeSheet()) {      // keyboard activation of the gear
        e.stopPropagation();
        e.preventDefault();
      }
    }, true);

    // After the last tap on a + / - stepper (speed, timers...) close the menu. Touching anything else cancels it.
    const STEP_CLOSE_MS = 2000;
    const STEP_SEL = ".ytSliderShapeHostIncrementButton";
    const CONFIRM_RE = /^(set|done|ok|save|apply|confirm)\b/i;
    let stepTimer = 0;
    document.addEventListener("pointerdown", (e) => {
      if (!e.isTrusted || !e.target.closest("#bottom-sheet-wrapper bottom-sheet-layout")) return;
      if (!e.target.closest(STEP_SEL)) clearTimeout(stepTimer);
    }, true);
    document.addEventListener("click", (e) => {
      if (!e.isTrusted) return;
      const btn = e.target.closest("#bottom-sheet-wrapper bottom-sheet-layout :is(button, [role='button'])");
      if (!btn) return;
      clearTimeout(stepTimer);
      if (btn.closest(STEP_SEL)) stepTimer = setTimeout(closeSheet, STEP_CLOSE_MS);
      else if (CONFIRM_RE.test((btn.textContent || "").trim())) setTimeout(closeSheet, 150);
    }, true);

    /* ---------- Keyboard Shortcuts ---------- */
    window.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.stopImmediatePropagation();
        e.preventDefault();
        video.currentTime += e.key === "ArrowLeft" ? -5 : 5;
      } else if (/^[0-9]$/.test(e.key)) {
        e.stopImmediatePropagation();
        e.preventDefault();
        video.currentTime = video.duration * (parseInt(e.key, 10) / 10);
      } else if (e.key === "Home" || e.key === "End") {
        e.stopImmediatePropagation();
        e.preventDefault();
        video.currentTime = e.key === "Home" ? 0 : video.duration;
      } else if (e.key === "<" || e.key === ">") {
        e.stopImmediatePropagation();
        e.preventDefault();
        video.playbackRate = Math.min(
          2,
          Math.max(0.25, Math.round((video.playbackRate + (e.key === ">" ? 0.25 : -0.25)) * 100) / 100)
        );
      }
    }, true);

    /* ---------- Right-Click Context Menu ---------- */
    const menu = Object.assign(document.createElement("div"), { id: "ytc-custom-menu" });
    document.body.appendChild(menu);

    const copyText = async (text) => {
      try { await navigator.clipboard.writeText(text); } 
      catch {
        const ta = Object.assign(document.createElement("textarea"), { value: text });
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
      }
    };
    const copyVideoUrl = (withTime) => {
      const videoId = new URLSearchParams(window.location.search).get("v") || window.location.pathname.split("/").pop();
      copyText(`https://www.youtube.com/watch?v=${videoId}${withTime ? `&t=${Math.floor(video.currentTime)}s` : ""}`);
    };
    const toggleContextMenu = (visible, e) => {
      if (!visible) { menu.style.display = "none"; return; }
      menu.style.display = "block";
      let posX = e.clientX;
      if (posX + menu.offsetWidth > window.innerWidth) posX = window.innerWidth - menu.offsetWidth - 10;
      let posY = e.clientY;
      if (posY + menu.offsetHeight > window.innerHeight) posY = window.innerHeight - menu.offsetHeight - 10;
      menu.style.left = `${posX}px`;
      menu.style.top = `${posY}px`;
    };
    const addContextMenuItem = (text, onClick) => {
      const item = Object.assign(document.createElement("div"), { className: "ytc-menu-item", textContent: text });
      item.addEventListener("click", () => { onClick(); toggleContextMenu(false); });
      menu.appendChild(item);
    };
    addContextMenuItem("Copy video URL", () => copyVideoUrl(false));
    addContextMenuItem("Copy video URL at current time", () => copyVideoUrl(true));

    document.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      toggleContextMenu(true, e);
    }, true);
    document.addEventListener("pointerdown", (e) => {
      if (!menu.contains(e.target)) toggleContextMenu(false);
    });

    showBar();
  }

  start();
})();
