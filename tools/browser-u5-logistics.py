"""U5 rework: real interactive Canvas, physical delivery and nursery visual smoke.
Browser sandbox inlines source ES modules; this is not deployed AWS validation.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
namespace={'__file__':str(root/'tools/browser-smoke.py')}
exec((root/'tools/browser-smoke.py').read_text().split('html=bundle_html()')[0],namespace)
html=namespace['bundle_html']()
with sync_playwright() as pw:
    browser=pw.chromium.launch(**({'executable_path':'/usr/bin/chromium'} if Path('/usr/bin/chromium').exists() else {}),headless=True,args=['--no-sandbox'])
    for width,height,name in [(320,568,'small'),(390,844,'portrait'),(768,1024,'tablet'),(844,390,'landscape'),(1440,900,'desktop')]:
        page=browser.new_page(viewport={'width':width,'height':height},device_scale_factor=1,is_mobile=name!='desktop',has_touch=name!='desktop')
        errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.set_content(html)
        page.wait_for_function('!!window.__ANT_DEBUG__?.game?.rooms')
        page.locator('#tool-room').click()
        assert page.locator('#room-palette').is_visible()
        setup=page.evaluate('''() => {
          const {game:g,cameras,renderer}=window.__ANT_DEBUG__;
          g.colony.setForageSlots(0);g.lifecycle.setNurseSlots(0);
          Object.assign(g.foraging.inventory,{carbs:20,protein:20,water:20});
          const q=g.colony.queen, cam=cameras[g.layer],x=q.x+2,y=q.y;
          cam.x=(q.x+.5)*28;cam.y=(q.y+(renderer.height<650?2.5:.5))*28;
          const pos=cam.worldToScreen((x+.5)*28,(y+.5)*28,renderer.width,renderer.height);
          return {pos,x,y,valid:g.rooms.validate('food_store',x,y)};
        }''')
        assert setup['valid']['ok'],setup
        point=setup['pos']
        assert 0<point['x']<width and 0<point['y']<height,(name,setup)
        if name=='desktop':page.mouse.click(point['x'],point['y'])
        else:page.touchscreen.tap(point['x'],point['y'])
        assert page.evaluate('() => __ANT_DEBUG__.game.rooms.queuedCount')==1,name
        page.evaluate('''() => {const g=__ANT_DEBUG__.game; for(let i=0;i<210;i++)g.update(100);}''')
        assert page.evaluate('() => __ANT_DEBUG__.game.rooms.readyCount')==2,name
        result=page.evaluate('''() => {
          const g=__ANT_DEBUG__.game,ant=g.colony.workers[0],entry=g.world.entrances[0].underground;
          g.foraging.inventory.carbs=24;g.rooms.syncInventory();
          ant.x=entry.x;ant.y=entry.y;ant.layer='underground';ant.path=[];ant.next=null;ant.motion=0;ant.orderId=null;
          ant.state='forage-return-underground';ant.cargo={type:'carbs',amount:3};
          const start=g.foraging.inventory.carbs;
          let steps=0,remote=false;
          while(ant.cargo?.amount&&steps<220){g.foraging.tick();steps++;if(ant.cargo?.amount&&g.foraging.inventory.carbs!==start)remote=true;}
          const room=g.rooms.rooms.find(r=>r.type==='food_store');
          __ANT_DEBUG__.ui.select({layer:'underground',x:room.x,y:room.y});
          return {remote,steps,stock:g.foraging.inventory.carbs,warehouse:room.stock.carbs,cargo:ant.cargo,
            worker:{x:ant.x,y:ant.y},room:{x:room.x,y:room.y},selection:document.getElementById('selection-room').textContent};
        }''')
        assert not result['remote'] and result['cargo'] is None,(name,result)
        assert result['stock']==27 and result['warehouse']==3,(name,result)
        assert '2×2' in result['selection'] and 'อาหาร' in result['selection'],(name,result)
        assert not errors,(name,errors)
        print(f'{name} {width}x{height}: PASS physical warehouse delivery in {result["steps"]} steps, JS errors=0')
        page.close()
    browser.close()
