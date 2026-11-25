import React, { useState } from 'react'
import {
  X,
  ShieldCheck,
  Building2,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Loader2,
  Home,
  MapPin,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import type { GeoJSON3DCollection, PropertyUnit3D } from '../types/cadastre'

interface PropertyVerifyModalProps {
  isOpen: boolean
  onClose: () => void
  data: GeoJSON3DCollection | null
  onSuccess?: (matchedUnit: PropertyUnit3D | null, plot: string, flat: string) => void
}

type PropertyType = 'Apartment Unit' | 'Vacant Plot' | 'Independent House'

export const PropertyVerifyModal: React.FC<PropertyVerifyModalProps> = ({
  isOpen,
  onClose,
  data,
  onSuccess,
}) => {
  const { userSession, verifyProperty } = useAuth()

  const [propertyType, setPropertyType] = useState<PropertyType>('Apartment Unit')
  const [plot, setPlot] = useState(userSession?.verifiedPlot || 'PLOT-104')
  const [flat, setFlat] = useState(userSession?.verifiedFlat || 'F2-01')
  const [state, setState] = useState('Karnataka')
  const [city, setCity] = useState('Bangalore')
  const [pincode, setPincode] = useState('560001')
  const [address, setAddress] = useState(
    'Kasturba Road / Vittal Mallya Road Junction, Bangalore CBD'
  )

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successToast, setSuccessToast] = useState(false)

  if (!isOpen) return null

  const validateAndFindUnit = (
    plotNum: string,
    flatNum: string,
    propType: PropertyType
  ): { unit: PropertyUnit3D | null; error: string | null } => {
    if (!data || !data.features || data.features.length === 0) {
      return { unit: null, error: 'Cadastral dataset is loading. Please retry momentarily.' }
    }

    const pClean = plotNum.trim().toUpperCase()
    const fClean = flatNum.trim().toUpperCase()

    // 1. Find all features belonging to this plot / base ULPIN
    const matchingPlotFeatures = data.features.filter((f) => {
      const p = f.properties
      const propPlot = (p.plot_number || p.base_2d_ulpin || '').toUpperCase()
      const propUlpin = (p.ulpin_id || p.ulpin_3d || '').toUpperCase()
      return (
        propPlot === pClean ||
        propPlot.replace(/[^A-Z0-9]/g, '') === pClean.replace(/[^A-Z0-9]/g, '') ||
        propPlot.includes(pClean) ||
        pClean.includes(propPlot) ||
        propUlpin.includes(pClean)
      )
    })

    if (matchingPlotFeatures.length === 0) {
      return { unit: null, error: 'Plot number not found in cadastral registry.' }
    }

    // Determine max floors from building features
    const maxFloors = Math.max(
      ...matchingPlotFeatures.map(
        (f) =>
          f.properties.total_floors ||
          f.properties.estimated_floors ||
          (f.properties.floor_level != null ? f.properties.floor_level + 1 : 1)
      ),
      1
    )

    // For Vacant Plot or Independent House, match the primary/first unit or parcel envelope
    if (propType === 'Vacant Plot' || propType === 'Independent House' || !flatNum.trim()) {
      return { unit: matchingPlotFeatures[0].properties, error: null }
    }

    // 2. Validate Apartment Unit flat number against features in this plot
    const cleanAlphaNum = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '')
    const targetClean = cleanAlphaNum(fClean)

    const matchedFeature = matchingPlotFeatures.find((f) => {
      const p = f.properties
      const propFlat = (p.flat_number || '').toUpperCase()
      const propUnit = (p.unit_number || '').toUpperCase()
      return (
        cleanAlphaNum(propFlat) === targetClean ||
        cleanAlphaNum(propUnit) === targetClean ||
        propFlat.includes(fClean) ||
        fClean.includes(propFlat) ||
        propUnit.includes(fClean) ||
        fClean.includes(propUnit)
      )
    })

    if (!matchedFeature) {
      // If flat is numeric (e.g. 901, 802) or F9-01, check if floor exceeds maxFloors
      return {
        unit: null,
        error: `Selected flat/floor does not exist in this building structure (Max floors: ${maxFloors}).`,
      }
    }

    return { unit: matchedFeature.properties, error: null }
  }

  const handleVerify = (plotToVerify: string, flatToVerify: string, propType = propertyType) => {
    setError(null)
    setLoading(true)

    setTimeout(() => {
      const { unit: matched, error: validationError } = validateAndFindUnit(
        plotToVerify,
        flatToVerify,
        propType
      )

      if (validationError) {
        setLoading(false)
        setError(validationError)
        return
      }

      verifyProperty(plotToVerify, flatToVerify)
      setLoading(false)
      setSuccessToast(true)

      setTimeout(() => {
        if (onSuccess) {
          onSuccess(matched, plotToVerify, flatToVerify)
        }
        setSuccessToast(false)
        onClose()
      }, 700)
    }, 450)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!plot.trim()) {
      setError('Please provide a valid Plot / Parcel Number')
      return
    }
    if (propertyType === 'Apartment Unit' && !flat.trim()) {
      setError('Please provide a Flat / Unit number for apartment verification')
      return
    }
    handleVerify(plot.trim(), flat.trim(), propertyType)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div className="neu-raised border border-amber-500/40 bg-slate-900/95 rounded-2xl w-full max-w-lg shadow-2xl text-white overflow-hidden shadow-amber-950/40 my-8">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-tight">
                  Property Ownership Verification
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Phase 3 Access
                </span>
              </div>
              <p className="text-slate-400 text-xs">
                Validate Deed Ownership to Unlock Grievance & Dispute Filing
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

        {/* Success Toast Banner */}
        {successToast && (
          <div className="p-3.5 mx-5 mt-4 neu-inset border border-emerald-500/50 rounded-xl text-emerald-300 text-xs flex items-center gap-2.5 animate-fade-in bg-emerald-950/30">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <div>
              <p className="font-bold text-white">Property Ownership Confirmed!</p>
              <p className="text-[11px] text-emerald-300/90">
                Targeting 3D camera to your parcel and unlocking dispute grievance filing.
              </p>
            </div>
          </div>
        )}

        {/* Active Verification Notice if Already Verified */}
        {userSession?.verifiedPlot && !successToast && (
          <div className="mx-6 mt-4 p-3 neu-inset border border-cyan-500/30 rounded-xl bg-cyan-950/20 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-cyan-300">
              <Home className="w-4 h-4 text-cyan-400" />
              <span>
                Currently Verified: <strong className="text-white">{userSession.verifiedPlot}</strong> /{' '}
                <strong className="text-white">{userSession.verifiedFlat || 'All Units'}</strong>
              </span>
            </div>
            <span className="text-[10px] text-cyan-400 font-mono font-bold">ACTIVE</span>
          </div>
        )}

        <div className="p-6 space-y-4">
          {error && (
            <div className="p-3 neu-inset border border-rose-500/50 rounded-xl text-rose-300 text-xs flex items-center gap-2 bg-rose-950/30 animate-fade-in">
              <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
              <span className="font-medium">{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3.5">
            {/* Property Type Selection */}
            <div>
              <label className="block text-[11px] font-semibold text-amber-300/90 uppercase tracking-wider mb-1.5">
                Property Category
              </label>
              <select
                value={propertyType}
                onChange={(e) => {
                  setPropertyType(e.target.value as PropertyType)
                  setError(null)
                }}
                className="w-full neu-inset border border-slate-800 rounded-xl px-3 py-2 text-xs text-white bg-slate-950 focus:outline-none focus:ring-2 focus:ring-amber-400/50 focus:border-amber-400 font-medium transition-all cursor-pointer"
              >
                <option value="Apartment Unit">Apartment Unit</option>
                <option value="Vacant Plot">Vacant Plot</option>
                <option value="Independent House">Independent House</option>
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Plot Number */}
              <div>
                <label className="block text-[11px] font-semibold text-amber-300/90 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                  <Building2 className="w-3 h-3 text-amber-400" />
                  Cadastral Plot Number
                </label>
                <input
                  type="text"
                  value={plot}
                  onChange={(e) => {
                    setPlot(e.target.value)
                    setError(null)
                  }}
                  placeholder="e.g., PLOT-104"
                  className="w-full neu-inset border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-400/50 focus:border-amber-400 font-mono font-medium transition-all"
                />
              </div>

              {/* Flat / Unit Number */}
              <div>
                <label className="block text-[11px] font-semibold text-amber-300/90 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                  <KeyRound className="w-3 h-3 text-amber-400" />
                  Flat / Unit Number
                </label>
                <input
                  type="text"
                  value={flat}
                  disabled={propertyType === 'Vacant Plot'}
                  onChange={(e) => {
                    setFlat(e.target.value)
                    setError(null)
                  }}
                  placeholder={propertyType === 'Vacant Plot' ? 'N/A (Vacant Plot)' : 'e.g., F2-01'}
                  className="w-full neu-inset border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-400/50 focus:border-amber-400 font-mono font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>
            </div>

            {/* State, City, Pincode Row */}
            <div className="grid grid-cols-3 gap-2.5">
              <div>
                <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  State
                </label>
                <input
                  type="text"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  className="w-full neu-inset border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-amber-400/50 font-medium"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  City
                </label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full neu-inset border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-amber-400/50 font-medium"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Pincode
                </label>
                <input
                  type="text"
                  value={pincode}
                  onChange={(e) => setPincode(e.target.value)}
                  className="w-full neu-inset border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-amber-400/50 font-mono"
                />
              </div>
            </div>

            {/* Address Textarea */}
            <div>
              <label className="block text-[11px] font-semibold text-amber-300/90 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                <MapPin className="w-3 h-3 text-amber-400" />
                Property Address (As per Title Deed)
              </label>
              <textarea
                rows={2}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Enter complete cadastral address..."
                className="w-full neu-inset border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-400/50 focus:border-amber-400 font-medium transition-all resize-none"
              />
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-2 shadow-md shadow-amber-950/40 cursor-pointer active:scale-[0.98] mt-1"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Validating Deed Records in PostGIS...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Verify Deed Ownership</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
