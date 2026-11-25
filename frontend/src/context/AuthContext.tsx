import React, { createContext, useContext, useState, useEffect } from 'react'
import type {
  UserRole,
  AdminUser,
  CitizenUser,
  AuthStage,
  UserSession,
} from '../types/cadastre'

interface AuthContextType {
  authStage: AuthStage
  userSession: UserSession | null
  userRole: UserRole
  isAuthenticated: boolean
  adminUser: AdminUser | null
  citizenUser: CitizenUser | null
  loginCitizen: (user: CitizenUser) => void
  loginOfficer: (email: string, password: string) => Promise<boolean>
  elevateToOfficer: () => void
  verifyProperty: (plot: string, flat: string) => boolean
  logout: () => void
  logoutCitizen: () => void
  loginAsCitizen: () => void
  loginAsDemoAdmin: () => void
  setCitizenUser: (user: CitizenUser | null) => void
  login: (email: string, password: string) => Promise<boolean>
  toggleRole: () => void
  isPropertyVerified: (
    plot?: string | null,
    flat?: string | null,
    unitNumber?: string | null
  ) => boolean
}

const DEMO_ADMIN: AdminUser = {
  id: 'officer-ka-blr-04',
  name: 'Dr. R. Venkatraman, IAS',
  badgeId: 'KA-REV-CAD-0491',
  jurisdiction: 'Bangalore CBD & East Zone (KA-01)',
  email: 'admin@rera.gov.in',
  department: 'Karnataka Department of Land Records & Survey',
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const AUTH_STORAGE_KEY = '3d_ulpin_auth_state_v2'

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [authStage, setAuthStage] = useState<AuthStage>('UNAUTHENTICATED')
  const [userSession, setUserSession] = useState<UserSession | null>(null)
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null)

  // Initialize from localStorage if available
  useEffect(() => {
    try {
      const stored = localStorage.getItem(AUTH_STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        if (parsed.authStage === 'OFFICER') {
          setAuthStage('OFFICER')
          setAdminUser(parsed.adminUser || DEMO_ADMIN)
          if (parsed.userSession) {
            setUserSession(parsed.userSession)
          }
        } else if (parsed.authStage === 'CITIZEN' && parsed.userSession) {
          setAuthStage('CITIZEN')
          setUserSession(parsed.userSession)
          setAdminUser(null)
        }
      }
    } catch (e) {
      console.warn('Could not restore auth state from localStorage', e)
    }
  }, [])

  const persistAuthState = (
    stage: AuthStage,
    session: UserSession | null,
    admin: AdminUser | null
  ) => {
    try {
      localStorage.setItem(
        AUTH_STORAGE_KEY,
        JSON.stringify({
          authStage: stage,
          userSession: session,
          adminUser: admin,
        })
      )
    } catch (e) {
      console.warn('Could not persist auth state', e)
    }
  }

  // Phase 2: Login Citizen
  const loginCitizen = (user: CitizenUser) => {
    const newSession: UserSession = {
      stage: 'CITIZEN',
      name: user.name,
      phone: user.phone,
      citizenId: user.citizenId,
      isVerified: true,
      verifiedPlot: userSession?.verifiedPlot,
      verifiedFlat: userSession?.verifiedFlat,
    }
    setAuthStage('CITIZEN')
    setUserSession(newSession)
    setAdminUser(null)
    persistAuthState('CITIZEN', newSession, null)
  }

  // Phase 3: Verify Property Ownership
  const verifyProperty = (plot: string, flat: string): boolean => {
    const updatedSession: UserSession = {
      ...(userSession || {
        stage: 'CITIZEN',
        name: 'Siddharth Swami',
        phone: '9876543210',
        citizenId: '5849 2049 1928',
        isVerified: true,
      }),
      verifiedPlot: plot.trim(),
      verifiedFlat: flat.trim(),
    }
    setUserSession(updatedSession)
    if (authStage === 'UNAUTHENTICATED') {
      setAuthStage('CITIZEN')
    }
    persistAuthState(
      authStage === 'OFFICER' ? 'OFFICER' : 'CITIZEN',
      updatedSession,
      adminUser
    )
    return true
  }

  // Officer Login
  const loginOfficer = async (
    email: string,
    password: string
  ): Promise<boolean> => {
    if (
      (email.toLowerCase() === 'admin@rera.gov.in' &&
        password === 'admin123') ||
      (email.toLowerCase() === 'officer@survey.gov.in' &&
        password === 'cadastre2026') ||
      password === 'admin123'
    ) {
      const officerAdmin = {
        ...DEMO_ADMIN,
        email: email || DEMO_ADMIN.email,
      }
      setAuthStage('OFFICER')
      setAdminUser(officerAdmin)
      persistAuthState('OFFICER', userSession, officerAdmin)
      return true
    }
    return false
  }

  const elevateToOfficer = () => {
    setAuthStage('OFFICER')
    setAdminUser(DEMO_ADMIN)
    persistAuthState('OFFICER', userSession, DEMO_ADMIN)
  }

  const logoutCitizen = () => {
    setAuthStage('UNAUTHENTICATED')
    setUserSession(null)
    persistAuthState('UNAUTHENTICATED', null, adminUser)
  }

  const logout = () => {
    setAuthStage('UNAUTHENTICATED')
    setUserSession(null)
    setAdminUser(null)
    persistAuthState('UNAUTHENTICATED', null, null)
  }

  const loginAsCitizen = () => {
    if (userSession) {
      setAuthStage('CITIZEN')
      setAdminUser(null)
      persistAuthState('CITIZEN', userSession, null)
    } else {
      setAuthStage('UNAUTHENTICATED')
      setAdminUser(null)
      persistAuthState('UNAUTHENTICATED', null, null)
    }
  }

  const loginAsDemoAdmin = () => {
    elevateToOfficer()
  }

  const toggleRole = () => {
    if (authStage === 'OFFICER') {
      loginAsCitizen()
    } else {
      elevateToOfficer()
    }
  }

  // Check if a specific unit matches verified property bounds
  const isPropertyVerified = (
    plot?: string | null,
    flat?: string | null,
    unitNumber?: string | null
  ): boolean => {
    if (authStage === 'OFFICER') return true
    if (!userSession || !userSession.verifiedPlot) return false

    const plotMatch =
      Boolean(plot) &&
      plot!.toLowerCase().trim() ===
        userSession.verifiedPlot.toLowerCase().trim()

    if (!plotMatch) return false

    // If flat is specified in session, check flat match
    if (userSession.verifiedFlat) {
      const sessionFlat = userSession.verifiedFlat.toLowerCase().trim()
      const flatMatch =
        (flat && flat.toLowerCase().trim() === sessionFlat) ||
        (unitNumber &&
          (unitNumber.toLowerCase().trim() === sessionFlat ||
            unitNumber.toLowerCase().includes(sessionFlat)))
      return Boolean(flatMatch)
    }

    return true
  }

  // Compatibility properties
  const userRole: UserRole = authStage === 'OFFICER' ? 'ADMIN' : 'CITIZEN'
  const isAuthenticated = authStage === 'OFFICER'
  const citizenUser: CitizenUser | null = userSession
    ? {
        name: userSession.name,
        phone: userSession.phone,
        citizenId: userSession.citizenId,
        isVerified: userSession.isVerified,
      }
    : null

  const setCitizenUser = (user: CitizenUser | null) => {
    if (user) {
      loginCitizen(user)
    } else {
      logoutCitizen()
    }
  }

  return (
    <AuthContext.Provider
      value={{
        authStage,
        userSession,
        userRole,
        isAuthenticated,
        adminUser,
        citizenUser,
        loginCitizen,
        loginOfficer,
        elevateToOfficer,
        verifyProperty,
        logout,
        logoutCitizen,
        loginAsCitizen,
        loginAsDemoAdmin,
        setCitizenUser,
        login: loginOfficer,
        toggleRole,
        isPropertyVerified,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
