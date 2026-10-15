"""G3 Engineer A real-game integration QA; Chromium+WebKit and responsive pointers.
Old HUD stays active in production; browser adds a temporary TEST-ONLY style to
isolate future shell for honest geometry and interaction evidence."""
from pathlib import Path
from urllib.request import urlopen
import subprocess,time
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
SHOTS=ROOT/'artifacts'/'g3-engineer-a'
SHOTS.mkdir(parents=True,exist_ok=True)
server=subprocess.Popen(['node','tools/dev-server.mjs'],cwd=ROOT,
                        stdout=subprocess.DEVNULL,stderr=subprocess.STDOUT)
try:
    for _ in range(70):
        try:
            with urlopen('http://127.0.0.1:4173/',timeout=1) as reply:
                assert reply.status==200
            break
        except Exception:
            time.sleep(.2)
    else: raise RuntimeError('server failed')
    with sync_playwright() as pw:
        for engine in [pw.chromium,pw.webkit]:
            browser=engine.launch(headless=True,
                args=['--no-sandbox'] if engine.name=='chromium' else [])
            for w,h in [(320,568),(390,844),(568,320),(844,390),(768,1024),(1440,900)]:
                mobile=w<1200
                ctx=browser.new_context(viewport={'width':w,'height':h},
                    device_scale_factor=1,is_mobile=mobile,has_touch=mobile)
                page=ctx.new_page()
                errs=[]
                page.on('pageerror',lambda e: errs.append(str(e)))
                page.goto('http://127.0.0.1:4173/',wait_until='domcontentloaded')
                page.wait_for_timeout(500)
                if errs: print('G3-A startup browser errors:',repr(errs),flush=True)
                page.wait_for_function('Boolean(window.__ANT_DEBUG__?.renovationA)',timeout=25000)
                assert page.locator('#ui-renovation-root').is_hidden(),(engine.name,w,'premature live rollout')
                assert page.locator('#game-canvas').is_visible()
                assert page.evaluate('''() => {
                    const d=window.__ANT_DEBUG__;
                    return d.renovationA.mounted.length===4 &&
                      d.renovationShell.overlay.registry.has('home-menu') &&
                      d.renovationShell.overlay.registry.has('settings');
                }'''),(engine.name,w,'module mount missing')

                # Legacy HUD isolation applies ONLY inside this ephemeral browser test.
                page.add_style_tag(content='''body #app > .topbar,
                    body #app > .left-overlay, body #app > .dig-tools,
                    body #app > .right-controls,body #app > .bottom-bar,
                    body #app > .colony-panel,body #app > .selection-card,
                    body #app > .nursery-panel,body #app > .milestones-toggle,
                    body #app > .milestones-panel,body #u6-dock,
                    body #app > .debug-panel {display:none!important;}''')
                page.evaluate('__ANT_DEBUG__.renovationShell.preview(true)')
                assert page.locator('#ui-renovation-root').is_visible()
                assert page.locator('.ui-home-toolbar .ui-home-action').count()==5
                assert page.locator('.ui-renovation-slot[data-ui-region="PRIMARY_COMMAND"] .ui-home-action[data-home-action="layer"]').count()==1
                assert page.locator('.ui-home-hud').is_visible()
                geometry=page.evaluate('''() => {
                    const shell=__ANT_DEBUG__.renovationShell,nav=document.querySelector('.ui-home-toolbar');
                    const bounds=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};};
                    const hud=bounds(shell.getRegion('HUD_TOP')),map=bounds(shell.getRegion('MAP_VIEWPORT'));
                    const cmd=bounds(shell.getRegion('PRIMARY_COMMAND'));
                    const controls=[...nav.querySelectorAll('button')].map(b=>{
                       const r=b.getBoundingClientRect();
                       const top=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
                       return {id:b.dataset.homeAction,...bounds(b),hit:top===b||b.contains(top)};
                    });
                    return {hud,map,cmd,controls};
                }''')
                assert geometry['map']['w']>100 and geometry['map']['h']>80,(engine.name,w,h,geometry)
                for b in geometry['controls']:
                    assert b['w']>=43.9 and b['h']>=43.9 and b['hit'],(engine.name,w,h,b)
                    assert b['x']>=-1 and b['y']>=-1 and b['x']+b['w']<=w+1 and b['y']+b['h']<=h+1,(engine.name,w,h,b)
                layer=page.locator('.ui-home-action[data-home-action="layer"]')
                for _ in range(20):
                    before=page.evaluate('__ANT_DEBUG__.game.layer')
                    layer.click()
                    assert page.evaluate('__ANT_DEBUG__.game.layer')!=before,(engine.name,w,'layer flip')
                    assert page.evaluate('''() => {
                      const d=__ANT_DEBUG__;
                      return d.renovationShell.overlay.mode===
                        (d.combatControls?.targeting?'rally':d.ui.tool);
                    }'''),(engine.name,w,'tool mode desynchronized')
                assert page.evaluate('__ANT_DEBUG__.game.layer')=='underground'
                page.locator('[data-home-action="dig"]').click()
                assert page.evaluate('__ANT_DEBUG__.ui.tool')=='dig'
                layer.click()
                assert page.evaluate('__ANT_DEBUG__.ui.tool')=='inspect'
                assert not page.locator('[data-home-action="dig"]').is_enabled()
                layer.click()

                page.screenshot(path=str(SHOTS/f'{engine.name}-{w}x{h}-hud.png'))
                menu=page.locator('[data-home-action="menu"]')
                menu.click()
                assert page.locator('.ui-home-menu').is_visible()
                assert page.locator('.ui-renovation-backdrop').is_visible()
                assert menu.get_attribute('aria-expanded')=='true'
                page.screenshot(path=str(SHOTS/f'{engine.name}-{w}x{h}-menu.png'))
                # Actual outside click goes to shell-owned blocker, not map.
                pbox=page.locator('.ui-renovation-backdrop').bounding_box()
                page.locator('.ui-renovation-backdrop').click(position={'x':2,'y':h/2})
                assert not page.locator('.ui-home-menu').is_visible()
                assert page.evaluate('__ANT_DEBUG__.ui.selection') is None
                menu.click()
                page.get_by_role('button',name='ตั้งค่าและ Seed').click()
                assert page.locator('.ui-settings-sheet').is_visible()
                assert not page.locator('.ui-home-menu').is_visible()
                assert page.locator('.ui-renovation-backdrop').is_visible()
                page.screenshot(path=str(SHOTS/f'{engine.name}-{w}x{h}-settings.png'))

                seed_input=page.locator('#ui-settings-seed-input')
                seed_input.fill('   ')
                page.get_by_role('button',name='สร้างโลกใหม่…').click()
                assert 'กรุณา' in page.locator('.ui-settings-sheet .ui-settings-error').inner_text()
                assert not page.locator('.ui-settings-confirm').evaluate('(e)=>e.open')
                original=page.evaluate('__ANT_DEBUG__.game.world.seedLabel')
                intended=f'G3-{engine.name}-{w}'
                seed_input.fill(intended)
                page.get_by_role('button',name='สร้างโลกใหม่…').click()
                assert page.locator('.ui-settings-confirm').evaluate('(e)=>e.open')
                assert page.evaluate('__ANT_DEBUG__.game.world.seedLabel')==original
                dialog=page.locator('.ui-settings-confirm').bounding_box()
                assert dialog and dialog['x']>=-1 and dialog['y']>=-1
                assert dialog['x']+dialog['width']<=w+1 and dialog['y']+dialog['height']<=h+1,(engine.name,w,h,dialog)
                page.screenshot(path=str(SHOTS/f'{engine.name}-{w}x{h}-confirm.png'))
                page.get_by_role('button',name='กลับไปแก้ไข').click()
                assert page.locator('.ui-settings-sheet').is_visible()
                assert seed_input.input_value()==intended
                assert page.evaluate('__ANT_DEBUG__.game.world.seedLabel')==original
                assert page.evaluate('document.activeElement?.id')=='ui-settings-seed-input',(engine.name,w,'focus restore')
                page.get_by_role('button',name='สร้างโลกใหม่…').click()
                assert page.locator('.ui-settings-confirm').evaluate('(e)=>e.open')
                page.get_by_role('button',name='ยืนยันสร้างโลกใหม่').click()
                assert page.evaluate('__ANT_DEBUG__.game.world.seedLabel')==intended
                assert not page.locator('.ui-settings-confirm').evaluate('(e)=>e.open')
                assert not page.locator('.ui-settings-sheet').is_visible()
                assert page.evaluate('''() => __ANT_DEBUG__.renovationAdapter.pendingReset''') is None
                assert page.evaluate('''() => __ANT_DEBUG__.game.population''')==6
                assert page.evaluate('''() => __ANT_DEBUG__.ui.tool''')=='inspect'
                assert 'Seed: '+intended in page.locator('.ui-home-seed').inner_text()
                # Coordinator G3-B: real buttons/overlay navigation against the
                # full game, not a synthetic DOM or a re-created facade.
                assert page.evaluate('''() => {
                    const d=__ANT_DEBUG__;
                    return d.renovationB?.mounted?.join(',')==='military,ants' &&
                        d.renovationShell.overlay.registry.has('ui02-military') &&
                        d.renovationShell.overlay.registry.has('ui03-ants');
                }'''),(engine.name,w,'B modules not mounted')
                menu.click()
                page.get_by_role('button',name='มดในอาณาจักร').click()
                assert page.locator('.uiv1-a').is_visible(),(engine.name,w,'ant panel missing')
                assert page.locator('.uiv1-a-unit').count()>=5,(engine.name,w,'ant roster empty')
                assert page.locator('.ui-home-menu').is_hidden()
                page.screenshot(path=str(SHOTS/f'{engine.name}-{w}x{h}-ants.png'))
                page.locator('.uiv1-a-head button').click()
                assert page.locator('.uiv1-a').is_hidden()
                menu.click()
                page.get_by_role('button',name='กองทหาร A/B').click()
                assert page.locator('.uiv1-b').is_visible(),(engine.name,w,'military panel missing')
                assert page.locator('.uiv1-b-tabs button').count()==2
                assert page.locator('.ui-home-menu').is_hidden()
                page.screenshot(path=str(SHOTS/f'{engine.name}-{w}x{h}-military.png'))
                page.locator('.uiv1-b-head button').click()
                assert page.locator('.uiv1-b').is_hidden()
                assert not errs,(engine.name,w,h,errs)
                print(f'G3-A PASS {engine.name} {w}x{h}: 5 true hit targets, layer 20x, sheets, outside click, Seed cancel+confirm, no JS errors')
                ctx.close()
            browser.close()
finally:
    server.terminate()
    try:server.wait(timeout=4)
    except subprocess.TimeoutExpired:server.kill()
