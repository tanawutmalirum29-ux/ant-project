"""MULTI-SQUAD-V1 real Chromium QA: live A/B controls at 320x568 and 390x844.
Only tests production JS/CSS via existing browser-smoke bundler. No synthetic UI API stubs.
"""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import traceback
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
SIZES=[('small',320,568),('portrait',390,844)]

def production_html():
    smoke=ROOT/'tools/browser-smoke.py'
    contents=smoke.read_text(encoding='utf-8')
    prefix,sep,_=contents.partition('html=bundle_html()')
    assert sep,'production bundler entry not found'
    env={'__file__':str(smoke),'__name__':'_multi_squad_bundle'}
    exec(compile(prefix,str(smoke),'exec'),env)
    html=env['bundle_html']()
    for name in ['v1.css','v2.css','v2-fixes.css']:
        tag=f'<link rel="stylesheet" href="./src/ui/visual/{name}" />'
        assert html.count(tag)==1,(name,'missing production stylesheet')
        html=html.replace(tag,'<style>'+(ROOT/'src/ui/visual'/name).read_text(encoding='utf-8')+'</style>')
    for name in ['page-zoom-guard.js','room-picker.js']:
        tag=f'<script defer src="./src/ui/visual/{name}"></script>'
        assert tag in html,name
        html=html.replace(tag,'<script>'+(ROOT/'src/ui/visual'/name).read_text(encoding='utf-8')+'</script>')
    return html

def current_squad(page,id):
    return page.evaluate("""id => window.__ANT_DEBUG__.game.combat.getSquad(id).data""",id)

def find_tile(page,previous=None):
    """Find a physically exposed walkable tile, close enough to the underground queen."""
    return page.evaluate("""previous => {
      const {game,cameras,renderer}=__ANT_DEBUG__,queen=game.colony.queen;
      const layer=game.currentLayer,camera=cameras[game.layer];
      const w=renderer.width,h=renderer.height,cells=layer.cells;
      const candidates=[];
      for(let y=queen.y-6;y<=queen.y+6;y++)for(let x=queen.x-6;x<=queen.x+6;x++){
        if(x<0||y<0||x>=layer.width||y>=layer.height)continue;
        if(![13,14,15].includes(cells[y*layer.width+x]))continue;
        if(previous&&previous.x===x&&previous.y===y)continue;
        const p=camera.worldToScreen((x+.5)*28,(y+.5)*28,w,h);
        if(p.x<18||p.x>w-18||p.y<165||p.y>h-120)continue;
        if(document.elementFromPoint(p.x,p.y)!==renderer.canvas)continue;
        candidates.push({x,y,px:p,score:Math.abs(x-queen.x)+Math.abs(y-queen.y)});
      }
      candidates.sort((a,b)=>a.score-b.score||a.y-b.y||a.x-b.x);
      return candidates[0]||null;
    }""",previous)

def in_view(page,selector,width,height):
    element=page.locator(selector)
    assert element.is_visible(),('hidden',selector)
    box=element.bounding_box()
    assert box is not None,(selector,'missing bounding box')
    assert box['x']>=-1 and box['y']>=-1 and box['x']+box['width']<=width+1 and box['y']+box['height']<=height+1,(selector,box,width,height)

def run_view(browser,html,name,w,h,root):
    out=root/name
    out.mkdir(parents=True,exist_ok=True)
    evidence={'name':name,'width':w,'height':h,'cases':[],
              'page_errors':[],'console_errors':[],'screenshots':[]}
    context=browser.new_context(viewport={'width':w,'height':h},device_scale_factor=1,
                                is_mobile=True,has_touch=True,reduced_motion='reduce')
    page=context.new_page()
    page.set_default_timeout(6500)
    page.on('pageerror',lambda e:evidence['page_errors'].append(str(e)))
    page.on('console',lambda m:evidence['console_errors'].append(m.text) if m.type=='error' else None)

    def picture(label):
        dest=out/(label+'.png')
        page.screenshot(path=str(dest),full_page=False)
        evidence['screenshots'].append(str(dest.relative_to(root)))

    def check(name,run):
        try:
            observed=run()
            evidence['cases'].append({'name':name,'status':'PASS','observed':observed})
            print(w,h,'PASS',name,flush=True)
        except Exception as exc:
            evidence['cases'].append({'name':name,'status':'FAIL','error':str(exc),
                                      'trace':traceback.format_exc(limit=4)})
            print(w,h,'FAIL',name,str(exc),flush=True)
            try:picture('fail-'+str(len(evidence['cases'])))
            except Exception:pass
            raise
    try:
        page.set_content(html,wait_until='domcontentloaded')
        page.wait_for_function('Boolean(window.__ANT_DEBUG__?.game?.combat?.getSquads && document.querySelector("#u6-open"))',timeout=13000)
        page.locator('#u6-open').click()
        check('squad selector and initial roster',lambda: (
            in_view(page,'[data-u6-squad="A"]',w,h),
            in_view(page,'[data-u6-squad="B"]',w,h),
            page.locator('[data-u6-squad="A"]').get_attribute('aria-pressed')=='true'
                or (_ for _ in ()).throw(AssertionError('A not selected initially')),
            current_squad(page,'B')['count']==0
                or (_ for _ in ()).throw(AssertionError('B not empty initially'))
        ))
        def recruit():
            page.locator('#u6-percent').evaluate("""el=>{el.value='40';el.dispatchEvent(new Event('input',{bubbles:true}))}""")
            page.wait_for_function('window.__ANT_DEBUG__.game.combat.soldiers.length>=2')
            count=page.locator('#u6-roster .u6-unit.is-soldier').count()
            assert count>=2,('needs two actual soldiers',count)
            return {'soldiers':count,'hp':current_squad(page,'A')['hpCurrent']}
        check('real workforce recruits multiple soldiers',recruit)
        def transfer():
            beforeA=current_squad(page,'A')
            button=page.locator('#u6-roster button[data-action="transfer"][data-to-squad="B"]').first
            button.scroll_into_view_if_needed()
            button.click()
            afterB=current_squad(page,'B')
            assert afterB['count']==1,afterB
            assert afterB['soldiers'][0]['id'] in [s['id'] for s in beforeA['soldiers']]
            assert afterB['soldiers'][0]['hp']>0,afterB
            back=page.locator('#u6-roster button[data-action="transfer"][data-to-squad="A"]').first
            back.scroll_into_view_if_needed()
            back.click()
            assert current_squad(page,'B')['count']==0
            button=page.locator('#u6-roster button[data-action="transfer"][data-to-squad="B"]').first
            button.scroll_into_view_if_needed()
            button.click()
            assert current_squad(page,'B')['count']==1
            return {'member':afterB['soldiers'][0]['id'],'hp':afterB['soldiers'][0]['hp'],'round_trip':True}
        check('touch transfer live ant A to B to A and back to B',transfer)
        def commands():
            page.locator('[data-u6-squad="B"]').click()
            assert page.locator('[data-u6-squad="B"]').get_attribute('aria-pressed')=='true'
            page.locator('[data-u6-mode="retreat"]').click()
            assert current_squad(page,'B')['mode']=='retreat'
            assert current_squad(page,'A')['mode']=='defend'
            page.locator('[data-u6-squad="A"]').click()
            page.locator('[data-u6-mode="defend"]').click()
            assert current_squad(page,'B')['mode']=='retreat'
            return {'A':current_squad(page,'A')['mode'],'B':current_squad(page,'B')['mode']}
        check('independent A/B orders, selector via real touch',commands)
        def keyboard():
            b=page.locator('[data-u6-squad="B"]')
            b.focus()
            page.keyboard.press('Enter')
            assert page.locator('[data-u6-squad="B"]').get_attribute('aria-pressed')=='true'
            outline=b.evaluate("""el=>({style:getComputedStyle(el).outlineStyle,width:getComputedStyle(el).outlineWidth})""")
            assert outline['style']!='none' and outline['width']!='0px',outline
            a=page.locator('[data-u6-squad="A"]')
            a.focus()
            page.keyboard.press('Space')
            assert a.get_attribute('aria-pressed')=='true'
            page.keyboard.press('Tab')
            focused=page.evaluate('document.activeElement?.tagName')
            assert focused in ('BUTTON','INPUT','SELECT'),focused
            return {'focus':focused,'outline':outline}
        check('keyboard Enter/Space/Tab and focus indicator',keyboard)
        picture('squad-dialog')
        def arm_and_tap(squad,previous=None):
            page.locator('[data-u6-squad="'+squad+'"]').click()
            page.locator('#u6-rally').click()
            assert page.locator('#u6-target-tip').is_visible()
            assert page.evaluate('window.__ANT_DEBUG__.ui.combatControls.armedSquad')==squad
            # Move camera to queen using the real production debug renderer/camera.
            page.evaluate("""() => {
              const {game,cameras,renderer}=__ANT_DEBUG__,q=game.colony.queen,c=cameras[game.layer];
              c.x=(q.x+.5)*28;c.y=(q.y+.5)*28;
              c.clamp(game.currentLayer,renderer.width,renderer.height);
            }""")
            tile=find_tile(page,previous)
            assert tile is not None,('no exposed reachable map tile',squad)
            page.touchscreen.tap(tile['px']['x'],tile['px']['y'])
            state=current_squad(page,squad)
            assert state['rally'] is not None,(squad,state,tile)
            assert (state['rally']['x'],state['rally']['y'])==(tile['x'],tile['y']),state
            assert state['mode']=='rally',state
            assert not page.locator('#u6-target-tip').is_visible()
            ping=page.evaluate("""() => window.__ANT_DEBUG__.renderer.rallyPing""")
            assert ping is not None,'accepted tap did not show ephemeral Rally Ping'
            page.locator('#u6-open').click()
            return {'tile':{k:tile[k] for k in ('x','y')},'squad':squad}
        first=None
        def rallyA():
            nonlocal first
            first=arm_and_tap('A')
            return first
        check('real touchscreen map rally for Squad A',rallyA)
        check('real touchscreen distinct map rally for Squad B',lambda:arm_and_tap('B',first['tile']))
        def cancel_and_invalid():
            page.locator('[data-u6-squad="B"]').click()
            page.locator('#u6-rally').click()
            old=current_squad(page,'B')['rally']
            ui=page.evaluate("""() => {
              const controls=__ANT_DEBUG__.ui.combatControls;
              const original=__ANT_DEBUG__.renderer.rallyPing;
              const count=__ANT_DEBUG__.game.combat.getSquad('B').data;
              controls.placeRally({layer:'underground',x:-5,y:-5});
              return {targeting:controls.targeting,armed:controls.armedSquad,
                rally:__ANT_DEBUG__.game.combat.getSquad('B').data.rally,
                pingSame:__ANT_DEBUG__.renderer.rallyPing===original};
            }""")
            assert ui['targeting'] and ui['armed']=='B'
            assert ui['rally']==old and ui['pingSame'],ui
            page.keyboard.press('Escape')
            assert page.locator('#u6-target-tip').is_hidden()
            assert not page.evaluate('window.__ANT_DEBUG__.ui.combatControls.targeting')
            return ui
        check('invalid rally atomic, no new ping, Escape cancels',cancel_and_invalid)
        page.locator('#u6-open').click()
        def layouts():
            for selector in ['#u6-dialog','[data-u6-squad="A"]','[data-u6-squad="B"]',
                             '[data-u6-mode="defend"]','[data-u6-mode="retreat"]','#u6-rally']:
                page.locator(selector).scroll_into_view_if_needed()
                in_view(page,selector,w,h)
            overflow=page.locator('#u6-dialog').evaluate("""el=>({
              scrollWidth:el.scrollWidth,clientWidth:el.clientWidth,
              bounding:el.getBoundingClientRect().toJSON()
            })""")
            assert overflow['scrollWidth']<=overflow['clientWidth']+3,overflow
            assert not evidence['page_errors'],evidence['page_errors']
            assert not evidence['console_errors'],evidence['console_errors']
            return overflow
        check('mobile viewport fit, no overflow and no browser errors',layouts)
        picture('squad-final')
    except Exception as err:
        evidence['fatal']=str(err)
        evidence['trace']=traceback.format_exc(limit=8)
        try:picture('fatal')
        except Exception:pass
    finally:
        evidence['passed']=sum(x['status']=='PASS' for x in evidence['cases'])
        evidence['failed']=sum(x['status']=='FAIL' for x in evidence['cases'])+int('fatal' in evidence)
        (out/'report.json').write_text(json.dumps(evidence,indent=2,ensure_ascii=False),encoding='utf-8')
        context.close()
    return evidence

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--artifacts',type=Path,required=True)
    p.add_argument('--chromium')
    args=p.parse_args()
    args.artifacts.mkdir(parents=True,exist_ok=True)
    sha=subprocess.run(['git','rev-parse','HEAD'],cwd=ROOT,capture_output=True,text=True)
    results={'task':'MULTI-SQUAD-V1','tested_sha':sha.stdout.strip() if sha.returncode==0 else None,
             'github_sha':os.getenv('GITHUB_SHA'),'views':[]}
    try:
        html=production_html()
        binary=args.chromium or os.getenv('CHROMIUM_PATH') or next((shutil.which(x) for x in
                    ('chromium','google-chrome','google-chrome-stable') if shutil.which(x)),None)
        with sync_playwright() as p:
            opts={'executable_path':binary} if binary else {}
            browser=p.chromium.launch(headless=True,args=['--no-sandbox'],**opts)
            try:
                results['chromium_version']=browser.version
                for name,w,h in SIZES:results['views'].append(run_view(browser,html,name,w,h,args.artifacts))
            finally:browser.close()
    except Exception as exc:
        results['fatal']=str(exc)
        results['trace']=traceback.format_exc(limit=8)
    (args.artifacts/'summary.json').write_text(json.dumps(results,indent=2,ensure_ascii=False),encoding='utf-8')
    failed=sum(v['failed'] for v in results['views'])
    print(f'Multi Squad browser: views={len(results["views"])}/2 failures={failed} tested_sha={results["tested_sha"]}',flush=True)
    return 0 if len(results['views'])==2 and failed==0 and 'fatal' not in results else 1

if __name__=='__main__':sys.exit(main())
