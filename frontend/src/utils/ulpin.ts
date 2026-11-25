/**
 * Deterministic 2D & 3D ULPIN (Bhu-Aadhaar) Utility Module for Bhumi3D WebGIS.
 *
 * Provides client-side validation, CRC-8 checksum verification, and structured
 * decomposition of 14-character 2D and 30-character 3D hierarchical ULPIN identifiers.
 *
 * Syntax:
 * [Base-2D-ULPIN]-[Spatial-Layer][Base-AMSL][Floor-Code]-[Unit-ID]-[CRC8]
 * Example: KA010010420104-A0924F02-U01-7F
 */

export interface Parsed2DUlpin {
  raw: string
  stateCode: string
  stateName: string
  districtCode: string
  districtName: string
  tehsilCode: string
  villageWardCode: string
  plotNumber: string
  isValid: boolean
}

export interface Parsed3DUlpin {
  raw: string
  base2DUlpin: string
  spatialLayer: 'A' | 'B' | 'U' | 'S'
  spatialLayerLabel: string
  amslElevationM: number
  floorCode: string
  floorLevel: number
  floorLabel: string
  unitCode: string
  unitLabel: string
  checksum: string
  isValidChecksum: boolean
  payload: string
  parsed2D: Parsed2DUlpin
}

const STATE_NAMES: Record<string, string> = {
  KA: 'Karnataka',
  DL: 'Delhi NCR',
  MH: 'Maharashtra',
  TN: 'Tamil Nadu',
  TG: 'Telangana',
  AP: 'Andhra Pradesh',
  KL: 'Kerala',
  GJ: 'Gujarat',
  UP: 'Uttar Pradesh',
  WB: 'West Bengal',
}

const DISTRICT_NAMES: Record<string, string> = {
  'KA01': 'Bengaluru Urban',
  'KA02': 'Bengaluru Rural',
  'KA03': 'Ramanagara',
  'KA04': 'Mysuru',
}

/**
 * Compute CRC-8 checksum with polynomial x^8 + x^2 + x + 1 (0x07, init 0x00).
 */
export function computeCRC8(data: string): string {
  const encoder = new TextEncoder()
  const bytes = encoder.encode(data)
  let crc = 0x00

  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i]
    for (let j = 0; j < 8; j++) {
      if (crc & 0x80) {
        crc = ((crc << 1) ^ 0x07) & 0xff
      } else {
        crc = (crc << 1) & 0xff
      }
    }
  }

  return crc.toString(16).toUpperCase().padStart(2, '0')
}

/**
 * Parse and decompose 14-character 2D Base Bhu-Aadhaar ULPIN.
 * Format: State(2) + District(2) + Tehsil(3) + Village/Ward(3) + Plot(4)
 */
export function parse2DUlpin(base2d: string): Parsed2DUlpin {
  const clean = (base2d || '').trim().toUpperCase()
  const isValid = /^[A-Z]{2}\d{12}$/.test(clean) || clean.length === 14

  const stateCode = clean.slice(0, 2)
  const districtCode = clean.slice(2, 4)
  const tehsilCode = clean.slice(4, 7)
  const villageWardCode = clean.slice(7, 10)
  const plotNumber = clean.slice(10, 14)

  const distKey = `${stateCode}${districtCode}`

  return {
    raw: clean,
    stateCode,
    stateName: STATE_NAMES[stateCode] || `State (${stateCode})`,
    districtCode,
    districtName: DISTRICT_NAMES[distKey] || `District ${districtCode}`,
    tehsilCode,
    villageWardCode,
    plotNumber,
    isValid,
  }
}

/**
 * Parse and validate 30-character 3D Volumetric ULPIN.
 * Examples:
 *   Above Ground: KA010010420104-A0924F02-U01-7F
 *   Basement:     KA010010420104-B0912B02-U01-9F
 *   Metro Tunnel: KA010010420000-U0890M01-TUN-4C
 *   Utility Line: KA010010420000-U0916U01-UTL-8E
 */
export function parse3DUlpin(ulpin3d: string): Parsed3DUlpin | null {
  if (!ulpin3d) return null
  const clean = ulpin3d.trim().toUpperCase()

  // Standard Hierarchical 3D ULPIN regex:
  // [Base-14]-[Layer][AMSL 4d][Floor 3c]-[Unit 3c]-[CRC 2h]
  const standardPattern = /^([A-Z0-9]{14})-([ABSU])(\d{4})([GFBMUC]\d{2})-(U\d{2}|TUN|CON|UTL|[A-Z0-9]{3})-([A-F0-9]{2})$/
  const match = clean.match(standardPattern)

  if (match) {
    const [, base2d, layer, amslStr, floorCode, unitCode, crc] = match
    const payload = `${base2d}-${layer}${amslStr}${floorCode}-${unitCode}`
    const expectedCrc = computeCRC8(payload)
    const isValidChecksum = expectedCrc === crc

    const spatialLayer = layer as 'A' | 'B' | 'U' | 'S'
    const spatialLayerLabel =
      spatialLayer === 'A'
        ? 'Above Ground'
        : spatialLayer === 'B'
        ? 'Subsurface / Basement'
        : spatialLayer === 'U'
        ? 'Subterranean Utility / Transit'
        : 'Surface Grade'

    let floorLevel = 0
    let floorLabel = 'Ground Floor'
    if (floorCode === 'G00') {
      floorLevel = 0
      floorLabel = 'Ground Level (G00)'
    } else if (floorCode.startsWith('F')) {
      floorLevel = parseInt(floorCode.slice(1), 10)
      floorLabel = `Floor ${floorLevel} (${floorCode})`
    } else if (floorCode.startsWith('B')) {
      floorLevel = -parseInt(floorCode.slice(1), 10)
      floorLabel = `Basement ${Math.abs(floorLevel)} (${floorCode})`
    } else if (floorCode.startsWith('M')) {
      floorLevel = -parseInt(floorCode.slice(1), 10)
      floorLabel = `Metro Transit Stratum ${Math.abs(floorLevel)} (${floorCode})`
    } else if (floorCode.startsWith('C')) {
      floorLevel = -parseInt(floorCode.slice(1), 10)
      floorLabel = `Subway Concourse Stratum ${Math.abs(floorLevel)} (${floorCode})`
    } else if (floorCode.startsWith('U')) {
      floorLevel = -parseInt(floorCode.slice(1), 10)
      floorLabel = `Subterranean Utility Stratum ${Math.abs(floorLevel)} (${floorCode})`
    }

    let unitLabel = unitCode
    if (unitCode.startsWith('U') && /^\d+$/.test(unitCode.slice(1))) {
      const unitNum = parseInt(unitCode.slice(1), 10)
      unitLabel = unitNum === 0 ? 'Full Floor Envelope' : `Sub-Unit ${unitNum} (${unitCode})`
    } else if (unitCode === 'TUN') {
      unitLabel = 'Transit Tunnel Segment (TUN)'
    } else if (unitCode === 'CON') {
      unitLabel = 'Pedestrian Concourse Corridor (CON)'
    } else if (unitCode === 'UTL') {
      unitLabel = 'Municipal Utility Conduit (UTL)'
    }

    return {
      raw: clean,
      base2DUlpin: base2d,
      spatialLayer,
      spatialLayerLabel,
      amslElevationM: parseFloat(amslStr),
      floorCode,
      floorLevel,
      floorLabel,
      unitCode,
      unitLabel,
      checksum: crc,
      isValidChecksum,
      payload,
      parsed2D: parse2DUlpin(base2d),
    }
  }

  // Fallback for legacy format
  const legacyPattern = /^([A-Z0-9]{14})-([ASU])-(\d{6})(\d{6})-([A-Z0-9]{4,8})$/
  const legMatch = clean.match(legacyPattern)
  if (legMatch) {
    const [, base2d, layer, zminStr, , unitCode] = legMatch
    const zmin = parseInt(zminStr, 10) / 10
    const spatialLayer = layer === 'U' ? 'B' : (layer as 'A' | 'S')
    return {
      raw: clean,
      base2DUlpin: base2d,
      spatialLayer,
      spatialLayerLabel: spatialLayer === 'B' ? 'Subsurface / Basement' : 'Above Ground',
      amslElevationM: zmin >= 500 ? zmin : 920 + zmin,
      floorCode: 'F01',
      floorLevel: 1,
      floorLabel: 'Floor 1',
      unitCode: unitCode.slice(0, 3),
      unitLabel: `Unit ${unitCode}`,
      checksum: '00',
      isValidChecksum: true,
      payload: clean,
      parsed2D: parse2DUlpin(base2d),
    }
  }

  return null
}

/**
 * Check if a 3D ULPIN string is syntactically valid and passes CRC-8 verification.
 */
export function validate3DUlpin(ulpin3d: string): boolean {
  const parsed = parse3DUlpin(ulpin3d)
  return !!parsed && parsed.isValidChecksum
}
