# 02 — الشغل الشاقط (اكمل ده فورًا بالترتيب) + اللي بعده

> **وضع الكود دلوقتي**: جولة 10 (توسيع الكتالوج) اتوقفت في النص — الكارت بيتقرأ `saved.progress` بس `saveGame()` لسه مش بيكتبه، واختبار e2e واحد هينكسر من عدد الكروت. **المفروض آخر حالة خضرا: 17 unit + 5 e2e قبل توسيع الكتالوج — بعد التوسيع متتشغلش فحوصات.** ابدأ من الخطوة 1 وخلص للـ 8 قبل أي تطوير جديد، وبعدين شغل `npm test && npm run build && npm run e2e` وصحح لحد ما الكل يخضر.

## الجزء الأول: إكمال الشغل الشاقط (خطوات 1-8)

### 1) حفظ التقدم في saveGame()
`src/main.js` — دالة `saveGame()` حاليًا:
```js
function saveGame() { if (!currentPuzzle || !currentEngine || completed) return; const games = savedGames(); games[currentPuzzle.id] = { puzzleId: currentPuzzle.id, pieceCount: currentPieceCount, difficulty: currentDifficulty, elapsed, rotationEnabled: currentEngine.rotationEnabled, engineState: currentEngine.serialize(), savedAt: Date.now() }; writeJson('lumapiece-progress', games); }
```
ضيف حقل `progress: currentEngine.progress(),` جوه الـ object (مثلاً بعد `difficulty`). المحرك أصلاً عنده `progress()` بيرجع أكبر مجموعة ملتصقة (أو عدد القطع المثبتة).

### 2) ستايل شريط التقدم
`src/styles.css` — ضيف في **آخر الملف** (استخدم `printf '%s\n' '...' >> src/styles.css` لأن Edit بيضيع مع الملف الضخم):
```css
.card-progress{height:3px;background:var(--line)}
.card-progress span{display:block;height:100%;background:var(--brand-dark);transition:width .3s}
```
(الـ markup موجود فعلاً في `puzzleCard()`: `<div class="card-progress" title="X%"><span style="width:X%"></span></div>` بيتعرض بس لو 0 < progress < 100).

### 3) إصلاح e2e عدد الكروت
`e2e/platform.spec.ts` — اختبار "modal escape and catalog modes remain usable" فيه:
```ts
await expect(page.locator('#puzzle-grid .puzzle-card')).toHaveCount(4);
```
الـ filter "Challenging" دلوقتي بيرجع **6 كروت** (indexes 2 و 6 و 18 في الكتالوج × 2 مع الـ study clones). غيّرها لـ `toHaveCount(6)`.

### 4) عدّاد Streak يومي
- استخرج حساب مفتاح اليوم لمسار مشترك — `dailyPuzzle()` في main.js بيستخدم:
  `Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date()).replaceAll('-', ''))`
  خلّيها دالة `dayKey(date = new Date())` واستخدمها في `dailyPuzzle()` وفي الـ streak.
- عند حل لغز (داخل `onComplete` في `startEngine` بعد `recordCompletion`): لو `currentPuzzle.id === dailyPuzzle().id` → حدّث `lumapiece-streak` (`readJson/writeJson` جاهزين):
  ```js
  const today = dayKey(); const yesterday = dayKey(new Date(Date.now() - 86_400_000));
  const streak = readJson('lumapiece-streak', { last: 0, count: 0 });
  if (streak.last !== today) { streak.count = (streak.last === yesterday ? streak.count : 0) + 1; streak.last = today; writeJson('lumapiece-streak', streak); }
  ```
  (لو نفس اليوم مرة تانية ميتحسبش تاني — الشرط `last !== today` بيغطي ده).
- العرض: في `renderHome()` قسم `#daily` (daily-section) ضيف سطر صغير بيظهر لما `readJson('lumapiece-streak', {last:0,count:0}).count > 0`: مثلاً `🔥 ${count} ${t('streak')}`.
- **i18n**: ضيف مفتاح `streak` في `src/i18n.js` للغتين: en `'days in a row'` / ar `'يوم ورا بعض'`.

### 5) صفحة أدمن (SPA route #admin)
- في `src/main.js`: `renderAdmin()` ترندر في نفس `#app` — form فيه input password للـ ADMIN_TOKEN (يُخزن في `sessionStorage`)، زر "تحميل الغرف" يعمل `GET /admin/rooms` بالهيدر `Authorization: Bearer ...`، ويرندر جدول: الكود / اللغز / عدد اللاعبين / المضيف / مقفولة 🔒 / حركات / وقت / زر إغلاق (يعمل `DELETE /admin/rooms?code=...` وبعدين يعيد التحميل). لو الـ API رجع 404 ("Admin API is disabled") اعرض رسالة واضحة إن الأدمن معطل (لازم `ADMIN_TOKEN` في السيرفر).
- التنقل: listener على `hashchange` — لو `location.hash === '#admin'` → `renderAdmin()` غير كده `renderHome()`. وفي آخر الملف بدّل استدعاء `renderHome()` المباشر بـ دالة `route()` تعمل ده. **خلي بالك**: `renderHome()` جوه نفسها بيحدد عناصر كتير — تأكد إن رجوع من #admin للـ home شغال (نفس الدالة بتشتغل عادي).
- مفاتيح i18n جديدة للعربي كمان (admin: 'الإدارة'، إلخ).

### 6) تحديث README
`README.md` — سطر البداية بيقول "24 playable catalog puzzles" — خليه 40، وسطر الـ hero في main.js (`${allPuzzles().length} curated scenes`) بيتحدث لوحده فمفيش حاجة.

### 7) تشغيل الفحوصات وصحح
```bash
npm test && npm run build && npm run e2e
```
الحالة المتوقعة: unit 17 يفضلوا خضر، e2e الخمس يخضروا بعد إصلاح الخطوة 3. لو فشل حاجة: اقرا الرسالة، غالبًا سطر string في main.js اتغير نصه بالغلط.

### 8) قفل جولة 10 في الخارطة
في `docs/roadmap.md` — المرحلة 2: حدث "توسيع الكتالوج إلى 50+ مشهد" بـ "40 لغز (20 مشهد × 2 نسخة) — ✅ منفذ (المزيد = محتوى)" وحدّث مخاطر "ترجمة أسماء المشاهد" لو لزم.

## الجزء الثاني: اللي بعده من الخطة (docs/roadmap.md هي المرجع)

الترتيب المقترح (من غير Docker):

1. **بدائل بدون Docker لو المالك فعّل حاجة**: أي توصيل فعلي لـ Prisma/Redis/MinIO محتاج Docker — **Docker غير مثبت على الجهاز**. لو اتوفر: `docker compose up -d` (فيه app + postgres + redis + minio) وابدأ بالمرحلة 4 (Redis pub/sub للتوسع الأفقي) ثم 3 (حسابات).
2. **بدون Docker ممكن**: Prisma مع SQLite مؤقتًا (المخطط في `prisma/schema.prisma` — محتاج مراجعة عشان فيه جداول كتير)، أو تجميد الخطة التقنية والحديث عنها مع المالك.
3. **تحسينات صغيرة ممكن تتعمق** (كلها في roadmap): Web Vitals قياس يدوي، تحسين أداء المحرك مع 144 قطعة (offscreen canvas للطبقة الثابتة)، ترجمة أسماء المشاهد للعربي (محتوى).
4. **مرحلة 8**: ملفات النشر جاهزة (Dockerfile/compose/k6) — التشغيل الفعلي محتاج بيئة.

## ممنوعات صريحة

- متكسرش الـ determinism (seededRandom بمفتاح `puzzleId:rows:cols`) — الحفظ/المشاركة معتمدين عليه.
- متحطش نصوص UI hardcoded — كل حاجة i18n بمفتاحين en/ar.
- متغيرش `npm test` script (single worker مقصود).
- متلمسش `dist/` أو `node_modules/` — build فقط.
- السيرفر بيصدق حالة الغرف بعد تحقق صارم (`validState`) — أي حقل جديد في serialize لازم يتنظر هناك أو يتضمن بقيم آمنة.
