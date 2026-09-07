import type { AppConfig } from "@workbench/shared"

type Props = {
  config: AppConfig
  onChange: (config: AppConfig) => void
  onSave: () => void
  onClose: () => void
}

export const SettingsPanel = ({ config, onChange, onSave, onClose }: Props) => {
  const set = (next: AppConfig) => onChange(next)
  return (
    <aside className="settings">
      <header>
        <strong>Settings</strong>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </header>
      <label>
        Editor theme
        <select
          value={config.editor.theme}
          onChange={(e) =>
            set({ ...config, editor: { ...config.editor, theme: e.target.value as AppConfig["editor"]["theme"] } })
          }
        >
          <option value="vs-dark">Dark</option>
          <option value="vs">Light</option>
        </select>
      </label>
      <label>
        Font size
        <input
          type="number"
          value={config.editor.fontSize}
          onChange={(e) => set({ ...config, editor: { ...config.editor, fontSize: Number(e.target.value) } })}
        />
      </label>
      <label>
        Tab size
        <input
          type="number"
          value={config.editor.tabSize}
          onChange={(e) => set({ ...config, editor: { ...config.editor, tabSize: Number(e.target.value) } })}
        />
      </label>
      <label>
        Max rows
        <input
          type="number"
          value={config.query.maxRows}
          onChange={(e) => set({ ...config, query: { ...config.query, maxRows: Number(e.target.value) } })}
        />
      </label>
      <label className="row">
        <input
          type="checkbox"
          checked={config.query.confirmDestructive}
          onChange={(e) => set({ ...config, query: { ...config.query, confirmDestructive: e.target.checked } })}
        />
        Confirm destructive SQL
      </label>
      <label>
        Sync trigger
        <select
          value={config.sync.trigger}
          onChange={(e) =>
            set({ ...config, sync: { ...config.sync, trigger: e.target.value as AppConfig["sync"]["trigger"] } })
          }
        >
          <option value="manual">Manual</option>
          <option value="interval">Interval</option>
          <option value="onChange">On change</option>
        </select>
      </label>
      <label>
        Interval seconds
        <input
          type="number"
          value={config.sync.intervalSeconds}
          onChange={(e) => set({ ...config, sync: { ...config.sync, intervalSeconds: Number(e.target.value) } })}
        />
      </label>
      <label>
        Debounce ms
        <input
          type="number"
          value={config.sync.debounceMs}
          onChange={(e) => set({ ...config, sync: { ...config.sync, debounceMs: Number(e.target.value) } })}
        />
      </label>
      <label>
        Sync format
        <select
          value={config.sync.format}
          onChange={(e) =>
            set({ ...config, sync: { ...config.sync, format: e.target.value as AppConfig["sync"]["format"] } })
          }
        >
          <option value="binary">Binary</option>
          <option value="sql">SQL dump</option>
          <option value="both">Both</option>
        </select>
      </label>
      <label>
        Pull on open
        <select
          value={config.sync.pullOnOpen}
          onChange={(e) =>
            set({ ...config, sync: { ...config.sync, pullOnOpen: e.target.value as AppConfig["sync"]["pullOnOpen"] } })
          }
        >
          <option value="prompt">Prompt</option>
          <option value="always">Always</option>
          <option value="never">Never</option>
        </select>
      </label>
      <label>
        Default engine
        <select
          value={config.defaults.engine}
          onChange={(e) =>
            set({
              ...config,
              defaults: { engine: e.target.value as AppConfig["defaults"]["engine"] }
            })
          }
        >
          <option value="pglite">PGlite</option>
          <option value="sqlite">SQLite</option>
        </select>
      </label>
      <button type="button" className="primary" onClick={onSave}>
        Save to host
      </button>
    </aside>
  )
}
