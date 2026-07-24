import { useEffect, useMemo, useRef, useState } from 'react'
import { Capacitor, registerPlugin } from '@capacitor/core'
import './App.css'
import Home from './Home.jsx'
import useSnowballCall from './components/call/useSnowballCall.js'
import Nutrition from './Nutrition.jsx'
import Train, { snowballAppNameFor } from './Train.jsx'
import Footprint from './Footprint.jsx'
import People from './People.jsx'
import Things from './Things.jsx'
// Snowball V1 v90: independent daily/app-detail device sync with per-date refresh
import { NoticeModal, StatusPair } from './components/SnowballShared'
import Onboarding from './components/onboarding/Onboarding.jsx'
import StepAutoTable from './StepAutoTable.jsx'
import { ingestStepPayload, stepValueForDate } from './stepDataService.js'
import { conversationBrainPercent, emptyConversationRecord, readConversationRecord, saveConversationRecord } from './components/call/conversationDataService.js'

const STORAGE_KEY = 'healthy-snowball-v8'
const TEST_PASSWORD = 'snowball'
const CUSTOM_YEARS_BG_IDB_KEY = 'footprint-custom-background'
const DeviceData = registerPlugin('DeviceData')
const DEVICE_USAGE_PROMPT_KEY = 'snowball-device-usage-prompt-v1'
const DEVICE_INITIAL_IMPORT_DAYS = 7

function openSnowballMediaDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available'))
      return
    }
    const request = indexedDB.open('snowball-media-v1', 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('images')) db.createObjectStore('images')
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('IndexedDB open failed'))
  })
}

function saveSnowballMedia(key, value) {
  return openSnowballMediaDb().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction('images', 'readwrite')
    tx.objectStore('images').put(value, key)
    tx.oncomplete = () => { db.close(); resolve(true) }
    tx.onerror = () => { db.close(); reject(tx.error || new Error('IndexedDB save failed')) }
  }))
}

function loadSnowballMedia(key) {
  return openSnowballMediaDb().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction('images', 'readonly')
    const request = tx.objectStore('images').get(key)
    request.onsuccess = () => resolve(request.result || '')
    request.onerror = () => reject(request.error || new Error('IndexedDB load failed'))
    tx.oncomplete = () => db.close()
  }))
}

const todayText = () => new Date().toLocaleDateString('zh-CN')

const VIDEO_MAP = {
  baby: '/baby_move.mp4',
  kitten: '/kitten_move.mp4',
  adult: '/adult_move.mp4',
}

const REWARD_VIDEO = '/three_days_bonus.mp4'

const USAGE_TEXT = `声明：雪粒是一款生活管理APP，旨在帮助梳理与自律，其中涉及的各项数据分析仅供参考，不构成任何健康诊断与建议。

雪粒的数据来源取决于用户的授权提供，仅存在用户单机，不作任何他用，云端和外界无法触及。

雪粒的形象随着用户每天的数据变化而变化。

步数越多 → 体型越壮
及时休息 → 毛形浓密
饮食均衡 → 毛色雪白
心情正面 → 眼睛圆亮

步数和屏幕时间经首次授权后，每天自动获取，可手动添加或更改。

饮食和心情数据来自每天与雪粒通话，录音流畅度受设备类型影响，可临时打字完成对话。

后期植入人工智能后，通话将近似真人效果。

五个主要功能：
营养：查看饮食结构和口味偏好光谱。
信息：查看屏幕时间分布和趋势。
足迹：记录去过的地方。
物馆：收录愿望、拥有和舍离。
人间：登记生命中有交集的人。
`

// =========================
// 动画参数集中管理
// 以后只改这里的数字，不需要到处找代码。
// frameMs 数字越大，动画越慢。
// scale 用来修正不同阶段 PNG 画布大小造成的视觉差异。
// =========================
const MOTION = {
  maxFrames: 36,
  frameMs: {
    footprint: 340,
    call: 340,
  },
  stageScale: {
    baby: 1.65,
    kitten: 0.87,
    adult: 0.87,
  },

  // 手动拍猫互动比例（独立于通话）
  interactionStageScale: {
    baby: 1.65,
    kitten: 0.87,
    adult: 0.87,
  },
  heroCatWidth: '40.6%',
  heroCatMaxWidth: '273px',
  footprintCatHeight: '15%',
  footprintCatLeft: '30%',
  footprintCatBottom: '2.5%',
}


const YEARS_SCENES = {
  beach: { label: '海边', image: '/years_beach.png' },
  park: { label: '公园', image: '/years_park.png' },
  field: { label: '田野', image: '/years_field.png' },
  mountain: { label: '山川', image: '/years_mountain.png' },
  corner: { label: '街角', image: '/years_corner.png' },
  city: { label: '市区', image: '/years_city.png' },
}

const FOOTPRINT_TYPES = {
  world: '世界',
  china: '中国',
  local: '身边',
}



const WORLD_PLACES = [
   '北美', '南美', '欧洲', '中亚', '南亚', '朝鲜', '非洲', '大洋洲', '南极', '北极',
  '中国', '澳大利亚', '新西兰', '日本', '香港','台湾','韩国', '新加坡', '马来西亚', '泰国', '越南', '印度', '菲律宾', '印尼', '尼泊尔', '沙特', '土耳其',
  '英国', '爱尔兰', '法国', '德国', '意大利', '西班牙', '葡萄牙', '荷兰', '瑞士', '希腊', '瑞典', '挪威', '丹麦', '芬兰', '冰岛', '俄罗斯',
  '美国', '加拿大', '墨西哥', '巴西', '阿根廷', '智利', '秘鲁', '哥伦比亚',
  '埃及', '南非', '摩洛哥'
]

const CHINA_PLACES = [
  '北京', '天津', '上海', '重庆', '河北', '山西', '辽宁', '吉林', '黑龙江', '江苏', '浙江', '安徽', '福建', '江西', '山东', '河南', '湖北', '湖南', '广东', '海南', '四川', '贵州', '云南', '陕西', '甘肃', '青海', '台湾', '内蒙古', '广西', '西藏', '宁夏', '新疆', '香港', '澳门'
]

const LOCAL_PLACES = ['公园', '海边', '餐饮', '商场', '公务场所','展馆', '亲友', '娱乐', '医院', '学校', '山野']


const FOOTPRINT_PLACE_OPTIONS = {
  world: WORLD_PLACES,
  china: CHINA_PLACES,
  local: LOCAL_PLACES,
}

const FOOTPRINT_POSITIONS = {
  world: {
    北美: { x: 23, y: 55 }, 南美: { x: 33, y: 74 }, 欧洲: { x: 48, y: 43 }, 中亚: { x: 68, y: 40 }, 南亚: { x: 68, y: 65 }, 朝鲜: { x: 85, y: 40 }, 非洲: { x: 55, y: 68 }, 大洋洲: { x: 87, y: 70 }, 南极: { x: 51, y: 96 }, 北极: { x: 52, y: 7 },
    中国: { x: 77, y: 45 }, 澳大利亚: { x: 84, y: 76 }, 新西兰: { x: 96, y: 91 }, 日本: { x: 88, y: 43 }, 香港: { x: 78, y: 52 }, 台湾: { x: 83, y: 52 }, 韩国: { x: 84, y: 45 }, 新加坡: { x: 75, y: 67 }, 马来西亚: { x: 74, y: 64 }, 泰国: { x: 72, y: 59 }, 越南: { x: 75, y: 57 }, 印尼: { x: 82, y: 65 }, 菲律宾: { x: 82, y: 58 }, 印度: { x: 71, y: 54 }, 尼泊尔: { x: 73, y: 49 }, 沙特: { x: 59, y: 52 }, 土耳其: { x: 58, y: 44 },
    英国: { x: 47, y: 30 }, 爱尔兰: { x: 45, y: 35 }, 法国: { x: 48, y: 39 }, 德国: { x: 52, y: 37 }, 意大利: { x: 53, y: 43 }, 西班牙: { x: 47, y: 48 }, 葡萄牙: { x: 42, y: 46 }, 荷兰: { x: 50, y: 35 }, 瑞士: { x: 51, y: 40 }, 希腊: { x: 55, y: 47 }, 瑞典: { x: 53, y: 28 }, 挪威: { x: 50, y: 27 }, 丹麦: { x: 51, y: 31 }, 芬兰: { x: 56, y: 24 }, 冰岛: { x: 42, y: 27 }, 俄罗斯: { x: 74, y: 28 },
    美国: { x: 22, y: 42 }, 加拿大: { x: 22, y: 25 }, 墨西哥: { x: 20, y: 50 }, 巴西: { x: 35, y: 68 }, 阿根廷: { x: 31, y: 86 }, 智利: { x: 28, y: 80 }, 秘鲁: { x: 29, y: 70 }, 哥伦比亚: { x: 30, y: 62 },
    埃及: { x: 53, y: 55 }, 南非: { x: 56, y: 82 }, 摩洛哥: { x: 46, y: 55 },
  },
  china: {
    北京: { x: 66, y: 39 }, 天津: { x: 71, y: 41 }, 上海: { x: 75, y: 60 }, 重庆: { x: 51, y: 69 }, 河北: { x: 64, y: 44 }, 山西: { x: 60, y: 47 }, 辽宁: { x: 74, y: 34 }, 吉林: { x: 78, y: 28 }, 黑龙江: { x: 78, y: 19 }, 江苏: { x: 71, y: 56 }, 浙江: { x: 71, y: 67 }, 安徽: { x: 68, y: 58 }, 福建: { x: 69, y: 76 }, 江西: { x: 65, y: 70 }, 山东: { x: 68, y: 50 }, 河南: { x: 61, y: 55 }, 湖北: { x: 58, y: 63 }, 湖南: { x: 59, y: 74 }, 广东: { x: 62, y: 83 }, 海南: { x: 56, y: 94 }, 四川: { x: 43, y: 63 }, 贵州: { x: 51, y: 75 }, 云南: { x: 41, y: 81 }, 陕西: { x: 54, y: 56 }, 甘肃: { x: 47, y: 53}, 青海: { x: 35, y: 49 }, 台湾: { x: 76, y: 80 }, 内蒙古: { x: 58, y: 35 }, 广西: { x: 52, y: 83 }, 西藏: { x: 27, y: 63 }, 宁夏: { x: 51, y: 47 }, 新疆: { x: 26, y: 33 }, 香港: { x: 65, y: 88 }, 澳门: { x: 61, y: 87 },
  },
  local: {
    公园: { x: 45, y: 48 }, 海边: { x: 80, y: 74 }, 餐饮: { x: 25, y: 75 }, 商场: { x: 40, y: 20 }, 展馆: { x: 56, y: 15 }, 亲友: { x: 23, y: 42 }, 娱乐: { x: 88, y: 34 }, 山野: { x: 10, y: 20 },
    医院: { x: 50, y: 35 }, 学校: { x: 72, y: 50 }, 公务场所: { x: 70, y: 28 },
  },
}

function placeOptions(type) {
  return FOOTPRINT_PLACE_OPTIONS[type] || LOCAL_PLACES
}

function isValidFootprintPlace(type, place) {
  return placeOptions(type).includes(String(place || '').trim())
}

function fallbackFootprintPosition(type, place) {
  const text = `${type}-${place}`
  let seed = 0
  for (let i = 0; i < text.length; i += 1) seed = (seed * 31 + text.charCodeAt(i)) % 9973
  return { x: 18 + (seed % 64), y: 22 + ((seed * 7) % 58) }
}

function footprintHasManualPosition(item) {
  const mode = item?.positionMode
  return (mode === 'manual' || mode === 'merged') &&
    Number.isFinite(Number(item?.x)) &&
    Number.isFinite(Number(item?.y))
}

function normalizeFootprintPoint(point) {
  return {
    x: Math.max(2, Math.min(98, Math.round(Number(point?.x || 0) * 10) / 10)),
    y: Math.max(2, Math.min(98, Math.round(Number(point?.y || 0) * 10) / 10)),
  }
}

function footprintDistance(a, b) {
  const dx = Number(a?.x || 0) - Number(b?.x || 0)
  const dy = Number(a?.y || 0) - Number(b?.y || 0)
  return Math.sqrt(dx * dx + dy * dy)
}

function footprintPosition(item) {
  const type = item?.type || 'local'
  const place = String(item?.place || '').trim()

  if (footprintHasManualPosition(item)) {
    return normalizeFootprintPoint(item)
  }

  return FOOTPRINT_POSITIONS[type]?.[place] || fallbackFootprintPosition(type, place)
}

function localPlaceIcon(place) {
  const icons = {
    公园: '🌳',
    海边: '🌊',
    餐饮: '🍽️',
    商场: '🛍️',
    展馆: '📚',
    亲友: '🏠',
    娱乐: '🎮',
    山野: '⛰️',
    田野: '🌾',
    山川: '⛰️',
    街角: '🏠',
    市区: '🏙️',
  }
  return icons[place] || '❄️'
}

function localRandomPosition(existing = []) {
  const count = existing.filter(item => item.type === 'local').length
  const cols = 6
  const rows = 4
  const col = count % cols
  const row = Math.floor(count / cols) % rows
  const jitterX = ((count * 17) % 9) - 4
  const jitterY = ((count * 29) % 9) - 4

  return {
    x: Math.min(90, Math.max(10, 12 + col * 15 + jitterX)),
    y: Math.min(86, Math.max(18, 20 + row * 18 + jitterY)),
  }
}

const DEFAULT = {
  date: todayText(),
  lastResetDate: todayText(),
  adoptDays: 1,
  yesterdaySteps: 0,
  yesterdaySleepTime: '',
  todaySleepTime: '',
  foodText: '',
  foodKeyword: '',
  moodKeyword: '',
  mood: '',
  chatInput: '',
  chatStep: 'idle',
  chatCount: 0,
  rewardSeenKey: '',
  hasSeenWelcome: false,
  lastGreetingDate: '',
  upgradeSeenKeys: [],
  records: [],
  screenRecords: [],
  stepAutoRecords: [],
  messages: [],
  installDate: todayText(),
  yearsScene: 'park',
  customYearsSceneImage: '',
  footprintDraft: { year: '', month: '', type: 'local', place: '', detail: '', note: '', photos: [] },
  footprints: [],
  things: [],
  thingsSavedAt: 0,
  people: [],
  thingDraft: { type: 'wish', year: '', month: '', name: '', reason: '', photo: '', valueType: 'priceless', value: '' },
  homePosition: null,
  homePositions: { world: null, china: null, local: null },
  deviceDailyInitialImportDone: false,
  deviceScreenInitialImportDone: false,
  lastDeviceDailyAutoSyncDate: '',
  lastDeviceScreenAutoSyncDate: '',
  lastSavedAt: 0,
  developerMode: false,
  }


function dataForLocalStorage(source) {
  const value = source && typeof source === 'object' ? source : DEFAULT
  return {
    ...value,
    // 物馆照片只保存在 IndexedDB。localStorage 保存轻量记录，避免多张照片触发容量上限。
    things: Array.isArray(value.things)
      ? value.things.map(item => ({ ...item, photo: '' }))
      : [],
    thingDraft: value.thingDraft
      ? { ...value.thingDraft, photo: '' }
      : { ...DEFAULT.thingDraft },
  }
}

const THINKING_WORDS = [
  '为什么', '怎么', '我觉得', '我认为', '我相信', '理解', '应该',
  '想', '分析', '到底', '因为', '所以', '而且', '不仅',
  '如果', '那么', '原来', '但是', '虽然', '既然',
]

function brainInfo(messages) {
  const userMessages = (messages || []).filter(m => m.from === 'user')
  const text = userMessages.map(m => m.text).join(' ')
  const messageScore = userMessages.length
  const wordScore = THINKING_WORDS.reduce((sum, word) => sum + (text.includes(word) ? 1 : 0), 0)
  const score = Math.min(100, messageScore + wordScore)
  return { score, active: score >= 10, label: `${score}%` }
}

function normalizeTime(t) {
  return String(t || '').replace('：', ':').trim()
}

function timeToMinutes(t) {
  const clean = normalizeTime(t)
  if (!clean) return null
  const match = clean.match(/^(\d{1,2}):([0-5]\d)$/)
  if (!match) return null
  const h = Number(match[1])
  const m = Number(match[2])
  if (Number.isNaN(h) || Number.isNaN(m)) return null
  return h * 60 + m
}

function sleepGood(sleep) {
  const minutes = timeToMinutes(sleep)
  if (minutes === null) return false
  return minutes >= 5 * 60 && minutes <= 23.5 * 60
}

function parseLocalDate(value) {
  if (value instanceof Date) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate())
  }

  const s = String(value || '').trim()
  const match = s.match(/^(\d{1,4})[\/-](\d{1,2})[\/-](\d{1,4})$/)

  if (match) {
    const a = Number(match[1])
    const b = Number(match[2])
    const c = Number(match[3])
    let y = a
    let m = b
    let d = c

    // 支持两种常见格式：2026/7/5 和澳洲式 5/7/2026。
    if (String(match[1]).length === 4) {
      y = a
      m = b
      d = c
    } else if (String(match[3]).length === 4) {
      y = c
      m = b
      d = a
    }

    const parsed = new Date(y, m - 1, d)
    if (
      parsed.getFullYear() === y &&
      parsed.getMonth() === m - 1 &&
      parsed.getDate() === d
    ) {
      return parsed
    }
  }

  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

function calcDays(installDate) {
  const start = parseLocalDate(installDate || todayText())
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const diff = Math.floor((today - start) / (1000 * 60 * 60 * 24)) + 1

  return Math.max(1, diff)
}

function elapsedDays(installDate) {
  return Math.max(0, calcDays(installDate) - 1)
}

function generationInfo(days) {
  const d = Math.max(1, Number(days || 1))
  const generation = Math.floor((d - 1) / 100) + 1
  const dayInGen = ((d - 1) % 100) + 1

  let stage = 'adult'
  let stageLabel = '高手猫'

  if (dayInGen <= 7) {
    stage = 'baby'
    stageLabel = '新手猫'
  } else if (dayInGen <= 30) {
    stage = 'kitten'
    stageLabel = '能手猫'
  }

  const genLabel = generation === 1 ? '' : `第${generation}代`
  return { stage, label: `${stageLabel}${genLabel}`, generation, dayInGen }
}

function bodyInfo(steps) {
  const n = Number(steps || 0)
  if (n < 5000) return { key: 'thin', label: '消瘦' }
  if (n < 10000) return { key: 'normal', label: '正好' }
  return { key: 'fat', label: '胖嘟' }
}

function uniqueJoin(words) {
  return [...new Set(words)].join('、')
}

function findWordsNoOverlap(text, words) {
  let remaining = String(text || '')
  const sorted = [...words].sort((a, b) => b.length - a.length)
  const found = []

  sorted.forEach(word => {
    if (remaining.includes(word)) {
      found.push(word)
      remaining = remaining.replaceAll(word, ' ')
    }
  })

  return [...new Set(found)]
}

function extractFoodKeyword(text) {
  const good = findWordsNoOverlap(text, GOOD_FOOD_WORDS)
  const bad = findWordsNoOverlap(text, BAD_FOOD_WORDS)
  const found = [...bad, ...good]
  return found.length ? uniqueJoin(found) : String(text || '').slice(0, 12)
}

function extractMoodKeyword(text) {
  const t = String(text || '')
  const bad = findWordsNoOverlap(t, BAD_MOOD_WORDS)
  if (bad.length > 0) return uniqueJoin(bad)

  const good = findWordsNoOverlap(t, GOOD_MOOD_WORDS)
  if (good.length > 0) return uniqueJoin(good)

  return t.slice(0, 10)
}

function foodInfo(text) {
  const t = String(text || '')
  if (!t.trim()) return { good: false, label: '暗淡' }

  const badMatches = findWordsNoOverlap(t, BAD_FOOD_WORDS)
  if (badMatches.length > 0) return { good: false, label: '暗淡' }

  const goodMatches = findWordsNoOverlap(t, GOOD_FOOD_WORDS)
  if (goodMatches.length >= 2) return { good: true, label: '雪亮' }

  return { good: false, label: '暗淡' }
}

function moodInfo(text) {
  const t = String(text || '')

  const bad = findWordsNoOverlap(t, BAD_MOOD_WORDS)
  if (bad.length > 0) return { good: false, mood: '有点累', eyes: '无神' }

  const good = findWordsNoOverlap(t, GOOD_MOOD_WORDS)
  if (good.length > 0) return { good: true, mood: '开心', eyes: '圆亮' }

  return { good: false, mood: '', eyes: '无神' }
}

function dateKey(d) {
  if (!d) return ''
  const parsed = parseLocalDate(d)
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`
}

function dailyRecordIdFor(date = todayText()) {
  return `daily-${dateKey(date) || Date.now()}`
}

function speak(text) {
  if (!('speechSynthesis' in window)) return

  window.speechSynthesis.cancel()

  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'zh-CN'
  utterance.rate = 0.95
  utterance.pitch = 1.25
  utterance.volume = 1

  const voices = window.speechSynthesis.getVoices()
  const zhVoices = voices.filter(v =>
    v.lang?.toLowerCase().includes('zh') ||
    v.name?.toLowerCase().includes('chinese') ||
    v.name?.includes('中文') ||
    v.name?.includes('普通话')
  )

  const femaleVoice =
    zhVoices.find(v => v.name?.includes('女')) ||
    zhVoices.find(v => v.name?.toLowerCase().includes('xiaoxiao')) ||
    zhVoices.find(v => v.name?.toLowerCase().includes('huihui')) ||
    zhVoices[0] ||
    voices[0]

  if (femaleVoice) utterance.voice = femaleVoice
  window.speechSynthesis.speak(utterance)
}

function backgroundImage(stepsOk, sleepOk, moodOk) {
  // 如果所有指标都达标，一周七天轮换不同的好状态背景，避免每天看同一张图。
  if (stepsOk && sleepOk && moodOk) {
    const day = new Date().getDay()
    const weeklyGoodBgs = [
      '/bg_good_all_sun.png',
      '/bg_good_all_mon.png',
      '/bg_good_all_tue.png',
      '/bg_good_all_wed.png',
      '/bg_good_all_thu.png',
      '/bg_good_all_fri.png',
      '/bg_good_all_sat.png',
    ]
    return weeklyGoodBgs[day] || '/bg_good_all.png'
  }
  if (!stepsOk && sleepOk && moodOk) return '/bg_badstep_goodsleep_goodmood.png'
  if (!stepsOk && !sleepOk && moodOk) return '/bg_badstep_badsleep_goodmood.png'
  if (!stepsOk && sleepOk && !moodOk) return '/bg_badstep_goodsleep_badmood.png'
  if (!stepsOk && !sleepOk && !moodOk) return '/bg_bad_all.png'
  if (stepsOk && !sleepOk && moodOk) return '/bg_goodstep_badsleep_goodmood.png'
  if (stepsOk && sleepOk && !moodOk) return '/bg_goodstep_goodsleep_badmood.png'
  return '/bg_goodstep_badsleep_badmood.png'
}

function dailySummaryText(data, sleepOk) {
  const steps = Number(data.yesterdaySteps || 0)
  const stepText =
    steps < 5000
      ? `你上次只走了${steps}步，今天记得多多走路，雪粒明天也许会长胖。`
      : steps < 10000
        ? `你上次顺利地走了${steps}步，雪粒长胖了，变好看了。`
        : `你上次成功地走了${steps}步，雪粒的身体越来越壮了。`

  const sleepText = sleepOk
    ? `你上次${data.yesterdaySleepTime || '晚上11点半'}以后就没用手机了，这让雪粒的毛发保持着蓬松浓密。`
    : `你上次晚上11点半以后还用了手机，雪粒的毛发变稀疏了，今天试试早点放下手机吧。`

  return `新天愉快！${stepText}${sleepText}`
}

function todayRecordFrom(data, healthyToday, foodKeyword, moodKeyword) {
  return {
    date: data.date,
    steps: Number(data.yesterdaySteps || 0),
    yesterdaySleep: formatClockForDaily(data.yesterdaySleepTime),
    todaySleep: data.todaySleepTime,
    food: foodKeyword || data.foodKeyword || extractFoodKeyword(data.foodText),
    mood: moodKeyword || data.moodKeyword || data.mood,
    healthy: healthyToday,
  }
}

function hashTextNumber(text) {
  const s = String(text || '')
  let seed = 0
  for (let i = 0; i < s.length; i += 1) seed = (seed * 31 + s.charCodeAt(i)) % 9973
  return seed
}

function minutesFromValue(value) {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number' && Number.isFinite(value)) {
    // 小于 24 的数字按小时处理，大数字按分钟处理。
    return value <= 24 ? Math.round(value * 60) : Math.round(value)
  }

  const text = String(value).trim()
  if (!text) return null

  const hourMinute = text.match(/^(\d{1,2})[:：](\d{1,2})$/)
  if (hourMinute) return Number(hourMinute[1]) * 60 + Number(hourMinute[2])

  const h = text.match(/(\d+(?:\.\d+)?)\s*(小时|h|H)/)
  const m = text.match(/(\d+)\s*(分钟|分|m|M)/)
  if (h || m) return Math.round(Number(h?.[1] || 0) * 60 + Number(m?.[1] || 0))

  const n = Number(text.replace(/[^0-9.]/g, ''))
  if (Number.isFinite(n) && n > 0) return n <= 24 ? Math.round(n * 60) : Math.round(n)
  return null
}

function formatDurationFromMinutes(minutes) {
  const n = Math.round(Number(minutes || 0))
  if (!n) return '—'
  const h = Math.floor(n / 60)
  const m = n % 60
  if (!h) return `${m}分`
  if (!m) return `${(n / 60).toFixed(1)}小时`
  return `${(n / 60).toFixed(1)}小时`
}

function formatClockFromMinutes(minutes) {
  if (minutes === null || minutes === undefined || Number.isNaN(minutes)) return '—'
  const n = Math.round(minutes) % (24 * 60)
  const h = Math.floor(n / 60)
  const m = n % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function recordScreenMinutes(record) {
  // 日常记录中的 screenMinutes 从原生端开始就统一使用“分钟”。
  // 不能再交给 minutesFromValue；否则 21 会被误判成 21 小时。
  const directMinutes = record?.screenMinutes
  if (directMinutes !== null && directMinutes !== undefined && directMinutes !== '') {
    const numeric = Number(directMinutes)
    if (Number.isFinite(numeric)) return Math.max(0, Math.round(numeric))
  }

  // 旧字段 screenHours 明确以小时保存，单独换算成分钟。
  const directHours = record?.screenHours
  if (directHours !== null && directHours !== undefined && directHours !== '') {
    const numeric = Number(directHours)
    if (Number.isFinite(numeric)) return Math.max(0, Math.round(numeric * 60))
  }

  const legacy = minutesFromValue(record?.screenTime ?? record?.screen)
  if (legacy !== null) return legacy
  return 0
}

function recordBrainPercent(record) {
  const direct = Number(record?.brainPercent ?? record?.brain ?? record?.brainScore ?? record?.interactionPercent)
  if (Number.isFinite(direct) && direct >= 0) return Math.min(100, Math.max(0, Math.round(direct)))
  return 0
}

function recordOffscreenMinutes(record) {
  const value = record?.offscreenTime ?? record?.offscreen ?? record?.yesterdaySleep ?? record?.todaySleep
  if (String(value ?? '').trim() === '0') return 0
  return minutesFromValue(value)
}

function monthKeyFromDate(value) {
  const d = parseLocalDate(value)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function previousMonthKeyFromDate(value) {
  const d = parseLocalDate(value)
  d.setMonth(d.getMonth() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function monthLabelFromKey(key) {
  const [year, month] = String(key || '').split('-')
  return `${year}年${Number(month || 1)}月`
}

function splitTags(value) {
  return String(value || '')
    .split(/[、,，\s/]+/)
    .map(item => item.trim())
    .filter(Boolean)
}

function topTags(records, field, count = 3) {
  const stat = new Map()
  records.forEach(record => {
    splitTags(record?.[field]).forEach(tag => stat.set(tag, (stat.get(tag) || 0) + 1))
  })
  return [...stat.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-CN'))
    .slice(0, count)
    .map(([tag]) => tag)
    .join('、') || '—'
}

function buildDailyMonthGroups(records = []) {
  const buckets = new Map()
  ;[...records]
    .sort((a, b) => dateKey(b.date).localeCompare(dateKey(a.date)))
    .forEach(record => {
      const key = monthKeyFromDate(record.date)
      if (!buckets.has(key)) buckets.set(key, [])
      buckets.get(key).push(record)
    })

  return [...buckets.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, items]) => {
      const steps = items.map(item => Number(item.steps || item.yesterdaySteps || 0)).filter(n => n > 0)
      const offscreens = items.map(recordOffscreenMinutes).filter(n => n !== null)
      const screens = items.map(recordScreenMinutes).filter(n => n !== null)
      const brains = items.map(recordBrainPercent).filter(n => Number.isFinite(n))

      return {
        key,
        label: monthLabelFromKey(key),
        records: items,
        avgSteps: steps.length ? Math.round(steps.reduce((sum, n) => sum + n, 0) / steps.length) : '—',
        avgOffscreen: offscreens.length ? formatClockFromMinutes(offscreens.reduce((sum, n) => sum + n, 0) / offscreens.length) : '—',
        avgScreen: screens.length ? formatDurationFromMinutes(screens.reduce((sum, n) => sum + n, 0) / screens.length) : '—',
        topFood: topTags(items, 'food'),
        topTaste: topTags(items, 'taste'),
        topMood: topTags(items, 'mood'),
        avgBrain: brains.length ? `${Math.round(brains.reduce((sum, n) => sum + n, 0) / brains.length)}%` : '—',
      }
    })
}


const DAILY_RANGE_TABS = [
  { key: 'today', label: '今天' },
  { key: 'yesterday', label: '昨天' },
  { key: 'week', label: '周均' },
  { key: 'month', label: '月均' },
  { key: 'year', label: '年均' },
]

const NUTRITION_TYPES = {
  protein: '蛋白',
  carbs: '碳水',
  vitamins: '维生素',
  minerals: '微量元素',
  fiber: '膳食纤维',
}

// 输入分类：按照用户日常理解展示。
const DAILY_FOOD_GROUPS = [
  { key: 'staple', label: '主食', options: ['米饭', '面食', '面包', '土豆', '薯类', '其它主食'] },
  { key: 'protein', label: '肉蛋奶', options: ['蛋', '奶制品', '豆制品','鸡鸭鹅', '牛羊肉', '猪肉', '香肠', '鱼虾蟹贝', '其它蛋白'] },
  { key: 'fruitVeg', label: '果蔬', options: ['白菜', '绿叶菜', '花椰菜', '胡白萝卜', '洋葱','芹菜','豆角豆荚','辣椒茄子','草莓','瓜类','苹果', '橙橘柚', '香蕉', '葡萄','桃李杏','其它蔬菜','其它水果'] },
  { key: 'mixed', label: '杂食', options: ['坚果', '海带', '紫菜', '菌类', '粗粮杂粮'] },
  { key: 'supplement', label: '补剂', options: ['VC', 'VD', 'VE', '其它维生素', '鱼油', '钙片', '铁片', '其它微量元素'] },
]

// 营养归类：营养光谱只读这里，后期增删食物主名只改这张表。
const FOOD_NUTRITION_MAP = {
  米饭: ['carbs', 'minerals'], 面食: ['carbs', 'minerals'], 面包: ['carbs', 'minerals'], 土豆: ['carbs', 'minerals'], 薯类: ['carbs', 'minerals'], 玉米: ['carbs', 'minerals'], 其它主食: ['carbs', 'minerals'],
  蛋: ['protein', 'minerals'], 奶制品: ['protein', 'minerals'], 豆制品: ['protein', 'minerals'], 鸡鸭鹅: ['protein', 'minerals'], 牛羊肉: ['protein', 'minerals'], 猪肉: ['protein', 'minerals'], 香肠: ['protein', 'minerals'], 鱼虾蟹贝: ['protein', 'minerals'], 其它蛋白: ['protein', 'minerals'],
  白菜: ['vitamins', 'fiber'], 绿叶菜: ['vitamins', 'fiber'], 花椰菜: ['vitamins', 'fiber'], 胡白萝卜: ['vitamins', 'fiber'], 洋葱: ['vitamins', 'fiber'], 芹菜: ['vitamins', 'fiber'], 豆角豆荚: ['vitamins', 'fiber'], 辣椒茄子: ['vitamins', 'fiber'], 草莓: ['vitamins', 'fiber'], 瓜类: ['vitamins', 'fiber'], 苹果: ['vitamins', 'fiber'], 橙橘柚: ['vitamins', 'fiber'], 香蕉: ['vitamins', 'fiber'], 葡萄: ['vitamins', 'fiber'], 桃李杏: ['vitamins', 'fiber'], 其它蔬菜: ['vitamins', 'fiber'], 其它水果: ['vitamins', 'fiber'],
  坚果: ['vitamins', 'minerals'], 海带: ['vitamins', 'minerals'], 紫菜: ['vitamins', 'minerals'], 菌类: ['vitamins', 'minerals'], 粗粮杂粮: ['vitamins', 'minerals'],
  VC: ['vitamins'], VD: ['vitamins'], VE: ['vitamins'], 其它维生素: ['vitamins'], 鱼油: ['minerals'], 钙片: ['minerals'], 铁片: ['minerals'], 其它微量元素: ['minerals'],
}

const DAILY_FOOD_OPTIONS = DAILY_FOOD_GROUPS.flatMap(group => group.options)

const TASTE_GROUPS = [
  { key: 'normal', label: '正常口味', options: ['清淡', '常规', '正常口味', '寻常', '生吃', '一般口味', '空气炸锅', '烤箱', '普通','家常','新鲜', '凉拌', '淡', '清炒', '素', '少油', '少盐','糖醋','普通','随意', '家常','平常',  '蒸', '炒',  '清炒', '爆炒', '清蒸', '小炒', '煎', '煮', '水煮', '慢炖', '小火炖', '炖', '炸','炖','红烧','正常'] },
  { key: 'heavy', label: '过重口味', options: ['重油','油炸', '油淋', '红油', '油焖','烟熏', '油泼','烟', '腊肠', '腊',  '熏', '油爆','高糖', '碳酸', '重盐', '咸', '腌制', '老干妈', '辣酱', '榨菜','腌','辛辣', '油辣子', '烤串', '烤肉', '火锅', '麻辣烫', '麻辣','烧烤'] },
]

const TASTE_OPTIONS = TASTE_GROUPS.flatMap(group => group.options)
const HEALTHY_TASTE_OPTIONS = TASTE_GROUPS.find(group => group.key === 'normal')?.options || []
const HEAVY_TASTE_OPTIONS = TASTE_GROUPS.find(group => group.key === 'heavy')?.options || []

const MOOD_GROUPS = [
  { key: 'positive', label: '正面', options: ['开心', '愉快', '平静', '好得很', '狂喜', '庆祝', '圆满', '预料之中','收获', '光荣','被关注','被爱','温暖',  '还行', '安心','有面子','尊重','省心','保护','安全感','放心','正常','正能量','鼓舞','笑', '乐', '美', '满意',  '好', '挺好','放松','不错','爽','上头','同情','共情','共鸣','心动','理解','懂得','幸福','高兴','得意','兴奋','喜悦','欣慰','宁静','期待','欢','浪漫','幸','喜','欣','解脱','享受','成就','正面'] },
  { key: 'negative', label: '负面', options: ['疲惫', '焦虑', '失望','绝望','恐惧','惊吓','没面子','嫉妒','害怕','难过', '坏','生气','糟糕','怒','害怕', '担心','不放心','放心不下','不省心','恶心','心疼','揪心','下头','怜悯','痛心','纠结','反感','讨厌','急','郁闷','紧张', '抑郁', '担忧','低落','不开心', '不好', '内疚','后悔','不高兴', '不满意', '不行', '不甘', '委屈', '烦', '恼', '不咋地', '不得劲', '沉重', '寂寞', '没劲', '无聊', '痛苦','孤独', '悲哀', '压抑', '负面'] },
]

const MOOD_OPTIONS = MOOD_GROUPS.flatMap(group => group.options)
const POSITIVE_MOOD_OPTIONS = MOOD_GROUPS.find(group => group.key === 'positive')?.options || []
const NEGATIVE_MOOD_OPTIONS = MOOD_GROUPS.find(group => group.key === 'negative')?.options || []

const DAILY_EDIT_REASONS = ['未能自动获取数据', '手机数据错误（如没带手机）', 'AI识别聊天信息不准确', '其它（如测试）']


const APP_CATEGORY_MAP = {
  utility: { label: '功能型', color: 'gold', apps: ['支付宝', '地图', '百度', '微信读书','美团','拼多多', '京东', '天猫','浏览器', '淘宝' ]},
  social: { label: '社交', color: 'red', apps: ['微信', '抖音', '微博', '小红书', '知乎', 'QQ', 'Instagram', 'FaceBook', 'Soul'] },
  ai: { label: 'AI', color: 'blue', apps: ['DeepSeek','豆包', 'GPT', 'Gemini', 'Claude', '千问', '元宝'] },
  entertainment: { label: '娱乐', color: 'silver', apps: ['哔哩哔哩', '腾讯视频', '爱奇艺', '优酷', '今日头条','YouTube', '快手'] },
  other: { label: '其它', color: 'green', apps: [] },
}

const APP_OPTIONS = [...new Set(Object.values(APP_CATEGORY_MAP).flatMap(item => item.apps))].filter(Boolean).sort((a, b) => a.localeCompare(b, 'zh-CN'))

const TRAIN_IMAGE_MAP = {
  utility: '/refine/train_utility.png',
  social: '/refine/train_social.png',
  ai: '/refine/train_ai.png',
  entertainment: '/refine/train_entertainment.png',
}

const APP_ICON_MAP = {
  支付宝: '/refine/icon_zhifubao.png',
  微信读书: '/refine/icon_wechatread.png',
  百度: '/refine/icon_baidu.png',
  Instagram: '/refine/icon_instagram.png',
  FaceBook: '/refine/icon_facebook.png',
  YouTube: '/refine/icon_youtube.png',
  浏览器: '/refine/icon_ie.png',
  Claude: '/refine/icon_claude.png',
  地图: '/refine/icon_map.png',
  美团: '/refine/icon_meituan.png',
  拼多多: '/refine/icon_pinduoduo.png',
  京东: '/refine/icon_jingdong.png',
  淘宝: '/refine/icon_taobao.png',
  天猫: '/refine/icon_taobao.png',
  微信: '/refine/icon_wechat.png',
  抖音: '/refine/icon_douyin.png',
  微博: '/refine/icon_weibo.png',
  小红书: '/refine/icon_rednote.png',
  知乎: '/refine/icon_zhihu.png',
  QQ: '/refine/icon_qq.png',
  Soul: '/refine/icon_soul.png',
  DeepSeek: '/refine/icon_deepseek.png',
  GPT: '/refine/icon_gpt.png',
  豆包: '/refine/icon_doubao.png',
  Gemini: '/refine/icon_gemini.png',
  哔哩哔哩: '/refine/icon_bilibili.png',
  腾讯视频: '/refine/icon_tengxunshipin.png',
  今日头条: '/refine/icon_jinritoutiao.png',
  快手: '/refine/icon_kuaishou.png',
}

const TRAIN_VISUAL_ROWS = ['utility', 'social', 'ai', 'entertainment']

function trainImageForCategory(key) {
  return TRAIN_IMAGE_MAP[key] || TRAIN_IMAGE_MAP.utility
}

function trainTopApps(item, limit = 5) {
  return String(item?.topApps || '')
    .split('、')
    .map(app => app.trim())
    .filter(app => app && app !== '—')
    .slice(0, limit)
}

function trainWidthForStats(item) {
  const minutes = Number(item?.minutes || 0)
  // 时长越长，车身越长；这一版把火车视觉尺寸整体放大。
  return Math.round(Math.max(340, Math.min(980, 340 + minutes * 3.2)))
}

function trainSpeedForStats(item, maxPickups = 1) {
  const pickups = Math.max(0, Number(item?.pickups || 0))
  const max = Math.max(1, Number(maxPickups || 1))
  // 打开次数越多，速度越快：按当前 TAB 内最大打开次数做线性映射。
  // 最高频约 3 秒跑完，最低频约 16 秒跑完；差异会非常明显。
  const ratio = Math.max(0, Math.min(1, pickups / max))
  const slow = 16
  const fast = 3
  return Number((slow - ratio * (slow - fast)).toFixed(2))
}

function trainOpacityForStats(item) {
  return Number(item?.minutes || 0) > 0 || Number(item?.pickups || 0) > 0 ? 1 : 0.36
}

function trainDistanceForStats(item) {
  const width = trainWidthForStats(item)
  const pickups = Number(item?.pickups || 0)
  const extra = Math.round(Math.min(760, Math.max(0, pickups * 22)))
  return `calc(100vw + ${width}px + ${720 + extra}px)`
}


function formatDateForDaily(date) {
  const d = date instanceof Date ? date : parseLocalDate(date)
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
}

function formatDailyDateWithWeek(date) {
  const d = date instanceof Date ? date : parseLocalDate(date)
  const week = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][d.getDay()]
  return `${formatDateForDaily(d)} ${week}`
}

function isValidClockText(value) {
  const text = normalizeTime(value)
  if (!text) return true
  const match = text.match(/^(\d{1,2}):([0-5]\d)$/)
  if (!match) return false
  const hour = Number(match[1])
  return hour >= 5 && hour <= 29
}

function formatClockForDaily(value) {
  const text = normalizeTime(value)
  if (!text) return ''
  const match = text.match(/^(\d{1,2}):([0-5]\d)$/)
  if (!match) return text.replace(':', '：')
  const hour = String(Number(match[1])).padStart(2, '0')
  const minute = match[2].padStart(2, '0')
  return `${hour}：${minute}`
}

function parseStrictDailyDate(value) {
  const text = String(value || '').trim()
  const match = text.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const now = new Date()
  if (year < 2000 || year > now.getFullYear() || month < 1 || month > 12 || day < 1 || day > 31) return null

  const d = new Date(year, month - 1, day)
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null
  return d
}

function formatHoursInputFromMinutes(minutes) {
  const n = Number(minutes || 0)
  if (!n) return ''
  const hours = n / 60
  return Number.isInteger(hours) ? String(hours) : String(Math.round(hours * 10) / 10)
}

function emptyDailyRecord(date = todayText()) {
  const formattedDate = formatDateForDaily(date)
  return {
    id: dailyRecordIdFor(formattedDate),
    date: formattedDate,
    steps: 0,
    yesterdaySleep: '',
    offscreenTime: '',
    screenMinutes: 0,
    food: '',
    taste: '',
    mood: '',
    brainPercent: 0,
    healthy: false,
  }
}

function normalizeDailyRecord(record = {}, index = 0) {
  const date = formatDateForDaily(record.date || todayText())
  return {
    ...record,
    id: record.id || dailyRecordIdFor(date) || `daily-fallback-${index}`,
    date,
    offscreenTime: record.offscreenTime || record.yesterdaySleep || '',
    yesterdaySleep: record.yesterdaySleep || record.offscreenTime || '',
    screenMinutes: recordScreenMinutes(record),
    food: record.food || record.foodKeyword || record.foodText || '',
    taste: record.taste || record.foodTaste || '',
    mood: record.mood || record.moodKeyword || '',
    brainPercent: recordBrainPercent(record),
  }
}

function normalizeStoredData(raw) {
  const base = { ...DEFAULT, ...(raw || {}) }
  const seen = new Set()
  const records = (base.records || []).map(normalizeDailyRecord).map((record, index) => {
    let id = record.id
    if (seen.has(id)) id = `${id}-${index}`
    seen.add(id)
    return { ...record, id, healthy: dailyRecordHealthy(record) }
  })

  const upgradeSeenKeys = Array.isArray(base.upgradeSeenKeys) ? base.upgradeSeenKeys : []

  return {
    ...base,
    date: formatDateForDaily(base.date || todayText()),
    installDate: formatDateForDaily(base.installDate || todayText()),
    upgradeSeenKeys,
    records: records.sort((a, b) => dateKey(b.date).localeCompare(dateKey(a.date))),
    screenRecords: (base.screenRecords || []).map(normalizeScreenRecord),
    stepAutoRecords: Array.isArray(base.stepAutoRecords) ? base.stepAutoRecords : [],
  }
}

function yesterdayText(base = new Date()) {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate())
  d.setDate(d.getDate() - 1)
  return formatDateForDaily(d)
}

function dailyRecordForDate(records = [], date = todayText()) {
  const key = dateKey(formatDateForDaily(date))
  return (records || []).find(record => dateKey(record?.date) === key) || null
}

function mergeDailyRecord(records = [], date = todayText(), patch = {}) {
  const normalizedDate = formatDateForDaily(date)
  const key = dateKey(normalizedDate)
  const current = dailyRecordForDate(records, normalizedDate) || emptyDailyRecord(normalizedDate)
  const next = { ...current, ...patch, id: patch.id || current.id || dailyRecordIdFor(normalizedDate), date: normalizedDate }
  const rest = (records || []).filter(record => dateKey(record?.date) !== key)
  return [next, ...rest].sort((a, b) => dateKey(b.date).localeCompare(dateKey(a.date)))
}

function dateListInclusive(startValue, endValue) {
  const start = parseLocalDate(startValue)
  const end = parseLocalDate(endValue)
  const list = []
  if (start > end) return list
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate())
  while (cursor <= end) {
    list.push(formatDateForDaily(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return list
}

function ensureDailyDateSkeleton(records = [], { initialDays = DEVICE_INITIAL_IMPORT_DAYS } = {}) {
  const normalized = (records || []).map(normalizeDailyRecord)
  const today = parseLocalDate(todayText())
  const existingKeys = new Set(normalized.map(record => dateKey(record.date)))
  let requiredDates = []

  if (!normalized.length) {
    const first = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    first.setDate(first.getDate() - Math.max(1, Number(initialDays || 7)))
    requiredDates = dateListInclusive(first, today)
  } else {
    const latestKey = normalized
      .map(record => dateKey(record.date))
      .filter(Boolean)
      .sort()
      .at(-1)
    const latest = latestKey ? parseLocalDate(latestKey) : today
    requiredDates = dateListInclusive(latest, today)
  }

  const added = requiredDates
    .filter(date => !existingKeys.has(dateKey(date)))
    .map(date => emptyDailyRecord(date))

  return [...normalized, ...added]
    .sort((a, b) => dateKey(b.date).localeCompare(dateKey(a.date)))
}

function daysFromYesterdayBackTo(records = [], today = new Date()) {
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  yesterday.setDate(yesterday.getDate() - 1)
  const recordDates = (records || [])
    .map(record => parseLocalDate(record.date))
    .filter(date => date <= yesterday)
  if (!recordDates.length) return DEVICE_INITIAL_IMPORT_DAYS
  const oldestMissingOrUnfetched = recordDates
    .filter((date, index) => {
      const record = dailyRecordForDate(records, date)
      return !record?.deviceHistoricalFetchedAt
    })
    .sort((a, b) => a - b)[0]
  if (!oldestMissingOrUnfetched) return 1
  const diff = Math.floor((yesterday - oldestMissingOrUnfetched) / 86400000) + 1
  return Math.max(1, diff)
}

const FOOD_ALIAS = {
  米饭: ['米饭', '白米饭', '大米', '香米','八宝饭','白米', '炒饭', '蛋炒饭', '八宝粥','腊八粥','血糯米','崇明糕','盖交饭', '糯米饭','糯米饼','糯米粥','糯米','米饼','寿司', '饭团', '粥',  '小米粥', '粽子', '年糕', '松糕','米糕','糍粑',  '皮蛋瘦肉粥',  '菜饭', '稀饭'],
  面食: ['面食', '面', '面条', '拉面', '牛肉拉面', '螺蛳粉', '肠粉','河粉','炒河粉','炒面','馒头', '包子', '肉包', '菜包', '馍馍', '小笼包','生煎','米线','饺子', '馄饨', '云吞','抄手','云吞面','小馄饨','意大利面','葱油饼','煎饼','意面', '披萨', '汉堡'],
  面包: ['面包', '吐司', '汉堡包', '切片', '菠萝包','肉松包', '白切面包', '三明治', '烤面包'],
  土豆: ['土豆', '马铃薯', '土豆泥','薯片','薯条'],
  薯类: ['红薯', '烤地瓜','山药','凉薯','芋艿','芋头','烤地瓜','地瓜'],
  其它主食: ['其它主食', '鸡蛋饼', '饼干', '韭菜盒子', '发糕','窝窝头',  '饼', '鸡蛋灌饼','汤饭','菜饭','皮带面','粉丝','宽粉','粉','鸭血粉丝','肉夹馍','手擀面','手撕饼'],
  蛋: ['鸡蛋', '蛋', '鸭蛋', '鹌鹑蛋', '蒸鸡蛋','炖蛋','鹌鹑蛋','煮鸡蛋', '水煮蛋', '煎蛋', '炒蛋', '番茄炒蛋', '番茄炒鸡蛋','辣椒炒鸡蛋','煎鸡蛋', '荷包蛋'],
  奶制品: ['牛奶', '奶', '鲜奶', '酸奶', '起司', '奶酪', '椰奶', '芝士', '乳酪', '奶昔'],
  豆制品: ['豆浆', '豆奶', '豆腐', '老豆腐', '冻豆腐', '豆腐皮', '豆腐丝', '嫩豆腐', '麻婆豆腐', '家常豆腐', '油豆腐', '豆皮' ],
  鸡鸭鹅: ['鸡鸭鹅', '鸡', '鸡肉', '炸鸡', '鸡汤','鸡胗','母鸡汤','鸡丝','鸡丁','宫保鸡丁','童子鸡','鸡公煲','鸡腿', '鸡翅', '鸡块', '鸡排', '鸡爪', '鸡胸脯', '油鸡', '鸡柳','熏鸡',  '烤鸡', '鸭', '烧鸭','烧鹅','鸭肉', '烤鸭'],
  牛羊肉: ['牛肉', '煎牛排', '牛排','牛腩','牛肉汤','羊肉汤','罗宋汤','牛骨汤','牛腿肉','牛柳','牛腱子','牛肉丝','牛肉丸','烤牛排','和牛','牛肚','百叶','羊排','烤羊排','羊','羊肉','涮羊肉','牛蹄筋','羊蝎子','肥羊'],
  猪肉: ['猪肉','蛋饺', '炒肉', '肉','炖肉','红烧肉','狮子头','红烧狮子头','酱肘子','炒肉丝','辣椒炒肉','青椒炒肉','肉片','猪柳', '蹄膀', '猪皮冻', '红烧排骨', '肉汤',  '排骨汤',  '骨头汤',  '蹄膀汤', '猪脚', '猪耳朵', '夫妻肺片', '猪肚', '大排', '小排', '唐排', '回锅肉', '肉丝','肉糜','炒肉','五花肉', '肉丸'],
  香肠: ['香肠', '火腿肠', '午餐肉', '腊肠'],
  鱼虾蟹贝: ['虾蟹', '虾',  '鱼','老虎虾', '基围虾', '香蕉虾', '蛤蜊', '田螺', '淡菜', '鱿鱼', '墨鱼', '小河虾','明虾', '斑节虾',  '琵琶虾', '桂鱼', '鲈鱼', '生蚝', '扇贝', '泥蟹', '青蟹', '蟹', '鱼', '草鱼', '黑鱼', '鳊鱼', '多宝鱼', '鸦片鱼', '大闸蟹', '海鲜', '鲫鱼', '三文鱼','黄鱼', '带鱼', '鳕鱼', '海鱼', '鲍鱼', '胖头鱼', '河鱼',  '活鱼','鱼片', '鱼丸', '水煮鱼', '烤鱼', '小龙虾',  '金枪鱼', '螃蟹', '龙虾'],
  其它蛋白: ['其它蛋白'],
  白菜: ['白菜', '黄牙菜','卷心菜','包心白菜','娃娃菜','大白菜'],
  绿叶菜: ['青菜', '小青菜', '油菜', '上海青', '油麦菜', '菠菜', '米苋', '空心菜', '茼蒿', '芥兰', '芥菜', '西洋菜', '香菜', '生菜', '木耳菜', '秋葵', '蒜苔'],
  花椰菜: ['西兰花', '花菜', '甘蓝', '有机花菜', '有机西兰花', '菜心', '菜花'],
  胡白萝卜: ['胡萝卜', '红萝卜', '萝卜', '萝卜丝', '白萝卜', '萝卜菜'],
  洋葱: ['洋葱'],
  芹菜: ['芹菜'],
  豆角豆荚: ['豆角', '扁豆', '荷兰豆', '四季豆', '毛豆', '长豆角', '刀豆', '豇豆', '蚕豆', '菜豆', '甜豆'],
  辣椒茄子: ['辣椒', '青椒', '红椒','尖椒','螺丝椒','番茄炒蛋','杭椒','灯笼椒','黄椒','菜椒','尖辣椒',,'辣椒炒肉','茄子','番茄','西红柿','柿子'],
  苹果: ['苹果', '嘎啦果', '嘎啦', '青苹果', '红富士', '火箭苹果', '黄焦'],
  橙橘柚: ['橙子', '橘子', '柚子', '葡萄柚', '手剥橙', '果粒橙', '沙糖桔', '甜橙', '脐橙', '桔子'],
  香蕉: ['香蕉'],
  葡萄: ['葡萄'],
  草莓: ['草莓', '蓝莓', '红莓', '桑葚', '覆盆子', '黑莓'],
  瓜类: ['西瓜', '黄瓜', '南瓜', '冬瓜', '苦瓜', '甜瓜','香瓜','丝瓜','葫芦瓜','菜瓜','伊丽莎白','早春红玉','哈密瓜'],
  桃李杏: ['桃子', '李子', '杏子', '布林', '桃', '李', '杏', '油奈', '毛桃', '黄桃', '白桃', '油桃', '蟠桃', '水蜜桃'],
  其它蔬菜: ['菜叶', '韭菜','蔬菜','笋','冬笋','莴笋','茭白','苦芥菜','香菜','包菜','手撕包菜','素菜'],
  其它水果: ['水果', '菠萝', '果汁','苹果汁','橙汁','鲜榨饮料','果粒橙','枇杷','神仙果','无花果','荔枝','牛油果', '车厘子', '热情果', '圣女果','山竹','樱桃','梨', '鸭梨', '杨梅', '香梨', '火龙果', '猕猴桃'],
  坚果: ['坚果', '核桃', '瓜子',  '花生',  '杏仁',  '火山果',  '巴达木', '榛子', '开心果',  '松仁',  '芝麻',  '南瓜子',  '西瓜子',  '小核桃', '腰果'],
  海带: ['海带','海苔','海参','海蜇','海蜇皮'],
  紫菜: ['紫菜'],
  菌类: ['菌类', '蘑菇', '香菇', '杏鲍菇', '鸡腿菇', '木耳', '野山菌', '牛肝菌', '银耳','草菇', '金针菇'],
  粗粮杂粮: ['其它杂粮', '燕麦', '小米', '黑豆', '红豆', '绿豆', '赤豆', '薏米', '莲子', '荞麦', '黑米', '云豆', '西米'],
  VC: ['VC', '维C'], VD: ['VD', '维D'], VE: ['VE', '维E'], 其它维生素: ['其它维生素'], 鱼油: ['鱼油'], 钙片: ['钙片'], 铁片: ['铁片'], 其它微量元素: ['其它微量元素'],
}

const FOOD_FUZZY_ALIASES = FOOD_ALIAS

const TASTE_FUZZY_ALIASES = {
  正常: ['正常口味', '寻常', '新鲜', '凉拌', '糖醋', '生吃'],
  清淡: ['淡', '清炒', '素', '少油', '少盐'],
  常规: ['正常', '普通', '家常'],
  普通: ['一般口味'],
  蒸: ['清蒸'],
  炒: ['清炒', '爆炒', '小炒'],
  煮: ['水煮'],
  炖: ['慢炖'],
  煎: ['煎'],
  炸: ['煎'],
  重油: ['油炸', '油淋', '红油', '油焖', '油爆'],
  烟熏: ['烟', '腊肠', '腊', '熏'],
  高糖: ['糖', '很甜', '甜食', '甜品'],
  重盐: ['咸', '腌制', '老干妈', '辣酱', '榨菜', '腌'],
  碳酸: ['可乐', '雪碧', '汽水'],
  辛辣: ['辣', '麻辣', '火锅'],
  烧烤: ['烤串', '烤肉', '麻辣烫'],
}

function limitTagsText(text, limit = Infinity) {
  return splitTags(text).slice(0, limit).join('、')
}

function fuzzyTagsFromOptions(text, options = [], aliasMap = {}) {
  const source = String(text || '').toLowerCase()
  if (!source.trim()) return []
  const found = []
  options.forEach(option => {
    const keys = [option, ...(aliasMap[option] || [])]
    if (keys.some(key => source.includes(String(key).toLowerCase()))) found.push(option)
  })
  return [...new Set(found)]
}

function tagsFromOptions(text, options = []) {
  return findWordsNoOverlap(text, options)
}

function foodAliasEntries() {
  return Object.entries(FOOD_ALIAS)
    .flatMap(([primary, aliases]) => [primary, ...(aliases || [])].map(alias => ({ primary, alias: String(alias || '').trim() })).filter(item => item.alias))
    .sort((a, b) => b.alias.length - a.alias.length)
}

function extractFoodAliases(text) {
  let remaining = String(text || '')
  if (!remaining.trim()) return []

  const found = []
  foodAliasEntries().forEach(({ alias }) => {
    if (remaining.toLowerCase().includes(alias.toLowerCase())) {
      found.push(alias)
      remaining = remaining.replaceAll(alias, ' ')
    }
  })

  return [...new Set(found)]
}

function foodPrimaryTagsForTag(tag) {
  const text = String(tag || '').trim()
  if (!text) return []

  // 日常表中的每个食物名只归入一个 FOOD_ALIAS 主组。
  // 必须使用完整名称精确匹配，不能再使用 text.includes(key)：
  // 例如“鸡蛋”同时包含“鸡”和“蛋”，旧逻辑会错误归入
  // “鸡鸭鹅”与“蛋”两个主组，导致“牛奶、鸡蛋”被误算成三组。
  for (const [primary, aliases] of Object.entries(FOOD_ALIAS)) {
    const keys = [primary, ...(aliases || [])]
      .map(item => String(item || '').trim())
      .filter(Boolean)

    if (keys.includes(text)) return [primary]
  }

  return DAILY_FOOD_OPTIONS.includes(text) ? [text] : []
}

function foodPrimaryTagsFromText(foodText) {
  return [...new Set(splitTags(foodText).flatMap(foodPrimaryTagsForTag))]
}

function classifyDailyFood(text) {
  return extractFoodAliases(text).join('、')
}

function classifyDailyTaste(text) {
  const tasteTags = fuzzyTagsFromOptions(text, TASTE_OPTIONS, TASTE_FUZZY_ALIASES)
  return uniqueJoin(tasteTags) || '正常'
}

function classifyDailyMood(text) {
  const source = String(text || '')
  const tags = MOOD_OPTIONS.filter(option => source.includes(option))
  return uniqueJoin(tags)
}

function deriveConversationFields(record = {}) {
  const foodDescription = String(record.foodDescription || '')
  const moodDescription = String(record.moodDescription || '')
  const interactionText = String(record.interactionText || '')

  return {
    food: classifyDailyFood(foodDescription),
    taste: classifyDailyTaste(foodDescription),
    mood: classifyDailyMood(moodDescription),
    brainPercent: conversationBrainPercent(record),
  }
}

function dailyFoodInfo(foodText, tasteText = '') {
  const foodTags = foodPrimaryTagsFromText(foodText)
  const normalTaste = splitTags(tasteText).filter(tag => HEALTHY_TASTE_OPTIONS.includes(tag)).length
  const heavyTaste = splitTags(tasteText).filter(tag => HEAVY_TASTE_OPTIONS.includes(tag)).length
  const hasFood = String(foodText || '').trim()
  const good = foodTags.length >= 3 && normalTaste >= heavyTaste
  return {
    good,
    label: good ? '雪白' : '暗淡',
    healthLabel: hasFood ? (good ? '合理' : '待改进') : '未记录',
    foodCount: foodTags.length,
    normalTaste,
    heavyTaste,
  }
}

function dailyMoodInfo(moodText) {
  const tags = splitTags(moodText)
  const positive = tags.filter(tag => POSITIVE_MOOD_OPTIONS.includes(tag)).length
  const negative = tags.filter(tag => NEGATIVE_MOOD_OPTIONS.includes(tag)).length
  const hasMood = String(moodText || '').trim()
  const good = !!hasMood && positive >= negative
  return {
    good,
    mood: good ? '好' : '不好',
    statusLabel: hasMood ? (good ? '正面' : '欠佳') : '未记录',
    eyes: good ? '圆亮' : '无神',
    positive,
    negative,
  }
}

function dailyRecordHealthy(record) {
  const steps = Number(record?.steps || record?.yesterdaySteps || 0)
  const offscreen = record?.offscreenTime || record?.yesterdaySleep || ''
  const foodStatus = dailyFoodInfo(record?.food || '', record?.taste || '')
  const moodStatus = dailyMoodInfo(record?.mood || '')
  return steps >= 5000 && sleepGood(offscreen) && foodStatus.good && moodStatus.good
}

function dailyValueClass(ok) {
  return ok ? 'dailyValuePositive' : ''
}

function renderDailyTagList(text, isPositiveTag, emptyText = '—') {
  const tags = splitTags(text)
  if (!tags.length) return <span>{emptyText}</span>
  return (
    <span className="dailyTagList" title={String(text || '')}>
      {tags.map((tag, index) => (
        <span key={`${tag}-${index}`} className={isPositiveTag(tag) ? 'dailyTagPositive' : ''}>{tag}</span>
      ))}
    </span>
  )
}

function rewardDateFromSeenKey(value) {
  const source = String(value || '').trim()

  // 新版直接保存奖励日：2026-07-23。
  if (/^\d{4}-\d{2}-\d{2}$/.test(source)) return source

  // 兼容旧版由7条记录拼成的 rewardSeenKey：
  // 第一段就是当时最近一天，也就是上次奖励日。
  const firstPart = source.split('|')[0] || ''
  const storedDate = firstPart.split('~')[0] || ''
  return /^\d{4}-\d{2}-\d{2}$/.test(storedDate) ? storedDate : ''
}

function nextDateKey(value) {
  if (!value) return ''
  const date = parseLocalDate(value)
  date.setDate(date.getDate() + 1)
  return dateKey(date)
}

function dailyRewardWindow(records = [], {
  rewardSeenKey = '',
  installDate = '',
} = {}) {
  const todayKey = dateKey(todayText())
  const installedKey = dateKey(installDate || todayText())
  const previousRewardKey = rewardDateFromSeenKey(rewardSeenKey)

  // 初次奖励从安装日起检查；
  // 后续奖励只使用上次奖励日之后的新日期，避免连续优秀时每天弹窗。
  const searchStartKey = previousRewardKey
    ? nextDateKey(previousRewardKey)
    : installedKey

  const recordsByDate = new Map(
    (records || [])
      .map(normalizeDailyRecord)
      .filter(record => {
        const key = dateKey(record?.date)
        return key && key >= searchStartKey && key <= todayKey
      })
      .map(record => [dateKey(record.date), record])
  )

  let streak = []
  let latestRewardRecords = []

  // 按日历逐日检查。缺失一天或任一指标不达标，连续天数立即归零。
  const cursor = parseLocalDate(searchStartKey)
  const today = parseLocalDate(todayKey)

  while (cursor <= today) {
    const key = dateKey(cursor)
    const record = recordsByDate.get(key)

    if (record && dailyRecordHealthy(record)) {
      streak.push(record)

      if (streak.length >= 7) {
        // 如果上次奖励后已有超过7天连续优秀，只弹一次，
        // 并把奖励日推进到距离现在最近的一段7天的最后一天。
        latestRewardRecords = streak.slice(-7)
      }
    } else {
      streak = []
    }

    cursor.setDate(cursor.getDate() + 1)
  }

  const healthy = latestRewardRecords.length === 7
  const rewardDate = healthy
    ? dateKey(latestRewardRecords[latestRewardRecords.length - 1]?.date)
    : ''

  return {
    healthy,
    key: rewardDate,
    rewardDate,
    records: latestRewardRecords,
  }
}

function appendOrUpdateTodayRecord(prev, patch) {
  const today = formatDateForDaily(todayText())
  const current = dailyRecordForDate(prev.records || [], today) || emptyDailyRecord(today)
  const merged = { ...current, ...patch, id: current.id || dailyRecordIdFor(today), date: today }
  merged.healthy = dailyRecordHealthy(merged)
  return {
    ...prev,
    records: mergeDailyRecord(prev.records || [], today, merged),
    lastSavedAt: Date.now(),
  }
}

function brainGainFromText(text) {
  return brainInfo([{ from: 'user', text: String(text || '') }]).score
}

function toggleTagText(current, tag, limit = Infinity) {
  const parts = splitTags(current)
  const exists = parts.includes(tag)
  const next = exists ? parts.filter(item => item !== tag) : [...parts, tag].slice(0, limit)
  return next.join('、')
}

function daysBetweenDate(value, base = new Date()) {
  const d = parseLocalDate(value)
  const today = new Date(base.getFullYear(), base.getMonth(), base.getDate())
  return Math.round((today - d) / (1000 * 60 * 60 * 24))
}

function filterDailyRange(items = [], range = 'today') {
  return (items || []).filter(item => {
    const diff = daysBetweenDate(item.date)
    if (range === 'today') return diff === 0
    if (range === 'yesterday') return diff === 1
    if (range === 'week') return diff >= 0 && diff < 7
    if (range === 'month') return diff >= 0 && diff < 30
    if (range === 'year') return diff >= 0 && diff < 365
    return true
  })
}

function rangeAverageDivisor(records = [], range = 'today') {
  if (range === 'today' || range === 'yesterday') return 1
  return Math.max(1, records.length || (range === 'week' ? 7 : range === 'month' ? 30 : 365))
}

function tasteStatsFromRecords(records = [], range = 'today') {
  const scoped = filterDailyRange(records, range)
  let healthy = 0
  let heavy = 0

  scoped.forEach(record => {
    splitTags(record?.taste || record?.foodTaste).forEach(tag => {
      if (HEALTHY_TASTE_OPTIONS.includes(tag)) healthy += 1
      if (HEAVY_TASTE_OPTIONS.includes(tag)) heavy += 1
    })
  })

  const total = healthy + heavy
  const healthyRatio = total ? healthy / total : 0
  const heavyRatio = total ? heavy / total : 0

  return {
    healthy,
    heavy,
    total,
    healthyRatio,
    heavyRatio,
    rainbowVisible: total > 0 && healthy > 0,
    rainbowPercent: Math.round(healthyRatio * 100),
    display: total ? `${Math.round(heavyRatio * 100)}%口味偏重` : '口味未记录',
  }
}

function nutritionStatsFromRecords(records = [], range = 'today') {
  const scoped = filterDailyRange(records, range)
  const divisor = rangeAverageDivisor(scoped, range)

  return Object.entries(NUTRITION_TYPES).map(([key, label]) => {
    const foodCounts = {}
    const total = scoped.reduce((sum, record) => {
      const foods = splitTags(record.food || record.foodKeyword || record.foodText || '')

      return sum + foods.reduce((count, food) => {
        const primaryTags = foodPrimaryTagsForTag(food)
        const matched = primaryTags.some(primary => (FOOD_NUTRITION_MAP[primary] || []).includes(key))
        if (matched) foodCounts[food] = (foodCounts[food] || 0) + 1
        return count + (matched ? 1 : 0)
      }, 0)
    }, 0)

    const value = range === 'today' || range === 'yesterday' ? total : total / divisor
    let level = 'empty'
    if (value >= 2) level = 'filled'
    else if (value >= 1) level = 'dim'

    const topFoods = Object.entries(foodCounts)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-CN'))
      .slice(0, 3)
      .map(([name]) => name)
      .join('、')

    return {
      key,
      label,
      value,
      level,
      display: range === 'today' || range === 'yesterday' ? `${Math.round(value)}种` : `${value.toFixed(1)}种/天`,
      topFoods: topFoods || '空缺，建议补充',
      score: Math.min(100, Math.round(value * 34)),
    }
  })
}

function nutritionMotionReady(stats = [], tasteStats = {}) {
  const carb = stats.find(item => item.key === 'carbs')?.value || 0
  const othersOk = stats
    .filter(item => item.key !== 'carbs')
    .every(item => Number(item.value || 0) >= 2)

  return carb < 1.5 && othersOk && Number(tasteStats?.total || 0) > 0 && Number(tasteStats?.heavy || 0) === 0
}

function nutritionTasteSentence(tasteStats = {}) {
  const total = Number(tasteStats.total || 0)
  const heavyPct = Math.round(Number(tasteStats.heavyRatio || 0) * 100)

  if (!total) return '还没有记录口味，彩虹暂时不会出现。'
  if (heavyPct === 0) return '你的饮食口味正常，彩虹长度不受影响。'
  if (heavyPct >= 100) return '！你的饮食口味过重，彩虹无法显示。'
  return `！你的饮食口味偏重，彩虹长度不完整。`
}

const SCREEN_SAMPLE_APPS = ['微信', '知乎', '豆包', '淘宝', 'B站', '高德地图', '小红书', 'DeepSeek']

function screenCategoryForApp(appName) {
  const name = String(appName || '').trim()
  const match = Object.entries(APP_CATEGORY_MAP).find(([key, config]) => key !== 'other' && config.apps.includes(name))
  return match?.[0] || 'other'
}

function screenMinutesFromRecord(item = {}) {
  // 原生插件的 minutes 字段始终以“分钟”为单位。
  // 旧版 time / duration 仍沿用通用解析，兼容“1.5小时”“90分钟”等历史数据。
  if (typeof item?.minutes === 'number' && Number.isFinite(item.minutes)) {
    return Math.max(0, Math.round(item.minutes))
  }
  if (item?.minutes !== undefined && item?.minutes !== null && item?.minutes !== '') {
    const numeric = Number(item.minutes)
    if (Number.isFinite(numeric)) return Math.max(0, Math.round(numeric))
  }
  return minutesFromValue(item?.time ?? item?.duration) || 0
}

function normalizeScreenRecord(item = {}, index = 0) {
  // 兼容旧记录：旧版只有 app；新版把 app 继续作为“雪粒 APP 名”。
  const realAppName = String(item.realAppName ?? item.rawAppName ?? item.systemAppName ?? item.appName ?? '').trim()
  const existingSnowballName = String(item.app ?? item.canonicalApp ?? item.snowballAppName ?? '').trim()
  const matchedSnowballName = snowballAppNameFor(realAppName || existingSnowballName)
  const app = APP_OPTIONS.includes(existingSnowballName)
    ? existingSnowballName
    : matchedSnowballName

  return {
    ...item,
    id: item.id || `screen-${index}`,
    date: item.date || todayText(),
    app,
    realAppName: realAppName || existingSnowballName,
    packageName: String(item.packageName ?? item.package ?? item.bundleId ?? '').trim(),
    mapped: Boolean(app),
    minutes: screenMinutesFromRecord(item),
    pickups: Number(item.pickups ?? item.pickUp ?? item.opens ?? 0) || 0,
  }
}

function buildScreenEntries(screenRecords = [], dailyRecords = []) {
  if (!Array.isArray(screenRecords)) return []
  return screenRecords.map(normalizeScreenRecord)
}

function appStatsFromEntries(entries = [], range = 'today', dailyRecords = []) {
  const scoped = filterDailyRange(entries, range)
  const dateCount = new Set(scoped.map(item => dateKey(item.date))).size
  const divisor = (range === 'today' || range === 'yesterday') ? 1 : Math.max(1, dateCount || (range === 'week' ? 7 : range === 'month' ? 30 : 365))
  const base = Object.fromEntries(Object.keys(APP_CATEGORY_MAP).map(key => [key, { key, label: APP_CATEGORY_MAP[key].label, minutes: 0, pickups: 0, apps: new Map() }]))

  scoped.forEach(entry => {
    const app = String(entry.app || '').trim()
    if (!app) return
    const key = screenCategoryForApp(app)
    if (key === 'other') return
    const bucket = base[key]
    bucket.minutes += Number(entry.minutes || 0)
    bucket.pickups += Number(entry.pickups || 0)
    bucket.apps.set(app, (bucket.apps.get(app) || 0) + Number(entry.minutes || 0))
  })

  const scopedDaily = filterDailyRange(dailyRecords, range)
  const dailyTotal = scopedDaily.reduce((sum, record) => sum + recordScreenMinutes(record), 0)
  const detailTotal = Object.values(base).reduce((sum, item) => sum + item.minutes, 0)
  base.other.minutes += Math.max(0, dailyTotal - detailTotal)

  return Object.values(base).map(item => {
    const minutes = (range === 'today' || range === 'yesterday') ? item.minutes : item.minutes / divisor
    const pickups = (range === 'today' || range === 'yesterday') ? item.pickups : item.pickups / divisor
    const topApps = [...item.apps.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([app]) => app).join('、') || '—'
    return {
      ...item,
      minutes,
      pickups,
      topApps,
      timeText: formatDurationFromMinutes(minutes),
      pickupText: `${Math.round(pickups)}次`,
    }
  })
}

function appTop10FromEntries(entries = [], range = 'today', dailyRecords = []) {
  const scoped = filterDailyRange(entries, range)
  const dateCount = new Set(scoped.map(item => dateKey(item.date))).size
  const divisor = (range === 'today' || range === 'yesterday') ? 1 : Math.max(1, dateCount || (range === 'week' ? 7 : range === 'month' ? 30 : 365))
  const appMap = new Map()

  scoped.forEach(entry => {
    const app = String(entry.app || '').trim()
    if (!app) return
    const old = appMap.get(app) || { app, minutes: 0, pickups: 0 }
    old.minutes += Number(entry.minutes || 0)
    old.pickups += Number(entry.pickups || 0)
    appMap.set(app, old)
  })

  const rawTop = [...appMap.values()]
    .sort((a, b) => (b.minutes - a.minutes) || (b.pickups - a.pickups))
    .slice(0, 10)

  const scopedDaily = filterDailyRange(dailyRecords, range)
  const dailyTotal = scopedDaily.reduce((sum, record) => sum + recordScreenMinutes(record), 0)
  const listedTotal = rawTop.reduce((sum, item) => sum + Number(item.minutes || 0), 0)
  const otherMinutes = Math.max(0, dailyTotal - listedTotal)
  const rows = otherMinutes > 0 ? [...rawTop, { app: '其它', minutes: otherMinutes, pickups: 0 }] : rawTop

  return rows.map(item => {
    const minutes = item.minutes / divisor
    const pickups = item.pickups / divisor
    return {
      ...item,
      minutes,
      pickups,
      hoursText: `${(minutes / 60).toFixed(1)} h`,
      pickupText: item.app === '其它' ? '—' : `${Math.round(pickups)}次`,
    }
  })
}





function ChromaKeyVideo({ className = '', style = {}, ariaLabel = '雪粒动画' }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)

  useEffect(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return undefined

    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    let raf = 0
    let stopped = false

    // 稍微放慢视频本身，让小猫像散步。
    video.playbackRate = 0.8

    function draw() {
      if (stopped) return

      const vw = video.videoWidth || 960
      const vh = video.videoHeight || 540

      if (canvas.width !== vw) canvas.width = vw
      if (canvas.height !== vh) canvas.height = vh

      if (video.readyState >= 2 && vw && vh) {
        ctx.clearRect(0, 0, vw, vh)

        // 只裁掉视频最外圈 1 像素，用来消除细黑边；
        // 不再做过度腐蚀，尽量保留第一版干净的白毛边缘。
        const crop = 1
        ctx.drawImage(
          video,
          crop,
          crop,
          Math.max(1, vw - crop * 2),
          Math.max(1, vh - crop * 2),
          0,
          0,
          vw,
          vh
        )

        try {
          const frame = ctx.getImageData(0, 0, vw, vh)
          const pixels = frame.data

          for (let i = 0; i < pixels.length; i += 4) {
            const r = pixels[i]
            const g = pixels[i + 1]
            const b = pixels[i + 2]
            const maxRB = Math.max(r, b)
            const greenDominance = g - maxRB
            const brightness = (r + g + b) / 3

            // 绿幕不是纯绿，所以用“绿色优势”而不是固定色值。
            // 小猫会缩到页面高度约 10%，轻微毛边基本不可见。
            const strongGreen = g > 82 && greenDominance > 24
            const softGreen = g > 70 && greenDominance > 10 && brightness < 205

            if (strongGreen) {
              pixels[i + 3] = 0
            } else if (softGreen) {
              const keep = Math.max(0, Math.min(255, Math.round((greenDominance - 10) * 11)))
              pixels[i + 3] = Math.max(0, 255 - keep)
            }

            // 轻微去绿边，避免白毛边缘泛绿。
            if (pixels[i + 3] > 0 && g > r && g > b) {
              pixels[i + 1] = Math.round((r + b) / 2)
            }
          }

          ctx.putImageData(frame, 0, 0)
        } catch (error) {
          console.warn('足迹绿幕动画暂时无法处理这一帧：', error)
        }
      }

      raf = requestAnimationFrame(draw)
    }

    function start() {
      video.playbackRate = 0.8
      video.play().catch(() => {})
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(draw)
    }

    video.addEventListener('loadeddata', start)
    video.addEventListener('canplay', start)
    video.addEventListener('play', start)
    video.addEventListener('error', () => {
      console.warn('没有读到足迹绿幕视频：/motion/footprint_cat.mp4')
    })

    start()

    return () => {
      stopped = true
      cancelAnimationFrame(raf)
      video.removeEventListener('loadeddata', start)
      video.removeEventListener('canplay', start)
      video.removeEventListener('play', start)
    }
  }, [])

  return (
    <>
      <video
        ref={videoRef}
        src="/motion/footprint_cat.mp4"
        muted
        autoPlay
        loop
        playsInline
        preload="auto"
        style={{ display: 'none' }}
      />
      <canvas
        ref={canvasRef}
        className={`snowballFootprintCanvas ${className}`}
        style={style}
        aria-label={ariaLabel}
        role="img"
      />
    </>
  )
}

const MAX_MOTION_FRAMES = MOTION.maxFrames

function motionFramePath(prefix, index) {
  return `${prefix}${String(index).padStart(2, '0')}.png`
}

function loadMotionFrames(prefix, maxFrames = MAX_MOTION_FRAMES) {
  return new Promise(resolve => {
    const found = []
    let index = 1

    function tryNext() {
      if (index > maxFrames) {
        resolve(found)
        return
      }

      const src = motionFramePath(prefix, index)
      const img = new Image()
      img.onload = () => {
        found.push(src)
        index += 1
        tryNext()
      }
      img.onerror = () => {
        resolve(found)
      }
      img.src = src
    }

    tryNext()
  })
}

function PngSequence({
  prefix,
  maxFrames = MAX_MOTION_FRAMES,
  frameMs = MOTION.frameMs.call,
  className = '',
  style = {},
  fallback = '',
  fallbackStyle = {},
  crossfade = false,
  ariaLabel = '雪粒动图',
}) {
  const [frames, setFrames] = useState([])
  const [frameIndex, setFrameIndex] = useState(0)

  useEffect(() => {
    let cancelled = false
    setFrames([])
    setFrameIndex(0)

    loadMotionFrames(prefix, maxFrames).then(list => {
      if (!cancelled) setFrames(list)
    })

    return () => {
      cancelled = true
    }
  }, [prefix, maxFrames])

  useEffect(() => {
    if (frames.length <= 1) return undefined

    const timer = window.setInterval(() => {
      setFrameIndex(current => (current + 1) % frames.length)
    }, frameMs)

    return () => window.clearInterval(timer)
  }, [frames.length, frameMs])

  const src = frames[frameIndex] || motionFramePath(prefix, 1)

  if (crossfade && fallback) {
    const ready = frames.length > 0

    return (
      <span
        className="pngSequenceCrossfade"
        style={{ position: 'relative', display: 'block', width: '100%' }}
        aria-label={ariaLabel}
      >
        <img
          className={`pngSequenceCat ${className}`}
          src={fallback}
          style={{
            ...fallbackStyle,
            display: 'block',
            width: '100%',
            height: 'auto',
            opacity: ready ? 0 : 1,
            transition: 'opacity 90ms linear',
          }}
          alt={ariaLabel}
          draggable="false"
        />
        {ready && (
          <img
            className={`pngSequenceCat ${className}`}
            src={src}
            style={{
              ...style,
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              top: 'auto',
              width: '100%',
              height: 'auto',
              opacity: 1,
              transition: 'opacity 90ms linear',
            }}
            alt={ariaLabel}
            draggable="false"
          />
        )}
      </span>
    )
  }

  return (
    <img
      className={`pngSequenceCat ${className}`}
      src={frames[frameIndex] || fallback || motionFramePath(prefix, 1)}
      style={style}
      alt={ariaLabel}
      aria-label={ariaLabel}
      draggable="false"
    />
  )
}





function StatusWord({ type = 'good', children }) {
  return <span className={`todayStatusWord todayStatusWord-${type}`}>{children}</span>
}

function TodayStatusModal({ report, onClose }) {
  if (!report) return null
  return (
    <div className="todayStatusOverlay" role="dialog" aria-modal="true" aria-label="查看今日状态">
      <div className="todayStatusPaper">
        <button type="button" className="todayStatusBack" onClick={onClose} aria-label="返回主页">&lt;</button>
        <h2>查看今日状态</h2>
        <div className="todayStatusSections">
          {(report.sections || []).map(section => (
            <div className="todayStatusSection" key={section.key}>
              <h3>{section.title}</h3>
              <p>{section.text}</p>
            </div>
          ))}
          <div className="todayStatusSection todayStatusSummary">
            <h3>总结</h3>
            <p>{report.summaryLine}</p>
            <p>{report.companionLine}</p>
          </div>
        </div>
      </div>
    </div>
  )
}



function nativePayloadDays(payload = {}) {
  return Array.isArray(payload?.days) ? payload.days : []
}

function mergeNativeDailyDays(prev, payload = {}, { force = false, liveToday = false, refreshDates = [] } = {}) {
  const days = nativePayloadDays(payload)
  if (!days.length) return prev

  const platform = Capacitor.getPlatform()
  const refreshDateKeys = new Set((refreshDates || []).map(item => dateKey(formatDateForDaily(item))))
  const stepAutoRecords = ingestStepPayload(prev.stepAutoRecords || [], payload, {
    platform,
    liveToday,
    capturedAt: Date.now(),
  })

  let records = ensureDailyDateSkeleton(prev.records || [])
  days.forEach(day => {
    const dayDate = formatDateForDaily(day?.date || todayText())
    const existing = dailyRecordForDate(records, dayDate) || emptyDailyRecord(dayDate)
    const isToday = dateKey(dayDate) === dateKey(todayText())
    const patch = {
      deviceSyncedAt: Date.now(),
      deviceSource: platform,
      autoSource: 'device',
      ...(isToday ? { deviceTodayFetchedAt: Date.now() } : { deviceHistoricalFetchedAt: Date.now() }),
    }

    const shouldRefreshDate = refreshDateKeys.has(dateKey(dayDate))
    const mayWriteSteps = force || (
      !existing.stepsManual &&
      (isToday || shouldRefreshDate || !existing.stepsAutoImportedAt)
    )
    const mayWriteScreen = force || (
      !existing.screenManual &&
      (isToday || shouldRefreshDate || !existing.screenAutoFetchedAt)
    )
    const mayWriteOffscreen = force || (
      !existing.offscreenManual &&
      (isToday || shouldRefreshDate || !existing.offscreenAutoFetchedAt)
    )
    const resolvedSteps = stepValueForDate(stepAutoRecords, dayDate)

    if (mayWriteSteps && resolvedSteps !== null) {
      patch.steps = resolvedSteps
      patch.stepsAutoFetchedAt = Date.now()
      patch.stepsAutoImportedAt = Date.now()
    }
    if (platform === 'android') {
      if (mayWriteScreen && Number.isFinite(Number(day?.screenMinutes))) {
        patch.screenMinutes = Math.max(0, Math.round(Number(day.screenMinutes)))
        patch.screenAutoFetchedAt = Date.now()
      }
      if (mayWriteOffscreen && String(day?.offscreenTime || '').trim()) {
        patch.offscreenTime = formatClockForDaily(day.offscreenTime)
        patch.yesterdaySleep = formatClockForDaily(day.offscreenTime)
        patch.offscreenAutoFetchedAt = Date.now()
      } else if (force && mayWriteOffscreen) {
        patch.offscreenTime = ''
        patch.yesterdaySleep = ''
      }
    }

    records = mergeDailyRecord(records, dayDate, patch)
  })

  // 累计 Catch Up 可能生成不在本次 payload 中的昨日/漏登日结果。
  stepAutoRecords.forEach(stepRow => {
    const dayDate = formatDateForDaily(stepRow.date)
    const isToday = dateKey(dayDate) === dateKey(todayText())
    const shouldRefreshDate = refreshDateKeys.has(dateKey(dayDate))
    const existing = dailyRecordForDate(records, dayDate) || emptyDailyRecord(dayDate)

    // 手动“重新获取”只允许覆盖用户点选的日期。
    // 不能因为 force=true 而把步数自动表里的全部历史日期重新灌回日常表。
    if (force && refreshDateKeys.size > 0 && !shouldRefreshDate) return
    if (!force && existing.stepsManual) return
    if (!force && !isToday && !shouldRefreshDate && existing.stepsAutoImportedAt) return
    const resolvedSteps = stepValueForDate(stepAutoRecords, dayDate)
    if (resolvedSteps === null) return
    records = mergeDailyRecord(records, dayDate, {
      steps: resolvedSteps,
      stepsAutoFetchedAt: Date.now(),
      stepsAutoImportedAt: Date.now(),
      stepAutoSource: stepRow.calculatedSource || '',
      deviceHistoricalFetchedAt: existing.deviceHistoricalFetchedAt || Date.now(),
    })
  })

  const yesterday = yesterdayText()
  const yesterdayRecord = dailyRecordForDate(records, yesterday)
  return {
    ...prev,
    stepAutoRecords,
    records: records.sort((a, b) => dateKey(b.date).localeCompare(dateKey(a.date))),
    yesterdaySteps: yesterdayRecord ? Number(yesterdayRecord.steps || 0) : prev.yesterdaySteps,
    yesterdaySleepTime: yesterdayRecord?.offscreenTime || yesterdayRecord?.yesterdaySleep || prev.yesterdaySleepTime,
    lastDeviceSyncAt: Date.now(),
    lastDeviceSyncPlatform: platform,
    lastSavedAt: Date.now(),
  }
}

function mergeNativeScreenDays(prev, payload = {}, { force = false, liveToday = false, refreshDates = [] } = {}) {
  const days = nativePayloadDays(payload)
  if (!days.length) return prev

  const refreshDateKeys = new Set((refreshDates || []).map(item => dateKey(formatDateForDaily(item))))
  let screenRecords = [...(prev.screenRecords || [])]
  days.forEach(day => {
    const dayDate = formatDateForDaily(day?.date || todayText())
    const dayKey = dateKey(dayDate)
    const isToday = dayKey === dateKey(todayText())
    const exists = screenRecords.some(item => dateKey(item?.date) === dayKey)
    const shouldReplace = force || (liveToday && isToday) || refreshDateKeys.has(dayKey)
    if (exists && !shouldReplace) return

    if (shouldReplace) screenRecords = screenRecords.filter(item => dateKey(item?.date) !== dayKey)
    const nativeApps = Array.isArray(day?.apps) ? day.apps : []
    nativeApps.forEach((appItem, index) => {
      const realAppName = String(appItem?.realAppName || appItem?.appName || '').trim()
      const app = snowballAppNameFor(realAppName)
      screenRecords.push(normalizeScreenRecord({
        id: `device-${dayKey}-${String(appItem?.packageName || index)}`,
        date: dayDate,
        app,
        realAppName,
        packageName: String(appItem?.packageName || '').trim(),
        mapped: Boolean(app),
        minutes: Math.max(0, Math.round(Number(appItem?.minutes || 0))),
        pickups: Math.max(0, Math.round(Number(appItem?.pickups || 0))),
        autoSource: 'device',
        deviceSyncedAt: Date.now(),
      }))
    })
  })

  return {
    ...prev,
    screenRecords,
    lastDeviceSyncAt: Date.now(),
    lastDeviceSyncPlatform: Capacitor.getPlatform(),
    lastSavedAt: Date.now(),
  }
}

function App() {
  useEffect(() => {
    // 让 iOS WebView 内容延伸至刘海和 Home Indicator 安全区，
    // 并把系统可见底色统一为雪球炭黑色。
    let viewport = document.querySelector('meta[name="viewport"]')
    if (!viewport) {
      viewport = document.createElement('meta')
      viewport.setAttribute('name', 'viewport')
      document.head.appendChild(viewport)
    }

    const currentViewport = viewport.getAttribute('content') || ''
    const viewportParts = currentViewport
      .split(',')
      .map(item => item.trim())
      .filter(Boolean)
      .filter(item => !item.startsWith('viewport-fit='))

    const requiredViewportParts = [
      'width=device-width',
      'initial-scale=1',
      'maximum-scale=1',
      'viewport-fit=cover',
    ]

    const mergedViewport = [
      ...viewportParts.filter(item =>
        !requiredViewportParts.some(required => item.split('=')[0] === required.split('=')[0])
      ),
      ...requiredViewportParts,
    ]

    viewport.setAttribute('content', mergedViewport.join(', '))

    let themeColor = document.querySelector('meta[name="theme-color"]')
    if (!themeColor) {
      themeColor = document.createElement('meta')
      themeColor.setAttribute('name', 'theme-color')
      document.head.appendChild(themeColor)
    }
    themeColor.setAttribute('content', '#11161b')

    document.documentElement.style.backgroundColor = '#11161b'
    document.body.style.backgroundColor = '#11161b'
  }, [])

  const [data, setData] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      return saved ? normalizeStoredData(JSON.parse(saved)) : normalizeStoredData(DEFAULT)
    } catch (error) {
      console.warn('雪粒读取本机数据失败，已使用默认数据。', error)
      return normalizeStoredData(DEFAULT)
    }
  })

  const [customYearsBgImage, setCustomYearsBgImage] = useState(() => String(data.customYearsSceneImage || ''))
  const [showDataPanel, setShowDataPanel] = useState(false)
  const [installDateUnlocked, setInstallDateUnlocked] = useState(false)

  function unlockInstallDate(event) {
    if (installDateUnlocked) return true
    event?.preventDefault?.()
    event?.stopPropagation?.()
    event?.currentTarget?.blur?.()

    const password = window.prompt('请输入测试密码')
    if (password === TEST_PASSWORD) {
      setInstallDateUnlocked(true)
      window.setTimeout(() => event?.currentTarget?.focus?.(), 0)
      return true
    }

    if (password !== null) window.alert('密码不正确')
    return false
  }
  const [dailyMode, setDailyMode] = useState('home')
  const [dailyViewTab, setDailyViewTab] = useState('all')
  const [expandedDailyMonths, setExpandedDailyMonths] = useState({})
  const [dailyStatRange, setDailyStatRange] = useState('today')
  const [trainRunKey, setTrainRunKey] = useState(0)
  const [trainIsRunning, setTrainIsRunning] = useState(false)
  const [showYearsPanel, setShowYearsPanel] = useState(false)
  const [yearsMode, setYearsMode] = useState('home')
  const [showThingsPanel, setShowThingsPanel] = useState(false)
  const [thingsStartMode, setThingsStartMode] = useState('overview')
  const [showPeoplePanel, setShowPeoplePanel] = useState(false)
  const [footprintView, setFootprintView] = useState('world')
  const [selectedFootprintId, setSelectedFootprintId] = useState(null)
  const [editingFootprintId, setEditingFootprintId] = useState(null)
  const [pendingFootprintDelete, setPendingFootprintDelete] = useState(null)
  const [footprintModal, setFootprintModal] = useState(null)
  const [footprintImagePreview, setFootprintImagePreview] = useState(null)
  const [footprintHomePrompt, setFootprintHomePrompt] = useState(null)
  const [pendingHomePosition, setPendingHomePosition] = useState(null)
  const [showReward, setShowReward] = useState(false)
  const [homeInteractionFrame, setHomeInteractionFrame] = useState('')
  const [homeInteractionPlaying, setHomeInteractionPlaying] = useState(false)
  const homeInteractionAudioRef = useRef(null)
  const homeInteractionRunRef = useRef(0)
  const [rewardFrame, setRewardFrame] = useState(1)
  const [dailyModal, setDailyModal] = useState(null)
  const [nutritionMotionNoticeKey, setNutritionMotionNoticeKey] = useState('')
  const [dailyDateModal, setDailyDateModal] = useState(null)
  const [usageModal, setUsageModal] = useState(false)
  const [versionTapCount, setVersionTapCount] = useState(0)
  const versionTapTimerRef = useRef(null)
  const screenOpenTimerRef = useRef(null)
  const [todayStatusModal, setTodayStatusModal] = useState(false)
  const [pendingDailyEdit, setPendingDailyEdit] = useState(null)
  const [conversationEditDraft, setConversationEditDraft] = useState(() => emptyConversationRecord(todayText()))
  const [dailyEditReason, setDailyEditReason] = useState(DAILY_EDIT_REASONS[0])
  const [dailyEditReturnMode, setDailyEditReturnMode] = useState('home')
  const [pendingDailyDelete, setPendingDailyDelete] = useState(null)
  const [selectedScreenDate, setSelectedScreenDate] = useState(todayText())
  const [screenReturnMode, setScreenReturnMode] = useState('home')
  const [upgradeModal, setUpgradeModal] = useState(null)
  const lastUpgradePromptKeyRef = useRef('')
  const rewardTimerRef = useRef(null)
  const call = useSnowballCall({
    data,
    setData,
    setDailyModal,
    appendOrUpdateTodayRecord,
    deriveConversationFields,
    dailyMoodInfo,
    dailyFoodInfo,
    dailyRecordForDate,
    todayText,
    emptyDailyRecord,
    maybeRewardAfterRecord,
  })


  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(dataForLocalStorage(data)))
    } catch (error) {
      console.warn('雪粒没有成功保存到本机存储。', error)
    }
  }, [data])


  useEffect(() => {
    if (!showDataPanel || dailyMode !== 'edit') return undefined

    const resetDailyEditScroll = () => {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
      document.documentElement.scrollTop = 0
      document.body.scrollTop = 0

      const overlay = document.querySelector('.dataOverlay.dailyDataOverlay')
      const panel = document.querySelector('.dailyEditOnlyPage')
      const editor = document.querySelector('.dailyStructuredEdit')

      if (overlay) overlay.scrollTop = 0
      if (panel) panel.scrollTop = 0
      if (editor) editor.scrollTop = 0
    }

    resetDailyEditScroll()
    const frame = window.requestAnimationFrame(resetDailyEditScroll)
    const timer = window.setTimeout(resetDailyEditScroll, 80)

    return () => {
      window.cancelAnimationFrame(frame)
      window.clearTimeout(timer)
    }
  }, [showDataPanel, dailyMode, data.editingDailyRecordId, data.editingDailyRecordDateKey])


  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined

    let alive = true
    let syncing = false
    let lastRunAt = 0

    async function ensureNativePermissions() {
      let status = await DeviceData.getStatus()
      if (Capacitor.getPlatform() === 'android') {
        if (status?.stepCounterAvailable && !status?.activityRecognitionPermissionGranted) {
          try {
            await DeviceData.requestActivityRecognitionPermission()
          } catch (error) {
            console.warn('系统累计步数权限未完成。', error)
          }
        }
        if (status?.healthAvailable && !status?.healthPermissionGranted) {
          try { await DeviceData.requestHealthPermissions() } catch (error) { console.warn('Health Connect 授权未完成。', error) }
        }
        status = await DeviceData.getStatus()
        if (!status?.usageAccessGranted && !localStorage.getItem(DEVICE_USAGE_PROMPT_KEY)) {
          localStorage.setItem(DEVICE_USAGE_PROMPT_KEY, '1')
          const accepted = window.confirm('雪粒需要“使用情况访问权限”才能自动获取屏幕时间。现在前往系统设置授权吗？注：授权后数据将存在单机，仅本人可见。')
          if (accepted) {
            await DeviceData.openUsageAccessSettings()
            throw new Error('完成“使用情况访问权限”后，请返回或重新打开雪粒。')
          }
        }
      } else if (Capacitor.getPlatform() === 'ios' && !status?.healthPermissionGranted) {
        try { await DeviceData.requestHealthPermissions() } catch (error) { console.warn('HealthKit 授权未完成。', error) }
      }
      return DeviceData.getStatus()
    }

    function currentStoredData() {
      try {
        const saved = localStorage.getItem(STORAGE_KEY)
        return saved ? normalizeStoredData(JSON.parse(saved)) : data
      } catch (_) {
        return data
      }
    }

    function missingHistoricalDates(records = [], startDate, endDate) {
      const existingKeys = new Set((records || []).map(record => dateKey(record?.date)).filter(Boolean))
      return dateListInclusive(startDate, endDate)
        .filter(item => !existingKeys.has(dateKey(item)))
    }

    async function runOneDailyAutoSync() {
      const now = Date.now()
      if (syncing || now - lastRunAt < 1200) return
      syncing = true
      lastRunAt = now

      try {
        const status = await ensureNativePermissions()
        if (!alive) return

        const platform = Capacitor.getPlatform()
        const today = formatDateForDaily(todayText())
        const yesterday = yesterdayText()
        const current = currentStoredData()
        const dailySupported = Boolean(status?.healthPermissionGranted)
        const screenSupported = platform === 'android' && Boolean(status?.usageAccessGranted)
        if (!dailySupported && !screenSupported) return

        // 一、今日是进行中数据：每次打开 APP 或从后台回到前台都刷新。
        const todayResult = await DeviceData.readDailyData({
          days: 1,
          startDate: today,
          cutoffHour: 5,
        })
        if (alive && Array.isArray(todayResult?.days) && todayResult.days.length) {
          setData(prev => {
            let next = { ...prev }
            if (dailySupported || screenSupported) {
              next = mergeNativeDailyDays(next, todayResult, {
                force: false,
                liveToday: true,
                refreshDates: [today],
              })
            }
            if (screenSupported) {
              next = mergeNativeScreenDays(next, todayResult, {
                force: false,
                liveToday: true,
                refreshDates: [today],
              })
            }
            return next
          })
        }

        // 二、历史数据：
        // 1. 每一种“当前设备实际支持”的自动来源，各自只执行一次首次 7 日导入。
        // 2. 首次导入完成后，昨天的数据每天第一次登录时刷新一次。
        // 3. 安装日至昨天之间若存在缺失日期，继续补齐；已存在的历史日期不反复获取。
        const todayKey = dateKey(today)
        const dailyFirstImport = dailySupported && !current.deviceDailyInitialImportDone
        const screenFirstImport = screenSupported && !current.deviceScreenInitialImportDone
        const dailyYesterdayNeeded =
          dailySupported && current.lastDeviceDailyAutoSyncDate !== todayKey
        const screenYesterdayNeeded =
          screenSupported && current.lastDeviceScreenAutoSyncDate !== todayKey

        const yesterdayDate = parseLocalDate(yesterday)
        const firstImportStart = new Date(
          yesterdayDate.getFullYear(),
          yesterdayDate.getMonth(),
          yesterdayDate.getDate(),
        )
        firstImportStart.setDate(firstImportStart.getDate() - (DEVICE_INITIAL_IMPORT_DAYS - 1))

        const installStart = parseLocalDate(current.installDate || today)
        const normalHistoryStart = formatDateForDaily(
          installStart > yesterdayDate ? yesterdayDate : installStart
        )

        const dailyHistoryStart = dailyFirstImport
          ? formatDateForDaily(firstImportStart)
          : normalHistoryStart
        const screenHistoryStart = screenFirstImport
          ? formatDateForDaily(firstImportStart)
          : normalHistoryStart

        const dailyMissingDates = dailySupported
          ? missingHistoricalDates(current.records || [], dailyHistoryStart, yesterday)
          : []
        const screenMissingDates = screenSupported
          ? missingHistoricalDates(current.records || [], screenHistoryStart, yesterday)
          : []

        const dailyRefreshDates = [...new Set([
          ...(dailyYesterdayNeeded ? [yesterday] : []),
          ...dailyMissingDates,
        ].map(formatDateForDaily))]

        const screenRefreshDates = [...new Set([
          ...(screenYesterdayNeeded ? [yesterday] : []),
          ...screenMissingDates,
        ].map(formatDateForDaily))]

        const allRefreshDates = [...new Set([
          ...dailyRefreshDates,
          ...screenRefreshDates,
          ...(dailyFirstImport ? dateListInclusive(firstImportStart, yesterday) : []),
          ...(screenFirstImport ? dateListInclusive(firstImportStart, yesterday) : []),
        ].map(formatDateForDaily))]

        if (!allRefreshDates.length) return

        const oldestRefreshDate = allRefreshDates
          .map(parseLocalDate)
          .sort((a, b) => a - b)[0]
        const historyDays = Math.max(
          1,
          Math.floor((yesterdayDate - oldestRefreshDate) / 86400000) + 1,
        )

        const historyResult = await DeviceData.readDailyData({
          days: historyDays,
          startDate: yesterday,
          cutoffHour: 5,
        })
        if (!alive || !Array.isArray(historyResult?.days) || !historyResult.days.length) return

        setData(prev => {
          let next = { ...prev }

          if (dailySupported && (dailyFirstImport || dailyRefreshDates.length)) {
            next = mergeNativeDailyDays(next, historyResult, {
              force: false,
              refreshDates: dailyFirstImport
                ? dateListInclusive(firstImportStart, yesterday)
                : dailyRefreshDates,
            })
          }

          if (screenSupported && (screenFirstImport || screenRefreshDates.length)) {
            // 安卓日常表中的屏幕总时长和离机时间仍由 daily merge 写入；
            // APP 详情表由 screen merge 单独更新。
            if (!dailySupported) {
              next = mergeNativeDailyDays(next, historyResult, {
                force: false,
                refreshDates: screenFirstImport
                  ? dateListInclusive(firstImportStart, yesterday)
                  : screenRefreshDates,
              })
            }
            next = mergeNativeScreenDays(next, historyResult, {
              force: false,
              refreshDates: screenFirstImport
                ? dateListInclusive(firstImportStart, yesterday)
                : screenRefreshDates,
            })
          }

          return {
            ...next,
            deviceDailyInitialImportDone:
              dailySupported ? true : prev.deviceDailyInitialImportDone,
            deviceScreenInitialImportDone:
              screenSupported ? true : prev.deviceScreenInitialImportDone,
            lastDeviceDailyAutoSyncDate:
              dailySupported && (dailyFirstImport || dailyYesterdayNeeded || dailyMissingDates.length)
                ? todayKey
                : prev.lastDeviceDailyAutoSyncDate,
            lastDeviceScreenAutoSyncDate:
              screenSupported && (screenFirstImport || screenYesterdayNeeded || screenMissingDates.length)
                ? todayKey
                : prev.lastDeviceScreenAutoSyncDate,
            lastDeviceAutoSyncAt: Date.now(),
          }
        })
      } catch (error) {
        console.warn('雪粒自动获取手机数据暂未完成；仍可继续使用手动数据。', error)
      } finally {
        syncing = false
      }
    }

    function handleVisible() {
      if (document.visibilityState === 'visible') runOneDailyAutoSync()
    }

    runOneDailyAutoSync()
    document.addEventListener('visibilitychange', handleVisible)
    window.addEventListener('focus', handleVisible)

    return () => {
      alive = false
      document.removeEventListener('visibilitychange', handleVisible)
      window.removeEventListener('focus', handleVisible)
    }
  }, [])


  useEffect(() => {
    let alive = true
    loadSnowballMedia(CUSTOM_YEARS_BG_IDB_KEY)
      .then(image => {
        if (alive && image) setCustomYearsBgImage(image)
      })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  useEffect(() => {
    setData(prev => {
      const records = ensureDailyDateSkeleton(prev.records || [])
      const before = (prev.records || []).map(record => dateKey(record.date)).join('|')
      const after = records.map(record => dateKey(record.date)).join('|')
      if (before === after) return prev
      return { ...prev, records, lastSavedAt: Date.now() }
    })
  }, [])

  useEffect(() => {
    if (!showDataPanel) return
    setData(prev => {
      const records = ensureDailyDateSkeleton(prev.records || [])
      const before = (prev.records || []).map(record => dateKey(record.date)).join('|')
      const after = records.map(record => dateKey(record.date)).join('|')
      if (before === after) return prev
      return { ...prev, records, lastSavedAt: Date.now() }
    })
  }, [showDataPanel])

  useEffect(() => {
    if (!showReward) return
    const timer = setInterval(() => {
      setRewardFrame(f => (f >= 6 ? 1 : f + 1))
    }, 450)
    return () => clearInterval(timer)
  }, [showReward])

  const adoptDays = calcDays(data.installDate)
  const elapsed = elapsedDays(data.installDate)
  const gen = generationInfo(adoptDays)
  const latestRecords = useMemo(() => [...(data.records || [])].map(normalizeDailyRecord).sort((a, b) => dateKey(b.date).localeCompare(dateKey(a.date))), [data.records, data.lastSavedAt])
  const todayDailyRecord = useMemo(() => dailyRecordForDate(latestRecords, todayText()) || emptyDailyRecord(todayText()), [latestRecords])
  const yesterdayDailyRecord = useMemo(() => dailyRecordForDate(latestRecords, yesterdayText()) || emptyDailyRecord(yesterdayText()), [latestRecords])

  const homeTodaySteps = Number(todayDailyRecord.steps || todayDailyRecord.yesterdaySteps || 0)
  const homeYesterdayStepsRaw = Number(yesterdayDailyRecord.steps || yesterdayDailyRecord.yesterdaySteps || 0)
  const homeYesterdaySteps = Math.max(homeTodaySteps, homeYesterdayStepsRaw)
  const homeYesterdaySleep = formatClockForDaily(yesterdayDailyRecord.offscreenTime || yesterdayDailyRecord.yesterdaySleep || '')
  const body = bodyInfo(homeYesterdaySteps)
  const sleepOk = sleepGood(homeYesterdaySleep)
  const food = dailyFoodInfo(todayDailyRecord.food || '', todayDailyRecord.taste || '')
  const mood = dailyMoodInfo(todayDailyRecord.mood || '')
  const currentBrainScore = recordBrainPercent(todayDailyRecord)
  const brain = { score: currentBrainScore, active: currentBrainScore >= 10, label: `${currentBrainScore}%` }

  const stepsOk = homeYesterdaySteps >= 5000
  const motionBodyOk = homeYesterdaySteps >= 5000 && homeYesterdaySteps <= 10000
  const furDisplay = sleepOk ? '浓密' : '稀疏'
  const furKey = sleepOk ? 'fluffy' : 'ragged'
  const eyeKey = mood.good ? 'color' : 'grey'
  const catImg = `/${gen.stage}_${body.key}_${furKey}_${eyeKey}.png`
  const bgImg = backgroundImage(stepsOk, sleepOk, mood.good)

  const imageFilter = food.good
    ? 'brightness(1.0) contrast(1.0)'
    : 'grayscale(0.5) brightness(0.85) contrast(0.9) saturate(0.8)'

  const healthyToday = stepsOk && sleepOk && food.good && mood.good
  const canPlayMotionVideo = call.callActive && brain.active && motionBodyOk && sleepOk && food.good && mood.good
  const motionVideo = VIDEO_MAP[gen.stage]

  const homeInteractionScore = [
    homeYesterdaySteps >= 5000,
    !!homeYesterdaySleep && sleepOk,
    !!String((todayDailyRecord.food || '') + (todayDailyRecord.taste || '')).trim() && food.good,
    !!String(todayDailyRecord.mood || '').trim() && mood.good,
  ].filter(Boolean).length

  async function playHomeCatInteraction() {
    if (homeInteractionPlaying) return

    // 只有四项全部达标时，雪粒才有精神回应。
    // 没有记录按不达标处理，因此 score 不会被误判为健康。
    if (homeInteractionScore < 4) return

    const runId = homeInteractionRunRef.current + 1
    homeInteractionRunRef.current = runId
    setHomeInteractionPlaying(true)

    const voice = '/interactions/cat_voice_long.mp3'

    let audio = null
    try {
      if (homeInteractionAudioRef.current) {
        homeInteractionAudioRef.current.pause()
        homeInteractionAudioRef.current.currentTime = 0
      }
      audio = new Audio(voice)
      audio.loop = true
      homeInteractionAudioRef.current = audio
      audio.play().catch(() => {})
    } catch (error) {
      audio = null
    }

    const candidateTypes = ['body', 'paw', 'eye', 'tone', 'head']
      .map((type, index) => ({ type, sort: Math.random() + index * 0.001 }))
      .sort((a, b) => a.sort - b.sort)
      .map(item => item.type)

    let frames = []
    for (const type of candidateTypes) {
      frames = await loadMotionFrames(`/interactions/${gen.stage}_${type}`, 24)
      if (frames.length >= 2) break
    }

    if (homeInteractionRunRef.current !== runId) return

    if (frames.length < 2) {
      if (audio) {
        audio.pause()
        audio.currentTime = 0
      }
      setHomeInteractionFrame('')
      setHomeInteractionPlaying(false)
      return
    }

    const sequence = [...frames, ...frames.slice(0, -1).reverse()]

    for (const frame of sequence) {
      if (homeInteractionRunRef.current !== runId) return
      setHomeInteractionFrame(frame)
      await new Promise(resolve => window.setTimeout(resolve, 340))
    }

    if (homeInteractionRunRef.current === runId) {
      if (audio) {
        audio.pause()
        audio.currentTime = 0
      }
      setHomeInteractionFrame('')
      setHomeInteractionPlaying(false)
    }
  }

  const todayStatusReport = useMemo(() => {
    const stepMissing = homeYesterdaySteps <= 0
    const sleepMissing = !homeYesterdaySleep
    const foodMissing = !String((todayDailyRecord.food || '') + (todayDailyRecord.taste || '')).trim()
    const moodMissing = !String(todayDailyRecord.mood || '').trim()

    const stepGood = !stepMissing && homeYesterdaySteps >= 5000
    const stepGreat = !stepMissing && homeYesterdaySteps >= 10000
    const sleepGoodFlag = !sleepMissing && sleepOk
    const foodGoodFlag = !foodMissing && food.good
    const moodGoodFlag = !moodMissing && mood.good

    const goodCount = [stepGood, sleepGoodFlag, foodGoodFlag, moodGoodFlag].filter(Boolean).length
    const allGood = goodCount === 4
    const hasTalked = currentBrainScore > 0 || (Array.isArray(data.messages) && data.messages.length > 0)
    const brainReady = currentBrainScore >= 10

    const stepText = stepMissing
      ? <>昨天的步数还没回来，雪粒先安静地等着你补上。</>
      : stepGreat
        ? <>昨天运动特别足，雪粒今天<StatusWord type="gold">胖嘟嘟</StatusWord>的，很有精神。</>
        : stepGood
          ? <>昨天运动够了，雪粒的体型保持得<StatusWord type="good">正好</StatusWord>。</>
          : <>昨天活动偏少，雪粒有点<StatusWord type="warn">偏瘦</StatusWord>，今天多走走就会好起来。</>

    const sleepText = sleepMissing
      ? <>昨天的离机时间还没有记录，雪粒的毛发状态还在等待更新。</>
      : sleepGoodFlag
        ? <>昨天休息比较准时，雪粒的毛发显得<StatusWord type="good">浓密</StatusWord>柔软。</>
        : <>昨天休息有点晚，雪粒今天有些没精神，毛发也有点<StatusWord type="warn">稀疏</StatusWord>。</>

    const foodText = foodMissing
      ? <>今天还没有饮食记录，可以和雪粒聊聊吃了什么，也可以稍后手动补上。</>
      : foodGoodFlag
        ? <>今天吃得不错，雪粒的毛色保持<StatusWord type="snow">雪白</StatusWord>，看起来很干净。</>
        : <>今天食物品种还可以更丰富一点，雪粒的毛色显得有些<StatusWord type="warn">暗淡</StatusWord>。</>

    const moodText = moodMissing
      ? <>今天还没有心情记录，雪粒很想听你说说今天过得怎么样。</>
      : moodGoodFlag
        ? <>今天心情不错，雪粒开心地睁着<StatusWord type="blue">圆亮眼睛</StatusWord>看着你。</>
        : <>今天似乎有点心情不佳，雪粒的瞳孔有些<StatusWord type="muted">无神</StatusWord>。</>

    let summaryLine
    if (allGood) {
      summaryLine = <>今天整体状态很好，雪粒<StatusWord type="good">活泼漂亮</StatusWord>，已经准备好回应你了。</>
    } else if (goodCount >= 2) {
      summaryLine = <>今天状态不错，还可以继续改善。雪粒会陪你一起恢复<StatusWord type="good">活泼漂亮</StatusWord>。</>
    } else {
      summaryLine = <>今天只是普通的一天。早点休息、多走一走，雪粒明天有机会重新<StatusWord type="good">漂亮起来</StatusWord>。</>
    }

    let companionLine
    if (allGood && brainReady) {
      companionLine = <>今天你和雪粒已经互动过了。拍拍它，看看它会不会<StatusWord type="blue">动起来</StatusWord>。</>
    } else if (allGood && hasTalked) {
      companionLine = <>今天已经和雪粒通话了，再多聊几句，拍拍它，它就可能会<StatusWord type="blue">动起来</StatusWord>。</>
    } else if (allGood) {
      companionLine = <>今天还没有和雪粒通话。和它说说今天发生了什么，再拍拍它，说不定会有一点小惊喜。</>
    } else if (hasTalked) {
      companionLine = <>雪粒已经了解你的饮食和心情了。今晚早点睡、多走走，等状态回升，它就更有机会动起来。</>
    } else {
      companionLine = <>今天还没有和雪粒通话。和它互动，再把生活节作息调整好，明天就有机会看到雪粒活动起来。</>
    }

    return {
      sections: [
        { key: 'steps', title: '运动', text: stepText },
        { key: 'sleep', title: '作息', text: sleepText },
        { key: 'food', title: '饮食', text: foodText },
        { key: 'mood', title: '心情', text: moodText },
      ],
      summaryLine,
      companionLine,
      allGood,
      goodCount,
    }
  }, [homeYesterdaySteps, homeYesterdaySleep, sleepOk, todayDailyRecord, food.good, mood.good, currentBrainScore, data.messages])

  const dailyMonthGroups = useMemo(() => buildDailyMonthGroups(latestRecords), [latestRecords])
  const dailyMonthKeys = useMemo(() => dailyMonthGroups.map(group => group.key).join('|'), [dailyMonthGroups])
  const dailyScreenEntries = useMemo(() => buildScreenEntries(data.screenRecords || [], latestRecords), [data.screenRecords, latestRecords])
  const dailyNutritionStats = useMemo(() => nutritionStatsFromRecords(latestRecords, dailyStatRange), [latestRecords, dailyStatRange])
  const dailyTasteStats = useMemo(() => tasteStatsFromRecords(latestRecords, dailyStatRange), [latestRecords, dailyStatRange])
  const nutritionMotionOn = useMemo(() => nutritionMotionReady(dailyNutritionStats, dailyTasteStats), [dailyNutritionStats, dailyTasteStats])
  const nutritionTasteLine = useMemo(() => nutritionTasteSentence(dailyTasteStats), [dailyTasteStats])
  const dailyAppStats = useMemo(() => appStatsFromEntries(dailyScreenEntries, dailyStatRange, latestRecords), [dailyScreenEntries, dailyStatRange, latestRecords])
  const dailyTrainRows = useMemo(() => (dailyAppStats || [])
    .filter(item => TRAIN_VISUAL_ROWS.includes(item.key))
    .filter(item => Number(item?.minutes || 0) > 0 || Number(item?.pickups || 0) > 0), [dailyAppStats])
  const dailyTrainMaxPickups = useMemo(() => Math.max(1, ...dailyTrainRows.map(item => Number(item?.pickups || 0))), [dailyTrainRows])
  const dailyTrainMaxDuration = useMemo(() => Math.max(3, ...dailyTrainRows.map(item => trainSpeedForStats(item, dailyTrainMaxPickups))), [dailyTrainRows, dailyTrainMaxPickups])
  const dailyTopApps = useMemo(() => appTop10FromEntries(dailyScreenEntries, dailyStatRange, latestRecords), [dailyScreenEntries, dailyStatRange, latestRecords])
  const dailyTopAppSummary = useMemo(() => ({
    minutes: (dailyTopApps || []).reduce((sum, item) => sum + Number(item?.minutes || 0), 0),
    pickups: (dailyTopApps || []).filter(item => item.app !== '其它').reduce((sum, item) => sum + Number(item?.pickups || 0), 0),
  }), [dailyTopApps])
  const dailyScreenRows = useMemo(() => (dailyScreenEntries || []).filter(row => dateKey(row.date) === dateKey(selectedScreenDate)).sort((a, b) => b.minutes - a.minutes), [dailyScreenEntries, selectedScreenDate])

  useEffect(() => {
    if (!showDataPanel || dailyMode !== 'home') return
    const currentMonthKey = monthKeyFromDate(todayText())
    const previousMonthKey = previousMonthKeyFromDate(todayText())
    const next = {}
    dailyMonthGroups.forEach(group => {
      next[group.key] = dailyViewTab === 'steps'
        ? (group.key === currentMonthKey || group.key === previousMonthKey)
        : group.key === currentMonthKey
    })
    setExpandedDailyMonths(next)
  }, [showDataPanel, dailyMode, dailyViewTab, dailyMonthKeys])

  useEffect(() => {
    if (dailyMode !== 'nutrition' || !nutritionMotionOn) return
    const key = `${dailyStatRange}-${dailyNutritionStats.map(item => Math.round(Number(item.value || 0) * 10)).join('-')}-${Math.round(Number(dailyTasteStats.heavyRatio || 0) * 100)}`
    if (nutritionMotionNoticeKey === key) return
    setNutritionMotionNoticeKey(key)
    setDailyModal({
      title: '动态',
      text: '你的饮食种类丰富、碳水类较少，雪粒变得活泼。',
    })
  }, [dailyMode, nutritionMotionOn, dailyStatRange, dailyNutritionStats, dailyTasteStats, nutritionMotionNoticeKey])

  useEffect(() => {
    if (dailyMode !== 'train') return
    if (!dailyTrainRows.length) {
      setTrainIsRunning(false)
      setTrainRunKey(key => key + 1)
      return
    }

    let cancelled = false
    let startTimer = null
    let resetTimer = null

    const startCycle = () => {
      if (cancelled) return
      setTrainIsRunning(false)
      setTrainRunKey(key => key + 1)

      startTimer = window.setTimeout(() => {
        if (!cancelled) setTrainIsRunning(true)
      }, 3000)

      resetTimer = window.setTimeout(() => {
        if (!cancelled) startCycle()
      }, Math.round((3000 + dailyTrainMaxDuration * 500 + 900)))
    }

    startCycle()

    return () => {
      cancelled = true
      if (startTimer) window.clearTimeout(startTimer)
      if (resetTimer) window.clearTimeout(resetTimer)
    }
  }, [dailyMode, dailyStatRange, dailyTrainRows, dailyTrainMaxDuration])

  const firstFootprintPhoto = useMemo(() => {
    const photos = (data.footprints || [])
      .flatMap(item => Array.isArray(item.photos) ? item.photos : [])
      .map(src => String(src || '').trim())
      .filter(Boolean)
    return photos[0] || ''
  }, [data.footprints])

  const customYearsSceneImage = customYearsBgImage || data.customYearsSceneImage || firstFootprintPhoto
  const yearsScene = data.yearsScene === 'custom' && customYearsSceneImage
    ? { label: '自定', image: customYearsSceneImage }
    : (YEARS_SCENES[data.yearsScene] || YEARS_SCENES.park)
  const footprints = data.footprints || []

  const homeTraceStats = useMemo(() => {
    const records = [...(data.records || [])]
      .sort((a, b) => dateKey(b.date).localeCompare(dateKey(a.date)))
      .slice(0, 7)

    const stepValues = records
      .map(item => Number(item.steps || item.yesterdaySteps || 0))
      .filter(n => n > 0)
    const avgSteps = stepValues.length
      ? Math.round(stepValues.reduce((sum, n) => sum + n, 0) / stepValues.length)
      : Number(data.yesterdaySteps || 0)

    const worldCount = new Set((data.footprints || []).filter(item => item.type === 'world').map(item => item.place)).size
    const chinaCount = new Set((data.footprints || []).filter(item => item.type === 'china').map(item => item.place)).size

    const screenValues = records
      .map(item => recordScreenMinutes(item))
      .filter(n => n > 0)
    const avgScreen = screenValues.length
      ? formatDurationFromMinutes(screenValues.reduce((sum, n) => sum + n, 0) / screenValues.length)
      : '待记录'

    return {
      worldCount,
      chinaCount,
      thingsCount: (data.things || []).length,
      peopleCount: (data.people || []).length,
      avgSteps,
      avgScreen,
    }
  }, [data.records, data.footprints, data.things, data.people, data.yesterdaySteps])

  const last3Healthy = useMemo(
    () => dailyRewardWindow(latestRecords, {
      rewardSeenKey: data.rewardSeenKey,
      installDate: data.installDate,
    }).healthy,
    [latestRecords, data.rewardSeenKey, data.installDate],
  )

  useEffect(() => {
    const today = todayText()
    if (data.lastResetDate === today) return

    setData(prev => ({
      ...prev,
      date: today,
      lastResetDate: today,
      foodText: '',
      foodKeyword: '',
      moodKeyword: '',
      mood: '',
      chatInput: '',
      chatStep: 'idle',
      chatCount: 0,
      messages: [],
    }))
  }, [data.lastResetDate])

  useEffect(() => {
    if (!data.hasSeenWelcome) return

    // 雪粒的一天从 05:00 开始：
    // 00:00—04:59 不播报；05:00 后当天只播报一次。
    // 昨日步数或离机时间随后刷新、手动修改，都不再重复触发。
    const now = new Date()
    if (now.getHours() < 5) return

    const greetingKey = dateKey(now)
    if (data.lastGreetingDate === greetingKey) return

    const summary = dailySummaryText(
      {
        yesterdaySteps: homeYesterdaySteps,
        yesterdaySleepTime: homeYesterdaySleep,
      },
      sleepOk,
    )

    setDailyModal({
      title: '雪粒的今日回顾',
      text: summary,
    })

    setData(prev => ({
      ...prev,
      lastGreetingDate: greetingKey,
      chatStep: 'idle',
    }))
  }, [data.hasSeenWelcome, data.lastGreetingDate, homeYesterdaySteps, homeYesterdaySleep, sleepOk])

  useEffect(() => {
    if (!data.hasSeenWelcome) return

    const milestones = [7, 30, 100]
    const reached = milestones.find(day => elapsed === day)

    if (!reached) {
      lastUpgradePromptKeyRef.current = ''
      return
    }

    const upgradeKey = `${dateKey(data.installDate)}-${reached}`
    const seenKeys = Array.isArray(data.upgradeSeenKeys) ? data.upgradeSeenKeys : []
    if (seenKeys.includes(upgradeKey)) return
    if (lastUpgradePromptKeyRef.current === upgradeKey) return
    lastUpgradePromptKeyRef.current = upgradeKey

    const text =
      reached === 7
        ? '雪粒已经与你共处7天了，成了能手猫，开始真正熟悉你的生活节奏。'
        : reached === 30
          ? '雪粒已经与你共处30天了，成了高手猫，它将对你的生活提供更好的观察、反馈与分析。'
          : '雪粒已经与你共处100天了。它有了继承者，新的世代开始了。'

    // 升级是成长提示，不修改三天奖励记录；只清掉正在残留或排队显示的奖励层，避免两个弹窗串台。
    if (rewardTimerRef.current) {
      window.clearTimeout(rewardTimerRef.current)
      rewardTimerRef.current = null
    }
    setShowReward(false)
    setUpgradeModal({ title: `陪伴满${reached}天`, text, key: upgradeKey })
  }, [elapsed, data.installDate, data.hasSeenWelcome, data.upgradeSeenKeys])

  function closeDaily() {
    setDailyModal(null)
  }

  function closeUpgrade() {
    const seenKey = upgradeModal?.key
    setUpgradeModal(null)
    setShowReward(false)
    if (seenKey) {
      setData(prev => {
        const seenKeys = Array.isArray(prev.upgradeSeenKeys) ? prev.upgradeSeenKeys : []
        if (seenKeys.includes(seenKey)) return prev
        return { ...prev, upgradeSeenKeys: [...seenKeys, seenKey] }
      })
    }
    if (rewardTimerRef.current) {
      window.clearTimeout(rewardTimerRef.current)
      rewardTimerRef.current = null
    }
  }

  function showUpgrade(day) {
  const text =
    day === 7
      ? '雪粒已经与你共处7天了，成了能手猫，开始真正熟悉你的生活节奏。'
      : day === 30
        ? '雪粒已经与你共处30天了，成了高手猫，将为你的生活提供更好的观察、反馈与分析。'
        : '雪粒已经与你共处100天了，它有了继承者，新的世代开始了。'

  setUpgradeModal({ title: `陪伴第${day}天`, text, key: String(day) })
}

  function scheduleReward(delay = 120) {
    if (rewardTimerRef.current) window.clearTimeout(rewardTimerRef.current)
    rewardTimerRef.current = window.setTimeout(() => {
      setRewardFrame(1)
      setShowReward(true)
      rewardTimerRef.current = null
    }, delay)
  }

  function maybeRewardAfterRecord(nextData, newRecords) {
    const reward = dailyRewardWindow(
      newRecords || nextData.records || [],
      {
        rewardSeenKey: nextData.rewardSeenKey,
        installDate: nextData.installDate,
      },
    )

    if (reward.healthy) {
      scheduleReward(350)
      return reward.key
    }

    return nextData.rewardSeenKey
  }

  function toggleDailyMonth(key) {
    setExpandedDailyMonths(prev => ({
      ...prev,
      [key]: !prev[key],
    }))
  }

  async function beginDailyEdit(record, returnMode = null) {
    if (!record) return
    const normalized = normalizeDailyRecord(record)
    const normalizedDate = formatDateForDaily(normalized.date || record.date || todayText())
    const targetKey = dateKey(normalizedDate)
    const targetId = normalized.id || record.id || dailyRecordIdFor(normalizedDate)
    const sourceRecord = dailyRecordForDate(data.records || [], normalizedDate) || record
    const sourceId = sourceRecord?.id || targetId
    const source = normalizeDailyRecord({ ...normalized, ...sourceRecord, id: sourceId, date: normalizedDate })

    // V88：手机端“今天”是自动生成的空记录，有时只存在于当前详情页视图里。
    // 进入编辑前先把这条记录写回 records，避免移动端编辑今天时找不到源记录。
    setData(prev => {
      const records = prev.records || []
      const existing = dailyRecordForDate(records, normalizedDate)
      const nextRecords = existing
        ? records.map(item => dateKey(item.date) === targetKey ? { ...normalizeDailyRecord(item), ...source, id: item.id || sourceId, date: normalizedDate } : item)
        : [source, ...records]
      return {
        ...prev,
        records: nextRecords
          .map(item => ({ ...normalizeDailyRecord(item), healthy: dailyRecordHealthy(item) }))
          .sort((a, b) => dateKey(b.date).localeCompare(dateKey(a.date))),
        lastSavedAt: Date.now(),
      }
    })

    setPendingDailyEdit({
      ...source,
      date: normalizedDate,
      _dateKey: targetKey,
      _id: sourceId,
      _isToday: targetKey === dateKey(todayText()),
    })
    setDailyEditReturnMode(returnMode || (String(dailyMode || '').startsWith('detail-') ? dailyMode : 'home'))
    setDailyEditReason(DAILY_EDIT_REASONS[0])

    try {
      setConversationEditDraft(await readConversationRecord(normalizedDate))
    } catch (error) {
      console.error('读取对话记录失败：', error)
      setConversationEditDraft(emptyConversationRecord(normalizedDate))
    }
  }

  function cancelDailyEditReason() {
    setPendingDailyEdit(null)
    if (dailyEditReturnMode === 'app-home') {
      setDailyMode('home')
      setShowDataPanel(false)
    }
  }

  function cancelDailyEditAndReturn() {
    if (dailyEditReturnMode === 'app-home' || String(dailyEditReturnMode || '').startsWith('detail-')) {
      setDailyMode('home')
      setShowDataPanel(false)
    } else {
      setDailyMode(dailyEditReturnMode || 'home')
      setShowDataPanel(true)
    }
  }

  function confirmDailyEdit() {
    const record = pendingDailyEdit
    if (!record) return
    setData(prev => ({
      ...prev,
      date: record.date || prev.date || todayText(),
      yesterdaySteps: Number(record.steps || record.yesterdaySteps || 0),
      yesterdaySleepTime: record.yesterdaySleep || record.offscreenTime || '',
      todaySleepTime: record.todaySleep || '',
      screenMinutes: formatHoursInputFromMinutes(recordScreenMinutes(record)),
      foodText: deriveConversationFields(conversationEditDraft).food,
      foodKeyword: deriveConversationFields(conversationEditDraft).food,
      foodTaste: deriveConversationFields(conversationEditDraft).taste,
      moodKeyword: deriveConversationFields(conversationEditDraft).mood,
      mood: deriveConversationFields(conversationEditDraft).mood,
      brainPercent: deriveConversationFields(conversationEditDraft).brainPercent,
      dailyEditReason,
      editingDailyRecordId: record._id || record.id || dailyRecordIdFor(record.date || todayText()),
      editingDailyRecordDateKey: dateKey(record.date || todayText()),
    }))
    setPendingDailyEdit(null)
    setDailyMode('edit')
  }

  function openAddDailyDateModal() {
    setDailyDateModal({ value: '' })
  }

  function confirmAddDailyDate() {
    const input = dailyDateModal?.value
    if (!input) {
      setDailyModal({ title: '日期不能为空', text: '请输入要新增的过去日期，例如 2026/7/1。' })
      return
    }
    const d = parseStrictDailyDate(input)
    if (!d) {
      setDailyModal({ title: '日期格式错误', text: '请输入类似 2026/7/1 的过去日期。年份、月份和日期都要真实有效。' })
      return
    }
    const newDate = formatDateForDaily(d)
    const today = parseLocalDate(todayText())
    if (d > today) {
      setDailyModal({ title: '不能新增未来日期', text: '新增日期只能选择今天或过去日期。' })
      return
    }
    if ((data.records || []).some(record => dateKey(record.date) === dateKey(newDate))) {
      setDailyModal({ title: '日期已经存在', text: '这一天已经在日常数据一览表中。请直接点击那一行的“修改”。' })
      return
    }
    setData(prev => ({
      ...prev,
      records: [...(prev.records || []), emptyDailyRecord(newDate)].sort((a, b) => dateKey(b.date).localeCompare(dateKey(a.date))),
      lastSavedAt: Date.now(),
    }))
    setDailyDateModal(null)
  }

  async function readNativeDate(date) {
    if (!Capacitor.isNativePlatform()) throw new Error('只有安装到手机后的雪粒才能读取设备数据。')
    const targetDate = formatDateForDaily(date || yesterdayText())
    return DeviceData.readDailyData({ days: 1, startDate: targetDate, cutoffHour: 5 })
  }

  async function refreshDailyRecordForDate(recordOrDate) {
    const targetDate = formatDateForDaily(recordOrDate?.date || recordOrDate || yesterdayText())
    try {
      const result = await readNativeDate(targetDate)
      if (!Array.isArray(result?.days) || !result.days.length) throw new Error('手机没有返回这一天的数据。')
      setData(prev => mergeNativeDailyDays(prev, result, {
        force: true,
        refreshDates: [targetDate],
      }))
      setDailyModal({ title: '重新获取完成', text: `${targetDate} 的步数已从雪粒步数自动获取表重新写入；离机时间和屏幕总时长也已用手机数据更新。APP 详情表没有改变。` })
    } catch (error) {
      setDailyModal({ title: '重新获取失败', text: String(error?.message || error || '请检查健康和使用情况权限。') })
    }
  }

  async function refreshScreenRecordsForDate(date = selectedScreenDate) {
    const targetDate = formatDateForDaily(date || yesterdayText())
    try {
      if (Capacitor.getPlatform() !== 'android') throw new Error('iPhone 暂不支持读取 APP 屏幕详情。')
      const result = await readNativeDate(targetDate)
      if (!Array.isArray(result?.days) || !result.days.length) throw new Error('手机没有返回这一天的数据。')
      setData(prev => mergeNativeScreenDays(prev, result, { force: true }))
      setDailyModal({ title: 'APP详情已重新获取', text: `${targetDate} 的真实 APP、Package、使用时间和打开次数已更新。日常数据表没有改变。` })
    } catch (error) {
      setDailyModal({ title: '重新获取失败', text: String(error?.message || error || '请检查使用情况访问权限。') })
    }
  }

  function handleVersionTap(event) {
    event?.preventDefault?.()
    event?.stopPropagation?.()
    if (versionTapTimerRef.current) window.clearTimeout(versionTapTimerRef.current)
    const next = versionTapCount + 1
    if (next >= 8) {
      setVersionTapCount(0)
      setData(prev => ({ ...prev, developerMode: true, lastSavedAt: Date.now() }))
      window.alert('开发者模式已开启')
      return
    }
    setVersionTapCount(next)
    versionTapTimerRef.current = window.setTimeout(() => setVersionTapCount(0), 3500)
  }

  function closeDeveloperMode() {
    setData(prev => ({ ...prev, developerMode: false, lastSavedAt: Date.now() }))
  }

  function openStepAutoTable() {
    if (!data.developerMode) return
    setDailyMode('steps-auto')
    setShowDataPanel(true)
  }

  function openScreenDetailForDate(date, returnMode = null) {
    if (!data.developerMode) return
    if (screenOpenTimerRef.current) window.clearTimeout(screenOpenTimerRef.current)
    const targetDate = formatDateForDaily(date || todayText())
    const targetReturnMode = returnMode || (String(dailyMode || '').startsWith('detail-') ? dailyMode : dailyMode || 'home')
    // 延迟切换页面，避免进入详情的同一次触摸继续落到输入框上。
    screenOpenTimerRef.current = window.setTimeout(() => {
      setSelectedScreenDate(targetDate)
      setScreenReturnMode(targetReturnMode)
      setDailyMode('screen')
      setShowDataPanel(true)
    }, 180)
  }

  function validateScreenTotalForDate() {
    // 屏幕总时长与 APP 详情采用不同统计口径，差异不再阻止保存或返回。
    return true
  }

  function saveScreenDetailAndReturn() {
    // APP 详情表和日常表互相独立。即使两边合计暂时不同，也允许保存和退出。
    setDailyMode(screenReturnMode || 'home')
    setShowDataPanel(true)
  }

  function openDailyDetail(type = 'all') {
    const nextTab = type || 'all'
    setDailyViewTab(nextTab)
    if (nextTab === 'steps') {
      const currentMonthKey = monthKeyFromDate(todayText())
      const previousMonthKey = previousMonthKeyFromDate(todayText())
      setExpandedDailyMonths(prev => ({ ...prev, [currentMonthKey]: true, [previousMonthKey]: true }))
    }
    setDailyMode('home')
    setShowDataPanel(true)
  }

  function beginTodayDailyEdit(returnMode = null) {
    const today = formatDateForDaily(todayText())
    const record = dailyRecordForDate(data.records || [], today) || emptyDailyRecord(today)
    beginDailyEdit({ ...record, id: record.id || dailyRecordIdFor(today), date: today }, returnMode || (String(dailyMode || '').startsWith('detail-') ? dailyMode : 'home'))
  }

  function saveHomeGoodNight({ targetDate, time }) {
    const recordDate = formatDateForDaily(targetDate || todayText())
    const savedTime = formatClockForDaily(time)

    setData(prev => {
      const current = dailyRecordForDate(prev.records || [], recordDate) || emptyDailyRecord(recordDate)
      const record = {
        ...current,
        id: current.id || dailyRecordIdFor(recordDate),
        date: recordDate,
        offscreenTime: savedTime,
        yesterdaySleep: savedTime,
        todaySleep: savedTime,
        offscreenManual: true,
        editReason: '主页今日晚安',
        manualSavedAt: Date.now(),
      }
      record.healthy = dailyRecordHealthy(record)

      const isCalendarToday = dateKey(recordDate) === dateKey(todayText())

      return {
        ...prev,
        ...(isCalendarToday ? {
          yesterdaySleepTime: savedTime,
          todaySleepTime: savedTime,
        } : {}),
        records: mergeDailyRecord(prev.records || [], recordDate, record),
        lastSavedAt: Date.now(),
      }
    })
  }

  function beginHomeTodayEdit() {
    setShowDataPanel(true)
    setDailyMode('home')
    beginTodayDailyEdit('app-home')
  }

  function beginDailyRecordEdit(record, type) {
    if (!record) return
    const targetDate = formatDateForDaily(record.date || todayText())
    // V94：四个详情表重用旧日常表的“按行编辑”逻辑。
    // 每一行只编辑这一行的日期；保存/放弃统一回主页，先把功能彻底稳定。
    const source = dailyRecordForDate(data.records || [], targetDate) || record || emptyDailyRecord(targetDate)
    beginDailyEdit({ ...source, id: source.id || dailyRecordIdFor(targetDate), date: targetDate }, 'app-home')
  }

  function openNutritionPage(range = 'week') {
    setDailyStatRange(range || 'week')
    setDailyMode('nutrition')
    setShowDataPanel(true)
  }

  function openTrainPage(range = 'yesterday') {
    setDailyStatRange(range || 'yesterday')
    setDailyMode('train')
    setShowDataPanel(true)
  }

  function openFootprintPage(type = 'world', mode = 'home') {
    setFootprintView(type || 'world')
    setSelectedFootprintId(null)
    // 主页入口必须先进入独立 Footprint 页面自己的新版首页。
    // 只有明确传入 browseFull / addMap / setHome 时才直接进入地图。
    setYearsMode(mode || 'home')
    setShowYearsPanel(true)
  }

  function openThingPage(type = 'overview') {
    openThings(type || 'overview')
  }

  function openPeoplePage() {
    setShowPeoplePanel(true)
  }

  function updateScreenRecord(index, field, value) {
    setData(prev => {
      const records = [...(prev.screenRecords || [])]
      const old = records[index] || { date: selectedScreenDate, app: '', realAppName: '', packageName: '', minutes: 0, pickups: 0 }
      const next = {
        ...old,
        [field]: field === 'minutes'
          ? Math.max(0, Math.round((Number(value) || 0) * 60))
          : value,
      }
      if (field === 'realAppName') {
        next.app = snowballAppNameFor(value)
        next.mapped = Boolean(next.app)
      }
      if (field === 'app') next.mapped = Boolean(value)
      records[index] = next
      return { ...prev, screenRecords: records, lastSavedAt: Date.now() }
    })
  }

  function addScreenRecord() {
    setData(prev => ({
      ...prev,
      screenRecords: [
        ...(prev.screenRecords || []),
        { id: `screen-${Date.now()}`, date: selectedScreenDate || todayText(), app: '', realAppName: '', packageName: '', mapped: false, minutes: 0, pickups: 0 },
      ],
      lastSavedAt: Date.now(),
    }))
  }

  function deleteScreenRecord(index) {
    const row = (data.screenRecords || [])[index]
    if (!row) return
    const appName = row.app || row.realAppName || row.packageName || '这条 APP 详情'
    const accepted = window.confirm(`确定删除“${appName}”这条记录吗？删除后需要重新获取或手动新增才能恢复。`)
    if (!accepted) return
    setData(prev => ({
      ...prev,
      screenRecords: (prev.screenRecords || []).filter((_, i) => i !== index),
      lastSavedAt: Date.now(),
    }))
  }

  function requestDailyDelete(record) {
    if (!record) return
    const normalized = normalizeDailyRecord(record)
    const normalizedDate = formatDateForDaily(normalized.date || record.date || todayText())
    setPendingDailyDelete({ ...normalized, _sourceRecord: record, date: normalizedDate, _dateKey: dateKey(normalizedDate), _id: normalized.id || record.id || dailyRecordIdFor(normalizedDate) })
  }

  function confirmDailyDelete() {
    const record = pendingDailyDelete
    if (!record) return
    const targetKey = record._dateKey || dateKey(record.date)
    const targetId = record._id || record.id || ''
    const sourceRecord = record._sourceRecord
    setData(prev => ({
      ...prev,
      records: (prev.records || []).filter(item => {
        const itemKey = dateKey(item.date)
        const itemId = item.id || dailyRecordIdFor(item.date)
        if (sourceRecord && item === sourceRecord) return false
        if (targetId && itemId === targetId) return false
        if (targetKey && itemKey === targetKey) return false
        return true
      }),
      screenRecords: (prev.screenRecords || []).filter(item => dateKey(item.date) !== targetKey),
      lastSavedAt: Date.now(),
    }))
    setPendingDailyDelete(null)
  }

  async function saveToday() {
    const source = { ...data }
    const conversationDate = formatDateForDaily(source.date || todayText())
    const conversationRecord = {
      ...conversationEditDraft,
      date: conversationDate,
      dateKey: conversationDate,
    }
    const conversationFields = deriveConversationFields(conversationRecord)
    const foodKeyword = conversationFields.food
    const moodKeyword = conversationFields.mood
    const baseData = {
      ...source,
      date: conversationDate,
      foodKeyword,
      moodKeyword,
      foodText: foodKeyword,
      foodTaste: conversationFields.taste,
      brainPercent: conversationFields.brainPercent,
    }

    if (!isValidClockText(baseData.yesterdaySleepTime)) {
      setDailyModal({ title: '离屏时间格式错误', text: '当日离屏时间必须包含冒号，允许 05:00 到 29:00。例如：23:30、26:00 或 26：00。' })
      return
    }

    const foodNow = dailyFoodInfo(foodKeyword || baseData.foodText, baseData.foodTaste || '')
    const moodNow = dailyMoodInfo(moodKeyword)
    const nextHealthy =
      Number(baseData.yesterdaySteps || 0) >= 5000 &&
      sleepGood(baseData.yesterdaySleepTime) &&
      foodNow.good &&
      moodNow.good

    const editingId = baseData.editingDailyRecordId || ''
    const editingDateKey = baseData.editingDailyRecordDateKey || dateKey(baseData.date)
    const existingForDate = dailyRecordForDate(baseData.records || [], baseData.date)

    const record = {
      id: editingId || existingForDate?.id || dailyRecordIdFor(baseData.date),
      date: formatDateForDaily(baseData.date),
      steps: Number(baseData.yesterdaySteps || 0),
      yesterdaySleep: formatClockForDaily(baseData.yesterdaySleepTime) || '',
      offscreenTime: formatClockForDaily(baseData.yesterdaySleepTime) || '',
      todaySleep: baseData.todaySleepTime || '',
      // 编辑框显示的是“小时”，保存回日常记录时统一转成分钟。
      screenMinutes: Math.max(0, Math.round(Number(baseData.screenMinutes || 0) * 60)),
      food: foodKeyword || '',
      taste: baseData.foodTaste || '',
      mood: moodKeyword || '',
      brainPercent: recordBrainPercent({ brainPercent: baseData.brainPercent ?? brain.score }),
      editReason: baseData.dailyEditReason || '',
      healthy: nextHealthy,
      stepsManual: dateKey(baseData.date) !== dateKey(todayText()),
      offscreenManual: dateKey(baseData.date) !== dateKey(todayText()),
      screenManual: dateKey(baseData.date) !== dateKey(todayText()),
      manualSavedAt: Date.now(),
    }


    const oldRecords = (baseData.records || []).filter(r => {
      const rKey = dateKey(r.date)
      const rId = r.id || dailyRecordIdFor(r.date)
      if (editingId && rId === editingId) return false
      if (editingDateKey && rKey === editingDateKey) return false
      if (rKey === dateKey(record.date)) return false
      return true
    })
    const newRecords = [...oldRecords, record]
      .map(item => ({ ...item, healthy: dailyRecordHealthy(item) }))
      .sort((a, b) => dateKey(b.date).localeCompare(dateKey(a.date)))
    const reward = dailyRewardWindow(newRecords, {
      rewardSeenKey: baseData.rewardSeenKey,
      installDate: baseData.installDate,
    })
    const shouldShowReward = reward.healthy
    const isEditingToday = dateKey(record.date) === dateKey(todayText())
    const nextData = {
      ...baseData,
      ...(isEditingToday ? {
        date: record.date,
        yesterdaySteps: record.steps,
        yesterdaySleepTime: record.offscreenTime || record.yesterdaySleep || '',
        todaySleepTime: record.todaySleep || '',
        screenMinutes: formatHoursInputFromMinutes(record.screenMinutes),
        foodText: record.food || '',
        foodKeyword: record.food || '',
        foodTaste: record.taste || '',
        moodKeyword: record.mood || '',
        mood: record.mood || '',
        brainPercent: record.brainPercent || 0,
      } : {}),
      records: newRecords,
      rewardSeenKey: reward.healthy ? reward.key : baseData.rewardSeenKey,
      editingDailyRecordId: '',
      editingDailyRecordDateKey: '',
      lastSavedAt: Date.now(),
    }

    try {
      await saveConversationRecord(conversationRecord)
    } catch (error) {
      console.error('保存对话记录失败：', error)
      setDailyModal({ title: '对话记录未保存', text: '日常数据没有改动，请稍后再试。' })
      return
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(dataForLocalStorage(nextData)))
    setData(nextData)
    if (dailyEditReturnMode === 'app-home') {
      setDailyMode('home')
      setShowDataPanel(false)
    } else {
      setDailyMode(dailyEditReturnMode || 'home')
      setShowDataPanel(true)
    }

    if (shouldShowReward) {
      scheduleReward(100)
    }
  }

  function openThings(type = 'overview') {
    setThingsStartMode(type || 'overview')
    setShowThingsPanel(true)
  }

  function updateFootprintDraft(field, value) {
    if (field === 'type') setFootprintView(value)

    setData(prev => {
      const current = prev.footprintDraft || DEFAULT.footprintDraft
      const next = {
        ...current,
        [field]: value,
      }

      if (field === 'type') {
        next.place = ''
        delete next.x
        delete next.y
        delete next.positionMode
      }

      if (field === 'place' && value !== current.place) {
        delete next.x
        delete next.y
        delete next.positionMode
      }

      return {
        ...prev,
        footprintDraft: next,
      }
    })
  }

  function pointFromMapEvent(event) {
    const mapEl = event?.currentTarget?.classList?.contains('simpleMap')
      ? event.currentTarget
      : event?.currentTarget?.closest?.('.simpleMap')
    if (!mapEl) return null
    const rect = mapEl.getBoundingClientRect()
    const x = Math.max(2, Math.min(98, ((event.clientX - rect.left) / rect.width) * 100))
    const y = Math.max(2, Math.min(98, ((event.clientY - rect.top) / rect.height) * 100))
    return normalizeFootprintPoint({ x, y })
  }

  function setFootprintDraftManualPosition(point) {
    if (!point) return
    setData(prev => {
      const current = prev.footprintDraft || DEFAULT.footprintDraft
      if (!current.place || !isValidFootprintPlace(current.type || footprintView || 'local', current.place)) return prev
      return {
        ...prev,
        footprintDraft: {
          ...current,
          x: point.x,
          y: point.y,
          positionMode: 'manual',
        },
      }
    })
  }

  function pickFootprintDraftPosition(event) {
    if (yearsMode !== 'addMap') return
    const point = pointFromMapEvent(event)
    setFootprintDraftManualPosition(point)
  }

  function chooseFootprintPlace(type, place, event) {
    if (event) event.stopPropagation()
    const point = pointFromMapEvent(event)
    setFootprintView(type)
    setData(prev => {
      const current = prev.footprintDraft || DEFAULT.footprintDraft
      const samePlace = current.type === type && current.place === place
      const next = {
        ...current,
        type,
        place,
      }

      if (samePlace && point) {
        next.x = point.x
        next.y = point.y
        next.positionMode = 'manual'
      } else {
        delete next.x
        delete next.y
        delete next.positionMode
      }

      return {
        ...prev,
        footprintDraft: next,
      }
    })
  }

  function openCurrentFootprintMode(mode) {
    const draftType = (data.footprintDraft || DEFAULT.footprintDraft).type || 'local'
    setFootprintView(draftType)
    setSelectedFootprintId(null)
    if (mode === 'addMap') setEditingFootprintId(null)
    setYearsMode(mode)
    setShowYearsPanel(true)
  }

  function beginAddFootprint(type = footprintHomePrompt || footprintView) {
    const targetType = type || footprintView
    setFootprintHomePrompt(null)
    setFootprintView(targetType)
    setEditingFootprintId(null)
    setSelectedFootprintId(null)
    setData(prev => ({
      ...prev,
      footprintDraft: {
        ...(prev.footprintDraft || DEFAULT.footprintDraft),
        year: '',
        month: '',
        place: '',
        detail: '',
        note: '',
        photos: [],
        type: targetType,
      },
    }))
    setYearsMode('addMap')
  }

  function homePositionForView(type = footprintView) {
    const targetType = type || footprintView
    const map = data.homePositions || {}
    if (map[targetType]) return map[targetType]
    if (targetType === 'local' && data.homePosition) return data.homePosition
    return null
  }

  function startAddFootprint(type = footprintView) {
    const targetType = type || footprintView
    if (!homePositionForView(targetType)) {
      setFootprintHomePrompt(targetType)
      return
    }
    beginAddFootprint(targetType)
  }

  function startSetHomePosition(type = footprintHomePrompt || footprintView) {
    const targetType = type || footprintView
    setFootprintHomePrompt(null)
    setFootprintView(targetType)
    setSelectedFootprintId(null)
    setEditingFootprintId(null)
    setPendingHomePosition(homePositionForView(targetType) || { x: 50, y: 56 })
    setYearsMode('setHome')
  }

  function pickHomePosition(event) {
    const rect = event.currentTarget.getBoundingClientRect()
    const x = Math.max(2, Math.min(98, ((event.clientX - rect.left) / rect.width) * 100))
    const y = Math.max(2, Math.min(98, ((event.clientY - rect.top) / rect.height) * 100))
    setPendingHomePosition({ x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 })
  }

  function saveHomePosition() {
    if (!pendingHomePosition) {
      setFootprintModal({ title: '还没有选好家', text: '请先在地图上点击家的位置。' })
      return
    }
    setData(prev => ({
      ...prev,
      homePosition: footprintView === 'local' ? pendingHomePosition : prev.homePosition,
      homePositions: { ...(prev.homePositions || {}), [footprintView]: pendingHomePosition },
      lastSavedAt: Date.now(),
    }))
    setFootprintModal({ title: '住址已设置', text: `${FOOTPRINT_TYPES[footprintView]}地图的家已经设置好了。以后粒会从这里出发。` })
    setYearsMode('browseFull')
  }

  function cancelSetHomePosition() {
    setPendingHomePosition(null)
    setYearsMode('browseFull')
  }

  function setCustomFootprintScene() {
    // 只切换到自定模式。即使暂时还没有图片，也要显示“更换图片”入口。
    setFootprintModal(null)
    setData(prev => ({
      ...prev,
      yearsScene: 'custom',
      lastSavedAt: Date.now(),
    }))
  }

  function askSnowballFootprintMemory() {
    const draft = data.footprintDraft || DEFAULT.footprintDraft
    const year = Number(draft.year || 0)
    const month = Number(draft.month || 0)
    if (!year || !month) {
      setFootprintModal({ title: '雪粒还不知道月份', text: '先填写年份和月度，雪粒才知道该去哪里找记录。' })
      return
    }

    const monthRecords = (data.records || []).filter(record => {
      const d = parseLocalDate(record.date || data.date)
      return d.getFullYear() === year && d.getMonth() + 1 === month
    })

    if (!monthRecords.length) {
      setFootprintModal({ title: '雪粒翻了翻记录', text: '抱歉，雪粒也没找到记录。' })
      return
    }

    const steps = monthRecords.map(record => ({
      date: record.date || '某一天',
      steps: Number(record.steps || record.yesterdaySteps || 0),
    }))
    const avgSteps = Math.round(steps.reduce((sum, item) => sum + item.steps, 0) / Math.max(1, steps.length))
    const topDays = steps
      .filter(item => item.steps > 0)
      .sort((a, b) => b.steps - a.steps)
      .slice(0, 3)
      .map(item => `${item.date} ${item.steps}步`)
      .join('；')

    const moods = monthRecords
      .map(record => record.mood || record.moodKeyword)
      .filter(Boolean)
    const moodText = moods.length ? `心情记录里，出现过：${[...new Set(moods)].slice(0, 5).join('、')}。` : '那个月没有留下清楚的心情记录。'

    setFootprintModal({
      title: '雪粒帮你想了想',
      text: `${year}年${month}月，雪粒找到 ${monthRecords.length} 条日常记录。平均步数约 ${avgSteps} 步。${topDays ? `步数最高的几天是：${topDays}。` : '还没有可用的步数高峰。'}${moodText}`,
    })
  }

  function saveFootprint() {
    const draft = data.footprintDraft || DEFAULT.footprintDraft
    const year = String(draft.year || '').trim()
    const month = String(draft.month || '').trim()
    const place = String(draft.place || '').trim()
    const type = draft.type || 'local'

    if (!year || !month || !place) return
    if (!isValidFootprintPlace(type, place)) return

    let savedId = editingFootprintId || Date.now()

    setData(prev => {
      const oldItem = (prev.footprints || []).find(item => item.id === editingFootprintId)
      savedId = oldItem?.id || savedId
      const manualPos = footprintHasManualPosition(draft) ? normalizeFootprintPoint(draft) : null
      const item = {
        id: savedId,
        year,
        month,
        type,
        place,
        detail: String(draft.detail || '').trim(),
        note: String(draft.note || '').trim(),
        photos: Array.isArray(draft.photos) ? draft.photos.slice(0, 3) : [],
        ...(manualPos ? { x: manualPos.x, y: manualPos.y, positionMode: 'manual' } : {}),
      }
      const nextFootprints = oldItem
        ? (prev.footprints || []).map(fp => fp.id === oldItem.id ? item : fp)
        : [...(prev.footprints || []), item]
      return {
        ...prev,
        footprints: nextFootprints,
        footprintDraft: { year: '', month: '', type, place: '', detail: '', note: '', photos: [] },
      }
    })
    setEditingFootprintId(null)
    setSelectedFootprintId(savedId)
    setYearsMode('browseFull')
  }

  function cancelFootprintEdit() {
    setEditingFootprintId(null)
    setData(prev => ({
      ...prev,
      footprintDraft: { year: '', month: '', type: footprintView, place: '', detail: '', note: '', photos: [] },
    }))
    setYearsMode('browseFull')
  }

  function startEditFootprint(item) {
    if (!item) return
    setEditingFootprintId(item.id)
    setFootprintView(item.type || 'local')
    setSelectedFootprintId(item.id)
    setData(prev => ({
      ...prev,
      footprintDraft: {
        year: item.year || '',
        month: item.month || '',
        type: item.type || 'local',
        place: item.place || '',
        detail: item.detail || '',
        note: item.note || '',
        photos: Array.isArray(item.photos) ? item.photos.slice(0, 3) : [],
        ...(footprintHasManualPosition(item) ? {
          x: normalizeFootprintPoint(item).x,
          y: normalizeFootprintPoint(item).y,
          positionMode: item.positionMode || 'manual',
        } : {}),
      },
    }))
    setYearsMode('addMap')
  }

  function requestDeleteFootprint(item) {
    if (!item) return
    setPendingFootprintDelete({
      id: item.id,
      title: '删除足迹',
      text: `确定删除 ${item.year}年${item.month}月 · ${item.place} 这条足迹吗？`,
    })
  }

  function confirmDeleteFootprint(id) {
    setData(prev => ({
      ...prev,
      footprints: (prev.footprints || []).filter(item => item.id !== id),
      footprintDraft: editingFootprintId === id ? { year: '', month: '', type: footprintView, place: '', detail: '', note: '', photos: [] } : (prev.footprintDraft || DEFAULT.footprintDraft),
    }))
    if (selectedFootprintId === id) setSelectedFootprintId(null)
    if (editingFootprintId === id) setEditingFootprintId(null)
    setPendingFootprintDelete(null)
  }


  function compressFootprintImage(file, maxSide = 720, quality = 0.58) {
    return new Promise(resolve => {
      if (!file || !file.type?.startsWith('image/')) {
        resolve('')
        return
      }

      const reader = new FileReader()
      reader.onload = () => {
        const img = new Image()
        img.onload = () => {
          const ratio = Math.min(1, maxSide / Math.max(img.width || 1, img.height || 1))
          const canvas = document.createElement('canvas')
          canvas.width = Math.max(1, Math.round((img.width || 1) * ratio))
          canvas.height = Math.max(1, Math.round((img.height || 1) * ratio))
          const ctx = canvas.getContext('2d')
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
          resolve(canvas.toDataURL('image/jpeg', quality))
        }
        img.onerror = () => resolve(String(reader.result || ''))
        img.src = String(reader.result || '')
      }
      reader.onerror = () => resolve('')
      reader.readAsDataURL(file)
    })
  }

  function handleFootprintPhotos(files) {
    const picked = Array.from(files || []).slice(0, 3)
    if (!picked.length) return

    Promise.all(picked.map(file => compressFootprintImage(file))).then(images => {
      const cleanImages = images.filter(Boolean)
      if (!cleanImages.length) return

      setData(prev => {
        const current = prev.footprintDraft || DEFAULT.footprintDraft
        return {
          ...prev,
          footprintDraft: {
            ...current,
            photos: [...(current.photos || []), ...cleanImages].slice(0, 3),
          },
        }
      })
    }).catch(() => {
      setFootprintModal({ title: '照片没有读成功', text: '这张照片雪粒没有读到，请换一张再试。' })
    })
  }


  function handleCustomYearsSceneImage(files) {
    const file = Array.from(files || [])[0]
    if (!file) return

    compressFootprintImage(file, 900, 0.55).then(async image => {
      if (!image) {
        setFootprintModal({ title: '照片没有读成功', text: '这张照片雪粒没有读到，请换一张再试。' })
        return
      }

      // 先立即显示，再分别写入 IndexedDB 和主数据。
      setCustomYearsBgImage(image)

      try {
        await saveSnowballMedia(CUSTOM_YEARS_BG_IDB_KEY, image)
      } catch (error) {
        console.warn('自定足迹背景没有成功保存到 IndexedDB。', error)
      }

      setFootprintModal(null)
      setData(prev => {
        const next = {
          ...prev,
          yearsScene: 'custom',
          // 同时保留一份压缩图在主数据里作为兜底；IndexedDB 可用时会优先读 IndexedDB。
          customYearsSceneImage: image,
          lastSavedAt: Date.now(),
        }
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(dataForLocalStorage(next)))
        } catch (error) {
          console.warn('自定足迹背景主数据没有成功写入 localStorage，但 IndexedDB 已尝试保存。', error)
        }
        return next
      })
    }).catch(() => {
      setFootprintModal({ title: '照片没有读成功', text: '这张照片雪粒没有读到，请换一张再试。' })
    })
  }

  function removeFootprintPhoto(index) {
    setData(prev => {
      const current = prev.footprintDraft || DEFAULT.footprintDraft
      return {
        ...prev,
        footprintDraft: {
          ...current,
          photos: (current.photos || []).filter((_, i) => i !== index),
        },
      }
    })
  }

  function footprintSentence() {
  if (!footprints.length) {
    return '开始记录以后，这里会慢慢写下你和雪粒共同走过的人生。'
  }

  const sorted = [...footprints].sort((a, b) => {
    return Number(a.year) * 100 + Number(a.month)
      - (Number(b.year) * 100 + Number(b.month))
  })

  const first = sorted[0]
  const last = sorted[sorted.length - 1]

  return (
  <>
    从
    <span className="memoryNumber">{first.year}年{first.month}月</span>
    到
    <span className="memoryNumber">{last.year}年{last.month}月</span>
    ，你一共去过
    <span className="memoryNumber">{footprints.length}</span>
    个地方，在地图上留下了动人的痕迹。
  </>
)
}

   const footprintDraft = data.footprintDraft || DEFAULT.footprintDraft
  const currentFootprintType = footprintDraft.type || 'local'
  const currentPlaceOptions = placeOptions(currentFootprintType)
  const placeInputValid = !footprintDraft.place || isValidFootprintPlace(currentFootprintType, footprintDraft.place)
  const selectedFootprint = (footprints || []).find(item => item.id === selectedFootprintId)
 const floatingFootprintMemory = ''

const homeFloatingFootprintMemory = ''

  const footprintMarkerGroups = useMemo(() => {
    const groups = []
    const visible = (footprints || []).filter(item => item.type === footprintView)

    visible.forEach(item => {
      const pos = footprintPosition(item)
      const existing = groups.find(group => footprintDistance(group.pos, pos) <= 5)
      const itemKey = `${item.year}-${String(item.month).padStart(2, '0')}-${item.id || ''}`

      if (!existing) {
        groups.push({
          key: `${item.type}-${Math.round(pos.x * 10) / 10}-${Math.round(pos.y * 10) / 10}`,
          item,
          pos,
          count: 1,
          latestKey: itemKey,
        })
        return
      }

      existing.count += 1
      // 坐标簇的代表点用平均值，这样用户几次点在很近的位置时，图钉会落在视觉中心。
      existing.pos = normalizeFootprintPoint({
        x: (existing.pos.x * (existing.count - 1) + pos.x) / existing.count,
        y: (existing.pos.y * (existing.count - 1) + pos.y) / existing.count,
      })
      if (itemKey > existing.latestKey) {
        existing.item = item
        existing.latestKey = itemKey
      }
    })

    return groups.map(group => ({
      ...group,
      item: { ...group.item, x: group.pos.x, y: group.pos.y, positionMode: 'manual' },
    }))
  }, [footprints, footprintView])

  const footprintCatRoute = useMemo(() => {
    const homeMap = data.homePositions || {}
    const home = homeMap[footprintView] || (footprintView === 'local' ? data.homePosition : null)
    if (!home) return []

    const visible = (footprints || []).filter(item => item.type === footprintView)
    if (!visible.length) return [{ x: home.x, y: home.y }]

    // 航线直接使用当前地图上的坐标簇图钉，保证“图钉在哪里，航线就落在哪里”。
    const routeGroups = footprintMarkerGroups

    const destinations = [...routeGroups]
      .sort((a, b) => b.count - a.count)
      .map(group => footprintPosition(group.item))
      .filter(pos => Math.abs(pos.x - home.x) >= 2 || Math.abs(pos.y - home.y) >= 2)

    const route = [{ x: home.x, y: home.y }]
    destinations.forEach(pos => {
      if (route.length >= 3) return
      if (!route.some(old => Math.abs(old.x - pos.x) < 2 && Math.abs(old.y - pos.y) < 2)) route.push(pos)
    })

    return route
  }, [data.homePosition, data.homePositions, footprints, footprintView, footprintMarkerGroups])

  const activeHomePosition = homePositionForView(footprintView)




  const DAILY_VIEW_TABS = [
    { key: 'all', label: '全部' },
    { key: 'steps', label: '步数' },
    { key: 'offscreen', label: '离机' },
    { key: 'screen', label: '屏时' },
    { key: 'food', label: '饮食' },
    { key: 'mood', label: '心情' },
  ]

  const dailyViewHeaders = {
    all: ['日期', '步数', '离机', '屏时', '食物', '口味', '心情', '互动'],
    steps: ['日期', '步数'],
    offscreen: ['日期', '离机'],
    screen: ['日期', '屏时'],
    food: ['日期', '食物', '口味'],
    mood: ['日期', '心情'],
  }[dailyViewTab] || ['日期', '步数', '离机', '屏时', '食物', '口味', '心情', '互动']

  const dailyTableGrid = {
    all: '1.15fr 0.8fr 0.8fr 0.8fr 1.15fr 0.9fr 1fr 0.7fr 42px 42px 48px',
    steps: '1.2fr 1fr 42px 42px 48px',
    offscreen: '1.15fr 0.9fr 42px 42px 48px',
    screen: '1.15fr 0.9fr 42px 42px 48px',
    food: '0.85fr 1.7fr 0.85fr 42px 42px 48px',
    mood: '0.85fr 1.7fr 42px 42px 48px',
  }[dailyViewTab] || '1.15fr 0.8fr 0.8fr 0.8fr 1.15fr 0.9fr 1fr 0.7fr 42px 42px 48px'

  function dailyGroupCellsForView(group) {
    const openMark = !!expandedDailyMonths[group.key] ? '−' : '+'
    if (dailyViewTab === 'steps') return [
      <span className="dailyMonthName" key="month">{openMark} {group.label}</span>,
      <span key="steps">{group.avgSteps}</span>,
    ]
    if (dailyViewTab === 'offscreen') return [
      <span className="dailyMonthName" key="month">{openMark} {group.label}</span>,
      <span key="offscreen">{group.avgOffscreen}</span>,
    ]
    if (dailyViewTab === 'screen') return [
      <span className="dailyMonthName" key="month">{openMark} {group.label}</span>,
      <span key="screen">{group.avgScreen}</span>,
    ]
    if (dailyViewTab === 'food') return [
      <span className="dailyMonthName" key="month">{openMark} {group.label}</span>,
      <span className="dailyWrapCell" key="food" title={group.topFood}>{group.topFood}</span>,
      <span className="dailyWrapCell" key="taste" title={group.topTaste}>{group.topTaste}</span>,
    ]
    if (dailyViewTab === 'mood') return [
      <span className="dailyMonthName" key="month">{openMark} {group.label}</span>,
      <span className="dailyWrapCell" key="mood" title={group.topMood}>{group.topMood}</span>,
    ]
    return [
      <span className="dailyMonthName" key="month">{openMark} {group.label}</span>,
      <span key="steps">{group.avgSteps}</span>,
      <span key="offscreen">{group.avgOffscreen}</span>,
      <span key="screen">{group.avgScreen}</span>,
      <span className="dailyWrapCell" key="food" title={group.topFood}>{group.topFood}</span>,
      <span className="dailyWrapCell" key="taste" title={group.topTaste}>{group.topTaste}</span>,
      <span className="dailyWrapCell" key="mood" title={group.topMood}>{group.topMood}</span>,
      <span key="brain">{group.avgBrain}</span>,
    ]
  }

  function dailyRecordCellsForView(r) {
    const stepsValue = Number(r.steps || r.yesterdaySteps || 0)
    const offscreenValue = r.yesterdaySleep || r.offscreenTime || ''
    const offscreenText = formatClockForDaily(offscreenValue) || '—'
    const screenMinutes = recordScreenMinutes(r)
    const screenGood = Number.isFinite(screenMinutes) && screenMinutes <= 5 * 60
    const screenButton = data.developerMode ? (
      <button
        className={`dailyScreenLink dailyScreenValuePlain ${dailyValueClass(screenGood)}`}
        type="button"
        onClick={event => {
          event.preventDefault()
          event.stopPropagation()
          openScreenDetailForDate(r.date, 'home')
        }}
        key="screen"
        aria-label="打开屏幕数据校验"
      >
        {formatDurationFromMinutes(screenMinutes)}
      </button>
    ) : (
      <span className={`dailyScreenValuePlain ${dailyValueClass(screenGood)}`} key="screen">
        {formatDurationFromMinutes(screenMinutes)}
      </span>
    )
    const foodCell = renderDailyTagList(r.food || '', tag => foodPrimaryTagsForTag(tag).length > 0)
    const tasteCell = renderDailyTagList(r.taste || '', tag => HEALTHY_TASTE_OPTIONS.includes(tag))
    const moodCell = renderDailyTagList(r.mood || '', tag => POSITIVE_MOOD_OPTIONS.includes(tag))
    if (dailyViewTab === 'steps') return [
      <span key="date">{formatDailyDateWithWeek(r.date)}</span>,
      <span key="steps" className={dailyValueClass(stepsValue >= 5000)}>{stepsValue}</span>,
    ]
    if (dailyViewTab === 'offscreen') return [
      <span key="date">{formatDailyDateWithWeek(r.date)}</span>,
      <span key="offscreen" className={dailyValueClass(sleepGood(offscreenValue))}>{offscreenText}</span>,
    ]
    if (dailyViewTab === 'screen') return [
      <span key="date">{formatDailyDateWithWeek(r.date)}</span>,
      screenButton,
    ]
    if (dailyViewTab === 'food') return [
      <span key="date">{formatDailyDateWithWeek(r.date)}</span>,
      foodCell,
      tasteCell,
    ]
    if (dailyViewTab === 'mood') return [
      <span key="date">{formatDailyDateWithWeek(r.date)}</span>,
      moodCell,
    ]
    return [
      <span key="date">{formatDailyDateWithWeek(r.date)}</span>,
      <span key="steps" className={dailyValueClass(stepsValue >= 5000)}>{stepsValue}</span>,
      <span key="offscreen" className={dailyValueClass(sleepGood(offscreenValue))}>{offscreenText}</span>,
      screenButton,
      foodCell,
      tasteCell,
      moodCell,
      <span key="brain">{recordBrainPercent(r)}%</span>,
    ]
  }

  const selectedScreenRows = (data.screenRecords || [])
    .filter(item => dateKey(item?.date) === dateKey(selectedScreenDate))
  const selectedScreenDetailTotal = selectedScreenRows
    .reduce((sum, item) => sum + screenMinutesFromRecord(item), 0)
  const selectedScreenDailyRecord = dailyRecordForDate(data.records || [], selectedScreenDate)
  const selectedScreenDailyTotal = recordScreenMinutes(selectedScreenDailyRecord || {})

  return (
    <main
      className="app"
      style={{
        '--hero-cat-width': MOTION.heroCatWidth,
        '--hero-cat-max-width': MOTION.heroCatMaxWidth,
        '--footprint-cat-height': MOTION.footprintCatHeight,
        '--footprint-cat-left': MOTION.footprintCatLeft,
        '--footprint-cat-bottom': MOTION.footprintCatBottom,
      }}
    >
      <Home
        MOTION={MOTION}
        bgImg={bgImg}
        adoptDays={adoptDays}
        gen={gen}
        showDataPanel={showDataPanel}
        showYearsPanel={showYearsPanel}
        showThingsPanel={showThingsPanel}
        showPeoplePanel={showPeoplePanel}
        setUsageModal={setUsageModal}
        canPlayMotionVideo={canPlayMotionVideo}
        interactionFrameSrc={homeInteractionFrame}
        interactionPlaying={homeInteractionPlaying}
        playHomeCatInteraction={playHomeCatInteraction}
        PngSequence={PngSequence}
        MAX_MOTION_FRAMES={MAX_MOTION_FRAMES}
        catImg={catImg}
        imageFilter={imageFilter}
        homeYesterdaySteps={homeYesterdaySteps}
        body={body}
        openDailyDetail={openDailyDetail}
        homeYesterdaySleep={homeYesterdaySleep}
        furDisplay={furDisplay}
        food={food}
        mood={mood}
        beginHomeTodayEdit={beginHomeTodayEdit}
        saveHomeGoodNight={saveHomeGoodNight}
        openTodayStatus={() => setTodayStatusModal(true)}
        homeTraceStats={homeTraceStats}
        call={call}
        brain={brain}
        data={data}
        setData={setData}
        openNutritionPage={openNutritionPage}
        openTrainPage={openTrainPage}
        openFootprintPage={openFootprintPage}
        openThingPage={openThingPage}
        openPeoplePage={openPeoplePage}
        setYearsMode={setYearsMode}
        setShowYearsPanel={setShowYearsPanel}
        openThings={openThings}
      />

      {showPeoplePanel && (
        <People
          people={data.people || []}
          birthDate={data.peopleBirthDate || ''}
          setData={setData}
          onClose={() => setShowPeoplePanel(false)}
        />
      )}

      <Onboarding
        data={data}
        setData={setData}
        deviceData={DeviceData}
      />
      {usageModal && (
        <div className="noticeOverlay usageInfoOverlay" role="dialog" aria-modal="true" aria-label="使用说明">
          <div className="noticeBox usageInfoBox">
            <h2>使用说明</h2>
            <div className="usageInfoText">{USAGE_TEXT}</div>
            <div className="usageVersionBlock">
              <p>雪粒 Snowlet</p>
              <button type="button" className="usageVersionTap" onClick={handleVersionTap}>Version 1.1</button>
              <p>Copyright © 2026</p>
              <p>专利申请中 · 仅供测试使用</p>
              {data.developerMode && (
                <button type="button" className="developerModeLine" onClick={closeDeveloperMode}>开发者模式已开启 · 点此关闭</button>
              )}
            </div>
            <button type="button" className="usageCloseBtn" onClick={() => setUsageModal(false)}>知道了</button>
          </div>
        </div>
      )}
      {todayStatusModal && <TodayStatusModal report={todayStatusReport} onClose={() => setTodayStatusModal(false)} />}
      {pendingDailyEdit && (
        <div className="noticeOverlay">
          <div className="noticeBox dailyReasonBox">
            <h2>为什么修改这一天的数据？</h2>
            <p>{pendingDailyEdit.date}</p>
            <div className="dailyReasonList">
              {DAILY_EDIT_REASONS.map(reason => (
                <label key={reason}>
                  <input type="radio" name="dailyEditReason" checked={dailyEditReason === reason} onChange={() => setDailyEditReason(reason)} />
                  <span>{reason}</span>
                </label>
              ))}
            </div>
            <div className="dailyEditBottomActions">
              <button type="button" onClick={confirmDailyEdit}>确认开始修改</button>
              <button type="button" onClick={cancelDailyEditReason}>取消</button>
            </div>
          </div>
        </div>
      )}

      {pendingDailyDelete && (
        <div className="noticeOverlay">
          <div className="noticeBox dailyReasonBox">
            <h2>确认删除？</h2>
            <p>将删除 {pendingDailyDelete.date} 的日常数据和该日期的屏幕时间详情。</p>
            <div className="dailyEditBottomActions">
              <button type="button" onClick={confirmDailyDelete}>确认删除</button>
              <button type="button" onClick={() => setPendingDailyDelete(null)}>取消</button>
            </div>
          </div>
        </div>
      )}

      {dailyDateModal && (
        <div className="noticeOverlay">
          <div className="noticeBox dailyDateModalBox">
            <h2>新增日期</h2>
            <p>请输入要新增的过去日期，例如 2026/7/1。</p>
            <input
              className="dailyDateModalInput"
              value={dailyDateModal.value}
              onChange={e => setDailyDateModal({ value: e.target.value })}
              placeholder="例如 2026/7/1"
              autoFocus
            />
            <div className="dailyEditBottomActions">
              <button type="button" onClick={confirmAddDailyDate}>确认新增</button>
              <button type="button" onClick={() => setDailyDateModal(null)}>取消</button>
            </div>
          </div>
        </div>
      )}

      {dailyModal && <NoticeModal title={dailyModal.title} text={dailyModal.text} onClose={closeDaily} />}
      {upgradeModal && <NoticeModal title={upgradeModal.title} text={upgradeModal.text} onClose={closeUpgrade} />}
      {showDataPanel && (
        <>
          <style>{`
            .dailyEditOnlyPage .dailyEditStickyActions {
              position: sticky !important;
              top: 0 !important;
              z-index: 120 !important;
              display: grid !important;
              grid-template-columns: repeat(2, minmax(72px, 96px)) !important;
              justify-content: end !important;
              gap: 8px !important;
              margin: -2px 0 10px !important;
              padding: 6px 0 9px !important;
              background:
                linear-gradient(
                  180deg,
                  rgba(13, 24, 40, 0.98) 0%,
                  rgba(13, 24, 40, 0.94) 76%,
                  rgba(13, 24, 40, 0) 100%
                ) !important;
              backdrop-filter: blur(8px);
              -webkit-backdrop-filter: blur(8px);
            }

            .dailyEditOnlyPage .dailyEditStickyActions button {
              width: auto !important;
              min-width: 72px !important;
              min-height: 34px !important;
              height: 34px !important;
              margin: 0 !important;
              padding: 6px 14px !important;
              font-size: 13px !important;
              line-height: 1 !important;
            }
          `}</style>
          <div className="dataOverlay dailyDataOverlay">
          {dailyMode === 'home' || dailyMode === 'edit' ? (
            <div className="dailyPanelScene">
              <img className="dailyPanelBg" src="/daily_background.png" alt="日常背景" />
              <img className="dailyPanelCat" src="/daily_cat.png" alt="日常雪粒" />
            </div>
          ) : null}

          {dailyMode === 'nutrition' ? (
            <Nutrition
              PngSequence={PngSequence}
              dailyTasteStats={dailyTasteStats}
              dailyNutritionStats={dailyNutritionStats}
              nutritionMotionOn={nutritionMotionOn}
              nutritionTasteLine={nutritionTasteLine}
              dailyStatRange={dailyStatRange}
              setDailyStatRange={setDailyStatRange}
              dailyRangeTabs={DAILY_RANGE_TABS}
              openDailyDetail={openDailyDetail}
              onBackHome={() => setShowDataPanel(false)}
            />
          ) : dailyMode === 'train' ? (
            <Train
              PngSequence={PngSequence}
              dailyTrainRows={dailyTrainRows}
              trainIsRunning={trainIsRunning}
              dailyStatRange={dailyStatRange}
              trainRunKey={trainRunKey}
              dailyTrainMaxPickups={dailyTrainMaxPickups}
              dailyTrainMaxDuration={dailyTrainMaxDuration}
              trainTopApps={trainTopApps}
              appIconMap={APP_ICON_MAP}
              trainImageForCategory={trainImageForCategory}
              trainWidthForStats={trainWidthForStats}
              trainSpeedForStats={trainSpeedForStats}
              trainDistanceForStats={trainDistanceForStats}
              trainOpacityForStats={trainOpacityForStats}
              dailyRangeTabs={DAILY_RANGE_TABS}
              setDailyStatRange={setDailyStatRange}
              dailyTopApps={dailyTopApps}
              dailyTopAppSummary={dailyTopAppSummary}
              openDailyDetail={openDailyDetail}
              onBackHome={() => setShowDataPanel(false)}
            />
          ) : dailyMode === 'steps-auto' ? (
            <StepAutoTable
              records={data.stepAutoRecords || []}
              onBack={() => setDailyMode('home')}
            />
          ) : dailyMode === 'screen' ? (
            <div className="dailyPage dailySubPage dailyScreenPage dailyScreenRawPage">
              <div className="dailyTableCard dailyScreenDetailCard dailyScreenPlainCard" style={{ overflowX: 'auto' }}>
                <label className="dailyScreenDateLabel">日期
                  <input value={selectedScreenDate} disabled />
                </label>
                <div className="screenDetailScroll">
                  <div className="screenDetailHeader screenDetailHeaderEdit">
                    <span>日期</span><span>雪粒APP</span><span>真实APP</span><span>Package</span><span>屏时</span><span>次数</span><span></span>
                  </div>
                  <div className="screenDetailBody">
                  {(data.screenRecords || []).map((row, index) => ({ row, index })).filter(item => dateKey(item.row.date) === dateKey(selectedScreenDate)).map(({ row, index }) => (
                    <div className="screenDetailRow screenDetailEditRow" key={row.id || index}>
                      <input value={row.date || selectedScreenDate} disabled />
                      <select value={row.app || ''} onChange={e => updateScreenRecord(index, 'app', e.target.value)} title={row.app ? '雪粒已识别名称' : '未匹配时可手动选择'}>
                        <option value="">未匹配</option>
                        {APP_OPTIONS.map(app => <option key={app} value={app}>{app}</option>)}
                      </select>
                      <input value={row.realAppName || ''} onChange={e => updateScreenRecord(index, 'realAppName', e.target.value)} placeholder="手机返回名称" title="输入真实名称后自动匹配雪粒 APP 名" />
                      <input value={row.packageName || ''} onChange={e => updateScreenRecord(index, 'packageName', e.target.value)} placeholder="Package Name" />
                      <input value={formatHoursInputFromMinutes(screenMinutesFromRecord(row))} type="number" min="0" step="0.1" onChange={e => updateScreenRecord(index, 'minutes', e.target.value)} placeholder="小时" />
                      <input value={row.pickups || ''} type="number" min="0" onChange={e => updateScreenRecord(index, 'pickups', e.target.value)} placeholder="次数" />
                      <button type="button" className="dailyRowDeleteBtn screenRowDeleteBtn" aria-label="删除这条 APP 详情" title="删除" onClick={() => deleteScreenRecord(index)}>×</button>
                    </div>
                  ))}
                    {!(data.screenRecords || []).some(row => dateKey(row.date) === dateKey(selectedScreenDate)) && <p className="screenEmptyTip">这个日期还没有屏幕详情记录。</p>}
                  </div>
                </div>
                <div className="screenDetailSummary">
                  <span>详情小计 <strong>{formatDurationFromMinutes(selectedScreenDetailTotal)}</strong></span>
                  <span>日常屏时 <strong>{formatDurationFromMinutes(selectedScreenDailyTotal)}</strong></span>
                </div>
                <div className="screenDetailActions">
                  <button type="button" className="dailyAddDateBtn" onClick={() => refreshScreenRecordsForDate(selectedScreenDate)}>重新获取</button>
                  <button type="button" className="dailyAddDateBtn" onClick={addScreenRecord}>新增</button>
                  <button type="button" className="dailyAddDateBtn" onClick={saveScreenDetailAndReturn}>保存返回</button>
                </div>
              </div>
            </div>
          ) : dailyMode === 'home' ? (
            <div className="dailyPage dailyHomePage">
              <div className="dailyTableNavLine">
                <button type="button" className="dailyBackMini" onClick={() => setShowDataPanel(false)} aria-label="返回主页">&lt;</button>
                <div className="dailyViewTabs dailyViewTabsPlain" role="tablist" aria-label="日常数据筛选">
                  {DAILY_VIEW_TABS.map(tab => (
                    <button
                      key={tab.key}
                      type="button"
                      className={dailyViewTab === tab.key ? 'active' : ''}
                      onClick={() => setDailyViewTab(tab.key)}
                    >{tab.label}</button>
                  ))}
                </div>
              </div>

              <div className="dailyTableCard dailyGlassScreen dailyUnifiedTableCard" key={data.lastSavedAt || 0}>
                <div className={`dailyTableHeader dailyTableHeaderV2 dailyUnifiedHeader dailyTab-${dailyViewTab}`} style={{ gridTemplateColumns: dailyTableGrid }}>
                  {dailyViewHeaders.map(item => (
                    item === '屏时' && dailyViewTab === 'screen'
                      ? <span className="dailyLinkedHeader" key={item}>屏时<button type="button" className="dailyHeaderNavLink dailyTrainHeaderLink" onClick={() => openTrainPage('yesterday')} aria-label="查看信息列车"><span className="dailyHeaderNavText">查看信息列车</span><span className="dailyHeaderNavIcon" aria-hidden="true">🚆</span></button></span>
                      : item === '食物' && dailyViewTab === 'food'
                        ? <span className="dailyLinkedHeader" key={item}>食物<button type="button" className="dailyHeaderNavLink dailyNutritionHeaderLink" onClick={() => openNutritionPage('today')} aria-label="查看营养光谱"><span className="dailyHeaderNavText">查看营养光谱</span><span className="dailyHeaderNavIcon" aria-hidden="true">🌈</span></button></span>
                        : item === '步数' && dailyViewTab === 'steps' && data.developerMode
                          ? <span className="dailyLinkedHeader" key={item}>步数<button type="button" className="dailyHeaderNavLink" onClick={openStepAutoTable} aria-label="查看步数自动获取表"><span className="dailyHeaderNavText">详情</span></button></span>
                          : <span key={item}>{item}</span>
                  ))}
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
                {latestRecords.length === 0 && (
                  <div className="dailyEmpty">
                    <p>暂无历史记录</p>
                    <button onClick={() => setDailyMode('edit')}>新增今天的数据</button>
                  </div>
                )}

                <div className="dailyTableBody">
                  {dailyMonthGroups.map(group => {
                    const expanded = !!expandedDailyMonths[group.key]
                    return (
                      <div className="dailyMonthBlock" key={group.key}>
                        <button className={`dailyMonthRow dailyUnifiedMonthRow dailyTab-${dailyViewTab}`} type="button" onClick={() => toggleDailyMonth(group.key)} style={{ gridTemplateColumns: dailyTableGrid }}>
                          {dailyGroupCellsForView(group)}
                          <span className="dailyMonthCount">{group.records.length}天</span>
                          <span></span>
                          <span></span>
                        </button>

                        {expanded && group.records.map((r, i) => (
                          <div className={`dailyTableRow dailyChildRow dailyTableRowV2 dailyUnifiedRow dailyTab-${dailyViewTab}`} key={`${r.date}-${i}`} style={{ gridTemplateColumns: dailyTableGrid }}>
                            {dailyRecordCellsForView(r)}
                            <button type="button" className="dailyRowEditBtn dailyIconBtn" onClick={() => refreshDailyRecordForDate(r)} title="只重新获取这一天的日常数据">↻</button>
                            <button type="button" className="dailyRowEditBtn dailyIconBtn" onClick={() => beginDailyEdit(r)} title="修改">✎</button>
                            <button type="button" className="dailyRowDeleteBtn dailyIconBtn" onClick={() => requestDailyDelete(r)} title="删除">×</button>
                          </div>
                        ))}
                      </div>
                    )
                  })}
                </div>
                <div className="dailyTableFooter">
                  <button type="button" className="dailyAddDateBtn dailyAddDateLink" onClick={openAddDailyDateModal}>＋ 新增日期</button>
                </div>
              </div>
            </div>
          ) : (
            <div className="dataPanel dataPanelOnScene dailyEditPage dailyEditOnlyPage">
              <div className="dataEdit dailyStructuredEdit">
                <div className="dailyEditStickyActions" aria-label="每日数据编辑操作">
                  <button type="button" onClick={saveToday}>保存</button>
                  <button type="button" onClick={cancelDailyEditAndReturn}>放弃</button>
                </div>
                <div className="dailyEditTwoCol dailyEditTopGrid">
                  <label>日期
                    <div className="dailyReadonlyValue">
                      {formatDailyDateWithWeek(data.date)}
                    </div>
                  </label>

                  <label>当日步数
                    <input type="number" inputMode="numeric" value={Number(data.yesterdaySteps || 0) ? data.yesterdaySteps : ''} onChange={e => setData({ ...data, yesterdaySteps: e.target.value })} placeholder="0" />
                  </label>
                </div>

                <div className="dailyEditTwoCol dailyEditTopGrid">
                  <label>当日离屏
                    <input value={data.yesterdaySleepTime} onChange={e => setData({ ...data, yesterdaySleepTime: e.target.value })} placeholder="例如23:30或26:00" />
                  </label>

                  <label>屏幕时长
                    <input type="number" step="0.1" value={data.screenMinutes || ''} onChange={e => setData({ ...data, screenMinutes: e.target.value })} placeholder="小时" />
                  </label>
                </div>

                <div className="dailyConversationEditFields">
                  <label>饮食描述
                    <textarea
                      value={conversationEditDraft.foodDescription || ''}
                      onChange={event => setConversationEditDraft(prev => ({ ...prev, foodDescription: event.target.value }))}
                      placeholder="通话中关于吃了什么、口味如何的回答会保存在这里。"
                    />
                    <span className="dailyConversationResult">
                      食物：{deriveConversationFields(conversationEditDraft).food || '—'}　口味：{deriveConversationFields(conversationEditDraft).taste || '正常'}
                    </span>
                  </label>

                  <label>心情描述
                    <textarea
                      value={conversationEditDraft.moodDescription || ''}
                      onChange={event => setConversationEditDraft(prev => ({ ...prev, moodDescription: event.target.value }))}
                      placeholder="通话中关于当天心情的回答会保存在这里。"
                    />
                    <span className="dailyConversationResult">
                      心情：{deriveConversationFields(conversationEditDraft).mood || '—'}
                    </span>
                  </label>

                  <label>互动文字
                    <textarea
                      value={conversationEditDraft.interactionText || ''}
                      onChange={event => setConversationEditDraft(prev => ({ ...prev, interactionText: event.target.value }))}
                      placeholder="其它通话内容会不断添加在这里。"
                    />
                    <span className="dailyConversationResult">
                      脑动：{deriveConversationFields(conversationEditDraft).brainPercent}%
                    </span>
                  </label>
                </div>

                <div className="dailyEditTwoCol dailyEditMetaRow">
                  <label>当日互动
                    <input value={`${deriveConversationFields(conversationEditDraft).brainPercent}%`} disabled />
                  </label>

                  <label className="dailyInstallMuted">安装日期
                    <input
                      value={data.installDate || ''}
                      readOnly={!installDateUnlocked}
                      aria-readonly={!installDateUnlocked}
                      onPointerDown={event => {
                        if (!installDateUnlocked) unlockInstallDate(event)
                      }}
                      onFocus={event => {
                        if (!installDateUnlocked) unlockInstallDate(event)
                      }}
                      onKeyDown={event => {
                        if (!installDateUnlocked) {
                          event.preventDefault()
                          unlockInstallDate(event)
                        }
                      }}
                      onChange={event => {
                        if (!installDateUnlocked) return
                        setData({ ...data, installDate: event.target.value })
                      }}
                      placeholder="例如 2026/7/1"
                    />
                  </label>
                </div>
              </div>
            </div>
          )}
          </div>
        </>
      )}


      {showYearsPanel && (
        <Footprint
          PngSequence={PngSequence}
          MOTION={MOTION}
          YEARS_SCENES={YEARS_SCENES}
          FOOTPRINT_TYPES={FOOTPRINT_TYPES}
          FOOTPRINT_POSITIONS={FOOTPRINT_POSITIONS}
          yearsMode={yearsMode}
          setYearsMode={setYearsMode}
          footprintView={footprintView}
          setFootprintView={setFootprintView}
          updateFootprintDraft={updateFootprintDraft}
          pickHomePosition={pickHomePosition}
          pendingHomePosition={pendingHomePosition}
          activeHomePosition={activeHomePosition}
          footprintCatRoute={footprintCatRoute}
          placeOptions={placeOptions}
          fallbackFootprintPosition={fallbackFootprintPosition}
          footprintDraft={footprintDraft}
          chooseFootprintPlace={chooseFootprintPlace}
          pickFootprintDraftPosition={pickFootprintDraftPosition}
          footprintMarkerGroups={footprintMarkerGroups}
          footprintPosition={footprintPosition}
          selectedFootprintId={selectedFootprintId}
          setSelectedFootprintId={setSelectedFootprintId}
          selectedFootprint={selectedFootprint}
          setFootprintImagePreview={setFootprintImagePreview}
          startEditFootprint={startEditFootprint}
          requestDeleteFootprint={requestDeleteFootprint}
          saveHomePosition={saveHomePosition}
          cancelSetHomePosition={cancelSetHomePosition}
          data={data}
          setData={setData}
          currentFootprintType={currentFootprintType}
          currentPlaceOptions={currentPlaceOptions}
          placeInputValid={placeInputValid}
          askSnowballFootprintMemory={askSnowballFootprintMemory}
          handleFootprintPhotos={handleFootprintPhotos}
          removeFootprintPhoto={removeFootprintPhoto}
          saveFootprint={saveFootprint}
          cancelFootprintEdit={cancelFootprintEdit}
          footprints={footprints}
          startAddFootprint={startAddFootprint}
          startSetHomePosition={startSetHomePosition}
          yearsScene={yearsScene}
          footprintSentence={footprintSentence}
          homeFloatingFootprintMemory={homeFloatingFootprintMemory}
          handleCustomYearsSceneImage={handleCustomYearsSceneImage}
          setCustomFootprintScene={setCustomFootprintScene}
          setShowYearsPanel={setShowYearsPanel}
          openCurrentFootprintMode={openCurrentFootprintMode}
          footprintModal={footprintModal}
          setFootprintModal={setFootprintModal}
          footprintImagePreview={footprintImagePreview}
        />
      )}

      {footprintImagePreview && (
        <div className="imagePreviewOverlay" onClick={() => setFootprintImagePreview(null)}>
          <div className="imagePreviewBox" onClick={e => e.stopPropagation()}>
            <button className="imagePreviewClose" onClick={() => setFootprintImagePreview(null)} aria-label="关闭大图">×</button>
            <img src={footprintImagePreview} alt="足迹大图" />
          </div>
        </div>
      )}

      {showThingsPanel && (
        <Things
          data={data}
          setData={setData}
          catImg={catImg}
          speak={speak}
          initialMode={thingsStartMode}
          onClose={() => setShowThingsPanel(false)}
        />
      )}

      {footprintHomePrompt && (
        <div className="noticeOverlay">
          <div className="noticeBox thingConfirmBox footprintHomePromptBox">
            <h2>{FOOTPRINT_TYPES[footprintHomePrompt] || '这个地图'}还没有设置住址</h2>
            <p>设置后，粒会在这个地图的家中等待你，并自动绘制从家到最常去地点的路线。</p>
            <div className="thingConfirmButtons footprintHomePromptButtons">
              <button onClick={() => startSetHomePosition(footprintHomePrompt || footprintView)}>立即设置住址</button>
              <button onClick={() => beginAddFootprint(footprintHomePrompt || footprintView)}>继续添加足迹</button>
              <button onClick={() => setFootprintHomePrompt(null)}>取消</button>
            </div>
          </div>
        </div>
      )}

      {pendingFootprintDelete && (
        <div className="noticeOverlay">
          <div className="noticeBox thingConfirmBox thingDeleteConfirmBox">
            <h2>{pendingFootprintDelete.title}</h2>
            <p>{pendingFootprintDelete.text}</p>
            <div className="thingConfirmButtons">
              <button className="dangerConfirmBtn" onClick={() => confirmDeleteFootprint(pendingFootprintDelete.id)}>确认删除</button>
              <button onClick={() => setPendingFootprintDelete(null)}>再想想</button>
            </div>
          </div>
        </div>
      )}

      {showReward && !upgradeModal && (
  <div className="rewardOverlay">
          <div className="rewardBox">
            <video
              src={REWARD_VIDEO}
              className="rewardVideo"
              autoPlay
              muted
              loop
              playsInline
              preload="auto"
              aria-label="七天健康奖励视频"
            />
            <h2>太好了！</h2>
            <p>你连续7天保持了良好的作息、饮食，</p>
            <p>雪粒的状态刚刚好，它很开心。</p>
            <button onClick={() => setShowReward(false)}>知道了</button>
          </div>
        </div>
      )}
    </main>
  )
}


export default App
