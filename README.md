# ANT KINGDOM — อาณาจักรมดใต้พิภพ

**U1 · Game Foundation · v0.1.0** — Technical prototype สำหรับเว็บมือถือและคอมพิวเตอร์ (single-player, ไม่มี dependencies ฝั่ง client)

## ทดลองเล่น

เปิดผ่าน static hosting เช่น **GitHub Pages**, หรือรัน local server:

```bash
npm start
```

จากนั้นเปิด `http://localhost:4173` (Node.js >=20) ไฟล์ `index.html` ไม่ควรเปิดโดยตรงผ่าน `file://` เพราะเบราว์เซอร์ส่วนใหญ่จำกัด ES module imports

```bash
npm test
```

## วิธีควบคุม

| ควบคุม | คอมพิวเตอร์ | มือถือ |
|---|---|---|
| เลื่อนแผนที่ | ลากเมาส์ | ลากนิ้ว |
| ซูม | ล้อเมาส์ / +/- | ถ่างหรือหุบนิ้ว |
| ตรวจสอบพื้นดิน | คลิกช่อง | แตะช่อง |
| เปลี่ยนชั้นแผนที่ | ปุ่มด้านล่าง / ปุ่ม 1, 2 | ปุ่มด้านล่าง |
| หยุด/เริ่มเวลา | Space / ปุ่ม Ⅱ | ปุ่ม Ⅱ |
| เปิด debug | D / ⚙ | ⚙ |
| กลับปากรัง | ⌖ | ซูมและลากกลับ หรือแตะปากรังเพื่อเชื่อมชั้น |

Seed ของโลกเปลี่ยนได้จากแถบบนสุด; สามารถลิงก์แบบ `?seed=MY-COLONY` เพื่อสร้างแผนที่เดิมได้

## U1 ที่พร้อมใช้งาน

- [x] โครงสร้างแยก core/world/render/ui อิสระจากกัน
- [x] Fixed timestep 10 TPS, เวลา 1 วันในเกม = 8 นาทีจริงที่ x1, pause/x1/x2/x4
- [x] โลก deterministic ด้วย seed: surface 128×128, underground 96×64, tile cell types
- [x] Renderer แบบ Canvas 2D culling เฉพาะช่องที่มองเห็น, pan, pinch, wheel, resize
- [x] ปากรัง `nest-main` เชื่อมตำแหน่งทั้งสองชั้น โดยสลับชั้นแล้วไม่รีเซ็ตเกม
- [x] HUD เวลา, population ของ entity จริง (ปัจจุบัน 0), debug FPS/TPS/tick/sim/render
- [x] ชุดทดสอบอัตโนมัติ U1 ด้วย Node.js built-in test runner

### ขอบเขตที่ยังไม่ทำ

U1 มีห้องและอุโมงค์เริ่มต้นที่เป็น **แผนที่ตัวอย่าง** แต่ยังไม่สามารถขุด ไม่มี entity มด ไม่มีระบบอาหารหรือบันทึกเซฟ ระบบเหล่านี้อยู่ใน U2–U8 ตามแผน ไม่แสดง population จำลองเป็นมดจริง

## โครงสร้าง

```text
index.html           หน้าเกมและ HUD
src/main.js          Boot, animation frame, UI/Simulation integration
src/core/            Seed RNG, fixed step time, game state
src/world/           การสร้างโลกสองชั้นและ portal
src/render/          Canvas renderer, camera, transforms
src/ui/              Controls, pointer & touch gestures
src/styles.css       Responsive compact HUD
tests/               Automated regression
 tools/dev-server.mjs Local static server
```

## แผนถัดไป

**U2**: มดงาน 5 ตัว + นางพญา, A* pathfinding, งานขุดและระบบ claim/task reservation, อัปเดต terrain เมื่อขุดจริง (ห้ามสร้างอุโมงค์ด้วยการคลิกเปลี่ยนภาพทันที)
