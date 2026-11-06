async function factoryPresetChecks(page) {
  const url=page.url(), results=[];
  const check=(ok,label)=>{if(!ok)throw new Error(label);};
  for(const native of [false,true]) {
    const context=await page.context().browser().newContext();const fixture=await context.newPage();
    if(native) await fixture.addInitScript(()=>{
      window.__TAURI__={core:{invoke:async(command,args)=>{
        if(command==='midi_load_settings')return JSON.parse(localStorage.getItem('testNativeFile')||'null');
        if(command==='midi_save_settings'){localStorage.setItem('testNativeFile',JSON.stringify(args.settings));return;}
        throw new Error(command);
      }}};
    });
    await fixture.goto(url);await fixture.waitForFunction(()=>!!window.ZongoDubSiren);
    const first=await fixture.evaluate(()=>JSON.parse(JSON.stringify(DubSettings.state)));
    check(Object.values(first.patchNames).join(',')==='Roots Sweep,Two Tone,Space Wobble,Laser Zaps','Named defaults');
    check(new Set(Object.values(first.patches).map(JSON.stringify)).size===4,'Four distinct sounds');
    for(const patch of Object.values(first.patches)) {
      check(!patch.modulationTapTempoSync && !patch.delayTapTempoSync,'Tempo sync disabled by default');
      check(patch.mainFrequency>patch.modulationAmplitude,'Frequency sweep stays positive');
      check(patch.delayFeedback<=0.5,'Moderate feedback');
    }
    for(let id=1;id<=4;id++) {
      await fixture.locator(`input[name=patch][value="${id}"]`).check();
      check(Number(await fixture.locator('input.mainFrequency').inputValue())===first.patches[id].mainFrequency,'Preset applies to UI');
    }
    await fixture.evaluate(async()=>{
      ZongoDubSiren.setSlider('mainFrequency',555);
      DubSettings.state.patchNames['4']='My own patch';
      await DubSettings.save();
    });
    await fixture.reload();await fixture.waitForFunction(()=>!!window.ZongoDubSiren);
    check(await fixture.locator('input.mainFrequency').inputValue()==='555','Existing custom sound not overwritten');
    check(await fixture.locator('.patch-name[data-patch="4"]').textContent()==='My own patch','Custom name not overwritten');
    if(!native) {
      const audio=await fixture.evaluate(async patches=>{
        const result=[];
        for(const [id,p] of Object.entries(patches)) {
          const ctx=new OfflineAudioContext(1,44100*3,44100);
          const carrier=ctx.createOscillator(),lfo=ctx.createOscillator(),depth=ctx.createGain(),echo=ctx.createDelay(2),feedback=ctx.createGain(),filter=ctx.createBiquadFilter(),out=ctx.createGain();
          carrier.type=p.mainOscillatorType;carrier.frequency.value=p.mainFrequency;
          lfo.type=p.modulationOscillatorType;lfo.frequency.value=p.modulationFrequency;
          depth.gain.value=p.modulationAmplitude;lfo.connect(depth);depth.connect(carrier.frequency);
          out.gain.value=0.4;carrier.connect(out);out.connect(ctx.destination);
          echo.delayTime.value=p.delayTime*Number(p.delayFactor);feedback.gain.value=p.delayFeedback;
          filter.frequency.setValueAtTime(p.delayCutoffFrequency,0);filter.frequency.linearRampToValueAtTime(p.delayCutoffFrequency-1000,2);
          carrier.connect(echo);echo.connect(filter);filter.connect(feedback);feedback.connect(out);feedback.connect(echo);
          carrier.start();lfo.start();carrier.stop(2);lfo.stop(2);
          const samples=(await ctx.startRendering()).getChannelData(0);
          let peak=0,sum=0;for(const sample of samples){if(!Number.isFinite(sample))throw new Error('Invalid audio');peak=Math.max(peak,Math.abs(sample));sum+=sample*sample;}
          result.push({id,peak,rms:Math.sqrt(sum/samples.length)});
        }return result;
      },first.patches);
      check(audio.every(p=>p.peak<1 && p.rms>0.02),'Audible, finite audio with headroom');
      results.push({audio});
    }
    results.push(native?'Fresh desktop (mocked bridge), persistence and existing profiles':'Fresh browser, persistence and existing profiles');
    await context.close();
  }
  return results;
}
