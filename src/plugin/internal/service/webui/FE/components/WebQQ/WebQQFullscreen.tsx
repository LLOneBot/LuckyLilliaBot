import React from 'react'
import WebQQPage from './WebQQPage'

const WebQQFullscreen: React.FC = () => {
  return (
    <div className="h-screen bg-theme p-4 md:p-8">
      <WebQQPage isFullscreen={true} />
    </div>
  )
}

export default WebQQFullscreen
