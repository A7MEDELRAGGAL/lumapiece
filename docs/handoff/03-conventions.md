# 03 — قواعد الشغل في الريبو ده

## أسلوب الكود في src/main.js

- دوال مضغوطة غالبًا في سطر واحد (single-line style مع `;` فاصل جوه السطر) وtemplate strings للـ HTML — **حافظ على نفس الأسلوب**، ماتكسرش الدوال لأسطر عادية.
- التعديلات بـ Edit بنص قديم مطابق **حرفيًا** (بما فيه المسافات) — لو فشل الـ Edit يعني النص اتغير، اقرا المنطقة الأول.
- الـ markup كله functions بترجع template strings (`gameMarkup()`, `roomMarkup()`, `customMarkup()`, `settingsMarkup()`) — أي UI جديد بيتبع نفس النمط.
- bindings كلها في `bindHome()` بسطر/سطور طويلة متسلسلة — ضيف عليها بنفس الأسلوب.

## CSS (src/styles.css)

- **الملف سطر واحد عملاق + سطور append في الآخر** — أداة Edit ممكن تفشل عليه. الاستخدام الموثوق: `printf '%s\n' '.rule{...}' >> src/styles.css`
- أي rule جديد يتضاف في **آخر الملف** (الـ media queries القديمة مش هتكسر حاجة لأن الـ selectors جديدة).
- المتغيرات: `--brand`, `--brand-dark`, `--line`, `--surface`, `--paper`, `--ink`, `--muted`, `--peach`, `--yellow`, `--shadow` — استخدمها.
- فيه RTL: `[dir=rtl]` — أي عنصر fixed/positioned محتاج نسخة RTL.

## i18n (src/i18n.js)

- `copy` = { en: {...}, ar: {...} } — أضف المفتاحين دايمًا مع بعض.
- `t(key)` بيرجع en fallback وبعدها المفتاح نفسه — يعني مفتاح ناقص بيتعرض كاسم مفتاح (باين فورًا في الفحص اليدوي).
- تغيير اللغة بيعمل `renderHome()` كامل — فأي حالة runtime بتضيع من الـ DOM وبتترندر من المتغيرات.

## persistence (src/persistence.js)

- كل المفاتيح بادئة `lumapiece-`: locale, theme, favorites, custom, progress, stats, settings, streak, onboarded, room.
- `readJson(key, fallback)` / `writeJson(key, value)` — writeJson بيرجع false عند امتلاء quota (الألغاز المخصصة الكبيرة).
- `appSettings` object مشترك: `{ sound, volume, guide, boardScale, confetti, debug, reducedMotion }` — عدّل عليه واعمل `saveSettings()`.

## المحرك (src/puzzle-engine.js)

- الحالة: `pieces[]` (كل قطعة فيها x/y/rotation/groupId/locked/edges)، `groups` Map، `board` {width,height,x,y,cellWidth,cellHeight}، `view` {width,height}.
- `serialize()`/`restore()` بيتعاملوا مع normalizedX/Y (نسبة من البورد) + locked — **أي حقل جديد لازم يتضاف في الاتنين**.
- الرسم من خلال `requestRender()` (rAF) — متناديش `render()` مباشرة في pointermove؛ في pointerup مشكلة النهاية (snap) بتتندح sync.
- `onChange(serialize())` بيتنادى بعد كل تغيير مهم — الـ main بيحفظ + يبعت للغرفة.
- `onComplete` بيتنادى مرة واحدة لما `isComplete()` — كل المجموعات واحدة.

## السيرفر (server.mjs)

- `createRoomServer({...options})` — كل الحدود option قابل للاختبار: maxRooms, rateLimit{limit,windowMs}, adminToken, idleWindowMs, persistPath, persistDelayMs, roomTtlMs.
- رسائل WS: create-room / join-room / state / leave-room / react — أي حاجة تانية → room-error. **أي message type جديد لازم يتعالج في handleRoomMessage بالعميل + السيرفر ويضاف اختبار.**
- `publicRoom(room, idleWindowMs)` — الشكل المشترك للرد: code/puzzleId/host/locked/players[{nickname,idle}]/state. **متحطش ح sensitive هنا** (الهاش واقف جوه room object مش في publicRoom).
- الإغلاق النظيف: `close()` بيعمل flush للحفظ الأول وبعدين terminate — الحارس `closedServer` بيمنع حفظ بعدين.

## الاختبارات

- `npm test` — **single worker مقصود** (`--pool=forks --maxWorkers=1 --no-file-parallelism`) متغيروش.
- `server.test.js` helpers جاهزة: `openSocket(url)`, `nextMessage(socket)`, `nextMessages(socket, n)`, `engineStateFor(pieceCount, moves)` — استخدمهم في أي اختبار WS جديد.
- `afterEach` بيقفل آخر `runtime` — أي سيرفر جديد في الاختبار يتخزن في نفس المتغير.
- e2e في `e2e/platform.spec.ts` — webServer بتقوم على build + start على 5191 مع `reuseExistingServer: true` (لو سيرفر شغال بورته هيستخدمه — قفله قبل e2e نظيف).
- اختبارات e2e بتعتمد على نصوص أزرار إنجليزية (اللغة الافتراضية en) — أي تغيير نص لازم ينعكس على الاختبار أو يفضل بنفس النص في en.

## النشر

- `Dockerfile` متعدد المراحل + `.dockerignore` + خدمة `app` في compose — Docker **غير متاح على الجهاز** فمفيش تحقق محلي من الـ image.
- `load/rooms.k6.js` سكريبت k6 (محتاج k6 متثبت + سيرفر شغال).

## قبل ما تعلن إنجاز

1. `npm test` ✅ (17 حاليًا)
2. `npm run build` ✅
3. `npm run e2e` ✅ (5 حاليًا)
4. تقرير مكتوب بأرقام فعلية: كام اختبار عدّى، إيه اللي اتضاف، إيه اللي فضل.
5. لو فيه حاجة محتاجة خدمة خارجية — قولها صراحة، متدعيهاش شغالة.
