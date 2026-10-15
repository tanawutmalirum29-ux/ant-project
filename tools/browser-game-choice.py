"""Verify custom game choice buttons in Chromium (Android-like) and WebKit (iOS-like)."""
import subprocess
import time
from pathlib import Path
from urllib.request import urlopen
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
server = subprocess.Popen(['node','tools/dev-server.mjs'], cwd=ROOT,
                          stdout=subprocess.DEVNULL,stderr=subprocess.STDOUT)
try:
    for _ in range(60):
        try:
            with urlopen('http://127.0.0.1:4173/',timeout=1) as response:
                assert response.status==200
            break
        except Exception:
            time.sleep(.2)
    else: raise AssertionError('HTTP game server failed')

    with sync_playwright() as pw:
        for engine in [pw.chromium, pw.webkit]:
            browser = engine.launch(headless=True, args=['--no-sandbox'] if engine.name=='chromium' else [])
            for width,height in [(320,568),(390,844),(844,390),(1440,900)]:
                context = browser.new_context(viewport={'width':width,'height':height},
                    has_touch=True,is_mobile=width<1440,device_scale_factor=1)
                page = context.new_page()
                errors=[]
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.goto('http://127.0.0.1:4173/',wait_until='domcontentloaded')
                page.wait_for_function('Boolean(window.__ANT_DEBUG__)')
                # Every select in the game gets an OS-independent DOM picker.
                assert page.locator('#room-picker-toggle').count()==1
                assert page.locator('#nursery-profession-trigger').count()==1
                assert page.locator('#nursery-level-trigger').count()==1
                for select_id in ['nursery-profession','nursery-level','room-type']:
                    visible=page.locator('#'+select_id).evaluate('''el=>{
                      const css=getComputedStyle(el);
                      return css.pointerEvents!=='none'&&el.getBoundingClientRect().width>2&&css.opacity!=='0';
                    }''')
                    assert not visible,(engine.name,width,select_id,'native OS picker hit target')
                page.locator('#tool-room').click()
                page.locator('#room-picker-toggle').click()
                assert page.locator('#room-picker-options').is_visible()
                page.locator('[data-room-value="nursery"]').click()
                assert page.locator('#room-type').input_value()=='nursery'
                page.locator('#tool-inspect').click()

                # Set up a genuinely connected Nursery through the existing simulation.
                page.evaluate('''() => {
                  const {game,ui}=__ANT_DEBUG__,q=game.colony.queen;
                  game.foraging.inventory={carbs:24,protein:24,water:24};
                  game.rooms.syncInventory();
                  const room={id:'cross-platform-nursery',type:'nursery',x:q.x-4,y:q.y,
                    width:2,height:2,status:'ready',connected:true,progress:65,ticks:65,
                    workerId:null,broodSlots:4,stock:{carbs:0,protein:0,water:0},
                    cost:{carbs:3,protein:2},capacity:{}};
                  game.rooms.rooms.push(room);game.rooms.updateConnectivity();
                  ui.select({layer:'underground',x:room.x,y:room.y});
                }''')
                assert page.locator('#nursery-panel').is_visible()
                assert page.locator('#nursery-profession-trigger').get_attribute('aria-haspopup')=='listbox'
                page.locator('#nursery-profession-trigger').tap()
                assert page.locator('#nursery-profession-options').is_visible()
                assert page.locator('#nursery-profession-options [data-value="nurse"]').get_attribute('role')=='option'
                page.locator('#nursery-profession-options [data-value="nurse"]').tap()
                assert page.locator('#nursery-profession').input_value()=='nurse'
                assert page.locator('#nursery-profession-trigger').get_attribute('aria-expanded')=='false'
                assert 'มดพี่เลี้ยง' in page.locator('#nursery-profession-trigger').inner_text()
                page.locator('#nursery-level-trigger').tap()
                assert page.locator('#nursery-level-options').is_visible()
                page.locator('#nursery-level-options [data-value="3"]').tap()
                assert page.locator('#nursery-level').input_value()=='3'
                assert 'Lv.3' in page.locator('#nursery-level-trigger').inner_text()
                assert page.locator('#nursery-cost').is_visible()
                page.locator('#nursery-queue').tap()
                orders=page.evaluate('''() => __ANT_DEBUG__.game.lifecycle.eggOrders.map(o=>[o.profession,o.level])''')
                assert orders==[['nurse',3]],(engine.name,width,orders)
                page.locator('#nursery-orders button[data-egg-id]').click()
                assert page.evaluate('__ANT_DEBUG__.game.lifecycle.eggOrders.length')==0

                # Keyboard and outside touch close the same game-controlled popup.
                page.locator('#nursery-level-trigger').focus()
                page.keyboard.press('ArrowDown')
                assert page.locator('#nursery-level-options').is_visible()
                page.keyboard.press('Escape')
                assert page.locator('#nursery-level-options').is_hidden()
                page.locator('#nursery-profession-trigger').tap()
                page.locator('#nursery-close').tap()
                assert page.locator('#nursery-profession-options').is_hidden()

                assert not errors,(engine.name,width,errors)
                print(f'{engine.name} {width}x{height}: PASS room / profession / level / hatch / keyboard')
                context.close()
            browser.close()
finally:
    server.terminate()
    try: server.wait(timeout=3)
    except subprocess.TimeoutExpired: server.kill()
