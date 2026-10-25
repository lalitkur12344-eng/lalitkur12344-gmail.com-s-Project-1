import React, { useState } from 'react';
import { Complaint, User } from '../types';
import { api } from '../services/api';
import {
  X,
  MapPin,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Wrench,
  ShieldAlert,
  Send,
  Star,
  Sparkles,
  UserCheck,
  RotateCcw,
  MessageSquare,
  FileCheck,
} from 'lucide-react';

interface ComplaintDetailsModalProps {
  complaint: Complaint;
  currentUser: User;
  onClose: () => void;
  onUpdate: (updated: Complaint) => void;
  allStaffUsers?: User[];
}

export const ComplaintDetailsModal: React.FC<ComplaintDetailsModalProps> = ({
  complaint,
  currentUser,
  onClose,
  onUpdate,
  allStaffUsers = [],
}) => {
  const [activeTab, setActiveTab] = useState<'details' | 'timeline' | 'action'>('details');

  // Status update
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  // Add note
  const [noteText, setNoteText] = useState('');
  const [isAddingNote, setIsAddingNote] = useState(false);

  // Reassignment (Admin/HOD)
  const [selectedStaffId, setSelectedStaffId] = useState(complaint.assignedTo?.id || '');
  const [reassignReason, setReassignReason] = useState('');
  const [isReassigning, setIsReassigning] = useState(false);

  // Feedback (Student)
  const [rating, setRating] = useState<number>(5);
  const [feedbackComment, setFeedbackComment] = useState('');
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);

  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isOwner = complaint.createdBy.id === currentUser.id;
  const isAdmin = currentUser.role === 'admin';
  const isStaff = currentUser.role === 'staff';
  const isAssignedStaff = complaint.assignedTo?.id === currentUser.id;

  const handleStatusChange = async (newStatus: string) => {
    setIsUpdatingStatus(true);
    setError(null);
    try {
      const res = await api.complaints.updateStatus(complaint.id, newStatus, resolutionNotes);
      setActionMessage(`Status updated to ${newStatus}`);
      onUpdate(res.complaint);
      setResolutionNotes('');
    } catch (err: any) {
      setError(err.message || 'Failed to update status.');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteText.trim()) return;

    setIsAddingNote(true);
    setError(null);
    try {
      const res = await api.complaints.addNote(complaint.id, noteText.trim());
      setActionMessage('Progress note added to timeline.');
      onUpdate(res.complaint);
      setNoteText('');
    } catch (err: any) {
      setError(err.message || 'Failed to add note.');
    } finally {
      setIsAddingNote(false);
    }
  };

  const handleReassign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStaffId) return;

    setIsReassigning(true);
    setError(null);
    try {
      const res = await api.complaints.reassign(complaint.id, selectedStaffId, undefined, reassignReason);
      setActionMessage('Complaint reassigned successfully.');
      onUpdate(res.complaint);
      setReassignReason('');
    } catch (err: any) {
      setError(err.message || 'Failed to reassign complaint.');
    } finally {
      setIsReassigning(false);
    }
  };

  const handleSubmitFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingFeedback(true);
    setError(null);
    try {
      const res = await api.complaints.submitFeedback(complaint.id, rating, feedbackComment);
      setActionMessage('Thank you! Your feedback has been recorded and ticket closed.');
      onUpdate(res.complaint);
    } catch (err: any) {
      setError(err.message || 'Failed to submit feedback.');
    } finally {
      setIsSubmittingFeedback(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-3xl w-full my-8 shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <span className="font-mono font-bold text-sm bg-slate-800 text-indigo-300 px-2.5 py-1 rounded-md border border-slate-700">
              {complaint.complaintId}
            </span>
            <div>
              <h2 className="text-base font-bold text-white line-clamp-1">{complaint.title}</h2>
              <div className="flex items-center gap-2 text-xs text-slate-300">
                <span>{complaint.category}</span>
                <span aria-hidden="true">·</span>
                <span>{complaint.assignedDepartment}</span>
                <span aria-hidden="true">·</span>
                <span className="text-indigo-300 font-medium">Status: {complaint.status}</span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors focus:outline-hidden"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Controls */}
        <div className="flex items-center gap-2 px-6 pt-3 border-b border-slate-200 bg-slate-50 shrink-0">
          <button
            onClick={() => setActiveTab('details')}
            className={`px-3 py-2 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === 'details'
                ? 'border-indigo-600 text-indigo-900'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            Complaint Overview
          </button>
          <button
            onClick={() => setActiveTab('timeline')}
            className={`px-3 py-2 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === 'timeline'
                ? 'border-indigo-600 text-indigo-900'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            Audit History &amp; Timeline ({complaint.history?.length || 0})
          </button>
          {(isAdmin || isStaff || (isOwner && complaint.status === 'Resolved')) && (
            <button
              onClick={() => setActiveTab('action')}
              className={`px-3 py-2 text-xs font-semibold border-b-2 transition-colors ${
                activeTab === 'action'
                  ? 'border-indigo-600 text-indigo-900'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`}
            >
              Take Action / Resolution
            </button>
          )}
        </div>

        {/* Messages */}
        {actionMessage && (
          <div className="mx-6 mt-4 p-3 bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 rounded-lg flex items-center justify-between">
            <span className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{actionMessage}</span>
            </span>
            <button onClick={() => setActionMessage(null)} className="text-emerald-600 hover:text-emerald-800">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {error && (
          <div className="mx-6 mt-4 p-3 bg-rose-50 border border-rose-200 text-xs text-rose-800 rounded-lg flex items-center justify-between">
            <span className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{error}</span>
            </span>
            <button onClick={() => setError(null)} className="text-rose-600 hover:text-rose-800">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {activeTab === 'details' && (
            <>
              {/* Escalation Alert */}
              {complaint.isEscalated && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-900 space-y-1">
                  <div className="font-bold flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4 text-rose-600" />
                    <span>SLA Escalation Flagged</span>
                  </div>
                  <p className="text-rose-800 leading-relaxed">
                    {complaint.escalationReason || 'Overdue beyond resolution deadline.'}
                  </p>
                </div>
              )}

              {/* Location & Meta Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1">
                  <div className="font-bold text-slate-800 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-indigo-700" />
                    <span>Campus Location</span>
                  </div>
                  <div className="text-slate-900 font-semibold">{complaint.location.block}</div>
                  <div className="text-slate-600">
                    {complaint.location.room} · {complaint.location.area}
                  </div>
                  {complaint.location.landmark && (
                    <div className="text-slate-500 text-[11px]">Landmark: {complaint.location.landmark}</div>
                  )}
                </div>

                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1">
                  <div className="font-bold text-slate-800 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-indigo-700" />
                    <span>SLA &amp; Assignment</span>
                  </div>
                  <div className="text-slate-900 font-semibold">
                    Assigned: {complaint.assignedTo ? complaint.assignedTo.name : 'Unassigned'}
                  </div>
                  <div className="text-slate-600">
                    SLA Window: {complaint.slaHours} hours · Priority: {complaint.priority}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Deadline:{' '}
                    {complaint.slaDeadline ? new Date(complaint.slaDeadline).toLocaleString() : 'N/A'}
                  </div>
                </div>
              </div>

              {/* Detailed Description */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                  Problem Description
                </h4>
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
                  {complaint.description}
                </div>
              </div>

              {/* Evidence Images */}
              {complaint.evidenceImages && complaint.evidenceImages.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                    Evidence Photos ({complaint.evidenceImages.length})
                  </h4>
                  <div className="flex flex-wrap gap-3">
                    {complaint.evidenceImages.map((img, idx) => (
                      <a
                        key={idx}
                        href={img}
                        target="_blank"
                        rel="noreferrer"
                        className="w-28 h-28 rounded-lg border border-slate-300 overflow-hidden hover:opacity-90 transition-opacity"
                      >
                        <img src={img} alt={`Evidence ${idx + 1}`} className="w-full h-full object-cover" />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* AI Diagnostic Assistance */}
              {(complaint.aiSummary || (complaint.aiSuggestedChecklist && complaint.aiSuggestedChecklist.length > 0)) && (
                <div className="p-4 bg-indigo-50/60 border border-indigo-200 rounded-lg text-xs space-y-2.5">
                  <div className="font-bold text-indigo-950 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-indigo-600" />
                    <span>AI Diagnostic &amp; SOP Recommendations</span>
                  </div>
                  {complaint.aiSummary && (
                    <p className="text-slate-700 italic">"{complaint.aiSummary}"</p>
                  )}
                  {complaint.aiSuggestedChecklist && complaint.aiSuggestedChecklist.length > 0 && (
                    <div>
                      <div className="font-semibold text-slate-800 mb-1">Standard Resolution Steps:</div>
                      <ul className="space-y-1 list-disc list-inside text-slate-600">
                        {complaint.aiSuggestedChecklist.map((step, idx) => (
                          <li key={idx}>{step}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Existing Resolution / Feedback Notes */}
              {complaint.resolutionNotes && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-xs space-y-1">
                  <div className="font-bold text-emerald-950 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Resolution Summary</span>
                  </div>
                  <p className="text-emerald-900 leading-relaxed">{complaint.resolutionNotes}</p>
                </div>
              )}

              {complaint.feedback && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-xs space-y-1">
                  <div className="font-bold text-amber-950 flex items-center gap-1.5">
                    <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                    <span>Student Resolution Feedback: {complaint.feedback.rating}/5 Stars</span>
                  </div>
                  {complaint.feedback.comments && (
                    <p className="text-amber-900 leading-relaxed italic">"{complaint.feedback.comments}"</p>
                  )}
                </div>
              )}
            </>
          )}

          {activeTab === 'timeline' && (
            <div className="space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                Full Immutable Activity Log
              </h4>

              <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                {complaint.history?.map((item, idx) => (
                  <div key={idx} className="relative">
                    <div className="absolute -left-6 top-1 w-2.5 h-2.5 rounded-full bg-indigo-600 ring-4 ring-white" />
                    <div className="text-xs">
                      <div className="flex items-center gap-2 font-semibold text-slate-900">
                        <span>{item.action}</span>
                        <span aria-hidden="true" className="text-slate-300">
                          ·
                        </span>
                        <span className="text-slate-500 font-normal">
                          by {item.actor.name} ({item.actor.role})
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {new Date(item.timestamp).toLocaleString()}
                      </div>
                      {item.notes && (
                        <div className="mt-1 p-2 bg-slate-50 border border-slate-200 rounded-md text-slate-700 text-xs">
                          {item.notes}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Add Progress Note Form */}
              <form onSubmit={handleAddNote} className="mt-6 pt-4 border-t border-slate-200 flex gap-2">
                <input
                  type="text"
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="Append official progress update / technician observation..."
                  className="flex-1 px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:bg-white focus:outline-hidden focus:border-indigo-600"
                />
                <button
                  type="submit"
                  disabled={isAddingNote || !noteText.trim()}
                  className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold disabled:opacity-50 flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Add Note</span>
                </button>
              </form>
            </div>
          )}

          {activeTab === 'action' && (
            <div className="space-y-6">
              {/* Staff / Admin Status Actions */}
              {(isAdmin || isStaff) && (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Update Complaint Status
                  </h4>

                  <div className="flex flex-wrap gap-2">
                    {complaint.status !== 'In Progress' && complaint.status !== 'Resolved' && (
                      <button
                        onClick={() => handleStatusChange('In Progress')}
                        disabled={isUpdatingStatus}
                        className="px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold rounded-lg shadow-xs flex items-center gap-1.5"
                      >
                        <Wrench className="w-3.5 h-3.5" />
                        <span>Start Work (In Progress)</span>
                      </button>
                    )}

                    {complaint.status !== 'Resolved' && (
                      <div className="w-full mt-2 space-y-2">
                        <label className="block text-xs font-semibold text-slate-700">
                          Resolution Notes &amp; Action Taken:
                        </label>
                        <textarea
                          rows={2}
                          value={resolutionNotes}
                          onChange={(e) => setResolutionNotes(e.target.value)}
                          placeholder="e.g. Repaired switchboard, replaced 16A MCB, tested circuit load."
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                        />
                        <button
                          onClick={() => handleStatusChange('Resolved')}
                          disabled={isUpdatingStatus}
                          className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold rounded-lg shadow-xs flex items-center gap-1.5"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Mark as Resolved</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Admin Staff Reassignment */}
              {isAdmin && (
                <form onSubmit={handleReassign} className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Reassign Technician / Staff Member
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Select Staff Member:
                      </label>
                      <select
                        value={selectedStaffId}
                        onChange={(e) => setSelectedStaffId(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                      >
                        <option value="">-- Choose Staff --</option>
                        {allStaffUsers.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} ({s.department})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Reassignment Reason:
                      </label>
                      <input
                        type="text"
                        value={reassignReason}
                        onChange={(e) => setReassignReason(e.target.value)}
                        placeholder="e.g. Workload balance or specialist expertise"
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isReassigning || !selectedStaffId}
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg shadow-xs flex items-center gap-1.5"
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                    <span>Confirm Reassignment</span>
                  </button>
                </form>
              )}

              {/* Student Feedback & Reopening (when Resolved) */}
              {isOwner && complaint.status === 'Resolved' && !complaint.feedback && (
                <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-lg space-y-4">
                  <div>
                    <h4 className="text-xs font-bold text-indigo-950 uppercase tracking-wider">
                      Student Satisfaction Rating &amp; Feedback
                    </h4>
                    <p className="text-xs text-indigo-800 mt-0.5">
                      Your complaint was marked resolved by the department. Please rate the quality of service.
                    </p>
                  </div>

                  <form onSubmit={handleSubmitFeedback} className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Rating (1 to 5 Stars):
                      </label>
                      <div className="flex items-center gap-2">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <button
                            key={star}
                            type="button"
                            onClick={() => setRating(star)}
                            className="p-1 focus:outline-hidden"
                          >
                            <Star
                              className={`w-6 h-6 ${
                                star <= rating
                                  ? 'text-amber-500 fill-amber-500'
                                  : 'text-slate-300'
                              } transition-colors`}
                            />
                          </button>
                        ))}
                        <span className="text-xs font-bold text-slate-700 ml-2">{rating} out of 5</span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Comments / Experience:
                      </label>
                      <textarea
                        rows={2}
                        value={feedbackComment}
                        onChange={(e) => setFeedbackComment(e.target.value)}
                        placeholder="Was the problem completely fixed? Did the technician arrive promptly?"
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                      />
                    </div>

                    <div className="flex items-center gap-3 pt-1">
                      <button
                        type="submit"
                        disabled={isSubmittingFeedback}
                        className="px-4 py-2 bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-semibold rounded-lg shadow-xs flex items-center gap-1.5"
                      >
                        <FileCheck className="w-3.5 h-3.5" />
                        <span>Submit Feedback &amp; Close Ticket</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleStatusChange('Reopened')}
                        className="px-3.5 py-2 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg flex items-center gap-1.5"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Issue Persists (Reopen Ticket)</span>
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
