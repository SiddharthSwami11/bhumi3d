import { useState, useEffect } from 'react'
import api from './lib/api'
import { CesiumViewer } from './components/CesiumViewer'
import { Sidebar } from './components/Sidebar'
import { ControlToolbar } from './components/ControlToolbar'
import { LoginModal } from './components/LoginModal'
import { CitizenLoginModal } from './components/CitizenLoginModal'
import { PropertyVerifyModal } from './components/PropertyVerifyModal'
import { OfficerGrievanceModal } from './components/OfficerGrievanceModal'
import { FloorPartitionModal } from './components/FloorPartitionModal'
import { HoverTooltip } from './components/HoverTooltip'
import { AuthProvider, useAuth } from './context/AuthContext'
import type {
  PropertyUnit3D,
  GeoJSON3DCollection,
  FloorFilter,
  LayerFilters,
  MapStyle,
  FloorSubdivideResponse,
} from './types/cadastre'
import { AlertCircle, Loader2 } from 'lucide-react'

function CadastreDashboard() {
  const { userRole, authStage, userSession } = useAuth()

  // State management
  const [data, setData] = useState<GeoJSON3DCollection | null>(null)
  const [selectedUnit, setSelectedUnit] = useState<PropertyUnit3D | null>(null)
  const [hoveredUnit, setHoveredUnit] = useState<PropertyUnit3D | null>(null)
  const [hoverPosition, setHoverPosition] = useState<{ x: number; y: number } | null>(null)
  const [selectedFloor] = useState<FloorFilter>('ALL')
  const [layerFilters, setLayerFilters] = useState<LayerFilters>({
    underground: true,
    surface: true,
    aboveGround: true,
  })
  const [highlightClashesOnly, setHighlightClashesOnly] = useState(false)
  const [mapStyle, setMapStyle] = useState<MapStyle>('street')
  const [isExploded, setIsExploded] = useState(false)
  const [is2DView, setIs2DView] = useState(false)
  const [isUndergroundMode, setIsUndergroundMode] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [resetCameraTrigger, setResetCameraTrigger] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [loginModalOpen, setLoginModalOpen] = useState(false)
  const [citizenModalOpen, setCitizenModalOpen] = useState(false)
  const [propertyVerifyModalOpen, setPropertyVerifyModalOpen] = useState(false)
  const [officerGrievanceModalOpen, setOfficerGrievanceModalOpen] = useState(false)
  const [partitionModalOpen, setPartitionModalOpen] = useState(false)
  const [pendingGrievancesCount, setPendingGrievancesCount] = useState<number>(0)

  // Fetch pending grievance count for Officer notification pill
  const fetchPendingGrievanceCount = async () => {
    try {
      const response = await api.get<{ pending_count: number }>(
        '/api/parcels/grievances/pending-count'
      )
      setPendingGrievancesCount(response.data.pending_count)
    } catch (err) {
      console.error('Failed to fetch pending grievance count:', err)
    }
  }

  // Poll pending count when officer mode is active
  useEffect(() => {
    if (userRole === 'ADMIN' || authStage === 'OFFICER') {
      fetchPendingGrievanceCount()
      const interval = setInterval(fetchPendingGrievanceCount, 15000)
      return () => clearInterval(interval)
    }
  }, [userRole, authStage])

  // Load 3D spatial data from FastAPI backend
  const loadData = async (silent = false) => {
    try {
      if (!silent) setLoading(true)
      setError(null)

      // Fetch 3D GeoJSON from backend
      const response = await api.get<GeoJSON3DCollection>('/api/parcels/3d-geojson')
      setData(response.data)

      if (!silent) {
        showToast(`Loaded ${response.data.total_features} property units`)
      }
    } catch (err) {
      console.error('Failed to load cadastre data:', err)
      if (!silent) {
        setError(
          'Failed to connect to the backend API. Check the VITE_API_URL setting and ensure the FastAPI server is available.'
        )
      }
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // Toast notification helper
  const showToast = (message: string) => {
    setToastMessage(message)
    setTimeout(() => setToastMessage(null), 3500)
  }

  // Copy ULPIN to clipboard
  const handleCopyUlpin = (ulpin: string) => {
    navigator.clipboard.writeText(ulpin)
    showToast(`Copied ${ulpin} to clipboard`)
  }

  // Handle updates from Admin edits or dispute resolutions
  const handleUnitUpdated = (updatedUnit: PropertyUnit3D) => {
    setSelectedUnit(updatedUnit)

    // Update in-memory GeoJSON collection so Cesium 3D viewer instantly updates colors/properties
    if (data) {
      const updatedFeatures = data.features.map((feature) => {
        if (feature.properties.ulpin_3d === updatedUnit.ulpin_3d) {
          return {
            ...feature,
            properties: {
              ...feature.properties,
              ...updatedUnit,
            },
          }
        }
        return feature
      })

      setData({
        ...data,
        features: updatedFeatures,
      })
    }

    showToast(
      `Updated ${updatedUnit.ulpin_id || updatedUnit.unit_number} in 3D Cadastral Registry`
    )
  }

  // Handle updates from Officer grievance adjudication
  const handleGrievanceAdjudicated = (
    updatedUnitUlpin3d: string | null,
    action: 'APPROVE' | 'REJECT',
    remarks: string
  ) => {
    fetchPendingGrievanceCount()
    if (updatedUnitUlpin3d && action === 'APPROVE' && data) {
      const updatedFeatures = data.features.map((feature) => {
        if (feature.properties.ulpin_3d === updatedUnitUlpin3d) {
          return {
            ...feature,
            properties: {
              ...feature.properties,
              is_clashing: true,
              clash_details: `Grievance Confirmed: ${remarks}`,
            },
          }
        }
        return feature
      })

      setData({
        ...data,
        features: updatedFeatures,
      })

      if (selectedUnit?.ulpin_3d === updatedUnitUlpin3d) {
        setSelectedUnit({
          ...selectedUnit,
          is_clashing: true,
          clash_details: `Grievance Confirmed: ${remarks}`,
        })
      }
    } else {
      // Refresh entire dataset if rejected or general update
      loadData(true)
    }
  }

  // Handle dispute resolution from Officer grievance dashboard
  const handleGrievanceResolved = (
    resolvedUnitUlpin3d: string,
    resolutionReason: string,
    notes: string
  ) => {
    fetchPendingGrievanceCount()
    if (data) {
      const updatedFeatures = data.features.map((feature) => {
        if (feature.properties.ulpin_3d === resolvedUnitUlpin3d) {
          return {
            ...feature,
            properties: {
              ...feature.properties,
              is_clashing: false,
              clash_details: `Resolved [${resolutionReason}]: ${notes}`,
              data_status: `Dispute Resolved (${resolutionReason})`,
            },
          }
        }
        return feature
      })

      setData({
        ...data,
        features: updatedFeatures,
      })

      if (selectedUnit?.ulpin_3d === resolvedUnitUlpin3d) {
        setSelectedUnit({
          ...selectedUnit,
          is_clashing: false,
          clash_details: `Resolved [${resolutionReason}]: ${notes}`,
          data_status: `Dispute Resolved (${resolutionReason})`,
        })
      }
    }
    showToast(`✓ Dispute Resolved: 3D Unit ${resolvedUnitUlpin3d.slice(0, 14)} restored to baseline status`)
  }

  // Handle successful 3D volumetric floor subdivision & stratification
  const handleSubdivideComplete = async (response: FloorSubdivideResponse) => {
    showToast(`✨ Successfully partitioned floor into ${response.created_units_count} flats!`)
    await loadData(true)
    if (response.created_units && response.created_units.length > 0) {
      setSelectedUnit(response.created_units[0])
      setSidebarOpen(true)
    }
  }

  // Search functionality - find unit by Administrative ULPIN ID, 3D ULPIN hash, or unit number
  const handleSearch = (query: string) => {
    if (!data || !query.trim()) return

    const searchTerm = query.toLowerCase().trim()
    const foundUnit = data.features.find(
      (feature) =>
        (feature.properties.ulpin_id &&
          feature.properties.ulpin_id.toLowerCase().includes(searchTerm)) ||
        feature.properties.ulpin_3d.toLowerCase().includes(searchTerm) ||
        feature.properties.unit_number.toLowerCase().includes(searchTerm)
    )

    if (foundUnit) {
      setSelectedUnit(foundUnit.properties)
      setSidebarOpen(true)
      showToast(
        `Located: ${foundUnit.properties.ulpin_id || foundUnit.properties.unit_number}`
      )
    } else {
      showToast('No matching unit found')
    }
  }

  const handleSelectUnit = (unit: PropertyUnit3D | null) => {
    setSelectedUnit(unit)
    if (unit) {
      setSidebarOpen(true)
    }
  }

  const handleResetCamera = () => {
    setResetCameraTrigger(Date.now())
    showToast('Recentered camera to parcel plot')
  }

  const handleToggleExplode = (value: boolean) => {
    setIsExploded(value)
    showToast(value ? 'Exploded floor separation activated' : 'Exploded view collapsed')
  }

  const handleToggle2DView = (value: boolean) => {
    setIs2DView(value)
    showToast(value ? 'Plan view (top-down 2D)' : 'Oblique 3D view restored')
  }

  const handleToggleUndergroundMode = (value: boolean) => {
    setIsUndergroundMode(value)
    if (value) {
      // Ensure underground layer is active so subterranean conduits & basements are visible
      setLayerFilters((prev) => ({ ...prev, underground: true }))
      showToast('Sub-Surface Cyberpunk Mode Active (Translucent Datum)')
    } else {
      showToast('Returned to Surface 3D Cadastre')
    }
  }

  // Count clashing units
  const clashingUnitsCount = data
    ? data.features.filter((f) => f.properties.is_clashing).length
    : 0

  // Loading state
  if (loading) {
    return (
      <main className="relative w-screen h-screen overflow-hidden bg-[var(--neu-base)] flex items-center justify-center">
        <div className="neu-raised p-8 rounded-2xl flex flex-col items-center gap-4 border border-slate-800">
          <Loader2 className="w-10 h-10 text-cyan-400 animate-spin" />
          <p className="text-white text-lg font-semibold tracking-tight">
            Initializing 3D Digital Twin...
          </p>
          <p className="text-slate-400 text-xs font-mono">
            Fetching 3D Polyhedrons from PostGIS Database
          </p>
        </div>
      </main>
    )
  }

  // Error state
  if (error) {
    return (
      <main className="relative w-screen h-screen overflow-hidden bg-[var(--neu-base)] flex items-center justify-center">
        <div className="neu-raised p-8 rounded-2xl max-w-md border border-rose-900/50">
          <div className="flex items-start gap-4">
            <AlertCircle className="w-8 h-8 text-rose-400 flex-shrink-0" />
            <div>
              <h2 className="text-lg font-semibold text-white mb-1.5">
                Backend Connection Error
              </h2>
              <p className="text-slate-300 text-xs leading-relaxed mb-4">{error}</p>
              <button
                onClick={() => loadData()}
                className="px-4 py-2 neu-button bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs rounded-xl transition-colors"
              >
                Retry Connection
              </button>
            </div>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[var(--neu-base)] flex flex-row">
      {/* Primary Left Column: Full-Height Map Viewport + Floating Overlays */}
      <div className="relative flex-1 h-full min-w-0 overflow-hidden">
        {/* CesiumJS 3D Viewer with 2D Basemap */}
        <CesiumViewer
          data={data}
          selectedUnit={selectedUnit}
          selectedFloor={selectedFloor}
          layerFilters={layerFilters}
          highlightClashesOnly={highlightClashesOnly}
          mapStyle={mapStyle}
          isExploded={isExploded}
          is2DView={is2DView}
          isUndergroundMode={isUndergroundMode}
          resetCameraTrigger={resetCameraTrigger}
          onSelectUnit={handleSelectUnit}
          onHoverUnit={(unit, pos) => {
            setHoveredUnit(unit)
            setHoverPosition(pos)
          }}
        />

        {/* Floating Top-Left Control Toolbar & Search Bar */}
        <ControlToolbar
          data={data}
          selectedUnit={selectedUnit}
          layerFilters={layerFilters}
          onLayerFilterChange={setLayerFilters}
          highlightClashesOnly={highlightClashesOnly}
          onHighlightClashesChange={setHighlightClashesOnly}
          mapStyle={mapStyle}
          onMapStyleChange={setMapStyle}
          isExploded={isExploded}
          onToggleExplode={handleToggleExplode}
          is2DView={is2DView}
          onToggle2DView={handleToggle2DView}
          isUndergroundMode={isUndergroundMode}
          onToggleUndergroundMode={handleToggleUndergroundMode}
          onResetCamera={handleResetCamera}
          onSearch={handleSearch}
          onSelectUnit={handleSelectUnit}
          onOpenAuthModal={() => setLoginModalOpen(true)}
          onOpenCitizenAuthModal={() => setCitizenModalOpen(true)}
          onOpenPropertyVerifyModal={() => setPropertyVerifyModalOpen(true)}
          onOpenOfficerGrievanceModal={() => setOfficerGrievanceModalOpen(true)}
          onHoverDismiss={() => {
            setHoveredUnit(null)
            setHoverPosition(null)
          }}
          totalUnits={data?.total_features || 0}
          clashingUnitsCount={clashingUnitsCount}
          pendingGrievancesCount={pendingGrievancesCount}
        />

        {/* Floating Hover Tooltip Card (follows mouse with smooth glow) */}
        <HoverTooltip hoveredUnit={hoveredUnit} position={hoverPosition} />

        {/* Toast Notification (Top-Center Floating Badge) */}
        {toastMessage && (
          <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 animate-fade-in pointer-events-none">
            <div
              className={`px-5 py-2.5 rounded-full neu-raised border flex items-center gap-2.5 transition-all duration-300 shadow-xl ${
                userRole === 'ADMIN'
                  ? 'border-amber-500/50 shadow-amber-500/20 text-amber-200'
                  : 'border-slate-700 text-white'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  userRole === 'ADMIN' ? 'bg-amber-400' : 'bg-cyan-400'
                }`}
              />
              <p className="text-xs font-semibold tracking-tight">{toastMessage}</p>
            </div>
          </div>
        )}

        {/* Status Bar (bottom-left, z-20) */}
        <div
          onMouseEnter={() => {
            setHoveredUnit(null)
            setHoverPosition(null)
          }}
          className={`absolute bottom-4 left-4 neu-flat border px-3.5 py-1.5 rounded-xl text-[11px] z-20 font-mono shadow-lg flex items-center gap-2 transition-all duration-300 ${
            userRole === 'ADMIN'
              ? 'border-amber-500/40 text-amber-200/90'
              : authStage === 'CITIZEN' && userSession?.verifiedPlot
              ? 'border-emerald-500/40 text-emerald-200/90'
              : authStage === 'CITIZEN'
              ? 'border-amber-500/30 text-amber-200/90'
              : 'border-slate-800 text-slate-400'
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              userRole === 'ADMIN'
                ? 'bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.8)]'
                : authStage === 'CITIZEN'
                ? userSession?.verifiedPlot
                  ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]'
                  : 'bg-amber-400 animate-pulse'
                : 'bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]'
            }`}
          />
          <span>Bhumi3D Engine | Bangalore CBD (12.9716°N, 77.5946°E)</span>
          <span className="text-slate-600">|</span>
          <span
            className={
              userRole === 'ADMIN'
                ? 'text-amber-400 font-bold'
                : authStage === 'CITIZEN'
                ? userSession?.verifiedPlot
                  ? 'text-emerald-400 font-bold'
                  : 'text-amber-300 font-semibold'
                : 'text-cyan-400 font-semibold'
            }
          >
            {userRole === 'ADMIN'
              ? 'Official Cadastral Authority Mode'
              : authStage === 'CITIZEN'
              ? userSession?.verifiedPlot
                ? `Property Verified • ${userSession.verifiedPlot}${userSession.verifiedFlat ? ` (${userSession.verifiedFlat})` : ''}`
                : 'User Property Not Verified'
              : 'Public Cadastre Access'}
          </span>
        </div>
      </div>

      {/* Flush Docked Property Inspector Sidebar (right side, z-40) */}
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onToggleOpen={() => setSidebarOpen((prev) => !prev)}
        selectedUnit={selectedUnit}
        totalUnits={data?.total_features || 0}
        clashingUnitsCount={clashingUnitsCount}
        onCopyUlpin={handleCopyUlpin}
        onUnitUpdated={handleUnitUpdated}
        onOpenAuthModal={() => setLoginModalOpen(true)}
        onOpenCitizenAuthModal={() => setCitizenModalOpen(true)}
        onOpenPropertyVerifyModal={() => setPropertyVerifyModalOpen(true)}
        onOpenPartitionModal={() => setPartitionModalOpen(true)}
        onHoverDismiss={() => {
          setHoveredUnit(null)
          setHoverPosition(null)
        }}
      />

      {/* Cadastral Access & RBAC Login Modal (Officer / Admin) */}
      <LoginModal
        isOpen={loginModalOpen}
        onClose={() => setLoginModalOpen(false)}
        onSuccess={(role) => {
          showToast(
            role === 'ADMIN'
              ? '🛡️ Switched to Officer Mode — Administrative controls & Dispute regularisation unlocked'
              : 'Switched to Public Citizen View'
          )
        }}
      />

      {/* Citizen Cadastral Verification Modal */}
      <CitizenLoginModal
        isOpen={citizenModalOpen}
        onClose={() => setCitizenModalOpen(false)}
        onSuccess={(user) => {
          showToast(`👋 Welcome, ${user.name}! Citizen Cadastral Deeds Unlocked`)
        }}
      />

      {/* Citizen Property Ownership Verification Modal (Phase 3) */}
      <PropertyVerifyModal
        isOpen={propertyVerifyModalOpen}
        onClose={() => setPropertyVerifyModalOpen(false)}
        data={data}
        onSuccess={(matchedUnit, plot, flat) => {
          if (matchedUnit) {
            setSelectedUnit(matchedUnit)
            setSidebarOpen(true)
          }
          showToast(`✨ Property Verified: ${plot} ${flat} — Dispute Grievance Unlocked`)
        }}
      />

      {/* Officer Grievance Adjudication Dashboard Modal */}
      <OfficerGrievanceModal
        isOpen={officerGrievanceModalOpen}
        onClose={() => {
          setOfficerGrievanceModalOpen(false)
          fetchPendingGrievanceCount()
        }}
        onGrievanceAdjudicated={handleGrievanceAdjudicated}
        onGrievanceResolved={handleGrievanceResolved}
      />

      {/* Cadastral Officer Floor Partitioning & Volumetric Stratification Modal */}
      <FloorPartitionModal
        isOpen={partitionModalOpen}
        onClose={() => setPartitionModalOpen(false)}
        selectedUnit={selectedUnit}
        onSubdivideComplete={handleSubdivideComplete}
      />

      {/* Ambient Screen Perimeter Glow Vignette for Cadastral Officer Mode */}
      {userRole === 'ADMIN' && (
        <div className="pointer-events-none fixed inset-0 z-30 ring-1 ring-inset ring-amber-500/25 shadow-[inset_0_0_60px_rgba(245,158,11,0.08)] transition-all duration-500" />
      )}
    </main>
  )
}

function App() {
  return (
    <AuthProvider>
      <CadastreDashboard />
    </AuthProvider>
  )
}

export default App
