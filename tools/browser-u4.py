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
        assert page.locator('#nurse-count').inner_text()=='มดพี่เลี้ยง 0'
        assert page.locator('#brood-summary').inner_text()=='ไข่ 0 · ตัวอ่อน 0 · ดักแด้ 0'
        page.locator('#colony-button').click()
        assert page.locator('#colony-panel').is_visible()
        assert page.locator('#report-workers').inner_text()=='5'
        page.locator('#close-colony').click()
        assert not page.locator('#colony-panel').is_visible()
        # The permanent caste roster replaces the legacy percentage controls.
        page.locator('#workforce-open').click()
        assert page.locator('#caste-report table tbody tr').count()==6
        assert '5' in page.locator('#caste-report .starter-row').inner_text()
        assert not page.locator('.workforce-editor').is_visible()
        page.locator('#close-colony').click()
        # No automatic eggs or births can occur in the absence of manual Nursery orders.
        page.evaluate('''() => {
          const g=__ANT_DEBUG__.game;
          g.colony.setForageSlots(0);
          for(let i=0;i<930;i++)g.update(100);
          __ANT_DEBUG__.ui.updateMetrics();
        }''')
        births=page.evaluate('() => __ANT_DEBUG__.game.lifecycle.births')
        assert births==0,(name,births,'auto birth regressed')
        # Queue and cancel a real hatch order with a connected Nursery in a browser fixture.
        page.evaluate('''() => {
          const {game,ui}=__ANT_DEBUG__,q=game.colony.queen;
          game.foraging.inventory={carbs:24,protein:24,water:24};
          game.rooms.syncInventory();
          const room={id:'u4-browser-nursery',type:'nursery',x:q.x-4,y:q.y,
            width:2,height:2,status:'ready',connected:true,progress:65,ticks:65,
            workerId:null,broodSlots:4,stock:{carbs:0,protein:0,water:0},
            cost:{carbs:3,protein:2},capacity:{}};
          game.rooms.rooms.push(room);game.rooms.updateConnectivity();
          ui.select({layer:'underground',x:room.x,y:room.y});
        }''')
        assert page.locator('#nursery-panel').is_visible(),name
        page.locator('#nursery-profession').select_option('miner')
        page.locator('#nursery-level').select_option('1')
        page.locator('#nursery-queue').click()
        assert page.evaluate('__ANT_DEBUG__.game.lifecycle.eggOrders.length')==1,name
        assert 'รอนางพญา' in page.locator('#nursery-orders').inner_text()
        page.locator('#nursery-orders button[data-egg-id]').click()
        assert page.evaluate('__ANT_DEBUG__.game.lifecycle.eggOrders.length')==0,name
        # The Nursery drawer intentionally hides the older selection card;
        # close the drawer first so the selection close action is tappable.
        page.locator('#nursery-close').click()
        assert page.locator('#selection-card').is_visible(),name
        page.locator('#selection-close').click()
        assert page.locator('#queen-status').inner_text()
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
