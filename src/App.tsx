import { Routes, Route } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { ConnectionDetailPage } from './pages/ConnectionDetailPage'
import { ExportPage } from './pages/ExportPage'
import { HomePage } from './pages/HomePage'
import { OcrPreviewPage } from './pages/OcrPreviewPage'
import { OverviewPage } from './pages/OverviewPage'
import { ReviewPage } from './pages/ReviewPage'
import { UploadPage } from './pages/UploadPage'

function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/upload" element={<UploadPage />} />
        <Route path="/ocr-preview" element={<OcrPreviewPage />} />
        <Route path="/controle" element={<ReviewPage />} />
        <Route path="/connections" element={<OverviewPage />} />
        <Route path="/connections/:id" element={<ConnectionDetailPage />} />
        <Route path="/export" element={<ExportPage />} />
        <Route path="/overzicht" element={<OverviewPage />} />
        <Route path="/aansluiting/:id" element={<ConnectionDetailPage />} />
      </Routes>
    </AppShell>
  )
}

export default App
