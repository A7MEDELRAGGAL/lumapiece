const STORAGE_KEY = 'lumapiece-locale';

export const copy = {
  en: {
    discover: 'Discover', daily: 'Daily piece', together: 'Together', create: 'Make a puzzle', browse: 'Browse puzzles', continue: 'Continue playing', all: 'All puzzles', search: 'Search by mood, place, or color', play: 'Play now', easy: 'Easy', medium: 'Medium', hard: 'Hard', expert: 'Expert', save: 'Save progress', preview: 'Preview', pause: 'Pause', resume: 'Resume', exit: 'Exit game', room: 'Create a room', join: 'Join a room', custom: 'Create from your image', start: 'Start playing', language: 'عربي',
    edges: 'Edges', allPieces: 'All pieces', rearrange: 'Rearrange', difficulty: 'Difficulty', pieces: 'Pieces', pieceWord: 'pieces', rotate: 'Rotate', hint: 'Hint', fullscreen: 'Fullscreen', reference: 'Reference', solo: 'Solo mode', soloCopy: 'Invite friends into this same board whenever you want.', copyRoomCode: 'Copy room code', playAgain: 'Play again', back: 'Back to collection', completeEyebrow: 'Beautiful work', completeTitle: 'Picture complete.', finishedIn: 'You finished in', newBest: 'New best time!', yourBest: 'Your best is',
    settings: 'Settings', sound: 'Sound effects', volume: 'Volume', guide: 'Assembly guide', pieceSize: 'Piece size', confetti: 'Confetti celebration', debug: 'Debug overlay (piece IDs)', reducedMotion: 'Reduced motion', pieceSizeNote: 'Piece size applies when you start the next puzzle.',
    nickname: 'Nickname', passwordLabel: 'Room password (optional)', orJoin: 'or join one', roomsNote: 'Rooms are available when the LumaPiece server is running.',
    helpText: 'Pieces wait around the edges. Build the picture in the empty middle.',
    welcome: 'Welcome to LumaPiece', welcomeBody: 'Pieces wait around the edges — build the picture in the empty middle. Tap Hint when stuck, and the gear for sound and settings.', gotIt: 'Got it',
    streak: 'days in a row', admin: 'Admin', adminTitle: 'Room administration', adminToken: 'Admin token', loadRooms: 'Load rooms', closeRoomAction: 'Close room', noRooms: 'No active rooms.', adminDisabled: 'Admin API is disabled on the server.', unauthorized: 'Invalid admin token.', backToApp: 'Back to collection', activeRooms: 'Active rooms', players: 'Players', moves: 'Moves', time: 'Time', status: 'Status', action: 'Action',
    ghostGuide: 'Ghost board', share: 'Share', stats: 'Statistics', totalSolved: 'Puzzles solved', totalPlays: 'Total games played', bestStreak: 'Best streak',
  },
  ar: {
    discover: 'اكتشف', daily: 'لغز اليوم', together: 'معًا', create: 'اصنع لغزًا', browse: 'تصفح الألغاز', continue: 'تابع اللعب', all: 'كل الألغاز', search: 'ابحث عن لون أو مكان أو مزاج', play: 'ابدأ اللعب', easy: 'سهل', medium: 'متوسط', hard: 'صعب', expert: 'خبير', save: 'حفظ التقدم', preview: 'الصورة', pause: 'إيقاف', resume: 'استمرار', exit: 'خروج', room: 'إنشاء غرفة', join: 'دخول غرفة', custom: 'اصنع لغزًا من صورتك', start: 'ابدأ الآن', language: 'English',
    edges: 'الحواف', allPieces: 'كل القطع', rearrange: 'خلطة جديدة', difficulty: 'الصعوبة', pieces: 'القطع', pieceWord: 'قطعة', rotate: 'دوران', hint: 'تلميح', fullscreen: 'ملء الشاشة', reference: 'الصورة الأصلية', solo: 'وضع فردي', soloCopy: 'ادعُ أصدقاءك لنفس اللوحة في أي وقت.', copyRoomCode: 'انسخ كود الغرفة', playAgain: 'العب تاني', back: 'رجوع للمجموعة', completeEyebrow: 'عمل جميل', completeTitle: 'الصورة اكتملت!', finishedIn: 'خلصت في', newBest: 'أفضل وقت جديد!', yourBest: 'أفضل وقت ليك',
    settings: 'الإعدادات', sound: 'المؤثرات الصوتية', volume: 'مستوى الصوت', guide: 'دليل التجميع', pieceSize: 'حجم القطع', confetti: 'احتفال الكونفيتي', debug: 'طبقة التصحيح (أرقام القطع)', reducedMotion: 'تقليل الحركة', pieceSizeNote: 'حجم القطع يُطبق عند بدء اللغز التالي.',
    nickname: 'الاسم', passwordLabel: 'كلمة سر الغرفة (اختياري)', orJoin: 'أو ادخل غرفة', roomsNote: 'الغرف متاحة عندما يكون سيرفر LumaPiece شغال.',
    helpText: 'القطع مستنية على الأطراف — كوّن الصورة في النص الفاضي.',
    welcome: 'أهلاً بيك في LumaPiece', welcomeBody: 'القطع مستنية على الأطراف — كوّن الصورة في النص الفاضي. زر التلميح لو علقت، والعجلة للإعدادات.', gotIt: 'يلا بينا',
    streak: 'يوم متتالي', admin: 'الإدارة', adminTitle: 'إدارة الغرف', adminToken: 'رمز الإدارة (ADMIN_TOKEN)', loadRooms: 'تحميل الغرف', closeRoomAction: 'إغلاق الغرفة', noRooms: 'لا توجد غرف نشطة حاليًا.', adminDisabled: 'واجهة الإدارة غير مفعلة على الخادم.', unauthorized: 'رمز الإدارة غير صحيح.', backToApp: 'رجوع للمجموعة', activeRooms: 'الغرف النشطة', players: 'اللاعبون', moves: 'الحركات', time: 'الوقت', status: 'الحالة', action: 'إجراء',
    ghostGuide: 'شفافية اللوحة', share: 'مشاركة', stats: 'الإحصائيات', totalSolved: 'ألغاز مكتملة', totalPlays: 'إجمالي الألعاب', bestStreak: 'أطول سلسلة',
  },
};

let locale = 'en';
try {
  locale = localStorage.getItem(STORAGE_KEY) || 'en';
} catch {
  // storage blocked (private mode); keep the default locale
}

export const getLocale = () => locale;
export const setLocale = (next) => {
  locale = next === 'ar' ? 'ar' : 'en';
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // storage full or blocked; locale still switches for this session
  }
};
export const t = (key) => copy[locale]?.[key] || copy.en[key] || key;

export const catalogTranslations = {
  sunrise: { ar: { title: 'نور الفجر', category: 'طبيعة' } },
  coast: { ar: { title: 'الساحل الأزرق', category: 'بحار' } },
  forest: { ar: { title: 'غابة هادئة', category: 'طبيعة' } },
  mountain: { ar: { title: 'قمم الصباح', category: 'جبال' } },
  garden: { ar: { title: 'حديقة سرية', category: 'زهور' } },
  city: { ar: { title: 'مدينة الشفق', category: 'مدن' } },
  space: { ar: { title: 'مدار الفضاء', category: 'فضاء' } },
  cafe: { ar: { title: 'قهوة هادئة', category: 'حياة يومية' } },
  desert: { ar: { title: 'صحراء العنبر', category: 'رحلات' } },
  snow: { ar: { title: 'ممر الثلج', category: 'طبيعة' } },
  festival: { ar: { title: 'ليلة الفوانيس', category: 'احتفالات' } },
  waves: { ar: { title: 'أمواج ممتدة', category: 'بحار' } },
  rain: { ar: { title: 'مطر النافذة', category: 'طبيعة' } },
  autumn: { ar: { title: 'خريف ذهبي', category: 'طبيعة' } },
  lake: { ar: { title: 'بحيرة ساكنة', category: 'بحار' } },
  meadow: { ar: { title: 'مرج مفتوح', category: 'طبيعة' } },
  canyon: { ar: { title: 'وادي عميق', category: 'رحلات' } },
  harbor: { ar: { title: 'مرفأ المساء', category: 'بحار' } },
  aurora: { ar: { title: 'أضواء الشفق', category: 'فضاء' } },
  carnival: { ar: { title: 'كرنفال الليل', category: 'احتفالات' } },
};

export function localizeTitle(id, originalTitle) {
  if (locale !== 'ar') return originalTitle;
  const baseId = String(id).split('-')[0];
  const item = catalogTranslations[baseId]?.ar;
  if (!item) return originalTitle;
  if (String(id).includes('-')) {
    const studyNum = String(id).split('-')[1];
    return `${item.title} — دراسة ${studyNum}`;
  }
  return item.title;
}

export function localizeCategory(id, originalCategory) {
  if (locale !== 'ar') return originalCategory;
  const baseId = String(id).split('-')[0];
  return catalogTranslations[baseId]?.ar?.category || originalCategory;
}
