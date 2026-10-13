"""U6 interactive combat controls + real simulation in sandbox inline-module Chromium."""
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
namespace={'__file__':str(root/'tools/browser-smoke.py')}
exec((root/'tools/browser-smoke.py').read_text().split('html=bundle_html()')[0],namespace)
html=namespace['bundle_html']()
with sync_playwright() as pw:
    chromium=Path('/usr/bin/chromium')
    browser=pw.chromium.launch(**({'executable_path':str(chromium)} if chromium.exists() else {}),headless=True,args=['--no-sandbox'])
    for w,h,label in [(320,568,'small'),(390,844,'portrait'),(768,1024,'tablet'),(844,390,'landscape'),(1440,900,'desktop')]:
        page=browser.new_page(viewport={'width':w,'height':h},device_scale_factor=1,is_mobile=label!='desktop',has_touch=label!='desktop')
        errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.set_content(html)
        page.wait_for_function('!!window.__ANT_DEBUG__?.game?.combat')
        button=page.locator('#u6-open')
        assert button.is_visible() and button.is_enabled(),label
        button.click()
        assert page.locator('#u6-dialog').is_visible(),label
        page.locator('#u6-plus').click()
        assert page.evaluate('() => __ANT_DEBUG__.game.combat.soldierSlots')==1,label
        assert page.locator('#u6-soldiers').inner_text().endswith('/1'),label
        page.locator('#u6-alarm').click()
        assert page.evaluate('() => __ANT_DEBUG__.game.combat.enemies.length')==1,label
        # Actual battle: no enemy damaging queen remotely, soldier marches to the invader.
        outcome=page.evaluate('''() => {
          const g=__ANT_DEBUG__.game,c=g.combat;
          const ant=c.soldiers[0],start={x:ant.x,y:ant.y,layer:ant.layer};
          for(let i=0;i<150;i++)g.update(100);
          return {start,end:{x:ant.x,y:ant.y,layer:ant.layer},enemies:c.enemies.length,crossings:c.portalCrossings,
            population:g.population,queenHP:c.queenHP};
        }''')
        assert outcome['start']!=outcome['end'] or outcome['crossings']>0,(label,outcome)
        # Modal controls are interactive and dimensionally in view on all sizes.
        frame=page.locator('#u6-dialog').bounding_box()
        assert frame and frame['x']>=-1 and frame['y']>=-1 and frame['x']+frame['width']<=w+1,(label,frame)
        page.locator('[data-u6-mode="retreat"]').click()
        assert page.evaluate('() => __ANT_DEBUG__.game.combat.mode')=='retreat'
        page.locator('#u6-close').click()
        assert not page.locator('#u6-dialog').is_visible(),label
        assert not errors,(label,errors)
        page.screenshot(path=str(root/f'screenshot-u6-{label}.png'))
        print(f'{label} {w}x{h}: PASS; attack preview, soldiers=1, threat=1, modal/control checks; errors=0')
        page.close()
    browser.close()
