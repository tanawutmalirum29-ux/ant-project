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
CASES=[(320,480),(320,568),(360,640),(375,667),(390,600),(390,844),(430,932),
       (568,320),(667,375),(844,390),(768,650),(768,1024),(820,1180),
       (1024,600),(1024,768),(1280,720),(1440,900),(1920,1080)]
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
                        # Owner screenshot regression: each of the 14 real viewport
                        # sizes in BOTH browser engines must allow map-first room
                        # selection. The chooser REPLACES the editor visually.
                        page.locator('[data-home-action="room"]').click()
                        room_panel=page.locator('.ui05-root')
                        assert room_panel.is_visible()
                        editor=room_panel.bounding_box()
                        if w<=680 and w<h:
                            assert editor['width']<=min(300,w-16)+2
                            assert editor['height']<=min(h*.25,168)+2,(
                                engine.name,w,h,'editor still obscures the map',editor)
                        page.locator('.ui05-type-trigger').click()
                        picker=page.locator('.ui05-type-list:not([hidden])')
                        assert picker.is_visible()
                        geometry=page.evaluate("""() => {
                          const editor=document.querySelector('.ui05-root'),
                            list=document.querySelector('.ui05-type-list'),
                            r=list.getBoundingClientRect(),
                            body=document.querySelector('.ui05-body');
                          return {editorHidden:getComputedStyle(editor).visibility==='hidden',
                            editorBlocked:getComputedStyle(editor).pointerEvents==='none',
                            width:r.width,height:r.height,left:r.left,top:r.top,
                            bottom:r.bottom,right:r.right,clientHeight:list.clientHeight,
                            scrollHeight:list.scrollHeight,children:list.children.length,
                            columns:getComputedStyle(list).gridTemplateColumns.split(' ').length,
                            bodyScrollHeight:body.scrollHeight};
                        }""")
                        assert geometry['editorHidden'] and geometry['editorBlocked'],(
                            engine.name,w,h,'chooser still stacks above visible editor',geometry)
                        assert (geometry['top']>=-1 and geometry['bottom']<=h+1 and
                                geometry['left']>=-1 and geometry['right']<=w+1),(
                                engine.name,w,h,'room chooser offscreen',geometry)
                        if w<=680 and w<h:
                            assert geometry['height']<=min(148,h*.235)+2,(
                                engine.name,w,h,'chooser too tall for phone',geometry)
                            assert geometry['width']<=min(280,w-16)+2,(
                                engine.name,w,h,'chooser too wide for phone',geometry)
                            assert geometry['columns']==2,(engine.name,w,h,'not compact two-column chooser')
                        if h<=500 and w>h:
                            assert geometry['width']<=212 and geometry['height']<=176,(
                                engine.name,w,h,'short landscape chooser too large',geometry)
                        page.screenshot(path=str(OUT/f'room-compact-open-{engine.name}-{w}x{h}.png'))
                        picker.evaluate('(el)=>{el.scrollTop=el.scrollHeight;}')
                        last_choice=page.locator('.ui05-type-option').last
                        hit=last_choice.evaluate("""b=>{
                           const r=b.getBoundingClientRect(),x=r.left+r.width/2,
                             y=r.top+r.height/2,e=document.elementFromPoint(x,y);
                           return {x,y,ok:e===b||b.contains(e)};
                        }""")
                        assert hit['ok'],(engine.name,w,h,'bottom room not hit-testable',geometry,hit)
                        if w<1200: page.touchscreen.tap(hit['x'],hit['y'])
                        else:page.mouse.click(hit['x'],hit['y'])
                        assert picker.is_hidden(),(engine.name,w,h,'room type picker did not close')
                        assert room_panel.is_visible(),(engine.name,w,h,'room editor did not restore')
                        assert page.evaluate("""() => document.querySelector('#room-type').value ===
                          document.querySelector('.ui05-type-option:last-child').dataset.roomType""")
                        page.locator('[data-home-action="room"]').click()
                        assert room_panel.is_hidden()
                        data['compactRoomPicker']=geometry
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
                            # Repeat-tap is a toggle exactly like the legacy toolbar.
                            def tool_is(mode):
                                return page.evaluate('__ANT_DEBUG__.renovationAdapter.view.home.tool')==mode
                            page.locator('[data-home-action="dig"]').click()
                            assert tool_is('dig')
                            page.locator('[data-home-action="dig"]').click()
                            assert tool_is('inspect'),(engine.name,w,h,'repeat Dig did not return Inspect')
                            page.locator('[data-home-action="room"]').click()
                            assert tool_is('room') and page.locator('.ui05-root').is_visible()
                            # The room-type menu must escape the nested scroll panel:
                            # scroll to LAST option without Playwright auto-scroll and
                            # test the unforced centre hit point using actual pointer.
                            page.locator('.ui05-type-trigger').click()
                            picker=page.locator('.ui05-type-list:not([hidden])')
                            assert picker.is_visible()
                            assert picker.evaluate(
                                '(e)=>e.parentElement.dataset.uiRegion')=='PRIMARY_SHEET'
                            picker.evaluate('(e)=>{e.scrollTop=e.scrollHeight;}')
                            last=page.locator('.ui05-type-option').last
                            meta=page.evaluate("""() => {
                              const menu=document.querySelector('.ui05-type-list'),
                                last=menu.lastElementChild,r=last.getBoundingClientRect(),
                                panel=menu.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,
                                hit=document.elementFromPoint(x,y);
                              return {scrollTop:menu.scrollTop,scrollHeight:menu.scrollHeight,
                                clientHeight:menu.clientHeight,count:menu.children.length,
                                inViewport:panel.top>=-1&&panel.bottom<=innerHeight+1&&
                                  panel.left>=-1&&panel.right<=innerWidth+1,
                                lastHit:hit===last||last.contains(hit),x,y};
                            }""")
                            assert meta['count']>=2 and meta['inViewport'] and meta['lastHit'],(
                              engine.name,w,h,'last room option cannot be tapped',meta)
                            if w<1200: page.touchscreen.tap(meta['x'],meta['y'])
                            else: page.mouse.click(meta['x'],meta['y'])
                            assert page.evaluate("""() => document.querySelector('#room-type').value ===
                              document.querySelector('.ui05-type-option:last-child').dataset.roomType"""),(
                                engine.name,w,h,'last CSS room type did not reach game picker',meta)
                            page.locator('[data-home-action="room"]').click()
                            assert tool_is('inspect'),(engine.name,w,h,'repeat Room did not return Inspect')
                            assert page.locator('.ui05-root').is_hidden()
                            page.locator('[data-home-action="room"]').click()
                            assert tool_is('room') and page.locator('.ui05-root').is_visible()
                            data['roomPickerLastOption']=meta
                            page.locator('.ui05-collapse').click()
                            chip=page.locator('.ui05-root').bounding_box()
                            assert chip and chip['width']<=260,(engine.name,w,h,'collapsed room toolbar too wide',chip)
                            page.evaluate("""() => {
                              const d=__ANT_DEBUG__,g=d.game,q=g.colony.queen;
                              g.setSpeed(0);
                              const room={id:'layout-ready-nursery',type:'nursery',x:q.x-4,y:q.y,
                                width:2,height:2,status:'ready',connected:true,progress:65,
                                ticks:65,workerId:null,broodSlots:4,
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
