/* audio.js —— WebAudio 合成音效，无需外部音频文件 */
(function (global) {
  'use strict';

  var ctx = null;
  var muted = false;
  try { muted = localStorage.getItem('yang-muted') === '1'; } catch (e) { muted = false; }

  function ensure() {
    if (!ctx) {
      var AC = global.AudioContext || global.webkitAudioContext;
      if (AC) ctx = new AC();
    }
    if (ctx && ctx.state === 'suspended') { try { ctx.resume(); } catch (e) { /* noop */ } }
    return ctx;
  }

  function tone(freq, dur, type, vol, delay) {
    if (muted) return;
    var c = ensure();
    if (!c) return;
    try {
      var t0 = c.currentTime + (delay || 0);
      var o = c.createOscillator();
      var g = c.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, t0);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol || 0.12, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + (dur || 0.15));
      o.connect(g); g.connect(c.destination);
      o.start(t0); o.stop(t0 + (dur || 0.15) + 0.05);
    } catch (e) { /* noop */ }
  }

  var sfx = {
    pick: function () { tone(540, 0.08, 'triangle', 0.13); tone(760, 0.06, 'sine', 0.05, 0.02); },
    clear: function () { tone(523, 0.11, 'triangle', 0.12); tone(659, 0.11, 'triangle', 0.12, 0.07); tone(880, 0.16, 'triangle', 0.12, 0.14); },
    tool: function () { tone(440, 0.09, 'sine', 0.12); tone(660, 0.12, 'sine', 0.12, 0.09); },
    win: function () { tone(523, 0.2, 'triangle', 0.13); tone(659, 0.2, 'triangle', 0.13, 0.12); tone(784, 0.2, 'triangle', 0.13, 0.24); tone(1047, 0.34, 'triangle', 0.14, 0.36); },
    lose: function () { tone(330, 0.26, 'sawtooth', 0.08); tone(262, 0.3, 'sawtooth', 0.08, 0.2); tone(196, 0.42, 'sawtooth', 0.08, 0.42); },
    click: function () { tone(620, 0.04, 'sine', 0.06); },
    no: function () { tone(210, 0.13, 'square', 0.05); },
    denied: function () { tone(180, 0.16, 'sawtooth', 0.07); tone(150, 0.2, 'sawtooth', 0.07, 0.1); }
  };

  function toggleMute() {
    muted = !muted;
    try { localStorage.setItem('yang-muted', muted ? '1' : '0'); } catch (e) { /* noop */ }
    return muted;
  }

  global.AudioSfx = {
    play: function (name) { if (sfx[name]) sfx[name](); },
    muted: function () { return muted; },
    toggleMute: toggleMute,
    unlock: function () { ensure(); }
  };
})(window);
