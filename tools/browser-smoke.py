import re
from pathlib import Path
import json
from playwright.sync_api import sync_playwright

base=str(Path(__file__).resolve().parents[1])
def bundle_html():
    root=Path(base)
    html=(root/'index.html').read_text()
    css=(root/'src/styles.css').read_text()
    html=html.replace('<link rel="stylesheet" href="./src/styles.css" />','<style>'+css+'</style>')
    mods=['core/random.js','core/time.js','world/generate.js','world/navigation.js','world/resources.js','core/colony.js','core/foraging.js','core/game.js','render/camera.js','render/renderer.js','ui/app.js','main.js']
    out=['const __mods = {};']
    for m in mods:
        source=(root/'src'/m).read_text()
        module_path='/src/'+m
        def resolve_import(match):
            names=match.group(1).strip()
            imported=match.group(2)
            import_path=str(Path(module_path).parent.joinpath(imported).resolve())
            # resolve() normalizes absolute paths
            return 'const {'+names+'} = __mods['+json.dumps(import_path)+'];'
        source=re.sub(r"import\s+\{([^}]+)\}\s+from\s+['\"]([^'\"]+)['\"];?",resolve_import,source)
        names=re.findall(r'export\s+(?:const|class|function)\s+(\w+)',source)
        source=re.sub(r'\bexport\s+(?=(?:const|class|function)\b)','',source)
        out.append('__mods['+json.dumps(module_path)+'] = (() => {\n'+source+'\nreturn {'+','.join(names)+'};\n})();')
    js='\n'.join(out)
    return html.replace('<script type="module" src="./src/main.js"></script>','<script>'+js+'</script>')

html=bundle_html()
with sync_playwright() as p:

        import os
        kwargs = {'executable_path': os.getenv('CHROMIUM_PATH', '/usr/bin/chromium')} if Path(os.getenv('CHROMIUM_PATH', '/usr/bin/chromium')).is_file() else {}
        browser=p.chromium.launch(headless=True,args=['--no-sandbox'],**kwargs)
        for width,height,name in [(1440,900,'desktop'),(390,844,'portrait'),(844,390,'landscape')]:
            page=browser.new_page(viewport={'width':width,'height':height},device_scale_factor=1,is_mobile=name!='desktop',has_touch=name!='desktop')
            errors=[]
            page.on('pageerror',lambda e:errors.append(str(e)))
            page.set_content(html,wait_until='domcontentloaded')
            page.wait_for_function('Boolean(window.__ANT_DEBUG__)')
            game=page.evaluate('''() => {const g=__ANT_DEBUG__.game;return {pop:g.population,ants:g.colony.workers.length,layer:g.layer,ticks:g.clock.ticks}}''')
            assert game['pop']==6 and game['ants']==5, game
            btn=page.locator('#tool-dig')
            assert btn.is_enabled()
            btn.click()
            assert btn.get_attribute('aria-pressed')=='true'
            # Choose an exposed diggable tile not covered by overlays; project from world to viewport.
            target=page.evaluate('''() => {
              const {game,cameras,renderer}=__ANT_DEBUG__;
              const layer=game.currentLayer,camera=cameras[game.layer], w=renderer.width,h=renderer.height;
              let candidates=[];
              for(let y=0;y<layer.height;y++)for(let x=0;x<layer.width;x++) {
                const t=layer.cells[y*layer.width+x];if(t!==10&&t!==11)continue;
                if(![[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>[13,14,15].includes(layer.cells[(y+dy)*layer.width+(x+dx)])))continue;
                const px=camera.worldToScreen((x+.5)*28,(y+.5)*28,w,h);
                if(px.x<25||px.x>w-25||px.y<195||px.y>h-185)continue;
                const top=document.elementFromPoint(px.x,px.y);
                if(top!==renderer.canvas)continue;
                candidates.push({x,y,px});
              }
              return candidates.sort((a,b)=>Math.abs(a.px.x-w/2)+Math.abs(a.px.y-h/2)-Math.abs(b.px.x-w/2)-Math.abs(b.px.y-h/2))[0]||null;
            }''')
            if not target:
                # Recenter to queen to reveal a dig frontier when portrait canvas gets obstructed by panels.
                page.evaluate('''() => { const {game,cameras}=__ANT_DEBUG__;const q=game.colony.queen;const c=cameras[game.layer];c.x=(q.x+.5)*28;c.y=(q.y+.5)*28; }''')
                target=page.evaluate('''() => {
                    const {game,cameras,renderer}=__ANT_DEBUG__,l=game.currentLayer,c=cameras[game.layer],w=renderer.width,h=renderer.height;
                    for(let y=0;y<l.height;y++)for(let x=0;x<l.width;x++){
                        const t=l.cells[y*l.width+x];if(t!==10&&t!==11)continue;
                        if(![[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>{const nx=x+dx,ny=y+dy;return nx>=0&&ny>=0&&nx<l.width&&ny<l.height&&[13,14,15].includes(l.cells[ny*l.width+nx]);}))continue;
                        const px=c.worldToScreen((x+.5)*28,(y+.5)*28,w,h);
                        if(px.x>25&&px.x<w-30&&px.y>185&&px.y<h-175&&document.elementFromPoint(px.x,px.y)===renderer.canvas)return {x,y,px};
                    }
                    return null;
                }''')
            assert target is not None, f'No visible diggable tile: {name}'
            if name=='desktop':page.mouse.click(target['px']['x'],target['px']['y'])
            else:page.touchscreen.tap(target['px']['x'],target['px']['y'])
            queued=page.evaluate('''() => __ANT_DEBUG__.game.colony.pendingCount''')
            assert queued==1,(name,target,queued)
            page.evaluate('''() => {for(let i=0;i<500;i++)__ANT_DEBUG__.game.update(100)}''')
            remaining=page.evaluate('''() => __ANT_DEBUG__.game.colony.pendingCount''')
            done=page.evaluate('''() => __ANT_DEBUG__.game.colony.completed''')
            assert remaining==0 and done==1,(name,remaining,done)
            if name=='desktop':
                pair=page.evaluate('''() => {
                  const {game,cameras,renderer}=__ANT_DEBUG__,l=game.currentLayer,c=cameras[game.layer],w=renderer.width,h=renderer.height;
                  for(let y=3;y<l.height-3;y++)for(let x=3;x<l.width-3;x++){
                    for(const [dx,dy] of [[1,0],[0,1]]){
                      const x2=x+dx,y2=y+dy;
                      if(![10,11].includes(l.cells[y*l.width+x])||![10,11].includes(l.cells[y2*l.width+x2]))continue;
                      if(![[1,0],[-1,0],[0,1],[0,-1]].some(([ox,oy])=>[13,14,15].includes(l.cells[(y+oy)*l.width+x+ox])))continue;
                      const a=c.worldToScreen((x+.5)*28,(y+.5)*28,w,h),b=c.worldToScreen((x2+.5)*28,(y2+.5)*28,w,h);
                      if([a,b].every(p=>p.x>200&&p.x<w-140&&p.y>200&&p.y<h-170&&document.elementFromPoint(p.x,p.y)===renderer.canvas))return {a,b};
                    }
                  }
                  return null;
                }''')
                assert pair is not None,'No visible pair for drag test'
                page.mouse.move(pair['a']['x'],pair['a']['y']);page.mouse.down()
                page.mouse.move(pair['b']['x'],pair['b']['y'],steps=5);page.mouse.up()
                assert page.evaluate('''() => __ANT_DEBUG__.game.colony.pendingCount''')>=2,'Drag did not queue tiles'
                assert page.locator('#cancel-dig').is_visible()
                page.locator('#cancel-dig').click()
                assert page.evaluate('''() => __ANT_DEBUG__.game.colony.pendingCount''')>=1,'Cancel removed unrelated jobs'
                page.evaluate('''() => {for(let i=0;i<500;i++)__ANT_DEBUG__.game.update(100)}''')
                assert page.evaluate('''() => __ANT_DEBUG__.game.colony.pendingCount''')==0
            # Changing layer keeps colony work and visible population.
            page.locator('#surface-button').click()
            assert page.evaluate('''() => __ANT_DEBUG__.game.layer''')=='surface'
            assert not page.locator('#tool-dig').is_enabled()
            page.locator('#underground-button').click()
            assert page.evaluate('''() => __ANT_DEBUG__.game.layer''')=='underground'
            assert page.locator('#population').inner_text()=='6'
            page.locator('#debug-toggle').click()
            assert page.locator('#debug-panel').is_visible()
            page.locator('#debug-toggle').click()
            # New-world reset must discard all active entity, terrain and queue state.
            page.locator('#seed-button').click()
            page.locator('#seed-input').fill('U2-RESET-'+name)
            page.locator('#create-seed').click()
            assert page.evaluate('''() => __ANT_DEBUG__.game.colony.pendingCount''')==0
            assert page.evaluate('''() => __ANT_DEBUG__.game.population''')==6
            assert page.evaluate('''() => __ANT_DEBUG__.game.clock.ticks''')<10
            page.screenshot(path=f'{base}/screenshot-u2-{name}.png')
            assert not errors,(name,errors)
            print(f'{name}: PASS; ordered tile {target["x"]},{target["y"]}; dug=1, JS errors=0')
            page.close()
        browser.close()
