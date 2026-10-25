import React, { useState, useEffect, useCallback } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoginPage } from './components/LoginPage';
import { Navbar } from './components/Navbar';
import { Sidebar, NavTab } from './components/Sidebar';
import { ComplaintCard } from './components/ComplaintCard';
import { ComplaintForm } from './components/ComplaintForm';
import { ComplaintDetailsModal } from './components/ComplaintDetailsModal';
import { NotificationsDrawer } from './components/NotificationsDrawer';
import { ProfileModal } from './components/ProfileModal';
import { AnnouncementsView } from './components/AnnouncementsView';
import { AnalyticsView } from './components/AnalyticsView';
import { AdminUsersView } from './components/AdminUsersView';
import { AdminDepartmentsView } from './components/AdminDepartmentsView';
import { AdminAuditLogsView } from './components/AdminAuditLogsView';
import { StaffWorkloadView } from './components/StaffWorkloadView';
import { GeminiChatbot } from './components/GeminiChatbot';
import { Complaint, User, NotificationItem } from './types';
import { api } from './services/api';
import {
  Search,
  Filter,
  Plus,
  RefreshCw,
  AlertCircle,
  Inbox,
  CheckCircle2,
  Clock,
  Sparkles,
} from 'lucide-react';

const CATEGORIES = [
  'All',
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

const STATUS_FILTERS = ['all', 'Pending', 'Assigned', 'In Progress', 'Resolved', 'Closed'];

function MainApp() {
  const { user, loading: authLoading } = useAuth();

  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Complaints state
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loadingComplaints, setLoadingComplaints] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('all');

  // Selected complaint modal
  const [selectedComplaint, setSelectedComplaint] = useState<Complaint | null>(null);

  // Notifications
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  // Profile modal
  const [profileOpen, setProfileOpen] = useState(false);

  // Gemini Chatbot modal
  const [chatOpen, setChatOpen] = useState(false);
  const [prefillData, setPrefillData] = useState<{ title: string; description: string } | null>(null);

  // Staff users (for admin reassignments)
  const [allStaff, setAllStaff] = useState<User[]>([]);

  // Banner message
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);

  // Load complaints
  const loadComplaints = useCallback(async () => {
    if (!user) return;
    setLoadingComplaints(true);
    try {
      const filters: any = {};
      if (categoryFilter !== 'All') filters.category = categoryFilter;
      if (statusFilter !== 'all') filters.status = statusFilter;
      if (searchQuery.trim()) filters.search = searchQuery.trim();
      if (activeTab === 'staff-tasks') filters.assignedToMe = true;

      const res = await api.complaints.list(filters);
      setComplaints(res.complaints || []);
    } catch (err: any) {
      console.error('Error fetching complaints:', err);
    } finally {
      setLoadingComplaints(false);
    }
  }, [user, categoryFilter, statusFilter, searchQuery, activeTab]);

  // Load notifications
  const loadNotifications = useCallback(async () => {
    if (!user) return;
    try {
      const res = await api.notifications.list();
      setNotifications(res.notifications || []);
      setUnreadCount(res.unreadCount || 0);
    } catch (err) {
      console.warn('Notifications fetch error:', err);
    }
  }, [user]);

  // Load staff list
  const loadStaffUsers = useCallback(async () => {
    if (user?.role === 'admin') {
      try {
        const res = await api.admin.getUsers();
        setAllStaff((res.users || []).filter((u) => u.role === 'staff'));
      } catch (err) {
        console.warn('Error loading staff list:', err);
      }
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      loadComplaints();
      loadNotifications();
      loadStaffUsers();

      // Poll notifications every 30 seconds
      const timer = setInterval(() => {
        loadNotifications();
      }, 30000);
      return () => clearInterval(timer);
    }
  }, [user, loadComplaints, loadNotifications, loadStaffUsers]);

  // Mark notification read
  const handleMarkNotificationRead = async (id: string) => {
    try {
      await api.notifications.markRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      );
      setUnreadCount((prev) => Math.max(prev - 1, 0));
    } catch (err) {
      console.error('Error marking read:', err);
    }
  };

  const handleMarkAllNotificationsRead = async () => {
    try {
      await api.notifications.markAllRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Error marking all read:', err);
    }
  };

  // Open complaint by ID (e.g. from notification)
  const handleOpenComplaintById = async (id: string) => {
    try {
      const res = await api.complaints.getById(id);
      setSelectedComplaint(res.complaint);
      setNotificationsOpen(false);
    } catch (err) {
      console.error('Failed to open complaint:', err);
    }
  };

  const handleComplaintSubmitted = (newComplaint: Complaint) => {
    setBannerMessage(`Complaint #${newComplaint.complaintId} has been successfully registered and queued.`);
    setActiveTab('dashboard');
    loadComplaints();
    loadNotifications();
  };

  const handleComplaintUpdated = (updated: Complaint) => {
    setSelectedComplaint(updated);
    setComplaints((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    loadNotifications();
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white">
        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4" />
        <div className="text-sm font-semibold text-slate-300">Initializing REC Bijnor Campus Care...</div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  // Workload count for current staff
  const staffTasksCount = complaints.filter(
    (c) => c.assignedTo?.id === user.id && (c.status === 'Assigned' || c.status === 'In Progress')
  ).length;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <Navbar
        unreadCount={unreadCount}
        onOpenNotifications={() => setNotificationsOpen(true)}
        onOpenProfile={() => setProfileOpen(true)}
        onOpenChat={() => setChatOpen(true)}
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
      />

      <div className="max-w-7xl mx-auto w-full flex-1 flex flex-col md:flex-row">
        {/* Sidebar */}
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          closeMobileMenu={() => setMobileMenuOpen(false)}
          onOpenChat={() => setChatOpen(true)}
          stats={{
            total: complaints.length,
            assignedToMe: staffTasksCount,
            pending: complaints.filter((c) => c.status === 'Pending').length,
          }}
        />

        {/* Main Content Area */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
          {bannerMessage && (
            <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 rounded-xl flex items-center justify-between shadow-xs">
              <span className="flex items-center gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <span className="font-medium">{bannerMessage}</span>
              </span>
              <button
                onClick={() => setBannerMessage(null)}
                className="text-emerald-700 hover:text-emerald-900 font-semibold"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* VIEW: Register New Complaint */}
          {activeTab === 'new-complaint' && (
            <ComplaintForm
              initialTitle={prefillData?.title}
              initialDescription={prefillData?.description}
              onSuccess={(c) => {
                setPrefillData(null);
                handleComplaintSubmitted(c);
              }}
              onCancel={() => {
                setPrefillData(null);
                setActiveTab('dashboard');
              }}
            />
          )}

          {/* VIEW: Staff Assigned Workspace */}
          {activeTab === 'staff-tasks' && (
            <StaffWorkloadView
              complaints={complaints.filter((c) => c.assignedTo?.id === user.id)}
              onSelectComplaint={(c) => setSelectedComplaint(c)}
              staffName={user.name}
              department={user.department}
            />
          )}

          {/* VIEW: Announcements */}
          {activeTab === 'announcements' && <AnnouncementsView />}

          {/* VIEW: Analytics & SLA */}
          {activeTab === 'analytics' && <AnalyticsView />}

          {/* VIEW: Admin User Management */}
          {activeTab === 'admin-users' && <AdminUsersView />}

          {/* VIEW: Admin Departments & SLA Policies */}
          {activeTab === 'admin-departments' && <AdminDepartmentsView />}

          {/* VIEW: Admin Audit Logs */}
          {activeTab === 'admin-logs' && <AdminAuditLogsView />}

          {/* VIEW: Dashboard / My Complaints */}
          {(activeTab === 'dashboard' || activeTab === 'my-complaints') && (
            <div className="space-y-6">
              {/* Top Banner / Actions Bar */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="text-lg font-bold text-slate-900">
                    {activeTab === 'my-complaints' ? 'My Registered Complaints' : 'Campus Service Requests'}
                  </h1>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {activeTab === 'my-complaints'
                      ? 'Track progress and provide resolution feedback for complaints filed by you'
                      : 'Rajkiya Engineering College, Bijnor · Active Incident & Facility Tracking'}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={loadComplaints}
                    disabled={loadingComplaints}
                    className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                    title="Refresh List"
                  >
                    <RefreshCw className={`w-4 h-4 ${loadingComplaints ? 'animate-spin' : ''}`} />
                  </button>

                  <button
                    onClick={() => setActiveTab('new-complaint')}
                    className="px-4 py-2 bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-semibold rounded-lg shadow-xs flex items-center gap-1.5 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    <span>File Complaint</span>
                  </button>
                </div>
              </div>

              {/* Filters & Search Controls */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
                <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
                  {/* Search Input */}
                  <div className="relative w-full sm:w-80">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search tickets by ID, room, or problem..."
                      className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:bg-white focus:outline-hidden focus:border-indigo-600"
                    />
                  </div>

                  {/* Interactive Status Filter Tabs */}
                  <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg w-full sm:w-auto overflow-x-auto">
                    {STATUS_FILTERS.map((s) => (
                      <button
                        key={s}
                        onClick={() => setStatusFilter(s)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors capitalize ${
                          statusFilter === s
                            ? 'bg-white text-slate-900 shadow-xs font-semibold'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {s === 'all' ? 'All Statuses' : s}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Category Filter Buttons */}
                <div className="pt-2 border-t border-slate-100 flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mr-1 shrink-0">
                    Category:
                  </span>
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setCategoryFilter(cat)}
                      className={`px-2.5 py-1 rounded-md transition-colors text-xs shrink-0 ${
                        categoryFilter === cat
                          ? 'bg-indigo-900 text-white font-semibold'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Complaints Grid */}
              {loadingComplaints ? (
                <div className="py-20 text-center text-slate-400 text-xs">
                  <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                  <span>Loading campus complaints...</span>
                </div>
              ) : complaints.length === 0 ? (
                <div className="bg-white p-12 text-center rounded-xl border border-slate-200 text-slate-500 text-xs">
                  <Inbox className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                  <p className="font-semibold text-slate-800 text-sm">No complaints found</p>
                  <p className="text-slate-400 mt-1 max-w-sm mx-auto">
                    No tickets match the selected filters or search terms. You can register a new issue or adjust the filter criteria.
                  </p>
                  <button
                    onClick={() => setActiveTab('new-complaint')}
                    className="mt-4 px-4 py-2 bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-semibold rounded-lg shadow-xs inline-flex items-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Register New Complaint</span>
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {complaints.map((c) => (
                    <ComplaintCard
                      key={c.id}
                      complaint={c}
                      onClick={() => setSelectedComplaint(c)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* Complaint Drill-down Modal */}
      {selectedComplaint && (
        <ComplaintDetailsModal
          complaint={selectedComplaint}
          currentUser={user}
          onClose={() => setSelectedComplaint(null)}
          onUpdate={handleComplaintUpdated}
          allStaffUsers={allStaff}
        />
      )}

      {/* In-App Notifications Drawer */}
      <NotificationsDrawer
        isOpen={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
        notifications={notifications}
        onMarkRead={handleMarkNotificationRead}
        onMarkAllRead={handleMarkAllNotificationsRead}
        onSelectComplaint={handleOpenComplaintById}
      />

      {/* My Profile Modal */}
      <ProfileModal isOpen={profileOpen} onClose={() => setProfileOpen(false)} />

      {/* Floating Gemini Chat Launcher Button */}
      {!chatOpen && (
        <button
          onClick={() => setChatOpen(true)}
          className="fixed bottom-5 right-5 z-40 bg-indigo-700 hover:bg-indigo-800 text-white font-semibold text-xs py-2.5 px-4 rounded-full shadow-lg hover:shadow-indigo-500/25 transition-all duration-200 flex items-center gap-2 group cursor-pointer focus:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-500"
          title="Open Gemini Campus AI Assistant"
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400"></span>
          </span>
          <Sparkles className="w-4 h-4 text-amber-300 group-hover:rotate-12 transition-transform" />
          <span>Campus AI Assistant</span>
        </button>
      )}

      {/* Gemini Multi-turn Chatbot Modal / Drawer */}
      <GeminiChatbot
        isOpen={chatOpen}
        onClose={() => setChatOpen(false)}
        onPrefillComplaint={(title, desc) => {
          setPrefillData({ title, description: desc });
          setActiveTab('new-complaint');
        }}
      />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}
