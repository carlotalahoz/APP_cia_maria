import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthProvider'
import { Layout } from './components/Layout'
import { Loading } from './components/ui'
import { startAutoSync } from './lib/offline'
import { AttendancePage } from './pages/Attendance'
import { AuditPage } from './pages/Audit'
import { ConfigPage } from './pages/Config'
import { HomePage } from './pages/Home'
import { LoginPage } from './pages/Login'
import { PlayerDetailPage } from './pages/PlayerDetail'
import { PlayersPage } from './pages/Players'
import { RecoverPage } from './pages/Recover'
import { SeasonsPage } from './pages/Seasons'
import { SetPasswordPage } from './pages/SetPassword'
import { TeamDetailPage } from './pages/TeamDetail'
import { TeamsPage } from './pages/Teams'
import { TrashPage } from './pages/Trash'
import { UsersPage } from './pages/Users'

function Protected() {
  const { session, profile, loading } = useAuth()
  useEffect(() => (session ? startAutoSync() : undefined), [session])
  if (loading) return <Loading />
  if (!session || !profile) return <Navigate to="/login" replace />
  return <Layout />
}

function CoordOnly({ children }: { children: React.ReactNode }) {
  const { isCoord } = useAuth()
  return isCoord ? <>{children}</> : <Navigate to="/" replace />
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/recuperar" element={<RecoverPage />} />
          <Route path="/nueva-contrasena" element={<SetPasswordPage />} />
          <Route element={<Protected />}>
            <Route index element={<HomePage />} />
            <Route path="equipos" element={<TeamsPage />} />
            <Route path="equipos/:id" element={<TeamDetailPage />} />
            <Route path="jugadores" element={<PlayersPage />} />
            <Route path="jugadores/:id" element={<PlayerDetailPage />} />
            <Route path="asistencia" element={<AttendancePage />} />
            <Route path="temporadas" element={<CoordOnly><SeasonsPage /></CoordOnly>} />
            <Route path="configuracion" element={<CoordOnly><ConfigPage /></CoordOnly>} />
            <Route path="usuarios" element={<CoordOnly><UsersPage /></CoordOnly>} />
            <Route path="papelera" element={<CoordOnly><TrashPage /></CoordOnly>} />
            <Route path="auditoria" element={<CoordOnly><AuditPage /></CoordOnly>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
