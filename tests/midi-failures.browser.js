async function midiFailureChecks(page) {
  const url = page.url();
  const context = await page.context().browser().newContext();
  page = await context.newPage();
  await page.goto(url);
  await page.addInitScript(() => {
    const port={id:'test',name:'Test input',manufacturer:'',state:'connected',open:async()=>{},onmidimessage:null};
    window.sendMidi = data => port.onmidimessage?.({data});
    Object.defineProperty(navigator,'requestMIDIAccess',{value:async()=>({inputs:new Map([['test',port]])}),configurable:true});
  });
  const check = (ok,label) => {if(!ok) throw new Error(label);};
  await page.evaluate(()=>localStorage.setItem('dubsiren:midi:v1','broken JSON'));
  await page.reload(); await page.bringToFront();
  await page.getByRole('button',{name:'MIDI Settings',exact:true}).click();
  check(await page.locator('#midiEnable').isDisabled(),'Corrupt settings block configuration');
  check(await page.evaluate(()=>localStorage.getItem('dubsiren:midi:v1'))==='broken JSON','Corrupt data preserved');
  await page.evaluate(()=>{window.confirm=()=>true;});
  await page.locator('#midiResetSettings').click();
  await page.waitForFunction(()=>document.querySelector('#midiEnable') && !document.querySelector('#midiEnable').disabled);
  if (!(await page.locator('#midiSettings').isVisible())) await page.locator('#midiSettingsButton').click();
  await page.locator('#midiEnable').click();
  await page.locator('#midiDevice').selectOption('test');
  await page.evaluate(()=>{
    window.realSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key,value) {if(key==='dubsiren:midi:v1') throw new Error('Simulated quota failure'); return realSetItem.call(this,key,value);};
  });
  await page.getByRole('button',{name:'Learn Volume',exact:true}).click();
  await page.evaluate(()=>sendMidi([0xb0,7,100]));
  await page.locator('#midiRetry').waitFor({state:'visible'});
  check((await page.locator('#midiRows').textContent()).includes('CC 7'),'Failed save retains mapping in memory');
  await page.evaluate(()=>{Storage.prototype.setItem = realSetItem;});
  await page.locator('#midiRetry').click();
  await page.waitForFunction(()=>document.querySelector('#midiStorage').textContent.includes('saved'));
  await page.evaluate(()=>{
    for (const [title,number] of [['Carrier frequency',1],['LFO frequency',2],['Feedback',3]]) {
      document.querySelector(`[aria-label="Learn ${title}"]`).click(); sendMidi([0xb0,number,64]);
    }
  });
  await page.waitForFunction(()=>document.querySelector('#midiStorage').textContent.includes('saved'));
  const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('dubsiren:midi:v1')));
  check(Object.keys(stored.devices.test.bindings).length===4,'Serialized rapid saves preserve latest settings');
  await page.reload();
  await page.getByRole('button',{name:'MIDI Settings',exact:true}).click();
  await page.evaluate(()=>Object.defineProperty(navigator,'requestMIDIAccess',{value:async()=>{throw new Error('Permission denied');},configurable:true}));
  await page.locator('#midiEnable').click();
  await page.waitForFunction(()=>document.querySelector('#midiStatus').textContent.includes('Permission denied'));
  check(!(await page.locator('#midiEnable').isDisabled()),'Permission denial permits retry');
  await context.close();
  return {checks:'corrupt storage preserved, explicit reset, failed save, retry, rapid saves, permission denial'};
}
