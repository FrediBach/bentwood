import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { samplePath, segmentLength } from '@/lib/geometry'
import { getCutPoints } from '@/lib/cut-path'
import { createPanelSurface, type PanelSurface } from '@/lib/panel-surface'
import type { CutPlan, Design, Point, Segment } from '@/lib/types'

type Props = {
  design: Design
  plan: CutPlan
  bend: number
  showGrid: boolean
  showCuts: boolean
  view: 'perspective' | 'top' | 'front'
  resetKey: number
}

type PreviewContext = {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  controls: OrbitControls
  model: THREE.Group
  grid: THREE.GridHelper
  shadow: THREE.Mesh
  bounds: THREE.Box3
  render: () => void
  fit: (view: Props['view']) => void
  hasModel: boolean
  modelRadius: number
}

const grainCanvases = new Map<Design['material'], HTMLCanvasElement>()
const panelSurfaces = new WeakMap<CutPlan, { kerf: number; surface: PanelSurface }>()

function canRenderDetailedCuts(plan: CutPlan) {
  if (plan.cuts.length > 2500) return false
  let segments = 0
  for (const cut of plan.cuts) {
    segments += Math.max(0, getCutPoints(cut).length - 1)
    if (segments > 20000) return false
  }
  return true
}

function canRenderCutoutVoids(plan: CutPlan) {
  if (!plan.cutouts || plan.cutouts.length > 2500) return false
  return plan.cutouts.reduce((count, points) => count + points.length, 0) <= 20000
}

function woodTexture(material: Design['material']) {
  const cached = grainCanvases.get(material)
  if (cached) {
    const texture = new THREE.CanvasTexture(cached)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping
    texture.anisotropy = 8
    return texture
  }
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 1024
  const ctx = canvas.getContext('2d')!
  const bases = { birch: '#ddc196', walnut: '#916745', basswood: '#e5d2ad' }
  ctx.fillStyle = bases[material]
  ctx.fillRect(0, 0, 1024, 1024)
  let seed = 827
  const random = () => {
    seed = (seed * 16807) % 2147483647
    return (seed - 1) / 2147483646
  }
  for (let row = 0; row < 1600; row++) {
    const y = random() * 1024
    const amplitude = 0.7 + random() * 6
    const frequency = 0.002 + random() * 0.009
    const phase = random() * Math.PI * 2
    const opacity = 0.015 + random() * 0.095
    ctx.strokeStyle =
      row % 4 ? `rgba(87, 54, 24, ${opacity})` : `rgba(255, 245, 218, ${opacity * 2})`
    ctx.lineWidth = 0.3 + random() * 1.1
    ctx.beginPath()
    for (let x = 0; x <= 1024; x += 8) {
      const py =
        y +
        Math.sin(x * frequency + phase) * amplitude +
        Math.sin(x * 0.003 + phase) * amplitude * 2
      if (x === 0) ctx.moveTo(x, py)
      else ctx.lineTo(x, py)
    }
    ctx.stroke()
  }
  // Broad, faint grain ribbons keep the material readable from a distance.
  for (let row = 0; row < 32; row++) {
    const y = random() * 1024
    ctx.strokeStyle = `rgba(116, 75, 32, ${0.025 + random() * 0.025})`
    ctx.lineWidth = 2 + random() * 3
    ctx.beginPath()
    for (let x = 0; x <= 1024; x += 8) {
      const py = y + Math.sin(x * 0.003 + row * 0.5) * 15
      if (x === 0) ctx.moveTo(x, py)
      else ctx.lineTo(x, py)
    }
    ctx.stroke()
  }
  grainCanvases.set(material, canvas)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.anisotropy = 8
  return texture
}

function edgeTexture(material: Design['material']) {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 128
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = material === 'walnut' ? '#67462c' : '#ac8756'
  ctx.fillRect(0, 0, 64, 128)
  const shades =
    material === 'walnut'
      ? ['#a37c50', '#65452b', '#bd925d', '#725031', '#9c7548']
      : ['#e7cf9f', '#b18a53', '#e6c692', '#ac8450', '#e7cf9f']
  shades.forEach((color, index) => {
    ctx.fillStyle = color
    ctx.fillRect(0, (index * 128) / shades.length, 64, 128 / shades.length - 1)
  })
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.anisotropy = 8
  return texture
}

function shadowTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 128
  const ctx = canvas.getContext('2d')!
  const gradient = ctx.createRadialGradient(64, 64, 3, 64, 64, 64)
  gradient.addColorStop(0, 'rgba(43, 35, 30, 0.22)')
  gradient.addColorStop(0.45, 'rgba(43, 35, 30, 0.13)')
  gradient.addColorStop(1, 'rgba(43, 35, 30, 0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 128, 128)
  return new THREE.CanvasTexture(canvas)
}

function disposeGroup(group: THREE.Group) {
  group.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
      object.geometry.dispose()
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      for (const material of materials) {
        if ('map' in material) (material.map as THREE.Texture | null)?.dispose()
        material.dispose()
      }
    }
  })
  group.clear()
}

function previewSegments(segments: Segment[], bend: number): Segment[] {
  return segments.map((segment) => {
    if (segment.type === 'straight') return segment
    if (bend < 0.0001) return { id: segment.id, type: 'straight', length: segmentLength(segment) }
    return { ...segment, angle: segment.angle * bend, radius: segment.radius / bend }
  })
}

function createPanel(design: Design, plan: CutPlan, bend: number, showCuts: boolean) {
  const group = new THREE.Group()
  if (plan.outline.length < 3) return group
  const segments = previewSegments(design.segments, bend)
  // Subtract kerfs first: edge cuts must form open notches in the perimeter.
  const detailedCuts = showCuts && canRenderDetailedCuts(plan)
  let surface: PanelSurface
  const cached = panelSurfaces.get(plan)
  if (detailedCuts && cached?.kerf === design.kerf) surface = cached.surface
  else {
    surface = createPanelSurface(
      plan.outline,
      detailedCuts ? plan.cuts : [],
      design.kerf,
      showCuts && (detailedCuts || canRenderCutoutVoids(plan)) ? plan.cutouts : [],
    )
    if (detailedCuts) panelSurfaces.set(plan, { kerf: design.kerf, surface })
  }
  const facePositions: number[] = []
  const faceUVs: number[] = []
  const edgePositions: number[] = []
  const edgeUVs: number[] = []
  const cutPositions: number[] = []
  const cutUVs: number[] = []
  const maximumStep = Math.max(1, plan.length / 280)
  const sampleCache = new Map<number, ReturnType<typeof samplePath>>()
  const mapped = (point: Point, side: number) => {
    let sample = sampleCache.get(point.x)
    if (!sample) {
      sample = samplePath(segments, point.x)
      sampleCache.set(point.x, sample)
    }
    const offset = (side * design.thickness) / 2
    return [
      sample.x - Math.sin(sample.angle) * offset,
      point.y,
      sample.y + Math.cos(sample.angle) * offset,
    ]
  }
  const pushSurfaceTriangle = (a: Point, b: Point, c: Point, side: number, depth = 0) => {
    const distances = [Math.abs(a.x - b.x), Math.abs(b.x - c.x), Math.abs(c.x - a.x)]
    const maxDistance = Math.max(...distances)
    if (maxDistance > maximumStep && depth < 14) {
      const longest = distances.indexOf(maxDistance)
      if (longest === 0) {
        const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
        pushSurfaceTriangle(a, midpoint, c, side, depth + 1)
        pushSurfaceTriangle(midpoint, b, c, side, depth + 1)
      } else if (longest === 1) {
        const midpoint = { x: (b.x + c.x) / 2, y: (b.y + c.y) / 2 }
        pushSurfaceTriangle(a, b, midpoint, side, depth + 1)
        pushSurfaceTriangle(a, midpoint, c, side, depth + 1)
      } else {
        const midpoint = { x: (c.x + a.x) / 2, y: (c.y + a.y) / 2 }
        pushSurfaceTriangle(a, b, midpoint, side, depth + 1)
        pushSurfaceTriangle(midpoint, b, c, side, depth + 1)
      }
      return
    }
    for (const point of side > 0 ? [a, b, c] : [c, b, a]) {
      facePositions.push(...mapped(point, side))
      faceUVs.push(point.x / 360, point.y / 360)
    }
  }
  for (const polygon of surface.polygons) {
    const contour = polygon.contour.map((point) => new THREE.Vector2(point.x, point.y))
    const holes = polygon.holes.map((ring) =>
      ring.map((point) => new THREE.Vector2(point.x, point.y)),
    )
    const faces = THREE.ShapeUtils.triangulateShape(contour, holes)
    const flatVertices = [...contour, ...holes.flat()]
    faces.forEach(([a, b, c]) => {
      pushSurfaceTriangle(flatVertices[a], flatVertices[b], flatVertices[c], 1)
      pushSurfaceTriangle(flatVertices[a], flatVertices[b], flatVertices[c], -1)
    })
  }
  let perimeterDistance = 0
  for (const { start: a, end: b, kind } of surface.boundaries) {
    const positions = kind === 'outer' ? edgePositions : cutPositions
    const uvs = kind === 'outer' ? edgeUVs : cutUVs
    const length = Math.hypot(b.x - a.x, b.y - a.y)
    const steps = Math.max(1, Math.ceil(Math.abs(b.x - a.x) / maximumStep))
    for (let step = 0; step < steps; step++) {
      const start = step / steps
      const end = (step + 1) / steps
      const p = { x: a.x + (b.x - a.x) * start, y: a.y + (b.y - a.y) * start }
      const q = { x: a.x + (b.x - a.x) * end, y: a.y + (b.y - a.y) * end }
      const pFront = mapped(p, 1),
        pBack = mapped(p, -1),
        qFront = mapped(q, 1),
        qBack = mapped(q, -1)
      positions.push(...pFront, ...pBack, ...qFront, ...qFront, ...pBack, ...qBack)
      const u = (perimeterDistance + length * start) / 64,
        v = (perimeterDistance + length * end) / 64
      uvs.push(u, 1, u, 0, v, 1, v, 1, u, 0, v, 0)
    }
    perimeterDistance += length
  }
  const addMesh = (positions: number[], uvs: number[], material: THREE.MeshStandardMaterial) => {
    if (!positions.length) {
      material.map?.dispose()
      material.dispose()
      return
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
    geometry.computeVertexNormals()
    const mesh = new THREE.Mesh(geometry, material)
    mesh.castShadow = true
    mesh.receiveShadow = true
    group.add(mesh)
  }
  addMesh(
    facePositions,
    faceUVs,
    new THREE.MeshStandardMaterial({
      map: woodTexture(design.material),
      roughness: 0.71,
      metalness: 0,
      side: THREE.DoubleSide,
    }),
  )
  addMesh(
    edgePositions,
    edgeUVs,
    new THREE.MeshStandardMaterial({
      map: edgeTexture(design.material),
      roughness: 0.86,
      side: THREE.DoubleSide,
    }),
  )
  if (cutPositions.length)
    addMesh(
      cutPositions,
      cutUVs,
      new THREE.MeshStandardMaterial({
        color: design.material === 'walnut' ? '#362317' : '#5a3c22',
        roughness: 0.94,
        side: THREE.DoubleSide,
      }),
    )
  // Dense plans retain every cut without constructing thousands of tiny holes.
  if (showCuts && !detailedCuts) {
    const linePositions: number[] = []
    for (const cut of plan.cuts) {
      const points = getCutPoints(cut)
      for (const side of [-1.01, 1.01]) {
        for (let index = 1; index < points.length; index++) {
          linePositions.push(...mapped(points[index - 1], side), ...mapped(points[index], side))
        }
      }
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3))
    group.add(new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: '#634425' })))
  }
  const bounds = new THREE.Box3().setFromObject(group)
  if (bounds.isEmpty()) return group
  const center = bounds.getCenter(new THREE.Vector3())
  group.position.set(-center.x, -bounds.min.y, -center.z)
  return group
}

export default function PlywoodPreview({
  design,
  plan,
  bend,
  showGrid,
  showCuts,
  view,
  resetKey,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const contextRef = useRef<PreviewContext | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    const container = containerRef.current!
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      })
    } catch {
      setError(true)
      return
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.14
    renderer.setClearColor('#eee5d5', 1)
    renderer.domElement.setAttribute(
      'aria-label',
      'Interactive plywood preview. Drag to rotate, scroll to zoom. Arrow keys rotate, plus and minus zoom, Home resets the camera.',
    )
    renderer.domElement.setAttribute('role', 'img')
    renderer.domElement.tabIndex = 0
    renderer.domElement.style.cssText =
      'display:block;width:100%;height:100%;outline-offset:-3px;touch-action:none;'
    container.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    scene.fog = new THREE.Fog('#eee5d5', 850, 2100)
    const camera = new THREE.PerspectiveCamera(34, 1, 0.5, 8000)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = false
    controls.minDistance = 30
    controls.maxDistance = 4000
    controls.maxPolarAngle = Math.PI * 0.84
    controls.screenSpacePanning = true
    controls.rotateSpeed = 0.65
    controls.zoomSpeed = 0.8
    const ambient = new THREE.HemisphereLight('#fff8e9', '#c4b599', 2.3)
    scene.add(ambient)
    const keyLight = new THREE.DirectionalLight('#fff3d6', 3.5)
    keyLight.position.set(-210, 420, 240)
    keyLight.castShadow = true
    keyLight.shadow.mapSize.set(2048, 2048)
    keyLight.shadow.camera.left = -450
    keyLight.shadow.camera.right = 450
    keyLight.shadow.camera.top = 450
    keyLight.shadow.camera.bottom = -450
    keyLight.shadow.camera.near = 1
    keyLight.shadow.camera.far = 1800
    keyLight.shadow.normalBias = 0.25
    keyLight.shadow.bias = -0.0001
    keyLight.shadow.radius = 4
    scene.add(keyLight)
    const fill = new THREE.DirectionalLight('#eff6ff', 1.2)
    fill.position.set(200, 180, -200)
    scene.add(fill)
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(7000, 7000),
      new THREE.MeshStandardMaterial({ color: '#eee5d5', roughness: 1 }),
    )
    floor.rotation.x = -Math.PI / 2
    floor.position.y = -0.8
    floor.receiveShadow = true
    scene.add(floor)
    const grid = new THREE.GridHelper(2000, 100, '#d1c4ad', '#dfd2bb')
    grid.position.y = -0.7
    const gridMaterial = grid.material as THREE.Material
    gridMaterial.transparent = true
    gridMaterial.opacity = 0.42
    scene.add(grid)
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }),
    )
    shadow.rotation.x = -Math.PI / 2
    shadow.position.y = -0.4
    scene.add(shadow)
    const model = new THREE.Group()
    scene.add(model)
    const render = () => renderer.render(scene, camera)
    const context: PreviewContext = {
      renderer,
      scene,
      camera,
      controls,
      model,
      grid,
      shadow,
      bounds: new THREE.Box3(),
      render,
      hasModel: false,
      modelRadius: 1,
      fit: (nextView) => {
        if (context.bounds.isEmpty()) return
        const size = context.bounds.getSize(new THREE.Vector3())
        const center = context.bounds.getCenter(new THREE.Vector3())
        const radius = Math.max(size.length() / 2, 25)
        const verticalFov = THREE.MathUtils.degToRad(camera.fov)
        const fitFov = Math.min(
          verticalFov,
          2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect),
        )
        const distance = (radius / Math.sin(fitFov / 2)) * 1.16
        controls.target.copy(center)
        const direction =
          nextView === 'top'
            ? new THREE.Vector3(0.001, 1, 0.001)
            : nextView === 'front'
              ? new THREE.Vector3(0, 0.08, 1)
              : new THREE.Vector3(-1.35, 1.05, 1.6)
        camera.position.copy(center).add(direction.normalize().multiplyScalar(distance))
        camera.near = Math.max(0.1, distance / 1000)
        camera.far = Math.max(8000, distance * 10)
        camera.updateProjectionMatrix()
        controls.minDistance = Math.max(10, radius * 0.3)
        controls.maxDistance = Math.max(4000, distance * 5)
        controls.update()
        render()
      },
    }
    contextRef.current = context
    controls.addEventListener('change', render)
    const resize = () => {
      const width = container.clientWidth,
        height = container.clientHeight
      if (!width || !height) return
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      render()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(container)
    resize()
    const handleKey = (event: KeyboardEvent) => {
      if (
        !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-', 'Home'].includes(
          event.key,
        )
      )
        return
      event.preventDefault()
      const offset = camera.position.clone().sub(controls.target)
      const spherical = new THREE.Spherical().setFromVector3(offset)
      if (event.key === 'ArrowLeft') spherical.theta -= 0.12
      if (event.key === 'ArrowRight') spherical.theta += 0.12
      if (event.key === 'ArrowUp') spherical.phi = Math.max(0.02, spherical.phi - 0.12)
      if (event.key === 'ArrowDown') spherical.phi = Math.min(Math.PI * 0.84, spherical.phi + 0.12)
      if (event.key === '+' || event.key === '=')
        spherical.radius = Math.max(controls.minDistance, spherical.radius * 0.9)
      if (event.key === '-')
        spherical.radius = Math.min(controls.maxDistance, spherical.radius * 1.1)
      if (event.key === 'Home') {
        context.fit('perspective')
        return
      }
      camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(spherical))
      controls.update()
      render()
    }
    renderer.domElement.addEventListener('keydown', handleKey)
    const handleContextLost = (event: Event) => {
      event.preventDefault()
      setError(true)
    }
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost)
    setReady(true)
    return () => {
      observer.disconnect()
      controls.removeEventListener('change', render)
      controls.dispose()
      renderer.domElement.removeEventListener('keydown', handleKey)
      renderer.domElement.removeEventListener('webglcontextlost', handleContextLost)
      disposeGroup(model)
      floor.geometry.dispose()
      floor.material.dispose()
      grid.geometry.dispose()
      gridMaterial.dispose()
      shadow.geometry.dispose()
      shadow.material.map?.dispose()
      shadow.material.dispose()
      renderer.dispose()
      container.removeChild(renderer.domElement)
      contextRef.current = null
    }
  }, [])

  useEffect(() => {
    const context = contextRef.current
    if (!context || !ready) return
    disposeGroup(context.model)
    const model = createPanel(design, plan, bend, showCuts)
    context.model.add(model)
    context.bounds.setFromObject(context.model)
    if (!context.bounds.isEmpty()) {
      const size = context.bounds.getSize(new THREE.Vector3())
      context.shadow.scale.set(size.x * 1.5 + 30, size.z * 1.5 + 30, 1)
      const radius = Math.max(size.length() / 2, 25)
      if (!context.hasModel) {
        context.fit(view)
        context.hasModel = true
      } else {
        const center = context.bounds.getCenter(new THREE.Vector3())
        const offset = context.camera.position.clone().sub(context.controls.target)
        offset.multiplyScalar(radius / context.modelRadius)
        context.controls.target.copy(center)
        context.camera.position.copy(center).add(offset)
        context.controls.update()
      }
      context.modelRadius = radius
    }
    context.render()
  }, [design, plan, bend, showCuts, ready, view])

  useEffect(() => {
    const context = contextRef.current
    if (!context || !ready) return
    context.grid.visible = showGrid
    context.render()
  }, [showGrid, ready])

  useEffect(() => {
    contextRef.current?.fit(view)
  }, [view, resetKey, ready])

  return (
    <div
      ref={containerRef}
      className="plywood-preview"
      style={{ width: '100%', height: '100%', position: 'relative' }}
    >
      {showCuts && !canRenderDetailedCuts(plan) && !error && (
        <div
          style={{
            position: 'absolute',
            left: 16,
            bottom: 16,
            fontSize: 12,
            color: '#514841',
            background: '#fbf6eae8',
            padding: '6px 10px',
            borderRadius: 6,
          }}
        >
          Dense pattern: cuts shown as lines
        </div>
      )}
      {error && (
        <div
          role="status"
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeContent: 'center',
            padding: 32,
            textAlign: 'center',
            background: '#eee5d5',
            color: '#463c34',
            zIndex: 1,
          }}
        >
          <strong style={{ fontSize: 18 }}>3D preview needs WebGL</strong>
          <p style={{ maxWidth: 320, lineHeight: 1.6 }}>
            Enable hardware acceleration in your browser and reload. You can still edit your design
            and export the cut plan.
          </p>
        </div>
      )}
    </div>
  )
}
