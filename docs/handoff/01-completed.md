# 01 — سجل كل اللي اتعمل (كامل بالتفصيل)

## نظرة عامة على المشروع

لعبة ألغاز جيجسو أونلاين اسمها **LumaPiece** — vanilla JavaScript بدون فريم ورك UI.
- الحزم: Vite 8 (build)، Vitest 5 (unit)، Playwright (e2e)، `ws` (الاعتمادية الوحيدة في production).
- الفكرة المعمارية: تجربة كاملة تعمل **محليًا بدون أي خدمة خارجية** (حتى الأصوات متولدة بـ Web Audio مش ملفات).
- المالك بيحب: التسليم بالعربي المصري، الشغل المستمر بدون وقفات، فحوصات خضرا قبل الإبلاغ.

## البيئة

- Windows + Git Bash. المسار: `D:\مشاريع فايب كودينج\puzzel`
- **مش git repo** (مفيش version control — اعمل backup قبل أي تعديل جريء).
- **Docker غير مثبت** — عشان كده Prisma/Redis/MinIO لسه مش متوصلة فعليًا.
- `npm test` شغال single worker عمدًا (ضغط ذاكرة على Windows) — متغيرش الـ script.

## الأوامر

```bash
npm install
npm run dev                                    # تطوير
npm run build && npm run start -- --port 5191  # إنتاج محلي
npm test                                       # unit
npm run e2e                                    # متصفح (بيعمل build لوحده)
npx playwright install chromium                # مرة واحدة لو ناقص
```

## بنية الملفات

| ملف/مجلد | وظيفته |
|---|---|
| `src/main.js` | الواجهة كلها — renderHome() + كل الـ markup template strings + منطق الغرف واللعب |
| `src/puzzle-engine.js` | محرك الكانفس: class JigsawEngine + دوال مساعدة exported (`gridForPieceCount`, `createDeterministicRandom`, `imageOffset`) |
| `src/i18n.js` | كل الترجمات EN/AR + `t(key)` + `getLocale()/setLocale()` — مفتاح التخزين `lumapiece-locale` |
| `src/persistence.js` | localStorage: `favorites`, `customPuzzles`, `savedGames()`, `stats()`, `appSettings`+`saveSettings()`, `readJson/writeJson` |
| `src/sounds.js` | class SoundBoard — Web Audio oscillator، أصوات: pick/drop/snap/rotate/click/error/join/leave/complete |
| `src/celebrate.js` | confetti canvas (140 قطعة، 3 ثواني، يحترم reducedMotion) |
| `src/puzzle-engine.test.js` | 4 اختبارات للـ helpers |
| `server.mjs` | كل الباك-إند (تفاصيل تحت) — `createRoomServer({port, host, maxRooms, rateLimit, adminToken, idleWindowMs, persistPath, persistDelayMs, roomTtlMs})` |
| `server.test.js` | 13 اختبار سيرفر |
| `public/scenes/*.jpg` | 12 مشهد Unsplash عالي الدقة محملة محليًا (~4.3MB) — الكتالوج الأساسي بيستخدمها |
| `public/puzzles/*.svg` | 20 رسمة SVG احتياطية (12 أصلية + 8 جديدة) |
| `public/sw.js` | service worker — cache-first للأصول + صور النطاق، network-first للتنقل |
| `public/manifest.webmanifest`, `public/icon.svg` | PWA |
| `docs/roadmap.md` | خطة التطوير بالمراحل ومعايير الجاهزية — **امشِ عليها** |
| `docs/api.md`, `docs/architecture.md`, `docs/deployment.md` | وثائق قديمة موجودة قبل كده |
| `Dockerfile` | إنتاجي متعدد المراحل non-root (node:22-alpine) |
| `.dockerignore`, `docker-compose.yml` | خدمة `app` + postgres/redis/minio |
| `load/rooms.k6.js` | سكريبت حمل k6 (create → join → قياس latency) |
| `.github/workflows/ci.yml` | CI: npm ci → test → build → playwright |
| `e2e/platform.spec.ts` | 5 اختبارات متصفح |
| `.env.example` | DATABASE_URL/REDIS/S3/PORT/HOST/ADMIN_TOKEN/ROOMS_FILE |

---

## سجل التنفيذ بالترتيب الزمني (30 بند)

### جولة 1 — مراجعة وتنظيف
1. **مراجعة شاملة** للمشروع (رأي مفصل: نقاط قوة/ضعف/مقترحات) — كانت بداية التعاون.
2. **تقسيم الكود**: استخراج `src/i18n.js` و`src/persistence.js` من main.js.
3. **أداء المحرك**: الرسم أيام السحب بقى batched في `requestAnimationFrame` (`requestRender()`)، والـ resize بقى debounced (`scheduleResize()`).
4. **إعادة محاولة الصور**: لو الصورة الأساسية فشلت، retry مرة واحدة ببارامتر cache-buster قبل الرجوع للـ fallback المحلي (`primaryImage`, `imageRetried`, `usedFallbackImage`).
5. **تحصين السيرفر**: rate limit لكل socket (60 رسالة/10 ث → قفل)، سقف 200 غرفة، `maxPayload` 512KB للـ WS، هيدر `X-Content-Type-Options: nosniff`، كاش دائم لـ `/assets/`، graceful shutdown (SIGINT/SIGTERM).
6. **وصولية**: focus trap للمودالات + رجوع الفوكس للزر الفاتح (`showModal/hideModal`, `lastFocusedElement`) — Tab مش بيخرج من المودال.
7. **إضافات**: CI workflow، favicon مدمج (data URI)، اختبارين سيرفر جداد.

### جولة 2 — إحساس اللعبة (بناءً على طلب المالك: "حواف أنعم + تجميع أنعم + تبعثر مرتب")
8. **حواف أنعم**: منحنيات bezier جديدة في `edge()` — رقبة موجبة سالبة (`neck = tab * -0.14`) وتابة دائرية أكثر استدارة (نقاط تحكم 0.32→0.68).
9. **لوحة تجميع في النص**: البورد بقى 58% من الكانفس ومتمركز (`boardScale`, `board.x/y`) — **النص فاضي للتجميع**.
10. **تبعثر مرتب على الأطراف**: `scatterToBorders()` — القطع تتوزع فوق/تحت/يمين/شمال بصفوف منتظمة مع عشوائية خفيفة، من غير تراكب في النص.
11. **قطع مقفولة**: `piece.locked` بعد اللصق — تترسم بلا shadow/حدود تقريبًا (ملموسة كصورة واحدة) + خط خارجي محترم `showGuide` (مربع منقط).
12. **لصق في المكان الصح**: `snap()` بقى يقبل القطعة في موضعها الصحيح على البورد حتى لو جيرانها مش موجودين + دمج المجموعات.
13. `imageOffset(piece, board)` بقى بياخد object البورد كله (مش cellWidth/Height) — عشان الإحداثيات بالنسبة للبورد المتمركز. **الاختبار اتحدث accordingly.**

### جولة 3 — لعبة كاملة
14. **أصوات**: `src/sounds.js` — كل المؤثرات oscillator مركّب + unlock من أول pointerdown + volume/enable.
15. **confetti**: `src/celebrate.js` عند الفوز.
16. **تلميح شبحي**: `showHint()` — شبح نابض ~1.8 ث في مكان القطعة الصحيح + زر Hint + hintFrame cleanup في destroy.
17. **إعدادات كاملة**: مودال (صوت/فوليوم/دليل تجميع/حجم قطع 40-75%/confetti/debug overlay/reduced motion) + `appSettings` في persistence + تطبيق live على المحرك.
18. **إحصائيات**: `recordCompletion()` — عدد مرات اللعب + أفضل وقت، شارة ✓ على الكروت المحلولة، رسالة "أفضل وقت جديد!" عند الفوز.
19. **`docs/roadmap.md`**: خطة 8 مراحل كاملة بمعايير DoD وأولويات ومخاطر.

### جولة 4 — PWA
20. `public/sw.js` + `manifest.webmanifest` + `icon.svg` + تسجيل SW في production فقط (`import.meta.env.PROD`).
21. **onboarding**: كارت ترحيب أول زيارة (غير معطّل، `lumapiece-onboarded`، يختفي للأبد).
22. **اهتزاز** `navigator.vibrate(18)` عند اللصق على الموبايل.

### جولة 5 — محتوى محلي + SSRF
23. **تحميل الـ 12 مشهد محليًا** لـ `public/scenes/*.jpg` من Unsplash — **صفر طلبات خارجية وقت اللعب** (الكاتالوج بقا محلي 100%).
24. **بروكسي صور آمن**: `POST /api/resolve-image` — يرجع data URL للصورة بعد: تحقق بروتوكول http/https فقط، منع localhost/`.internal`/`.local`/أسماء metadata، منع كل private IPs (IPv4 كامل + IPv6 بما فيهم mapped)، **DNS lookup فعلي** ضد rebinding، `redirect: 'error'`، ≤10MB، content-type صورة فقط، rate limit 20/min/IP. الواجهة بتستخدمه تلقائيًا في `createCustom()` → حل مشكلة CORS حقيقية كانت بتكسر صور الروابط.
25. **دالة `validatePublicHttpUrl`** exported (مُختبَرة بـ 13 case) — **باج اتصلح**: `URL.hostname` بيحتفظ بأقواس IPv6 `[::1]` فلازم strip(`[`,`]`).

### جولة 6 — قطع أكتر + غرف أقوى
26. **عدد قطع جديد: 60 (6×10) و144 (12×12)** — في كل القوائم + `allowedPieceCounts` في السيرفر + اختبار.
27. **إعادة اتصال تلقائية للغرف**: 3 محاولات backoff (1800ms × n)، `rememberRoom()` يحفظ الكود محليًا، `reconnectRoom()` بيعيد الانضمام، كشف "الغرفة انتهت" بيعمل تنظيف نظيف.
28. **حضور**: `announceRoomChange()` — toast بالاسم + صوت عند دخول/خروج أي لاعب.
29. لمسات: أفضل وقت على الـ tooltip بتاع شارة ✓، touch targets أكبر على الموبايل.

### جولة 7 — اجتماعي + تعريب
30. **ردود إيموجي**: 6 إيموجي (👍🎉❤️😂😮👏) — قائمة بيضاء في السيرفر (`allowedReactions`، أي حاجة ت بتتجاهل بصمت)، فقاعات طايرة `spawnReaction()` + `.emote-bar` تظهر جوه الغرفة بس.
31. **كلمات سر الغرف**: input اختياري عند الإنشاء، السيرفر بيخزن **SHA-256 فقط** (`hashPassword`)، `publicRoom.locked` بيرجع boolean (الهاش عمره ما يتبعت للعميل).
32. **شارة المضيف ★**: أول لاعب = host، وبينتقل تلقائيًا عند خروجه (بديل `[...players.values()][0]`).
33. **تعريب كامل**: كل واجهة اللعب/الفوز/الإعدادات/الغرف/الترحيب بقت مفاتيح i18n (`difficulty`, `pieces`, `pieceWord`, `hint`, `reference`, `solo`, `playAgain`, `settings`, `volume`, `guide`, `confetti`, `nickname`, `passwordLabel`... إلخ).

### جولة 8 — تشغيل ونشر
34. **API أدمن**: `GET /admin/rooms` (قائمة الغرف) + `DELETE /admin/rooms?code=` (إغلاق + بث `room-closed` للكل) — حماية `Bearer ADMIN_TOKEN`، 404 لو التوكن فاضي.
35. **`/api/daily`**: مفتاح اليوم بتوقيت Africa/Cairo من ساعة السيرفر؛ العميل (`dailyKeyOverride`) بيفضله على ساعة المتصفح.
36. **مؤشر خمول 💤**: `lastSeen` لكل لاعب يتحدث مع كل رسالة؛ اللي سكت > `idleWindowMs` (3 دقايق) يظهر جنب اسمه 💤.
37. **Dockerfile + .dockerignore + خدمة `app` في compose** + **سكريبت k6** في `load/rooms.k6.js`.

### جولة 9 — بقاء الغرف
38. **`ROOMS_FILE`**: snapshot JSON للغرف النشطة (code/puzzleId/password hash/state) بحفظ ذري (writeFile `.tmp` → rename)، debounce 400ms، **TTL 12 ساعة** عند الاسترجاع، restore في `start()` قبل الـ listen، flush فوري في `close()` + حارس `closedServer` يمنع أي حفظ بعد الإغلاق.
39. **اختبار البقاء**: سيرفر → غرفة → close → سيرفر جديد بنفس الملف → join بنفس الكود يرجع الحالة. **معيار المرحلة 4 الأساسي اتحقق بدون Redis.**

### جولة 10 — توسيع الكتالوج (⚠️ نص شاقطة — التفاصيل في 02-pending.md)
40. **8 مشاهد SVG أصلية جديدة**: rain, autumn, lake, meadow, canyon, harbor, aurora, carnival في `public/puzzles/`.
41. **الكتالوج 20 أساس × 2 = 40 لغز** — `challenging` على indexes `[2,6,18]` و`mystery` على `[5,10,16]`.
42. **شريط تقدم على الكروت** — `puzzleCard()` بتقرا `saved.progress` (لكن **saveGame لسه مش بيكتبه** — شوف البنددينغ).

---

## تفاصيل تقنية مهمة (عشان متتكسرش حاجة)

- **الـ serialization للمحرك**: `serialize()` بيرجع pieces فيها `normalizedX/normalizedY` (نسبة للبورد) — `restore()` بيستخدمهم لو موجودين وإلا بيحسب من boardWidth/Height. حقل `locked` كمان بيتحفظ ويرجع.
- **تحقق حالة الغرف في السيرفر** صارم: `validState`/`validEngineState` (rows×cols === pieceCount، IDs فريدة، إحداثيات finite ومعقولة، rotation 0-360، engineState.moves === moves، JSON ≤ 256KB).
- **الكتالوج deterministic**: `seededRandom(puzzleId:rows:cols)` — نفس اللغز = نفس شكل التباب دايمًا (مهم للحفظ والمشاركة).
- **الصور المخصصة**: localStorage (data: URLs) — القيد المعروف: لو أكبر من الـ quota الـ `writeJson` بيرجع false والواجهة بتقول "صورة كبيرة".
- **الـ e2e** بتقوم على `npm run build && npm run start -- --port 5191` (webServer في playwright.config.ts، `reuseExistingServer: true`).
- **i18n**: أي نص UI جديد لازم مفتاح في en وar — ممنوع hardcoded strings.
