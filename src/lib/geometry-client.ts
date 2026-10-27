import type {
  GeometryJob,
  GeometryRequest,
  GeometryResponse,
  PreparedGeometry,
  PreparedAssembly,
  GeometryResult,
  ExportFormat,
  ProjectExportFormat,
} from './geometry-jobs'
import type { Design, Project } from './types'

type Task = {
  request: GeometryRequest
  resolve: (value: GeometryResult) => void
  reject: (error: Error) => void
}
const cancelled = () => new DOMException('A newer design replaced this request.', 'AbortError')

/** One running computation and one latest preview; downloads take priority in between. */
export class GeometryClient {
  private worker: Worker | undefined
  private active: Task | undefined
  private preview: Task | undefined
  private downloads: Task[] = []
  private sequence = 0
  private disposed = false

  constructor(
    private createWorker = () =>
      new Worker(new URL('./geometry.worker.ts', import.meta.url), { type: 'module' }),
  ) {}

  prepare(design: Design, showCuts: boolean) {
    return this.enqueue({ kind: 'prepare', design, showCuts }) as Promise<PreparedGeometry>
  }

  export(design: Design, format: ExportFormat) {
    return this.enqueue({ kind: 'export', design, format }) as Promise<string>
  }

  prepareAssembly(project: Project, showCuts: boolean) {
    return this.enqueue({
      kind: 'prepare-assembly',
      project,
      showCuts,
    }) as Promise<PreparedAssembly>
  }

  exportProject(project: Project, format: ProjectExportFormat) {
    return this.enqueue({ kind: 'export-project', project, format }) as Promise<string>
  }

  private enqueue(job: GeometryJob) {
    return new Promise<GeometryResult>((resolve, reject) => {
      if (this.disposed) {
        reject(cancelled())
        return
      }
      const task = { request: { id: ++this.sequence, job }, resolve, reject }
      if (job.kind === 'prepare' || job.kind === 'prepare-assembly') {
        this.preview?.reject(cancelled())
        this.preview = task
      } else this.downloads.push(task)
      this.pump()
    })
  }

  private pump() {
    if (this.active || this.disposed) return
    const task = this.downloads.shift() ?? this.preview
    if (!task) return
    if (task === this.preview) this.preview = undefined
    this.active = task
    try {
      if (!this.worker) {
        this.worker = this.createWorker()
        this.worker.onmessage = ({ data }: MessageEvent<GeometryResponse>) => {
          if (data.id !== this.active?.request.id) return
          const completed = this.active
          this.active = undefined
          if (data.ok) completed.resolve(data.result)
          else completed.reject(new Error(data.error))
          this.pump()
        }
        this.worker.onerror = (event) => {
          event.preventDefault()
          this.fail(new Error('Design processing stopped. Please retry the preview or download.'))
        }
        this.worker.onmessageerror = () =>
          this.fail(new Error('The design result could not be read. Please retry.'))
      }
      this.worker.postMessage(task.request)
    } catch (error) {
      this.fail(error instanceof Error ? error : new Error('Design processing could not start.'))
    }
  }

  private fail(error: Error) {
    this.worker?.terminate()
    this.worker = undefined
    this.active?.reject(error)
    this.preview?.reject(error)
    this.downloads.forEach((task) => task.reject(error))
    this.active = this.preview = undefined
    this.downloads = []
  }

  cancelPendingPreview() {
    this.preview?.reject(cancelled())
    this.preview = undefined
  }

  dispose() {
    this.disposed = true
    this.fail(cancelled())
  }
}
