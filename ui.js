/**
 * Asset Master Matcher — presentation layer.
 *
 * Observes the DOM that app.js renders and adds visual polish only. It never
 * reads or writes app state, and every hook is optional: a missing element
 * turns the related enhancement into a no-op.
 */
(function () {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  function observe(node, options, callback) {
    if (!node || typeof MutationObserver === "undefined") return null;
    const mo = new MutationObserver(callback);
    mo.observe(node, options);
    return mo;
  }

  function onMotionChange(callback) {
    if (reduceMotion.addEventListener) reduceMotion.addEventListener("change", callback);
    else if (reduceMotion.addListener) reduceMotion.addListener(callback);
  }

  // ---------------------------------------------------------------------------
  // Glass navbar: stronger shadow once content scrolls beneath it
  // ---------------------------------------------------------------------------
  function initTopbar() {
    const bar = $("#topbar");
    if (!bar) return;
    let queued = false;
    const update = () => {
      queued = false;
      bar.classList.toggle("is-scrolled", window.scrollY > 4);
    };
    window.addEventListener("scroll", () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(update);
    }, { passive: true });
    update();
  }

  // ---------------------------------------------------------------------------
  // Stepper: expose the current step to assistive tech
  // ---------------------------------------------------------------------------
  function initStepper() {
    const list = $("#stepperList");
    if (!list) return;
    const sync = () => {
      $$(".stepper__item", list).forEach((item) => {
        if (item.classList.contains("is-active")) item.setAttribute("aria-current", "step");
        else item.removeAttribute("aria-current");
      });
    };
    observe(list, { subtree: true, attributes: true, attributeFilter: ["class"] }, sync);
    sync();
  }

  // ---------------------------------------------------------------------------
  // Processing video: play only while the Process step is on screen
  // ---------------------------------------------------------------------------
  function initProcessVideo() {
    const visual = $("#processVisual");
    const video = $("#processVideo");
    const panel = $("#stepProcess");
    const progress = $("#progress");
    if (!visual || !video || !panel) return;

    const showFallback = () => {
      visual.classList.add("is-fallback");
      try { video.pause(); } catch { /* ignore */ }
    };

    if (typeof video.canPlayType !== "function" || !video.canPlayType("video/webm")) showFallback();
    if (video.error) showFallback();
    video.addEventListener("error", showFallback);
    $$("source", video).forEach((source) => source.addEventListener("error", showFallback));

    const shouldPlay = () =>
      !panel.hidden &&
      !(progress && progress.hidden) &&
      !document.hidden &&
      !reduceMotion.matches &&
      !visual.classList.contains("is-fallback");

    const sync = () => {
      if (shouldPlay()) {
        try {
          const playing = video.play();
          if (playing && typeof playing.catch === "function") playing.catch(() => { /* autoplay refused */ });
        } catch { /* ignore */ }
        return;
      }
      try {
        video.pause();
        if (reduceMotion.matches) video.currentTime = 0;
      } catch { /* ignore */ }
    };

    observe(panel, { attributes: true, attributeFilter: ["hidden"] }, sync);
    observe(progress, { attributes: true, attributeFilter: ["hidden"] }, sync);
    document.addEventListener("visibilitychange", sync);
    onMotionChange(sync);
    sync();
  }

  // ---------------------------------------------------------------------------
  // Status text: soft fade when the label changes
  // ---------------------------------------------------------------------------
  function initProgressLabel() {
    const label = $("#progressLabel");
    if (!label) return;
    let last = label.textContent;
    observe(label, { childList: true, characterData: true, subtree: true }, () => {
      if (label.textContent === last) return;
      last = label.textContent;
      label.classList.remove("is-swapping");
      void label.offsetWidth;
      label.classList.add("is-swapping");
    });
  }

  // ---------------------------------------------------------------------------
  // Result stats: visual count-up (display only; the real value stays readable)
  // ---------------------------------------------------------------------------
  function initStatCountUp() {
    const grid = $("#statGrid");
    const panel = $("#stepDownload");
    if (!grid) return;
    let lastSignature = null;

    observe(panel, { attributes: true, attributeFilter: ["hidden"] }, () => {
      if (panel.hidden) lastSignature = null;
    });

    observe(grid, { childList: true }, () => {
      const nodes = $$(".stat-card__value", grid).filter((n) => !n.dataset.counted);
      if (!nodes.length) return;
      const signature = nodes.map((n) => n.textContent).join("|");
      const animate = !reduceMotion.matches && signature !== lastSignature;
      lastSignature = signature;

      nodes.forEach((node) => {
        node.dataset.counted = "1";
        const finalText = node.textContent;
        const target = Number(finalText);
        if (!animate || !Number.isFinite(target) || target <= 0) return;

        const sr = document.createElement("span");
        sr.className = "sr-only";
        sr.textContent = finalText;
        const visual = document.createElement("span");
        visual.setAttribute("aria-hidden", "true");
        visual.textContent = "0";
        node.textContent = "";
        node.append(sr, visual);

        const duration = Math.min(1000, 450 + target * 6);
        const start = performance.now();
        const tick = (now) => {
          if (!visual.isConnected) return;
          const t = Math.min(1, (now - start) / duration);
          const eased = 1 - Math.pow(1 - t, 3);
          visual.textContent = t < 1 ? String(Math.round(target * eased)) : finalText;
          if (t < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Toasts: icon + title + message; copy / download feedback on success
  // ---------------------------------------------------------------------------
  const TOAST_TITLES = { success: "Success", error: "Error", info: "Info" };
  const timers = new WeakMap();

  function flash(btn, className, ms, label) {
    if (!btn) return;
    if (label != null) {
      if (btn.dataset.label == null) btn.dataset.label = btn.textContent.trim();
      btn.textContent = label;
    }
    btn.classList.add(className);
    clearTimeout(timers.get(btn));
    timers.set(btn, setTimeout(() => {
      btn.classList.remove(className);
      if (label != null && btn.dataset.label != null) btn.textContent = btn.dataset.label;
    }, ms));
  }

  function enhanceToast(node) {
    if (!(node instanceof HTMLElement) || !node.classList.contains("toast") || node.dataset.enhanced) return;
    node.dataset.enhanced = "1";
    const type = ["success", "error", "info"].find((t) => node.classList.contains(`toast--${t}`)) || "info";
    const message = node.textContent;

    const icon = document.createElement("span");
    icon.className = "toast__icon";
    icon.setAttribute("aria-hidden", "true");
    const body = document.createElement("span");
    body.className = "toast__body";
    const title = document.createElement("strong");
    title.className = "toast__title";
    title.textContent = TOAST_TITLES[type];
    const msg = document.createElement("span");
    msg.className = "toast__msg";
    msg.textContent = message;
    body.append(title, msg);
    node.textContent = "";
    node.append(icon, body);

    if (type !== "success") return;
    if (message === "Request JSON copied") flash($("#btnCopyRequest"), "is-copied", 1600, "Copied ✓");
    else if (message === "Response JSON copied") flash($("#btnCopyResponse"), "is-copied", 1600, "Copied ✓");
    else if (message === "Excel downloaded") flash($("#btnDownload"), "is-success", 2200);
  }

  function initToasts() {
    const region = $("#toastRegion");
    if (!region) return;
    observe(region, { childList: true }, (records) => {
      records.forEach((r) => r.addedNodes.forEach(enhanceToast));
    });
  }

  // ---------------------------------------------------------------------------
  // JSON panels: light syntax tint (textContent — and therefore Copy — is unchanged)
  // ---------------------------------------------------------------------------
  const HIGHLIGHT_LIMIT = 150000;
  const JSON_TOKEN = /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;

  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function initJsonHighlight(pre) {
    if (!pre) return;
    const render = () => {
      const text = pre.textContent;
      if (!text || text.length > HIGHLIGHT_LIMIT) return;
      if (pre.firstElementChild) return;
      const escaped = escapeHtml(text);
      const html = escaped.replace(JSON_TOKEN, (match, str, colon) => {
        if (str) {
          return colon
            ? `<span class="tok-key">${str.slice(0, str.length - colon.length)}</span>${colon}`
            : `<span class="tok-str">${match}</span>`;
        }
        if (/^(true|false|null)$/.test(match)) return `<span class="tok-lit">${match}</span>`;
        return `<span class="tok-num">${match}</span>`;
      });
      if (html !== escaped) pre.innerHTML = html;
    };
    observe(pre, { childList: true }, render);
    render();
  }

  // ---------------------------------------------------------------------------
  // Tables: shadows that signal horizontal overflow
  // ---------------------------------------------------------------------------
  function initTableFrames() {
    $$(".table-frame").forEach((frame) => {
      const wrap = $(".table-wrap", frame);
      if (!wrap) return;
      const update = () => {
        const max = wrap.scrollWidth - wrap.clientWidth;
        frame.classList.toggle("has-scroll-left", wrap.scrollLeft > 1);
        frame.classList.toggle("has-overflow-right", max - wrap.scrollLeft > 1);
        frame.style.setProperty("--scrollbar-w", `${Math.max(0, wrap.offsetWidth - wrap.clientWidth - 2)}px`);
        frame.style.setProperty("--scrollbar-h", `${Math.max(0, wrap.offsetHeight - wrap.clientHeight - 2)}px`);
      };
      wrap.addEventListener("scroll", update, { passive: true });
      if ("ResizeObserver" in window) new ResizeObserver(update).observe(wrap);
      observe(wrap, { childList: true, subtree: true }, update);
      update();
    });
  }

  // ---------------------------------------------------------------------------
  // Settings drawer: move focus in, trap Tab, restore focus, lock page scroll
  // ---------------------------------------------------------------------------
  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

  function initDrawer() {
    const drawer = $("#settingsDrawer");
    if (!drawer) return;
    let wasOpen = false;
    let returnFocus = null;
    const focusables = () => $$(FOCUSABLE, drawer).filter((n) => n.getClientRects().length || n.type === "checkbox");

    observe(drawer, { attributes: true, attributeFilter: ["class"] }, () => {
      const open = drawer.classList.contains("is-open");
      if (open === wasOpen) return;
      wasOpen = open;
      document.body.classList.toggle("has-drawer", open);
      if (open) {
        returnFocus = document.activeElement;
        requestAnimationFrame(() => {
          const first = focusables()[0];
          if (first) first.focus({ preventScroll: true });
        });
      } else {
        if (returnFocus && document.contains(returnFocus) && typeof returnFocus.focus === "function") {
          returnFocus.focus({ preventScroll: true });
        }
        returnFocus = null;
      }
    });

    drawer.addEventListener("keydown", (e) => {
      if (e.key !== "Tab" || !drawer.classList.contains("is-open")) return;
      const items = focusables();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    });
  }

  initTopbar();
  initStepper();
  initProcessVideo();
  initProgressLabel();
  initStatCountUp();
  initToasts();
  initJsonHighlight($("#requestJson"));
  initJsonHighlight($("#responseJson"));
  initTableFrames();
  initDrawer();
})();
