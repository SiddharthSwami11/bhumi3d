import React, { useState, useEffect } from 'react'
import api from '../lib/api'
import {
  Copy,
  Check,
  AlertTriangle,
  Building2,
  Boxes,
  Ruler,
  Layers,
  User,
  ShieldCheck,
  ShieldAlert,
  Box,
  Sun,
  FileText,
  Download,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Zap,
  Cpu,
  Edit3,
  Save,
  CheckCircle2,
  Scale,
  Loader2,
  LogOut,
  Lock,
  Send,
  KeyRound,
  MapPin,
  Calendar,
  Grid3X3,
} from 'lucide-react'
import type {
  PropertyUnit3D,
  UnitType,
  LayerType,
  DisputeResolutionAction,
  UnitUpdateAdminPayload,
  DisputeResolutionRequest,
} from '../types/cadastre'
import { useAuth } from '../context/AuthContext'
import { parse2DUlpin, parse3DUlpin } from '../utils/ulpin'

interface SidebarProps {
  isOpen: boolean
  onClose: () => void
  onToggleOpen: () => void
  selectedUnit: PropertyUnit3D | null
  totalUnits: number
  clashingUnitsCount: number
  onCopyUlpin: (ulpin: string) => void
  onUnitUpdated?: (updatedUnit: PropertyUnit3D) => void
  onOpenAuthModal?: () => void
  onOpenCitizenAuthModal?: () => void
  onOpenPropertyVerifyModal?: () => void
  onOpenPartitionModal?: () => void
  onHoverDismiss?: () => void
  onGrievanceSubmitted?: () => void
}

function maskName(name: string | null | undefined): string {
  if (!name) return 'Protected Record'
  return name
    .split(' ')
    .map((part) =>
      part.length > 2
        ? part[0] + '*'.repeat(part.length - 2) + part[part.length - 1]
        : part[0] + '*'
    )
    .join(' ')
}

function maskContact(contact?: string | null): string {
  if (!contact) return '******3210'
  if (contact.length > 4) {
    return '*'.repeat(contact.length - 4) + contact.slice(-4)
  }
  return '******3210'
}

function maskRera(rera: string | null | undefined): string {
  if (!rera) return 'KA/RERA/****/3166'
  const parts = rera.split('/')
  if (parts.length >= 3) {
    return `${parts[0]}/${parts[1]}/****/${parts[parts.length - 1]}`
  }
  if (rera.length > 6) {
    return rera.slice(0, 4) + '****' + rera.slice(-2)
  }
  return 'KA/RERA/****/3166'
}

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

function maskState(state?: string | null): string {
  if (!state) return 'K********'
  return state.slice(0, 1) + '*'.repeat(Math.max(state.length - 1, 6))
}

function maskCity(city?: string | null): string {
  if (!city) return 'B********'
  return city.slice(0, 1) + '*'.repeat(Math.max(city.length - 1, 6))
}

function maskPincode(pincode?: string | null): string {
  if (!pincode) return '56****'
  return pincode.slice(0, 2) + '*'.repeat(Math.max(pincode.length - 2, 4))
}

function maskAge(_age?: string | number | null): string {
  return '** Yrs'
}

function maskDate(date?: string | null): string {
  if (!date) return '**-***-2021'
  return '**-***-' + (date.split('-').pop() || '2021')
}

function getCategoryBadge(unit: PropertyUnit3D) {
  const type = (unit.unit_type || '').toUpperCase()
  const easement = (unit.easement_type || '').toUpperCase()

  if (type.includes('TRANSIT') || type.includes('METRO') || easement.includes('METRO') || type.includes('CONCOURSE')) {
    return (
      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
        Metro / Transit
      </span>
    )
  }
  if (type.includes('UTILITY') || easement.includes('UTILITY') || type.includes('CONDUIT') || type.includes('PIPE')) {
    return (
      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-orange-500/20 text-orange-300 border border-orange-500/40">
        Utility Corridor
      </span>
    )
  }
  if (type.includes('BASEMENT') || type.includes('PARKING') || unit.floor_level < 0 || unit.layer_type === 'U') {
    return (
      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40">
        Basement
      </span>
    )
  }
  if (type.includes('COMMERCIAL')) {
    return (
      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-sky-500/20 text-sky-300 border border-sky-500/40">
        Commercial
      </span>
    )
  }
  if (type.includes('RESIDENTIAL')) {
    return (
      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
        Residential
      </span>
    )
  }
  if (type.includes('COMMON')) {
    return (
      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
        Common Area
      </span>
    )
  }
  return (
    <span className="px-2 py-0.5 rounded-md text-[10px] font-medium neu-inset-sm text-slate-300 border border-[var(--neu-border)]">
      Cadastre Parcel
    </span>
  )
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  onClose,
  onToggleOpen,
  selectedUnit,
  totalUnits,
  clashingUnitsCount,
  onCopyUlpin,
  onUnitUpdated,
  onOpenAuthModal,
  onOpenCitizenAuthModal,
  onOpenPropertyVerifyModal,
  onOpenPartitionModal,
  onHoverDismiss,
  onGrievanceSubmitted,
}) => {
  const {
    authStage,
    userSession,
    userRole,
    adminUser,
    isAuthenticated,
    citizenUser,
    logout,
    logoutCitizen,
    isPropertyVerified,
  } = useAuth()

  const isSelectedUnitVerified = selectedUnit
    ? isPropertyVerified(
        selectedUnit.plot_number || selectedUnit.base_2d_ulpin,
        selectedUnit.flat_number || selectedUnit.unit_number,
        selectedUnit.unit_number
      )
    : false

  const [copiedId, setCopiedId] = useState(false)
  const [copiedHash, setCopiedHash] = useState(false)
  const [downloading, setDownloading] = useState(false)

  // Citizen grievance state
  const [citizenGrievanceText, setCitizenGrievanceText] = useState('')
  const [submittingGrievance, setSubmittingGrievance] = useState(false)
  const [grievanceTicketId, setGrievanceTicketId] = useState<string | null>(null)

  // Admin inline editing state
  const [isEditing, setIsEditing] = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)
  const [editOwner, setEditOwner] = useState('')
  const [editRera, setEditRera] = useState('')
  const [editCarpetArea, setEditCarpetArea] = useState<number | ''>('')
  const [editUnitType, setEditUnitType] = useState<UnitType>('RESIDENTIAL')
  const [editLayerType, setEditLayerType] = useState<LayerType>('A')
  const [editNotes, setEditNotes] = useState('')
  const [editSuccessToast, setEditSuccessToast] = useState<string | null>(null)

  // Dispute resolution state
  const [resolutionAction, setResolutionAction] =
    useState<DisputeResolutionAction>('REGULARIZED_PENALTY_PAID')
  const [resolutionNotes, setResolutionNotes] = useState('')
  const [resolvingDispute, setResolvingDispute] = useState(false)
  const [disputeSuccessMessage, setDisputeSuccessMessage] = useState<string | null>(null)

  // Synchronize edit fields when selectedUnit changes
  useEffect(() => {
    if (selectedUnit) {
      setEditOwner(selectedUnit.owner_name || '')
      setEditRera(selectedUnit.rera_reg_no || '')
      setEditCarpetArea(selectedUnit.carpet_area_sqm || '')
      setEditUnitType(selectedUnit.unit_type || 'RESIDENTIAL')
      setEditLayerType(selectedUnit.layer_type || 'A')
      setEditNotes('')
      setIsEditing(false)
      setDisputeSuccessMessage(null)
      setEditSuccessToast(null)
      setGrievanceTicketId(null)
      setCitizenGrievanceText('')
    }
  }, [selectedUnit])

  const handleCopyId = (ulpinId: string) => {
    onCopyUlpin(ulpinId)
    setCopiedId(true)
    setTimeout(() => setCopiedId(false), 2000)
  }

  const handleCopyHash = (ulpinHash: string) => {
    onCopyUlpin(ulpinHash)
    setCopiedHash(true)
    setTimeout(() => setCopiedHash(false), 2000)
  }

  const handleSubmitGrievance = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedUnit || !citizenGrievanceText.trim()) return

    const trimmedDesc = citizenGrievanceText.trim()
    if (trimmedDesc.length < 5) {
      alert('Please provide a grievance description of at least 5 characters.')
      return
    }

    setSubmittingGrievance(true)
    try {
      const payload = {
        ulpin_3d: selectedUnit.ulpin_3d,
        building_name: selectedUnit.building_name || null,
        plot_number: selectedUnit.plot_number || selectedUnit.base_2d_ulpin || null,
        flat_number: selectedUnit.flat_number || selectedUnit.unit_number || null,
        citizen_name: citizenUser?.name || userSession?.name || 'Citizen Applicant',
        citizen_phone: citizenUser?.phone || userSession?.phone || '9876543210',
        description: trimmedDesc,
      }
      const response = await api.post('/api/parcels/grievances', payload)
      const ticketId = response.data?.id
        ? `GRV-2026-KA-${String(response.data.id).slice(0, 8).toUpperCase()}`
        : `GRV-2026-KA-${Math.floor(1000 + Math.random() * 9000)}`
      setGrievanceTicketId(ticketId)
      setCitizenGrievanceText('')
      if (onGrievanceSubmitted) {
        onGrievanceSubmitted()
      }
    } catch (err: any) {
      console.error('Failed to submit grievance:', err)
      alert(formatApiError(err, 'Failed to submit grievance. Please try again.'))
    } finally {
      setSubmittingGrievance(false)
    }
  }

  // Handle Admin Save Inline Attributes
  const handleSaveAttributes = async () => {
    if (!selectedUnit) return
    setSavingEdit(true)
    setEditSuccessToast(null)

    try {
      const payload: UnitUpdateAdminPayload = {
        owner_name: editOwner.trim() || null,
        rera_reg_no: editRera.trim() || null,
        carpet_area_sqm: editCarpetArea === '' ? null : Number(editCarpetArea),
        unit_type: editUnitType,
        layer_type: editLayerType,
        notes: editNotes.trim() || null,
      }

      const response = await api.patch(
        `/api/parcels/update/${selectedUnit.ulpin_3d}`,
        payload
      )

      const updated = response.data
      setIsEditing(false)
      setEditSuccessToast('Property deed attributes successfully updated')

      if (onUnitUpdated) {
        onUnitUpdated({
          ...selectedUnit,
          owner_name: updated.owner_name,
          rera_reg_no: updated.rera_reg_no,
          carpet_area_sqm: updated.carpet_area_sqm,
          volume_cum: updated.volume_cum,
          footprint_area_m2: updated.footprint_area_m2,
          building_volume_m3: updated.building_volume_m3,
          unit_type: updated.unit_type,
          layer_type: updated.layer_type,
          clash_details: updated.clash_details,
        })
      }

      setTimeout(() => setEditSuccessToast(null), 3500)
    } catch (err: any) {
      console.error('Failed to update unit attributes:', err)
      alert(
        formatApiError(
          err,
          'Failed to update attributes. Please check network connection.'
        )
      )
    } finally {
      setSavingEdit(false)
    }
  }

  // Handle Admin Legal Dispute Resolution
  const handleResolveDispute = async () => {
    if (!selectedUnit) return
    setResolvingDispute(true)
    setDisputeSuccessMessage(null)

    try {
      const payload: DisputeResolutionRequest = {
        ulpin_3d: selectedUnit.ulpin_3d,
        resolution_action: resolutionAction,
        resolution_notes:
          resolutionNotes.trim() ||
          `Administrative order executed under Cadastral Act 2026. Action: ${resolutionAction}`,
        resolved_by: adminUser
          ? `${adminUser.name} (${adminUser.badgeId})`
          : 'Cadastral Officer #KA-BLR-04',
      }

      const response = await api.post(
        '/api/parcels/resolve-dispute',
        payload
      )

      const result = response.data
      setDisputeSuccessMessage(result.message)
      setResolutionNotes('')

      if (onUnitUpdated) {
        onUnitUpdated({
          ...selectedUnit,
          is_clashing: false,
          clash_details: result.clash_details,
          data_status: result.data_status,
        })
      }

      setTimeout(() => setDisputeSuccessMessage(null), 4000)
    } catch (err: any) {
      console.error('Failed to resolve dispute:', err)
      alert(
        formatApiError(
          err,
          'Failed to execute dispute resolution. Please verify officer permissions.'
        )
      )
    } finally {
      setResolvingDispute(false)
    }
  }

  // Generate & Download Official Cadastral & Solar Audit Report (.txt)
  const handleDownloadReport = () => {
    if (!selectedUnit) return
    setDownloading(true)

    const ulpinId = selectedUnit.ulpin_id || selectedUnit.ulpin_3d
    const dataStatus = selectedUnit.data_status || '3D_cadastre_verified'
    const bldgType =
      selectedUnit.building_type ||
      (selectedUnit.floor_level < 0 ? 'Subsurface Facility' : 'Low-rise')
    const estFloors = selectedUnit.estimated_floors || 1
    const ownerName = selectedUnit.owner_name || 'State / Common Association'
    const reraId = selectedUnit.rera_reg_no || 'N/A (Exempt / Public Infrastructure)'

    const footprintArea = (
      selectedUnit.footprint_area_m2 ||
      selectedUnit.carpet_area_sqm ||
      0
    ).toFixed(2)
    const heightM = (
      selectedUnit.building_height_m ||
      selectedUnit.z_max - selectedUnit.z_min
    ).toFixed(2)
    const volumeM3 = (
      selectedUnit.building_volume_m3 ||
      selectedUnit.volume_cum ||
      0
    ).toFixed(2)
    const baseElevation = selectedUnit.z_min.toFixed(2)
    const ceilingElevation = selectedUnit.z_max.toFixed(2)
    const pointCount = selectedUnit.point_count || 1013
    const roofPointCount = selectedUnit.roof_point_count || 455

    const roofArea = (
      selectedUnit.roof_area_m2 ||
      (selectedUnit.carpet_area_sqm ? selectedUnit.carpet_area_sqm * 0.9 : 65.02)
    ).toFixed(2)
    const usableRoof = (
      selectedUnit.usable_roof_area_m2 ||
      (selectedUnit.carpet_area_sqm ? selectedUnit.carpet_area_sqm * 0.75 : 48.76)
    ).toFixed(2)
    const solarKw = (
      selectedUnit.estimated_solar_kw ||
      (selectedUnit.carpet_area_sqm ? selectedUnit.carpet_area_sqm * 0.075 : 4.88)
    ).toFixed(2)
    const annualGenKwh = (parseFloat(solarKw) * 4 * 365).toFixed(0)

    const reportContent = `============================================================
BHUMI3D — 3D CADASTRAL & VOLUMETRIC AUDIT REPORT
============================================================
Generated via: Bhumi3D Digital Twin Portal (SIH 2026)
Timestamp: ${new Date().toISOString()}
ULPIN ID: ${ulpinId}
3D ULPIN Hash: ${selectedUnit.ulpin_3d}
Base 2D Parcel ULPIN: ${selectedUnit.base_2d_ulpin}
Unit Label: ${selectedUnit.unit_number}
Floor Level: ${selectedUnit.floor_level}
Data Status: ${dataStatus}
Building Type: ${bldgType}
Floor Count: ${estFloors}
Primary Owner: ${ownerName}
RERA License: ${reraId}
------------------------------------------------------------
SPATIAL & VOLUMETRIC METRICS
------------------------------------------------------------
Footprint Area: ${footprintArea} m²
Building Height: ${heightM} m
Total Volume: ${volumeM3} m³
Elevation Span: ${baseElevation}m to ${ceilingElevation}m AMSL
Vertical Clearance: ${(selectedUnit.z_max - selectedUnit.z_min).toFixed(2)} m
Spatial Layer: ${
      selectedUnit.layer_type === 'U'
        ? 'Underground [U]'
        : selectedUnit.layer_type === 'S'
        ? 'Surface [S]'
        : 'Above Ground [A]'
    }
LiDAR Points (Total): ${pointCount}
LiDAR Points (Roof Segment): ${roofPointCount}
------------------------------------------------------------
RENEWABLE ENERGY & SOLAR AUDIT
------------------------------------------------------------
Total Roof Area: ${roofArea} m²
Usable Solar Area: ${usableRoof} m²
Estimated Solar Capacity: ${solarKw} kW
Projected Annual Generation: ${annualGenKwh} kWh/year
Solar Potential Tier: ${parseFloat(solarKw) > 10 ? 'High Yield Commercial' : 'Residential Medium'}
------------------------------------------------------------
TOPOLOGY AUDIT & ENCROACHMENT STATUS
------------------------------------------------------------
Encroachment / Clash Detected: ${
      selectedUnit.is_clashing
        ? 'YES - DISPUTED (CRITICAL OVERLAP)'
        : 'NO - CLEAN (TOPOLOGY VERIFIED)'
    }
Details: ${
      selectedUnit.clash_details ||
      'Volumetric envelope fully verified within authorized cadastral air/ground rights.'
    }
============================================================
`

    const blob = new Blob([reportContent], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${ulpinId.replace(/[^a-zA-Z0-9-_]/g, '_')}_Bhumi3D_Cadastre_Report.txt`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    setTimeout(() => setDownloading(false), 800)
  }

  // Derived metrics for UI
  const footprintArea = selectedUnit
    ? selectedUnit.footprint_area_m2 || selectedUnit.carpet_area_sqm || 0
    : 0
  const buildingVolume = selectedUnit
    ? selectedUnit.building_volume_m3 || selectedUnit.volume_cum || 0
    : 0
  const solarCapacity = selectedUnit
    ? selectedUnit.estimated_solar_kw || footprintArea * 0.075
    : 0
  const annualSolarYield = (solarCapacity * 4 * 365).toFixed(0)

  const parsed3D = selectedUnit ? parse3DUlpin(selectedUnit.ulpin_3d) : null
  const base2dUlpin =
    selectedUnit?.base_2d_ulpin ||
    parsed3D?.base2DUlpin ||
    selectedUnit?.ulpin_id ||
    'KA010010420104'
  const parsed2D = parsed3D?.parsed2D || parse2DUlpin(base2dUlpin)

  return (
    <>
      {/* Collapsed Edge Toggle Trigger (shown when sidebar is closed) */}
      {!isOpen && (
        <button
          onClick={onToggleOpen}
          onMouseEnter={onHoverDismiss}
          className="fixed top-1/2 right-0 -translate-y-1/2 z-40 neu-btn border-r-0 rounded-l-2xl p-2.5 text-cyan-400 hover:text-white transition-all duration-300 group flex items-center gap-1.5 cursor-pointer"
          title="Open Property Cadastre Inspector"
        >
          <ChevronLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          <div className="flex flex-col items-center">
            <Building2 className="w-4 h-4 text-cyan-400 mb-0.5" />
            <span className="text-[9px] font-mono font-bold tracking-tighter uppercase [writing-mode:vertical-lr] text-slate-300">
              Inspector
            </span>
          </div>
        </button>
      )}

      {/* Flush Docked Full-Height Sidebar Panel */}
      <aside
        onMouseEnter={onHoverDismiss}
        style={{
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
        className={`h-screen w-[420px] flex flex-col border-l border-[var(--neu-border)] bg-[var(--neu-base)] neu-surface flex-shrink-0 z-40 text-white ${
          isOpen
            ? 'translate-x-0 opacity-100'
            : 'w-0 max-w-0 opacity-0 pointer-events-none overflow-hidden border-l-0'
        } ${
          userRole === 'ADMIN'
            ? 'border-l-amber-500/40 shadow-[-6px_0_16px_rgba(245,158,11,0.06)]'
            : 'shadow-[-8px_0_24px_rgba(0,0,0,0.4)]'
        }`}
      >
        {/* Officer Government Governance Strip at Top of Sidebar */}
        {userRole === 'ADMIN' && (
          <div className="px-4 py-2 bg-amber-500/20 border-b border-amber-500/40 flex items-center justify-between text-[10px] font-mono tracking-tight flex-shrink-0">
            <div className="flex items-center gap-1.5 text-amber-300 font-bold">
              <ShieldCheck className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
              <span>OFFICER CADASTRE SESSION</span>
            </div>
            <span className="text-amber-300/90 text-[9px] font-semibold uppercase tracking-wider">
              • LEVEL 3 CLEARANCE
            </span>
          </div>
        )}

        {/* Header Section */}
        <div className="p-4 pb-3 border-b border-[var(--neu-border)] neu-flat flex-shrink-0">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div
                className={`p-2 rounded-xl neu-raised-sm flex items-center justify-center transition-colors ${
                  userRole === 'ADMIN'
                    ? 'text-amber-400 border border-amber-500/30'
                    : 'text-cyan-400 border border-cyan-500/30'
                }`}
              >
                <Boxes className="w-5 h-5" />
              </div>
              <div>
                <h1
                  className={`text-base font-extrabold tracking-tight ${
                    userRole === 'ADMIN'
                      ? 'text-amber-200'
                      : 'text-white'
                  }`}
                >
                  Property Inspector
                </h1>
                <p className="text-[10px] text-slate-400 font-mono tracking-wide">
                  Bhumi3D Volumetric Cadastre
                </p>
              </div>
            </div>

            {/* Close / Collapse Button */}
            <button
              onClick={onClose}
              className="p-2 rounded-xl neu-btn text-slate-400 hover:text-white transition-colors cursor-pointer"
              title="Collapse Inspector Panel"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Role Status & Access Banner */}
          <div
            className={`flex items-center justify-between mb-2.5 px-3 py-2 rounded-xl neu-inset-sm transition-all duration-300 ${
              authStage === 'OFFICER'
                ? 'border border-amber-500/30 bg-amber-950/20'
                : authStage === 'CITIZEN'
                ? 'border border-emerald-500/30 bg-emerald-950/15'
                : 'border border-[var(--neu-border)]'
            }`}
          >
            {authStage === 'OFFICER' ? (
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-amber-300 flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                    Officer Mode
                  </span>
                  <span className="text-[10px] font-mono text-amber-200/80 truncate max-w-[110px]">
                    {adminUser?.badgeId}
                  </span>
                </div>
                <button
                  onClick={() => logout()}
                  className="text-[10px] px-2.5 py-1 rounded-lg neu-btn text-amber-400 hover:text-rose-400 font-semibold flex items-center gap-1 cursor-pointer transition-colors"
                  title="Log out of Cadastral Officer Mode"
                >
                  <LogOut className="w-3 h-3" />
                  <span>Log Out</span>
                </button>
              </div>
            ) : authStage === 'CITIZEN' ? (
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-1.5 min-w-0">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-bold text-emerald-300 leading-tight truncate">
                        Citizen Verified
                      </span>
                      {userSession?.verifiedPlot && (
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono font-bold">
                          {userSession.verifiedPlot}
                        </span>
                      )}
                    </div>
                    <span className="text-[9px] text-slate-400 leading-tight truncate">
                      {userSession?.name || citizenUser?.name || 'Siddharth Swami'}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 ml-2 flex-shrink-0">
                  {onOpenAuthModal && (
                    <button
                      onClick={onOpenAuthModal}
                      className="text-[10px] px-2 py-1 rounded-lg neu-btn text-amber-300 hover:text-amber-200 font-semibold flex items-center gap-1 cursor-pointer transition-colors border border-amber-500/30"
                      title="Elevate to Officer Mode"
                    >
                      <ShieldCheck className="w-3 h-3 text-amber-400" />
                      <span>Officer</span>
                    </button>
                  )}
                  <button
                    onClick={() => logoutCitizen()}
                    className="text-[10px] px-2 py-1 rounded-lg neu-btn text-slate-300 hover:text-rose-400 font-semibold flex items-center gap-1 cursor-pointer transition-colors"
                    title="Sign out Citizen session"
                  >
                    <LogOut className="w-3 h-3" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between w-full">
                <span className="text-[11px] text-slate-400 flex items-center gap-1.5 font-medium">
                  <User className="w-3 h-3 text-slate-500" />
                  Public Guest Mode
                </span>
                {onOpenCitizenAuthModal && (
                  <button
                    onClick={onOpenCitizenAuthModal}
                    className="text-[10px] px-2.5 py-1 rounded-lg neu-btn text-emerald-400 font-semibold transition-colors flex items-center gap-1 cursor-pointer border border-emerald-500/30"
                  >
                    <ShieldCheck className="w-2.5 h-2.5" />
                    Verify Identity
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Stats Pills Bar */}
          <div className="flex gap-2 text-[11px]">
            <span className="px-2.5 py-1 rounded-lg neu-inset-sm text-slate-300 font-medium">
              {totalUnits} Units Registered
            </span>
            {clashingUnitsCount > 0 ? (
              <span className="px-2.5 py-1 rounded-lg neu-inset-sm border border-rose-500/40 text-rose-300 flex items-center gap-1 font-semibold animate-pulse">
                <AlertTriangle className="w-3 h-3 text-rose-400" />
                {clashingUnitsCount} Dispute{clashingUnitsCount > 1 ? 's' : ''}
              </span>
            ) : (
              <span className="px-2.5 py-1 rounded-lg neu-inset-sm border border-emerald-500/40 text-emerald-300 flex items-center gap-1 font-medium">
                <ShieldCheck className="w-3 h-3 text-emerald-400" />
                Topology Clean
              </span>
            )}
          </div>
        </div>

        {/* Scrollable Content Body */}
        {authStage === 'UNAUTHENTICATED' ? (
          /* Phase 1 Locked State: Strict suppression of all cadastral data */
          <div className="p-4 flex-1 flex flex-col items-center justify-center text-center">
            <div className="neu-raised p-6 rounded-2xl flex flex-col items-center max-w-[320px] border border-cyan-500/30 bg-slate-950/70 shadow-xl shadow-cyan-950/30 space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                <Lock className="w-6 h-6" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-sm font-bold text-white tracking-tight">
                  Protected Cadastral Records
                </h3>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Citizen verification required to inspect property deeds.
                </p>
              </div>
              {onOpenCitizenAuthModal && (
                <button
                  onClick={onOpenCitizenAuthModal}
                  className="w-full py-2.5 px-4 rounded-xl font-bold text-xs bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center justify-center gap-2 shadow-lg transition-all cursor-pointer active:scale-[0.98]"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>Verify Citizen Identity</span>
                </button>
              )}
            </div>
          </div>
        ) : selectedUnit ? (
          <div className="p-4 space-y-3.5 flex-1 overflow-y-auto pr-2 select-text custom-scrollbar">
            {/* Success Banner */}
            {editSuccessToast && (
              <div className="p-3 neu-raised border border-emerald-500/50 rounded-xl text-emerald-300 text-xs flex items-center gap-2 animate-fade-in shadow-md">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span>{editSuccessToast}</span>
              </div>
            )}

            {/* Property Unit Hero Card */}
            <div className="neu-raised rounded-2xl p-4 relative overflow-hidden">
              <div className="flex items-start justify-between gap-2 mb-2.5">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-400 uppercase tracking-wider font-semibold truncate">
                    <span>{selectedUnit.building_type || 'Cadastral Unit'}</span>
                    {selectedUnit.ulpin_id && (
                      <span className="text-cyan-400 font-mono">
                        · {selectedUnit.ulpin_id}
                      </span>
                    )}
                  </div>
                  <h2 className="text-base font-bold text-white tracking-tight mt-0.5 truncate">
                    {selectedUnit.unit_number}
                  </h2>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <div className="flex items-center gap-1 text-xs font-semibold text-cyan-300">
                      <Building2 className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
                      <span className="truncate">
                        {selectedUnit.building_name || 'Kasturba Heritage Residency'}
                      </span>
                    </div>
                    {(selectedUnit.plot_number || parsed2D?.plotNumber) && (
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                        <MapPin className="w-2.5 h-2.5 text-emerald-400" />
                        Plot {selectedUnit.plot_number || parsed2D.plotNumber}
                      </span>
                    )}
                  </div>
                </div>

                {/* Multi-Tag Badges (Functional Category + Disputed Alert + Verification Status) */}
                <div className="flex flex-wrap items-center justify-end gap-1.5 max-w-[180px] flex-shrink-0">
                  {getCategoryBadge(selectedUnit)}
                  {selectedUnit.is_clashing && (
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-500/25 text-rose-300 border border-rose-500/50 flex items-center gap-1 animate-pulse">
                      <ShieldAlert className="w-3 h-3 text-rose-400" />
                      Disputed
                    </span>
                  )}
                  {selectedUnit.unit_type === 'CONTEXT_PARCEL' ? null : selectedUnit.rera_reg_no ? (
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3 text-emerald-400" />
                      Verified
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3 text-cyan-400" />
                      Cadastre Ingested
                    </span>
                  )}
                </div>
              </div>

              {/* Official 2D Base ULPIN (Bhu-Aadhaar Standard) */}
              <div className="mt-3">
                <div className="text-[10px] text-slate-400 font-mono mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                    <MapPin className="w-3 h-3 text-emerald-400" />
                    2D Base Bhu-Aadhaar ULPIN:
                  </span>
                  <span className="text-[9px] text-slate-400 font-sans">14-Char Foundation</span>
                </div>
                <div className="flex items-center gap-1.5 neu-inset px-3 py-2 rounded-xl group hover:border-emerald-500/50 transition-colors border border-[var(--neu-border)] bg-slate-950/40">
                  <code className="text-[11px] font-mono text-emerald-300 font-bold flex-1 truncate select-all">
                    {base2dUlpin}
                  </code>
                  <button
                    onClick={() => handleCopyId(base2dUlpin)}
                    className="p-1.5 neu-btn text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
                    title="Copy 2D Base ULPIN"
                  >
                    {copiedId ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
                {/* 2D Segment Decomposition Pills */}
                {parsed2D && (
                  <div className="flex flex-wrap gap-1 mt-1.5 text-[9px] font-mono">
                    <span
                      className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                      title={`State: ${parsed2D.stateName}`}
                    >
                      State: {parsed2D.stateCode}
                    </span>
                    <span
                      className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                      title={`District: ${parsed2D.districtName}`}
                    >
                      Dist: {parsed2D.districtCode}
                    </span>
                    <span
                      className="px-1.5 py-0.5 rounded bg-slate-800/80 text-slate-300 border border-slate-700/60"
                      title={`Tehsil Code: ${parsed2D.tehsilCode}`}
                    >
                      Teh: {parsed2D.tehsilCode}
                    </span>
                    <span
                      className="px-1.5 py-0.5 rounded bg-slate-800/80 text-slate-300 border border-slate-700/60"
                      title={`Village/Ward Code: ${parsed2D.villageWardCode}`}
                    >
                      Ward: {parsed2D.villageWardCode}
                    </span>
                    <span
                      className="px-1.5 py-0.5 rounded bg-slate-800/80 text-slate-300 border border-slate-700/60"
                      title={`Plot Number: ${parsed2D.plotNumber}`}
                    >
                      Plot: {parsed2D.plotNumber}
                    </span>
                  </div>
                )}
              </div>

              {/* Hierarchical 3D Volumetric ULPIN with CRC-8 Checksum */}
              <div className="mt-2.5">
                <div className="text-[10px] text-slate-400 font-mono mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1 text-cyan-400 font-semibold">
                    <Box className="w-3 h-3 text-cyan-400" />
                    3D Volumetric ULPIN (Hierarchical):
                  </span>
                  <div className="flex items-center gap-1">
                    {parsed3D?.isValidChecksum ? (
                      <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[9px] font-mono flex items-center gap-1 font-bold">
                        <ShieldCheck className="w-2.5 h-2.5 text-emerald-400" />
                        CRC-8 PASS
                      </span>
                    ) : (
                      <span className="text-[9px] text-slate-400 font-sans">30-Char Spatial ID</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 neu-inset px-3 py-2 rounded-xl group hover:border-cyan-500/50 transition-colors border border-[var(--neu-border)] bg-slate-950/40">
                  <code className="text-[11px] font-mono text-cyan-300 font-bold flex-1 truncate select-all">
                    {selectedUnit.ulpin_3d}
                  </code>
                  <button
                    onClick={() => handleCopyHash(selectedUnit.ulpin_3d)}
                    className="p-1.5 neu-btn text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
                    title="Copy 3D Volumetric ULPIN"
                  >
                    {copiedHash ? (
                      <Check className="w-3.5 h-3.5 text-cyan-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
                {/* 3D Segment Decomposition Pills */}
                {parsed3D && (
                  <div className="flex flex-wrap gap-1 mt-1.5 text-[9px] font-mono">
                    <span
                      className="px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30"
                      title={`Layer: ${parsed3D.spatialLayerLabel}`}
                    >
                      Layer: {parsed3D.spatialLayer} ({parsed3D.spatialLayerLabel.split(' ')[0]})
                    </span>
                    <span
                      className="px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30"
                      title="AMSL Elevation"
                    >
                      AMSL: {parsed3D.amslElevationM}m
                    </span>
                    <span
                      className="px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/30"
                      title={`Floor: ${parsed3D.floorLabel}`}
                    >
                      Floor: {parsed3D.floorCode}
                    </span>
                    <span
                      className="px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-300 border border-purple-500/30"
                      title={`Unit: ${parsed3D.unitLabel}`}
                    >
                      Unit: {parsed3D.unitCode}
                    </span>
                    <span
                      className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-0.5 font-bold"
                      title="CRC-8 Checksum"
                    >
                      <ShieldCheck className="w-2.5 h-2.5 text-emerald-400" />
                      CRC: {parsed3D.checksum}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Volumetric Dimensions Grid (2x2 Cards with .neu-raised) */}
            <div>
              <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold block mb-2">
                Volumetric Dimensions
              </span>
              <div className="grid grid-cols-2 gap-2.5">
                {/* Carpet / Footprint Area */}
                <div className="neu-raised p-3 rounded-xl border border-[var(--neu-border)]">
                  <div className="flex items-center justify-between text-slate-400 mb-1">
                    <span className="text-[11px] font-medium">Footprint Area</span>
                    <Ruler className="w-3.5 h-3.5 text-cyan-400" />
                  </div>
                  <p className="text-base font-bold text-slate-100 font-mono">
                    {footprintArea ? `${footprintArea.toFixed(2)} m²` : 'N/A'}
                  </p>
                  <span className="text-[9px] text-slate-400 block mt-0.5">Plan Metric</span>
                </div>

                {/* Volume */}
                <div className="neu-raised p-3 rounded-xl border border-[var(--neu-border)]">
                  <div className="flex items-center justify-between text-slate-400 mb-1">
                    <span className="text-[11px] font-medium">Volume (Prism)</span>
                    <Box className="w-3.5 h-3.5 text-sky-400" />
                  </div>
                  <p className="text-base font-bold text-slate-100 font-mono">
                    {buildingVolume ? `${buildingVolume.toFixed(2)} m³` : 'N/A'}
                  </p>
                  <span className="text-[9px] text-slate-400 block mt-0.5">3D Envelope</span>
                </div>

                {/* Base Elevation */}
                <div className="neu-raised p-3 rounded-xl border border-[var(--neu-border)]">
                  <span className="text-[11px] text-slate-400 font-medium block mb-1">Base AMSL</span>
                  <p className="text-base font-bold text-slate-100 font-mono">
                    {selectedUnit.z_min.toFixed(1)} m
                  </p>
                  <span className="text-[9px] text-slate-400 block mt-0.5">Floor Datum</span>
                </div>

                {/* Ceiling Elevation */}
                <div className="neu-raised p-3 rounded-xl border border-[var(--neu-border)]">
                  <span className="text-[11px] text-slate-400 font-medium block mb-1">Ceiling AMSL</span>
                  <p className="text-base font-bold text-slate-100 font-mono">
                    {selectedUnit.z_max.toFixed(1)} m
                  </p>
                  <span className="text-[9px] text-slate-400 block mt-0.5">
                    +{(selectedUnit.z_max - selectedUnit.z_min).toFixed(1)}m Clearance
                  </span>
                </div>
              </div>
            </div>

            {/* Title & Land Registry Card (with 3-Phase Access & Admin Editing Support) */}
            <div
              className={`rounded-2xl p-4 space-y-3 neu-raised transition-all duration-300 ${
                authStage === 'OFFICER'
                  ? 'border border-amber-500/30'
                  : authStage === 'CITIZEN' && isSelectedUnitVerified
                  ? 'border border-emerald-500/40 bg-emerald-950/10'
                  : authStage === 'CITIZEN'
                  ? 'border border-emerald-500/25'
                  : 'border border-cyan-500/30'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold block">
                  Title & Land Registry
                </span>
                {authStage === 'OFFICER' ? (
                  <div className="flex items-center gap-1.5">
                    {onOpenPartitionModal && (
                      <button
                        onClick={onOpenPartitionModal}
                        className="px-2.5 py-1 rounded-lg neu-btn bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-[10px] font-bold flex items-center gap-1.5 border border-amber-500/40 transition-all cursor-pointer shadow-sm active:scale-[0.98]"
                        title="Subdivide Floor / Unit Partitioning"
                      >
                        <Grid3X3 className="w-3 h-3 text-amber-400" />
                        <span>Subdivide</span>
                      </button>
                    )}
                    <button
                      onClick={() => setIsEditing(!isEditing)}
                      className="px-2.5 py-1 rounded-lg neu-btn text-amber-300 text-[10px] font-bold flex items-center gap-1.5 border border-amber-500/30 transition-all cursor-pointer"
                    >
                      <Edit3 className="w-3 h-3 text-amber-400" />
                      {isEditing ? 'Cancel Edit' : 'Edit Deed'}
                    </button>
                  </div>
                ) : authStage === 'CITIZEN' ? (
                  isSelectedUnitVerified ? (
                    <span className="px-2 py-0.5 rounded-md text-[9px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                      <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
                      Your Verified Deed
                    </span>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-md text-[9px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 flex items-center gap-1">
                        <Lock className="w-2.5 h-2.5 text-cyan-400" />
                        Masked Record
                      </span>
                      {onOpenPropertyVerifyModal && (
                        <button
                          onClick={onOpenPropertyVerifyModal}
                          className="text-[10px] text-amber-400 hover:text-amber-300 flex items-center gap-1 font-semibold cursor-pointer"
                        >
                          <KeyRound className="w-2.5 h-2.5" />
                          Verify
                        </button>
                      )}
                    </div>
                  )
                ) : (
                  <span className="px-2 py-0.5 rounded-md text-[9px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 flex items-center gap-1">
                    <Lock className="w-2.5 h-2.5 text-cyan-400" />
                    Protected Record
                  </span>
                )}
              </div>

              {isEditing && authStage === 'OFFICER' ? (
                /* Admin Edit Form */
                <div className="space-y-3 pt-1 animate-fade-in">
                  <div>
                    <label className="block text-[10px] font-semibold text-amber-300/90 uppercase tracking-wider mb-1">
                      Title Holder / Owner Name
                    </label>
                    <input
                      type="text"
                      value={editOwner}
                      onChange={(e) => setEditOwner(e.target.value)}
                      placeholder="e.g., Shri Rajesh Kumar"
                      className="w-full neu-inset border border-[var(--neu-border)] rounded-xl px-2.5 py-1.5 text-xs text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400/50 focus:border-amber-400 font-sans transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-semibold text-amber-300/90 uppercase tracking-wider mb-1">
                      RERA Registration No.
                    </label>
                    <input
                      type="text"
                      value={editRera}
                      onChange={(e) => setEditRera(e.target.value)}
                      placeholder="e.g., KA/RERA/2024/091"
                      className="w-full neu-inset border border-[var(--neu-border)] rounded-xl px-2.5 py-1.5 text-xs text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400/50 focus:border-amber-400 font-mono transition-all"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-semibold text-amber-300/90 uppercase tracking-wider mb-1">
                        Carpet Area (m²)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        value={editCarpetArea}
                        onChange={(e) =>
                          setEditCarpetArea(
                            e.target.value === '' ? '' : parseFloat(e.target.value)
                          )
                        }
                        className="w-full neu-inset border border-[var(--neu-border)] rounded-xl px-2.5 py-1.5 text-xs text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400/50 focus:border-amber-400 font-mono transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-semibold text-amber-300/90 uppercase tracking-wider mb-1">
                        Unit Type
                      </label>
                      <select
                        value={editUnitType}
                        onChange={(e) => setEditUnitType(e.target.value as UnitType)}
                        className="w-full neu-inset border border-[var(--neu-border)] rounded-xl px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-amber-400/50 focus:border-amber-400 transition-all"
                      >
                        <option value="RESIDENTIAL">Residential</option>
                        <option value="COMMERCIAL">Commercial</option>
                        <option value="COMMON_AREA">Common Area</option>
                        <option value="BASEMENT_PARKING">Basement Parking</option>
                        <option value="UTILITY_CORRIDOR">Utility Corridor</option>
                        <option value="CONTEXT_PARCEL">Context Parcel</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-semibold text-amber-300/90 uppercase tracking-wider mb-1">
                      Surveyor Legal Remarks / Registry Notes
                    </label>
                    <input
                      type="text"
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                      placeholder="e.g., Updated as per Sale Deed registered on 2026-08-15"
                      className="w-full neu-inset border border-[var(--neu-border)] rounded-xl px-2.5 py-1.5 text-xs text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400/50 focus:border-amber-400 font-sans transition-all"
                    />
                  </div>

                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setIsEditing(false)}
                      className="flex-1 py-1.5 neu-btn text-slate-300 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveAttributes}
                      disabled={savingEdit}
                      className="flex-1 py-1.5 bg-amber-500 hover:bg-amber-400 disabled:bg-slate-600 text-slate-950 font-extrabold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-md active:scale-[0.98] cursor-pointer"
                    >
                      {savingEdit ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-950" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className="w-3.5 h-3.5 text-slate-950" />
                          Save Deed Changes
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                /* Read-Only Title View (Phase 2 & Phase 3 & Officer) */
                <>
                  {/* Owner Row */}
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs neu-raised ${
                        authStage === 'OFFICER'
                          ? 'text-amber-400 border border-amber-500/40'
                          : isSelectedUnitVerified
                          ? 'text-emerald-400 border border-emerald-500/40 bg-emerald-950/30'
                          : 'text-cyan-400 border border-cyan-500/40'
                      }`}
                    >
                      {authStage === 'OFFICER' || isSelectedUnitVerified
                        ? (selectedUnit.owner_name ? selectedUnit.owner_name.charAt(0) : 'G')
                        : '🔒'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-white truncate">
                        {authStage === 'OFFICER'
                          ? selectedUnit.owner_name || 'State / Common Association'
                          : isSelectedUnitVerified
                          ? selectedUnit.owner_name || 'Verified Title Holder'
                          : maskName(selectedUnit.owner_name)}
                      </p>
                      <p className="text-[10px] text-slate-400 flex items-center gap-1">
                        <User className="w-2.5 h-2.5 text-slate-400" />
                        {authStage === 'OFFICER'
                          ? (selectedUnit.owner_name ? 'Primary Title Holder (Official View)' : 'Public / Common Property')
                          : isSelectedUnitVerified
                          ? 'Verified Title Holder (Your Property)'
                          : 'Registered Title Holder (Masked PII)'}
                      </p>
                    </div>
                  </div>

                  {/* Personal & Demographic Details (State, City, Pincode, Age, Date of Purchase) */}
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    {/* Age of Owner */}
                    <div className="neu-inset-sm p-2 rounded-xl flex items-center justify-between text-[11px] border border-[var(--neu-border)]">
                      <span className="text-slate-400 font-medium flex items-center gap-1">
                        <User className="w-3 h-3 text-slate-400" />
                        Age:
                      </span>
                      <span
                        className={`font-mono font-semibold ${
                          authStage === 'OFFICER'
                            ? 'text-amber-300'
                            : isSelectedUnitVerified
                            ? 'text-emerald-300'
                            : 'text-cyan-300'
                        }`}
                      >
                        {authStage === 'OFFICER' || isSelectedUnitVerified ? '48 Yrs' : maskAge(48)}
                      </span>
                    </div>

                    {/* Date of Purchase */}
                    <div className="neu-inset-sm p-2 rounded-xl flex items-center justify-between text-[11px] border border-[var(--neu-border)]">
                      <span className="text-slate-400 font-medium flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-slate-400" />
                        Purchased:
                      </span>
                      <span
                        className={`font-mono font-semibold text-[10px] truncate ${
                          authStage === 'OFFICER'
                            ? 'text-amber-300'
                            : isSelectedUnitVerified
                            ? 'text-emerald-300'
                            : 'text-cyan-300'
                        }`}
                      >
                        {authStage === 'OFFICER' || isSelectedUnitVerified
                          ? '14-Aug-2021'
                          : maskDate('14-Aug-2021')}
                      </span>
                    </div>
                  </div>

                  {/* Location Demographics: State, City, Pincode */}
                  <div className="neu-inset-sm p-2 rounded-xl space-y-1.5 text-[11px] border border-[var(--neu-border)]">
                    <div className="flex items-center justify-between text-slate-300">
                      <span className="text-slate-400 flex items-center gap-1 font-medium">
                        <MapPin className="w-3 h-3 text-slate-400" />
                        State & City:
                      </span>
                      <span
                        className={`font-medium ${
                          authStage === 'OFFICER'
                            ? 'text-amber-300'
                            : isSelectedUnitVerified
                            ? 'text-emerald-300'
                            : 'text-cyan-300 font-mono'
                        }`}
                      >
                        {authStage === 'OFFICER' || isSelectedUnitVerified
                          ? 'Karnataka, Bangalore'
                          : `${maskState('Karnataka')}, ${maskCity('Bangalore')}`}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-slate-300 pt-0.5 border-t border-slate-800/60">
                      <span className="text-slate-400 font-medium">Postal Pincode:</span>
                      <span
                        className={`font-mono font-semibold ${
                          authStage === 'OFFICER'
                            ? 'text-amber-300'
                            : isSelectedUnitVerified
                            ? 'text-emerald-300'
                            : 'text-cyan-300'
                        }`}
                      >
                        {authStage === 'OFFICER' || isSelectedUnitVerified
                          ? '560001'
                          : maskPincode('560001')}
                      </span>
                    </div>
                  </div>

                  {/* RERA Number */}
                  {selectedUnit.rera_reg_no && (
                    <div className="neu-inset-sm p-2 rounded-xl flex items-center justify-between text-[11px] border border-[var(--neu-border)]">
                      <span className="text-slate-400 font-medium">RERA License:</span>
                      <span
                        className={`font-mono font-semibold truncate max-w-[190px] ${
                          authStage === 'OFFICER'
                            ? 'text-amber-300'
                            : isSelectedUnitVerified
                            ? 'text-emerald-300'
                            : 'text-cyan-300'
                        }`}
                      >
                        {authStage === 'OFFICER' || isSelectedUnitVerified
                          ? selectedUnit.rera_reg_no
                          : maskRera(selectedUnit.rera_reg_no)}
                      </span>
                    </div>
                  )}

                  {/* Registered Contact Phone */}
                  <div className="neu-inset-sm p-2 rounded-xl flex items-center justify-between text-[11px] border border-[var(--neu-border)]">
                    <span className="text-slate-400 font-medium">Contact Phone:</span>
                    <span
                      className={`font-mono font-semibold truncate ${
                        authStage === 'OFFICER'
                          ? 'text-amber-300'
                          : isSelectedUnitVerified
                          ? 'text-emerald-300'
                          : 'text-cyan-300'
                      }`}
                    >
                      {authStage === 'OFFICER' || isSelectedUnitVerified
                        ? (selectedUnit.contact_phone || '+91 9876543210')
                        : maskContact(selectedUnit.contact_phone || '9876543210')}
                    </span>
                  </div>

                  {/* Spatial Layer & Classification */}
                  <div className="flex items-center justify-between pt-0.5 text-[11px]">
                    <span className="text-slate-400 flex items-center gap-1.5 font-medium">
                      <Layers className="w-3.5 h-3.5 text-slate-400" />
                      Spatial Layer
                    </span>
                    <span
                      className={`px-2.5 py-0.5 rounded-md font-semibold text-[10px] ${
                        selectedUnit.layer_type === 'U'
                          ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                          : selectedUnit.layer_type === 'S'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                      }`}
                    >
                      {selectedUnit.layer_type === 'U'
                        ? 'Underground [U]'
                        : selectedUnit.layer_type === 'S'
                        ? 'Surface [S]'
                        : `Above Ground [A] · Floor ${selectedUnit.floor_level}`}
                    </span>
                  </div>
                </>
              )}
            </div>

            {/* Officer Volumetric Floor Partitioning & Stratification Module */}
            {authStage === 'OFFICER' && onOpenPartitionModal && (
              <div className="p-3.5 neu-raised border border-amber-500/40 rounded-2xl bg-amber-950/20 space-y-2.5 shadow-md">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300">
                    <Grid3X3 className="w-4 h-4 text-amber-400" />
                    <span>3D Floor Partitioning</span>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    Floor {selectedUnit.floor_level >= 0 ? `F${selectedUnit.floor_level.toString().padStart(2, '0')}` : `B${Math.abs(selectedUnit.floor_level).toString().padStart(2, '0')}`}
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  Subdivide and stratify this floor into discrete flats (2–8 units) with unique 30-char 3D ULPINs and legal deed registrations.
                </p>
                <button
                  onClick={onOpenPartitionModal}
                  className="w-full py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-2 shadow-md cursor-pointer active:scale-[0.98]"
                >
                  <Grid3X3 className="w-3.5 h-3.5" />
                  <span>Subdivide Floor / Unit Partitioning</span>
                </button>
              </div>
            )}

            {/* Dispute Resolution Action Center (Admin only, or warning/grievance banner for citizen when clashing) */}
            {selectedUnit.is_clashing && (
              <div className="neu-raised border border-rose-500/50 p-4 rounded-2xl text-rose-200 shadow-md space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-rose-300 font-bold text-xs">
                    <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0 animate-pulse" />
                    Spatial Encroachment Detected
                  </div>
                  {isAuthenticated && (
                    <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3 text-amber-400" />
                      Officer Jurisdiction
                    </span>
                  )}
                </div>

                <p className="text-[11px] text-rose-200/90 leading-relaxed font-sans">
                  {selectedUnit.clash_details ||
                    'Volumetric boundary penetration exceeds authorized spatial rights.'}
                </p>

                <div className="text-[10px] font-mono text-rose-300 neu-inset-sm border border-rose-900/60 p-2.5 rounded-xl font-semibold">
                  Vertical Span: {selectedUnit.z_min.toFixed(1)}m — {selectedUnit.z_max.toFixed(1)}m AMSL
                </div>

                {/* Dispute Resolution Workflow for Authenticated Cadastral Officers or Citizen Grievance Portal */}
                {authStage === 'OFFICER' ? (
                  <div className="mt-3 pt-3 border-t border-rose-800/60 space-y-2.5">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300">
                      <Scale className="w-3.5 h-3.5 text-amber-400" />
                      Execute Legal Dispute Resolution
                    </div>

                    <div>
                      <label className="block text-[10px] font-semibold text-rose-300 uppercase tracking-wider mb-1">
                        Cadastral Resolution Order
                      </label>
                      <select
                        value={resolutionAction}
                        onChange={(e) =>
                          setResolutionAction(
                            e.target.value as DisputeResolutionAction
                          )
                        }
                        className="w-full neu-inset border border-[var(--neu-border)] rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-amber-400/50 focus:border-amber-400 transition-all"
                      >
                        <option value="REGULARIZED_PENALTY_PAID">
                          Regularized: Fine / Penalty Paid
                        </option>
                        <option value="DEED_RECTIFIED">
                          Deed Rectified: Mutual Cadastre Adjustment
                        </option>
                        <option value="DEMOLITION_ORDERED">
                          Demolition Ordered: Clear Encroachment
                        </option>
                        <option value="FALSE_POSITIVE_OVERRIDE">
                          False Positive: Architectural Easement
                        </option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-semibold text-rose-300 uppercase tracking-wider mb-1">
                        Legal Rationale / Surveyor File No.
                      </label>
                      <input
                        type="text"
                        value={resolutionNotes}
                        onChange={(e) => setResolutionNotes(e.target.value)}
                        placeholder="e.g., Order #RERA-BLR-2026/891 verified by Surveyor"
                        className="w-full neu-inset border border-[var(--neu-border)] rounded-xl px-2.5 py-1.5 text-xs text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400/50 focus:border-amber-400 font-mono transition-all"
                      />
                    </div>

                    {disputeSuccessMessage && (
                      <div className="p-2 neu-inset-sm border border-emerald-500/50 rounded-lg text-emerald-300 text-xs flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                        <span>{disputeSuccessMessage}</span>
                      </div>
                    )}

                    <button
                      onClick={handleResolveDispute}
                      disabled={resolvingDispute}
                      className="w-full py-2.5 bg-rose-600 hover:bg-rose-500 disabled:bg-slate-600 text-white font-extrabold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-md active:scale-[0.98] cursor-pointer"
                    >
                      {resolvingDispute ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          Executing Order...
                        </>
                      ) : (
                        <>
                          <Scale className="w-3.5 h-3.5" />
                          Resolve & Clear Dispute
                        </>
                      )}
                    </button>
                  </div>
                ) : authStage === 'CITIZEN' ? (
                  isSelectedUnitVerified ? (
                    <div className="mt-3 pt-3 border-t border-rose-800/60 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-300">
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Dispute Grievance Portal</span>
                        </div>
                        <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                          <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
                          Verified Owner
                        </span>
                      </div>

                      {grievanceTicketId ? (
                        <div className="p-3 neu-inset border border-emerald-500/50 rounded-xl bg-emerald-950/40 text-emerald-200 text-xs space-y-1 animate-fade-in">
                          <div className="flex items-center gap-1.5 text-emerald-300 font-bold">
                            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                            <span>Grievance Lodged Successfully!</span>
                          </div>
                          <p className="text-[11px] text-slate-300">
                            Ticket <strong className="text-white font-mono">{grievanceTicketId}</strong> generated. Assigned to Karnataka Cadastral Appellate & Survey Inspector.
                          </p>
                        </div>
                      ) : (
                        <form onSubmit={handleSubmitGrievance} className="space-y-2">
                          <p className="text-[11px] text-slate-300 leading-relaxed">
                            As the verified title owner, you can lodge a spatial encroachment grievance directly to the RERA & Survey Appellate Authority:
                          </p>
                          <textarea
                            rows={2}
                            value={citizenGrievanceText}
                            onChange={(e) => setCitizenGrievanceText(e.target.value)}
                            placeholder="Describe the spatial encroachment or unauthorized construction (min. 5 characters)..."
                            minLength={5}
                            className="w-full neu-inset border border-slate-800 rounded-xl p-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-400/50 focus:border-emerald-400 transition-all font-sans"
                            required
                          />
                          {citizenGrievanceText.trim().length > 0 && citizenGrievanceText.trim().length < 5 && (
                            <p className="text-[10px] text-amber-300 font-medium">
                              Please enter at least {5 - citizenGrievanceText.trim().length} more character{5 - citizenGrievanceText.trim().length > 1 ? 's' : ''}.
                            </p>
                          )}
                          <button
                            type="submit"
                            disabled={submittingGrievance || citizenGrievanceText.trim().length < 5}
                            className="w-full py-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-md cursor-pointer active:scale-[0.98]"
                          >
                            {submittingGrievance ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                Lodging Official Grievance...
                              </>
                            ) : (
                              <>
                                <Send className="w-3.5 h-3.5" />
                                <span>Submit Grievance to Survey Dept</span>
                              </>
                            )}
                          </button>
                        </form>
                      )}
                    </div>
                  ) : (
                    <div className="mt-3 pt-3 border-t border-rose-800/60 space-y-2">
                      <div className="flex items-center justify-between text-xs font-semibold text-rose-300">
                        <span className="flex items-center gap-1.5">
                          <Lock className="w-3.5 h-3.5 text-rose-400" />
                          Ownership Verification Required
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-300 leading-relaxed">
                        To file an official dispute grievance or contest this 3D spatial encroachment, you must verify your deed ownership for this parcel.
                      </p>
                      {onOpenPropertyVerifyModal && (
                        <button
                          onClick={onOpenPropertyVerifyModal}
                          className="w-full py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-md cursor-pointer active:scale-[0.98]"
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                          <span>Verify Property to File Grievance</span>
                        </button>
                      )}
                    </div>
                  )
                ) : (
                  <div className="mt-2 pt-2 border-t border-rose-900/60 space-y-2 text-[11px]">
                    <span className="text-slate-400 block">Citizen login and property verification required to file grievance.</span>
                    {onOpenCitizenAuthModal && (
                      <button
                        onClick={onOpenCitizenAuthModal}
                        className="w-full py-1.5 rounded-lg neu-btn text-emerald-400 font-semibold text-xs flex items-center justify-center gap-1.5 border border-emerald-500/30 cursor-pointer"
                      >
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>Authenticate Citizen to File Grievance</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Citizen Issue & Grievance Filing Section for Verified Property (Directly Below Title & Land Registry) */}
            {!selectedUnit.is_clashing && authStage === 'CITIZEN' && isSelectedUnitVerified && (
              <div className="p-3.5 neu-raised border border-emerald-500/40 rounded-2xl bg-emerald-950/20 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-300">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Property Grievance & Issue Request</span>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                    <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
                    Verified Owner
                  </span>
                </div>

                {grievanceTicketId ? (
                  <div className="p-3 neu-inset border border-emerald-500/50 rounded-xl bg-emerald-950/40 text-emerald-200 text-xs space-y-1 animate-fade-in">
                    <div className="flex items-center gap-1.5 text-emerald-300 font-bold">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                      <span>Issue Request Lodged Successfully!</span>
                    </div>
                    <p className="text-[11px] text-slate-300">
                      Ticket <strong className="text-white font-mono">{grievanceTicketId}</strong> generated. Assigned to Karnataka Cadastral Appellate & Survey Inspector.
                    </p>
                  </div>
                ) : (
                  <form onSubmit={handleSubmitGrievance} className="space-y-2">
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      As the verified title owner, you can raise an official boundary verification, encroachment complaint, or title service request:
                    </p>
                    <textarea
                      rows={2}
                      value={citizenGrievanceText}
                      onChange={(e) => setCitizenGrievanceText(e.target.value)}
                      placeholder="Describe the spatial boundary issue, easement concern, or unauthorized encroachment (min. 5 characters)..."
                      minLength={5}
                      className="w-full neu-inset border border-slate-800 rounded-xl p-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-400/50 focus:border-emerald-400 transition-all font-sans"
                      required
                    />
                    {citizenGrievanceText.trim().length > 0 && citizenGrievanceText.trim().length < 5 && (
                      <p className="text-[10px] text-amber-300 font-medium">
                        Please enter at least {5 - citizenGrievanceText.trim().length} more character{5 - citizenGrievanceText.trim().length > 1 ? 's' : ''}.
                      </p>
                    )}
                    <button
                      type="submit"
                      disabled={submittingGrievance || citizenGrievanceText.trim().length < 5}
                      className="w-full py-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-md cursor-pointer active:scale-[0.98]"
                    >
                      {submittingGrievance ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          Lodging Official Request...
                        </>
                      ) : (
                        <>
                          <Send className="w-3.5 h-3.5" />
                          <span>Submit Issue Request to Survey Dept</span>
                        </>
                      )}
                    </button>
                  </form>
                )}
              </div>
            )}

            {/* AI/ML & Solar Potential Section (Placed just above Download Report button) */}
            <div className="neu-raised border border-emerald-500/30 rounded-2xl p-4 space-y-3 relative overflow-hidden">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-xs">
                  <Sun className="w-4 h-4 text-amber-500" />
                  <span>AI/ML Solar & Drone Audit</span>
                </div>
                <span className="px-2 py-0.5 rounded-md text-[9px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1 font-semibold">
                  <Sparkles className="w-2.5 h-2.5" />
                  LiDAR Inferred
                </span>
              </div>

              {/* Solar Metrics Grid */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="neu-inset-sm p-2.5 rounded-xl border border-[var(--neu-border)]">
                  <span className="text-[10px] text-slate-400 block">Est. Solar Capacity</span>
                  <div className="flex items-baseline gap-1 mt-0.5">
                    <span className="text-sm font-bold text-amber-300 font-mono">
                      {solarCapacity.toFixed(2)}
                    </span>
                    <span className="text-[10px] text-slate-400 font-medium">kW</span>
                  </div>
                </div>

                <div className="neu-inset-sm p-2.5 rounded-xl border border-[var(--neu-border)]">
                  <span className="text-[10px] text-slate-400 block">Annual Clean Yield</span>
                  <div className="flex items-baseline gap-1 mt-0.5">
                    <span className="text-sm font-bold text-emerald-300 font-mono">
                      {annualSolarYield}
                    </span>
                    <span className="text-[10px] text-slate-400 font-medium">kWh/yr</span>
                  </div>
                </div>
              </div>

              {/* Additional ML Attributes Bar */}
              <div className="neu-inset-sm p-2.5 rounded-xl space-y-1.5 text-[11px] border border-[var(--neu-border)]">
                <div className="flex items-center justify-between text-slate-300">
                  <span className="text-slate-400 flex items-center gap-1">
                    <Cpu className="w-3 h-3 text-cyan-400" />
                    LiDAR Point Density:
                  </span>
                  <span className="font-mono text-cyan-300 font-semibold">
                    {selectedUnit.point_count || 1013} pts
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-300">
                  <span className="text-slate-400 flex items-center gap-1">
                    <Zap className="w-3 h-3 text-amber-400" />
                    Usable Solar Roof:
                  </span>
                  <span className="font-mono text-amber-300 font-semibold">
                    {(selectedUnit.usable_roof_area_m2 || footprintArea * 0.75).toFixed(1)} m²
                  </span>
                </div>
              </div>
            </div>

            {/* Export Official Cadastral Report (.txt) — scrollable at end of content */}
            <div className="pt-2 pb-2">
              <button
                onClick={handleDownloadReport}
                disabled={downloading}
                className="w-full py-2.5 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-md transition-all duration-200 cursor-pointer neu-btn bg-cyan-500 hover:bg-cyan-400 text-slate-950 active:scale-[0.98]"
              >
                {downloading ? (
                  <>
                    <FileText className="w-4 h-4 animate-pulse text-slate-950" />
                    <span>Generating Cadastral TXT...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 text-slate-950" />
                    <span>Download Report (.txt)</span>
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          /* Empty State when no unit is selected */
          <div className="p-4 flex-1 flex flex-col items-center justify-center text-center">
            <div className="neu-inset p-8 rounded-2xl flex flex-col items-center max-w-[320px] border border-[var(--neu-border)]">
              <div className="w-12 h-12 rounded-2xl neu-raised-sm flex items-center justify-center mb-3 text-cyan-400 border border-[var(--neu-border)]">
                <Building2 className="w-6 h-6" />
              </div>
              <h3 className="text-xs font-bold text-white mb-1">
                No Unit Selected
              </h3>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Click on any 3D volumetric prism in the digital twin or use the search bar to inspect cadastre records.
              </p>
            </div>
          </div>
        )}
      </aside>
    </>
  )
}
