async function desktopSettingsChecks(page) {
  const url=page.url(), context=await page.context().browser().newContext();page=await context.newPage();
  await page.addInitScript(()=>{
    if(!localStorage.getItem('fakeDesktopFile')) {
      localStorage.setItem('fakeDesktopFile',JSON.stringify({version:1,selected:null,devices:{}}));
      localStorage.setItem('patch:current','3');localStorage.setItem('patch:3:mainFrequency','733');
      localStorage.setItem('patch:3:volume','0.99');localStorage.setItem('input:volume','0.31');
      localStorage.setItem('patch:2:mainFrequency','610');
    }
    window.__TAURI__={core:{invoke:async(command,args)=>{
      if(command==='midi_load_settings')return JSON.parse(localStorage.getItem('fakeDesktopFile'));
      if(command==='midi_save_settings'){await new Promise(resolve=>setTimeout(resolve,10));localStorage.setItem('fakeDesktopFile',JSON.stringify(args.settings,null,2));return;}
      throw new Error('Unexpected command '+command);
    }}};
  });
  await page.goto(url);const ready=()=>page.waitForFunction(()=>!!window.ZongoDubSiren && !!document.querySelector('#midiRows tr'));await ready();
  const check=(ok,label)=>{if(!ok)throw new Error(label);};
  check(await page.locator('input.mainFrequency').inputValue()==='733','Legacy desktop patch migrated');
  check(await page.locator('input.volume').inputValue()==='0.31','Legacy patch volume does not override global');
  await page.locator('.patch-name[data-patch="3"]').click();
  await page.locator('.patch-name-input[data-patch="3"]').fill('Dub bounce');
  await page.locator('.patch-name-input[data-patch="3"]').press('Enter');
  await page.evaluate(async()=>{
    ZongoDubSiren.setSlider('mainFrequency',744);
    const midi={version:1,selected:null,devices:{}};
    const saving=DubSettings.saveMidi(midi);
    ZongoDubSiren.setSlider('volume',0.44);
    ZongoDubSiren.setSlider('delayFeedback',0.72);
    await saving;await DubSettings.save();
  });
  const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('fakeDesktopFile')));
  check(stored.patchNames['3']==='Dub bounce','Name stored in shared desktop file');
  check(stored.version===2 && stored.midi.version===1,'Shared versioned human readable JSON');
  check(stored.volume===0.44 && stored.patches['3'].mainFrequency===744 && stored.patches['3'].delayFeedback===0.72,'Concurrent MIDI and sound saves retain all values');
  check(!Object.hasOwn(stored.patches['3'],'volume'),'No patch-specific volume in file');
  check(stored.patches['2'].mainFrequency===610,'Other legacy profiles retained');
  await page.reload();await ready();
  check(await page.locator('input.mainFrequency').inputValue()==='744','Desktop profile restored from shared file');
  check(await page.locator('input.volume').inputValue()==='0.44','Desktop global volume restored');
  check(await page.locator('.patch-name[data-patch="3"]').textContent()==='Dub bounce','Desktop patch name restored');
  await context.close();return {checks:'legacy migration, shared document, concurrent MIDI/sound saves, desktop bridge reload (mocked)'};
}
