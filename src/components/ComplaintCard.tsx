import React from 'react';
import { Complaint } from '../types';
import {
  Clock,
  MapPin,
  AlertTriangle,
  CheckCircle2,
  Hourglass,
  Wrench,
  ChevronRight,
  MessageSquare,
  ShieldAlert,
} from 'lucide-react';

interface ComplaintCardProps {
  complaint: Complaint;
  onClick: () => void;
}

export const ComplaintCard: React.FC<ComplaintCardProps> = ({ complaint, onClick }) => {
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Resolved':
      case 'Closed':
        return <CheckCircle2 className="w-4 h-4 text-emerald-600" />;
      case 'In Progress':
        return <Wrench className="w-4 h-4 text-blue-600" />;
      case 'Assigned':
        return <Hourglass className="w-4 h-4 text-indigo-600" />;
      default:
        return <Clock className="w-4 h-4 text-amber-600" />;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'Emergency':
        return 'text-rose-700 font-bold';
      case 'High':
        return 'text-amber-700 font-semibold';
      case 'Medium':
        return 'text-slate-700 font-medium';
      default:
        return 'text-slate-500 font-normal';
    }
  };

  // Format relative time
  const formatTimeAgo = (dateStr: string) => {
    const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  const isOverdue =
    (complaint.status === 'Pending' || complaint.status === 'Assigned' || complaint.status === 'In Progress') &&
    complaint.slaDeadline &&
    new Date() > new Date(complaint.slaDeadline);

  return (
    <div
      onClick={onClick}
      className={`bg-white border rounded-xl p-4 sm:p-5 transition-all cursor-pointer hover:shadow-md hover:border-indigo-300 relative group ${
        complaint.isEscalated
          ? 'border-rose-300 bg-rose-50/20'
          : 'border-slate-200'
      }`}
    >
      {/* Header: Complaint ID & Status */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 text-xs text-slate-500 font-mono">
          <span className="font-bold text-slate-900">{complaint.complaintId}</span>
          <span aria-hidden="true">·</span>
          <span>{formatTimeAgo(complaint.createdAt)}</span>
        </div>

        <div className="flex items-center gap-1.5 text-xs font-semibold">
          {getStatusIcon(complaint.status)}
          <span
            className={
              complaint.status === 'Resolved' || complaint.status === 'Closed'
                ? 'text-emerald-700'
                : complaint.status === 'In Progress'
                ? 'text-blue-700'
                : 'text-slate-700'
            }
          >
            {complaint.status}
          </span>
        </div>
      </div>

      {/* Title */}
      <h3 className="text-sm sm:text-base font-bold text-slate-900 group-hover:text-indigo-900 transition-colors line-clamp-1 mb-1.5">
        {complaint.title}
      </h3>

      {/* Description Snippet */}
      <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed mb-3">
        {complaint.description}
      </p>

      {/* Escalation Warning (if applicable) */}
      {complaint.isEscalated && (
        <div className="mb-3 px-2.5 py-1.5 bg-rose-100/70 border border-rose-200 rounded-md flex items-center gap-2 text-xs text-rose-900 font-medium">
          <ShieldAlert className="w-3.5 h-3.5 text-rose-600 shrink-0" />
          <span>SLA Breached · Escalated to Deanery Administration</span>
        </div>
      )}

      {/* Clean Unboxed Metadata Line with typographic separators */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 border-t border-slate-100 pt-3">
        <span className="font-medium text-slate-800">{complaint.category}</span>
        <span aria-hidden="true">·</span>
        <span className={getPriorityColor(complaint.priority)}>{complaint.priority}</span>
        <span aria-hidden="true">·</span>
        <span className="flex items-center gap-1 text-slate-600 truncate max-w-[180px]">
          <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
          <span>{complaint.location.block || complaint.location.area}</span>
        </span>
        <span aria-hidden="true">·</span>
        <span className="text-slate-600">
          {complaint.assignedTo ? (
            <span className="truncate max-w-[140px]">Tech: {complaint.assignedTo.name.split(' ')[0]}</span>
          ) : (
            <span className="text-amber-700 font-medium">Unassigned</span>
          )}
        </span>

        {complaint.feedback && (
          <>
            <span aria-hidden="true">·</span>
            <span className="text-amber-600 font-semibold flex items-center gap-0.5">
              ★ {complaint.feedback.rating}/5
            </span>
          </>
        )}

        <div className="ml-auto flex items-center text-indigo-600 font-semibold group-hover:translate-x-0.5 transition-transform">
          <span className="hidden sm:inline text-xs mr-0.5">View details</span>
          <ChevronRight className="w-4 h-4" />
        </div>
      </div>
    </div>
  );
};
