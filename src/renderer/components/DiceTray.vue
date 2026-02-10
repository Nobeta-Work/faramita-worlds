<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as THREE from 'three'
import { Dices } from 'lucide-vue-next'
import { useChronicleStore } from '../store/chronicle'

const chronicleStore = useChronicleStore()
const canvasRef = ref<HTMLCanvasElement | null>(null)
const resultText = ref('')

let scene: THREE.Scene
let camera: THREE.PerspectiveCamera
let renderer: THREE.WebGLRenderer
let dieGroup: THREE.Group
let animationId: number
let resetTimer: NodeJS.Timeout | null = null

const isRolling = ref(false)

// Map to store target quaternions for each face number (1-20)
const faceQuaternions: Record<number, THREE.Quaternion> = {}

const createFaceTexture = (text: string) => {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  // 1. Background bleed
  ctx.fillStyle = '#1a1a1a'
  ctx.fillRect(0, 0, 256, 256)

  // 2. Triangle with padding to ensure no gaps
  ctx.fillStyle = '#1a1a1a'
  ctx.strokeStyle = '#d4af37'
  ctx.lineWidth = 25
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(128, 10)
  ctx.lineTo(250, 220)
  ctx.lineTo(6, 220)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()

  // 3. Upright Text
  ctx.fillStyle = '#d4af37'
  ctx.font = 'bold 135px "Garamond", "Georgia", serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  
  ctx.shadowColor = 'rgba(0,0,0,0.8)'
  ctx.shadowBlur = 6
  ctx.shadowOffsetX = 3
  ctx.shadowOffsetY = 3
  
  ctx.fillText(text, 128, 140)

  const texture = new THREE.CanvasTexture(canvas)
  texture.anisotropy = 8
  return texture
}

let targetQuaternion = new THREE.Quaternion()
let lerpFactor = 0.05

const initScene = () => {
  if (!canvasRef.value) return

  scene = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(30, canvasRef.value.clientWidth / canvasRef.value.clientHeight, 0.1, 1000)
  renderer = new THREE.WebGLRenderer({ canvas: canvasRef.value, alpha: true, antialias: true })
  renderer.setSize(canvasRef.value.clientWidth, canvasRef.value.clientHeight)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

  dieGroup = new THREE.Group()
  
  // 1. Discrete faces using toNonIndexed
  const baseGeom = new THREE.IcosahedronGeometry(0.7, 0).toNonIndexed() // Reduced scale from 1 to 0.7
  const posAttr = baseGeom.getAttribute('position')
  
  // 2. Extract faces
  const faces: { vertices: THREE.Vector3[], centroid: THREE.Vector3 }[] = []
  for (let i = 0; i < 20; i++) {
    const vertices: THREE.Vector3[] = []
    const centroid = new THREE.Vector3()
    for (let j = 0; j < 3; j++) {
      const idx = i * 9 + j * 3
      const v = new THREE.Vector3(posAttr.array[idx], posAttr.array[idx + 1], posAttr.array[idx + 2])
      vertices.push(v)
      centroid.add(v)
    }
    centroid.divideScalar(3).normalize()
    faces.push({ vertices, centroid })
  }

  // 3. STRICT SORTING: Sort by Y descending (Top-most first)
  faces.sort((a, b) => {
    if (Math.abs(b.centroid.y - a.centroid.y) > 0.001) return b.centroid.y - a.centroid.y
    if (Math.abs(b.centroid.x - a.centroid.x) > 0.001) return b.centroid.x - a.centroid.x
    return b.centroid.z - a.centroid.z
  })

  // 4. Mapping and Alignment
  faces.forEach((face, i) => {
    // Map i=0 (top) to faceNumber 20, i=19 (bottom) to 1
    const faceNumber = 20 - i
    
    const faceGeom = new THREE.BufferGeometry()
    const vertexArray = new Float32Array(9)
    face.vertices.forEach((v, idx) => {
      vertexArray[idx * 3] = v.x
      vertexArray[idx * 3 + 1] = v.y
      vertexArray[idx * 3 + 2] = v.z
    })
    faceGeom.setAttribute('position', new THREE.BufferAttribute(vertexArray, 3))
    
    // UV Mapping: Vertex 0 is Top
    const uvs = new Float32Array([0.5, 1.0, 0.0, 0.0, 1.0, 0.0])
    faceGeom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
    faceGeom.computeVertexNormals()

    const material = new THREE.MeshStandardMaterial({
      map: createFaceTexture(faceNumber.toString()),
      metalness: 0.8,
      roughness: 0.2,
      side: THREE.FrontSide
    })

    const mesh = new THREE.Mesh(faceGeom, material)
    dieGroup.add(mesh)

    // ALIGNMENT: 
    // Q1: Rotates face centroid to look at camera (0,0,1)
    const q1 = new THREE.Quaternion().setFromUnitVectors(face.centroid, new THREE.Vector3(0, 0, 1))
    
    // Q2: Fixes tilt by ensuring vertex[0] (texture top) points UP
    const topV = face.vertices[0].clone().applyQuaternion(q1)
    const angle = Math.atan2(topV.x, topV.y)
    const q2 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -angle)
    
    // Final rotation for this faceNumber
    faceQuaternions[faceNumber] = q2.multiply(q1)
  })

  // 5. Initial State: Show face 20 (which is our top-most face)
  targetQuaternion.copy(faceQuaternions[20])
  dieGroup.quaternion.copy(targetQuaternion)

  scene.add(dieGroup)

  // Lighting
  scene.add(new THREE.AmbientLight(0xffffff, 1.8))
  const light = new THREE.DirectionalLight(0xffffff, 2.5)
  light.position.set(5, 10, 7)
  scene.add(light)
  const point = new THREE.PointLight(0xd4af37, 2)
  point.position.set(-5, -2, 5)
  scene.add(point)

  camera.position.z = 5.5

  const animate = () => {
    if (isRolling.value) {
      const axis = new THREE.Vector3(1, 0.8, 0.4).normalize()
      dieGroup.rotateOnWorldAxis(axis, 0.3)
    } else {
      dieGroup.quaternion.slerp(targetQuaternion, lerpFactor)
    }
    renderer.render(scene, camera)
    animationId = requestAnimationFrame(animate)
  }
  animate()
}

onMounted(() => {
  initScene()
})

onUnmounted(() => {
  if (animationId) cancelAnimationFrame(animationId)
  if (resetTimer) clearTimeout(resetTimer)
})

const rollDice = (result: number) => {
  if (isRolling.value) return
  isRolling.value = true
  resultText.value = ''
  
  if (resetTimer) clearTimeout(resetTimer)

  setTimeout(() => {
    isRolling.value = false
    if (faceQuaternions[result]) {
      targetQuaternion.copy(faceQuaternions[result])
    }
    lerpFactor = 0.15
    resultText.value = `投掷结果: ${result}`
    
    if (chronicleStore.isWaitingForRoll) {
      const interaction = chronicleStore.pendingInteraction
      if (interaction) {
        const isSuccess = interaction.dc ? result >= interaction.dc : true
        const outcome = interaction.dc ? (isSuccess ? 'SUCCESS' : 'FAILURE') : ''
        const dcText = interaction.dc ? ` / DC ${interaction.dc}` : ''
        resultText.value = `投掷结果: ${result} ${outcome}${dcText}`
      } else {
        resultText.value = `投掷结果: ${result}`
      }

      setTimeout(() => {
        chronicleStore.resolveInteraction(result)
      }, 1500) // Slightly longer delay to read
    }

    resetTimer = setTimeout(() => {
      resetToInitial()
    }, 5000)
  }, 1000)
}

const resetToInitial = () => {
  targetQuaternion.copy(faceQuaternions[20])
  lerpFactor = 0.04
  resultText.value = ''
}

const handleManualRoll = () => {
  // Only allow rolling if waiting for roll
  if (!chronicleStore.isWaitingForRoll) return
  
  const random = Math.floor(Math.random() * 20) + 1
  rollDice(random)
}

defineExpose({ rollDice })
</script>

<template>
  <div class="dice-tray" @click="handleManualRoll" :class="{ disabled: !chronicleStore.isWaitingForRoll }">
    <canvas ref="canvasRef"></canvas>
    
    <!-- Dev button removed -->

    <transition name="fade">
      <div v-if="resultText" class="dice-result top-display">
        {{ resultText }}
      </div>
    </transition>

    <div v-if="chronicleStore.pendingInteraction" class="interaction-hint-bottom">
      <div class="hint-title">需进行判定 (点击投掷)</div>
      <div class="hint-desc">{{ chronicleStore.pendingInteraction.description }}</div>
      <div class="hint-attr" v-if="chronicleStore.pendingInteraction.dc">
        DC: {{ chronicleStore.pendingInteraction.dc }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.dice-tray {
  width: 100%;
  height: 100%;
  position: relative;
  background-color: #000;
  border-radius: 8px;
  overflow: hidden;
  cursor: default;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.dice-tray:not(.disabled) {
  cursor: pointer;
}

.interaction-hint-bottom {
  position: absolute;
  bottom: 10px;
  left: 50%;
  transform: translateX(-50%);
  text-align: center;
  pointer-events: none;
  padding: 5px;
  z-index: 5;
  width: 90%;
}

/* Hide hint when result is shown */
.dice-result ~ .interaction-hint-bottom {
  /* We actually want to KEEP the hint visible but maybe dimmed, 
     or hide it if it overlaps. 
     User requirement: "Reason and DC always stay at bottom" */
  opacity: 0.5;
}

.hint-title {
  color: #d4af37;
  font-weight: bold;
  font-size: 12px;
  margin-bottom: 2px;
}

.hint-desc {
  color: #ccc;
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 90%;
  margin: 0 auto;
}

.hint-attr {
  color: #888;
  font-size: 10px;
  margin-top: 2px;
  font-family: monospace;
}

canvas {
  width: 100%;
  height: 100%;
  display: block;
}

.dice-result {
  position: absolute;
  top: 10px;
  left: 50%;
  transform: translateX(-50%);
  background-color: rgba(0, 0, 0, 0.8);
  color: #d4af37;
  padding: 4px 16px;
  border-radius: 16px;
  font-weight: bold;
  font-size: 14px;
  border: 1px solid #d4af37;
  pointer-events: none;
  z-index: 10;
  white-space: nowrap;
}

.fade-enter-active, .fade-leave-active {
  transition: opacity 0.6s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
</style>