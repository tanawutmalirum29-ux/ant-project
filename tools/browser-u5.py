"""U5 gameplay+controls smoke. Sandbox browser inlines ES modules (same strategy as U2)."""
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
namespace={'__file__':str(root/'tools/browser-smoke.py')}
exec((root/'tools/browser-smoke.py').read_text().split('html=bundle_html()')[0],namespace)
html=namespace['bundle_html']()
with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    for width,height,name in [(320,568,'small'),(390,844,'portrait'),(768,1024,'tablet'),(844,390,'landscape'),(1440,900,'desktop')]:
        page=browser.new_page(viewport={'width':width,'height':height},device_scale_factor=1,is_mobile=name!='desktop',has_touch=name!='desktop')
        errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.set_content(html)
        page.wait_for_function('window.__ANT_DEBUG__?.game?.rooms?.readyCount === 1')
        assert page.locator('#room-palette').is_hidden()
        assert page.locator('#tool-room').is_enabled()
        page.locator('#tool-room').click()
        assert page.locator('#room-palette').is_visible()
        assert page.locator('#tool-room').get_attribute('aria-pressed')=='true'
        # The room tool is a toggle. The second tap should exit, not build.
        page.locator('#tool-room').click()
        assert page.locator('#tool-inspect').get_attribute('aria-pressed')=='true'
        assert page.locator('#room-palette').is_hidden()
        assert page.evaluate('() => __ANT_DEBUG__.game.rooms.queuedCount')==0
        page.locator('#tool-room').click()
        assert page.locator('#room-palette').is_visible()
        assert 'ใช้' in page.locator('#room-cost').inner_text()
        page.locator('#room-type').select_option('food_store')
        # Real UI pointer click: all values are game state except funding and camera re-centering.
        info=page.evaluate('''() => {
          const {game:g,cameras,renderer}=__ANT_DEBUG__;
          g.colony.setForageSlots(0);g.lifecycle.setNurseSlots(0);
          g.foraging.inventory.carbs=15;g.foraging.inventory.protein=15;
          const q=g.colony.queen,c=cameras[g.layer];
          c.x=(q.x+.5)*28;c.y=(q.y+(renderer.height<650?2.5:.5))*28;
          const x=q.x+2,y=q.y;
          const pos=c.worldToScreen((x+.5)*28,(y+.5)*28,renderer.width,renderer.height);
          return {pos,x,y,valid:g.rooms.validate('food_store',x,y)};
        }''')
        assert info['valid']['ok'],info
        point=info['pos'];assert 0<point['x']<width and 0<point['y']<height,(name,info)
        intercept=page.evaluate('''p=>{const el=document.elementFromPoint(p.x,p.y);return el?.id || el?.className || el?.tagName;}''',point)
        assert intercept=='game-canvas',(name,intercept,info)
        if name=='desktop':page.mouse.click(point['x'],point['y'])
        else:page.touchscreen.tap(point['x'],point['y'])
        assert page.evaluate('() => __ANT_DEBUG__.game.rooms.queuedCount')==1,name
        assert page.locator('#selection-room').is_visible()
        assert page.locator('#cancel-room').is_visible()
        assert 'คลังอาหาร' in page.locator('#selection-room').inner_text()
        page.locator('#cancel-room').click()
        assert page.evaluate('() => __ANT_DEBUG__.game.rooms.queuedCount')==0,name
        assert page.evaluate('() => __ANT_DEBUG__.game.foraging.inventory.carbs')==15
        if name=='desktop':page.mouse.click(point['x'],point['y'])
        else:page.touchscreen.tap(point['x'],point['y'])
        page.evaluate('''() => {const g=__ANT_DEBUG__.game; for(let i=0;i<190;i++)g.update(100);__ANT_DEBUG__.ui.updateMetrics();}''')
        assert page.evaluate('() => __ANT_DEBUG__.game.rooms.readyCount')==2,name
        assert page.evaluate('() => __ANT_DEBUG__.game.rooms.capacityFor("carbs")')==64,name
        assert '64' in page.locator('#room-summary').inner_text()
        page.locator('#surface-button').click()
        assert not page.locator('#tool-room').is_enabled()
        assert page.locator('#room-palette').is_hidden()
        page.locator('#underground-button').click()
        page.locator('#seed-button').click()
        page.locator('#seed-input').fill('U5-'+name)
        page.locator('#create-seed').click()
        assert page.evaluate('() => __ANT_DEBUG__.game.rooms.rooms.length')==1
        assert page.evaluate('() => __ANT_DEBUG__.game.rooms.capacityFor("carbs")')==24
        assert page.evaluate('() => __ANT_DEBUG__.game.rooms.queuedCount')==0
        page.wait_for_timeout(100)
        assert not errors,(name,errors)
        print(f'{name} {width}x{height}: PASS room queued/cancelled/constructed/reset, JS errors=0')
        page.screenshot(path=str(root/f'u5-screen-{name}.png'))
        page.close()
    browser.close()
