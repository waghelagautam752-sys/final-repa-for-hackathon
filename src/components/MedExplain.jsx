import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Pill, Plus, X, CheckCircle, Clock, ChevronLeft, ChevronRight,
  AlertTriangle, Bot, Activity, Bell, BellOff, Trash2, Loader2,
  Zap, ChevronDown, ChevronUp, Shield, Volume2
} from 'lucide-react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

const INITIAL_MEDS = [
  {
    id: 'm1',
    name: 'Metformin',
    dosage: '500mg',
    timeOfDay: 'morning',
    time: '08:00',
    instruction: 'Take after breakfast with water.',
    aiReason: 'Metformin helps lower blood glucose levels. Taking it post-meal reduces gastrointestinal side effects.',
    frequency: 'Daily',
    reminderEnabled: true
  },
  {
    id: 'm2',
    name: 'Atorvastatin',
    dosage: '20mg',
    timeOfDay: 'evening',
    time: '21:00',
    instruction: 'Take before bed.',
    aiReason: 'Cholesterol synthesis peaks at night. Taking statins before bed optimizes therapeutic effectiveness.',
    frequency: 'Daily',
    reminderEnabled: true
  }
];

export default function MedExplain({ userId }) {
  // Load and merge medications to avoid data loss
  const [medications, setMedications] = useState(() => {
    const mainMeds = localStorage.getItem('caresync_meds');
    const reminderMeds = localStorage.getItem('caresync_med_reminders');
    
    let parsedMain = mainMeds ? JSON.parse(mainMeds) : [];
    let parsedReminders = reminderMeds ? JSON.parse(reminderMeds) : [];
    
    if (parsedMain.length === 0 && parsedReminders.length === 0) {
      return INITIAL_MEDS;
    }
    
    // Merge by ID or unique name
    const merged = [...parsedMain];
    parsedReminders.forEach(rm => {
      const exists = merged.some(m => m.name.toLowerCase().includes(rm.name.toLowerCase()));
      if (!exists) {
        merged.push({
          id: rm.id || Date.now().toString() + Math.random(),
          name: rm.name,
          dosage: rm.dosage,
          timeOfDay: parseInt(rm.time.split(':')[0]) < 12 ? 'morning' : 'evening',
          time: rm.time,
          instruction: 'Take as directed.',
          aiReason: 'Reminder set for standard clinical window.',
          frequency: rm.frequency === 'daily' ? 'Daily' : rm.frequency === 'weekly' ? 'Weekly' : 'Daily',
          reminderEnabled: rm.reminderEnabled ?? true
        });
      }
    });
    return merged;
  });

  const [currentDate, setCurrentDate] = useState(new Date());
  const selectedDateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;
  
  const [takenHistory, setTakenHistory] = useState(() => {
    const saved = localStorage.getItem('caresync_taken_history');
    return saved ? JSON.parse(saved) : {};
  });

  const [showAddMed, setShowAddMed] = useState(false);
  const [newMed, setNewMed] = useState({
    name: '',
    dosage: '',
    timeOfDay: 'morning',
    timing: 'Before Breakfast',
    time: '08:00',
    instruction: '',
    frequency: 'Daily',
    reminderEnabled: true
  });

  const [checkMeds, setCheckMeds] = useState([]);
  const [interactionResult, setInteractionResult] = useState(null);
  const [isChecking, setIsChecking] = useState(false);
  const [expandedInteraction, setExpandedInteraction] = useState(true);
  const [activeReminders, setActiveReminders] = useState({});

  // Persist medications to localStorage
  useEffect(() => {
    localStorage.setItem('caresync_meds', JSON.stringify(medications));
  }, [medications]);

  // Persist history to localStorage
  useEffect(() => {
    localStorage.setItem('caresync_taken_history', JSON.stringify(takenHistory));
  }, [takenHistory]);

  // Notification system
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      const currentTime = `${hh}:${mm}`;

      medications.forEach(med => {
        if (med.reminderEnabled && med.time === currentTime && !activeReminders[med.id]) {
          setActiveReminders(prev => ({ ...prev, [med.id]: true }));
          
          // Trigger browser notification
          if (Notification.permission === 'granted') {
            new Notification(`💊 Medication Alarm`, {
              body: `Time to take ${med.name} ${med.dosage} (${med.time})`
            });
          }
          
          // Play subtle tone
          try {
            const synth = window.speechSynthesis;
            if (synth) {
              const utter = new SpeechSynthesisUtterance(`Time to take your medication, ${med.name} ${med.dosage}`);
              utter.rate = 0.9;
              synth.speak(utter);
            }
          } catch (e) {}

          // Auto dismiss notification after 60s
          setTimeout(() => {
            setActiveReminders(prev => {
              const copy = { ...prev };
              delete copy[med.id];
              return copy;
            });
          }, 60000);
        }
      });
    }, 10000);
    return () => clearInterval(interval);
  }, [medications, activeReminders]);

  const requestNotifPermission = () => {
    if ('Notification' in window) {
      Notification.requestPermission().then(permission => {
        if (permission === 'granted') {
          alert('🔔 Browser alerts enabled successfully!');
        }
      });
    }
  };

  const handleToggleTaken = async (id, medName) => {
    const isNowTaken = !(takenHistory[selectedDateStr] || []).includes(id);
    
    setTakenHistory(prev => {
      const todayTaken = prev[selectedDateStr] || [];
      return {
        ...prev,
        [selectedDateStr]: todayTaken.includes(id) 
          ? todayTaken.filter(m => m !== id) 
          : [...todayTaken, id]
      };
    });

    // If marked taken, sync to server dose logs
    if (isNowTaken && userId) {
      try {
        const d = new Date();
        const day = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - day);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
        const weekKey = `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;

        await fetch('/api/dose-logs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, medName, weekKey })
        });
      } catch (err) {}
    }
  };

  const handleDeleteMed = (id) => {
    if (confirm('Are you sure you want to delete this medication?')) {
      setMedications(prev => prev.filter(m => m.id !== id));
      setCheckMeds(prev => prev.filter(mId => mId !== id));
    }
  };

  const handleToggleReminder = (id) => {
    setMedications(prev => prev.map(m => m.id === id ? { ...m, reminderEnabled: !m.reminderEnabled } : m));
  };

  const handleAddMed = (e) => {
    e.preventDefault();
    if (!newMed.name || !newMed.dosage) return;

    // AI generated reason based on meal timing / schedule
    let reason = "Scheduled based on optimal pharmacological guidelines. Adjust as advised by your GP.";
    if (newMed.name.toLowerCase().includes('metformin')) {
      reason = "Metformin is taken with meals to mitigate digestive irritation and manage post-meal glucose spikes.";
    } else if (newMed.name.toLowerCase().includes('atorvastatin') || newMed.name.toLowerCase().includes('statin')) {
      reason = "Statins are highly effective when taken in the evening to coordinate with the nocturnal hepatic synthesis of cholesterol.";
    } else if (newMed.name.toLowerCase().includes('lisinopril') || newMed.name.toLowerCase().includes('bp')) {
      reason = "Helps normalize systemic blood pressure. Consistent daily timing preserves uniform arterial pressure.";
    } else if (newMed.name.toLowerCase().includes('amoxicillin') || newMed.name.toLowerCase().includes('antibiotic')) {
      reason = "Ensures steady antibiotic serum concentration levels to fully combat bacterial growth.";
    }

    setMedications(prev => [...prev, {
      id: Date.now().toString(),
      name: newMed.name,
      dosage: newMed.dosage,
      timeOfDay: newMed.timeOfDay,
      time: newMed.time,
      instruction: newMed.instruction || `Take ${newMed.timing.toLowerCase()}.`,
      aiReason: reason,
      frequency: newMed.frequency,
      reminderEnabled: newMed.reminderEnabled
    }]);

    setNewMed({
      name: '',
      dosage: '',
      timeOfDay: 'morning',
      timing: 'Before Breakfast',
      time: '08:00',
      instruction: '',
      frequency: 'Daily',
      reminderEnabled: true
    });
    setShowAddMed(false);
  };

  const checkInteractions = async () => {
    const selected = medications.filter(m => checkMeds.includes(m.id));
    if (selected.length < 2) return;

    setIsChecking(true);
    setInteractionResult(null);

    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey) throw new Error('Gemini API key is not configured in .env file.');

      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey });

      const medList = selected.map(m => `${m.name} ${m.dosage} (${m.frequency})`).join(', ');

      const prompt = `You are a clinical pharmacologist AI assistant. A patient is taking these medications simultaneously: ${medList}

Analyze potential drug-drug interactions. Respond in markdown with these exact sections:

## Interaction Summary
A brief overview of whether significant interactions exist.

## Detailed Interactions
For each pair that interacts:
- **[Drug A] + [Drug B]**: Severity (Minor / Moderate / Major / Contraindicated), mechanism, and clinical effect.

## Risk Level
Overall risk assessment: Low Risk / Moderate Risk / High Risk / Critical

## Recommendations
- Actionable steps the patient should take (e.g. adjust timing, monitor symptoms)
- Whether to consult their doctor

## Disclaimer
Brief note this is AI-generated and should be verified by a licensed pharmacist.

If no significant interactions exist, clearly state that.`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: prompt
      });

      setInteractionResult(response.text || 'No response received from model.');
    } catch (err) {
      setInteractionResult(`**Error Checking Interactions:** ${err.message}`);
    } finally {
      setIsChecking(false);
    }
  };

  // Filter meds for selected date
  const medsForToday = medications.filter(med => {
    const day = currentDate.getDay();
    if (med.frequency === 'Weekdays' && (day === 0 || day === 6)) return false;
    if (med.frequency === 'Weekends' && day > 0 && day < 6) return false;
    return true;
  });

  const morningMeds = medsForToday.filter(m => m.timeOfDay === 'morning');
  const eveningMeds = medsForToday.filter(m => m.timeOfDay === 'evening');
  const totalMeds = medsForToday.length;
  const takenMeds = medsForToday.filter(m => (takenHistory[selectedDateStr] || []).includes(m.id)).length;
  const progressPercent = totalMeds === 0 ? 0 : (takenMeds / totalMeds) * 100;

  const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12">
      
      {/* Visual Alarms Toast */}
      {Object.keys(activeReminders).length > 0 && (
        <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm">
          {Object.keys(activeReminders).map(id => {
            const med = medications.find(m => m.id === id);
            if (!med) return null;
            return (
              <div key={id} className="bg-brand-600 border border-brand-700 text-white rounded-2xl p-4 shadow-2xl flex items-center gap-3 animate-bounce">
                <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                  <Volume2 size={20} className="text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate">⏰ Medication Alert!</p>
                  <p className="text-xs text-white/90 font-medium truncate">Time to take {med.name} {med.dosage}</p>
                </div>
                <button
                  onClick={() => setActiveReminders(prev => {
                    const copy = { ...prev };
                    delete copy[id];
                    return copy;
                  })}
                  className="px-3 py-1.5 bg-white text-brand-700 text-xs font-semibold rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Dismiss
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Header View */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-gradient-to-r from-brand-600 to-indigo-600 text-white p-6 rounded-2xl shadow-sm border border-brand-700">
        <div>
          <h2 className="text-xl font-display font-extrabold tracking-tight">Prescriptions & Reminders</h2>
          <p className="text-xs text-brand-100 mt-1">Check adherence, schedule reminder alerts, and analyze drug safety using advanced clinical AI</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={requestNotifPermission}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-lg transition-colors"
          >
            <Bell size={13} /> Browser Alerts
          </button>
          <button 
            onClick={() => setShowAddMed(!showAddMed)}
            className="flex items-center gap-1.5 px-4 py-2 bg-white text-brand-700 hover:bg-slate-50 text-xs font-bold rounded-lg transition-colors shadow-sm"
          >
            {showAddMed ? <X size={14} /> : <Plus size={14} />}
            {showAddMed ? 'Cancel' : 'Add Medication'}
          </button>
        </div>
      </div>

      {/* Add Medication Component Overlay */}
      {showAddMed && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-lg p-6 animate-in fade-in slide-in-from-top-4 duration-200">
          <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Pill size={16} className="text-brand-600" /> Register New Prescription & Alerts
          </h3>
          <form onSubmit={handleAddMed} className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1.5">Medicine Name *</label>
              <input required type="text" placeholder="e.g. Lisinopril" value={newMed.name} 
                onChange={e => setNewMed({...newMed, name: e.target.value})}
                className="w-full px-3 py-2.5 text-xs rounded-lg border border-slate-200 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 bg-white text-slate-800" />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1.5">Dosage *</label>
              <input required type="text" placeholder="e.g. 10mg" value={newMed.dosage} 
                onChange={e => setNewMed({...newMed, dosage: e.target.value})}
                className="w-full px-3 py-2.5 text-xs rounded-lg border border-slate-200 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 bg-white text-slate-800" />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1.5">Schedule Timing</label>
              <select value={newMed.timeOfDay} onChange={e => setNewMed({...newMed, timeOfDay: e.target.value})}
                className="w-full px-3 py-2.5 text-xs rounded-lg border border-slate-200 focus:outline-none focus:border-brand-500 bg-white cursor-pointer text-slate-800">
                <option value="morning">Morning Schedule</option>
                <option value="evening">Evening Schedule</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1.5">Alert Alarm Time</label>
              <input type="time" value={newMed.time} onChange={e => setNewMed({...newMed, time: e.target.value})}
                className="w-full px-3 py-2.5 text-xs rounded-lg border border-slate-200 focus:outline-none focus:border-brand-500 bg-white text-slate-800" />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1.5">Meal Association</label>
              <select value={newMed.timing} onChange={e => setNewMed({...newMed, timing: e.target.value})}
                className="w-full px-3 py-2.5 text-xs rounded-lg border border-slate-200 focus:outline-none focus:border-brand-500 bg-white cursor-pointer text-slate-800">
                <option value="Before Breakfast">Before Breakfast</option>
                <option value="After Breakfast">After Breakfast</option>
                <option value="Before Dinner">Before Dinner</option>
                <option value="After Dinner">After Dinner</option>
                <option value="Before Bed">Before Bed</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1.5">Frequency</label>
              <select value={newMed.frequency} onChange={e => setNewMed({...newMed, frequency: e.target.value})}
                className="w-full px-3 py-2.5 text-xs rounded-lg border border-slate-200 focus:outline-none focus:border-brand-500 bg-white cursor-pointer text-slate-800">
                <option value="Daily">Daily</option>
                <option value="Weekdays">Weekdays Only</option>
                <option value="Weekends">Weekends Only</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-[11px] font-bold text-slate-600 mb-1.5">Special Instructions (optional)</label>
              <input type="text" placeholder="e.g. Swallow whole, avoid milk" value={newMed.instruction} 
                onChange={e => setNewMed({...newMed, instruction: e.target.value})}
                className="w-full px-3 py-2.5 text-xs rounded-lg border border-slate-200 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 bg-white text-slate-800" />
            </div>
            <div className="md:col-span-4 flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button 
                type="button" 
                onClick={() => setShowAddMed(false)}
                className="px-4 py-2 bg-slate-50 border border-slate-200 text-xs font-semibold rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button 
                type="submit"
                className="px-5 py-2 bg-brand-600 text-white text-xs font-bold rounded-lg hover:bg-brand-700 transition-colors shadow-sm"
              >
                Save Prescription
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Main Panel Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Side: Calendars, Adherence Ring, Schedule blocks, AI Interaction Analysis */}
        <div className="lg:col-span-8 space-y-6">
          
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            
            {/* 1. Month Calendar Calendar (MD: 6-span) */}
            <div className="md:col-span-7 bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
              <div className="flex items-center justify-between mb-3 border-b border-slate-50 pb-2">
                <h3 className="text-xs font-bold text-slate-800">{monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}</h3>
                <div className="flex gap-1">
                  <button onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))} className="p-1 hover:bg-slate-50 rounded transition-colors text-slate-500"><ChevronLeft size={14} /></button>
                  <button onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))} className="p-1 hover:bg-slate-50 rounded transition-colors text-slate-500"><ChevronRight size={14} /></button>
                </div>
              </div>
              <div className="grid grid-cols-7 gap-0.5 text-center mb-1">
                {['S','M','T','W','T','F','S'].map((d, i) => (
                  <div key={i} className="text-[10px] font-bold text-slate-400 py-1">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-0.5">
                {Array.from({ length: firstDayOfMonth }).map((_, i) => <div key={`empty-${i}`} />)}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day = i + 1;
                  const isSelected = day === currentDate.getDate();
                  const now = new Date();
                  const isToday = day === now.getDate() && currentDate.getMonth() === now.getMonth() && currentDate.getFullYear() === now.getFullYear();
                  
                  return (
                    <button
                      key={day}
                      onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth(), day))}
                      className={`h-7 w-full rounded-md flex items-center justify-center text-[11px] font-medium transition-colors ${
                        isSelected 
                          ? 'bg-brand-600 text-white font-bold' 
                          : isToday 
                            ? 'bg-brand-50 text-brand-700 font-bold border border-brand-200' 
                            : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. Daily Adherence Ring (MD: 5-span) */}
            <div className="md:col-span-5 bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-col justify-between items-center text-center">
              <div className="w-full">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Daily Compliance</p>
                <p className="text-xs font-semibold text-slate-700 mt-0.5">{monthNames[currentDate.getMonth()]} {currentDate.getDate()}, {currentDate.getFullYear()}</p>
              </div>

              <div className="relative w-24 h-24 my-2">
                <svg viewBox="0 0 36 36" className="w-full h-full transform -rotate-90">
                  <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" stroke="#f1f5f9" strokeWidth="3" fill="none" />
                  <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" stroke="url(#progressGrad)" strokeWidth="3" fill="none"
                    strokeDasharray={`${progressPercent}, 100`} strokeLinecap="round" className="transition-all duration-700 ease-in-out" />
                  <defs>
                    <linearGradient id="progressGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#0d9488" />
                      <stop offset="100%" stopColor="#3b82f6" />
                    </linearGradient>
                  </defs>
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-xl font-extrabold text-slate-800">{takenMeds}/{totalMeds}</span>
                  <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">taken</span>
                </div>
              </div>

              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${totalMeds === 0 ? 'bg-slate-100 text-slate-500' : takenMeds === totalMeds ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-brand-50 text-brand-700 border border-brand-100'}`}>
                {totalMeds === 0 ? "No scheduled doses" : takenMeds === totalMeds ? "All Taken ✓" : `${totalMeds - takenMeds} Doses Left`}
              </span>
            </div>

          </div>

          {/* 3. Schedules blocks (Morning & Evening Schedules) */}
          <div className="space-y-4">
            <ScheduleBlock title="Morning Doses" emoji="☀️" color="amber" meds={morningMeds} taken={takenHistory[selectedDateStr] || []} onToggle={handleToggleTaken} />
            <ScheduleBlock title="Evening Doses" emoji="🌙" color="blue" meds={eveningMeds} taken={takenHistory[selectedDateStr] || []} onToggle={handleToggleTaken} />
            
            {medsForToday.length === 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center">
                <Pill size={32} className="text-slate-300 mx-auto mb-3" />
                <h4 className="text-sm font-bold text-slate-700">No Scheduled Doses Today</h4>
                <p className="text-xs text-slate-500 mt-1">Change dates on the calendar or add a new prescription schedule.</p>
              </div>
            )}
          </div>

          {/* 4. Drug interaction Analyzer Box */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden p-5">
            <div className="flex items-center justify-between mb-4 border-b border-slate-50 pb-2">
              <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5 uppercase tracking-wider">
                <Shield size={14} className="text-slate-500" /> Clinical Interaction Analysis
              </h3>
              {interactionResult && (
                <button onClick={() => setExpandedInteraction(!expandedInteraction)}
                  className="p-1 hover:bg-slate-50 rounded transition-colors text-slate-400">
                  {expandedInteraction ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                </button>
              )}
            </div>

            {/* Quick check tip */}
            <div className="bg-amber-50/50 border border-amber-100 rounded-xl p-3.5 flex items-start gap-3 mb-4">
              <AlertTriangle size={15} className="text-amber-600 shrink-0 mt-0.5" />
              <div className="text-xs leading-relaxed text-amber-800">
                <strong>Safety recommendation:</strong> Always check interactions before combining new medications. Tick checkboxes in the medications directory and click <strong>"Check Interactions"</strong>.
              </div>
            </div>

            {isChecking ? (
              <div className="space-y-3 py-4 animate-pulse">
                <div className="h-3.5 bg-slate-100 rounded w-11/12" />
                <div className="h-3.5 bg-slate-100 rounded w-2/3" />
                <div className="h-3.5 bg-slate-100 rounded w-5/6" />
                <div className="h-3.5 bg-slate-100 rounded w-1/2" />
              </div>
            ) : interactionResult && expandedInteraction ? (
              <div 
                className="prose prose-xs prose-slate max-w-none text-xs leading-relaxed max-h-[300px] overflow-y-auto bg-slate-50 border border-slate-100 p-4 rounded-xl"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(marked.parse(interactionResult)) }} 
              />
            ) : null}
          </div>

        </div>

        {/* Right Side: Active Medications List, Alert Settings, interaction checkbox selectors */}
        <div className="lg:col-span-4 space-y-6">
          
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200/80 flex justify-between items-center">
              <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5 uppercase tracking-wider">
                <Pill size={13} className="text-brand-600" /> Prescriptions Directory
              </h3>
              <span className="text-[10px] font-bold text-slate-400 bg-white border border-slate-200 px-1.5 py-0.5 rounded-full">{medications.length} total</span>
            </div>

            <div className="divide-y divide-slate-100 max-h-[380px] overflow-y-auto">
              {medications.map(med => {
                const isSelected = checkMeds.includes(med.id);
                return (
                  <div key={med.id} className="p-3.5 hover:bg-slate-50/50 transition-colors flex items-start gap-2.5">
                    {/* Selector checkbox for AI Analysis */}
                    <input 
                      type="checkbox" 
                      checked={isSelected} 
                      onChange={() => setCheckMeds(prev => isSelected ? prev.filter(id => id !== med.id) : [...prev, med.id])}
                      className="w-3.5 h-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-500 cursor-pointer mt-1" 
                      title="Select for interaction analysis"
                    />
                    
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-slate-800 truncate">{med.name} <span className="font-normal text-slate-500 text-[11px]">{med.dosage}</span></p>
                      
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <span className="text-[9px] font-semibold text-slate-500 bg-slate-100 px-1 py-0.5 rounded uppercase tracking-wider">{med.frequency}</span>
                        <span className="text-[9px] text-slate-400 flex items-center gap-0.5 font-medium"><Clock size={9} />{med.time}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {/* Active alarm toggle */}
                      <button 
                        onClick={() => handleToggleReminder(med.id)}
                        title={med.reminderEnabled ? 'Reminder Alarms Active' : 'Alarms Off'}
                        className={`p-1.5 rounded-lg border transition-colors ${med.reminderEnabled ? 'bg-brand-50 border-brand-100 text-brand-600 hover:bg-brand-100' : 'bg-slate-50 border-slate-200 text-slate-400 hover:text-slate-600'}`}
                      >
                        {med.reminderEnabled ? <Bell size={12} /> : <BellOff size={12} />}
                      </button>

                      {/* Delete med */}
                      <button 
                        onClick={() => handleDeleteMed(med.id)}
                        title="Remove Prescription"
                        className="p-1.5 rounded-lg border border-slate-100 bg-slate-50 text-slate-400 hover:text-red-500 hover:border-red-100 hover:bg-red-50 transition-colors"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Run interaction analysis action button */}
            <div className="p-3 border-t border-slate-200 bg-slate-50 flex flex-col gap-2">
              <button 
                onClick={checkInteractions}
                disabled={checkMeds.length < 2 || isChecking}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white text-xs font-bold rounded-lg transition-colors shadow-sm disabled:cursor-not-allowed"
              >
                {isChecking ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
                Check AI Interactions ({checkMeds.length} selected)
              </button>
              {checkMeds.length < 2 && (
                <p className="text-[9px] text-slate-400 text-center font-medium">Select 2 or more prescriptions above to run the analysis</p>
              )}
            </div>

          </div>

        </div>

      </div>

    </div>
  );
}

function ScheduleBlock({ title, emoji, color, meds, taken, onToggle }) {
  if (meds.length === 0) return null;
  const colors = {
    amber: 'bg-amber-50 border-amber-100 text-amber-800',
    blue: 'bg-sky-50 border-sky-100 text-sky-800'
  };
  
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden animate-in fade-in duration-200">
      <div className={`px-4 py-2.5 border-b ${colors[color]} flex items-center justify-between`}>
        <div className="flex items-center gap-1.5">
          <span className="text-sm">{emoji}</span>
          <h3 className="text-xs font-bold uppercase tracking-wider">{title}</h3>
        </div>
        <span className="text-[10px] font-bold opacity-85">{meds.length} scheduled</span>
      </div>
      
      <div className="divide-y divide-slate-100">
        {meds.map(med => {
          const isTaken = taken.includes(med.id);
          return (
            <div key={med.id} className={`p-4 transition-colors ${isTaken ? 'bg-emerald-50/20' : ''}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2">
                  <div className="mt-0.5">
                    {isTaken ? (
                      <CheckCircle size={15} className="text-emerald-500" />
                    ) : (
                      <Clock size={15} className="text-slate-300" />
                    )}
                  </div>
                  <div>
                    <h4 className={`text-xs font-bold text-slate-800 flex items-center gap-1.5`}>
                      {med.name} <span className="font-semibold text-slate-500">{med.dosage}</span>
                    </h4>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[9px] font-semibold text-slate-600 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5">{med.time}</span>
                      <span className="text-[10px] font-medium text-slate-500 italic">{med.instruction}</span>
                    </div>
                  </div>
                </div>

                {isTaken ? (
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded border border-emerald-200">Taken ✓</span>
                    <button onClick={() => onToggle(med.id, med.name)} className="text-[10px] font-semibold text-slate-400 hover:text-slate-600 transition-colors underline">Undo</button>
                  </div>
                ) : (
                  <button 
                    onClick={() => onToggle(med.id, med.name)}
                    className="px-3 py-1 bg-brand-600 hover:bg-brand-700 text-white text-[10px] font-bold rounded-lg transition-colors shadow-sm"
                  >
                    Mark Taken
                  </button>
                )}
              </div>

              {/* Dynamic AI Clinical Reason Card */}
              {med.aiReason && (
                <div className="mt-3 ml-5 bg-slate-50 border border-slate-100 rounded-xl p-3 relative overflow-hidden">
                  <div className="absolute top-0 left-0 bottom-0 w-0.5 bg-brand-500 rounded-full" />
                  <p className="text-[10px] font-bold text-brand-700 mb-0.5 flex items-center gap-1">
                    <Bot size={11} /> Therapeutic Reason
                  </p>
                  <p className="text-[10.5px] leading-relaxed text-slate-600 font-medium">{med.aiReason}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
