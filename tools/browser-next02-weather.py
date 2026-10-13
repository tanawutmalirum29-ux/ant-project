"""NEXT-02 integrated weather: real Chromium, five viewports and three climates.

Captures actual Game + renderer + HUD (not an isolated mocked canvas).
Weather kinds are controlled as test fixtures to inspect all three conditions;
the real fixed-clock phase transition is separately covered by Node/Game tests.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
def load_html():
    spec=importlib.util.spec_from_file_location('ant_weather_qa',ROOT/'tools/browser-phase1-ui-audit.py')
    module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.production_html()
VIEWPORTS=[('small',320,568,True),('portrait',390,844,True),
 ('tablet',768,1024,True),('landscape',844,390,True),('desktop',1440,900,False)]
LABELS={'clear':'ปกติ','rain':'ฝนตก','dry':'แล้ง'}

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--artifacts',type=Path,required=True)
    args=parser.parse_args()
    directory=args.artifacts
    directory.mkdir(parents=True,exist_ok=True)
    html=load_html()
    reports=[]
    with sync_playwright() as pw:
        chromium=shutil.which('chromium') or shutil.which('chromium-browser')
        browser=pw.chromium.launch(headless=True,args=['--no-sandbox'],
            **({'executable_path':chromium} if chromium else {}))
        try:
            for name,width,height,mobile in VIEWPORTS:
                page=browser.new_page(viewport={'width':width,'height':height},
                    is_mobile=mobile,has_touch=mobile,device_scale_factor=1)
                errors=[]
                page.on('pageerror',lambda err:errors.append(str(err)))
                page.set_content(html,wait_until='domcontentloaded')
                page.wait_for_function('Boolean(window.__ANT_DEBUG__?.game?.weather && window.__ANT_DEBUG__?.game?.ecology)')
                page.locator('#surface-button').click()
                assert page.evaluate("() => __ANT_DEBUG__.game.layer")=='surface'
                page.evaluate("() => __ANT_DEBUG__.game.setSpeed(0)")
                frames=[]
                for kind in LABELS:
                    status=page.evaluate("""(kind) => {
                      const {game:g,ui,renderer,cameras}=__ANT_DEBUG__;
                      // Fixture changes only the current weather phase, not
                      // resources or draw routines. Production wiring remains live.
                      g.weather._kind=kind;
                      g.weather._remainingTicks=2712;
                      ui.updateMetrics();
                      renderer.render(g,cameras[g.layer],ui.selection,1234);
                      return {
                        weather:g.weather.kind,ecologyKind:g.ecology.weather.kind,
                        hud:document.querySelector('.time-pill small').textContent,
                        ticks:g.weather.remainingTicks,
                        visible:window.getComputedStyle(document.querySelector('.time-pill small')).display
                      };
                    }""",kind)
                    assert status['weather']==kind and status['ecologyKind']==kind,(name,status)
                    assert LABELS[kind] in status['hud'] and '2712t' in status['hud'],(name,status)
                    assert status['visible']!='none',(name,status)
                    canvas=page.locator('#game-canvas').screenshot()
                    digest=hashlib.sha256(canvas).hexdigest()
                    frames.append(digest)
                    page.screenshot(path=str(directory/f'{name}-{kind}.png'))
                assert len(set(frames))==3,(name,'weather canvas did not visibly change',frames)
                assert not errors,(name,errors)
                reports.append({'name':name,'viewport':[width,height],
                    'state_images':3,'distinct_canvas_hashes':3,'page_errors':len(errors)})
                page.close()
        finally:browser.close()
    assert len(reports)==5
    (directory/'summary.json').write_text(json.dumps(reports,ensure_ascii=False,indent=2))
    print('NEXT-02 integrated weather browser QA PASS:',len(reports),'/5 viewports,',
          '15 weather screenshots, 0 JavaScript errors')
    return 0

if __name__=='__main__':
    raise SystemExit(main())
