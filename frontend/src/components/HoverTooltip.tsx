import React from 'react'
import {
  Building2,
  AlertTriangle,
  User,
  Ruler,
  Box,
  ShieldAlert,
  Layers,
  MapPin,
  Lock,
  CheckCircle2,
  ShieldCheck,
} from 'lucide-react'
import type { PropertyUnit3D } from '../types/cadastre'
import { useAuth } from '../context/AuthContext'
import { parse2DUlpin, parse3DUlpin } from '../utils/ulpin'

interface HoverTooltipProps {
  hoveredUnit: PropertyUnit3D | null
  position: { x: number; y: number } | null
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

export const HoverTooltip: React.FC<HoverTooltipProps> = ({
  hoveredUnit,
  position,
}) => {
  const { authStage, isPropertyVerified } = useAuth()

  if (!hoveredUnit || !position) return null

  const isUnauthenticated = authStage === 'UNAUTHENTICATED'

  // Ensure card stays neatly within viewport boundaries
  const cardWidth = 330
  const cardHeight = isUnauthenticated ? 165 : 250
  const padding = 16

  const screenWidth = typeof window !== 'undefined' ? window.innerWidth : 1920
  const screenHeight = typeof window !== 'undefined' ? window.innerHeight : 1080

  let left = position.x + 20
  let top = position.y + 20

  if (left + cardWidth > screenWidth - padding) {
    left = position.x - cardWidth - 20
  }
  if (top + cardHeight > screenHeight - padding) {
    top = position.y - cardHeight - 10
  }

  const getCategoryBadge = () => {
    const type = (hoveredUnit.unit_type || '').toUpperCase()
    const easement = (hoveredUnit.easement_type || '').toUpperCase()

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
    if (type.includes('BASEMENT') || type.includes('PARKING') || hoveredUnit.floor_level < 0 || hoveredUnit.layer_type === 'U') {
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

  // In unauthenticated mode, show high-level building identity only; omit specific flat/unit identifiers
  const displayName = isUnauthenticated
    ? hoveredUnit.building_name || 'Cadastral Parcel'
    : hoveredUnit.building_name
    ? `${hoveredUnit.building_name}${hoveredUnit.flat_number ? ` • Flat ${hoveredUnit.flat_number}` : ''}`
    : hoveredUnit.unit_number || '3D Cadastral Unit'

  const displayPlot = hoveredUnit.plot_number
    ? ` • ${hoveredUnit.plot_number}`
    : ''

  const totalFloors = hoveredUnit.total_floors || hoveredUnit.estimated_floors || 1
  const buildingHeight = hoveredUnit.building_height_m || (totalFloors * 3.2).toFixed(1)

  const isVerifiedUnit = isPropertyVerified(
    hoveredUnit.plot_number || hoveredUnit.base_2d_ulpin,
    hoveredUnit.flat_number || hoveredUnit.unit_number,
    hoveredUnit.unit_number
  )

  const parsed3D = parse3DUlpin(hoveredUnit.ulpin_3d)
  const base2d =
    hoveredUnit.base_2d_ulpin ||
    parsed3D?.base2DUlpin ||
    hoveredUnit.ulpin_id ||
    'KA010010420104'
  const parsed2D = parsed3D?.parsed2D || parse2DUlpin(base2d)

  return (
    <div
      style={{
        left: `${left}px`,
        top: `${top}px`,
      }}
      className="fixed z-50 pointer-events-none transition-all duration-75 ease-out animate-fade-in"
    >
      <div className="w-[330px] neu-raised border border-cyan-500/30 bg-slate-900/95 backdrop-blur-md rounded-2xl p-4 shadow-2xl text-white shadow-cyan-950/40">
        {/* Header: Title & Badge */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-white tracking-tight truncate flex items-center gap-1.5">
              <Building2 className="w-4 h-4 text-cyan-400 flex-shrink-0" />
              {displayName}
            </h3>
            <div className="flex items-center gap-1.5 mt-0.5">
              <MapPin className="w-3 h-3 text-emerald-400 flex-shrink-0" />
              {isUnauthenticated ? (
                <div className="flex items-center gap-1.5 truncate">
                  <p className="text-[10px] font-mono text-emerald-300 font-bold truncate">
                    {base2d}
                    {displayPlot}
                  </p>
                  <span className="text-[9px] text-slate-400 font-sans truncate">
                    · {parsed2D.districtName}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 truncate">
                  <p className="text-[10px] font-mono text-cyan-300 font-bold truncate">
                    {hoveredUnit.ulpin_3d}
                  </p>
                  {parsed3D?.isValidChecksum && (
                    <span className="px-1 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[9px] font-mono flex items-center gap-0.5 flex-shrink-0">
                      <ShieldCheck className="w-2.5 h-2.5 text-emerald-400" />
                      CRC:{parsed3D.checksum}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-1 max-w-[140px] flex-shrink-0">
            {getCategoryBadge()}
            {hoveredUnit.is_clashing && (
              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-500/25 text-rose-300 border border-rose-500/50 flex items-center gap-1">
                <ShieldAlert className="w-3 h-3 text-rose-400" />
                Disputed
              </span>
            )}
          </div>
        </div>

        {/* Dispute alert banner if clashing */}
        {hoveredUnit.is_clashing && (
          <div className="mb-2 px-2.5 py-1 rounded-lg bg-rose-500/20 border border-rose-500/60 text-rose-200 text-[10px] flex items-center gap-1.5 font-semibold animate-pulse">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" />
            <span>3D Volumetric Dispute / Encroachment</span>
          </div>
        )}

        {/* Phase 1: High-level spatial metadata only (Height & Total Floors) */}
        {isUnauthenticated ? (
          <div className="space-y-2 mt-2">
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="neu-inset-sm border border-slate-800/80 bg-slate-950/40 px-2.5 py-1.5 rounded-lg">
                <span className="text-slate-400 text-[10px] block font-medium flex items-center gap-1">
                  <Layers className="w-2.5 h-2.5 text-slate-400" />
                  Total Floors
                </span>
                <span className="font-bold text-slate-100">{totalFloors} Storeys</span>
              </div>
              <div className="neu-inset-sm border border-slate-800/80 bg-slate-950/40 px-2.5 py-1.5 rounded-lg">
                <span className="text-slate-400 text-[10px] block font-medium flex items-center gap-1">
                  <Ruler className="w-2.5 h-2.5 text-slate-400" />
                  Building Height
                </span>
                <span className="font-mono font-bold text-cyan-300">~{buildingHeight}m</span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl neu-inset border border-slate-800/80 bg-slate-950/30 text-[10px] text-slate-400">
              <Lock className="w-3 h-3 text-cyan-400 flex-shrink-0" />
              <span>Sign in as Citizen to inspect deeds & unit dimensions</span>
            </div>
          </div>
        ) : (
          /* Phase 2 & 3: Detailed Metrics & Ownership Record */
          <>
            {/* Owner / Deed Section: Citizen (masked) vs Officer / Verified (unmasked) */}
            {authStage === 'OFFICER' ? (
              <div className="flex items-center gap-2 mb-2.5 neu-inset border border-amber-500/40 px-2.5 py-1.5 rounded-xl bg-amber-950/20">
                <User className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                <div className="flex-1 min-w-0 text-xs">
                  <span className="text-amber-400 text-[10px] block font-medium">
                    Registered Title Holder (Official View)
                  </span>
                  <span className="font-bold text-slate-100 truncate block">
                    {hoveredUnit.owner_name || 'Registered Authority / RWA'}
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 mb-2.5 neu-inset border border-emerald-500/30 px-2.5 py-1.5 rounded-xl bg-emerald-950/20">
                <User className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                <div className="flex-1 min-w-0 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 text-[10px] font-medium">
                      Registered Title Holder
                    </span>
                    {isVerifiedUnit && (
                      <span className="text-[9px] font-bold text-emerald-400 flex items-center gap-0.5">
                        <CheckCircle2 className="w-2.5 h-2.5" /> Your Property
                      </span>
                    )}
                  </div>
                  <span className="font-bold text-slate-100 truncate block">
                    {isVerifiedUnit
                      ? hoveredUnit.owner_name || 'Verified Title Record'
                      : maskName(hoveredUnit.owner_name)}
                  </span>
                </div>
              </div>
            )}

            {/* Metrics Grid: Elevation, Storeys, Footprint/Carpet, Volume */}
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="neu-inset-sm border border-slate-800/80 bg-slate-950/40 px-2.5 py-1 rounded-lg">
                <span className="text-slate-400 text-[10px] block font-medium">Elevation AMSL</span>
                <span className="font-mono font-bold text-cyan-300">
                  {hoveredUnit.z_min.toFixed(1)}m — {hoveredUnit.z_max.toFixed(1)}m
                </span>
              </div>
              <div className="neu-inset-sm border border-slate-800/80 bg-slate-950/40 px-2.5 py-1 rounded-lg">
                <span className="text-slate-400 text-[10px] block font-medium flex items-center gap-1">
                  <Layers className="w-2.5 h-2.5 text-slate-400" />
                  Storeys / Level
                </span>
                <span className="font-bold text-slate-100">
                  {hoveredUnit.floor_level === -1
                    ? 'Basement (B1)'
                    : hoveredUnit.floor_level === 0
                    ? 'Ground Floor'
                    : `Floor ${hoveredUnit.floor_level} of ${totalFloors}`}
                </span>
              </div>
              <div className="neu-inset-sm border border-slate-800/80 bg-slate-950/40 px-2.5 py-1 rounded-lg flex items-center justify-between">
                <div>
                  <span className="text-slate-400 text-[10px] block font-medium">Footprint / Carpet</span>
                  <span className="font-bold text-slate-100">
                    {hoveredUnit.carpet_area_sqm
                      ? `${hoveredUnit.carpet_area_sqm.toFixed(1)} m²`
                      : hoveredUnit.footprint_area_m2
                      ? `${hoveredUnit.footprint_area_m2.toFixed(1)} m²`
                      : 'N/A'}
                  </span>
                </div>
                <Ruler className="w-3.5 h-3.5 text-slate-400" />
              </div>
              <div className="neu-inset-sm border border-slate-800/80 bg-slate-950/40 px-2.5 py-1 rounded-lg flex items-center justify-between">
                <div>
                  <span className="text-slate-400 text-[10px] block font-medium">3D Volume</span>
                  <span className="font-bold text-slate-100">
                    {hoveredUnit.volume_cum
                      ? `${hoveredUnit.volume_cum.toFixed(1)} m³`
                      : hoveredUnit.building_volume_m3
                      ? `${hoveredUnit.building_volume_m3.toFixed(1)} m³`
                      : 'N/A'}
                  </span>
                </div>
                <Box className="w-3.5 h-3.5 text-slate-400" />
              </div>
            </div>
          </>
        )}

        {/* Action hint */}
        <div className="mt-2 text-center">
          <span className="text-[10px] text-cyan-400/80 font-sans">
            Click building to focus camera & inspect cadastre
          </span>
        </div>
      </div>
    </div>
  )
}
