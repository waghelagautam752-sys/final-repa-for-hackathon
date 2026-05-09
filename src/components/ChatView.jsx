import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Paperclip, X, User, Stethoscope, Sparkles, Mic, MicOff, Volume2, Square } from 'lucide-react';
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

export default function ChatView({ userId }) {
  const [medications, setMedications] = useState([]);

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

      const systemPrompt = currentAttachment
        ? `You are a knowledgeable medical assistant called CareSync. ${medContext}The patient has attached a medical image/report. Analyze it carefully. The patient says: "${currentInput || 'Please analyze this image.'}". Provide a structured, medically accurate response using bullet points and clear sections. Be professional and empathetic.`
        : `You are a knowledgeable medical assistant called CareSync. ${medContext}The patient asks: "${currentInput}". Provide a structured response using bullet points or short clear sections. Be professional, accurate, and empathetic. Use markdown formatting for readability.`;

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
              placeholder={isListening ? 'Listening...' : 'Ask a health question...'}
              className="flex-1 bg-slate-50 border border-slate-200 rounded-lg py-2.5 px-3.5 text-sm focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-colors disabled:opacity-50"
              disabled={isLoading}
            />
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
