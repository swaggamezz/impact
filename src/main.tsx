import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { UploadProvider } from './contexts/uploadContext'
import { ReviewProvider } from './contexts/reviewContext'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <UploadProvider>
        <ReviewProvider>
          <App />
        </ReviewProvider>
      </UploadProvider>
    </BrowserRouter>
  </StrictMode>,
)
