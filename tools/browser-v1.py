"""Real U1-U3 game + V1 CSS Chromium smoke without a network server.

Reuses the existing ES-module inliner as a test harness only. Production
gameplay modules and their runtime behavior are not modified or mocked.
"""
import os
import shutil
from pathlib import Path
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[1]
source = (root / 'tools' / 'browser-smoke.py').read_text()
namespace = {'__file__': str(root / 'tools' / 'browser-smoke.py')}
exec(source[:source.index('html=bundle_html()')], namespace)
html = namespace['bundle_html']()
link = '<link rel="stylesheet" href="./src/ui/visual/v1.css" />'
assert link in html, 'Production HTML did not include V1 stylesheet'
html = html.replace(link, '<style>' + (root / 'src/ui/visual/v1.css').read_text() + '</style>')

screens = [('small', 320, 568), ('portrait', 390, 844),
           ('tablet', 768, 1024), ('landscape', 844, 390), ('desktop', 1440, 900)]

with sync_playwright() as p:
    bin_path = os.environ.get('CHROMIUM_PATH') or next(
        (shutil.which(name) for name in ('chromium', 'google-chrome', 'google-chrome-stable') if shutil.which(name)),
        None
    )
    opts = {'executable_path': bin_path} if bin_path else {}
    browser = p.chromium.launch(headless=True, args=['--no-sandbox'], **opts)
    for name, width, height in screens:
        page = browser.new_page(viewport={'width': width, 'height': height}, device_scale_factor=1)
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.set_content(html, wait_until='domcontentloaded')
        page.wait_for_function('window.__ANT_DEBUG__ && __ANT_DEBUG__.game.population === 6')
        assert page.locator('#game-canvas').is_visible(), name
        assert page.locator('#forage-count').inner_text() == '2/5', name
        assert page.evaluate('''() => {
          const r=document.querySelector('.layer-switch').getBoundingClientRect();
          return Math.abs(r.x+r.width/2-innerWidth/2)<2;
        }'''), f'{name}: layer dock not centered'
        controls = ['#seed-button', '#tool-inspect', '#tool-dig', '#forage-plus',
                    '#forage-minus', '#pause-button', '#debug-toggle',
                    '#surface-button', '#underground-button']
        for selector in controls:
            bounds = page.locator(selector).bounding_box()
            assert bounds, (name, selector, 'missing')
            assert bounds['x'] >= -1 and bounds['x']+bounds['width'] <= width+1, (name, selector, bounds)
            assert bounds['y'] >= -1 and bounds['y']+bounds['height'] <= height+1, (name, selector, bounds)
        page.locator('#forage-plus').click()
        assert page.locator('#forage-count').inner_text() == '3/5', name
        page.locator('#forage-minus').click()
        assert page.locator('#forage-count').inner_text() == '2/5', name
        page.locator('[data-speed="2"]').click()
        assert page.evaluate('__ANT_DEBUG__.game.clock.speed') == 2, name
        page.locator('#pause-button').click()
        assert page.evaluate('__ANT_DEBUG__.game.clock.speed') == 0, name
        page.locator('[data-speed="1"]').click()
        page.locator('#surface-button').click()
        assert page.evaluate('__ANT_DEBUG__.game.layer') == 'surface', name
        assert not page.locator('#tool-dig').is_enabled(), name
        page.locator('#underground-button').click()
        assert page.evaluate('__ANT_DEBUG__.game.layer') == 'underground', name
        page.locator('#debug-toggle').click()
        assert page.locator('#debug-panel').is_visible(), name
        page.locator('#debug-toggle').click()
        page.locator('#seed-button').click()
        assert page.locator('#seed-dialog').evaluate('(el)=>el.open'), name
        page.locator('#cancel-seed').click()
        assert not page.locator('#seed-dialog').evaluate('(el)=>el.open'), name
        assert not errors, (name, errors)
        print(f'V1 {name}: PASS | bindings, buttons, map, modal, no JS errors')
        page.close()
    browser.close()
