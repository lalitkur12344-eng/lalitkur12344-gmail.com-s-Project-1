import React from 'react';
import { Complaint } from '../types';
import { ComplaintCard } from './ComplaintCard';
import { Wrench, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';

interface StaffWorkloadViewProps {
  complaints: Complaint[];
  onSelectComplaint: (complaint: Complaint) => void;
  staffName: string;
  department?: string;
}

export const StaffWorkloadView: React.FC<StaffWorkloadViewProps> = ({
  complaints,
  onSelectComplaint,
  staffName,
  department,
}) => {
  const activeTasks = complaints.filter(
    (c) => c.status === 'Assigned' || c.status === 'In Progress'
  );
  const inProgressTasks = complaints.filter((c) => c.status === 'In Progress');
  const resolvedTasks = complaints.filter((c) => c.status === 'Resolved' || c.status === 'Closed');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Wrench className="w-5 h-5 text-blue-600" />
            <span>Assigned Technical Work Orders</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Logged in as <span className="font-semibold text-slate-800">{staffName}</span> · Department:{' '}
            <span className="font-semibold text-indigo-700">{department || 'General'}</span>
          </p>
        </div>

        {/* Quick Workload Stats */}
        <div className="flex items-center gap-3">
          <div className="px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg text-center">
            <div className="text-[10px] text-blue-700 font-semibold uppercase">Active</div>
            <div className="text-base font-bold text-blue-900">{activeTasks.length}</div>
          </div>
          <div className="px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg text-center">
            <div className="text-[10px] text-amber-700 font-semibold uppercase">In Progress</div>
            <div className="text-base font-bold text-amber-900">{inProgressTasks.length}</div>
          </div>
          <div className="px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg text-center">
            <div className="text-[10px] text-emerald-700 font-semibold uppercase">Resolved</div>
            <div className="text-base font-bold text-emerald-900">{resolvedTasks.length}</div>
          </div>
        </div>
      </div>

      {/* Task List */}
      <div className="space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
          Your Duty Queue ({complaints.length} tickets)
        </h3>

        {complaints.length === 0 ? (
          <div className="bg-white p-12 text-center rounded-xl border border-slate-200 text-slate-500 text-xs">
            <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
            <p className="font-semibold text-slate-800">Queue Clear</p>
            <p className="text-slate-400 mt-0.5">
              No tasks currently assigned to you. New tickets in your department will appear here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {complaints.map((c) => (
              <ComplaintCard
                key={c.id}
                complaint={c}
                onClick={() => onSelectComplaint(c)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
