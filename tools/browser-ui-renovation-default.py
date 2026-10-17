"""Post-cutover browser smoke for shipped default URL and explicit legacy rollback.
Independent device touch/multi-egg/combat acceptance is NOT certified by this smoke.
"""
import json, os, subprocess, time
from pathlib import Path
from urllib.request import urlopen
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'artifacts'/'ui-default'
OUT.mkdir(parents=True,exist_ok=True)
CASES=[(320,568),(360,640),(375,667),(390,844),(430,932),
       (568,320),(667,375),(844,390),(768,1024),(820,1180),
       (1024,768),(1280,720),(1440,900),(1920,1080)]
DETAIL_CASES={(320,568),(390,844),(568,320),(844,390),(768,1024),(1440,900)}
LOG=[]

def audit(page, engine, w, h):
    result=page.evaluate("""()=>{
      const shell=document.querySelector('#ui-renovation-root');
      const keys=[...document.querySelectorAll('.ui-home-toolbar [data-home-action]')];
      const viewport={width:innerWidth,height:innerHeight};
      const checks=keys.map(b=>{
        const r=b.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
        const hit=document.elementFromPoint(x,y);
        return {action:b.dataset.homeAction,x:r.x,y:r.y,width:r.width,height:r.height,
          inBounds:r.x>=-1&&r.y>=-1&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1,
          hit:hit===b||b.contains(hit),visible:getComputedStyle(b).visibility!=='hidden'};
      });
      return {shellVisible:!!shell&&!shell.hidden,
        shellRoot:document.querySelector('#app')?.dataset.uiRenovationQa,
        legacyTopbarHidden:getComputedStyle(document.querySelector('.topbar')).display==='none',
        legacyDockHidden:getComputedStyle(document.querySelector('#u6-dock')).display==='none',
        toolbarCount:keys.length,layerButtons:keys.filter(b=>b.dataset.homeAction==='layer').length,
        viewport,horizontalOverflow:document.documentElement.scrollWidth-innerWidth,checks};
    }""")
    assert result['shellVisible'] and result['shellRoot']=='true',(engine,w,h,'new UI NOT default',result)
    assert result['legacyTopbarHidden'] and result['legacyDockHidden'],(engine,w,h,'legacy overlaps',result)
    assert result['toolbarCount']==5 and result['layerButtons']==1,(engine,w,h,'toolbar layout',result)
    assert result['horizontalOverflow']<=1,(engine,w,h,'horizontal overflow',result)
    for b in result['checks']:
        assert b['width']>=43.5 and b['height']>=43.5 and b['inBounds'] and b['hit'] and b['visible'],(
          engine,w,h,'untappable toolbar action',b)
    return result

def open_menu(page, label):
    page.locator('.ui-home-toolbar [data-home-action="menu"]').click()
    assert page.locator('.ui-home-menu').is_visible()
    page.get_by_role('button',name=label,exact=True).click()

def main():
    server=subprocess.Popen(['node','tools/dev-server.mjs'],cwd=ROOT,stdout=subprocess.DEVNULL,
                            stderr=subprocess.STDOUT)
    try:
        for _ in range(80):
            try:
                with urlopen('http://127.0.0.1:4173/',timeout=1) as r: assert r.status==200
                break
            except Exception:time.sleep(.25)
        else: raise RuntimeError('UI default smoke dev server unavailable')
        with sync_playwright() as p:
            for engine in [p.chromium,p.webkit]:
                browser=engine.launch(headless=True,args=['--no-sandbox'] if engine.name=='chromium' else [])
                for w,h in CASES:
                    ctx=browser.new_context(viewport={'width':w,'height':h},
                        device_scale_factor=1,is_mobile=w<1200,has_touch=w<1200)
                    page=ctx.new_page()
                    errs=[]
                    page.on('pageerror',lambda err:errs.append(str(err)))
                    try:
                        page.goto('http://127.0.0.1:4173/',wait_until='domcontentloaded')
                        page.wait_for_function("Boolean(window.__ANT_DEBUG__?.renovationShell)",timeout=25000)
                        # Module-ready alone is not first paint. Require textured
                        # real terrain, especially on slow WebKit 320px startup.
                        page.wait_for_function("""() => {
                          const canvas=document.getElementById('game-canvas');
                          if(!canvas||canvas.width<100||canvas.height<100)return false;
                          const ctx=canvas.getContext('2d'),keys=new Set();
                          for(let y=1;y<=8;y++)for(let x=1;x<=12;x++){
                            const px=ctx.getImageData(Math.floor(canvas.width*x/13),
                              Math.floor(canvas.height*y/9),1,1).data;
                            keys.add(px[0]+','+px[1]+','+px[2]);
                          }
                          return keys.size>=5;
                        }""",timeout=20000)
                        data=audit(page,engine.name,w,h)
                        path=f'default-{engine.name}-{w}x{h}.png'
                        page.screenshot(path=str(OUT/path))
                        data.update({'engine':engine.name,'width':w,'height':h,'screenshot':path})
                        assert not errs,(engine.name,w,h,'startup JS errors',errs)
                        # Real clickable management sheets in six critical profiles.
                        if (w,h) in DETAIL_CASES:
                            open_menu(page,'มดในอาณาจักร')
                            assert page.locator('.uiv1-a').is_visible()
                            page.locator('.uiv1-a [data-a-action="close"]').click()
                            open_menu(page,'กองทหาร A/B')
                            assert page.locator('.uiv1-b').is_visible()
                            page.locator('.uiv1-b [data-b-action="close"]').click()
                            open_menu(page,'ตั้งค่าและ Seed')
                            assert page.locator('.ui-settings-sheet').is_visible()
                            page.locator('.ui-settings-close').click()
                            assert page.locator('.ui-settings-sheet').is_hidden()
                            # Owner visual QA regression: collapsed room panel must
                            # never compete with an opened Nursery. A READY Nursery
                            # is injected ONLY for view geometry, not gameplay proof.
                            page.locator('[data-home-action="room"]').click()
                            assert page.locator('.ui05-root').is_visible()
                            page.locator('.ui05-collapse').click()
                            chip=page.locator('.ui05-root').bounding_box()
                            assert chip and chip['width']<=260,(engine.name,w,h,'collapsed room toolbar too wide',chip)
                            page.evaluate("""() => {
                              const d=__ANT_DEBUG__,g=d.game,q=g.colony.queen;
                              g.setSpeed(0);
                              const room={id:'layout-ready-nursery',type:'nursery',x:q.x-4,y:q.y,
                                width:3,height:3,status:'ready',connected:true,progress:65,
                                ticks:65,workerId:null,broodSlots:9,
                                stock:{carbs:0,protein:0,water:0},cost:{carbs:3,protein:2},
                                capacity:{}};
                              g.rooms.rooms.push(room);g.rooms.updateConnectivity();
                              if(!room.connected||room.status!=='ready')
                                throw Error('geometry fixture Nursery became disconnected');
                              d.ui.select({layer:'underground',x:room.x,y:room.y});
                              d.renovationAdapter.notify();
                            }""")
                            if not page.locator('.ui04-sheet').is_visible():
                                page.locator('.ui04-reopen').click()
                            assert page.locator('.ui04-sheet').is_visible()
                            layout=page.evaluate("""() => {
                              const sheet=document.querySelector('.ui04-sheet'),
                                close=document.querySelector('.ui04-close'),
                                room=document.querySelector('.ui05-root'),
                                backdrop=document.querySelector('.ui-renovation-backdrop');
                              const r=sheet.getBoundingClientRect(),c=close.getBoundingClientRect();
                              const hit=document.elementFromPoint(c.x+c.width/2,c.y+c.height/2);
                              return {x:r.x,y:r.y,width:r.width,height:r.height,
                                closeHit:hit===close||close.contains(hit),
                                panelHidden:getComputedStyle(room).display==='none',
                                backdropColor:getComputedStyle(backdrop).backgroundColor};
                            }""")
                            assert layout['closeHit'] and layout['panelHidden'],(
                                engine.name,w,h,'Nursery hides room panel or close not tappable',layout)
                            assert layout['x']>=-1 and layout['y']>=-1 and (
                                layout['x']+layout['width']<=w+1 and
                                layout['y']+layout['height']<=h+1),(engine.name,w,h,'Nursery out of view',layout)
                            if w>=681 and h>500:
                                assert layout['height']<h*.82,(engine.name,w,h,'Nursery still full height',layout)
                            page.screenshot(path=str(OUT/f'nursery-compact-{engine.name}-{w}x{h}.png'))
                            page.locator('.ui04-level-picker .ui04-picker-trigger').click()
                            choices=page.locator('.ui04-level-picker .ui04-picker-menu:not([hidden]) [data-value]')
                            assert choices.count()==5,(engine.name,w,h,'level choices absent')
                            grid=page.locator('.ui04-level-picker .ui04-picker-menu').evaluate(
                                '(e)=>getComputedStyle(e).gridTemplateColumns.split(" ").length')
                            assert grid==5,(engine.name,w,h,'level choices not 5-wide grid',grid)
                            choices.nth(1).click()
                            assert 'Lv.2' in page.locator(
                                '.ui04-level-picker .ui04-picker-trigger').inner_text()
                            page.locator('.ui04-close').click()
                            assert page.locator('.ui04-sheet').is_hidden()
                            assert page.locator('.ui05-root').is_visible(),(
                                engine.name,w,h,'room panel not restored after Nursery')
                            data['nurseryLayout']=layout
                            assert not errs,(engine.name,w,h,'management JS errors',errs)
                            data['domainMenuOpenClose']=True
                        LOG.append(data)
                        print('DEFAULT PASS',engine.name,w,h,flush=True)
                    finally:ctx.close()

                # Legacy rollback is an actual URL, not a CSS mock.
                for w,h in [(320,568),(568,320),(390,844),(844,390),(1440,900)]:
                    ctx=browser.new_context(viewport={'width':w,'height':h},device_scale_factor=1,
                                            is_mobile=w<1200,has_touch=w<1200)
                    page=ctx.new_page()
                    try:
                        page.goto('http://127.0.0.1:4173/?ui=legacy',wait_until='domcontentloaded')
                        page.wait_for_function("Boolean(window.__ANT_DEBUG__?.game)",timeout=25000)
                        assert page.locator('#ui-renovation-root').is_hidden()
                        assert page.locator('#u6-dock').is_visible()
                        assert page.locator('#tool-inspect').is_visible()
                        assert page.evaluate("document.body.dataset.uiRenovationQa") is None
                        path=f'legacy-{engine.name}-{w}x{h}.png'
                        page.screenshot(path=str(OUT/path))
                        LOG.append({'engine':engine.name,'legacy':[w,h],'screenshot':path})
                        print('ROLLBACK PASS',engine.name,w,h,flush=True)
                    finally:ctx.close()
                browser.close()
    finally:
        (OUT/'evidence.json').write_text(json.dumps({'source':os.getenv('GITHUB_SHA','local'),
            'scope':'new default URL launch and legacy rollback, 14 viewports x Chromium/WebKit',
            'events':LOG},ensure_ascii=False,indent=2))
        server.terminate()
        try:server.wait(timeout=5)
        except subprocess.TimeoutExpired:server.kill()

if __name__=='__main__':main()
