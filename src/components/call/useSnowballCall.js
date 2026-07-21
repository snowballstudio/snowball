import { useEffect, useRef, useState } from 'react'

const VOICE_TEXT_MAP = {
  'voice1_hello_askmood.mp4': '你好呀，今天过得怎么样？',
  'voice2_replygoodmood_askfood.mp4': '哇，你心情好，我的眼睛也发亮了。你今天吃什么呢？什么样的口味呀？',
  'voice3_replybadmood_askfood.mp4': '嗯，你心情不好，我也难过，我的眼睛成灰色了。你今天吃什么呢？什么样的口味呀？',
  'voice4_replygoodfood_askidea.mp4': '你吃得很健康哦，我的毛色变得雪白发亮了。你今天有什么想法呢？',
  'voice5_replybadfood_askidea.mp4': '你吃得不够健康，我的毛色都变灰了，要多注意哦。你今天有什么想法呢？',
  'voice6_lastreply_listen.mp4': '知道了，我听着呢。',
  'voice7_close.mp4': '那我先安静待着啦。',
}

const VOICE_DURATION_MS = {
  'voice1_hello_askmood.mp4': 2600,
  'voice2_replygoodmood_askfood.mp4': 5600,
  'voice3_replybadmood_askfood.mp4': 6100,
  'voice4_replygoodfood_askidea.mp4': 5300,
  'voice5_replybadfood_askidea.mp4': 5700,
  'voice6_lastreply_listen.mp4': 2600,
  'voice7_close.mp4': 2600,
}

export default function useSnowballCall({
  data,
  setData,
  setDailyModal,
  appendOrUpdateTodayRecord,
  formatClockForDaily,
  classifyDailyMood,
  classifyDailyFood,
  classifyDailyTaste,
  dailyMoodInfo,
  dailyFoodInfo,
  dailyRecordForDate,
  todayText,
  emptyDailyRecord,
  recordBrainPercent,
  brainInfo,
  brainGainFromText,
  maybeRewardAfterRecord,
}) {
  const [callActive, setCallActive] = useState(false)
  const [isListening, setIsListening] = useState(false)

  const messagesRef = useRef(null)
  const chatCardRef = useRef(null)
  const recognitionRef = useRef(null)
  const voiceAudioRef = useRef(null)
  const voiceAudioCacheRef = useRef({})
  const voiceSubmitTimerRef = useRef(null)
  const chatStepRef = useRef(data.chatStep || 'idle')
  const callActiveRef = useRef(false)
  const speechRestartTimerRef = useRef(null)

  const speechRecognitionSupported =
    typeof window !== 'undefined' &&
    Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)

  useEffect(() => {
    const box = messagesRef.current
    if (!box) return
    box.scrollTop = box.scrollHeight
  }, [data.messages.length])

  useEffect(() => () => {
    try {
      recognitionRef.current?.stop?.()
    } catch (error) {
      // 语音识别关闭失败时保持安静。
    }
    if (speechRestartTimerRef.current) window.clearTimeout(speechRestartTimerRef.current)
    if (voiceSubmitTimerRef.current) window.clearTimeout(voiceSubmitTimerRef.current)
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
    Object.keys(VOICE_TEXT_MAP).forEach(name => {
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
        // 预解锁失败不影响后续正常播放尝试。
      }
    })
  }

  function stopRecognitionBeforeVoice() {
    try {
      recognitionRef.current?.stop?.()
    } catch (error) {
      // 没有正在识别时忽略。
    }
    recognitionRef.current = null
    setIsListening(false)
  }

  function playVoice(name) {
    return new Promise(resolve => {
      let done = false
      let fallbackTimer = null
      const finish = () => {
        if (done) return
        done = true
        if (fallbackTimer) window.clearTimeout(fallbackTimer)
        resolve()
      }

      try {
        stopRecognitionBeforeVoice()

        if (voiceAudioRef.current && voiceAudioRef.current !== voiceAudioCacheRef.current[name]) {
          try {
            voiceAudioRef.current.pause()
            voiceAudioRef.current.currentTime = 0
          } catch (error) {}
        }

        const audio = getVoiceAudio(name)
        voiceAudioRef.current = audio
        audio.pause()
        audio.currentTime = 0
        audio.muted = false
        audio.onended = finish
        audio.onerror = finish
        audio.onpause = null

        fallbackTimer = window.setTimeout(finish, (VOICE_DURATION_MS[name] || 3600) + 1200)

        window.setTimeout(() => {
          if (done) return
          try {
            const playPromise = audio.play()
            if (playPromise && typeof playPromise.catch === 'function') {
              playPromise.catch(finish)
            }
          } catch (error) {
            finish()
          }
        }, 220)
      } catch (error) {
        finish()
      }
    })
  }

  function playVoiceThenListen(name, delay = 120) {
    playVoice(name).then(() => {
      if (!callActiveRef.current) return
      scheduleNextSpeechRecognition(delay)
    })
  }

  function scheduleNextSpeechRecognition(delay = 450) {
    if (!callActiveRef.current) return
    if (speechRestartTimerRef.current) window.clearTimeout(speechRestartTimerRef.current)
    speechRestartTimerRef.current = window.setTimeout(() => {
      speechRestartTimerRef.current = null
      if (callActiveRef.current && chatStepRef.current !== 'idle') {
        startSpeechRecognition()
      }
    }, delay)
  }

  function nextBrainPercentFor(prev, text) {
    const today = dailyRecordForDate(prev.records || [], todayText()) || emptyDailyRecord(todayText())
    const savedBrain = Math.max(
      recordBrainPercent(today),
      recordBrainPercent({ brainPercent: prev.brainPercent }),
    )
    return Math.min(100, savedBrain + brainGainFromText(text))
  }

  function processUserText(text, step = data.chatStep, options = {}) {
    const clean = String(text || '').trim()
    if (!clean) return

    if (step === 'mood') {
      const keyword = classifyDailyMood(clean)
      const moodResult = dailyMoodInfo(keyword)
      const reply = moodResult.good
        ? '哇，你心情好，我的眼睛也发亮了。你今天吃什么呢？什么样的口味呀？'
        : '嗯，你心情不好，我也难过，我的眼睛成灰色了。你今天吃什么呢？什么样的口味呀？'

      chatStepRef.current = 'food'

      setData(prev => {
        const nextBrain = nextBrainPercentFor(prev, clean)
        const next = appendOrUpdateTodayRecord(prev, { mood: keyword, brainPercent: nextBrain })
        return {
          ...next,
          brainPercent: nextBrain,
          moodKeyword: keyword,
          mood: keyword,
          chatInput: '',
          chatStep: 'food',
          chatCount: prev.chatCount + 1,
          messages: [
            ...prev.messages,
            { from: 'user', text: clean },
            { from: 'cat', text: reply },
          ],
        }
      })

      const voiceName = moodResult.good
        ? 'voice2_replygoodmood_askfood.mp4'
        : 'voice3_replybadmood_askfood.mp4'
      if (options.autoVoice) playVoiceThenListen(voiceName, 180)
      else playVoice(voiceName)
      return
    }

    if (step === 'food') {
      const foodKeyword = classifyDailyFood(clean)
      const tasteKeyword = classifyDailyTaste(clean)
      const foodResult = dailyFoodInfo(foodKeyword, tasteKeyword)
      const reply = foodResult.good
        ? '你吃得很健康哦，我的毛色变得雪白发亮了。你今天有什么想法呢？'
        : '你吃得不够健康，我的毛色都变灰了，要多注意哦。你今天有什么想法呢？'

      chatStepRef.current = 'thought'

      setData(prev => {
        const nextBrain = nextBrainPercentFor(prev, clean)
        const next = appendOrUpdateTodayRecord(prev, {
          food: foodKeyword,
          taste: tasteKeyword,
          brainPercent: nextBrain,
        })
        const nextData = {
          ...next,
          brainPercent: nextBrain,
          foodText: foodKeyword,
          foodKeyword,
          foodTaste: tasteKeyword,
          chatInput: '',
          chatStep: 'thought',
          chatCount: prev.chatCount + 1,
          messages: [
            ...prev.messages,
            { from: 'user', text: clean },
            { from: 'cat', text: reply },
          ],
        }
        return {
          ...nextData,
          rewardSeenKey: maybeRewardAfterRecord(nextData, nextData.records),
        }
      })

      const voiceName = foodResult.good
        ? 'voice4_replygoodfood_askidea.mp4'
        : 'voice5_replybadfood_askidea.mp4'
      if (options.autoVoice) playVoiceThenListen(voiceName, 180)
      else playVoice(voiceName)
      return
    }

    const reply = step === 'free' ? '嗯，我听着呢。' : '知道了，我听着呢。'
    const shouldKeepListening = options.autoVoice && callActiveRef.current

    setData(prev => {
      const nextBrain = nextBrainPercentFor(prev, clean)
      const next = appendOrUpdateTodayRecord(prev, { brainPercent: nextBrain })
      return {
        ...next,
        brainPercent: nextBrain,
        chatInput: '',
        chatStep: shouldKeepListening ? 'free' : 'idle',
        chatCount: prev.chatCount + 1,
        messages: [
          ...prev.messages,
          { from: 'user', text: clean },
          { from: 'cat', text: reply },
        ],
      }
    })

    chatStepRef.current = shouldKeepListening ? 'free' : 'idle'
    if (options.autoVoice && callActiveRef.current) {
      playVoiceThenListen('voice6_lastreply_listen.mp4', 260)
    } else {
      playVoice('voice6_lastreply_listen.mp4')
    }
  }

  function startSpeechRecognition() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!Recognition) {
      setDailyModal({
        title: '暂不支持语音输入',
        text: '当前浏览器没有开放语音识别。你可以先用输入框，或者在 iPhone Safari 里重新打开测试。',
      })
      return
    }

    try {
      recognitionRef.current?.stop?.()
    } catch (error) {
      // 旧识别会话停止失败时继续创建新会话。
    }

    if (voiceSubmitTimerRef.current) {
      window.clearTimeout(voiceSubmitTimerRef.current)
      voiceSubmitTimerRef.current = null
    }

    const recognition = new Recognition()
    recognition.lang = 'zh-CN'
    recognition.interimResults = true
    recognition.continuous = false
    recognition.maxAlternatives = 1
    let finalBuffer = ''
    let hasResult = false
    let submitted = false

    const submitBufferSoon = () => {
      if (voiceSubmitTimerRef.current) window.clearTimeout(voiceSubmitTimerRef.current)
      voiceSubmitTimerRef.current = window.setTimeout(() => {
        voiceSubmitTimerRef.current = null
        const text = finalBuffer.trim()
        if (!text || submitted || !callActiveRef.current) return
        submitted = true
        try {
          stopRecognitionBeforeVoice()
          processUserText(text, chatStepRef.current || 'mood', { autoVoice: true })
        } catch (error) {
          console.error('语音对话处理失败：', error)
          setIsListening(false)
          setDailyModal({
            title: '语音对话中断',
            text: '刚才识别成功了，但保存聊天数据时出错。请刷新后再试，或者先用文字发送。',
          })
        }
      }, 2100)
    }

    recognition.onstart = () => setIsListening(true)
    recognition.onend = () => {
      setIsListening(false)
      if (submitted) return
      if (!hasResult && callActiveRef.current && chatStepRef.current !== 'idle') {
        scheduleNextSpeechRecognition(700)
      }
    }
    recognition.onerror = () => {
      setIsListening(false)
      if (callActiveRef.current && chatStepRef.current !== 'idle') {
        scheduleNextSpeechRecognition(900)
      }
    }
    recognition.onresult = event => {
      let finalText = ''
      let interimText = ''

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const transcript = event.results[index][0]?.transcript || ''
        if (event.results[index].isFinal) finalText += transcript
        else interimText += transcript
      }

      const cleanFinal = finalText.trim()
      const cleanInterim = interimText.trim()

      if (cleanInterim) {
        hasResult = true
        setData(prev => ({ ...prev, chatInput: cleanInterim }))
      }

      if (cleanFinal) {
        hasResult = true
        finalBuffer = `${finalBuffer} ${cleanFinal}`.trim()
        setData(prev => ({ ...prev, chatInput: finalBuffer }))
        submitBufferSoon()
      }
    }

    recognitionRef.current = recognition
    recognition.start()
  }

  function stopSpeechRecognition() {
    if (voiceSubmitTimerRef.current) {
      window.clearTimeout(voiceSubmitTimerRef.current)
      voiceSubmitTimerRef.current = null
    }
    try {
      recognitionRef.current?.stop?.()
    } catch (error) {
      // 没有正在进行的识别时不处理。
    }
    setIsListening(false)
  }

  function toggleSpeechRecognition() {
    if (isListening) stopSpeechRecognition()
    else startSpeechRecognition()
  }

  function startCall() {
    unlockVoiceAudio()
    const question = '你好呀，今天心情怎么样？'

    chatStepRef.current = 'mood'
    setCallActive(true)

    setData(prev => ({
      ...prev,
      chatStep: 'mood',
      chatInput: '',
      messages: [
        ...prev.messages,
        { from: 'cat', text: question },
      ],
    }))

    if (speechRecognitionSupported) {
      playVoiceThenListen('voice1_hello_askmood.mp4', 180)
    } else {
      playVoice('voice1_hello_askmood.mp4')
    }
  }

  function endCall() {
    if (speechRestartTimerRef.current) {
      window.clearTimeout(speechRestartTimerRef.current)
      speechRestartTimerRef.current = null
    }
    stopSpeechRecognition()
    if (voiceAudioRef.current) {
      try {
        voiceAudioRef.current.pause()
        voiceAudioRef.current.currentTime = 0
      } catch (error) {}
      voiceAudioRef.current = null
    }
    chatStepRef.current = 'idle'
    setCallActive(false)
    playVoice('voice7_close.mp4')
    window.setTimeout(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }, 80)
  }

  function sayGoodNight() {
    const now = new Date()
    const time = now.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })

    const reply = `晚安呀～我记下了，你今天 ${time} 和我说晚安。`

    setData(prev => {
      const formattedTime = formatClockForDaily(time)
      const next = appendOrUpdateTodayRecord(prev, {
        offscreenTime: formattedTime,
        yesterdaySleep: formattedTime,
        todaySleep: formattedTime,
      })
      return {
        ...next,
        todaySleepTime: time,
        messages: [
          ...prev.messages,
          { from: 'user', text: '晚安啦' },
          { from: 'cat', text: reply },
        ],
      }
    })
  }

  function clearConversation() {
    chatStepRef.current = 'idle'
    setData(prev => {
      const today = dailyRecordForDate(prev.records || [], todayText()) || emptyDailyRecord(todayText())
      const currentBrain = Math.max(
        recordBrainPercent(today),
        brainInfo(prev.messages || []).score,
        recordBrainPercent({ brainPercent: prev.brainPercent }),
      )
      const next = appendOrUpdateTodayRecord(prev, { brainPercent: currentBrain })
      return {
        ...next,
        brainPercent: currentBrain,
        messages: [],
        chatStep: 'idle',
        chatInput: '',
      }
    })
  }

  function sendMessage() {
    processUserText(data.chatInput, chatStepRef.current || data.chatStep)
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
    sayGoodNight,
  }
}
