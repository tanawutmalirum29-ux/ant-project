"""U4 lifecycle UI regression. Uses inlined ES modules for sandbox-only testing."""
from pathlib import Path
from playwright.sync_api import sync_playwright
base=Path(__file__).resolve().parents[1]
script=(base/'tools/browser-smoke.py').read_text()
source=script[:script.index('html=bundle_html()')]
namespace={'__file__':str(base/'tools/browser-smoke.py')}
exec(source,namespace)
html=namespace['bundle_html']()
with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'],headless=True)
    for width,height,name in [(1440,900,'desktop'),(390,844,'portrait'),(844,390,'landscape')]:
        page=browser.new_page(viewport={'width':width,'height':height},has_touch=name!='desktop',is_mobile=name!='desktop',device_scale_factor=1)
        errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.on('console',lambda m:errors.append('console:'+m.text) if m.type=='error' else None)
        page.set_content(html,wait_until='domcontentloaded')
        page.wait_for_function('window.__ANT_DEBUG__?.game?.lifecycle')
        assert page.locator('#population').inner_text()=='6'
        assert page.locator('#nurse-count').inner_text()=='1/5'
        assert page.locator('#brood-summary').inner_text()=='ไข่ 0 · ตัวอ่อน 0 · ดักแด้ 0'
        page.locator('#colony-button').click()
        assert page.locator('#colony-panel').is_visible()
        assert page.locator('#report-workers').inner_text()=='5'
        page.locator('#close-colony').click()
        assert not page.locator('#colony-panel').is_visible()
        page.locator('#nurse-plus').click()
        assert page.locator('#nurse-count').inner_text()=='2/5'
        page.locator('#nurse-minus').click()
        assert page.locator('#nurse-count').inner_text()=='1/5'
        page.evaluate('''() => {const g=__ANT_DEBUG__.game;g.foraging.inventory.protein=30;g.foraging.inventory.carbs=35;g.foraging.inventory.water=30;g.colony.setForageSlots(0);for(let i=0;i<930;i++)g.update(100);__ANT_DEBUG__.ui.updateMetrics();}''')
        births=page.evaluate('''() => __ANT_DEBUG__.game.lifecycle.births''')
        assert births>=1,(name,births)
        assert int(page.locator('#population').inner_text())>6
        page.locator('#colony-button').click()
        assert int(page.locator('#report-workers').inner_text())>=6
        assert int(page.locator('#report-births').inner_text().split('/')[0].strip())>=1
        page.locator('#close-colony').click()
        assert 'ไข่' in page.locator('#brood-summary').inner_text()
        assert page.locator('#queen-status').inner_text()
        page.evaluate('''() => {const {game,ui}=__ANT_DEBUG__;ui.select({layer:'underground',x:game.colony.queen.x,y:game.colony.queen.y});}''')
        assert page.locator('#selection-brood').is_visible()
        assert 'ตัวอ่อน' in page.locator('#selection-brood').inner_text()
        page.locator('#selection-close').click()
        assert not page.locator('#selection-card').is_visible()
        page.locator('#surface-button').click()
        assert page.locator('#region-name').inner_text()=='เหนือผืนป่า'
        page.locator('#underground-button').click()
        assert page.locator('#region-name').inner_text()=='ใต้ผืนดิน'
        page.locator('#pause-button').click()
        ticks=page.evaluate('''() => __ANT_DEBUG__.game.lifecycle.tickCount''')
        page.evaluate('''() => {for(let i=0;i<100;i++)__ANT_DEBUG__.game.update(100)}''')
        assert page.evaluate('''() => __ANT_DEBUG__.game.lifecycle.tickCount''')==ticks
        dims=page.evaluate('''() => ({w:document.documentElement.scrollWidth,v:window.innerWidth,h:document.documentElement.scrollHeight, vh:window.innerHeight})''')
        assert dims['w']<=dims['v']+2,(name,dims)
        assert not errors,(name,errors)
        page.screenshot(path=str(base/f'screenshot-u4-{name}.png'),full_page=True)
        print(name,'PASS','births',births,'viewport',dims,'console errors',len(errors))
        page.close()
    browser.close()
