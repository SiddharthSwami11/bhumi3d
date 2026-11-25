import React, { useState, useRef, useEffect, useMemo } from 'react'
import {
  Search,
  Filter,
  Eye,
  EyeOff,
  AlertTriangle,
  Layers,
  Map,
  Globe2,
  Crosshair,
  Ungroup,
  Boxes,
  Home,
  Briefcase,
  Car,
  X,
  ShieldAlert,
  ShieldCheck,
  User,
  Box,
  ChevronDown,
  LogOut,
  KeyRound,
  Bell,
} from 'lucide-react'
import type {
  LayerFilters,
  MapStyle,
  PropertyUnit3D,
  GeoJSON3DCollection,
} from '../types/cadastre'
import { useAuth } from '../context/AuthContext'

interface ControlToolbarProps {
  data?: GeoJSON3DCollection | null
  selectedUnit?: PropertyUnit3D | null
  layerFilters: LayerFilters
  onLayerFilterChange: (filters: LayerFilters) => void
  highlightClashesOnly: boolean
  onHighlightClashesChange: (value: boolean) => void
  mapStyle: MapStyle
  onMapStyleChange: (style: MapStyle) => void
  isExploded: boolean
  onToggleExplode: (value: boolean) => void
  is2DView: boolean
  onToggle2DView: (value: boolean) => void
  isUndergroundMode?: boolean
  onToggleUndergroundMode?: (value: boolean) => void
  onResetCamera: () => void
  onSearch: (query: string) => void
  onSelectUnit?: (unit: PropertyUnit3D | null) => void
  onOpenAuthModal?: () => void
  onOpenCitizenAuthModal?: () => void
  onOpenPropertyVerifyModal?: () => void
  onOpenOfficerGrievanceModal?: () => void
  onHoverDismiss?: () => void
  totalUnits?: number
  clashingUnitsCount?: number
  pendingGrievancesCount?: number
}

export const ControlToolbar: React.FC<ControlToolbarProps> = ({
  data,
  selectedUnit,
  layerFilters,
  onLayerFilterChange,
  highlightClashesOnly,
  onHighlightClashesChange,
  mapStyle,
  onMapStyleChange,
  isExploded,
  onToggleExplode,
  is2DView,
  onToggle2DView,
  isUndergroundMode = false,
  onToggleUndergroundMode,
  onResetCamera,
  onSearch,
  onSelectUnit,
  onOpenAuthModal,
  onOpenCitizenAuthModal,
  onOpenPropertyVerifyModal,
  onOpenOfficerGrievanceModal,
  onHoverDismiss,
  totalUnits = 27,
  clashingUnitsCount = 0,
  pendingGrievancesCount = 0,
}) => {
  const {
    authStage,
    userRole,
    adminUser,
    citizenUser,
    userSession,
    logout,
    loginAsCitizen,
  } = useAuth()

  const [searchQuery, setSearchQuery] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [isOpenSuggestions, setIsOpenSuggestions] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState<number>(-1)
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false)

  const searchInputRef = useRef<HTMLInputElement>(null)
  const searchContainerRef = useRef<HTMLDivElement>(null)
  const filterContainerRef = useRef<HTMLDivElement>(null)
  const profileDropdownRef = useRef<HTMLDivElement>(null)

  // Keyboard shortcut Ctrl+K / Cmd+K or '/' to focus search
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        searchInputRef.current?.focus()
      }
      if (e.key === '/' && document.activeElement !== searchInputRef.current) {
        if (!['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName || '')) {
          e.preventDefault()
          searchInputRef.current?.focus()
        }
      }
    }

    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [])

  // Filter autocomplete suggestions based on query
  const suggestions = useMemo(() => {
    if (!data || !searchQuery.trim()) return []

    const q = searchQuery.toLowerCase().trim()

    return data.features
      .map((f) => f.properties)
      .filter((unit) => {
        const matchUlpin3d = unit.ulpin_3d && unit.ulpin_3d.toLowerCase().includes(q)
        const matchUlpinId = unit.ulpin_id && unit.ulpin_id.toLowerCase().includes(q)
        const matchUnitNum = unit.unit_number && unit.unit_number.toLowerCase().includes(q)
        const matchBuildingName = unit.building_name && unit.building_name.toLowerCase().includes(q)
        const matchPlot = unit.plot_number && unit.plot_number.toLowerCase().includes(q)
        const matchFlat = unit.flat_number && unit.flat_number.toLowerCase().includes(q)
        const matchOwner = unit.owner_name && unit.owner_name.toLowerCase().includes(q)
        const matchBase = unit.base_2d_ulpin && unit.base_2d_ulpin.toLowerCase().includes(q)
        const matchBuilding = unit.building_type && unit.building_type.toLowerCase().includes(q)

        return (
          matchUlpin3d ||
          matchUlpinId ||
          matchUnitNum ||
          matchBuildingName ||
          matchPlot ||
          matchFlat ||
          matchOwner ||
          matchBase ||
          matchBuilding
        )
      })
      .slice(0, 7) // Limit to top 7 matches
  }, [data, searchQuery])

  // Reset selected index when query changes
  useEffect(() => {
    setSelectedIndex(-1)
    if (searchQuery.trim().length > 0) {
      setIsOpenSuggestions(true)
    } else {
      setIsOpenSuggestions(false)
    }
  }, [searchQuery])

  // Close suggestions, filter popover, and profile dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(event.target as Node)
      ) {
        setIsOpenSuggestions(false)
      }
      if (
        filterContainerRef.current &&
        !filterContainerRef.current.contains(event.target as Node)
      ) {
        setShowFilters(false)
      }
      if (
        profileDropdownRef.current &&
        !profileDropdownRef.current.contains(event.target as Node)
      ) {
        setProfileDropdownOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  const handleSelectSuggestion = (unit: PropertyUnit3D) => {
    setSearchQuery(unit.ulpin_id || unit.unit_number)
    setIsOpenSuggestions(false)
    if (onSelectUnit) {
      onSelectUnit(unit)
    } else {
      onSearch(unit.ulpin_id || unit.unit_number)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpenSuggestions || suggestions.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
        handleSelectSuggestion(suggestions[selectedIndex])
      } else if (suggestions.length > 0) {
        handleSelectSuggestion(suggestions[0])
      } else {
        onSearch(searchQuery)
      }
    } else if (e.key === 'Escape') {
      setIsOpenSuggestions(false)
    }
  }

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
      handleSelectSuggestion(suggestions[selectedIndex])
    } else if (suggestions.length > 0 && isOpenSuggestions) {
      handleSelectSuggestion(suggestions[0])
    } else {
      onSearch(searchQuery)
      setIsOpenSuggestions(false)
    }
  }

  const getUnitIcon = (unit: PropertyUnit3D) => {
    if (unit.is_clashing) {
      return <ShieldAlert className="w-4 h-4 text-rose-400 flex-shrink-0 animate-pulse" />
    }
    const type = (unit.unit_type || '').toUpperCase()
    const easement = (unit.easement_type || '').toUpperCase()

    if (type.includes('TRANSIT') || type.includes('METRO') || easement.includes('METRO') || type.includes('CONCOURSE')) {
      return <Box className="w-4 h-4 text-cyan-400 flex-shrink-0" />
    }
    if (type.includes('UTILITY') || easement.includes('UTILITY') || type.includes('CONDUIT') || type.includes('PIPE')) {
      return <Box className="w-4 h-4 text-orange-400 flex-shrink-0" />
    }
    if (type.includes('BASEMENT') || type.includes('PARKING') || unit.floor_level < 0 || unit.layer_type === 'U') {
      return <Car className="w-4 h-4 text-purple-400 flex-shrink-0" />
    }
    if (type.includes('COMMERCIAL')) {
      return <Briefcase className="w-4 h-4 text-sky-400 flex-shrink-0" />
    }
    if (type.includes('RESIDENTIAL')) {
      return <Home className="w-4 h-4 text-emerald-400 flex-shrink-0" />
    }
    return <Box className="w-4 h-4 text-amber-400 flex-shrink-0" />
  }

  // Common button base styling helpers
  const btnBase =
    'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer active:scale-95 border select-none'
  const btnDefault =
    'bg-slate-800/90 border-slate-700/80 text-slate-200 shadow-sm hover:text-white hover:bg-slate-700 hover:border-slate-600'

  // Active basemap mode
  const activeBasemap: 'street' | 'satellite' = mapStyle === 'satellite' ? 'satellite' : 'street'

  // Locate and select citizen verified property in 3D scene
  const handleLocateMyProperty = () => {
    if (!data || !data.features || !userSession?.verifiedPlot) return

    const pClean = userSession.verifiedPlot.trim().toUpperCase()
    const fClean = (userSession.verifiedFlat || '').trim().toUpperCase()

    // Find matching features in dataset
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

    if (matchingPlotFeatures.length === 0) return

    let matched = matchingPlotFeatures[0]
    if (fClean) {
      const cleanAlphaNum = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '')
      const targetClean = cleanAlphaNum(fClean)

      const flatMatch = matchingPlotFeatures.find((f) => {
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
      if (flatMatch) matched = flatMatch
    }

    if (matched && onSelectUnit) {
      onSelectUnit(matched.properties)
    }
  }

  return (
    <div className="absolute top-4 left-4 z-20 flex flex-col gap-2 max-w-[calc(100vw-32px)] pointer-events-none">
      {/* ═══════════════════════════════════════════════════════════
          MAIN FLOATING TOOLBAR CARD — 3-Row Spatial Control Panel
          ═══════════════════════════════════════════════════════════ */}
      <div
        onMouseEnter={onHoverDismiss}
        style={{ borderRadius: '6px' }}
        className={`pointer-events-auto neu-raised p-2.5 sm:p-3 rounded-[6px] flex flex-col gap-2 border select-none transition-all duration-300 shadow-2xl ${
          userRole === 'ADMIN'
            ? 'border-amber-500/40 bg-slate-900/95 text-amber-200'
            : 'border-slate-800 bg-slate-900/95 text-slate-100'
        }`}
      >
        {/* ──────────────────── ROW 1: Top Action & Auth Profile Row ──────────────────── */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Brand Identity */}
            <div className="flex items-center gap-2 px-1 py-0.5">
              <div
                className={`w-8 h-8 rounded-md flex items-center justify-center transition-all duration-300 border ${
                  userRole === 'ADMIN'
                    ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                    : 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40'
                }`}
              >
                <Boxes className="w-4.5 h-4.5" />
              </div>
              <div className="flex flex-col">
                <span
                  className={`text-sm font-black tracking-tight leading-none ${
                    userRole === 'ADMIN' ? 'text-amber-400' : 'text-cyan-400'
                  }`}
                >
                  Bhumi3D
                </span>
                <span className="text-[9px] font-mono text-slate-400 leading-none mt-0.5">
                  3D ULPIN Engine
                </span>
              </div>
            </div>

            <div className="h-6 w-px bg-slate-700/80 mx-0.5" />

            {/* Recenter Button */}
            <button
              onClick={onResetCamera}
              className={`${btnBase} ${btnDefault}`}
              title="Recenter Camera to Parcel"
            >
              <Crosshair className="w-3.5 h-3.5" />
              <span>Recenter</span>
            </button>

            {/* Explode Floors Button */}
            <button
              onClick={() => {
                if (!isExploded && !selectedUnit && data && data.features.length > 0) {
                  const targetUnit =
                    data.features.find((f) => f.properties.base_2d_ulpin === '14KA8829103841') ||
                    data.features[0]
                  if (targetUnit && onSelectUnit) {
                    onSelectUnit(targetUnit.properties)
                  }
                }
                onToggleExplode(!isExploded)
              }}
              className={`${btnBase} ${
                isExploded
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-sm font-bold'
                  : btnDefault
              }`}
              title={
                isExploded
                  ? 'Collapse Exploded Floors'
                  : selectedUnit
                  ? `Explode Floors for ${selectedUnit.unit_number || selectedUnit.base_2d_ulpin}`
                  : 'Explode Floors for Selected Building'
              }
            >
              <Ungroup className="w-3.5 h-3.5" />
              <span>{isExploded ? 'Collapse' : 'Explode Floors'}</span>
            </button>

            {/* 2D Plan Toggle Button (Static Neutral Styling Matching Recenter) */}
            <button
              onClick={() => onToggle2DView(!is2DView)}
              className={`${btnBase} ${btnDefault}`}
              title={is2DView ? 'Switch to 3D Oblique View' : 'Switch to 2D Plan View (Top-Down)'}
            >
              <Crosshair className="w-3.5 h-3.5" />
              <span>2D Plan</span>
            </button>

            {/* Sub-Surface / Underground Cyberpunk Mode Button */}
            <button
              onClick={() => onToggleUndergroundMode && onToggleUndergroundMode(!isUndergroundMode)}
              className={`${btnBase} ${
                isUndergroundMode
                  ? 'bg-cyan-500/25 text-cyan-300 border-cyan-400/60 shadow-[0_0_12px_rgba(6,182,212,0.45)] font-bold'
                  : btnDefault
              }`}
              title={
                isUndergroundMode
                  ? 'Exit Sub-Surface Mode & Return to Surface 3D Cadastre'
                  : 'Enter Sub-Surface / Underground Mode (Dive below 920m AMSL Datum)'
              }
            >
              <Box className={`w-3.5 h-3.5 ${isUndergroundMode ? 'text-cyan-400 animate-pulse' : ''}`} />
              <span>{isUndergroundMode ? 'Sub-Surface Active' : 'Sub-Surface'}</span>
            </button>

            {/* Basemap Switcher Group — joined pill */}
            <div className="flex items-center bg-slate-900/90 rounded-md border border-slate-800 overflow-hidden shadow-sm">
              <button
                onClick={() => {
                  onToggle2DView(false)
                  onMapStyleChange('street')
                }}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                  activeBasemap === 'street'
                    ? userRole === 'ADMIN'
                      ? 'bg-amber-400/20 text-amber-300 font-bold'
                      : 'bg-cyan-400/20 text-cyan-300 font-bold'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
                title="2D OpenStreetMap basemap with 3D prisms"
              >
                <Map className="w-3.5 h-3.5" />
                <span>2D Street</span>
              </button>
              <div className="w-px h-5 bg-slate-700/80" />
              <button
                onClick={() => {
                  onToggle2DView(false)
                  onMapStyleChange('satellite')
                }}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                  activeBasemap === 'satellite'
                    ? userRole === 'ADMIN'
                      ? 'bg-amber-400/20 text-amber-300 font-bold'
                      : 'bg-cyan-400/20 text-cyan-300 font-bold'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
                title="Satellite imagery basemap"
              >
                <Globe2 className="w-3.5 h-3.5" />
                <span>Satellite</span>
              </button>
            </div>
          </div>

          {/* ──────────────────── AUTH / PROFILE PILL (3-Phase State Machine) ──────────────────── */}
          <div ref={profileDropdownRef} className="relative flex items-center">
            {authStage === 'UNAUTHENTICATED' ? (
              <button
                onClick={onOpenCitizenAuthModal}
                className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30 transition-all shadow-sm cursor-pointer active:scale-95"
                title="Verify Citizen Identity to Unlock Title Deeds"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Citizen Login</span>
              </button>
            ) : authStage === 'OFFICER' ? (
              /* Phase Officer: Gold In-Pill Profile with Dropdown Escalation */
              <div className="relative">
                <button
                  onClick={() => setProfileDropdownOpen((prev) => !prev)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-amber-500/50 bg-amber-950/30 text-amber-200 hover:bg-amber-900/40 transition-all shadow-md cursor-pointer group select-none"
                >
                  <div className="w-6 h-6 rounded-md bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 text-xs font-bold">
                    <ShieldCheck className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex flex-col text-left">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.8)]" />
                      <span className="text-xs font-bold text-amber-300 tracking-tight leading-none truncate max-w-[130px] sm:max-w-[180px]">
                        {adminUser?.name || 'Cadastral Officer'}
                      </span>
                    </div>
                    <span className="text-[9px] text-amber-400/80 font-mono leading-none mt-0.5">
                      Cadastral Officer • Official Access
                    </span>
                  </div>
                  <ChevronDown className="w-3 h-3 text-amber-400 group-hover:translate-y-0.5 transition-transform ml-0.5" />
                </button>

                {/* Dropdown Menu */}
                {profileDropdownOpen && (
                  <div className="absolute right-0 top-full mt-2 w-72 rounded-[6px] p-3.5 shadow-2xl z-50 animate-fade-in border bg-slate-900 border-amber-500/40 text-slate-100 shadow-amber-950/40 space-y-2.5">
                    <div className="px-2 py-1.5 border-b border-slate-800">
                      <p className="text-xs font-bold text-amber-300">
                        {adminUser?.name || 'Dr. R. Venkatraman, IAS'}
                      </p>
                      <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                        Badge: {adminUser?.badgeId || 'KA-REV-CAD-0491'}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {adminUser?.jurisdiction || 'Bangalore CBD & East Zone'}
                      </p>
                    </div>

                    <div className="space-y-1">
                      <button
                        onClick={() => {
                          loginAsCitizen()
                          setProfileDropdownOpen(false)
                        }}
                        className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer text-left"
                      >
                        <User className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Switch to Citizen View</span>
                      </button>

                      <button
                        onClick={() => {
                          logout()
                          setProfileDropdownOpen(false)
                        }}
                        className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-xs font-semibold text-rose-300 hover:text-rose-200 hover:bg-rose-950/30 transition-colors cursor-pointer text-left"
                      >
                        <LogOut className="w-3.5 h-3.5 text-rose-400" />
                        <span>Sign Out / Reset Session</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Phase 2: Verified Citizen In-Pill Profile with Dropdown */
              <div className="relative">
                <button
                  onClick={() => setProfileDropdownOpen((prev) => !prev)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-emerald-500/40 bg-emerald-950/30 text-emerald-200 hover:bg-emerald-900/40 transition-all shadow-md cursor-pointer group select-none"
                >
                  <div className="w-6 h-6 rounded-md bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-300 text-xs font-bold">
                    {(userSession?.name || citizenUser?.name || 'S')[0]}
                  </div>
                  <div className="flex flex-col text-left">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
                      <span className="text-xs font-bold text-white tracking-tight leading-none truncate max-w-[130px] sm:max-w-[170px]">
                        {userSession?.name || citizenUser?.name || 'Siddharth Swami'}
                      </span>
                    </div>
                    <span className="text-[9px] text-emerald-300/80 font-mono leading-none mt-0.5">
                      Citizen • Verified
                    </span>
                  </div>
                  <ChevronDown className="w-3 h-3 text-emerald-400 group-hover:translate-y-0.5 transition-transform ml-0.5" />
                </button>

                {/* Dropdown Menu */}
                {profileDropdownOpen && (
                  <div className="absolute right-0 top-full mt-2 w-72 rounded-[6px] p-3.5 shadow-2xl z-50 animate-fade-in border bg-slate-900 border-emerald-500/40 text-slate-100 shadow-emerald-950/40 space-y-2.5">
                    <div className="px-2 py-1.5 border-b border-slate-800">
                      <p className="text-xs font-bold text-white">
                        {userSession?.name || citizenUser?.name}
                      </p>
                      <p className="text-[10px] text-emerald-300 font-mono mt-0.5">
                        Phone: {userSession?.phone || citizenUser?.phone}
                      </p>
                      {userSession?.citizenId && (
                        <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                          ID: {userSession.citizenId}
                        </p>
                      )}
                    </div>

                    {/* Verified Property Bounds */}
                    <div className="px-2 py-1 bg-slate-950/60 rounded-md border border-slate-800 text-[11px]">
                      {userSession?.verifiedPlot ? (
                        <div className="space-y-0.5">
                          <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold block">
                            Verified Property
                          </span>
                          <p className="font-bold text-emerald-300 flex items-center gap-1.5">
                            <Home className="w-3.5 h-3.5 text-emerald-400" />
                            {userSession.verifiedPlot}
                            {userSession.verifiedFlat ? ` (${userSession.verifiedFlat})` : ''}
                          </p>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            if (onOpenPropertyVerifyModal) onOpenPropertyVerifyModal()
                            setProfileDropdownOpen(false)
                          }}
                          className="w-full text-left py-1 text-amber-300 hover:text-amber-200 font-semibold flex items-center justify-between"
                        >
                          <span className="flex items-center gap-1.5">
                            <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                            Verify Property Ownership
                          </span>
                          <span className="text-[10px] text-amber-400">→</span>
                        </button>
                      )}
                    </div>

                    <div className="space-y-1">
                      {onOpenAuthModal && (
                        <button
                          onClick={() => {
                            onOpenAuthModal()
                            setProfileDropdownOpen(false)
                          }}
                          className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-xs font-medium text-amber-300 hover:text-amber-200 hover:bg-amber-950/30 transition-colors cursor-pointer text-left"
                        >
                          <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                          <span>Elevate to Officer Login</span>
                        </button>
                      )}

                      <button
                        onClick={() => {
                          logout()
                          setProfileDropdownOpen(false)
                        }}
                        className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-xs font-semibold text-rose-300 hover:text-rose-200 hover:bg-rose-950/30 transition-colors cursor-pointer text-left"
                      >
                        <LogOut className="w-3.5 h-3.5 text-rose-400" />
                        <span>Sign Out / Reset Session</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ──────────────────── ROW 2: Filters, Search & Metrics Row ──────────────────── */}
        <div className="flex items-center gap-2">
          {/* Filter Popover Button */}
          <div ref={filterContainerRef} className="relative flex-shrink-0">
            <button
              onClick={() => setShowFilters((prev) => !prev)}
              className={`p-1.5 rounded-md transition-all cursor-pointer border relative ${
                showFilters || highlightClashesOnly
                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 shadow-sm'
                  : 'bg-slate-800/80 border-slate-700/80 text-slate-200 shadow-sm hover:text-white hover:bg-slate-700 hover:border-slate-600'
              }`}
              title={`Cadastre Layer Filters (${totalUnits} units${clashingUnitsCount > 0 ? `, ${clashingUnitsCount} disputes` : ''})`}
            >
              <Filter className="w-3.5 h-3.5" />
              {clashingUnitsCount > 0 && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-rose-500 ring-2 ring-slate-900 animate-pulse" />
              )}
            </button>

            {/* Layer Filters Popover Menu */}
            {showFilters && (
              <div className="absolute left-0 top-full mt-2 w-72 rounded-[6px] p-4 shadow-2xl z-50 animate-fade-in border bg-slate-900 border-slate-800 text-slate-200">
                <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Layers className="w-3.5 h-3.5 text-cyan-400" />
                  Cadastre Layer Filters
                </h3>
                <div className="space-y-2.5">
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={layerFilters.underground}
                      onChange={(e) =>
                        onLayerFilterChange({
                          ...layerFilters,
                          underground: e.target.checked,
                        })
                      }
                      className="w-4 h-4 rounded border-slate-400 text-purple-600 focus:ring-purple-500 cursor-pointer"
                    />
                    <span className="text-xs text-slate-300 group-hover:text-white transition-colors flex items-center gap-2 font-medium">
                      {layerFilters.underground ? (
                        <Eye className="w-3.5 h-3.5 text-purple-400" />
                      ) : (
                        <EyeOff className="w-3.5 h-3.5 text-slate-400" />
                      )}
                      Underground [U] · Basements & Utilities
                    </span>
                  </label>

                  <label className="flex items-center gap-3 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={layerFilters.surface}
                      onChange={(e) =>
                        onLayerFilterChange({
                          ...layerFilters,
                          surface: e.target.checked,
                        })
                      }
                      className="w-4 h-4 rounded border-slate-400 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                    />
                    <span className="text-xs text-slate-300 group-hover:text-white transition-colors flex items-center gap-2 font-medium">
                      {layerFilters.surface ? (
                        <Eye className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <EyeOff className="w-3.5 h-3.5 text-slate-400" />
                      )}
                      Surface [S] · Ground & Plots
                    </span>
                  </label>

                  <label className="flex items-center gap-3 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={layerFilters.aboveGround}
                      onChange={(e) =>
                        onLayerFilterChange({
                          ...layerFilters,
                          aboveGround: e.target.checked,
                        })
                      }
                      className="w-4 h-4 rounded border-slate-400 text-sky-600 focus:ring-sky-500 cursor-pointer"
                    />
                    <span className="text-xs text-slate-300 group-hover:text-white transition-colors flex items-center gap-2 font-medium">
                      {layerFilters.aboveGround ? (
                        <Eye className="w-3.5 h-3.5 text-sky-400" />
                      ) : (
                        <EyeOff className="w-3.5 h-3.5 text-slate-400" />
                      )}
                      Airspace [A] · Multi-storey Units
                    </span>
                  </label>

                  <div className="pt-2 border-t border-slate-800">
                    <button
                      onClick={() => onHighlightClashesChange(!highlightClashesOnly)}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                        highlightClashesOnly
                          ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      <span className="flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
                        Disputes Only View
                      </span>
                      <span className="text-[10px] font-mono">
                        {highlightClashesOnly ? 'ACTIVE' : 'OFF'}
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Integrated Search Bar inside Toolbar */}
          <div ref={searchContainerRef} className="relative flex-1 min-w-[220px]">
            <form onSubmit={handleSearchSubmit} className="relative w-full">
              <div className="relative flex items-center w-full">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 pointer-events-none" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onFocus={() => {
                    if (searchQuery.trim().length > 0) setIsOpenSuggestions(true)
                  }}
                  placeholder="Search Bhumi3D by ULPIN, Flat, or Owner..."
                  className={`w-full h-8 pl-8.5 pr-8 rounded-md text-xs neu-inset border transition-all duration-200 focus:outline-none font-medium shadow-inner ${
                    userRole === 'ADMIN'
                      ? 'bg-slate-950/70 border-amber-500/40 text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:ring-1 focus:ring-amber-400/30'
                      : 'bg-slate-950/70 border-slate-700/80 text-white placeholder:text-slate-500 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30'
                  }`}
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('')
                      setIsOpenSuggestions(false)
                    }}
                    className="absolute right-2.5 p-0.5 rounded text-slate-400 hover:text-slate-200 transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </form>

            {/* Real-time Autocomplete Suggestions Popover */}
            {isOpenSuggestions && suggestions.length > 0 && (
              <div
                className={`absolute top-full left-0 right-0 mt-2 rounded-[6px] p-2 shadow-2xl z-50 animate-fade-in border max-h-80 overflow-y-auto ${
                  userRole === 'ADMIN'
                    ? 'bg-slate-900/98 border-amber-500/40 text-slate-100 shadow-black/40'
                    : 'bg-slate-900/98 border-slate-800 text-slate-100 shadow-xl'
                }`}
              >
                <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider font-bold text-slate-400 flex items-center justify-between border-b border-slate-800/80 mb-1">
                  <span>Matching Units & Polyhedrons</span>
                  <span
                    className={`font-mono ${
                      userRole === 'ADMIN' ? 'text-amber-400' : 'text-cyan-400'
                    }`}
                  >
                    {suggestions.length} found
                  </span>
                </div>

                {suggestions.map((unit, index) => {
                  const isSelected = index === selectedIndex
                  const floorBadge =
                    unit.floor_level === -1
                      ? 'B1'
                      : unit.floor_level === 0
                      ? 'G'
                      : `F${unit.floor_level}`

                  return (
                    <div
                      key={unit.ulpin_3d || index}
                      onClick={() => handleSelectSuggestion(unit)}
                      onMouseEnter={() => setSelectedIndex(index)}
                      className={`px-3 py-2 rounded-md cursor-pointer transition-all flex items-start gap-2.5 mt-0.5 first:mt-0 ${
                        isSelected
                          ? userRole === 'ADMIN'
                            ? 'bg-amber-500/15 text-amber-200 border border-amber-500/40'
                            : 'bg-sky-500/15 text-sky-200 border border-sky-500/40'
                          : 'hover:bg-slate-800/60 border border-transparent'
                      }`}
                    >
                      <div className="mt-0.5">{getUnitIcon(unit)}</div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold truncate">
                            {unit.unit_number}
                          </span>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-slate-800 border border-slate-700 text-slate-300">
                              {floorBadge}
                            </span>
                            {unit.is_clashing && (
                              <span className="px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-400 text-[10px] font-bold border border-rose-500/30">
                                Dispute
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 mt-0.5 text-[11px] flex-wrap">
                          <span className="font-mono font-bold text-emerald-400">
                            {unit.ulpin_3d || unit.ulpin_id || 'N/A'}
                          </span>
                          {unit.building_name && (
                            <span className="text-slate-300 text-[11px] truncate max-w-[150px]">
                              • {unit.building_name}
                            </span>
                          )}
                          {unit.plot_number && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-slate-800 text-slate-400 border border-slate-700">
                              {unit.plot_number}
                            </span>
                          )}
                          {unit.owner_name && (
                            <span className="text-slate-400 text-[11px] truncate max-w-[140px]">
                              • {unit.owner_name}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* No Results state */}
            {isOpenSuggestions && searchQuery.trim() && suggestions.length === 0 && (
              <div
                className={`absolute top-full left-0 right-0 mt-2 rounded-[6px] p-4 shadow-2xl z-50 text-center animate-fade-in border ${
                  userRole === 'ADMIN'
                    ? 'bg-slate-900 border-amber-500/40 text-slate-100'
                    : 'bg-slate-900 border-slate-800 text-slate-200'
                }`}
              >
                <p className="text-xs font-semibold text-slate-300">
                  No matching ULPIN, unit, or building found
                </p>
                <p className="text-[10px] text-slate-500 mt-1 font-mono">
                  Try searching "KA01", "Flat-201", "Kasturba", or "Parking"
                </p>
              </div>
            )}
          </div>

          {/* Global Metric Pill */}
          <div
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold border select-none flex-shrink-0 ${
              userRole === 'ADMIN'
                ? 'bg-slate-800/80 border-amber-500/30 text-slate-200'
                : 'bg-slate-800/80 border-slate-700/80 text-slate-300 shadow-sm'
            }`}
          >
            <span className="font-bold">{totalUnits} Units</span>
            <span className="text-slate-600">|</span>
            <span className={clashingUnitsCount > 0 ? 'text-rose-400 font-bold' : ''}>
              {clashingUnitsCount} Disputes
            </span>
          </div>
        </div>

        {/* ──────────────────── ROW 3: Primary Action & Verification Row ──────────────────── */}
        {(((userRole === 'ADMIN' || authStage === 'OFFICER') && onOpenOfficerGrievanceModal) ||
          (authStage === 'CITIZEN' && !userSession?.verifiedPlot && onOpenPropertyVerifyModal) ||
          (authStage === 'CITIZEN' && userSession?.verifiedPlot)) && (
          <div className="flex items-center gap-2 flex-wrap pt-0.5">
            {/* Cadastral Officer Grievance Review & Adjudication Button */}
            {(userRole === 'ADMIN' || authStage === 'OFFICER') && onOpenOfficerGrievanceModal && (
              <button
                onClick={onOpenOfficerGrievanceModal}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 transition-all shadow-sm cursor-pointer active:scale-95"
                title="Review & Adjudicate Citizen Encroachment Grievances"
              >
                <Bell className="w-3.5 h-3.5 text-amber-400" />
                <span>
                  {pendingGrievancesCount && pendingGrievancesCount > 0
                    ? `${pendingGrievancesCount} Grievance${pendingGrievancesCount > 1 ? 's' : ''} Pending Review`
                    : 'Grievances Review'}
                </span>
                {pendingGrievancesCount > 0 && (
                  <span className="flex h-2 w-2 relative ml-0.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                  </span>
                )}
              </button>
            )}

            {/* Phase 2: Verify Property Button (when unverified) */}
            {authStage === 'CITIZEN' && !userSession?.verifiedPlot && onOpenPropertyVerifyModal && (
              <button
                onClick={onOpenPropertyVerifyModal}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 transition-all shadow-sm cursor-pointer active:scale-95"
                title="Verify Property Ownership to Enable Dispute Grievance Filing"
              >
                <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                <span>Verify Property</span>
              </button>
            )}

            {/* Phase 3: My Property Button (when verified) */}
            {authStage === 'CITIZEN' && userSession?.verifiedPlot && (
              <button
                onClick={handleLocateMyProperty}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30 transition-all shadow-sm cursor-pointer active:scale-95"
                title={`Locate & Focus Camera on My Property: ${userSession.verifiedPlot} ${userSession.verifiedFlat || ''}`}
              >
                <Home className="w-3.5 h-3.5 text-emerald-400" />
                <span>
                  My Property • {userSession.verifiedPlot}
                  {userSession.verifiedFlat ? ` (${userSession.verifiedFlat})` : ''}
                </span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
