/* Transport-independent MIDI parsing, learning and routing. Also runnable in Node tests. */
(function(root) {
  "use strict";
  const targets = {
    mainFrequency: "Carrier frequency", modulationFrequency: "LFO frequency",
    modulationAmplitude: "LFO amplitude", delayTime: "Delay length",
    delayFeedback: "Feedback", delayCutoffFrequency: "Cutoff frequency", volume: "Volume",
    play: "Play (hold)", reset: "Reset (silence)", tap: "Tap Tempo"
  };
  const actions = new Set(["play", "reset", "tap"]);
  const empty = () => ({ version: 1, selected: null, devices: {} });
  function parse(data) {
    if (!data || data.length !== 3 || !Array.from(data).every(Number.isInteger)) return null;
    const [status, number, value] = data;
    if (status < 128 || status > 239 || number < 0 || number > 127 || value < 0 || value > 127) return null;
    const type = status >> 4;
    if (![8, 9, 11].includes(type)) return null;
    return { type: type === 11 ? "cc" : "note", channel: (status & 15) + 1, number,
      value: type === 8 ? 0 : value };
  }
  const signature = msg => `${msg.type}:${msg.channel}:${msg.number}`;
  function validate(settings) {
    if (!settings || settings.version !== 1 || !settings.devices || typeof settings.devices !== "object" || Array.isArray(settings.devices)) throw new Error("Invalid or unsupported MIDI settings");
    const identity = d => d && typeof d.id === "string" && typeof d.name === "string" && typeof d.manufacturer === "string";
    if (settings.selected !== null && !identity(settings.selected)) throw new Error("Invalid selected device");
    for (const [id, device] of Object.entries(settings.devices)) {
      if (!identity(device) || device.id !== id || !device.bindings || typeof device.bindings !== "object" || Array.isArray(device.bindings)) throw new Error("Invalid device mappings");
      const used = new Set();
      for (const [target, msg] of Object.entries(device.bindings)) {
        if (!Object.hasOwn(targets, target) || !msg || !["cc", "note"].includes(msg.type) || (!actions.has(target) && msg.type !== "cc") || !Number.isInteger(msg.channel) || msg.channel < 1 || msg.channel > 16 || !Number.isInteger(msg.number) || msg.number < 0 || msg.number > 127 || used.has(signature(msg))) throw new Error("Invalid MIDI binding");
        used.add(signature(msg));
      }
    }
    if (settings.selected && !Object.hasOwn(settings.devices, settings.selected.id)) throw new Error("Missing selected device mappings");
    return settings;
  }
  function scale(value, min, max, step) {
    const snapped = min + Math.round(((value / 127) * (max - min)) / step) * step;
    return Number(Math.min(max, Math.max(min, snapped)).toFixed(8));
  }
  class Router {
    constructor(callbacks) { this.callbacks = callbacks; this.down = new Set(); this.learning = null; this.blocked = new Set(); this.padKeys = new Set(); }
    clear() { for (const key of this.down) if (this.padKeys.has(key)) this.blocked.add(key); this.down.clear(); this.learning = null; this.callbacks.silence(); }
    receive(data, bindings, configuring) {
      const msg = parse(data);
      if (!msg) return;
      this.callbacks.monitor(msg);
      const key = signature(msg), wasDown = this.down.has(key);
      for (const [target, binding] of Object.entries(bindings)) if (actions.has(target)) this.padKeys.add(signature(binding));
      if (msg.value > 0) this.down.add(key); else this.down.delete(key);
      if (msg.value === 0) this.blocked.delete(key);
      else if (this.blocked.has(key) && !configuring && Object.entries(bindings).some(([target, binding]) => actions.has(target) && signature(binding) === key)) return;
      if (configuring) {
        if (this.learning && (actions.has(this.learning) ? msg.value > 0 : msg.type === "cc")) {
          const target = this.learning;
          if (actions.has(target)) this.padKeys.add(key);
          this.learning = null;
          this.callbacks.learn(target, { type: msg.type, channel: msg.channel, number: msg.number });
        }
        return;
      }
      for (const [target, binding] of Object.entries(bindings)) {
        if (signature(binding) !== key) continue;
        if (!actions.has(target)) this.callbacks.slider(target, msg.value);
        else if (target === "play") {
          if (msg.value > 0 && !wasDown) this.callbacks.press(key);
          if (msg.value === 0) this.callbacks.release(key);
        } else if (msg.value > 0 && !wasDown) this.callbacks[target]();
      }
    }
  }
  const api = { targets, actions, empty, parse, signature, validate, scale, Router };
  if (typeof module !== "undefined") module.exports = api;
  else root.DubMidi = api;
})(typeof window === "undefined" ? globalThis : window);
