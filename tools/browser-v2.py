"""V2 independent visual preview regression (not the live gameplay).

Run: python tools/browser-v2.py
Requires: pip install playwright && python -m playwright install chromium
Screenshots are written into design/v2/screenshots/ (gitignored by convention).
"""
from pathlib import Path
import os,shutil
from playwright.sync_api import sync_playwright

root=Path(__file__).resolve().parents[1]
preview=(root/'design/v2/index.html').resolve()
sizes=[('small',320,568),('portrait',390,844),('tablet',768,1024),
       ('landscape',844,390),('desktop',1440,900)]
out=root/'design/v2/screenshots'
out.mkdir(exist_ok=True,parents=True)
with sync_playwright() as p:
    chromium=os.getenv('CHROMIUM_PATH') or next(
        (shutil.which(s) for s in ('chromium','google-chrome','google-chrome-stable') if shutil.which(s)),None)
    browser=p.chromium.launch(headless=True,args=['--no-sandbox'],
                              **({'executable_path':chromium} if chromium else {}))
    for name,w,h in sizes:
        page=browser.new_page(viewport={'width':w,'height':h},device_scale_factor=1)
        errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(preview.as_uri(),wait_until='load')
        assert page.locator('.v2-preview').is_visible(),name
        assert page.locator('.resource-strip').is_visible(),name
        assert page.locator('.preview-land').is_visible(),name
        assert page.locator('#forage-count').inner_text()=='18/43',name
        for selector in ['#tool-inspect','#tool-dig','#forage-plus','#nurse-plus',
                         '#seed-button','#surface-button','#underground-button',
                         '#colony-button','#pause-button']:
            b=page.locator(selector).bounding_box()
            assert b is not None,(name,selector,'missing')
            assert -2<=b['x']<w,(name,selector,b)
            assert b['x']+b['width']<=w+2,(name,selector,b)
            assert -2<=b['y']<h,(name,selector,b)
            assert b['y']+b['height']<=h+2,(name,selector,b)
        overflow=page.evaluate('document.documentElement.scrollWidth-innerWidth')
        assert overflow<=1,(name,'overflow',overflow)
        page.locator('#forage-plus').click()
        assert page.locator('#forage-count').inner_text()=='19/43',name
        page.locator('#nurse-plus').click()
        assert page.locator('#nurse-count').inner_text()=='7/43',name
        page.locator('#colony-button').click()
        assert page.locator('#colony-panel').is_visible(),name
        page.locator('#close-colony').click()
        assert not page.locator('#colony-panel').is_visible(),name
        page.locator('#seed-button').click()
        assert page.locator('#seed-dialog').evaluate('(el)=>el.open'),name
        page.locator('#cancel-seed').click()
        page.locator('#surface-button').click()
        assert page.locator('#region-name').inner_text()=='เหนือผืนป่า',name
        assert page.locator('#tool-dig').is_disabled(),name
        page.locator('#underground-button').click()
        page.locator('#tool-dig').click()
        assert page.locator('#tool-dig').get_attribute('aria-pressed')=='true',name
        page.locator('[data-speed="4"]').click()
        assert page.locator('[data-speed="4"]').get_attribute('aria-pressed')=='true',name
        assert not errors,(name,errors)
        page.screenshot(path=str(out/(name+'.png')),full_page=True)
        print(f'V2 {name}: PASS mock controls, bounding boxes, no horizontal overflow, no JS errors')
        page.close()
    browser.close()
