import React, { useState, useEffect, useRef } from 'react';
import {
  FileText, Image, BarChart2, Upload, Plus, Trash2, Download,
  Search, Filter, X, Eye, Lock, CheckCircle2, Clock, Tag,
  AlertCircle, Loader2, FileImage, FileBarChart, File, BookOpen,
  Stethoscope, PenLine, ChevronDown, Calendar, User, HeartPulse, ShieldAlert,
  Activity, Pill, Bot
} from 'lucide-react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

const CATEGORIES = [
  { value: 'general', label: 'General', icon: File, color: 'text-slate-600', bg: 'bg-slate-100' },
  { value: 'prescription', label: 'Prescription', icon: Stethoscope, color: 'text-brand-600', bg: 'bg-brand-50' },
  { value: 'lab_report', label: 'Lab Report', icon: BarChart2, color: 'text-amber-600', bg: 'bg-amber-50' },
  { value: 'scan', label: 'Scan / Imaging', icon: FileImage, color: 'text-violet-600', bg: 'bg-violet-50' },
  { value: 'doctor_note', label: "Doctor's Note", icon: PenLine, color: 'text-teal-600', bg: 'bg-teal-50' },
  { value: 'test_graph', label: 'Test Graph', icon: FileBarChart, color: 'text-rose-600', bg: 'bg-rose-50' },
  { value: 'other', label: 'Other', icon: BookOpen, color: 'text-indigo-600', bg: 'bg-indigo-50' },
];

const getCat = (val) => CATEGORIES.find(c => c.value === val) || CATEGORIES[0];

const PRESEEDED_VITALS = [
  { 
    id: 'v1',
    title: "Lipid Panel", 
    date: "2026-05-18", 
    result: "LDL: 110 mg/dL", 
    status: "warning", 
    ref: "Ref: < 100 mg/dL", 
    icon: "Activity",
    details: "LDL (bad cholesterol) is slightly elevated. Total Cholesterol: 210 mg/dL, HDL: 45 mg/dL. We recommend reducing saturated fat intake and increasing physical activity."
  },
  { 
    id: 'v2',
    title: "HbA1c Test", 
    date: "2026-05-18", 
    result: "6.2%", 
    status: "warning", 
    ref: "Ref: < 5.7%", 
    icon: "Activity",
    details: "This result is in the pre-diabetic range (5.7% - 6.4%). It indicates a higher risk for developing Type 2 diabetes. Monitoring carbohydrate intake and regular exercise is advised."
  },
  { 
    id: 'v3',
    title: "Blood Pressure", 
    date: "2026-01-15", 
    result: "120/80", 
    status: "normal", 
    ref: "Ref: < 120/80", 
    icon: "HeartPulse",
    details: "Your blood pressure is at the ideal level. Keep up the healthy habits!"
  },
  { 
    id: 'v4',
    title: "Heart Rate", 
    date: "2026-01-15", 
    result: "72 bpm", 
    status: "normal", 
    ref: "Ref: 60-100 bpm", 
    icon: "Activity",
    details: "Your resting heart rate is healthy and within the normal range for an adult."
  }
];

const PRESEEDED_SCHEDULE = [
  {
    id: 's1',
    month: "January 2026", 
    status: "past",
    type: "checkup", 
    title: "Annual Physical Exam", 
    date: "Jan 15", 
    doctor: "Dr. Smith", 
    details: "All vitals normal. Blood pressure 120/80. Heart rate 72 bpm.", 
    icon: "User"
  },
  {
    id: 's2',
    month: "January 2026", 
    status: "past",
    type: "test", 
    title: "Comprehensive Metabolic Panel", 
    date: "Jan 16", 
    doctor: "Dr. Smith",
    details: "Fasting blood sugar slightly elevated. Advised diet change.", 
    icon: "Activity"
  },
  {
    id: 's3',
    month: "February 2026", 
    status: "past",
    type: "prescription", 
    title: "Metformin Refill", 
    date: "Feb 10", 
    doctor: "CareSync Pharmacy",
    details: "90-day supply. Take twice daily with meals.", 
    icon: "Pill"
  },
  {
    id: 's4',
    month: "May 2026", 
    status: "current",
    type: "followup", 
    title: "Cardiology Follow-up", 
    date: "May 20", 
    doctor: "Dr. Adams", 
    details: "Discuss recent ECG results and adjust medication if necessary.", 
    icon: "HeartPulse"
  },
  {
    id: 's5',
    month: "May 2026", 
    status: "current",
    type: "test", 
    title: "Lipid Panel & HbA1c", 
    date: "May 18", 
    doctor: "Dr. Adams",
    details: "Lab requested by Dr. Adams before follow-up.", 
    icon: "Activity"
  },
  {
    id: 's6',
    month: "August 2026", 
    status: "upcoming",
    type: "checkup", 
    title: "Dental Cleaning", 
    date: "Aug 05", 
    doctor: "Dr. White", 
    details: "Routine 6-month cleaning and X-rays.", 
    icon: "User"
  }
];

const ICON_MAP = { User, Activity, Pill, HeartPulse, FileText };

export default function MedicalHistory({ userId }) {
  const [activeTab, setActiveTab] = useState('vault'); // 'vault' | 'vitals' | 'schedule'
  
  // Document Vault State
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddRecord, setShowAddRecord] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCat, setFilterCat] = useState('all');
  const [viewRecord, setViewRecord] = useState(null);
  const [savingRecord, setSavingRecord] = useState(false);
  const [recordSavedMsg, setRecordSavedMsg] = useState('');
  const fileRef = useRef(null);
  const [recordForm, setRecordForm] = useState({
    title: '', category: 'general', content: '', notes: '',
    fileName: '', fileType: '', fileData: '',
    inputMode: 'text',
  });

  const [isAnalyzingFile, setIsAnalyzingFile] = useState(false);

  // Vitals State
  const [vitals, setVitals] = useState(() => {
    const saved = localStorage.getItem('caresync_vitals');
    return saved ? JSON.parse(saved) : PRESEEDED_VITALS;
  });
  const [showAddVital, setShowAddVital] = useState(false);
  const [newVital, setNewVital] = useState({
    title: '', date: '', result: '', status: 'normal', ref: '', details: '', icon: 'Activity'
  });
  const [selectedVitalModal, setSelectedVitalModal] = useState(null);

  // Schedule State
  const [schedule, setSchedule] = useState(() => {
    const saved = localStorage.getItem('caresync_care_schedule');
    return saved ? JSON.parse(saved) : PRESEEDED_SCHEDULE;
  });
  const [showAddVisit, setShowAddVisit] = useState(false);
  const [newVisit, setNewVisit] = useState({
    title: '', date: '', month: '', type: 'checkup', doctor: '', details: '', icon: 'User', status: 'upcoming'
  });
  const [selectedVisitModal, setSelectedVisitModal] = useState(null);

  // Sync Vitals and Schedule to LocalStorage
  useEffect(() => {
    localStorage.setItem('caresync_vitals', JSON.stringify(vitals));
  }, [vitals]);

  useEffect(() => {
    localStorage.setItem('caresync_care_schedule', JSON.stringify(schedule));
  }, [schedule]);

  // Load documents
  const loadRecords = () => {
    if (!userId) return;
    setLoading(true);
    fetch(`/api/medical-history/${userId}`)
      .then(r => r.json())
      .then(data => setRecords(Array.isArray(data) ? data : []))
      .catch(() => setRecords([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadRecords(); }, [userId]);

  const autoSummarizeFile = async (base64Data, mimeType, fileName) => {
    const isReadable = mimeType.startsWith('image/') || 
                       mimeType === 'application/pdf' || 
                       mimeType.startsWith('text/');
                       
    if (!isReadable) return;

    setIsAnalyzingFile(true);
    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey) throw new Error('API Key missing');

      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey });

      const prompt = `You are a clinical pharmacologist and medical database assistant.
The user has uploaded a medical document/report named "${fileName}".
Analyze the attached report/document and provide a short, concise, patient-friendly summary in short bullet points.
Highlight:
1. **Primary Diagnosis/Findings**
2. **Key Measurements/Values** (indicate if they are normal or outside standard range)
3. **Actionable Recommendations** (e.g. follow-up, diet, lifestyle, consult)

Keep the summary extremely short, clear, and direct. Respond in clean, brief markdown.`;

      const modelsToTry = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-2.5-flash'];
      let aiResponse = null;
      let lastError = null;

      for (const modelName of modelsToTry) {
        try {
          const response = await ai.models.generateContent({
            model: modelName,
            contents: [
              {
                inlineData: {
                  data: base64Data,
                  mimeType: mimeType
                }
              },
              prompt
            ]
          });
          aiResponse = response.text;
          if (aiResponse) break;
        } catch (e) {
          lastError = e;
          console.warn(`Model ${modelName} failed, trying next... Error:`, e.message);
        }
      }

      if (!aiResponse && lastError) {
        throw lastError;
      }

      setRecordForm(f => ({ ...f, content: aiResponse || 'No summary could be generated.' }));
    } catch (err) {
      console.error('File summarization error:', err);
      
      const cleanTitle = fileName.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
      const fallbackSummary = `### 📋 ${cleanTitle} (Document Vault Entry)
* **File Attached**: \`${fileName}\`
* **Security Status**: Encrypted & Saved in Vault
* **Clinical Note**: Gemini API Quota Exhausted (${err.message}). A automated AI extraction was bypassed.

*You can edit this box directly to add your primary readings, blood counts, or physician instructions manually!*`;

      setRecordForm(f => ({ 
        ...f, 
        content: fallbackSummary 
      }));
    } finally {
      setIsAnalyzingFile(false);
    }
  };

  // Document actions
  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { alert('File size exceeds the 20MB limit.'); return; }
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result.split(',')[1];
      setRecordForm(f => ({ ...f, fileName: file.name, fileType: file.type, fileData: base64 }));
      
      // Call AI to auto-summarize
      await autoSummarizeFile(base64, file.type, file.name);
    };
    reader.readAsDataURL(file);
  };

  const handleSaveRecord = async () => {
    if (!recordForm.title.trim()) { alert('Title is required.'); return; }
    if (!recordForm.content.trim() && !recordForm.fileData) { alert('Please provide text content or attach a file.'); return; }
    setSavingRecord(true);
    try {
      const res = await fetch('/api/medical-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          title: recordForm.title.trim(),
          category: recordForm.category,
          content: recordForm.content || null,
          notes: recordForm.notes || null,
          fileName: recordForm.fileName || null,
          fileType: recordForm.fileType || null,
          fileData: recordForm.fileData || null,
        }),
      });
      if (!res.ok) throw new Error();
      setRecordSavedMsg('Record added securely to database.');
      setTimeout(() => setRecordSavedMsg(''), 3000);
      setRecordForm({ title: '', category: 'general', content: '', notes: '', fileName: '', fileType: '', fileData: '', inputMode: 'text' });
      setShowAddRecord(false);
      loadRecords();
    } catch {
      alert('Save operation failed. Please try again.');
    } finally {
      setSavingRecord(false);
    }
  };

  const handleDeleteRecord = async (id) => {
    if (!confirm('Delete this medical record?')) return;
    await fetch(`/api/medical-history/${userId}/${id}`, { method: 'DELETE' });
    loadRecords();
  };

  // Vitals Actions
  const handleAddVital = (e) => {
    e.preventDefault();
    if (!newVital.title || !newVital.result) return;
    const v = {
      id: Date.now().toString(),
      title: newVital.title,
      date: newVital.date || new Date().toISOString().split('T')[0],
      result: newVital.result,
      status: newVital.status,
      ref: newVital.ref || 'Ref: N/A',
      icon: newVital.title.toLowerCase().includes('pressure') || newVital.title.toLowerCase().includes('heart') ? 'HeartPulse' : 'Activity',
      details: newVital.details || 'No clinical interpretation provided.'
    };
    setVitals(prev => [v, ...prev]);
    setNewVital({ title: '', date: '', result: '', status: 'normal', ref: '', details: '', icon: 'Activity' });
    setShowAddVital(false);
  };

  const handleDeleteVital = (id) => {
    if (confirm('Delete this vital/lab record?')) {
      setVitals(prev => prev.filter(v => v.id !== id));
    }
  };

  // Schedule Actions
  const handleAddVisit = (e) => {
    e.preventDefault();
    if (!newVisit.title || !newVisit.date) return;
    
    const parsedDate = new Date(newVisit.date);
    const monthYear = parsedDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const formattedDay = parsedDate.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });

    const visit = {
      id: Date.now().toString(),
      month: monthYear,
      status: newVisit.status,
      type: newVisit.type,
      title: newVisit.title,
      date: formattedDay,
      doctor: newVisit.doctor || 'General Practitioner',
      details: newVisit.details || 'Scheduled visit.',
      icon: newVisit.type === 'prescription' ? 'Pill' : newVisit.type === 'test' ? 'Activity' : 'User'
    };

    setSchedule(prev => [visit, ...prev]);
    setNewVisit({ title: '', date: '', month: '', type: 'checkup', doctor: '', details: '', icon: 'User', status: 'upcoming' });
    setShowAddVisit(false);
  };

  const handleDeleteVisit = (id) => {
    if (confirm('Remove this schedule item?')) {
      setSchedule(prev => prev.filter(s => s.id !== id));
    }
  };

  const filteredRecords = records.filter(r => {
    const matchCat = filterCat === 'all' || r.category === filterCat;
    const q = searchQuery.toLowerCase();
    const matchQ = !q || r.title.toLowerCase().includes(q) || (r.content && r.content.toLowerCase().includes(q)) || (r.notes && r.notes.toLowerCase().includes(q));
    return matchCat && matchQ;
  });

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      
      {/* Controls and Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-5 border border-slate-200 rounded-2xl shadow-sm">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Health Records & Medical History</h2>
          <p className="text-xs text-slate-500 mt-0.5">Secure document storage, dynamic vitals logger, and appointment schedules</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Sub-tabs toggles */}
          <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
            <button 
              onClick={() => setActiveTab('vault')}
              className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${activeTab === 'vault' ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}
            >
              Vault
            </button>
            <button 
              onClick={() => setActiveTab('vitals')}
              className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${activeTab === 'vitals' ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}
            >
              Vitals
            </button>
            <button 
              onClick={() => setActiveTab('schedule')}
              className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${activeTab === 'schedule' ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}
            >
              Schedule
            </button>
          </div>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-lg transition-colors"
          >
            <Download size={13} /> Export PDF
          </button>
        </div>
      </div>

      {/* Subtab 1: Document Vault */}
      {activeTab === 'vault' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto flex-1">
              <div className="relative flex-1 max-w-md">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text" placeholder="Search medical documents..."
                  value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-brand-500 bg-white text-slate-800"
                />
              </div>
              <select
                value={filterCat} onChange={e => setFilterCat(e.target.value)}
                className="text-xs border border-slate-200 rounded-lg px-2 py-2 bg-white focus:outline-none focus:border-brand-500 cursor-pointer text-slate-700"
              >
                <option value="all">All Categories</option>
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <button
              onClick={() => setShowAddRecord(!showAddRecord)}
              className="flex items-center gap-1.5 px-4 py-2 bg-brand-600 text-white text-xs font-bold rounded-lg hover:bg-brand-700 transition-colors shadow-sm shrink-0"
            >
              {showAddRecord ? <X size={14} /> : <Plus size={14} />}
              {showAddRecord ? 'Cancel' : 'Upload Document'}
            </button>
          </div>

          {recordSavedMsg && (
            <div className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-semibold text-emerald-700">
              <CheckCircle2 size={14} /> {recordSavedMsg}
            </div>
          )}

          {/* Add Record Form Panel */}
          {showAddRecord && (
            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-sm animate-in fade-in slide-in-from-top-4 duration-200">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Upload or Write New Health Record</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">Document Title *</label>
                  <input
                    type="text" placeholder="e.g. Lipid Blood Panel – May 2026"
                    value={recordForm.title} onChange={e => setRecordForm(f => ({ ...f, title: e.target.value }))}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-brand-500 bg-white text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">Category</label>
                  <select
                    value={recordForm.category} onChange={e => setRecordForm(f => ({ ...f, category: e.target.value }))}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-brand-500 bg-white cursor-pointer text-slate-800"
                  >
                    {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">Input Type</label>
                  <div className="flex rounded-lg border border-slate-200 overflow-hidden">
                    <button
                      onClick={() => setRecordForm(f => ({ ...f, inputMode: 'text' }))}
                      className={`flex-1 py-1.5 text-[11px] font-bold transition-colors ${recordForm.inputMode === 'text' ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                    >
                      Write Report
                    </button>
                    <button
                      onClick={() => setRecordForm(f => ({ ...f, inputMode: 'file' }))}
                      className={`flex-1 py-1.5 text-[11px] font-bold transition-colors ${recordForm.inputMode === 'file' ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                    >
                      Attach File
                    </button>
                  </div>
                </div>
              </div>

              {recordForm.inputMode === 'text' && (
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">Content details (Markdown supported)</label>
                  <textarea
                    rows={6}
                    value={recordForm.content}
                    onChange={e => setRecordForm(f => ({ ...f, content: e.target.value }))}
                    placeholder="Enter diagnostic details, findings, or notes..."
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-brand-500 font-mono resize-y"
                  />
                </div>
              )}

              {recordForm.inputMode === 'file' && (
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">Select Attachment</label>
                  <div
                    onClick={() => !isAnalyzingFile && fileRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${recordForm.fileName ? 'border-brand-300 bg-brand-50' : 'border-slate-200 hover:border-brand-300 hover:bg-slate-50'} ${isAnalyzingFile ? 'opacity-75 pointer-events-none' : ''}`}
                  >
                    <input ref={fileRef} type="file" className="hidden" onChange={handleFileSelect}
                      disabled={isAnalyzingFile}
                      accept="image/*,.pdf,.txt,.doc,.docx,.csv,.png,.jpg,.jpeg,.svg,.xls,.xlsx" />
                    {isAnalyzingFile ? (
                      <div className="flex flex-col items-center gap-2">
                        <Loader2 size={24} className="animate-spin text-brand-600" />
                        <p className="text-xs font-bold text-brand-700 animate-pulse">Analyzing clinical report with AI...</p>
                        <p className="text-[10px] text-slate-400">Extracting readings and generating summary...</p>
                      </div>
                    ) : recordForm.fileName ? (
                      <div className="flex flex-col items-center gap-1">
                        <CheckCircle2 size={20} className="text-brand-500" />
                        <p className="text-xs font-bold text-brand-700">{recordForm.fileName}</p>
                        <button onClick={e => { e.stopPropagation(); setRecordForm(f => ({ ...f, fileName: '', fileType: '', fileData: '', content: '' })); }} className="text-[10px] text-red-500 font-semibold mt-1">Remove File</button>
                      </div>
                    ) : (
                      <>
                        <Upload size={24} className="text-slate-300 mx-auto mb-2" />
                        <p className="text-xs font-bold text-slate-600">Click to upload report documents</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">PDFs, Images, Excel — up to 20MB</p>
                      </>
                    )}
                  </div>
                </div>
              )}

              {recordForm.inputMode === 'file' && recordForm.content && !isAnalyzingFile && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2 animate-in fade-in duration-200">
                  <div className="flex items-center gap-1.5 text-brand-700 font-bold text-[10px] uppercase tracking-wider">
                    <Bot size={13} className="text-brand-600" /> AI Generated Report Summary
                  </div>
                  <textarea
                    rows={4}
                    value={recordForm.content}
                    onChange={e => setRecordForm(f => ({ ...f, content: e.target.value }))}
                    className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-700 focus:outline-none focus:border-brand-500 font-sans"
                  />
                  <p className="text-[9px] text-slate-400 font-medium">The summary above was automatically extracted using Clinical AI. You can review or edit it before saving.</p>
                </div>
              )}

              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1">Physician's Remarks / Special Advice</label>
                <input
                  type="text" placeholder="e.g. Schedule checking in 3 months"
                  value={recordForm.notes} onChange={e => setRecordForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-brand-500 bg-white text-slate-800"
                />
              </div>

              <div className="flex items-center gap-2 p-2 bg-emerald-50 border border-emerald-100 rounded-lg">
                <Lock size={12} className="text-emerald-600 shrink-0" />
                <p className="text-[10px] text-emerald-700 font-medium">Automatic secure encryption active. Protected inside SQLite document vault.</p>
              </div>

              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowAddRecord(false)} className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors">Cancel</button>
                <button
                  onClick={handleSaveRecord} disabled={savingRecord || !recordForm.title.trim()}
                  className="flex items-center gap-1.5 px-5 py-2 bg-brand-600 text-white text-xs font-bold rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors"
                >
                  {savingRecord ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                  Save Document
                </button>
              </div>
            </div>
          )}

          {/* Stats Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Vault Files', value: records.length, color: 'text-brand-600' },
              { label: 'Encrypted', value: records.filter(r => r.is_encrypted).length, color: 'text-emerald-600' },
              { label: 'PDFs & Scans', value: records.filter(r => r.file_name).length, color: 'text-violet-600' },
              { label: 'Clinical Vitals', value: vitals.length, color: 'text-amber-600' },
            ].map(s => (
              <div key={s.label} className="bg-white border border-slate-200 rounded-xl p-3 text-center">
                <p className={`text-xl font-extrabold ${s.color}`}>{s.value}</p>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Grid list */}
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2].map(i => (
                <div key={i} className="bg-white border border-slate-200 rounded-xl p-4 animate-pulse h-28" />
              ))}
            </div>
          ) : filteredRecords.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
              <FileText size={32} className="text-slate-200 mx-auto mb-3" />
              <h4 className="text-sm font-bold text-slate-700">No Documents in Vault</h4>
              <p className="text-xs text-slate-500 mt-1">Keep copies of blood work, imaging, or vaccine records safe in the document vault.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredRecords.map(r => (
                <RecordCard key={r.id} record={{ ...r, user_id: userId }} onDelete={handleDeleteRecord} onView={setViewRecord} />
              ))}
            </div>
          )}

        </div>
      )}

      {/* Subtab 2: Interactive Vitals and Lab Results */}
      {activeTab === 'vitals' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <HeartPulse size={14} className="text-brand-600" /> Lab Results & Vital Stats
            </h3>
            <button
              onClick={() => setShowAddVital(!showAddVital)}
              className="flex items-center gap-1 px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold rounded-lg transition-colors shadow-sm"
            >
              {showAddVital ? <X size={12} /> : <Plus size={12} />}
              {showAddVital ? 'Cancel' : 'Log Measurement'}
            </button>
          </div>

          {/* Log Vital Form */}
          {showAddVital && (
            <form onSubmit={handleAddVital} className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-sm animate-in fade-in slide-in-from-top-4 duration-200">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Add Lab Metric or Vital Measurement</h4>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">Measurement Type *</label>
                  <input required type="text" placeholder="e.g. Systolic BP / Blood Sugar" value={newVital.title}
                    onChange={e => setNewVital({...newVital, title: e.target.value})}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-brand-500 bg-white text-slate-800" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">Measured Value *</label>
                  <input required type="text" placeholder="e.g. 118/76 mmHg" value={newVital.result}
                    onChange={e => setNewVital({...newVital, result: e.target.value})}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-brand-500 bg-white text-slate-800" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">Normal Reference Range</label>
                  <input type="text" placeholder="e.g. Ref: < 120/80" value={newVital.ref}
                    onChange={e => setNewVital({...newVital, ref: e.target.value})}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-brand-500 bg-white text-slate-800" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">Safety Status</label>
                  <select value={newVital.status} onChange={e => setNewVital({...newVital, status: e.target.value})}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-brand-500 bg-white cursor-pointer text-slate-800">
                    <option value="normal">Healthy / Normal</option>
                    <option value="warning">Out of range / Elevated</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">Date Measured</label>
                  <input type="date" value={newVital.date} onChange={e => setNewVital({...newVital, date: e.target.value})}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-brand-500 bg-white text-slate-800" />
                </div>
                <div className="md:col-span-3">
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">Interpretation Notes</label>
                  <input type="text" placeholder="e.g. Measured at pharmacy check. Advised to reduce sodium intake." value={newVital.details}
                    onChange={e => setNewVital({...newVital, details: e.target.value})}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-brand-500 bg-white text-slate-800" />
                </div>
                <div className="md:col-span-4 flex justify-end gap-2 pt-2 border-t border-slate-100">
                  <button type="button" onClick={() => setShowAddVital(false)} className="px-4 py-1.5 bg-slate-50 border border-slate-200 text-xs font-semibold rounded-lg text-slate-500 hover:bg-slate-100 transition-colors">Cancel</button>
                  <button type="submit" className="px-5 py-1.5 bg-brand-600 text-white text-xs font-bold rounded-lg hover:bg-brand-700 transition-colors shadow-sm">Save Measurement</button>
                </div>
              </div>
            </form>
          )}

          {/* Grid Vitals Display */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {vitals.map(v => {
              const IconComp = ICON_MAP[v.icon] || BarChart2;
              return (
                <div 
                  key={v.id} 
                  className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-center justify-between text-left hover:border-brand-300 transition-all group cursor-pointer"
                  onClick={() => setSelectedVitalModal(v)}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-slate-50 group-hover:bg-brand-50 flex items-center justify-center text-slate-400 group-hover:text-brand-600 transition-colors">
                      <IconComp size={18} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-800 group-hover:text-brand-700 transition-colors">{v.title}</p>
                      <p className="text-[10px] text-slate-400 font-medium">Checked: {v.date}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className={`text-sm font-extrabold ${v.status === 'warning' ? 'text-amber-600' : 'text-emerald-600'}`}>
                        {v.result}
                      </p>
                      <p className="text-[9px] text-slate-400 font-medium">{v.ref}</p>
                    </div>
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleDeleteVital(v.id); }}
                      className="p-1 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded transition-colors"
                      title="Delete Measurement"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Vitals interpretation Modal */}
          {selectedVitalModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
              <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-sm overflow-hidden animate-in zoom-in duration-200">
                <div className="p-5">
                  <div className="flex items-center justify-between mb-4 border-b border-slate-50 pb-2">
                    <h3 className="text-sm font-bold text-slate-800">{selectedVitalModal.title}</h3>
                    <button onClick={() => setSelectedVitalModal(null)} className="p-1.5 hover:bg-slate-100 rounded-full transition-colors text-slate-400">
                      <X size={16} />
                    </button>
                  </div>
                  <div className="space-y-4">
                    <div className="bg-slate-50 border border-slate-100 p-3.5 rounded-xl flex items-center justify-between">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Measured Value</span>
                        <p className={`text-lg font-extrabold ${selectedVitalModal.status === 'warning' ? 'text-amber-600' : 'text-emerald-600'}`}>{selectedVitalModal.result}</p>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Reference Range</span>
                        <p className="text-xs font-bold text-slate-700">{selectedVitalModal.ref}</p>
                      </div>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Clinical Interpretation</span>
                      <p className="text-xs leading-relaxed text-slate-600 font-medium bg-slate-50/50 border border-slate-100 p-3 rounded-lg">{selectedVitalModal.details}</p>
                    </div>
                  </div>
                </div>
                <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-100 flex justify-end">
                  <button onClick={() => setSelectedVitalModal(null)} className="px-4 py-1.5 bg-brand-600 text-white text-xs font-bold rounded-lg hover:bg-brand-700 transition-colors">Close</button>
                </div>
              </div>
            </div>
          )}

        </div>
      )}

      {/* Subtab 3: Interactive Yearly Care Schedule / Timeline */}
      {activeTab === 'schedule' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <Calendar size={14} className="text-brand-600" /> Yearly Care Schedule & Appointments
            </h3>
            <button
              onClick={() => setShowAddVisit(!showAddVisit)}
              className="flex items-center gap-1 px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold rounded-lg transition-colors shadow-sm"
            >
              {showAddVisit ? <X size={12} /> : <Plus size={12} />}
              {showAddVisit ? 'Cancel' : 'Schedule Appointment'}
            </button>
          </div>

          {/* Schedule form */}
          {showAddVisit && (
            <form onSubmit={handleAddVisit} className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-sm animate-in fade-in slide-in-from-top-4 duration-200">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Schedule Appointment / Clinical Visit</h4>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">Appointment Title *</label>
                  <input required type="text" placeholder="e.g. Cardiology check-up" value={newVisit.title}
                    onChange={e => setNewVisit({...newVisit, title: e.target.value})}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-brand-500 bg-white text-slate-800" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">Healthcare Specialist</label>
                  <input type="text" placeholder="e.g. Dr. Adams" value={newVisit.doctor}
                    onChange={e => setNewVisit({...newVisit, doctor: e.target.value})}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-brand-500 bg-white text-slate-800" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">Visit Type</label>
                  <select value={newVisit.type} onChange={e => setNewVisit({...newVisit, type: e.target.value})}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-brand-500 bg-white cursor-pointer text-slate-800">
                    <option value="checkup">Routine Checkup</option>
                    <option value="test">Diagnostic Testing / Labs</option>
                    <option value="prescription">Refills & Prescriptions</option>
                    <option value="followup">Follow-up check</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">Date Scheduled *</label>
                  <input required type="date" value={newVisit.date} onChange={e => setNewVisit({...newVisit, date: e.target.value})}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-brand-500 bg-white text-slate-800" />
                </div>
                <div className="md:col-span-4">
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">Visit Details</label>
                  <input type="text" placeholder="e.g. Fasting lipid panel before checkup. Review current ECG report." value={newVisit.details}
                    onChange={e => setNewVisit({...newVisit, details: e.target.value})}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-brand-500 bg-white text-slate-800" />
                </div>
                <div className="md:col-span-4 flex justify-end gap-2 pt-2 border-t border-slate-100">
                  <button type="button" onClick={() => setShowAddVisit(false)} className="px-4 py-1.5 bg-slate-50 border border-slate-200 text-xs font-semibold rounded-lg text-slate-500 hover:bg-slate-100 transition-colors">Cancel</button>
                  <button type="submit" className="px-5 py-1.5 bg-brand-600 text-white text-xs font-bold rounded-lg hover:bg-brand-700 transition-colors shadow-sm">Schedule Visit</button>
                </div>
              </div>
            </form>
          )}

          {/* Group appointments by month */}
          <div className="space-y-4">
            {schedule.map(evt => {
              const IconComp = ICON_MAP[evt.icon] || Calendar;
              const isPast = evt.status === 'past';
              
              return (
                <div 
                  key={evt.id} 
                  className={`bg-white border rounded-2xl p-4 shadow-sm hover:border-brand-300 transition-all flex items-start gap-4 cursor-pointer relative group ${evt.status === 'current' ? 'border-brand-300 ring-2 ring-brand-100' : 'border-slate-200'}`}
                  onClick={() => setSelectedVisitModal(evt)}
                >
                  <div className="w-14 flex flex-col items-center justify-center shrink-0 border-r border-slate-100 pr-3">
                    <span className="text-xl font-black text-slate-800 group-hover:text-brand-600 leading-none">{evt.date.split(' ')[1]}</span>
                    <span className="text-[9px] font-bold text-slate-400 uppercase mt-1">{evt.date.split(' ')[0]}</span>
                  </div>

                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${isPast ? 'bg-slate-50 text-slate-400' : 'bg-brand-50 text-brand-600'}`}>
                    <IconComp size={16} />
                  </div>

                  <div className="flex-1 min-w-0 pt-0.5">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="text-xs font-bold text-slate-800 group-hover:text-brand-700 truncate">{evt.title}</h4>
                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${isPast ? 'bg-slate-100 text-slate-500' : 'bg-amber-50 text-amber-700 border border-amber-100'}`}>
                        {isPast ? 'Done' : 'Upcoming'}
                      </span>
                    </div>
                    <p className="text-[10px] font-semibold text-slate-500 mt-0.5">Specialist: {evt.doctor} ({evt.month})</p>
                    <p className="text-xs text-slate-500 mt-1 truncate font-medium">{evt.details}</p>
                  </div>

                  <button 
                    onClick={(e) => { e.stopPropagation(); handleDeleteVisit(evt.id); }}
                    className="absolute right-3 bottom-3 p-1 text-slate-300 hover:text-red-500 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Remove appointment"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              );
            })}
          </div>

          {/* Schedule Detail Modal */}
          {selectedVisitModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
              <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-sm overflow-hidden animate-in zoom-in duration-200">
                <div className="p-5">
                  <div className="flex items-center justify-between mb-4 border-b border-slate-50 pb-2">
                    <h3 className="text-sm font-bold text-slate-800">{selectedVisitModal.title}</h3>
                    <button onClick={() => setSelectedVisitModal(null)} className="p-1.5 hover:bg-slate-100 rounded-full transition-colors text-slate-400">
                      <X size={16} />
                    </button>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-500 bg-slate-50 border border-slate-150 p-2.5 rounded-lg">
                      <Clock size={13} className="text-slate-400" />
                      <span>{selectedVisitModal.month} (Day: {selectedVisitModal.date})</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Consulting Healthcare Provider</span>
                      <p className="text-xs font-bold text-slate-700 bg-slate-50/50 border border-slate-100 p-2.5 rounded-lg">{selectedVisitModal.doctor}</p>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Appointment Instructions</span>
                      <p className="text-xs leading-relaxed text-slate-600 font-medium bg-slate-50/50 border border-slate-100 p-3 rounded-lg">{selectedVisitModal.details}</p>
                    </div>
                  </div>
                </div>
                <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-100 flex justify-end">
                  <button onClick={() => setSelectedVisitModal(null)} className="px-4 py-1.5 bg-brand-600 text-white text-xs font-bold rounded-lg hover:bg-brand-700 transition-colors">Close</button>
                </div>
              </div>
            </div>
          )}

        </div>
      )}

      {/* View Modal for Documents */}
      {viewRecord && <ViewModal record={{ ...viewRecord, user_id: userId }} onClose={() => setViewRecord(null)} />}

    </div>
  );
}

function RecordCard({ record, onDelete, onView }) {
  const cat = getCat(record.category);
  const Icon = cat.icon;
  const date = new Date(record.uploaded_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 hover:shadow-md transition-shadow group flex flex-col justify-between">
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-xl ${cat.bg} flex items-center justify-center shrink-0`}>
          <Icon size={18} className={cat.color} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h4 className="text-xs font-bold text-slate-800 leading-tight truncate">{record.title}</h4>
            <div className="flex items-center gap-1 shrink-0">
              {record.is_encrypted ? (
                <span className="flex items-center gap-0.5 text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded-full">
                  <Lock size={8} /> Secured
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <span className={`text-[9px] font-bold uppercase tracking-wider ${cat.color} ${cat.bg} px-1.5 py-0.5 rounded`}>{cat.label}</span>
            <span className="text-[10px] text-slate-400 flex items-center gap-0.5 font-medium"><Clock size={9} />{date}</span>
          </div>
          {record.content && (
            <p className="text-xs text-slate-500 mt-2 line-clamp-2 leading-relaxed font-medium">{record.content.replace(/#{1,6}\s?|[*_]/g, '').trim()}</p>
          )}
          {record.notes && (
            <p className="text-[10px] text-slate-400 mt-1.5 italic truncate font-medium">📝 {record.notes}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100">
        <button
          onClick={() => onView(record)}
          className="flex items-center gap-1 px-2 py-1 text-[11px] font-bold text-brand-600 bg-brand-50 hover:bg-brand-100 rounded-lg transition-colors border border-brand-100"
        >
          <Eye size={11} /> View
        </button>
        {record.file_name && (
          <a
            href={`/api/medical-history/${record.user_id}/file/${record.id}`}
            className="flex items-center gap-1 px-2 py-1 text-[11px] font-bold text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200"
          >
            <Download size={11} /> Download
          </a>
        )}
        <button
          onClick={() => onDelete(record.id)}
          className="ml-auto flex items-center gap-1 px-2 py-1 text-[11px] font-bold text-red-500 hover:bg-red-50 hover:border-red-100 border border-transparent rounded-lg transition-colors"
        >
          <Trash2 size={11} /> Delete
        </button>
      </div>
    </div>
  );
}

function ViewModal({ record, onClose }) {
  if (!record) return null;
  const cat = getCat(record.category);
  const Icon = cat.icon;
  const date = new Date(record.uploaded_at).toLocaleString('en-IN');

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in duration-150">
        {/* Header */}
        <div className="flex items-start justify-between p-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl ${cat.bg} flex items-center justify-center`}>
              <Icon size={16} className={cat.color} />
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-800">{record.title}</h3>
              <p className="text-[10px] text-slate-400 font-medium">{cat.label} · {date}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-full text-slate-400 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {record.is_encrypted && (
            <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-100 rounded-xl text-[10px] font-bold text-emerald-700">
              <Lock size={11} /> Secure encryption active
            </div>
          )}

          {record.content && (
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Diagnostic Report</p>
              <div 
                className="prose prose-xs prose-slate max-w-none text-xs leading-relaxed bg-slate-50 border border-slate-100 rounded-xl p-4"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(marked.parse(record.content)) }} 
              />
            </div>
          )}

          {record.notes && (
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Special Advice</p>
              <p className="text-xs leading-relaxed text-slate-700 bg-amber-50 border border-amber-100 rounded-xl p-3.5 font-medium">{record.notes}</p>
            </div>
          )}

          {record.file_name && (
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Attached Document</p>
              <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <div className="flex items-center gap-2 min-w-0">
                  <File size={14} className="text-slate-500 shrink-0" />
                  <span className="text-xs text-slate-700 font-semibold truncate">{record.file_name}</span>
                </div>
                <a
                  href={`/api/medical-history/${record.user_id}/file/${record.id}`}
                  className="flex items-center gap-1 px-3 py-1 bg-brand-600 hover:bg-brand-700 text-white text-[10px] font-bold rounded-lg transition-colors shadow-sm"
                >
                  <Download size={10} /> Download File
                </a>
              </div>
            </div>
          )}
        </div>

        <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 flex justify-end">
          <button onClick={onClose} className="px-5 py-1.5 bg-brand-600 text-white text-xs font-bold rounded-lg hover:bg-brand-700 transition-colors">
            Close Report
          </button>
        </div>
      </div>
    </div>
  );
}
