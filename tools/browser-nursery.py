"""Focused real-Chromium Nursery UI smoke on production HTTP ES modules."""
import subprocess
import time
from urllib.request import urlopen
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
proc=subprocess.Popen(['node','tools/dev-server.mjs'],cwd=ROOT,stdout=subprocess.DEVNULL,stderr=subprocess.STDOUT)
try:
    for _ in range(60):
        try:
            with urlopen('http://127.0.0.1:4173/',timeout=1) as response:
                assert response.status==200
            break
        except Exception:
            time.sleep(.2)
    else: raise AssertionError('Node dev server failed')
    with sync_playwright() as pw:
        browser=pw.chromium.launch(headless=True,args=['--no-sandbox'])
        for width,height in [(320,568),(390,844),(1440,900)]:
            page=browser.new_page(viewport={'width':width,'height':height},device_scale_factor=1)
            errors=[]
            page.on('pageerror',lambda e:errors.append(str(e)))
            page.goto('http://127.0.0.1:4173/',wait_until='domcontentloaded')
            page.wait_for_function('Boolean(window.__ANT_DEBUG__)',timeout=20000)
            page.evaluate('''() => {
              const {game,ui}=__ANT_DEBUG__,q=game.colony.queen;
              game.foraging.inventory={carbs:24,protein:24,water:24};
              game.rooms.syncInventory();
              const room={id:'browser-nursery',type:'nursery',x:q.x-4,y:q.y,
                width:2,height:2,status:'ready',connected:true,progress:65,ticks:65,
                workerId:null,broodSlots:4,stock:{carbs:0,protein:0,water:0},
                cost:{carbs:3,protein:2},capacity:{}};
              game.rooms.rooms.push(room);
              game.rooms.updateConnectivity();
              ui.select({layer:'underground',x:room.x,y:room.y});
            }''')
            drawer=page.locator('#nursery-panel')
            assert drawer.is_visible(),f'Nursery drawer hidden at {width}px'
            box=drawer.bounding_box()
            assert box and box['x']>=0 and box['x']+box['width']<=width+1,(width,box)
            assert box['y']>=0 and box['y']+box['height']<=height+1,(height,box)
            # Drawer cannot consume physical A/B controls or the old selected tile card.
            def intersects(a,b):
                return a and b and a['x'] < b['x']+b['width'] and b['x'] < a['x']+a['width'] and a['y'] < b['y']+b['height'] and b['y'] < a['y']+a['height']
            dock=page.locator('#u6-dock')
            assert dock.is_visible(),(width,'military dock missing')
            assert not intersects(box,dock.bounding_box()),(width,'nursery obscures squad A/B dock')
            speed=page.locator('.right-controls').bounding_box()
            dig=page.locator('.dig-tools').bounding_box()
            assert not intersects(box,speed),(width,'nursery obscures speed buttons',box,speed)
            assert not intersects(box,dig),(width,'nursery obscures digging tools',box,dig)
            assert page.evaluate('''() => {
              const p=document.querySelector('#nursery-panel'),r=p.getBoundingClientRect();
              const el=document.elementFromPoint(r.left+r.width/2,r.top+Math.min(35,r.height/2));
              return el===p||p.contains(el);
            }'''),(width,'tap on nursery drawer would fall through to map')
            assert page.locator('#selection-card').evaluate("(e)=>getComputedStyle(e).visibility==='hidden'"),(width,'selection card overlap')
            assert page.locator('#nursery-blocked').text_content().strip()=='พร้อมรับคำสั่งฟักไข่',(width,'unexpected block reason')
            page.locator('#u6-open').click()
            assert page.locator('#u6-dialog').evaluate('(e)=>e.open'),(width,'squad dialog not open')
            assert page.locator('#nursery-panel').evaluate("(e)=>getComputedStyle(e).visibility==='hidden'"),(width,'squad dialog obscured')
            page.locator('#u6-close').click()
            assert drawer.is_visible(),width
            page.locator('#nursery-profession').select_option('nurse')
            page.locator('#nursery-level').select_option('3')
            page.locator('#nursery-queue').click()
            orders=page.evaluate('''() => __ANT_DEBUG__.game.lifecycle.eggOrders.map(o=>({profession:o.profession,level:o.level,status:o.status}))''')
            assert orders==[{'profession':'nurse','level':3,'status':'QUEUED'}],(width,orders)
            assert page.locator('#nursery-orders li[data-id]').count()==1
            assert 'รอนางพญา' in page.locator('#nursery-orders').inner_text()
            assert page.locator('#nursery-orders progress').count()==1
            page.locator('#nursery-orders button[data-egg-id]').click()
            assert page.evaluate('__ANT_DEBUG__.game.lifecycle.eggOrders.length')==0
            page.locator('#nursery-close').click()
            assert not drawer.is_visible(),width
            assert page.locator('#nursery-reopen').is_visible()
            page.locator('#nursery-reopen').click()
            assert drawer.is_visible()
            page.keyboard.press('Escape')
            assert not drawer.is_visible(),(width,'Escape failed')
            page.locator('#colony-button').click()
            assert page.locator('#caste-report').is_visible(),width
            assert page.locator('#caste-report table tbody tr').count()==6
            assert '5' in page.locator('#caste-report .starter-row').inner_text(),(width,'missing five starters')
            assert page.locator('#caste-report .starter-row').is_visible()
            assert page.locator('#caste-report').locator('th').all_text_contents()[:2]==['อาชีพ','รวม']
            page.locator('#close-colony').click()
            assert page.evaluate('''() => {
              const {game,ui}=__ANT_DEBUG__,ant=game.colony.workers[0];
              ui.select({layer:ant.layer,x:ant.x,y:ant.y},ant.id);
              return document.querySelector('#selection-ant-detail').textContent.includes('Lv.1');
            }'''),(width,'real ant inspector failed')
            page.locator('#tool-dig').click()
            assert page.evaluate('__ANT_DEBUG__.ui.tool')=='dig',(width,'dig tool regressed')
            page.locator('#tool-inspect').click()
            assert page.evaluate('__ANT_DEBUG__.ui.tool')=='inspect',(width,'inspect tool regressed')
            assert not errors,(width,errors)
            print(f'Nursery browser {width}x{height}: PASS')
            page.close()
        browser.close()
finally:
    proc.terminate()
    try:proc.wait(timeout=3)
    except subprocess.TimeoutExpired:proc.kill()
