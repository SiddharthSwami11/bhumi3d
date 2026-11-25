/**
 * TypeScript type definitions for the 3D ULPIN Cadastre system.
 */

export type UnitType =
  | 'RESIDENTIAL'
  | 'COMMERCIAL'
  | 'COMMON_AREA'
  | 'BASEMENT_PARKING'
  | 'UTILITY_CORRIDOR'
  | 'CONTEXT_PARCEL'

export type LayerType = 'A' | 'S' | 'U'

export type AuthStage = 'UNAUTHENTICATED' | 'CITIZEN' | 'OFFICER'

export interface UserSession {
  stage: AuthStage
  name: string
  phone: string
  citizenId?: string
  verifiedPlot?: string
  verifiedFlat?: string
  isVerified: boolean
}

export interface PropertyUnit3D {
  id: string
  base_2d_ulpin: string
  ulpin_3d: string
  unit_number: string
  floor_level: number
  unit_type: UnitType
  layer_type: LayerType
  z_min: number
  z_max: number
  volume_cum: number | null
  carpet_area_sqm: number | null
  depth_below_ground_m?: number | null
  easement_type?: string | null
  owner_name: string | null
  owner_aadhaar_hash?: string | null
  contact_phone?: string | null
  rera_reg_no: string | null
  is_clashing: boolean
  clash_details: string | null

  // ML LiDAR & Drone 3D Building Inventory Attributes
  ulpin_id?: string | null
  building_name?: string | null
  plot_number?: string | null
  flat_number?: string | null
  floor_number?: number | null
  total_floors?: number | null
  scene_id?: number | null
  building_id?: number | null
  building_type?: string | null
  building_height_m?: number | null
  building_volume_m3?: number | null
  footprint_area_m2?: number | null
  roof_area_m2?: number | null
  roof_height_m?: number | null
  usable_roof_area_m2?: number | null
  estimated_solar_kw?: number | null
  estimated_floors?: number | null
  point_count?: number | null
  roof_point_count?: number | null
  data_status?: string | null
  solar_available?: boolean | null
}

export interface CitizenUser {
  name: string
  phone: string
  citizenId?: string
  isVerified: boolean
}

export interface GeoJSON3DGeometry {
  type: 'Polygon' | 'MultiPolygon' | 'GeometryCollection'
  coordinates: number[][][] | number[][][][]
  geometries?: GeoJSON3DGeometry[]
}

export interface GeoJSON3DFeature {
  type: 'Feature'
  geometry: GeoJSON3DGeometry
  properties: PropertyUnit3D
}

export interface GeoJSON3DCollection {
  type: 'FeatureCollection'
  total_features: number
  features: GeoJSON3DFeature[]
}

export interface ClashPair {
  ulpin_3d_a: string
  unit_number_a: string
  floor_level_a: number
  ulpin_3d_b: string
  unit_number_b: string
  floor_level_b: number
  overlap_description: string
}

export interface ClashReport {
  total_units_checked: number
  clash_count: number
  clashing_units: PropertyUnit3D[]
  clash_pairs: ClashPair[]
}

export type FloorFilter = number | 'ALL'

export type MapStyle = 'street' | 'satellite'

export interface LayerFilters {
  underground: boolean
  surface: boolean
  aboveGround: boolean
}

export type UserRole = 'CITIZEN' | 'ADMIN'

export interface AdminUser {
  id: string
  name: string
  badgeId: string
  jurisdiction: string
  email: string
  department: string
}

export type DisputeResolutionAction =
  | 'DEMOLITION_ORDERED'
  | 'REGULARIZED_PENALTY_PAID'
  | 'DEED_RECTIFIED'
  | 'FALSE_POSITIVE_OVERRIDE'

export interface DisputeResolutionRequest {
  ulpin_3d: string
  resolution_action: DisputeResolutionAction
  resolution_notes: string
  resolved_by: string
}

export interface UnitUpdateAdminPayload {
  owner_name?: string | null
  owner_aadhaar_hash?: string | null
  rera_reg_no?: string | null
  layer_type?: LayerType | null
  building_type?: string | null
  unit_type?: UnitType | null
  carpet_area_sqm?: number | null
  depth_below_ground_m?: number | null
  easement_type?: string | null
  notes?: string | null
  data_status?: string | null
}

export type GrievanceStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'RESOLVED'

export interface GrievanceRecord {
  id: string
  ulpin_3d: string
  building_name?: string | null
  plot_number?: string | null
  flat_number?: string | null
  citizen_name: string
  citizen_phone?: string | null
  description: string
  status: GrievanceStatus
  officer_remarks?: string | null
  officer_id?: string | null
  resolution_reason?: string | null
  resolution_notes?: string | null
  document_filename?: string | null
  created_at: string
  resolved_at?: string | null
}

export interface SubdividedUnitCreate {
  flat_number: string
  owner_name: string
  owner_age?: number
  owner_phone?: string
  carpet_area_sqft: number
  usage_type: string
}

export interface FloorSubdivideRequest {
  building_name?: string
  plot_number?: string
  base_2d_ulpin?: string
  floor_level: number
  units: SubdividedUnitCreate[]
}

export interface FloorSubdivideResponse {
  success: boolean
  message: string
  building_name: string
  floor_level: number
  created_units_count: number
  created_units: PropertyUnit3D[]
}

// Runtime constants
export const CADASTRE_VERSION = '1.0.0'
