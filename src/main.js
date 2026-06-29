import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SplitText } from 'gsap/SplitText'
import Lenis from 'lenis'

document.addEventListener('DOMContentLoaded', () => {

  // ─── GSAP plugins ─────────────────────────────────────────────────────────
  gsap.registerPlugin(ScrollTrigger, SplitText)

  // ─── Lenis smooth scroll ──────────────────────────────────────────────────
  const lenis = new Lenis()
  gsap.ticker.add((time) => lenis.raf(time * 1000))
  gsap.ticker.lagSmoothing(0)

  // ─── Split text ───────────────────────────────────────────────────────────

  const headerSplit = new SplitText('.header-text', {
    type: 'chars',
    charsClass: 'char',
  })

  headerSplit.chars.forEach((char) => {
    const wrap = document.createElement('span')
    wrap.style.cssText = 'display:inline-block; overflow:hidden; vertical-align:bottom;'
    char.style.display = 'inline-block'
    char.parentNode.insertBefore(wrap, char)
    wrap.appendChild(char)
  })

  gsap.utils.toArray('.tooltip-title, .tooltip-desc').forEach((el) => {
    const split = new SplitText(el, { type: 'lines', linesClass: 'line' })
    split.lines.forEach((line) => {
      const wrap = document.createElement('div')
      wrap.style.overflow = 'hidden'
      line.parentNode.insertBefore(wrap, line)
      wrap.appendChild(line)
    })
  })

  // Envolve cada ícone num wrapper overflow:hidden para clipar a animação yPercent
  document.querySelectorAll('.tooltip .icon').forEach((icon) => {
    const wrap = document.createElement('div')
    wrap.style.overflow = 'hidden'
    icon.parentNode.insertBefore(wrap, icon)
    wrap.appendChild(icon)
  })

  // ─── Initial states ───────────────────────────────────────────────────────
  gsap.set('.header-text .char', { yPercent: 100 })
  gsap.set('.header-2', { xPercent: 100 })
  gsap.set('.tooltip .icon, .tooltip-title .line, .tooltip-desc .line', { yPercent: 125 })

  // ─── Animation config ─────────────────────────────────────────────────────
  const animOptions = { duration: 0.8, ease: 'power2.out', stagger: 0.06 }

  // ─── Tooltip groups ───────────────────────────────────────────────────────
  const tooltipGroups = [
    {
      trigger: 0.65,
      elements: [
        document.querySelector('.tooltip:first-child .icon'),
        ...document.querySelectorAll('.tooltip:first-child .tooltip-title .line'),
        ...document.querySelectorAll('.tooltip:first-child .tooltip-desc .line'),
      ],
    },
    {
      trigger: 0.85,
      elements: [
        document.querySelector('.tooltip--right .icon'),
        ...document.querySelectorAll('.tooltip--right .tooltip-title .line'),
        ...document.querySelectorAll('.tooltip--right .tooltip-desc .line'),
      ],
    },
  ]
  const tooltipState = [false, false]

  // ─── Header 1 entrance ────────────────────────────────────────────────────
  ScrollTrigger.create({
    trigger: '.product-overview',
    start: 'top 75%',
    onEnter: () => {
      gsap.to('.header-text .char', {
        yPercent: 0,
        duration: animOptions.duration,
        ease: animOptions.ease,
        stagger: 0.015,
      })
    },
    onLeaveBack: () => {
      gsap.to('.header-text .char', { yPercent: 100, duration: 0.4, ease: 'power2.in' })
    },
  })

  // ─── THREE.JS ─────────────────────────────────────────────────────────────

  let model = null
  let modelSize = null
  // Centro geométrico do modelo (calculado uma única vez no load)
  let centerX = 0, centerY = 0, centerZ = 0
  // Largura visível em unidades de mundo
  let screenHalfWidth = 5
  // Deslocamento horizontal (esquerda no desktop)
  let hOffset = -1.2

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000)

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setClearColor(0x000000, 0)
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.2
  renderer.outputColorSpace = THREE.SRGBColorSpace

  document.querySelector('.model-container').appendChild(renderer.domElement)

  // Environment map (simula HDRI de estúdio — reflexos realistas sem arquivo externo)
  const pmrem = new THREE.PMREMGenerator(renderer)
  pmrem.compileEquirectangularShader()
  const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  scene.environment = envTexture
  pmrem.dispose()

  // Luzes
  scene.add(new THREE.AmbientLight(0xffffff, 0.3))

  const mainLight = new THREE.DirectionalLight(0xffffff, 1.8)
  mainLight.position.set(3, 6, 4)
  mainLight.castShadow = true
  mainLight.shadow.bias = -0.001
  mainLight.shadow.mapSize.set(2048, 2048)
  scene.add(mainLight)

  const rimLight = new THREE.DirectionalLight(0xffc0d0, 1.2)   // luz de contorno rosada
  rimLight.position.set(-4, 2, -3)
  scene.add(rimLight)

  const fillLight = new THREE.DirectionalLight(0xffffff, 0.6)
  fillLight.position.set(0, -3, 5)
  scene.add(fillLight)

  // ─── Atualiza câmera e screenHalfWidth (chamado no load e no resize) ──────
  function updateCamera() {
    if (!modelSize) return
    const isMobile = window.innerWidth < 768
    hOffset = isMobile ? 0.3 : -1.2
    model.rotation.z = isMobile ? 0 : -0.08

    const maxDim = Math.max(modelSize.x, modelSize.y, modelSize.z)
    const distance = maxDim * (isMobile ? 1.2 : 0.85)

    camera.position.set(0, 0, distance)
    camera.lookAt(hOffset, 0, 0)

    const halfH = Math.tan(30 * (Math.PI / 180)) * distance   // FOV 60° → tan(30°)
    screenHalfWidth = halfH * (window.innerWidth / window.innerHeight)
  }

  // ─── Load ─────────────────────────────────────────────────────────────────
  const loader = new GLTFLoader()
  loader.load('/body_spray_perfume.glb', (gltf) => {
    model = gltf.scene

    model.traverse((node) => {
      if (node.isMesh) {
        node.castShadow = true
        node.receiveShadow = true
        // Preserva os materiais originais do Blender
        // Garante que o environment map seja aplicado nas reflexões
        if (node.material) {
          node.material.envMapIntensity = 1.0
          node.material.needsUpdate = true
        }
      }
    })

    // Normaliza para ~3 unidades de altura
    const rawBox = new THREE.Box3().setFromObject(model)
    const rawSize = rawBox.getSize(new THREE.Vector3())
    const scale = 3 / Math.max(rawSize.x, rawSize.y, rawSize.z)
    model.scale.setScalar(scale)

    // Calcula centro geométrico UMA VEZ (modelo na origem, antes de qualquer posição)
    const box = new THREE.Box3().setFromObject(model)
    const c = box.getCenter(new THREE.Vector3())
    centerX = c.x
    centerY = c.y
    centerZ = c.z
    modelSize = box.getSize(new THREE.Vector3())

    scene.add(model)
    updateCamera()

    // Posição inicial: fora da tela pela direita
    model.position.set(-centerX + hOffset + 30, -centerY, -centerZ)
  },
  undefined,
  (err) => console.error('GLTFLoader:', err))

  // ─── Render loop ──────────────────────────────────────────────────────────
  function animate() {
    requestAnimationFrame(animate)
    renderer.render(scene, camera)
  }
  animate()

  // ─── Resize ───────────────────────────────────────────────────────────────
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
    updateCamera()
    introFrac = window.innerHeight / (window.innerHeight + PIN_PX)
    ScrollTrigger.refresh()
  })

  // ─── TRIGGER 1: só o pin ─────────────────────────────────────────────────
  ScrollTrigger.create({
    trigger: '.product-overview',
    start: 'top top',
    end: '+=4000',
    pin: true,
    pinSpacing: true,
  })

  // ─── TRIGGER 2: animações — começa durante o scroll da intro ─────────────
  // A intro tem 100vh de scroll; o pin tem 4000px. Total = introH + 4000.
  // "raw" = progresso sobre o total. "p" = progresso normalizado só da fase pin.
  const PIN_PX = 4000
  let introFrac = window.innerHeight / (window.innerHeight + PIN_PX)

  function runAnimations(raw) {
    // p: 0 quando o pin começa, 1 quando acaba
    const p = clamp((raw - introFrac) / (1 - introFrac))

    // 1. Header 1 — começa a se mover desde o primeiro scroll da intro
    const h1End = introFrac + 0.30 * (1 - introFrac)
    gsap.set('.header-1', { x: -clamp(raw / h1End) * window.innerWidth })

    // 2. Circular mask  (20% → 30% do pin)
    const maskSize = clamp((p - 0.20) / 0.10) * 150
    document.querySelector('.circular-mask').style.clipPath = `circle(${maskSize}% at 50% 50%)`

    // 3. Header 2  (15% → 50% do pin)
    gsap.set('.header-2', { xPercent: 100 - clamp((p - 0.15) / 0.35) * 300 })

    // 4. Dividers  (45% → 65% do pin)
    gsap.set('.divider', { scaleX: clamp((p - 0.45) / 0.20) })

    // 5. Tooltips
    tooltipGroups.forEach(({ trigger, elements }, i) => {
      const on = p > trigger
      if (on !== tooltipState[i]) {
        tooltipState[i] = on
        gsap.to(elements, {
          yPercent: on ? 0 : 125,
          duration: animOptions.duration,
          ease: animOptions.ease,
          stagger: on ? animOptions.stagger : 0,
          overwrite: 'auto',
        })
      }
    })

    // 6. Modelo
    if (model) {
      const entryE = 1 - Math.pow(1 - clamp(p / 0.15), 3)
      const exitP  = clamp((p - 0.80) / 0.20)
      const exitE  = exitP * exitP * exitP
      const displaceX = Math.sin(p * Math.PI) * 0.4
      const displaceY = Math.sin(p * Math.PI * 1.5) * 0.15
      const restX = -centerX + hOffset
      let posX
      if (exitP > 0) {
        // de (restX + displaceX) até (restX - 30)
        posX = (restX + displaceX) + (-displaceX - 30) * exitE
      } else {
        // de (restX + 30) até (restX + displaceX)
        posX = (restX + 30) + (displaceX - 30) * entryE
      }
      model.position.x = posX
      model.position.y = -centerY + displaceY
      model.position.z = -centerZ
      model.rotation.y = clamp(p / 0.95) * Math.PI * 4
    }
  }

  ScrollTrigger.create({
    trigger: '.intro',
    start: 'top top',
    end: `+=${window.innerHeight + PIN_PX}`,
    scrub: 1,
    onUpdate: (self) => runAnimations(self.progress),
  })

  function clamp(val) {
    return Math.min(1, Math.max(0, val))
  }
})
