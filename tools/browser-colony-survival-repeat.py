"""G3 real-browser Nursery repeat UI E2E: buttons drive the true engine.

A seeded ready Nursery and depot are UI fixtures ONLY, not player-legal
survival/economy evidence. The real Game, adapter, DOM and event handlers run.
"""
import json
import subprocess
import time
from pathlib import Path
from urllib.request import urlopen

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "artifacts" / "survival-repeat"
OUTPUT.mkdir(parents=True, exist_ok=True)
SIZES = [(320, 568), (390, 844), (568, 320),
         (844, 390), (768, 1024), (1440, 900)]
REPORT = []


def snapshot(page):
    return page.evaluate("""() => {
      const {game:g} = window.__ANT_DEBUG__;
      const p=g.lifecycle.getRepeatOrder('browser-survival-nursery').plan;
      return {ticks:g.clock.ticks,plan:{...p},
        orders:g.lifecycle.eggOrders.map(o=>({
          id:o.id,status:o.status,profession:o.profession,level:o.level
        })),
        held:{...g.lifecycle.heldEgg},
        inventory:{...g.foraging.inventory}};
    }""")


def check_case(browser, engine, width, height):
    ctx = browser.new_context(
        viewport={"width": width, "height": height},
        device_scale_factor=1,
        is_mobile=width < 1200,
        has_touch=width < 1200,
    )
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda err: errors.append(str(err)))
    try:
        page.goto("http://127.0.0.1:4173/", wait_until="domcontentloaded")
        page.wait_for_function(
            "Boolean(window.__ANT_DEBUG__?.renovationAdapter?.actions?.setRepeatOrder)",
            timeout=25000)
        initial = page.evaluate("""() => {
          const d=window.__ANT_DEBUG__;
          const {game:g,ui,renovationAdapter:a,renovationShell:s}=d;
          g.setSpeed(0);
          g.foraging.inventory={carbs:12,protein:12,water:12};
          g.rooms.syncInventory();
          const q=g.colony.queen;
          const room={
            id:'browser-survival-nursery',type:'nursery',
            x:q.x-4,y:q.y,width:2,height:2,status:'ready',
            connected:true,progress:65,ticks:65,workerId:null,
            broodSlots:4,cost:{carbs:3,protein:2},capacity:{},
            stock:{carbs:0,protein:0,water:0}
          };
          g.rooms.rooms.push(room);
          g.rooms.updateConnectivity();
          if(room.status!=='ready')throw Error('Fixture Nursery unavailable');
          ui.nurseryRoomId=room.id;
          a.notify();
          const opened=s.overlay.openPanel('ui04-nursery');
          if(!opened.ok)throw Error('Renovated Nursery overlay did not open: '+JSON.stringify(opened));
          return {stock:{...g.foraging.inventory},room:room.id};
        }""")
        sheet=page.locator(".ui04-sheet")
        button=page.locator(".ui04-repeat-toggle")
        assert sheet.is_visible(), (engine,width,height,"renovated nursery hidden")
        assert button.is_visible(), (engine,width,height,"repeat button hidden")
        assert button.get_attribute("aria-label"), "Repeat button needs accessible label"
        assert button.get_attribute("aria-pressed") == "false"
        state = snapshot(page)
        assert state["plan"]["state"]=="disabled" and not state["orders"], state
        button.scroll_into_view_if_needed()
        size=button.bounding_box()
        assert size and size["width"]>=43.5 and size["height"]>=43.5, (
            engine,width,height,"touch target below 44px",size)
        assert size["x"]>=-1 and size["x"]+size["width"]<=width+1, (
            engine,width,height,"repeat button horizontally clipped",size)
        assert size["y"]>=-1 and size["y"]+size["height"]<=height+1, (
            engine,width,height,"repeat button vertically clipped",size)

        # Playwright's real DOM click triggers the user-facing command.
        button.click()
        armed=snapshot(page)
        assert armed["plan"]["state"]=="armed",armed
        assert armed["plan"]["enabled"] is True
        assert armed["inventory"]==initial["stock"] and not armed["orders"],armed
        assert button.get_attribute("aria-pressed")=="true"
        assert "พร้อม" in page.locator(".ui04-repeat-status").inner_text()

        # Advance ONE real fixed tick through the real Game, not direct queueEgg.
        page.evaluate("""() => {
          const g=window.__ANT_DEBUG__.game;
          g.setSpeed(1);g.update(100);g.setSpeed(0);
          window.__ANT_DEBUG__.renovationAdapter.notify();
        }""")
        waiting=snapshot(page)
        assert waiting["plan"]["state"]=="waiting",waiting
        assert len(waiting["orders"])==1 and waiting["orders"][0]["id"]=="egg-1",waiting
        assert waiting["orders"][0]["status"]=="QUEUED",waiting
        assert waiting["held"]["carbs"]==1 and waiting["held"]["protein"]==1,waiting
        assert waiting["inventory"]["carbs"]==11 and waiting["inventory"]["protein"]==11,waiting

        # Disable doesn't steal/refund an already paid egg.
        button.click()
        disabled=snapshot(page)
        assert disabled["plan"]["state"]=="disabled",disabled
        assert disabled["plan"]["activeOrderId"]=="egg-1",disabled
        assert len(disabled["orders"])==1 and disabled["inventory"]==waiting["inventory"],disabled
        assert button.get_attribute("aria-pressed")=="false"
        button.click()
        resumed=snapshot(page)
        assert resumed["plan"]["state"]=="waiting",resumed
        assert resumed["plan"]["activeOrderId"]=="egg-1",resumed
        assert len(resumed["orders"])==1,resumed

        # Cancel through the actual UI: exact original stock refunded once,
        # and the repeat plan must PAUSE, not immediately rebuy.
        cancel=page.locator(".ui04-cancel[data-egg-id='egg-1']")
        assert cancel.is_visible(),(engine,width,height,"real cancel button absent")
        cancel.click()
        paused=snapshot(page)
        assert paused["plan"]["state"]=="paused",paused
        assert paused["plan"]["stopReason"]=="manual-cancel",paused
        assert not paused["orders"],paused
        assert paused["inventory"]==initial["stock"],paused
        assert paused["held"]["carbs"]==0 and paused["held"]["protein"]==0,paused
        assert button.get_attribute("aria-pressed")=="false"
        assert "พัก" in page.locator(".ui04-repeat-status").inner_text()

        # Only a new user click re-arms a paused plan.
        button.click()
        rearmed=snapshot(page)
        assert rearmed["plan"]["state"]=="armed" and not rearmed["orders"],rearmed
        page.evaluate("""() => {
          const g=window.__ANT_DEBUG__.game;
          g.setSpeed(1);g.update(100);g.setSpeed(0);
          window.__ANT_DEBUG__.renovationAdapter.notify();
        }""")
        second=snapshot(page)
        assert second["plan"]["state"]=="waiting",second
        assert second["plan"]["activeOrderId"]=="egg-2",second
        assert len(second["orders"])==1 and second["orders"][0]["id"]=="egg-2",second
        assert second["inventory"]["carbs"]==11 and second["inventory"]["protein"]==11,second

        # Keyboard activates the SAME DOM button; no OS picker/alert.
        button.focus()
        page.keyboard.press("Enter")
        keyboard=snapshot(page)
        assert keyboard["plan"]["state"]=="disabled",keyboard
        assert keyboard["plan"]["activeOrderId"]=="egg-2",keyboard
        assert button.get_attribute("aria-pressed")=="false"
        assert not errors,(engine,width,height,"JS page errors",errors)
        page.screenshot(path=str(OUTPUT/f"repeat-{engine}-{width}x{height}.png"))
        REPORT.append({"engine":engine,"viewport":[width,height],
            "ui":"renovated","result":"PASS",
            "paid_escrow_once":True,"original_refund_once":True,
            "resume_requires_click":True,"keyboard_enter":True,
            "touch_target":size,"first_order":"egg-1","second_order":"egg-2"})
        print("REPEAT E2E PASS",engine,width,height,flush=True)
    finally:
        ctx.close()


def main():
    server = subprocess.Popen(
        ["node","tools/dev-server.mjs"], cwd=ROOT,
        stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT)
    try:
        for _ in range(90):
            try:
                with urlopen("http://127.0.0.1:4173/",timeout=1) as r:
                    if r.status==200:break
            except Exception:
                time.sleep(.25)
        else:raise RuntimeError("dev-server for repeat E2E unavailable")
        with sync_playwright() as playwright:
            for engine in (playwright.chromium,playwright.webkit):
                browser=engine.launch(
                    headless=True,
                    args=["--no-sandbox"] if engine.name=="chromium" else [])
                try:
                    for width,height in SIZES:
                        check_case(browser,engine.name,width,height)
                finally:
                    browser.close()
    finally:
        (OUTPUT/"evidence.json").write_text(
            json.dumps({"cases":REPORT,"scope":"real DOM Nursery repeat E2E, 2 browser engines x 6 canonical viewports; room/stock are UI fixtures, NOT player-legal survival proof"},ensure_ascii=False,indent=2))
        server.terminate()
        try:server.wait(timeout=5)
        except subprocess.TimeoutExpired:server.kill()


if __name__=="__main__":
    main()
