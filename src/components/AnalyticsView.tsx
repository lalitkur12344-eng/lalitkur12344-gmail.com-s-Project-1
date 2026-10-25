import React, { useState, useEffect } from 'react';
import { AnalyticsData } from '../types';
import { api } from '../services/api';
import {
  BarChart3,
  Clock,
  ShieldCheck,
  Star,
  AlertTriangle,
  CheckCircle2,
  Users,
  Building,
  RefreshCw,
} from 'lucide-react';

export const AnalyticsView: React.FC = () => {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      const res = await api.analytics.get();
      setData(res);
    } catch (err: any) {
      console.error('Failed to load analytics:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnalytics();
  }, []);

  if (loading || !data) {
    return (
      <div className="py-20 text-center text-slate-400 text-xs">
        <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
        <span>Aggregating real-time campus metrics from database...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-indigo-700" />
            <span>Campus Care Intelligence &amp; SLA Compliance</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Rajkiya Engineering College, Bijnor · Live Operational Analytics
          </p>
        </div>

        <button
          onClick={loadAnalytics}
          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg flex items-center gap-1.5 self-start sm:self-auto transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh Live Data</span>
        </button>
      </div>

      {/* KPI Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Filed</div>
          <div className="text-2xl font-black text-slate-900 mt-1">{data.total}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">All campus tickets</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-blue-200 bg-blue-50/20 shadow-xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-blue-700">In Progress</div>
          <div className="text-2xl font-black text-blue-900 mt-1">{data.inProgress}</div>
          <div className="text-[10px] text-blue-600 mt-0.5">Assigned to technicians</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-emerald-200 bg-emerald-50/20 shadow-xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">Resolved</div>
          <div className="text-2xl font-black text-emerald-900 mt-1">{data.resolved + data.closed}</div>
          <div className="text-[10px] text-emerald-600 mt-0.5">Successful resolutions</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-rose-200 bg-rose-50/20 shadow-xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-rose-700">Overdue / SLA Alert</div>
          <div className="text-2xl font-black text-rose-900 mt-1">{data.escalated}</div>
          <div className="text-[10px] text-rose-600 mt-0.5">Escalated to HOD/Dean</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-indigo-200 bg-indigo-50/20 shadow-xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-indigo-700">SLA Compliance</div>
          <div className="text-2xl font-black text-indigo-900 mt-1">{data.slaComplianceRate}%</div>
          <div className="text-[10px] text-indigo-600 mt-0.5">Within deadline target</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-amber-200 bg-amber-50/20 shadow-xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-amber-700">Satisfaction</div>
          <div className="text-2xl font-black text-amber-900 mt-1 flex items-baseline gap-1">
            <span>{data.avgSatisfaction || 5.0}</span>
            <span className="text-xs text-amber-600 font-semibold">★</span>
          </div>
          <div className="text-[10px] text-amber-600 mt-0.5">{data.feedbackCount} student reviews</div>
        </div>
      </div>

      {/* Breakdowns Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Category Breakdown */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-900 text-sm">Complaints by Service Category</h3>
            <span className="text-xs text-slate-400 font-medium">Distribution</span>
          </div>

          <div className="space-y-3">
            {Object.entries(data.categoryCounts).map(([cat, count]) => {
              const pct = data.total > 0 ? Math.round((count / data.total) * 100) : 0;
              return (
                <div key={cat} className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                    <span>{cat}</span>
                    <span className="text-slate-500 font-normal">
                      {count} ({pct}%)
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-indigo-600 h-2 rounded-full transition-all duration-500"
                      style={{ width: `${Math.max(pct, 4)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Department Performance */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-900 text-sm">Department Workload Allocation</h3>
            <span className="text-xs text-slate-400 font-medium">Departments: {data.departmentCount}</span>
          </div>

          <div className="space-y-3">
            {Object.entries(data.departmentCounts).map(([dept, count]) => {
              const pct = data.total > 0 ? Math.round((count / data.total) * 100) : 0;
              return (
                <div key={dept} className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                    <span>{dept}</span>
                    <span className="text-slate-500 font-normal">
                      {count} tickets ({pct}%)
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-emerald-600 h-2 rounded-full transition-all duration-500"
                      style={{ width: `${Math.max(pct, 4)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Staff Workload Table */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
        <h3 className="font-bold text-slate-900 text-sm">Technician &amp; Staff Workload Distribution</h3>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                <th className="py-2.5 px-3">Staff Name</th>
                <th className="py-2.5 px-3">Department</th>
                <th className="py-2.5 px-3">Active Tickets</th>
                <th className="py-2.5 px-3">Resolved</th>
                <th className="py-2.5 px-3">Total Assigned</th>
                <th className="py-2.5 px-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {data.staffWorkload.map((staff) => (
                <tr key={staff.staffId} className="hover:bg-slate-50">
                  <td className="py-3 px-3 font-semibold text-slate-900">{staff.name}</td>
                  <td className="py-3 px-3">{staff.department}</td>
                  <td className="py-3 px-3 font-bold text-blue-700">{staff.activeWorkload}</td>
                  <td className="py-3 px-3 font-medium text-emerald-700">{staff.totalResolved}</td>
                  <td className="py-3 px-3 font-mono">{staff.totalAssigned}</td>
                  <td className="py-3 px-3">
                    {staff.activeWorkload > 3 ? (
                      <span className="text-amber-700 font-semibold text-[11px]">High Load</span>
                    ) : (
                      <span className="text-emerald-700 font-semibold text-[11px]">Available</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
