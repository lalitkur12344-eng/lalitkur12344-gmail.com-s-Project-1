import React from 'react';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard,
  PlusCircle,
  FileText,
  CheckSquare,
  BarChart3,
  Megaphone,
  Users,
  Building2,
  ShieldAlert,
  Info,
  Sparkles,
} from 'lucide-react';

export type NavTab =
  | 'dashboard'
  | 'new-complaint'
  | 'my-complaints'
  | 'staff-tasks'
  | 'announcements'
  | 'analytics'
  | 'admin-users'
  | 'admin-departments'
  | 'admin-logs';

interface SidebarProps {
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;
  closeMobileMenu?: () => void;
  onOpenChat?: () => void;
  stats?: {
    total: number;
    assignedToMe: number;
    pending: number;
  };
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  closeMobileMenu,
  onOpenChat,
  stats,
}) => {
  const { user } = useAuth();
  if (!user) return null;

  const handleSelect = (tab: NavTab) => {
    setActiveTab(tab);
    if (closeMobileMenu) closeMobileMenu();
  };

  const navItemClass = (tab: NavTab) =>
    `w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-500 ${
      activeTab === tab
        ? 'bg-indigo-50 text-indigo-950 font-semibold'
        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
    }`;

  return (
    <aside className="w-full md:w-64 bg-white md:bg-transparent md:border-r border-slate-200 p-4 space-y-6 shrink-0">
      {/* Primary Section */}
      <div>
        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 px-3 mb-2">
          Complaints & Services
        </div>
        <nav className="space-y-1">
          <button onClick={() => handleSelect('dashboard')} className={navItemClass('dashboard')}>
            <span className="flex items-center gap-2.5">
              <LayoutDashboard className="w-4 h-4 text-slate-500" />
              <span>Campus Complaints</span>
            </span>
          </button>

          <button onClick={() => handleSelect('new-complaint')} className={navItemClass('new-complaint')}>
            <span className="flex items-center gap-2.5">
              <PlusCircle className="w-4 h-4 text-indigo-600" />
              <span>Register Complaint</span>
            </span>
          </button>

          {(user.role === 'student' || user.role === 'faculty') && (
            <button onClick={() => handleSelect('my-complaints')} className={navItemClass('my-complaints')}>
              <span className="flex items-center gap-2.5">
                <FileText className="w-4 h-4 text-slate-500" />
                <span>My Complaints</span>
              </span>
            </button>
          )}

          {user.role === 'staff' && (
            <button onClick={() => handleSelect('staff-tasks')} className={navItemClass('staff-tasks')}>
              <span className="flex items-center gap-2.5">
                <CheckSquare className="w-4 h-4 text-blue-600" />
                <span>My Assigned Work</span>
              </span>
              {stats && stats.assignedToMe > 0 && (
                <span className="text-xs font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-md">
                  {stats.assignedToMe}
                </span>
              )}
            </button>
          )}
        </nav>
      </div>

      {/* Campus Info & Intelligence */}
      <div>
        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 px-3 mb-2">
          Campus Information
        </div>
        <nav className="space-y-1">
          <button onClick={() => handleSelect('announcements')} className={navItemClass('announcements')}>
            <span className="flex items-center gap-2.5">
              <Megaphone className="w-4 h-4 text-slate-500" />
              <span>Announcements</span>
            </span>
          </button>

          {(user.role === 'admin' || user.role === 'staff' || user.role === 'faculty') && (
            <button onClick={() => handleSelect('analytics')} className={navItemClass('analytics')}>
              <span className="flex items-center gap-2.5">
                <BarChart3 className="w-4 h-4 text-slate-500" />
                <span>Analytics & SLA</span>
              </span>
            </button>
          )}

          {onOpenChat && (
            <button
              onClick={() => {
                onOpenChat();
                if (closeMobileMenu) closeMobileMenu();
              }}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors bg-indigo-50/60 text-indigo-900 hover:bg-indigo-100/80 border border-indigo-200/50 mt-1"
            >
              <span className="flex items-center gap-2.5">
                <Sparkles className="w-4 h-4 text-indigo-600" />
                <span>AI Campus Assistant</span>
              </span>
              <span className="text-[10px] font-mono font-bold bg-indigo-200 text-indigo-900 px-1.5 py-0.2 rounded-xs">
                Gemini
              </span>
            </button>
          )}
        </nav>
      </div>

      {/* Admin Operations Section */}
      {user.role === 'admin' && (
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 px-3 mb-2">
            Administration
          </div>
          <nav className="space-y-1">
            <button onClick={() => handleSelect('admin-users')} className={navItemClass('admin-users')}>
              <span className="flex items-center gap-2.5">
                <Users className="w-4 h-4 text-slate-500" />
                <span>User Accounts</span>
              </span>
            </button>

            <button
              onClick={() => handleSelect('admin-departments')}
              className={navItemClass('admin-departments')}
            >
              <span className="flex items-center gap-2.5">
                <Building2 className="w-4 h-4 text-slate-500" />
                <span>Departments & SLA</span>
              </span>
            </button>

            <button onClick={() => handleSelect('admin-logs')} className={navItemClass('admin-logs')}>
              <span className="flex items-center gap-2.5">
                <ShieldAlert className="w-4 h-4 text-slate-500" />
                <span>Security Audit Logs</span>
              </span>
            </button>
          </nav>
        </div>
      )}

      {/* College Info Card */}
      <div className="p-3 bg-slate-100 border border-slate-200 rounded-lg text-xs text-slate-600">
        <div className="font-semibold text-slate-900 flex items-center gap-1.5 mb-1">
          <Info className="w-3.5 h-3.5 text-indigo-700" />
          <span>REC Bijnor Helpdesk</span>
        </div>
        <p className="text-[11px] text-slate-500 leading-relaxed">
          Emergency substation or water line repairs? Contact Estate Control: 01342-241001.
        </p>
      </div>
    </aside>
  );
};
