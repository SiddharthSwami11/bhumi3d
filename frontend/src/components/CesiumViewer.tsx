import React, { useEffect, useRef } from 'react'
import * as Cesium from 'cesium'
import type {
  PropertyUnit3D,
  GeoJSON3DCollection,
  FloorFilter,
  LayerFilters,
  MapStyle,
} from '../types/cadastre'

if (import.meta.env.VITE_CESIUM_TOKEN) {
  Cesium.Ion.defaultAccessToken = import.meta.env.VITE_CESIUM_TOKEN
}

interface CesiumViewerProps {
  data: GeoJSON3DCollection | null
  selectedUnit: PropertyUnit3D | null
  selectedFloor: FloorFilter
  layerFilters: LayerFilters
  highlightClashesOnly: boolean
  mapStyle?: MapStyle
  isExploded?: boolean
  is2DView?: boolean
  isUndergroundMode?: boolean
  resetCameraTrigger?: number
  onSelectUnit: (unit: PropertyUnit3D | null) => void
  onHoverUnit: (unit: PropertyUnit3D | null, position: { x: number; y: number } | null) => void
}

interface CustomCesiumEntity extends Cesium.Entity {
  _isEnvelope?: boolean
  _isFloorUnit?: boolean
  _isSubSurfaceInfra?: boolean
  _isBasement?: boolean
  _buildingId?: string
  _cadastreData?: PropertyUnit3D
  _centerLon?: number
  _centerLat?: number
  _maxZ?: number
}

interface BuildingEntityGroup {
  bKey: string
  envelope: CustomCesiumEntity
  floors: CustomCesiumEntity[]
  defaultEnvelopeColor: Cesium.Color
  defaultOutlineColor: Cesium.Color
  hasClash: boolean
  centerLon: number
  centerLat: number
  maxZ: number
  aboveGroundMinZ: number
  primaryFeature: GeoJSON3DCollection['features'][0]
  isSubSurfaceInfra: boolean
}

// Single Source of Truth Color Mapping for Buildings, Sub-surface Infrastructure, and Floor Units
const getUnitColor = (
  unitType: string,
  isDisputed: boolean = false,
  layerType?: string | null,
  easementType?: string | null
): Cesium.Color => {
  if (isDisputed) {
    return Cesium.Color.fromCssColorString('#ef4444') // Crimson Red
  }
  const type = (unitType || '').toLowerCase()
  const easement = (easementType || '').toLowerCase()

  // Subterranean Metro / Transit Tunnels & Stations
  if (
    type.includes('transit') ||
    type.includes('metro') ||
    easement.includes('metro') ||
    easement.includes('transit') ||
    type.includes('concourse')
  ) {
    return Cesium.Color.fromCssColorString('#06b6d4') // Cyberpunk Neon Cyan
  }
  // Subterranean Municipal Utility Conduits & Corridors
  if (
    type.includes('utility') ||
    easement.includes('utility') ||
    type.includes('conduit') ||
    type.includes('pipe')
  ) {
    return Cesium.Color.fromCssColorString('#f97316') // Cyberpunk Warning Orange/Amber
  }
  if (type.includes('commercial')) {
    return Cesium.Color.fromCssColorString('#0284c7') // Ocean Blue
  }
  if (type.includes('common')) {
    return Cesium.Color.fromCssColorString('#f59e0b') // Warm Amber
  }
  if (type.includes('basement') || type.includes('parking') || layerType === 'U') {
    return Cesium.Color.fromCssColorString('#7c3aed') // Deep Violet / Purple
  }
  if (type.includes('context')) {
    return Cesium.Color.fromCssColorString('#475569') // Slate
  }
  // Residential / Default
  return Cesium.Color.fromCssColorString('#059669') // Emerald Green
}

// Enterprise Digital Twin Base Color Palette for Floor Slabs & Infrastructure
const getColorForUnit = (unit: PropertyUnit3D): Cesium.Color => {
  if (unit.is_clashing) {
    return Cesium.Color.fromCssColorString('#ef4444').withAlpha(0.88) // High-visibility Crimson
  }
  return getUnitColor(unit.unit_type, false, unit.layer_type, unit.easement_type).withAlpha(0.75)
}

// Base fill matches true usage tag (Residential = Emerald Green, Commercial = Ocean Blue, Metro = Cyan, Utility = Orange)
const getBuildingEnvelopeColor = (unit: PropertyUnit3D): Cesium.Color => {
  return getUnitColor(unit.unit_type, false, unit.layer_type, unit.easement_type).withAlpha(0.65)
}

// Prominent Crimson Red outline for buildings with clashes/disputes
const getBuildingOutlineColor = (hasClash: boolean, defaultColor: Cesium.Color): Cesium.Color => {
  if (hasClash) {
    return Cesium.Color.fromCssColorString('#ef4444') // High-contrast Red Conflict Outline
  }
  return defaultColor.withAlpha(0.9)
}

// Helper: Check if a unit is deep transit / utility infrastructure (tunnels, conduits, concourses)
const isSubSurfaceInfra = (unit: PropertyUnit3D): boolean => {
  const type = (unit.unit_type || '').toLowerCase()
  const easement = (unit.easement_type || '').toLowerCase()
  const name = (unit.building_name || '').toLowerCase()
  const uNum = (unit.unit_number || '').toLowerCase()

  return (
    unit.base_2d_ulpin === 'KA010010420000' ||
    type === 'utility_corridor' ||
    type.includes('transit') ||
    type.includes('conduit') ||
    type.includes('tunnel') ||
    type.includes('concourse') ||
    easement.includes('metro') ||
    easement.includes('utility') ||
    easement.includes('transit') ||
    name.includes('metro') ||
    name.includes('subway') ||
    name.includes('utility') ||
    uNum.includes('metro') ||
    uNum.includes('util-') ||
    uNum.includes('subway')
  )
}

// Helper: Check if a unit is a building basement (parking, storage, foundation levels)
const isBuildingBasement = (unit: PropertyUnit3D): boolean => {
  if (isSubSurfaceInfra(unit)) return false
  const type = (unit.unit_type || '').toLowerCase()
  return (
    unit.floor_level < 0 ||
    unit.z_max <= 0.0 ||
    type.includes('basement') ||
    type.includes('parking') ||
    (unit.depth_below_ground_m !== null && unit.depth_below_ground_m !== undefined && unit.depth_below_ground_m > 0)
  )
}

// Helper: Compute 2D Convex Hull (Andrew's Monotone Chain) for multi-unit partitioned footprints
function computeConvexHull2D(points: number[][]): number[][] {
  if (points.length <= 3) return points
  const pts: [number, number][] = []
  const seen = new Set<string>()
  for (const p of points) {
    const key = `${p[0].toFixed(7)},${p[1].toFixed(7)}`
    if (!seen.has(key)) {
      seen.add(key)
      pts.push([p[0], p[1]])
    }
  }
  if (pts.length <= 3) return pts
  pts.sort((a, b) => (a[0] === b[0] ? a[1] - b[1] : a[0] - b[0]))
  const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lower: [number, number][] = []
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 1e-11) {
      lower.pop()
    }
    lower.push(p)
  }
  const upper: [number, number][] = []
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 1e-11) {
      upper.pop()
    }
    upper.push(p)
  }
  lower.pop()
  upper.pop()
  return lower.concat(upper)
}

// Helper to style an individual floor unit entity
const applyFloorUnitStyle = (
  floorEntity: CustomCesiumEntity,
  state: 'default' | 'hovered' | 'selected' | 'building-hover',
  buildingHasClash: boolean = false
) => {
  if (!floorEntity.polygon || !floorEntity._cadastreData) return
  const unit = floorEntity._cadastreData

  floorEntity.polygon.outline = new Cesium.ConstantProperty(true)

  if (state === 'selected') {
    floorEntity.polygon.material = new Cesium.ColorMaterialProperty(
      Cesium.Color.fromCssColorString('#facc15').withAlpha(0.92) // Amber/Gold glow for selected flat
    )
    floorEntity.polygon.outlineColor = new Cesium.ConstantProperty(Cesium.Color.WHITE)
  } else if (state === 'hovered') {
    floorEntity.polygon.material = new Cesium.ColorMaterialProperty(
      Cesium.Color.YELLOW.withAlpha(0.85) // Yellow glow for hovered flat
    )
    floorEntity.polygon.outlineColor = new Cesium.ConstantProperty(Cesium.Color.WHITE)
  } else if (state === 'building-hover') {
    floorEntity.polygon.material = new Cesium.ColorMaterialProperty(getColorForUnit(unit))
    floorEntity.polygon.outlineColor = new Cesium.ConstantProperty(
      unit.is_clashing || buildingHasClash
        ? Cesium.Color.fromCssColorString('#ef4444')
        : isBuildingBasement(unit)
        ? Cesium.Color.fromCssColorString('#a855f7')
        : isSubSurfaceInfra(unit)
        ? Cesium.Color.fromCssColorString('#06b6d4')
        : unit.unit_type.toLowerCase().includes('commercial')
        ? Cesium.Color.fromCssColorString('#38bdf8')
        : Cesium.Color.fromCssColorString('#34d399')
    )
  } else {
    // default floor state
    floorEntity.polygon.material = new Cesium.ColorMaterialProperty(getColorForUnit(unit))
    floorEntity.polygon.outlineColor = new Cesium.ConstantProperty(
      unit.is_clashing
        ? Cesium.Color.fromCssColorString('#ef4444')
        : buildingHasClash
        ? Cesium.Color.fromCssColorString('#ef4444').withAlpha(0.75)
        : isBuildingBasement(unit)
        ? Cesium.Color.fromCssColorString('#a855f7').withAlpha(0.85)
        : isSubSurfaceInfra(unit)
        ? Cesium.Color.fromCssColorString('#06b6d4').withAlpha(0.8)
        : unit.unit_type.toLowerCase().includes('commercial')
        ? Cesium.Color.fromCssColorString('#38bdf8').withAlpha(0.8)
        : Cesium.Color.fromCssColorString('#34d399').withAlpha(0.8)
    )
  }
}

// Master Visual State Engine: Controls envelope vs floor visibility across surface & underground modes
const updateBuildingVisualState = (
  building: BuildingEntityGroup,
  isHovered: boolean,
  isSelected: boolean,
  isUnderground: boolean,
  selectedUnitUlpin: string | null,
  hoveredFloorUlpin: string | null
) => {
  if (building.isSubSurfaceInfra) {
    // ─── Deep Sub-Surface Infrastructure (Metro Tunnels, Concourses, Conduits) ───
    // VISIBLE ONLY in Underground Mode
    building.envelope.show = isUnderground
    if (building.envelope.polygon) {
      if (isSelected) {
        building.envelope.polygon.material = new Cesium.ColorMaterialProperty(
          Cesium.Color.fromCssColorString('#facc15').withAlpha(0.92)
        )
        building.envelope.polygon.outlineColor = new Cesium.ConstantProperty(Cesium.Color.WHITE)
      } else if (isHovered) {
        building.envelope.polygon.material = new Cesium.ColorMaterialProperty(
          Cesium.Color.YELLOW.withAlpha(0.88)
        )
        building.envelope.polygon.outlineColor = new Cesium.ConstantProperty(Cesium.Color.WHITE)
      } else {
        building.envelope.polygon.material = new Cesium.ColorMaterialProperty(
          building.defaultEnvelopeColor
        )
        building.envelope.polygon.outlineColor = new Cesium.ConstantProperty(
          building.defaultOutlineColor
        )
      }
    }
    building.floors.forEach((f) => {
      f.show = isUnderground
      if (isUnderground) {
        const u = f._cadastreData
        if (u && u.ulpin_3d === selectedUnitUlpin) {
          applyFloorUnitStyle(f, 'selected')
        } else if (u && u.ulpin_3d === hoveredFloorUlpin) {
          applyFloorUnitStyle(f, 'hovered')
        } else {
          applyFloorUnitStyle(f, 'default', building.hasClash)
        }
      }
    })
  } else {
    // ─── Building Structures (Above-Ground Floors + Basements) ───
    if (isUnderground) {
      // IN UNDERGROUND MODE:
      // 1. Cull surface building envelope
      building.envelope.show = false
      // 2. Cull above-ground floor slabs
      // 3. Keep building basements visible in purple
      building.floors.forEach((f) => {
        if (f._isBasement) {
          f.show = true // Basements always visible in underground mode
          const u = f._cadastreData
          if (u && u.ulpin_3d === selectedUnitUlpin) {
            applyFloorUnitStyle(f, 'selected')
          } else if (u && u.ulpin_3d === hoveredFloorUlpin) {
            applyFloorUnitStyle(f, 'hovered')
          } else {
            applyFloorUnitStyle(f, 'default', building.hasClash)
          }
        } else {
          f.show = false // Cull above-ground floors in underground mode
        }
      })
    } else {
      // IN NORMAL SURFACE MODE:
      // 1. By default: Show only the monolithic building envelope in its base category color (floors & basements hidden)
      // 2. On Hover / Select: Envelope is hidden and all stratified floor slabs (above ground + purple basement floors) are revealed
      if (isSelected || isHovered) {
        building.envelope.show = false
        building.floors.forEach((f) => {
          f.show = true // Reveal all floors (both above-ground and basements)
          const u = f._cadastreData
          if (isSelected && u && u.ulpin_3d === selectedUnitUlpin) {
            applyFloorUnitStyle(f, 'selected')
          } else if (isHovered && u && u.ulpin_3d === hoveredFloorUlpin) {
            applyFloorUnitStyle(f, 'hovered')
          } else if (isHovered && !isSelected) {
            applyFloorUnitStyle(f, 'building-hover', building.hasClash)
          } else {
            applyFloorUnitStyle(f, 'default', building.hasClash)
          }
        })
      } else {
        // Monolithic solid envelope block shown for above-ground portion
        building.envelope.show = true
        if (building.envelope.polygon) {
          building.envelope.polygon.material = new Cesium.ColorMaterialProperty(
            building.defaultEnvelopeColor
          )
          building.envelope.polygon.outlineColor = new Cesium.ConstantProperty(
            building.defaultOutlineColor
          )
        }
        building.floors.forEach((f) => {
          f.show = false // Basements and individual floor units are hidden by default
        })
      }
    }
  }
}

export const CesiumViewer: React.FC<CesiumViewerProps> = ({
  data,
  selectedUnit,
  selectedFloor,
  layerFilters,
  highlightClashesOnly,
  mapStyle = 'street',
  isExploded = false,
  is2DView = false,
  isUndergroundMode = false,
  resetCameraTrigger = 0,
  onSelectUnit,
  onHoverUnit,
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<Cesium.Viewer | null>(null)

  // Fast entity lookup for hover & selection transitions
  const buildingEntitiesRef = useRef<Map<string, BuildingEntityGroup>>(new Map())

  // State tracking refs for deterministic hover & selection management
  const hoveredBuildingIdRef = useRef<string | null>(null)
  const hoveredFloorUnitUlpinRef = useRef<string | null>(null)
  const selectedBuildingIdRef = useRef<string | null>(
    selectedUnit ? selectedUnit.base_2d_ulpin || selectedUnit.ulpin_3d : null
  )
  const selectedUnitRef = useRef<PropertyUnit3D | null>(selectedUnit)
  selectedUnitRef.current = selectedUnit

  // Mode tracking ref for event handlers
  const isUndergroundModeRef = useRef<boolean>(isUndergroundMode)
  isUndergroundModeRef.current = isUndergroundMode

  // Animated Explode State & Animation Frame Ref
  const isExplodedRef = useRef<boolean>(isExploded)
  isExplodedRef.current = isExploded
  const explodeProgressRef = useRef<number>(isExploded ? 1.0 : 0.0)
  const animFrameRef = useRef<number | null>(null)

  // Hover throttle timer
  const hoverThrottleRef = useRef<number>(0)

  // Base coordinates for Bangalore CBD
  const lon = 77.5946
  const lat = 12.9716

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. Initialize Cesium 3D Viewer & Event Handlers
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return

    const viewer = new Cesium.Viewer(containerRef.current, {
      baseLayer: false,
      animation: false,
      timeline: false,
      baseLayerPicker: false,
      fullscreenButton: false,
      geocoder: false,
      homeButton: false,
      infoBox: false,
      selectionIndicator: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      scene3DOnly: true,
      shadows: false,
      requestRenderMode: true,
      maximumRenderTimeChange: Infinity,
    })

    if (viewer.scene.postProcessStages && viewer.scene.postProcessStages.fxaa) {
      viewer.scene.postProcessStages.fxaa.enabled = false
    }
    viewer.scene.highDynamicRange = false
    viewer.scene.globe.enableLighting = false
    viewer.scene.globe.depthTestAgainstTerrain = false
    viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#0b1120')
    viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#020617')

    // Initial 3D oblique camera position looking at Bangalore CBD
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(lon + 0.00015, lat - 0.0022, 180),
      orientation: {
        heading: Cesium.Math.toRadians(0.0),
        pitch: Cesium.Math.toRadians(-28.0),
        roll: 0.0,
      },
      duration: 1.5,
    })

    // Remove default double-click tracking to prevent unwanted camera tracking jumps
    viewer.screenSpaceEventHandler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK)
    viewer.screenSpaceEventHandler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_CLICK)

    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas)

    // ─────────────────────────────────────────────────────────────────────────
    // A. MOUSE_MOVE: Clean Hover State & Sub-Unit Highlighting
    // ─────────────────────────────────────────────────────────────────────────
    handler.setInputAction((movement: { endPosition: Cesium.Cartesian2 }) => {
      const now = performance.now()
      if (now - hoverThrottleRef.current < 25) return // ~40fps throttle
      hoverThrottleRef.current = now

      const pickedObject = viewer.scene.pick(movement.endPosition)
      const pickedEntity =
        Cesium.defined(pickedObject) && pickedObject.id
          ? (pickedObject.id as CustomCesiumEntity)
          : null

      const currentBuildingId = pickedEntity?._buildingId || null
      const currentFloorUlpin = pickedEntity?._cadastreData?.ulpin_3d || null
      const prevHoveredBuildingId = hoveredBuildingIdRef.current
      const prevHoveredFloorUlpin = hoveredFloorUnitUlpinRef.current
      const selectedBuildingId = selectedBuildingIdRef.current
      const selectedUnitUlpin = selectedUnitRef.current?.ulpin_3d || null
      const isUnderground = isUndergroundModeRef.current

      // ─── Case 1: Hovering Inside the SELECTED Building (Sub-Unit Hover) ───
      if (currentBuildingId && currentBuildingId === selectedBuildingId) {
        viewer.scene.canvas.style.cursor = 'pointer'

        // Highlight the specific hovered flat in yellow while keeping selected flat gold
        if (currentFloorUlpin !== prevHoveredFloorUlpin) {
          const building = buildingEntitiesRef.current.get(currentBuildingId)
          if (building) {
            building.floors.forEach((f) => {
              const u = f._cadastreData
              if (!u) return
              if (u.ulpin_3d === selectedUnitUlpin) {
                applyFloorUnitStyle(f, 'selected')
              } else if (u.ulpin_3d === currentFloorUlpin) {
                applyFloorUnitStyle(f, 'hovered')
              } else {
                applyFloorUnitStyle(f, 'default', building.hasClash)
              }
            })
          }
          hoveredFloorUnitUlpinRef.current = currentFloorUlpin
        }

        // Update hover tooltip with specific flat unit metadata
        if (pickedEntity?._cadastreData) {
          onHoverUnit(pickedEntity._cadastreData, {
            x: movement.endPosition.x,
            y: movement.endPosition.y,
          })
        }

        // If cursor previously hovered another building, restore it back
        if (prevHoveredBuildingId && prevHoveredBuildingId !== selectedBuildingId) {
          const oldBuilding = buildingEntitiesRef.current.get(prevHoveredBuildingId)
          if (oldBuilding) {
            updateBuildingVisualState(
              oldBuilding,
              false,
              false,
              isUnderground,
              selectedUnitUlpin,
              null
            )
          }
        }

        hoveredBuildingIdRef.current = currentBuildingId
        viewer.scene.requestRender()
        return
      }

      // ─── Case 2: Hovering Over a NON-SELECTED Building / Corridor ───
      if (currentBuildingId) {
        viewer.scene.canvas.style.cursor = 'pointer'

        // Revert previously hovered building
        if (prevHoveredBuildingId && prevHoveredBuildingId !== currentBuildingId) {
          const oldBuilding = buildingEntitiesRef.current.get(prevHoveredBuildingId)
          if (oldBuilding) {
            const wasOldSelected = prevHoveredBuildingId === selectedBuildingId
            updateBuildingVisualState(
              oldBuilding,
              false,
              wasOldSelected,
              isUnderground,
              selectedUnitUlpin,
              null
            )
          }
        }

        // Activate newly hovered non-selected building
        if (currentBuildingId !== prevHoveredBuildingId) {
          const newBuilding = buildingEntitiesRef.current.get(currentBuildingId)
          if (newBuilding) {
            const isNewSelected = currentBuildingId === selectedBuildingId
            updateBuildingVisualState(
              newBuilding,
              true,
              isNewSelected,
              isUnderground,
              selectedUnitUlpin,
              currentFloorUlpin
            )
          }
        }

        const newBuilding = buildingEntitiesRef.current.get(currentBuildingId)
        const unitData =
          pickedEntity?._cadastreData || newBuilding?.primaryFeature.properties || null
        onHoverUnit(unitData, { x: movement.endPosition.x, y: movement.endPosition.y })

        hoveredBuildingIdRef.current = currentBuildingId
        hoveredFloorUnitUlpinRef.current = currentFloorUlpin
        viewer.scene.requestRender()
        return
      }

      // ─── Case 3: Hovering Over EMPTY SPACE / SKY / GROUND ───
      viewer.scene.canvas.style.cursor = 'default'
      onHoverUnit(null, null)

      if (prevHoveredBuildingId) {
        const oldBuilding = buildingEntitiesRef.current.get(prevHoveredBuildingId)
        if (oldBuilding) {
          const wasOldSelected = prevHoveredBuildingId === selectedBuildingId
          updateBuildingVisualState(
            oldBuilding,
            false,
            wasOldSelected,
            isUnderground,
            selectedUnitUlpin,
            null
          )
        }
      }

      hoveredBuildingIdRef.current = null
      hoveredFloorUnitUlpinRef.current = null
      viewer.scene.requestRender()
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE)

    // ─────────────────────────────────────────────────────────────────────────
    // B. LEFT_CLICK: Focus Camera & Interactive Floor/Flat Selection
    // ─────────────────────────────────────────────────────────────────────────
    handler.setInputAction((click: { position: Cesium.Cartesian2 }) => {
      const pickedObject = viewer.scene.pick(click.position)
      const pickedEntity =
        Cesium.defined(pickedObject) && pickedObject.id
          ? (pickedObject.id as CustomCesiumEntity)
          : null

      const newBuildingId = pickedEntity?._buildingId || null
      const prevSelectedId = selectedBuildingIdRef.current
      const isUnderground = isUndergroundModeRef.current

      // Only handle selection when clicking on a cadastre entity
      if (newBuildingId && pickedEntity) {
        // 1. If clicking a DIFFERENT building, restore previous building
        if (prevSelectedId && prevSelectedId !== newBuildingId) {
          const prevBuilding = buildingEntitiesRef.current.get(prevSelectedId)
          if (prevBuilding) {
            const isPrevHovered = prevSelectedId === hoveredBuildingIdRef.current
            updateBuildingVisualState(
              prevBuilding,
              isPrevHovered,
              false,
              isUnderground,
              null,
              hoveredFloorUnitUlpinRef.current
            )
          }
        }

        // 2. Lock clicked building and unit into selected state
        selectedBuildingIdRef.current = newBuildingId
        const newBuilding = buildingEntitiesRef.current.get(newBuildingId)
        if (newBuilding) {
          const unitData = pickedEntity._cadastreData || newBuilding.primaryFeature.properties
          selectedUnitRef.current = unitData

          updateBuildingVisualState(
            newBuilding,
            true,
            true,
            isUnderground,
            unitData.ulpin_3d,
            hoveredFloorUnitUlpinRef.current
          )

          onSelectUnit(unitData)

          // Smoothly fly camera to focus on this entity if switching selection
          if (prevSelectedId !== newBuildingId) {
            const centerLon = pickedEntity._centerLon ?? newBuilding.centerLon
            const centerLat = pickedEntity._centerLat ?? newBuilding.centerLat
            const maxZ = pickedEntity._maxZ ?? newBuilding.maxZ
            const isInfra = pickedEntity._isSubSurfaceInfra || newBuilding.isSubSurfaceInfra

            if (isInfra || isUnderground) {
              // Subterranean camera focus with downward angle directly onto target
              viewer.camera.flyTo({
                destination: Cesium.Cartesian3.fromDegrees(
                  centerLon,
                  centerLat - 0.00065,
                  Math.max(maxZ + 45, 60)
                ),
                orientation: {
                  heading: Cesium.Math.toRadians(0.0),
                  pitch: Cesium.Math.toRadians(-35.0),
                  roll: 0.0,
                },
                duration: 1.2,
              })
            } else {
              viewer.camera.flyTo({
                destination: Cesium.Cartesian3.fromDegrees(
                  centerLon,
                  centerLat - 0.00095,
                  Math.max(maxZ + 38, 95)
                ),
                orientation: {
                  heading: Cesium.Math.toRadians(0.0),
                  pitch: Cesium.Math.toRadians(-28.0),
                  roll: 0.0,
                },
                duration: 1.2,
              })
            }
          }
        }
        viewer.scene.requestRender()
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK)

    // ─────────────────────────────────────────────────────────────────────────
    // C. LEFT_DOUBLE_CLICK: Deselect Building on Empty Area Double Click
    // ─────────────────────────────────────────────────────────────────────────
    handler.setInputAction((click: { position: Cesium.Cartesian2 }) => {
      const pickedObject = viewer.scene.pick(click.position)
      const pickedEntity =
        Cesium.defined(pickedObject) && pickedObject.id
          ? (pickedObject.id as CustomCesiumEntity)
          : null

      const clickedBuildingId = pickedEntity?._buildingId || null
      const isUnderground = isUndergroundModeRef.current

      // If double-clicking on empty ground / sky, deselect current building
      if (!clickedBuildingId) {
        const prevSelectedId = selectedBuildingIdRef.current
        if (prevSelectedId) {
          const prevBuilding = buildingEntitiesRef.current.get(prevSelectedId)
          if (prevBuilding) {
            const isPrevHovered = prevSelectedId === hoveredBuildingIdRef.current
            updateBuildingVisualState(
              prevBuilding,
              isPrevHovered,
              false,
              isUnderground,
              null,
              hoveredFloorUnitUlpinRef.current
            )
          }

          selectedBuildingIdRef.current = null
          selectedUnitRef.current = null
          onSelectUnit(null)
          viewer.scene.requestRender()
        }
      }
    }, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK)

    viewerRef.current = viewer

    return () => {
      handler.destroy()
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
      if (viewer && !viewer.isDestroyed()) {
        viewer.destroy()
      }
      viewerRef.current = null
    }
  }, [])

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. React to External selectedUnit and isUndergroundMode Prop Changes
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) return

    const selectedId = selectedUnit
      ? selectedUnit.base_2d_ulpin || selectedUnit.ulpin_3d
      : null
    selectedBuildingIdRef.current = selectedId
    selectedUnitRef.current = selectedUnit

    buildingEntitiesRef.current.forEach((bData) => {
      const isSelected = bData.bKey === selectedId
      const isHovered = bData.bKey === hoveredBuildingIdRef.current
      updateBuildingVisualState(
        bData,
        isHovered,
        isSelected,
        isUndergroundMode,
        selectedUnit?.ulpin_3d || null,
        hoveredFloorUnitUlpinRef.current
      )
    })

    viewer.scene.requestRender()
  }, [selectedUnit, isUndergroundMode])

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. Animated Exploded Floor Separation
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) return

    const targetProgress = isExploded ? 1.0 : 0.0
    const startProgress = explodeProgressRef.current
    const startTime = performance.now()
    const duration = 650 // ms

    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current)
    }

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime
      const t = Math.min(elapsed / duration, 1.0)
      // Ease-out cubic curve
      const ease = 1 - Math.pow(1 - t, 3)

      explodeProgressRef.current = startProgress + (targetProgress - startProgress) * ease

      if (viewerRef.current && !viewerRef.current.isDestroyed()) {
        viewer.scene.requestRender()
      }

      if (t < 1.0) {
        animFrameRef.current = requestAnimationFrame(animate)
      }
    }

    animFrameRef.current = requestAnimationFrame(animate)

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current)
      }
    }
  }, [isExploded])

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. Recenter Camera Trigger (Synchronized with Sub-Surface and Surface Mode)
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer || !resetCameraTrigger || viewer.isDestroyed()) return

    if (isUndergroundModeRef.current) {
      // Recenter directly above the subterranean network looking downward
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(lon + 0.00015, lat - 0.0015, 95),
        orientation: {
          heading: Cesium.Math.toRadians(0.0),
          pitch: Cesium.Math.toRadians(-35.0),
          roll: 0.0,
        },
        duration: 1.5,
      })
    } else {
      // Recenter to standard oblique city overview
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(lon + 0.00015, lat - 0.0022, 180),
        orientation: {
          heading: Cesium.Math.toRadians(0.0),
          pitch: Cesium.Math.toRadians(-28.0),
          roll: 0.0,
        },
        duration: 1.5,
      })
    }
  }, [resetCameraTrigger])

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. 2D Plan / 3D Oblique View Toggle
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer || viewer.isDestroyed()) return

    if (is2DView) {
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(lon + 0.00015, lat - 0.0001, 450),
        orientation: {
          heading: Cesium.Math.toRadians(0.0),
          pitch: Cesium.Math.toRadians(-90.0),
          roll: 0.0,
        },
        duration: 1.2,
      })
    } else {
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(lon + 0.00015, lat - 0.0022, 180),
        orientation: {
          heading: Cesium.Math.toRadians(0.0),
          pitch: Cesium.Math.toRadians(-28.0),
          roll: 0.0,
        },
        duration: 1.2,
      })
    }
  }, [is2DView])

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. Basemap Tile Provider Switcher
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer || viewer.isDestroyed()) return

    viewer.imageryLayers.removeAll()

    if (mapStyle === 'street') {
      const osmProvider = new Cesium.UrlTemplateImageryProvider({
        url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        maximumLevel: 19,
        enablePickFeatures: false,
      })
      viewer.imageryLayers.addImageryProvider(osmProvider)
    } else {
      try {
        const satelliteProvider = new Cesium.UrlTemplateImageryProvider({
          url: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
          maximumLevel: 18,
          enablePickFeatures: false,
        })
        viewer.imageryLayers.addImageryProvider(satelliteProvider)

        const labelsProvider = new Cesium.UrlTemplateImageryProvider({
          url: 'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
          maximumLevel: 18,
          enablePickFeatures: false,
        })
        viewer.imageryLayers.addImageryProvider(labelsProvider)
      } catch (e) {
        console.warn('Satellite provider error, fallback to OSM:', e)
        const osmProvider = new Cesium.UrlTemplateImageryProvider({
          url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
          maximumLevel: 18,
          enablePickFeatures: false,
        })
        viewer.imageryLayers.addImageryProvider(osmProvider)
      }
    }
  }, [mapStyle])

  // ─────────────────────────────────────────────────────────────────────────────
  // 6.5 Underground Sub-Surface Mode & Globe Translucency Transition
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer || viewer.isDestroyed()) return

    const scene = viewer.scene
    const globe = scene.globe

    if (isUndergroundMode) {
      // Disable camera-terrain collision to allow underground movement
      scene.screenSpaceCameraController.enableCollisionDetection = false

      // Enable subsurface globe translucency
      if (globe.translucency) {
        globe.translucency.enabled = true
        globe.translucency.frontFaceAlpha = 0.15
        globe.translucency.backFaceAlpha = 0.85
      }
      globe.depthTestAgainstTerrain = true
      globe.baseColor = Cesium.Color.fromCssColorString('#020617')

      // Cinematic camera dive aligned precisely with Recenter anchor (lon + 0.00015, lat - 0.0015, 95m)
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(lon + 0.00015, lat - 0.0015, 95),
        orientation: {
          heading: Cesium.Math.toRadians(0.0),
          pitch: Cesium.Math.toRadians(-35.0), // Downward pitch aiming into sub-surface corridors
          roll: 0.0,
        },
        duration: 1.8,
        easingFunction: Cesium.EasingFunction.QUADRATIC_IN_OUT,
      })
    } else {
      // Re-enable terrain collision detection
      scene.screenSpaceCameraController.enableCollisionDetection = true

      if (globe.translucency) {
        globe.translucency.enabled = false
      }
      globe.depthTestAgainstTerrain = false
      globe.baseColor = Cesium.Color.fromCssColorString('#0b1120')

      // Fly back to standard above-ground 3D oblique view
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(lon + 0.00015, lat - 0.0022, 180),
        orientation: {
          heading: Cesium.Math.toRadians(0.0),
          pitch: Cesium.Math.toRadians(-28.0),
          roll: 0.0,
        },
        duration: 1.5,
      })
    }
  }, [isUndergroundMode])

  // ─────────────────────────────────────────────────────────────────────────────
  // 7. Dual-Entity Architecture Generator: Envelopes vs Floor Slices
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer || !data) return

    viewer.entities.removeAll()
    buildingEntitiesRef.current.clear()

    // Surface Datum Glowing Cyan Wireframe Grid (Z = 0.0m / 920m AMSL)
    const gridMinLon = 77.592
    const gridMaxLon = 77.5975
    const gridMinLat = 12.969
    const gridMaxLat = 12.9745
    const gridStep = 0.00055 // ~60m intervals

    for (let gLon = gridMinLon; gLon <= gridMaxLon; gLon += gridStep) {
      viewer.entities.add({
        name: `Datum Grid X ${gLon.toFixed(4)}`,
        polyline: {
          positions: [
            Cesium.Cartesian3.fromDegrees(gLon, gridMinLat, 0.0),
            Cesium.Cartesian3.fromDegrees(gLon, gridMaxLat, 0.0),
          ],
          width: 1,
          material: new Cesium.ColorMaterialProperty(
            Cesium.Color.fromCssColorString('#06b6d4').withAlpha(0.25)
          ),
        },
      })
    }

    for (let gLat = gridMinLat; gLat <= gridMaxLat; gLat += gridStep) {
      viewer.entities.add({
        name: `Datum Grid Y ${gLat.toFixed(4)}`,
        polyline: {
          positions: [
            Cesium.Cartesian3.fromDegrees(gridMinLon, gLat, 0.0),
            Cesium.Cartesian3.fromDegrees(gridMaxLon, gLat, 0.0),
          ],
          width: 1,
          material: new Cesium.ColorMaterialProperty(
            Cesium.Color.fromCssColorString('#06b6d4').withAlpha(0.25)
          ),
        },
      })
    }

    // Cadastral Ground Boundary Glow Line for Target Parcel
    const baseParcelCoords = [
      Cesium.Cartesian3.fromDegrees(77.5946, 12.9716),
      Cesium.Cartesian3.fromDegrees(77.5946 + 0.0003, 12.9716),
      Cesium.Cartesian3.fromDegrees(77.5946 + 0.0003, 12.9716 + 0.0002),
      Cesium.Cartesian3.fromDegrees(77.5946, 12.9716 + 0.0002),
      Cesium.Cartesian3.fromDegrees(77.5946, 12.9716),
    ]

    viewer.entities.add({
      name: 'Cadastral Target Boundary Plot',
      polyline: {
        positions: baseParcelCoords,
        width: 3,
        material: new Cesium.PolylineGlowMaterialProperty({
          glowPower: 0.35,
          color: Cesium.Color.fromCssColorString('#38bdf8'),
        }),
        clampToGround: true,
      },
    })

    // Group features into logical building / infrastructure clusters
    const buildingMap = new Map<
      string,
      {
        bKey: string
        features: typeof data.features
        minZ: number
        maxZ: number
        aboveGroundMinZ: number
        hasClash: boolean
        centerLon: number
        centerLat: number
        primaryFeature: (typeof data.features)[0]
        isSubSurfaceInfra: boolean
      }
    >()

    data.features.forEach((feature) => {
      const unit = feature.properties
      const isInfra = isSubSurfaceInfra(unit)
      const key = isInfra ? unit.ulpin_3d : unit.base_2d_ulpin || unit.ulpin_3d

      let isVisible = true
      if (selectedFloor !== 'ALL' && unit.floor_level !== selectedFloor) isVisible = false
      if (unit.layer_type === 'U' && !layerFilters.underground) isVisible = false
      if (unit.layer_type === 'S' && !layerFilters.surface) isVisible = false
      if (unit.layer_type === 'A' && !layerFilters.aboveGround) isVisible = false
      if (highlightClashesOnly && !unit.is_clashing) isVisible = false
      if (!isVisible) return

      const existing = buildingMap.get(key)
      if (existing) {
        existing.features.push(feature)
        existing.minZ = Math.min(existing.minZ, unit.z_min)
        existing.maxZ = Math.max(existing.maxZ, unit.z_max)
        if (unit.z_max > 0.0) {
          existing.aboveGroundMinZ = Math.min(existing.aboveGroundMinZ, Math.max(0.0, unit.z_min))
        }
        if (unit.is_clashing) existing.hasClash = true
        if (!isInfra) existing.isSubSurfaceInfra = false
      } else {
        buildingMap.set(key, {
          bKey: key,
          features: [feature],
          minZ: unit.z_min,
          maxZ: unit.z_max,
          aboveGroundMinZ: unit.z_max > 0.0 ? Math.max(0.0, unit.z_min) : 0.0,
          hasClash: unit.is_clashing,
          centerLon: lon,
          centerLat: lat,
          primaryFeature: feature,
          isSubSurfaceInfra: isInfra,
        })
      }
    })

    // ─────────────────────────────────────────────────────────────────────────
    // Build Dual Entities: Monolithic Envelope Block + Detailed Floor Entities
    // ─────────────────────────────────────────────────────────────────────────
    buildingMap.forEach((building, bKey) => {
      // For above-ground buildings, select the representative above-ground floor (>= 0m)
      // to determine the envelope's true category (Commercial/Residential) and footprint,
      // ensuring subterranean basements remain deep purple while the building envelope
      // reflects the primary usage.
      let primaryFeature = building.features[0]

      if (building.isSubSurfaceInfra) {
        // Infrastructure: select lowest or first feature
        primaryFeature = building.features.reduce((best, f) =>
          f.properties.z_min < best.properties.z_min ? f : best
        )
      } else {
        const aboveGroundFeatures = building.features.filter(
          (f) =>
            !isBuildingBasement(f.properties) &&
            (f.properties.z_max > 0.0 || f.properties.floor_level >= 0)
        )

        if (aboveGroundFeatures.length > 0) {
          // Prefer lowest above-ground floor (e.g., Ground Floor = 0 or Floor 1)
          primaryFeature = aboveGroundFeatures.reduce((best, f) => {
            const fLevel = f.properties.floor_level >= 0 ? f.properties.floor_level : 999
            const bestLevel = best.properties.floor_level >= 0 ? best.properties.floor_level : 999
            if (fLevel !== bestLevel) {
              return fLevel < bestLevel ? f : best
            }
            return f.properties.z_min < best.properties.z_min ? f : best
          })
        } else {
          // Pure subterranean structure: select top-most feature
          primaryFeature = building.features.reduce((best, f) =>
            f.properties.z_max > best.properties.z_max ? f : best
          )
        }
      }

      building.primaryFeature = primaryFeature

      const geom = primaryFeature.geometry
      if (!geom || !geom.coordinates) return

      let footprintRing: number[][] = []
      if (geom.type === 'Polygon') {
        footprintRing = (geom.coordinates as number[][][])[0] || []
      } else if (geom.type === 'MultiPolygon') {
        const faces = geom.coordinates as number[][][][]
        if (faces.length > 0 && faces[0].length > 0) {
          footprintRing = faces[0][0]
        }
      }
      if (footprintRing.length < 3) return

      // Aggregate all boundary vertices across features in the building cluster
      // to generate a complete outer envelope convex hull (resolves multi-unit / quadrant apartment partitioning)
      const allPoints: number[][] = []
      building.features.forEach((f) => {
        const g = f.geometry
        if (!g || !g.coordinates) return
        if (g.type === 'Polygon') {
          const ring = (g.coordinates as number[][][])[0] || []
          ring.forEach((p) => allPoints.push([p[0], p[1]]))
        } else if (g.type === 'MultiPolygon') {
          const polys = g.coordinates as number[][][][]
          polys.forEach((poly) => {
            if (poly.length > 0 && poly[0].length > 0) {
              poly[0].forEach((p) => allPoints.push([p[0], p[1]]))
            }
          })
        }
      })

      let ringCoords = computeConvexHull2D(allPoints)
      if (ringCoords.length < 3) {
        ringCoords = footprintRing
      }

      if (
        ringCoords.length > 3 &&
        ringCoords[0][0] === ringCoords[ringCoords.length - 1][0] &&
        ringCoords[0][1] === ringCoords[ringCoords.length - 1][1]
      ) {
        ringCoords = ringCoords.slice(0, -1)
      }

      const centerLon = ringCoords.reduce((sum, p) => sum + p[0], 0) / ringCoords.length
      const centerLat = ringCoords.reduce((sum, p) => sum + p[1], 0) / ringCoords.length
      building.centerLon = centerLon
      building.centerLat = centerLat

      const hierarchy = ringCoords.map((coord) =>
        Cesium.Cartesian3.fromDegrees(coord[0], coord[1])
      )

      const defaultEnvelopeColor = getBuildingEnvelopeColor(primaryFeature.properties)
      const defaultOutlineColor = getBuildingOutlineColor(
        building.hasClash,
        defaultEnvelopeColor
      )
      const isSelected = selectedBuildingIdRef.current === bKey
      const isHovered = hoveredBuildingIdRef.current === bKey

      // ───────────────────────────────────────────────────────────────────────
      // A. MONOLITHIC BUILDING ENVELOPE ENTITY
      // For above-ground buildings, envelope represents the above-ground volume (>= 0.0m)
      // Basements are rendered as individual floor prisms directly beneath it
      // ───────────────────────────────────────────────────────────────────────
      const envHeight = building.isSubSurfaceInfra
        ? building.minZ
        : Math.max(0.0, building.aboveGroundMinZ)
      const envExtrudedHeight = building.maxZ

      const envelopeEntity = viewer.entities.add({
        name: `Building Envelope ${primaryFeature.properties.unit_number || bKey}`,
        show: !building.isSubSurfaceInfra && !isSelected && !isHovered,
        properties: new Cesium.PropertyBag({
          isEnvelope: true,
          isSubSurfaceInfra: building.isSubSurfaceInfra,
          buildingId: bKey,
          _cadastreData: primaryFeature.properties,
          _centerLon: centerLon,
          _centerLat: centerLat,
          _maxZ: building.maxZ,
        }),
        polygon: {
          hierarchy: new Cesium.PolygonHierarchy(hierarchy),
          height: envHeight,
          extrudedHeight: envExtrudedHeight,
          material: new Cesium.ColorMaterialProperty(defaultEnvelopeColor),
          outline: true,
          outlineColor: defaultOutlineColor as unknown as Cesium.Color,
          outlineWidth: building.hasClash ? 3 : 1,
          closeTop: true,
          closeBottom: true,
        },
      }) as CustomCesiumEntity

      envelopeEntity._isEnvelope = true
      envelopeEntity._isSubSurfaceInfra = building.isSubSurfaceInfra
      envelopeEntity._buildingId = bKey
      envelopeEntity._cadastreData = primaryFeature.properties
      envelopeEntity._centerLon = centerLon
      envelopeEntity._centerLat = centerLat
      envelopeEntity._maxZ = building.maxZ

      // ───────────────────────────────────────────────────────────────────────
      // B. DETAILED FLOOR ENTITIES (Basements + Above-Ground Floors)
      // ───────────────────────────────────────────────────────────────────────
      const floorEntities: CustomCesiumEntity[] = []

      building.features.forEach((feature) => {
        const unit = feature.properties
        const unitGeom = feature.geometry
        if (!unitGeom || !unitGeom.coordinates) return

        let unitFootprint: number[][] = []
        if (unitGeom.type === 'Polygon') {
          unitFootprint = (unitGeom.coordinates as number[][][])[0] || []
        } else if (unitGeom.type === 'MultiPolygon') {
          const faces = unitGeom.coordinates as number[][][][]
          if (faces.length > 0 && faces[0].length > 0) {
            unitFootprint = faces[0][0]
          }
        }
        if (unitFootprint.length < 3) return

        let unitRing = unitFootprint
        if (
          unitRing.length > 3 &&
          unitRing[0][0] === unitRing[unitRing.length - 1][0] &&
          unitRing[0][1] === unitRing[unitRing.length - 1][1]
        ) {
          unitRing = unitRing.slice(0, -1)
        }

        const unitHierarchy = unitRing.map((coord) =>
          Cesium.Cartesian3.fromDegrees(coord[0], coord[1])
        )

        const isBasement = isBuildingBasement(unit)
        const isInfra = isSubSurfaceInfra(unit)

        // Dynamic Height Offsets for Localized Floor Explosion
        const floorHeightCallback = new Cesium.CallbackProperty(() => {
          const isCurrentSelected = selectedBuildingIdRef.current === bKey
          const p = explodeProgressRef.current
          let offset = 0

          if (p > 0.0001 && isCurrentSelected) {
            if (unit.floor_level < 0) {
              offset = unit.floor_level * 3.5 * p
            } else if (unit.floor_level >= 1) {
              offset = unit.floor_level * 5.5 * p
            }
          }
          return unit.z_min + offset
        }, false)

        const floorExtrudedHeightCallback = new Cesium.CallbackProperty(() => {
          const isCurrentSelected = selectedBuildingIdRef.current === bKey
          const p = explodeProgressRef.current
          let offset = 0

          if (p > 0.0001 && isCurrentSelected) {
            if (unit.floor_level < 0) {
              offset = unit.floor_level * 3.5 * p
            } else if (unit.floor_level >= 1) {
              offset = unit.floor_level * 5.5 * p
            }
          }
          return unit.z_max + offset
        }, false)

        const initialFloorOutlineColor = unit.is_clashing
          ? Cesium.Color.fromCssColorString('#ef4444')
          : building.hasClash
          ? Cesium.Color.fromCssColorString('#ef4444').withAlpha(0.75)
          : isBasement
          ? Cesium.Color.fromCssColorString('#a855f7').withAlpha(0.85)
          : unit.layer_type === 'U'
          ? Cesium.Color.fromCssColorString('#06b6d4').withAlpha(0.8)
          : (unit.unit_type || '').toLowerCase().includes('commercial')
          ? Cesium.Color.fromCssColorString('#38bdf8').withAlpha(0.7)
          : Cesium.Color.fromCssColorString('#34d399').withAlpha(0.7)

        const floorEntity = viewer.entities.add({
          name: unit.unit_number,
          show: false, // Default to hidden; revealed on hover/select or in underground mode
          properties: new Cesium.PropertyBag({
            isFloorUnit: true,
            isBasement: isBasement,
            isSubSurfaceInfra: isInfra,
            buildingId: bKey,
            _cadastreData: unit,
            _centerLon: centerLon,
            _centerLat: centerLat,
            _maxZ: building.maxZ,
          }),
          polygon: {
            hierarchy: new Cesium.PolygonHierarchy(unitHierarchy),
            height: floorHeightCallback,
            extrudedHeight: floorExtrudedHeightCallback,
            material: new Cesium.ColorMaterialProperty(getColorForUnit(unit)),
            outline: true,
            outlineColor: initialFloorOutlineColor as unknown as Cesium.Color,
            outlineWidth: 2,
            closeTop: true,
            closeBottom: true,
          },
        }) as CustomCesiumEntity

        floorEntity._isFloorUnit = true
        floorEntity._isBasement = isBasement
        floorEntity._isSubSurfaceInfra = isInfra
        floorEntity._buildingId = bKey
        floorEntity._cadastreData = unit
        floorEntity._centerLon = centerLon
        floorEntity._centerLat = centerLat
        floorEntity._maxZ = building.maxZ

        floorEntities.push(floorEntity)
      })

      const buildingGroup: BuildingEntityGroup = {
        bKey,
        envelope: envelopeEntity,
        floors: floorEntities,
        defaultEnvelopeColor,
        defaultOutlineColor,
        hasClash: building.hasClash,
        centerLon,
        centerLat,
        maxZ: building.maxZ,
        aboveGroundMinZ: building.aboveGroundMinZ,
        primaryFeature,
        isSubSurfaceInfra: building.isSubSurfaceInfra,
      }

      buildingEntitiesRef.current.set(bKey, buildingGroup)

      // Apply initial visual state adhering strictly to current underground mode
      updateBuildingVisualState(
        buildingGroup,
        isHovered,
        isSelected,
        isUndergroundModeRef.current,
        selectedUnitRef.current?.ulpin_3d || null,
        null
      )
    })

    viewer.scene.requestRender()
  }, [data, selectedFloor, layerFilters, highlightClashesOnly])

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative select-none bg-[var(--neu-base)]"
    />
  )
}
