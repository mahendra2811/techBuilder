import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';
import en from './locales/en.json';
import hi from './locales/hi.json';

const deviceCode = getLocales()[0]?.languageCode;
const initial = deviceCode === 'en' ? 'en' : 'hi'; // Hindi-first

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, hi: { translation: hi } },
  lng: initial,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export default i18n;
