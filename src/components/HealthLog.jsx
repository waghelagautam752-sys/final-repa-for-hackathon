import React, { useState, useEffect, useMemo } from 'react';
import {
  Plus, Smile, Frown, Meh, Moon, Droplets, Zap,
  TrendingUp, Brain, Loader2, Calendar, ChevronLeft,
  ChevronRight, Trash2, Sparkles, Square, CheckSquare, AlertTriangle
} from 'lucide-react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

const MOODS = [
  { value: 5, label: 'Great', icon: Smile, color: 'text-emerald-500', bg: 'bg-emerald-50 border-emerald-200', activeBg: 'bg-emerald-500 text-white' },
  { value: 4, label: 'Good', icon: Smile, color: 'text-teal-500', bg: 'bg-teal-50 border-teal-200', activeBg: 'bg-teal-500 text-white' },
  { value: 3, label: 'Okay', icon: Meh, color: 'text-amber-500', bg: 'bg-amber-50 border-amber-200', activeBg: 'bg-amber-500 text-white' },
  { value: 2, label: 'Low', icon: Frown, color: 'text-orange-500', bg: 'bg-orange-50 border-orange-200', activeBg: 'bg-orange-500 text-white' },
  { value: 1, label: 'Bad', icon: Frown, color: 'text-red-500', bg: 'bg-red-50 border-red-200', activeBg: 'bg-red-500 text-white' },
];

const ENERGY_LEVELS = [1, 2, 3, 4, 5];

export default function HealthLog() {
  const [logs, setLogs] = useState(() => {
    const saved = localStorage.getItem('caresync_health_logs');
    return saved ? JSON.parse(saved) : [];
  });
  const [showAdd, setShowAdd] = useState(false);
  const [entry, setEntry] = useState({ mood: 3, sleep: 7, water: 8, energy: 3, notes: '' });
  const [aiInsight, setAiInsight] = useState(null);
  const [streamingInsight, setStreamingInsight] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [viewMonth, setViewMonth] = useState(new Date());

  const [anomalyActive, setAnomalyActive] = useState(() => {
    return localStorage.getItem('caresync_silent_signal_anomaly') === 'true';
  });

  const toggleAnomaly = () => {
    const newVal = !anomalyActive;
    setAnomalyActive(newVal);
    localStorage.setItem('caresync_silent_signal_anomaly', newVal ? 'true' : 'false');
    // If turning on, simulate health history for burnout alert
    if (newVal) {
      const simulatedLogs = [
        { id: 'sim-1', date: '2026-05-20', mood: 4, sleep: 7.5, water: 8, energy: 4, notes: 'Feeling fine' },
        { id: 'sim-2', date: '2026-05-21', mood: 4, sleep: 7, water: 7, energy: 4, notes: '' },
        { id: 'sim-3', date: '2026-05-22', mood: 3, sleep: 6.5, water: 8, energy: 3, notes: 'A bit tired' },
        { id: 'sim-4', date: '2026-05-23', mood: 3, sleep: 5.5, water: 6, energy: 3, notes: 'Stress at work' },
        { id: 'sim-5', date: '2026-05-24', mood: 2, sleep: 5, water: 5, energy: 2, notes: 'Woke up at 3AM' },
        { id: 'sim-6', date: '2026-05-25', mood: 3, sleep: 6, water: 7, energy: 3, notes: '' },
        { id: 'sim-7', date: '2026-05-26', mood: 2, sleep: 5.5, water: 6, energy: 2, notes: 'Restless sleep' },
        { id: 'sim-8', date: '2026-05-27', mood: 2, sleep: 5, water: 6, energy: 2, notes: 'Sleep fragmented' },
        { id: 'sim-9', date: '2026-05-28', mood: 1, sleep: 4.5, water: 5, energy: 1, notes: 'Exhausted' }
      ];
      localStorage.setItem('caresync_health_logs', JSON.stringify(simulatedLogs));
      window.dispatchEvent(new Event('storage')); // trigger updates in other views
      window.location.reload(); // refresh to show logs
    } else {
      localStorage.removeItem('caresync_health_logs');
      window.location.reload();
    }
  };

  useEffect(() => {
    localStorage.setItem('caresync_health_logs', JSON.stringify(logs));
  }, [logs]);

  const todayStr = new Date().toISOString().split('T')[0];
  const hasLoggedToday = logs.some(l => l.date === todayStr);

  const handleSaveEntry = () => {
    const log = {
      id: Date.now().toString(),
      date: todayStr,
      ...entry,
      timestamp: new Date().toISOString(),
    };
    // Replace if already logged today
    setLogs(prev => {
      const filtered = prev.filter(l => l.date !== todayStr);
      return [...filtered, log];
    });
    setShowAdd(false);
    setEntry({ mood: 3, sleep: 7, water: 8, energy: 3, notes: '' });
  };

  const deleteLog = (id) => {
    setLogs(prev => prev.filter(l => l.id !== id));
  };

  const getAIInsights = async () => {
    if (logs.length < 3) return;
  const [aiInsight, setAiInsight] = useState(() => {
    const saved = localStorage.getItem('caresync_copilot_insights');
    return saved ? JSON.parse(saved) : null;
  });

  const toggleActionItem = (index) => {
    if (!aiInsight || !aiInsight.actionPlan) return;
    const updatedPlan = [...aiInsight.actionPlan];
    updatedPlan[index].done = !updatedPlan[index].done;
    const updatedInsight = { ...aiInsight, actionPlan: updatedPlan };
    setAiInsight(updatedInsight);
    localStorage.setItem('caresync_copilot_insights', JSON.stringify(updatedInsight));
  };

  const getAIInsights = async () => {
    if (logs.length < 3) return;
    setIsAnalyzing(true);
    setAiInsight(null);

    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey) throw new Error('API Key missing.');

      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey });

      const recentLogs = logs.slice(-14).map(l => ({
        date: l.date,
        mood: MOODS.find(m => m.value === l.mood)?.label,
        sleep_hours: l.sleep,
        water_glasses: l.water,
        energy: l.energy,
        notes: l.notes || 'none',
      }));

      const prompt = `You are a clinical and preventive health analytics AI. Analyze these daily health logs:

${JSON.stringify(recentLogs, null, 2)}

Evaluate risk levels and generate a personalized preventive intervention plan.
You MUST respond ONLY with a valid, clean JSON object (do not wrap in markdown blocks like \`\`\`json, just return raw JSON). Use the exact keys listed in this template:
{
  "riskScore": 45,
  "riskTitle": "Moderate Risk",
  "detectedRisks": ["Burnout risk: Moderate", "Dehydration: Low"],
  "reasoning": "Explainable reasoning here...",
  "actionPlan": [
    { "task": "Drink 2L water daily", "done": false },
    { "task": "Sleep before 11:30 PM", "done": false }
  ],
  "escalation": "This is optional. If symptoms appear severe, output a warning advising medical consultation."
}`;

      const modelsToTry = ['gemini-2.5-flash', 'gemini-2.0-flash'];
      let resultText = '';

      for (const model of modelsToTry) {
        try {
          const response = await ai.models.generateContent({ model, contents: prompt });
          resultText = response.text || '';
          break;
        } catch (e) {
          if (model === modelsToTry[modelsToTry.length - 1]) throw e;
        }
      }

      // Parse JSON from response
      const cleanJsonStr = resultText.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanJsonStr);
      setAiInsight(parsed);
      localStorage.setItem('caresync_copilot_insights', JSON.stringify(parsed));
    } catch (err) {
      console.error(err);
      setAiInsight({
        error: true,
        message: err.message || 'Failed to analyze health logs.'
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Stats
  const last7 = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    const weekStart = d.toISOString().split('T')[0];
    return logs.filter(l => l.date >= weekStart);
  }, [logs]);

  const avgSleep = last7.length ? (last7.reduce((s, l) => s + l.sleep, 0) / last7.length).toFixed(1) : '--';
  const avgMood = last7.length ? (last7.reduce((s, l) => s + l.mood, 0) / last7.length).toFixed(1) : '--';
  const avgWater = last7.length ? (last7.reduce((s, l) => s + l.water, 0) / last7.length).toFixed(1) : '--';
  const avgEnergy = last7.length ? (last7.reduce((s, l) => s + l.energy, 0) / last7.length).toFixed(1) : '--';

  // Simple bar chart data (last 7 entries)
  const chartData = useMemo(() => logs.slice(-7), [logs]);

  return (
    <div className="max-w-5xl mx-auto space-y-5 pb-8">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-display font-bold text-slate-800">Daily Health Log</h2>
          <p className="text-sm text-slate-500 mt-0.5">Track mood, sleep, hydration, and energy — get AI insights</p>
        </div>
        <div className="flex gap-2">
          {logs.length >= 3 && (
            <button onClick={getAIInsights} disabled={isAnalyzing}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-purple-700 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors disabled:opacity-50">
              {isAnalyzing ? <Loader2 size={14} className="animate-spin" /> : <Brain size={14} />}
              AI Insights
            </button>
          )}
          <button onClick={() => setShowAdd(!showAdd)}
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors">
            {showAdd ? <></> : <Plus size={16} />}
            {showAdd ? 'Cancel' : hasLoggedToday ? 'Update Today' : 'Log Today'}
          </button>
        </div>
      </div>

      {/* Silent Signal Detection Dashboard Widget */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 overflow-hidden relative">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="relative shrink-0">
              <div className="w-12 h-12 rounded-xl bg-purple-50 flex items-center justify-center border border-purple-100 text-purple-600">
                <Brain size={24} className={anomalyActive ? "animate-pulse" : ""} />
              </div>
              <span className="absolute -top-1.5 -right-1.5 flex h-3.5 w-3.5">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${anomalyActive ? "bg-red-400" : "bg-emerald-400"}`} />
                <span className={`relative inline-flex rounded-full h-3.5 w-3.5 ${anomalyActive ? "bg-red-500" : "bg-emerald-500"}`} />
              </span>
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                Silent Signal Detection 
                <span className="text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">Proactive Scan</span>
              </h3>
              <p className="text-xs text-slate-500 mt-1 max-w-xl">
                Continuously analyzes sleep micro-fragmentation, heart rate variability (HRV) trends, and typing cadence to flag pre-symptom deterioration before you consciously feel it.
              </p>
            </div>
          </div>
          <button
            onClick={toggleAnomaly}
            className={`px-4 py-2.5 text-xs font-semibold rounded-lg border transition-all shrink-0 ${
              anomalyActive
                ? 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100'
                : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
            }`}
          >
            {anomalyActive ? '🔴 Active Anomaly (Click to Reset)' : '⚡ Simulate Wearable Sync (Trigger Anomaly)'}
          </button>
        </div>

        {/* Ambient Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-5 pt-5 border-t border-slate-100">
          {/* Wearable HRV */}
          <div className={`p-4 rounded-xl border transition-all ${anomalyActive ? 'bg-red-50/40 border-red-100 shadow-sm' : 'bg-slate-50/50 border-slate-150'}`}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-slate-500">Wearable HRV Trend</span>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${anomalyActive ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                {anomalyActive ? '🚨 Dropping' : '✓ Stable'}
              </span>
            </div>
            <p className="text-xl font-extrabold text-slate-800">{anomalyActive ? '44 ms' : '72 ms'}</p>
            <p className="text-[10px] text-slate-400 mt-1">
              {anomalyActive ? 'Downward trend of 38% over 10 days' : 'Baseline matching age range'}
            </p>
          </div>

          {/* Sleep Architecture */}
          <div className={`p-4 rounded-xl border transition-all ${anomalyActive ? 'bg-red-50/40 border-red-100 shadow-sm' : 'bg-slate-50/50 border-slate-150'}`}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-slate-500">Sleep Architecture</span>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${anomalyActive ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                {anomalyActive ? '🚨 Fragmented' : '✓ Restful'}
              </span>
            </div>
            <p className="text-xl font-extrabold text-slate-800">{anomalyActive ? '4 events' : '0 events'}</p>
            <p className="text-[10px] text-slate-400 mt-1">
              {anomalyActive ? 'Waking episodes after 3:00 AM' : 'No mid-sleep interruptions'}
            </p>
          </div>

          {/* Typing Cadence */}
          <div className={`p-4 rounded-xl border transition-all ${anomalyActive ? 'bg-red-50/40 border-red-100 shadow-sm' : 'bg-slate-50/50 border-slate-150'}`}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-slate-500">App Typing Cadence</span>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${anomalyActive ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                {anomalyActive ? '🚨 Slowing' : '✓ Normal'}
              </span>
            </div>
            <p className="text-xl font-extrabold text-slate-800">{anomalyActive ? '42 wpm' : '65 wpm'}</p>
            <p className="text-[10px] text-slate-400 mt-1">
              {anomalyActive ? 'Keystroke velocity decreased by 25%' : 'Typical typing pace'}
            </p>
          </div>
        </div>
      </div>

      {/* Log Entry Form */}
      {showAdd && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5" style={{ animation: 'notifSlideIn 0.2s ease-out' }}>
          <h3 className="text-base font-semibold text-slate-800 mb-5">How are you today?</h3>

          {/* Mood */}
          <div className="mb-5">
            <label className="block text-xs font-medium text-slate-600 mb-2">Mood</label>
            <div className="flex gap-2">
              {MOODS.map(m => {
                const Icon = m.icon;
                const active = entry.mood === m.value;
                return (
                  <button key={m.value} onClick={() => setEntry({ ...entry, mood: m.value })}
                    className={`flex-1 flex flex-col items-center gap-1 py-3 rounded-lg border text-sm font-medium transition-all ${active ? m.activeBg + ' border-transparent shadow-sm' : m.bg + ' ' + m.color + ' hover:shadow-sm'}`}>
                    <Icon size={20} />
                    <span className="text-[11px]">{m.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-5">
            {/* Sleep */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-2 flex items-center gap-1.5">
                <Moon size={13} className="text-indigo-500" /> Sleep (hours)
              </label>
              <div className="flex items-center gap-3">
                <input type="range" min="0" max="14" step="0.5" value={entry.sleep}
                  onChange={e => setEntry({ ...entry, sleep: parseFloat(e.target.value) })}
                  className="flex-1 accent-indigo-500" />
                <span className="text-sm font-bold text-slate-800 w-8 text-center">{entry.sleep}</span>
              </div>
            </div>

            {/* Water */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-2 flex items-center gap-1.5">
                <Droplets size={13} className="text-blue-500" /> Water (glasses)
              </label>
              <div className="flex items-center gap-3">
                <input type="range" min="0" max="16" step="1" value={entry.water}
                  onChange={e => setEntry({ ...entry, water: parseInt(e.target.value) })}
                  className="flex-1 accent-blue-500" />
                <span className="text-sm font-bold text-slate-800 w-8 text-center">{entry.water}</span>
              </div>
            </div>

            {/* Energy */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-2 flex items-center gap-1.5">
                <Zap size={13} className="text-amber-500" /> Energy Level
              </label>
              <div className="flex gap-1.5">
                {ENERGY_LEVELS.map(lvl => (
                  <button key={lvl} onClick={() => setEntry({ ...entry, energy: lvl })}
                    className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${entry.energy >= lvl ? 'bg-amber-400 text-white shadow-sm' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}>
                    {lvl}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="mb-4">
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Notes (optional)</label>
            <textarea value={entry.notes} onChange={e => setEntry({ ...entry, notes: e.target.value })}
              placeholder="Anything notable? Exercise, stress, meals..."
              rows={2}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-colors resize-none placeholder:text-slate-400" />
          </div>

          <div className="flex justify-end">
            <button onClick={handleSaveEntry} className="px-6 py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 transition-colors">
              Save Entry
            </button>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Avg Sleep', value: avgSleep, unit: 'hrs', icon: Moon, color: 'text-indigo-600', bg: 'bg-indigo-50' },
          { label: 'Avg Mood', value: avgMood, unit: '/5', icon: Smile, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Avg Water', value: avgWater, unit: 'cups', icon: Droplets, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Avg Energy', value: avgEnergy, unit: '/5', icon: Zap, color: 'text-amber-600', bg: 'bg-amber-50' },
        ].map(({ label, value, unit, icon: Icon, color, bg }) => (
          <div key={label} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-7 h-7 rounded-lg ${bg} flex items-center justify-center`}>
                <Icon size={14} className={color} />
              </div>
              <span className="text-[11px] font-medium text-slate-500">{label}</span>
            </div>
            <p className="text-xl font-bold text-slate-800">{value}<span className="text-xs font-normal text-slate-400 ml-1">{unit}</span></p>
            <p className="text-[10px] text-slate-400 mt-0.5">Last 7 days</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Mini Chart */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
            <TrendingUp size={15} className="text-slate-500" /> Recent Trends
          </h3>
          {chartData.length === 0 ? (
            <div className="text-center py-10">
              <Calendar size={24} className="text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-400">Log entries to see trends</p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Sleep bars */}
              <div>
                <p className="text-[11px] font-medium text-slate-500 mb-2 flex items-center gap-1"><Moon size={11} className="text-indigo-500" /> Sleep</p>
                <div className="flex items-end gap-1 h-16">
                  {chartData.map(l => (
                    <div key={l.id} className="flex-1 flex flex-col items-center gap-1" title={`${l.date}: ${l.sleep}h`}>
                      <div className="w-full bg-indigo-200 rounded-t-sm" style={{ height: `${Math.max((l.sleep / 14) * 100, 5)}%` }} />
                      <span className="text-[9px] text-slate-400">{l.sleep}h</span>
                    </div>
                  ))}
                </div>
              </div>
              {/* Energy bars */}
              <div>
                <p className="text-[11px] font-medium text-slate-500 mb-2 flex items-center gap-1"><Zap size={11} className="text-amber-500" /> Energy</p>
                <div className="flex items-end gap-1 h-12">
                  {chartData.map(l => (
                    <div key={l.id} className="flex-1 flex flex-col items-center gap-1" title={`${l.date}: ${l.energy}/5`}>
                      <div className="w-full bg-amber-200 rounded-t-sm" style={{ height: `${Math.max((l.energy / 5) * 100, 10)}%` }} />
                      <span className="text-[9px] text-slate-400">{l.energy}</span>
                    </div>
                  ))}
                </div>
              </div>
              {/* Mood dots */}
              <div>
                <p className="text-[11px] font-medium text-slate-500 mb-2 flex items-center gap-1"><Smile size={11} className="text-emerald-500" /> Mood</p>
                <div className="flex gap-1">
                  {chartData.map(l => {
                    const moodColors = ['', 'bg-red-400', 'bg-orange-400', 'bg-amber-400', 'bg-teal-400', 'bg-emerald-400'];
                    return (
                      <div key={l.id} className="flex-1 flex flex-col items-center gap-1" title={`${l.date}: ${MOODS.find(m => m.value === l.mood)?.label}`}>
                        <div className={`w-6 h-6 rounded-full ${moodColors[l.mood]} mx-auto`} />
                        <span className="text-[9px] text-slate-400">{l.mood}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* AI Action Copilot Dashboard */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col">
          <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
            <Sparkles size={15} className="text-purple-500" /> AI Action Copilot
          </h3>
          
          {isAnalyzing ? (
            <div className="space-y-4 animate-pulse py-4">
              <div className="h-6 bg-slate-100 rounded w-1/4" />
              <div className="h-4 bg-slate-100 rounded w-3/4" />
              <div className="h-4 bg-slate-100 rounded w-5/6" />
              <div className="h-16 bg-slate-50 border border-slate-100 rounded-lg" />
              <div className="h-24 bg-slate-50 border border-slate-100 rounded-lg" />
            </div>
          ) : aiInsight ? (
            aiInsight.error ? (
              <div className="text-sm text-red-500 py-6 text-center">
                <AlertTriangle className="mx-auto mb-2 text-red-400" size={24} />
                <p className="font-semibold">Analysis Failed</p>
                <p className="text-xs text-slate-400 mt-1">{aiInsight.message}</p>
              </div>
            ) : (
              <div className="space-y-5">
                {/* Risk Score Row */}
                <div className="flex items-center gap-4 bg-slate-50 border border-slate-200 rounded-xl p-4">
                  <div className="relative flex items-center justify-center shrink-0">
                    {/* Visual circular representation or indicator */}
                    <div className="w-16 h-16 rounded-full border-4 border-slate-200 flex items-center justify-center relative">
                      <span className={`text-base font-extrabold ${
                        aiInsight.riskScore >= 70 ? 'text-red-600' : aiInsight.riskScore >= 40 ? 'text-amber-600' : 'text-emerald-600'
                      }`}>{aiInsight.riskScore}%</span>
                      {/* Colored active border ring */}
                      <div className={`absolute inset-0 rounded-full border-4 border-transparent border-t-brand-500`} style={{ transform: `rotate(${aiInsight.riskScore * 3.6}deg)` }} />
                    </div>
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-sm font-bold text-slate-800">{aiInsight.riskTitle || 'Health Risk Rating'}</h4>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {aiInsight.detectedRisks && aiInsight.detectedRisks.map((risk, idx) => (
                        <span key={idx} className="text-[10px] font-semibold bg-slate-200/60 text-slate-600 px-1.5 py-0.5 rounded-md">
                          {risk}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Explainable Reasoning */}
                <div>
                  <h5 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Explainable Reasoning</h5>
                  <p className="text-xs text-slate-600 leading-relaxed bg-purple-50/20 border border-purple-100/50 rounded-xl p-3">
                    {aiInsight.reasoning}
                  </p>
                </div>

                {/* 7-Day Action Plan Checklist */}
                {aiInsight.actionPlan && aiInsight.actionPlan.length > 0 && (
                  <div>
                    <h5 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">7-Day Preventive Action Plan</h5>
                    <div className="space-y-2">
                      {aiInsight.actionPlan.map((item, idx) => (
                        <button
                          key={idx}
                          onClick={() => toggleActionItem(idx)}
                          className="w-full flex items-start gap-2.5 p-2.5 rounded-lg border border-slate-100 hover:border-slate-200 bg-slate-50/20 text-left transition-colors"
                        >
                          {item.done ? (
                            <CheckSquare className="text-emerald-500 shrink-0 mt-0.5" size={15} />
                          ) : (
                            <Square className="text-slate-300 shrink-0 mt-0.5" size={15} />
                          )}
                          <span className={`text-xs ${item.done ? 'text-slate-400 line-through' : 'text-slate-700 font-medium'}`}>
                            {item.task}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Medical Escalation Banner */}
                {aiInsight.escalation && (
                  <div className="bg-rose-50 border border-rose-150 rounded-xl p-3 flex gap-2 text-rose-800">
                    <AlertTriangle size={15} className="shrink-0 mt-0.5 text-rose-600" />
                    <div>
                      <p className="text-xs font-bold">Safety Advisory</p>
                      <p className="text-[11px] mt-0.5 text-rose-700 leading-relaxed">{aiInsight.escalation}</p>
                    </div>
                  </div>
                )}
              </div>
            )
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-14 h-14 bg-purple-50 rounded-full flex items-center justify-center mb-4 border border-purple-100">
                <Brain size={22} className="text-purple-300" />
              </div>
              <p className="text-sm font-semibold text-slate-600 mb-1">Risk + Action Copilot Offline</p>
              <p className="text-xs text-slate-400 max-w-[240px]">
                {logs.length < 3
                  ? `Log at least 3 days of health metrics to build your preventative risk copilot. (${logs.length}/3 entries)`
                  : 'Click "AI Insights" above to compile risk analysis and checklist.'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Recent Logs */}
      {logs.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-800">Log History</h3>
          </div>
          <div className="divide-y divide-slate-100 max-h-[300px] overflow-y-auto">
            {[...logs].reverse().map(log => {
              const moodInfo = MOODS.find(m => m.value === log.mood);
              const MoodIcon = moodInfo?.icon || Meh;
              return (
                <div key={log.id} className="px-5 py-3 flex items-center gap-4 hover:bg-slate-50 transition-colors">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${moodInfo?.bg || 'bg-slate-100'}`}>
                    <MoodIcon size={16} className={moodInfo?.color || 'text-slate-400'} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800">{log.date}</p>
                    <div className="flex items-center gap-3 mt-0.5 text-[11px] text-slate-500">
                      <span className="flex items-center gap-1"><Moon size={10} /> {log.sleep}h</span>
                      <span className="flex items-center gap-1"><Droplets size={10} /> {log.water} cups</span>
                      <span className="flex items-center gap-1"><Zap size={10} /> {log.energy}/5</span>
                    </div>
                  </div>
                  {log.notes && <p className="text-xs text-slate-400 max-w-[200px] truncate hidden sm:block">{log.notes}</p>}
                  <button onClick={() => deleteLog(log.id)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors">
                    <Trash2 size={13} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
