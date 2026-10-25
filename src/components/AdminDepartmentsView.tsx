import React, { useState, useEffect } from 'react';
import { Department } from '../types';
import { api } from '../services/api';
import { Building2, Edit2, Clock, CheckCircle2, X } from 'lucide-react';

export const AdminDepartmentsView: React.FC = () => {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);

  // Edit Modal
  const [selectedDept, setSelectedDept] = useState<Department | null>(null);
  const [headOfDepartment, setHeadOfDepartment] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [slaLow, setSlaLow] = useState(48);
  const [slaMedium, setSlaMedium] = useState(24);
  const [slaHigh, setSlaHigh] = useState(12);
  const [slaEmergency, setSlaEmergency] = useState(4);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadDepartments = async () => {
    setLoading(true);
    try {
      const res = await api.admin.getDepartments();
      setDepartments(res.departments || []);
    } catch (err: any) {
      console.error('Failed to load departments:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDepartments();
  }, []);

  const openEdit = (dept: Department) => {
    setSelectedDept(dept);
    setHeadOfDepartment(dept.headOfDepartment);
    setContactEmail(dept.contactEmail);
    setSlaLow(dept.slaHoursDefault?.Low || 48);
    setSlaMedium(dept.slaHoursDefault?.Medium || 24);
    setSlaHigh(dept.slaHoursDefault?.High || 12);
    setSlaEmergency(dept.slaHoursDefault?.Emergency || 4);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDept) return;

    setIsSaving(true);
    try {
      const res = await api.admin.updateDepartment(selectedDept.id, {
        headOfDepartment,
        contactEmail,
        slaHoursDefault: {
          Low: Number(slaLow),
          Medium: Number(slaMedium),
          High: Number(slaHigh),
          Emergency: Number(slaEmergency),
        },
      });
      setMessage(`SLA configuration updated for ${selectedDept.name}`);
      setSelectedDept(null);
      await loadDepartments();
    } catch (err: any) {
      alert(err.message || 'Failed to update department.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs">
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <Building2 className="w-5 h-5 text-indigo-700" />
          <span>Campus Departments &amp; SLA Policy Rules</span>
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          Configure response deadlines (Service Level Agreements) and escalation targets for Rajkiya Engineering College, Bijnor
        </p>
      </div>

      {message && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 rounded-lg flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {departments.map((dept) => (
          <div key={dept.id} className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <span className="font-mono text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md">
                  {dept.code}
                </span>
                <h3 className="text-base font-bold text-slate-900 mt-1">{dept.name}</h3>
                <p className="text-xs text-slate-500">{dept.headOfDepartment}</p>
                <p className="text-[11px] text-slate-400">{dept.contactEmail}</p>
              </div>

              <button
                onClick={() => openEdit(dept)}
                className="p-1.5 text-slate-400 hover:text-indigo-700 hover:bg-slate-100 rounded-lg transition-colors"
                title="Edit SLA & Contact"
              >
                <Edit2 className="w-4 h-4" />
              </button>
            </div>

            {/* SLA Policy Grid */}
            <div className="pt-2 border-t border-slate-100">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                <span>Target SLA Resolution Deadlines</span>
              </div>
              <div className="grid grid-cols-4 gap-2 text-center text-xs">
                <div className="p-2 bg-slate-50 rounded-lg border border-slate-200">
                  <div className="text-[10px] text-slate-500">Low</div>
                  <div className="font-bold text-slate-900">{dept.slaHoursDefault?.Low || 48}h</div>
                </div>
                <div className="p-2 bg-slate-50 rounded-lg border border-slate-200">
                  <div className="text-[10px] text-slate-500">Medium</div>
                  <div className="font-bold text-slate-900">{dept.slaHoursDefault?.Medium || 24}h</div>
                </div>
                <div className="p-2 bg-amber-50 rounded-lg border border-amber-200">
                  <div className="text-[10px] text-amber-700 font-semibold">High</div>
                  <div className="font-bold text-amber-900">{dept.slaHoursDefault?.High || 12}h</div>
                </div>
                <div className="p-2 bg-rose-50 rounded-lg border border-rose-200">
                  <div className="text-[10px] text-rose-700 font-bold">Emergency</div>
                  <div className="font-black text-rose-900">{dept.slaHoursDefault?.Emergency || 4}h</div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Edit Modal */}
      {selectedDept && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900">
                Edit {selectedDept.name} SLA Rules
              </h3>
              <button onClick={() => setSelectedDept(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="mt-4 space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Head of Department / Officer In-Charge
                </label>
                <input
                  type="text"
                  value={headOfDepartment}
                  onChange={(e) => setHeadOfDepartment(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Contact Email</label>
                <input
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  SLA Target Hours by Urgency Level:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[11px] text-slate-500">Low Priority (hrs):</span>
                    <input
                      type="number"
                      value={slaLow}
                      onChange={(e) => setSlaLow(Number(e.target.value))}
                      className="w-full px-2 py-1.5 border border-slate-300 rounded-md"
                    />
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-500">Medium Priority (hrs):</span>
                    <input
                      type="number"
                      value={slaMedium}
                      onChange={(e) => setSlaMedium(Number(e.target.value))}
                      className="w-full px-2 py-1.5 border border-slate-300 rounded-md"
                    />
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-500">High Priority (hrs):</span>
                    <input
                      type="number"
                      value={slaHigh}
                      onChange={(e) => setSlaHigh(Number(e.target.value))}
                      className="w-full px-2 py-1.5 border border-slate-300 rounded-md"
                    />
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-500">Emergency (hrs):</span>
                    <input
                      type="number"
                      value={slaEmergency}
                      onChange={(e) => setSlaEmergency(Number(e.target.value))}
                      className="w-full px-2 py-1.5 border border-slate-300 rounded-md"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedDept(null)}
                  className="px-3.5 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-semibold rounded-lg shadow-xs disabled:opacity-60"
                >
                  {isSaving ? 'Saving...' : 'Update SLA Policy'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
