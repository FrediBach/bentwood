import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { createPreviewMapper, type PreviewGeometry, type PreviewMesh } from '@/lib/preview-geometry'
import type { CutPlan, Design } from '@/lib/types'
import { createWoodTexturePixels, woodAppearance } from '@/lib/wood-texture'

type Props = {
  design: Design
  plan: CutPlan
  geometry: PreviewGeometry
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
  panel: PreviewPanel | null
  modelPending: boolean
}

const grainCanvases = new Map<Design['material'], HTMLCanvasElement>()
type PreviewPanel = {
  group: THREE.Group
  source: PreviewGeometry
  material: Design['material']
  parts: {
    geometry: THREE.BufferGeometry
    vertices: Float64Array
    sampleIndices: Uint32Array
    mesh: boolean
  }[]
  faceMaterial: THREE.MeshStandardMaterial
  edgeMaterial: THREE.MeshStandardMaterial
  cutMaterial: THREE.MeshStandardMaterial
  pose?: { segments: Design['segments']; bend: number; thickness: number }
}

function woodTexture(material: Design['material']) {
  let canvas = grainCanvases.get(material)
  if (!canvas) {
    canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1024
    const context = canvas.getContext('2d')!
    const pixels = context.createImageData(canvas.width, canvas.height)
    pixels.data.set(createWoodTexturePixels(material, canvas.width))
    context.putImageData(pixels, 0, 0)
    grainCanvases.set(material, canvas)
  }
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
  ctx.fillStyle = '#9b794f'
  ctx.fillRect(0, 0, 64, 128)
  const veneer = woodAppearance(material).color
  const shades = [veneer, '#b18a53', '#e6c692', '#ac8450', veneer]
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

function createPanel(design: Design, source: PreviewGeometry): PreviewPanel {
  const group = new THREE.Group()
  const faceMaterial = new THREE.MeshStandardMaterial({
    map: woodTexture(design.material),
    roughness: woodAppearance(design.material).roughness,
    metalness: 0,
    side: THREE.DoubleSide,
  })
  const edgeMaterial = new THREE.MeshStandardMaterial({
    map: edgeTexture(design.material),
    roughness: 0.86,
    side: THREE.DoubleSide,
  })
  const cutMaterial = new THREE.MeshStandardMaterial({
    color: ['walnut', 'mahogany'].includes(design.material) ? '#362317' : '#5a3c22',
    roughness: 0.94,
    side: THREE.DoubleSide,
  })
  const panel: PreviewPanel = {
    group,
    source,
    material: design.material,
    parts: [],
    faceMaterial,
    edgeMaterial,
    cutMaterial,
  }
  const addMesh = (data: PreviewMesh, material: THREE.MeshStandardMaterial) => {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(data.vertices.length), 3).setUsage(
        THREE.DynamicDrawUsage,
      ),
    )
    geometry.setAttribute('uv', new THREE.BufferAttribute(data.uvs, 2))
    const mesh = new THREE.Mesh(geometry, material)
    mesh.castShadow = true
    mesh.receiveShadow = true
    group.add(mesh)
    panel.parts.push({
      geometry,
      vertices: data.vertices,
      sampleIndices: data.sampleIndices,
      mesh: true,
    })
  }
  addMesh(source.faces, faceMaterial)
  addMesh(source.edges, edgeMaterial)
  addMesh(source.cuts, cutMaterial)
  if (source.lines.length) {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(source.lines.length), 3).setUsage(
        THREE.DynamicDrawUsage,
      ),
    )
    group.add(new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: '#634425' })))
    panel.parts.push({
      geometry,
      vertices: source.lines,
      sampleIndices: source.lineSampleIndices,
      mesh: false,
    })
  }
  return panel
}

function updatePanel(panel: PreviewPanel, design: Design, bend: number) {
  if (panel.material !== design.material) {
    panel.faceMaterial.map?.dispose()
    panel.faceMaterial.map = woodTexture(design.material)
    panel.faceMaterial.roughness = woodAppearance(design.material).roughness
    panel.edgeMaterial.map?.dispose()
    panel.edgeMaterial.map = edgeTexture(design.material)
    panel.cutMaterial.color.set(
      ['walnut', 'mahogany'].includes(design.material) ? '#362317' : '#5a3c22',
    )
    panel.material = design.material
  }
  if (
    panel.pose?.segments === design.segments &&
    panel.pose.bend === bend &&
    panel.pose.thickness === design.thickness
  )
    return
  panel.pose = { segments: design.segments, bend, thickness: design.thickness }
  const map = createPreviewMapper(design.segments, bend, design.thickness, panel.source.distances)
  for (const part of panel.parts) {
    const positions = part.geometry.getAttribute('position') as THREE.BufferAttribute
    map(part.vertices, positions.array as Float32Array, part.sampleIndices)
    positions.needsUpdate = true
    if (part.mesh) part.geometry.computeVertexNormals()
    part.geometry.computeBoundingBox()
    part.geometry.computeBoundingSphere()
  }
  panel.group.position.set(0, 0, 0)
  const bounds = new THREE.Box3().setFromObject(panel.group)
  if (bounds.isEmpty()) return
  const center = bounds.getCenter(new THREE.Vector3())
  panel.group.position.set(-center.x, -bounds.min.y, -center.z)
}

export default function PlywoodPreview({
  design,
  geometry,
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
    renderer.domElement.dataset.previewReady = 'false'
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
    let renderFrame = 0
    const render = () => {
      if (renderFrame) return
      renderFrame = requestAnimationFrame(() => {
        renderFrame = 0
        renderer.render(scene, camera)
        renderer.domElement.dataset.previewReady = String(context.hasModel && !context.modelPending)
      })
    }
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
      panel: null,
      modelPending: true,
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
      cancelAnimationFrame(renderFrame)
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
    context.modelPending = true
    context.renderer.domElement.dataset.previewReady = 'false'
    const frame = requestAnimationFrame(() => {
      if (context.panel?.source !== geometry) {
        disposeGroup(context.model)
        context.panel = createPanel(design, geometry)
        context.model.add(context.panel.group)
      }
      updatePanel(context.panel, design, bend)
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
      context.modelPending = false
      context.render()
    })
    return () => cancelAnimationFrame(frame)
  }, [design, geometry, bend, ready, view])

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
      {showCuts && !geometry.detailedCuts && !error && (
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
