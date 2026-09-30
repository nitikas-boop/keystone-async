// I: UI language switch (react-i18next). English and Hindi for Person 2's screens and the console chrome.
// Answers are translated on the backend (POST /i18n/translate-answer); citation IDs are never translated.
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const en = {
  nav: 'Knowledge', navLong: 'Knowledge & Conflicts',
  tabs: { proposals: 'Proposals & collisions', scan: 'Directory scan', reports: 'Reports', audio: 'Audio' },
  model: { cold: 'Model: not loaded', loading: 'Model: loading…', ready: 'Model: ready', failed: 'Model: failed to load' },
  lang: 'Language',
  scan: { title: 'Sign-in directory scan', summary: '{{n}} new, {{u}} updated, {{m}} missing', rescan: 'Rescan now',
    none: 'No scan yet. One runs at every sign-in.', baseline: 'First scan (baseline): an Owner must confirm before these files are queued.',
    confirm: 'Confirm baseline', review: 'Open Ingestion Review' },
  hypothetical: 'HYPOTHETICAL: nothing has changed', promote: 'Turn this into a draft proposal',
  translate: { showing: 'Shown in Hindi', original: 'Show English', translated: 'Show Hindi', working: 'Translating…' },
};

const hi = {
  nav: 'ज्ञान', navLong: 'ज्ञान और टकराव',
  tabs: { proposals: 'प्रस्ताव और टकराव', scan: 'फ़ोल्डर स्कैन', reports: 'रिपोर्ट', audio: 'ऑडियो' },
  model: { cold: 'मॉडल: लोड नहीं', loading: 'मॉडल: लोड हो रहा है…', ready: 'मॉडल: तैयार', failed: 'मॉडल: लोड नहीं हो सका' },
  lang: 'भाषा',
  scan: { title: 'साइन-इन फ़ोल्डर स्कैन', summary: '{{n}} नई, {{u}} बदली, {{m}} गायब', rescan: 'फिर से स्कैन करें',
    none: 'अभी कोई स्कैन नहीं। हर साइन-इन पर एक स्कैन चलता है।', baseline: 'पहला स्कैन (बेसलाइन): फ़ाइलें कतार में डालने से पहले मालिक की पुष्टि ज़रूरी है।',
    confirm: 'बेसलाइन की पुष्टि करें', review: 'इनजेशन रिव्यू खोलें' },
  hypothetical: 'काल्पनिक: कुछ भी नहीं बदला है', promote: 'इसे ड्राफ़्ट प्रस्ताव बनाएँ',
  translate: { showing: 'हिंदी में दिखाया गया', original: 'अंग्रेज़ी दिखाएँ', translated: 'हिंदी दिखाएँ', working: 'अनुवाद हो रहा है…' },
};

let saved = 'en';
try { saved = localStorage.getItem('kst.lang') || 'en'; } catch { /* storage unavailable */ }

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources: { en: { translation: en }, hi: { translation: hi } },
    lng: saved, fallbackLng: 'en', interpolation: { escapeValue: false },
  });
}

export function setLanguage(lng) {
  i18n.changeLanguage(lng);
  try { localStorage.setItem('kst.lang', lng); } catch { /* keep in memory */ }
}

export default i18n;
