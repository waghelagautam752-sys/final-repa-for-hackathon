import React, { useState, useRef } from 'react';
import { Camera, Activity, Upload } from 'lucide-react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

const DEFAULT_NUTRIENTS = [
  { name: 'Calories', value: '--', status: 'normal', ref: 'Target: < 600 kcal' },
  { name: 'Carbs', value: '--', status: 'normal', ref: 'Target: < 45g' },
  { name: 'Protein', value: '--', status: 'normal', ref: 'Target: 20-30g' }
];

export default function DietFilter() {
  const [analysisResult, setAnalysisResult] = useState(null);
  const [nutrients, setNutrients] = useState(DEFAULT_NUTRIENTS);
  const [isLoading, setIsLoading] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [imagePreview, setImagePreview] = useState(null);
  const fileRef = useRef(null);

  const fileToGenerativePart = async (file) => {
    const data = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result.split(',')[1]);
      reader.readAsDataURL(file);
    });
    return { inlineData: { data, mimeType: file.type } };
  };

  const handleAnalyze = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => setImagePreview(reader.result);
    reader.readAsDataURL(file);

    setIsLoading(true);
    setAnalysisResult(null);
    setNutrients(DEFAULT_NUTRIENTS);
    setStreamingText('');

    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey) throw new Error("API Key missing. Add VITE_GEMINI_API_KEY to your .env file.");

      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey });
      const imagePart = await fileToGenerativePart(file);

      const prompt = `You are a clinical dietitian AI. Analyze this meal image. 
The patient has HbA1c 6.2% (pre-diabetic) and LDL Cholesterol 110 mg/dL (borderline). 
Identify the food items visible. Rate the meal's safety for their condition (Safe / Caution / Avoid). 
Provide a structured breakdown with bullet points and suggest healthier alternatives if needed. 
Use markdown formatting.

IMPORTANT: At the very end of your response, provide a JSON block enclosed in \`\`\`json and \`\`\` containing the estimated nutritional values for the detected dishes in this exact format:
{
  "nutrients": [
    {"name": "Calories", "value": "450 kcal", "status": "normal", "ref": "Target: < 600 kcal"},
    {"name": "Carbs", "value": "40g", "status": "warning", "ref": "Target: < 45g"},
    {"name": "Protein", "value": "25g", "status": "normal", "ref": "Target: 20-30g"}
  ]
}`;

      const contentParts = [{
        role: 'user',
        parts: [imagePart, { text: prompt }]
      }];

      const modelsToTry = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'];
      let accumulated = '';
      let streamed = false;

      for (const modelName of modelsToTry) {
        try {
          const stream = await ai.models.generateContentStream({
            model: modelName,
            contents: contentParts
          });
          accumulated = '';
          for await (const chunk of stream) {
            accumulated += chunk.text || '';
            setStreamingText(accumulated);
          }
          streamed = true;
          break;
        } catch (modelError) {
          console.warn(`Diet analysis: ${modelName} failed —`, modelError.message);
          if (modelName === modelsToTry[modelsToTry.length - 1]) throw modelError;
        }
      }

      let finalText = accumulated;
      if (finalText) {
        const jsonMatch = finalText.match(/```json\n([\s\S]*?)\n```/);
        if (jsonMatch) {
          try {
            const jsonData = JSON.parse(jsonMatch[1]);
            if (jsonData.nutrients) {
              setNutrients(jsonData.nutrients);
            }
            finalText = finalText.replace(/```json\n[\s\S]*?\n```/, '').trim();
          } catch (e) {
            console.error("Failed to parse nutrient JSON", e);
          }
        }
      }

      setStreamingText('');
      setAnalysisResult(finalText || "No response received. Please try again.");
    } catch (err) {
      console.error("Diet analysis error:", err);
      setAnalysisResult(`**Error:** ${err.message}\n\nPlease check your API key and try again.`);
    } finally {
      setIsLoading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-5 pb-8">
      <div>
        <h2 className="text-xl font-display font-bold text-slate-800">Diet Analysis</h2>
        <p className="text-sm text-slate-500 mt-0.5">Upload a meal photo for AI-powered nutritional analysis based on your health profile</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Upload + Preview */}
        <div className="space-y-5">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
              <Camera size={15} className="text-slate-500" /> Meal Image
            </h3>
            {imagePreview ? (
              <div className="relative">
                <img src={imagePreview} alt="Meal" className="w-full h-56 object-cover rounded-lg border border-slate-200" />
                <input type="file" ref={fileRef} onChange={handleAnalyze} accept="image/*" className="hidden" />
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={isLoading}
                  className="mt-3 w-full py-2 text-sm font-medium text-brand-600 bg-brand-50 border border-brand-200 rounded-lg hover:bg-brand-100 transition-colors disabled:opacity-50"
                >
                  {isLoading ? 'Analyzing...' : 'Upload Different Image'}
                </button>
              </div>
            ) : (
              <div>
                <input type="file" ref={fileRef} onChange={handleAnalyze} accept="image/*" className="hidden" />
                <button
                  onClick={() => fileRef.current?.click()}
                  className="w-full border-2 border-dashed border-slate-200 rounded-lg py-12 flex flex-col items-center gap-3 hover:border-brand-300 hover:bg-brand-50/30 transition-colors group"
                >
                  <div className="w-12 h-12 rounded-full bg-slate-100 group-hover:bg-brand-100 flex items-center justify-center transition-colors">
                    <Upload size={20} className="text-slate-400 group-hover:text-brand-600 transition-colors" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-slate-600">Upload meal photo</p>
                    <p className="text-xs text-slate-400 mt-0.5">JPG, PNG — click or drag</p>
                  </div>
                </button>
              </div>
            )}
          </div>

          {/* Dynamic Nutrient Breakdown */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
              <Activity size={15} className="text-slate-500" /> Nutritional Breakdown
            </h3>
            <div className="space-y-2.5">
              {nutrients.map((item, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-slate-700">{item.name}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">{item.ref}</p>
                  </div>
                  <span className={`px-2.5 py-1 rounded-md text-xs font-semibold ${
                    item.status === 'warning' ? 'bg-amber-100 text-amber-700' : 
                    item.status === 'danger' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
                  }`}>
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-slate-400 mt-3">
              Values are estimated by AI based on visible portions and ingredients.
            </p>
          </div>
        </div>

        {/* Analysis Result */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Analysis Result</h3>
          {isLoading && streamingText ? (
            <div className="prose prose-sm prose-slate max-w-none prose-p:my-1.5 prose-headings:font-semibold prose-li:my-0.5"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(marked.parse(streamingText)) }} />
          ) : isLoading ? (
            <div className="space-y-3 animate-pulse">
              <div className="h-3 bg-slate-100 rounded w-3/4" />
              <div className="h-3 bg-slate-100 rounded w-1/2" />
              <div className="h-3 bg-slate-100 rounded w-5/6" />
              <div className="h-3 bg-slate-100 rounded w-2/3" />
              <div className="h-3 bg-slate-100 rounded w-4/5 mt-4" />
              <div className="h-3 bg-slate-100 rounded w-1/2" />
            </div>
          ) : analysisResult ? (
            <div className="prose prose-sm prose-slate max-w-none prose-p:my-1.5 prose-headings:font-semibold prose-li:my-0.5"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(marked.parse(analysisResult)) }} />
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                <Camera size={22} className="text-slate-300" />
              </div>
              <p className="text-sm font-medium text-slate-500 mb-1">No analysis yet</p>
              <p className="text-xs text-slate-400 max-w-[220px]">Upload a meal photo to receive dietary recommendations based on your lab results.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
