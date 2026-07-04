/* Optiyou — interaction & animation engine.
   GSAP + ScrollTrigger load from CDN; everything degrades gracefully without them. */

(() => {
  "use strict";

  const doc = document.documentElement;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reducedMotion) doc.classList.add("no-motion");

  /* ---------- Theme toggle ---------- */

  const toggle = document.getElementById("theme-toggle");
  if (toggle) {
    toggle.addEventListener("click", () => {
      const next = doc.getAttribute("data-theme") === "dark" ? "light" : "dark";
      doc.classList.add("theme-anim");
      doc.setAttribute("data-theme", next);
      try {
        localStorage.setItem("optiyou-theme", next);
      } catch (e) {}
      setTimeout(() => doc.classList.remove("theme-anim"), 700);
    });
  }

  /* ---------- Nav shrink ---------- */

  const nav = document.getElementById("nav");
  if (nav) {
    const onScroll = () => nav.classList.toggle("scrolled", window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  /* ---------- Cursor glow ---------- */

  const glow = document.querySelector(".cursor-glow");
  const finePointer = window.matchMedia("(pointer: fine)").matches;
  if (glow && finePointer && !reducedMotion) {
    let gx = 0, gy = 0, tx = 0, ty = 0, raf = null;
    const step = () => {
      gx += (tx - gx) * 0.08;
      gy += (ty - gy) * 0.08;
      glow.style.left = gx + "px";
      glow.style.top = gy + "px";
      raf = Math.abs(tx - gx) + Math.abs(ty - gy) > 0.5 ? requestAnimationFrame(step) : null;
    };
    window.addEventListener("pointermove", (e) => {
      tx = e.clientX;
      ty = e.clientY;
      glow.style.opacity = "1";
      if (!raf) raf = requestAnimationFrame(step);
    }, { passive: true });
  }

  /* ---------- Particle field (hero) ---------- */

  const field = document.getElementById("field");
  if (field && !reducedMotion) {
    const ctx = field.getContext("2d");
    let w = 0, h = 0, dpr = 1, motes = [], running = true;

    const themeColors = () =>
      doc.getAttribute("data-theme") === "light"
        ? ["168,138,79", "47,125,95"]
        : ["205,188,139", "67,178,135"];

    const resize = () => {
      const rect = field.parentElement.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = rect.width;
      h = rect.height;
      field.width = w * dpr;
      field.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const seed = () => {
      const count = Math.min(70, Math.floor(w / 16));
      motes = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: 0.6 + Math.random() * 1.8,
        vy: 0.12 + Math.random() * 0.35,
        vx: (Math.random() - 0.5) * 0.12,
        tw: Math.random() * Math.PI * 2,
        c: Math.random() > 0.45 ? 0 : 1,
      }));
    };

    let t = 0;
    const draw = () => {
      if (!running) return;
      t += 0.016;
      ctx.clearRect(0, 0, w, h);
      const cols = themeColors();
      for (const m of motes) {
        m.y -= m.vy;
        m.x += m.vx + Math.sin(t * 0.6 + m.tw) * 0.08;
        if (m.y < -4) { m.y = h + 4; m.x = Math.random() * w; }
        if (m.x < -4) m.x = w + 4;
        if (m.x > w + 4) m.x = -4;
        const a = 0.18 + 0.5 * Math.abs(Math.sin(t * 0.8 + m.tw));
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${cols[m.c]},${a.toFixed(3)})`;
        ctx.fill();
      }
      requestAnimationFrame(draw);
    };

    resize();
    seed();
    requestAnimationFrame(draw);
    window.addEventListener("resize", () => { resize(); seed(); }, { passive: true });
    document.addEventListener("visibilitychange", () => {
      running = !document.hidden;
      if (running) requestAnimationFrame(draw);
    });
  }

  /* ---------- Orb: parallax tilt + score count ---------- */

  const orb = document.getElementById("orb");
  const orbArc = document.getElementById("orb-arc");
  const orbScore = document.getElementById("orb-score");
  const ORB_TARGET = 92;
  const ORB_CIRC = 703.7;

  if (orb && finePointer && !reducedMotion) {
    const stage = orb.closest(".orb-stage");
    let raf = null;
    stage.addEventListener("pointermove", (e) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        const r = stage.getBoundingClientRect();
        const dx = (e.clientX - r.left) / r.width - 0.5;
        const dy = (e.clientY - r.top) / r.height - 0.5;
        orb.style.transform = `perspective(900px) rotateY(${dx * 10}deg) rotateX(${dy * -10}deg)`;
        raf = null;
      });
    });
    stage.addEventListener("pointerleave", () => {
      orb.style.transition = "transform 0.8s cubic-bezier(0.22,1,0.36,1)";
      orb.style.transform = "perspective(900px) rotateY(0deg) rotateX(0deg)";
      setTimeout(() => (orb.style.transition = ""), 800);
    });
  }

  /* ---------- Magnetic buttons ---------- */

  if (finePointer && !reducedMotion) {
    document.querySelectorAll("[data-magnetic]").forEach((el) => {
      el.addEventListener("pointermove", (e) => {
        const r = el.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        el.style.transform = `translate(${dx * 0.14}px, ${dy * 0.22}px)`;
      });
      el.addEventListener("pointerleave", () => {
        el.style.transition = "transform 0.5s cubic-bezier(0.22,1,0.36,1)";
        el.style.transform = "translate(0,0)";
        setTimeout(() => (el.style.transition = ""), 500);
      });
    });
  }

  /* ---------- 3D tilt cards ---------- */

  if (finePointer && !reducedMotion) {
    document.querySelectorAll("[data-tilt]").forEach((card) => {
      let raf = null;
      card.addEventListener("pointermove", (e) => {
        if (raf) return;
        raf = requestAnimationFrame(() => {
          const r = card.getBoundingClientRect();
          const px = (e.clientX - r.left) / r.width;
          const py = (e.clientY - r.top) / r.height;
          card.style.transform = `perspective(900px) rotateY(${(px - 0.5) * 10}deg) rotateX(${(py - 0.5) * -10}deg) translateY(-4px)`;
          card.style.setProperty("--mx", `${px * 100}%`);
          card.style.setProperty("--my", `${py * 100}%`);
          raf = null;
        });
      });
      card.addEventListener("pointerleave", () => {
        card.style.transition = "transform 0.6s cubic-bezier(0.22,1,0.36,1)";
        card.style.transform = "perspective(900px) rotateY(0) rotateX(0) translateY(0)";
        setTimeout(() => (card.style.transition = ""), 600);
      });
    });
  }

  /* ---------- Fit Check ---------- */

  const chips = document.getElementById("chips");
  const RADIUS_CIRC = 326.7;
  const BASE_SCORE = 71;
  const BASE_FIT = 84;

  const setDial = (arcEl, valEl, value, animate) => {
    const offset = RADIUS_CIRC * (1 - value / 100);
    const color = value >= 70 ? "var(--emerald-glow)" : value >= 45 ? "var(--gold)" : "var(--terracotta)";
    arcEl.style.stroke = color;
    if (window.gsap && animate && !reducedMotion) {
      gsap.to(arcEl, { strokeDashoffset: offset, duration: 1.1, ease: "power3.out" });
      const obj = { v: parseInt(valEl.textContent, 10) || 0 };
      gsap.to(obj, {
        v: value,
        duration: 1.1,
        ease: "power3.out",
        onUpdate: () => (valEl.textContent = Math.round(obj.v)),
      });
    } else {
      arcEl.style.strokeDashoffset = offset;
      valEl.textContent = value;
    }
  };

  if (chips) {
    const scoreArc = document.getElementById("dial-score-arc");
    const scoreVal = document.getElementById("dial-score");
    const fitArc = document.getElementById("dial-fit-arc");
    const fitVal = document.getElementById("dial-fit");
    const verdict = document.getElementById("fit-verdict");

    const render = () => {
      const on = [...chips.querySelectorAll(".chip.on")];
      if (!on.length) {
        scoreArc.style.strokeDashoffset = RADIUS_CIRC;
        fitArc.style.strokeDashoffset = RADIUS_CIRC;
        scoreVal.textContent = "—";
        fitVal.textContent = "—";
        verdict.textContent = "Select a goal to render your verdict.";
        return;
      }
      const delta = on.reduce((s, c) => s + parseInt(c.dataset.w, 10), 0);
      const fit = Math.max(8, Math.min(98, BASE_FIT + delta));
      setDial(scoreArc, scoreVal, BASE_SCORE, true);
      setDial(fitArc, fitVal, fit, true);
      verdict.textContent =
        fit >= 80
          ? "A considered match. This one is worthy of you."
          : fit >= 55
            ? "Acceptable — though a finer choice exists for your goals."
            : "Not for you. We'd present a finer alternative.";
    };

    chips.addEventListener("click", (e) => {
      const chip = e.target.closest(".chip");
      if (!chip) return;
      chip.classList.toggle("on");
      render();
    });
  }

  /* ---------- Stories rotator ---------- */

  const stage = document.getElementById("story-stage");
  const dots = document.getElementById("story-dots");
  if (stage && dots) {
    const stories = [...stage.querySelectorAll(".story")];
    const dotEls = [...dots.querySelectorAll("button")];
    let idx = 0, timer = null;

    const show = (i) => {
      idx = i % stories.length;
      stories.forEach((s, j) => s.classList.toggle("on", j === idx));
      dotEls.forEach((d, j) => d.classList.toggle("on", j === idx));
    };
    const auto = () => {
      clearInterval(timer);
      if (!reducedMotion) timer = setInterval(() => show(idx + 1), 6000);
    };
    dotEls.forEach((d, i) =>
      d.addEventListener("click", () => {
        show(i);
        auto();
      })
    );
    auto();
  }

  /* ---------- Waitlist ---------- */

  const signup = document.getElementById("signup");
  if (signup) {
    signup.addEventListener("submit", async (e) => {
      e.preventDefault();
      const input = document.getElementById("signup-email");
      const btn = signup.querySelector("button");
      const status = document.getElementById("signup-status");
      const email = input.value.trim();
      const params = new URLSearchParams(window.location.search);

      btn.disabled = true;
      btn.textContent = "Joining";
      status.textContent = "";

      try {
        const response = await fetch("/v1/waitlist", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            email,
            source: "landing_page",
            referrer: document.referrer || undefined,
            utmSource: params.get("utm_source") || undefined,
            utmMedium: params.get("utm_medium") || undefined,
            utmCampaign: params.get("utm_campaign") || undefined,
          }),
        });

        if (!response.ok) {
          throw new Error("signup_failed");
        }

        btn.textContent = "Joined";
        status.textContent = "You're on the list.";
        input.value = "";
        if (window.gsap && !reducedMotion) {
          gsap.fromTo(btn, { scale: 0.92 }, { scale: 1, duration: 0.6, ease: "elastic.out(1, 0.45)" });
        }
      } catch {
        btn.textContent = "Try again";
        status.textContent = "Check your email and try again.";
      } finally {
        setTimeout(() => {
          btn.disabled = false;
          btn.textContent = "Join the waitlist";
        }, 2600);
      }
    });
  }

  /* ---------- GSAP scenes ---------- */

  const initGsap = () => {
    if (!window.gsap) {
      // CDN unavailable — show everything statically.
      document.querySelectorAll("[data-reveal]").forEach((el) => {
        el.style.opacity = "1";
        el.style.transform = "none";
      });
      if (orbArc && orbScore) {
        orbArc.style.strokeDashoffset = ORB_CIRC * (1 - ORB_TARGET / 100);
        orbScore.textContent = ORB_TARGET;
      }
      document.querySelectorAll("h1 .line > span").forEach((s) => (s.style.transform = "none"));
      return;
    }

    gsap.registerPlugin(ScrollTrigger);

    if (reducedMotion) {
      if (orbArc && orbScore) {
        orbArc.style.strokeDashoffset = ORB_CIRC * (1 - ORB_TARGET / 100);
        orbScore.textContent = ORB_TARGET;
      }
      return;
    }

    // Hero headline: lines rise in.
    gsap.fromTo(
      "h1 .line > span",
      { yPercent: 110 },
      { yPercent: 0, duration: 1.2, ease: "power4.out", stagger: 0.14, delay: 0.15 }
    );

    // Hero supporting content.
    gsap.fromTo(
      ".hero [data-reveal]",
      { opacity: 0, y: 36 },
      { opacity: 1, y: 0, duration: 1, ease: "power3.out", stagger: 0.12, delay: 0.55 }
    );

    // Orb score draws + counts on load.
    if (orbArc && orbScore) {
      gsap.to(orbArc, {
        strokeDashoffset: ORB_CIRC * (1 - ORB_TARGET / 100),
        duration: 2,
        ease: "power3.inOut",
        delay: 0.7,
      });
      const obj = { v: 0 };
      gsap.to(obj, {
        v: ORB_TARGET,
        duration: 2,
        ease: "power3.inOut",
        delay: 0.7,
        onUpdate: () => (orbScore.textContent = Math.round(obj.v)),
      });
    }

    // Scroll reveals for everything below the hero.
    document.querySelectorAll("main [data-reveal]").forEach((el) => {
      if (el.closest(".hero") || el.classList.contains("feature-card")) return;
      gsap.fromTo(
        el,
        { opacity: 0, y: 44 },
        {
          opacity: 1,
          y: 0,
          duration: 1,
          ease: "power3.out",
          scrollTrigger: { trigger: el, start: "top 86%" },
        }
      );
    });

    // Feature cards stagger as a group.
    ScrollTrigger.batch(".feature-card", {
      start: "top 88%",
      onEnter: (batch) =>
        gsap.fromTo(batch, { opacity: 0, y: 44 }, { opacity: 1, y: 0, duration: 0.9, ease: "power3.out", stagger: 0.1 }),
    });

    // Method: progress line scrubs with scroll; steps light up.
    const progress = document.getElementById("method-progress");
    if (progress) {
      gsap.to(progress, {
        scaleY: 1,
        ease: "none",
        scrollTrigger: {
          trigger: "#method-steps",
          start: "top 70%",
          end: "bottom 45%",
          scrub: 0.6,
        },
      });
    }
    document.querySelectorAll(".step").forEach((step) => {
      ScrollTrigger.create({
        trigger: step,
        start: "top 62%",
        onEnter: () => step.classList.add("active"),
      });
    });

    // Hero parallax: copy drifts up slightly faster than orb on scroll out.
    gsap.to(".hero-copy", {
      y: -60,
      ease: "none",
      scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true },
    });
    gsap.to(".orb-stage", {
      y: -24,
      ease: "none",
      scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true },
    });
  };

  // GSAP scripts are deferred after this one; wait for load.
  if (window.gsap) initGsap();
  else window.addEventListener("load", initGsap);
})();
