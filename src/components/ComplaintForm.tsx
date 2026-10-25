import React, { useState } from 'react';
import { api } from '../services/api';
import { Complaint } from '../types';
import {
  Sparkles,
  AlertTriangle,
  Upload,
  X,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  MapPin,
  Clock,
  Layers,
} from 'lucide-react';

const CATEGORIES = [
  'Water',
  'Electricity',
  'Hostel',
  'Mess & Food',
  'Cleanliness',
  'Maintenance',
  'Library',
  'Internet & Network',
  'Sanitation',
  'Other',
];

const CAMPUS_AREAS = [
  'Hostels',
  'Academic Blocks',
  'Workshops & Labs',
  'Administrative Block',
  'Central Library',
  'Sports Complex & Ground',
  'Faculty & Staff Residence',
  'Campus Roads & Pathways',
];

const BLOCKS_BY_AREA: Record<string, string[]> = {
  Hostels: [
    'Ramanujan Hostel (Boys Hostel 1)',
    'Aryabhatta Hostel (Boys Hostel 2)',
    'Kalpana Chawla Hostel (Girls Hostel)',
    'Hostel Mess Dining Hall',
  ],
  'Academic Blocks': [
    'Computer Science & Engineering Block',
    'Electrical Engineering Block',
    'Mechanical Engineering Block',
    'Civil Engineering Block',
    'Applied Sciences & Humanities Wing',
  ],
  'Workshops & Labs': [
    'Central Mechanical Workshop',
    'Electrical Machines Lab',
    'Computer Center Server Room',
    'Chemistry & Environmental Lab',
  ],
  'Administrative Block': ['Deanery & Director Office', 'Registrar Office', 'Accounts & Finance Wing'],
  'Central Library': ['Ground Floor Circulation Desk', '1st Floor Reading Hall', 'Digital Reference Section'],
  'Sports Complex & Ground': ['Gymnasium Hall', 'Basketball Court', 'Main Playground'],
  'Faculty & Staff Residence': ['Type-IV Quarters Block A', 'Type-IV Quarters Block B', 'Staff Flats Block C'],
  'Campus Roads & Pathways': ['Main Gate to Admin Pathway', 'Hostel Approach Road', 'Academic Corridor'],
};

interface ComplaintFormProps {
  onSuccess: (complaint: Complaint) => void;
  onCancel: () => void;
  initialTitle?: string;
  initialDescription?: string;
}

export const ComplaintForm: React.FC<ComplaintFormProps> = ({
  onSuccess,
  onCancel,
  initialTitle,
  initialDescription,
}) => {
  const [title, setTitle] = useState(initialTitle || '');
  const [description, setDescription] = useState(initialDescription || '');
  const [category, setCategory] = useState('Electricity');
  const [area, setArea] = useState('Hostels');
  const [block, setBlock] = useState('Ramanujan Hostel (Boys Hostel 1)');
  const [room, setRoom] = useState('');
  const [landmark, setLandmark] = useState('');
  const [priority, setPriority] = useState<'Low' | 'Medium' | 'High' | 'Emergency'>('Medium');

  const [evidenceImages, setEvidenceImages] = useState<string[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiInsights, setAiInsights] = useState<{
    summary?: string;
    checklist?: string[];
    source?: string;
    suggestedUrgency?: string;
  } | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Duplicate Warning Modal
  const [duplicateWarning, setDuplicateWarning] = useState<any | null>(null);
  const [pendingSubmissionData, setPendingSubmissionData] = useState<any | null>(null);

  const handleAreaChange = (newArea: string) => {
    setArea(newArea);
    const availableBlocks = BLOCKS_BY_AREA[newArea] || [];
    setBlock(availableBlocks[0] || '');
  };

  const handleAIAnalyze = async () => {
    if (!title && !description) {
      setError('Please type a title or description first to run AI triage.');
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    try {
      const res = await api.ai.analyze(title, description);
      const data = res.analysis;
      if (data) {
        if (CATEGORIES.includes(data.category)) {
          setCategory(data.category);
        }
        if (data.urgency) {
          setPriority(data.urgency);
        }
        setAiInsights({
          summary: data.summary,
          checklist: data.suggestedChecklist,
          source: data.source,
          suggestedUrgency: data.urgency,
        });
      }
    } catch (err: any) {
      setError('AI triage service unavailable. You can manually choose category and priority.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (evidenceImages.length + files.length > 3) {
      setError('Maximum 3 images can be attached per complaint.');
      return;
    }

    Array.from(files).forEach((file) => {
      if (file.size > 3 * 1024 * 1024) {
        setError('Image file size must be under 3MB.');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        if (reader.result) {
          setEvidenceImages((prev) => [...prev, reader.result as string]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (index: number) => {
    setEvidenceImages((prev) => prev.filter((_, i) => i !== index));
  };

  const executeSubmission = async (data: any) => {
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await api.complaints.create(data);
      onSuccess(res.complaint);
    } catch (err: any) {
      setError(err.message || 'Failed to submit complaint.');
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim() || !room.trim()) {
      setError('Please fill in title, detailed description, and room/corridor location.');
      return;
    }

    const payload = {
      title: title.trim(),
      description: description.trim(),
      category,
      location: {
        area,
        block,
        room: room.trim(),
        landmark: landmark.trim(),
      },
      priority,
      evidenceImages,
    };

    // Check duplicate first
    try {
      const dupRes = await api.ai.detectDuplicates(payload);
      if (dupRes.duplicateCheck?.isDuplicateCandidate) {
        setDuplicateWarning(dupRes.duplicateCheck);
        setPendingSubmissionData(payload);
        return;
      }
    } catch {
      // If duplicate check network fails, proceed safely with direct submit
    }

    await executeSubmission(payload);
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-slate-900">Register Campus Complaint / Service Request</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Rajkiya Engineering College, Bijnor · Automated Department Dispatch &amp; SLA Tracking
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="text-slate-400 hover:text-slate-600 p-1 rounded-md"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {error && (
        <div className="mx-6 mt-4 p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-2.5 text-xs text-rose-800">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="p-6 space-y-6">
        {/* Title & AI Auto-Triage Trigger */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label htmlFor="title" className="block text-xs font-bold text-slate-800">
              Complaint Subject / Short Title *
            </label>
            <button
              type="button"
              onClick={handleAIAnalyze}
              disabled={isAnalyzing || (!title && !description)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-md transition-colors disabled:opacity-50 focus:outline-hidden"
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
              <span>{isAnalyzing ? 'Triage in progress...' : 'AI Auto-Detect Category & Urgency'}</span>
            </button>
          </div>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Water cooler leaking on 2nd floor, or Wi-Fi offline in CS Lab 3"
            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:bg-white focus:outline-hidden focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20"
            required
          />
        </div>

        {/* Detailed Description */}
        <div>
          <label htmlFor="description" className="block text-xs font-bold text-slate-800 mb-1.5">
            Detailed Problem Description *
          </label>
          <textarea
            id="description"
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Please detail the issue: what is broken, what sounds/sparks/leaks are observed, how long it has been occurring, and specific equipment involved."
            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:bg-white focus:outline-hidden focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20"
            required
          />
        </div>

        {/* AI Insight Box (if generated) */}
        {aiInsights && (
          <div className="p-3.5 bg-indigo-50/70 border border-indigo-200 rounded-lg text-xs space-y-2">
            <div className="flex items-center justify-between font-semibold text-indigo-950">
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-indigo-600" />
                <span>AI Automated Triage Recommendation</span>
              </span>
              <span className="text-[11px] text-indigo-700 font-medium">
                Source: {aiInsights.source === 'ai' ? 'Gemini 3.8 Flash' : 'Deterministic Rule Engine'}
              </span>
            </div>
            {aiInsights.summary && (
              <p className="text-slate-700 italic">"{aiInsights.summary}"</p>
            )}
            {aiInsights.checklist && aiInsights.checklist.length > 0 && (
              <div>
                <span className="font-semibold text-slate-800">Suggested Technician Checklist:</span>
                <ul className="mt-1 space-y-0.5 list-disc list-inside text-slate-600">
                  {aiInsights.checklist.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Category & Priority Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="category" className="block text-xs font-bold text-slate-800 mb-1.5">
              Service Category *
            </label>
            <select
              id="category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:bg-white focus:outline-hidden focus:border-indigo-600"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="priority" className="block text-xs font-bold text-slate-800 mb-1.5">
              Urgency / Priority *
            </label>
            <select
              id="priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value as any)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:bg-white focus:outline-hidden focus:border-indigo-600"
            >
              <option value="Low">Low (General maintenance, aesthetic)</option>
              <option value="Medium">Medium (Standard priority · 24h SLA)</option>
              <option value="High">High (Disrupts classes / water / connectivity · 8h SLA)</option>
              <option value="Emergency">Emergency (Fire, short-circuit, food hazard · 4h SLA)</option>
            </select>
          </div>
        </div>

        {/* Location Section */}
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-4">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-800 uppercase tracking-wider">
            <MapPin className="w-4 h-4 text-indigo-700" />
            <span>Campus Location Specification (REC Bijnor)</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Campus Area *</label>
              <select
                value={area}
                onChange={(e) => handleAreaChange(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900"
              >
                {CAMPUS_AREAS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Building / Block *</label>
              <select
                value={block}
                onChange={(e) => setBlock(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900"
              >
                {(BLOCKS_BY_AREA[area] || []).map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Room Number / Floor / Corridor *
              </label>
              <input
                type="text"
                value={room}
                onChange={(e) => setRoom(e.target.value)}
                placeholder="e.g. Room 304, 2nd Floor West Wing"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Prominent Landmark (Optional)
              </label>
              <input
                type="text"
                value={landmark}
                onChange={(e) => setLandmark(e.target.value)}
                placeholder="e.g. Near Staircase B or Opposite Water Cooler"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900"
              />
            </div>
          </div>
        </div>

        {/* Evidence Images Upload */}
        <div>
          <label className="block text-xs font-bold text-slate-800 mb-1.5">
            Attach Evidence Photos (Optional, Max 3)
          </label>
          <div className="flex flex-wrap items-center gap-3">
            {evidenceImages.map((img, idx) => (
              <div key={idx} className="relative w-20 h-20 rounded-lg border border-slate-300 overflow-hidden group">
                <img src={img} alt="Evidence" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => removeImage(idx)}
                  className="absolute top-1 right-1 bg-slate-900/80 text-white rounded-full p-1 opacity-90 hover:opacity-100"
                  aria-label="Remove image"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}

            {evidenceImages.length < 3 && (
              <label className="w-20 h-20 flex flex-col items-center justify-center border-2 border-dashed border-slate-300 hover:border-indigo-500 rounded-lg cursor-pointer bg-slate-50 hover:bg-indigo-50/50 transition-colors">
                <Upload className="w-5 h-5 text-slate-400 group-hover:text-indigo-600" />
                <span className="text-[10px] text-slate-500 mt-1 font-medium">Add Photo</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                  disabled={isSubmitting}
                />
              </label>
            )}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            JPG, PNG or WEBP up to 3MB. Images help technicians carry the right spare parts.
          </p>
        </div>

        {/* Actions */}
        <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-5 py-2.5 bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-semibold rounded-lg shadow-xs focus:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-600 disabled:opacity-60 transition-colors flex items-center gap-2"
          >
            {isSubmitting ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Registering Complaint...</span>
              </>
            ) : (
              <span>Submit Complaint</span>
            )}
          </button>
        </div>
      </form>

      {/* Duplicate Candidate Confirmation Modal */}
      {duplicateWarning && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center mb-3">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-slate-900">Possible Duplicate Complaint Detected</h3>
            <p className="text-xs text-slate-600 mt-2 leading-relaxed">
              Our campus triage system found a similar open ticket already being resolved:
            </p>
            <div className="my-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900">
              <div className="font-semibold">{duplicateWarning.reason}</div>
              <div className="mt-1 text-[11px] text-amber-700">
                Confidence match score: {duplicateWarning.confidenceScore}%
              </div>
            </div>
            <p className="text-xs text-slate-500">
              Is this part of the same incident, or do you wish to register this as a separate ticket?
            </p>
            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setDuplicateWarning(null);
                  setPendingSubmissionData(null);
                }}
                className="px-3.5 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Review My Input
              </button>
              <button
                type="button"
                onClick={() => {
                  const data = pendingSubmissionData;
                  setDuplicateWarning(null);
                  setPendingSubmissionData(null);
                  if (data) executeSubmission(data);
                }}
                className="px-4 py-2 text-xs font-semibold text-white bg-indigo-700 hover:bg-indigo-800 rounded-lg shadow-xs"
              >
                Proceed as New Ticket
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
