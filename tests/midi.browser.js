// Run with the Playwright browser_run_code tool (or invoke this function with a Playwright Page).
async function midiBrowserChecks(page) {
  const url = page.url();
  const context = await page.context().browser().newContext();
  page = await context.newPage();
  await page.goto(url);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const port = {id:'fake-lpd8',name:'LPD8',manufacturer:'Akai',state:'connected',open:async()=>{},onmidimessage:null};
    window.fakeMidi = {inputs:new Map([[port.id,port]]),onstatechange:null};
    window.sendMidi = data => port.onmidimessage?.({data});
    Object.defineProperty(navigator,'requestMIDIAccess',{value:async()=>window.fakeMidi,configurable:true});
  });
  await page.evaluate(()=>localStorage.clear());
  await page.reload(); await page.bringToFront();
  const check = (ok, label) => { if (!ok) throw new Error(label); };
  await page.getByRole('button',{name:'MIDI Settings',exact:true}).click();
  await page.getByRole('button',{name:'Enable MIDI',exact:true}).click();
  await page.locator('#midiDevice').selectOption('fake-lpd8');
  await page.getByRole('button',{name:'Learn Volume',exact:true}).click();
  await page.evaluate(()=>sendMidi([0xb0,7,127]));
  await page.waitForFunction(()=>document.querySelector('#midiNotice').textContent.includes('learned'));
  check(await page.locator('input.volume').inputValue() !== '1','Learn must not change slider');
  await page.getByRole('button',{name:'Learn Play (hold)',exact:true}).click();
  await page.evaluate(()=>sendMidi([0x90,36,100]));
  await page.getByRole('button',{name:'Back to Siren',exact:true}).click();
  await page.evaluate(()=>sendMidi([0xb0,7,127]));
  check(await page.locator('input.volume').inputValue()==='1','Mapped CC sets slider');
  await page.evaluate(()=>{
    window.oscillatorCounts = {started:0, stopped:0};
    const ctx = ZongoDubSiren.outputGain.context, create = ctx.createOscillator.bind(ctx);
    ctx.createOscillator = () => {
      const osc = create(), start = osc.start.bind(osc), stop = osc.stop.bind(osc);
      osc.start = (...args) => { oscillatorCounts.started++; return start(...args); };
      osc.stop = (...args) => { oscillatorCounts.stopped++; return stop(...args); };
      return osc;
    };
    sendMidi([0x80,36,0]);sendMidi([0x90,36,100]);
    ZongoDubSiren.press('test-key');
  });
  check(await page.evaluate(()=>oscillatorCounts.started)===2,'Play creates one oscillator pair');
  await page.evaluate(()=>sendMidi([0x80,36,0]));
  check(await page.evaluate(()=>oscillatorCounts.stopped)===0,'Other held source keeps playing');
  await page.getByRole('button',{name:'Reset',exact:true}).click();
  check(await page.evaluate(()=>oscillatorCounts.stopped)===2,'Reset stops oscillators');
  await page.getByRole('button',{name:'MIDI Settings',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#midiStorage').textContent.includes('saved'));
  await page.reload();
  await page.getByRole('button',{name:'MIDI Settings',exact:true}).click();
  check((await page.locator('#midiRows').textContent()).includes('CC 7'),'Bindings persist after reload');
  await page.getByRole('button',{name:'Enable MIDI',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#midiStatus').textContent.includes('Connected'));
  await page.getByRole('button',{name:'Learn Feedback',exact:true}).click();
  await page.evaluate(()=>sendMidi([0xb0,7,64]));
  check((await page.locator('#midiNotice').textContent()).includes('Removed assignment from Volume'),'Conflicting mapping moved');
  await page.evaluate(()=>{fakeMidi.inputs.clear();fakeMidi.onstatechange();});
  await page.waitForFunction(()=>document.querySelector('#midiStatus').textContent.includes('No MIDI inputs'));
  check(errors.length===0,errors.join('\n'));
  await context.close();
  return {checks:'learn, suppression, slider routing, hold/release, reset, reload persistence, reconnect, reassignment, disconnect',errors};
}
