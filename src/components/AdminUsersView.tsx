import React, { useState, useEffect } from 'react';
import { User, UserRole, CollegeRosterEntry } from '../types';
import { api } from '../services/api';
import {
  Users,
  UserPlus,
  Search,
  Shield,
  Wrench,
  GraduationCap,
  BookOpen,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  X,
  ToggleLeft,
  ToggleRight,
  UploadCloud,
  FileSpreadsheet,
  Check,
  Clock,
  Sparkles,
} from 'lucide-react';

export const AdminUsersView: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<'users' | 'roster'>('users');

  // Users state
  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [searchUser, setSearchUser] = useState('');
  const [roleFilterUser, setRoleFilterUser] = useState<string>('all');

  // Roster state
  const [roster, setRoster] = useState<CollegeRosterEntry[]>([]);
  const [rosterStats, setRosterStats] = useState({ total: 0, claimed: 0, unclaimed: 0 });
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [searchRoster, setSearchRoster] = useState('');
  const [roleFilterRoster, setRoleFilterRoster] = useState<string>('all');
  const [claimedFilterRoster, setClaimedFilterRoster] = useState<string>('all');

  // CSV Import Modal
  const [showImportModal, setShowImportModal] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);

  // Manual Roster Entry Modal
  const [showRosterEntryModal, setShowRosterEntryModal] = useState(false);
  const [rEmail, setREmail] = useState('');
  const [rName, setRName] = useState('');
  const [rRole, setRRole] = useState<UserRole>('student');
  const [rEnrollment, setREnrollment] = useState('');
  const [rDepartment, setRDepartment] = useState('');
  const [rAcademicYear, setRAcademicYear] = useState('');
  const [rHostel, setRHostel] = useState('');
  const [rRoomNumber, setRRoomNumber] = useState('');
  const [rMobileNumber, setRMobileNumber] = useState('');
  const [rSubmitting, setRSubmitting] = useState(false);

  // Create User Modal (Direct manual provisioning exception)
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('student');
  const [identifier, setIdentifier] = useState('');
  const [department, setDepartment] = useState('');
  const [enrollmentNumber, setEnrollmentNumber] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [academicYear, setAcademicYear] = useState('');
  const [hostel, setHostel] = useState('');
  const [temporaryPassword, setTemporaryPassword] = useState('Password@123');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadUsers = async () => {
    setLoadingUsers(true);
    try {
      const res = await api.admin.getUsers();
      setUsers(res.users || []);
    } catch (err: any) {
      console.error('Failed to load users:', err);
    } finally {
      setLoadingUsers(false);
    }
  };

  const loadRoster = async () => {
    setLoadingRoster(true);
    try {
      const res = await api.admin.getRoster({
        role: roleFilterRoster !== 'all' ? roleFilterRoster : undefined,
        isClaimed: claimedFilterRoster !== 'all' ? claimedFilterRoster : undefined,
        search: searchRoster.trim() || undefined,
      });
      setRoster(res.roster || []);
      setRosterStats(res.stats || { total: 0, claimed: 0, unclaimed: 0 });
    } catch (err: any) {
      console.error('Failed to load roster:', err);
    } finally {
      setLoadingRoster(false);
    }
  };

  useEffect(() => {
    if (currentTab === 'users') {
      loadUsers();
    } else {
      loadRoster();
    }
  }, [currentTab, roleFilterRoster, claimedFilterRoster]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;

    setIsSubmitting(true);
    setError(null);
    try {
      const res = await api.admin.createUser({
        name: name.trim(),
        email: email.trim(),
        role,
        identifier: identifier.trim() || undefined,
        department: department.trim() || undefined,
        enrollmentNumber: enrollmentNumber.trim() || undefined,
        mobileNumber: mobileNumber.trim() || undefined,
        academicYear: academicYear.trim() || undefined,
        hostel: hostel.trim() || undefined,
        temporaryPassword,
      });

      setMessage(res.message);
      setShowCreateModal(false);
      setName('');
      setEmail('');
      setIdentifier('');
      setEnrollmentNumber('');
      setDepartment('');
      loadUsers();
    } catch (err: any) {
      setError(err.message || 'Failed to create user');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleUserStatus = async (user: User) => {
    try {
      const res = await api.admin.updateUserStatus(user.id, !user.isActive);
      setMessage(res.message);
      loadUsers();
    } catch (err: any) {
      setError(err.message || 'Failed to update user status');
    }
  };

  const handleResetPassword = async (user: User) => {
    if (!window.confirm(`Reset password for ${user.name} (${user.email})?`)) return;
    try {
      const res = await api.admin.resetPassword(user.id);
      setMessage(`${res.message} New Password: ${res.temporaryPassword}`);
    } catch (err: any) {
      setError(err.message || 'Failed to reset password');
    }
  };

  const handleImportCsv = async () => {
    if (!csvText.trim()) {
      setError('Please provide or paste CSV content.');
      return;
    }
    setImportLoading(true);
    setError(null);
    try {
      const res = await api.admin.importRosterCsv(csvText);
      setImportResult(res.stats);
      setMessage(res.message);
      loadRoster();
    } catch (err: any) {
      setError(err.message || 'CSV import failed.');
    } finally {
      setImportLoading(false);
    }
  };

  const handleCreateRosterEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rEmail.trim() || !rName.trim()) return;

    setRSubmitting(true);
    setError(null);
    try {
      const res = await api.admin.createRosterEntry({
        email: rEmail.trim(),
        name: rName.trim(),
        role: rRole,
        enrollmentNumber: rEnrollment.trim() || undefined,
        department: rDepartment.trim() || undefined,
        academicYear: rAcademicYear.trim() || undefined,
        hostel: rHostel.trim() || undefined,
        roomNumber: rRoomNumber.trim() || undefined,
        mobileNumber: rMobileNumber.trim() || undefined,
      });

      setMessage(res.message);
      setShowRosterEntryModal(false);
      setREmail('');
      setRName('');
      setREnrollment('');
      setRDepartment('');
      loadRoster();
    } catch (err: any) {
      setError(err.message || 'Failed to create roster entry');
    } finally {
      setRSubmitting(false);
    }
  };

  const handleToggleRosterEligibility = async (entry: CollegeRosterEntry) => {
    try {
      const res = await api.admin.toggleRosterEligibility(entry._id || entry.id || '');
      setMessage(res.message);
      loadRoster();
    } catch (err: any) {
      setError(err.message || 'Failed to toggle roster eligibility');
    }
  };

  const loadSampleCsv = () => {
    const sample = `email,name,role,enrollmentNumber,department,academicYear,hostel,roomNumber,mobileNumber
student.ananya@recb.ac.in,Ananya Verma,student,2201330100012,Computer Science & Engg,B.Tech 4th Year,Kalpana Chawla Hostel,105,+91 94120 11223
student.mohit@recb.ac.in,Mohit Singh,student,2301330100055,Information Technology,B.Tech 3rd Year,Ramanujan Hostel,214,+91 98370 22334
faculty.ee@recb.ac.in,Dr. S. K. Maurya,faculty,,Electrical Engineering,,,,+91 94120 99887
staff.plumbing@recb.ac.in,Rajesh Kumar,staff,,Maintenance,,,,+91 95570 44556`;
    setCsvText(sample);
  };

  // Filtered users for table
  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.name.toLowerCase().includes(searchUser.toLowerCase()) ||
      u.email.toLowerCase().includes(searchUser.toLowerCase()) ||
      (u.enrollmentNumber && u.enrollmentNumber.toLowerCase().includes(searchUser.toLowerCase())) ||
      (u.department && u.department.toLowerCase().includes(searchUser.toLowerCase()));
    const matchesRole = roleFilterUser === 'all' || u.role === roleFilterUser;
    return matchesSearch && matchesRole;
  });

  return (
    <div className="space-y-6">
      {/* Top Header & Section Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-600" />
            <span>Identity & Access Management</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            College roster verification, authorized identities, and active portal accounts.
          </p>
        </div>

        {/* Tab Buttons */}
        <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl border border-slate-200">
          <button
            type="button"
            onClick={() => setCurrentTab('users')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              currentTab === 'users'
                ? 'bg-white text-indigo-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Registered Users ({users.length})
          </button>
          <button
            type="button"
            onClick={() => setCurrentTab('roster')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer ${
              currentTab === 'roster'
                ? 'bg-white text-indigo-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-indigo-600" />
            <span>College Roster ({rosterStats.total})</span>
          </button>
        </div>
      </div>

      {/* Global Alerts */}
      {message && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{message}</span>
          </div>
          <button onClick={() => setMessage(null)} className="text-emerald-700 hover:text-emerald-900 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-xs text-rose-800 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-rose-700 hover:text-rose-900 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 1: REGISTERED USERS VIEW */}
      {/* ==================================================================== */}
      {currentTab === 'users' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex flex-1 items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:max-w-xs">
                <input
                  type="text"
                  placeholder="Search active users..."
                  value={searchUser}
                  onChange={(e) => setSearchUser(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:bg-white focus:outline-hidden focus:border-indigo-600"
                />
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              </div>

              <select
                value={roleFilterUser}
                onChange={(e) => setRoleFilterUser(e.target.value)}
                className="px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-700 focus:bg-white focus:outline-hidden"
              >
                <option value="all">All Roles</option>
                <option value="student">Students</option>
                <option value="faculty">Faculty</option>
                <option value="staff">Staff</option>
                <option value="admin">Administrators</option>
              </select>
            </div>

            <button
              onClick={() => setShowCreateModal(true)}
              className="w-full sm:w-auto px-3.5 py-1.5 bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Direct Provision User</span>
            </button>
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            {loadingUsers ? (
              <div className="py-12 text-center text-xs text-slate-400">Loading active users...</div>
            ) : filteredUsers.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400">No active registered users match the search criteria.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-600">
                  <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-700 uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="px-4 py-3">User & Contact</th>
                      <th className="px-4 py-3">Role & Dept</th>
                      <th className="px-4 py-3">College Roll / ID</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredUsers.map((u) => (
                      <tr key={u.id} className="hover:bg-slate-50/50">
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-900">{u.name}</div>
                          <div className="text-[11px] text-slate-500">{u.email}</div>
                          {u.mobileNumber && <div className="text-[10px] text-slate-400">{u.mobileNumber}</div>}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              u.role === 'admin'
                                ? 'bg-amber-100 text-amber-800'
                                : u.role === 'faculty'
                                ? 'bg-indigo-100 text-indigo-800'
                                : u.role === 'staff'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {u.role.toUpperCase()}
                          </span>
                          <div className="text-[11px] text-slate-500 mt-0.5">{u.department || '—'}</div>
                        </td>
                        <td className="px-4 py-3 font-mono text-[11px] text-slate-700">
                          {u.enrollmentNumber || '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              u.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${u.isActive ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                            {u.isActive ? 'Active' : 'Disabled'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right space-x-2">
                          <button
                            onClick={() => handleResetPassword(u)}
                            className="p-1 text-slate-500 hover:text-indigo-600 rounded-md hover:bg-slate-100 cursor-pointer"
                            title="Reset password"
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleToggleUserStatus(u)}
                            className={`p-1 rounded-md hover:bg-slate-100 cursor-pointer ${
                              u.isActive ? 'text-rose-500 hover:text-rose-700' : 'text-emerald-500 hover:text-emerald-700'
                            }`}
                            title={u.isActive ? 'Deactivate user' : 'Activate user'}
                          >
                            {u.isActive ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 2: COLLEGE ROSTER MANAGEMENT VIEW */}
      {/* ==================================================================== */}
      {currentTab === 'roster' && (
        <div className="space-y-4">
          {/* Roster Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Total Eligible Roster</div>
              <div className="text-2xl font-bold text-slate-900 mt-1">{rosterStats.total}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">Official student & faculty records</div>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <div className="text-[11px] font-semibold text-emerald-600 uppercase tracking-wider">Claimed / Active</div>
              <div className="text-2xl font-bold text-emerald-700 mt-1">{rosterStats.claimed}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">Accounts activated via email OTP</div>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <div className="text-[11px] font-semibold text-amber-600 uppercase tracking-wider">Unclaimed / Pending</div>
              <div className="text-2xl font-bold text-amber-700 mt-1">{rosterStats.unclaimed}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">Eligible for one-time registration</div>
            </div>
          </div>

          {/* Controls */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex flex-1 items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:max-w-xs">
                <input
                  type="text"
                  placeholder="Search roster by roll no, email, name..."
                  value={searchRoster}
                  onChange={(e) => setSearchRoster(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && loadRoster()}
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:bg-white focus:outline-hidden focus:border-indigo-600"
                />
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              </div>

              <select
                value={roleFilterRoster}
                onChange={(e) => setRoleFilterRoster(e.target.value)}
                className="px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-700 focus:bg-white focus:outline-hidden"
              >
                <option value="all">All Roles</option>
                <option value="student">Students</option>
                <option value="faculty">Faculty</option>
                <option value="staff">Staff</option>
              </select>

              <select
                value={claimedFilterRoster}
                onChange={(e) => setClaimedFilterRoster(e.target.value)}
                className="px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-700 focus:bg-white focus:outline-hidden"
              >
                <option value="all">All States</option>
                <option value="false">Unclaimed Only</option>
                <option value="true">Claimed / Active</option>
              </select>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                onClick={() => setShowRosterEntryModal(true)}
                className="flex-1 sm:flex-none px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg shadow-xs cursor-pointer"
              >
                + Add Single Record
              </button>
              <button
                onClick={() => {
                  setShowImportModal(true);
                  setImportResult(null);
                }}
                className="flex-1 sm:flex-none px-3.5 py-1.5 bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
              >
                <UploadCloud className="w-3.5 h-3.5" />
                <span>Import Roster CSV</span>
              </button>
            </div>
          </div>

          {/* Roster Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            {loadingRoster ? (
              <div className="py-12 text-center text-xs text-slate-400">Loading college roster records...</div>
            ) : roster.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400">
                No roster records found. Click <strong>Import Roster CSV</strong> to upload official college records.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-600">
                  <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-700 uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="px-4 py-3">Identity & Official Email</th>
                      <th className="px-4 py-3">Role & Department</th>
                      <th className="px-4 py-3">Roll / Enrollment</th>
                      <th className="px-4 py-3">Hostel / Location</th>
                      <th className="px-4 py-3">Eligibility</th>
                      <th className="px-4 py-3">Claim Status</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {roster.map((r) => (
                      <tr key={r._id || r.id} className="hover:bg-slate-50/50">
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-900">{r.name}</div>
                          <div className="text-[11px] text-slate-500 font-mono">{r.email}</div>
                          {r.mobileNumber && <div className="text-[10px] text-slate-400">{r.mobileNumber}</div>}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              r.role === 'faculty'
                                ? 'bg-indigo-100 text-indigo-800'
                                : r.role === 'staff'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {r.role.toUpperCase()}
                          </span>
                          <div className="text-[11px] text-slate-500 mt-0.5">{r.department || '—'}</div>
                        </td>
                        <td className="px-4 py-3 font-mono text-[11px] text-slate-700">
                          {r.enrollmentNumber || '—'}
                          {r.academicYear && <div className="text-[10px] text-slate-400 font-sans">{r.academicYear}</div>}
                        </td>
                        <td className="px-4 py-3 text-[11px] text-slate-600">
                          {r.hostel ? `${r.hostel}${r.roomNumber ? ` (Room ${r.roomNumber})` : ''}` : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => handleToggleRosterEligibility(r)}
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold transition-colors cursor-pointer ${
                              r.isEligible ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                            }`}
                          >
                            {r.isEligible ? 'Eligible' : 'Ineligible'}
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          {r.isClaimed ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Activated</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700">
                              <Clock className="w-3.5 h-3.5 text-amber-500" />
                              <span>Unclaimed</span>
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => handleToggleRosterEligibility(r)}
                            className="text-xs text-slate-400 hover:text-slate-700 cursor-pointer"
                            title="Toggle eligibility"
                          >
                            Toggle
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* CSV IMPORT MODAL */}
      {/* ==================================================================== */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 relative">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-indigo-600" />
                <h3 className="text-base font-bold text-slate-900">Import College Roster CSV</h3>
              </div>
              <button onClick={() => setShowImportModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-500 mt-2">
              Import official student and faculty records. Accepted columns: <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-[11px]">email, name, role, enrollmentNumber, department, academicYear, hostel, roomNumber, mobileNumber</code>.
            </p>

            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-700">Paste CSV Contents</label>
                <button
                  type="button"
                  onClick={loadSampleCsv}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-medium cursor-pointer"
                >
                  Load Sample CSV
                </button>
              </div>

              <textarea
                rows={8}
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                placeholder="Paste CSV lines here..."
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono text-slate-900 focus:bg-white focus:outline-hidden focus:border-indigo-600"
              />

              {importResult && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1">
                  <div className="font-semibold text-slate-900">Import Summary:</div>
                  <div className="text-emerald-700">✓ {importResult.inserted} records created</div>
                  <div className="text-blue-700">✓ {importResult.updated} records updated</div>
                  {importResult.errors && importResult.errors.length > 0 && (
                    <div className="text-rose-700 mt-1">
                      ✗ {importResult.errors.length} rows had errors:
                      <ul className="list-disc pl-4 mt-0.5 max-h-24 overflow-y-auto">
                        {importResult.errors.map((err: any, idx: number) => (
                          <li key={idx}>Row {err.row}: {err.error}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowImportModal(false)}
                  className="px-3.5 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={handleImportCsv}
                  disabled={importLoading || !csvText.trim()}
                  className="px-4 py-2 bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-semibold rounded-lg shadow-xs disabled:opacity-60 flex items-center gap-1.5 cursor-pointer"
                >
                  {importLoading ? 'Processing CSV...' : 'Process Roster Import'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MANUAL ROSTER ENTRY MODAL */}
      {/* ==================================================================== */}
      {showRosterEntryModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 relative">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900">Add College Roster Identity</h3>
              <button onClick={() => setShowRosterEntryModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateRosterEntry} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name *</label>
                <input
                  type="text"
                  value={rName}
                  onChange={(e) => setRName(e.target.value)}
                  placeholder="e.g. Rahul Sharma"
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Official Email *</label>
                  <input
                    type="email"
                    value={rEmail}
                    onChange={(e) => setREmail(e.target.value)}
                    placeholder="student@recb.ac.in"
                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Role *</label>
                  <select
                    value={rRole}
                    onChange={(e) => setRRole(e.target.value as UserRole)}
                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs"
                  >
                    <option value="student">Student</option>
                    <option value="faculty">Faculty</option>
                    <option value="staff">Staff</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Roll / Enrollment No {rRole === 'student' && '*'}
                  </label>
                  <input
                    type="text"
                    value={rEnrollment}
                    onChange={(e) => setREnrollment(e.target.value)}
                    placeholder="2201330100012"
                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono"
                    required={rRole === 'student'}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Department</label>
                  <input
                    type="text"
                    value={rDepartment}
                    onChange={(e) => setRDepartment(e.target.value)}
                    placeholder="Computer Science"
                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Hostel / Location</label>
                  <input
                    type="text"
                    value={rHostel}
                    onChange={(e) => setRHostel(e.target.value)}
                    placeholder="Ramanujan Hostel"
                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Mobile Contact</label>
                  <input
                    type="text"
                    value={rMobileNumber}
                    onChange={(e) => setRMobileNumber(e.target.value)}
                    placeholder="+91 94120 12345"
                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowRosterEntryModal(false)}
                  className="px-3.5 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={rSubmitting}
                  className="px-4 py-2 bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-semibold rounded-lg shadow-xs disabled:opacity-60 cursor-pointer"
                >
                  {rSubmitting ? 'Adding...' : 'Save Roster Entry'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* DIRECT USER PROVISIONING MODAL */}
      {/* ==================================================================== */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 relative">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900">Direct Provision Account</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="mt-4 space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Full Name *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Dr. Rajesh Kumar"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Institutional Email *</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="user@recb.ac.in"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm"
                    required
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Role *</label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as UserRole)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm"
                  >
                    <option value="student">Student</option>
                    <option value="faculty">Faculty Member</option>
                    <option value="staff">Maintenance Staff</option>
                    <option value="admin">Administrator</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Roll / Identifier</label>
                  <input
                    type="text"
                    value={enrollmentNumber}
                    onChange={(e) => setEnrollmentNumber(e.target.value)}
                    placeholder="e.g. 2201330100045"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Department / Branch</label>
                  <input
                    type="text"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    placeholder="e.g. Electricity, Hostel, or CS"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Mobile Contact</label>
                  <input
                    type="text"
                    value={mobileNumber}
                    onChange={(e) => setMobileNumber(e.target.value)}
                    placeholder="+91 98765 43210"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Initial Password</label>
                  <input
                    type="text"
                    value={temporaryPassword}
                    onChange={(e) => setTemporaryPassword(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm font-mono"
                    required
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-3.5 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-semibold rounded-lg shadow-xs disabled:opacity-60 cursor-pointer"
                >
                  {isSubmitting ? 'Provisioning...' : 'Confirm Account Provisioning'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
