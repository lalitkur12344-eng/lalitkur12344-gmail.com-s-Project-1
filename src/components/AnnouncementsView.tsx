import React, { useState, useEffect } from 'react';
import { Announcement } from '../types';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Megaphone, Plus, Trash2, AlertCircle, CheckCircle2, BellRing, Clock } from 'lucide-react';

export const AnnouncementsView: React.FC = () => {
  const { user } = useAuth();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);

  // New announcement modal
  const [showModal, setShowModal] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [priority, setPriority] = useState<'Normal' | 'Urgent' | 'Emergency'>('Normal');
  const [targetAudience, setTargetAudience] = useState<'all' | 'student' | 'faculty' | 'staff'>('all');
  const [isPublishing, setIsPublishing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadAnnouncements = async () => {
    setLoading(true);
    try {
      const res = await api.announcements.list();
      setAnnouncements(res.announcements || []);
    } catch (err: any) {
      console.error('Failed to load announcements:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnnouncements();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;

    setIsPublishing(true);
    setError(null);
    try {
      const res = await api.announcements.create({
        title: title.trim(),
        content: content.trim(),
        priority,
        targetAudience,
      });
      setMessage('Campus announcement broadcasted successfully.');
      setShowModal(false);
      setTitle('');
      setContent('');
      await loadAnnouncements();
    } catch (err: any) {
      setError(err.message || 'Failed to publish announcement.');
    } finally {
      setIsPublishing(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to remove this announcement?')) return;
    try {
      await api.announcements.delete(id);
      await loadAnnouncements();
    } catch (err: any) {
      alert(err.message || 'Failed to delete announcement.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Megaphone className="w-5 h-5 text-indigo-700" />
            <span>Campus Announcements &amp; Maintenance Notices</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Official broadcasts from Rajkiya Engineering College, Bijnor Administration and Estate Office
          </p>
        </div>

        {user?.role === 'admin' && (
          <button
            onClick={() => setShowModal(true)}
            className="px-4 py-2 bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-semibold rounded-lg shadow-xs flex items-center gap-2 self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>Broadcast Notice</span>
          </button>
        )}
      </div>

      {message && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 rounded-lg flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="py-16 text-center text-slate-400 text-xs">
          <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <span>Loading announcements...</span>
        </div>
      ) : announcements.length === 0 ? (
        <div className="bg-white p-12 text-center rounded-xl border border-slate-200 text-slate-500 text-xs">
          <BellRing className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="font-semibold text-slate-700">No active broadcasts</p>
          <p className="text-slate-400 mt-0.5">Campus notices and scheduled works will appear here.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {announcements.map((ann) => (
            <div
              key={ann.id}
              className={`bg-white rounded-xl border p-5 transition-shadow shadow-xs hover:shadow-md ${
                ann.priority === 'Emergency'
                  ? 'border-rose-300 bg-rose-50/20'
                  : ann.priority === 'Urgent'
                  ? 'border-amber-300 bg-amber-50/20'
                  : 'border-slate-200'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1.5 flex-1">
                  <div className="flex items-center gap-2 text-xs">
                    <span
                      className={`font-semibold ${
                        ann.priority === 'Emergency'
                          ? 'text-rose-700'
                          : ann.priority === 'Urgent'
                          ? 'text-amber-700'
                          : 'text-slate-600'
                      }`}
                    >
                      {ann.priority} Priority
                    </span>
                    <span aria-hidden="true" className="text-slate-300">
                      ·
                    </span>
                    <span className="text-slate-500 capitalize">Audience: {ann.targetAudience}</span>
                    <span aria-hidden="true" className="text-slate-300">
                      ·
                    </span>
                    <span className="text-slate-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      <span>{new Date(ann.createdAt).toLocaleDateString()}</span>
                    </span>
                  </div>

                  <h3 className="text-base font-bold text-slate-900">{ann.title}</h3>
                  <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">
                    {ann.content}
                  </p>

                  <div className="pt-2 text-[11px] text-slate-400">
                    Published by <span className="font-medium text-slate-600">{ann.createdBy.name}</span>
                  </div>
                </div>

                {user?.role === 'admin' && (
                  <button
                    onClick={() => handleDelete(ann.id)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
                    title="Delete notice"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Broadcast Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
              <Megaphone className="w-5 h-5 text-indigo-700" />
              <span>Broadcast Campus Announcement</span>
            </h3>

            {error && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-xs text-rose-800 rounded-lg">
                {error}
              </div>
            )}

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Notice Headline *
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Scheduled Substation Maintenance"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Priority Level</label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs"
                  >
                    <option value="Normal">Normal</option>
                    <option value="Urgent">Urgent</option>
                    <option value="Emergency">Emergency</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Target Group</label>
                  <select
                    value={targetAudience}
                    onChange={(e) => setTargetAudience(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs"
                  >
                    <option value="all">All Campus Community</option>
                    <option value="student">Students Only</option>
                    <option value="faculty">Faculty Members Only</option>
                    <option value="staff">Staff Only</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Notice Details *</label>
                <textarea
                  rows={4}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Detail timing, affected blocks/hostels, and alternative arrangements..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm"
                  required
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPublishing}
                  className="px-4 py-2 bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-semibold rounded-lg shadow-xs disabled:opacity-60"
                >
                  {isPublishing ? 'Broadcasting...' : 'Publish Announcement'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
