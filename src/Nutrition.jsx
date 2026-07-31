import { useEffect, useMemo, useRef, useState } from 'react'
import './Nutrition.css'

// ======================================================
// 雪球营养明细引擎
// 规则：
// 1. 日常表已经完成同日真名去重，这里直接按真名一行读取。
// 2. 营养匹配允许两层：主名通用 Mapping + 真名专属 Mapping。
// 3. 同一真名中的同一营养素只保留一次；不同真名分别贡献来源次数。
// 4. 蛋白/碳水/纤维暂不在这里重新统计，只返回 foodType 供以后迁移彩虹逻辑。
// ======================================================

const EMPTY_PROFILE = Object.freeze({ vitamins: [], minerals: [], fats: [], others: [] })

// 主名较狭义、组内食物营养较一致时，才使用这一层。
const PRIMARY_NUTRITION_PROFILE = {
  蛋: { vitamins: ['A', 'D', 'B12'], minerals: ['硒'], fats: [], others: ['胆碱'] },
  奶制品: { vitamins: ['B2', 'B12'], minerals: ['钙'], fats: [], others: [] },
  豆制品: { vitamins: ['B1', '叶酸'], minerals: ['钙', '铁', '镁'], fats: [], others: ['异黄酮'] },
  牛羊肉: { vitamins: ['B12'], minerals: ['铁', '锌'], fats: [], others: [] },
  猪肉: { vitamins: ['B1', 'B12'], minerals: ['锌'], fats: [], others: [] },
  坚果: { vitamins: ['E'], minerals: ['镁', '锌'], fats: ['不饱和'], others: [] },
  海带: { vitamins: [], minerals: ['碘'], fats: [], others: [] },
  紫菜: { vitamins: ['B12'], minerals: ['碘', '铁'], fats: [], others: [] },
  橙橘柚: { vitamins: ['C'], minerals: [], fats: [], others: ['类黄酮'] },
  香蕉: { vitamins: ['B6'], minerals: ['钾'], fats: [], others: [] },
  苹果: { vitamins: [], minerals: [], fats: [], others: ['多酚'] },
  葡萄: { vitamins: [], minerals: [], fats: [], others: ['多酚'] },
  VC: { vitamins: ['C'], minerals: [], fats: [], others: [] },
  VD: { vitamins: ['D'], minerals: [], fats: [], others: [] },
  VE: { vitamins: ['E'], minerals: [], fats: [], others: [] },
  鱼油: { vitamins: [], minerals: [], fats: ['Ω3'], others: [] },
  钙片: { vitamins: [], minerals: ['钙'], fats: [], others: [] },
  铁片: { vitamins: [], minerals: ['铁'], fats: [], others: [] },
}

// 真名专属 Mapping：宽泛主组中的具体食物，或需要比主名更精确的食物放在这里。
const FOOD_NUTRITION_PROFILE = {
  菠菜: { vitamins: ['叶酸', 'K', 'A'], minerals: ['铁', '镁'], fats: [], others: ['叶黄素', '玉米黄素'] },
  油菜: { vitamins: ['K', 'A', 'C'], minerals: ['钙'], fats: [], others: ['玉米黄素'] },
  青菜: { vitamins: ['K', 'A', 'C'], minerals: ['钙'], fats: [], others: ['玉米黄素'] },
  上海青: { vitamins: ['K', 'A', 'C'], minerals: ['钙'], fats: [], others: ['玉米黄素'] },
  油麦菜: { vitamins: ['K', '叶酸'], minerals: [], fats: [], others: ['叶黄素', '玉米黄素'] },
  生菜: { vitamins: ['K', '叶酸'], minerals: [], fats: [], others: ['玉米黄素'] },
  芥兰: { vitamins: ['C', 'K', 'A'], minerals: ['钙'], fats: [], others: ['玉米黄素'] },
  西兰花: { vitamins: ['C', 'K', '叶酸'], minerals: [], fats: [], others: ['萝卜硫素'] },
  花菜: { vitamins: ['C', '叶酸'], minerals: [], fats: [], others: [] },
  菜花: { vitamins: ['C', '叶酸'], minerals: [], fats: [], others: [] },
  胡萝卜: { vitamins: ['A'], minerals: [], fats: [], others: ['β-胡萝卜素'] },
  红萝卜: { vitamins: ['A'], minerals: [], fats: [], others: ['β-胡萝卜素'] },
  番茄: { vitamins: ['C'], minerals: ['钾'], fats: [], others: ['番茄红素'] },
  西红柿: { vitamins: ['C'], minerals: ['钾'], fats: [], others: ['番茄红素'] },
  圣女果: { vitamins: ['C'], minerals: ['钾'], fats: [], others: ['番茄红素'] },
  辣椒: { vitamins: ['C', 'A'], minerals: [], fats: [], others: ['辣椒素'] },
  青椒: { vitamins: ['C'], minerals: [], fats: [], others: [] },
  红椒: { vitamins: ['C', 'A'], minerals: [], fats: [], others: ['类胡萝卜素'] },
  南瓜: { vitamins: ['A'], minerals: [], fats: [], others: ['β-胡萝卜素'] },
  苦瓜: { vitamins: ['C'], minerals: [], fats: [], others: [] },
  草莓: { vitamins: ['C', '叶酸'], minerals: [], fats: [], others: ['花青素'] },
  蓝莓: { vitamins: [], minerals: [], fats: [], others: ['花青素'] },
  黑莓: { vitamins: ['C', 'K'], minerals: [], fats: [], others: ['花青素'] },
  桑葚: { vitamins: ['C'], minerals: ['铁'], fats: [], others: ['花青素'] },
  猕猴桃: { vitamins: ['C', 'E', '叶酸'], minerals: ['钾'], fats: [], others: [] },
  芒果: { vitamins: ['A', 'C', '叶酸'], minerals: [], fats: [], others: ['类胡萝卜素'] },
  牛油果: { vitamins: ['E', '叶酸', 'K'], minerals: ['钾'], fats: ['Ω9'], others: [] },
  石榴: { vitamins: [], minerals: [], fats: [], others: ['多酚'] },
  樱桃: { vitamins: [], minerals: [], fats: [], others: ['花青素'] },
  西瓜: { vitamins: [], minerals: [], fats: [], others: ['番茄红素'] },
  柠檬: { vitamins: ['C'], minerals: [], fats: [], others: ['类黄酮'] },
  核桃: { vitamins: ['E'], minerals: ['镁'], fats: ['Ω3', 'Ω6'], others: [] },
  杏仁: { vitamins: ['E'], minerals: ['镁', '钙'], fats: ['Ω9'], others: [] },
  芝麻: { vitamins: [], minerals: ['钙', '铁', '镁'], fats: ['Ω6', 'Ω9'], others: ['芝麻素'] },
  南瓜子: { vitamins: [], minerals: ['镁', '锌'], fats: ['Ω6'], others: [] },
  花生: { vitamins: ['B3', '叶酸'], minerals: ['镁'], fats: ['Ω9'], others: [] },
  燕麦: { vitamins: ['B1'], minerals: ['镁', '铁'], fats: [], others: ['β-葡聚糖'] },
  小米: { vitamins: ['B1'], minerals: ['铁', '镁'], fats: [], others: [] },
  黑米: { vitamins: [], minerals: ['铁'], fats: [], others: ['花青素'] },
  黑豆: { vitamins: ['叶酸'], minerals: ['铁', '镁'], fats: [], others: ['花青素', '异黄酮'] },
  红豆: { vitamins: ['叶酸'], minerals: ['铁', '钾'], fats: [], others: [] },
  绿豆: { vitamins: ['叶酸'], minerals: ['钾', '镁'], fats: [], others: [] },
  三文鱼: { vitamins: ['D', 'B12'], minerals: ['硒'], fats: ['Ω3'], others: [] },
  金枪鱼: { vitamins: ['D', 'B12'], minerals: ['硒'], fats: ['Ω3'], others: [] },
  鲭鱼: { vitamins: ['D', 'B12'], minerals: ['硒'], fats: ['Ω3'], others: [] },
  鳕鱼: { vitamins: ['B12'], minerals: ['硒'], fats: ['Ω3'], others: [] },
  带鱼: { vitamins: ['D', 'B12'], minerals: ['硒'], fats: ['Ω3'], others: [] },
  虾: { vitamins: ['B12'], minerals: ['硒', '碘'], fats: ['Ω3'], others: [] },
  生蚝: { vitamins: ['B12'], minerals: ['锌', '铁'], fats: [], others: [] },
  扇贝: { vitamins: ['B12'], minerals: ['硒', '锌'], fats: [], others: [] },
  蛤蜊: { vitamins: ['B12'], minerals: ['铁'], fats: [], others: [] },
  牛奶: { vitamins: ['B2', 'B12'], minerals: ['钙'], fats: [], others: [] },
  酸奶: { vitamins: ['B2', 'B12'], minerals: ['钙'], fats: [], others: ['益生菌'] },
  奶酪: { vitamins: ['B12'], minerals: ['钙'], fats: [], others: [] },
  豆浆: { vitamins: ['B1', '叶酸'], minerals: ['钙', '铁'], fats: ['不饱和'], others: ['异黄酮'] },
  豆腐: { vitamins: [], minerals: ['钙', '铁'], fats: ['不饱和'], others: ['异黄酮'] },
  香菇: { vitamins: ['B2', 'D'], minerals: ['硒'], fats: [], others: ['β-葡聚糖'] },
  木耳: { vitamins: [], minerals: ['铁'], fats: [], others: ['多糖'] },
  紫菜: { vitamins: ['B12'], minerals: ['碘', '铁'], fats: [], others: [] },
  海带: { vitamins: [], minerals: ['碘'], fats: [], others: [] },
  玉米: {
  vitamins: ['B1', '叶酸'],
  minerals: ['镁'],
  fats: [],
  others: ['玉米黄素']
},

蛋黄: {
  vitamins: ['A', 'D', 'B12'],
  minerals: ['硒'],
  fats: [],
  others: ['胆碱', '叶黄素', '玉米黄素']
},

羽衣甘蓝: {
  vitamins: ['C', 'K', 'A', '叶酸'],
  minerals: ['钙', '镁'],
  fats: [],
  others: ['叶黄素', '玉米黄素']
},
}

function splitFoodNames(value) {
  return String(value || '')
    .split(/[、,，\s/]+/)
    .map(item => item.trim())
    .filter(Boolean)
}

function profileFor(primaryName, realName) {
  const primary = PRIMARY_NUTRITION_PROFILE[primaryName] || EMPTY_PROFILE
  const specific = FOOD_NUTRITION_PROFILE[realName] || EMPTY_PROFILE
  return {
    vitamins: [...new Set([...(primary.vitamins || []), ...(specific.vitamins || [])])],
    minerals: [...new Set([...(primary.minerals || []), ...(specific.minerals || [])])],
    fats: [...new Set([...(primary.fats || []), ...(specific.fats || [])])],
    others: [...new Set([...(primary.others || []), ...(specific.others || [])])],
  }
}

function primaryNameFor(realName, foodAliasMap = {}) {
  const real = String(realName || '').trim()
  if (!real) return ''
  for (const [primary, aliases] of Object.entries(foodAliasMap || {})) {
    const names = [primary, ...(aliases || [])].map(item => String(item || '').trim())
    if (names.includes(real)) return primary
  }
  return ''
}

function foodTypeFor(primaryName, foodNutritionMap = {}) {
  const types = foodNutritionMap?.[primaryName] || []
  if (types.includes('protein')) return 'protein'
  if (types.includes('carbs')) return 'carbs'
  if (types.includes('fiber')) return 'fiber'
  if (['VC', 'VD', 'VE', '其它维生素', '鱼油', '钙片', '铁片', '其它微量元素'].includes(primaryName)) return 'supplement'
  return 'unknown'
}

function parseNutritionDate(value) {
  const text = String(value || '').trim()
  const match = text.match(/^(\d{1,4})[\/-](\d{1,2})[\/-](\d{1,4})$/)
  if (!match) return null

  const a = Number(match[1])
  const b = Number(match[2])
  const c = Number(match[3])
  const year = match[1].length === 4 ? a : c
  const month = b
  const day = match[1].length === 4 ? c : a
  const date = new Date(year, month - 1, day)

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) return null

  return date
}

function nutritionDateKey(value) {
  const date = parseNutritionDate(value)
  if (!date) return String(value || '')
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function formatNutritionDate(value) {
  const date = parseNutritionDate(value)
  if (!date) return String(value || '—')
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`
}

function nutritionDaysAgo(value, base = new Date()) {
  const date = parseNutritionDate(value)
  if (!date) return Number.POSITIVE_INFINITY
  const today = new Date(base.getFullYear(), base.getMonth(), base.getDate())
  return Math.round((today - date) / 86400000)
}

function nutritionDateInRange(value, range) {
  const diff = nutritionDaysAgo(value)
  if (range === 'today') return diff === 0
  if (range === 'yesterday') return diff === 1
  if (range === 'week') return diff >= 0 && diff < 7
  if (range === 'month') return diff >= 0 && diff < 30
  if (range === 'year') return diff >= 0 && diff < 365
  return true
}

function buildNutritionDetail(records = [], foodAliasMap = {}, foodNutritionMap = {}) {
  return [...(records || [])]
    .sort((a, b) => nutritionDateKey(b?.date).localeCompare(nutritionDateKey(a?.date)))
    .flatMap(record => {
      const foods = splitFoodNames(record?.food || record?.foodKeyword || record?.foodText)
      return foods.map((realName, index) => {
        const primaryName = primaryNameFor(realName, foodAliasMap)
        const profile = profileFor(primaryName, realName)
        return {
          id: `${record?.id || record?.date || 'daily'}-${realName}-${index}`,
          date: formatNutritionDate(record?.date),
          dateKey: nutritionDateKey(record?.date),
          realName,
          primaryName: primaryName || '未归类',
          foodType: foodTypeFor(primaryName, foodNutritionMap),
          taste: record?.taste || record?.foodTaste || '—',
          ...profile,
        }
      })
    })
}

function incrementNutrientCount(map, nutrient) {
  if (!nutrient) return
  map[nutrient] = (map[nutrient] || 0) + 1
}

function buildDailyNutritionSummary(detailRows = []) {
  const byDate = new Map()

  detailRows.forEach(row => {
    const key = row.dateKey || nutritionDateKey(row.date)
    if (!byDate.has(key)) {
      byDate.set(key, {
        date: row.date,
        dateKey: key,
        vitamins: {},
        microNutrition: {},
      })
    }

    const summary = byDate.get(key)
    ;(row.vitamins || []).forEach(item => incrementNutrientCount(summary.vitamins, item))
    ;[...(row.minerals || []), ...(row.fats || []), ...(row.others || [])]
      .forEach(item => incrementNutrientCount(summary.microNutrition, item))
  })

  return [...byDate.values()]
    .map(item => ({
      ...item,
      vitaminTypeCount: Object.keys(item.vitamins).length,
      microTypeCount: Object.keys(item.microNutrition).length,
    }))
    .sort((a, b) => b.dateKey.localeCompare(a.dateKey))
}

function roundedAverage(value) {
  const rounded = Math.round(Number(value || 0) * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

function averageNutrientCounts(days, field) {
  const divisor = Math.max(1, days.length)
  const totals = new Map()

  days.forEach(day => {
    Object.entries(day?.[field] || {}).forEach(([name, count]) => {
      totals.set(name, (totals.get(name) || 0) + Number(count || 0))
    })
  })

  return [...totals.entries()]
    .map(([name, total]) => ({ name, value: total / divisor }))
    .filter(item => item.value > 0)
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, 'zh-CN'))
}

function periodNutritionItem(days, field, countField, key, label) {
  const divisor = Math.max(1, days.length)
  const value = days.length
    ? days.reduce((sum, day) => sum + Number(day?.[countField] || 0), 0) / divisor
    : 0
  const sources = averageNutrientCounts(days, field)
  const note = sources.map(item => {
    const amount = roundedAverage(item.value)
    return amount === '1' ? item.name : `${item.name}×${amount}`
  }).join('、') || '—'

  let level = 'empty'
  if (value >= 2) level = 'filled'
  else if (value > 0) level = 'dim'

  return {
    key,
    label,
    value,
    level,
    score: Math.min(100, Math.round(value * 34)),
    display: `${roundedAverage(value)}种`,
    topFoods: note,
  }
}

function nutritionStatsWithDailySummary(originalStats = [], dailySummaries = [], range = 'today') {
  const scopedDays = dailySummaries.filter(day => nutritionDateInRange(day.date, range))
  const byKey = Object.fromEntries((originalStats || []).map(item => [item.key, item]))

  // 前三项沿用 App.jsx 已验证的现有逻辑；只替换维生素和微营养。
  return [
    byKey.protein,
    byKey.carbs,
    byKey.fiber,
    periodNutritionItem(scopedDays, 'vitamins', 'vitaminTypeCount', 'vitamins', '维生素'),
    periodNutritionItem(scopedDays, 'microNutrition', 'microTypeCount', 'minerals', '微营养'),
  ].filter(Boolean)
}

const NUTRITION_REWARD_STORAGE_KEY = 'snowball-nutrition-7day-reward-v1'

function splitTasteNames(value) {
  return String(value || '')
    .split(/[、,，\s/]+/)
    .map(item => item.trim())
    .filter(Boolean)
}

function nextNutritionDateKey(value) {
  const date = parseNutritionDate(value)
  if (!date) return ''
  date.setDate(date.getDate() + 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function readNutritionRewardDate() {
  try {
    const stored = String(localStorage.getItem(NUTRITION_REWARD_STORAGE_KEY) || '').trim()
    return /^\d{4}-\d{2}-\d{2}$/.test(stored) ? stored : ''
  } catch {
    return ''
  }
}

function saveNutritionRewardDate(dateKey) {
  try {
    localStorage.setItem(NUTRITION_REWARD_STORAGE_KEY, dateKey)
  } catch (error) {
    console.warn('营养七天奖励没有成功保存。', error)
  }
}

function buildNutritionRewardDays(detailRows = [], records = [], dailySummaries = [], heavyTasteOptions = []) {
  const byDate = new Map()
  const summaryByDate = new Map((dailySummaries || []).map(item => [item.dateKey, item]))
  const heavyTasteSet = new Set((heavyTasteOptions || []).map(item => String(item || '').trim()).filter(Boolean))

  ;(records || []).forEach(record => {
    const dateKey = nutritionDateKey(record?.date)
    if (!dateKey) return
    const tasteNames = splitTasteNames(record?.taste || record?.foodTaste)
    byDate.set(dateKey, {
      dateKey,
      proteinNames: new Set(),
      carbNames: new Set(),
      fiberNames: new Set(),
      tasteRecorded: tasteNames.length > 0,
      tasteHeavy: tasteNames.some(item => heavyTasteSet.has(item)),
    })
  })

  ;(detailRows || []).forEach(row => {
    const dateKey = row.dateKey || nutritionDateKey(row.date)
    if (!byDate.has(dateKey)) {
      byDate.set(dateKey, {
        dateKey,
        proteinNames: new Set(),
        carbNames: new Set(),
        fiberNames: new Set(),
        tasteRecorded: false,
        tasteHeavy: false,
      })
    }

    const day = byDate.get(dateKey)
    const identity = row.primaryName && row.primaryName !== '未归类' ? row.primaryName : row.realName
    if (row.foodType === 'protein') day.proteinNames.add(identity)
    if (row.foodType === 'carbs') day.carbNames.add(identity)
    if (row.foodType === 'fiber') day.fiberNames.add(identity)
  })

  return [...byDate.values()]
    .map(day => {
      const summary = summaryByDate.get(day.dateKey) || {}
      const protein = day.proteinNames.size
      const carbs = day.carbNames.size
      const fiber = day.fiberNames.size
      const vitamins = Number(summary.vitaminTypeCount || 0)
      const microNutrition = Number(summary.microTypeCount || 0)
      const qualified =
        protein >= 3 &&
        carbs >= 1 && carbs <= 2 &&
        fiber >= 3 &&
        vitamins >= 3 &&
        microNutrition >= 3 &&
        day.tasteRecorded &&
        !day.tasteHeavy

      return {
        dateKey: day.dateKey,
        protein,
        carbs,
        fiber,
        vitamins,
        microNutrition,
        tasteRecorded: day.tasteRecorded,
        tasteHeavy: day.tasteHeavy,
        qualified,
      }
    })
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey))
}

function latestSevenDayNutritionReward(days = [], previousRewardDate = '') {
  const eligibleDays = (days || []).filter(day => !previousRewardDate || day.dateKey > previousRewardDate)
  let streak = []
  let latestRewardDate = ''

  eligibleDays.forEach(day => {
    const followsPrevious = !streak.length || day.dateKey === nextNutritionDateKey(streak[streak.length - 1].dateKey)
    if (day.qualified && followsPrevious) {
      streak.push(day)
    } else if (day.qualified) {
      streak = [day]
    } else {
      streak = []
    }

    if (streak.length >= 7) latestRewardDate = day.dateKey
  })

  return latestRewardDate
}

const FOOD_TYPE_LABEL = {
  protein: '蛋白',
  carbs: '碳水',
  fiber: '纤维',
  supplement: '补剂',
  unknown: '未归类',
}

function listText(items) {
  return items?.length ? items.join('、') : '—'
}

export default function Nutrition({
  PngSequence,
  dailyTasteStats,
  dailyNutritionStats,
  nutritionTasteLine,
  dailyStatRange,
  setDailyStatRange,
  dailyRangeTabs,
  records,
  foodAliasMap,
  foodNutritionMap,
  heavyTasteOptions,
  onBackHome,
}) {
  const [showNutritionDetail, setShowNutritionDetail] = useState(false)
  const [nutritionMotionOn, setNutritionMotionOn] = useState(false)
  const [showNutritionReward, setShowNutritionReward] = useState(false)
  const nutritionDetailScrollRef = useRef(null)
  const nutritionDetailTouchRef = useRef({
    startX: 0,
    startY: 0,
    startScrollLeft: 0,
    startScrollTop: 0,
    axis: '',
  })
  const safePercent = Math.max(0, Math.min(100, Number(dailyTasteStats?.rainbowPercent || 0)))
  const nutritionDetailRows = useMemo(
    () => buildNutritionDetail(records, foodAliasMap, foodNutritionMap),
    [records, foodAliasMap, foodNutritionMap],
  )
  const dailyNutritionSummaries = useMemo(
    () => buildDailyNutritionSummary(nutritionDetailRows),
    [nutritionDetailRows],
  )
  const nutritionRewardDays = useMemo(
    () => buildNutritionRewardDays(nutritionDetailRows, records, dailyNutritionSummaries, heavyTasteOptions),
    [nutritionDetailRows, records, dailyNutritionSummaries, heavyTasteOptions],
  )

  useEffect(() => {
    const previousRewardDate = readNutritionRewardDate()
    const rewardDate = latestSevenDayNutritionReward(nutritionRewardDays, previousRewardDate)
    if (!rewardDate || rewardDate === previousRewardDate) return

    saveNutritionRewardDate(rewardDate)
    setNutritionMotionOn(true)
    setShowNutritionReward(true)
  }, [nutritionRewardDays])
  const displayedNutritionStats = useMemo(
    () => nutritionStatsWithDailySummary(dailyNutritionStats, dailyNutritionSummaries, dailyStatRange),
    [dailyNutritionStats, dailyNutritionSummaries, dailyStatRange],
  )

  function beginNutritionDetailTouch(event) {
    const scroller = nutritionDetailScrollRef.current
    const touch = event.touches?.[0]
    if (!scroller || !touch) return

    nutritionDetailTouchRef.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      startScrollLeft: scroller.scrollLeft,
      startScrollTop: scroller.scrollTop,
      axis: '',
    }
  }

  function lockNutritionDetailAxis(event) {
    const scroller = nutritionDetailScrollRef.current
    const touch = event.touches?.[0]
    const gesture = nutritionDetailTouchRef.current
    if (!scroller || !touch) return

    const deltaX = touch.clientX - gesture.startX
    const deltaY = touch.clientY - gesture.startY

    if (!gesture.axis && Math.max(Math.abs(deltaX), Math.abs(deltaY)) >= 7) {
      gesture.axis = Math.abs(deltaX) > Math.abs(deltaY) ? 'x' : 'y'
    }

    if (gesture.axis === 'x') {
      scroller.scrollTop = gesture.startScrollTop
    } else if (gesture.axis === 'y') {
      scroller.scrollLeft = gesture.startScrollLeft
    }
  }

  function endNutritionDetailTouch() {
    nutritionDetailTouchRef.current.axis = ''
  }

  if (showNutritionDetail) {
    return (
      <div className="dailyPage dailySubPage dailyNutritionPage nutritionDetailPage">
        <div className="nutritionDetailTop">
          <button type="button" className="nutritionBackBtn" onClick={() => setShowNutritionDetail(false)} aria-label="返回营养光谱">‹</button>
          <h2>每日营养数据</h2>
          <span>{nutritionDetailRows.length}项</span>
        </div>

        <div className="nutritionDetailIntro">
          每个日常食物真名占一行；营养匹配来自主名通用 Mapping 与真名专属 Mapping。
        </div>

        <div
          ref={nutritionDetailScrollRef}
          className="nutritionDetailTableWrap"
          onTouchStart={beginNutritionDetailTouch}
          onTouchMove={lockNutritionDetailAxis}
          onTouchEnd={endNutritionDetailTouch}
          onTouchCancel={endNutritionDetailTouch}
        >
          <table className="nutritionDetailTable">
            <thead>
              <tr>
                <th>日期</th>
                <th>食物真名</th>
                <th>主名</th>
                <th>类型</th>
                <th>口味</th>
                <th>维生素</th>
                <th>矿物质</th>
                <th>脂肪类</th>
                <th>其它营养</th>
              </tr>
            </thead>
            <tbody>
              {nutritionDetailRows.length ? nutritionDetailRows.map(row => (
                <tr key={row.id}>
                  <td>{row.date}</td>
                  <td className="nutritionDetailFoodName">{row.realName}</td>
                  <td>{row.primaryName}</td>
                  <td>{FOOD_TYPE_LABEL[row.foodType] || row.foodType}</td>
                  <td>{row.taste}</td>
                  <td>{listText(row.vitamins)}</td>
                  <td>{listText(row.minerals)}</td>
                  <td>{listText(row.fats)}</td>
                  <td>{listText(row.others)}</td>
                </tr>
              )) : (
                <tr><td colSpan="9" className="nutritionDetailEmpty">日常表中还没有食物记录</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <>
    <div className="dailyPage dailySubPage dailyNutritionPage nutritionPage">
      <div className="nutritionSubTop">
        <button type="button" className="nutritionBackBtn" onClick={onBackHome} aria-label="返回主页">‹</button>
        <h2 className="dailyPlainTitle nutritionTitle">营养光谱</h2>
      </div>

      <div className="dailyInsightCard nutritionSpectrumCard">
        <img className="dailyInsightBg nutritionBg" src="/refine/nutrition_default_background.png" alt="营养光谱背景" />

        {nutritionMotionOn ? (
          <PngSequence
            className="dailyInsightCat nutritionInsightCat nutritionInsightCatMotion"
            prefix="/refine/things"
            maxFrames={13}
            frameMs={260}
            fallback="/refine/things01.png"
            ariaLabel="营养光谱动起来的雪粒"
          />
        ) : (
          <img className="dailyInsightCat nutritionInsightCat" src="/refine/nutrition_default_cat.png" alt="营养光谱雪粒" />
        )}

        <div className="dailyInsightContent nutritionInsightContent">
          {dailyTasteStats?.rainbowVisible ? (
            <>
              <div className="rainbowSpectrum" aria-hidden="true" style={{ '--rainbow-visible': `${safePercent}%` }}>
                <div className="rainbowArcLayer" aria-hidden="true">
                  {displayedNutritionStats.map((item, index) => {
                    if (item.level === 'empty') return null
                    return (
                      <div
                        key={item.key}
                        className={`rainbowArc rainbowArc${index + 1} ${item.level}`}
                        style={{ '--arc-score': `${Math.max(18, item.score)}%` }}
                      />
                    )
                  })}
                </div>
              </div>
              <div className="rainbowLabelStack" aria-hidden="true">
                {displayedNutritionStats.map((item, index) => (
                  <span key={`label-${item.key}`} className={`rainbowBandLabel rainbowBandLabel${index + 1}`}>{item.label}</span>
                ))}
              </div>
            </>
          ) : null}

          {!nutritionMotionOn && (
            <div className="nutritionCloudNote" aria-live="polite">
              <img src="/refine/cloud_note.png" alt="" aria-hidden="true" />
              <span>{nutritionTasteLine}</span>
            </div>
          )}

          <div className="dailyCornerTable dailyCornerTableRight nutritionTablePanel">
            <div className="nutritionTableNavLine">
              <div className="dailyRangeTabs nutritionRangeTabs">
                {dailyRangeTabs.map(tab => (
                  <button key={tab.key} className={dailyStatRange === tab.key ? 'active' : ''} onClick={() => setDailyStatRange(tab.key)}>{tab.label}</button>
                ))}
              </div>
              <button type="button" className="dailyTextLinkBtn nutritionDetailLink" onClick={() => setShowNutritionDetail(true)}>详情</button>
            </div>
            <div className="dailyMiniTable nutritionMiniTable nutritionMiniTableSplit">
              <div className="nutritionFixedColumn" aria-hidden="true">
                {displayedNutritionStats.map(item => (
                  <div className={`nutritionFixedRow nutritionLevel-${item.level}`} key={`fixed-${item.key}`}>
                    <span className="nutritionRowLabel">
                      <i className={`nutritionLegend nutritionLegend-${item.key}`} aria-hidden="true" />
                      <b>{item.label}</b>
                    </span>
                  </div>
                ))}
              </div>

              <div className="nutritionScrollViewport">
                <div className="nutritionScrollContent">
                  {displayedNutritionStats.map(item => (
                    <div className={`nutritionScrollRow nutritionLevel-${item.level}`} key={`scroll-${item.key}`}>
                      <strong>{item.display}</strong>
                      <em title={item.topFoods}>{item.topFoods}</em>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    {showNutritionReward && (
      <div className="noticeOverlay nutritionRewardOverlay">
        <div className="noticeBox nutritionRewardBox">
          <h2>连续七天达标</h2>
          <p>蛋白、纤维、维生素和微营养每天都达到3种，</p>
          <p>碳水保持1至2种，口味也没有偏重。</p>
          <p>雪粒高兴得动起来了。</p>
          <button
            type="button"
            onClick={() => {
              setShowNutritionReward(false)
              setNutritionMotionOn(false)
            }}
          >知道了</button>
        </div>
      </div>
    )}
    </>
  )
}
