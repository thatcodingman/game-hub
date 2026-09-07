/**
 * ArcadeSFX — a tiny, dependency-free synthesized sound-effects engine.
 *
 * Drop this ONE file into every game on the site:
 *   <script src="sfx.js"></script>
 * (or, better, host it once at a shared path — e.g. /assets/sfx.js — and
 * reference that same URL from every game's HTML, so improving this file
 * once updates every game at the same time. No per-game rewrites.)
 *
 * Then call the global `SFX` object from anywhere in the game code:
 *   SFX.shoot();
 *   SFX.pickup();
 *   SFX.fail();
 *
 * No audio files, no build step, no framework dependency — works the same
 * whether the game is built in Phaser, plain canvas, or plain DOM/CSS.
 * Sounds are synthesized live via the Web Audio API.
 *
 * Mute and volume preferences persist in localStorage. Since these are
 * origin-scoped, if every game on the site shares the same domain, a
 * player's mute choice on one game carries over to the next automatically.
 */
(function () {
  'use strict';

  const MUTE_KEY = 'arcadesfx_muted';
  const VOLUME_KEY = 'arcadesfx_volume';

  class ArcadeSFX {
    constructor() {
      this.ctx = null;
      this.muted = localStorage.getItem(MUTE_KEY) === '1';
      const storedVol = parseFloat(localStorage.getItem(VOLUME_KEY));
      this.volume = isNaN(storedVol) ? 1 : storedVol;
      this._attachAutoUnlock();
    }

    // Browsers block audio until a real user gesture. Listening at the
    // document level means any game's first tap/click/key unlocks audio
    // automatically — no per-game wiring required.
    _attachAutoUnlock() {
      const unlock = () => {
        this.ensureContext();
        document.removeEventListener('pointerdown', unlock);
        document.removeEventListener('keydown', unlock);
        document.removeEventListener('touchstart', unlock);
      };
      document.addEventListener('pointerdown', unlock, { once: true, passive: true });
      document.addEventListener('keydown', unlock, { once: true });
      document.addEventListener('touchstart', unlock, { once: true, passive: true });
    }

    ensureContext() {
      if (!this.ctx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return; // unsupported browser — fail silently, never breaks the game
        this.ctx = new Ctx();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    }

    setMuted(muted) {
      this.muted = !!muted;
      localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0');
    }

    toggleMute() {
      this.setMuted(!this.muted);
      return this.muted;
    }

    setVolume(v) {
      this.volume = Math.max(0, Math.min(1, v));
      localStorage.setItem(VOLUME_KEY, String(this.volume));
    }

    // ---- Low-level primitive — exposed so any game can build custom one-off
    // sounds without touching this file. ----
    tone(freq, duration, type, vol, sweepTo, delay) {
      if (this.muted || !this.ctx) return;
      const play = () => {
        const ctx = this.ctx;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type || 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        if (sweepTo) osc.frequency.exponentialRampToValueAtTime(Math.max(sweepTo, 1), ctx.currentTime + duration);
        const v = (vol == null ? 0.15 : vol) * this.volume;
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(v, ctx.currentTime + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + duration + 0.02);
      };
      if (delay) setTimeout(play, delay); else play();
    }

    // Short sequence of notes — for pickups/success sounds with 2-3 notes.
    chime(freqs, type, vol) {
      freqs.forEach((freq, i) => this.tone(freq, 0.12, type || 'sine', vol || 0.15, freq * 1.3, i * 85));
    }

    // ---- Generic vocabulary — reusable across almost any casual game genre ----
    click()     { this.tone(440, 0.04, 'square', 0.08); }              // UI tap
    select()    { this.tone(660, 0.06, 'square', 0.10, 880); }         // menu confirm
    blip()      { this.tone(880, 0.05, 'square', 0.05); }              // generic minor event
    shoot()     { this.tone(900, 0.05, 'square', 0.05); }              // projectile fire
    jump()      { this.tone(300, 0.12, 'sine', 0.14, 600); }           // platformer jump
    swoosh()    { this.tone(200, 0.15, 'sine', 0.10, 500); }           // movement/transition
    pickup()    { this.tone(660, 0.12, 'sine', 0.16, 990); }           // collect item
    coin()      { this.chime([660, 990], 'sine', 0.15); }              // richer collect (2-note)
    powerup()   { this.chime([440, 660, 880], 'triangle', 0.16); }     // upgrade/boost
    hit()       { this.tone(150, 0.18, 'sawtooth', 0.20, 55); }        // take damage
    explosion() { this.tone(520, 0.14, 'sawtooth', 0.14, 60); }        // destroy enemy/object
    alert()     { this.tone(700, 0.10, 'square', 0.14, 700); }         // warning/danger cue
    success()   { this.chime([523, 659, 784], 'triangle', 0.17); }     // level complete/win
    fail()      { this.tone(280, 0.35, 'sawtooth', 0.20, 70); }        // game over/lose
    countdown() { this.tone(500, 0.08, 'square', 0.10); }              // timer tick

    // Escalating-pitch cue for streaks/combos — pitch rises with n (caps at 10).
    combo(n) {
      const freq = 440 + Math.min(n || 0, 10) * 40;
      this.tone(freq, 0.10, 'triangle', 0.15, freq * 1.4);
    }

    // Mounts a small floating mute button + volume slider as a plain DOM
    // overlay (position: fixed), independent of whatever canvas/framework
    // the game itself uses. Auto-mounted by default — see bottom of file.
    // Call SFX.mountUI() again with a different corner if a game needs to
    // reposition it, or set window.ARCADESFX_NO_UI = true before this script
    // loads to opt out and build custom controls instead.
    mountUI(options) {
      const existing = document.getElementById('arcadesfx-ui');
      if (existing) existing.remove();

      options = options || {};
      const corner = options.corner || 'top-right';
      const positions = {
        'top-right':    'top:10px; right:10px;',
        'top-left':     'top:10px; left:10px;',
        'bottom-right': 'bottom:10px; right:10px;',
        'bottom-left':  'bottom:10px; left:10px;'
      };

      const wrap = document.createElement('div');
      wrap.id = 'arcadesfx-ui';
      wrap.style.cssText =
        'position:fixed; ' + (positions[corner] || positions['top-right']) +
        ' z-index:9999; display:flex; align-items:center; gap:8px;' +
        ' background:rgba(0,0,0,0.45); padding:6px 10px; border-radius:20px;' +
        ' font-family:system-ui,sans-serif; user-select:none; touch-action:manipulation;';

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('aria-label', 'Toggle sound');
      btn.style.cssText = 'background:none; border:none; cursor:pointer; font-size:18px; line-height:1; padding:0; color:#fff;';

      const slider = document.createElement('input');
      slider.type = 'range';
      slider.min = '0';
      slider.max = '1';
      slider.step = '0.01';
      slider.value = String(this.volume);
      slider.disabled = this.muted;
      slider.setAttribute('aria-label', 'Volume');
      slider.style.cssText = 'width:70px; accent-color:#4ade80; cursor:pointer;';

      const refresh = () => {
        btn.textContent = this.muted ? '🔇' : '🔊';
        slider.disabled = this.muted;
      };
      refresh();

      btn.addEventListener('click', () => {
        this.ensureContext();
        this.toggleMute();
        refresh();
      });

      slider.addEventListener('input', (e) => {
        this.ensureContext();
        this.setVolume(parseFloat(e.target.value));
      });

      wrap.appendChild(btn);
      wrap.appendChild(slider);
      document.body.appendChild(wrap);
    }
  }

  window.SFX = new ArcadeSFX();

  // Auto-mount the volume/mute control so every game that includes this file
  // gets one for free — no per-game UI code required. Opt out per-game with
  // window.ARCADESFX_NO_UI = true (set before this script tag), or reposition
  // with window.ARCADESFX_UI_CORNER = 'top-left' / 'bottom-right' / etc.
  if (!window.ARCADESFX_NO_UI) {
    const mount = () => window.SFX.mountUI({ corner: window.ARCADESFX_UI_CORNER });
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', mount);
    } else {
      mount();
    }
  }
})();
