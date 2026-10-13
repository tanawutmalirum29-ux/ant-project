# ANT KINGDOM — อาณาจักรมดใต้พิภพ

**U2 · Digging & Navigation · v0.2.0** — Playable excavation prototype สำหรับเว็บมือถือและคอมพิวเตอร์ (single-player, ไม่มี dependencies ฝั่ง client)

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
| ตรวจสอบพื้นดิน | เครื่องมือสำรวจ + คลิกช่อง | เครื่องมือสำรวจ + แตะช่อง |
| สั่งขุด | เครื่องมือ ⚒ + คลิก/ลากพื้นที่ใต้ดิน | เครื่องมือ ⚒ + แตะ/ลากนิ้ว |
| ยกเลิกงานขุด | เลือกช่องที่สั่งขุด แล้วกด “ยกเลิกคำสั่งขุด” | วิธีเดียวกัน |
| เปลี่ยนชั้นแผนที่ | ปุ่มด้านล่าง / ปุ่ม 1, 2 | ปุ่มด้านล่าง |
| หยุด/เริ่มเวลา | Space / ปุ่ม Ⅱ | ปุ่ม Ⅱ |
| เปิด debug | D / ⚙ | ⚙ |
| สลับเครื่องมือ | G หรือปุ่มเครื่องมือ | ปุ่มเครื่องมือ |
| กลับปากรัง | ⌖ | ซูมและลากกลับ หรือแตะปากรังเพื่อเชื่อมชั้น |

Seed ของโลกเปลี่ยนได้จากแถบบนสุด; สามารถลิงก์แบบ `?seed=MY-COLONY` เพื่อสร้างแผนที่เดิมได้

## U1 ที่พร้อมใช้งาน

- [x] โครงสร้างแยก core/world/render/ui อิสระจากกัน
- [x] Fixed timestep 10 TPS, เวลา 1 วันในเกม = 8 นาทีจริงที่ x1, pause/x1/x2/x4
- [x] โลก deterministic ด้วย seed: surface 128×128, underground 96×64, tile cell types
- [x] Renderer แบบ Canvas 2D culling เฉพาะช่องที่มองเห็น, pan, pinch, wheel, resize
- [x] ปากรัง `nest-main` เชื่อมตำแหน่งทั้งสองชั้น โดยสลับชั้นแล้วไม่รีเซ็ตเกม
- [x] HUD เวลา, population ของ entity จริง (ปัจจุบัน 6), debug FPS/TPS/tick/sim/render
- [x] ชุดทดสอบอัตโนมัติ U1 ด้วย Node.js built-in test runner

## U2 — สิ่งที่ทำเพิ่มแล้ว

- [x] นางพญา 1 ตัว และมดงาน 5 ตัว เกิดในห้องที่เดินได้จริง ไม่สุ่มเกิดในกำแพง
- [x] A* แบบ 4 ทิศสำหรับหาเส้นทาง และ BFS แบบใช้ครั้งเดียวเพื่อตรวจงานที่เดินถึงได้
- [x] เลือกพื้นที่ขุดด้วยคลิก/ลากหรือสัมผัสในโลกใต้ดิน มีภาพ preview และกดยกเลิกงานได้
- [x] คิวขุดสูงสุด 600 ช่อง งาน 1 ช่องสงวนให้มดได้สูงสุด 1 ตัว ป้องกันรับงานซ้ำ
- [x] มดจะต้องเดินไปยังช่องอุโมงค์ที่ติดกับดินก่อน จึงจะเริ่มขุด; ดินแข็งใช้เวลานานกว่าดินปกติ
- [x] ขุดเสร็จจึงเปลี่ยนชนิดช่องเป็นอุโมงค์ ทำให้คำสั่งขุดช่องที่ลึกขึ้นเริ่มเดินถึงได้
- [x] การสลับชั้นแผนที่และการหยุดเวลาไม่ทำให้งานหาย/เดินต่อขณะหยุด
- [x] มดและงานขุดมีแอนิเมชันและแถบความคืบหน้าบน Canvas
- [x] Automated regression และ Chromium smoke สำหรับ desktop/mobile (รายละเอียดใน `docs/U2_ACCEPTANCE.md`)

### ขอบเขตที่ยังไม่ทำ

ยังไม่มีอาหาร น้ำ การขนส่ง ระบบการเติบโตของตัวอ่อน ศัตรู หรือการบันทึกเซฟ (อยู่ใน U3–U8) ระบบ U2 ขุดได้เฉพาะดิน/ดินแข็ง และจะ **ไม่ขุดหิน** เพื่อไม่ให้มดทะลุสิ่งกีดขวาง

## โครงสร้าง

```text
index.html           หน้าเกมและ HUD
src/main.js          Boot, animation frame, UI/Simulation integration
src/core/            Seed RNG, time, Colony AI, queue and game state
src/world/           การสร้างโลกสองชั้น, A*/BFS navigation, portal
src/render/          Canvas renderer, camera, transforms
src/ui/              Controls, pointer & touch gestures
src/styles.css       Responsive compact HUD
tests/               Automated regression
 tools/dev-server.mjs Local static server
```

## แผนถัดไป

**U3 — Foraging & Transport:** แหล่งอาหาร/น้ำบนพื้นผิว, AI หาอาหาร, เดินเข้า/ออกปากรัง, ลำเลียงอาหารกลับคลัง และตรวจสอบระบบทรัพยากรไม่เพิ่มซ้ำ

## Deploy บน AWS Amplify Hosting

โปรเจกต์นี้เป็นเว็บเกมแบบ static ไม่ต้องรัน Node server ใน Production และไม่ต้องติดตั้ง dependencies เพิ่ม

```bash
npm test
npm run build
```

ไฟล์ `amplify.yml` ที่ root ให้ Amplify ทดสอบเกมและสร้าง `dist/` ก่อน Publish โดย Deploy เฉพาะ `index.html` และ `src/` (ไม่ส่ง `tests/`, `docs/`, หรือ `tools/` ขึ้น Hosting)

เชื่อม GitHub repository นี้กับ AWS Amplify เลือก branch `main` และใช้ build image Amazon Linux 2023 (Node.js 20+)

วิธีตั้งค่าและตรวจเช็กปัญหา: [docs/AMPLIFY_DEPLOY.md](docs/AMPLIFY_DEPLOY.md)
