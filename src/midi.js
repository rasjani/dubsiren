/* Browser and Tauri transports share the same learning UI and mapping engine. */
(async function() {
  "use strict";
  await window.DubSettings.ready;
  const core = window.DubMidi, siren = window.ZongoDubSiren;
  const native = window.__TAURI__ && window.__TAURI__.core;
  const key = "dubsiren:midi:v1";
  const panel = document.querySelector("#midiSettings");
  panel.innerHTML = `<h2>MIDI Configuration</h2>
    <p><button id="midiBack">Back to Siren</button> <button id="midiEnable" disabled>Enable MIDI</button>
    <button id="midiDisable" disabled>Disable MIDI</button></p>
    <label>Input device <select id="midiDevice" disabled><option value="">Select an input</option></select></label>
    <p id="midiStatus" role="status">Loading MIDI settings…</p>
    <p id="midiStorage" role="status"></p>
    <button id="midiRetry" hidden>Retry Save</button>
    <button id="midiResetSettings" hidden>Reset saved settings</button>
    <p id="midiMonitor">No MIDI messages received.</p>
    <p id="midiNotice" role="status"></p>
    <button id="midiCancel" hidden>Cancel Learn</button>
    <p>Select an input, click Learn, then turn a knob or press a pad. Play uses hold mode:
    configure pads to send momentary notes or CC messages with a release value of zero.</p>
    <p>Performance controls are paused on this screen. Return to the siren to play.</p>
    <table><thead><tr><th>Control</th><th>Assignment</th><th>Learning</th></tr></thead><tbody id="midiRows"></tbody></table>`;
  const $ = id => document.getElementById(id);
  let settings = core.empty(), ready = false, enabled = false, configuring = false;
  let ports = [], access, connected = null, generation = 0, refreshing = false;
  let transportQueue = Promise.resolve();
  function transport(operation) {
    const result = transportQueue.catch(() => {}).then(operation);
    transportQueue = result;
    return result;
  }
  let writeQueue = Promise.resolve(), saveVersion = 0;
  const storage = {
    loadSettings: () => window.DubSettings.loadMidi(),
    saveSettings: value => window.DubSettings.saveMidi(value)
  };
  const router = new core.Router({
    silence: () => siren.reset(),
    monitor: msg => { $("midiMonitor").textContent = `Channel ${msg.channel} · ${msg.type.toUpperCase()} ${msg.number} · Value ${msg.value}`; },
    learn: (target, binding) => {
      const device = profile();
      let previous;
      for (const [other, existing] of Object.entries(device.bindings)) {
        if (core.signature(existing) === core.signature(binding)) { delete device.bindings[other]; previous = other; }
      }
      device.bindings[target] = binding;
      $("midiNotice").textContent = `${core.targets[target]} learned.${previous && previous !== target ? " Removed assignment from " + core.targets[previous] + "." : ""}`;
      save(); renderRows();
    },
    slider: (target, value) => {
      const input = document.querySelector("input." + target);
      siren.setSlider(target, core.scale(value, Number(input.min), Number(input.max), Number(input.step)));
    },
    press: source => siren.press("midi:" + source), release: source => siren.release("midi:" + source),
    reset: () => siren.reset(), tap: () => siren.tap()
  });
  function profile() {
    return settings.selected && settings.devices[settings.selected.id];
  }
  function save() {
    if (!ready) return;
    const snapshot = JSON.parse(JSON.stringify(settings)), version = ++saveVersion;
    $("midiStorage").textContent = "Saving…";
    $("midiRetry").hidden = true;
    writeQueue = writeQueue.catch(() => {}).then(() => storage.saveSettings(snapshot)).then(() => {
      if (version === saveVersion) $("midiStorage").textContent = "MIDI settings saved.";
    }).catch(error => {
      if (version === saveVersion) {
        $("midiStorage").textContent = "Could not save MIDI settings: " + String(error);
        $("midiRetry").hidden = false;
      }
    });
  }
  function renderRows() {
    const body = $("midiRows"); body.replaceChildren();
    for (const [target, title] of Object.entries(core.targets)) {
      const row = document.createElement("tr"), label = document.createElement("th"), assignment = document.createElement("td"), actions = document.createElement("td");
      label.scope = "row"; label.textContent = title;
      const binding = profile()?.bindings[target];
      assignment.textContent = binding ? `Ch ${binding.channel} · ${binding.type.toUpperCase()} ${binding.number}` : "Unassigned";
      for (const action of ["Learn", "Clear"]) {
        const button = document.createElement("button"); button.textContent = action;
        button.setAttribute("aria-label", action + " " + title);
        button.disabled = !ready || !profile() || (action === "Learn" && !connected);
        button.onclick = () => {
          if (action === "Learn") {
            router.learning = target;
            $("midiNotice").textContent = `Learning ${title}: ${core.actions.has(target) ? "press a pad" : "turn a knob"}…`;
          } else { delete profile().bindings[target]; router.learning = null; save(); }
          renderRows();
        };
        if (action === "Learn" && router.learning === target) button.textContent = "Listening…";
        actions.appendChild(button);
      }
      row.append(label, assignment, actions); body.appendChild(row);
    }
    $("midiCancel").hidden = !router.learning;
  }
  function setView(open) {
    configuring = open; siren.settings(open); router.clear();
    panel.hidden = !open; $("instrument").hidden = open; $("midiSettingsButton").hidden = open;
    $("midiNotice").textContent = ""; renderRows();
    (open ? $("midiBack") : $("midiSettingsButton")).focus();
  }
  function receive(data, token) {
    if (!enabled || token !== generation || !connected || !document.hasFocus()) return;
    router.receive(data, profile()?.bindings || {}, configuring);
  }
  async function disconnect() {
    generation++; connected = null; router.clear();
    if (access) for (const port of access.inputs.values()) {
      if (port.onmidimessage) { port.onmidimessage = null; if (port.close) await port.close(); }
    }
    if (native) await transport(() => native.invoke("midi_disconnect"));
  }
  async function connect(port) {
    await disconnect();
    const token = generation;
    if (native) {
      const messages = new native.Channel();
      messages.onmessage = data => receive(data, token);
      await transport(() => {
        if (!enabled || token !== generation) return;
        return native.invoke("midi_connect", { id:port.id, messages });
      });
    } else {
      const input = access.inputs.get(port.id);
      await input.open();
      input.onmidimessage = event => receive(Array.from(event.data), token);
    }
    if (!enabled || token !== generation) return;
    connected = port.id;
    $("midiStatus").textContent = "Connected to " + port.name;
  }
  async function refresh() {
    if (!enabled || refreshing) return;
    refreshing = true;
    try {
      const oldInventory = JSON.stringify(ports), oldConnected = connected;
      ports = native ? await native.invoke("midi_list_inputs") : Array.from(access.inputs.values()).filter(p => p.state === "connected").map(p => ({id:p.id, name:p.name || "MIDI input", manufacturer:p.manufacturer || ""}));
      if (!enabled) return;
      const inventoryChanged = oldInventory !== JSON.stringify(ports);
      const select = $("midiDevice");
      if (inventoryChanged || select.options.length === 1) { select.replaceChildren(new Option("Select an input", ""));
      for (const port of ports) select.add(new Option(port.name, port.id)); }
      let selected = settings.selected && ports.find(p => p.id === settings.selected.id);
      if (!selected && settings.selected) {
        const matches = ports.filter(p => p.name === settings.selected.name && p.manufacturer === settings.selected.manufacturer);
        if (matches.length === 1) {
          selected = matches[0];
          const previous = profile();
          settings.devices[selected.id] = {...selected, bindings:previous?.bindings || {}};
          settings.selected = selected; save();
        }
      }
      select.value = selected?.id || "";
      if (connected && connected !== selected?.id) await disconnect();
      if (selected && connected !== selected.id) await connect(selected);
      if (!connected) $("midiStatus").textContent = !ports.length ? "No MIDI inputs connected. Saved mappings are retained." : "Select an input device (ambiguous saved names require manual selection).";
      if (inventoryChanged || oldConnected !== connected) renderRows();
    } catch (error) { await disconnect().catch(() => {}); $("midiStatus").textContent = "MIDI connection error: " + String(error); renderRows(); }
    finally { refreshing = false; }
  }
  $("midiDevice").onchange = async () => {
    if (refreshing) return;
    const selected = ports.find(p => p.id === $("midiDevice").value) || null;
    settings.selected = selected;
    if (selected && !settings.devices[selected.id]) settings.devices[selected.id] = {...selected, bindings:{}};
    save(); await disconnect().catch(error => { $("midiStatus").textContent = String(error); }); await refresh();
  };
  $("midiEnable").onclick = async () => {
    $("midiEnable").disabled = true;
    try {
      await siren.resume();
      if (!native) {
        if (!navigator.requestMIDIAccess) throw new Error("Web MIDI is unavailable. Use a supporting browser over HTTPS or localhost, or the desktop app.");
        access = await navigator.requestMIDIAccess({sysex:false});
        access.onstatechange = () => refresh();
      }
      enabled = true; $("midiDevice").disabled = false; $("midiDisable").disabled = false;
      await refresh();
    } catch (error) { $("midiStatus").textContent = "Could not enable MIDI: " + String(error); $("midiEnable").disabled = false; }
  };
  $("midiDisable").onclick = async () => {
    enabled = false; await disconnect().catch(() => {});
    $("midiEnable").disabled = !ready; $("midiDisable").disabled = true; $("midiDevice").disabled = true;
    $("midiStatus").textContent = "MIDI disabled. Saved mappings are retained."; renderRows();
  };
  $("midiSettingsButton").onclick = () => setView(true);
  $("midiBack").onclick = () => setView(false);
  $("midiCancel").onclick = () => { router.learning = null; $("midiNotice").textContent = "Learning cancelled."; renderRows(); };
  $("midiRetry").onclick = save;
  $("midiResetSettings").onclick = () => {
    if (!window.confirm("Replace saved settings with defaults? This clears MIDI mappings and resets sound profiles.")) return;
    if (window.DubSettings.error) {
      window.DubSettings.reset().then(() => location.reload()).catch(error => { $("midiStorage").textContent=String(error); });
      return;
    }
    settings = core.empty(); ready = true; $("midiResetSettings").hidden = true; $("midiEnable").disabled = false; save(); renderRows();
  };
  window.addEventListener("blur", () => router.clear());
  window.addEventListener("pagehide", () => { enabled = false; disconnect().catch(() => {}); });
  setInterval(refresh, 2000);
  try {
    const stored = await storage.loadSettings();
    settings = stored === null ? core.empty() : core.validate(stored);
    ready = true; $("midiEnable").disabled = false;
    $("midiStatus").textContent = "MIDI disabled. Enable MIDI to connect and activate audio.";
    $("midiStorage").textContent = native ? "Settings are stored in the app configuration directory." : "Settings are stored in this browser for this site.";
  } catch (error) {
    $("midiStorage").textContent = "Could not load MIDI settings; saved data has not been changed: " + String(error);
    $("midiResetSettings").hidden = false; $("midiStatus").textContent = "Reset saved settings to configure MIDI.";
  }
  renderRows();
  // Browser audio can become suspended after an interruption. A click is needed to resume it.
  siren.outputGain.context.addEventListener("statechange", () => {
    if (enabled && siren.outputGain.context.state === "suspended") {
      router.clear(); $("midiStatus").textContent = "Audio suspended. Click Resume Audio.";
      $("midiResumeAudio").hidden = false;
    }
  });
  const resume = document.createElement("button"); resume.id = "midiResumeAudio"; resume.hidden = true; resume.textContent = "Resume Audio";
  resume.onclick = async () => { try { await siren.resume(); resume.hidden = true; } catch (error) { $("midiStatus").textContent = String(error); } };
  document.querySelector(".container").appendChild(resume);
})();
