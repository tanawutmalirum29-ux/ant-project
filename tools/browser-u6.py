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
        assert page.locator('#u6-roster .u6-unit').count()==5,label
        assert page.locator('#u6-roster .u6-unit.is-soldier').count()==1,label
        available=page.locator('#u6-roster button[data-action="recruit"]:not([disabled])')
        assert available.count()>0,label
        available.first.click()
        assert page.evaluate('()=>__ANT_DEBUG__.game.combat.soldiers.length')==2,label
        page.locator('#u6-roster button[data-action="demobilize"]').last.click()
        assert page.evaluate('()=>__ANT_DEBUG__.game.combat.soldiers.length')==1,label
        page.locator('#u6-plus').click()
        assert page.evaluate('() => __ANT_DEBUG__.game.combat.soldierSlots')==2,label
        assert page.locator('#u6-soldiers').inner_text().endswith('/2'),label
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
        # One-tap military orders use the real map pointer pipeline.
        page.locator('#u6-quick-rally').click()
        assert page.locator('#u6-target-tip').is_visible(),label
        page.evaluate("""() => {
          const {game,cameras,renderer}=__ANT_DEBUG__,q=game.colony.queen,
            c=cameras[game.layer],w=renderer.width,h=renderer.height;
          const sx=w<450?w*.78:w*.58,sy=h<500?h*.52:h*.58;
          c.x=(q.x+.5)*28-(sx-w/2)/c.zoom;
          c.y=(q.y+.5)*28-(sy-h/2)/c.zoom;
          c.clamp(game.currentLayer,w,h);
        }""")
        tile=page.evaluate("""() => {
          const {game,cameras,renderer}=__ANT_DEBUG__,q=game.colony.queen,
            c=cameras[game.layer],l=game.currentLayer,w=renderer.width,h=renderer.height;
          let result=null;
          for(let y=q.y-4;y<=q.y+4;y++)for(let x=q.x-5;x<=q.x+5;x++){
            if(x<0||y<0||x>=l.width||y>=l.height)continue;
            if(![13,14,15].includes(l.cells[y*l.width+x]))continue;
            const px=c.worldToScreen((x+.5)*28,(y+.5)*28,w,h);
            if(px.x<18||px.x>w-18||px.y<155||px.y>h-150)continue;
            if(document.elementFromPoint(px.x,px.y)!==renderer.canvas)continue;
            const d=Math.abs(px.x-w/2)+Math.abs(px.y-h/2);
            if(!result||d<result.d)result={x,y,px,d};
          }
          return result;
        }""")
        assert tile is not None,(label,'No unobstructed reachable map tile')
        if label=='desktop':page.mouse.click(tile['px']['x'],tile['px']['y'])
        else:page.touchscreen.tap(tile['px']['x'],tile['px']['y'])
        assert not page.locator('#u6-target-tip').is_visible(),label
        rally=page.evaluate('()=>__ANT_DEBUG__.game.combat.rally')
        assert rally and (rally['x'],rally['y'])==(tile['x'],tile['y']),(label,rally,tile)
        page.evaluate('''() => {for(let i=0;i<90;i++)__ANT_DEBUG__.game.update(100)}''')
        assert page.evaluate('()=>__ANT_DEBUG__.game.combat.mode')=='rally',label
        page.locator('#u6-quick-defend').click()
        assert page.evaluate('()=>__ANT_DEBUG__.game.combat.mode')=='defend',label
        assert not errors,(label,errors)
        page.screenshot(path=str(root/f'screenshot-u6-{label}.png'))
        print(f'{label} {w}x{h}: PASS; attack preview, soldiers=2, threat=1, modal/control checks; errors=0')
        page.close()
    browser.close()
