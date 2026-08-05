import { useEffect, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { restoreIOSPlaybackAudioSession } from '../audio/iosAudioSessionService.js'
import { SpeechRecognition } from '@capgo/capacitor-speech-recognition'
import {
  appendConversationResponse,
  conversationBrainPercent,
  readConversationRecord,
} from './conversationDataService.js'
import {
  recalculateOffscreenRecord,
} from '../ios-screen-time/iosScreenTimeService.js'

const VOICE_DURATION_MS = {
  'voice1_hello_askmood.mp4': 2600,
  'voice2_replygoodmood_askfood.mp4': 5600,
  'voice3_replybadmood_askfood.mp4': 6100,
  'voice4_replygoodfood_askidea.mp4': 5300,
  'voice5_replybadfood_askidea.mp4': 5700,
  'voice6_lastreply_listen.mp4': 2600,
}

function messageDateTime(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  return `${year}/${month}/${day} ${hour}:${minute}`
}

function makeMessage(from, text) {
  const now = new Date()
  return {
    id: `${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
    from,
    text: String(text || ''),
    createdAt: now.getTime(),
    dateTime: messageDateTime(now),
  }
}

function wait(milliseconds) {
  return new Promise(resolve => {
    window.setTimeout(resolve, milliseconds)
  })
}

async function waitForNativeSpeechToStop(timeoutMs = 1600) {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const result = await SpeechRecognition.isListening()
      if (!result?.listening) return true
    } catch (error) {
      return true
    }

    await wait(80)
  }

  return false
}


const SPOKEN_REST_DATE_WORDS = ['昨天', '昨晚']
const SPOKEN_REST_CONTEXT_WORDS = [
  '到',
  '才睡',
  '睡',
  '睡觉',
  '休息',
  '记一下',
  '记下',
  '记',
  '改成',
  '修改',
  '改',
  '离机',
  '晚安',
]

const CHINESE_TIME_DIGITS = {
  零: 0,
  〇: 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
}

function chineseTimeNumber(value) {
  const text = String(value || '').trim()
  if (!text) return null
  if (/^\d+$/.test(text)) return Number(text)

  if (text === '十') return 10

  if (text.includes('十')) {
    const [before, after] = text.split('十')
    const tens = before
      ? CHINESE_TIME_DIGITS[before]
      : 1
    const ones = after
      ? CHINESE_TIME_DIGITS[after]
      : 0

    if (
      Number.isFinite(tens)
      && Number.isFinite(ones)
    ) {
      return tens * 10 + ones
    }
  }

  if (text.length === 1) {
    const digit = CHINESE_TIME_DIGITS[text]
    return Number.isFinite(digit) ? digit : null
  }

  return null
}

function normalizeOffscreenDateKey(value) {
  const text = String(value || '').trim()
  const match = text.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/)
  if (!match) return text

  return [
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
  ].join('/')
}

function calendarYesterdayKey(now = new Date()) {
  const date = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - 1,
  )

  // 离机时间表一直使用 YYYY/M/D，例如 2026/8/2。
  return [
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate(),
  ].join('/')
}

function logicalRestHour(rawHour, text) {
  const hour = Number(rawHour)
  if (!Number.isFinite(hour) || hour < 0 || hour > 28) {
    return null
  }

  // 用户已直接说出 24—28 点时，保持原值。
  if (hour >= 24) return hour

  const source = String(text || '')

  // 明确的 24 小时制（13—23点）直接保留。
  if (hour >= 13) return hour

  // 雪粒的晚间逻辑日到次日 05:00。
  // 睡眠语境中的 1—4 点均视为次日凌晨，写为 25—28 点。
  if (
    hour >= 0
    && hour < 5
    && !source.includes('下午')
  ) {
    return hour + 24
  }

  // “昨晚11点”按 23:00；晚上5—11点按 17—23点。
  if (
    source.includes('昨晚')
    || source.includes('晚上')
    || source.includes('夜里')
    || source.includes('夜晚')
    || source.includes('睡')
    || source.includes('休息')
    || source.includes('昨天')
    || source.includes('睡的')
    || source.includes('才睡')
    || source.includes('睡下')
    || source.includes('上床')
    || source.includes('就睡')
    || source.includes('歇')
    || source.includes('躺下')
    || source.includes('熬夜')
  ) {
    if (hour === 12) return 24
    if (hour >= 5 && hour <= 11) return hour + 12
  }

  if (source.includes('下午') && hour >= 1 && hour <= 11) {
    return hour + 12
  }

  return hour
}

function parseSpokenYesterdayRestTime(value) {
  const original = String(value || '').trim()
  if (!original) return null

  const compact = original
    .replace(/\s+/g, '')
    .replace(/：/g, ':')
    .replace(/[，。！？,.!?]/g, '')

  const hasYesterday = SPOKEN_REST_DATE_WORDS.some(
    word => compact.includes(word),
  )
  if (!hasYesterday) return null

  const hasRestContext =
    compact.includes('昨晚')
    || SPOKEN_REST_CONTEXT_WORDS.some(
      word => compact.includes(word),
    )
  if (!hasRestContext) return null

  let hour = null
  let minute = 0
  let approximate = false

  // 23:30、3:20
  const colonMatch = compact.match(
    /(\d{1,2})[:](\d{1,2})/,
  )

  if (colonMatch) {
    hour = Number(colonMatch[1])
    minute = Number(colonMatch[2])
  } else {
    // 23点30分、十一点半、三点多、11点
    const pointMatch = compact.match(
      /([零〇一二两三四五六七八九十\d]{1,3})点(?:(半)|([一三13])刻(?:钟)?|([零〇一二两三四五六七八九十\d]{1,3})(?:分|分钟)?|(多))?/,
    )

    if (!pointMatch) return null

    hour = chineseTimeNumber(pointMatch[1])

    if (pointMatch[2]) {
      minute = 30
    } else if (pointMatch[3]) {
      const quarter = chineseTimeNumber(pointMatch[3])
      minute = Number.isFinite(quarter)
        ? quarter * 15
        : null
    } else if (pointMatch[4]) {
      minute = chineseTimeNumber(pointMatch[4])
    } else {
      minute = 0
    }

    approximate = Boolean(pointMatch[5])
  }

  if (
    !Number.isFinite(hour)
    || !Number.isFinite(minute)
    || minute < 0
    || minute > 59
  ) {
    return null
  }

  const storedHour = logicalRestHour(hour, compact)
  if (!Number.isFinite(storedHour)) return null

  const time = `${String(storedHour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`

  return {
    date: calendarYesterdayKey(),
    time,
    displayTime: time.replace(':', '：'),
    approximate,
    original,
  }
}

function updateSpokenRestRecord(data, spokenRest) {
  if (!spokenRest) return data

  const existingRecords = Array.isArray(data?.offscreenRecords)
    ? data.offscreenRecords
    : []

  const spokenDateKey = normalizeOffscreenDateKey(
    spokenRest.date,
  )

  const rowIndex = existingRecords.findIndex(
    row => normalizeOffscreenDateKey(row?.date)
      === spokenDateKey,
  )

  const existing =
    rowIndex >= 0
      ? existingRecords[rowIndex]
      : {
          id: `offscreen-${spokenDateKey.replaceAll('/', '-')}`,
          date: spokenDateKey,
        }

  /*
    通话只写入独立 spokenRestTime。
    安卓系统、道晚安、通话三个来源统一取最晚。
  */
  const nextOffscreenRecord = recalculateOffscreenRecord({
    id:
      existing.id ||
      `offscreen-${spokenDateKey.replaceAll('/', '-')}`,
    date:
      rowIndex >= 0
        ? existing.date
        : spokenDateKey,
    androidOffscreenTime:
      existing.androidOffscreenTime || '',
    goodNightTime:
      existing.goodNightTime || '',
    spokenRestTime: spokenRest.time,
    spokenRestUpdatedAt: Date.now(),
  })

  const nextRecords = [...existingRecords]
  if (rowIndex >= 0) {
    nextRecords[rowIndex] = nextOffscreenRecord
  } else {
    nextRecords.push(nextOffscreenRecord)
  }

  nextRecords.sort((left, right) =>
    String(right?.date || '').localeCompare(
      String(left?.date || ''),
    ),
  )

  const dailyRecords = Array.isArray(data?.records)
    ? [...data.records]
    : []

  const dailyIndex = dailyRecords.findIndex(
    row => normalizeOffscreenDateKey(row?.date)
      === spokenDateKey,
  )

  const dailyCurrent =
    dailyIndex >= 0
      ? dailyRecords[dailyIndex]
      : {
          id: `daily-${spokenDateKey.replaceAll('/', '-')}`,
          date: spokenDateKey,
          steps: 0,
          screenMinutes: 0,
          food: '',
          taste: '',
          mood: '',
          brainPercent: 0,
          healthy: false,
        }

  const nextDailyRecord = {
    ...dailyCurrent,
    date: dailyCurrent.date || spokenDateKey,
    offscreenTime:
      nextOffscreenRecord.calculatedOffscreenTime,
    yesterdaySleep:
      nextOffscreenRecord.calculatedOffscreenTime,
    spokenRestUpdatedAt: Date.now(),
  }

  if (dailyIndex >= 0) {
    dailyRecords[dailyIndex] = nextDailyRecord
  } else {
    dailyRecords.push(nextDailyRecord)
  }

  dailyRecords.sort((left, right) =>
    normalizeOffscreenDateKey(right?.date).localeCompare(
      normalizeOffscreenDateKey(left?.date),
    ),
  )

  return {
    ...data,
    offscreenRecords: nextRecords,
    records: dailyRecords,
    yesterdaySleepTime:
      nextOffscreenRecord.calculatedOffscreenTime,
    lastSavedAt: Date.now(),
  }
}

export default function useSnowballCall({
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
}) {
  const [callActive, setCallActive] = useState(false)
  const [isListening, setIsListening] = useState(false)

  const messagesRef = useRef(null)
  const chatCardRef = useRef(null)
  const recognitionRef = useRef(null)
  const voiceAudioRef = useRef(null)
  const voiceAudioCacheRef = useRef({})
  const voicePlayTimerRef = useRef(null)
  const voiceFallbackTimerRef = useRef(null)
  const voiceFinishRef = useRef(null)
  const chatStepRef = useRef(data.chatStep || 'idle')
  const callActiveRef = useRef(false)
  const callSessionRef = useRef(0)

  // 原生录音连续会话：
  // Android / iOS 的单次语音识别可能因停顿自动结束，
  // 因此在用户主动发送前自动重启下一轮，并累计前面已识别文字。
  const keepNativeListeningRef = useRef(false)
  const nativeCommittedTextRef = useRef('')
  const nativeCurrentTextRef = useRef('')
  const nativeRestartTimerRef = useRef(null)
  const nativeRestartingRef = useRef(false)

  const isNativeSpeechPlatform = Capacitor.isNativePlatform()

  const speechRecognitionSupported =
    isNativeSpeechPlatform ||
    (typeof window !== 'undefined' &&
      Boolean(window.SpeechRecognition || window.webkitSpeechRecognition))

  useEffect(() => {
    const box = messagesRef.current
    if (!box) return
    box.scrollTop = box.scrollHeight
  }, [data.messages.length])

  useEffect(() => () => {
    callSessionRef.current += 1
    stopSpeechRecognition()
    stopVoiceImmediately()
  }, [])

  useEffect(() => {
    callActiveRef.current = callActive
  }, [callActive])

  useEffect(() => {
    chatStepRef.current = data.chatStep || 'idle'
  }, [data.chatStep])

  function getVoiceAudio(name) {
    if (!voiceAudioCacheRef.current[name]) {
      const audio = new Audio(`/refine/${name}`)
      audio.preload = 'auto'
      audio.playsInline = true
      voiceAudioCacheRef.current[name] = audio
    }
    return voiceAudioCacheRef.current[name]
  }

  function unlockVoiceAudio() {
    Object.keys(VOICE_DURATION_MS).forEach(name => {
      try {
        const audio = getVoiceAudio(name)
        audio.muted = true
        audio.currentTime = 0
        const promise = audio.play()

        if (promise && typeof promise.then === 'function') {
          promise.then(() => {
            audio.pause()
            audio.currentTime = 0
            audio.muted = false
          }).catch(() => {
            audio.muted = false
          })
        } else {
          audio.pause()
          audio.currentTime = 0
          audio.muted = false
        }
      } catch (error) {
        // 预解锁失败不影响后续手动通话。
      }
    })
  }

  function stopVoiceImmediately() {
    if (voicePlayTimerRef.current) {
      window.clearTimeout(voicePlayTimerRef.current)
      voicePlayTimerRef.current = null
    }

    if (voiceFallbackTimerRef.current) {
      window.clearTimeout(voiceFallbackTimerRef.current)
      voiceFallbackTimerRef.current = null
    }

    const audio = voiceAudioRef.current
    if (audio) {
      try {
        audio.onended = null
        audio.onerror = null
        audio.pause()
        audio.currentTime = 0
      } catch (error) {
        // 已停止的音频不需要额外处理。
      }
    }

    voiceAudioRef.current = null

    const finish = voiceFinishRef.current
    voiceFinishRef.current = null
    if (typeof finish === 'function') finish()
  }

  async function playVoice(name, sessionId = callSessionRef.current) {
    await stopSpeechRecognition()

    // iOS 语音识别结束后，必须由原生层明确把 AVAudioSession
    // 从录音模式切回 playback；单纯延迟无法稳定恢复所有声音。
    if (Capacitor.getPlatform() === 'ios') {
      await waitForNativeSpeechToStop()
      try {
        await restoreIOSPlaybackAudioSession()
      } catch (error) {
        console.error('恢复 iPhone 播放通道失败：', error)
      }
      await wait(120)
    }

    return new Promise(resolve => {
      let finished = false

      const finish = () => {
        if (finished) return
        finished = true

        if (voiceFinishRef.current === finish) {
          voiceFinishRef.current = null
        }

        if (voicePlayTimerRef.current) {
          window.clearTimeout(voicePlayTimerRef.current)
          voicePlayTimerRef.current = null
        }

        if (voiceFallbackTimerRef.current) {
          window.clearTimeout(voiceFallbackTimerRef.current)
          voiceFallbackTimerRef.current = null
        }

        resolve()
      }

      try {
        stopVoiceImmediately()
        voiceFinishRef.current = finish

        if (!callActiveRef.current || sessionId !== callSessionRef.current) {
          finish()
          return
        }

        const audio = getVoiceAudio(name)
        voiceAudioRef.current = audio
        audio.pause()
        audio.currentTime = 0
        audio.muted = false
        audio.volume = 1
        audio.onended = finish
        audio.onerror = finish

        voiceFallbackTimerRef.current = window.setTimeout(
          finish,
          (VOICE_DURATION_MS[name] || 3600) + 1200,
        )

        voicePlayTimerRef.current = window.setTimeout(() => {
          voicePlayTimerRef.current = null

          if (
            finished ||
            !callActiveRef.current ||
            sessionId !== callSessionRef.current
          ) {
            finish()
            return
          }

          const attemptPlay = async (retry = false) => {
            try {
              audio.muted = false
              audio.volume = 1
              const playPromise = audio.play()

              if (playPromise && typeof playPromise.catch === 'function') {
                await playPromise
              }
            } catch (error) {
              if (
                !retry &&
                Capacitor.getPlatform() === 'ios' &&
                !finished &&
                callActiveRef.current &&
                sessionId === callSessionRef.current
              ) {
                await wait(360)
                audio.pause()
                audio.currentTime = 0
                await attemptPlay(true)
                return
              }

              finish()
            }
          }

          attemptPlay()
        }, 120)
      } catch (error) {
        finish()
      }
    })
  }

  function currentDailyRecordWithPatch(patch = {}) {
    const date = todayText()
    const current =
      dailyRecordForDate(data.records || [], date) ||
      emptyDailyRecord(date)

    return {
      ...current,
      ...patch,
      date: current.date || date,
    }
  }

  async function processUserText(text, step = data.chatStep) {
    const clean = String(text || '').trim()
    if (!callActiveRef.current) return

    const sessionId = callSessionRef.current

    // 发送键同时承担“发送 / 打断 / 快进”：
    // 无论有没有文字，都立即停止雪粒当前尚未说完的语音，
    // 并等待原生录音真正释放后再继续，避免 iOS 有文字却无声音。
    stopVoiceImmediately()
    await stopSpeechRecognition()

    try {
      if (step === 'mood') {
        const conversation = clean
          ? await appendConversationResponse(
              todayText(),
              'moodDescription',
              clean,
            )
          : await readConversationRecord(todayText())

        if (!callActiveRef.current || sessionId !== callSessionRef.current) return

        const derivedBase = deriveConversationFields(conversation)
        const derived = {
          ...derivedBase,
          brainPercent: conversationBrainPercent(conversation),
        }

        // 有新文字时先使用刚识别出的结果；空白快进时直接读取日常表当前结果。
        const dailyRecord = clean
          ? currentDailyRecordWithPatch({
              mood: derived.mood,
              brainPercent: derived.brainPercent,
            })
          : currentDailyRecordWithPatch()

        const moodResult = dailyMoodInfo(dailyRecord.mood)
        const reply = moodResult.good
          ? '读了你的心情记录，雪粒的眼睛又圆又亮。你今天吃什么呢？什么样的口味呀？'
          : '没有读到够多的心情好词，雪粒的眼睛有点无神。你今天吃什么呢？什么样的口味呀？'
        const voiceName = moodResult.good
          ? 'voice2_replygoodmood_askfood.mp4'
          : 'voice3_replybadmood_askfood.mp4'

        chatStepRef.current = 'food'

        setData(prev => {
          const next = clean
            ? appendOrUpdateTodayRecord(prev, {
                mood: derived.mood,
                brainPercent: derived.brainPercent,
              })
            : prev

          return {
            ...next,
            ...(clean
              ? {
                  brainPercent: derived.brainPercent,
                  moodKeyword: derived.mood,
                  mood: derived.mood,
                }
              : {}),
            chatInput: '',
            chatStep: 'food',
            chatCount: prev.chatCount + 1,
            messages: [
              ...prev.messages,
              ...(clean ? [makeMessage('user', clean)] : []),
              makeMessage('cat', reply),
            ],
          }
        })

        await playVoice(voiceName, sessionId)
        return
      }

      if (step === 'food') {
        const conversation = clean
          ? await appendConversationResponse(
              todayText(),
              'foodDescription',
              clean,
            )
          : await readConversationRecord(todayText())

        if (!callActiveRef.current || sessionId !== callSessionRef.current) return

        const derivedBase = deriveConversationFields(conversation)
        const derived = {
          ...derivedBase,
          brainPercent: conversationBrainPercent(conversation),
        }

        // 空白快进不改写任何数据，只依据日常表此刻已经存在的食物与口味判断。
        const dailyRecord = clean
          ? currentDailyRecordWithPatch({
              food: derived.food,
              taste: derived.taste,
              brainPercent: derived.brainPercent,
            })
          : currentDailyRecordWithPatch()

        const foodResult = dailyFoodInfo(dailyRecord.food, dailyRecord.taste)
        const reply = foodResult.good
          ? '你的饮食不错哦，所以雪粒的毛色雪白。你有什么想法，愿意和我说一说吗？'
          : '你的饮食记录有待改进，所以雪粒的毛色有点暗淡。你有什么想法，愿意和我说一说吗？'
        const voiceName = foodResult.good
          ? 'voice4_replygoodfood_askidea.mp4'
          : 'voice5_replybadfood_askidea.mp4'

        chatStepRef.current = 'thought'

        setData(prev => {
          const next = clean
            ? appendOrUpdateTodayRecord(prev, {
                food: derived.food,
                taste: derived.taste,
                brainPercent: derived.brainPercent,
              })
            : prev

          const nextData = {
            ...next,
            ...(clean
              ? {
                  brainPercent: derived.brainPercent,
                  foodText: derived.food,
                  foodKeyword: derived.food,
                  foodTaste: derived.taste,
                }
              : {}),
            chatInput: '',
            chatStep: 'thought',
            chatCount: prev.chatCount + 1,
            messages: [
              ...prev.messages,
              ...(clean ? [makeMessage('user', clean)] : []),
              makeMessage('cat', reply),
            ],
          }

          if (!clean) return nextData

          return {
            ...nextData,
            rewardSeenKey: maybeRewardAfterRecord(nextData, nextData.records),
          }
        })

        await playVoice(voiceName, sessionId)
        return
      }

      const conversation = clean
        ? await appendConversationResponse(
            todayText(),
            'interactionText',
            clean,
          )
        : await readConversationRecord(todayText())

      if (!callActiveRef.current || sessionId !== callSessionRef.current) return

      const derivedBase = deriveConversationFields(conversation)
      const derived = {
        ...derivedBase,
        brainPercent: conversationBrainPercent(conversation),
      }

      const spokenRest = clean
        ? parseSpokenYesterdayRestTime(clean)
        : null

      const reply = spokenRest
        ? `记下了，昨天休息时间按 ${spokenRest.displayTime} 记录。`
        : '知道了，我听着呢。'

      chatStepRef.current = 'free'

      setData(prev => {
        const next = clean
          ? appendOrUpdateTodayRecord(prev, {
              brainPercent: derived.brainPercent,
            })
          : prev

        const nextWithRest = spokenRest
          ? updateSpokenRestRecord(next, spokenRest)
          : next

        return {
          ...nextWithRest,
          ...(clean ? { brainPercent: derived.brainPercent } : {}),
          chatInput: '',
          chatStep: 'free',
          chatCount: prev.chatCount + 1,
          messages: [
            ...prev.messages,
            ...(clean ? [makeMessage('user', clean)] : []),
            makeMessage('cat', reply),
          ],
        }
      })

      await playVoice('voice6_lastreply_listen.mp4', sessionId)
    } catch (error) {
      console.error('保存对话记录失败：', error)
      setDailyModal({
        title: '对话记录未保存',
        text: '刚才的回答没有写入本机，请再发送一次。',
      })
    }
  }

  function cleanSpeechText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim()
  }

  function mergeSpeechText(base, addition) {
    const before = cleanSpeechText(base)
    const next = cleanSpeechText(addition)
    if (!before) return next
    if (!next) return before
    if (before === next || before.endsWith(next)) return before
    return `${before} ${next}`.trim()
  }

  function clearNativeRestartTimer() {
    if (nativeRestartTimerRef.current) {
      window.clearTimeout(nativeRestartTimerRef.current)
      nativeRestartTimerRef.current = null
    }
  }

  function commitNativeCurrentText() {
    const current = cleanSpeechText(nativeCurrentTextRef.current)
    if (!current) return nativeCommittedTextRef.current

    nativeCommittedTextRef.current = mergeSpeechText(
      nativeCommittedTextRef.current,
      current,
    )
    nativeCurrentTextRef.current = ''

    setData(prev => ({
      ...prev,
      chatInput: nativeCommittedTextRef.current,
    }))

    return nativeCommittedTextRef.current
  }

  async function removeNativeSpeechListeners(handles = []) {
    await Promise.all(
      handles.map(async handle => {
        try {
          await handle?.remove?.()
        } catch (error) {
          // 已移除的监听器无需重复处理。
        }
      }),
    )
  }

  async function startNativeSpeechRecognition({
    resume = false,
    skipPermissionCheck = false,
  } = {}) {
    if (!callActiveRef.current) return

    stopVoiceImmediately()
    clearNativeRestartTimer()

    if (!resume) {
      await stopSpeechRecognition()
      keepNativeListeningRef.current = true
      nativeCommittedTextRef.current = cleanSpeechText(data.chatInput)
      nativeCurrentTextRef.current = ''
    }

    if (
      !keepNativeListeningRef.current ||
      nativeRestartingRef.current
    ) {
      return
    }

    nativeRestartingRef.current = true

    try {
      if (!skipPermissionCheck) {
        const permission = await SpeechRecognition.requestPermissions()
        if (permission?.speechRecognition !== 'granted') {
          keepNativeListeningRef.current = false
          setIsListening(false)
          setDailyModal({
            title: '没有录音权限',
            text: '请在手机设置中允许雪粒使用麦克风和语音识别。',
          })
          return
        }

        const availability = await SpeechRecognition.available()
        if (!availability?.available) {
          keepNativeListeningRef.current = false
          setIsListening(false)
          setDailyModal({
            title: '当前手机无法使用语音识别',
            text: '系统没有可用的语音识别服务。你可以先使用文字输入。',
          })
          return
        }
      }

      const previous = recognitionRef.current
      if (previous?.type === 'native') {
        await removeNativeSpeechListeners(previous.listenerHandles || [])
      }

      const listenerHandles = []

      listenerHandles.push(
        await SpeechRecognition.addListener('partialResults', event => {
          const currentText = cleanSpeechText(
            event?.accumulatedText ||
            event?.matches?.[0] ||
            event?.accumulated ||
            '',
          )

          if (!currentText) return

          nativeCurrentTextRef.current = currentText
          const visibleText = mergeSpeechText(
            nativeCommittedTextRef.current,
            currentText,
          )

          setData(prev => ({
            ...prev,
            chatInput: visibleText,
          }))
        }),
      )

      listenerHandles.push(
        await SpeechRecognition.addListener('listeningState', event => {
          const state = String(event?.state || '').toLowerCase()
          const started =
            event?.status === 'started' ||
            ['started', 'listening', 'active'].includes(state)
          const stopped =
            event?.status === 'stopped' ||
            ['idle', 'stopped', 'ended', 'error'].includes(state)

          if (started) {
            setIsListening(true)
            return
          }

          if (!stopped) return

          commitNativeCurrentText()

          if (
            !keepNativeListeningRef.current ||
            !callActiveRef.current
          ) {
            setIsListening(false)
            return
          }

          // 系统因停顿结束本轮识别时，按钮仍保持录音状态，
          // 短暂等待后自动开启下一轮。
          setIsListening(true)
          clearNativeRestartTimer()
          nativeRestartTimerRef.current = window.setTimeout(() => {
            nativeRestartTimerRef.current = null
            startNativeSpeechRecognition({
              resume: true,
              skipPermissionCheck: true,
            })
          }, 220)
        }),
      )

      listenerHandles.push(
        await SpeechRecognition.addListener('error', event => {
          console.error('原生语音识别失败：', event)
          commitNativeCurrentText()

          if (
            keepNativeListeningRef.current &&
            callActiveRef.current
          ) {
            clearNativeRestartTimer()
            nativeRestartTimerRef.current = window.setTimeout(() => {
              nativeRestartTimerRef.current = null
              startNativeSpeechRecognition({
                resume: true,
                skipPermissionCheck: true,
              })
            }, 420)
          } else {
            setIsListening(false)
          }
        }),
      )

      recognitionRef.current = {
        type: 'native',
        listenerHandles,
      }

      nativeCurrentTextRef.current = ''

      await SpeechRecognition.start({
        language: 'zh-CN',
        maxResults: 1,
        popup: false,
        partialResults: true,
        addPunctuation: false,
      })

      setIsListening(true)
    } catch (error) {
      console.error('启动原生语音识别失败：', error)

      const current = recognitionRef.current
      recognitionRef.current = null
      await removeNativeSpeechListeners(current?.listenerHandles || [])

      commitNativeCurrentText()

      if (
        keepNativeListeningRef.current &&
        callActiveRef.current &&
        resume
      ) {
        clearNativeRestartTimer()
        nativeRestartTimerRef.current = window.setTimeout(() => {
          nativeRestartTimerRef.current = null
          startNativeSpeechRecognition({
            resume: true,
            skipPermissionCheck: true,
          })
        }, 520)
      } else {
        keepNativeListeningRef.current = false
        setIsListening(false)
        setDailyModal({
          title: '录音没有启动',
          text: '请确认麦克风与语音识别权限已经开启，然后再点一次录音按钮。',
        })
      }
    } finally {
      nativeRestartingRef.current = false
    }
  }

  function startWebSpeechRecognition() {
    const Recognition =
      window.SpeechRecognition ||
      window.webkitSpeechRecognition

    if (!Recognition) {
      setDailyModal({
        title: '暂不支持语音输入',
        text: '当前浏览器没有开放语音识别。你可以先使用文字输入。',
      })
      return
    }

    stopVoiceImmediately()
    stopSpeechRecognition()

    try {
      const recognition = new Recognition()
      recognition.lang = 'zh-CN'
      recognition.interimResults = true
      recognition.continuous = true
      recognition.maxAlternatives = 1

      let accumulatedFinal = ''

      recognition.onstart = () => setIsListening(true)

      recognition.onend = () => {
        if (recognitionRef.current?.recognition === recognition) {
          recognitionRef.current = null
        }
        setIsListening(false)
      }

      recognition.onerror = () => {
        if (recognitionRef.current?.recognition === recognition) {
          recognitionRef.current = null
        }
        setIsListening(false)
      }

      recognition.onresult = event => {
        let interimText = ''

        for (
          let index = event.resultIndex;
          index < event.results.length;
          index += 1
        ) {
          const transcript = event.results[index][0]?.transcript || ''

          if (event.results[index].isFinal) {
            accumulatedFinal = `${accumulatedFinal} ${transcript}`.trim()
          } else {
            interimText += transcript
          }
        }

        const visibleText = `${accumulatedFinal} ${interimText}`.trim()
        setData(prev => ({
          ...prev,
          chatInput: visibleText,
        }))
      }

      recognitionRef.current = {
        type: 'web',
        recognition,
      }
      recognition.start()
    } catch (error) {
      console.error('启动网页语音识别失败：', error)
      recognitionRef.current = null
      setIsListening(false)
      setDailyModal({
        title: '录音没有启动',
        text: '请稍后再点一次录音按钮，或者先使用文字输入。',
      })
    }
  }

  function startSpeechRecognition() {
    if (!callActiveRef.current) return

    if (isNativeSpeechPlatform) {
      startNativeSpeechRecognition()
      return
    }

    startWebSpeechRecognition()
  }

  async function stopSpeechRecognition() {
    keepNativeListeningRef.current = false
    clearNativeRestartTimer()
    commitNativeCurrentText()

    const current = recognitionRef.current
    recognitionRef.current = null

    if (current?.type === 'native') {
      const platform = Capacitor.getPlatform()

      if (platform === 'ios') {
        // iOS 必须优先使用 stop()，它会完整拆除识别器与录音资源。
        // forceStop() 只立即终止当前会话，可能留下录音音频通道，
        // 造成随后 HTMLAudioElement 有播放动作却没有声音。
        try {
          await SpeechRecognition.stop()
        } catch (error) {
          try {
            await SpeechRecognition.forceStop()
          } catch (forceError) {
            // 已经停止时无需处理。
          }
        }

        await waitForNativeSpeechToStop()

        try {
          await restoreIOSPlaybackAudioSession()
        } catch (error) {
          console.error('停止录音后恢复 iPhone 播放通道失败：', error)
        }

        await wait(80)
      } else {
        try {
          await SpeechRecognition.forceStop({ timeout: 900 })
        } catch (error) {
          try {
            await SpeechRecognition.stop()
          } catch (stopError) {
            // 没有正在录音时无需处理。
          }
        }
      }

      await removeNativeSpeechListeners(current.listenerHandles || [])
    } else if (current?.recognition) {
      try {
        current.recognition.stop()
      } catch (error) {
        // 没有正在录音时无需处理。
      }
    }

    nativeCurrentTextRef.current = ''
    nativeRestartingRef.current = false
    setIsListening(false)
  }

  function toggleSpeechRecognition() {
    if (!callActiveRef.current) return

    if (
      isNativeSpeechPlatform &&
      keepNativeListeningRef.current
    ) {
      stopSpeechRecognition()
      return
    }

    if (isListening) stopSpeechRecognition()
    else startSpeechRecognition()
  }

  function startCall() {
    callSessionRef.current += 1
    const sessionId = callSessionRef.current

    keepNativeListeningRef.current = false
    nativeCommittedTextRef.current = ''
    nativeCurrentTextRef.current = ''
    clearNativeRestartTimer()
    stopSpeechRecognition()
    stopVoiceImmediately()
    unlockVoiceAudio()

    callActiveRef.current = true
    chatStepRef.current = 'mood'
    setCallActive(true)

    const question = '你好呀，今天心情怎么样？'

    setData(prev => ({
      ...prev,
      chatStep: 'mood',
      chatInput: '',
      messages: [
        ...prev.messages,
        makeMessage('cat', question),
      ],
    }))

    playVoice('voice1_hello_askmood.mp4', sessionId)
  }

  function endCall() {
    callSessionRef.current += 1
    callActiveRef.current = false
    chatStepRef.current = 'idle'

    keepNativeListeningRef.current = false
    nativeCommittedTextRef.current = ''
    nativeCurrentTextRef.current = ''
    clearNativeRestartTimer()
    stopSpeechRecognition()
    stopVoiceImmediately()
    setCallActive(false)

    setData(prev => ({
      ...prev,
      chatStep: 'idle',
      chatInput: '',
    }))

    window.setTimeout(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }, 80)
  }

  function clearConversation() {
    setData(prev => ({
      ...prev,
      messages: [],
      chatInput: '',
    }))
  }

  async function sendMessage() {
    if (!callActiveRef.current) return

    const nativeVisibleText = mergeSpeechText(
      nativeCommittedTextRef.current,
      nativeCurrentTextRef.current,
    )
    const text = String(
      isNativeSpeechPlatform && nativeVisibleText
        ? nativeVisibleText
        : data.chatInput || '',
    ).trim()

    // 空白发送也有效；同时允许在雪粒语音尚未结束时直接打断并进入下一轮。
    keepNativeListeningRef.current = false
    stopVoiceImmediately()
    await stopSpeechRecognition()

    await processUserText(
      text,
      chatStepRef.current || data.chatStep || 'mood',
    )
  }

  return {
    callActive,
    isListening,
    speechRecognitionSupported,
    messagesRef,
    chatCardRef,
    startCall,
    endCall,
    clearConversation,
    sendMessage,
    toggleSpeechRecognition,
  }
}
