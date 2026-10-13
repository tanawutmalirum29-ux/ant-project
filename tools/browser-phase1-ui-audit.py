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

        def navigation():
            page.locator('#tool-inspect').click()
            before=inspect(page)['camera']
            page.locator('#zoom-in').click()
            assert inspect(page)['camera']['zoom']>before['zoom']
            page.locator('#zoom-out').click()
            start=exposed(page)
            assert start,'no exposed canvas'
            end={'x':start['x']+35,'y':start['y']}
            assert page.evaluate("""p=>document.elementFromPoint(p.x,p.y)===document.querySelector('#game-canvas')""",end)
            old=inspect(page)['camera']
            if mobile:touch(page,[[start],[{'x':start['x']+17,'y':start['y']}],[end],[]])
            else:
                page.mouse.move(start['x'],start['y'])
                page.mouse.down()
                page.mouse.move(end['x'],end['y'],steps=4)
                page.mouse.up()
            new=inspect(page)['camera']
            assert abs(new['x']-old['x'])>0.1 or abs(new['y']-old['y'])>0.1,(old,new)
            page.locator('#recenter').click()
            e=page.evaluate("""() => {
              const g=__ANT_DEBUG__.game,t=g.world.entrances[0][g.layer];
              return {x:(t.x+.5)*28,y:(t.y+.5)*28};
            }""")
            centered=inspect(page)['camera']
            assert abs(centered['x']-e['x'])<1 and abs(centered['y']-e['y'])<1,(centered,e)
            return {'before':before,'dragged':new,'recenter':centered}
        test('camera pan, zoom buttons and recenter',navigation)

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
            page.locator('#forage-plus').click()
            assert inspect(page)['foragers']==min(before['workers'],before['foragers']+1)
            page.locator('#forage-minus').click()
            assert inspect(page)['foragers']==before['foragers']
            page.locator('#nurse-plus').click()
            assert inspect(page)['nurses']==min(before['workers'],before['nurses']+1)
            page.locator('#nurse-minus').click()
            assert inspect(page)['nurses']==before['nurses']
            return {'foragers':before['foragers'],'nurses':before['nurses']}
        test('forager/nurse allocation buttons',staff)

        def room_picker():
            page.locator('#tool-dig').click()
            assert page.locator('#tool-dig').get_attribute('aria-pressed')=='true'
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
            page.locator('#tool-inspect').click()
            p=exposed(page);assert p,'no exposed map tile'
            tap(page,p,mobile)
            assert page.locator('#selection-card').is_visible()
            s=inspect(page)['selection']
            assert s and f'X:{s["x"]}' in page.locator('#selection-coords').inner_text(),s
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
        test('tile card, overlays, debug and close',selection)

        def room_gameplay():
            page.locator('#tool-room').click()
            cell=map_cell(page,'room');assert cell,'no uncovered room site'
            before=inspect(page)['rooms']
            tap(page,cell['px'],mobile)
            after=inspect(page)['rooms']
            message=page.locator('#toast').inner_text()
            assert inspect(page)['selection'] is not None
            assert after==before+1 or (after==before and bool(message)),(before,after,message)
            page.locator('#tool-inspect').click()
            return {'x':cell['x'],'y':cell['y'],'queued_before':before,'queued_after':after,
                    'feedback':message,'outcome':'queued' if after>before else 'rejected by game'}
        test('room placement calls real game validation/queue',room_gameplay)

        def army():
            page.locator('#u6-open').click()
            assert page.locator('#u6-dialog').is_visible()
            count=page.locator('#u6-roster .u6-unit').count()
            assert count==inspect(page)['workers'],count
            initial=inspect(page)['soldiers']
            assert page.locator('#u6-roster .u6-unit.is-soldier').count()==initial
            recruit=page.locator('#u6-roster button[data-action="recruit"]:not([disabled])')
            assert recruit.count()>0
            recruit.first.click()
            assert inspect(page)['soldiers']==initial+1
            page.locator('#u6-roster button[data-action="demobilize"]').last.click()
            assert inspect(page)['soldiers']==initial
            slots=inspect(page)['slots']
            page.locator('#u6-plus').click()
            assert inspect(page)['slots']==slots+1
            page.locator('#u6-minus').click()
            assert inspect(page)['slots']==slots
            box=page.locator('#u6-dialog').bounding_box()
            assert box and box['x']>=-1 and box['y']>=-1 and box['x']+box['width']<=w+1 and box['y']+box['height']<=h+1,box
            screenshot('military')
            page.locator('#u6-close').click()
            assert page.locator('#u6-dialog').is_hidden()
            return {'units':count,'soldiers':initial,'dialog':box}
        test('combat roster, enlist, discharge and modal bounds',army)

        def rally():
            page.locator('#recenter').click()
            page.locator('#u6-quick-rally').click()
            assert page.locator('#u6-target-tip').is_visible()
            page.locator('#u6-cancel-target').click()
            assert page.locator('#u6-target-tip').is_hidden()
            page.locator('#u6-quick-rally').click()
            cell=map_cell(page,'walkable');assert cell,'no exposed walkable target'
            tap(page,cell['px'],mobile)
            r=inspect(page)['rally']
            assert r and r['x']==cell['x'] and r['y']==cell['y'],(r,cell)
            assert page.locator('#u6-target-tip').is_hidden()
            page.locator('#u6-quick-defend').click()
            assert inspect(page)['mode']=='defend'
            return {'rally':r,'target':[cell['x'],cell['y']]}
        test('rally select/cancel and defend mode',rally)

        def responsive_errors():
            controls=['#tool-inspect','#tool-dig','#tool-room','#forage-plus','#forage-minus',
                      '#nurse-plus','#nurse-minus','#zoom-in','#zoom-out','#recenter',
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
    report={'task':'P1-UI-01','main_sha':'d508a7fd96a2d8b9dbee2ef05f40d4ee7f5eb237',
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
