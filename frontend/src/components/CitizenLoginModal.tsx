import React, { useState } from 'react'
import {
  X,
  ShieldCheck,
  User,
  Phone,
  CreditCard,
  KeyRound,
  CheckCircle2,
  ArrowRight,
  Loader2,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import type { CitizenUser } from '../types/cadastre'

interface CitizenLoginModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: (user: CitizenUser) => void
}

export const CitizenLoginModal: React.FC<CitizenLoginModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { citizenUser, loginCitizen, logoutCitizen } = useAuth()

  const [step, setStep] = useState<'details' | 'otp'>('details')
  const [name, setName] = useState('Siddharth Swami')
  const [citizenId, setCitizenId] = useState('')
  const [phone, setPhone] = useState('9876543210')
  const [otp, setOtp] = useState('882910')
  const [loading, setLoading] = useState(false)
  const [successToast, setSuccessToast] = useState(false)

  if (!isOpen) return null

  const handleDetailsSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setTimeout(() => {
      setLoading(false)
      setStep('otp')
    }, 300)
  }

  const handleVerifyOtp = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    setLoading(true)

    setTimeout(() => {
      const authenticatedUser: CitizenUser = {
        name: name.trim() || 'Siddharth Swami',
        phone: phone.trim() || '9876543210',
        citizenId: citizenId.trim() || '5849 2049 1928',
        isVerified: true,
      }

      loginCitizen(authenticatedUser)
      setLoading(false)
      setSuccessToast(true)

      setTimeout(() => {
        if (onSuccess) onSuccess(authenticatedUser)
        setSuccessToast(false)
        setStep('details')
        onClose()
      }, 700)
    }, 350)
  }

  const handleLogout = () => {
    logoutCitizen()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in">
      <div className="neu-raised border border-emerald-500/30 bg-slate-900/95 rounded-2xl w-full max-w-md shadow-2xl text-white overflow-hidden shadow-emerald-950/40">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                Citizen Cadastral Verification
              </h2>
              <p className="text-slate-400 text-xs">
                Unlock Title Deeds & 3D Land Registries
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg neu-btn text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Success Banner */}
        {successToast && (
          <div className="p-3 mx-5 mt-4 neu-inset border border-emerald-500/50 rounded-xl text-emerald-300 text-xs flex items-center gap-2 animate-fade-in bg-emerald-950/30">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span className="font-semibold">
              Citizen identity verified! Unlocking cadastral title deeds...
            </span>
          </div>
        )}

        {/* If Citizen is already logged in */}
        {citizenUser && !successToast ? (
          <div className="p-6 space-y-4">
            <div className="neu-inset border border-emerald-500/40 rounded-xl p-4 space-y-2.5 bg-emerald-950/20">
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs uppercase tracking-wider">
                <CheckCircle2 className="w-4 h-4" />
                Active Verified Citizen Session
              </div>
              <div className="space-y-1 text-xs">
                <p className="text-slate-300">
                  <span className="text-slate-400 font-medium">Name: </span>
                  <span className="font-bold text-white">{citizenUser.name}</span>
                </p>
                <p className="text-slate-300">
                  <span className="text-slate-400 font-medium">Phone: </span>
                  <span className="font-mono text-emerald-300">{citizenUser.phone}</span>
                </p>
                {citizenUser.citizenId && (
                  <p className="text-slate-300">
                    <span className="text-slate-400 font-medium">Citizen ID: </span>
                    <span className="font-mono text-cyan-300">{citizenUser.citizenId}</span>
                  </p>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 neu-btn text-white font-semibold text-xs rounded-xl transition-all cursor-pointer"
              >
                Close & View Deeds
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="px-4 py-2.5 neu-btn text-rose-300 hover:text-rose-200 border border-rose-500/30 font-semibold text-xs rounded-xl transition-all cursor-pointer"
              >
                Sign Out
              </button>
            </div>
          </div>
        ) : (
          /* Form Step: Details vs OTP */
          <div className="p-6 space-y-4">
            {step === 'details' ? (
              <form onSubmit={handleDetailsSubmit} className="space-y-3.5">
                {/* Full Name */}
                <div>
                  <label className="block text-[11px] font-semibold text-emerald-300/90 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                    <User className="w-3 h-3 text-emerald-400" />
                    Full Name (As per Land Records)
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g., Siddharth Swami"
                    className="w-full neu-inset border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-400/50 focus:border-emerald-400 transition-all font-medium"
                  />
                </div>

                {/* Citizen ID / Identification */}
                <div>
                  <label className="block text-[11px] font-semibold text-emerald-300/90 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                    <CreditCard className="w-3 h-3 text-emerald-400" />
                    Citizen ID / Identification No.
                  </label>
                  <input
                    type="text"
                    value={citizenId}
                    onChange={(e) => setCitizenId(e.target.value)}
                    placeholder="XXXX XXXX XXXX"
                    className="w-full neu-inset border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-400/50 focus:border-emerald-400 font-mono transition-all"
                  />
                </div>

                {/* Phone Number */}
                <div>
                  <label className="block text-[11px] font-semibold text-emerald-300/90 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                    <Phone className="w-3 h-3 text-emerald-400" />
                    Mobile Phone (10-Digit)
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="9876543210"
                    className="w-full neu-inset border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-400/50 focus:border-emerald-400 font-mono transition-all"
                  />
                </div>

                {/* Submit */}
                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-950/50 cursor-pointer active:scale-[0.98]"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Generating Instant OTP...
                      </>
                    ) : (
                      <>
                        <span>Continue to OTP Verification</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </>
                    )}
                  </button>
                </div>
              </form>
            ) : (
              /* Step 2: OTP Verification */
              <form onSubmit={handleVerifyOtp} className="space-y-4 animate-fade-in">
                <div className="neu-inset-sm border border-emerald-500/30 p-3 rounded-xl bg-slate-950/60 text-center space-y-1">
                  <span className="text-[10px] text-slate-400 font-medium block">
                    One-Time Password Sent to +91 {phone || '9876543210'}
                  </span>
                  <p className="text-xs font-semibold text-emerald-300">
                    Auto-Verification Active • Any code will succeed
                  </p>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-emerald-300/90 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                    <KeyRound className="w-3 h-3 text-emerald-400" />
                    Enter 6-Digit OTP
                  </label>
                  <input
                    type="text"
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    placeholder="882910"
                    className="w-full neu-inset border border-slate-800 rounded-xl px-3 py-2.5 text-center text-sm text-emerald-300 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-400/50 focus:border-emerald-400 font-mono font-bold tracking-widest transition-all"
                  />
                </div>

                <div className="pt-2 space-y-2">
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-950/50 cursor-pointer active:scale-[0.98]"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Verifying & Unlocking...
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-3.5 h-3.5" />
                        Verify & Unlock Deeds
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setStep('details')}
                    className="w-full py-1.5 text-slate-400 hover:text-slate-200 text-[11px] font-medium transition-colors"
                  >
                    ← Edit Citizen Details
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
