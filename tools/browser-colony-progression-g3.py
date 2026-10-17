"""CP G3 candidate evidence: authentic served Game + UI pointer tests in Chromium and WebKit.
Independent QA #164 must review evidence AND do its own QA; this runner is not its signoff.
Any injected research stock is labeled as a synthetic physical-room fixture.
"""
from pathlib import Path
from urllib.request import urlopen
import json, subprocess, time, traceback

from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
ARTIFACTS=ROOT/'artifacts'/'colony-progression-g3'
ARTIFACTS.mkdir(parents=True,exist_ok=True)
SIZES=[(320,568),(390,844),(568,320),(844,390),(768,1024),(1440,900)]
URL='http://127.0.0.1:4173/'

def rect(page,selector):
    return page.locator(selector).first.evaluate("""e=>{
      const b=e.getBoundingClientRect();const p=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);
      return {x:b.x,y:b.y,width:b.width,height:b.height,
        centerHits:p===e||e.contains(p),hidden:e.hidden,
        visible:getComputedStyle(e).display!=='none'};
    }""")

def run_pair(browser,engine,width,height):
    name=f'{engine}-{width}x{height}'
    mobile=width<1200
    ctx=browser.new_context(viewport={'width':width,'height':height},
        device_scale_factor=1,is_mobile=mobile,has_touch=mobile)
    page=ctx.new_page()
    errors=[]
    page.on('pageerror', lambda e:errors.append(str(e)))
    try:
        page.goto(URL+'?ui=renovation&seed=CP-G3-'+str(width),wait_until='domcontentloaded')
        page.wait_for_function('Boolean(window.__ANT_DEBUG__?.renovationResearch)',timeout=20000)
        assert page.locator('#ui-renovation-root').is_visible(),name
        menu=page.locator('[data-home-action="menu"]')
        assert menu.count()==1 and menu.is_visible(),name
        bounds={'menu':rect(page,'[data-home-action="menu"]'),
          'map':rect(page,'#game-canvas'),
          'viewport':page.evaluate("""()=>({width:innerWidth,height:innerHeight,
            visualWidth:visualViewport?.width,visualHeight:visualViewport?.height,
            docWidth:document.documentElement.scrollWidth})""")}
        assert bounds['menu']['width']>=43.9 and bounds['menu']['height']>=43.9,name
        assert bounds['menu']['centerHits'],(name,bounds['menu'])
        menu.click()
        page.locator('.ui-home-menu-button',has_text='วิจัย').click()
        sheet=page.locator('.ui-research-sheet:not([hidden])')
        assert sheet.count()==1,name
        cards=page.locator('.ui-research-card')
        assert cards.count()==6,(name,cards.count())
        bounds['sheet']=rect(page,'.ui-research-sheet:not([hidden])')
        bounds['close']=rect(page,'.ui-research-sheet:not([hidden]) .ui-research-close')
        assert bounds['close']['width']>=43.9 and bounds['close']['height']>=43.9,name
        assert bounds['close']['centerHits'],(name,bounds['close'])
        assert bounds['sheet']['width']<=width+1 and bounds['sheet']['height']<=height-44,(name,bounds['sheet'])
        assert bounds['viewport']['docWidth']<=width+1,(name,'horizontal overflow',bounds)
        last=page.locator('.ui-research-card[data-tech-id="soldier_armor"] .ui-research-trigger')
        last.scroll_into_view_if_needed()
        assert last.is_visible(),name
        last.click()
        assert last.get_attribute('aria-expanded')=='true',name
        bounds['sixth']=rect(page,'.ui-research-card[data-tech-id="soldier_armor"] .ui-research-trigger')
        assert bounds['sixth']['height']>=43.9 and bounds['sixth']['centerHits'],(name,bounds['sixth'])
        sheet.screenshot(path=str(ARTIFACTS/f'{name}-research.png'))
        # Fixture is injected ONLY through mirrored stock into real physical queen depot.
        # The actual starting/canceling is accomplished via user-visible controls.
        page.evaluate("""()=>{
          const {game,renovationAdapter:a}=__ANT_DEBUG__;
          game.setSpeed(0);
          Object.assign(game.foraging.inventory,{carbs:16,protein:14,water:12});
          game.rooms.syncInventory();
          a.notify();
        }""")
        first=page.locator('.ui-research-card[data-tech-id="foraging_routes"]')
        first.locator('.ui-research-trigger').click()
        start=first.locator('.ui-research-start')
        assert start.is_enabled(),name
        start.click()
        assert page.evaluate('__ANT_DEBUG__.game.research.snapshot().active') is None,name
        first.locator('.ui-research-primary').click()
        active=page.evaluate("""()=>({
          active:__ANT_DEBUG__.game.research.snapshot().active,
          stock:{...__ANT_DEBUG__.game.foraging.inventory},
          held:{...__ANT_DEBUG__.game.research.held}
        })""")
        assert active['active']['techId']=='foraging_routes',name
        assert active['stock']=={'carbs':10,'protein':10,'water':9},(name,active)
        assert active['held']=={'carbs':6,'protein':4,'water':3},(name,active)
        page.evaluate("""()=>{
          const {game,renovationAdapter:a}=__ANT_DEBUG__;
          game.setSpeed(1);game.update(100);game.setSpeed(0);a.notify();
        }""")
        assert page.evaluate('__ANT_DEBUG__.game.research.snapshot().active.progressTicks')==1,name
        sheet.locator('.ui-research-cancel').click()
        assert page.evaluate('__ANT_DEBUG__.game.research.snapshot().active') is not None,name
        sheet.locator('.ui-research-danger').click()
        final=page.evaluate("""()=>({
          active:__ANT_DEBUG__.game.research.snapshot().active,
          stock:{...__ANT_DEBUG__.game.foraging.inventory}
        })""")
        assert final['active'] is None and final['stock']=={'carbs':16,'protein':14,'water':12},(name,final)
        page.keyboard.press('Escape')
        assert page.locator('.ui-research-sheet').is_hidden(),name
        assert page.locator('[data-home-action="menu"]').is_visible(),name
        # Separate legacy route: colony menu opens the same authoritative Research,
        # and Escape returns full input control to the original game.
        page.goto(URL+'?ui=legacy&seed=CP-G3-LEGACY',wait_until='domcontentloaded')
        page.wait_for_function('Boolean(window.__ANT_DEBUG__?.renovationResearch)',timeout=20000)
        assert page.locator('#ui-renovation-root').is_hidden(),name
        page.locator('#colony-button').click()
        legacy=page.locator('.legacy-research-open')
        assert legacy.is_visible(),name
        legacy.click()
        assert page.locator('.ui-research-sheet:not([hidden])').count()==1,name
        page.keyboard.press('Escape')
        assert page.locator('#ui-renovation-root').is_hidden(),name
        assert page.locator('#tool-inspect').is_visible(),name
        assert not errors,(name,errors)
        bounds['engine']=engine
        bounds['size']=f'{width}x{height}'
        bounds['actualResearchStartCancel']=True
        bounds['legacyEntryAndReturn']=True
        (ARTIFACTS/f'{name}.json').write_text(json.dumps(bounds,ensure_ascii=False,indent=2))
        page.screenshot(path=str(ARTIFACTS/f'{name}-legacy.png'))
        print('CP G3 BROWSER CANDIDATE PASS',name,flush=True)
    except Exception:
        page.screenshot(path=str(ARTIFACTS/f'{name}-FAILED.png'),full_page=True)
        traceback.print_exc()
        raise
    finally:
        ctx.close()

server=subprocess.Popen(['node','tools/dev-server.mjs'],cwd=ROOT,
    stdout=subprocess.DEVNULL,stderr=subprocess.STDOUT)
try:
    for _ in range(80):
        try:
            with urlopen(URL,timeout=1) as resp:assert resp.status==200
            break
        except Exception:time.sleep(.2)
    else:raise RuntimeError('CP G3 local HTTP server did not start')
    with sync_playwright() as pw:
        for engine in [pw.chromium,pw.webkit]:
            browser=engine.launch(headless=True,args=['--no-sandbox'] if engine.name=='chromium' else [])
            try:
                for width,height in SIZES:run_pair(browser,engine.name,width,height)
            finally:browser.close()
finally:
    server.terminate()
    try:server.wait(timeout=5)
    except subprocess.TimeoutExpired:server.kill()
