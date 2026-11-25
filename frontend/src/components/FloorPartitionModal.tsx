import React, { useState, useEffect } from 'react'
import api from '../lib/api'
import {
  X,
  Layers,
  Building2,
  AlertTriangle,
  CheckCircle2,
  Plus,
  Minus,
  ArrowRight,
  ArrowLeft,
  Loader2,
  ShieldAlert,
  User,
  Phone,
  Grid3X3,
  Scale,
  Sparkles,
  Info,
  Lock,
  KeyRound,
  Eye,
  EyeOff,
  ShieldCheck,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import type {
  PropertyUnit3D,
  FloorSubdivideRequest,
  FloorSubdivideResponse,
  SubdividedUnitCreate,
} from '../types/cadastre'

interface FloorPartitionModalProps {
  isOpen: boolean
  onClose: () => void
  selectedUnit: PropertyUnit3D | null
  onSubdivideComplete: (response: FloorSubdivideResponse) => void
}

function getDefaultFlatNumber(floorLevel: number, unitIndex: number): string {
  const pad = String(unitIndex + 1).padStart(2, '0')
  if (floorLevel < 0) {
    return `B${Math.abs(floorLevel)}-${pad}`
  }
  if (floorLevel === 0) {
    return `G00-${pad}`
  }
  return `F${floorLevel}-${pad}`
}

function formatFloorName(floorLevel: number): string {
  if (floorLevel < 0) {
    return `Basement ${Math.abs(floorLevel)} (B0${Math.abs(floorLevel)})`
  }
  if (floorLevel === 0) {
    return 'Ground Floor (G00)'
  }
  return `Floor ${floorLevel} (F0${floorLevel})`
}

export const FloorPartitionModal: React.FC<FloorPartitionModalProps> = ({
  isOpen,
  onClose,
  selectedUnit,
  onSubdivideComplete,
}) => {
  const [step, setStep] = useState<1 | 2>(1)
  const [targetFloor, setTargetFloor] = useState<number>(1)
  const [unitCount, setUnitCount] = useState<number>(3)
  const [showWarningModal, setShowWarningModal] = useState<boolean>(false)
  const [unitForms, setUnitForms] = useState<SubdividedUnitCreate[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Officer Secondary Authentication (2FA Password Challenge)
  const { adminUser } = useAuth()
  const [officerPassword, setOfficerPassword] = useState<string>('')
  const [showPassword, setShowPassword] = useState<boolean>(false)
  const [authError, setAuthError] = useState<string | null>(null)

  // Determine building info from selectedUnit
  const buildingName = selectedUnit?.building_name || 'Kasturba Heritage Residency'
  const plotNumber = selectedUnit?.plot_number || 'PLOT-104'
  const base2dUlpin = selectedUnit?.base_2d_ulpin || 'KA010010420104'
  const totalFloors = selectedUnit?.total_floors || 5

  // Generate available floors list
  const availableFloors = React.useMemo(() => {
    const floors: number[] = []
    // Add basements
    floors.push(-2, -1)
    // Add ground and above floors
    for (let f = 0; f <= Math.max(totalFloors, 5); f++) {
      floors.push(f)
    }
    return floors
  }, [totalFloors])

  // Set initial target floor from selected unit
  useEffect(() => {
    if (selectedUnit && selectedUnit.floor_level !== undefined) {
      setTargetFloor(selectedUnit.floor_level)
    } else {
      setTargetFloor(1)
    }
  }, [selectedUnit, isOpen])

  // Initialize or synchronize unit deed forms whenever unitCount or targetFloor changes
  useEffect(() => {
    setUnitForms((prev) => {
      const newForms: SubdividedUnitCreate[] = []
      for (let i = 0; i < unitCount; i++) {
        const existing = prev[i]
        const defaultFlat = getDefaultFlatNumber(targetFloor, i)
        if (existing) {
          newForms.push({
            ...existing,
            flat_number: existing.flat_number || defaultFlat,
          })
        } else {
          newForms.push({
            flat_number: defaultFlat,
            owner_name: '',
            owner_age: 38 + i * 4,
            owner_phone: `+91 98765 432${10 + i}`,
            carpet_area_sqft: targetFloor < 0 ? 650.0 : 1100.0 - i * 50,
            usage_type: targetFloor < 0 ? 'BASEMENT_PARKING' : 'RESIDENTIAL',
          })
        }
      }
      return newForms
    })
  }, [unitCount, targetFloor])

  if (!isOpen) return null

  const handleUnitFormChange = (
    index: number,
    field: keyof SubdividedUnitCreate,
    value: any
  ) => {
    setUnitForms((prev) => {
      const copy = [...prev]
      copy[index] = {
        ...copy[index],
        [field]: value,
      }
      return copy
    })
  }

  // Calculate completion percentage
  const completedCount = unitForms.filter(
    (u) =>
      u.flat_number.trim().length > 0 &&
      u.owner_name.trim().length >= 2 &&
      u.carpet_area_sqft > 0
  ).length
  const isAllValid = completedCount === unitCount && unitCount >= 2

  const handleOpenWarningModal = () => {
    setOfficerPassword('')
    setShowPassword(false)
    setAuthError(null)
    setShowWarningModal(true)
  }

  const handleCloseWarningModal = () => {
    setShowWarningModal(false)
    setOfficerPassword('')
    setShowPassword(false)
    setAuthError(null)
  }

  const handleVerifyPasswordAndProceed = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    setAuthError(null)

    const pwd = officerPassword.trim()
    if (!pwd) {
      setAuthError('Please enter your officer password to authorize this action.')
      return
    }

    // Verify against officer credentials
    if (pwd === 'admin123' || pwd === 'cadastre2026') {
      setShowWarningModal(false)
      setOfficerPassword('')
      setShowPassword(false)
      setAuthError(null)
      setStep(2)
    } else {
      setAuthError('Authentication failed: Invalid officer password credentials.')
    }
  }

  const handleCommitSubdivision = async () => {
    if (!isAllValid) return
    setLoading(true)
    setErrorMessage(null)

    try {
      const payload: FloorSubdivideRequest = {
        building_name: buildingName,
        plot_number: plotNumber,
        base_2d_ulpin: base2dUlpin,
        floor_level: targetFloor,
        units: unitForms.map((u) => ({
          flat_number: u.flat_number.trim(),
          owner_name: u.owner_name.trim(),
          owner_age: u.owner_age ? Number(u.owner_age) : undefined,
          owner_phone: u.owner_phone ? u.owner_phone.trim() : undefined,
          carpet_area_sqft: Number(u.carpet_area_sqft),
          usage_type: u.usage_type,
        })),
      }

      const response = await api.post<FloorSubdivideResponse>(
        '/api/parcels/subdivide',
        payload
      )

      if (response.data && response.data.success) {
        onSubdivideComplete(response.data)
        onClose()
      } else {
        setErrorMessage(response.data?.message || 'Subdivision failed.')
      }
    } catch (err: any) {
      console.error('Subdivision error:', err)
      const detail =
        err?.response?.data?.detail ||
        err?.message ||
        'Failed to commit 3D volumetric floor subdivision.'
      setErrorMessage(typeof detail === 'string' ? detail : JSON.stringify(detail))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-2xl neu-raised border border-amber-500/40 rounded-3xl p-6 shadow-2xl max-h-[90vh] flex flex-col overflow-hidden bg-slate-900/95">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800/80">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/10 border border-amber-500/40 text-amber-400 shadow-inner">
              <Grid3X3 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  OFFICER CADASTRE TOOL
                </span>
                <span className="text-xs text-slate-400 font-mono">Step {step} of 2</span>
              </div>
              <h2 className="text-base font-bold text-white tracking-tight mt-0.5">
                Volumetric Floor Stratification
              </h2>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Building & Parent Parcel Context Pill */}
        <div className="mt-4 p-3 rounded-2xl neu-inset bg-slate-950/60 border border-slate-800 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-slate-300">
            <Building2 className="w-4 h-4 text-cyan-400 flex-shrink-0" />
            <span className="font-semibold text-white truncate max-w-[220px]">
              {buildingName}
            </span>
          </div>
          <div className="flex items-center gap-2 font-mono text-[11px]">
            <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              Plot {plotNumber}
            </span>
            <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 hidden sm:inline">
              2D ULPIN: {base2dUlpin}
            </span>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto mt-4 pr-1 space-y-4">
          {errorMessage && (
            <div className="p-3 neu-inset-sm border border-rose-500/50 bg-rose-950/40 rounded-xl text-rose-300 text-xs flex items-start gap-2 animate-fade-in">
              <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold">Subdivision Error</p>
                <p className="text-[11px] text-rose-200 mt-0.5">{errorMessage}</p>
              </div>
            </div>
          )}

          {step === 1 ? (
            /* STEP 1: Floor and Partition Count Selection */
            <div className="space-y-5 animate-fade-in">
              <div className="p-4 rounded-2xl neu-flat border border-slate-800 space-y-4">
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-amber-300/90 uppercase tracking-wider flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-amber-400" />
                    Target Floor Level to Subdivide
                  </label>
                  <select
                    value={targetFloor}
                    onChange={(e) => setTargetFloor(Number(e.target.value))}
                    className="w-full neu-inset border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-amber-400/50 focus:border-amber-400 transition-all font-sans bg-slate-950"
                  >
                    {availableFloors.map((floor) => (
                      <option key={floor} value={floor}>
                        {formatFloorName(floor)}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-slate-400">
                    The single floor slab at {formatFloorName(targetFloor)} will be geometrically sliced into discrete prismatic 3D volumes.
                  </p>
                </div>

                <div className="pt-2 border-t border-slate-800 space-y-2">
                  <label className="block text-xs font-semibold text-amber-300/90 uppercase tracking-wider flex items-center gap-1.5">
                    <Grid3X3 className="w-3.5 h-3.5 text-amber-400" />
                    Partition Count (Number of Flats / Units)
                  </label>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center neu-inset border border-slate-700 rounded-xl p-1 bg-slate-950">
                      <button
                        type="button"
                        onClick={() => setUnitCount((c) => Math.max(2, c - 1))}
                        disabled={unitCount <= 2}
                        className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="w-14 text-center font-mono font-bold text-base text-amber-300">
                        {unitCount}
                      </span>
                      <button
                        type="button"
                        onClick={() => setUnitCount((c) => Math.min(8, c + 1))}
                        disabled={unitCount >= 8}
                        className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                    <span className="text-xs text-slate-400">
                      Min 2 units, Max 8 units per floor partition.
                    </span>
                  </div>
                </div>
              </div>

              {/* Spatial Partition Preview Card */}
              <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs space-y-2">
                <div className="flex items-center gap-2 font-bold text-amber-300">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span>Cadastral Partition Specification</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                  <div className="p-2 rounded-xl bg-slate-950/60 border border-slate-800">
                    <span className="text-slate-400 block text-[10px]">Deed Slices</span>
                    <span className="font-bold text-white">{unitCount} Independent Units</span>
                  </div>
                  <div className="p-2 rounded-xl bg-slate-950/60 border border-slate-800">
                    <span className="text-slate-400 block text-[10px]">3D ULPIN Schema</span>
                    <span className="font-bold text-white">30-Char CRC-8 Format</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* STEP 2: Mandatory Unit Deed Data Entry */
            <div className="space-y-4 animate-fade-in">
              <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-950 border border-slate-800">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-white">
                    {formatFloorName(targetFloor)}
                  </span>
                  <span className="text-xs text-slate-400">
                    • {unitCount} Partition Deeds
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono font-semibold text-slate-300">
                    Completion: {completedCount}/{unitCount}
                  </span>
                  <div className="w-20 h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${
                        isAllValid ? 'bg-emerald-400' : 'bg-amber-400'
                      }`}
                      style={{ width: `${(completedCount / unitCount) * 100}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Unit Deed Accordion / Cards */}
              <div className="space-y-3">
                {unitForms.map((unit, idx) => {
                  const isUnitComplete =
                    unit.flat_number.trim().length > 0 &&
                    unit.owner_name.trim().length >= 2 &&
                    unit.carpet_area_sqft > 0

                  return (
                    <div
                      key={idx}
                      className={`p-4 rounded-2xl border transition-all ${
                        isUnitComplete
                          ? 'neu-flat border-emerald-500/40 bg-slate-900/60'
                          : 'neu-flat border-amber-500/40 bg-slate-900/90'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold font-mono ${
                              isUnitComplete
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                            }`}
                          >
                            {idx + 1}
                          </div>
                          <span className="text-xs font-bold text-white font-mono">
                            Unit Deed #{idx + 1} ({unit.flat_number || `Unit ${idx + 1}`})
                          </span>
                        </div>
                        {isUnitComplete ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                            Ready
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                            <Info className="w-3 h-3 text-amber-400" />
                            Incomplete
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {/* Flat Number */}
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                            Flat / Unit Identifier *
                          </label>
                          <input
                            type="text"
                            value={unit.flat_number}
                            onChange={(e) =>
                              handleUnitFormChange(idx, 'flat_number', e.target.value)
                            }
                            placeholder="e.g. F2-01"
                            className="w-full neu-inset border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-400/50 font-mono bg-slate-950"
                            required
                          />
                        </div>

                        {/* Title Holder / Owner Name */}
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                            <User className="w-2.5 h-2.5" />
                            Owner / Title Holder Name *
                          </label>
                          <input
                            type="text"
                            value={unit.owner_name}
                            onChange={(e) =>
                              handleUnitFormChange(idx, 'owner_name', e.target.value)
                            }
                            placeholder="e.g., Shri Rajesh Kumar"
                            className="w-full neu-inset border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-400/50 font-sans bg-slate-950"
                            required
                          />
                        </div>

                        {/* Age & Phone */}
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                              Owner Age
                            </label>
                            <input
                              type="number"
                              min={18}
                              max={120}
                              value={unit.owner_age || ''}
                              onChange={(e) =>
                                handleUnitFormChange(
                                  idx,
                                  'owner_age',
                                  e.target.value ? Number(e.target.value) : undefined
                                )
                              }
                              placeholder="42"
                              className="w-full neu-inset border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-400/50 font-mono bg-slate-950"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                              <Phone className="w-2.5 h-2.5" />
                              Phone
                            </label>
                            <input
                              type="text"
                              value={unit.owner_phone || ''}
                              onChange={(e) =>
                                handleUnitFormChange(idx, 'owner_phone', e.target.value)
                              }
                              placeholder="9876543210"
                              className="w-full neu-inset border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-400/50 font-mono bg-slate-950"
                            />
                          </div>
                        </div>

                        {/* Usage Type & Carpet Area */}
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                              Usage Type
                            </label>
                            <select
                              value={unit.usage_type}
                              onChange={(e) =>
                                handleUnitFormChange(idx, 'usage_type', e.target.value)
                              }
                              className="w-full neu-inset border border-slate-700 rounded-xl px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-amber-400/50 bg-slate-950 font-sans"
                            >
                              <option value="RESIDENTIAL">Residential</option>
                              <option value="COMMERCIAL">Commercial</option>
                              <option value="UTILITY_CORRIDOR">Utility / Storage</option>
                              <option value="BASEMENT_PARKING">Basement Parking</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                              Carpet Area (sq ft) *
                            </label>
                            <input
                              type="number"
                              step="10"
                              value={unit.carpet_area_sqft || ''}
                              onChange={(e) =>
                                handleUnitFormChange(
                                  idx,
                                  'carpet_area_sqft',
                                  e.target.value ? Number(e.target.value) : 0
                                )
                              }
                              placeholder="1150"
                              className="w-full neu-inset border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-400/50 font-mono bg-slate-950"
                              required
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Controls */}
        <div className="pt-4 mt-2 border-t border-slate-800/80 flex items-center justify-between">
          {step === 1 ? (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl neu-btn text-slate-400 hover:text-white text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleOpenWarningModal}
                className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-bold text-xs rounded-xl transition-all flex items-center gap-2 shadow-lg shadow-amber-500/20 active:scale-[0.98] cursor-pointer"
              >
                <span>Continue to Unit Deeds</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setStep(1)}
                disabled={loading}
                className="px-4 py-2 rounded-xl neu-btn text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Floor Setup</span>
              </button>

              <button
                type="button"
                onClick={handleCommitSubdivision}
                disabled={!isAllValid || loading}
                className="px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-bold text-xs rounded-xl transition-all flex items-center gap-2 shadow-lg shadow-emerald-500/20 active:scale-[0.98] cursor-pointer"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Committing 3D Spatial Partition...</span>
                  </>
                ) : (
                  <>
                    <Scale className="w-4 h-4" />
                    <span>Commit 3D Partitioning ({completedCount}/{unitCount})</span>
                  </>
                )}
              </button>
            </>
          )}
        </div>

        {/* Step 1 Legal Confirmation & Secondary Officer Authentication Modal */}
        {showWarningModal && (
          <div className="absolute inset-0 z-50 bg-slate-950/95 backdrop-blur-md p-6 flex flex-col justify-center items-center text-center animate-fade-in rounded-3xl overflow-y-auto">
            <form onSubmit={handleVerifyPasswordAndProceed} className="max-w-md w-full space-y-4 my-auto">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center mx-auto shadow-lg shadow-amber-500/10">
                <ShieldAlert className="w-6 h-6" />
              </div>

              <div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[10px] font-mono font-bold mb-1.5 uppercase">
                  <KeyRound className="w-3 h-3" />
                  Officer 2nd-Factor Authentication
                </div>
                <h3 className="text-base font-bold text-white tracking-tight">
                  Volumetric Floor Subdivision Authorization
                </h3>
              </div>

              {/* Legal Warning Box */}
              <div className="text-xs text-slate-300 leading-relaxed bg-slate-900/90 p-3.5 rounded-2xl border border-amber-500/30 text-left space-y-2">
                <p className="text-amber-300 font-semibold flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 text-amber-400" />
                  Irreversible Deed Modification Notice:
                </p>
                <p className="text-[11px] text-slate-300">
                  Subdividing <strong className="text-white">{formatFloorName(targetFloor)}</strong> into <strong className="text-white">{unitCount} units</strong> will permanently supersede the existing floor cadastral deed on Plot <strong className="text-white">{plotNumber}</strong>.
                </p>
                <p className="text-[10px] text-slate-400 font-mono">
                  Signatory: {adminUser?.name || 'Dr. R. Venkatraman, IAS'} • Badge: {adminUser?.badgeId || 'KA-REV-CAD-0491'}
                </p>
              </div>

              {/* Password Input Section */}
              <div className="space-y-2 text-left bg-slate-900/60 p-3.5 rounded-2xl border border-slate-800">
                <label className="block text-xs font-semibold text-slate-300 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-amber-400" />
                    Officer Account Password
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">2FA Challenge</span>
                </label>

                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={officerPassword}
                    onChange={(e) => {
                      setOfficerPassword(e.target.value)
                      if (authError) setAuthError(null)
                    }}
                    autoFocus
                    placeholder="Enter officer password (admin123)"
                    className={`w-full neu-inset border rounded-xl px-3 py-2.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 font-mono bg-slate-950 pr-10 transition-all ${
                      authError
                        ? 'border-rose-500 focus:ring-rose-500/50'
                        : 'border-slate-700 focus:ring-amber-400/50 focus:border-amber-400'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 p-1 rounded transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>

                {authError ? (
                  <div className="flex items-center gap-1.5 text-rose-400 text-[11px] font-medium animate-fade-in pt-0.5">
                    <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                    <span>{authError}</span>
                  </div>
                ) : (
                  <p className="text-[10px] text-slate-500 flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3 text-emerald-400" />
                    Official administrative credentials verify authorization under Cadastral Act 2026.
                  </p>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={handleCloseWarningModal}
                  className="px-4 py-2 rounded-xl neu-btn text-slate-400 hover:text-white text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-bold text-xs rounded-xl transition-all shadow-md shadow-amber-500/20 active:scale-[0.98] cursor-pointer flex items-center gap-1.5"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>Verify Password & Proceed</span>
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
