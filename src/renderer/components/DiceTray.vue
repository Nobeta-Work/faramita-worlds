<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import * as THREE from 'three'
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-vue-next'
import { useChronicleStore } from '../store/chronicle'
import { DiceLogic } from '../core/DiceLogic'
import type { Difficulty, TagModifier } from '@shared/Interface'

const chronicleStore = useChronicleStore()
const canvasRef = ref<HTMLCanvasElement | null>(null)
const resultText = ref('')
const resultOutcome = ref<string | null>(null)
const showHistory = ref(false)
const rollHistory = ref<{ diceTotal: number; finalResult: number; outcome: string; difficulty: string; timestamp: number; isCriticalSuccess?: boolean }[]>([])
const DIFF_LABELS: Record<string, string> = { easy: '简单', normal: '普通', hard: '困难', extreme: '极难' }
const DIFF_MODS: Record<string, number> = { easy: 2, normal: 0, hard: -2, extreme: -4 }

let scene: THREE.Scene
let camera: THREE.PerspectiveCamera
let renderer: THREE.WebGLRenderer
let die1Group: THREE.Group
let die2Group: THREE.Group
let animationId: number
let resetTimer: NodeJS.Timeout | null = null
let themeObserver: MutationObserver | null = null

const isRolling = ref(false)

// Quaternions for showing a specific face on top of a d6
// BoxGeometry face order: +X, -X, +Y, -Y, +Z, -Z
// We want the face with value N on top (+Y direction facing camera)
const d6Quaternions: Record<number, THREE.Quaternion> = {}

type DicePalette = {
  faceBase: string
  edge: string
  dot: string
}

const getCssVar = (name: string, fallback: string) => {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

const getDicePalette = (): DicePalette => {
  return {
    faceBase: getCssVar('--bg-elevated', '#1d222b'),
    edge: getCssVar('--accent-gold', '#d4af37'),
    dot: '#f8fafc'
  }
}

// Draw dot patterns for d6 faces
const createDotTexture = (dots: number, palette: DicePalette) => {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const size = 256
  const r = 18 // dot radius

  // Background
  const grad = ctx.createRadialGradient(size / 2, size / 2, 10, size / 2, size / 2, size * 0.7)
  grad.addColorStop(0, palette.faceBase)
  grad.addColorStop(1, 'rgba(0,0,0,0.3)')
  ctx.fillStyle = palette.faceBase
  ctx.fillRect(0, 0, size, size)

  // Border
  ctx.strokeStyle = palette.edge
  ctx.lineWidth = 4
  ctx.strokeRect(8, 8, size - 16, size - 16)

  // Dot positions (1-6)
  ctx.fillStyle = palette.dot
  ctx.shadowColor = 'rgba(0,0,0,0.5)'
  ctx.shadowBlur = 4

  const positions: Record<number, [number, number][]> = {
    1: [[128, 128]],
    2: [[72, 72], [184, 184]],
    3: [[72, 72], [128, 128], [184, 184]],
    4: [[72, 72], [184, 72], [72, 184], [184, 184]],
    5: [[72, 72], [184, 72], [128, 128], [72, 184], [184, 184]],
    6: [[72, 72], [184, 72], [72, 128], [184, 128], [72, 184], [184, 184]]
  }

  for (const [x, y] of positions[dots] || []) {
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

const initD6Quaternions = () => {
  // For a BoxGeometry, the default face order is: +X, -X, +Y, -Y, +Z, -Z
  // We assign textures as: face index 0=1, 1=6, 2=2, 3=5, 4=3, 5=4
  // To show face N on top (facing camera at Z+), we need specific rotations
  // Camera looks at -Z, so we want the face to point toward +Z
  // Default "top" of box is +Y

  // Value on +Z face in our mapping: index 4 = value 3
  // We need rotations so that value N faces +Z (toward camera)

  // Face value -> which axis rotation needed
  // Val 1: on +X face -> rotate Y by -90deg
  // Val 6: on -X face -> rotate Y by +90deg  
  // Val 2: on +Y face -> rotate X by +90deg
  // Val 5: on -Y face -> rotate X by -90deg
  // Val 3: on +Z face -> no rotation (identity)
  // Val 4: on -Z face -> rotate Y by 180deg

  d6Quaternions[1] = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -Math.PI / 2, 0))
  d6Quaternions[6] = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0))
  d6Quaternions[2] = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0))
  d6Quaternions[5] = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0))
  d6Quaternions[3] = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0))
  d6Quaternions[4] = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI, 0))
}

let target1Quaternion = new THREE.Quaternion()
let target2Quaternion = new THREE.Quaternion()
let lerpFactor = 0.05

const initScene = () => {
  if (!canvasRef.value) return
  const palette = getDicePalette()
  initD6Quaternions()

  scene = new THREE.Scene()
  const aspect = canvasRef.value.clientWidth / canvasRef.value.clientHeight
  camera = new THREE.PerspectiveCamera(30, aspect, 0.1, 1000)
  renderer = new THREE.WebGLRenderer({ canvas: canvasRef.value, alpha: true, antialias: true })
  renderer.setSize(canvasRef.value.clientWidth, canvasRef.value.clientHeight)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.15
  renderer.outputColorSpace = THREE.SRGBColorSpace

  // Create face materials (6 faces: values 1,6,2,5,3,4 matching BoxGeometry face order)
  const faceOrder = [1, 6, 2, 5, 3, 4]
  const createDieMaterials = () => faceOrder.map(n => {
    const tex = createDotTexture(n, palette)
    return new THREE.MeshPhysicalMaterial({
      map: tex,
      metalness: 0.6,
      roughness: 0.35,
      clearcoat: 0.5,
      clearcoatRoughness: 0.3
    })
  })

  const dieGeometry = new THREE.BoxGeometry(0.8, 0.8, 0.8)

  // Die 1
  die1Group = new THREE.Group()
  const die1Mesh = new THREE.Mesh(dieGeometry, createDieMaterials())
  die1Group.add(die1Mesh)
  
  const edges1 = new THREE.LineSegments(
    new THREE.EdgesGeometry(dieGeometry),
    new THREE.LineBasicMaterial({ color: new THREE.Color(palette.edge), transparent: true, opacity: 0.6 })
  )
  die1Group.add(edges1)
  die1Group.position.set(-0.7, 0, 0)
  scene.add(die1Group)

  // Die 2
  die2Group = new THREE.Group()
  const die2Mesh = new THREE.Mesh(dieGeometry, createDieMaterials())
  die2Group.add(die2Mesh)
  
  const edges2 = new THREE.LineSegments(
    new THREE.EdgesGeometry(dieGeometry),
    new THREE.LineBasicMaterial({ color: new THREE.Color(palette.edge), transparent: true, opacity: 0.6 })
  )
  die2Group.add(edges2)
  die2Group.position.set(0.7, 0, 0)
  scene.add(die2Group)

  // Show 3 on both dice initially (total 6)
  target1Quaternion.copy(d6Quaternions[3])
  target2Quaternion.copy(d6Quaternions[3])
  die1Group.quaternion.copy(target1Quaternion)
  die2Group.quaternion.copy(target2Quaternion)

  // Lighting
  scene.add(new THREE.AmbientLight(0xffffff, 1.2))
  const key = new THREE.DirectionalLight(0xffffff, 1.4)
  key.position.set(4, 6, 7)
  scene.add(key)
  const fill = new THREE.DirectionalLight(0x8fb1ff, 0.5)
  fill.position.set(-5, -2, 5)
  scene.add(fill)
  const rim = new THREE.PointLight(new THREE.Color(palette.edge), 0.8)
  rim.position.set(-4, 3, 4)
  scene.add(rim)

  camera.position.z = 5

  const animate = () => {
    if (isRolling.value) {
      const axis1 = new THREE.Vector3(1, 0.7, 0.3).normalize()
      const axis2 = new THREE.Vector3(0.5, 1, 0.6).normalize()
      die1Group.rotateOnWorldAxis(axis1, 0.25)
      die2Group.rotateOnWorldAxis(axis2, 0.3)
    } else {
      die1Group.quaternion.slerp(target1Quaternion, lerpFactor)
      die2Group.quaternion.slerp(target2Quaternion, lerpFactor)
    }
    renderer.render(scene, camera)
    animationId = requestAnimationFrame(animate)
  }
  animate()
}

onMounted(() => {
  initScene()
  themeObserver = new MutationObserver(() => {
    // Re-init on theme change for simplicity
  })
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme']
  })
})

onUnmounted(() => {
  if (animationId) cancelAnimationFrame(animationId)
  if (resetTimer) clearTimeout(resetTimer)
  if (themeObserver) {
    themeObserver.disconnect()
    themeObserver = null
  }
})

const rollDice = () => {
  if (isRolling.value || !chronicleStore.isWaitingForRoll) return
  isRolling.value = true
  resultText.value = ''
  resultOutcome.value = null

  if (resetTimer) clearTimeout(resetTimer)

  setTimeout(() => {
    isRolling.value = false

    const interaction = chronicleStore.pendingInteraction
    if (!interaction) {
      resultText.value = '无待判定交互'
      return
    }

    const tags: TagModifier[] = (interaction.relevant_tags || []).map((t: any) => ({
      text: t.text || '',
      positive: t.positive !== false,
      weight: t.weight || 1
    }))
    const difficulty = (interaction.difficulty || 'normal') as Difficulty
    const rollResult = DiceLogic.roll2d6(tags, difficulty)

    // Split naturalRoll into two d6 values for display
    const d1 = Math.floor(Math.random() * 6) + 1
    const raw = rollResult.diceTotal
    let d2 = raw - d1
    if (d2 < 1 || d2 > 6) {
      // Adjust: ensure valid split
      const half = Math.floor(raw / 2)
      const d1Fixed = Math.max(1, Math.min(6, half))
      d2 = Math.max(1, Math.min(6, raw - d1Fixed))
      target1Quaternion.copy(d6Quaternions[d1Fixed] || d6Quaternions[3])
    } else {
      target1Quaternion.copy(d6Quaternions[d1] || d6Quaternions[3])
    }
    target2Quaternion.copy(d6Quaternions[Math.max(1, Math.min(6, d2))] || d6Quaternions[3])
    lerpFactor = 0.15

    const outcomeText = rollResult.isCriticalSuccess ? '大成功'
      : rollResult.outcome === 'full_success' ? '完全成功'
      : rollResult.outcome === 'partial_success' ? '部分成功'
      : '失败'
    resultText.value = `2d6 = ${rollResult.diceTotal}  →  ${rollResult.finalResult}  [${outcomeText}]`
    resultOutcome.value = rollResult.outcome

    // Add to history
    rollHistory.value.unshift({
      diceTotal: rollResult.diceTotal,
      finalResult: rollResult.finalResult,
      outcome: rollResult.outcome,
      difficulty: difficulty,
      timestamp: Date.now(),
      isCriticalSuccess: rollResult.isCriticalSuccess
    })
    if (rollHistory.value.length > 20) rollHistory.value.pop()

    setTimeout(() => {
      chronicleStore.resolveInteraction(rollResult)
    }, 1800)

    resetTimer = setTimeout(() => {
      resultText.value = ''
      resultOutcome.value = null
      lerpFactor = 0.04
    }, 6000)
  }, 1200)
}

const resultClass = computed(() => {
  if (!resultOutcome.value) return ''
  if (resultOutcome.value === 'full_success') return 'dice-result-full'
  if (resultOutcome.value === 'partial_success') return 'dice-result-partial'
  return 'dice-result-failure'
})

const outcomeLabel = (o: string, isCriticalSuccess?: boolean) => {
  if (isCriticalSuccess) return '大成功'
  if (o === 'full_success') return '完全成功'
  if (o === 'partial_success') return '部分成功'
  return '失败'
}

const outcomeClass = (o: string) => {
  if (o === 'full_success') return 'outcome-full'
  if (o === 'partial_success') return 'outcome-partial'
  return 'outcome-failure'
}

const difficultyLabel = (d: string) => DIFF_LABELS[d] || d

const relativeTime = (ts: number) => {
  const diff = Math.floor((Date.now() - ts) / 1000)
  if (diff < 10) return '刚才'
  if (diff < 60) return `${diff}秒前`
  if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`
  return `${Math.floor(diff / 3600)}小时前`
}

const clearHistory = () => {
  rollHistory.value = []
}

const pendingRollTarget = computed(() => {
  const interaction = chronicleStore.pendingInteraction
  if (!interaction || !chronicleStore.isWaitingForRoll) return null

  const difficulty = interaction.difficulty || 'normal'
  const tagMod = (interaction.relevant_tags || []).reduce((sum, t) => sum + (t.positive ? t.weight : -t.weight), 0)
  const diffMod = DIFF_MODS[difficulty] ?? 0
  const totalMod = tagMod + diffMod

  return {
    difficultyLabel: DIFF_LABELS[difficulty] || difficulty,
    needPartial: 6 - totalMod,
    needFull: 9 - totalMod,
    modifierText: totalMod >= 0 ? `+${totalMod}` : `${totalMod}`
  }
})

defineExpose({ rollDice })
</script>

<template>
  <div class="dice-tray" @click="rollDice" :class="{ disabled: !chronicleStore.isWaitingForRoll }">
    <!-- Disabled overlay -->
    <div v-if="!chronicleStore.isWaitingForRoll" class="disabled-overlay">
      <span>等待判定...</span>
    </div>

    <canvas ref="canvasRef"></canvas>

    <!-- Roll target HUD -->
    <div v-if="pendingRollTarget" class="target-hud">
      <div class="target-meta">🎯 难度: {{ pendingRollTarget.difficultyLabel }} | 修正: {{ pendingRollTarget.modifierText }}</div>
      <div class="target-values">部分成功 ≥ {{ pendingRollTarget.needPartial }} | 完全成功 ≥ {{ pendingRollTarget.needFull }}</div>
    </div>

    <!-- Result badge -->
    <transition name="fade">
      <div v-if="resultText" class="dice-result" :class="resultClass">
        {{ resultText }}
      </div>
    </transition>

    <!-- Roll history -->
    <div class="history-toggle" @click.stop="showHistory = !showHistory">
      <component :is="showHistory ? ChevronDown : ChevronUp" :size="14" />
      <span>历史 ({{ rollHistory.length }})</span>
    </div>
    <transition name="slide">
      <div v-if="showHistory" class="roll-history">
        <div v-if="rollHistory.length" class="history-header">
          <span class="history-title">投掷记录</span>
          <button class="btn-clear-history" @click.stop="clearHistory" title="清空历史">
            <Trash2 :size="12" />
          </button>
        </div>
        <div v-for="(entry, i) in rollHistory" :key="entry.timestamp" class="history-row">
          <span class="history-idx">#{{ rollHistory.length - i }}</span>
          <span>{{ entry.diceTotal }} → {{ entry.finalResult }}</span>
          <span v-if="entry.difficulty && entry.difficulty !== 'normal'" class="history-diff">{{ difficultyLabel(entry.difficulty) }}</span>
          <span class="history-outcome" :class="outcomeClass(entry.outcome)">{{ outcomeLabel(entry.outcome, entry.isCriticalSuccess) }}</span>
          <span class="history-time">{{ relativeTime(entry.timestamp) }}</span>
        </div>
        <div v-if="!rollHistory.length" class="history-empty">暂无投掷记录</div>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.dice-tray {
  width: 100%;
  height: 100%;
  position: relative;
  background: linear-gradient(180deg, color-mix(in srgb, var(--bg-elevated) 92%, transparent), var(--bg-app));
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  overflow: hidden;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.dice-tray.disabled {
  cursor: not-allowed;
}

.disabled-overlay {
  position: absolute;
  inset: 0;
  z-index: 20;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  font-size: 13px;
  pointer-events: none;
}

canvas {
  width: 100%;
  height: 100%;
  display: block;
}

.dice-result {
  position: absolute;
  top: 84px;
  left: 10px;
  right: 10px;
  background-color: color-mix(in srgb, var(--bg-overlay) 80%, transparent);
  color: var(--accent-gold);
  padding: 6px 12px;
  border-radius: 10px;
  font-weight: bold;
  font-size: 13px;
  border: 1px solid var(--accent-gold);
  box-shadow: var(--glow-gold);
  pointer-events: none;
  z-index: 10;
  white-space: normal;
  text-align: center;
  transition: box-shadow 0.4s ease;
}

.target-hud {
  position: absolute;
  top: 10px;
  left: 10px;
  right: 120px;
  z-index: 12;
  background: color-mix(in srgb, var(--bg-overlay) 76%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent-gold) 40%, transparent);
  border-radius: var(--radius-sm);
  padding: 6px 10px;
  line-height: 1.35;
}

.target-meta {
  color: var(--text-primary);
  font-size: 11px;
  font-weight: 600;
}

.target-values {
  margin-top: 2px;
  color: var(--accent-gold);
  font-size: 12px;
  font-weight: 600;
}

.dice-result.dice-result-full {
  border-color: var(--dice-full-success);
  color: var(--dice-full-success);
  box-shadow: 0 0 12px var(--dice-full-success);
}
.dice-result.dice-result-partial {
  border-color: var(--dice-partial-success);
  color: var(--dice-partial-success);
  box-shadow: 0 0 10px var(--dice-partial-success);
}
.dice-result.dice-result-failure {
  border-color: var(--dice-failure);
  color: var(--dice-failure);
  box-shadow: 0 0 10px var(--dice-failure);
}

.history-toggle {
  position: absolute;
  top: 4px;
  right: 6px;
  z-index: 15;
  display: flex;
  align-items: center;
  gap: 3px;
  cursor: pointer;
  color: var(--text-secondary);
  font-size: 11px;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--bg-overlay) 60%, transparent);
}
.history-toggle:hover {
  color: var(--text-primary);
}

.roll-history {
  position: absolute;
  top: 26px;
  right: 6px;
  z-index: 15;
  background: color-mix(in srgb, var(--bg-elevated) 95%, transparent);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
  padding: 4px 0;
  max-height: 180px;
  overflow-y: auto;
  min-width: 150px;
}

.history-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 8px;
  font-size: 11px;
  color: var(--text-secondary);
}

.history-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 8px;
  border-bottom: 1px solid var(--border-default);
  margin-bottom: 2px;
}

.history-title {
  font-size: 10px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.btn-clear-history {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 2px;
  border-radius: 2px;
  display: flex;
  align-items: center;
}
.btn-clear-history:hover {
  color: var(--state-danger);
}

.history-idx {
  color: var(--text-tertiary);
  min-width: 20px;
}

.history-diff {
  font-size: 9px;
  padding: 0 3px;
  border-radius: 2px;
  background: var(--accent-primary-weak);
  color: var(--accent-primary);
}

.history-outcome {
  margin-left: auto;
  font-weight: 600;
}

.history-time {
  color: var(--text-tertiary);
  font-size: 10px;
  min-width: 40px;
  text-align: right;
}

.history-empty {
  padding: 12px 8px;
  text-align: center;
  color: var(--text-muted);
  font-size: 11px;
}
.outcome-full { color: var(--dice-full-success); }
.outcome-partial { color: var(--dice-partial-success); }
.outcome-failure { color: var(--dice-failure); }

.fade-enter-active, .fade-leave-active {
  transition: opacity 0.6s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}

.slide-enter-active, .slide-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}
.slide-enter-from, .slide-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

@media (max-width: 900px) {
  .target-hud {
    right: 10px;
  }

  .dice-result {
    top: 96px;
    font-size: 12px;
  }
}
</style>