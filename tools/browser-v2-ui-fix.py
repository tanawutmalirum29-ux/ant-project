"""Ant Kingdom UI V2.1: real game controls and overlay hit-testing.

Includes U1-U5 game modules via the existing harness; injects all production CSS
and both new UI-only scripts into Chromium, rather than testing static fixtures.
"""
import os, shutil
from pathlib import Path
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[1]
namespace = {'__file__': str(root/'tools/browser-smoke.py')}
src = (root/'tools/browser-smoke.py').read_text()
exec(src[:src.index('html=bundle_html()')], namespace)
html = namespace['bundle_html']()
for name in ['v1.css','v2.css','v2-fixes.css']:
    link = f'<link rel="stylesheet" href="./src/ui/visual/{name}" />'
    assert link in html, f'Production stylesheet missing: {name}'
    html = html.replace(link, '<style>'+(root/'src/ui/visual'/name).read_text()+'</style>')
for name in ['page-zoom-guard.js','room-picker.js']:
    source=f'<script defer src="./src/ui/visual/{name}"></script>'
    assert source in html, f'Production visual script missing: {name}'
    html=html.replace(source,'<script>'+(root/'src/ui/visual'/name).read_text()+'</script>')

screens=[('small',320,568),('portrait',390,844),('tablet',768,1024),
         ('landscape',844,390),('desktop',1440,900)]
with sync_playwright() as p:
    binary=os.getenv('CHROMIUM_PATH') or next(
        (shutil.which(x) for x in ('chromium','google-chrome','google-chrome-stable') if shutil.which(x)), None)
    browser=p.chromium.launch(headless=True,args=['--no-sandbox'],
                               **({'executable_path':binary} if binary else {}))
    for name,width,height in screens:
        page=browser.new_page(viewport={'width':width,'height':height},
                              is_mobile=name!='desktop',has_touch=name!='desktop')
        errors=[]
        page.on('pageerror',lambda e: errors.append(str(e)))
        page.set_content(html,wait_until='domcontentloaded')
        page.wait_for_function('Boolean(window.__ANT_DEBUG__?.game?.rooms && document.querySelector("#room-picker-toggle"))')
        assert page.locator('#game-canvas').is_visible(),name

        # CSS room chooser must control the actual U5 room type and real cost text.
        page.locator('#tool-room').click()
        assert page.locator('#room-palette').is_visible(),name
        assert page.locator('#room-picker-toggle').is_visible(),name
        page.locator('#room-picker-toggle').click()
        assert page.locator('#room-picker-options').is_visible(),name
        page.locator('[data-room-value="water_store"]').click()
        assert page.locator('#room-type').input_value()=='water_store',name
        assert 'ใช้' in page.locator('#room-cost').inner_text(),name
        assert page.locator('#room-picker-options').is_hidden(),name
        page.locator('#room-picker-toggle').click()
        page.locator('[data-room-value="food_store"]').click()
        assert page.locator('#room-type').input_value()=='food_store',name
        page.locator('#room-picker-toggle').click()
        page.keyboard.press('Escape')
        assert page.locator('#room-picker-options').is_hidden(),name
        page.locator('#tool-inspect').click()

        # Real U5 selection: queen's cell is a valid underground map tile.
        page.evaluate('''() => {
          const {game,ui}=__ANT_DEBUG__,q=game.colony.queen;
          ui.select({layer:game.layer,x:q.x,y:q.y});
        }''')
        assert page.locator('#selection-card').is_visible(),name

        def overlap(a,b):
            A=page.locator(a).bounding_box()
            B=page.locator(b).bounding_box()
            if not A or not B:return False
            return min(A['x']+A['width'],B['x']+B['width']) > max(A['x'],B['x'])+1 and \
                   min(A['y']+A['height'],B['y']+B['height']) > max(A['y'],B['y'])+1
        for target in ['#debug-toggle','#zoom-in','#zoom-out','#recenter','.speed-controls']:
            if page.locator(target).is_visible():
                assert not overlap('#selection-card',target),(name,'panel overlaps '+target)
        page.locator('#debug-toggle').click()
        assert page.locator('#debug-panel').is_visible(),name
        if page.locator('#selection-card').is_visible():
            assert not overlap('#selection-card','#debug-panel'),(name,'selection over debug')
        page.locator('#debug-toggle').click()
        assert page.locator('#selection-card').is_visible(),name

        # Touch canvas remains the map zoom surface. Browser viewport stays 1x.
        assert page.evaluate('getComputedStyle(document.querySelector("#game-canvas")).touchAction')=='none',name
        assert page.evaluate('''() => {
            const el=document.querySelector('#seed-button');
            return !el.dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,ctrlKey:true}));
        }'''),(name,'page wheel zoom was not canceled')
        cam_before=page.evaluate('__ANT_DEBUG__.cameras[__ANT_DEBUG__.game.layer].zoom')
        page.mouse.move(width/2,height/2)
        page.mouse.wheel(0,-240)
        page.wait_for_timeout(70)
        cam_after=page.evaluate('__ANT_DEBUG__.cameras[__ANT_DEBUG__.game.layer].zoom')
        assert cam_after>cam_before,(name,'map wheel zoom did not work',cam_before,cam_after)
        assert page.evaluate('Math.abs(visualViewport.scale - 1) < .01'),(name,'browser zoomed')
        assert not errors,(name,errors)
        print(f'V2.1 {name} {width}x{height}: PASS custom room picker, no panel overlap, map zoom, no JS errors')
        page.close()
    browser.close()
