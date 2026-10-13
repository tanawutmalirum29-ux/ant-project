"""U3 browser regression with source-module inlining for sandbox Chromium."""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright
from importlib.util import spec_from_file_location, module_from_spec

base=Path(__file__).resolve().parents[1]
# Chromium in this sandbox blocks localhost; inline verified ES-module sources for visual testing.
source=(base/'tools/browser-smoke.py').read_text()
code=source[:source.index('html=bundle_html()')]
code=code.replace("mods=['core/random.js','core/time.js','world/generate.js','world/navigation.js','core/colony.js','core/game.js','render/camera.js','render/renderer.js','ui/app.js','main.js']", "mods=['core/random.js','core/time.js','world/generate.js','world/navigation.js','world/resources.js','core/colony.js','core/foraging.js','core/game.js','render/camera.js','render/renderer.js','ui/app.js','main.js']")
namespace={'__file__':str(base/'tools/browser-smoke.py')}
exec(code,namespace)
html=namespace['bundle_html']()
with sync_playwright() as playwright:
    browser=playwright.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'],headless=True)
    for width,height,name in [(1440,900,'desktop'),(390,844,'portrait'),(844,390,'landscape')]:
        page=browser.new_page(viewport={'width':width,'height':height},has_touch=name!='desktop',is_mobile=name!='desktop',device_scale_factor=1)
        errors=[]
        page.on('pageerror',lambda e: errors.append(str(e)))
        page.on('console',lambda e: errors.append('console: '+e.text) if e.type=='error' else None)
        page.set_content(html,wait_until='domcontentloaded')
        page.wait_for_function('window.__ANT_DEBUG__ && __ANT_DEBUG__.game.foraging.nodes.length >= 9')
        assert page.locator('#stock-carbs').inner_text()=='0'
        assert page.locator('#forage-count').inner_text()=='2/5'
        page.locator('#forage-plus').click()
        assert page.locator('#forage-count').inner_text()=='3/5'
        page.locator('#forage-minus').click()
        assert page.locator('#forage-count').inner_text()=='2/5'
        assert page.locator('#tool-dig').is_enabled()
        page.locator('#surface-button').click()
        assert page.locator('#tool-dig').is_disabled()
        assert page.locator('#region-name').inner_text()=='เหนือผืนป่า'
        # Resource selection on the surface (checks the actual HUD binding).
        page.evaluate('''() => {const {ui,game}=__ANT_DEBUG__; const n=game.foraging.nodes[0];ui.select({layer:'surface',x:n.x,y:n.y});}''')
        assert page.locator('#selection-resource').is_visible()
        assert 'เหลือ' in page.locator('#selection-resource').inner_text()
        page.locator('#selection-close').click()
        # Force enough deterministic ticks for two return trips, while the frame loop is alive.
        page.evaluate('''() => {const g=__ANT_DEBUG__.game;for(let i=0;i<700;i++)g.update(100);}''')
        assert int(page.locator('#stock-carbs').inner_text())>=0
        page.evaluate('''() => __ANT_DEBUG__.ui.updateMetrics()''')
        inventory=page.evaluate('''() => Object.values(__ANT_DEBUG__.game.foraging.inventory).reduce((a,b)=>a+b,0)''')
        assert inventory>0, 'foraging never returned food'
        assert sum(int(page.locator('#stock-'+x).inner_text()) for x in ['carbs','protein','water'])==inventory
        page.locator('#underground-button').click()
        assert page.locator('#tool-dig').is_enabled()
        assert page.locator('#region-name').inner_text()=='ใต้ผืนดิน'
        assert not errors,errors
        page.screenshot(path=str(base / ('screenshot-u3-'+name+'.png')),full_page=True)
        print(name, 'PASS', 'stock',inventory, 'errors',len(errors))
        page.close()
    browser.close()
