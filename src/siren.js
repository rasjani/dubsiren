/* jshint browser: true */
window.DubSettings.ready.then(function() {
window.ZongoDubSiren = (function() {
"use strict";

var DEBUG = false;

function log() {
  if (DEBUG) {
    console.log.apply(console, arguments);
  }
}

var $ = document.querySelector.bind(document),
    $$ = document.querySelectorAll.bind(document);

var currentPatch, delay, feedback, filter,
    spacebar = 32, numPadZero = 96,
    tapTempoKeyCode = 84, /* bind tap tempo to the t key */
    delayFactorDownCode = 74, delayFactorUpCode = 75,
    mainOscillator, modulationOscillator,
    sirenPlaying = false,
    ctx = new window.AudioContext(),
    outputGain = ctx.createGain(),
    modulationGain = ctx.createGain(),
    mainFrequencySlider = $("input.mainFrequency"),
    modulationFrequencySlider = $("input.modulationFrequency"),
    modulationAmplitudeSlider = $("input.modulationAmplitude"),
    delayTimeSlider = $('input.delayTime'),
    delayFeedbackSlider = $('input.delayFeedback'),
    outputVolumeSlider = $("input.volume"),
    javascriptNode = ctx.createScriptProcessor(2048, 1, 1),
    patchKeyMaps = getPatchKeyMaps(),
    analyser = ctx.createAnalyser(),
    valueTooltips = [],
    heldSources = new Set(),
    settingsOpen = false,
    tapTempo;

function refreshValueTooltips() {
  valueTooltips.forEach(function(refresh) { refresh(); });
}


function initValueTooltips() {
  function hz(input) {
    return Number(input.value) + " Hz";
  }

  function modulationDepth(input) {
    return "±" + hz(input);
  }

  function percent(input) {
    return Math.round(Number(input.value) * 100) + "%";
  }

  function milliseconds(seconds) {
    return Number((seconds * 1000).toFixed(1)) + " ms";
  }

  function delayValue(input) {
    var seconds = Number(input.value);
    var factor = Number($("input.delayFactor:checked").value);
    var text = milliseconds(seconds);
    if (factor !== 1) {
      text += " (×" + factor + ": " + milliseconds(seconds * factor) + ")";
    }
    return text;
  }

  var controls = [
    [mainFrequencySlider, hz],
    [modulationFrequencySlider, hz],
    [modulationAmplitudeSlider, modulationDepth],
    [delayTimeSlider, delayValue],
    [$("input.delayCutoffFrequency"), hz],
    [delayFeedbackSlider, percent],
    [outputVolumeSlider, percent]
  ];

  controls.forEach(function(control) {
    var input = control[0], format = control[1];
    var label = input.closest("label");
    var tooltip = document.createElement("div");
    var hideTimer = null, hovering = false;
    tooltip.id = input.className + "-tooltip";
    tooltip.className = "slider-tooltip";
    tooltip.setAttribute("role", "tooltip");
    tooltip.hidden = true;
    document.body.appendChild(tooltip);
    input.setAttribute("aria-describedby", tooltip.id);

    function refresh() {
      tooltip.textContent = format(input);
      input.setAttribute("aria-valuetext", tooltip.textContent);
      if (!tooltip.hidden) {
        var bounds = input.getBoundingClientRect();
        var width = tooltip.offsetWidth, height = tooltip.offsetHeight;
        var left = bounds.left + (bounds.width - width) / 2;
        var top = bounds.top - height - 8;
        tooltip.style.left = Math.max(8, Math.min(left, window.innerWidth - width - 8)) + "px";
        tooltip.style.top = (top < 8 ? bounds.bottom + 8 : top) + "px";
      }
    }

    function hide() {
      clearTimeout(hideTimer);
      hideTimer = null;
      tooltip.hidden = true;
    }

    function show(briefly) {
      clearTimeout(hideTimer);
      hideTimer = null;
      tooltip.hidden = false;
      refresh();
      if (briefly) {
        hideTimer = setTimeout(function() {
          hideTimer = null;
          if (!hovering) { hide(); }
        }, 1500);
      }
    }

    label.addEventListener("pointerenter", function(event) {
      if (event.pointerType !== "touch") {
        hovering = true;
        show(false);
      }
    });
    label.addEventListener("pointerleave", function() {
      hovering = false;
      if (hideTimer === null) { hide(); }
    });
    input.addEventListener("focus", function() { show(true); });
    input.addEventListener("pointerdown", function() { show(true); });
    input.addEventListener("input", function() { show(true); });
    input.addEventListener("blur", function() { if (!hovering) { hide(); } });
    input.addEventListener("keydown", function(event) {
      if (event.key === "Escape") { hide(); }
    });
    valueTooltips.push(refresh);
    refresh();
  });

  window.addEventListener("resize", refreshValueTooltips);
  window.addEventListener("scroll", refreshValueTooltips, true);
}

function getPatchKeyMaps() {
  const upperRowOffset = 48, numPadOffset = 96;
  const values = Array.from($$(".patch-selection input")).map(
    input => input.value
  );
  const numPadMap = values.reduce((map, value) => {
    map[numPadOffset + parseInt(value)] = value;
    return map;
  }, {});
  const upperRowMap = values.reduce((map, value) => {
    map[upperRowOffset + parseInt(value)] = value;
    return map;
  }, {});
  return {
    numPad: numPadMap, upperRow: upperRowMap
  };
}


function initVolume() {
    outputGain.gain.value = outputVolumeSlider.value / 2.0;
    javascriptNode.connect(ctx.destination);
    outputGain.connect(ctx.destination);
    outputGain.connect(analyser);
    analyser.connect(javascriptNode);

    outputVolumeSlider.addEventListener("input", function () {
        outputGain.gain.value = outputVolumeSlider.value / 2.0;
        window.DubSettings.state.volume = Number(outputVolumeSlider.value);
    });

    var canvasElement = document.getElementById("canvas");
    var width = canvasElement.width, height = canvasElement.height;
    var canvas = canvasElement.getContext("2d");
    var gradient = canvas.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(1, '#da121a');
    gradient.addColorStop(0.5, '#fcdd09');
    gradient.addColorStop(0, '#078930');

    javascriptNode.onaudioprocess = function() {
        // get the average, bincount is fftsize / 2
        var array = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(array);
        var average = getAverageVolume(array);

        // clear the current state
        canvas.clearRect(0, 0, width, height);

        // set the fill style
        canvas.fillStyle = gradient;

        // create the meters
        canvas.fillRect(0, 0, (0 + average) * 1.8, height);
    }
    outputVolumeSlider.value = window.DubSettings.state.volume;
    outputGain.gain.value = outputVolumeSlider.value / 2;
    outputVolumeSlider.addEventListener("change", function() { window.DubSettings.updateSound(); });
}


function getAverageVolume(array) {
    var values = 0;
    var average;

    var length = array.length;

    for (var i = 0; i < length; i++) {
        values += array[i];
    }

    average = values / length;
    return average;
}


function updateMainFrequency() {
    if (mainOscillator) { mainOscillator.frequency.value = mainFrequencySlider.value; }
}


function updateModulationFrequency() {
  if (modulationOscillator) {
    modulationOscillator.frequency.value = modulationFrequencySlider.value;
  }
  refreshValueTooltips();
}


function updateModulationAmplitude() {
    modulationGain.gain.value = modulationAmplitudeSlider.value;
}


function play() {
    if (sirenPlaying === true) {
      return;
    }
    sirenPlaying = true;

    mainOscillator = ctx.createOscillator();
    mainOscillator.type = $("input.mainOscillatorType:checked").value;
    mainOscillator.frequency.value = mainFrequencySlider.value;

    modulationOscillator = ctx.createOscillator();
    modulationOscillator.type = $("input.modulationOscillatorType:checked").value;
    modulationOscillator.frequency.value = modulationFrequencySlider.value;
    modulationOscillator.connect(modulationGain);

    modulationGain.connect(mainOscillator.frequency);
    modulationGain.gain.value = modulationAmplitudeSlider.value;
    mainOscillator.connect(outputGain);
    modulationOscillator.start();
    mainOscillator.start();
    createEcho(mainOscillator);
}


function stop() {
    if (sirenPlaying === false) {
      return;
    }
    sirenPlaying = false;
    mainOscillator.disconnect(outputGain);
    modulationOscillator.disconnect(modulationGain);
    modulationGain.disconnect(mainOscillator.frequency);
    mainOscillator.stop();
    modulationOscillator.stop();
}


function createEcho(source) {
    delay = delay || ctx.createDelay(2);
    updateDelayTime();

    feedback = feedback || ctx.createGain();
    feedback.gain.value = delayFeedbackSlider.value;

    filter = filter || ctx.createBiquadFilter();
    updateCutoff();

    source.connect(delay);
    delay.connect(filter);
    filter.connect(feedback);
    feedback.connect(outputGain);
    feedback.connect(delay);
    return delay;
}


function updateDelayTime() {
  if (delay) {
    let selectedDelayFactorInput = $('input.delayFactor:checked')
    let delayFactor = parseFloat(selectedDelayFactorInput.value);
    let delayTime = delayTimeSlider.value * delayFactor;
    delay.delayTime.value = delayTime;
  }
  refreshValueTooltips();
}


function initEchoControls() {
  delayTimeSlider.addEventListener('input', function() {
    updateDelayTime();
  });

  delayFeedbackSlider.addEventListener('input', function() {
      if (feedback) {
        feedback.gain.value = delayFeedbackSlider.value;
      }
  });

  var delayFactorInputs = $$(".delayFactor");
  delayFactorInputs.forEach(function(delayFactorInput) {
    delayFactorInput.addEventListener('change', function() {
      updateDelayTime();
    });
  });
}


function patchIndex(patchNumber) {
    return parseInt(patchNumber) - 1;
}


function selectPatch(patch) {
  currentPatch = String(patch);
  window.DubSettings.state.currentPatch = currentPatch;
  applyPatch(currentPatch);
  window.DubSettings.updateSound();
}

function initPatches() {
  currentPatch = window.DubSettings.state.currentPatch;
  applyPatch(currentPatch);
  $$("input[name=patch]").forEach(function(input) {
    input.addEventListener("change", function() { if (input.checked) selectPatch(input.value); });
  });
  var fields = Object.keys(window.DubSettings.state.patches[currentPatch]);
  fields.forEach(function(name) {
    $$("input." + name).forEach(function(input) {
      input.addEventListener("change", storeInputValue);
    });
  });
  initPatchKeyBindings();
}

function storeInputValue(event) {
  var input=event.target;
  if (input.type === "radio" && !input.checked) return;
  window.DubSettings.state.patches[currentPatch][input.className] = input.type === "checkbox" ? input.checked : input.type === "range" ? Number(input.value) : input.value;
  window.DubSettings.updateSound();
}

function applyPatch(patchNumber) {
  var profile = window.DubSettings.state.patches[patchNumber];
  Object.keys(profile).forEach(function(name) {
    var input = $("input." + name);
    if (input.type === "radio") $("input." + name + '[value="' + profile[name] + '"]').checked=true;
    else if (input.type === "checkbox") input.checked=profile[name];
    else input.value=profile[name];
  });
  $("input[name=patch][value='"+patchNumber+"']").checked=true;
  updateMainFrequency(); updateModulationFrequency(); updateModulationAmplitude();
  updateDelayTime(); updateCutoff(); refreshValueTooltips();
}


function initPatchKeyBindings() {
  window.addEventListener("keydown", function(evt) {
    var evt = evt || window.event;
    var keyCode = evt.which || evt.keyCode;
    var patch = patchKeyMaps.upperRow[keyCode] || patchKeyMaps.numPad[keyCode];
    if (patch) {
      if (!keyboardAllowed(evt)) { return; }
      selectPatch(patch);
      $("input[name=patch][value='" + patch + "']").checked = true;
    }
  });
}


function press(source) {
  if (settingsOpen || heldSources.has(source)) { return; }
  heldSources.add(source);
  play();
}

function release(source) {
  heldSources.delete(source);
  if (!heldSources.size) { stop(); }
}

function reset() {
  heldSources.clear();
  stop();
  [delay, feedback, filter].forEach(function(node) { if (node) { node.disconnect(); } });
  delay = feedback = filter = null;
}

function updateCutoff() {
  if (!filter) { return; }
  var value = Number($("input.delayCutoffFrequency").value);
  filter.frequency.cancelScheduledValues(ctx.currentTime);
  filter.frequency.setValueAtTime(value, ctx.currentTime);
  filter.frequency.linearRampToValueAtTime(value - 1000, ctx.currentTime + 2);
}

function keyboardAllowed(event) {
  return !settingsOpen && !event.target.closest("button, input, select, textarea");
}

function bindSpaceBar() {
  window.addEventListener("keydown", function(event) {
    if (!event.repeat && keyboardAllowed(event) && (event.keyCode === spacebar || event.keyCode === numPadZero)) {
      press("key:" + event.code);
      event.preventDefault();
    }
  });
  window.addEventListener("keyup", function(event) {
    if (event.keyCode === spacebar || event.keyCode === numPadZero) {
      release("key:" + event.code);
    }
  });
  window.addEventListener("blur", reset);
}

function bindButtons() {
  var button = $("#playButton");
  button.addEventListener("pointerdown", function(event) {
    button.setPointerCapture(event.pointerId);
    press("pointer:" + event.pointerId);
  });
  ["pointerup", "pointercancel", "lostpointercapture"].forEach(function(type) {
    button.addEventListener(type, function(event) { release("pointer:" + event.pointerId); });
  });
  button.addEventListener("keydown", function(event) {
    if (!event.repeat && (event.code === "Space" || event.code === "Enter")) { event.preventDefault(); press("button:" + event.code); }
  });
  button.addEventListener("keyup", function(event) { release("button:" + event.code); });
  $("#panicButton").addEventListener("click", reset);
}


function RunningAverage() {

  // State is captured by closure
  var numberCount = 1;
  var currentAverage = 0;

  // Return a function that computes a running average
  return function(currentNumber) {
    currentAverage += ((currentNumber - currentAverage) / numberCount);
    numberCount++;
    return currentAverage;
  }

}


function changeDelayFactor(siblingProperty) {
  let selectedDelayFactorInput = $("input.delayFactor:checked");
  let containingLabel = selectedDelayFactorInput.parentElement;
  let siblingLabel = containingLabel[siblingProperty];
  if (siblingLabel.className === "delayFactorLabel") {
    let siblingInput = siblingLabel.querySelector("input.delayFactor");
    siblingInput.checked = true;
    siblingInput.dispatchEvent(new Event('change'))
    updateDelayTime();
  }
}


function increaseDelayFactor() {
  changeDelayFactor("nextElementSibling");
}


function decreaseDelayFactor() {
  changeDelayFactor("previousElementSibling");
}


function initTapTempo() {

  var previousTime = null,  // Time of the latest tap
    tapTempoButton = $("#tapTempoButton"),
    tapTempoValueContainer = $("#tapTempoValue"),
    modulationTempoSync = $(".modulationTapTempoSync"),
    delayTempoSync = $(".delayTapTempoSync"),
    avg = RunningAverage();

  function durationToBpm(duration) {
    // Returns a tempo in BPM corresponding to a duration in milliseconds
    // between two beats
    return 60000 / duration;
  }

  function durationToHz(duration) {
    // Returns a frequency in hertz corresponding to a duration in milliseconds
    // between two beats
    return durationToBpm(duration) / 60;
  }

  function inactiveFor(seconds) {
    var currentTime = new Date();
    return (currentTime - previousTime) > (seconds * 1000);
  }

  function shouldResetTapTempo() {
    // Returns whether we should start computing a new tempo or not.
    //
    // We consider that after the timeout has expired, the current tempo can be
    // discarded and we start computing a new tempo.
    var timeout = 3;  // timeout in seconds
    return previousTime === null || inactiveFor(3);
  }

  function computeTempo() {
    if (shouldResetTapTempo()) {
      tapTempoValueContainer.innerText = "---";
      previousTime = new Date();
      avg = RunningAverage();
    } else {
      var currentTime = new Date();
      var duration = (currentTime - previousTime);
      log("********************");
      log("Duration", duration / 1000, "seconds");
      var averageDuration = avg(duration);
      log("Average duration", averageDuration);
      log("Current BPM", durationToBpm(duration));
      var averageBPM = durationToBpm(averageDuration);
      log("Average BPM", averageBPM);
      var averageFrequency = durationToHz(averageDuration)
      log("Average frequency", averageFrequency);
      tapTempoValueContainer.innerText = parseInt(averageBPM);
      previousTime = currentTime;
      applyFrequency(averageFrequency);
      applyDuration(averageDuration);
    }
  }

  function applyFrequency(frequency) {
    if ($(".modulationTapTempoSync").checked) {
      modulationFrequencySlider.value = frequency;
      updateModulationFrequency();
    }
  }

  function applyDuration(duration) {
    if ($(".delayTapTempoSync").checked) {
      delayTimeSlider.value = duration / 1000;
      updateDelayTime();
    }
  }

  tapTempo = computeTempo;
  tapTempoButton.addEventListener("click", function(evt) {
    computeTempo();
  });

  window.addEventListener("keydown", function(evt) {
    var evt = evt || window.event;
    var keyCode = evt.which || evt.keyCode;
    if (!keyboardAllowed(evt)) { return; }
    if (keyCode === tapTempoKeyCode) {
      computeTempo();
    } else if (keyCode === delayFactorDownCode) {
      decreaseDelayFactor();
    } else if (keyCode === delayFactorUpCode) {
      increaseDelayFactor();
    }
  });
}


mainFrequencySlider.addEventListener("input", updateMainFrequency);
modulationFrequencySlider.addEventListener("input", updateModulationFrequency);
modulationAmplitudeSlider.addEventListener("input", updateModulationAmplitude);
$("input.delayCutoffFrequency").addEventListener("input", updateCutoff);
initEchoControls();
initVolume();
initPatches();
initValueTooltips();
bindSpaceBar();
bindButtons();
initTapTempo();

// AudioContext wont be available before generating initial sound
// So volume setup from initial volume slider wont be correct before initial sound is played
// and following event listener *might* fix that ...
ctx.addEventListener("statechange", function() {
  outputGain.gain.value = outputVolumeSlider.value / 2.0;
})

return {
  outputGain: outputGain,
  resume: function() { return ctx.resume(); },
  press: press,
  release: release,
  reset: reset,
  tap: function() { tapTempo(); },
  settings: function(open) { settingsOpen = open; reset(); },
  setSlider: function(name, value) {
    var input = $("input." + name);
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }
};

}());
});
