import React, { useState, useEffect } from 'react'
import api from '../lib/api'
import {
  X,
  ShieldCheck,
  AlertTriangle,
  FileText,
  User,
  Phone,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  Inbox,
  Gavel,
  UploadCloud,
  FileCheck,
  ChevronDown,
  ChevronUp,
  Building2,
  FileBadge,
  Sparkles,
  Check,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import type { GrievanceRecord } from '../types/cadastre'

interface OfficerGrievanceModalProps {
  isOpen: boolean
  onClose: () => void
  onGrievanceAdjudicated?: (
    updatedUnitUlpin3d: string | null,
    action: 'APPROVE' | 'REJECT',
    remarks: string
  ) => void
  onGrievanceResolved?: (
    resolvedUnitUlpin3d: string,
    resolutionReason: string,
    notes: string
  ) => void
}

type TabType = 'ALL' | 'PENDING' | 'APPROVED' | 'RESOLVED'

const RESOLUTION_REASONS = [
  'Boundary Regularization',
  'Deed Rectification',
  'Encroachment Demolished',
  'Mutual Settlement',
  'Survey Correction',
  'Demolition Order Enforced',
  'False Positive Override',
]

function formatApiError(err: any, fallback: string = 'An error occurred'): string {
  const detail = err?.response?.data?.detail
  if (!detail) return err?.message || fallback
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail
      .map((item: any) => {
        const field = Array.isArray(item.loc) ? item.loc.slice(1).join('.') : item.loc || 'field'
        return `${field}: ${item.msg || 'invalid'}`
      })
      .join('\n')
  }
  if (typeof detail === 'object') {
    return JSON.stringify(detail, null, 2)
  }
  return String(detail)
}

export const OfficerGrievanceModal: React.FC<OfficerGrievanceModalProps> = ({
  isOpen,
  onClose,
  onGrievanceAdjudicated,
  onGrievanceResolved,
}) => {
  const { adminUser } = useAuth()

  const [activeTab, setActiveTab] = useState<TabType>('PENDING')
  const [grievances, setGrievances] = useState<GrievanceRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [remarksMap, setRemarksMap] = useState<Record<string, string>>({})
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [actionSuccessToast, setActionSuccessToast] = useState<string | null>(null)

  // Dispute resolution form state for active/approved items
  const [expandedResolveId, setExpandedResolveId] = useState<string | null>(null)
  const [resolveReason, setResolveReason] = useState<string>('Boundary Regularization')
  const [resolveNotes, setResolveNotes] = useState<string>('')
  const [uploadedDocName, setUploadedDocName] = useState<string>('')

  const fetchGrievances = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await api.get<GrievanceRecord[]>('/api/parcels/grievances')
      setGrievances(response.data)
    } catch (err: any) {
      console.error('Failed to fetch grievances:', err)
      setError(
        err.response?.data?.detail || 'Failed to fetch citizen grievances from server.'
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen) {
      fetchGrievances()
      setActionSuccessToast(null)
      setExpandedResolveId(null)
      setResolveNotes('')
      setUploadedDocName('')
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleRemarkChange = (id: string, text: string) => {
    setRemarksMap((prev) => ({
      ...prev,
      [id]: text,
    }))
  }

  // Pending adjudication (Approve -> Flag Clashing / Reject -> Dismiss)
  const handleAdjudicate = async (
    grievance: GrievanceRecord,
    action: 'APPROVE' | 'REJECT'
  ) => {
    const rawRemarks = (remarksMap[grievance.id] || '').trim()
    const remarks =
      rawRemarks ||
      (action === 'APPROVE'
        ? 'Site survey and LiDAR cadastral verification confirmed spatial overlap.'
        : 'Cadastral audit review and field inspection completed. No actionable encroachment found.')

    setProcessingId(grievance.id)
    try {
      const officerId = adminUser
        ? `${adminUser.name} (${adminUser.badgeId})`
        : 'Dr. R. Venkatraman, IAS (KA-REV-CAD-0491)'

      const response = await api.post<GrievanceRecord>(
        `/api/parcels/grievances/${grievance.id}/action`,
        {
          action,
          officer_remarks: remarks,
          officer_id: officerId,
        }
      )

      // Update state with updated grievance record
      setGrievances((prev) =>
        prev.map((g) => (g.id === grievance.id ? response.data : g))
      )

      const successMsg =
        action === 'APPROVE'
          ? `✓ Grievance Approved: 3D Unit ${grievance.ulpin_3d.slice(0, 14)} flagged with spatial conflict.`
          : `✓ Grievance Dismissed: Record updated without spatial conflict.`
      setActionSuccessToast(successMsg)
      setTimeout(() => setActionSuccessToast(null), 4000)

      if (onGrievanceAdjudicated) {
        onGrievanceAdjudicated(
          action === 'APPROVE' ? grievance.ulpin_3d : null,
          action,
          remarks
        )
      }
    } catch (err: any) {
      console.error('Adjudication failed:', err)
      alert(formatApiError(err, 'Failed to process grievance adjudication.'))
    } finally {
      setProcessingId(null)
    }
  }

  // Final dispute resolution (Approved -> Resolved & reset clash)
  const handleResolveDispute = async (grievance: GrievanceRecord) => {
    const notes =
      resolveNotes.trim() ||
      `Dispute legally regularized via ${resolveReason} under Cadastral Act 2026.`

    setProcessingId(grievance.id)
    try {
      const officerId = adminUser
        ? `${adminUser.name} (${adminUser.badgeId})`
        : 'Dr. R. Venkatraman, IAS (KA-REV-CAD-0491)'

      const docName =
        uploadedDocName.trim() ||
        `Cadastral_Order_${grievance.plot_number || 'PARCEL'}_${grievance.flat_number || 'UNIT'}.pdf`

      const response = await api.post<GrievanceRecord>(
        `/api/parcels/grievances/${grievance.id}/resolve`,
        {
          resolution_reason: resolveReason,
          resolution_notes: notes,
          officer_id: officerId,
          document_filename: docName,
        }
      )

      // Update local state with the resolved record
      setGrievances((prev) =>
        prev.map((g) => (g.id === grievance.id ? response.data : g))
      )

      setExpandedResolveId(null)
      setResolveNotes('')
      setUploadedDocName('')

      const successMsg = `✓ Dispute Legally Resolved: 3D Unit ${grievance.ulpin_3d.slice(0, 14)} restored to baseline status.`
      setActionSuccessToast(successMsg)
      setTimeout(() => setActionSuccessToast(null), 4500)

      if (onGrievanceResolved) {
        onGrievanceResolved(grievance.ulpin_3d, resolveReason, notes)
      }
    } catch (err: any) {
      console.error('Resolution failed:', err)
      alert(formatApiError(err, 'Failed to resolve dispute.'))
    } finally {
      setProcessingId(null)
    }
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setUploadedDocName(file.name)
    }
  }

  // Filter grievances according to the active tab
  const filteredGrievances = grievances.filter((g) => {
    if (activeTab === 'ALL') return true
    return g.status === activeTab
  })

  // Tab counts
  const pendingCount = grievances.filter((g) => g.status === 'PENDING').length
  const approvedCount = grievances.filter((g) => g.status === 'APPROVED').length
  const resolvedCount = grievances.filter((g) => g.status === 'RESOLVED').length
  const allCount = grievances.length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in select-none">
      <div className="relative w-full max-w-4xl max-h-[92vh] flex flex-col bg-slate-900 border border-amber-500/40 rounded-2xl shadow-2xl shadow-amber-950/40 text-slate-100 overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/80 flex-shrink-0">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shadow-sm shadow-amber-500/20">
              <Gavel className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-tight">
                  Cadastral Dispute Adjudication & Resolution
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold font-mono bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  OFFICIAL AUTHORITY
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Adjudicate citizen encroachment disputes & execute certified 3D cadastral regularizations
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchGrievances}
              disabled={loading}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer border border-slate-700 flex items-center gap-1.5 text-xs font-semibold"
              title="Refresh Grievances"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-amber-400' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer border border-slate-700"
              title="Close Modal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tab Filter Bar */}
        <div className="flex items-center justify-between px-6 py-2.5 bg-slate-950/50 border-b border-slate-800/80 flex-shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('PENDING')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer border ${
                activeTab === 'PENDING'
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-sm'
                  : 'bg-slate-800/60 text-slate-400 border-slate-700/60 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              <span>Pending Review</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                  activeTab === 'PENDING'
                    ? 'bg-amber-500 text-slate-950 font-extrabold'
                    : 'bg-slate-700 text-slate-300'
                }`}
              >
                {pendingCount}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('APPROVED')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer border ${
                activeTab === 'APPROVED'
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/50 shadow-sm'
                  : 'bg-slate-800/60 text-slate-400 border-slate-700/60 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5 text-rose-400" />
              <span>Active Conflicts</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                  activeTab === 'APPROVED'
                    ? 'bg-rose-500 text-white font-extrabold'
                    : 'bg-slate-700 text-slate-300'
                }`}
              >
                {approvedCount}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('RESOLVED')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer border ${
                activeTab === 'RESOLVED'
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-sm'
                  : 'bg-slate-800/60 text-slate-400 border-slate-700/60 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Resolved Cases</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                  activeTab === 'RESOLVED'
                    ? 'bg-emerald-500 text-slate-950 font-extrabold'
                    : 'bg-slate-700 text-slate-300'
                }`}
              >
                {resolvedCount}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('ALL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer border ${
                activeTab === 'ALL'
                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 shadow-sm'
                  : 'bg-slate-800/60 text-slate-400 border-slate-700/60 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <span>All Disputes</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                  activeTab === 'ALL'
                    ? 'bg-cyan-500 text-slate-950 font-extrabold'
                    : 'bg-slate-700 text-slate-300'
                }`}
              >
                {allCount}
              </span>
            </button>
          </div>

          <div className="text-[11px] text-slate-400 font-mono hidden md:block">
            PostGIS Polyhedral Cadastre Engine
          </div>
        </div>

        {/* Action Success Toast */}
        {actionSuccessToast && (
          <div className="px-6 py-2.5 bg-emerald-950/80 border-b border-emerald-500/50 text-emerald-300 text-xs font-semibold flex items-center gap-2 animate-fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span>{actionSuccessToast}</span>
          </div>
        )}

        {/* Modal Body / Grievance Cards List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {loading && grievances.length === 0 && (
            <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-400">
              <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
              <p className="text-sm font-medium">Fetching 3D cadastral dispute records...</p>
            </div>
          )}

          {error && (
            <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-200 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-bold text-rose-300">Failed to Load Grievances</h4>
                <p className="text-xs text-rose-300/80 mt-0.5">{error}</p>
              </div>
            </div>
          )}

          {!loading && filteredGrievances.length === 0 && !error && (
            <div className="py-16 flex flex-col items-center justify-center gap-3 text-center">
              <div className="w-14 h-14 rounded-2xl bg-slate-800/80 border border-slate-700/80 flex items-center justify-center text-slate-500">
                <Inbox className="w-7 h-7" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-300">
                  {activeTab === 'PENDING'
                    ? 'No Pending Grievances'
                    : activeTab === 'APPROVED'
                    ? 'No Active Disputed Units'
                    : activeTab === 'RESOLVED'
                    ? 'No Resolved Disputes Yet'
                    : 'No Dispute Records Found'}
                </h3>
                <p className="text-xs text-slate-400 mt-1 max-w-sm">
                  {activeTab === 'PENDING'
                    ? 'All citizen dispute requests have been reviewed and adjudicated.'
                    : activeTab === 'APPROVED'
                    ? 'There are currently no active unresolved volumetric conflicts.'
                    : 'Records will populate dynamically as citizen complaints are adjudicated.'}
                </p>
              </div>
            </div>
          )}

          {filteredGrievances.map((grievance) => {
            const isProcessing = processingId === grievance.id
            const remarks = remarksMap[grievance.id] || ''
            const isResolveDrawerOpen = expandedResolveId === grievance.id

            return (
              <div
                key={grievance.id}
                className={`p-5 rounded-xl border bg-slate-900/90 shadow-md space-y-4 transition-all ${
                  grievance.status === 'APPROVED'
                    ? 'border-rose-500/40 bg-rose-950/10'
                    : grievance.status === 'RESOLVED'
                    ? 'border-emerald-500/40 bg-emerald-950/10'
                    : grievance.status === 'REJECTED'
                    ? 'border-slate-800 bg-slate-950/40 opacity-75'
                    : 'border-amber-500/30 hover:border-amber-500/50'
                }`}
              >
                {/* Header: Status badge, Citizen details & Target unit */}
                <div className="flex items-start justify-between gap-4 flex-wrap pb-3 border-b border-slate-800">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Status Badge */}
                      {grievance.status === 'PENDING' && (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3 text-amber-400" />
                          PENDING ADJUDICATION
                        </span>
                      )}
                      {grievance.status === 'APPROVED' && (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono bg-rose-500/20 text-rose-300 border border-rose-500/40 flex items-center gap-1">
                          <ShieldCheck className="w-3 h-3 text-rose-400" />
                          ACTIVE DISPUTE • CONFLICT FLAGGED
                        </span>
                      )}
                      {grievance.status === 'RESOLVED' && (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          DISPUTE RESOLVED & REGULARIZED
                        </span>
                      )}
                      {grievance.status === 'REJECTED' && (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono bg-slate-800 text-slate-400 border border-slate-700 flex items-center gap-1">
                          <XCircle className="w-3 h-3 text-slate-400" />
                          DISMISSED
                        </span>
                      )}

                      {/* Building Name Tag */}
                      {grievance.building_name && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 flex items-center gap-1">
                          <Building2 className="w-3 h-3 text-cyan-400" />
                          {grievance.building_name}
                        </span>
                      )}

                      {/* Plot and Flat Tag */}
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-800 text-slate-200 border border-slate-700">
                        {grievance.plot_number || 'PARCEL'}{' '}
                        {grievance.flat_number ? `• Flat ${grievance.flat_number}` : ''}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-xs text-slate-300 flex-wrap">
                      <span className="font-semibold text-white flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-cyan-400" />
                        Applicant: {grievance.citizen_name}
                      </span>
                      {grievance.citizen_phone && (
                        <span className="text-slate-400 flex items-center gap-1.5 font-mono text-[11px]">
                          <Phone className="w-3 h-3 text-slate-500" />
                          {grievance.citizen_phone}
                        </span>
                      )}
                      <span className="text-slate-400 font-mono text-[11px]">
                        ULPIN 3D: {grievance.ulpin_3d.slice(0, 18)}...
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-mono">
                    <Clock className="w-3.5 h-3.5 text-slate-500" />
                    <span>Lodged: {new Date(grievance.created_at).toLocaleString()}</span>
                  </div>
                </div>

                {/* Complaint Text */}
                <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80">
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-amber-400" />
                    Applicant Description of Encroachment / Grievance:
                  </p>
                  <p className="text-xs text-slate-200 leading-relaxed font-sans">
                    {grievance.description}
                  </p>
                </div>

                {/* --- Section 1: PENDING Adjudication Form --- */}
                {grievance.status === 'PENDING' && (
                  <div className="space-y-3 pt-1">
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider flex items-center justify-between">
                        <span>
                          Surveyor / Cadastral Audit Remarks <span className="text-rose-400">*</span>
                        </span>
                        <span className="text-[10px] text-slate-400 font-normal lowercase">
                          mandatory for audit trail
                        </span>
                      </label>
                      <textarea
                        rows={2}
                        value={remarks}
                        onChange={(e) => handleRemarkChange(grievance.id, e.target.value)}
                        placeholder="Enter official survey findings, LiDAR verification details, or legal rationale..."
                        className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-100 placeholder-slate-600 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all font-sans"
                      />
                    </div>

                    <div className="flex items-center justify-end gap-3 pt-1">
                      <button
                        onClick={() => handleAdjudicate(grievance, 'REJECT')}
                        disabled={isProcessing || !remarks.trim()}
                        className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 border border-slate-700 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                        title="Dismiss complaint without marking unit as clashing"
                      >
                        {isProcessing ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5 text-slate-400" />
                        )}
                        <span>Reject / Dismiss</span>
                      </button>

                      <button
                        onClick={() => handleAdjudicate(grievance, 'APPROVE')}
                        disabled={isProcessing || !remarks.trim()}
                        className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-900/30 border border-rose-500/50 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                        title="Approve complaint and flag 3D unit with active volumetric conflict"
                      >
                        {isProcessing ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <AlertTriangle className="w-3.5 h-3.5 text-white" />
                        )}
                        <span>Approve & Flag Conflict</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* --- Section 2: APPROVED Dispute Card & Resolution Drawer --- */}
                {grievance.status === 'APPROVED' && (
                  <div className="space-y-3 pt-1">
                    {/* Previous Officer Remarks */}
                    <div className="p-3 rounded-lg bg-rose-950/30 border border-rose-500/30 text-xs text-rose-200">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="font-bold text-rose-300 flex items-center gap-1.5">
                          <ShieldCheck className="w-3.5 h-3.5 text-rose-400" />
                          Adjudicated by: {grievance.officer_id || 'Cadastral Officer'}
                        </span>
                        {grievance.resolved_at && (
                          <span className="text-[10px] font-mono text-rose-400">
                            {new Date(grievance.resolved_at).toLocaleString()}
                          </span>
                        )}
                      </div>
                      <p className="text-slate-300 font-sans">{grievance.officer_remarks}</p>
                    </div>

                    {/* Toggle Button for Dispute Resolution Drawer */}
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-xs text-amber-300/80 font-medium">
                        ⚠️ 3D unit is currently rendered in Red (Volumetric Clash State)
                      </span>

                      <button
                        onClick={() =>
                          setExpandedResolveId(isResolveDrawerOpen ? null : grievance.id)
                        }
                        className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-slate-950 transition-all cursor-pointer border border-emerald-400 shadow-md shadow-emerald-950/40 active:scale-95"
                      >
                        <FileCheck className="w-3.5 h-3.5" />
                        <span>{isResolveDrawerOpen ? 'Close Resolution Panel' : 'Resolve Dispute & Regularize'}</span>
                        {isResolveDrawerOpen ? (
                          <ChevronUp className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>

                    {/* Expandable Resolution Drawer */}
                    {isResolveDrawerOpen && (
                      <div className="p-4 rounded-xl bg-slate-950 border border-emerald-500/40 space-y-3.5 animate-fade-in">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                          <h4 className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5" />
                            Official Cadastral Resolution & Regularization Order
                          </h4>
                          <span className="text-[10px] text-slate-400 font-mono">
                            Form 14-B Legal Deed Settlement
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {/* Resolution Reason Select */}
                          <div className="space-y-1">
                            <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                              Resolution Action / Reason <span className="text-rose-400">*</span>
                            </label>
                            <select
                              value={resolveReason}
                              onChange={(e) => setResolveReason(e.target.value)}
                              className="w-full px-3 py-2 text-xs bg-slate-900 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 font-sans"
                            >
                              {RESOLUTION_REASONS.map((r) => (
                                <option key={r} value={r}>
                                  {r}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Certified Proof Document Upload */}
                          <div className="space-y-1">
                            <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                              Certified Proof Document (PDF/CAD)
                            </label>
                            <label className="flex items-center justify-center gap-2 px-3 py-2 bg-slate-900 border border-dashed border-slate-700 hover:border-emerald-500/70 rounded-lg text-xs text-slate-300 cursor-pointer transition-all">
                              <UploadCloud className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                              <span className="truncate max-w-[200px]">
                                {uploadedDocName || 'Upload Deed / Survey Order'}
                              </span>
                              <input
                                type="file"
                                accept=".pdf,.png,.jpg,.jpeg,.dwg,.dxf"
                                onChange={handleFileUpload}
                                className="hidden"
                              />
                            </label>
                          </div>
                        </div>

                        {/* Mandatory Resolution Notes Textarea */}
                        <div className="space-y-1">
                          <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider flex items-center justify-between">
                            <span>
                              Adjudicator Resolution Notes & Survey Rationale <span className="text-rose-400">*</span>
                            </span>
                            <span className="text-[10px] text-slate-400 font-normal lowercase">
                              required for official gazette
                            </span>
                          </label>
                          <textarea
                            rows={2}
                            value={resolveNotes}
                            onChange={(e) => setResolveNotes(e.target.value)}
                            placeholder="Enter deed rectification details, penalty payment receipt #, surveyor report reference, or boundary demarcation details..."
                            className="w-full px-3 py-2 text-xs bg-slate-900 border border-slate-800 rounded-lg text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-sans"
                          />
                        </div>

                        {/* Confirm Resolution Action */}
                        <div className="flex items-center justify-end gap-3 pt-1">
                          <button
                            onClick={() => setExpandedResolveId(null)}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all cursor-pointer border border-slate-700"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleResolveDispute(grievance)}
                            disabled={isProcessing || !resolveNotes.trim()}
                            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-950/50 border border-emerald-400 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                          >
                            {isProcessing ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Check className="w-3.5 h-3.5 text-slate-950" />
                            )}
                            <span>Confirm Legal Resolution & Clear Conflict</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* --- Section 3: RESOLVED Details Record --- */}
                {grievance.status === 'RESOLVED' && (
                  <div className="p-3.5 rounded-xl bg-emerald-950/30 border border-emerald-500/30 space-y-2 text-xs">
                    <div className="flex items-center justify-between gap-2 flex-wrap pb-1.5 border-b border-emerald-500/20">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded font-bold text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                          {grievance.resolution_reason || 'Regularized'}
                        </span>
                        <span className="text-slate-300 font-semibold">
                          Resolved by: {grievance.officer_id || 'Cadastral Officer'}
                        </span>
                      </div>
                      {grievance.resolved_at && (
                        <span className="text-[11px] font-mono text-emerald-400">
                          {new Date(grievance.resolved_at).toLocaleString()}
                        </span>
                      )}
                    </div>

                    <p className="text-slate-200 font-sans leading-relaxed">
                      <span className="text-emerald-400 font-semibold">Resolution Notes: </span>
                      {grievance.resolution_notes || grievance.officer_remarks || 'Dispute resolved and verified.'}
                    </p>

                    {grievance.document_filename && (
                      <div className="flex items-center gap-1.5 text-[11px] text-emerald-300 font-mono pt-1">
                        <FileBadge className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Certified Record: {grievance.document_filename}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* --- Section 4: REJECTED / DISMISSED Details Record --- */}
                {grievance.status === 'REJECTED' && (
                  <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-400 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-300">
                        Dismissed by: {grievance.officer_id || 'Cadastral Officer'}
                      </span>
                      {grievance.resolved_at && (
                        <span className="text-[10px] font-mono text-slate-500">
                          {new Date(grievance.resolved_at).toLocaleString()}
                        </span>
                      )}
                    </div>
                    <p className="text-slate-300 font-sans">
                      <span className="text-slate-400 font-medium">Remarks: </span>
                      {grievance.officer_remarks || 'No conflict verified upon survey inspection.'}
                    </p>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between text-xs text-slate-400 flex-shrink-0">
          <div className="flex items-center gap-2 font-mono text-[11px]">
            <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
            <span>
              Adjudicator: {adminUser?.name || 'Dr. R. Venkatraman, IAS'} (
              {adminUser?.badgeId || 'KA-REV-CAD-0491'})
            </span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors cursor-pointer border border-slate-700"
          >
            Close Dashboard
          </button>
        </div>
      </div>
    </div>
  )
}
