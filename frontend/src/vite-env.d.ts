/// <reference types="vite/client" />

interface MonacoEnvironment {
  getWorker(): Worker
}

interface Window {
  MonacoEnvironment?: MonacoEnvironment
}
