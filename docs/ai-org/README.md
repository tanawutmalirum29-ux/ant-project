# Ant Kingdom — คู่มือแต่งตั้งองค์กร 17 AI

**เริ่มต้นด้วย:** [CEO Handoff](CEO_HANDOFF.md) และ [กฎดำเนินงานร่วม](OPERATING_PROTOCOL.md)

**วิธีใช้:** เปิด ChatGPT แชทใหม่สำหรับแต่ละตำแหน่ง 1 แชท = 1 AI. คัดลอกคำสั่งในไฟล์ลิงก์ของตำแหน่งนั้น **ทั้งไฟล์** วางเป็นข้อความแรกของแชท. เริ่ม CEO แชทใหม่ก่อน, CTO, หัวหน้า 5, ผู้พัฒนา 10. อย่านำ AI-HEAD แชทเก่าไปใช้เป็น CEO เพราะบริบทยาว. ทุกคนใช้ GitHub repo เดียว: https://github.com/tanawutmalirum29-ux/ant-project

**17 คนแบ่งเป็น CEO 1 + CTO 1 + หัวหน้า 5 + ผู้พัฒนา 10**

| # | Role ID | ตำแหน่ง / รับผิดชอบ | ส่งรายงานถึง | คำสั่งแต่งตั้งรายตัว |
|---:|---|---|---|---|
| 1 | **CEO** | CEO — กำหนด 1 ภารกิจใหญ่ต่อรอบ/ตรวจรับก่อน main | Owner | [เปิดและคัดลอกคำสั่ง CEO](roles/CEO.md) |
| 2 | **CTO** | CTO — สถาปัตยกรรม สัญญาระบบ และ Integration | CEO | [เปิดและคัดลอกคำสั่ง CTO](roles/CTO.md) |
| 3 | **SIM-LEAD** | หัวหน้า Simulation/Economy | CTO | [เปิดและคัดลอกคำสั่ง SIM-LEAD](roles/SIM-LEAD.md) |
| 4 | **SIM-01** | World/Resources/Foraging | SIM-LEAD | [เปิดและคัดลอกคำสั่ง SIM-01](roles/SIM-01.md) |
| 5 | **SIM-02** | Colony/Lifecycle/Rooms | SIM-LEAD | [เปิดและคัดลอกคำสั่ง SIM-02](roles/SIM-02.md) |
| 6 | **COMBAT-LEAD** | หัวหน้า Combat & AI | CTO | [เปิดและคัดลอกคำสั่ง COMBAT-LEAD](roles/COMBAT-LEAD.md) |
| 7 | **COMBAT-01** | Soldier Formation/Enemy | COMBAT-LEAD | [เปิดและคัดลอกคำสั่ง COMBAT-01](roles/COMBAT-01.md) |
| 8 | **COMBAT-02** | Navigation/Pathfinding | COMBAT-LEAD | [เปิดและคัดลอกคำสั่ง COMBAT-02](roles/COMBAT-02.md) |
| 9 | **UI-LEAD** | หัวหน้า UI / UX | CTO | [เปิดและคัดลอกคำสั่ง UI-LEAD](roles/UI-LEAD.md) |
| 10 | **UI-01** | Frontend UI and Touch Interactions | UI-LEAD | [เปิดและคัดลอกคำสั่ง UI-01](roles/UI-01.md) |
| 11 | **UI-02** | Graphics/Accessibility/Renderer | UI-LEAD | [เปิดและคัดลอกคำสั่ง UI-02](roles/UI-02.md) |
| 12 | **PLATFORM-LEAD** | หัวหน้า Platform & Performance | CTO | [เปิดและคัดลอกคำสั่ง PLATFORM-LEAD](roles/PLATFORM-LEAD.md) |
| 13 | **PLATFORM-01** | Performance Benchmarks/Save Load | PLATFORM-LEAD | [เปิดและคัดลอกคำสั่ง PLATFORM-01](roles/PLATFORM-01.md) |
| 14 | **PLATFORM-02** | CI/Build/Deployment | PLATFORM-LEAD | [เปิดและคัดลอกคำสั่ง PLATFORM-02](roles/PLATFORM-02.md) |
| 15 | **QA-LEAD** | หัวหน้า QA อิสระ มีสิทธิ HOLD ต่อ CEO | CEO + CTO copy | [เปิดและคัดลอกคำสั่ง QA-LEAD](roles/QA-LEAD.md) |
| 16 | **QA-01** | Unit/Accounting QA | QA-LEAD | [เปิดและคัดลอกคำสั่ง QA-01](roles/QA-01.md) |
| 17 | **QA-02** | Chromium Browser/Integration QA | QA-LEAD | [เปิดและคัดลอกคำสั่ง QA-02](roles/QA-02.md) |

## สายรายงานและการทำงาน
**CEO → CTO → หัวหน้าแต่ละแผนก → ผู้พัฒนา 2 คน** แล้วรายงานย้อนกลับในสายเดียวกัน. **QA-LEAD รายงานผล PASS/HOLD ถึง CEO โดยตรง** เพื่อป้องกันความขัดแย้งทางผลประโยชน์. เจ้าของไม่ต้องอ่าน Diff หรือสั่งแก้จุดย่อย เพียงคัดลอกบล็อก `📨 ส่งต่อถึง: ROLE-ID` ไปยังแชทที่ตรงกัน.

แต่ละคนต้องอ่าน [Operating Protocol](OPERATING_PROTOCOL.md), เปิด GitHub Issue ตามลิงก์ผู้บังคับบัญชา และทำงานให้เสร็จด้วยหลักฐาน SHA/PR/Actions. ไม่มีภารกิจ = **READY / WAITING**, ไม่คิดงานหรือแก้ Production เอง. CTO รวม branch แผนกก่อน QA ทดสอบจริง; CEO Merge เข้า `main` เฉพาะหลังหัวหน้าทั้ง 5 รับรอง Integration SHA เดียวกัน และ QA independent PASS.

**ข้อเท็จจริง:** ตอนแต่งตั้งองค์กร **ไม่ได้แปลว่าทั้ง 17 ChatGPT แชทเชื่อมกันเอง** และไม่ได้เพิ่มสิทธิ์ GitHub จริงให้แต่ละคน; การแยกแชทเป็นการควบคุมขั้นตอนด้วยผู้ใช้ส่งข้อความ. GitHub Account เดียวกันอาจมีสิทธิ Push main ทางเทคนิค จึงต้องเคารพกฎและพิจารณา Branch Protection.

**สถานะฐานเกม:** Round 2 จบแล้ว Unit 152/152 + Browser 60/60 (Actions #38365132882). R4/R5 มีเอกสารออกแบบแล้วแต่ยังไม่ได้นำ Gameplay ไป Implementation. CEO ใหม่ตรวจ最新 main และเลือกภารกิจใหม่เพียงหนึ่งรอบตามลำดับความสำคัญ.
