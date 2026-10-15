"""G1 foundation browser gate: real Chromium/WebKit shell geometry, controls and adapters.
Dormant game HUD is NOT a completed six-screen redesign."""
from pathlib import Path
from urllib.request import urlopen
import subprocess,time

from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
SHOT=ROOT/'artifacts'/'g1-shell'
SHOT.mkdir(parents=True,exist_ok=True)
server=subprocess.Popen(['node','tools/dev-server.mjs'],cwd=ROOT,
                        stdout=subprocess.DEVNULL,stderr=subprocess.STDOUT)
try:
    for _ in range(60):
        try:
            with urlopen('http://127.0.0.1:4173/',timeout=1) as resp:
                assert resp.status==200
            break
        except Exception:
            time.sleep(.2)
    else:
        raise RuntimeError('HTTP server not started')
    with sync_playwright() as pw:
        for engine in [pw.chromium,pw.webkit]:
            browser=engine.launch(headless=True,args=['--no-sandbox'] if engine.name=='chromium' else [])
            for width,height in [(320,568),(390,844),(568,320),(844,390),(768,1024),(1440,900)]:
                mobile=width<1200
                ctx=browser.new_context(viewport={'width':width,'height':height},
                    device_scale_factor=1,is_mobile=mobile,has_touch=mobile)
                page=ctx.new_page()
                errors=[]
                page.on('pageerror',lambda error: errors.append(str(error)))
                page.goto('http://127.0.0.1:4173/',wait_until='domcontentloaded')
                page.wait_for_function('Boolean(window.__ANT_DEBUG__?.renovationAdapter)',timeout=25000)
                assert page.locator('#ui-renovation-root').is_hidden()
                assert page.locator('#game-canvas').is_visible()
                assert page.locator('#tool-inspect').is_visible()

                initial=page.evaluate('''() => {
                  const {renovationAdapter:a,renovationShell:s,game,ui}=__ANT_DEBUG__;
                  const v=a.view;
                  if(!v.military.squads || v.military.squads.length!==2)throw Error('missing A/B');
                  if(v.nursery.maxPopulation!==150)throw Error('wrong population cap');
                  if(s.getRegion('LAYER_NAV')!==null)throw Error('legacy second-layer slot');
                  const req=a.actions.requestWorldReset('BROWSER-G1');
                  if(!req.requiresConfirmation)throw Error('unsafe seed reset');
                  a.actions.cancelWorldReset();
                  if(a.actions.confirmWorldReset(req.token).ok)throw Error('cancelled reset allowed');
                  return {seed:game.world.seedLabel,layer:ui.game.layer,regions:Object.keys(s.regions)};
                }''')
                assert len(initial['regions'])==9

                data=page.evaluate('''() => {
                  const shell=__ANT_DEBUG__.renovationShell;
                  shell.preview(true);
                  // G1 alone uses a synthetic five-command rail; at G3 the
                  // actual Home rail is mounted, so never stack another row.
                  let rail=shell.getRegion('PRIMARY_COMMAND').querySelector('.ui-home-toolbar');
                  if(!rail){
                    rail=document.createElement('nav');rail.className='ui-command-grid';
                    for(const title of ['สำรวจ','ขุด','สร้าง','ใต้ดิน','เมนู']){
                      const b=document.createElement('button');
                      b.className='ui-feature-action';b.type='button';b.textContent=title;
                      rail.append(b);
                    }
                    shell.getRegion('PRIMARY_COMMAND').append(rail);
                  }
                  const rect=n=>{
                    const r=shell.getRegion(n).getBoundingClientRect();
                    return {x:r.x,y:r.y,width:r.width,height:r.height};
                  };
                  return {hud:rect('HUD_TOP'),cmd:rect('PRIMARY_COMMAND'),
                    map:rect('MAP_VIEWPORT'),inspector:rect('CONTEXT_INSPECTOR'),
                    buttons:[...rail.querySelectorAll('button')].map(b=>{
                      const r=b.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
                      return {x:r.x,y:r.y,w:r.width,h:r.height,hit:hit===b||b.contains(hit)};
                    })};
                }''')
                hud,cmd,world=data['hud'],data['cmd'],data['map']
                assert world['width']>100 and world['height']>90,(engine.name,width,height,world)
                assert hud['height']>=30 and cmd['width']>43,(engine.name,width,height,data)
                def crossing(a,b):
                    return a['x']<b['x']+b['width']-.1 and b['x']<a['x']+a['width']-.1 and a['y']<b['y']+b['height']-.1 and b['y']<a['y']+a['height']-.1
                assert not crossing(hud,cmd) and not crossing(world,cmd),(engine.name,width,height,data)
                for b in data['buttons']:
                    assert b['w']>=43.9 and b['h']>=43.9 and b['hit'],(engine.name,width,height,b)
                    assert b['x']>=-1 and b['y']>=-1 and b['x']+b['w']<=width+1 and b['y']+b['h']<=height+1,(width,height,b)

                # G1 reserved shell geometry, using real staged G3 rail when mounted.
                page.screenshot(path=str(SHOT/f'{engine.name}-{width}x{height}.png'),full_page=False)
                overlay=page.evaluate('''() => {
                  const {renovationShell:s}=__ANT_DEBUG__;
                  const slot=s.getRegion('PRIMARY_SHEET');
                  const panel=document.createElement('section');
                  panel.className='ui-feature-panel';panel.hidden=true;
                  slot.append(panel);
                  const opener=document.createElement('button');opener.textContent='open';
                  s.getRegion('PRIMARY_COMMAND').append(opener);
                  const unreg=s.overlay.registerPanel('g1-test',{element:panel,kind:'sheet'});
                  s.overlay.openPanel('g1-test',{opener});
                  const wasOpen=s.overlay.isOpen('g1-test')&&!panel.hidden;
                  document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
                  const closed=!s.overlay.isOpen('g1-test')&&panel.hidden;
                  unreg();panel.remove();opener.remove();s.preview(false);
                  return {wasOpen,closed,hidden:s.root.hidden};
                }''')
                assert all(overlay.values()),(engine.name,width,height,overlay)
                assert page.locator('#tool-inspect').is_visible()
                page.locator('#tool-dig').click()
                assert page.evaluate('__ANT_DEBUG__.ui.tool')=='dig'
                page.locator('#surface-button').click()
                assert page.evaluate('__ANT_DEBUG__.game.layer')=='surface'
                assert page.evaluate('__ANT_DEBUG__.ui.tool')=='inspect'
                page.locator('#underground-button').click()
                assert page.evaluate('__ANT_DEBUG__.game.layer')=='underground'
                assert not errors,(engine.name,width,height,errors)
                print(f'G1 PASS {engine.name} {width}x{height}: 5 hit targets, panel/ESC, view/actions, existing game')
                ctx.close()
            browser.close()
finally:
    server.terminate()
    try:server.wait(timeout=4)
    except subprocess.TimeoutExpired:server.kill()
