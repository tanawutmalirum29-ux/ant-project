"""P1-UI-01: real Ant Kingdom Chromium UI regression audit (test only).

Uses the existing tools/browser-smoke.py module bundler to load production
index.html, not design/v2. No source/gameplay modifications are made.
Outputs screenshots and JSON into a temporary directory, never the git diff.

Usage: python tools/browser-phase1-ui-audit.py [--artifacts /tmp/ant-ui]
"""
import argparse
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile
import traceback
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
VIEWPORTS = [('small',320,568,True),('portrait',390,844,True),
             ('tablet',768,1024,True),('landscape',844,390,True),
             ('desktop',1440,900,False)]

def production_html():
    smoke = ROOT/'tools/browser-smoke.py'
    source = smoke.read_text(encoding='utf-8')
    prefix, sep, _ = source.partition('html=bundle_html()')
    assert sep, 'Existing production bundler changed'
    scope = {'__file__':str(smoke),'__name__':'_ant_ui_loader'}
    exec(compile(prefix,str(smoke),'exec'),scope)
    html = scope['bundle_html']()
    assert 'id="game-canvas"' in html and '<script type="module" src="./src/main.js"></script>' not in html
    for name in ('v1.css','v2.css','v2-fixes.css'):
        tag = f'<link rel="stylesheet" href="./src/ui/visual/{name}" />'
        assert html.count(tag)==1, tag
        html = html.replace(tag,'<style>'+(ROOT/'src/ui/visual'/name).read_text(encoding='utf-8')+'</style>')
    for name in ('page-zoom-guard.js','room-picker.js'):
        tag = f'<script defer src="./src/ui/visual/{name}"></script>'
        assert html.count(tag)==1, tag
        html = html.replace(tag,'<script>'+(ROOT/'src/ui/visual'/name).read_text(encoding='utf-8')+'</script>')
    return html

def inspect(page):
    return page.evaluate("""() => {
      const g=__ANT_DEBUG__.game,c=__ANT_DEBUG__.cameras[g.layer];
      return {seed:g.world.seedLabel,layer:g.layer,ticks:g.clock.ticks,
        speed:g.clock.speed,population:g.population,
        foragers:g.colony.forageSlots,nurses:g.lifecycle.nurseSlots,
        workers:g.colony.workers.length,rooms:g.rooms.queuedCount,
        soldiers:g.combat.soldiers.length,slots:g.combat.soldierSlots,
        rally:g.combat.rally,mode:g.combat.mode,
        camera:{x:c.x,y:c.y,zoom:c.zoom},selection:__ANT_DEBUG__.ui.selection};
    }""")

def exposed(page):
    return page.evaluate("""() => {
      const canvas=document.querySelector('#game-canvas'), w=innerWidth,h=innerHeight;
      const points=[];
      for(let y=4;y<=16;y++)for(let x=4;x<=16;x++){
        const px=w*x/20,py=h*y/20;
        if(document.elementFromPoint(px,py)===canvas)points.push({x:px,y:py});
      }
      points.sort((a,b)=>Math.hypot(a.x-w/2,a.y-h/2)-Math.hypot(b.x-w/2,b.y-h/2));
      return points[0]||null;
    }""")

def map_cell(page, kind):
    return page.evaluate("""kind => {
      const {game,cameras,renderer}=__ANT_DEBUG__,l=game.currentLayer,
        c=cameras[game.layer],w=renderer.width,h=renderer.height;
      let best=null;
      for(let y=1;y<l.height-2;y++)for(let x=1;x<l.width-2;x++){
        const p=c.worldToScreen((x+.5)*28,(y+.5)*28,w,h);
        if(p.x<18||p.x>innerWidth-18||p.y<18||p.y>innerHeight-18)continue;
        if(document.elementFromPoint(p.x,p.y)!==renderer.canvas)continue;
        const terrain=l.cells[y*l.width+x];
        if(kind==='walkable'&&![13,14,15].includes(terrain))continue;
        const open=[0,1,l.width,l.width+1].filter(d=>[13,14,15].includes(l.cells[y*l.width+x+d])).length;
        const score=kind==='walkable'
          ?Math.abs(x-game.colony.queen.x)+Math.abs(y-game.colony.queen.y):-open;
        if(!best||score<best.score)best={x,y,px:p,score};
      }
      return best;
    }""",kind)

def tap(page,p,mobile):
    if mobile: page.touchscreen.tap(p['x'],p['y'])
    else: page.mouse.click(p['x'],p['y'])

def touch(page,frames):
    client=page.context.new_cdp_session(page)
    try:
        for i,points in enumerate(frames):
            event='touchStart' if i==0 else 'touchEnd' if i==len(frames)-1 else 'touchMove'
            client.send('Input.dispatchTouchEvent',{'type':event,'touchPoints':[
                {'x':pt['x'],'y':pt['y'],'id':j+1} for j,pt in enumerate(points)]})
            page.wait_for_timeout(35)
    finally: client.detach()

def layout_issues(page,selectors,w,h):
    return page.evaluate("""([selectors,w,h]) => {
      const issues=[];
      for(const selector of selectors){
        const e=document.querySelector(selector);
        if(!e||e.disabled)continue;
        const s=getComputedStyle(e),r=e.getBoundingClientRect();
        if(s.display==='none'||s.visibility==='hidden'||r.width<2||r.height<2)continue;
        const x=(r.left+r.right)/2,y=(r.top+r.bottom)/2;
        if(x<0||x>=w||y<0||y>=h){issues.push({selector,type:'outside viewport'});continue;}
        const top=document.elementFromPoint(x,y);
        if(top!==e&&!e.contains(top))issues.push({selector,type:'intercepted',by:top?.id||top?.className||top?.tagName});
      }
      return issues;
    }""",[selectors,w,h])

def collisions(page):
    return page.evaluate("""() => {
      const card=document.querySelector('#selection-card'), css=getComputedStyle(card);
      if(css.display==='none'||css.visibility==='hidden')return [];
      const a=card.getBoundingClientRect(),hits=[];
      for(const id of ['#debug-toggle','#zoom-in','#zoom-out','#recenter',
                        '.speed-controls','#u6-dock','#debug-panel']){
        const e=document.querySelector(id),s=getComputedStyle(e);
        if(s.display==='none'||s.visibility==='hidden')continue;
        const b=e.getBoundingClientRect();
        if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>2&&
           Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>2)hits.push(id);
      }
      return hits;
    }""")

def audit_view(browser,html,spec,artifacts):
    name,w,h,mobile=spec
    folder=artifacts/name
    folder.mkdir(parents=True,exist_ok=True)
    result={'device':name,'viewport':[w,h],'touch':mobile,'seed':'ANT-001',
            'cases':[],'screenshots':[],'page_errors':[],'console_errors':[]}
    context=browser.new_context(viewport={'width':w,'height':h},device_scale_factor=1,
                                is_mobile=mobile,has_touch=mobile,reduced_motion='reduce')
    page=context.new_page()
    page.set_default_timeout(4500)
    page.on('pageerror',lambda error:result['page_errors'].append(str(error)))
    page.on('console',lambda msg:result['console_errors'].append(msg.text) if msg.type=='error' else None)
    def screenshot(label):
        dest=folder/f'{label}.png'
        page.screenshot(path=str(dest),full_page=False,timeout=8000)
        result['screenshots'].append(str(dest))
    def test(label,fn):
        try:
            details=fn()
            result['cases'].append({'case':label,'status':'PASS','observed':details})
            print(f'  PASS {label}',flush=True)
        except Exception as exc:
            result['cases'].append({'case':label,'status':'FAIL','error':str(exc),
                                    'trace':traceback.format_exc(limit=5)})
            print(f'  FAIL {label}: {exc}',flush=True)
            try:screenshot('fail-'+str(len(result['cases'])))
            except Exception:pass

    print(f'{name}: {w}x{h} ({"touch" if mobile else "mouse"})',flush=True)
    try:
        page.set_content(html,wait_until='domcontentloaded')
        page.wait_for_function('Boolean(__ANT_DEBUG__?.game?.combat && document.querySelector("#room-picker-toggle"))',timeout=12000)
        page.wait_for_timeout(150)
        screenshot('initial')

        def canvas():
            c=page.locator('#game-canvas')
            assert c.is_visible()
            dims=page.evaluate("""() => {
              const el=document.querySelector('#game-canvas'),ctx=el.getContext('2d');
              return {width:el.width,height:el.height,
                alpha:ctx.getImageData(Math.floor(el.width/2),Math.floor(el.height/2),1,1).data[3],
                touchAction:getComputedStyle(el).touchAction};
            }""")
            assert dims['width']>0 and dims['height']>0 and dims['alpha']>0, dims
            assert dims['touchAction']=='none',dims
            assert page.locator('#u6-open').is_visible()
            return dims
        test('production canvas renders live game',canvas)

        def ant_inspection():
            # Real touch/mouse action on the rendered queen; CSS owns the details card.
            page.locator('#tool-inspect').click()
            if page.locator('#selection-card').is_visible():
                page.locator('#selection-close').click()
            pos=page.evaluate("""() => {
              const {game,cameras,renderer}=__ANT_DEBUG__,q=game.colony.queen;
              const c=cameras[game.layer],w=renderer.width,h=renderer.height;
              const origin={x:c.x,y:c.y};
              c.x=(q.x+.5)*28;c.y=(q.y+.5)*28;
              c.clamp(game.currentLayer,w,h);
              const point=c.worldToScreen((q.x+.5)*28,(q.y+.5)*28,w,h);
              const element=document.elementFromPoint(point.x,point.y);
              return {origin,point,hit:element?.id,antId:q.id};
            }""")
            try:
                assert pos['hit']=='game-canvas',('queen not touch accessible',pos)
                tap(page,pos['point'],mobile)
                assert page.locator('#selection-card').is_visible()
                assert page.locator('#selection-ants').is_visible()
                assert page.locator('#selection-ant-detail').is_visible()
                state=page.evaluate("""() => ({
                  id:__ANT_DEBUG__.ui.selectedAntId,
                  card:document.querySelector('#selection-card').dataset.inspecting,
                  display:getComputedStyle(document.querySelector('#selection-ants')).display,
                  text:document.querySelector('#selection-ant-detail').textContent
                })""")
                assert state['id']==pos['antId'],state
                assert state['card']=='ant' and state['display']=='grid',state
                assert 'นางพญา' in state['text'],state
                screenshot('ant-inspector-css')
                page.locator('#selection-close').click()
                assert page.locator('#selection-card').is_hidden()
                return {'ant':state['id'],'card_style':state['display'],'close':'PASS'}
            finally:
                page.evaluate("""origin => {
                  const {game,cameras,renderer}=__ANT_DEBUG__,c=cameras[game.layer];
                  c.x=origin.x;c.y=origin.y;
                  c.clamp(game.currentLayer,renderer.width,renderer.height);
                }""",pos['origin'])
        test('styled ant inspection by real canvas touch and close',ant_inspection)

        def navigation():
            page.locator('#tool-inspect').click()
            visible_controls=name in ('tablet','desktop')
            camera_buttons=('#zoom-in','#zoom-out','#recenter')
            # CSS deliberately removes these controls on phones and landscape.
            # Never force-click a hidden button or mistake it for an input failure.
            for selector in camera_buttons:
                actual=page.locator(selector).is_visible()
                assert actual is visible_controls, (
                    name,selector,'expected visible' if visible_controls else 'expected hidden',actual)

            before=inspect(page)['camera']
            button_zoom=None
            if visible_controls:
                page.locator('#zoom-in').click()
                enlarged=inspect(page)['camera']['zoom']
                assert enlarged>before['zoom'],(before,enlarged)
                page.locator('#zoom-out').click()
                restored=inspect(page)['camera']['zoom']
                assert restored<enlarged,(enlarged,restored)
                button_zoom={'before':before['zoom'],'zoom_in':enlarged,'zoom_out':restored}

            start=exposed(page)
            assert start,('no exposed canvas',name)
            end={'x':start['x']+35,'y':start['y']}
            assert page.evaluate("""p =>
              document.elementFromPoint(p.x,p.y)===document.querySelector('#game-canvas')
            """,end),('no unobstructed pan destination',name,start,end)
            old=inspect(page)['camera']
            if mobile:
                touch(page,[[start],[{'x':start['x']+17,'y':start['y']}],[end],[]])
            else:
                page.mouse.move(start['x'],start['y'])
                page.mouse.down()
                page.mouse.move(end['x'],end['y'],steps=4)
                page.mouse.up()
            new=inspect(page)['camera']
            assert abs(new['x']-old['x'])>0.1 or abs(new['y']-old['y'])>0.1,(
                'canvas pan did not affect camera',name,old,new)

            centered=None
            if visible_controls:
                page.locator('#recenter').click()
                # Recenter is entrance-targeted, then Camera.clamp() constrains
                # both axes using the active map extent and current zoom.
                # Recompute the *independent* expected coordinates; do not
                # assign to camera or call its clamp() method in the test.
                e=page.evaluate("""() => {
                  const {game:g,cameras,renderer}=__ANT_DEBUG__;
                  const t=g.world.entrances[0][g.layer], l=g.currentLayer;
                  const zoom=cameras[g.layer].zoom, TILE=28;
                  const halfW=renderer.width/(2*zoom),halfH=renderer.height/(2*zoom);
                  const maxX=l.width*TILE,maxY=l.height*TILE;
                  const clamp=(p,half,max) =>
                    2*half>=max ? max/2 : Math.max(half,Math.min(max-half,p));
                  const target={x:(t.x+.5)*TILE,y:(t.y+.5)*TILE};
                  return {target,expected:{
                    x:clamp(target.x,halfW,maxX),y:clamp(target.y,halfH,maxY)
                  },zoom,canvas:[renderer.width,renderer.height],
                  map:[l.width,l.height]};
                }""")
                centered=inspect(page)['camera']
                assert abs(centered['x']-e['expected']['x'])<1 and abs(centered['y']-e['expected']['y'])<1,(
                    'recenter did not reach clamped entrance',centered,e)
            return {'method':'touch' if mobile else 'mouse','button_controls_visible':visible_controls,
                    'buttons':button_zoom,'before':before,'dragged':new,'recenter':centered}
        test('camera pan, responsive zoom/recenter controls',navigation)

        def gestures():
            page.locator('#tool-inspect').click()
            point=exposed(page);assert point,'no map touch point'
            before=inspect(page)['camera']['zoom']
            if mobile:
                x,y=point['x'],point['y']
                safe=page.evaluate("""([x,y]) => {
                  const c=document.querySelector('#game-canvas');
                  return [25,45].every(d=>document.elementFromPoint(x-d,y)===c&&document.elementFromPoint(x+d,y)===c);
                }""",[x,y])
                assert safe,point
                touch(page,[[{'x':x-25,'y':y},{'x':x+25,'y':y}],
                            [{'x':x-35,'y':y},{'x':x+35,'y':y}],
                            [{'x':x-45,'y':y},{'x':x+45,'y':y}],[]])
            else:
                page.mouse.move(point['x'],point['y'])
                page.mouse.wheel(0,-240)
            after=inspect(page)['camera']['zoom']
            assert after>before+0.005,(before,after)
            guarded=page.evaluate("""() => !document.getElementById('seed-button').dispatchEvent(
              new WheelEvent('wheel',{ctrlKey:true,bubbles:true,cancelable:true,deltaY:-100}))""")
            assert guarded,'Browser page ctrl-wheel not prevented'
            assert page.evaluate('Math.abs(visualViewport.scale-1)<0.01')
            return {'gesture':'pinch' if mobile else 'wheel','before':before,'after':after}
        test('device pinch/wheel and browser zoom guard',gestures)

        def layers_speed():
            page.wait_for_function('__ANT_DEBUG__.game.clock.ticks>0',timeout=5000)
            page.locator('#pause-button').click()
            frozen=inspect(page)
            page.locator('#surface-button').click()
            assert inspect(page)['layer']=='surface'
            assert page.locator('#tool-dig').is_disabled()
            page.locator('#underground-button').click()
            now=inspect(page)
            assert now['layer']=='underground' and now['ticks']==frozen['ticks'] and now['seed']==frozen['seed'],(now,frozen)
            page.locator('[data-speed="2"]').click()
            assert inspect(page)['speed']==2 and page.locator('[data-speed="2"]').get_attribute('aria-pressed')=='true'
            page.locator('#pause-button').click()
            ticks=inspect(page)['ticks']
            page.wait_for_timeout(200)
            assert inspect(page)['speed']==0 and inspect(page)['ticks']==ticks
            page.locator('[data-speed="1"]').click()
            return {'ticks_before':frozen['ticks'],'ticks_after_layer':now['ticks'],'paused_at':ticks}
        test('surface/underground keeps world; pause/speed state',layers_speed)

        def staff():
            before=inspect(page)
            page.locator('#workforce-open').click()
            assert page.locator('#colony-panel').is_visible()
            assert page.locator('#workforce-open').get_attribute('aria-expanded')=='true'
            # Repeating the same HUD action must close the sheet and return to
            # inspect; it must never enqueue a dig, room or change game state.
            before_orders=inspect(page)['rooms']
            page.locator('#workforce-open').click()
            assert page.locator('#colony-panel').is_hidden()
            assert page.locator('#workforce-open').get_attribute('aria-expanded')=='false'
            assert page.locator('#tool-inspect').get_attribute('aria-pressed')=='true'
            assert inspect(page)['rooms']==before_orders
            page.locator('#workforce-open').click()
            assert page.locator('#colony-panel').is_visible()
            # The new roster reads permanent castes, not percentage quotas.
            assert page.locator('#caste-report table tbody tr').count()==6
            assert '5' in page.locator('#caste-report .starter-row').inner_text()
            assert not page.locator('.workforce-editor').is_visible()
            assert inspect(page)['foragers']==before['foragers']
            assert inspect(page)['nurses']==before['nurses']
            page.locator('#close-colony').click()
            assert page.locator('#workforce-open').get_attribute('aria-expanded')=='false'
            return {'foragers':before['foragers'],'nurses':before['nurses'],'castes':'permanent'}
        test('permanent caste roster and HUD toggle are non-mutating',staff)

        def room_picker():
            page.locator('#tool-dig').click()
            assert page.locator('#tool-dig').get_attribute('aria-pressed')=='true'
            # Clicking the active tool again restores inspect; no dig order is sent.
            original_orders=inspect(page)
            page.locator('#tool-dig').click()
            assert page.locator('#tool-inspect').get_attribute('aria-pressed')=='true'
            assert page.evaluate('()=>__ANT_DEBUG__.ui.tool')=='inspect'
            assert page.locator('#room-palette').is_hidden()
            page.locator('#tool-dig').click()
            assert page.locator('#tool-dig').get_attribute('aria-pressed')=='true'
            page.locator('#tool-room').click()
            assert page.locator('#room-palette').is_visible()
            # Room tool also behaves as a toggle without changing construction queue.
            rooms_before=inspect(page)['rooms']
            page.locator('#tool-room').click()
            assert page.locator('#tool-inspect').get_attribute('aria-pressed')=='true'
            assert page.locator('#room-palette').is_hidden()
            assert inspect(page)['rooms']==rooms_before
            page.locator('#tool-room').click()
            assert page.locator('#room-palette').is_visible()
            toggle=page.locator('#room-picker-toggle')
            toggle.click()
            assert page.locator('#room-picker-options').is_visible()
            assert not layout_issues(page,['[data-room-value="water_store"]'],w,h)
            page.locator('[data-room-value="water_store"]').click()
            assert page.locator('#room-type').input_value()=='water_store'
            assert 'ใช้' in page.locator('#room-cost').inner_text()
            toggle.click()
            page.keyboard.press('Escape')
            assert page.locator('#room-picker-options').is_hidden()
            page.locator('#tool-inspect').click()
            assert page.locator('#tool-inspect').get_attribute('aria-pressed')=='true'
            return {'room_type':page.locator('#room-type').input_value()}
        test('dig/room/inspect and authoritative room picker',room_picker)

        def selection():
            # Freeze moving ants and camera-dependent focus while exercising a
            # deterministic same-cell tap; restore live gameplay immediately after.
            prior_speed=page.evaluate('''() => {
              const game=__ANT_DEBUG__.game,speed=game.clock.speed;
              game.setSpeed(0);return speed;
            }''')
            try:
                page.locator('#tool-inspect').click()
                p=exposed(page);assert p,'no exposed map tile'
                tap(page,p,mobile)
                assert page.locator('#selection-card').is_visible()
                s=inspect(page)['selection']
                assert s and f'X:{s["x"]}' in page.locator('#selection-coords').inner_text(),s
                # Information can legitimately cover the initially chosen pixel.
                # Choose a different *physically tappable* canvas point, then retap
                # exactly that tile. Do not hide the panel or bypass real pointers.
                top=page.evaluate('''p => document.elementFromPoint(p.x,p.y)?.id''',p)
                if top!='game-canvas':
                    # Screen pixels near a selected tile can still map to the same
                    # logical tile. Require a different tile and a visible map
                    # hit target; otherwise the new toggle correctly closes it.
                    p=page.evaluate("""selected => {
                      const {game,cameras,renderer}=__ANT_DEBUG__;
                      const c=cameras[game.layer],canvas=renderer.canvas;
                      const pixels=[];
                      for(let y=4;y<=16;y++)for(let x=4;x<=16;x++){
                        const px=innerWidth*x/20,py=innerHeight*y/20;
                        if(document.elementFromPoint(px,py)!==canvas)continue;
                        const tile=c.screenToCell(px,py,renderer.width,renderer.height);
                        if(tile.x===selected.x&&tile.y===selected.y)continue;
                        pixels.push({x:px,y:py,rank:Math.abs(px-innerWidth/2)+Math.abs(py-innerHeight/2)});
                      }
                      pixels.sort((a,b)=>a.rank-b.rank);
                      return pixels[0]||null;
                    }""",s)
                    assert p,('no distinct unobstructed map tile after opening info')
                    tap(page,p,mobile)
                    s=inspect(page)['selection']
                    assert s and page.locator('#selection-card').is_visible()
                top=page.evaluate('''p => document.elementFromPoint(p.x,p.y)?.id''',p)
                assert top=='game-canvas',('selected map tile remains obscured',top,p)
                # Re-tap the identical map tile: hide and clear its selection, not game state.
                tap(page,p,mobile)
                assert page.locator('#selection-card').is_hidden(), ('same-cell tap did not close card',s,p,inspect(page)['selection'])
                assert inspect(page)['selection'] is None
                tap(page,p,mobile)
                assert page.locator('#selection-card').is_visible()
                again=inspect(page)['selection']
                assert again==s,('tapping again did not reselect same tile',again,s)
                assert not collisions(page),collisions(page)
                screenshot('selection')
                page.locator('#debug-toggle').click()
                assert page.locator('#debug-panel').is_visible()
                assert not collisions(page),collisions(page)
                screenshot('selection-debug')
                page.locator('#debug-toggle').click()
                assert page.locator('#selection-card').is_visible()
                page.locator('#selection-close').click()
                assert page.locator('#selection-card').is_hidden()
                return {'selected':s}
            finally:
                page.evaluate('(speed) => __ANT_DEBUG__.game.setSpeed(speed)',prior_speed)
        test('tile card, overlays, debug and close',selection)

        # Fixture uses the production Game/Rooms interface and known ANT-001
        # chamber. The same deterministic stock injection is used by U5 tests.
        # It never replaces the gameplay queue or event listener with a stub.
        room_fixture = {}
        def room_valid():
            page.locator('#tool-room').click()
            toggle=page.locator('#room-picker-toggle')
            toggle.click()
            page.locator('[data-room-value="food_store"]').click()
            assert page.locator('#room-type').input_value()=='food_store'

            info=page.evaluate("""() => {
              const {game:g,cameras,renderer}=__ANT_DEBUG__;
              g.colony.setForageSlots(0);
              g.lifecycle.setNurseSlots(0);
              g.foraging.inventory.carbs=15;
              g.foraging.inventory.protein=15;
              g.rooms.syncInventory();
              const q=g.colony.queen,c=cameras[g.layer],x=q.x+2,y=q.y;
              c.x=(q.x+.5)*28;
              c.y=(q.y+(renderer.height<650?2.5:.5))*28;
              c.clamp(g.currentLayer,renderer.width,renderer.height);
              const pos=c.worldToScreen((x+.5)*28,(y+.5)*28,renderer.width,renderer.height);
              const valid=g.rooms.validate('food_store',x,y);
              const hit=document.elementFromPoint(pos.x,pos.y);
              return {seed:g.world.seedLabel,x,y,pos,valid,
                hit:hit?.id||hit?.className||hit?.tagName,
                before:g.rooms.queuedCount};
            }""")
            assert info['seed']=='ANT-001',info
            assert info['valid']['ok'],('fixture invalid',info)
            assert info['hit']=='game-canvas',('room target intercepted',info)
            assert 0<info['pos']['x']<w and 0<info['pos']['y']<h,info
            tap(page,info['pos'],mobile)
            after=inspect(page)['rooms']
            assert after==info['before']+1,('room not queued',info,after,
                page.locator('#toast').inner_text())
            selected=inspect(page)['selection']
            assert selected and (selected['x'],selected['y'])==(info['x'],info['y']),selected
            assert page.locator('#selection-room').is_visible()
            assert page.locator('#cancel-room').is_visible()
            room=page.evaluate("""([x,y]) => {
              const r=__ANT_DEBUG__.game.rooms.getRoom(x,y);
              return r?{id:r.id,type:r.type,status:r.status}:null;
            }""",[info['x'],info['y']])
            assert room and room['type']=='food_store' and room['status'] in ('planned','building'),room
            room_fixture.update({**info,'room':room})
            screenshot('room-success')
            return {'fixture':{'seed':info['seed'],'x':info['x'],'y':info['y']},
                    'queued_before':info['before'],'queued_after':after,'room':room}

        test('room SUCCESS: funded valid 2x2 queues exactly one room',room_valid)

        def room_invalid():
            assert room_fixture, 'successful-placement fixture must exist'
            info=room_fixture
            before=inspect(page)['rooms']
            invalid=page.evaluate("""([x,y]) =>
              __ANT_DEBUG__.game.rooms.validate('food_store',x,y)
            """,[info['x'],info['y']])
            assert invalid['ok'] is False and invalid['reason']=='overlap',invalid
            assert page.locator('#room-type').input_value()=='food_store'
            # Dismiss the previous success card so the second tap must reach
            # the real canvas rather than a floating overlay.
            page.locator('#selection-close').click()
            top=page.evaluate("""p => document.elementFromPoint(p.x,p.y)?.id""",info['pos'])
            assert top=='game-canvas',('invalid tile tap intercepted',top,info['pos'])
            tap(page,info['pos'],mobile)
            after=inspect(page)['rooms']
            assert after==before,('invalid placement unexpectedly queued',before,after)
            room=page.evaluate("""([x,y]) => {
              const r=__ANT_DEBUG__.game.rooms.getRoom(x,y);
              return r?{id:r.id,type:r.type}:null;
            }""",[info['x'],info['y']])
            assert room and room['id']==info['room']['id'],('original room changed',room)
            actual_toast=page.locator('#toast').inner_text()
            assert actual_toast=='พื้นที่มีห้องอยู่แล้ว',(
                'wrong overlap rejection feedback',actual_toast)
            screenshot('room-invalid')
            page.locator('#tool-inspect').click()
            return {'seed':info['seed'],'x':info['x'],'y':info['y'],
                    'reason':invalid['reason'],'queued_before':before,'queued_after':after}

        test('room REJECT: overlapping placement adds no room',room_invalid)

        def army():
            dialog=page.locator('#u6-dialog')
            page.locator('#u6-open').click()
            try:
                assert dialog.is_visible() and dialog.evaluate('(el)=>el.open')
                count=page.locator('#u6-roster .u6-unit').count()
                assert count==inspect(page)['workers'],count
                initial=inspect(page)['soldiers']
                assert page.locator('#u6-roster .u6-unit.is-soldier').count()==initial
                assert page.locator('#u6-roster button[data-action="recruit"]').count()==0
                assert page.locator('#u6-roster button[data-action="demobilize"]').count()==0
                # Permanent soldiers come from hatch orders, not hidden percentage sliders.
                assert not page.locator('.u6-percent-control').is_visible()
                assert inspect(page)['slots']==initial
                assert page.evaluate("""() => __ANT_DEBUG__.game.colony.workers.every(
                  ant=>ant.profession!=='soldier' || ant.combatRole==='soldier')""")
                box=dialog.bounding_box()
                assert box and box['x']>=-1 and box['y']>=-1 and box['x']+box['width']<=w+1 and box['y']+box['height']<=h+1,box
                screenshot('military')
                return {'units':count,'soldiers':initial,'dialog':box,'castes':'permanent'}
            finally:
                if dialog.evaluate('(el)=>el.open'):
                    page.locator('#u6-close').click()
                assert dialog.is_hidden() and not dialog.evaluate('(el)=>el.open')

        test('permanent soldier roster and military modal bounds',army)

        def styled_army_inspector():
            dialog=page.locator('#u6-dialog')
            page.locator('#u6-open').click()
            try:
                assert dialog.is_visible() and dialog.evaluate('(el)=>el.open')
                trigger=page.locator('#u6-roster-filter')
                assert trigger.evaluate('(el)=>el.tagName')=='BUTTON'
                assert page.locator('#u6-dialog select#u6-roster-filter').count()==0
                assert trigger.get_attribute('aria-expanded')=='false'
                trigger.click()
                menu=page.locator('#u6-filter-options')
                assert menu.is_visible() and trigger.get_attribute('aria-expanded')=='true'
                choice=page.locator('[data-u6-filter="workers"]')
                assert choice.is_visible() and choice.evaluate(
                    '(el)=>getComputedStyle(el).minHeight')=='44px'
                choice.click()
                assert menu.is_hidden() and trigger.get_attribute('aria-expanded')=='false'
                assert page.locator('#u6-filter-current').inner_text()=='มดงาน'
                expected=page.evaluate("""() => __ANT_DEBUG__.game.colony.workers.filter(
                  ant=>ant.combatRole!=='soldier').length""")
                assert page.locator('#u6-roster .u6-unit').count()==expected
                trigger.click()
                page.locator('[data-u6-filter="all"]').click()
                total=inspect(page)['workers']
                assert page.locator('#u6-roster .u6-unit').count()==total
                assert dialog.evaluate('(el)=>el.open'), 'filter must not close squad dialog'
                detail=page.locator('#u6-ant-detail')
                locate=page.locator('#u6-roster button[data-action="focus"]').first
                ant_id=locate.get_attribute('data-id')
                locate.click()
                assert detail.is_visible()
                assert dialog.evaluate('(el)=>el.open'),'view ant must stay within styled UI'
                assert page.locator('#u6-ant-title').inner_text().startswith('มด #')
                assert ant_id.replace('worker-','') in page.locator('#u6-ant-title').inner_text()
                assert page.locator('#u6-ant-state').inner_text()
                assert page.locator('#u6-ant-position').inner_text()
                page.locator('#u6-ant-detail-close').click()
                assert detail.is_hidden()
                page.locator('#u6-roster button[data-action="focus"]').first.click()
                assert detail.is_visible()
                page.locator('#u6-ant-follow').click()
                assert not dialog.evaluate('(el)=>el.open')
                selection=page.evaluate("""() => ({
                  ant:__ANT_DEBUG__.ui.selectedAntId,
                  card:!document.querySelector('#selection-card').classList.contains('hidden')
                })""")
                assert selection['ant']==ant_id and selection['card'],selection
                page.locator('#selection-close').click()
                return {'filter':'custom CSS','total_ants':total,
                        'worker_filter':expected,'selected_ant':ant_id}
            finally:
                if dialog.evaluate('(el)=>el.open'):
                    page.locator('#u6-close').click()
        test('CSS military filter and inline ant details, actual touch',styled_army_inspector)

        def rally():
            # Only the tablet/desktop expose Recenter; on phones/landscape
            # the player must be able to set a rally via touch on the live map.
            has_recenter=page.locator('#recenter').is_visible()
            assert has_recenter is (name in ('tablet','desktop')),(
                'unexpected recenter visibility',name,has_recenter)
            if has_recenter:
                page.locator('#recenter').click()
            if page.locator('#selection-card').is_visible():
                page.locator('#selection-close').click()
            page.locator('#tool-inspect').click()
            page.locator('#u6-quick-rally').click()
            assert page.locator('#u6-target-tip').is_visible()
            page.locator('#u6-cancel-target').click()
            assert page.locator('#u6-target-tip').is_hidden()
            assert page.locator('#u6-quick-rally').get_attribute('aria-pressed')=='false'

            page.locator('#u6-quick-rally').click()
            assert page.locator('#u6-target-tip').is_visible()
            assert page.locator('#u6-quick-rally').get_attribute('aria-pressed')=='true'
            cell=map_cell(page,'walkable')
            # If the current camera has no unobstructed walkable tile,
            # search using genuine canvas pan, not a direct camera write.
            if not cell:
                for direction in (-1,1,-1,1):
                    origin=exposed(page)
                    assert origin,('no exposed canvas for rally panning',name)
                    dest={'x':origin['x']+direction*24,'y':origin['y']}
                    if not page.evaluate("""p =>
                      document.elementFromPoint(p.x,p.y)===document.querySelector('#game-canvas')
                    """,dest):
                        continue
                    if mobile:
                        touch(page,[[origin],[dest],[]])
                    else:
                        page.mouse.move(origin['x'],origin['y'])
                        page.mouse.down()
                        page.mouse.move(dest['x'],dest['y'],steps=4)
                        page.mouse.up()
                    cell=map_cell(page,'walkable')
                    if cell:break
            assert cell,('no exposed walkable rally target after user-accessible pan',name)
            actual_hit=page.evaluate("""p => document.elementFromPoint(p.x,p.y)?.id""",cell['px'])
            assert actual_hit=='game-canvas',('rally tile intercepted',name,cell,actual_hit)
            tap(page,cell['px'],mobile)
            state=inspect(page)
            target=state['rally']
            assert target and (target['x'],target['y'],target['layer'])==(
                cell['x'],cell['y'],state['layer']),('rally target mismatch',state,cell)
            assert state['mode']=='rally',('rally mode not engaged',state)
            assert page.locator('#u6-target-tip').is_hidden()
            assert page.locator('#u6-quick-rally').get_attribute('aria-pressed')=='false'
            page.locator('#u6-quick-defend').click()
            assert inspect(page)['mode']=='defend'
            return {'rally':target,'target':[cell['x'],cell['y']],
                    'input':'touch' if mobile else 'mouse',
                    'recenter_clicked':has_recenter}
        test('rally target via visible controls, map touch and cancel',rally)

        def responsive_errors():
            controls=['#tool-inspect','#tool-dig','#tool-room','#workforce-open',
                      '#zoom-in','#zoom-out','#recenter',
                      '#pause-button','[data-speed="2"]','#debug-toggle','#seed-button',
                      '#surface-button','#underground-button','#u6-open',
                      '#u6-quick-rally','#u6-quick-defend']
            issues=layout_issues(page,controls,w,h)
            assert not issues,issues
            assert not result['page_errors'],result['page_errors']
            assert not result['console_errors'],result['console_errors']
            return {'checked_controls':len(controls),'js_errors':0}
        test('layout hit testing, JS exceptions and console errors',responsive_errors)
        screenshot('final')
        result['final_state']=inspect(page)
    except Exception as exc:
        result['fatal']=str(exc)
        result['fatal_trace']=traceback.format_exc(limit=7)
        print('  FATAL:',exc,flush=True)
        try:screenshot('fatal')
        except Exception:pass
    finally:
        result['pass_count']=sum(x['status']=='PASS' for x in result['cases'])
        result['fail_count']=sum(x['status']=='FAIL' for x in result['cases'])+int('fatal' in result)
        (folder/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
        context.close()
    return result

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--artifacts',type=Path)
    parser.add_argument('--chromium')
    args=parser.parse_args()
    artifacts=(args.artifacts or Path(tempfile.mkdtemp(prefix='ant-p1-ui-'))).resolve()
    artifacts.mkdir(parents=True,exist_ok=True)
    # The checkout may be a synthetic GitHub PR merge ref, not main.
    # Record only SHA information measured from this filesystem.
    import subprocess
    head=subprocess.run(['git','rev-parse','HEAD'],cwd=ROOT,capture_output=True,
                        text=True,check=False)
    tested_sha=head.stdout.strip() if head.returncode==0 else None
    source_ref=os.getenv('GITHUB_REF') or None
    report={'task':'R2-UIQA-HARNESS-01','tested_sha':tested_sha,
            'git_ref':source_ref,
            'checkout_kind':'pr_merge' if source_ref and source_ref.startswith('refs/pull/')
                            else 'checkout' if tested_sha else 'unavailable',
            'artifacts':str(artifacts),'viewports':[]}
    try:
        html=production_html()
        binary=args.chromium or os.getenv('CHROMIUM_PATH') or next(
            (shutil.which(name) for name in ('chromium','chromium-browser','google-chrome','google-chrome-stable')
             if shutil.which(name)),None)
        with sync_playwright() as pw:
            opts={'executable_path':binary} if binary else {}
            browser=pw.chromium.launch(headless=True,args=['--no-sandbox'],**opts)
            try:
                report['chromium']=browser.version
                for spec in VIEWPORTS:
                    report['viewports'].append(audit_view(browser,html,spec,artifacts))
            finally:browser.close()
    except Exception as exc:
        report['blocked']=str(exc)
        report['trace']=traceback.format_exc(limit=8)
        print('NOT RUN:',exc,file=sys.stderr)
    (artifacts/'summary.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    failures=sum(x['fail_count'] for x in report['viewports'])
    print(f'Finished {len(report["viewports"])}/5 viewports; failures={failures}; artifacts={artifacts}')
    return 2 if 'blocked' in report or len(report['viewports'])!=5 else (1 if failures else 0)

if __name__=='__main__':
    sys.exit(main())
