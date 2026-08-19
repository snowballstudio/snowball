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
      hasFoodRecord: true,
      vitaminTypeCount: Object.keys(item.vitamins).length,
      microTypeCount: Object.keys(item.microNutrition).length,
    }))
    .sort((a, b) => b.dateKey.localeCompare(a.dateKey))
}

function roundedAverage(value) {
  const rounded = Math.round(Number(value || 0) * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

function validNutritionDays(days = []) {
  return (days || []).filter(day =>
    day &&
    String(day.dateKey || day.date || '').trim() &&
    (
      Number(day.vitaminTypeCount || 0) > 0 ||
      Number(day.microTypeCount || 0) > 0 ||
      Object.keys(day.vitamins || {}).length > 0 ||
      Object.keys(day.microNutrition || {}).length > 0 ||
      day.hasFoodRecord === true
    )
  )
}

function averageNutrientCounts(days, field) {
  const validDays = validNutritionDays(days)
  const divisor = Math.max(1, validDays.length)
  const totals = new Map()

  validDays.forEach(day => {
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
  const validDays = validNutritionDays(days)
  const divisor = Math.max(1, validDays.length)
  const value = validDays.length
    ? validDays.reduce(
        (sum, day) =>
          sum + Number(day?.[countField] || 0),
        0,
      ) / divisor
    : 0
  const sources = averageNutrientCounts(validDays, field)
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


const NUTRITION_INFO_GROUPS = [
  {
    title: '彩虹的含义',
    items: [
      {
        name: '彩虹长度与弧度',
        role: '反映记录中的口味习惯。清淡、少油、少盐时弧线更完整；麻辣烫、油炸、烧烤、烟熏等重口味较多时，彩虹可能缩短或缺角。',
        attention: '适合用来观察一段时间内饮食方式是否偏重，不代表某一次进食一定“不健康”。',
        amount: '不计算摄入量。',
      },
      {
        name: '彩虹色彩',
        role: '反映食物种类和代表性营养来源的丰富程度。种类较多时颜色更完整；食物单一时会变灰，缺少记录时可能空缺。',
        attention: '适合比较近期饮食多样性，不代表人体已经实际吸收了多少营养。',
        amount: '不计算摄入量。',
      },
    ],
  },
  {
    title: '基础营养',
    items: [
      {
        name: '蛋白质',
        role: '参与肌肉、皮肤、酶、激素和免疫相关组织的构成与修复。',
        attention: '生长发育期、运动量较大、老年人或恢复期人群更需要留意，但具体需要量随体重和身体状况变化。',
        amount: '健康成人通常约每天0.8克/公斤体重，雪粒不按重量计算。',
      },
      {
        name: '碳水化合物',
        role: '是身体和大脑常用的能量来源。',
        attention: '活动量较大的人通常需要更多；长期极端限制时应留意整体能量和膳食结构。',
        amount: '雪粒只观察来源种类，不计算克数。',
      },
      {
        name: '膳食纤维',
        role: '帮助肠道规律、增加饱腹感，并支持肠道微生物。',
        attention: '蔬菜、水果、全谷物和豆类较少的人可以重点留意。',
        amount: '成人常见参考约每天25—30克。',
      },
    ],
  },
  {
    title: '维生素',
    items: [
      { name: '维生素A', role: '帮助维持视力、皮肤、黏膜和免疫功能。', attention: '深色蔬菜、蛋奶或动物性食物较少的人可留意；孕期不宜自行使用高剂量补充剂。', amount: '成人约700—900微克视黄醇当量/天。' },
      { name: '维生素B1', role: '帮助身体利用碳水化合物产生能量，并支持神经功能。', attention: '饮食长期精细、全谷物和豆类较少的人可留意。', amount: '成人约1.1—1.2毫克/天。' },
      { name: '维生素B2', role: '参与能量代谢，并帮助维持皮肤和黏膜。', attention: '奶类、蛋类和动物性食物较少的人可留意。', amount: '成人约1.1—1.3毫克/天。' },
      { name: '维生素B3', role: '也称烟酸，参与能量代谢和细胞正常工作。', attention: '长期饮食单一的人可留意；高剂量补充剂可能产生副作用。', amount: '成人约14—16毫克烟酸当量/天。' },
      { name: '维生素B6', role: '参与蛋白质代谢、神经递质形成和红细胞相关过程。', attention: '老年人、饮食受限者或长期服用某些药物者可咨询专业人员。', amount: '多数成人约1.3毫克/天，年龄增加后需求略有变化。' },
      { name: '维生素B12', role: '帮助形成红细胞，维持神经系统，并参与DNA合成。', attention: '纯素饮食者、吸收能力下降者和部分老年人尤其需要留意。', amount: '成人约2.4微克/天。' },
      { name: '维生素C', role: '参与胶原形成、抗氧化过程，并帮助植物性铁吸收。', attention: '水果蔬菜较少、吸烟者或饮食长期单一的人可留意。', amount: '成人约45—90毫克/天，不同标准略有差异。' },
      { name: '维生素D', role: '帮助钙吸收，支持骨骼、肌肉和免疫功能。', attention: '日晒较少、肤色较深、老年人或骨骼风险较高者可重点留意。', amount: '成人常见参考约10—15微克/天；是否补充应结合日晒和专业建议。' },
      { name: '维生素E', role: '参与抗氧化保护，并支持免疫、皮肤和细胞膜。', attention: '坚果、种子和植物油很少的人可留意。', amount: '成人约7—15毫克α-生育酚当量/天，不同标准略有差异。' },
      { name: '维生素K', role: '参与正常凝血和骨骼相关蛋白的形成。', attention: '绿叶菜很少的人可留意；使用抗凝药物者不要自行大幅改变摄入。', amount: '成人常见适宜摄入约60—120微克/天。' },
      { name: '叶酸', role: '参与细胞分裂、DNA形成和红细胞生成。', attention: '备孕和孕早期尤其重要，应按当地医疗建议补充。', amount: '成人约400微克膳食叶酸当量/天；孕期通常更高。' },
    ],
  },
  {
    title: '矿物质与微量元素',
    items: [
      { name: '钙', role: '帮助维持骨骼和牙齿，也参与肌肉收缩和神经传导。', attention: '奶类和含钙食物较少、老年人及骨骼风险较高者可留意。', amount: '成人多为约1000毫克/天，部分年龄段需求更高。' },
      { name: '铁', role: '用于血红蛋白形成和氧气运输。', attention: '月经期女性、孕期、素食者及有贫血风险者更需留意；不要自行长期高剂量补铁。', amount: '成人男性约8毫克/天，育龄女性常约18毫克/天。' },
      { name: '锌', role: '支持免疫、伤口愈合、味觉和正常生长。', attention: '动物性食物较少、饮食受限或恢复期人群可留意。', amount: '成人女性约8毫克、男性约11—14毫克/天。' },
      { name: '镁', role: '参与能量代谢、肌肉和神经功能，并支持骨骼。', attention: '坚果、豆类、全谷物和绿叶菜较少的人可留意。', amount: '成人女性约310—320毫克、男性约400—420毫克/天。' },
      { name: '硒', role: '参与抗氧化系统和甲状腺激素代谢。', attention: '饮食来源非常单一者可留意；过量补充同样可能有害。', amount: '成人约55—70微克/天。' },
      { name: '碘', role: '是甲状腺激素合成所需成分，影响代谢和生长发育。', attention: '少吃海产品和加碘盐者，以及孕期人群可咨询专业人员。', amount: '成人约150微克/天；孕期和哺乳期通常更高。' },
      { name: '钾', role: '帮助维持体液平衡、神经传导、肌肉和心脏正常工作。', attention: '蔬果、豆类较少的人可留意；肾功能异常者不应自行大量补钾。', amount: '成人适宜摄入常约2800—3800毫克/天。' },
    ],
  },
  {
    title: '脂肪与脂肪酸',
    items: [
      { name: '不饱和脂肪', role: '可作为能量来源，也是细胞膜的重要组成部分；用其替代部分饱和脂肪更符合一般饮食建议。', attention: '鱼、坚果、种子、牛油果和植物油较少的人可留意。', amount: '没有单一固定克数，重点是脂肪来源和整体比例。' },
      { name: 'Ω3', role: '包括ALA、EPA和DHA，参与细胞膜、心血管和神经系统相关功能。', attention: '很少吃鱼、海鲜、核桃和亚麻籽的人可留意；孕期补充应咨询专业人员。', amount: 'ALA成人女性约1.1克、男性约1.6克/天；EPA和DHA没有统一单一推荐量。' },
      { name: 'Ω6', role: '属于必需脂肪酸家族，参与细胞膜和多种生理信号。', attention: '一般饮食通常不难获得，重点是整体脂肪来源多样。', amount: '成人常见适宜摄入约11—17克亚油酸/天。' },
      { name: 'Ω9', role: '以油酸为代表，人体可以合成，也常见于橄榄油、坚果和牛油果。', attention: '可作为较温和的脂肪来源，但仍需考虑总能量。', amount: '不是必需脂肪酸，没有独立每日推荐量。' },
    ],
  },
  {
    title: '植物成分与其它成分',
    items: [
      { name: 'β-胡萝卜素', role: '是橙黄色植物色素，部分可在体内转化为维生素A，并参与抗氧化过程。', attention: '多吃天然蔬果即可；吸烟者不宜自行使用高剂量β-胡萝卜素补充剂。', amount: '没有独立每日推荐量，通常按维生素A总量理解。' },
      { name: '类胡萝卜素', role: '是一组植物色素，包括β-胡萝卜素、叶黄素、玉米黄素和番茄红素等。', attention: '用于提示彩色蔬果来源是否多样，不代表治疗作用。', amount: '没有统一每日需要量。' },
      { name: '叶黄素', role: '集中存在于视网膜黄斑区域，可过滤部分蓝光并参与抗氧化保护。', attention: '绿叶菜和蛋黄较少、希望关注眼部营养的人可留意。', amount: '没有正式每日推荐量，优先从食物获得。' },
      { name: '玉米黄素', role: '与叶黄素相似，也是黄斑色素的重要组成部分，常见于玉米、蛋黄和深色蔬菜。', attention: '用于提示黄色和绿色食物来源，不等于可以预防或治疗眼病。', amount: '没有正式每日推荐量。' },
      { name: '番茄红素', role: '是红色类胡萝卜素，常见于番茄和西瓜，具有抗氧化活性。', attention: '用于提示红色蔬果来源；不能据此判断疾病风险。', amount: '没有正式每日推荐量。' },
      { name: '花青素', role: '是蓝紫红色植物色素，常见于莓果、紫米和黑豆，具有抗氧化活性。', attention: '用于提示深色植物食物的多样性。', amount: '没有正式每日推荐量。' },
      { name: '类黄酮', role: '是一大类植物活性成分，常见于柑橘、茶、可可和多种蔬果。', attention: '更适合通过多样化天然食物摄入，不宜把单一种类理解为药物。', amount: '没有统一每日推荐量。' },
      { name: '多酚', role: '是多类植物化合物的统称，参与植物颜色和风味，也具有抗氧化等生物活性。', attention: '用于提示水果、蔬菜、豆类等植物食物来源是否丰富。', amount: '没有统一每日推荐量。' },
      { name: '萝卜硫素', role: '是十字花科蔬菜中的含硫植物成分，由相关前体在切碎或咀嚼后形成。', attention: '西兰花、花菜等较少的人可把它理解为蔬菜多样性提示，而非治疗成分。', amount: '没有正式每日推荐量。' },
      { name: '辣椒素', role: '是辣椒产生辛辣感的主要成分。', attention: '雪粒记录它是为了识别食物特点；胃肠敏感者应按自身耐受选择。', amount: '没有每日需要量，也不是越多越好。' },
      { name: '芝麻素', role: '是芝麻中的木脂素类植物成分。', attention: '用于提示种子类食物来源；不能替代对脂肪和总能量的判断。', amount: '没有正式每日推荐量。' },
      { name: '异黄酮', role: '是大豆中常见的一类植物成分，结构上属于多酚。', attention: '豆类较少的人可把它理解为豆制品来源提示；特殊疾病或用药情况可咨询医生。', amount: '没有统一每日推荐量。' },
      { name: 'β-葡聚糖', role: '是一类可溶性膳食纤维，常见于燕麦、大麦和部分菌菇。', attention: '全谷物较少或希望增加可溶性纤维的人可留意。', amount: '没有统一总需要量；部分健康声称会使用约3克燕麦/大麦β-葡聚糖作为参考。' },
      { name: '多糖', role: '是由多个糖单位组成的一大类物质；食物中的不同多糖性质差异很大。', attention: '雪粒只把它作为木耳、菌菇等食物的代表性成分提示，不能笼统理解为保健功效。', amount: '没有统一每日推荐量。' },
      { name: '胆碱', role: '参与细胞膜、神经递质乙酰胆碱和脂肪运输相关过程。', attention: '蛋类、肉类和豆类较少者，以及孕期人群可留意。', amount: '成人女性约425毫克、男性约550毫克/天；孕期通常更高。' },
      { name: '益生菌', role: '指在足够数量下可能对宿主有益的活微生物，不同菌株作用并不相同。', attention: '酸奶等发酵食物可作为日常来源；严重免疫低下者使用补充剂前应咨询医生。', amount: '没有适用于所有菌株的统一每日需要量。' },
    ],
  },
]

export default function Nutrition({
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
  onOpenRawData,
}) {
  const [showNutritionDetail, setShowNutritionDetail] = useState(false)
  const [showNutritionInfo, setShowNutritionInfo] = useState(false)
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
          <button
            type="button"
            className="nutritionDetailRawLink"
            onClick={onOpenRawData}
          >
            原始数据
          </button>
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
                  <td>{listText(row.vitamins)}</td>
                  <td>{listText(row.minerals)}</td>
                  <td>{listText(row.fats)}</td>
                  <td>{listText(row.others)}</td>
                </tr>
              )) : (
                <tr><td colSpan="8" className="nutritionDetailEmpty"></td></tr>
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
        <button
          type="button"
          className="nutritionInfoButton"
          onClick={() => setShowNutritionInfo(true)}
        >
          说明
        </button>
      </div>

      <div className="dailyInsightCard nutritionSpectrumCard">
        <img className="dailyInsightBg nutritionBg" src="/refine/nutrition_default_background.png" alt="营养光谱背景" />

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

          <div className="nutritionCloudNote" aria-live="polite">
            <img src="/refine/cloud_note.png" alt="" aria-hidden="true" />
            <span>{nutritionTasteLine}</span>
          </div>

          <div className="nutritionDataGroup">
            <div className="nutritionTasteSummary" aria-live="polite">
              {nutritionTasteLine}
            </div>

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
    </div>

    {showNutritionInfo && (
      <section className="nutritionInfoPage" aria-label="营养说明">
        <header className="nutritionInfoHeader">
          <button
            type="button"
            className="nutritionInfoBack"
            onClick={() => setShowNutritionInfo(false)}
            aria-label="返回营养光谱"
          >
            ‹
          </button>
          <h2>营养说明</h2>
        </header>

        <div className="nutritionInfoScroll">
          <div className="nutritionInfoBody">
            <section className="nutritionInfoIntro">
              <h3>使用说明</h3>
              <p>
                雪粒提供的营养分析仅用于日常饮食记录和趋势参考，
                不作为健康评估、医学诊断、治疗或用药建议。
              </p>

              <p>
                食物来自用户记录及系统常用名称。同一种食物可能有不同配料、
                品牌和烹饪方式，因此名称和营养信息不一定百分之百还原实际食物。
              </p>

              <p>
                雪粒目前不记录准确重量、份数和烹饪损耗。页面中的营养判断按照常见食物、
                常见食用量和最具代表性的丰富成分进行粗略估计，
                不代表一份食物只含页面列出的成分，也不保证涵盖全部营养。
              </p>

              <p>
                页面显示的是记录中出现的代表性营养来源，不是血液检查结果，
                也不等于人体实际摄入量或吸收量。年龄、性别、孕期、哺乳期、
                疾病、药物和活动量都会改变个人需要。
              </p>
            </section>

            {NUTRITION_INFO_GROUPS.map(group => (
              <section className="nutritionInfoGroup" key={group.title}>
                <h3>{group.title}</h3>
                <div className="nutritionInfoItems">
                  {group.items.map(item => (
                    <article className="nutritionInfoItem" key={item.name}>
                      <h4>{item.name}</h4>
                      <p><strong>大致作用：</strong>{item.role}</p>
                      <p><strong>适合留意：</strong>{item.attention}</p>
                      <p><strong>成人参考：</strong>{item.amount}</p>
                    </article>
                  ))}
                </div>
              </section>
            ))}

            <section className="nutritionInfoClosing">
              <h3>怎样理解结果</h3>
              <p>
                某项显示较少，只表示当前记录中的典型来源较少；
                显示较多，也不代表一定摄入过量。
              </p>

              <p>
                雪粒更适合观察长期饮食趋势。相比追求单独一种营养，
                保持食物种类丰富、口味不过重和整体饮食均衡更重要。
              </p>

              <p>
                儿童、孕期、哺乳期、老年人，以及存在疾病、过敏、贫血、
                肾脏或甲状腺问题的人，应以医生或注册营养专业人员的建议为准。
              </p>
            </section>
          </div>
        </div>
      </section>
    )}

    </>
  )
}
