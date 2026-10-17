"""Real Chromium smoke for game long-press behavior (production HTTP entry point)."""
import subprocess
import time
from pathlib import Path
from urllib.request import urlopen

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
proc = subprocess.Popen(
    ['node', 'tools/dev-server.mjs'], cwd=ROOT,
    stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT,
)
try:
    for _ in range(60):
        try:
            with urlopen('http://127.0.0.1:4173/', timeout=1) as response:
                assert response.status == 200
            break
        except Exception:
            time.sleep(0.2)
    else:
        raise AssertionError('Game HTTP server did not start')

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True, args=['--no-sandbox'])
        for width, height in [(320, 568), (390, 844), (1440, 900)]:
            context = browser.new_context(
                viewport={'width': width, 'height': height},
                is_mobile=width != 1440, has_touch=True, device_scale_factor=1,
            )
            page = context.new_page()
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto('http://127.0.0.1:4173/?ui=legacy', wait_until='domcontentloaded')
            page.wait_for_function('Boolean(window.__ANT_DEBUG__)', timeout=20000)

            results = page.evaluate("""() => {
              const probe=(selector,type)=>{
                const el=document.querySelector(selector);
                const event=new Event(type,{bubbles:true,cancelable:true});
                el.dispatchEvent(event);
                return {
                  canceled:event.defaultPrevented,
                  userSelect:getComputedStyle(el).userSelect
                };
              };
              return {
                gameTimeContext:probe('#game-time','contextmenu'),
                mapContext:probe('#game-canvas','contextmenu'),
                buttonContext:probe('#tool-dig','contextmenu'),
                hudSelection:probe('#region-name','selectstart'),
                buttonSelection:probe('#tool-dig','selectstart'),
                editorContext:probe('#seed-input','contextmenu'),
                editorSelection:probe('#seed-input','selectstart'),
              };
            }""")
            for key in ['gameTimeContext', 'mapContext', 'buttonContext',
                        'hudSelection', 'buttonSelection']:
                assert results[key]['canceled'], (width, key, results[key])
                assert results[key]['userSelect'] == 'none', (width, key, results[key])
            for key in ['editorContext', 'editorSelection']:
                assert not results[key]['canceled'], (width, key, results[key])
                assert results[key]['userSelect'] == 'text', (width, key, results[key])

            # Real input/editing must still work, even with touch suppression.
            page.locator('#seed-button').click()
            assert page.locator('#seed-dialog').evaluate('(el)=>el.open')
            editor = page.locator('#seed-input')
            editor.fill('LONG-PRESS-SEED')
            editor.evaluate('(el)=>el.select()')
            assert editor.evaluate('(el)=>el.selectionEnd-el.selectionStart') == len('LONG-PRESS-SEED')
            page.locator('#cancel-seed').click()

            # Real taps are never intercepted by the context-menu guard.
            page.locator('#tool-dig').click()
            assert page.evaluate("__ANT_DEBUG__.ui.tool") == 'dig'
            page.locator('#tool-inspect').click()
            assert page.evaluate("__ANT_DEBUG__.ui.tool") == 'inspect'
            assert not errors, (width, errors)
            print(f'Long-press guard: PASS {width}x{height}; editor + taps + selection')

            context.close()
        browser.close()
finally:
    proc.terminate()
    try:
        proc.wait(timeout=3)
    except subprocess.TimeoutExpired:
        proc.kill()
