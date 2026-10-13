"""U5 real gameplay smoke with V2 CSS loaded, five Chromium viewports.

Replays the existing canonical U5 browser regression unchanged except injecting
the new stylesheet into the sandbox inliner. No game logic files are modified.
"""
from pathlib import Path

root=Path(__file__).resolve().parents[1]
source=(root/'tools/browser-u5.py').read_text()
needle="html=namespace['bundle_html']()"
assert source.count(needle)==1, "U5 browser regression entry point changed"
stylesheet='<link rel="stylesheet" href="./src/ui/visual/v2.css" />'
replacement=needle+'''
link='<link rel="stylesheet" href="./src/ui/visual/v2.css" />'
assert link in html, 'Missing V2 stylesheet link in production HTML'
html=html.replace(link,'<style>'+(root/'src/ui/visual/v2.css').read_text()+'</style>')
'''
source=source.replace(needle,replacement)
check="        # Real UI pointer click:"
assert source.count(check)==1
geometry='''        # V2 commands must be reachable and not hidden outside the viewport.
        for control in ('#tool-inspect','#tool-dig','#tool-room','#forage-plus',
                        '#forage-minus','#nurse-plus','#nurse-minus','#seed-button',
                        '#pause-button','#colony-button','#surface-button',
                        '#underground-button'):
            # U5 intentionally hides worker assignment while the room palette
            # is expanded in short landscape mode to preserve map visibility.
            if name=='landscape' and control in ('#forage-plus','#forage-minus','#nurse-plus','#nurse-minus'):
                assert page.locator(control).is_hidden(),(name,control,'expected compact U5 mode')
                continue
            box=page.locator(control).bounding_box()
            assert box,(name,control,'missing')
            assert box['x']>=-2 and box['x']+box['width']<=width+2,(name,control,box)
            assert box['y']>=-2 and box['y']+box['height']<=height+2,(name,control,box)
        # Production game state is live: the room tool must remain selectable.
        assert page.locator('#tool-room').get_attribute('aria-pressed')=='true',name
'''
source=source.replace(check,geometry+check)
exec(compile(source,str(root/'tools/browser-u5.py'),'exec'),{'__name__':'__main__','__file__':str(root/'tools/browser-u5.py')})
