const CONVERSATION_DB_NAME = 'snowball-conversations-v1'
const CONVERSATION_DB_VERSION = 1
const CONVERSATION_STORE = 'daily-conversations'

let mutationQueue = Promise.resolve()

function normalizeDateKey(value) {
  const text = String(value || '').trim().replace(/-/g, '/')
  const match = text.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/)
  if (!match) return text
  return `${match[1]}/${Number(match[2])}/${Number(match[3])}`
}

function openConversationDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available'))
      return
    }

    const request = indexedDB.open(CONVERSATION_DB_NAME, CONVERSATION_DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(CONVERSATION_STORE)) {
        db.createObjectStore(CONVERSATION_STORE, { keyPath: 'dateKey' })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('Unable to open conversation database'))
  })
}

export function emptyConversationRecord(date) {
  const dateKey = normalizeDateKey(date)
  return {
    date: dateKey,
    dateKey,
    foodDescription: '',
    moodDescription: '',
    interactionText: '',
    entries: [],
    updatedAt: 0,
  }
}

export async function readConversationRecord(date) {
  const dateKey = normalizeDateKey(date)
  const db = await openConversationDb()

  return new Promise((resolve, reject) => {
    const tx = db.transaction(CONVERSATION_STORE, 'readonly')
    const request = tx.objectStore(CONVERSATION_STORE).get(dateKey)

    request.onsuccess = () => {
      resolve({
        ...emptyConversationRecord(dateKey),
        ...(request.result || {}),
        date: dateKey,
        dateKey,
        entries: Array.isArray(request.result?.entries) ? request.result.entries : [],
      })
    }
    request.onerror = () => reject(request.error || new Error('Unable to read conversation record'))
    tx.oncomplete = () => db.close()
    tx.onerror = () => {
      db.close()
      reject(tx.error || new Error('Unable to read conversation record'))
    }
  })
}

export async function saveConversationRecord(record) {
  const dateKey = normalizeDateKey(record?.dateKey || record?.date)
  if (!dateKey) throw new Error('Conversation date is required')

  const value = {
    ...emptyConversationRecord(dateKey),
    ...(record || {}),
    date: dateKey,
    dateKey,
    foodDescription: String(record?.foodDescription || ''),
    moodDescription: String(record?.moodDescription || ''),
    interactionText: String(record?.interactionText || ''),
    entries: Array.isArray(record?.entries) ? record.entries : [],
    updatedAt: Date.now(),
  }

  const db = await openConversationDb()

  return new Promise((resolve, reject) => {
    const tx = db.transaction(CONVERSATION_STORE, 'readwrite')
    tx.objectStore(CONVERSATION_STORE).put(value)
    tx.oncomplete = () => {
      db.close()
      resolve(value)
    }
    tx.onerror = () => {
      db.close()
      reject(tx.error || new Error('Unable to save conversation record'))
    }
  })
}

function appendDescription(current, text) {
  const clean = String(text || '').trim()
  if (!clean) return String(current || '')
  const before = String(current || '').trim()
  return before ? `${before}\n${clean}` : clean
}

export function conversationBrainPercent(recordOrText, moodText = '', interactionText = '') {
  const source =
    recordOrText && typeof recordOrText === 'object'
      ? [
          recordOrText.moodDescription,
          recordOrText.foodDescription,
          recordOrText.interactionText,
        ].join('')
      : [recordOrText, moodText, interactionText].join('')

  const count = Array.from(String(source || '').replace(/\s/g, '')).length
  return Math.min(100, Math.floor(count / 3))
}

export function appendConversationResponse(date, field, text) {
  mutationQueue = mutationQueue.then(async () => {
    const clean = String(text || '').trim()
    const current = await readConversationRecord(date)
    if (!clean) return current

    const allowedField = ['foodDescription', 'moodDescription', 'interactionText'].includes(field)
      ? field
      : 'interactionText'

    return saveConversationRecord({
      ...current,
      [allowedField]: appendDescription(current[allowedField], clean),
      entries: [
        ...(current.entries || []),
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          time: Date.now(),
          field: allowedField,
          text: clean,
        },
      ],
    })
  })

  return mutationQueue
}
