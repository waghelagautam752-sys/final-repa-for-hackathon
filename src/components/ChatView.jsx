import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Paperclip, X, User, Stethoscope, Sparkles, Mic, MicOff, Volume2, Square, Phone, PhoneOff, Globe } from 'lucide-react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

const SUGGESTED_PROMPTS = [
  "What are the side effects of Metformin?",
  "Can I take ibuprofen with my current meds?",
  "What foods should I avoid with high HbA1c?",
  "Explain my latest blood pressure readings",
];

// Check browser support
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const speechSynthesis = window.speechSynthesis;

// ─── Language Configs ──────────────────────────────────────────
const LANGUAGES = {
  en: { code: 'en-US', label: 'English', flag: '🇺🇸', speechLang: 'en',
    greeting: "Hi! I'm your CareSync health assistant. Go ahead and ask me anything about your health or medications.",
    listenHint: 'Speak now — I\'m listening...',
    promptLang: 'English' },
  hi: { code: 'hi-IN', label: 'हिन्दी', flag: '🇮🇳', speechLang: 'hi',
    greeting: 'नमस्ते! मैं आपका CareSync स्वास्थ्य सहायक हूँ। अपने स्वास्थ्य या दवाओं के बारे में कुछ भी पूछें।',
    listenHint: 'अभी बोलें — मैं सुन रहा हूँ...',
    promptLang: 'Hindi (in native Devanagari script)' },
  gu: { code: 'gu-IN', label: 'ગુજરાતી', flag: '🇮🇳', speechLang: 'gu',
    greeting: 'નમસ્તે! હું તમારો CareSync સ્વાસ્થ્ય સહાયક છું. તમારા સ્વાસ્થ્ય અથવા દવાઓ વિશે કંઈપણ પૂછો.',
    listenHint: 'હવે બોલો — હું સાંભળી રહ્યો છું...',
    promptLang: 'Gujarati (in native Gujarati script)' },
  mr: { code: 'mr-IN', label: 'मराठी', flag: '🇮🇳', speechLang: 'mr',
    greeting: 'नमस्कार! मी तुमचा CareSync आरोग्य सहाय्यक आहे. तुमच्या आरोग्य किंवा औषधांबद्दल काहीही विचारा.',
    listenHint: 'आता बोला — मी ऐकत आहे...',
    promptLang: 'Marathi (in native Devanagari script)' },
};

// ─── Voice Call Overlay ────────────────────────────────────────
function VoiceCallOverlay({ onClose, medications }) {
  const [callState, setCallState] = useState('connecting'); // connecting | listening | thinking | speaking | idle
  const [transcript, setTranscript] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [callDuration, setCallDuration] = useState(0);
  const [conversationHistory, setConversationHistory] = useState([]);
  const [selectedLang, setSelectedLang] = useState('en');
  const [showLangPicker, setShowLangPicker] = useState(false);

  const langConfig = LANGUAGES[selectedLang];

  const recognitionRef = useRef(null);
  const silenceTimerRef = useRef(null);
  const durationTimerRef = useRef(null);
  const isMountedRef = useRef(true);
  const isProcessingRef = useRef(false);

  // Refs to fix stale closures in the speech auto-loop
  const langRef = useRef(selectedLang);
  const historyRef = useRef([]);

  useEffect(() => {
    langRef.current = selectedLang;
  }, [selectedLang]);

  useEffect(() => {
    historyRef.current = conversationHistory;
  }, [conversationHistory]);

  // Timer for call duration
  useEffect(() => {
    durationTimerRef.current = setInterval(() => {
      if (isMountedRef.current) setCallDuration(prev => prev + 1);
    }, 1000);
    return () => clearInterval(durationTimerRef.current);
  }, []);

  // Simulate "connecting" animation
  useEffect(() => {
    const t = setTimeout(() => {
      if (isMountedRef.current) {
        setCallState('idle');
        const greeting = langConfig.greeting;
        setAiResponse(greeting);
        setCallState('speaking');
        speakAndListen(greeting);
      }
    }, 1500);
    return () => clearTimeout(t);
  }, []);

  // Cleanup
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (recognitionRef.current) try { recognitionRef.current.stop(); } catch(_){}
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (speechSynthesis) speechSynthesis.cancel();
      clearInterval(durationTimerRef.current);
    };
  }, []);

  const formatDuration = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  };

  const speakAndListen = (text) => {
    if (!speechSynthesis || !isMountedRef.current) return;
    speechSynthesis.cancel();

    const currentLangConfig = LANGUAGES[langRef.current];

    const clean = text
      .replace(/#{1,6}\s?/g, '')
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/`(.+?)`/g, '$1')
      .replace(/\[(.+?)\]\(.+?\)/g, '$1')
      .replace(/[-*]\s/g, '')
      .replace(/\n{2,}/g, '. ')
      .replace(/\n/g, '. ')
      .trim();

    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    const voices = speechSynthesis.getVoices();
    // Try to find the exact native voice for the selected language
    const preferred = voices.find(v => v.lang === currentLangConfig.code && v.name.includes('Google'))
      || voices.find(v => v.lang === currentLangConfig.code)
      || voices.find(v => v.lang.startsWith(currentLangConfig.speechLang))
      || voices.find(v => v.lang.startsWith('en')); // Fallback

    if (preferred) {
      utterance.voice = preferred;
      utterance.lang = preferred.lang;
    } else {
      utterance.lang = currentLangConfig.code;
    }

    utterance.onend = () => {
      if (isMountedRef.current) {
        setCallState('listening');
        startListening();
      }
    };
    utterance.onerror = () => {
      if (isMountedRef.current) {
        setCallState('listening');
        startListening();
      }
    };

    setCallState('speaking');
    speechSynthesis.speak(utterance);
  };

  const startListening = () => {
    if (!SpeechRecognition || !isMountedRef.current || isProcessingRef.current) return;

    const currentLangConfig = LANGUAGES[langRef.current];

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = currentLangConfig.code;

    let fullTranscript = '';

    recognition.onresult = (event) => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

      let interim = '';
      let final = '';
      for (let i = 0; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          final += event.results[i][0].transcript;
        } else {
          interim += event.results[i][0].transcript;
        }
      }
      fullTranscript = final;
      if (isMountedRef.current) {
        setTranscript((final + ' ' + interim).trim());
      }

      // Auto-stop after 2.5 seconds of silence
      silenceTimerRef.current = setTimeout(() => {
        if (isMountedRef.current && fullTranscript.trim()) {
          recognition.stop();
        }
      }, 2500);
    };

    recognition.onerror = (event) => {
      console.warn('Voice call recognition error:', event.error);
      if (event.error === 'no-speech' && isMountedRef.current && !isProcessingRef.current) {
        // Restart listening if no speech detected
        setTimeout(() => {
          if (isMountedRef.current && !isProcessingRef.current) startListening();
        }, 500);
      }
    };

    recognition.onend = () => {
      if (isMountedRef.current && fullTranscript.trim() && !isProcessingRef.current) {
        processUserSpeech(fullTranscript.trim());
      } else if (isMountedRef.current && !isProcessingRef.current) {
        // No speech detected, restart listening
        setTimeout(() => {
          if (isMountedRef.current && !isProcessingRef.current) startListening();
        }, 500);
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      if (isMountedRef.current) setCallState('listening');
    } catch (err) {
      console.warn('Failed to start voice recognition:', err);
    }
  };

  const processUserSpeech = async (userText) => {
    if (!isMountedRef.current || isProcessingRef.current) return;
    isProcessingRef.current = true;

    setCallState('thinking');
    setTranscript(userText);

    const newHistory = [...historyRef.current, { role: 'user', text: userText }];
    setConversationHistory(newHistory);

    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey) throw new Error('API key missing');

      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey });

      let medContext = '';
      if (medications && medications.length > 0) {
        medContext = "Patient's current medications: " + medications.map(m => `${m.name} (${m.dosage || 'unknown dosage'})`).join(', ') + ". ";
      }

      // Build conversation context
      const historyContext = newHistory.slice(-6).map(h => `${h.role === 'user' ? 'Patient' : 'Doctor'}: ${h.text}`).join('\n');

      const currentLangConfig = LANGUAGES[langRef.current];

      const prompt = `You are CareSync, a warm, friendly and knowledgeable AI health assistant on a live voice call with a patient. ${medContext}

Recent conversation:
${historyContext}

CRITICAL LANGUAGE RULES:
1. The user has selected ${currentLangConfig.label} as their language. You MUST reply ENTIRELY in ${currentLangConfig.promptLang}. Do NOT use English unless the selected language is English.
2. Speak in SIMPLE, EVERYDAY layman language that a common person without any medical background can easily understand. Do NOT use medical jargon — translate everything into simple everyday words in the target language.
3. Keep your response concise (2-4 sentences max), conversational, warm, and caring.
4. Don't use markdown formatting, bullet points, or special characters — speak naturally as a friendly neighborhood doctor would on a phone call.
5. If the patient says goodbye or wants to end the call, wish them well warmly.`;

      const modelsToTry = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-2.5-flash'];
      let responseText = null;

      for (const model of modelsToTry) {
        try {
          const response = await ai.models.generateContent({ model, contents: prompt });
          responseText = response.text;
          if (responseText) break;
        } catch (e) {
          console.warn(`Voice call model ${model} failed:`, e.message);
        }
      }

      if (!responseText) {
        const curLang = langRef.current;
        responseText = curLang === 'hi' ? 'माफ़ कीजिए, कुछ समस्या आ रही है। कृपया फिर से बोलें।'
          : curLang === 'gu' ? 'માફ કરજો, કંઈક સમસ્યા આવી છે. કૃપા કરીને ફરીથી બોલો.'
          : curLang === 'mr' ? 'माफ करा, काही समस्या आली आहे. कृपया पुन्हा बोला.'
          : "I'm sorry, I'm having trouble connecting right now. Could you repeat that?";
      }

      if (isMountedRef.current) {
        setAiResponse(responseText);
        setConversationHistory(prev => [...prev, { role: 'assistant', text: responseText }]);
        speakAndListen(responseText);
      }
    } catch (err) {
      console.error('Voice call AI error:', err);
      if (isMountedRef.current) {
        const curLang = langRef.current;
        const fallback = curLang === 'hi' ? 'अभी कुछ समस्या है। कृपया दोबारा पूछें।'
          : curLang === 'gu' ? 'હમણાં કંઈક સમસ્યા છે. કૃપા કરીને ફરીથી પૂછો.'
          : curLang === 'mr' ? 'सध्या काही समस्या आहे. कृपया पुन्हा विचारा.'
          : "I'm having a little trouble right now. Could you try asking again?";
        setAiResponse(fallback);
        speakAndListen(fallback);
      }
    } finally {
      isProcessingRef.current = false;
    }
  };

  const handleHangUp = () => {
    if (recognitionRef.current) try { recognitionRef.current.stop(); } catch(_){}
    if (speechSynthesis) speechSynthesis.cancel();
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    isMountedRef.current = false;
    onClose();
  };

  // Orb animation classes
  const getOrbClasses = () => {
    switch (callState) {
      case 'connecting': return 'scale-75 opacity-60';
      case 'listening': return 'scale-100 animate-pulse';
      case 'thinking': return 'scale-90 animate-spin-slow';
      case 'speaking': return 'scale-110 animate-breathe';
      default: return 'scale-100';
    }
  };

  const getOrbGradient = () => {
    switch (callState) {
      case 'connecting': return 'from-slate-400 to-slate-500';
      case 'listening': return 'from-brand-500 to-indigo-500';
      case 'thinking': return 'from-amber-400 to-orange-500';
      case 'speaking': return 'from-emerald-400 to-teal-500';
      default: return 'from-brand-500 to-indigo-500';
    }
  };

  const getStatusLabel = () => {
    switch (callState) {
      case 'connecting': return 'Connecting...';
      case 'listening': return 'Listening...';
      case 'thinking': return 'Thinking...';
      case 'speaking': return 'Speaking...';
      default: return 'Ready';
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center" style={{
      background: 'radial-gradient(ellipse at center, #0f172a 0%, #020617 100%)'
    }}>
      {/* Ambient glow rings */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-gradient-to-r ${getOrbGradient()} opacity-[0.08] blur-3xl transition-all duration-1000 ${callState === 'speaking' ? 'scale-125' : callState === 'listening' ? 'scale-110' : 'scale-100'}`} />
        <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[350px] h-[350px] rounded-full bg-gradient-to-r ${getOrbGradient()} opacity-[0.05] blur-2xl transition-all duration-700 ${callState === 'speaking' ? 'scale-150' : 'scale-100'}`} />
      </div>

      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 p-6 flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white/10 backdrop-blur-sm rounded-full flex items-center justify-center border border-white/10">
            <Stethoscope size={18} className="text-white/80" />
          </div>
          <div>
            <h3 className="text-white font-bold text-sm">CareSync Health AI</h3>
            <p className="text-white/50 text-[11px] font-medium">{formatDuration(callDuration)}</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-3">
            {/* Language Picker */}
          <div className="relative">
            <button
              onClick={() => setShowLangPicker(!showLangPicker)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-sm border border-white/10 text-white/80 hover:bg-white/20 hover:text-white transition-all text-xs font-semibold"
            >
              <Globe size={13} />
              <span>{langConfig.flag} {langConfig.label}</span>
            </button>
            {showLangPicker && (
              <div className="absolute right-0 top-full mt-2 bg-slate-800/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl overflow-hidden min-w-[160px] animate-in z-50">
                {Object.entries(LANGUAGES).map(([key, lang]) => (
                  <button
                    key={key}
                    onClick={() => {
                      setSelectedLang(key);
                      setShowLangPicker(false);
                    }}
                    className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium transition-colors ${
                      selectedLang === key
                        ? 'bg-brand-500/20 text-brand-300'
                        : 'text-white/70 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <span className="text-base">{lang.flag}</span>
                    <span>{lang.label}</span>
                    {selectedLang === key && <span className="ml-auto text-brand-400">✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          <span className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
            callState === 'listening' ? 'text-brand-300 bg-brand-500/10 border-brand-500/20' :
            callState === 'speaking' ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20' :
            callState === 'thinking' ? 'text-amber-300 bg-amber-500/10 border-amber-500/20' :
            'text-white/40 bg-white/5 border-white/10'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${
              callState === 'listening' ? 'bg-brand-400 animate-pulse' :
              callState === 'speaking' ? 'bg-emerald-400 animate-pulse' :
              callState === 'thinking' ? 'bg-amber-400 animate-ping' :
              'bg-white/30'
            }`} />
            {getStatusLabel()}
          </span>
          </div>
          {/* Helper tip for the user */}
          {callState === 'idle' && selectedLang === 'en' && (
             <div className="text-[10px] text-brand-300/80 font-medium animate-pulse mt-1 mr-2">
               ↑ Select language first
             </div>
          )}
        </div>
      </div>

      {/* Center: Animated Orb */}
      <div className="flex flex-col items-center gap-8 z-10">
        {/* Orb */}
        <div className="relative">
          {/* Outer ring pulses */}
          {callState === 'listening' && (
            <>
              <div className="absolute inset-0 w-40 h-40 rounded-full bg-gradient-to-r from-brand-500/20 to-indigo-500/20 animate-ping" style={{ animationDuration: '2s' }} />
              <div className="absolute -inset-4 w-48 h-48 rounded-full bg-gradient-to-r from-brand-500/10 to-indigo-500/10 animate-ping" style={{ animationDuration: '3s' }} />
            </>
          )}
          {callState === 'speaking' && (
            <>
              <div className="absolute -inset-3 w-46 h-46 rounded-full bg-gradient-to-r from-emerald-500/15 to-teal-500/15 animate-ping" style={{ animationDuration: '1.5s' }} />
              <div className="absolute -inset-6 w-52 h-52 rounded-full bg-gradient-to-r from-emerald-500/10 to-teal-500/10 animate-ping" style={{ animationDuration: '2.5s' }} />
            </>
          )}

          <div className={`w-40 h-40 rounded-full bg-gradient-to-br ${getOrbGradient()} shadow-2xl transition-all duration-500 ease-in-out ${getOrbClasses()} flex items-center justify-center`}
               style={{ boxShadow: `0 0 80px 20px ${callState === 'listening' ? 'rgba(99,102,241,0.3)' : callState === 'speaking' ? 'rgba(16,185,129,0.3)' : callState === 'thinking' ? 'rgba(245,158,11,0.3)' : 'rgba(148,163,184,0.2)'}` }}>
            {callState === 'thinking' ? (
              <div className="flex gap-1.5">
                <span className="w-2.5 h-2.5 bg-white/80 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2.5 h-2.5 bg-white/80 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2.5 h-2.5 bg-white/80 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            ) : callState === 'connecting' ? (
              <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Stethoscope size={42} className="text-white/90" />
            )}
          </div>
        </div>

        {/* Transcript / Response display */}
        <div className="max-w-sm text-center space-y-3 min-h-[80px]">
          {callState === 'listening' && transcript && (
            <div className="animate-in fade-in duration-200">
              <p className="text-[10px] font-bold text-brand-400 uppercase tracking-widest mb-1">You</p>
              <p className="text-white/90 text-sm font-medium leading-relaxed">{transcript}</p>
            </div>
          )}
          {callState === 'thinking' && transcript && (
            <div>
              <p className="text-[10px] font-bold text-amber-400 uppercase tracking-widest mb-1">Processing</p>
              <p className="text-white/60 text-xs font-medium italic">"{transcript}"</p>
            </div>
          )}
          {(callState === 'speaking' || callState === 'idle') && aiResponse && (
            <div className="animate-in fade-in duration-300">
              <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mb-1">CareSync</p>
              <p className="text-white/80 text-sm font-medium leading-relaxed">{aiResponse}</p>
            </div>
          )}
          {callState === 'connecting' && (
            <p className="text-white/40 text-sm font-medium animate-pulse">Connecting to CareSync AI...</p>
          )}
          {callState === 'listening' && !transcript && (
            <p className="text-white/30 text-xs font-medium">{langConfig.listenHint}</p>
          )}
        </div>
      </div>

      {/* Bottom: Hang up + controls */}
      <div className="absolute bottom-0 left-0 right-0 p-8 flex items-center justify-center gap-6 z-10">
        {/* Mute / unmute toggle (visual only for polish) */}
        <button
          onClick={() => {
            if (callState === 'listening' && recognitionRef.current) {
              recognitionRef.current.stop();
              setCallState('idle');
            } else if (callState === 'idle' || callState === 'speaking') {
              if (speechSynthesis) speechSynthesis.cancel();
              setCallState('listening');
              startListening();
            }
          }}
          className="w-14 h-14 rounded-full bg-white/10 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white/70 hover:bg-white/20 hover:text-white transition-all"
          title={callState === 'listening' ? 'Mute' : 'Unmute'}
        >
          {callState === 'listening' ? <MicOff size={22} /> : <Mic size={22} />}
        </button>

        {/* Hang up */}
        <button
          onClick={handleHangUp}
          className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center text-white shadow-lg shadow-red-500/30 transition-all hover:scale-105 active:scale-95"
          title="End Call"
        >
          <PhoneOff size={26} />
        </button>

        {/* Speaker toggle */}
        <button
          onClick={() => {
            if (speechSynthesis && callState === 'speaking') {
              speechSynthesis.cancel();
              setCallState('listening');
              startListening();
            }
          }}
          className="w-14 h-14 rounded-full bg-white/10 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white/70 hover:bg-white/20 hover:text-white transition-all"
          title="Skip response"
        >
          <Volume2 size={22} />
        </button>
      </div>
    </div>
  );
}

// ─── Main ChatView ─────────────────────────────────────────────
export default function ChatView({ userId }) {
  const [medications, setMedications] = useState([]);
  const [showVoiceCall, setShowVoiceCall] = useState(false);
  const [chatLang, setChatLang] = useState('en');
  const [showChatLangPicker, setShowChatLangPicker] = useState(false);
  const chatLangConfig = LANGUAGES[chatLang];

  useEffect(() => {
    if (userId) {
      fetch(`/api/medications/${userId}`)
        .then(res => res.json())
        .then(data => setMedications(data))
        .catch(err => console.error('Failed to fetch medications:', err));
    }
  }, [userId]);
  const [messages, setMessages] = useState([
    { role: 'assistant', content: "Hello! I'm your CareSync health assistant. I can help you understand your medications, analyze lab results, or answer general health questions.\n\nHow can I help you today?" }
  ]);
  const [input, setInput] = useState('');
  const [attachment, setAttachment] = useState(null);
  const [attachmentPreview, setAttachmentPreview] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef(null);
  const chatEndRef = useRef(null);

  // Voice state
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speakingMsgIndex, setSpeakingMsgIndex] = useState(null);
  const recognitionRef = useRef(null);
  const silenceTimerRef = useRef(null);
  const baseInputRef = useRef('');

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch (_) {}
      }
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (speechSynthesis) speechSynthesis.cancel();
    };
  }, []);

  const toggleListening = useCallback(() => {
    if (!SpeechRecognition) return;

    if (isListening) {
      if (recognitionRef.current) recognitionRef.current.stop();
    } else {
      // Stop any TTS playback when starting to listen
      if (speechSynthesis) {
        speechSynthesis.cancel();
        setIsSpeaking(false);
        setSpeakingMsgIndex(null);
      }
      
      // Save what the user already typed
      baseInputRef.current = input; 
      
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event) => {
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

        let currentSessionTranscript = '';

        // Iterate through all results for this entire recording session
        for (let i = 0; i < event.results.length; i++) {
          currentSessionTranscript += event.results[i][0].transcript;
        }

        // Combine whatever they typed before clicking mic + the new voice input
        const newText = (baseInputRef.current + ' ' + currentSessionTranscript).trim();
        setInput(newText);

        // Auto-stop after 3 seconds of silence
        silenceTimerRef.current = setTimeout(() => {
          recognition.stop();
        }, 3000);
      };

      recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = null;
        }
      };

      recognitionRef.current = recognition;
      try {
        recognition.start();
        setIsListening(true);
      } catch (err) {
        console.error('Failed to start recognition:', err);
      }
    }
  }, [isListening, input]);

  // Text-to-speech: strip markdown for cleaner reading
  const speakText = useCallback((text, msgIndex) => {
    if (!speechSynthesis) return;

    // If already speaking this message, stop
    if (isSpeaking && speakingMsgIndex === msgIndex) {
      speechSynthesis.cancel();
      setIsSpeaking(false);
      setSpeakingMsgIndex(null);
      return;
    }

    speechSynthesis.cancel();

    // Strip markdown syntax for natural speech
    const clean = text
      .replace(/#{1,6}\s?/g, '')
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/`(.+?)`/g, '$1')
      .replace(/\[(.+?)\]\(.+?\)/g, '$1')
      .replace(/[-*]\s/g, '')
      .replace(/\n{2,}/g, '. ')
      .replace(/\n/g, '. ')
      .trim();

    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.rate = 0.95;
    utterance.pitch = 1;
    utterance.lang = 'en-US';

    // Pick a natural voice if available
    const voices = speechSynthesis.getVoices();
    const preferred = voices.find(v => v.name.includes('Google') && v.lang.startsWith('en'))
      || voices.find(v => v.lang.startsWith('en') && v.localService);
    if (preferred) utterance.voice = preferred;

    utterance.onend = () => {
      setIsSpeaking(false);
      setSpeakingMsgIndex(null);
    };
    utterance.onerror = () => {
      setIsSpeaking(false);
      setSpeakingMsgIndex(null);
    };

    setIsSpeaking(true);
    setSpeakingMsgIndex(msgIndex);
    speechSynthesis.speak(utterance);
  }, [isSpeaking, speakingMsgIndex]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const removeAttachment = () => {
    setAttachment(null);
    setAttachmentPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setAttachment(file);
      const reader = new FileReader();
      reader.onloadend = () => setAttachmentPreview(reader.result);
      reader.readAsDataURL(file);
    }
  };

  const fileToGenerativePart = async (file) => {
    const data = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result.split(',')[1]);
      reader.readAsDataURL(file);
    });
    return { inlineData: { data, mimeType: file.type } };
  };

  const handleSend = async (overrideText) => {
    // Stop listening if active
    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
    }

    const text = overrideText || input;
    if (!text.trim() && !attachment) return;

    const userMsg = { role: 'user', content: text, image: attachmentPreview };
    setMessages(prev => [...prev, userMsg]);

    const currentInput = text;
    const currentAttachment = attachment;
    setInput('');
    removeAttachment();
    setIsLoading(true);

    // Add a placeholder assistant message that we'll stream into
    const assistantIndex = messages.length + 1; // +1 for the user msg we just added
    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey) throw new Error("API Key is missing. Add VITE_GEMINI_API_KEY to your .env file.");

      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey });

      let medContext = '';
      if (medications && medications.length > 0) {
        medContext = "The patient's current medications are: " + medications.map(m => `${m.name} (${m.dosage || 'unknown dosage'}) - ${m.frequency || 'unknown frequency'}`).join(', ') + ". ";
      }

      const autoLangRule = `\n\nCRITICAL LANGUAGE RULES:\n1. The patient is communicating in ${chatLangConfig.label}. You MUST reply ENTIRELY in ${chatLangConfig.promptLang}.\n2. Use SIMPLE, EVERYDAY layman language — no medical jargon. Explain everything like you're talking to a friend or family member who has no medical knowledge.\n3. Translate medical terms into simple local language words the patient will understand.`;

      const systemPrompt = currentAttachment
        ? `You are a warm, friendly medical assistant called CareSync. ${medContext}The patient has attached a medical image/report. Analyze it carefully. The patient says: "${currentInput || 'Please analyze this image.'}". Provide a structured, easy-to-understand response using bullet points and clear sections. Be professional, empathetic, and use simple language.${autoLangRule}`
        : `You are a warm, friendly medical assistant called CareSync. ${medContext}The patient asks: "${currentInput}". Provide a structured, easy-to-understand response using bullet points or short clear sections. Be professional, empathetic, and use simple everyday language. Use markdown formatting for readability.${autoLangRule}`;

      let contentParts;
      if (currentAttachment) {
        const imagePart = await fileToGenerativePart(currentAttachment);
        contentParts = [{ role: 'user', parts: [imagePart, { text: systemPrompt }] }];
      } else {
        contentParts = systemPrompt;
      }

      const modelsToTry = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'];
      let streamed = false;

      for (const modelName of modelsToTry) {
        try {
          const stream = await ai.models.generateContentStream({ model: modelName, contents: contentParts });
          let accumulated = '';
          for await (const chunk of stream) {
            accumulated += chunk.text || '';
            const snapshot = accumulated;
            setMessages(prev => prev.map((m, i) => i === assistantIndex ? { ...m, content: snapshot } : m));
          }
          streamed = true;
          break;
        } catch (modelError) {
          if (modelName === modelsToTry[modelsToTry.length - 1]) throw modelError;
        }
      }

      if (!streamed) {
        setMessages(prev => prev.map((m, i) => i === assistantIndex ? { ...m, content: "I'm sorry, I couldn't process that request." } : m));
      }
    } catch (err) {
      setMessages(prev => prev.map((m, i) => i === assistantIndex ? { ...m, content: `**Error:** ${err.message}\n\nPlease check your API key configuration and try again.` } : m));
    } finally {
      setIsLoading(false);
    }
  };

  const showSuggestions = messages.length <= 1;
  const hasSpeechSupport = !!SpeechRecognition;
  const hasTTSSupport = !!speechSynthesis;

  return (
    <div className="max-w-3xl mx-auto h-full flex flex-col">

      {/* Voice Call Fullscreen Overlay */}
      {showVoiceCall && (
        <VoiceCallOverlay
          onClose={() => setShowVoiceCall(false)}
          medications={medications}
        />
      )}

      <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-sm ${
                msg.role === 'user'
                  ? 'bg-brand-600 text-white'
                  : 'bg-slate-100 text-slate-600 border border-slate-200'
              }`}>
                {msg.role === 'user' ? <User size={15} /> : <Stethoscope size={15} />}
              </div>
              <div className={`max-w-[78%] rounded-xl text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-brand-600 text-white rounded-tr-sm'
                  : 'bg-slate-50 text-slate-700 border border-slate-150 rounded-tl-sm'
              }`}>
                <div className="px-4 py-3">
                  {msg.image && (
                    <img src={msg.image} alt="Upload" className="rounded-lg max-w-full max-h-52 object-cover mb-2" />
                  )}
                  {msg.content && (
                    msg.role === 'user'
                      ? <div className="whitespace-pre-wrap">{msg.content}</div>
                      : <div className="prose prose-sm prose-slate max-w-none prose-p:my-1.5 prose-headings:font-semibold prose-headings:text-slate-800 prose-li:my-0.5 prose-a:text-brand-600"
                          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(marked.parse(msg.content)) }} />
                  )}
                </div>
                {/* TTS button on assistant messages */}
                {msg.role === 'assistant' && hasTTSSupport && msg.content && (
                  <div className="px-3 pb-2 flex justify-end">
                    <button
                      onClick={() => speakText(msg.content, i)}
                      className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
                        isSpeaking && speakingMsgIndex === i
                          ? 'text-red-600 bg-red-50 hover:bg-red-100'
                          : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
                      }`}
                      title={isSpeaking && speakingMsgIndex === i ? 'Stop reading' : 'Read aloud'}
                    >
                      {isSpeaking && speakingMsgIndex === i
                        ? <><Square size={10} /> Stop</>
                        : <><Volume2 size={12} /> Listen</>
                      }
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center">
                <Stethoscope size={15} className="text-slate-500 animate-pulse" />
              </div>
              <div className="px-4 py-3 rounded-xl bg-slate-50 border border-slate-150 rounded-tl-sm flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          )}

          {/* Suggested prompts */}
          {showSuggestions && !isLoading && (
            <div className="pt-4">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Sparkles size={12} /> Suggested questions
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {SUGGESTED_PROMPTS.map((prompt, i) => (
                  <button
                    key={i}
                    onClick={() => handleSend(prompt)}
                    className="text-left text-sm text-slate-600 bg-slate-50 hover:bg-brand-50 hover:text-brand-700 border border-slate-200 hover:border-brand-200 rounded-lg px-3.5 py-2.5 transition-colors"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Input area */}
        <div className="p-3 border-t border-slate-100 bg-white">
          {/* Voice listening indicator */}
          {isListening && (
            <div className="mb-2 flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-100 rounded-lg">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
              </span>
              <span className="text-xs font-medium text-red-700">Listening... speak now</span>
              <button onClick={toggleListening} className="ml-auto text-xs text-red-600 hover:text-red-800 font-medium">
                Stop
              </button>
            </div>
          )}

          {attachmentPreview && (
            <div className="mb-2 relative inline-block">
              <img src={attachmentPreview} alt="Preview" className="h-16 rounded-lg border border-slate-200" />
              <button onClick={removeAttachment} className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center">
                <X size={11} />
              </button>
            </div>
          )}
          <div className="flex items-center gap-2">
            <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
            <button onClick={() => fileInputRef.current?.click()} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-colors" title="Attach image">
              <Paperclip size={18} />
            </button>

            {/* Language Picker for Text Chat */}
            <div className="relative">
              <button
                onClick={() => setShowChatLangPicker(!showChatLangPicker)}
                className="flex items-center gap-1 px-2 py-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-colors text-xs font-semibold"
                title="Change reply language"
              >
                <Globe size={16} />
                <span className="text-[11px]">{chatLangConfig.flag}</span>
              </button>
              {showChatLangPicker && (
                <div className="absolute left-0 bottom-full mb-2 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden min-w-[150px] z-50 animate-in">
                  <div className="px-3 py-2 border-b border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Reply Language</p>
                  </div>
                  {Object.entries(LANGUAGES).map(([key, lang]) => (
                    <button
                      key={key}
                      onClick={() => {
                        setChatLang(key);
                        setShowChatLangPicker(false);
                      }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm font-medium transition-colors ${
                        chatLang === key
                          ? 'bg-brand-50 text-brand-700'
                          : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <span>{lang.flag}</span>
                      <span>{lang.label}</span>
                      {chatLang === key && <span className="ml-auto text-brand-500 text-xs">✓</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Mic button */}
            {hasSpeechSupport && (
              <button
                onClick={toggleListening}
                disabled={isLoading}
                className={`p-2 rounded-lg transition-all ${
                  isListening
                    ? 'bg-red-100 text-red-600 hover:bg-red-200 animate-pulse'
                    : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                } disabled:opacity-40`}
                title={isListening ? 'Stop listening' : 'Voice input'}
              >
                {isListening ? <MicOff size={18} /> : <Mic size={18} />}
              </button>
            )}

            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !isLoading && handleSend()}
              placeholder={isListening ? 'Listening...' : (chatLang === 'hi' ? 'स्वास्थ्य सवाल पूछें...' : chatLang === 'gu' ? 'સ્વાસ્થ્ય વિશે પૂછો...' : chatLang === 'mr' ? 'आरोग्य प्रश्न विचारा...' : 'Ask a health question...')}
              className="flex-1 bg-slate-50 border border-slate-200 rounded-lg py-2.5 px-3.5 text-sm focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-colors disabled:opacity-50"
              disabled={isLoading}
            />

            {/* Voice Call Button */}
            {hasSpeechSupport && (
              <button
                onClick={() => setShowVoiceCall(true)}
                disabled={isLoading}
                className="p-2.5 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors disabled:opacity-40 shadow-sm"
                title="Start voice call"
              >
                <Phone size={16} />
              </button>
            )}

            <button
              onClick={() => handleSend()}
              disabled={(!input.trim() && !attachment) || isLoading}
              className="p-2.5 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-40 disabled:hover:bg-brand-600"
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
