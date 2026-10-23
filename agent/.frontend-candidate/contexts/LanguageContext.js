"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

const translations = {
  en: {
    appName: "Aushadh-AI",
    appTagline: "Aapki Dawai, Sahi Daam",
    disclaimerTitle: "Medical Notice",
    disclaimerText: "Informational only — confirm with doctor or pharmacist before substituting.",
    // Navigation
    navSearch: "Search & Compare",
    navScan: "Scan Strip",
    navStores: "Find Kendra",
    navHistory: "Saved History",
    navLaunchApp: "Launch PWA",
    navBackLanding: "Presentation View",
    // Common states
    loading: "Loading information…",
    retry: "Retry",
    notConnectedTitle: "Ready for Connection",
    notConnectedDesc: "Frontend foundation active. Awaiting backend verified data connection.",
    offlineNotice: "Offline mode — using cached app shell",
    // Page titles
    searchTitle: "Search Medicine & Compare Prices",
    searchSubtitle: "Verify Jan Aushadhi (PMBJP) generic alternatives against branded MRP and NPPA caps.",
    scanTitle: "Scan Prescription or Medicine Strip",
    scanSubtitle: "Upload a medicine box or prescription for OCR review and manual verification.",
    prescriptionTitle: "Confirmed Prescription Report",
    prescriptionSubtitle: "Review verified medicine substitutions, basket totals, and reminders.",
    storesTitle: "Find Jan Aushadhi Kendras",
    storesSubtitle: "Locate genuine PMBJP Kendras with verified addresses, opening hours, and driving routes.",
    historyTitle: "Device-Local Report History",
    historySubtitle: "Locally stored prescription summaries on this device. Zero login or cloud sync.",
    // Search page
    searchPlaceholder: "Search brand (e.g. Dolo, Glycomet) or molecule (Paracetamol, Metformin)…",
    searchAriaLabel: "Search brand or molecule name",
    searchHelpText: "Enter brand or molecule name to view verified PMBJP generic pricing and savings.",
    // Scan page
    uploadButton: "Choose Photo or Document",
    cameraButton: "Take Photo",
    ocrNotice: "OCR extracted text is unconfirmed. You must verify and select every medicine manually.",
    // Prescription detail
    estimatedSavingNotice: "Savings are estimated potential savings based on verified comparable pack prices.",
    printSlip: "Print Chemist Slip",
    callPatient: "Call Patient (Outbound)",
    // Stores page
    selectCity: "Select City",
    useLocation: "Use My Current Location",
    // History page
    emptyHistoryTitle: "No saved reports yet",
    emptyHistoryDesc: "Confirmed reports you generate on this phone will appear here for reprint and review.",
    localOnlyWarning: "Notice: Reports are saved strictly in this browser's IndexedDB. Clearing website data will remove local history."
  },
  hi: {
    appName: "औषध-एआई (Aushadh-AI)",
    appTagline: "आपकी दवाई, सही दाम",
    disclaimerTitle: "चिकित्सा सूचना",
    disclaimerText: "केवल सूचनात्मक — दवा बदलने से पहले डॉक्टर या फार्मासिस्ट से पुष्टि करें।",
    // Navigation
    navSearch: "खोजें व तुलना करें",
    navScan: "दवा स्कैन करें",
    navStores: "केंद्र खोजें",
    navHistory: "सहेजा इतिहास",
    navLaunchApp: "ऐप खोलें",
    navBackLanding: "प्रेजेंटेशन दृश्य",
    // Common states
    loading: "जानकारी लोड हो रही है…",
    retry: "पुनः प्रयास करें",
    notConnectedTitle: "कनेक्शन हेतु तैयार",
    notConnectedDesc: "फ़्रंटएंड बुनियादी ढांचा सक्रिय है। बैकएंड सत्यापित डेटा कनेक्शन की प्रतीक्षा है।",
    offlineNotice: "ऑफ़लाइन मोड — कैश्ड ऐप शेल का उपयोग हो रहा है",
    // Page titles
    searchTitle: "दवा खोजें और मूल्य तुलना देखें",
    searchSubtitle: "ब्रांडेड एमआरपी और एनपीपीए सीलिंग के मुकाबले जन औषधि (PMBJP) जेनेरिक विकल्प सत्यापित करें।",
    scanTitle: "दवा की पट्टी या पर्चा स्कैन करें",
    scanSubtitle: "समीक्षा और हस्तचालित पुष्टि के लिए दवा के डिब्बे या पर्चे की तस्वीर अपलोड करें।",
    prescriptionTitle: "पुष्ट दवा रिपोर्ट",
    prescriptionSubtitle: "सत्यापित जेनेरिक विकल्प, कुल मूल्य और दवा स्मरण की समीक्षा करें।",
    storesTitle: "जन औषधि केंद्र खोजें",
    storesSubtitle: "सत्यापित पते और ड्राइविंग मार्ग के साथ निकटतम आधिकारिक केंद्र खोजें।",
    historyTitle: "डिवाइस में सहेजी गई रिपोर्ट",
    historySubtitle: "इस फ़ोन पर स्थानीय रूप से सुरक्षित विवरण। कोई लॉगिन या क्लाउड सिंक नहीं।",
    // Search page
    searchPlaceholder: "ब्रांड (जैसे डोलो, ग्लाइकोमेट) या मूल घटक (पैरासिटामोल) लिखें…",
    searchAriaLabel: "ब्रांड या मूल घटक नाम खोजें",
    searchHelpText: "सत्यापित जन औषधि (PMBJP) मूल्य और संभावित बचत देखने के लिए नाम दर्ज करें।",
    // Scan page
    uploadButton: "फोटो या दस्तावेज चुनें",
    cameraButton: "कैमरे से फोटो लें",
    ocrNotice: "स्कैन से पढ़ा गया पाठ अपुष्ट है। प्रत्येक दवा की स्वयं पुष्टि करना अनिवार्य है।",
    // Prescription detail
    estimatedSavingNotice: "बचत केवल समतुल्य पैक कीमतों के आधार पर आकलित संभावित बचत है।",
    printSlip: "केमिस्ट पर्ची प्रिंट करें",
    callPatient: "मरीज को कॉल करें",
    // Stores page
    selectCity: "शहर चुनें",
    useLocation: "मेरा वर्तमान स्थान उपयोग करें",
    // History page
    emptyHistoryTitle: "अभी तक कोई रिपोर्ट नहीं है",
    emptyHistoryDesc: "इस फ़ोन पर बनाई गई पुष्ट रिपोर्ट यहाँ पुनः देखने और प्रिंट करने के लिए मिलेंगी।",
    localOnlyWarning: "ध्यान दें: रिपोर्ट केवल इस ब्राउज़र में रहती हैं। ब्राउज़र डेटा साफ़ करने पर इतिहास हट जाएगा।"
  }
};

const LanguageContext = createContext({
  language: "en",
  setLanguage: () => {},
  t: translations.en
});

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState("en");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("aushadh_lang");
      if (saved === "hi" || saved === "en") {
        setLanguageState(saved);
      }
    } catch {}
  }, []);

  const setLanguage = (lang) => {
    setLanguageState(lang);
    try {
      localStorage.setItem("aushadh_lang", lang);
    } catch {}
    if (typeof document !== "undefined") {
      document.documentElement.lang = lang;
    }
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t: translations[language] }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
