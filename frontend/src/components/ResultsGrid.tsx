import { toCsv } from "../engines/dump.ts"

type Props = {
  columns: Array<string>
  rows: Array<Array<unknown>>
  onExportCsv: () => void
  onExportJson: () => void
}

export const ResultsGrid = ({ columns, rows, onExportCsv, onExportJson }: Props) => (
  <div className="grid-wrap">
    <div className="grid-toolbar">
      <span>
        {rows.length} row{rows.length === 1 ? "" : "s"}
      </span>
      <button type="button" onClick={onExportCsv}>
        Export CSV
      </button>
      <button type="button" onClick={onExportJson}>
        Export JSON
      </button>
    </div>
    <div className="grid-scroll">
      <table>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j}>{cell === null || cell === undefined ? "NULL" : String(cell)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    <pre className="hidden">{toCsv(columns, rows)}</pre>
  </div>
)
