/* One settings owner serializes writes so patch and MIDI updates cannot overwrite each other. */
(function() {
  "use strict";
  const native = window.__TAURI__?.core;
  const key = "dubsiren:settings:v2", midiKey = "dubsiren:midi:v1";
  const fields = ["mainFrequency", "modulationFrequency", "modulationAmplitude", "delayTime", "delayFeedback", "delayCutoffFrequency", "mainOscillatorType", "modulationOscillatorType", "delayFactor", "modulationTapTempoSync", "delayTapTempoSync"];
  const defaults = {};
  for (const name of fields) {
    const input = document.querySelector("input." + name);
    defaults[name] = input.type === "checkbox" ? input.defaultChecked : input.type === "radio" ? document.querySelector("input." + name + "[checked]").value : Number(input.defaultValue);
  }
  const empty = () => ({version:2, volume:0.8, currentPatch:"1", patches:Object.fromEntries(Array.from({length:4}, (_,i) => [String(i+1), {...defaults}])), patchNames:{1:"1",2:"2",3:"3",4:"4"}, midi:window.DubMidi.empty()});
  function validField(name, value) {
    const input = document.querySelector("input." + name);
    if (input.type === "checkbox") return typeof value === "boolean";
    if (input.type === "radio") return Array.from(document.querySelectorAll("input." + name)).some(input => input.value === value);
    return typeof value === "number" && Number.isFinite(value) && value >= Number(input.min) && value <= Number(input.max);
  }
  function validate(value) {
    if (!value || value.version !== 2 || !Number.isFinite(value.volume) || value.volume < 0 || value.volume > 1 || !/^[1-9]$/.test(value.currentPatch) || !value.patches) throw new Error("Invalid sound settings");
    window.DubMidi.validate(value.midi);
    for (let patch=1;patch<=4;patch++) {
      const profile = value.patches[patch];
      if (!profile || fields.some(name => !validField(name,profile[name]))) throw new Error("Invalid patch " + patch);
      // Keep only supported fields. In particular, volume and runtime tempo never belong to patches.
      value.patches[patch] = Object.fromEntries(fields.map(name => [name,profile[name]]));
    }
    const patchNames = {};
    for (let patch=1;patch<=4;patch++) {
      const name=value.patchNames?.[patch];
      if (name !== undefined && typeof name !== "string") throw new Error("Invalid patch name");
      patchNames[patch] = (name || "").trim().slice(0,32) || String(patch);
    }
    return {version:2, volume:value.volume, currentPatch:Number(value.currentPatch)<=4 ? String(value.currentPatch) : "1", patches:value.patches, patchNames, midi:value.midi};
  }
  function legacy() {
    const value = empty();
    const selected = localStorage.getItem("patch:current");
    if (/^[1-4]$/.test(selected)) value.currentPatch = selected;
    const volume = localStorage.getItem("input:volume");
    if (volume !== null && Number.isFinite(Number(volume)) && Number(volume) >= 0 && Number(volume) <= 1) value.volume = Number(volume);
    for (let patch=1;patch<=9;patch++) for (const name of fields) {
      const raw = localStorage.getItem(`patch:${patch}:${name}`);
      if (raw === null) continue;
      const input = document.querySelector("input." + name);
      const converted = input.type === "checkbox" ? (raw === "true" ? true : raw === "false" ? false : null) : input.type === "range" ? Number(raw) : raw;
      if (validField(name,converted)) {
        if (!value.patches[patch]) value.patches[patch]={...defaults};
        value.patches[patch][name] = converted;
      }
    }
    return value;
  }
  const status = document.createElement("p"); status.id="settingsStatus"; status.setAttribute("role","status");
  const retry = document.createElement("button"); retry.textContent="Retry saving settings"; retry.hidden=true;
  document.querySelector(".container").append(status,retry);
  let queue = Promise.resolve(), revision=0;
  const store = window.DubSettings = {
    state:empty(), error:null,
    save() {
      if (store.error) return Promise.reject(store.error);
      const snapshot = JSON.parse(JSON.stringify(store.state)), version=++revision;
      queue = queue.catch(()=>{}).then(async () => {
        if (native) await native.invoke("midi_save_settings", {settings:snapshot});
        else {
          // Retain the established browser MIDI key; sound profiles have their own key.
          localStorage.setItem(midiKey,JSON.stringify(snapshot.midi));
          const {midi,...sound} = snapshot;
          localStorage.setItem(key,JSON.stringify(sound));
        }
        if (version===revision) {status.textContent="";retry.hidden=true;}
      }).catch(error => {
        if (version===revision) {status.textContent="Could not save settings: "+String(error);retry.hidden=false;}
        throw error;
      });
      return queue;
    },
    updateSound() { store.save().catch(()=>{}); },
    async loadMidi() { await store.ready; if(store.error) throw store.error; return store.state.midi; },
    async saveMidi(midi) { store.state.midi = window.DubMidi.validate(midi); return store.save(); },
    reset() { store.state=empty(); store.error=null; return store.save(); }
  };
  retry.onclick=()=>store.save().catch(()=>{});
  store.ready=(async()=>{
    try {
      if (native) {
        const saved=await native.invoke("midi_load_settings");
        if(saved?.version===2) store.state=validate(saved);
        else {store.state=legacy(); if(saved!==null) store.state.midi=window.DubMidi.validate(saved);}
      } else {
        const saved=JSON.parse(localStorage.getItem(key)||"null");
        const midi=JSON.parse(localStorage.getItem(midiKey)||"null");
        if(saved!==null) store.state=validate({...saved,midi:midi||window.DubMidi.empty()});
        else {store.state=legacy();if(midi!==null) store.state.midi=window.DubMidi.validate(midi);}
      }
      await store.save().catch(()=>{});
    } catch(error) {
      store.error=error; status.textContent="Saved settings could not be loaded. Existing data has been preserved. Open MIDI Settings to reset saved settings. "+String(error);
    }
  })();
})();
