'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../assets/deck-template.html'),'utf8');
const source=html.split('// DUAL_SCREEN_START')[1].split('// DUAL_SCREEN_END')[0].split('\n').slice(1).join('\n');
const context=vm.createContext({});vm.runInContext(source,context);
const screen=(left,label)=>({left,top:0,width:1920,height:1080,availLeft:left,availTop:0,availWidth:1920,availHeight:1040,label});
function fixture(overrides={}){
 const origin=screen(0,'讲稿屏'),audience=screen(1920,'投影屏');
 const listeners=new Set();
 const details={screens:[origin,audience],currentScreen:origin,addEventListener:(name,fn)=>listeners.add(fn),removeEventListener:(name,fn)=>listeners.delete(fn)};
 const calls=[],updates=[];let popup=false,popupCount=0;
 const env={supported:true,secure:true,getScreens:async()=>{calls.push('permission');return details;},
  openPresenter:target=>{assert.equal(target,origin);calls.push('popup');if(!popup){popup=true;popupCount++;}return true;},
  showAudience:()=>calls.push('audience'),requestFullscreen:target=>{assert.equal(target,audience);calls.push('fullscreen');return Promise.resolve();},
  cancelFullscreen:()=>calls.push('cancelFullscreen'),disconnect:()=>calls.push('disconnect'),update:state=>updates.push(state),...overrides};
 const session=context.createDualScreenSession(env);
 return {origin,audience,details,listeners,calls,updates,env,session,emit:()=>[...listeners].forEach(fn=>fn()),get popupCount(){return popupCount;}};
}
(async()=>{
 // No API calls or popup until the explicit permission action.
 let f=fixture();assert.deepEqual(f.calls,[]);assert.equal(f.session.getState().phase,'idle');
 await f.session.discover();assert.equal(f.session.getState().phase,'ready');assert.equal(f.session.getState().selected,1);assert.deepEqual(f.calls,['permission']);assert.equal(f.session.select(0),false);
 const pending=f.session.launch();assert.deepEqual(f.calls,['permission','fullscreen','popup','audience']);await pending;assert.equal(f.session.getState().phase,'presenting');
 f.details.currentScreen=f.audience;f.session.stop();await f.session.launch();assert.equal(f.session.getState().current,f.origin);assert.equal(f.popupCount,1,'retry reuses the rendered presenter');
 f.session.dispose();assert.equal(f.listeners.size,0);
 for(const override of [{supported:false},{secure:false}]){f=fixture(override);await f.session.discover();assert.equal(f.session.getState().phase,'manual');assert.deepEqual(f.calls,[]);}
 for(const name of ['NotAllowedError','SecurityError']){f=fixture({getScreens:async()=>{throw {name,message:'denied'};}});await f.session.discover();assert.equal(f.session.getState().phase,'manual');assert.match(f.session.getState().message,/未获允许|安全策略/);assert.equal(f.popupCount,0);}
 f=fixture();f.details.screens=[f.origin];await f.session.discover();assert.equal(f.session.getState().phase,'manual');assert.match(f.session.getState().message,/镜像|单屏/);
 f=fixture();f.details.screens=[f.origin,{...f.origin,label:'镜像屏'}];await f.session.discover();assert.equal(f.session.getState().phase,'manual');
 f=fixture({openPresenter:()=>false});await f.session.discover();await f.session.launch();assert.equal(f.session.getState().phase,'ready');assert.match(f.session.getState().message,/弹窗被拦截/);assert.deepEqual(f.calls,['permission','fullscreen','cancelFullscreen','cancelFullscreen']);assert.ok(!f.calls.includes('audience'),'blocked popup must preserve the current page and steps');
 f=fixture({openPresenter:()=>false});let blockedFinish;f.env.requestFullscreen=()=>{f.calls.push('fullscreen');return new Promise(resolve=>blockedFinish=resolve);};await f.session.discover();const blocked=f.session.launch();assert.equal(f.session.getState().phase,'canceling');assert.ok(f.calls.includes('cancelFullscreen'));assert.ok(!f.calls.includes('audience'));await f.session.launch();assert.equal(f.calls.filter(x=>x==='fullscreen').length,1,'no overlapping launch while cancelling');blockedFinish();await blocked;assert.equal(f.session.getState().phase,'ready');assert.equal(f.calls.filter(x=>x==='cancelFullscreen').length,2,'exit any late fullscreen after blocked popup');
 f=fixture({requestFullscreen:()=>{throw {name:'NotSupportedError'};}});await f.session.discover();await f.session.launch();assert.equal(f.session.getState().phase,'retry');assert.equal(f.popupCount,0);assert.ok(!f.calls.includes('audience'));
 f=fixture({openPresenter:()=>false,requestFullscreen:()=>Promise.reject({name:'NotAllowedError'})});await f.session.discover();await f.session.launch();assert.equal(f.session.getState().phase,'ready');assert.equal(f.popupCount,0);
 f=fixture();let fail=true;f.env.requestFullscreen=()=>{f.calls.push('fullscreen');return fail?Promise.reject({name:'NotAllowedError'}):Promise.resolve();};await f.session.discover();await f.session.launch();assert.equal(f.session.getState().phase,'retry');assert.match(f.session.getState().message,/保留窗口内放映/);fail=false;await f.session.launch();assert.equal(f.session.getState().phase,'presenting');assert.equal(f.popupCount,1);
 f.details.screens=[f.origin];f.emit();assert.equal(f.session.getState().phase,'manual');assert.equal(f.calls.filter(x=>x==='disconnect').length,1);
 f=fixture();let finish;f.env.requestFullscreen=()=>new Promise(resolve=>finish=resolve);await f.session.discover();const launch=f.session.launch();assert.equal(f.session.getState().phase,'starting');f.details.screens=[f.origin];f.emit();finish();await launch;assert.equal(f.session.getState().phase,'manual');assert.ok(f.calls.includes('cancelFullscreen'),'late fullscreen success must not revive a disconnected session');
 f=fixture();let allow;f.env.getScreens=()=>new Promise(resolve=>allow=resolve);const discovery=f.session.discover();f.session.dispose();allow(f.details);await discovery;assert.equal(f.listeners.size,0);assert.equal(f.popupCount,0,'cancelled permission discovery cannot orphan a popup');
 f=fixture();let firstPermission;f.env.getScreens=()=>new Promise(resolve=>firstPermission=resolve);const firstDiscovery=f.session.discover();assert.equal(f.session.getState().phase,'loading');f.session.cancelDetection();assert.equal(f.session.getState().phase,'idle');f.env.getScreens=async()=>f.details;await f.session.discover();assert.equal(f.session.getState().phase,'ready');firstPermission(f.details);await firstDiscovery;assert.equal(f.session.getState().phase,'ready','late cancelled permission cannot overwrite the reopened session');assert.equal(f.popupCount,0);
 assert.match(html,/requestFullscreen\(\{screen\}\)/);assert.match(html,/id="present" title="从当前幻灯片开始放映"/);
 assert.equal((html.match(/data-interaction-hint/g)||[]).length,3);
 // Digit confirmation/expiry share cleanup of both the buffer and its prompt.
 assert.match(html,/function resetNumberJump\(\) \{ clearTimeout\(numberTimer\); numberBuffer=''; clearTimeout\(toastTimer\); \$\('toast'\)\.hidden=true;/);
 assert.match(html,/const n = Number\(numberBuffer\); resetNumberJump\(\)/);
 assert.match(html,/setTimeout\(resetNumberJump, 3000\)/);
 console.log('PASS: fullscreen-before-companion-popup ordering, secure/support/denial/single/mirror fallbacks, popup-blocked late-fullscreen cancellation, fullscreen retry, initiating-screen retention, disconnect and cancelled discovery; digit prompt and authored hints.');
})().catch(error=>{console.error(error);process.exitCode=1;});
