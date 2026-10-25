import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import {
  Shield,
  Eye,
  EyeOff,
  HelpCircle,
  AlertCircle,
  CheckCircle2,
  UserPlus,
  Mail,
  Phone,
  KeyRound,
  RotateCw,
  Sparkles,
  ArrowRight,
} from 'lucide-react';

export const LoginPage: React.FC = () => {
  const { login, setSession } = useAuth();

  const [activeTab, setActiveTab] = useState<'login' | 'register'>('login');

  // Login form state
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dual-OTP Registration state
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regEnrollment, setRegEnrollment] = useState('');
  const [regMobile, setRegMobile] = useState('');
  const [regDepartment, setRegDepartment] = useState('Computer Science & Engineering');
  const [regAcademicYear, setRegAcademicYear] = useState('1st Year');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [regStep, setRegStep] = useState<'request' | 'verify'>('request');
  
  // Independent Dual OTP states
  const [emailOtp, setEmailOtp] = useState('');
  const [smsOtp, setSmsOtp] = useState('');
  const [emailVerified, setEmailVerified] = useState(false);
  const [smsVerified, setSmsVerified] = useState(false);
  const [regMaskedEmail, setRegMaskedEmail] = useState('');
  const [regMaskedMobile, setRegMaskedMobile] = useState('');
  const [regDevEmailOtp, setRegDevEmailOtp] = useState<string | undefined>(undefined);
  const [regDevSmsOtp, setRegDevSmsOtp] = useState<string | undefined>(undefined);
  const [emailResendSeconds, setEmailResendSeconds] = useState(0);
  const [smsResendSeconds, setSmsResendSeconds] = useState(0);
  const [regLoading, setRegLoading] = useState(false);
  const [emailVerifying, setEmailVerifying] = useState(false);
  const [smsVerifying, setSmsVerifying] = useState(false);
  const [regError, setRegError] = useState<string | null>(null);
  const [regMessage, setRegMessage] = useState<string | null>(null);

  // Status check for empty database / first-time admin setup
  const [hasUsers, setHasUsers] = useState<boolean | null>(null);
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [setupData, setSetupData] = useState({
    name: '',
    email: '',
    identifier: '',
    password: '',
    department: 'Administration',
    mobileNumber: '',
  });
  const [setupLoading, setSetupLoading] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);

  // Forgot password modal
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotIdentifier, setForgotIdentifier] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [forgotStep, setForgotStep] = useState<'request' | 'reset'>('request');
  const [forgotMessage, setForgotMessage] = useState<string | null>(null);
  const [forgotError, setForgotError] = useState<string | null>(null);

  useEffect(() => {
    async function checkStatus() {
      try {
        const res = await api.auth.getStatus();
        setHasUsers(res.hasUsers);
      } catch {
        setHasUsers(null);
      }
    }
    checkStatus();
  }, []);

  // Countdown timers for OTP resend cooldowns
  useEffect(() => {
    if (emailResendSeconds <= 0) return;
    const timer = setInterval(() => {
      setEmailResendSeconds((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [emailResendSeconds]);

  useEffect(() => {
    if (smsResendSeconds <= 0) return;
    const timer = setInterval(() => {
      setSmsResendSeconds((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [smsResendSeconds]);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim() || !password) {
      setError('Please provide your institutional identifier and password.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await login(identifier.trim(), password);
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please verify credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterInitiate = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError(null);
    setRegMessage(null);

    if (!regName.trim()) {
      setRegError('Full Name is required.');
      return;
    }

    if (!regEmail.trim()) {
      setRegError('Official college email address (@recb.ac.in) is required.');
      return;
    }

    // Client-side institutional email validation
    const emailLower = regEmail.trim().toLowerCase();
    if (!emailLower.endsWith('@recb.ac.in') && !emailLower.endsWith('@recbijnor.ac.in')) {
      setRegError('Only official institutional email addresses (@recb.ac.in) are permitted.');
      return;
    }

    // Client-side 15-digit enrollment number validation
    const cleanRoll = regEnrollment.trim();
    if (!/^[0-9]{15}$/.test(cleanRoll)) {
      setRegError('Enrollment number must be exactly 15 numeric digits (e.g. 230735013069249).');
      return;
    }

    if (cleanRoll.substring(2, 6) !== '0735') {
      setRegError('Enrollment number college code segment must match REC Bijnor institutional code (0735).');
      return;
    }

    if (!regMobile.trim()) {
      setRegError('Mobile phone number with country code is required.');
      return;
    }

    if (!regPassword || regPassword.length < 8) {
      setRegError('Password must be at least 8 characters long.');
      return;
    }

    if (regPassword !== regConfirmPassword) {
      setRegError('Passwords do not match. Please re-enter.');
      return;
    }

    setRegLoading(true);

    try {
      const res = await api.auth.registerInitiate({
        name: regName.trim(),
        email: emailLower,
        enrollmentNumber: cleanRoll,
        mobileNumber: regMobile.trim(),
        department: regDepartment,
        academicYear: regAcademicYear,
        password: regPassword,
        confirmPassword: regConfirmPassword,
      });

      setRegMessage(res.message);
      setRegMaskedEmail(res.emailMasked);
      setRegMaskedMobile(res.mobileMasked);
      setEmailResendSeconds(res.resendAvailableInSeconds || 60);
      setSmsResendSeconds(res.resendAvailableInSeconds || 60);
      setRegDevEmailOtp(res.devEmailOtp);
      setRegDevSmsOtp(res.devSmsOtp);
      setEmailVerified(false);
      setSmsVerified(false);
      setRegStep('verify');
    } catch (err: any) {
      setRegError(err.message || 'Failed to dispatch verification codes.');
    } finally {
      setRegLoading(false);
    }
  };

  const handleVerifyEmailOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError(null);
    setRegMessage(null);

    const cleanOtp = emailOtp.trim();
    if (!/^\d{6}$/.test(cleanOtp)) {
      setRegError('Please enter the exact 6-digit email verification code.');
      return;
    }

    setEmailVerifying(true);

    try {
      const res = await api.auth.verifyEmailOtp({
        email: regEmail.trim(),
        otp: cleanOtp,
      });

      setEmailVerified(true);
      setRegMessage(res.message);

      if (res.token && res.user) {
        setSession(res.token, res.user);
      }
    } catch (err: any) {
      setRegError(err.message || 'Email OTP verification failed.');
    } finally {
      setEmailVerifying(false);
    }
  };

  const handleVerifySmsOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError(null);
    setRegMessage(null);

    const cleanOtp = smsOtp.trim();
    if (!/^\d{6}$/.test(cleanOtp)) {
      setRegError('Please enter the exact 6-digit SMS verification code.');
      return;
    }

    setSmsVerifying(true);

    try {
      const res = await api.auth.verifySmsOtp({
        email: regEmail.trim(),
        otp: cleanOtp,
      });

      setSmsVerified(true);
      setRegMessage(res.message);

      if (res.token && res.user) {
        setSession(res.token, res.user);
      }
    } catch (err: any) {
      setRegError(err.message || 'SMS OTP verification failed.');
    } finally {
      setSmsVerifying(false);
    }
  };

  const handleResendDualOtp = async (channel: 'email' | 'sms') => {
    if (channel === 'email' && emailResendSeconds > 0) return;
    if (channel === 'sms' && smsResendSeconds > 0) return;

    setRegError(null);
    setRegLoading(true);

    try {
      const res = await api.auth.resendDualOtp({
        email: regEmail.trim(),
        channel,
      });

      setRegMessage(res.message);
      if (channel === 'email') {
        setEmailResendSeconds(res.resendAvailableInSeconds || 60);
        setRegDevEmailOtp(res.devOtp);
      } else {
        setSmsResendSeconds(res.resendAvailableInSeconds || 60);
        setRegDevSmsOtp(res.devOtp);
      }
    } catch (err: any) {
      setRegError(err.message || `Failed to resend ${channel.toUpperCase()} verification code.`);
    } finally {
      setRegLoading(false);
    }
  };

  const handleInitialAdminSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!setupData.name || !setupData.email || !setupData.password) {
      setSetupError('Name, official email, and password are required.');
      return;
    }

    if (setupData.password.length < 8) {
      setSetupError('Administrator password must be at least 8 characters.');
      return;
    }

    setSetupLoading(true);
    setSetupError(null);

    try {
      const res = await api.auth.setupInitialAdmin(setupData);
      setSession(res.token, res.user);
    } catch (err: any) {
      setSetupError(err.message || 'Failed to setup administrator.');
    } finally {
      setSetupLoading(false);
    }
  };

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotIdentifier.trim()) {
      setForgotError('Please enter your college email or roll number.');
      return;
    }
    setForgotError(null);
    try {
      const res = await api.auth.forgotPassword(forgotIdentifier.trim());
      setForgotMessage(res.message);
      if (res.demoToken) {
        setResetToken(res.demoToken);
      }
      setForgotStep('reset');
    } catch (err: any) {
      setForgotError(err.message || 'Could not process request.');
    }
  };

  const handleConfirmReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetToken.trim() || !newPassword) {
      setForgotError('Token and new password are required.');
      return;
    }
    setForgotError(null);
    try {
      const res = await api.auth.resetPassword(resetToken.trim(), newPassword);
      setForgotMessage(res.message);
      setTimeout(() => {
        setShowForgotModal(false);
        setForgotStep('request');
        setForgotMessage(null);
      }, 2000);
    } catch (err: any) {
      setForgotError(err.message || 'Failed to reset password.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute inset-0 bg-[radial-gradient(#312e81_1px,transparent_1px)] [background-size:24px_24px] opacity-30 pointer-events-none" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        {/* Emblem / Title */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-xl bg-indigo-600 text-white font-extrabold text-2xl shadow-lg shadow-indigo-600/30 mb-4 border border-indigo-500">
            REC
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Rajkiya Engineering College, Bijnor
          </h1>
          <p className="mt-1 text-sm font-medium text-indigo-300">
            Campus Care · AI Complaint & Facility Management System
          </p>
        </div>

        {/* First-time Setup Alert Banner if zero users in database */}
        {hasUsers === false && (
          <div className="mt-6 bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 text-left">
            <div className="flex items-start gap-3">
              <Shield className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-xs font-bold text-amber-300 uppercase tracking-wider">
                  First-Time System Initialization
                </h3>
                <p className="text-xs text-amber-200/90 mt-1">
                  No institutional accounts currently exist in the database. Provision your official administrator account to get started.
                </p>
                <button
                  type="button"
                  onClick={() => setShowSetupModal(true)}
                  className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-lg transition-colors shadow-xs cursor-pointer"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Setup College Administrator</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Auth Card with Tabs */}
        <div className="mt-6 bg-white py-8 px-6 sm:px-10 shadow-2xl rounded-2xl border border-slate-200">
          {/* Navigation Tabs: Sign In vs Activate/Register */}
          <div className="flex border-b border-slate-200 mb-6">
            <button
              type="button"
              onClick={() => {
                setActiveTab('login');
                setError(null);
              }}
              className={`flex-1 pb-3 text-sm font-semibold text-center border-b-2 transition-colors cursor-pointer ${
                activeTab === 'login'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('register');
                setRegError(null);
                setRegMessage(null);
              }}
              className={`flex-1 pb-3 text-sm font-semibold text-center border-b-2 transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'register'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
              <span>Roster Activation</span>
            </button>
          </div>

          {/* ============================================================== */}
          {/* TAB 1: INSTITUTIONAL LOGIN */}
          {/* ============================================================== */}
          {activeTab === 'login' && (
            <div>
              <div className="mb-5">
                <h2 className="text-base font-bold text-slate-900">Institutional Sign In</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Authorized access for students, faculty, staff, and administrators.
                </p>
              </div>

              {error && (
                <div className="mb-5 p-3.5 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-2.5 text-xs text-rose-800">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleLoginSubmit} className="space-y-4">
                <div>
                  <label htmlFor="identifier" className="block text-xs font-semibold text-slate-700 mb-1">
                    College Email / Roll Number / Staff ID
                  </label>
                  <input
                    id="identifier"
                    type="text"
                    autoComplete="username"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="e.g. 2201330100045 or faculty@recb.ac.in"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-hidden focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20 transition-colors"
                    required
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label htmlFor="password" className="block text-xs font-semibold text-slate-700">
                      Password
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowForgotModal(true)}
                      className="text-xs text-indigo-600 hover:text-indigo-800 font-medium focus:outline-hidden cursor-pointer"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-hidden focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20 pr-10 transition-colors"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 px-3 flex items-center text-slate-400 hover:text-slate-600 focus:outline-hidden cursor-pointer"
                      tabIndex={-1}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full mt-2 py-2.5 px-4 bg-indigo-700 hover:bg-indigo-800 text-white text-sm font-semibold rounded-lg shadow-sm focus:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-600 disabled:opacity-60 transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  {loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Verifying Credentials...</span>
                    </>
                  ) : (
                    <span>Sign In to Campus Care</span>
                  )}
                </button>
              </form>

              <div className="mt-5 pt-4 border-t border-slate-200 text-center">
                <p className="text-xs text-slate-500">
                  New student or faculty member?{' '}
                  <button
                    type="button"
                    onClick={() => setActiveTab('register')}
                    className="text-indigo-600 font-semibold hover:underline cursor-pointer"
                  >
                    Activate your roster identity
                  </button>
                </p>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 2: INSTITUTIONAL REGISTRATION WITH MANDATORY DUAL-OTP */}
          {/* ============================================================== */}
          {activeTab === 'register' && (
            <div>
              <div className="mb-4">
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-1.5">
                  <Shield className="w-4 h-4 text-indigo-600" />
                  <span>Student Self-Registration (Dual-OTP)</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Institutional email & 15-digit roll number verification with mandatory Email & SMS OTP.
                </p>
              </div>

              {regMessage && (
                <div className="mb-3.5 p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-start gap-2 text-xs text-emerald-800">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>{regMessage}</span>
                </div>
              )}

              {regError && (
                <div className="mb-3.5 p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-2 text-xs text-rose-800">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{regError}</span>
                </div>
              )}

              {/* Step 1: Registration Form */}
              {regStep === 'request' && (
                <form onSubmit={handleRegisterInitiate} className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Full Name *
                    </label>
                    <input
                      type="text"
                      value={regName}
                      onChange={(e) => setRegName(e.target.value)}
                      placeholder="e.g. Lalit Kumar"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:bg-white focus:outline-hidden focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Official Institutional Email (@recb.ac.in) *
                    </label>
                    <div className="relative">
                      <input
                        type="email"
                        value={regEmail}
                        onChange={(e) => setRegEmail(e.target.value)}
                        placeholder="e.g. lalit.it.23034@recb.ac.in"
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:bg-white focus:outline-hidden focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20"
                        required
                      />
                      <Mail className="w-4 h-4 text-slate-400 absolute right-3 top-2.5 pointer-events-none" />
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1">
                      Strictly restricted to @recb.ac.in. Commercial email providers are prohibited.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Fifteen-Digit Enrollment Number *
                    </label>
                    <input
                      type="text"
                      maxLength={15}
                      value={regEnrollment}
                      onChange={(e) => setRegEnrollment(e.target.value.replace(/\D/g, ''))}
                      placeholder="e.g. 230735013069249"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm font-mono text-slate-900 focus:bg-white focus:outline-hidden focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20"
                      required
                    />
                    <p className="text-[10px] text-slate-500 mt-1">
                      Must be exactly 15 digits containing REC Bijnor college code <strong className="text-slate-700">0735</strong> at digits 3–6.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Mobile Number (with Country Code) *
                    </label>
                    <input
                      type="tel"
                      value={regMobile}
                      onChange={(e) => setRegMobile(e.target.value)}
                      placeholder="e.g. +919876543210"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:bg-white focus:outline-hidden focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20"
                      required
                    />
                    <p className="text-[10px] text-slate-500 mt-1">
                      Used for SMS OTP verification and high-priority maintenance alerts.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Department / Branch *
                      </label>
                      <select
                        value={regDepartment}
                        onChange={(e) => setRegDepartment(e.target.value)}
                        className="w-full px-2.5 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:bg-white focus:outline-hidden focus:border-indigo-600"
                      >
                        <option value="Computer Science & Engineering">Computer Science (CSE)</option>
                        <option value="Information Technology">Information Tech (IT)</option>
                        <option value="Electrical Engineering">Electrical Eng (EE)</option>
                        <option value="Civil Engineering">Civil Eng (CE)</option>
                        <option value="Mechanical Engineering">Mechanical Eng (ME)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Academic Year *
                      </label>
                      <select
                        value={regAcademicYear}
                        onChange={(e) => setRegAcademicYear(e.target.value)}
                        className="w-full px-2.5 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:bg-white focus:outline-hidden focus:border-indigo-600"
                      >
                        <option value="1st Year">1st Year (Freshman)</option>
                        <option value="2nd Year">2nd Year (Sophomore)</option>
                        <option value="3rd Year">3rd Year (Junior)</option>
                        <option value="4th Year">4th Year (Senior)</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Create Password (Min 8 characters) *
                    </label>
                    <div className="relative">
                      <input
                        type={showRegPassword ? 'text' : 'password'}
                        value={regPassword}
                        onChange={(e) => setRegPassword(e.target.value)}
                        placeholder="••••••••••••"
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:bg-white focus:outline-hidden focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20 pr-10"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowRegPassword(!showRegPassword)}
                        className="absolute inset-y-0 right-0 px-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                        tabIndex={-1}
                      >
                        {showRegPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Confirm Password *
                    </label>
                    <input
                      type={showRegPassword ? 'text' : 'password'}
                      value={regConfirmPassword}
                      onChange={(e) => setRegConfirmPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:bg-white focus:outline-hidden focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20"
                      required
                    />
                  </div>

                  <div className="pt-1">
                    <button
                      type="submit"
                      disabled={regLoading}
                      className="w-full py-2.5 px-4 bg-indigo-700 hover:bg-indigo-800 text-white text-sm font-semibold rounded-lg shadow-sm disabled:opacity-60 transition-colors flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {regLoading ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          <span>Generating Dual OTPs...</span>
                        </>
                      ) : (
                        <>
                          <span>Send Email & Mobile OTPs</span>
                          <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}

              {/* Step 2: Dual-OTP Independent Verification */}
              {regStep === 'verify' && (
                <div className="space-y-4">
                  {/* Institutional Disclaimer */}
                  <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-lg text-[11px] text-amber-900 leading-relaxed">
                    <strong>Important Institutional Notice:</strong> Both Email OTP and Mobile SMS OTP must be independently verified to activate your account. Verification of institutional email and mobile contact reachability validates contact accessibility and roll number format; it does not replace official identity verification by college administration.
                  </div>

                  {/* Dev / Test Auto-display if running locally */}
                  {(regDevEmailOtp || regDevSmsOtp) && (
                    <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg text-xs text-indigo-900 space-y-1">
                      <div className="font-semibold text-indigo-950 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Development Test OTPs:</span>
                      </div>
                      <div className="flex items-center gap-4 text-xs font-mono">
                        {regDevEmailOtp && (
                          <div>
                            Email OTP: <strong className="text-indigo-800">{regDevEmailOtp}</strong>
                          </div>
                        )}
                        {regDevSmsOtp && (
                          <div>
                            SMS OTP: <strong className="text-indigo-800">{regDevSmsOtp}</strong>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Channel 1: Email OTP */}
                  <div className={`p-3.5 rounded-lg border transition-colors ${emailVerified ? 'bg-emerald-50/70 border-emerald-300' : 'bg-slate-50 border-slate-200'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Mail className={`w-4 h-4 ${emailVerified ? 'text-emerald-600' : 'text-slate-600'}`} />
                        <span className="text-xs font-bold text-slate-900">1. Institutional Email OTP</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${emailVerified ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                        {emailVerified ? '✓ Verified' : 'Pending'}
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-500 mb-2">
                      Sent to: <strong className="text-slate-700 font-mono">{regMaskedEmail || regEmail}</strong> (10m expiry)
                    </p>

                    {!emailVerified ? (
                      <form onSubmit={handleVerifyEmailOtp} className="space-y-2">
                        <div className="flex gap-2">
                          <input
                            type="text"
                            maxLength={6}
                            value={emailOtp}
                            onChange={(e) => setEmailOtp(e.target.value.replace(/\D/g, ''))}
                            placeholder="6-digit email code"
                            className="flex-1 px-3 py-1.5 bg-white border border-slate-300 rounded-md text-sm font-mono font-bold tracking-widest text-center text-slate-900 focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600"
                            required
                          />
                          <button
                            type="submit"
                            disabled={emailVerifying || emailOtp.length !== 6}
                            className="px-3.5 py-1.5 bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-semibold rounded-md disabled:opacity-50 transition-colors cursor-pointer"
                          >
                            {emailVerifying ? 'Verifying...' : 'Verify Email'}
                          </button>
                        </div>

                        <div className="flex justify-end">
                          <button
                            type="button"
                            disabled={emailResendSeconds > 0 || regLoading}
                            onClick={() => handleResendDualOtp('email')}
                            className="text-[11px] text-indigo-600 hover:text-indigo-800 font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 cursor-pointer"
                          >
                            <RotateCw className="w-3 h-3" />
                            <span>{emailResendSeconds > 0 ? `Resend email OTP (${emailResendSeconds}s)` : 'Resend Email OTP'}</span>
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div className="text-xs text-emerald-700 font-medium flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span>Official email address confirmed and verified.</span>
                      </div>
                    )}
                  </div>

                  {/* Channel 2: Mobile SMS OTP */}
                  <div className={`p-3.5 rounded-lg border transition-colors ${smsVerified ? 'bg-emerald-50/70 border-emerald-300' : 'bg-slate-50 border-slate-200'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Phone className={`w-4 h-4 ${smsVerified ? 'text-emerald-600' : 'text-slate-600'}`} />
                        <span className="text-xs font-bold text-slate-900">2. Mobile SMS OTP</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${smsVerified ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                        {smsVerified ? '✓ Verified' : 'Pending'}
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-500 mb-2">
                      Sent to: <strong className="text-slate-700 font-mono">{regMaskedMobile || regMobile}</strong> (10m expiry)
                    </p>

                    {!smsVerified ? (
                      <form onSubmit={handleVerifySmsOtp} className="space-y-2">
                        <div className="flex gap-2">
                          <input
                            type="text"
                            maxLength={6}
                            value={smsOtp}
                            onChange={(e) => setSmsOtp(e.target.value.replace(/\D/g, ''))}
                            placeholder="6-digit SMS code"
                            className="flex-1 px-3 py-1.5 bg-white border border-slate-300 rounded-md text-sm font-mono font-bold tracking-widest text-center text-slate-900 focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600"
                            required
                          />
                          <button
                            type="submit"
                            disabled={smsVerifying || smsOtp.length !== 6}
                            className="px-3.5 py-1.5 bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-semibold rounded-md disabled:opacity-50 transition-colors cursor-pointer"
                          >
                            {smsVerifying ? 'Verifying...' : 'Verify SMS'}
                          </button>
                        </div>

                        <div className="flex justify-end">
                          <button
                            type="button"
                            disabled={smsResendSeconds > 0 || regLoading}
                            onClick={() => handleResendDualOtp('sms')}
                            className="text-[11px] text-indigo-600 hover:text-indigo-800 font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 cursor-pointer"
                          >
                            <RotateCw className="w-3 h-3" />
                            <span>{smsResendSeconds > 0 ? `Resend SMS OTP (${smsResendSeconds}s)` : 'Resend SMS OTP'}</span>
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div className="text-xs text-emerald-700 font-medium flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span>Mobile phone number confirmed and verified.</span>
                      </div>
                    )}
                  </div>

                  {/* Actions / Navigation */}
                  <div className="flex items-center justify-between pt-2 text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        setRegStep('request');
                        setEmailOtp('');
                        setSmsOtp('');
                        setEmailVerified(false);
                        setSmsVerified(false);
                        setRegError(null);
                        setRegMessage(null);
                      }}
                      className="text-slate-500 hover:text-slate-800 underline cursor-pointer"
                    >
                      ← Edit Registration Details
                    </button>
                  </div>
                </div>
              )}

              <div className="mt-5 pt-4 border-t border-slate-200 text-center">
                <p className="text-xs text-slate-500">
                  Already have an active account?{' '}
                  <button
                    type="button"
                    onClick={() => setActiveTab('login')}
                    className="text-indigo-600 font-semibold hover:underline cursor-pointer"
                  >
                    Sign In
                  </button>
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer Notice */}
        <p className="mt-6 text-center text-xs text-slate-400">
          Rajkiya Engineering College, Jhalu Road, Bijnor, UP 246701 · AI Systems Lab
        </p>
      </div>

      {/* First-Time Administrator Setup Modal */}
      {showSetupModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-slate-200 relative">
            <div className="flex items-center gap-2.5 mb-2">
              <Shield className="w-6 h-6 text-indigo-600" />
              <h3 className="text-lg font-bold text-slate-900">Provision First Administrator</h3>
            </div>
            <p className="text-xs text-slate-500 mb-5">
              Configure the root administrator account for Rajkiya Engineering College Bijnor. This setup will be permanently locked once created.
            </p>

            {setupError && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-xs text-rose-800 rounded-lg flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{setupError}</span>
              </div>
            )}

            <form onSubmit={handleInitialAdminSetup} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Full Name & Title *
                </label>
                <input
                  type="text"
                  value={setupData.name}
                  onChange={(e) => setSetupData({ ...setupData, name: e.target.value })}
                  placeholder="e.g. Prof. Rajesh Sharma (Dean Student Welfare)"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Official College Email *
                  </label>
                  <input
                    type="email"
                    value={setupData.email}
                    onChange={(e) => setSetupData({ ...setupData, email: e.target.value })}
                    placeholder="admin@recb.ac.in"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Login Identifier (Username)
                  </label>
                  <input
                    type="text"
                    value={setupData.identifier}
                    onChange={(e) => setSetupData({ ...setupData, identifier: e.target.value })}
                    placeholder="e.g. admin or dean.sw"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Department / Office
                  </label>
                  <input
                    type="text"
                    value={setupData.department}
                    onChange={(e) => setSetupData({ ...setupData, department: e.target.value })}
                    placeholder="Deanery / Administration"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Mobile Number
                  </label>
                  <input
                    type="tel"
                    value={setupData.mobileNumber}
                    onChange={(e) => setSetupData({ ...setupData, mobileNumber: e.target.value })}
                    placeholder="+91 94120 12345"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Secure Password (Minimum 8 characters) *
                </label>
                <input
                  type="password"
                  value={setupData.password}
                  onChange={(e) => setSetupData({ ...setupData, password: e.target.value })}
                  placeholder="Create a strong password"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 mt-4">
                <button
                  type="button"
                  onClick={() => setShowSetupModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={setupLoading}
                  className="px-5 py-2 text-xs font-semibold text-white bg-indigo-700 hover:bg-indigo-800 rounded-lg shadow-xs disabled:opacity-60 flex items-center gap-1.5 cursor-pointer"
                >
                  {setupLoading ? 'Creating Administrator...' : 'Create Admin Account & Sign In'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Forgot Password Modal */}
      {showForgotModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl border border-slate-200 relative">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <HelpCircle className="w-5 h-5 text-indigo-600" />
              <span>Password Recovery & Reset</span>
            </h3>

            {forgotMessage && (
              <div className="mt-3 p-3 bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 rounded-lg flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>{forgotMessage}</span>
              </div>
            )}

            {forgotError && (
              <div className="mt-3 p-3 bg-rose-50 border border-rose-200 text-xs text-rose-800 rounded-lg flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{forgotError}</span>
              </div>
            )}

            {forgotStep === 'request' ? (
              <form onSubmit={handleRequestReset} className="mt-4 space-y-4">
                <p className="text-xs text-slate-600 leading-relaxed">
                  Enter your registered institutional email or enrollment number. A single-use verification token will be dispatched.
                </p>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Institutional Email / Identifier
                  </label>
                  <input
                    type="text"
                    value={forgotIdentifier}
                    onChange={(e) => setForgotIdentifier(e.target.value)}
                    placeholder="e.g. your.email@recb.ac.in or 2201330100045"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900"
                    required
                  />
                </div>
                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowForgotModal(false)}
                    className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-xs font-semibold text-white bg-indigo-700 hover:bg-indigo-800 rounded-lg shadow-xs cursor-pointer"
                  >
                    Send Reset Token
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleConfirmReset} className="mt-4 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Verification Token (6 characters)
                  </label>
                  <input
                    type="text"
                    value={resetToken}
                    onChange={(e) => setResetToken(e.target.value)}
                    placeholder="Enter Token"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    New Secure Password
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Minimum 6 characters"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm"
                    required
                  />
                </div>
                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setForgotStep('request');
                      setShowForgotModal(false);
                    }}
                    className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                  >
                    Close
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg shadow-xs cursor-pointer"
                  >
                    Update Password
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
