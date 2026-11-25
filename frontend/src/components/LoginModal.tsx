import React, { useState } from 'react'
import {
  X,
  Shield,
  ShieldCheck,
  User,
  Lock,
  Mail,
  LogOut,
  Building2,
  FileText,
  Sun,
  Eye,
  AlertCircle,
  Loader2,
  CheckCircle2,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'

interface LoginModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: (role: string) => void
}

export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const {
    userRole,
    isAuthenticated,
    adminUser,
    login,
    loginAsCitizen,
    logout,
  } = useAuth()

  const [activeTab, setActiveTab] = useState<'citizen' | 'admin'>(
    userRole === 'ADMIN' ? 'admin' : 'citizen'
  )
  const [email, setEmail] = useState('admin@rera.gov.in')
  const [password, setPassword] = useState('admin123')
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  if (!isOpen) return null

  const handleAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)
    setSuccessMessage(null)
    setLoading(true)
    try {
      const ok = await login(email, password)
      if (ok) {
        setSuccessMessage('Successfully authenticated as Cadastral Administrator')
        setTimeout(() => {
          if (onSuccess) onSuccess('ADMIN')
          onClose()
        }, 800)
      } else {
        setErrorMessage(
          'Invalid credentials. Use demo credentials: admin@rera.gov.in / admin123'
        )
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Authentication failed')
    } finally {
      setLoading(false)
    }
  }

  const handleSelectCitizen = () => {
    loginAsCitizen()
    if (onSuccess) onSuccess('CITIZEN')
    onClose()
  }

  const handleLogout = () => {
    logout()
    setSuccessMessage('Switched to Citizen / Public Viewer Mode')
    setTimeout(() => {
      if (onSuccess) onSuccess('CITIZEN')
      onClose()
    }, 600)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in">
      <div className="neu-raised border border-[var(--neu-border)] bg-[var(--neu-base)] neu-surface rounded-2xl w-full max-w-lg shadow-2xl text-white overflow-hidden">
        {/* Header with Close */}
        <div className="flex items-center justify-between p-5 border-b border-[var(--neu-border)] neu-flat">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center">
              {userRole === 'ADMIN' ? (
                <ShieldCheck className="w-5 h-5 text-cyan-400" />
              ) : (
                <Shield className="w-5 h-5 text-slate-400" />
              )}
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                Cadastral Access & Governance
              </h2>
              <p className="text-slate-400 text-xs">
                Role-Based Access Control (RBAC) Portal
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg neu-button text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="p-4 border-b border-[var(--neu-border)] flex gap-2">
          <button
            type="button"
            onClick={() => {
              setActiveTab('citizen')
              setErrorMessage(null)
            }}
            className={`flex-1 py-2.5 px-3 rounded-xl font-semibold text-xs transition-all flex items-center justify-center gap-2 border ${
              activeTab === 'citizen'
                ? 'neu-inset text-white border-[var(--neu-border)] shadow-md font-bold'
                : 'neu-button text-slate-400 border-transparent hover:text-slate-200'
            }`}
          >
            <User className="w-3.5 h-3.5 text-slate-400" />
            Citizen / Viewer Mode
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('admin')
              setErrorMessage(null)
            }}
            className={`flex-1 py-2.5 px-3 rounded-xl font-semibold text-xs transition-all flex items-center justify-center gap-2 border ${
              activeTab === 'admin'
                ? 'neu-inset text-cyan-200 border-cyan-500/50 shadow-md font-bold'
                : 'neu-button text-slate-400 border-transparent hover:text-cyan-300'
            }`}
          >
            <Shield className="w-3.5 h-3.5 text-cyan-400" />
            Cadastral Administrator
          </button>
        </div>

        {/* Tab 1: Citizen / Public Viewer */}
        {activeTab === 'citizen' && (
          <div className="p-6 space-y-4">
            <div className="neu-inset border border-[var(--neu-border)] rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2 text-cyan-400 font-bold text-xs uppercase tracking-wider">
                <Eye className="w-4 h-4" />
                Public Transparency Features
              </div>
              <ul className="text-xs text-slate-300 space-y-2">
                <li className="flex items-start gap-2">
                  <Building2 className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0 mt-0.5" />
                  <span>
                    Explore interactive 3D cadastre prisms, volumetric boundaries, and floor layouts.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <Sun className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
                  <span>
                    Audit solar rooftop potential, estimated clean kW capacity, and usable surface areas.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <FileText className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
                  <span>
                    Download legal 3D Cadastral Deed & Solar Audit Certificates (.txt).
                  </span>
                </li>
              </ul>
            </div>

            {userRole === 'CITIZEN' ? (
              <div className="p-3 bg-emerald-500/15 border border-emerald-500/30 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span>You are currently browsing in Public Citizen Mode.</span>
              </div>
            ) : (
              <div className="p-3 bg-cyan-950/30 border border-cyan-800/40 rounded-xl text-xs text-cyan-300 flex items-center justify-between">
                <span>Currently in Officer Mode.</span>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="px-2.5 py-1 neu-button text-white rounded-lg text-[11px] font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <LogOut className="w-3 h-3 text-slate-500" />
                  Switch to Public
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={handleSelectCitizen}
              className="w-full py-2.5 neu-button text-white font-semibold text-xs rounded-xl transition-colors border border-[var(--neu-border)]"
            >
              Continue as Public Citizen
            </button>
          </div>
        )}

        {/* Tab 2: Cadastral Administrator */}
        {activeTab === 'admin' && (
          <div className="p-6 space-y-4">
            {isAuthenticated && adminUser ? (
              // If already logged in as Admin
              <div className="space-y-4">
                <div className="neu-inset border border-cyan-500/40 rounded-xl p-4 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3" />
                      Active Officer Session
                    </span>
                    <span className="text-[11px] font-mono text-slate-400">
                      {adminUser.badgeId}
                    </span>
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-white">{adminUser.name}</h3>
                    <p className="text-xs text-slate-300">{adminUser.department}</p>
                    <p className="text-[11px] text-cyan-400 font-mono mt-0.5">
                      Jurisdiction: {adminUser.jurisdiction}
                    </p>
                  </div>
                  <div className="pt-2 border-t border-[var(--neu-border)] text-[11px] text-slate-300 space-y-1">
                    <p>✓ Title & Registry Modification Privileges</p>
                    <p>✓ 3D Volumetric Dispute Resolution Authority</p>
                    <p>✓ Cadastral Regularization & Demolition Orders</p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs rounded-xl transition-colors shadow-lg neu-button"
                  >
                    Open Admin Workspace
                  </button>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="px-4 py-2.5 neu-button hover:text-rose-600 text-slate-300 font-semibold text-xs rounded-xl transition-colors border border-[var(--neu-border)] flex items-center gap-1.5"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Sign Out
                  </button>
                </div>
              </div>
            ) : (
              // Admin Login Form
              <form onSubmit={handleAdminSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center justify-between">
                    <span>Officer Email / ID</span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      admin@rera.gov.in
                    </span>
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="e.g., admin@rera.gov.in"
                      className="w-full pl-9 pr-3.5 py-2 bg-slate-900/80 border border-slate-700 rounded-xl text-slate-100 text-xs placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center justify-between">
                    <span>Password</span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      admin123
                    </span>
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-9 pr-3.5 py-2 bg-slate-900/80 border border-slate-700 rounded-xl text-slate-100 text-xs placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
                      required
                    />
                  </div>
                </div>

                {errorMessage && (
                  <div className="p-3 bg-rose-500/15 border border-rose-500/40 rounded-xl text-xs text-rose-300 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
                    <span>{errorMessage}</span>
                  </div>
                )}

                {successMessage && (
                  <div className="p-3 bg-emerald-500/15 border border-emerald-500/40 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    <span>{successMessage}</span>
                  </div>
                )}

                <div className="pt-1">
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 neu-button bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-bold text-xs rounded-xl transition-colors shadow-md flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Verifying Credentials...
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4" />
                        Sign In as Cadastral Officer
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="p-3.5 neu-flat border-t border-[var(--neu-border)] text-center text-[10px] text-slate-500 font-mono">
          State Cadastral Registry | RERA Karnataka & National Spatial Data Infrastructure
        </div>
      </div>
    </div>
  )
}
